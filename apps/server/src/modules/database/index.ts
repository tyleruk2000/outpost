/**
 * The database itself, for the Storage screen: where the file is and how big, what is in
 * it, what state it is in, and two things that look after it.
 *
 * Everything Outpost keeps that is not a file is in one SQLite file in the data
 * directory. This module only looks at that file and, when asked, checks it or rewrites
 * it without its unused pages. It owns no table.
 *
 * Three rules shape it:
 *
 *  - Opening the screen is cheap. `GET /api/database` reads the file's size, a few
 *    numbers from its header and some small tables. What needs every page read (the
 *    counts and where the bytes go) is worked out in a worker thread on a connection of
 *    its own, kept with the time it was worked out, and only worked out again when asked.
 *  - Checking is harmless: it reads, in a worker, as a job, and anyone may start one.
 *  - Reclaiming space (VACUUM) holds the database's write lock until it has finished.
 *    It is refused while any work is running, and while it runs other work waits, a
 *    backup cannot take its copy, and every request that would change something is
 *    refused with a message saying why. It cuts across what everyone else on the network
 *    is doing, so it follows the rule restarting Outpost follows: accepted from the
 *    computer Outpost runs on, or from anywhere with OUTPOST_ALLOW_REMOTE_ERASE.
 */
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { DatabaseCheck, DatabaseContents, DatabaseStatus, DatabaseVacuum } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { type JobRow, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { migrationsDir, workerUrl } from "../../core/paths.ts";
import { assertBackupRight, backupRight } from "../backup/right.ts";
import { SPACE_RESERVE_BYTES } from "../storage/service.ts";
import type { WorkerTask } from "./database.worker.ts";
import { hasDbstat } from "./inspect.ts";

const QUEUE = "database";
const SUBJECT = "database";
export const CHECK_JOB = "database.check";
export const VACUUM_JOB = "database.vacuum";

export interface DiskSpace {
  freeBytes: number;
  totalBytes: number;
  /** The device the folder is on, to tell whether two folders share a drive. */
  device: number;
}

export interface DatabaseService {
  /** Why nothing can be written to the database now (space is being reclaimed), or null. */
  busy(): string | null;
  /**
   * Runs `copy`, which takes a copy of the database (a backup's snapshot), unless space
   * is being reclaimed; reclaiming is refused while a copy is being taken.
   */
  whileCopying<T>(copy: () => Promise<T>): Promise<T>;
  /** Tests say how much room a folder's drive has. */
  setSpace(measure: ((dir: string) => Promise<DiskSpace | undefined>) | undefined): void;
  /** Tests hold a reclaim after it has stopped other work and before it starts rewriting. */
  setBeforeVacuum(hook: (() => Promise<void>) | undefined): void;
}

declare module "../../core/context.ts" {
  interface Services {
    database: DatabaseService;
  }
}

const BUSY =
  "Outpost is reclaiming unused space in its database, and nothing can be changed until that has finished. Try again in a moment; the Storage screen shows when it is done.";

async function measureSpace(dir: string): Promise<DiskSpace | undefined> {
  try {
    const [stats, info] = await Promise.all([fs.promises.statfs(dir), fs.promises.stat(dir)]);
    return { freeBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize, device: info.dev };
  } catch {
    return undefined;
  }
}

/**
 * The folder SQLite writes its temporary files to on this system, found as SQLite finds
 * it on Unix: SQLITE_TMPDIR, TMPDIR, then /var/tmp, /usr/tmp and /tmp, the first that is
 * a folder it may write in. VACUUM builds the rewritten database there first.
 */
function sqliteTempDir(): string | undefined {
  if (process.platform === "win32") return process.env.TEMP ?? process.env.TMP;
  const candidates = [process.env.SQLITE_TMPDIR, process.env.TMPDIR, "/var/tmp", "/usr/tmp", "/tmp"];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      fs.accessSync(dir, fs.constants.W_OK | fs.constants.X_OK);
      return dir;
    } catch {
      // Not usable; SQLite would try the next one too.
    }
  }
  return undefined;
}

