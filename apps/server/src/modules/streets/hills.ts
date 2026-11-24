/**
 * A walk or a ride re-timed over the installed terrain. The streets service is built without heights, so it times
 * every street as if it were flat; its line is kept (it follows real paths and streets) and its times are put right
 * here, stretch by stretch, from the heights under the line.
 *
 * How:
 *  1. The line is read every 25 m (further apart on a very long route, so that it is never more than 4,000 points)
 *     and the height under each point is read from the installed terrain (maps/elevation.ts).
 *  2. The heights are smoothed over about 100 m (a running mean of five points), so that the noise of the terrain
 *     and the odd building or bridge are not counted as climbing.
 *  3. Each 25 m is slowed or sped by its slope: on foot by Tobler's hiking function as a share of his pace on the
 *     flat (the same rule as the walking reach), by bicycle by Valhalla's own grade factors for its bicycle costing
 *     (`cycleGradeFactor`, in the shared package with its source). Slopes are taken no steeper than 1 in 2.
 *  4. Each line of the directions keeps the streets service's own time (which allows for steps, rough paths and
 *     crossings) multiplied by how much its slopes slow or speed it: a line on the flat keeps its time exactly.
 *
 * The climb and the descent are the rises and falls of the smoothed heights; the steepest stretch is the steepest
 * 250 m of them, either way. Where terrain runs out along the route those stretches keep their flat time, and the
 * answer says the terrain was partial.
 */
import { cycleGradeFactor, EARTH_RADIUS_METERS, type StreetDirections, type StreetsRouteHills, walkGradeFactor } from "@outpost/shared";

const DEG = Math.PI / 180;
/** Metres between the points the heights are read at. */
export const HILLS_STEP_M = 25;
const MOST_POINTS = 4000;
/** Points either side in the running mean: two, so five points, about 100 m. */
const SMOOTH = 2;
/** The length of the steepest stretch looked for, in metres. */
export const STEEPEST_M = 250;
/** Slopes are taken no steeper than this (rise over run) when timing: steeper is the terrain's noise or a bridge. */
const STEEPEST_SLOPE = 0.5;
const PROFILE_POINTS = 200;

export type HillsMode = "walk" | "cycle";

function metersBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const lat = ((a[1] + b[1]) / 2) * DEG;
  const dx = (b[0] - a[0]) * DEG * Math.cos(lat);
  const dy = (b[1] - a[1]) * DEG;
  return Math.hypot(dx, dy) * EARTH_RADIUS_METERS;
}

/** Points every `step` metres along a line, with the distance along it of each. */
export function alongLine(line: ReadonlyArray<readonly [number, number]>, step: number): { points: Array<[number, number]>; at: number[] } {
  const points: Array<[number, number]> = [];
  const at: number[] = [];
  if (line.length === 0) return { points, at };
  points.push([line[0]![0], line[0]![1]]);
  at.push(0);
  let walked = 0;
  let next = step;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1]!;
    const b = line[index]!;
    const length = metersBetween(a, b);
    while (length > 0 && next <= walked + length) {
      const share = (next - walked) / length;
      points.push([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share]);
      at.push(next);
      next += step;
    }
    walked += length;
  }
  const last = line.at(-1)!;
  if (walked - at.at(-1)! > 1) {
    points.push([last[0], last[1]]);
    at.push(walked);
  }
  return { points, at };
}

/**
 * A running mean of `SMOOTH` points either side, over the known heights only; as many either side as there are
 * towards the ends, so that the start and the end keep their own heights.
 */
function smooth(heights: Array<number | null>): Array<number | null> {
  return heights.map((height, index) => {
    if (height === null) return null;
    const reach = Math.min(SMOOTH, index, heights.length - 1 - index);
    let sum = 0;
    let count = 0;
    for (let other = index - reach; other <= index + reach; other += 1) {
      const value = heights[other];
      if (value != null) {
        sum += value;
        count += 1;
      }
    }
    return sum / count;
  });
}

export interface Retimed {
  directions: StreetDirections;
  hills: StreetsRouteHills | null;
}

/**
 * The directions with each line's time put right for its slopes, and the hills along the way. `line` is the route's
 * whole line as the streets service drew it (not the simplified one for drawing). Null hills when no terrain covers
 * any of it: the directions are then given back as they came.
 */
