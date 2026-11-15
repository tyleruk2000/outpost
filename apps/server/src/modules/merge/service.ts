/**
 * Bringing a portable drive's changes home: the steps and their state.
 *
 *   look at the drive → copy and read its database → preview → the person's choices →
 *   merge, as a job → a record, which can be undone
 *
 * A merge is a row in `drive_merges`. Its preview is worked out by one job and carried
 * out by another, so both show progress, survive a restart and can be stopped. The
 * copy of the drive's database lives in `<data>/merges/<id>/` from the first job to
 * the end of the second, so the merge acts on exactly what the preview showed even if
 * the drive is used in between.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  MergeActionDto,
  MergeAnalysis,
  MergeChoice,
  MergeCompareResponse,
  MergeDto,
  MergeOutcome,
  MergeReport,
  MergeSide,
  MergeUndo,
  NoteDoc,
} from "@outpost/shared";
import { formatBytes } from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError, StoppedWithResult } from "../../core/jobs.ts";
import { driveMergeActions, driveMerges } from "../../db/schema.ts";
import { applyMerge, type MergeRow, undoMerge } from "./apply.ts";
import { diffLibraries, type MemoryEntry, toAnalysis } from "./diff.ts";
import { fileInside, inspectDrive, openStaged, sourceFolderOf, stageDatabase } from "./drive.ts";
import { LIMITS, readBaseline, readSnapshot, TooManyRows } from "./fingerprint.ts";

type ActionRow = typeof driveMergeActions.$inferSelect;

const ANALYSE_JOB = "merge.analyse";
const APPLY_JOB = "merge.apply";
const ACTIVE = new Set(["queued", "running", "paused"]);
const COMPARE_TEXT_LIMIT = 200_000;
const subjectOf = (id: string) => `merge:${id}`;

export interface MergeService {
  /** This library's identity, made the first time it is asked for. A drive records it as where it came from. */
  libraryId(): string;
  inspect(folder: string): ReturnType<typeof inspectDrive>;
  start(input: { path: string; source?: string }): Promise<MergeDto>;
  get(id: string): MergeDto;
  list(limit?: number): Array<Omit<MergeDto, "analysis" | "report">>;
  compare(id: string, key: string): MergeCompareResponse;
  commit(id: string, body: { choices: Record<string, MergeChoice>; deletionsConfirmed?: boolean }): MergeDto;
  /** Stops the job that is reading the drive or merging. */
  cancel(id: string): MergeDto;
  /** Gives up a merge that has not been carried out: removes the copy of the drive's database. */
  discard(id: string): Promise<MergeDto>;
  undo(id: string, options: { removeDocuments: boolean }): Promise<MergeDto>;
}

declare module "../../core/context.ts" {
  interface Services {
    merge: MergeService;
  }
}

/** A short name for a drive from where it is mounted: "TRAVEL/Outpost". */
function labelOf(folder: string): string {
  return folder.split(/[\\/]/).filter(Boolean).slice(-2).join("/").slice(0, 80) || "drive";
}

