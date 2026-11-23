/**
 * A task (a background job that is not a download) in words: how far it has got, how
 * fast it goes, about how long it has left, what it is waiting for and what happened.
 * Pure, so every sentence can be tested.
 */
import { formatBytes, formatDuration, type JobDto, type JobEvent, type JobSample, type JobWaiting, taskKind } from "@outpost/shared";
import { formatNumber } from "@/lib/utils";
import type { Reading } from "./charts/scale";
import { formatSpeed } from "./charts/speed";
import { clockAt } from "./charts/time-axis";
import type { TimelineLine } from "./detail-parts";
import { mapTaskTitle } from "./download-text";
import type { Tone } from "./plan-text";

type JobLike = Pick<JobDto, "type" | "state" | "progress" | "error" | "errorKind">;

/** What the job's numbers count: what it says, or what its kind usually counts; null when nobody knows. */
export function unitOf(job: Pick<JobDto, "type" | "progress">): string | null {
  return job.progress.unit ?? taskKind(job.type).unit ?? null;
}

const singular: Record<string, string> = {
  passages: "passage",
  pages: "page",
  files: "file",
  ways: "way",
  books: "book",
  items: "item",
  steps: "step",
  parts: "part",
  cells: "cell",
  documents: "document",
  tiles: "tile",
};

/** "1,204 passages", "1 page", "412 MB"; a bare number when the unit is not known. */
export function countWords(count: number, unit: string | null): string {
  if (unit === "bytes") return formatBytes(count);
  if (!unit) return formatNumber(count);
  return `${formatNumber(count)} ${count === 1 ? (singular[unit] ?? unit) : unit}`;
}

/** "1,204 of 5,310 passages", "412 MB of 1.90 GB"; null when the job has not said how much there is. */
export function progressText(job: Pick<JobDto, "type" | "progress">): string | null {
  const { current, total } = job.progress;
  const unit = unitOf(job);
  if (!total || total <= 0) return current > 0 && unit ? `${countWords(current, unit)} so far` : null;
  const done = Math.min(current, total);
  if (unit === "bytes") return `${formatBytes(done)} of ${formatBytes(total)}`;
  return `${formatNumber(done)} of ${countWords(total, unit)}`;
}

/** The share done, from 0 to 1; undefined without a total. */
export function fractionDone(job: Pick<JobDto, "progress">): number | undefined {
  const { current, total } = job.progress;
  return total && total > 0 ? Math.min(1, Math.max(0, current / total)) : undefined;
}

// ── Rate and time left ──────────────────────────────────────────────────────

/** Bytes are a speed, a second at a time; everything else is counted a minute at a time. */
export const ratePer = (unit: string | null): number => (unit === "bytes" ? 1 : 60);

/**
 * The rate between each sample and the one before, for the chart: per minute, or bytes
 * per second. Two samples of different units (a new stage counting something else) or
 * where the count went down (a stage that starts its count again) are not a rate.
 */
export function rateReadings(samples: readonly JobSample[]): Reading[] {
  const readings: Reading[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1]!;
    const after = samples[index]!;
    const seconds = (after.at - before.at) / 1000;
    if (seconds <= 0 || before.unit !== after.unit || after.current < before.current) continue;
    readings.push({ at: after.at, value: ((after.current - before.current) / seconds) * ratePer(after.unit) });
  }
  return readings;
}

/** How far back the rate now is judged over: long enough to smooth the jumps of work done in batches. */
export const RATE_WINDOW_MS = 3 * 60_000;
/** Less than this much time measured is too little to say a rate. */
const LEAST_SPAN_MS = 5_000;

/**
 * The rate now, smoothed: how much was done over the last few minutes of samples that
 * count the same thing, with the job's live figure as the newest point. Per minute, or
 * bytes per second. Null until there is enough to go on, and while it is not running.
 */
export function currentRate(samples: readonly JobSample[], job: Pick<JobDto, "type" | "state" | "progress" | "updatedAt">): number | null {
  if (job.state !== "running") return null;
  const unit = unitOf(job);
  const points = samples.map((sample) => ({ at: sample.at, current: sample.current, unit: sample.unit ?? unit }));
  const last = points[points.length - 1];
  if (!last || job.updatedAt > last.at) points.push({ at: job.updatedAt, current: job.progress.current, unit: job.progress.unit ?? unit });
  const newest = points[points.length - 1]!;
  // Back from the newest point while the count is of the same thing and does not go up on the way back.
  let first = newest;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point.unit !== newest.unit || point.current > first.current || newest.at - point.at > RATE_WINDOW_MS) break;
    first = point;
  }
  const span = newest.at - first.at;
  if (span < LEAST_SPAN_MS) return null;
  return ((newest.current - first.current) / (span / 1000)) * ratePer(newest.unit);
}

/** Seconds left at `rate`, only when the job says how much there is and it is moving. */
export function secondsLeft(job: Pick<JobDto, "type" | "progress">, rate: number | null): number | null {
  const { current, total } = job.progress;
  if (!total || total <= 0 || rate === null || rate <= 0) return null;
  const left = Math.max(0, total - current);
  return left / (rate / ratePer(unitOf(job)));
}

/** "312 passages a minute", "2.10 MB/s", "12 a minute". */
export function rateWords(rate: number, unit: string | null): string {
  if (unit === "bytes") return formatSpeed(rate);
  const shown = rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10;
  const count = shown === 1 ? 1 : 2;
  const name = unit ? ` ${count === 1 ? (singular[unit] ?? unit) : unit}` : "";
  return `${formatNumber(shown)}${name} a minute`;
}

