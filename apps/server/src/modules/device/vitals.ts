/**
 * How long the server's one thread is held up, and how long requests take.
 *
 * Event-loop delay is measured with Node's histogram, which runs a timer every
 * `RESOLUTION_MS` and records how late it fires. A timer that wakes 50 times a second is
 * not something to leave running on a Pi nobody is using (docs/development/server-modules.md,
 * "At rest"), and with nobody using it there is nothing to measure. So it runs only while
 * there is work: from a request until `QUIET_MS` after the last one, and for as long as a
 * job runs. What it saw is kept a minute at a time for the last `MINUTES_KEPT` minutes it
 * measured, with the worst since start.
 *
 * Request times are counted per route into the buckets Prometheus's client libraries
 * use by default, in memory, for /metrics. There are as many routes as the server has,
 * so this is bounded.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { EventLoopDelay } from "@outpost/shared";

export const RESOLUTION_MS = 20;
export const QUIET_MS = 2 * 60_000;
const MINUTES_KEPT = 60;
/** How often what the histogram holds is folded into the minute it belongs to, at most. */
const ROLL_MS = 5_000;

/** Seconds: the default buckets of Prometheus's client libraries. */
export const REQUEST_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

export interface RouteTimes {
  method: string;
  route: string;
  /** Per bucket, how many took no longer than it (cumulative, as Prometheus wants them). */
  buckets: number[];
  count: number;
  sumSeconds: number;
}

export interface Vitals {
  /** Something is happening: measure, if not already. */
  touch(): void;
  /** A request was answered. */
  answered(method: string, route: string, seconds: number): void;
  eventLoop(): EventLoopDelay;
  routes(): RouteTimes[];
  /** The worst hold-up in the last `minutes`, in milliseconds, or null when nothing was measured then. */
  worstSince(minutes: number): number | null;
  close(): void;
}

interface Minute {
  at: number;
  worstMs: number;
  sumMs: number;
  samples: number;
}

export function createVitals(options: { jobsRunning: () => boolean; now?: () => number }): Vitals {
  const now = options.now ?? Date.now;
  let histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
  let lastActivity = 0;
  let lastRoll = 0;
  let quietTimer: NodeJS.Timeout | undefined;
  const minutes: Minute[] = [];
  let worst: { at: number; ms: number } | null = null;
  const routes = new Map<string, RouteTimes>();

  /** Folds what the histogram holds into this minute, and starts it afresh. Delays are how late the timer was, past its own interval. */
  function roll() {
    lastRoll = now();
    if (!histogram || histogram.count === 0) return;
    const late = (ns: number) => Math.max(0, ns / 1e6 - RESOLUTION_MS);
    const worstMs = late(histogram.max);
    const meanMs = late(histogram.mean);
    const samples = histogram.count;
    histogram.reset();
    const at = Math.floor(lastRoll / 60_000) * 60_000;
    let minute = minutes.at(-1);
    if (minute?.at !== at) {
      minute = { at, worstMs: 0, sumMs: 0, samples: 0 };
      minutes.push(minute);
      if (minutes.length > MINUTES_KEPT) minutes.shift();
    }
    minute.worstMs = Math.max(minute.worstMs, worstMs);
    minute.sumMs += meanMs * samples;
    minute.samples += samples;
    if (!worst || worstMs > worst.ms) worst = { at: lastRoll, ms: worstMs };
  }

  function stop() {
    roll();
    histogram?.disable();
    histogram = null;
  }

  function checkQuiet() {
    quietTimer = undefined;
    const left = lastActivity + QUIET_MS - now();
    if (left > 0 || options.jobsRunning()) {
      quietTimer = setTimeout(checkQuiet, Math.max(left, 10_000));
      quietTimer.unref();
      return;
    }
    stop();
  }

  return {
    touch() {
      lastActivity = now();
      if (!histogram) {
        histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
        histogram.enable();
        lastRoll = lastActivity;
      } else if (lastActivity - lastRoll >= ROLL_MS) {
        roll();
      }
      if (!quietTimer) {
        quietTimer = setTimeout(checkQuiet, QUIET_MS);
        quietTimer.unref();
      }
    },

    answered(method, route, seconds) {
      const key = `${method} ${route}`;
      let entry = routes.get(key);
      if (!entry) {
        entry = { method, route, buckets: REQUEST_BUCKETS.map(() => 0), count: 0, sumSeconds: 0 };
        routes.set(key, entry);
      }
      for (const [index, bound] of REQUEST_BUCKETS.entries()) if (seconds <= bound) entry.buckets[index] = (entry.buckets[index] ?? 0) + 1;
      entry.count += 1;
      entry.sumSeconds += seconds;
    },

    eventLoop() {
      roll();
      return {
        measuring: histogram !== null,
        minutes: minutes.map((minute) => ({
          at: minute.at,
          worstMs: Math.round(minute.worstMs),
          meanMs: Math.round((minute.samples > 0 ? minute.sumMs / minute.samples : 0) * 10) / 10,
        })),
        worst: worst ? { at: worst.at, ms: Math.round(worst.ms) } : null,
      };
    },

    routes() {
      return [...routes.values()].sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
    },

    worstSince(count) {
      roll();
      const since = now() - count * 60_000;
      const recent = minutes.filter((minute) => minute.at + 60_000 > since);
      return recent.length > 0 ? Math.max(...recent.map((minute) => minute.worstMs)) : null;
    },

    close() {
      clearTimeout(quietTimer);
      histogram?.disable();
      histogram = null;
    },
  };
}
