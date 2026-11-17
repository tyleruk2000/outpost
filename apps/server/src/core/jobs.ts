/**
 * Persistent background jobs.
 *
 * Every long-running operation (downloads, text extraction, imports, moving a
 * collection, building an index) is a row in `jobs`. Rows survive restarts: whatever
 * was running when the process stopped is queued again and its handler decides how to
 * pick up where it left off.
 *
 * Work runs inside the server process, one named queue per kind of work, each with its
 * own concurrency limit so that, say, three downloads do not starve text extraction.
 */
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.ts";
import { jobs } from "../db/schema.ts";
import { AppError, classifyNetworkError, messageOf } from "./errors.ts";
import type { EventBus } from "./events.ts";
import { newId } from "./ids.ts";

export type JobRow = typeof jobs.$inferSelect;
export type JobState = JobRow["state"];

export interface JobProgress {
  current?: number;
  total?: number | null;
  message?: string | null;
}

export interface JobRun<P> {
  job: JobRow;
  payload: P;
  /** Aborted when the job is paused or cancelled, or the server is shutting down. */
  signal: AbortSignal;
  /** Record progress. Writes are throttled; call as often as is convenient. */
  progress(update: JobProgress): void;
  log: FastifyBaseLogger;
}

export interface JobHandler<P = Record<string, unknown>> {
  queue: string;
  run(run: JobRun<P>): Promise<Record<string, unknown> | undefined>;
  /** Called once when a job reaches a final state, including after the last retry. */
  onSettled?(job: JobRow): void | Promise<void>;
}

export interface EnqueueOptions {
  title: string;
  subject?: string;
  maxAttempts?: number;
  /** Start in the paused state; `resume` queues it. */
  paused?: boolean;
}

/** Thrown by handlers to fail a job without retrying, whatever attempts remain. */
export class PermanentJobError extends Error {
  readonly kind: string;
  constructor(message: string, kind = "permanent") {
    super(message);
    this.name = "PermanentJobError";
    this.kind = kind;
  }
}

/**
 * Thrown by a handler that was stopped part of the way through work that cannot be
 * undone, to say what it had done by then. A cancelled job keeps this as its result, so
 * "stopped" never means "nobody knows what happened". Pausing and shutting down ignore
 * it: the job runs again and picks up from what is left.
 */
export class StoppedWithResult extends Error {
  readonly result: Record<string, unknown>;
  constructor(result: Record<string, unknown>) {
    super("Stopped");
    this.name = "StoppedWithResult";
    this.result = result;
  }
}

type StopReason = "paused" | "cancelled" | "shutdown";

