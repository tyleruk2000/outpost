/**
 * Removing in bulk: a selection, everything that was downloaded, the data Outpost works
 * out for itself, or everything.
 *
 * Each of these is something a person asked for in so many words and confirmed after
 * reading what it would do. Nothing here happens as a side effect of anything else.
 *
 * A plan and the job that carries it out are built from the same list by the same
 * rules (`foresee` and `removeEntry`), so what the summary says is what happens. The
 * job reports each thing it did not delete and where that thing is.
 *
 * What no clean-up touches: storage locations and their marker files, network shares
 * and their Keychain items, anything in a location outside the folders Outpost made,
 * a person's own catalogue manifests, and the programs Outpost fetched for portable
 * drives (those are a cache, cleared from the leftovers list).
 */
import fs from "node:fs";
import path from "node:path";
import {
  type CleanupPlan,
  type CleanupResult,
  type CleanupScope,
  type DerivedStep,
  formatBytes,
  type ManagedKind,
  type NamedFile,
  type PlanLocation,
  type Tally,
} from "@outpost/shared";
import { eq, ne, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, messageOf } from "../../core/errors.ts";
import { type JobRow, type JobRun, StoppedWithResult } from "../../core/jobs.ts";
import {
  attachments as attachmentsTable,
  documents as documentsTable,
  downloads as downloadsTable,
  driveMerges as driveMergesTable,
  embeddingModels,
  embeddings,
  imports as importsTable,
  jobs as jobsTable,
  notes as notesTable,
  pgpKeys,
  settings as settingsTable,
} from "../../db/schema.ts";
import { type Entry, fileOf, type Inventory } from "./inventory.ts";
import { foresee, type RemovePolicy, removeEntry } from "./remove.ts";
import type { Surveyor } from "./survey.ts";

export const REMOVE_JOB = "manage.remove";
export const DERIVED_JOB = "manage.derived";
export const ERASE_JOB = "manage.erase";
export const MANAGE_QUEUE = "manage";
const MANAGE_JOBS = [REMOVE_JOB, DERIVED_JOB, ERASE_JOB];
const SUBJECT = "manage";

/** How many files a plan or a result names one by one; the rest are counted. */
const NAMED = 200;
const PREVIOUS_DATA = /^before-restore-[0-9A-Za-z-]+$/;
const STALE_SNAPSHOT = /^backup-snapshot-\d+\.db(-journal|-wal|-shm)?$/;
/** Folders of the data directory that hold only what records refer to. */
const DERIVED_FOLDERS = ["attachments", "extracted", "staging", "restore-pending"];

interface RemovePayload extends Record<string, unknown> {
  scope: "items" | "downloaded";
  keys?: string[];
  files: "delete" | "keep";
  disconnected: "forget" | "leave";
}

interface DerivedPayload extends Record<string, unknown> {
  steps: DerivedStep[];
}

export interface RemoveRequest {
  scope: CleanupScope;
  keys?: string[];
  files?: "delete" | "keep";
  disconnected?: "forget" | "leave";
}

export interface Cleanup {
  plan(request: RemoveRequest): CleanupPlan;
  startRemove(request: RemoveRequest & { scope: "items" | "downloaded" }): JobRow;
  startDerived(steps: DerivedStep[]): JobRow;
  startErase(): JobRow;
  /** The clean-up that is waiting or running, and the last that finished. */
  jobs(): { active: JobRow | undefined; last: JobRow | undefined };
  derivedStatus(): {
    vectors: Tally;
    documents: { count: number; unreachable: number };
    reclaimableBytes: number;
    databaseBytes: number;
  };
}

const emptyTally = (): Tally => ({ count: 0, bytes: 0 });
const add = (tally: Tally, bytes: number) => {
  tally.count += 1;
  tally.bytes += bytes;
};
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emptyResult(scope: CleanupResult["scope"]): CleanupResult {
  return {
    scope,
    stopped: false,
    removed: emptyTally(),
    forgotten: emptyTally(),
    left: emptyTally(),
    leftBehind: [],
    leftBehindMore: 0,
    failed: [],
    failedMore: 0,
    notReached: 0,
    message: "",
  };
}

