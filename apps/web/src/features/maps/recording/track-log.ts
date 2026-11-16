/**
 * The arithmetic of recording a track: which of the positions a device reports are
 * kept, and what the kept ones add up to. Nothing here touches the browser, so every
 * rule can be checked against numbers worked out by hand (`track-log.test.ts`).
 *
 * The rules, and why:
 *
 * - **A fix the device itself calls poor is ignored.** Each fix comes with a radius the
 *   device believes it is within (the Geolocation specification makes it the 68%
 *   level). Over 30 m, the fix is taken to come from the phone network or from a badly
 *   obstructed sky rather than from a clear view of the satellites; a line drawn
 *   through such fixes would zigzag by more than a path is wide.
 * - **A fix has to be a real move away from the last kept point**: at least 5 m, and
 *   at least its own radius. A displacement smaller than the uncertainty is not
 *   evidence of movement, so a device lying on a wall adds nothing to the distance
 *   while its position wanders. The 5 m floor is there so that a device claiming a
 *   very small radius still has to go a few steps before a point is added; the cost
 *   is that a corner tighter than 5 m is cut.
 * - **Time only goes forwards.** A fix no later than the last kept point is dropped.
 * - **A height is kept as the device gives it**, unless the device says it is good to
 *   worse than 30 m. Climb is added up exactly as the server adds it up for any track
 *   (rises counted once the height has moved 3 m from the last counted one), so the
 *   figure shown while walking is the figure the saved track gets.
 * - **Moving time** is the time between two kept points one after the other, when the
 *   stretch between them was covered at 1 km/h or more. Standing still produces no
 *   kept points, so the long gap that ends a rest is slower than that and is left out.
 *
 * None of these numbers has been tried on a hillside. They are the reasoning above.
 */
import { ASCENT_THRESHOLD_METERS, haversineMeters } from "@outpost/shared";

/** A fix whose own radius is worse than this is not recorded. */
export const MAX_ACCURACY_METERS = 30;
/** The least a kept point is from the one before it. */
export const MIN_MOVE_METERS = 5;
/** A height the device says is worse than this is left off its point. */
export const MAX_ALTITUDE_ACCURACY_METERS = 30;
/** Slower than this between two kept points is not counted as moving: 1 km/h, in metres a second. */
export const MIN_MOVING_SPEED = 1000 / 3600;
/**
 * The page out of sight for longer than this, with no position arriving, breaks the
 * line: what follows is a new stretch, not joined to the last by a straight line
 * across ground that was never recorded.
 */
export const BACKGROUND_GAP_MS = 60_000;
/** A fix's own clock is believed when it is within this of the device's; otherwise the device's clock is used. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60_000;

/** One position as the device reported it. */
export interface Fix {
  lat: number;
  lon: number;
  /** Radius in metres the device believes it is within. */
  accuracy: number;
  /** Metres, as the device gives it; null when it gives none. */
  altitude: number | null;
  altitudeAccuracy: number | null;
  /** When the position was taken, in milliseconds. */
  time: number;
}

/** One point of a recording, as it is kept on the device and written to GPX. */
export interface RecordedPoint {
  /** Which stretch it belongs to. A new stretch starts after every pause or interruption. */
  segment: number;
  time: number;
  /** Rounded to six decimal places, as the server stores positions. */
  lat: number;
  lon: number;
  /** Rounded to a tenth of a metre; null when the device gave no usable height. */
  ele: number | null;
  accuracy: number;
}

export type FixRefusal = "invalid" | "inaccurate" | "out-of-order" | "too-close";
export type Verdict = { keep: true; point: RecordedPoint } | { keep: false; reason: FixRefusal };

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The time to give a fix: its own, unless that is nowhere near the device's clock. */
export function fixTime(timestamp: number, now: number): number {
  return Number.isFinite(timestamp) && Math.abs(timestamp - now) <= TIMESTAMP_TOLERANCE_MS ? Math.round(timestamp) : now;
}