export async function retime(
  directions: StreetDirections,
  line: ReadonlyArray<readonly [number, number]>,
  heightsAt: (points: Array<[number, number]>, step: number) => Promise<Array<number | null>>,
  mode: HillsMode,
  terrain: string | null,
): Promise<Retimed> {
  const unchanged = { directions, hills: null };
  if (line.length < 2) return unchanged;
  let length = 0;
  for (let index = 1; index < line.length; index += 1) length += metersBetween(line[index - 1]!, line[index]!);
  const step = Math.max(HILLS_STEP_M, length / MOST_POINTS);
  const { points, at } = alongLine(line, step);
  const raw = await heightsAt(points, step);
  const known = raw.filter((height) => height !== null).length;
  if (known === 0) return unchanged;
  const heights = smooth(raw);

  const factorOf = mode === "walk" ? walkGradeFactor : cycleGradeFactor;
  // For each stretch between two points: its length, and the time it takes as a share of its time on the flat.
  const slow: number[] = [];
  let climb = 0;
  let descent = 0;
  for (let index = 1; index < points.length; index += 1) {
    const run = at[index]! - at[index - 1]!;
    const [h0, h1] = [heights[index - 1], heights[index]];
    if (h0 == null || h1 == null || run <= 0) {
      slow.push(1);
      continue;
    }
    const rise = h1 - h0;
    if (rise > 0) climb += rise;
    else descent -= rise;
    const slope = Math.max(-STEEPEST_SLOPE, Math.min(STEEPEST_SLOPE, rise / run));
    slow.push(1 / factorOf(slope));
  }

  // Each line covers its share of the route in turn; its distance is the streets service's, scaled to the line drawn.
  const said = directions.lines.reduce((sum, each) => sum + each.distanceM, 0);
  const scale = said > 0 ? length / said : 1;
  let from = 0;
  let durationS = 0;
  const ranges: Array<[number, number]> = [];
  const lines = directions.lines.map((each) => {
    const to = from + each.distanceM * scale;
    ranges.push([from, to]);
    let weighted = 0;
    let covered = 0;
    for (let index = 1; index < at.length; index += 1) {
      const overlap = Math.min(to, at[index]!) - Math.max(from, at[index - 1]!);
      if (overlap <= 0) continue;
      weighted += overlap * slow[index - 1]!;
      covered += overlap;
    }
    from = to;
    // A ferry keeps its time: hills are not the sea's.
    const factor = covered > 0 && each.kind !== "ferry" ? weighted / covered : 1;
    const retimed = Math.round(each.durationS * factor);
    durationS += retimed;
    return { ...each, durationS: retimed };
  });

  // The steepest 250 m, either way.
  let steepest: StreetsRouteHills["steepest"] = null;
  const span = Math.max(1, Math.round(STEEPEST_M / step));
  for (let index = 0; index + span < points.length; index += 1) {
    const [h0, h1] = [heights[index], heights[index + span]];
    if (h0 == null || h1 == null) continue;
    const run = at[index + span]! - at[index]!;
    const grade = ((h1 - h0) / run) * 100;
    if (Math.abs(grade) < 3 || (steepest && Math.abs(grade) <= Math.abs(steepest.gradePercent))) continue;
    const middle = at[index]! + run / 2;
    const lineIndex = Math.max(
      0,
      ranges.findIndex(([start, end]) => middle >= start && middle < end),
    );
    const point = points[index]!;
    steepest = {
      gradePercent: Math.round(grade * 10) / 10,
      lengthM: Math.round(run),
      fromM: Math.round(at[index]!),
      at: [Math.round(point[0] * 1e5) / 1e5, Math.round(point[1] * 1e5) / 1e5],
      lineIndex,
    };
  }

  const values = heights.filter((height): height is number => height !== null);
  const profile: Array<[number, number]> = [];
  const every = Math.max(1, Math.ceil(points.length / PROFILE_POINTS));
  for (let index = 0; index < points.length; index += every) {
    const height = heights[index];
    if (height != null) profile.push([Math.round(at[index]!), Math.round(height)]);
  }
  const lastHeight = heights.at(-1);
  if (lastHeight != null && profile.at(-1)?.[0] !== Math.round(at.at(-1)!)) profile.push([Math.round(at.at(-1)!), Math.round(lastHeight)]);

  return {
    directions: { ...directions, lines, durationS },
    hills: {
      coverage: known === raw.length ? "terrain" : "partial",
      climbM: Math.round(climb),
      descentM: Math.round(descent),
      highestM: Math.round(Math.max(...values)),
      lowestM: Math.round(Math.min(...values)),
      flatDurationS: directions.durationS,
      steepest,
      profile,
      terrain,
    },
  };
}