function noteLeft(result: CleanupResult, file: NamedFile): void {
  if (result.leftBehind.length < NAMED) result.leftBehind.push(file);
  else result.leftBehindMore += 1;
}

function noteFailed(result: CleanupResult, title: string, reason: string): void {
  if (result.failed.length < NAMED) result.failed.push({ title, reason });
  else result.failedMore += 1;
}

const things = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function summarise(result: CleanupResult): string {
  const parts: string[] = [];
  if (result.removed.count > 0) parts.push(`Removed ${things(result.removed.count, "item")}.`);
  if (result.forgotten.count > 0) {
    parts.push(
      `Forgot ${things(result.forgotten.count, "item")}; ${result.forgotten.count === 1 ? "its file is" : "their files are"} still where ${result.forgotten.count === 1 ? "it was" : "they were"}.`,
    );
  }
  if (result.left.count > 0) parts.push(`Left ${things(result.left.count, "item")} alone on a location that is not connected.`);
  const failed = result.failed.length + result.failedMore;
  if (failed > 0) parts.push(`${things(failed, "item")} could not be removed.`);
  if (result.stopped) parts.push(`Stopped before reaching ${things(result.notReached, "more item")}.`);
  if (parts.length === 0) parts.push("There was nothing to remove.");
  return parts.join(" ");
}