/**
 * Whether a fix becomes a point of the recording. `last` is the last point kept, in
 * whatever stretch; `segment` is the stretch being recorded now.
 */
export function judgeFix(fix: Fix, last: RecordedPoint | null, segment: number): Verdict {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180) {
    return { keep: false, reason: "invalid" };
  }
  if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || !Number.isFinite(fix.time)) return { keep: false, reason: "invalid" };
  if (fix.accuracy > MAX_ACCURACY_METERS) return { keep: false, reason: "inaccurate" };
  if (last && fix.time <= last.time) return { keep: false, reason: "out-of-order" };
  const lat = round(fix.lat, 6);
  const lon = round(fix.lon, 6);
  // The first point of a stretch is kept wherever it is: there is nothing in the stretch to be too close to.
  if (last && last.segment === segment) {
    const moved = haversineMeters(last.lat, last.lon, lat, lon);
    if (moved < Math.max(MIN_MOVE_METERS, fix.accuracy)) return { keep: false, reason: "too-close" };
  }
  const heightUsable =
    fix.altitude !== null &&
    Number.isFinite(fix.altitude) &&
    (fix.altitudeAccuracy === null || !Number.isFinite(fix.altitudeAccuracy) || fix.altitudeAccuracy <= MAX_ALTITUDE_ACCURACY_METERS);
  return {
    keep: true,
    point: {
      segment,
      time: fix.time,
      lat,
      lon,
      ele: heightUsable ? round(fix.altitude as number, 1) : null,
      accuracy: round(fix.accuracy, 1),
    },
  };
}

/** What a recording adds up to so far. */
export interface Totals {
  points: number;
  /** Metres along each stretch. The gaps between stretches are not counted: they were not recorded. */
  distanceMeters: number;
  /** Milliseconds between kept points that were covered at walking pace or faster. */
  movingMs: number;
  /** Metres climbed, or null while no point has a height. */
  ascentMeters: number | null;
  firstTime: number | null;
  lastTime: number | null;
}

/** Totals, with what is needed to add the next point to them. */
export interface Tally extends Totals {
  last: RecordedPoint | null;
  /** The height the next rise is measured from, in the stretch `last` belongs to. */
  ascentFrom: number | null;
  /** The sum of rises, unrounded; `ascentMeters` is this to a tenth of a metre. */
  ascentRaw: number;
  distanceRaw: number;
}

export const emptyTally = (): Tally => ({
  points: 0,
  distanceMeters: 0,
  movingMs: 0,
  ascentMeters: null,
  firstTime: null,
  lastTime: null,
  last: null,
  ascentFrom: null,
  ascentRaw: 0,
  distanceRaw: 0,
});

/** The tally with one more kept point. Points are added in the order they were kept. */
export function addPoint(tally: Tally, point: RecordedPoint): Tally {
  const next: Tally = { ...tally, points: tally.points + 1, last: point, lastTime: point.time, firstTime: tally.firstTime ?? point.time };
  const joined = tally.last !== null && tally.last.segment === point.segment;
  if (joined && tally.last) {
    const meters = haversineMeters(tally.last.lat, tally.last.lon, point.lat, point.lon);
    const milliseconds = point.time - tally.last.time;
    next.distanceRaw = tally.distanceRaw + meters;
    next.distanceMeters = round(next.distanceRaw, 1);
    if (milliseconds > 0 && meters / (milliseconds / 1000) >= MIN_MOVING_SPEED) next.movingMs = tally.movingMs + milliseconds;
  }
  // Each stretch measures its climb from its own first height, as the server does for each segment of a track.
  let from = joined ? tally.ascentFrom : null;
  if (point.ele !== null) {
    if (from === null) from = point.ele;
    else if (point.ele - from >= ASCENT_THRESHOLD_METERS) {
      next.ascentRaw = tally.ascentRaw + (point.ele - from);
      from = point.ele;
    } else if (from - point.ele >= ASCENT_THRESHOLD_METERS) {
      from = point.ele;
    }
    next.ascentMeters = round(next.ascentRaw, 1);
  }
  next.ascentFrom = from;
  return next;
}