export function createMergeService(ctx: AppContext): MergeService {
  const { db, sqlite, jobs, config } = ctx;
  const stagingRoot = path.join(config.dataDir, "merges");
  const stagingOf = (id: string) => path.join(stagingRoot, id);
  const stagedFileOf = (id: string) => path.join(stagingOf(id), "drive.db");
  const changed = (id: string) => ctx.events.publish({ type: "merge.changed", id });

  const homeMigrations = () => (sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n;

  function libraryId(): string {
    const row = sqlite.prepare("SELECT value FROM library_meta WHERE key = 'library.id'").get() as { value: string } | undefined;
    if (row) return row.value;
    const id = newId();
    sqlite.prepare("INSERT OR IGNORE INTO library_meta (key, value) VALUES ('library.id', ?)").run(id);
    return (sqlite.prepare("SELECT value FROM library_meta WHERE key = 'library.id'").get() as { value: string }).value;
  }

  const find = (id: string) => db.select().from(driveMerges).where(eq(driveMerges.id, id)).get();
  function mustFind(id: string): MergeRow {
    const row = find(id);
    if (!row) throw notFound("That merge");
    return row;
  }
  const setState = (id: string, patch: Partial<typeof driveMerges.$inferInsert>) => {
    db.update(driveMerges).set(patch).where(eq(driveMerges.id, id)).run();
    changed(id);
  };
  const activeJob = (id: string) => jobs.findBySubject(subjectOf(id)).findLast((job) => ACTIVE.has(job.state));
  const removeStaging = (id: string) => fs.promises.rm(stagingOf(id), { recursive: true, force: true });

  /**
   * What earlier merges of the same writing of the same drive did, newest last. Undone
   * actions are left out, so what was undone is offered again.
   */
  function memoryFor(driveId: string, writtenAt: number, exceptMergeId?: string): Map<string, MemoryEntry> {
    const rows = sqlite
      .prepare(
        `SELECT a.kind AS kind, a.drive_item_id AS driveItemId, a.home_item_id AS homeItemId, a.drive_hash AS driveHash, a.home_hash AS homeHash
         FROM drive_merge_actions a JOIN drive_merges m ON m.id = a.merge_id
         WHERE m.drive_id = ? AND m.drive_written_at = ? AND m.id IS NOT ?
           AND a.undone_at IS NULL AND a.drive_item_id IS NOT NULL AND a.drive_hash IS NOT NULL
           AND a.kind IN ('page', 'document', 'place', 'track')
           AND a.outcome IN ('added', 'updated', 'copied', 'trashed', 'removed', 'kept', 'already')
         ORDER BY a.created_at, a.seq`,
      )
      .all(driveId, writtenAt, exceptMergeId ?? null) as Array<{
      kind: string;
      driveItemId: string;
      homeItemId: string | null;
      driveHash: string;
      homeHash: string | null;
    }>;
    const memory = new Map<string, MemoryEntry>();
    for (const row of rows) memory.set(`${row.kind}:${row.driveItemId}`, row);
    return memory;
  }

  // ── What is shown ──

  function undoOf(action: ActionRow): MergeUndo {
    if (action.undoneAt !== null) return "done";
    if (action.undoMessage) return "left";
    if (["kept", "already", "skipped", "failed"].includes(action.outcome) || action.kind === "attachment") return "nothing";
    if (action.kind === "collection") return "cannot";
    if (action.kind === "document" && action.outcome === "removed") return "cannot";
    // A sub-page that went to the trash with its parent comes back with it.
    if (action.outcome === "trashed" && !action.undo) return "nothing";
    return "can";
  }

  function reportOf(id: string): MergeReport | null {
    const rows = db.select().from(driveMergeActions).where(eq(driveMergeActions.mergeId, id)).orderBy(driveMergeActions.seq).all();
    if (rows.length === 0) return null;
    const counts = {
      added: 0,
      updated: 0,
      copied: 0,
      trashed: 0,
      removed: 0,
      moved: 0,
      kept: 0,
      already: 0,
      skipped: 0,
      failed: 0,
    } satisfies Record<MergeOutcome, number>;
    const actions: MergeActionDto[] = [];
    let documentsAdded = 0;
    let cannotUndo = 0;
    for (const row of rows) {
      // Lines that only say "this went with the page above" would bury the ones that matter.
      if (!row.itemKey && row.kind !== "attachment") continue;
      const undo = undoOf(row);
      if (row.kind !== "attachment") counts[row.outcome] += 1;
      if (row.kind === "document" && row.outcome === "added" && row.undoneAt === null) documentsAdded += 1;
      if (undo === "cannot") cannotUndo += 1;
      actions.push({
        seq: row.seq,
        kind: row.kind,
        outcome: row.outcome,
        title: row.title,
        message: row.message,
        homeItemId: row.homeItemId,
        undo,
        undoMessage: row.undoMessage,
      });
    }
    return { actions, counts, documentsAdded, cannotUndo };
  }

  function summaryOf(row: MergeRow): Omit<MergeDto, "analysis" | "report"> {
    const job = jobs.findBySubject(subjectOf(row.id)).at(-1);
    return {
      id: row.id,
      state: row.state,
      driveId: row.driveId,
      drivePath: row.drivePath,
      driveLabel: row.driveLabel,
      sourceFolder: row.sourceFolder,
      baseline: row.baseline,
      error: row.error,
      job:
        job && ACTIVE.has(job.state)
          ? {
              id: job.id,
              state: job.state,
              progress: { current: job.progressCurrent, total: job.progressTotal, message: job.progressMessage },
            }
          : null,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      undoneAt: row.undoneAt,
    };
  }

  const toDto = (row: MergeRow): MergeDto => ({
    ...summaryOf(row),
    analysis: (row.analysis as unknown as MergeAnalysis | null) ?? null,
    report: reportOf(row.id),
  });

  // ── Reading the drive ──

  jobs.register<{ mergeId: string }>(ANALYSE_JOB, {
    queue: "import",
    async run({ payload, signal, progress }) {
      const row = find(payload.mergeId);
      if (row?.state !== "analysing") return { skipped: true };
      try {
        const inspection = await inspectDrive(config, row.drivePath);
        if (!inspection.drive) throw new PermanentJobError(inspection.problem ?? "That folder is not an Outpost drive.");
        if (inspection.drive.id !== row.driveId)
          throw new PermanentJobError("A different drive is in that folder now. Start again from Storage.");
        sourceFolderOf(inspection, row.sourceFolder);

        progress({ current: 0, total: null, message: "Copying the drive’s notes database to read it" });
        const file = await stageDatabase({
          driveFolder: row.drivePath,
          sourceFolder: row.sourceFolder,
          stagingDir: stagingOf(row.id),
          signal,
          onProgress: (bytes, total) =>
            progress({ current: bytes, total, message: `Copying the drive’s notes database to read it (${formatBytes(total)})` }),
        });

        progress({ current: 0, total: null, message: "Comparing the drive with your library" });
        const staged = openStaged(file, homeMigrations(), inspection.drive.appVersion);
        let analysis: MergeAnalysis;
        let writtenAt: number | null;
        try {
          const recorded = readBaseline(staged.db);
          const mine = recorded !== null && recorded.madeFrom === libraryId();
          writtenAt = recorded?.writtenAt ?? staged.locationCreatedAt;
          const drive = await readSnapshot(staged.db, signal);
          const home = await readSnapshot(sqlite, signal);
          const result = diffLibraries({
            home,
            drive,
            baseline: mine ? recorded : null,
            mode: recorded === null ? "dates" : mine ? "recorded" : "other-library",
            writtenAt,
            memory: memoryFor(row.driveId, writtenAt ?? 0, row.id),
          });

          // What the comparison cannot know: whether the files it would copy are really there.
          const libraryRoot = path.join(row.drivePath, "library");
          const warnings: string[] = [];
          for (const item of result.items) {
            signal.throwIfAborted();
            if (item.blocked) continue;
            if (item.kind === "document" && (item.change === "added" || item.conflict === "deleted-at-home")) {
              const theirs = drive.documents.get(item.driveItemId)!;
              const source = await fileInside(libraryRoot, theirs.relPath);
              if (!source) item.blocked = "Its file is not on the drive, so it cannot be added.";
              else if (source.size !== theirs.sizeBytes)
                item.blocked = "Its file on the drive is not the size its record says. It may be damaged.";
              else if (source.size > config.maxUploadBytes)
                item.blocked = `It is larger than this server accepts for one file (${formatBytes(config.maxUploadBytes)}).`;
            } else if (item.kind === "collection") {
              const theirs = drive.collections.find((entry) => entry.id === item.driveItemId)!;
              const source = await fileInside(libraryRoot, theirs.relPath);
              if (!source) item.blocked = "Its file is not on the drive, so it cannot be copied.";
              else item.bytes = source.size;
            }
            if (item.blocked) {
              item.choices = ["skip"];
              item.defaultChoice = "skip";
            }
          }

          // Pictures and files in the pages that would come across, which home does not have yet.
          const homeAttachmentShas = new Set([...home.attachments.values()].map((attachment) => attachment.sha256));
          const needed = new Map<string, number>();
          const content = staged.db.prepare(`SELECT content FROM notes WHERE id = ? AND length(content) <= ${LIMITS.pageBytes}`);
          for (const item of result.items) {
            if (item.kind !== "page" || item.blocked || item.change === "deleted" || item.change === "moved") continue;
            signal.throwIfAborted();
            const page = drive.pages.get(item.driveItemId);
            const ids = new Set<string>(page?.coverAttachmentId ? [page.coverAttachmentId] : []);
            try {
              const raw = (content.get(item.driveItemId) as { content: unknown } | undefined)?.content;
              const doc = ctx.services.notes.content.sanitizeDoc(JSON.parse(String(raw)));
              for (const id of ctx.services.notes.content.extractLinks(doc).attachmentIds) ids.add(id);
            } catch {
              item.blocked = "This page's content on the drive could not be read, so it stays on the drive.";
              item.choices = ["skip"];
              item.defaultChoice = "skip";
              continue;
            }
            for (const id of ids) {
              const theirs = drive.attachments.get(id);
              if (theirs && !homeAttachmentShas.has(theirs.sha256)) needed.set(theirs.sha256, theirs.sizeBytes);
            }
          }

          const unreadable = Object.values(drive.unreadable).reduce((sum, count) => sum + count, 0);
          if (unreadable > 0) {
            warnings.push(
              `${unreadable} record${unreadable === 1 ? "" : "s"} on the drive could not be read and ${unreadable === 1 ? "was" : "were"} left out.`,
            );
          }
          analysis = toAnalysis(result, {
            driveWrittenAt: writtenAt,
            driveAppVersion: inspection.drive.appVersion,
            attachments: { count: needed.size, bytes: [...needed.values()].reduce((sum, bytes) => sum + Math.max(0, bytes), 0) },
            warnings,
          });
        } finally {
          staged.close();
        }

        setState(row.id, {
          state: "ready",
          baseline: analysis.baseline,
          driveWrittenAt: writtenAt ?? 0,
          analysis: analysis as unknown as Record<string, unknown>,
          error: null,
        });
        return { items: analysis.items.length };
      } catch (error) {
        if (signal.aborted) throw error;
        await removeStaging(row.id);
        const message =
          error instanceof TooManyRows
            ? `This drive holds more ${error.what} than Outpost will read from a drive (${error.limit.toLocaleString("en-GB")}), so nothing was read.`
            : error instanceof AppError || error instanceof PermanentJobError
              ? error.message
              : "The database on this drive is damaged or is not an Outpost database, so nothing was read from it.";
        if (!(error instanceof AppError) && !(error instanceof PermanentJobError) && !(error instanceof TooManyRows)) {
          ctx.log.warn({ err: error, merge: row.id }, "reading a drive failed");
        }
        setState(row.id, { state: "failed", error: message, completedAt: Date.now() });
        throw new PermanentJobError(message);
      }
    },
    async onSettled(job) {
      const id = (job.payload as { mergeId?: string }).mergeId;
      const row = id ? find(id) : undefined;
      // Cancelled while reading: nothing was touched, and there is nothing worth keeping.
      if (row?.state === "analysing" && job.state === "cancelled") {
        await removeStaging(row.id);
        setState(row.id, { state: "discarded", completedAt: Date.now() });
      }
    },
  });

  // ── Merging ──

  jobs.register<{ mergeId: string }>(APPLY_JOB, {
    queue: "import",
    async run({ payload, signal, progress }) {
      const row = find(payload.mergeId);
      if (row?.state !== "merging" || !row.analysis) return { skipped: true };
      const analysis = row.analysis as unknown as MergeAnalysis;
      if (!fs.existsSync(stagedFileOf(row.id))) {
        const message = "The copy of the drive’s database that this merge was reading is gone. Look at the drive again from Storage.";
        setState(row.id, { state: "failed", error: message, completedAt: Date.now() });
        throw new PermanentJobError(message);
      }
      try {
        await applyMerge(ctx, {
          merge: row,
          analysis,
          choices: (row.choices ?? {}) as Record<string, MergeChoice>,
          stagedFile: stagedFileOf(row.id),
          homeMigrations: homeMigrations(),
          memory: memoryFor(row.driveId, row.driveWrittenAt, row.id),
          signal,
          progress,
        });
      } catch (error) {
        if (signal.aborted) {
          // Paused, or the server is stopping: the job runs again and carries on from the record.
          if (signal.reason !== "cancelled") throw error;
          const report = reportOf(row.id);
          setState(row.id, { state: "stopped", completedAt: Date.now() });
          await removeStaging(row.id);
          throw new StoppedWithResult({ counts: report?.counts ?? {} });
        }
        const message = error instanceof AppError ? error.message : `The merge could not be finished: ${messageOf(error)}`;
        ctx.log.error({ err: error, merge: row.id }, "merge failed");
        setState(row.id, { state: "failed", error: message, completedAt: Date.now() });
        throw new PermanentJobError(message);
      }
      setState(row.id, { state: "completed", completedAt: Date.now(), error: null });
      await removeStaging(row.id);
      return { counts: reportOf(row.id)?.counts ?? {} };
    },
    async onSettled(job) {
      const id = (job.payload as { mergeId?: string }).mergeId;
      const row = id ? find(id) : undefined;
      // Cancelled before it had started running: nothing was done.
      if (row?.state === "merging" && job.state === "cancelled") {
        setState(row.id, { state: reportOf(row.id) ? "stopped" : "ready", completedAt: reportOf(row.id) ? Date.now() : null });
      }
    },
  });

  // A merge whose job is gone (a restored backup, a database moved between machines) cannot carry on.
  for (const row of db.select().from(driveMerges).all()) {
    if (
      (row.state === "analysing" || row.state === "merging") &&
      !jobs.findBySubject(subjectOf(row.id)).some((job) => ACTIVE.has(job.state) || job.state === "running")
    ) {
      db.update(driveMerges)
        .set({
          state: row.state === "merging" && reportOf(row.id) ? "stopped" : "failed",
          error: "Outpost was restarted or restored before this merge had finished. Look at the drive again to carry on.",
          completedAt: Date.now(),
        })
        .where(eq(driveMerges.id, row.id))
        .run();
    }
  }
  // Copies of drive databases that no merge is using any more.
  void (async () => {
    for (const name of await fs.promises.readdir(stagingRoot).catch(() => [] as string[])) {
      const row = find(name);
      if (!row || !["analysing", "ready", "merging"].includes(row.state)) await removeStaging(name);
    }
  })();

  // ── Comparing two versions ──

  const clip = (text: string): { text: string; truncatedAt: number | null } =>
    text.length > COMPARE_TEXT_LIMIT
      ? { text: text.slice(0, COMPARE_TEXT_LIMIT), truncatedAt: COMPARE_TEXT_LIMIT }
      : { text, truncatedAt: null };
  const tagsField = (tags: string[]) => (tags.length > 0 ? [{ label: "Tags", value: tags.join(", ") }] : []);

  function compare(id: string, key: string): MergeCompareResponse {
    const row = mustFind(id);
    const analysis = row.analysis as unknown as MergeAnalysis | null;
    const item = analysis?.items.find((entry) => entry.key === key);
    if (!analysis || !item) throw notFound("That item");
    if (row.state !== "ready" || !fs.existsSync(stagedFileOf(id))) {
      throw conflict("The two versions can only be compared while the preview is open. Look at the drive again.");
    }
    const { notes } = ctx.services;
    const markdown = (raw: unknown): string => {
      try {
        const doc = notes.content.sanitizeDoc(typeof raw === "string" ? JSON.parse(raw) : raw);
        return notes.content.docToMarkdown(doc as NoteDoc);
      } catch {
        return "(This version could not be shown as text.)";
      }
    };
    const tagNames = (database: typeof sqlite, table: "note_tags" | "document_tags", column: string, owner: string): string[] =>
      (
        database
          .prepare(`SELECT t.name AS name FROM ${table} j JOIN tags t ON t.id = j.tag_id WHERE j.${column} = ? LIMIT 50`)
          .all(owner) as Array<{
          name: unknown;
        }>
      )
        .map((tag) => (typeof tag.name === "string" ? tag.name.slice(0, 200) : ""))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    const words = (value: unknown, max = 2000): string => (typeof value === "string" ? value.slice(0, max) : "");
    const when = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

    const side = (database: typeof sqlite, itemId: string | null): MergeSide | null => {
      if (!itemId) return null;
      if (item.kind === "page") {
        const page = database
          .prepare(
            `SELECT title, updated_at AS updatedAt, CASE WHEN length(content) <= ${LIMITS.pageBytes} THEN content ELSE NULL END AS content FROM notes WHERE id = ?`,
          )
          .get(itemId) as { title: unknown; updatedAt: unknown; content: unknown } | undefined;
        if (!page) return null;
        return {
          title: words(page.title, 300) || "Untitled",
          updatedAt: when(page.updatedAt),
          fields: tagsField(tagNames(database, "note_tags", "note_id", itemId)),
          ...clip(page.content === null ? "(This version is too large to show.)" : markdown(page.content)),
        };
      }
      if (item.kind === "document") {
        const document = database
          .prepare(
            "SELECT title, original_name, category, description, author, source, language, updated_at AS updatedAt FROM documents WHERE id = ?",
          )
          .get(itemId) as Record<string, unknown> | undefined;
        if (!document) return null;
        const fields = [
          { label: "File", value: words(document.original_name) },
          { label: "Category", value: words(document.category) },
          { label: "Author", value: words(document.author) },
          { label: "Source", value: words(document.source) },
          { label: "Language", value: words(document.language) },
          ...tagsField(tagNames(database, "document_tags", "document_id", itemId)),
        ].filter((field) => field.value);
        return {
          title: words(document.title, 300),
          updatedAt: when(document.updatedAt),
          fields,
          ...clip(words(document.description, 20_000)),
        };
      }
      if (item.kind === "place") {
        const place = database
          .prepare("SELECT name, note, lat, lon, color, updated_at AS updatedAt FROM markers WHERE id = ?")
          .get(itemId) as Record<string, unknown> | undefined;
        if (!place) return null;
        return {
          title: words(place.name, 200),
          updatedAt: when(place.updatedAt),
          fields: [
            { label: "Position", value: `${Number(place.lat).toFixed(5)}, ${Number(place.lon).toFixed(5)}` },
            { label: "Colour", value: words(place.color, 32) },
          ],
          ...clip(words(place.note, 20_000)),
        };
      }
      if (item.kind === "track") {
        const track = database
          .prepare(
            "SELECT name, description, color, distance_meters AS distance, point_count AS points, updated_at AS updatedAt FROM tracks WHERE id = ?",
          )
          .get(itemId) as Record<string, unknown> | undefined;
        if (!track) return null;
        return {
          title: words(track.name, 200),
          updatedAt: when(track.updatedAt),
          fields: [
            { label: "Length", value: `${(Number(track.distance) / 1000 || 0).toFixed(1)} km` },
            { label: "Points", value: String(Number(track.points) || 0) },
            { label: "Colour", value: words(track.color, 32) },
          ],
          ...clip(words(track.description, 20_000)),
        };
      }
      return null;
    };

    const staged = openStaged(stagedFileOf(id), homeMigrations(), analysis.driveAppVersion);
    try {
      return {
        key,
        home: side(sqlite, item.homeItemId),
        drive: item.change === "deleted" ? null : side(staged.db as typeof sqlite, item.driveItemId),
      };
    } finally {
      staged.close();
    }
  }

  // ── The service ──

  return {
    libraryId,
    inspect: (folder) => inspectDrive(config, folder),

    async start(input) {
      const inspection = await inspectDrive(config, input.path);
      if (!inspection.drive) throw badRequest(inspection.problem ?? "That folder is not an Outpost drive.");
      const source = sourceFolderOf(inspection, input.source);
      const busy = db
        .select()
        .from(driveMerges)
        .all()
        .find((row) => row.state === "analysing" || row.state === "merging");
      if (busy) {
        throw conflict("Another drive is being read or merged at the moment. Wait for it to finish, or stop it first.", {
          mergeId: busy.id,
        });
      }
      // An earlier look at the same drive that was never carried out is replaced by this one.
      for (const stale of db.select().from(driveMerges).where(eq(driveMerges.state, "ready")).all()) {
        await removeStaging(stale.id);
        setState(stale.id, { state: "discarded", completedAt: Date.now() });
      }
      const id = newId();
      db.insert(driveMerges)
        .values({
          id,
          driveId: inspection.drive.id,
          drivePath: inspection.path,
          sourceFolder: source.folder,
          driveLabel: labelOf(inspection.path),
          state: "analysing",
          createdAt: Date.now(),
        })
        .run();
      jobs.enqueue(
        ANALYSE_JOB,
        { mergeId: id },
        { title: `Look for changes on the drive ${labelOf(inspection.path)}`, subject: subjectOf(id) },
      );
      changed(id);
      return toDto(mustFind(id));
    },

    get: (id) => toDto(mustFind(id)),

    list(limit = 30) {
      return db
        .select()
        .from(driveMerges)
        .orderBy(desc(driveMerges.createdAt))
        .limit(limit)
        .all()
        .filter((row) => row.state !== "discarded")
        .map(summaryOf);
    },

    compare,

    commit(id, body) {
      const row = mustFind(id);
      if (row.state !== "ready" || !row.analysis) throw conflict("This merge is not waiting for your choices. Look at the drive again.");
      const analysis = row.analysis as unknown as MergeAnalysis;
      const byKey = new Map(analysis.items.map((item) => [item.key, item]));
      const choices: Record<string, MergeChoice> = {};
      for (const [key, choice] of Object.entries(body.choices)) {
        const item = byKey.get(key);
        if (!item) throw badRequest("One of the choices is for something that is not in this preview. Look at the drive again.");
        if (!item.choices.includes(choice)) throw badRequest(`“${item.title}” cannot be handled that way.`);
        if (choice !== item.defaultChoice) choices[key] = choice;
      }
      const removing = analysis.items.filter((item) => item.change === "deleted" && choices[item.key] === "apply");
      if (removing.length > 0 && !body.deletionsConfirmed) {
        throw conflict("Some things would be removed at home. Confirm that you have seen which.", {
          needsConfirmation: true,
          removing: removing.map((item) => item.title).slice(0, 50),
        });
      }
      if (!fs.existsSync(stagedFileOf(id))) throw conflict("The preview is out of date. Look at the drive again.");
      setState(id, { state: "merging", choices });
      jobs.enqueue(APPLY_JOB, { mergeId: id }, { title: `Bring back changes from the drive ${row.driveLabel}`, subject: subjectOf(id) });
      return toDto(mustFind(id));
    },

    cancel(id) {
      mustFind(id);
      const job = activeJob(id);
      if (!job) throw conflict("Nothing is running for this merge.");
      jobs.cancel(job.id);
      return toDto(mustFind(id));
    },

    async discard(id) {
      const row = mustFind(id);
      if (row.state === "analysing" || row.state === "merging") throw conflict("Stop it first, then it can be discarded.");
      if (row.state !== "ready" && row.state !== "failed") throw conflict("This merge has been carried out; its record is kept.");
      await removeStaging(id);
      setState(id, { state: "discarded", completedAt: Date.now() });
      return toDto(mustFind(id));
    },

    async undo(id, options) {
      const row = mustFind(id);
      if (row.state !== "completed" && row.state !== "stopped") throw conflict("Only a merge that has been carried out can be undone.");
      if (row.undoneAt !== null) throw conflict("This merge has already been undone.");
      await undoMerge(ctx, row, options);
      setState(id, { undoneAt: Date.now() });
      ctx.events.publish({ type: "notes.changed" });
      ctx.events.publish({ type: "documents.changed" });
      ctx.events.publish({ type: "maps.changed" });
      return toDto(mustFind(id));
    },
  };
}
