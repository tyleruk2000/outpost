/**
 * Bringing in a Calibre library, in the same steps as importing notes:
 *
 *   reading → ready → importing → completed
 *      │                 └──────→ failed (can be tried again; nothing is added twice)
 *      └→ failed (no books found, or the folder could not be read)
 *   reading or ready → discarded
 *
 * Reading says how many books there are and how much space they take before anything
 * is added. Importing adds one document per book, either a copy kept in the library or
 * the file recorded where it is in the Calibre folder. The Calibre folder is only ever
 * read: nothing in it is written, moved or deleted by this module. A cover is copied
 * into Outpost's data directory (`covers/`), never written into the book.
 */
import fs from "node:fs";
import path from "node:path";
import {
  type BookDetailsDto,
  CALIBRE_LISTED_BOOKS,
  CALIBRE_MAX_BOOKS,
  type CalibreImportDto,
  type CalibreJobInfo,
  type CalibreOptions,
  type CalibrePlan,
  type CalibreReport,
} from "@outpost/shared";
import { desc, eq, isNotNull } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf, notFound } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { newId } from "../../core/ids.ts";
import { type JobRow, type JobRun, PermanentJobError } from "../../core/jobs.ts";
import { bookDetails, calibreImports, documents as documentsTable } from "../../db/schema.ts";
import { readOpf } from "./opf.ts";
import { MAX_COVER_BYTES, MAX_OPF_BYTES, ordinaryFile, readOrdinaryFile, type ScannedBook, scanLibrary } from "./scan.ts";

export type CalibreImportRow = typeof calibreImports.$inferSelect;

export const READ_JOB = "calibre.read";
export const IMPORT_JOB = "calibre.import";
export const SERIES_JOB = "calibre.series";
/** In `library_meta` once the series of books brought in earlier are in search. */
const SERIES_KEY = "calibre.seriesInSearch";
const QUEUE = "import";
const ACTIVE = new Set(["queued", "running", "paused"]);
const COVER_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
const COVER_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** The whole plan as stored. What the browser is sent lists only the first books. */
interface StoredPlan extends Omit<CalibrePlan, "books"> {
  books: ScannedBook[];
}

interface JobPayload extends Record<string, unknown> {
  importId: string;
}

export interface CalibreService {
  /** Starts reading the library in a folder of a storage location. */
  start(input: { locationId: string; relPath: string }): Promise<CalibreImportDto>;
  get(id: string): CalibreImportDto;
  list(limit?: number): CalibreImportDto[];
  commit(id: string, options: CalibreOptions): Promise<CalibreImportDto>;
  cancel(id: string): CalibreImportDto;
  discard(id: string): CalibreImportDto;
  details(documentId: string): BookDetailsDto | null;
  /** The kept cover of a document, or undefined. */
  cover(documentId: string): { path: string; mime: string } | undefined;
  /**
   * Puts the series of books brought in before series were searchable into search, as a job,
   * once for each library (`library_meta` remembers it). Null when there is nothing to do.
   */
  indexSeriesIfNeeded(): JobRow | null;
}

declare module "../../core/context.ts" {
  interface Services {
    calibre: CalibreService;
  }
}

const subjectOf = (id: string) => `calibre:${id}`;