/** How many layout steps this version of Outpost has, from the list drizzle keeps beside them. */
function knownMigrations(): number {
  try {
    const journal = JSON.parse(fs.readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
    return journal.entries.length;
  } catch {
    return 0;
  }
}

function runInWorker<T>(task: WorkerTask, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(new URL("./database.worker.ts", import.meta.url), "database"), { workerData: task });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", stop);
      void worker.terminate();
      finish();
    };
    // A check stops when SQLite next hands control back, which is when the check is done;
    // its answer is then thrown away. A rewrite is never stopped part way (see the job).
    const stop = () => settle(() => reject(signal?.reason instanceof Error ? signal.reason : new Error("Stopped")));
    signal?.addEventListener("abort", stop, { once: true });
    worker.once("message", (message: { ok: true; result: T } | { ok: false; message: string }) => {
      settle(() => (message.ok ? resolve(message.result) : reject(new Error(message.message))));
    });
    worker.once("error", (error) => settle(() => reject(error)));
    worker.once("exit", (code) => settle(() => reject(new Error(`The database worker stopped unexpectedly (${code}).`))));
  });
}

export async function registerDatabase(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { dataDir } = ctx.config;
  const file = path.join(dataDir, "outpost.db");
  const known = knownMigrations();
  const dbstat = hasDbstat(ctx.sqlite);
  const version = (ctx.sqlite.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v;

  let space = measureSpace;
  let beforeVacuum: (() => Promise<void>) | undefined;
  let contents: DatabaseContents | null = null;
  let measuring: Promise<void> | null = null;
  let vacuuming = false;
  let copying = 0;
  let closed = false;
  /** Stops a measure in flight when the server stops. */
  const stopMeasuring = new AbortController();

  const changed = () => ctx.events.publish({ type: "database.changed" });

  /** Works out the contents in the worker, once at a time. */
  function measure(): Promise<void> {
    if (measuring) return measuring;
    measuring = runInWorker<DatabaseContents>({ task: "contents", file }, stopMeasuring.signal)
      .then((result) => {
        contents = result;
      })
      .catch((error) => {
        if (!closed) ctx.log.warn({ err: error }, "the database's contents could not be worked out");
      })
      .finally(() => {
        measuring = null;
        if (!closed) changed();
      });
    return measuring;
  }

  function databaseJobs(): JobRow[] {
    return ctx.jobs.findBySubject(SUBJECT);
  }
  const activeJob = (): JobRow | undefined =>
    databaseJobs()
      .filter((job) => job.state === "queued" || job.state === "running" || job.state === "paused")
      .at(-1);
  function lastResult<T>(type: string): T | null {
    const done = databaseJobs()
      .filter((job) => job.type === type && job.state === "succeeded" && job.result)
      .at(-1);
    return (done?.result as T | undefined) ?? null;
  }

  /** Work that must finish before space can be reclaimed: anything running but the reclaim itself, and a backup's copy. */
  function waitingFor(except?: string): string[] {
    const titles = ctx.jobs
      .list({ states: ["running"], limit: 50 })
      .filter((job) => job.id !== except)
      .map((job) => job.title);
    if (copying > 0) titles.push("A backup is copying the database");
    return titles;
  }

  async function room(usedBytes: number) {
    const disk = await space(dataDir);
    const tempDir = sqliteTempDir();
    const temp = tempDir ? await space(tempDir) : undefined;
    // VACUUM writes the rewritten database to a temporary file, then copies it back
    // through the write-ahead log: two copies of what is in use, on whichever drives
    // those are, besides the file itself, which keeps its size until the end.
    const sameDrive = !temp || !disk || temp.device === disk.device;
    const neededBytes = (sameDrive ? 2 * usedBytes : usedBytes) + SPACE_RESERVE_BYTES;
    const tempNeededBytes = sameDrive ? null : usedBytes;
    const enoughRoom =
      (disk === undefined || disk.freeBytes >= neededBytes) && (tempNeededBytes === null || (temp?.freeBytes ?? 0) >= tempNeededBytes);
    return { disk, neededBytes, tempNeededBytes, tempFreeBytes: sameDrive ? null : (temp?.freeBytes ?? null), enoughRoom };
  }

  const fileSize = async (name: string) => (await fs.promises.stat(name).catch(() => undefined))?.size ?? 0;

  async function status(request: Parameters<typeof backupRight>[0]): Promise<DatabaseStatus> {
    const pageSize = ctx.sqlite.pragma("page_size", { simple: true }) as number;
    const pages = ctx.sqlite.pragma("page_count", { simple: true }) as number;
    const unusedPages = ctx.sqlite.pragma("freelist_count", { simple: true }) as number;
    const journalMode = String(ctx.sqlite.pragma("journal_mode", { simple: true }));
    const applied = ctx.sqlite.prepare("SELECT count(*) AS n, max(created_at) AS last FROM __drizzle_migrations").get() as {
      n: number;
      last: number | null;
    };
    const [bytes, walBytes, place] = await Promise.all([fileSize(file), fileSize(`${file}-wal`), room((pages - unusedPages) * pageSize)]);
    const active = activeJob();
    return {
      file: { path: file, bytes, walBytes, pageSize, pages, unusedPages, unusedBytes: unusedPages * pageSize },
      disk: {
        freeBytes: place.disk?.freeBytes ?? null,
        totalBytes: place.disk?.totalBytes ?? null,
        low: place.disk !== undefined && place.disk.freeBytes < SPACE_RESERVE_BYTES,
        reserveBytes: SPACE_RESERVE_BYTES,
      },
      sqlite: { version, journalMode, dbstat },
      schema: {
        applied: applied.n,
        known,
        lastAppliedAt: applied.last === null ? null : Number(applied.last),
        state: applied.n === known ? "current" : applied.n < known ? "behind" : "ahead",
      },
      backup: ctx.services.backups.last(),
      contents,
      measuring: measuring !== null,
      lastCheck: lastResult<DatabaseCheck>(CHECK_JOB),
      lastVacuum: lastResult<DatabaseVacuum>(VACUUM_JOB),
      active: active ? toJobDto(active) : null,
      reclaim: {
        neededBytes: place.neededBytes,
        tempNeededBytes: place.tempNeededBytes,
        tempFreeBytes: place.tempFreeBytes,
        enoughRoom: place.enoughRoom,
        waitingFor: waitingFor(active?.state === "running" ? active.id : undefined),
        right: backupRight(request, ctx),
      },
    };
  }

  // ── Jobs ──

  ctx.jobs.register<{ kind: "quick" | "full" }>(CHECK_JOB, {
    queue: QUEUE,
    async run(run) {
      run.progress({ message: run.payload.kind === "quick" ? "Reading every page" : "Reading every page and every index" });
      const result = await runInWorker<DatabaseCheck>({ task: "check", file, kind: run.payload.kind }, run.signal);
      if (!result.ok) run.log.warn({ problems: result.problems }, "the database check found problems");
      return result as unknown as Record<string, unknown>;
    },
    onSettled: changed,
  });

  ctx.jobs.register<Record<string, never>>(VACUUM_JOB, {
    queue: QUEUE,
    async run(run) {
      // Nothing else starts from here on; anything already running must finish first.
      ctx.jobs.holdFor(QUEUE, BUSY);
      try {
        const busy = waitingFor(run.job.id);
        if (busy.length > 0) throw new PermanentJobError(`Space was not reclaimed, because other work started first: ${busy.join("; ")}.`);
        const pageSize = ctx.sqlite.pragma("page_size", { simple: true }) as number;
        const used =
          ((ctx.sqlite.pragma("page_count", { simple: true }) as number) -
            (ctx.sqlite.pragma("freelist_count", { simple: true }) as number)) *
          pageSize;
        const place = await room(used);
        if (!place.enoughRoom) throw new PermanentJobError("Space was not reclaimed, because the drive no longer has room for it.");
        run.progress({ message: "Rewriting the database without its unused pages" });
        vacuuming = true;
        // While the rewrite holds the write lock, a write from this thread would wait
        // here, holding up every request, and then fail. It fails at once instead.
        ctx.sqlite.pragma("busy_timeout = 0");
        try {
          await beforeVacuum?.();
          run.signal.throwIfAborted();
          // Not given the job's signal: stopped part way, the rewrite would be undone and
          // the time lost. If the server stops meanwhile, the rewrite ends with the
          // process and SQLite rolls it back from the log on the next start; nothing but
          // the time is lost.
          const result = await runInWorker<Omit<DatabaseVacuum, "at">>({ task: "vacuum", file });
          return { ...result, at: Date.now() };
        } finally {
          ctx.sqlite.pragma("busy_timeout = 5000");
          vacuuming = false;
        }
      } finally {
        ctx.jobs.release();
      }
    },
    onSettled(job) {
      changed();
      if (job.state === "succeeded" && !closed) void measure();
    },
  });

  // While the rewrite runs, a request that would change something is refused, in words
  // for a person, before it reaches a route that would fail on the locked database.
  app.addHook("onRequest", async (request) => {
    if (!vacuuming || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    if (!(request.routeOptions?.url ?? request.url).startsWith("/api/")) return;
    throw conflict(BUSY);
  });

  ctx.onClose.push(() => {
    closed = true;
    stopMeasuring.abort();
  });

  ctx.services.database = {
    busy: () => (vacuuming || ctx.jobs.holding ? BUSY : null),
    async whileCopying(copy) {
      if (vacuuming || ctx.jobs.holding) throw conflict(BUSY);
      copying += 1;
      try {
        return await copy();
      } finally {
        copying -= 1;
      }
    },
    setSpace(measureFn) {
      space = measureFn ?? measureSpace;
    },
    setBeforeVacuum(hook) {
      beforeVacuum = hook;
    },
  };

  // ── Routes ──

  app.get("/api/database", async (request): Promise<DatabaseStatus> => {
    // Worked out once after the server starts, the first time anyone looks; after that only when asked.
    if (!contents && !measuring) void measure();
    return status(request);
  });

  app.post("/api/database/contents", async (request): Promise<DatabaseStatus> => {
    void measure();
    return status(request);
  });

  const checkBody = z.object({ kind: z.enum(["quick", "full"]).default("quick") }).strict();
  app.post("/api/database/check", async (request) => {
    const { kind } = checkBody.parse(request.body ?? {});
    if (activeJob()) throw conflict("The database is already being checked or tidied. Wait for that to finish.");
    const job = ctx.jobs.enqueue(
      CHECK_JOB,
      { kind },
      { title: kind === "quick" ? "Check the database" : "Check the database fully", subject: SUBJECT },
    );
    return { job: toJobDto(job) };
  });

  app.post("/api/database/reclaim", async (request) => {
    assertBackupRight(request, ctx, "Reclaiming unused space in the database");
    if (activeJob()) throw conflict("The database is already being checked or tidied. Wait for that to finish.");
    const now = await status(request);
    if (now.file.unusedPages === 0) throw conflict("There is no unused space in the database to reclaim.");
    if (!now.reclaim.enoughRoom) {
      throw new AppError(
        "insufficient_space",
        "The drive the database is on does not have room to rewrite it. Free some space there first; the Storage screen says how much is needed.",
        { requiredBytes: now.reclaim.neededBytes, freeBytes: now.disk.freeBytes },
      );
    }
    if (now.reclaim.waitingFor.length > 0) {
      throw conflict(`Space can be reclaimed once this has finished, or been paused: ${now.reclaim.waitingFor.join("; ")}.`, {
        waitingFor: now.reclaim.waitingFor,
      });
    }
    const job = ctx.jobs.enqueue(VACUUM_JOB, {}, { title: "Reclaim unused space in the database", subject: SUBJECT });
    return { job: toJobDto(job) };
  });
}
