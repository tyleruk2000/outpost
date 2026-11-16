/**
 * "Add all": copying many files of one reference collection into the document library.
 *
 * One file is added by a request that waits for it (files.ts). A collection that is a
 * list of documents may hold a hundred of them, so adding them all is a job: it goes on
 * when the page is closed, shows how far it has got, can be stopped, and picks up after
 * a restart.
 *
 * It keeps no record of its own. What it has done is what the library holds: on every
 * run it works out which of the files asked for are documents already and copies the
 * rest, one after another. So running it twice adds nothing twice, and a run that was
 * cut off loses nothing but the file it was in the middle of.
 *
 * Every file added queues the reading of its text. A hundred of those at once would
 * keep everything else a person adds waiting behind them, so a file is copied only
 * when the reading has nearly caught up: at most one document more than are read at a
 * time (Settings, "Documents processed at once") is ever waiting.
 */
import {
  ARCHIVE_ADD_JOB,
  type ArchiveAddPlan,
  type ArchiveAddResult,
  type ArchiveAddScope,
  type ArchiveAddStatus,
  type StartArchiveAddResponse,
} from "@outpost/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { type JobProgress, type JobRow, PermanentJobError, StoppedWithResult, toJobDto } from "../../core/jobs.ts";
import { documents as documentsTable, jobs as jobsTable } from "../../db/schema.ts";
import type { CollectionRow } from "../collections/service.ts";
import { EXTRACT_JOB } from "../documents/service.ts";
import { SPACE_RESERVE_BYTES } from "../storage/service.ts";
import type { DocumentLists, ListedFile } from "./document-lists.ts";
import { type ArchiveFilesService, noRoomMessage, parseArchivePath } from "./files.ts";

/** A queue of its own, one job at a time: two collections are added from in turn, and neither waits behind a move or an import. */
export const ARCHIVE_ADD_QUEUE = "reference-files";
/** The most files that can be named one by one: what one page can link to. A list is asked for whole instead. */
export const MAX_NAMED_FILES = 300;
/** How many failures a result names; the rest are counted. */
const NAMED_FAILURES = 100;
/** How long a job waits for kiwix-serve after a restart before it gives up. */
const READABLE_WAIT_MS = 90_000;

const subjectOf = (collectionId: string) => `reference-files:${collectionId}`;
const ACTIVE = new Set<JobRow["state"]>(["queued", "running", "paused"]);

interface Payload extends Record<string, unknown> {
  collectionId: string;
  scope: ArchiveAddScope;
}

const scopeBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list"), q: z.string().trim().max(200).optional() }).strict(),
  z
    .object({
      kind: z.literal("files"),
      files: z
        .array(z.object({ path: z.string().max(3000), title: z.string().trim().max(300).optional() }).strict())
        .min(1)
        .max(MAX_NAMED_FILES, `Add at most ${MAX_NAMED_FILES} files at a time.`),
    })
    .strict(),
]);

export interface ArchiveAddingOptions {
  files: ArchiveFilesService;
  lists: DocumentLists;
  requireBook(collectionId: string): CollectionRow;
  /** Whether kiwix-serve can be asked for this book now. */
  isReady(row: CollectionRow): Promise<boolean>;
}

export interface ArchiveAdding {
  /** Files the last "add all" for this collection could not add, each with the reason. */
  problems(row: CollectionRow): Map<string, string>;
  /** Stops an "add all" for a collection that is being removed. Documents already added stay. */
  cancel(collectionId: string): void;
}

