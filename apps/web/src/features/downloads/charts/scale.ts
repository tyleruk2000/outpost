/** Scale maths for the hand-drawn charts. Pure, so the numbers on an axis can be tested. */

export type Scale = (value: number) => number;

/** Maps a value in `domain` onto `range`, in a straight line. A domain of no width maps to the start of the range. */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const span = domain[1] - domain[0];
  if (span === 0) return () => range[0];
  const factor = (range[1] - range[0]) / span;
  return (value) => range[0] + (value - domain[0]) * factor;
}

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * The smallest "round" step (1, 2, 2.5 or 5 times a power of ten) that divides `span`
 * into at most `maxTicks` intervals.
 */
export function niceStep(span: number, maxTicks: number): number {
  if (!(span > 0) || maxTicks < 1) return 1;
  const rough = span / maxTicks;
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    // The small tolerance keeps 0.30000000000000004 from skipping a step that fits.
    if (multiple * power >= rough * (1 - 1e-9)) return multiple * power;
  }
  return 10 * power;
}

/**
 * Ticks from zero up to the first round value at or above `max`. The top tick is the
 * end of the axis, so the highest reading never touches the frame.
 */
export function niceTicks(max: number, maxTicks = 4): { ticks: number[]; max: number } {
  if (!(max > 0)) return { ticks: [0], max: 0 };
  const step = niceStep(max, maxTicks);
  const count = Math.ceil(max / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, index) => roundTo(index * step, step));
  return { ticks, max: ticks[ticks.length - 1]! };
}

/** Removes floating-point dust from a multiple of `step`. */
function roundTo(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(Math.min(20, decimals)));
}

/** Index of the entry of `sorted` (ascending) closest to `target`; -1 for an empty list. */
export function nearestIndex(sorted: readonly number[], target: number): number {
  if (sorted.length === 0) return -1;
  let low = 0;
  let high = sorted.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! <= target) low = middle;
    else high = middle;
  }
  return Math.abs(sorted[high]! - target) < Math.abs(sorted[low]! - target) ? high : low;
}

export interface Reading {
  /** Milliseconds since the epoch. */
  at: number;
  value: number;
}

/**
 * Averages readings into equal spans of time, for the table that mirrors a line chart:
 * a row per reading would be hundreds of rows nobody could listen to.
 */
export function bucketReadings(readings: readonly Reading[], bucketSeconds: number): Reading[] {
  if (readings.length === 0 || !(bucketSeconds > 0)) return [];
  const width = bucketSeconds * 1000;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const reading of readings) {
    const key = Math.floor(reading.at / width) * width;
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += reading.value;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([at, bucket]) => ({ at, value: Math.round(bucket.sum / bucket.count) }));
}