/** Tags as the library's tag list takes them: no commas, not too long, not too many. */
function tagsFor(book: ScannedBook): string[] {
  return book.tags
    .filter((tag) => !tag.includes(","))
    .map((tag) => tag.slice(0, 50).trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** "Dune" with its place in a series, for the report. */
const describe = (book: ScannedBook) => (book.authors.length ? `${book.title} (${book.authors.join(" & ")})` : book.title);

export function createCalibreService(ctx: AppContext): CalibreService {
  const { db } = ctx;
  const { storage, documents } = ctx.services;
  const coversDir = path.join(ctx.config.dataDir, "covers");

  const find = (id: string) => db.select().from(calibreImports).where(eq(calibreImports.id, id)).get();
  function mustFind(id: string): CalibreImportRow {
    const row = find(id);
    if (!row) throw notFound("Calibre import");
    return row;
  }
  function patch(id: string, values: Partial<typeof calibreImports.$inferInsert>): void {
    db.update(calibreImports).set(values).where(eq(calibreImports.id, id)).run();
    ctx.events.publish({ type: "calibre.changed", id });
  }
  const activeJob = (id: string): JobRow | undefined => ctx.jobs.findBySubject(subjectOf(id)).findLast((job) => ACTIVE.has(job.state));

  function jobInfo(row: CalibreImportRow): CalibreJobInfo | null {
    if (row.state !== "reading" && row.state !== "importing") return null;
    const job = ctx.jobs.findBySubject(subjectOf(row.id)).at(-1);
    if (!job) return null;
    return {
      id: job.id,
      state: job.state,
      progress: { current: job.progressCurrent, total: job.progressTotal, message: job.progressMessage },
    };
  }

  function toDto(row: CalibreImportRow): CalibreImportDto {
    const stored = row.plan as StoredPlan | null;
    let locationName: string | null = null;
    try {
      locationName = storage.get(row.locationId).name;
    } catch {
      // The location has been forgotten since.
    }
    return {
      id: row.id,
      state: row.state,
      locationId: row.locationId,
      locationName,
      relPath: row.relPath,
      plan: stored
        ? {
            ...stored,
            books: stored.books.slice(0, CALIBRE_LISTED_BOOKS).map(({ language: _l, uuid: _u, ...book }) => book),
          }
        : null,
      options: row.options as CalibreOptions | null,
      report: row.report as CalibreReport | null,
      error: row.error,
      job: jobInfo(row),
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }

  // ── Reading ──

  async function read(run: JobRun<JobPayload>): Promise<Record<string, unknown> | undefined> {
    const id = run.payload.importId;
    const row = find(id);
    if (row?.state !== "reading") return undefined;
    try {
      const root = await storage.resolveFollowingLinks(row.locationId, row.relPath);
      const scanned = await scanLibrary(root, {
        maxBooks: CALIBRE_MAX_BOOKS,
        maxFileBytes: ctx.config.maxUploadBytes,
        signal: run.signal,
        onProgress: (found) =>
          run.progress({ current: found, total: null, message: `Found ${found.toLocaleString("en")} books`, unit: "books" }),
      });
      if (scanned.books.length === 0) {
        throw new AppError(
          "not_found",
          scanned.leftOut.length > 0
            ? `None of the ${scanned.leftOut.length.toLocaleString("en")} books in this folder can be brought in. The plan says why for each.`
            : "No Calibre books were found in this folder. Choose the folder that holds metadata.db, or a folder of one author.",
        );
      }
      const plan: StoredPlan = {
        bookCount: scanned.books.length,
        totalBytes: scanned.books.reduce((sum, book) => sum + book.file.sizeBytes + (book.cover?.sizeBytes ?? 0), 0),
        coverCount: scanned.books.filter((book) => book.cover).length,
        hasCalibreDatabase: scanned.hasCalibreDatabase,
        books: scanned.books,
        leftOut: scanned.leftOut,
        beyondLimit: scanned.beyondLimit,
      };
      if (find(id)?.state !== "reading") return undefined;
      patch(id, { state: "ready", plan: plan as unknown as Record<string, unknown>, error: null });
      return { books: plan.bookCount };
    } catch (error) {
      if (run.signal.aborted) throw error;
      const message = error instanceof AppError ? error.message : "The folder could not be read. The server log has the details.";
      if (!(error instanceof AppError)) run.log.error({ err: error }, "calibre library could not be read");
      if (find(id)?.state === "reading") patch(id, { state: "failed", error: message });
      throw new PermanentJobError(message, "calibre");
    }
  }

  // ── Importing ──

  // The library is read again here, perhaps long after the plan: every file is read as `readOrdinaryFile`
  // and `ordinaryFile` say (scan.ts), so a link put in place of a book, a cover or a folder since is not followed.
  async function keepCover(documentId: string, root: string, book: ScannedBook): Promise<string | null> {
    if (!book.cover) return null;
    const ext = path.extname(book.cover.name).slice(1).toLowerCase();
    if (!COVER_EXTS.includes(ext)) return null;
    await fs.promises.mkdir(coversDir, { recursive: true });
    const target = path.join(coversDir, `${documentId}.${ext}`);
    try {
      await fs.promises.writeFile(`${target}.part`, await readOrdinaryFile(root, path.join(book.folder, book.cover.name), MAX_COVER_BYTES));
      await fs.promises.rename(`${target}.part`, target);
      return ext;
    } catch {
      await fs.promises.rm(`${target}.part`, { force: true }).catch(() => undefined);
      return null;
    }
  }

  async function recordDetails(documentId: string, root: string, book: ScannedBook): Promise<void> {
    if (db.select({ id: bookDetails.documentId }).from(bookDetails).where(eq(bookDetails.documentId, documentId)).get()) return;
    const coverExt = await keepCover(documentId, root, book);
    // Deleted in the meantime: nothing to describe.
    if (!db.select({ id: documentsTable.id }).from(documentsTable).where(eq(documentsTable.id, documentId)).get()) return;
    db.insert(bookDetails)
      .values({
        documentId,
        authors: book.authors,
        series: book.series,
        seriesIndex: book.seriesIndex,
        coverExt,
        calibreUuid: book.uuid,
        createdAt: Date.now(),
      })
      .run();
    // Search finds a book by its series as well as its title.
    if (book.series) await ctx.services.documents.refreshSearch(documentId);
  }

  async function description(root: string, book: ScannedBook): Promise<string | null> {
    try {
      return readOpf((await readOrdinaryFile(root, path.join(book.folder, "metadata.opf"), MAX_OPF_BYTES)).toString("utf8")).description;
    } catch {
      return null;
    }
  }

  async function importJob(run: JobRun<JobPayload>): Promise<Record<string, unknown> | undefined> {
    const id = run.payload.importId;
    const row = find(id);
    if (row?.state !== "importing" || !row.plan || !row.options) return undefined;
    const plan = row.plan as unknown as StoredPlan;
    const options = row.options as unknown as CalibreOptions;
    const report: CalibreReport = { added: 0, alreadyThere: 0, failed: [], stopped: false };
    const root = await storage.resolveFollowingLinks(row.locationId, row.relPath).catch((error: unknown) => {
      throw new PermanentJobError(messageOf(error), "calibre");
    });
    const total = plan.books.length;

    for (const [index, book] of plan.books.entries()) {
      if (run.signal.aborted) {
        report.stopped = true;
        break;
      }
      run.progress({ current: index, total, message: `Adding ${book.title}`, unit: "books" });
      try {
        const file = await ordinaryFile(root, path.join(book.folder, book.file.name));
        const outcome = await documents.ingestFile({
          sourcePath: file.path,
          originalName: book.file.name,
          title: book.title,
          tags: tagsFor(book),
          source: "Calibre library",
          locationId: options.mode === "in-place" ? row.locationId : options.locationId,
          inPlace: options.mode === "in-place",
        });
        if (outcome.status === "duplicate") {
          // Already in the library: what is there stays as it is; only missing details are added.
          report.alreadyThere += 1;
          await recordDetails(outcome.document.id, root, book);
          continue;
        }
        await documents.update(outcome.document.id, {
          author: book.authors.length ? book.authors.join(" & ").slice(0, 300) : null,
          description: await description(root, book),
          language: book.language,
        });
        await recordDetails(outcome.document.id, root, book);
        report.added += 1;
      } catch (error) {
        if (run.signal.aborted) {
          report.stopped = true;
          break;
        }
        report.failed.push({ title: describe(book), reason: messageOf(error) });
      }
    }
    run.progress({ current: total, total, message: null, unit: "books" });

    const stored = report as unknown as Record<string, unknown>;
    if (report.stopped) {
      db.update(calibreImports).set({ report: stored }).where(eq(calibreImports.id, id)).run();
      run.signal.throwIfAborted();
    }
    if (report.failed.length > 0) {
      const count = report.failed.length;
      patch(id, {
        state: "failed",
        report: stored,
        error: `${count === 1 ? "1 book" : `${count.toLocaleString("en")} books`} could not be added. Everything else is in the library. Try again, or leave ${count === 1 ? "it" : "them"} out.`,
      });
    } else {
      patch(id, { state: "completed", report: stored, error: null, completedAt: Date.now() });
    }
    return { added: report.added, alreadyThere: report.alreadyThere, failed: report.failed.length };
  }

  function settle(job: JobRow): void {
    const id = (job.payload as JobPayload).importId;
    const row = find(id);
    if (!row || job.state === "succeeded") return;
    if (job.type === READ_JOB && row.state === "reading") {
      if (job.state === "cancelled") patch(id, { state: "discarded" });
      else patch(id, { state: "failed", error: job.error ?? "The folder could not be read." });
    } else if (job.type === IMPORT_JOB && row.state === "importing") {
      patch(id, {
        state: "failed",
        error:
          job.state === "cancelled"
            ? "The import was stopped before it finished. The books it had added are in the library; try again to add the rest. Nothing is added twice."
            : (job.error ?? "Outpost stopped while this import was running. Try again to finish it. Nothing is added twice."),
      });
    }
  }

  ctx.jobs.register<JobPayload>(READ_JOB, { queue: QUEUE, run: read, onSettled: settle });
  ctx.jobs.register<JobPayload>(IMPORT_JOB, { queue: QUEUE, run: importJob, onSettled: settle });

  // Each book with a series has its search entry written again from its stored text. Measured in the test suite's
  // set-up (1,000 books of 12 kB of text on a shared four-core machine) at 30 ms a book: about ten minutes for
  // 20,000 books in series, in the background as a job that can be paused, and only once.
  const seriesDone = () => Boolean(ctx.sqlite.prepare("SELECT 1 FROM library_meta WHERE key = ?").get(SERIES_KEY));
  const markSeriesDone = () =>
    ctx.sqlite.prepare("INSERT INTO library_meta (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run(SERIES_KEY);
  ctx.jobs.register<Record<string, never>>(SERIES_JOB, {
    queue: QUEUE,
    async run(run) {
      const ids = db
        .select({ id: bookDetails.documentId })
        .from(bookDetails)
        .where(isNotNull(bookDetails.series))
        .all()
        .map((row) => row.id);
      for (const [index, id] of ids.entries()) {
        run.signal.throwIfAborted();
        if (index % 50 === 0) run.progress({ current: index, total: ids.length, message: null, unit: "books" });
        await documents.refreshSearch(id);
      }
      markSeriesDone();
      return { books: ids.length };
    },
  });
  function indexSeriesIfNeeded(): JobRow | null {
    if (seriesDone()) return null;
    const waiting = ctx.jobs.findBySubject(SERIES_JOB).find((job) => ACTIVE.has(job.state));
    if (waiting) return waiting;
    if (!db.select({ id: bookDetails.documentId }).from(bookDetails).where(isNotNull(bookDetails.series)).limit(1).get()) {
      markSeriesDone();
      return null;
    }
    return ctx.jobs.enqueue(SERIES_JOB, {}, { title: "Making books findable by their series", subject: SERIES_JOB });
  }
  indexSeriesIfNeeded();

  // A stop in the middle: the queue resumes jobs it still holds; anything else is said to have stopped.
  for (const row of db.select().from(calibreImports).all()) {
    if ((row.state === "reading" || row.state === "importing") && !activeJob(row.id)) {
      patch(row.id, { state: "failed", error: "Outpost stopped while this was running. Start it again." });
    }
  }

  // A cover goes with its document.
  const stop = ctx.events.subscribe((event) => {
    if (event.type !== "documents.changed" || !event.id) return;
    const documentId = event.id;
    if (db.select({ id: documentsTable.id }).from(documentsTable).where(eq(documentsTable.id, documentId)).get()) return;
    for (const ext of COVER_EXTS) void fs.promises.rm(path.join(coversDir, `${documentId}.${ext}`), { force: true }).catch(() => undefined);
  });
  ctx.onClose.push(stop);

  return {
    async start({ locationId, relPath }) {
      const location = storage.get(locationId);
      const root = await storage.resolveFollowingLinks(locationId, relPath);
      const stat = await fs.promises.stat(root).catch(() => undefined);
      if (!stat?.isDirectory()) throw badRequest(`"${relPath || location.name}" is not a folder on "${location.name}".`);
      const id = newId();
      db.insert(calibreImports).values({ id, state: "reading", locationId, relPath, createdAt: Date.now() }).run();
      ctx.events.publish({ type: "calibre.changed", id });
      const name = relPath ? path.posix.basename(relPath) : location.name;
      ctx.jobs.enqueue<JobPayload>(
        READ_JOB,
        { importId: id },
        { title: `Reading the Calibre library in "${name}"`, subject: subjectOf(id) },
      );
      return toDto(mustFind(id));
    },

    get: (id) => toDto(mustFind(id)),

    list(limit = 20) {
      return db.select().from(calibreImports).orderBy(desc(calibreImports.createdAt)).limit(limit).all().map(toDto);
    },

    async commit(id, options) {
      const row = mustFind(id);
      if (row.state === "importing") throw conflict("This library is already being brought in.");
      if (row.state === "completed") throw conflict("This import has finished. Read the library again to bring in what has changed.");
      if (row.state === "discarded") throw conflict("This import was discarded. Read the library again.");
      if ((row.state !== "ready" && row.state !== "failed") || !row.plan) {
        throw conflict("The library has not been read yet. Wait until Outpost has finished reading it.");
      }
      const plan = row.plan as unknown as StoredPlan;
      if (options.mode === "copy") {
        const destination = options.locationId ? storage.get(options.locationId) : storage.getDefault();
        await storage.assertSpace(destination.id, plan.totalBytes);
        options = { mode: "copy", locationId: destination.id };
      } else {
        if (!storage.isAvailable(row.locationId))
          throw new AppError("storage_unavailable", "The drive holding this library is not connected.");
        options = { mode: "in-place" };
      }
      patch(id, { state: "importing", options: options as unknown as Record<string, unknown>, error: null });
      ctx.jobs.enqueue<JobPayload>(
        IMPORT_JOB,
        { importId: id },
        { title: `Bringing in ${plan.bookCount.toLocaleString("en")} books from Calibre`, subject: subjectOf(id) },
      );
      return toDto(mustFind(id));
    },

    cancel(id) {
      mustFind(id);
      const job = activeJob(id);
      if (!job) throw conflict("Nothing is running for this import, so there is nothing to stop.");
      ctx.jobs.cancel(job.id);
      return toDto(mustFind(id));
    },

    discard(id) {
      const row = mustFind(id);
      if (row.state === "discarded") return toDto(row);
      if (row.state === "importing") throw conflict("This import is running. Stop it first.");
      if (row.state === "completed") throw conflict("This import has finished. Its report is kept.");
      const job = activeJob(id);
      if (job) {
        try {
          ctx.jobs.cancel(job.id);
        } catch {
          // It had already ended.
        }
      }
      patch(id, { state: "discarded" });
      return toDto(mustFind(id));
    },

    details(documentId) {
      const row = db.select().from(bookDetails).where(eq(bookDetails.documentId, documentId)).get();
      const document = db.select({ relPath: documentsTable.relPath }).from(documentsTable).where(eq(documentsTable.id, documentId)).get();
      if (!row || !document) return null;
      return {
        documentId,
        authors: row.authors,
        series: row.series,
        seriesIndex: row.seriesIndex,
        // A drive or a restore may hold the row without the picture.
        coverUrl:
          row.coverExt && fs.existsSync(path.join(coversDir, `${documentId}.${row.coverExt}`))
            ? `/api/documents/${documentId}/cover`
            : null,
        // A copy is kept in a folder of its own under documents/; anything else was recorded where it lies.
        inCalibreFolder: !document.relPath.startsWith(`documents/${documentId}/`),
      };
    },

    indexSeriesIfNeeded,

    cover(documentId) {
      const row = db.select({ coverExt: bookDetails.coverExt }).from(bookDetails).where(eq(bookDetails.documentId, documentId)).get();
      if (!row?.coverExt) return undefined;
      const file = resolveInside(coversDir, `${documentId}.${row.coverExt}`);
      return fs.existsSync(file) ? { path: file, mime: COVER_MIME[row.coverExt] ?? "application/octet-stream" } : undefined;
    },
  };
}