/** Resolves after `ms`, or as soon as the signal fires. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });

export function registerArchiveAdding(app: FastifyInstance, ctx: AppContext, options: ArchiveAddingOptions): ArchiveAdding {
  const { files, lists } = options;
  const { collections, settings } = ctx.services;
  ctx.jobs.setConcurrency(ARCHIVE_ADD_QUEUE, 1);

  /** The files a scope names that the library can keep, in order, each once. */
  async function resolve(row: CollectionRow, scope: ArchiveAddScope): Promise<ListedFile[] | undefined> {
    if (scope.kind === "list") return lists.keepable(row, scope.q ?? "");
    const wanted: ListedFile[] = [];
    const seen = new Set<string>();
    for (const item of scope.files) {
      const file = parseArchivePath(item.path);
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      wanted.push({ path: file.path, title: item.title || undefined, label: item.title || file.name });
    }
    return wanted;
  }

  const unreadable = () =>
    new AppError(
      "upstream",
      "This collection cannot be read right now, so nothing can be added from it. Try again when it opens in the reader.",
    );

  async function plan(row: CollectionRow, scope: ArchiveAddScope): Promise<{ plan: ArchiveAddPlan; todo: ListedFile[] }> {
    const wanted = (await options.isReady(row)) ? await resolve(row, scope) : undefined;
    if (!wanted) throw unreadable();
    const saved = files.savedDocuments(
      row,
      wanted.map((file) => file.path),
    );
    const todo = wanted.filter((file) => !saved.has(file.path));
    const sizes = await files.sizes(
      row,
      todo.map((file) => file.path),
    );
    let bytes = 0;
    for (const size of sizes.values()) bytes += size;

    let location: ArchiveAddPlan["location"] = null;
    let refusal: string | null = null;
    try {
      location = await files.destination();
      if (todo.length > 0 && location.freeBytes !== null && location.freeBytes < bytes + SPACE_RESERVE_BYTES) {
        refusal = noRoomMessage(location.name, todo.length === 1 ? "this file" : `these ${todo.length} files`, bytes, location.freeBytes);
      }
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // The default location is not connected: there is nowhere to copy to.
      refusal = error.message;
    }
    return {
      plan: {
        count: todo.length,
        already: wanted.length - todo.length,
        bytes,
        unsized: todo.length - sizes.size,
        location,
        reserveBytes: SPACE_RESERVE_BYTES,
        refusal,
        ocrAuto: settings.get("ocr.auto"),
      },
      todo,
    };
  }

  const jobsOf = (collectionId: string) => ctx.jobs.findBySubject(subjectOf(collectionId)).filter((job) => job.type === ARCHIVE_ADD_JOB);
  const activeJob = (collectionId: string) => jobsOf(collectionId).find((job) => ACTIVE.has(job.state));

  /** Extractions waiting or running, whoever asked for them. */
  function readingBacklog(): number {
    return (
      ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(jobsTable)
        .where(and(eq(jobsTable.type, EXTRACT_JOB), inArray(jobsTable.state, ["queued", "running"])))
        .get()?.n ?? 0
    );
  }

  /** When each of these documents was added, and how large it is. */
  function factsOf(documentIds: string[]): Map<string, { createdAt: number; sizeBytes: number }> {
    const found = new Map<string, { createdAt: number; sizeBytes: number }>();
    for (let from = 0; from < documentIds.length; from += 500) {
      const rows = ctx.db
        .select({ id: documentsTable.id, createdAt: documentsTable.createdAt, sizeBytes: documentsTable.sizeBytes })
        .from(documentsTable)
        .where(inArray(documentsTable.id, documentIds.slice(from, from + 500)))
        .all();
      for (const row of rows) found.set(row.id, { createdAt: row.createdAt, sizeBytes: row.sizeBytes });
    }
    return found;
  }

  ctx.jobs.register<Payload>(ARCHIVE_ADD_JOB, {
    queue: ARCHIVE_ADD_QUEUE,
    async run({ job, payload, signal, progress, log }) {
      const row = collections.get(payload.collectionId);
      if (row?.kind !== "zim") throw new PermanentJobError("The collection was removed before its documents had been added.", "not_found");
      const { scope } = payload;
      const stoppedBy = (result: ArchiveAddResult) => new StoppedWithResult({ ...result, stopped: "cancelled" });

      // After a restart kiwix-serve needs a moment before it can be asked for anything.
      const until = Date.now() + READABLE_WAIT_MS;
      while (!(await options.isReady(row))) {
        if (signal.aborted) throw new Error("Stopped");
        if (Date.now() > until) throw unreadable();
        progress({ message: "Waiting until the collection can be read" });
        await pause(1000, signal);
      }
      const wanted = await resolve(row, scope);
      if (!wanted) throw unreadable();

      // What this job is for is whatever the library does not hold yet. Documents added
      // since it was started are its own work from before a restart.
      const saved = files.savedDocuments(
        row,
        wanted.map((file) => file.path),
      );
      const facts = factsOf([...saved.values()]);
      const todo = wanted.filter((file) => !saved.has(file.path));
      const result: ArchiveAddResult = {
        scope: scope.kind,
        q: scope.kind === "list" ? (scope.q ?? "") : "",
        wanted: todo.length,
        added: 0,
        addedBytes: 0,
        already: 0,
        failed: [],
        failedMore: 0,
        notReached: todo.length,
        stopped: null,
        stoppedReason: null,
        locationName: "",
      };
      for (const fact of facts.values()) {
        if (fact.createdAt < job.createdAt) continue;
        result.wanted += 1;
        result.added += 1;
        result.addedBytes += fact.sizeBytes;
      }
      const report = (update: JobProgress = {}) =>
        progress({ current: result.wanted - result.notReached, total: result.wanted, ...update });

      files.setWaiting(
        row.id,
        todo.map((file) => file.path),
      );
      try {
        result.locationName = (await files.destination()).name;
        for (const file of todo) {
          if (signal.aborted) throw stoppedBy(result);
          // Not ahead of the reading: see the note at the top of this file.
          const most = settings.get("indexing.concurrency") + 1;
          while (readingBacklog() >= most) {
            report({ message: "Waiting for the text of the documents just added to be read" });
            await pause(250, signal);
            if (signal.aborted) throw stoppedBy(result);
          }
          report({ message: `Adding “${file.label}”` });
          try {
            const outcome = await files.save(row, parseArchivePath(file.path), file.title, { signal });
            if (outcome.status === "created") {
              result.added += 1;
              result.addedBytes += outcome.document.sizeBytes;
            } else {
              result.already += 1;
            }
          } catch (error) {
            if (signal.aborted) throw stoppedBy(result);
            if (!(error instanceof AppError)) log.error({ err: error, file: file.path }, "a file could not be added from an archive");
            const reason = error instanceof AppError ? error.message : "Something went wrong while it was being copied.";
            const code = error instanceof AppError ? error.code : "internal";
            // No room, or nowhere to write: the files after this one would fare no better.
            if (code === "insufficient_space" || code === "storage_unavailable") {
              result.stopped = "space";
              result.stoppedReason = reason;
              break;
            }
            // The archive went away (its drive, or kiwix-serve): likewise.
            if (code === "upstream" && !(await options.isReady(row))) {
              result.stopped = "unreadable";
              result.stoppedReason = "The collection stopped being readable part of the way through.";
              break;
            }
            if (result.failed.length < NAMED_FAILURES) result.failed.push({ path: file.path, title: file.label, reason });
            else result.failedMore += 1;
          }
          result.notReached -= 1;
          files.doneWaiting(row.id, file.path);
        }
      } finally {
        files.setWaiting(row.id, []);
      }
      report({ message: null });
      return { ...result };
    },
    // Also when it was cancelled while it waited for its turn, and so never ran.
    onSettled(job) {
      files.setWaiting((job.payload as Payload).collectionId, []);
    },
  });

  let problemsOf: { jobId: string; byPath: Map<string, string> } | undefined;

  app.post<{ Params: { collectionId: string } }>(
    "/api/kiwix/books/:collectionId/files/add-all/plan",
    async (request): Promise<ArchiveAddPlan> => {
      const row = options.requireBook(request.params.collectionId);
      return (await plan(row, scopeBody.parse(request.body))).plan;
    },
  );

  app.post<{ Params: { collectionId: string } }>(
    "/api/kiwix/books/:collectionId/files/add-all",
    async (request): Promise<StartArchiveAddResponse> => {
      const row = options.requireBook(request.params.collectionId);
      const scope = scopeBody.parse(request.body);
      const running = activeJob(row.id);
      if (running) return { job: toJobDto(running), already: true };

      const { plan: planned, todo } = await plan(row, scope);
      if (planned.refusal) throw new AppError(planned.location ? "insufficient_space" : "storage_unavailable", planned.refusal);
      if (todo.length === 0) throw conflict("Everything here is already in your library, so there is nothing to add.");
      // Someone else may have started one while the sizes were being asked for.
      const meanwhile = activeJob(row.id);
      if (meanwhile) return { job: toJobDto(meanwhile), already: true };

      files.setWaiting(
        row.id,
        todo.map((file) => file.path),
      );
      const job = ctx.jobs.enqueue<Payload>(
        ARCHIVE_ADD_JOB,
        { collectionId: row.id, scope },
        { title: `Adding documents from “${row.title}” to your library`, subject: subjectOf(row.id) },
      );
      return { job: toJobDto(job), already: false };
    },
  );

  app.get<{ Params: { collectionId: string } }>(
    "/api/kiwix/books/:collectionId/files/add-all",
    async (request): Promise<ArchiveAddStatus> => {
      const row = options.requireBook(request.params.collectionId);
      const all = jobsOf(row.id);
      const job = all.find((candidate) => ACTIVE.has(candidate.state)) ?? all.at(-1);
      return { job: job ? toJobDto(job) : null };
    },
  );

  return {
    problems(row) {
      const last = jobsOf(row.id).at(-1);
      // While one is under way, what the one before it could not do is being tried again.
      if (!last || ACTIVE.has(last.state)) return new Map();
      if (problemsOf?.jobId !== last.id) {
        const failed = (last.result as Partial<ArchiveAddResult> | null)?.failed ?? [];
        problemsOf = { jobId: last.id, byPath: new Map(failed.map((item) => [item.path, item.reason])) };
      }
      return problemsOf.byPath;
    },
    cancel(collectionId) {
      for (const job of jobsOf(collectionId)) if (ACTIVE.has(job.state)) ctx.jobs.cancel(job.id);
      files.setWaiting(collectionId, []);
    },
  };
}
