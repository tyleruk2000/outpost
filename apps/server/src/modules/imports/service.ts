/**
 * Imports: the life of one import from upload to report.
 *
 *   uploaded → analysing → ready → importing → completed
 *                  │                    └────→ failed (kept, can be tried again)
 *                  └→ failed (the upload was refused or unreadable; nothing is kept)
 *   any state before "completed" → discarded
 *
 * The uploaded files live in `<data>/staging/<import id>/`: `upload/` as they arrived,
 * `tree/` unpacked, and `ledger.jsonl`, the record of what a commit has created so
 * far. The folder goes as soon as the import completes or is discarded. Analysis only
 * ever reads the notes; the commit job is the single place that writes to them.
 */
import fs from "node:fs";
import path from "node:path";
import type { ImportAnalysis, ImportDto, ImportJobInfo, ImportKind, ImportOptions, ImportReport, ImportSummary } from "@outpost/shared";
import { eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf, notFound } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import type { JobRow, JobRun } from "../../core/jobs.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { imports } from "../../db/schema.ts";
import { type ImportHooks, openLedger, runCommit } from "./commit.ts";
import { DEFAULT_EXTRACT_LIMITS, type ExtractLimits, extractWithNested, newBudget } from "./extract.ts";
import { isZip, naturalCompare, stemOf } from "./names.ts";
import { buildPlan, type DuplicateLookup, type TreeFile, type UploadRoot } from "./plan.ts";

export type ImportRow = typeof imports.$inferSelect;

export const ANALYSE_JOB = "import.analyse";
export const COMMIT_JOB = "import.commit";
const QUEUE = "import";

/** Imports that never completed keep their uploaded files this long. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_JOB_STATES = new Set(["queued", "running", "paused"]);
const STOPPED_MESSAGE =
  "The import was stopped before it finished. What it had brought in is still there; try again to bring in the rest. Nothing is imported twice.";
const INTERRUPTED_MESSAGE = "Outpost stopped while this import was running. Try again to finish it. Nothing is imported twice.";

interface JobPayload extends Record<string, unknown> {
  importId: string;
}

export interface ReceivedUpload {
  id: string;
  /** Names of the files now in the import's `upload/` folder. */
  names: string[];
  sizeBytes: number;
}

export interface ImportsService {
  /** Where a new import's uploaded files are to be written. Creates the folder. */
  prepareUpload(id: string): Promise<string>;
  /** Records an upload that is fully on disk and starts analysing it. */
  createFromUpload(upload: ReceivedUpload): ImportDto;
  /** Removes the files of an upload that was refused before it became an import. */
  abandonUpload(id: string): Promise<void>;
  get(id: string): ImportDto;
  list(limit?: number): ImportSummary[];
  commit(id: string, options: ImportOptions): ImportDto;
  /** Stops the analysis or the commit that is running. */
  cancel(id: string): ImportDto;
  discard(id: string): Promise<ImportDto>;
  stagingDir(id: string): string;
  /** Caps on what an archive may hold. Tests lower them. */
  limits: ExtractLimits;
  /** A seam for tests; see `ImportHooks`. */
  hooks: ImportHooks;
}

declare module "../../core/context.ts" {
  interface Services {
    imports: ImportsService;
  }
}

const subjectOf = (id: string) => `import:${id}`;

function kindOf(analysis: ImportAnalysis): ImportKind {
  const { pages, databases, documents } = analysis.totals;
  return pages + databases === 0 && documents > 0 ? "pdf" : analysis.source;
}

/** Whether a commit has put anything into the notes or the library. */
function hasImported(report: ImportReport | null): boolean {
  return report !== null && report.created.length + report.updated.length + report.documents.length > 0;
}

function failureSummary(report: ImportReport): string {
  const count = report.failed.length;
  return `${count === 1 ? "1 item" : `${count.toLocaleString("en")} items`} could not be imported. Everything else is in place. Try again, or finish without ${count === 1 ? "it" : "them"}.`;
}

/** Every regular file under `root`, as paths relative to it with `/` separators. Links are never followed. */
async function listTree(root: string): Promise<TreeFile[]> {
  const files: TreeFile[] = [];
  const visit = async (dir: string, relative: string): Promise<void> => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const entryPath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), entryPath);
      else if (entry.isFile()) files.push({ path: entryPath, sizeBytes: (await fs.promises.stat(path.join(dir, entry.name))).size });
    }
  };
  await visit(root, "");
  return files.sort((a, b) => naturalCompare(a.path, b.path));
}