const PROGRESS_WRITE_INTERVAL_MS = 500;
/** The longest a timer may be set for; a job due later than this is looked at again then. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;

/** Delay before retry `attempt` (1-based): 2s, 4s, 8s … capped at 5 minutes, with jitter. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(2_000 * 2 ** (attempt - 1), 300_000);
  return Math.round(base * (0.75 + random() * 0.5));
}

export class JobQueue {
  private readonly handlers = new Map<string, JobHandler<never>>();
  private readonly limits = new Map<string, number>();
  private readonly running = new Map<string, { controller: AbortController; queue: string }>();
  /** Set only while a queued job is waiting for a time in the future: its `runAfter`. */
  private timer: { at: number; handle: NodeJS.Timeout } | undefined;
  private started = false;
  private closing = false;
  /** While set, only this queue starts work; what is queued on the others waits (see `holdFor`). */
  private held: { queue: string; reason: string } | null = null;
  private readonly idleWaiters: Array<() => void> = [];
  private readonly db: Db;
  private readonly events: EventBus;
  private readonly log: FastifyBaseLogger;

  constructor(db: Db, events: EventBus, log: FastifyBaseLogger) {
    this.db = db;
    this.events = events;
    this.log = log;
  }

  register<P>(type: string, handler: JobHandler<P>): void {
    if (this.handlers.has(type)) throw new Error(`Job type "${type}" is already registered.`);
    this.handlers.set(type, handler as JobHandler<never>);
    if (!this.limits.has(handler.queue)) this.limits.set(handler.queue, 1);
  }

  setConcurrency(queue: string, limit: number): void {
    this.limits.set(queue, Math.max(1, Math.floor(limit)));
    this.pump();
  }

  /**
   * Lets only `queue` start work until `release()`: jobs queued on every other queue wait
   * their turn, and start when it is released. Jobs already running are not stopped.
   * Reclaiming space in the database uses it, because nothing can be written while that
   * runs. `reason` says why, in words for a person.
   */
  holdFor(queue: string, reason: string): void {
    this.held = { queue, reason };
  }

  release(): void {
    this.held = null;
    queueMicrotask(() => this.pump());
  }

  /** Why other work is waiting, or null when nothing is held. */
  get holding(): string | null {
    return this.held?.reason ?? null;
  }

  /** Requeues anything left running by a previous process, then starts scheduling. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.db
      .update(jobs)
      .set({ state: "queued", updatedAt: Date.now(), progressMessage: "Resuming after restart" })
      .where(eq(jobs.state, "running"))
      .run();
    this.pump();
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearTimeout(this.timer.handle);
    this.timer = undefined;
    for (const { controller } of this.running.values()) controller.abort("shutdown" satisfies StopReason);
    await this.whenIdle(5_000);
  }

  enqueue<P extends Record<string, unknown>>(type: string, payload: P, options: EnqueueOptions): JobRow {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`No handler registered for job type "${type}".`);
    const now = Date.now();
    const row: typeof jobs.$inferInsert = {
      id: newId(),
      type,
      queue: handler.queue,
      state: options.paused ? "paused" : "queued",
      title: options.title,
      payload,
      subject: options.subject,
      maxAttempts: options.maxAttempts ?? 1,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(jobs).values(row).run();
    const job = this.get(row.id)!;
    this.announce(job);
    queueMicrotask(() => this.pump());
    return job;
  }

  get(id: string): JobRow | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  findBySubject(subject: string): JobRow[] {
    return this.db.select().from(jobs).where(eq(jobs.subject, subject)).orderBy(asc(jobs.createdAt)).all();
  }

  /**
   * The newest jobs first. `states` and `types` are applied in the query, before the
   * limit: a caller looking for its own kind of job must pass `types`, or a few hundred
   * newer jobs of another kind push the ones it is looking for out of what it is given.
   */
  list(filter: { states?: JobState[]; types?: string[]; limit?: number } = {}): JobRow[] {
    const wanted = and(
      filter.states?.length ? inArray(jobs.state, filter.states) : undefined,
      filter.types ? inArray(jobs.type, filter.types) : undefined,
    );
    return this.db
      .select()
      .from(jobs)
      .where(wanted)
      .orderBy(sql`${jobs.createdAt} desc`)
      .limit(filter.limit ?? 100)
      .all();
  }

  /** Stops a job but keeps it, so it can be resumed later. */
  pause(id: string): JobRow {
    return this.stop(id, "paused");
  }

  cancel(id: string): JobRow {
    return this.stop(id, "cancelled");
  }

  resume(id: string): JobRow {
    const job = this.require(id);
    if (job.state !== "paused" && job.state !== "failed") {
      throw new AppError("conflict", `This job is ${job.state} and cannot be resumed.`);
    }
    this.update(id, { state: "queued", error: null, errorKind: null, runAfter: 0, attempts: 0 });
    queueMicrotask(() => this.pump());
    return this.require(id);
  }

  /** Resolves when nothing is running or queued to run now. Used by tests and shutdown. */
  whenIdle(timeoutMs = 30_000): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref();
      this.idleWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private isIdle(): boolean {
    if (this.running.size > 0) return false;
    if (this.closing) return true;
    const waiting = this.db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.state, "queued"), lte(jobs.runAfter, Date.now())))
      .get();
    return (waiting?.n ?? 0) === 0;
  }

  private require(id: string): JobRow {
    const job = this.get(id);
    if (!job) throw new AppError("not_found", "Job was not found.");
    return job;
  }

  private stop(id: string, reason: "paused" | "cancelled"): JobRow {
    const job = this.require(id);
    if (["succeeded", "failed", "cancelled"].includes(job.state)) {
      if (reason === "cancelled" && job.state === "failed") {
        this.update(id, { state: "cancelled", finishedAt: Date.now() });
        return this.require(id);
      }
      throw new AppError("conflict", `This job has already ${job.state === "succeeded" ? "finished" : job.state}.`);
    }
    const active = this.running.get(id);
    if (active) {
      // The run loop writes the final state when the handler unwinds.
      active.controller.abort(reason satisfies StopReason);
    } else {
      this.update(id, {
        state: reason,
        finishedAt: reason === "cancelled" ? Date.now() : null,
      });
      if (reason === "cancelled") void this.settle(this.require(id));
    }
    return this.require(id);
  }

  private update(id: string, patch: Partial<typeof jobs.$inferInsert>): void {
    this.db
      .update(jobs)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(jobs.id, id))
      .run();
    const job = this.get(id);
    if (job) this.announce(job);
  }

  private announce(job: JobRow): void {
    this.events.publish({ type: "job.updated", id: job.id, data: toJobDto(job) });
  }

  private pump(): void {
    if (!this.started || this.closing) return;
    const now = Date.now();
    for (const [queue, limit] of this.limits) {
      if (this.held && queue !== this.held.queue) continue;
      let active = 0;
      for (const run of this.running.values()) if (run.queue === queue) active += 1;
      const free = limit - active;
      if (free <= 0) continue;
      const next = this.db
        .select()
        .from(jobs)
        .where(and(eq(jobs.queue, queue), eq(jobs.state, "queued"), lte(jobs.runAfter, now)))
        .orderBy(asc(jobs.createdAt))
        .limit(free)
        .all();
      for (const job of next) {
        this.execute(job).catch((error) => this.log.error({ job: job.id, err: error }, "the job runner could not record a job's end"));
      }
    }
    this.wakeAtNextDue(now);
    this.wakeIfIdle();
  }

  /**
   * Nothing polls. Work is started when it is queued, resumed or released, when a slot
   * frees up and when the concurrency changes; the one thing left is a job told to wait
   * (a retry, or one a previous process left waiting), so the runner sets one timer for
   * the earliest of those and is otherwise asleep.
   */
  private wakeAtNextDue(now: number): void {
    const next = this.db
      .select({ at: sql<number | null>`min(${jobs.runAfter})` })
      .from(jobs)
      .where(and(eq(jobs.state, "queued"), gt(jobs.runAfter, now)))
      .get()?.at;
    if (this.timer && this.timer.at === next) return;
    if (this.timer) clearTimeout(this.timer.handle);
    this.timer = undefined;
    if (next == null) return;
    const handle = setTimeout(
      () => {
        this.timer = undefined;
        this.pump();
      },
      Math.min(next - now + 10, LONGEST_WAIT_MS),
    );
    handle.unref();
    this.timer = { at: next, handle };
  }

  private wakeIfIdle(): void {
    if (this.isIdle()) for (const waiter of this.idleWaiters.splice(0)) waiter();
  }

  private async execute(job: JobRow): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      this.update(job.id, { state: "failed", error: `No handler for "${job.type}".`, finishedAt: Date.now() });
      return;
    }
    const controller = new AbortController();
    this.running.set(job.id, { controller, queue: job.queue });
    const attempt = job.attempts + 1;
    this.update(job.id, {
      state: "running",
      attempts: attempt,
      startedAt: job.startedAt ?? Date.now(),
      error: null,
      errorKind: null,
    });

    let lastWrite = 0;
    let pending: JobProgress | undefined;
    const flush = () => {
      if (!pending) return;
      const patch: Partial<typeof jobs.$inferInsert> = {};
      if (pending.current !== undefined) patch.progressCurrent = Math.round(pending.current);
      if (pending.total !== undefined) patch.progressTotal = pending.total === null ? null : Math.round(pending.total);
      if (pending.message !== undefined) patch.progressMessage = pending.message;
      pending = undefined;
      lastWrite = Date.now();
      this.update(job.id, patch);
    };

    const run: JobRun<never> = {
      job: this.require(job.id),
      payload: job.payload as never,
      signal: controller.signal,
      progress: (update) => {
        pending = { ...pending, ...update };
        if (Date.now() - lastWrite >= PROGRESS_WRITE_INTERVAL_MS) flush();
      },
      log: this.log.child({ job: job.id, type: job.type }),
    };

    try {
      const result = await handler.run(run);
      flush();
      this.update(job.id, { state: "succeeded", result: result ?? null, finishedAt: Date.now() });
    } catch (error) {
      flush();
      const reason = controller.signal.aborted ? (controller.signal.reason as StopReason) : undefined;
      if (reason === "paused") {
        this.update(job.id, { state: "paused", progressMessage: "Paused" });
      } else if (reason === "cancelled") {
        this.update(job.id, {
          state: "cancelled",
          finishedAt: Date.now(),
          ...(error instanceof StoppedWithResult ? { result: error.result } : {}),
        });
      } else if (reason === "shutdown") {
        // Leave the row as running; start() on the next boot queues it again.
      } else {
        const network = classifyNetworkError(error);
        const permanent = error instanceof PermanentJobError || error instanceof AppError;
        const kind =
          error instanceof PermanentJobError
            ? error.kind
            : network !== "other"
              ? network
              : error instanceof AppError
                ? error.code
                : "error";
        if (!permanent && attempt < job.maxAttempts) {
          const delay = retryDelayMs(attempt);
          this.log.warn({ job: job.id, attempt, delay, err: messageOf(error) }, "job failed, will retry");
          this.update(job.id, {
            state: "queued",
            runAfter: Date.now() + delay,
            error: messageOf(error),
            errorKind: kind,
            progressMessage: network === "offline" ? "Waiting for a connection" : "Waiting to retry",
          });
        } else {
          this.log.error({ job: job.id, err: error }, "job failed");
          this.update(job.id, { state: "failed", error: messageOf(error), errorKind: kind, finishedAt: Date.now() });
        }
      }
    } finally {
      this.running.delete(job.id);
      const final = this.get(job.id);
      if (final && ["succeeded", "failed", "cancelled"].includes(final.state)) await this.settle(final);
      this.pump();
      // pump() does nothing during shutdown, but close() is waiting on exactly this.
      if (this.closing) this.wakeIfIdle();
    }
  }

  private async settle(job: JobRow): Promise<void> {
    try {
      await this.handlers.get(job.type)?.onSettled?.(job);
    } catch (error) {
      this.log.error({ job: job.id, err: error }, "job onSettled failed");
    }
  }
}

export function toJobDto(job: JobRow) {
  return {
    id: job.id,
    type: job.type,
    queue: job.queue,
    state: job.state,
    title: job.title,
    subject: job.subject,
    progress: {
      current: job.progressCurrent,
      total: job.progressTotal,
      message: job.progressMessage,
    },
    error: job.error,
    errorKind: job.errorKind,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    result: job.result,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    updatedAt: job.updatedAt,
  };
}

export type JobDto = ReturnType<typeof toJobDto>;