export function tallyOf(points: Iterable<RecordedPoint>): Tally {
  let tally = emptyTally();
  for (const point of points) tally = addPoint(tally, point);
  return tally;
}

export const totalsOf = (tally: Totals): Totals => ({
  points: tally.points,
  distanceMeters: tally.distanceMeters,
  movingMs: tally.movingMs,
  ascentMeters: tally.ascentMeters,
  firstTime: tally.firstTime,
  lastTime: tally.lastTime,
});

/** "0:42:10", or "4:05" under an hour. Whole seconds, rounded down, as a stopwatch shows them. */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const two = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${minutes}:${two(seconds % 60)}`;
}

/** "about 4 minutes", for a stretch of time that is said in a sentence. */
export function formatSpan(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 90) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}${rest ? ` ${rest} min` : ""}`;
}

/** The most vertices the line drawn while recording has. The saved track keeps every point. */
export const DISPLAY_MAX_POINTS = 20_000;

/**
 * The line drawn on the map while recording. A long day is tens of thousands of points
 * and the map is handed the whole line every time one is added, so past
 * `DISPLAY_MAX_POINTS` the drawn line keeps every second point, then every fourth, and
 * so on. Only the drawing is thinned: the recording itself is on the device in full.
 */
export class DisplayLine {
  private readonly lines: Array<Array<[lon: number, lat: number]>> = [];
  private segment = -1;
  private count = 0;
  private stride = 1;
  private skipped = 0;
  /** The newest point, when it was not due to be drawn as a vertex: the line still has to reach it. */
  private tail: [number, number] | null = null;
  private readonly max: number;

  constructor(max = DISPLAY_MAX_POINTS) {
    this.max = Math.max(4, max);
  }

  add(point: Pick<RecordedPoint, "segment" | "lat" | "lon">): void {
    const position: [number, number] = [point.lon, point.lat];
    if (point.segment !== this.segment) {
      this.closeTail();
      this.segment = point.segment;
      this.lines.push([position]);
      this.count += 1;
      this.skipped = 0;
    } else if (this.skipped + 1 >= this.stride) {
      this.lines.at(-1)?.push(position);
      this.count += 1;
      this.skipped = 0;
      this.tail = null;
    } else {
      this.skipped += 1;
      this.tail = position;
    }
    if (this.count > this.max) this.halve();
  }

  /** A stretch always ends where it really ended, whatever the stride. */
  private closeTail(): void {
    if (this.tail) {
      this.lines.at(-1)?.push(this.tail);
      this.count += 1;
    }
    this.tail = null;
  }

  private halve(): void {
    this.count = 0;
    for (const [index, line] of this.lines.entries()) {
      const kept = line.filter((_, position) => position % 2 === 0 || position === line.length - 1);
      this.lines[index] = kept;
      this.count += kept.length;
    }
    this.stride *= 2;
  }

  /** The stretches to draw, each a list of [longitude, latitude]. */
  coordinates(): Array<Array<[number, number]>> {
    if (!this.tail) return this.lines;
    return this.lines.map((line, index) => (index === this.lines.length - 1 ? [...line, this.tail as [number, number]] : line));
  }

  /** Where the line ends now. */
  head(): [lon: number, lat: number] | null {
    return this.tail ?? this.lines.at(-1)?.at(-1) ?? null;
  }
}

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * An id for a new recording, in the form the server's own ids take: ten characters of
 * the time and sixteen of chance. The saved track has this id, which is what lets a
 * save be sent again safely.
 */
export function newRecordingId(now: number, random: (count: number) => ArrayLike<number>): string {
  let time = "";
  let rest = Math.max(0, Math.floor(now));
  for (let index = 0; index < 10; index += 1) {
    time = CROCKFORD[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  return time + Array.from(random(16), (byte) => CROCKFORD[byte % 32]).join("");
}
