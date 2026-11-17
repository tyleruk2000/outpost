/**
 * The download manager.
 *
 * A download is a row in `downloads` plus one job that does the work. The job layer
 * provides queueing, concurrency, retries with backoff and survival across restarts;
 * this module adds what is specific to bringing a large file onto a drive:
 *
 *   fetch to "<name>.part"  →  verify the checksum  →  rename into place  →  install
 *
 * The file only ever has its final name once it is complete and verified, and it only
 * keeps that name if installing it worked. Everything before that can be interrupted
 * (pause, a dropped connection, an unplugged drive, a restart) and continues later
 * from the partial file.
 */
import fs from "node:fs";
import path from "node:path";
import type { DownloadDetail, DownloadDto, DownloadPlan, DownloadPlanItem, JobDto } from "@outpost/shared";
import { and, count, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, classifyNetworkError, conflict, messageOf, notFound } from "../../core/errors.ts";
import { pathExists } from "../../core/fs-safe.ts";
import { sha256File } from "../../core/hashing.ts";
import { createHttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { type JobRow, type JobRun, PermanentJobError } from "../../core/jobs.ts";
import { RateLimiter } from "../../core/throttle.ts";
import { downloads } from "../../db/schema.ts";
import { createHttpFetcher } from "./http-fetcher.ts";
import { forecastQueue } from "./plan.ts";
import type {
  DownloadKind,
  DownloadRow,
  DownloadsService,
  Fetcher,
  InstallContext,
  Installer,
  InstallMeta,
  StartDownload,
} from "./types.ts";

export const DOWNLOAD_JOB = "download.run";
export const PART_SUFFIX = ".part";
export const OFFLINE_MESSAGE = "No connection. This download will resume when the network is back.";
export const OFFLINE_GAVE_UP_MESSAGE =
  "No connection. Outpost has stopped trying for now. Choose Retry when the network is back; the part already downloaded is kept.";

type DownloadState = DownloadRow["state"];
const ACTIVE_STATES: DownloadState[] = ["queued", "running", "verifying", "paused"];
const isActive = (state: DownloadState) => ACTIVE_STATES.includes(state);
/** What the Downloads screen calls history. */
const FINISHED: DownloadState[] = ["completed", "cancelled"];

/** Progress reaches the database and the browser at most this often per download. */
const PUBLISH_INTERVAL_MS = 500;
/** Speed is averaged over this long, so the figure is steady but still current. */
const SPEED_WINDOW_MS = 5_000;

interface JobPayload extends Record<string, unknown> {
  downloadId: string;
  fetcher: string;
  allowedHosts?: string[];
}

/** In-memory view of a transfer in flight; the row is only written every so often. */
interface Live {
  receivedBytes: number;
  totalBytes: number | null;
  message: string | null;
  samples: Array<{ at: number; bytes: number }>;
  /** One reading a second for the last quarter of an hour, for the speed chart. */
  history: Array<{ at: number; bytes: number }>;
  lastFlush: number;
}

const HISTORY_INTERVAL_MS = 1_000;
const HISTORY_POINTS = 900;
const EVENT_LIMIT = 80;

/** One line of a download's history: when it entered a state, and why if it says. */
export interface DownloadEvent {
  at: number;
  state: string;
  detail?: string;
}

interface ActiveRun {
  /** Aborted by the manager itself: the drive went away, or there turned out to be no room. */
  stop: AbortController;
  locationId: string;
}

const startSchema = z.object({
  kind: z.enum(["zim", "map", "terrain", "places", "file", "model", "document", "dataset"]),
  title: z.string().trim().min(1).max(300),
  url: z.string().min(1).max(4000),
  locationId: z.string().min(1).optional(),
  relPath: z.string().min(1).max(1000),
  sizeBytes: z.number().int().nonnegative().optional(),
  sha256: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "A SHA-256 checksum is 64 hexadecimal characters.")
    .optional(),
  catalogEntryId: z.string().min(1).optional(),
  fetcher: z.string().min(1).optional(),
  allowedHosts: z.array(z.string().min(1)).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const optionalText = z.string().trim().min(1).optional().catch(undefined);
const installMetaSchema = z.object({
  title: optionalText,
  description: optionalText,
  category: optionalText,
  language: optionalText,
  publisher: optionalText,
  license: optionalText,
  attribution: optionalText,
  version: optionalText,
  collectionMeta: z.record(z.string(), z.unknown()).optional().catch(undefined),
});

/** The errno code of an error or of whatever caused it ("ENOSPC", "EIO", …). */
function errnoOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** The first error in the chain of causes that satisfies `test`. */
function causeOf<T>(error: unknown, test: (cause: unknown) => cause is T): T | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (test(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

async function fileSize(file: string): Promise<number | undefined> {
  try {
    return (await fs.promises.stat(file)).size;
  } catch {
    return undefined;
  }
}

export function createDownloadsService(ctx: AppContext): DownloadsService {
  const { db } = ctx;
  const { storage, settings } = ctx.services;
  const client = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
  const fetchers = new Map<string, Fetcher>([["http", createHttpFetcher(client)]]);
  const installers = new Map<DownloadKind, Installer>();
  /** Installers that take only the downloads they recognise, tried before the kind's own installer. */
  const claimed: Array<{ kind: DownloadKind; owns: (download: DownloadRow) => boolean; installer: Installer }> = [];
  const completedListeners: Array<(download: DownloadRow) => void | Promise<void>> = [];
  const live = new Map<string, Live>();
  const running = new Map<string, ActiveRun>();
  /** What was asked for while a paused transfer was still winding down. */
  const afterUnwind = new Map<string, "resume" | "cancel">();
  let closed = false;

  /** One limit shared by every transfer, set from Settings. */
  const limiter = new RateLimiter();
  const applyLimit = () => limiter.setLimit(settings.get("downloads.rateLimitKbps") * 1000);
  applyLimit();
  settings.onChange(applyLimit);

  // ── Rows ──

  function get(id: string): DownloadRow | undefined {
    return db.select().from(downloads).where(eq(downloads.id, id)).get();
  }

  function requireRow(id: string): DownloadRow {
    const row = get(id);
    if (!row) throw notFound("Download");
    return row;
  }

  function locationName(locationId: string): string {
    return storage.list().find((location) => location.id === locationId)?.name ?? "Unknown location";
  }

  function speedOf(state: Live): number | null {
    const first = state.samples[0];
    const last = state.samples.at(-1);
    if (!first || !last || last.at - first.at < 500) return null;
    const rate = ((last.bytes - first.bytes) * 1000) / (last.at - first.at);
    return rate > 0 ? Math.round(rate) : null;
  }

  function toDto(row: DownloadRow): DownloadDto {
    const state = live.get(row.id);
    const receivedBytes = state?.receivedBytes ?? row.receivedBytes;
    const totalBytes = state ? state.totalBytes : row.totalBytes;
    const bytesPerSecond = state && row.state === "running" ? speedOf(state) : null;
    let message = state?.message ?? null;
    if (!state && row.jobId && (row.state === "queued" || row.state === "paused")) {
      // "Waiting for a connection", "Waiting to retry", "Resuming after restart".
      message = ctx.jobs.get(row.jobId)?.progressMessage ?? null;
    }
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      catalogEntryId: row.catalogEntryId,
      url: row.url,
      locationId: row.locationId,
      locationName: locationName(row.locationId),
      relPath: row.relPath,
      state: row.state,
      receivedBytes,
      totalBytes,
      bytesPerSecond,
      etaSeconds:
        bytesPerSecond && totalBytes !== null && totalBytes >= receivedBytes
          ? Math.ceil((totalBytes - receivedBytes) / bytesPerSecond)
          : null,
      message,
      error: row.error,
      errorKind: row.errorKind,
      attempts: row.attempts,
      collectionId: row.collectionId,
      documentId: typeof row.meta.documentId === "string" ? row.meta.documentId : null,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      updatedAt: row.updatedAt,
    };
  }

  function announce(row: DownloadRow): void {
    ctx.events.publish({ type: "download.updated", id: row.id, data: toDto(row) });
  }

  function write(id: string, patch: Partial<typeof downloads.$inferInsert>): DownloadRow {
    // Every change of state is kept as a line of history on the row itself.
    const before = patch.state ? get(id) : undefined;
    if (before && patch.state !== before.state) {
      const meta = (patch.meta ?? before.meta) as Record<string, unknown>;
      const events = [...((meta.events as DownloadEvent[] | undefined) ?? [])];
      const detail = typeof patch.error === "string" ? patch.error : undefined;
      events.push({ at: Date.now(), state: patch.state!, ...(detail ? { detail } : {}) });
      patch = { ...patch, meta: { ...meta, events: events.slice(-EVENT_LIMIT) } };
    }
    db.update(downloads)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(downloads.id, id))
      .run();
    const row = requireRow(id);
    announce(row);
    return row;
  }

  /** Writes the in-memory progress of a running transfer to its row and to the browser. */
  function flush(id: string): void {
    const state = live.get(id);
    if (!state || closed || !get(id)) return;
    state.lastFlush = Date.now();
    write(id, { receivedBytes: state.receivedBytes, totalBytes: state.totalBytes });
  }

  // ── Keeping the row in step with its job ──

  /**
   * The job is the authority on queued / paused / failed / cancelled: retries, and
   * pausing or cancelling from the Jobs screen, all happen there. Whatever the job
   * becomes, the download row follows. "running" is left to the handler below, which
   * knows whether it is fetching or verifying.
   */
  function follow(job: Pick<JobRow, "id" | "state" | "error" | "errorKind" | "attempts" | "finishedAt">, downloadId: string): void {
    const row = get(downloadId);
    if (!row || row.jobId !== job.id) return;
    switch (job.state) {
      case "queued":
        if (row.state !== "queued" || row.error !== job.error) {
          write(row.id, { state: "queued", error: job.error, errorKind: job.errorKind, finishedAt: null, attempts: job.attempts });
        }
        break;
      case "paused":
        if (row.state !== "paused") write(row.id, { state: "paused" });
        break;
      case "failed":
        if (row.state !== "failed") {
          write(row.id, {
            state: "failed",
            // Once the retries are used up, "will resume" would no longer be true.
            error: job.errorKind === "offline" ? OFFLINE_GAVE_UP_MESSAGE : (job.error ?? "The download failed."),
            errorKind: job.errorKind ?? "error",
            finishedAt: job.finishedAt ?? Date.now(),
            attempts: job.attempts,
          });
        }
        break;
      case "cancelled":
        if (row.state !== "cancelled") write(row.id, { state: "cancelled", finishedAt: job.finishedAt ?? Date.now() });
        break;
      case "succeeded":
        if (row.state !== "completed") write(row.id, { state: "completed", finishedAt: job.finishedAt ?? Date.now() });
        break;
      default:
        break;
    }
  }

  const downloadIdOf = (subject: string | null | undefined): string | undefined =>
    subject?.startsWith("download:") ? subject.slice("download:".length) : undefined;

  const unsubscribe = ctx.events.subscribe((event) => {
    if (closed) return;
    if (event.type === "job.updated") {
      const job = event.data as JobDto;
      const id = job.type === DOWNLOAD_JOB ? downloadIdOf(job.subject) : undefined;
      if (id && job.state !== "running") follow(job, id);
    } else if (event.type === "storage.changed") {
      onStorageChanged();
    }
  });

  function onStorageChanged(): void {
    // A drive that has gone: stop writing to it now rather than at the next failed write.
    for (const run of running.values()) {
      if (!storage.isAvailable(run.locationId)) run.stop.abort("storage");
    }
    // A drive that is back: carry on with what its disappearance interrupted.
    const waiting = db
      .select()
      .from(downloads)
      .where(and(eq(downloads.state, "failed"), eq(downloads.errorKind, "storage_unavailable")))
      .all();
    for (const row of waiting) {
      if (!storage.isAvailable(row.locationId)) continue;
      service.retry(row.id).catch((error) => {
        // Say why, and stop trying: the next storage check would only fail the same way.
        ctx.log.warn({ err: error, download: row.id }, "could not resume after the drive returned");
        if (closed || !get(row.id)) return;
        write(row.id, {
          error: `The drive is back, but this download could not continue: ${messageOf(error)}`,
          errorKind: error instanceof AppError ? error.code : "error",
        });
      });
    }
  }

  /** Rows left active by the previous process: line them up with what the job layer will do. */
  function recover(): void {
    const rows = db.select().from(downloads).where(inArray(downloads.state, ACTIVE_STATES)).all();
    for (const row of rows) {
      const job = row.jobId ? ctx.jobs.get(row.jobId) : undefined;
      if (!job) {
        write(row.id, {
          state: "failed",
          error: "This download was interrupted and its place in the queue was lost. Remove it and start it again.",
          errorKind: "error",
          finishedAt: Date.now(),
        });
      } else if (job.state === "running") {
        // The job layer queues interrupted jobs again when it starts; the partial file is kept.
        if (row.state !== "queued") write(row.id, { state: "queued" });
      } else {
        follow(job, row.id);
      }
    }
  }

  // ── The job ──

  const defaultInstaller: Installer = async ({ download, sizeBytes, sha256 }) => {
    // A file saved from a link becomes a library document; the module that starts those installs them.
    if (download.kind === "document") throw new Error("No installer is registered for documents saved from links.");
    const parsed = installMetaSchema.safeParse(download.meta);
    const meta: InstallMeta = parsed.success ? (parsed.data as InstallMeta) : {};
    const collection = await ctx.services.collections.create({
      kind: download.kind,
      title: meta.title ?? download.title,
      locationId: download.locationId,
      relPath: download.relPath,
      catalogEntryId: download.catalogEntryId,
      description: meta.description,
      category: meta.category,
      language: meta.language,
      publisher: meta.publisher,
      license: meta.license,
      attribution: meta.attribution,
      version: meta.version,
      sizeBytes,
      sha256,
      meta: meta.collectionMeta ?? {},
    });
    return { collectionId: collection.id };
  };

  /**
   * Turns whatever stopped the transfer into the error the job should record. Order
   * matters: a drive that has gone explains write errors better than the errors do.
   */
  async function explain(error: unknown, row: DownloadRow, run: ActiveRun): Promise<unknown> {
    const errno = errnoOf(error);
    const network = classifyNetworkError(error);
    const looksLikeDisk = network === "other" && errno !== undefined && /^E[A-Z]+$/.test(errno);
    if (looksLikeDisk || run.stop.signal.aborted) await storage.refresh().catch(() => undefined);
    if (!storage.isAvailable(row.locationId)) {
      return new PermanentJobError(
        `"${locationName(row.locationId)}" was disconnected during this download. The part already downloaded is still on it, and the download will continue when it is connected again.`,
        "storage_unavailable",
      );
    }
    if (errno === "ENOSPC") {
      return new PermanentJobError(
        `"${locationName(row.locationId)}" is full. Free some space on it, then retry; the part already downloaded is kept.`,
        "insufficient_space",
      );
    }
    if (run.stop.signal.reason instanceof AppError) return run.stop.signal.reason;
    // fetch() wraps what went wrong ("fetch failed"); a refusal by Outpost's own guards
    // is underneath, and it is final: retrying a blocked address cannot help.
    const refusal = causeOf(error, (cause): cause is AppError => cause instanceof AppError);
    if (refusal) return refusal;
    if (run.stop.signal.aborted) {
      // Stopped because the drive looked gone, but it is there after all: just try again.
      return new Error(`"${locationName(row.locationId)}" stopped responding for a moment. Outpost will try again.`);
    }
    if (network === "offline") {
      // Same classification for the job layer (through `cause`), friendlier words for people.
      return new Error(OFFLINE_MESSAGE, { cause: error });
    }
    if (network === "transient") {
      return new Error("The connection was interrupted. Outpost will continue from where it stopped.", { cause: error });
    }
    return error;
  }

  async function runDownload(run: JobRun<JobPayload>): Promise<Record<string, unknown>> {
    const id = run.payload.downloadId;
    const found = get(id);
    if (!found) throw new PermanentJobError("This download was removed before it could run.");
    const fetcher = fetchers.get(run.payload.fetcher);
    if (!fetcher) throw new PermanentJobError(`Nothing in this version of Outpost knows how to fetch "${run.payload.fetcher}" downloads.`);

    const active: ActiveRun = { stop: new AbortController(), locationId: found.locationId };
    const signal = AbortSignal.any([run.signal, active.stop.signal]);
    const state: Live = {
      receivedBytes: found.receivedBytes,
      totalBytes: found.totalBytes,
      message: null,
      samples: [],
      history: [{ at: Date.now(), bytes: found.receivedBytes }],
      lastFlush: 0,
    };
    running.set(id, active);
    live.set(id, state);

    // When the size is first learned from the server, make sure there is room for it.
    let spaceChecked = found.totalBytes !== null;
    const progress = (receivedBytes: number, totalBytes?: number | null, message?: string) => {
      const now = Date.now();
      state.receivedBytes = receivedBytes;
      if (totalBytes !== undefined) state.totalBytes = totalBytes;
      if (message !== undefined) state.message = message;
      state.samples.push({ at: now, bytes: receivedBytes });
      while (state.samples.length > 2 && now - state.samples[0]!.at > SPEED_WINDOW_MS) state.samples.shift();
      if (now - (state.history.at(-1)?.at ?? 0) >= HISTORY_INTERVAL_MS) {
        state.history.push({ at: now, bytes: receivedBytes });
        if (state.history.length > HISTORY_POINTS) state.history.shift();
      }
      run.progress({ current: receivedBytes, total: state.totalBytes, message: state.message });
      if (!spaceChecked && state.totalBytes !== null) {
        spaceChecked = true;
        storage.assertSpace(found.locationId, Math.max(0, state.totalBytes - receivedBytes)).catch((error) => active.stop.abort(error));
      }
      if (now - state.lastFlush >= PUBLISH_INTERVAL_MS) flush(id);
    };
    /** Moves to the next phase, unless the person has just paused or cancelled. */
    const enter = (next: DownloadState, message: string | null): DownloadRow => {
      signal.throwIfAborted();
      state.message = message;
      state.samples = [];
      return write(id, { state: next, receivedBytes: state.receivedBytes, totalBytes: state.totalBytes });
    };

    let row = found;
    try {
      row = write(id, {
        state: "running",
        startedAt: found.startedAt ?? Date.now(),
        finishedAt: null,
        attempts: run.job.attempts,
        error: null,
        errorKind: null,
      });
      const finalPath = storage.resolve(row.locationId, row.relPath);
      const partPath = `${finalPath}${PART_SUFFIX}`;
      await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
      const partSize = await fileSize(partPath);
      let file: { sizeBytes: number; sha256: string };

      if (await pathExists(finalPath)) {
        // Either an earlier attempt was interrupted between putting the file in place
        // and installing it, or something else now has that name. Only the first is ours.
        const ours = partSize === undefined && row.sha256Actual !== null && (await sha256File(finalPath, { signal })) === row.sha256Actual;
        if (!ours) {
          throw new AppError(
            "conflict",
            `A file named ${path.basename(finalPath)} has appeared at the destination. Outpost will not overwrite it.`,
          );
        }
        file = { sizeBytes: (await fs.promises.stat(finalPath)).size, sha256: row.sha256Actual! };
      } else {
        // A complete, already verified partial file is left when installing failed or
        // was cancelled; there is nothing to fetch again in that case.
        const fetched = row.sha256Actual !== null && partSize !== undefined && partSize === row.totalBytes;
        if (!fetched) {
          if (row.sha256Actual !== null) row = write(id, { sha256Actual: null });
          await fetcher({
            download: row,
            partPath,
            allowedHosts: run.payload.allowedHosts,
            signal,
            progress,
            throttle: (bytes) => limiter.take(bytes, signal),
            remember(patch) {
              const set: Partial<typeof downloads.$inferInsert> = {};
              if (patch.etag !== undefined) set.etag = patch.etag;
              if (patch.lastModified !== undefined) set.lastModified = patch.lastModified;
              if (patch.meta) set.meta = { ...requireRow(id).meta, ...patch.meta };
              if (Object.keys(set).length > 0) row = write(id, set);
            },
          });
        }

        const sizeBytes = (await fs.promises.stat(partPath)).size;
        state.receivedBytes = sizeBytes;
        state.totalBytes = sizeBytes;
        row = enter("verifying", "Checking the file");
        const sha256 = await sha256File(partPath, {
          signal,
          onProgress: (bytes) => run.progress({ current: bytes, total: sizeBytes, message: "Checking the file" }),
        });
        if (row.sha256Expected && sha256 !== row.sha256Expected) {
          await fs.promises.rm(partPath, { force: true });
          state.receivedBytes = 0;
          write(id, { sha256Actual: sha256, receivedBytes: 0 });
          throw new PermanentJobError(
            "The downloaded file does not match its published checksum, so it was corrupt or had been tampered with. It has been deleted and nothing was installed. Try the download again.",
            "checksum_mismatch",
          );
        }
        row = write(id, { sha256Actual: sha256 });
        signal.throwIfAborted();
        if (await pathExists(finalPath)) {
          throw new AppError(
            "conflict",
            `A file named ${path.basename(finalPath)} has appeared at the destination. Outpost will not overwrite it.`,
          );
        }
        await fs.promises.rename(partPath, finalPath);
        file = { sizeBytes, sha256 };
      }

      let collectionId: string | undefined;
      let installMeta: Record<string, unknown> | undefined;
      try {
        state.message = "Installing";
        const install: InstallContext = {
          download: row,
          filePath: finalPath,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          signal,
          progress: (current, total, message) =>
            run.progress({ current, message: message ?? "Installing", ...(total === undefined ? {} : { total }) }),
        };
        const claimant = claimed.find((entry) => entry.kind === row.kind && entry.owns(row));
        const installed = await (claimant?.installer ?? installers.get(row.kind) ?? defaultInstaller)(install);
        collectionId = installed?.collectionId;
        installMeta = installed?.meta;
      } catch (error) {
        // Not installed, so the file gives its final name back. A retry finds the verified
        // partial file and goes straight to installing; removing the download deletes it.
        // An installer that found the file unusable may already have removed it.
        await fs.promises.rename(finalPath, partPath).catch((renameError: NodeJS.ErrnoException) => {
          if (renameError.code !== "ENOENT") run.log.warn({ err: renameError }, "could not set aside a file that failed to install");
        });
        throw error;
      }

      row = write(id, {
        state: "completed",
        // Read afresh: the record's history has grown since this run began.
        ...(installMeta ? { meta: { ...requireRow(id).meta, ...installMeta } } : {}),
        collectionId: collectionId ?? null,
        receivedBytes: file.sizeBytes,
        totalBytes: file.sizeBytes,
        finishedAt: Date.now(),
        error: null,
        errorKind: null,
      });
      for (const listener of completedListeners) {
        try {
          await listener(row);
        } catch (error) {
          run.log.error({ err: error }, "download completion listener failed");
        }
      }
      return { collectionId: collectionId ?? null, sizeBytes: file.sizeBytes, sha256: file.sha256 };
    } catch (error) {
      // Pause, cancel and shutdown are not failures; the job layer records which it was.
      if (run.signal.aborted) throw error;
      throw await explain(error, row, active);
    } finally {
      running.delete(id);
      if (get(id)?.state !== "completed") flush(id);
      live.delete(id);
      const wish = afterUnwind.get(id);
      if (wish) {
        afterUnwind.delete(id);
        // Once the job layer has recorded the pause, do what was asked in the meantime.
        setImmediate(() => {
          if (closed) return;
          try {
            if (wish === "resume") service.resume(id);
            else service.cancel(id);
          } catch (error) {
            ctx.log.warn({ err: error, download: id }, `could not ${wish} after pausing`);
          }
        });
      }
    }
  }

  ctx.jobs.register<JobPayload>(DOWNLOAD_JOB, {
    queue: "download",
    run: runDownload,
    onSettled(job) {
      const id = downloadIdOf(job.subject);
      if (id && !closed) follow(job, id);
    },
  });

  function enqueue(row: DownloadRow, payload: JobPayload): JobRow {
    return ctx.jobs.enqueue<JobPayload>(DOWNLOAD_JOB, payload, {
      title: `Download ${row.title}`,
      subject: `download:${row.id}`,
      maxAttempts: settings.get("downloads.maxAttempts"),
    });
  }

  /** Other downloads that have a claim on the same destination (and so on its partial file). */
  function othersAt(locationId: string, relPath: string, exceptId: string | undefined, states: DownloadState[]): DownloadRow[] {
    return db
      .select()
      .from(downloads)
      .where(
        and(
          eq(downloads.locationId, locationId),
          eq(downloads.relPath, relPath),
          inArray(downloads.state, states),
          ne(downloads.id, exceptId ?? ""),
        ),
      )
      .all();
  }

  // ── The service ──

  /** Per-second speeds from the byte counts held for a running transfer. */
  function speedHistory(id: string): Array<{ at: number; bytesPerSecond: number }> {
    const history = live.get(id)?.history ?? [];
    const points: Array<{ at: number; bytesPerSecond: number }> = [];
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1]!;
      const current = history[index]!;
      const seconds = (current.at - previous.at) / 1000;
      if (seconds > 0) points.push({ at: current.at, bytesPerSecond: Math.max(0, Math.round((current.bytes - previous.bytes) / seconds)) });
    }
    return points;
  }

  const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

  async function detail(id: string): Promise<DownloadDetail> {
    const row = requireRow(id);
    const meta = row.meta as Record<string, unknown>;
    const job = row.jobId ? ctx.jobs.get(row.jobId) : undefined;
    const location = storage.list().find((item) => item.id === row.locationId);
    const speeds = speedHistory(id);
    const moving = speeds.filter((point) => point.bytesPerSecond > 0);
    let requestedHost = "";
    try {
      requestedHost = new URL(row.url).hostname;
    } catch {
      // Fetchers other than "http" may keep something that is not a plain address here.
    }
    const region = meta.bbox && Array.isArray(meta.bbox) ? meta : undefined;
    return {
      download: toDto(row),
      source: {
        requestedUrl: row.url,
        requestedHost,
        servedBy: text(meta.servedBy) && text(meta.servedBy) !== requestedHost ? text(meta.servedBy)! : null,
        fetcher: text((job?.payload as JobPayload | undefined)?.fetcher) ?? "http",
        etag: row.etag,
        lastModified: row.lastModified,
      },
      integrity: {
        sha256Expected: row.sha256Expected,
        sha256Actual: row.sha256Actual,
        verified: row.sha256Expected && row.sha256Actual ? row.sha256Expected === row.sha256Actual : null,
      },
      destination: {
        locationId: row.locationId,
        locationName: location?.name ?? "Unknown location",
        locationAvailable: location?.status === "available",
        relPath: row.relPath,
        freeBytes: location?.freeBytes ?? null,
        totalBytes: location?.totalBytes ?? null,
      },
      timing: {
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        averageBytesPerSecond: moving.length
          ? Math.round(moving.reduce((sum, point) => sum + point.bytesPerSecond, 0) / moving.length)
          : null,
        peakBytesPerSecond: moving.length ? Math.max(...moving.map((point) => point.bytesPerSecond)) : null,
      },
      speedHistory: speeds,
      events: ((meta.events as DownloadDetail["events"] | undefined) ?? []).slice(),
      attempts: {
        made: job?.attempts ?? row.attempts,
        allowed: job?.maxAttempts ?? settings.get("downloads.maxAttempts"),
        nextAttemptAt: job?.state === "queued" && job.runAfter > Date.now() ? job.runAfter : null,
      },
      about:
        text(meta.publisher) || text(meta.license) || text(meta.description)
          ? {
              publisher: text(meta.publisher),
              license: text(meta.license),
              attribution: text(meta.attribution),
              version: text(meta.version),
              description: text(meta.description),
              language: text(meta.language),
            }
          : null,
      region: region
        ? {
            bbox: region.bbox as [number, number, number, number],
            minZoom: Number(region.minZoom ?? 0),
            maxZoom: Number(region.maxZoom ?? 0),
            tileType: text(region.tileType) ?? "vector",
            sourceBuild: text(region.sourceBuild),
          }
        : null,
      rateLimitBytesPerSecond: limiter.limit,
    };
  }

  async function plan(): Promise<DownloadPlan> {
    const rows = db
      .select()
      .from(downloads)
      .where(inArray(downloads.state, ["queued", "running", "verifying", "paused", "failed"]))
      .all()
      .sort((a, b) => a.createdAt - b.createdAt);
    const dtos = rows.map((row) => toDto(row));
    const phaseOf = (state: string): DownloadPlanItem["phase"] | undefined =>
      state === "running" || state === "verifying" ? "active" : state === "queued" ? "waiting" : state === "paused" ? "paused" : undefined;

    const measured = dtos.reduce((sum, dto) => sum + (dto.bytesPerSecond ?? 0), 0);
    const assumed = measured > 0 ? measured : limiter.limit;
    const concurrency = settings.get("downloads.concurrency");
    const forecastable = dtos.filter((dto) => phaseOf(dto.state) === "active" || phaseOf(dto.state) === "waiting");
    const remainingOf = (dto: DownloadDto) => (dto.totalBytes === null ? null : Math.max(0, dto.totalBytes - dto.receivedBytes));
    const forecast = new Map(
      forecastQueue(
        // Verifying transfers no longer use the network; they do not hold a share of the speed.
        forecastable.map((dto) => ({
          id: dto.id,
          phase: phaseOf(dto.state) as "active" | "waiting",
          remainingBytes: dto.state === "verifying" ? 0 : remainingOf(dto),
        })),
        { concurrency, bytesPerSecond: assumed },
      ).map((item) => [item.id, item]),
    );

    const queue: DownloadPlanItem[] = [];
    for (const dto of dtos) {
      const phase = phaseOf(dto.state);
      if (!phase) continue;
      queue.push({
        id: dto.id,
        title: dto.title,
        kind: dto.kind,
        state: dto.state,
        phase,
        receivedBytes: dto.receivedBytes,
        totalBytes: dto.totalBytes,
        remainingBytes: remainingOf(dto),
        locationId: dto.locationId,
        locationName: dto.locationName,
        startsInSeconds: forecast.get(dto.id)?.startsInSeconds ?? null,
        finishesInSeconds: forecast.get(dto.id)?.finishesInSeconds ?? null,
      });
    }

    // Space is measured now rather than read from the last periodic check.
    const locations = await Promise.all(
      storage.list().map(async (location) => {
        const pendingBytes = queue
          .filter((item) => item.locationId === location.id)
          .reduce((sum, item) => sum + (item.remainingBytes ?? 0), 0);
        const space =
          location.status === "available"
            ? await fs.promises.statfs(location.path).then(
                (stats) => ({ free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize }),
                () => undefined,
              )
            : undefined;
        const freeBytes = space?.free ?? location.freeBytes;
        return {
          locationId: location.id,
          name: location.name,
          available: location.status === "available",
          totalBytes: space?.total ?? location.totalBytes,
          freeBytes,
          pendingBytes,
          freeAfterBytes: freeBytes === null ? null : freeBytes - pendingBytes,
          enough: freeBytes === null || freeBytes - pendingBytes >= 0,
        };
      }),
    );

    const finishes = queue.filter((item) => item.phase !== "paused").map((item) => item.finishesInSeconds);
    return {
      concurrency,
      rateLimitBytesPerSecond: limiter.limit,
      bytesPerSecond: measured > 0 ? measured : null,
      assumedBytesPerSecond: assumed,
      basis: measured > 0 ? "measured" : limiter.limit ? "limit" : null,
      remainingBytes: queue.filter((item) => item.phase !== "paused").reduce((sum, item) => sum + (item.remainingBytes ?? 0), 0),
      unknownSizes: queue.filter((item) => item.phase !== "paused" && item.remainingBytes === null).length,
      finishesInSeconds: finishes.length > 0 && finishes.every((value) => value !== null) ? Math.max(...(finishes as number[])) : null,
      counts: {
        active: queue.filter((item) => item.phase === "active").length,
        waiting: queue.filter((item) => item.phase === "waiting").length,
        paused: queue.filter((item) => item.phase === "paused").length,
        failed: dtos.filter((dto) => dto.state === "failed").length,
      },
      queue,
      locations: locations.filter((location) => location.pendingBytes > 0 || location.available),
    };
  }

  const service: DownloadsService = {
    detail,
    plan,
    pauseAll() {
      let count = 0;
      for (const row of db
        .select()
        .from(downloads)
        .where(inArray(downloads.state, ["queued", "running"]))
        .all()) {
        try {
          service.pause(row.id);
          count += 1;
        } catch {
          // It finished or failed in the meantime; nothing to pause.
        }
      }
      return count;
    },
    resumeAll() {
      let count = 0;
      for (const row of db.select().from(downloads).where(eq(downloads.state, "paused")).all()) {
        try {
          service.resume(row.id);
          count += 1;
        } catch {
          // Still winding down from the pause; it will resume when asked again.
        }
      }
      return count;
    },
    get,
    toDto,

    list() {
      return db.select().from(downloads).orderBy(desc(downloads.createdAt), desc(downloads.id)).all();
    },

    unfinished() {
      return db
        .select()
        .from(downloads)
        .where(notInArray(downloads.state, FINISHED))
        .orderBy(desc(downloads.createdAt), desc(downloads.id))
        .all();
    },

    history(offset, limit) {
      const finished = inArray(downloads.state, FINISHED);
      const rows = db
        .select()
        .from(downloads)
        .where(finished)
        .orderBy(desc(sql`coalesce(${downloads.finishedAt}, ${downloads.updatedAt})`), desc(downloads.id))
        .limit(limit)
        .offset(offset)
        .all();
      return { rows, total: db.select({ n: count() }).from(downloads).where(finished).get()?.n ?? 0 };
    },

    async start(raw) {
      const input: StartDownload = startSchema.parse(raw);
      const fetcherName = input.fetcher ?? "http";
      if (!fetchers.has(fetcherName)) throw badRequest(`There is no "${fetcherName}" fetcher.`);
      if (fetcherName === "http") {
        let url: URL;
        try {
          url = new URL(input.url);
        } catch {
          throw badRequest("That download address is not a valid URL.");
        }
        if (url.protocol !== "https:" && url.protocol !== "http:") throw badRequest("Only http and https downloads are supported.");
        if (!input.allowedHosts?.length) throw badRequest("A download must say which hosts it may be fetched from.");
        const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
        if (!input.allowedHosts.some((allowed) => allowed.toLowerCase() === host)) {
          throw new AppError("forbidden", `${host} is not a download source listed in any catalogue manifest.`);
        }
      }

      const location = input.locationId ? storage.get(input.locationId) : storage.getDefault();
      // resolve() refuses anything that would land outside the location ("../x").
      const root = storage.resolve(location.id, "");
      const finalPath = storage.resolve(location.id, input.relPath);
      if (finalPath === root) throw badRequest("A download needs a file name inside the storage location.");
      const relPath = path.relative(root, finalPath).split(path.sep).join("/");
      const partPath = `${finalPath}${PART_SUFFIX}`;

      if (await pathExists(finalPath)) {
        throw conflict(`"${location.name}" already has a file at ${relPath}. Outpost will not overwrite it.`);
      }
      if (othersAt(location.id, relPath, undefined, ACTIVE_STATES).length > 0) {
        throw conflict("That file is already being downloaded.");
      }
      if (await pathExists(partPath)) {
        if (othersAt(location.id, relPath, undefined, ["failed", "cancelled"]).length > 0) {
          throw conflict(
            "An earlier download of this file was left unfinished. Retry it to continue from where it stopped, or remove it first.",
          );
        }
        // Left by a download whose record is gone, so nothing can continue it. Resuming
        // from bytes of unknown origin would be wrong; this download starts clean.
        await fs.promises.rm(partPath, { force: true });
      }
      if (input.sizeBytes !== undefined) await storage.assertSpace(location.id, input.sizeBytes);

      const id = newId();
      const now = Date.now();
      // Row and job are created in one synchronous stretch, so the job cannot start
      // before the row it works on exists.
      db.insert(downloads)
        .values({
          id,
          kind: input.kind,
          catalogEntryId: input.catalogEntryId ?? null,
          title: input.title,
          url: input.url,
          locationId: location.id,
          relPath,
          state: "queued",
          totalBytes: input.sizeBytes ?? null,
          sha256Expected: input.sha256?.toLowerCase() ?? null,
          meta: { ...(input.meta ?? {}), events: [{ at: Date.now(), state: "queued" }] },
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const job = enqueue(requireRow(id), { downloadId: id, fetcher: fetcherName, allowedHosts: input.allowedHosts });
      return write(id, { jobId: job.id });
    },

    pause(id) {
      const row = requireRow(id);
      if (row.state === "paused") return row;
      if (!isActive(row.state) || !row.jobId) throw conflict(`This download is ${row.state} and cannot be paused.`);
      ctx.jobs.pause(row.jobId);
      // A running job only records the pause once its transfer has stopped; show it now.
      return write(id, { state: "paused" });
    },

    resume(id) {
      const row = requireRow(id);
      if (row.state !== "paused") throw conflict(`This download is ${row.state}, not paused.`);
      if (running.has(id)) {
        // Still winding down from the pause; start again as soon as it has.
        afterUnwind.set(id, "resume");
        return row;
      }
      if (!row.jobId || !ctx.jobs.get(row.jobId)) throw conflict("This download can no longer be resumed. Start it again.");
      ctx.jobs.resume(row.jobId);
      return write(id, { state: "queued", error: null, errorKind: null });
    },

    cancel(id) {
      const row = requireRow(id);
      if (!isActive(row.state)) throw conflict(`This download is ${row.state} and cannot be cancelled.`);
      if (running.has(id) && row.state === "paused") {
        // The pause has been asked for but the transfer has not stopped yet.
        afterUnwind.set(id, "cancel");
        return row;
      }
      if (row.jobId && ctx.jobs.get(row.jobId)) ctx.jobs.cancel(row.jobId);
      // The partial file stays: retrying continues from it, removing the download deletes it.
      return write(id, { state: "cancelled", finishedAt: Date.now() });
    },

    async retry(id) {
      const row = requireRow(id);
      if (row.state !== "failed" && row.state !== "cancelled") {
        throw conflict(`This download is ${row.state}; only failed or cancelled downloads can be retried.`);
      }
      const finalPath = storage.resolve(row.locationId, row.relPath);
      if (await pathExists(finalPath)) {
        throw conflict(`"${locationName(row.locationId)}" already has a file at ${row.relPath}. Outpost will not overwrite it.`);
      }
      if (othersAt(row.locationId, row.relPath, id, ACTIVE_STATES).length > 0) {
        throw conflict("That file is already being downloaded.");
      }
      if (row.totalBytes !== null) {
        const have = (await fileSize(`${finalPath}${PART_SUFFIX}`)) ?? 0;
        await storage.assertSpace(row.locationId, Math.max(0, row.totalBytes - have));
      }
      const job = row.jobId ? ctx.jobs.get(row.jobId) : undefined;
      if (!job) throw conflict("This download can no longer be retried. Start it again.");
      let jobId = job.id;
      if (job.state === "failed") ctx.jobs.resume(job.id);
      else jobId = enqueue(row, job.payload as JobPayload).id;
      return write(id, { jobId, state: "queued", error: null, errorKind: null, finishedAt: null });
    },

    async remove(id) {
      const row = requireRow(id);
      if (isActive(row.state)) throw conflict("Cancel this download before removing it.");
      if (running.has(id)) throw conflict("This download is still stopping. Try again in a moment.");
      // The partial file goes with the record, because removing is the person saying they
      // no longer want it. A completed download's file is a collection now: never touched.
      const shared = othersAt(row.locationId, row.relPath, id, [...ACTIVE_STATES, "failed", "cancelled"]).length > 0;
      if (row.state !== "completed" && !shared && storage.isAvailable(row.locationId)) {
        await fs.promises.rm(`${storage.resolve(row.locationId, row.relPath)}${PART_SUFFIX}`, { force: true });
      }
      db.delete(downloads).where(eq(downloads.id, id)).run();
      ctx.events.publish({ type: "download.removed", id });
    },

    registerFetcher(name, fetcher) {
      if (fetchers.has(name)) throw new Error(`A fetcher named "${name}" is already registered.`);
      fetchers.set(name, fetcher);
    },

    registerInstaller(kind, installer, owns) {
      if (owns) {
        claimed.push({ kind, owns, installer });
        return;
      }
      if (installers.has(kind)) throw new Error(`An installer for "${kind}" downloads is already registered.`);
      installers.set(kind, installer);
    },

    onCompleted(listener) {
      completedListeners.push(listener);
    },
  };

  recover();
  ctx.onClose.push(async () => {
    closed = true;
    unsubscribe();
    await client.close();
  });

  return service;
}
