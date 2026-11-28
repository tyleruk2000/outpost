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
import type { JobDetail, JobEventKind, JobRef, JobWaiting } from "@outpost/shared";
import { and, asc, eq, gt, inArray, isNotNull, lt, lte, ne, notInArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.ts";
import { jobEvents, jobSamples, jobs } from "../db/schema.ts";
import { AppError, classifyNetworkError, messageOf, networkSentence } from "./errors.ts";
import type { EventBus } from "./events.ts";
import { newId } from "./ids.ts";

export type JobRow = typeof jobs.$inferSelect;
export type JobState = JobRow["state"];

export interface JobProgress {
  current?: number;
  total?: number | null;
  message?: string | null;
  /** What `current` and `total` count: "bytes", "passages", "pages". Kept until it is changed. */
  unit?: string | null;
  /** A stage the job has moved on to ("Reading the roads"). Each new one is a step in its history. */
  stage?: string;
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
/** The least time between two recorded samples of a job's progress, at first; it doubles each time they are thinned. */
const SAMPLE_EVERY_MS = 2_000;
/** Past this many samples of one job, every other one is dropped: the history stays bounded however long it runs. */
export const MAX_JOB_SAMPLES = 200;
/** Past this many steps in one job's history, the oldest after the first are dropped. */
export const MAX_JOB_EVENTS = 100;
/** How long the samples and history of a finished job are kept. */
export const JOB_HISTORY_KEPT_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
/** How many of the jobs queued ahead of one are named in its details. */
const AHEAD_NAMED = 5;
/** How far back a running job's rate is judged over: long enough to smooth out work done in batches. */
export const RATE_WINDOW_MS = 3 * 60 * 1000;
/** Less than this much time measured is too little to give a rate. */
const LEAST_RATE_SPAN_MS = 5_000;

type PacePoint = { at: number; current: number; unit: string | null };

/**
 * A running job's rate, in what its progress counts each second: over the last few
 * minutes in which it counted the same thing and the count did not start again. Null
 * until there is enough to go on.
 */
export function paceOf(points: readonly PacePoint[]): number | null {
  const last = points[points.length - 1];
  const first = points[0];
  if (!first || !last || last.at - first.at < LEAST_RATE_SPAN_MS) return null;
  return Math.max(0, (last.current - first.current) / ((last.at - first.at) / 1000));
}
/** The longest a timer may be set for; a job due later than this is looked at again then. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;

/** How many times in a row the server may stop while a job runs, with no orderly stop, before it is not started again. */
export const MAX_INTERRUPTIONS = 3;

/** Delay before retry `attempt` (1-based): 2s, 4s, 8s … capped at 5 minutes, with jitter. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(2_000 * 2 ** (attempt - 1), 300_000);
  return Math.round(base * (0.75 + random() * 0.5));
}

export class JobQueue {
  private readonly handlers = new Map<string, JobHandler<never>>();
  private readonly limits = new Map<string, number>();
  private readonly running = new Map<string, { controller: AbortController; queue: string }>();
  /** Where each running job's progress stood over the last few minutes, for its rate. In memory only. */
  private readonly paces = new Map<string, PacePoint[]>();
  /** `onSettled` hooks under way: a job's work is not over until its hook has finished too. */
  private settling = 0;
  /** Set only while a queued job is waiting for a time in the future: its `runAfter`. */
  private timer: { at: number; handle: NodeJS.Timeout } | undefined;
  private started = false;
  private closing = false;
  private prunedAt = 0;
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

  /** Every job type registered, for the test that each has a name in words. */
  registeredTypes(): string[] {
    return [...this.handlers.keys()];
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
    // A row still running was cut short with no orderly stop (an orderly stop leaves its job queued, see
    // execute): the process died while it ran, killed, out of memory, or the power cut. On a Raspberry Pi a power
    // cut is ordinary, so it does not use one of the job's attempts: the run is given its attempt back and the
    // interruption counted apart. Only a job that keeps going down with the server, MAX_INTERRUPTIONS times in a
    // row, is not started again: it would otherwise take the server down on every start.
    const left = this.db.select().from(jobs).where(eq(jobs.state, "running")).all();
    const now = Date.now();
    for (const row of left) {
      const interruptions = row.interruptions + 1;
      const attempts = Math.max(0, row.attempts - 1);
      if (interruptions >= MAX_INTERRUPTIONS) {
        const error = `Outpost stopped while this was running, ${interruptions} times, so it was not started again. Resume it to try again.`;
        this.db
          .update(jobs)
          .set({ state: "failed", attempts, interruptions, error, errorKind: "interrupted", finishedAt: now, updatedAt: now })
          .where(eq(jobs.id, row.id))
          .run();
        this.note(row.id, "state", "failed", error);
        void this.settle(this.require(row.id));
      } else {
        this.db
          .update(jobs)
          .set({ state: "queued", attempts, interruptions, updatedAt: now, progressMessage: "Resuming after restart" })
          .where(eq(jobs.id, row.id))
          .run();
        this.note(row.id, "restarted", "queued", null);
      }
    }
    this.prune();
    this.pump();
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearTimeout(this.timer.handle);
    this.timer = undefined;
    for (const { controller } of this.running.values()) controller.abort("shutdown" satisfies StopReason);
    // Every handler is asked to stop above and answers within moments; the wait is long so
    // that on a loaded machine none is still writing when the database is closed after this.
    await this.whenIdle(15_000);
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
    this.note(job.id, "state", job.state, null);
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
  list(filter: { states?: JobState[]; types?: string[]; excludeTypes?: string[]; limit?: number } = {}): JobRow[] {
    const wanted = and(
      filter.states?.length ? inArray(jobs.state, filter.states) : undefined,
      filter.types ? inArray(jobs.type, filter.types) : undefined,
      filter.excludeTypes?.length ? notInArray(jobs.type, filter.excludeTypes) : undefined,
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
    this.update(id, { state: "queued", error: null, errorKind: null, runAfter: 0, attempts: 0, interruptions: 0 }, { kind: "resumed" });
    queueMicrotask(() => this.pump());
    return this.require(id);
  }

  /**
   * One job with what it recorded as it went (its progress now and then, and the steps
   * of its history) and, when it is waiting, what it is waiting for.
   */
  detail(id: string): Omit<JobDetail, "job"> & { job: JobRow } {
    const job = this.require(id);
    const samples = this.db
      .select({ at: jobSamples.at, current: jobSamples.current, total: jobSamples.total, unit: jobSamples.unit })
      .from(jobSamples)
      .where(eq(jobSamples.jobId, id))
      .orderBy(asc(jobSamples.at), asc(jobSamples.id))
      .all();
    const events = this.db
      .select({ at: jobEvents.at, kind: jobEvents.kind, state: jobEvents.state, message: jobEvents.message })
      .from(jobEvents)
      .where(eq(jobEvents.jobId, id))
      .orderBy(asc(jobEvents.id))
      .all() as JobDetail["events"];
    return { job, samples, events, waiting: this.waitingOf(job) };
  }

  private waitingOf(job: JobRow): JobWaiting {
    const slots = this.limits.get(job.queue) ?? 1;
    const none: JobWaiting = { reason: null, slots, running: [], ahead: [], aheadCount: 0, held: null, retryAt: null };
    if (job.state === "paused") return { ...none, reason: "paused" };
    if (job.state !== "queued") return none;
    const ref = (row: JobRow): JobRef => ({ id: row.id, type: row.type, title: row.title, state: row.state });
    const running = this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.queue, job.queue), eq(jobs.state, "running")))
      .orderBy(asc(jobs.startedAt))
      .all()
      .map(ref);
    const now = Date.now();
    if (job.runAfter > now) return { ...none, reason: "retry", running, retryAt: job.runAfter };
    const ahead = this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.queue, job.queue),
          eq(jobs.state, "queued"),
          lte(jobs.runAfter, now),
          lt(jobs.createdAt, job.createdAt),
          ne(jobs.id, job.id),
        ),
      )
      .orderBy(asc(jobs.createdAt))
      .all();
    const held = this.held && this.held.queue !== job.queue ? this.held.reason : null;
    return {
      reason: held ? "held" : "turn",
      slots,
      running,
      ahead: ahead.slice(0, AHEAD_NAMED).map(ref),
      aheadCount: ahead.length,
      held,
      retryAt: null,
    };
  }

  /** A step in a job's history. At most `MAX_JOB_EVENTS` are kept: the first, and the newest. */
  private note(jobId: string, kind: JobEventKind, state: JobState, message: string | null): void {
    this.db.insert(jobEvents).values({ jobId, at: Date.now(), kind, state, message }).run();
    const count = this.db.select({ n: sql<number>`count(*)` }).from(jobEvents).where(eq(jobEvents.jobId, jobId)).get()?.n ?? 0;
    if (count <= MAX_JOB_EVENTS) return;
    this.db.run(
      sql`DELETE FROM job_events WHERE id IN (SELECT id FROM job_events WHERE job_id = ${jobId} ORDER BY id LIMIT ${count - MAX_JOB_EVENTS} OFFSET 1)`,
    );
  }

  /** Drops every other sample of a job, keeping its first and last. Returns how many are left. */
  private thinSamples(jobId: string): number {
    this.db.run(
      sql`DELETE FROM job_samples WHERE id IN (
        SELECT id FROM (
          SELECT id, row_number() OVER (ORDER BY at, id) AS n, count(*) OVER () AS c FROM job_samples WHERE job_id = ${jobId}
        ) WHERE n % 2 = 0 AND n < c
      )`,
    );
    return this.db.select({ n: sql<number>`count(*)` }).from(jobSamples).where(eq(jobSamples.jobId, jobId)).get()?.n ?? 0;
  }

  /** Removes the samples and history of jobs that ended more than a week ago. At most once an hour; sets no timer. */
  private prune(now = Date.now()): void {
    if (now - this.prunedAt < PRUNE_EVERY_MS) return;
    this.prunedAt = now;
    const ended = this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(isNotNull(jobs.finishedAt), lt(jobs.finishedAt, now - JOB_HISTORY_KEPT_MS)));
    this.db.delete(jobSamples).where(inArray(jobSamples.jobId, ended)).run();
    this.db.delete(jobEvents).where(inArray(jobEvents.jobId, ended)).run();
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
    if (this.running.size > 0 || this.settling > 0) return false;
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

  /**
   * Writes a change to a job and announces it. A change of state is also a step in its
   * history; `event` names a step that is more than that (a retry, a resume) or gives it words.
   */
  private update(
    id: string,
    patch: Partial<typeof jobs.$inferInsert>,
    event?: { kind: JobEventKind; message?: string | null },
  ): JobRow | undefined {
    const before = patch.state !== undefined ? this.get(id)?.state : undefined;
    this.db
      .update(jobs)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(jobs.id, id))
      .run();
    const job = this.get(id);
    if (job) {
      if (job.state === "running" && patch.progressCurrent !== undefined) this.recordPace(job);
      if (patch.state !== undefined && (event || before !== patch.state)) {
        this.note(id, event?.kind ?? "state", patch.state, event?.message ?? (patch.state === "failed" ? job.error : null));
      }
      this.announce(job);
    }
    return job;
  }

  private announce(job: JobRow): void {
    this.events.publish({ type: "job.updated", id: job.id, data: this.toDto(job) });
  }

  /** A job as the API gives it, with its rate while it runs. */
  toDto(job: JobRow): JobDto {
    return toJobDto(job, job.state === "running" ? this.rateOf(job.id) : null);
  }

  /** The job's rate now, in what its progress counts each second; null when not running or not yet known. */
  rateOf(id: string): number | null {
    const points = this.paces.get(id);
    return points ? paceOf(points) : null;
  }

  private recordPace(job: JobRow): void {
    const points = this.paces.get(job.id);
    if (!points) return;
    const now = Date.now();
    const last = points[points.length - 1];
    // Counting something else, or counting again from the start: the rate starts afresh.
    if (last && (last.unit !== job.progressUnit || job.progressCurrent < last.current)) points.length = 0;
    if (last && last.at === now) points.pop();
    points.push({ at: now, current: job.progressCurrent, unit: job.progressUnit });
    while (points.length > 2 && now - points[0]!.at > RATE_WINDOW_MS) points.shift();
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
    this.paces.set(job.id, []);
    const attempt = job.attempts + 1;
    const started = this.update(
      job.id,
      {
        state: "running",
        attempts: attempt,
        startedAt: job.startedAt ?? Date.now(),
        error: null,
        errorKind: null,
      },
      { kind: "state", message: attempt > 1 ? `Attempt ${attempt} of ${job.maxAttempts}` : null },
    );

    let lastWrite = 0;
    let pending: JobProgress | undefined;
    // Once the handler has returned or thrown, progress it still reports (a worker's last message, say) is
    // dropped: the row is settled, and the database may be closed by then.
    let ended = false;

    // Progress now and then, for the rate over time and the time left: bounded however long the job runs.
    let samples = this.db.select({ n: sql<number>`count(*)` }).from(jobSamples).where(eq(jobSamples.jobId, job.id)).get()?.n ?? 0;
    let sampleEvery = SAMPLE_EVERY_MS;
    let lastSample = 0;
    let unit = started?.progressUnit ?? null;
    let stage: string | undefined;
    const sample = (row: JobRow, force: boolean) => {
      const now = Date.now();
      if (!force && now - lastSample < sampleEvery) return;
      lastSample = now;
      this.db
        .insert(jobSamples)
        .values({ jobId: job.id, at: now, current: row.progressCurrent, total: row.progressTotal, unit: row.progressUnit })
        .run();
      samples += 1;
      if (samples > MAX_JOB_SAMPLES) {
        samples = this.thinSamples(job.id);
        sampleEvery *= 2;
      }
    };
    if (started) sample(started, true);

    const flush = (force = false) => {
      if (!pending) {
        const row = force ? this.get(job.id) : undefined;
        if (row) sample(row, true);
        return;
      }
      const patch: Partial<typeof jobs.$inferInsert> = {};
      if (pending.current !== undefined) patch.progressCurrent = Math.round(pending.current);
      if (pending.total !== undefined) patch.progressTotal = pending.total === null ? null : Math.round(pending.total);
      if (pending.message !== undefined) patch.progressMessage = pending.message;
      if (pending.unit !== undefined) patch.progressUnit = pending.unit;
      const newStage = pending.stage !== undefined && pending.stage !== stage ? pending.stage : undefined;
      const newUnit = pending.unit !== undefined && pending.unit !== unit;
      if (pending.unit !== undefined) unit = pending.unit;
      pending = undefined;
      lastWrite = Date.now();
      const row = this.update(job.id, patch);
      if (!row) return;
      if (newStage !== undefined) {
        stage = newStage;
        this.note(job.id, "stage", row.state, newStage);
      }
      sample(row, force || newStage !== undefined || newUnit);
    };

    const run: JobRun<never> = {
      job: this.require(job.id),
      payload: job.payload as never,
      signal: controller.signal,
      progress: (update) => {
        if (ended) return;
        pending = { ...pending, ...update };
        if (Date.now() - lastWrite >= PROGRESS_WRITE_INTERVAL_MS) flush();
      },
      log: this.log.child({ job: job.id, type: job.type }),
    };

    try {
      const result = await handler.run(run);
      ended = true;
      flush(true);
      this.update(job.id, { state: "succeeded", result: result ?? null, finishedAt: Date.now(), interruptions: 0 });
    } catch (error) {
      ended = true;
      flush(true);
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
        // Stopped in good order: the run did not fail and was not cut short by a crash, so it uses neither an attempt
        // nor an interruption. Queued for the next start (written quietly: the server is going down), which tells it
        // apart from a row still running, left by a process that died.
        this.db
          .update(jobs)
          .set({ state: "queued", attempts: Math.max(0, attempt - 1), updatedAt: Date.now(), progressMessage: "Resuming after restart" })
          .where(eq(jobs.id, job.id))
          .run();
        this.note(job.id, "restarted", "queued", null);
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
        // A failed fetch is said in words a person can act on, not undici's "fetch failed".
        const said = networkSentence(error, "The site this needs") ?? messageOf(error);
        if (!permanent && attempt < job.maxAttempts) {
          const delay = retryDelayMs(attempt);
          this.log.warn({ job: job.id, attempt, delay, err: messageOf(error) }, "job failed, will retry");
          this.update(
            job.id,
            {
              state: "queued",
              runAfter: Date.now() + delay,
              interruptions: 0,
              error: said,
              errorKind: kind,
              progressMessage: network === "offline" ? "Waiting for a connection" : "Waiting to retry",
            },
            { kind: "retry", message: said },
          );
        } else {
          this.log.error({ job: job.id, err: error }, "job failed");
          this.update(job.id, { state: "failed", error: said, errorKind: kind, finishedAt: Date.now(), interruptions: 0 });
        }
      }
    } finally {
      this.running.delete(job.id);
      this.paces.delete(job.id);
      const final = this.get(job.id);
      if (final && ["succeeded", "failed", "cancelled"].includes(final.state)) await this.settle(final);
      this.pump();
      // pump() does nothing during shutdown, but close() is waiting on exactly this.
      if (this.closing) this.wakeIfIdle();
    }
  }

  private async settle(job: JobRow): Promise<void> {
    this.prune();
    this.settling += 1;
    try {
      await this.handlers.get(job.type)?.onSettled?.(job);
    } catch (error) {
      this.log.error({ job: job.id, err: error }, "job onSettled failed");
    } finally {
      this.settling -= 1;
      this.wakeIfIdle();
    }
  }
}

export function toJobDto(job: JobRow, ratePerSecond: number | null = null) {
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
      unit: job.progressUnit,
      ratePerSecond,
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

export interface JobDto extends ReturnType<typeof toJobDto> {}

/** One job's details as the API gives them. */
export function toJobDetail(queue: JobQueue, detail: ReturnType<JobQueue["detail"]>): JobDetail {
  return { ...detail, job: queue.toDto(detail.job) };
}