/** An axis value: "300", "1.5k", "2 MB/s". */
export function rateTick(rate: number, unit: string | null): string {
  if (unit === "bytes") return formatSpeed(rate).replace(/\.0+ /, " ");
  return rate >= 1000 ? `${Math.round(rate / 100) / 10}k` : String(Math.round(rate * 10) / 10);
}

/** "about 13 minutes left". Rounded, because it is a guess. */
export function timeLeftWords(seconds: number): string {
  if (seconds < 45) return "less than a minute left";
  return `about ${formatDuration(seconds)} left`;
}

// ── State ───────────────────────────────────────────────────────────────────

export function taskStateWords(job: Pick<JobDto, "state" | "error">): { label: string; tone: Tone } {
  switch (job.state) {
    case "running":
      return { label: "Running", tone: "alive" };
    case "queued":
      return job.error ? { label: "Trying again soon", tone: "warning" } : { label: "Waiting", tone: "normal" };
    case "paused":
      return { label: "Paused", tone: "normal" };
    case "succeeded":
      return { label: "Finished", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    default:
      return { label: "Cancelled", tone: "normal" };
  }
}

/** Which of the list's filters a task comes under. */
export type TaskFilter = "running" | "waiting" | "finished" | "failed";

export function filterOf(job: Pick<JobDto, "state">): TaskFilter {
  if (job.state === "running") return "running";
  if (job.state === "queued" || job.state === "paused") return "waiting";
  if (job.state === "failed") return "failed";
  return "finished";
}

/** The line under a task's name: what it is doing now, or how it ended. */
export function taskNowWords(job: Pick<JobDto, "state" | "progress" | "error">): string {
  if (job.state === "queued") return job.progress.message ?? "Waiting for its turn";
  if (job.state === "paused") return "Paused";
  if (job.state === "running") return job.progress.message ?? "Working";
  if (job.state === "failed") return job.error ?? "It stopped with an error.";
  if (job.state === "cancelled") return "Cancelled before it finished";
  return "Finished";
}

/**
 * What a waiting task is waiting for, in a sentence or two. `now` is for the time of a
 * retry; `title` names what it waits behind.
 */
export function waitingWords(waiting: JobWaiting, now: number): string | null {
  switch (waiting.reason) {
    case "paused":
      return "Paused. Nothing more happens until it is resumed.";
    case "retry":
      return waiting.retryAt ? `It stopped with an error and tries again by itself ${atWords(waiting.retryAt, now)}.` : null;
    case "held":
      return `Other work waits while this runs: ${lowerFirst(waiting.held ?? "the server is busy")}`;
    case "turn": {
      const running = waiting.running[0];
      const room = waiting.slots === 1 ? "One task of this kind runs at a time" : `${waiting.slots} tasks of this kind run at a time`;
      const behind = running ? `Waiting for “${mapTaskTitle(running.title)}” to finish. ${room}.` : `Waiting for its turn. ${room}.`;
      if (waiting.aheadCount === 0) return behind;
      return `${behind} ${waiting.aheadCount === 1 ? "One more is" : `${formatNumber(waiting.aheadCount)} more are`} ahead of it.`;
    }
    default:
      return null;
  }
}

function atWords(at: number, now: number): string {
  const said = clockAt(at, now);
  return said.includes(" at ") ? said : `at ${said}`;
}

const lowerFirst = (text: string) => (text ? text[0]!.toLowerCase() + text.slice(1) : text);

/** What to do about a task that failed, in a sentence. */
export function failureAdvice(job: JobLike): string {
  const kind = taskKind(job.type);
  const again = kind.retry
    ? "Press Retry to run it again."
    : kind.from
      ? `Start it again from where it began (${kind.from.label.replace(/^Open /, "")}).`
      : "Start it again from where it began.";
  switch (job.errorKind) {
    case "offline":
      return `The server could not reach the internet. Check its connection, then try again. ${again}`;
    case "transient":
      return `It looked like a passing problem. ${again}`;
    case "storage_unavailable":
      return `A drive it needs is not connected. Reconnect it under Storage, then try again. ${again}`;
    case "not_found":
      return `Something it needs is missing. Put it back or choose it again, then try again. ${again}`;
    case "too_large":
      return "It is larger than Outpost will take on. Nothing more can be done for this one.";
    default:
      return again;
  }
}

// ── What happened ───────────────────────────────────────────────────────────

/** A task's history as steps in words, oldest first. */
export function describeTaskEvents(events: readonly JobEvent[]): TimelineLine[] {
  const lines: TimelineLine[] = [];
  let started = false;
  for (const event of events) {
    const line = ((): Omit<TimelineLine, "at"> | null => {
      switch (event.kind) {
        case "retry":
          return { title: "Stopped with an error; it will try again", detail: event.message, tone: "warning" };
        case "resumed":
          return { title: "Resumed", detail: null, tone: "normal" };
        case "restarted":
          return { title: "Queued again: Outpost restarted while it ran", detail: null, tone: "normal" };
        case "stage":
          return { title: event.message ?? "Moved on to its next stage", detail: null, tone: "normal" };
        default:
          break;
      }
      switch (event.state) {
        case "queued":
          return { title: lines.length === 0 ? "Added to the queue" : "Waiting again", detail: event.message, tone: "normal" };
        case "running": {
          const title = started ? "Started again" : "Started";
          started = true;
          return { title, detail: event.message, tone: "normal" };
        }
        case "paused":
          return { title: "Paused", detail: null, tone: "normal" };
        case "succeeded":
          return { title: "Finished", detail: null, tone: "success" };
        case "failed":
          return { title: "Failed", detail: event.message, tone: "danger" };
        case "cancelled":
          return { title: "Cancelled", detail: null, tone: "normal" };
        default:
          return null;
      }
    })();
    if (line) lines.push({ at: event.at, ...line });
  }
  return lines;
}