export async function createImportsService(ctx: AppContext): Promise<ImportsService> {
  const { db, sqlite } = ctx;
  const { notes, documents } = ctx.services;
  const stagingRoot = path.join(ctx.config.dataDir, "staging");
  const limits: ExtractLimits = { ...DEFAULT_EXTRACT_LIMITS, maxFileBytes: ctx.config.maxUploadBytes };
  const hooks: ImportHooks = {};

  const stagingDir = (id: string) => resolveInside(stagingRoot, id);
  const uploadDir = (id: string) => path.join(stagingDir(id), "upload");
  const treeDir = (id: string) => path.join(stagingDir(id), "tree");
  const removeStaging = (id: string) => fs.promises.rm(stagingDir(id), { recursive: true, force: true });

  // ── Reading the notes (never writing) ──
  // Pages in the trash are not duplicates: someone who threw an import away and imports
  // it again expects to get the pages back.
  const LIVE = `trashed_at IS NULL AND is_template = 0`;
  const byKeyStatement = sqlite.prepare(
    `SELECT id AS noteId, title FROM notes WHERE import_key = ? AND ${LIVE} ORDER BY created_at, id LIMIT 1`,
  );
  const byContentStatement = sqlite.prepare(
    `SELECT id AS noteId, title FROM notes WHERE title = ? AND content_hash = ? AND ${LIVE} ORDER BY created_at, id LIMIT 1`,
  );
  const liveStatement = sqlite.prepare(`SELECT id AS noteId, title FROM notes WHERE id = ? AND ${LIVE}`);
  type Found = { noteId: string; title: string } | undefined;
  const lookup: DuplicateLookup & { live(noteId: string): Found } = {
    byImportKey: (key) => byKeyStatement.get(key) as Found,
    byContent: (title, hash) => byContentStatement.get(title, hash) as Found,
    live: (noteId) => liveStatement.get(noteId) as Found,
  };

  // ── Rows ──
  const find = (id: string): ImportRow | undefined => db.select().from(imports).where(eq(imports.id, id)).get();

  function mustFind(id: string): ImportRow {
    const row = find(id);
    if (!row) throw notFound("Import");
    return row;
  }

  /** Every change of state goes through here, so the browser always hears about it. */
  function patch(id: string, values: Partial<typeof imports.$inferInsert>): void {
    db.update(imports).set(values).where(eq(imports.id, id)).run();
    ctx.events.publish({ type: "imports.changed", id });
  }

  const activeJob = (id: string): JobRow | undefined =>
    ctx.jobs.findBySubject(subjectOf(id)).findLast((job) => ACTIVE_JOB_STATES.has(job.state));

  function jobInfo(row: ImportRow): ImportJobInfo | null {
    if (!["uploaded", "analysing", "importing"].includes(row.state)) return null;
    const job = ctx.jobs.findBySubject(subjectOf(row.id)).at(-1);
    if (!job) return null;
    return {
      id: job.id,
      state: job.state,
      progress: { current: job.progressCurrent, total: job.progressTotal, message: job.progressMessage },
    };
  }

  function toSummary(row: ImportRow): ImportSummary {
    const report = row.report as ImportReport | null;
    return {
      id: row.id,
      kind: row.kind,
      state: row.state,
      originalName: row.originalName,
      sizeBytes: row.sizeBytes,
      error: row.error,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      counts: report
        ? {
            created: report.created.length,
            updated: report.updated.length,
            skipped: report.skipped.length,
            failed: report.failed.length,
            documents: report.documents.length,
          }
        : null,
    };
  }

  // The list shows counts, not the plan or the report themselves, which for a large
  // export run to megabytes each: SQLite counts them without handing them over.
  const listStatement = sqlite.prepare(
    `SELECT id, kind, state, original_name AS originalName, size_bytes AS sizeBytes, error,
            created_at AS createdAt, completed_at AS completedAt,
            report IS NOT NULL AS hasReport,
            json_array_length(report, '$.created') AS created, json_array_length(report, '$.updated') AS updated,
            json_array_length(report, '$.skipped') AS skipped, json_array_length(report, '$.failed') AS failed,
            json_array_length(report, '$.documents') AS documents
     FROM imports ORDER BY created_at DESC, id DESC LIMIT ?`,
  );
  type ListRow = Omit<ImportSummary, "counts"> & { hasReport: number } & Record<
      "created" | "updated" | "skipped" | "failed" | "documents",
      number | null
    >;

  function toDto(row: ImportRow): ImportDto {
    const { counts: _counts, ...summary } = toSummary(row);
    return {
      ...summary,
      analysis: row.analysis as ImportAnalysis | null,
      options: row.options as ImportOptions | null,
      report: row.report as ImportReport | null,
      job: jobInfo(row),
      canRetry: row.state === "failed" && row.analysis !== null && fs.existsSync(treeDir(row.id)),
    };
  }

  /**
   * Ends an import that will not go further: its staged files go, and the row says
   * what became of it. An import that had already brought pages in is "completed" with
   * its report, because those pages are real; anything else is "discarded".
   */
  async function close(id: string): Promise<void> {
    await removeStaging(id);
    const row = find(id);
    if (!row || row.state === "completed" || row.state === "discarded") return;
    if (hasImported(row.report as ImportReport | null)) patch(id, { state: "completed", completedAt: Date.now(), error: null });
    else patch(id, { state: "discarded" });
  }

  // ── Analysis ──

  /** Puts the uploaded files into `tree/`: archives unpacked, other files as they are. */
  async function unpack(
    id: string,
    run: JobRun<JobPayload>,
  ): Promise<{ roots: UploadRoot[]; leftOut: Array<{ path: string; reason: string }>; ignored: number }> {
    const tree = treeDir(id);
    // A restart begins again from the uploaded files, so a half-unpacked tree is never read.
    await fs.promises.rm(tree, { recursive: true, force: true });
    await fs.promises.mkdir(tree, { recursive: true });
    const uploads = (await fs.promises.readdir(uploadDir(id)).catch(() => [] as string[])).sort(naturalCompare);
    if (uploads.length === 0) throw badRequest("The uploaded files are no longer on the server. Upload them again.");

    // One archive on its own is the import; alongside other files it gets a folder of its own.
    const alone = uploads.length === 1;
    const budget = await newBudget(tree, limits);
    const roots: UploadRoot[] = [];
    const leftOut: Array<{ path: string; reason: string }> = [];
    let ignored = 0;

    for (const name of uploads) {
      run.signal.throwIfAborted();
      const source = path.join(uploadDir(id), name);
      if (!isZip(name)) {
        // A hard link costs no space; across filesystems it is not possible and the file is copied.
        await fs.promises.link(source, path.join(tree, name)).catch(() => fs.promises.copyFile(source, path.join(tree, name)));
        roots.push({ name, prefix: name });
        continue;
      }
      const prefix = alone ? "" : `${stemOf(name)}/`;
      const dest = alone ? tree : resolveInside(tree, stemOf(name));
      await fs.promises.mkdir(dest, { recursive: true });
      const result = await extractWithNested(source, dest, {
        limits,
        budget,
        label: name,
        signal: run.signal,
        onProgress: (current, total) => run.progress({ current, total, message: `Unpacking ${name}`, unit: "files" }),
      });
      leftOut.push(...result.leftOut.map((entry) => ({ ...entry, path: `${prefix}${entry.path}` })));
      ignored += result.ignored;
      roots.push({ name, prefix });
    }
    return { roots, leftOut, ignored };
  }

  async function analyse(run: JobRun<JobPayload>): Promise<Record<string, unknown> | undefined> {
    const id = run.payload.importId;
    const row = find(id);
    if (!row || (row.state !== "uploaded" && row.state !== "analysing")) return undefined;
    patch(id, { state: "analysing", error: null });

    try {
      const unpacked = await unpack(id, run);
      const files = await listTree(treeDir(id));
      const analysis = await buildPlan(
        { treeDir: treeDir(id), files, ...unpacked },
        {
          lookup,
          signal: run.signal,
          onProgress: (current, total) => run.progress({ current, total, message: "Reading the pages", unit: "pages" }),
        },
      );
      // Discarded while it was being read: `discard` has already cleaned up.
      if (find(id)?.state !== "analysing") return undefined;
      patch(id, { state: "ready", analysis: analysis as unknown as Record<string, unknown>, kind: kindOf(analysis) });
      return { items: analysis.items.length };
    } catch (error) {
      // Stopped rather than failed: `onSettled` decides what becomes of the import.
      if (run.signal.aborted) throw error;
      // A refused or unreadable upload leaves nothing behind.
      await removeStaging(id);
      const message = error instanceof AppError ? error.message : "The upload could not be read. The server log has the details.";
      if (!(error instanceof AppError)) run.log.error({ err: error }, "import analysis failed");
      if (find(id)?.state === "analysing") patch(id, { state: "failed", error: message });
      throw new PermanentJobError(message, "import");
    }
  }

  // ── Commit ──

  async function commitJob(run: JobRun<JobPayload>): Promise<Record<string, unknown> | undefined> {
    const id = run.payload.importId;
    const row = find(id);
    if (row?.state !== "importing" || !row.analysis || !row.options) return undefined;
    if (!fs.existsSync(treeDir(id))) {
      throw new PermanentJobError("The files of this import are no longer on the server. Upload them again to import them.", "import");
    }

    const report = await runCommit(row.analysis as unknown as ImportAnalysis, row.options as unknown as ImportOptions, {
      notes,
      documents,
      lookup,
      treeDir: treeDir(id),
      ledger: openLedger(path.join(stagingDir(id), "ledger.jsonl")),
      signal: run.signal,
      progress: run.progress,
      hooks,
      log: run.log,
    });
    const stored = report as unknown as Record<string, unknown>;

    if (report.stopped) {
      // Kept without a change of state: a shutdown resumes the job, a cancel is settled below.
      db.update(imports).set({ report: stored }).where(eq(imports.id, id)).run();
      run.signal.throwIfAborted();
    }
    if (report.failed.length > 0) {
      patch(id, { state: "failed", report: stored, error: failureSummary(report) });
    } else {
      await removeStaging(id);
      patch(id, { state: "completed", report: stored, error: null, completedAt: Date.now() });
    }
    return { created: report.created.length, updated: report.updated.length, failed: report.failed.length };
  }

  /** A job that ended without its handler finishing the import's state: stopped by a person, or failed outright. */
  async function settle(job: JobRow): Promise<void> {
    const id = (job.payload as JobPayload).importId;
    const row = find(id);
    if (!row || job.state === "succeeded") return;
    if (job.type === ANALYSE_JOB && (row.state === "uploaded" || row.state === "analysing")) {
      if (job.state === "cancelled") await close(id);
      else patch(id, { state: "failed", error: job.error ?? "The upload could not be read." });
    } else if (job.type === COMMIT_JOB && row.state === "importing") {
      patch(id, { state: "failed", error: job.state === "cancelled" ? STOPPED_MESSAGE : (job.error ?? INTERRUPTED_MESSAGE) });
    }
  }

  ctx.jobs.register<JobPayload>(ANALYSE_JOB, { queue: QUEUE, run: analyse, onSettled: settle });
  ctx.jobs.register<JobPayload>(COMMIT_JOB, { queue: QUEUE, run: commitJob, onSettled: settle });

  // ── Start-up: pick up what a stop interrupted, and clear out what was abandoned ──

  function recover(): void {
    const unfinished = db
      .select()
      .from(imports)
      .where(inArray(imports.state, ["uploaded", "analysing", "importing"]))
      .all();
    for (const row of unfinished) {
      if (activeJob(row.id)) continue; // its job is still in the queue and resumes by itself
      if (row.state === "importing") patch(row.id, { state: "failed", error: INTERRUPTED_MESSAGE });
      else if (fs.existsSync(uploadDir(row.id))) enqueueAnalysis(row.id, row.originalName);
      else patch(row.id, { state: "failed", error: "The uploaded files are no longer on the server. Upload them again." });
    }
  }

  async function sweep(): Promise<void> {
    const cutoff = Date.now() - STALE_AFTER_MS;
    const open = db
      .select()
      .from(imports)
      .where(inArray(imports.state, ["uploaded", "analysing", "ready", "failed"]))
      .all();
    for (const row of open) {
      if (row.createdAt < cutoff && !activeJob(row.id)) await close(row.id);
    }
    // Folders with no import behind them: an upload cut off before it was recorded, or
    // one whose import has ended. Only folders this module made are touched.
    const kept = new Set(
      db
        .select({ id: imports.id, state: imports.state })
        .from(imports)
        .all()
        .filter((row) => row.state !== "completed" && row.state !== "discarded")
        .map((row) => row.id),
    );
    for (const entry of await fs.promises.readdir(stagingRoot, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || kept.has(entry.name)) continue;
      const dir = path.join(stagingRoot, entry.name);
      if (fs.existsSync(path.join(dir, "upload"))) await fs.promises.rm(dir, { recursive: true, force: true });
    }
  }

  function enqueueAnalysis(id: string, name: string): void {
    ctx.jobs.enqueue<JobPayload>(ANALYSE_JOB, { importId: id }, { title: `Reading "${name}" for import`, subject: subjectOf(id) });
  }

  recover();
  // Awaited, so that it is over before the server takes its first upload.
  await sweep().catch((error) => ctx.log.warn({ err: error }, "could not clear old import files"));

  // ── The service ──

  const service: ImportsService = {
    limits,
    hooks,
    stagingDir,

    async prepareUpload(id) {
      await fs.promises.mkdir(uploadDir(id), { recursive: true });
      return uploadDir(id);
    },

    abandonUpload: removeStaging,

    createFromUpload({ id, names, sizeBytes }) {
      const first = names[0] ?? "upload";
      const originalName = names.length > 1 ? `${first} and ${names.length - 1} more` : first;
      // The real kind is known once the files have been read; this is the best guess from the names.
      const kind: ImportKind =
        names.length === 1 && /\.pdf$/i.test(first) ? "pdf" : names.every((name) => /\.(md|markdown)$/i.test(name)) ? "markdown" : "mixed";
      db.insert(imports).values({ id, kind, state: "uploaded", originalName, sizeBytes, createdAt: Date.now() }).run();
      ctx.events.publish({ type: "imports.changed", id });
      enqueueAnalysis(id, originalName);
      return toDto(mustFind(id));
    },

    get: (id) => toDto(mustFind(id)),

    list(limit = 30) {
      return (listStatement.all(limit) as ListRow[]).map(({ hasReport, created, updated, skipped, failed, documents, ...row }) => ({
        ...row,
        counts: hasReport
          ? { created: created ?? 0, updated: updated ?? 0, skipped: skipped ?? 0, failed: failed ?? 0, documents: documents ?? 0 }
          : null,
      }));
    },

    commit(id, options) {
      const row = mustFind(id);
      const analysis = row.analysis as ImportAnalysis | null;
      if (row.state === "importing") throw conflict("This import is already running.");
      if (row.state === "completed") throw conflict("This import has already finished. Upload the files again to import them once more.");
      if (row.state === "discarded") throw conflict("This import was discarded. Upload the files again.");
      if (row.state === "failed" && !analysis)
        throw conflict("This upload could not be read, so there is nothing to import. Upload the files again.");
      if ((row.state !== "ready" && row.state !== "failed") || !analysis) {
        throw conflict("This import is not ready yet. Wait until Outpost has finished reading the files.");
      }
      if (!fs.existsSync(treeDir(id)))
        throw conflict("The files of this import are no longer on the server. Upload them again to import them.");
      if (analysis.problems.length > 0) throw badRequest(analysis.problems[0]!);
      if (options.duplicates === "replace" && options.replaceConfirmed !== true) {
        throw badRequest(
          "Replacing overwrites pages that are already in your notes. Confirm that this is what you want, then import again.",
        );
      }
      if (options.parentId && !lookup.live(options.parentId)) {
        throw badRequest("The page chosen to hold the import no longer exists or is in the trash. Choose another place.");
      }
      const stored: ImportOptions = {
        parentId: options.parentId ?? null,
        duplicates: options.duplicates,
        pdfs: options.pdfs,
        replaceConfirmed: options.replaceConfirmed === true,
      };
      patch(id, { state: "importing", options: stored as unknown as Record<string, unknown>, error: null });
      ctx.jobs.enqueue<JobPayload>(COMMIT_JOB, { importId: id }, { title: `Importing "${row.originalName}"`, subject: subjectOf(id) });
      return toDto(mustFind(id));
    },

    cancel(id) {
      const row = mustFind(id);
      const job = activeJob(id);
      if (!job)
        throw conflict(
          `This import is not running, so there is nothing to stop. ${row.state === "failed" ? "It can be tried again or discarded." : ""}`.trim(),
        );
      ctx.jobs.cancel(job.id);
      return toDto(mustFind(id));
    },

    async discard(id) {
      const row = mustFind(id);
      if (row.state === "discarded") return toDto(row);
      if (row.state === "completed") throw conflict("This import has finished and its report is kept. There is nothing left to discard.");
      if (row.state === "importing") throw conflict("This import is running. Stop it first, then discard it.");
      const job = activeJob(id);
      if (job) {
        try {
          ctx.jobs.cancel(job.id);
        } catch (error) {
          ctx.log.debug({ err: messageOf(error) }, "import job had already ended");
        }
      }
      await close(id);
      return toDto(mustFind(id));
    },
  };

  return service;
}