export function createCleanup(ctx: AppContext, inventory: Inventory, survey: Surveyor): Cleanup {
  const { db, sqlite, config } = ctx;
  const { storage, downloads, documents, collections, settings } = ctx.services;

  function policyOf(request: RemoveRequest): RemovePolicy {
    if (request.scope === "everything") return { files: "delete", disconnected: "forget", outside: "forget" };
    if (request.scope === "downloaded") return { files: "delete", disconnected: request.disconnected ?? "leave", outside: "forget" };
    return { files: request.files ?? "delete", disconnected: request.disconnected ?? "leave", outside: "delete" };
  }

  function entriesOf(request: RemoveRequest): Entry[] {
    if (request.scope === "items") return inventory.pick(request.keys ?? []).entries;
    const all = inventory.entries();
    return request.scope === "downloaded" ? all.filter((entry) => entry.item.origin === "downloaded") : all;
  }

  const unfinishedDownloads = () => db.select().from(downloadsTable).where(ne(downloadsTable.state, "completed")).all();

  /** Copies of the database that a restore set aside, which hold what "erase everything" erases. */
  function previousData(): Tally {
    const tally = emptyTally();
    const latest = survey.latest();
    for (const entry of latest?.data.previous ?? []) add(tally, entry.bytes);
    if (!latest) {
      for (const name of fs.readdirSync(config.dataDir)) if (PREVIOUS_DATA.test(name)) tally.count += 1;
    }
    return tally;
  }

  const plan = (request: RemoveRequest): CleanupPlan => look(request).plan;

  /** The plan, and how many entries carrying it out would change. */
  function look(request: RemoveRequest): { plan: CleanupPlan; acts: number } {
    let acts = 0;
    const policy = policyOf(request);
    const byKind = new Map<ManagedKind, Tally>();
    const byLocation = new Map<string, PlanLocation>();
    for (const location of storage.list()) {
      byLocation.set(location.id, {
        locationId: location.id,
        name: location.name,
        path: location.path,
        available: location.status === "available",
        remove: emptyTally(),
        stays: emptyTally(),
      });
    }
    const result: CleanupPlan = {
      scope: request.scope,
      changes: 0,
      remove: emptyTally(),
      byKind: [],
      byLocation: [],
      own: emptyTally(),
      linkedDocuments: 0,
      disconnected: { ...emptyTally(), files: [] },
      outside: { ...emptyTally(), files: [] },
      refused: [],
      downloads: emptyTally(),
    };

    for (const entry of entriesOf(request)) {
      const { item } = entry;
      const fate = foresee(ctx, entry, policy);
      if (fate === "refuse") {
        result.refused.push({ key: item.key, title: item.title, reason: item.busyReason ?? "It is in use." });
        continue;
      }
      const location = byLocation.get(item.locationId);
      if (fate !== "leave") acts += 1;
      if (fate === "remove") {
        add(result.remove, item.sizeBytes);
        const kind = byKind.get(item.kind) ?? emptyTally();
        add(kind, item.sizeBytes);
        byKind.set(item.kind, kind);
        if (location) add(location.remove, item.sizeBytes);
        if (item.origin === "own") add(result.own, item.sizeBytes);
        if (item.type === "collection") result.linkedDocuments += item.documents.length;
        continue;
      }
      if (location) add(location.stays, item.sizeBytes);
      // Why it stays, in the order a person needs to hear it: the drive is away, or the
      // file was never Outpost's to delete. Keeping files by choice needs no list.
      const bucket = !item.locationAvailable
        ? result.disconnected
        : !item.inOutpostFolder && policy.files === "delete"
          ? result.outside
          : undefined;
      if (bucket) {
        add(bucket, item.sizeBytes);
        if (bucket.files.length < NAMED) bucket.files.push(fileOf(ctx, entry));
      }
    }

    result.byKind = [...byKind].map(([kind, tally]) => ({ kind, ...tally })).sort((a, b) => b.bytes - a.bytes);
    result.byLocation = [...byLocation.values()].filter((location) => location.remove.count > 0 || location.stays.count > 0);

    if (request.scope !== "items") {
      for (const row of unfinishedDownloads()) add(result.downloads, row.receivedBytes);
    }
    if (request.scope === "everything") {
      const count = (statement: string) => (sqlite.prepare(statement).get() as { n: number }).n;
      const attachmentBytes = (sqlite.prepare("SELECT coalesce(sum(size_bytes), 0) AS n FROM attachments").get() as { n: number }).n;
      result.personal = {
        pages: count("SELECT count(*) AS n FROM notes"),
        attachments: { count: count("SELECT count(*) AS n FROM attachments"), bytes: attachmentBytes },
        places: count("SELECT count(*) AS n FROM markers"),
        routes: count("SELECT count(*) AS n FROM tracks"),
        contacts: ctx.services.contacts.count(),
        conversations: count("SELECT count(*) AS n FROM chat_conversations"),
        repeaters: ctx.services.repeaters.count().repeaters,
        repeaterLists: ctx.services.repeaters.count().lists,
        settings: count("SELECT count(*) AS n FROM settings"),
        vectors: count("SELECT count(*) AS n FROM embeddings"),
        previous: previousData(),
      };
    }
    result.changes = acts;
    return { plan: result, acts };
  }

  // ── Running ──

  /** Throws the right thing when the job has been asked to stop. */
  function checkStop(run: JobRun<Record<string, unknown>>, result: CleanupResult, remaining: number): void {
    if (!run.signal.aborted) return;
    // Paused or shutting down: the job runs again and carries on with what is left.
    if (run.signal.reason !== "cancelled") throw run.signal.reason instanceof Error ? run.signal.reason : new Error("Stopped");
    result.stopped = true;
    result.notReached = remaining;
    result.message = summarise(result);
    throw new StoppedWithResult(result);
  }

  /** Cancels every download that has not finished and removes it with its partial file. */
  async function clearDownloads(run: JobRun<Record<string, unknown>>, result: CleanupResult): Promise<void> {
    const rows = unfinishedDownloads();
    for (const row of rows) {
      try {
        if (["queued", "running", "verifying", "paused"].includes(row.state)) downloads.cancel(row.id);
      } catch {
        // It finished or failed in the meantime; removing it below settles which.
      }
    }
    for (const row of rows) {
      let cleared = false;
      let reason = "";
      // A transfer that was running takes a moment to let go of its file.
      for (let attempt = 0; attempt < 80 && !cleared; attempt += 1) {
        const current = downloads.get(row.id);
        if (!current || current.state === "completed") {
          cleared = true;
          break;
        }
        try {
          if (["queued", "running", "verifying", "paused"].includes(current.state)) downloads.cancel(row.id);
          await downloads.remove(row.id);
          cleared = true;
        } catch (error) {
          reason = messageOf(error);
          if (run.signal.aborted && run.signal.reason !== "cancelled") throw error;
          await sleep(250);
        }
      }
      if (!cleared) noteFailed(result, `Download of ${row.title}`, reason);
      else if (!storage.isAvailable(row.locationId) && row.receivedBytes > 0) {
        const location = storage.list().find((candidate) => candidate.id === row.locationId);
        noteLeft(result, {
          title: `Part of the download of ${row.title}`,
          locationName: location?.name ?? "Unknown location",
          path: `${location ? path.join(location.path, row.relPath) : row.relPath}.part`,
          bytes: row.receivedBytes,
        });
      }
    }
  }

  async function removeEntries(
    run: JobRun<Record<string, unknown>>,
    entries: Entry[],
    policy: RemovePolicy,
    result: CleanupResult,
  ): Promise<void> {
    const total = entries.reduce((sum, entry) => sum + entry.item.sizeBytes, 0);
    let done = 0;
    for (const [position, entry] of entries.entries()) {
      checkStop(run, result, entries.length - position);
      run.progress({ current: done, total, message: `Removing ${entry.item.title}` });
      const outcome = await removeEntry(ctx, inventory, entry, policy);
      done += entry.item.sizeBytes;
      if (outcome.outcome === "removed") add(result.removed, outcome.bytes);
      else if (outcome.outcome === "forgotten") {
        add(result.forgotten, outcome.bytes);
        noteLeft(result, outcome.file);
      } else if (outcome.outcome === "left") {
        add(result.left, outcome.file.bytes);
        noteLeft(result, outcome.file);
      } else noteFailed(result, entry.item.title, outcome.reason);
    }
    run.progress({ current: total, total, message: "Finishing" });
  }

  ctx.jobs.register<RemovePayload>(REMOVE_JOB, {
    queue: MANAGE_QUEUE,
    async run(run) {
      const request: RemoveRequest = run.payload;
      const result = emptyResult(request.scope);
      try {
        if (request.scope === "downloaded") {
          run.progress({ current: 0, total: null, message: "Stopping downloads" });
          await clearDownloads(run, result);
        }
        await removeEntries(run, entriesOf(request), policyOf(request), result);
      } finally {
        survey.touch();
        ctx.events.publish({ type: "storage.changed" });
      }
      result.message = summarise(result);
      return result;
    },
  });

  // ── Derived data ──

  const databaseFiles = () => ["outpost.db", "outpost.db-wal"].map((name) => path.join(config.dataDir, name));
  const databaseBytes = () => databaseFiles().reduce((sum, file) => sum + (fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0), 0);

  function compact(): string {
    const before = databaseBytes();
    const space = fs.statfsSync(config.dataDir);
    // VACUUM writes a whole new copy of the database beside the old one.
    if (space.bavail * space.bsize < before + 64 * 1024 * 1024) {
      throw new AppError(
        "insufficient_space",
        "There is not enough free space beside the database to compact it. Free some space on that disk first.",
      );
    }
    sqlite.exec("VACUUM");
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const after = databaseBytes();
    return after < before
      ? `Compacted the database from ${formatBytes(before)} to ${formatBytes(after)}.`
      : "Compacted the database. There was no space inside it to give back.";
  }

  function derivedStatus() {
    const vectors = sqlite
      .prepare(
        "SELECT coalesce(sum(n), 0) AS count, coalesce(sum(n * dimensions * 4), 0) AS bytes FROM (SELECT m.dimensions AS dimensions, count(e.chunk_id) AS n FROM embedding_models m LEFT JOIN embeddings e ON e.model_id = m.id GROUP BY m.id)",
      )
      .get() as Tally;
    const connected = new Set(
      storage
        .list()
        .filter((location) => location.status === "available")
        .map((location) => location.id),
    );
    const perLocation = db
      .select({ locationId: documentsTable.locationId, n: sql<number>`count(*)` })
      .from(documentsTable)
      .groupBy(documentsTable.locationId)
      .all();
    const pageSize = sqlite.pragma("page_size", { simple: true }) as number;
    return {
      vectors,
      documents: {
        count: perLocation.reduce((sum, row) => sum + row.n, 0),
        unreachable: perLocation.filter((row) => !connected.has(row.locationId)).reduce((sum, row) => sum + row.n, 0),
      },
      reclaimableBytes: (sqlite.pragma("freelist_count", { simple: true }) as number) * pageSize,
      databaseBytes: databaseBytes(),
    };
  }

  ctx.jobs.register<DerivedPayload>(DERIVED_JOB, {
    queue: MANAGE_QUEUE,
    async run(run) {
      const result = emptyResult("derived");
      result.steps = [];
      const steps = run.payload.steps;
      for (const [position, step] of steps.entries()) {
        checkStop(run, result, steps.length - position);
        run.progress({ current: position, total: steps.length, message: null });
        try {
          if (step === "vectors") {
            let removed = 0;
            for (const model of db.select({ id: embeddingModels.id }).from(embeddingModels).all()) {
              removed += ctx.services.semantic.index.removeModel(model.id);
            }
            // Vectors from a model nobody recorded, should there be any.
            removed += db.delete(embeddings).run().changes;
            ctx.events.publish({ type: "semantic.changed" });
            result.steps.push({
              step,
              message: `Cleared ${things(removed, "vector")}. Search by meaning finds nothing until the index is built again, from Settings.`,
            });
          } else if (step === "text") {
            let queued = 0;
            let skipped = 0;
            for (const row of db.select({ id: documentsTable.id, locationId: documentsTable.locationId }).from(documentsTable).all()) {
              if (run.signal.aborted) break;
              if (!storage.isAvailable(row.locationId)) {
                skipped += 1;
                continue;
              }
              try {
                documents.reextract(row.id);
                queued += 1;
              } catch {
                skipped += 1;
              }
              if (queued % 50 === 0) await sleep(0);
            }
            result.steps.push({
              step,
              message:
                `Reading the text of ${things(queued, "document")} again; each is searchable by its old text until its new text is in.` +
                (skipped > 0
                  ? ` ${things(skipped, "document")} on a location that is not connected ${skipped === 1 ? "was" : "were"} skipped.`
                  : ""),
            });
          } else {
            result.steps.push({ step, message: compact() });
          }
        } catch (error) {
          noteFailed(result, step, messageOf(error));
          result.steps.push({ step, message: `This could not be done: ${messageOf(error)}` });
        }
      }
      survey.touch();
      result.message = result.steps.map((entry) => entry.message).join(" ");
      return result;
    },
  });

  // ── Everything ──

  async function stopOtherWork(run: JobRun<Record<string, unknown>>): Promise<void> {
    const others = () => ctx.jobs.list({ states: ["queued", "running", "paused"], limit: 100_000 }).filter((job) => job.id !== run.job.id);
    for (const job of others()) {
      try {
        ctx.jobs.cancel(job.id);
      } catch {
        // Finished in the meantime.
      }
    }
    // Running work unwinds in its own time; nothing is removed underneath it.
    for (let attempt = 0; attempt < 240 && others().some((job) => job.state === "running"); attempt += 1) await sleep(250);
    for (const row of db.select({ id: importsTable.id, state: importsTable.state }).from(importsTable).all()) {
      if (row.state === "completed" || row.state === "discarded") continue;
      await ctx.services.imports.discard(row.id).catch(() => undefined);
    }
  }

  async function erasePersonal(result: CleanupResult): Promise<void> {
    const { notes, maps } = ctx.services;
    const personal = {
      pages: 0,
      attachments: 0,
      places: 0,
      routes: 0,
      contacts: 0,
      conversations: 0,
      repeaters: 0,
      repeaterLists: 0,
      settings: 0,
    };
    personal.attachments = (sqlite.prepare("SELECT count(*) AS n FROM attachments").get() as { n: number }).n;

    // Pages go the way a person deletes them: to the trash, then for good, which takes
    // their attachments with them.
    for (const row of db.select({ id: notesTable.id, trashedAt: notesTable.trashedAt }).from(notesTable).all()) {
      try {
        if (row.trashedAt === null) notes.trash(row.id);
      } catch {
        // Went with a parent page.
      }
    }
    for (const row of db.select({ id: notesTable.id }).from(notesTable).all()) {
      if (!db.select({ id: notesTable.id }).from(notesTable).where(eq(notesTable.id, row.id)).get()) continue;
      try {
        personal.pages += (await notes.deletePermanently(row.id)).deletedNotes;
      } catch (error) {
        noteFailed(result, "A page", messageOf(error));
      }
    }
    for (const marker of maps.annotations.listMarkers()) {
      maps.annotations.removeMarker(marker.id);
      personal.places += 1;
    }
    for (const track of maps.annotations.listTracks()) {
      maps.annotations.removeTrack(track.id);
      personal.routes += 1;
    }
    // Contacts are other people's details as well as the person's own: every one goes, with its place in search.
    personal.contacts = ctx.services.contacts.eraseAll();
    // Conversations with a model are the person's own words, and a reply being written is stopped first.
    personal.conversations = await ctx.services.chat.eraseAll();
    // Lists of repeaters a person brought in, and the entries they added or changed themselves.
    const repeaters = await ctx.services.repeaters.eraseAll();
    personal.repeaters = repeaters.repeaters;
    personal.repeaterLists = repeaters.lists;

    // Whatever is left belongs to records that no longer exist: attachments no page
    // used, import reports, history, vectors, and the settings.
    // Anything that could not be removed above keeps what belongs to it: a page its
    // attachments, a document its tags and its place in search.
    const pagesLeft = remaining("notes") > 0;
    sqlite.transaction(() => {
      if (!pagesLeft) db.delete(attachmentsTable).run();
      db.delete(importsTable).run();
      // Records of drive merges hold earlier versions of pages: they are the person's own words too.
      db.delete(driveMergesTable).run();
      db.delete(downloadsTable).run();
      // Keys, and any protected private key kept here, are the person's own too.
      db.delete(pgpKeys).run();
      db.delete(embeddings).run();
      db.delete(embeddingModels).run();
      sqlite
        .prepare("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM document_tags) AND id NOT IN (SELECT tag_id FROM note_tags)")
        .run();
      // The catalogue describes what can be fetched, not what a person has; it stays findable.
      sqlite.prepare("DELETE FROM search_entities WHERE kind NOT IN ('catalog', 'collection', 'document', 'note')").run();
      sqlite.prepare("DELETE FROM search_entities WHERE kind = 'collection' AND entity_id NOT IN (SELECT id FROM collections)").run();
      sqlite.prepare("DELETE FROM search_entities WHERE kind = 'document' AND entity_id NOT IN (SELECT id FROM documents)").run();
      sqlite.prepare("DELETE FROM search_entities WHERE kind = 'note' AND entity_id NOT IN (SELECT id FROM notes)").run();
    })();
    personal.settings = db.select({ n: sql<number>`count(*)` }).from(settingsTable).get()?.n ?? 0;
    settings.reset();
    result.personal = personal;
  }

  const remaining = (table: "notes" | "documents") => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

  /** Empties the data directory's own folders once nothing refers to what is in them. */
  async function eraseDataFolders(result: CleanupResult): Promise<void> {
    for (const name of DERIVED_FOLDERS) {
      // Kept while something that could not be removed still uses it.
      if ((name === "attachments" && remaining("notes") > 0) || (name === "extracted" && remaining("documents") > 0)) continue;
      await fs.promises.rm(path.join(config.dataDir, name), { recursive: true, force: true }).catch((error) => {
        noteFailed(result, `The ${name} folder`, messageOf(error));
      });
    }
    // Copies of the database a restore set aside hold the same notes that were just erased.
    for (const name of await fs.promises.readdir(config.dataDir).catch(() => [] as string[])) {
      if (!PREVIOUS_DATA.test(name) && !STALE_SNAPSHOT.test(name)) continue;
      await fs.promises.rm(path.join(config.dataDir, name), { recursive: true, force: true }).catch((error) => {
        noteFailed(result, name, messageOf(error));
      });
    }
  }

  ctx.jobs.register<Record<string, unknown>>(ERASE_JOB, {
    queue: MANAGE_QUEUE,
    async run(run) {
      const result = emptyResult("everything");
      try {
        run.progress({ current: 0, total: null, message: "Stopping other work" });
        await stopOtherWork(run);
        checkStop(run, result, inventory.entries().length);
        await clearDownloads(run, result);
        await removeEntries(run, inventory.entries(), policyOf({ scope: "everything" }), result);
        checkStop(run, result, 0);

        // From here on nothing can be stopped half-way in a state worth keeping.
        run.progress({ message: "Erasing notes, places, routes, contacts, conversations, repeaters and settings" });
        await erasePersonal(result);
        await eraseDataFolders(result);
        db.delete(jobsTable).where(ne(jobsTable.id, run.job.id)).run();
        collections.reindex();
        try {
          // So that what was erased is not still readable inside the database file.
          compact();
        } catch (error) {
          noteFailed(result, "Compacting the database", messageOf(error));
        }
      } finally {
        survey.touch();
        for (const type of [
          "notes.changed",
          "maps.changed",
          "contacts.changed",
          "chat.changed",
          "repeaters.changed",
          "documents.changed",
          "collections.changed",
          "semantic.changed",
          "storage.changed",
        ]) {
          ctx.events.publish({ type });
        }
      }
      result.message = `${result.failed.length > 0 ? "Erased everything that could be erased." : "Erased everything."} ${summarise(result)}`;
      return result;
    },
  });

  /** Newest first. Every clean-up carries the same subject. */
  function manageJobs(): JobRow[] {
    return ctx.jobs
      .findBySubject(SUBJECT)
      .filter((job) => MANAGE_JOBS.includes(job.type))
      .reverse();
  }

  function assertIdle(): void {
    const busy = manageJobs().find((job) => ["queued", "running", "paused"].includes(job.state));
    if (busy) throw conflict(`"${busy.title}" is still under way. Wait for it to finish, or stop it, before starting another clean-up.`);
  }

  return {
    plan,
    derivedStatus,

    startRemove(request) {
      assertIdle();
      const { plan: summary, acts } = look(request);
      if (acts === 0 && summary.downloads.count === 0) {
        throw conflict(
          summary.refused.length > 0
            ? "Everything chosen is being moved or checked. Wait for that to finish, then try again."
            : summary.disconnected.count > 0
              ? "Everything chosen is on a location that is not connected. Reconnect it, or choose to forget those items."
              : "There is nothing to remove.",
        );
      }
      const payload: RemovePayload = {
        scope: request.scope,
        ...(request.scope === "items" ? { keys: request.keys ?? [] } : {}),
        files: request.scope === "items" ? (request.files ?? "delete") : "delete",
        disconnected: request.disconnected ?? "leave",
      };
      return ctx.jobs.enqueue<RemovePayload>(REMOVE_JOB, payload, {
        title: request.scope === "downloaded" ? "Remove all downloaded content" : `Remove ${things(acts, "item")}`,
        subject: SUBJECT,
      });
    },

    startDerived(steps) {
      assertIdle();
      return ctx.jobs.enqueue<DerivedPayload>(DERIVED_JOB, { steps }, { title: "Clear and rebuild search data", subject: SUBJECT });
    },

    startErase() {
      assertIdle();
      return ctx.jobs.enqueue(ERASE_JOB, {}, { title: "Erase everything", subject: SUBJECT });
    },

    jobs() {
      const all = manageJobs();
      return {
        active: all.find((job) => ["queued", "running", "paused"].includes(job.state)),
        last: all.find((job) => ["succeeded", "failed", "cancelled"].includes(job.state)),
      };
    },
  };
}
