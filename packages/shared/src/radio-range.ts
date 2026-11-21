/**
 * The estimated range of a repeater: how far out a station at a stated height still has
 * line of sight to the repeater's aerial, bearing by bearing, over installed terrain.
 *
 * It is the same line-of-sight test as the check between two points (`radio.ts`): a
 * straight ray between the two aerials over an Earth of 4/3 radius, blocked wherever
 * the ground stands above it. Walking outward along one bearing that test is made for
 * every sample at once, in one pass, by the usual viewshed method: seen from the
 * repeater's aerial, with each height lowered by the Earth's curve, d² / (2·k·R), a
 * station is in sight when the slope up to it is at least the steepest slope up to any
 * ground nearer in. That is the same condition as "nothing between them stands above
 * the ray" in `analyseSight` (its tests check one against the other), worked out in
 * one pass along the bearing instead of once per sample.
 *
 * It is geometry over a terrain model and nothing more: no power, no aerial gain or
 * pattern, no frequency, no buildings or trees, no signal bending over a ridge.
 */
import type { RouteElevation, RoutePoint } from "./maps.ts";
import { EARTH_RADIUS_METERS, maxSightDistanceMeters, RADIO_EARTH_FACTOR } from "./radio.ts";

const DEG = Math.PI / 180;

/**
 * Bearings the ground is looked along: one every half degree. Neighbouring bearings are then about 220 m apart 25 km
 * out and under 900 m apart at 100 km, so a glen a few hundred metres wide is not missed nor widened into a wedge.
 */
export const RANGE_BEARINGS = 720;
/** The reach is never looked for further out than this. */
export const RANGE_MAX_METERS = 100_000;
/**
 * How often the ground is read on each bearing: finest near the aerial, where the shape of the ground matters most
 * and the bearings are closest together, coarser further out. Each band runs from the end of the one before it.
 */
export const RANGE_BANDS: ReadonlyArray<{ toMeters: number; stepMeters: number }> = [
  { toMeters: 25_000, stepMeters: 50 },
  { toMeters: 50_000, stepMeters: 100 },
  { toMeters: 100_000, stepMeters: 250 },
];
/** The first band: within this distance the ground is read every `RANGE_NEAR_STEP_METERS`. */
export const RANGE_NEAR_METERS = 25_000;
export const RANGE_NEAR_STEP_METERS = 50;
/** The last band's step. */
export const RANGE_FAR_STEP_METERS = 250;
/** The distances the share of the ground in sight is given within. */
export const RANGE_SHARE_WITHIN_METERS = [10_000, 25_000, 50_000, 100_000] as const;
/**
 * A stretch out of sight shorter than this (a hollow, a cutting, a fold in a slope) does
 * not end the reach on a bearing; a longer one does. Without it one small dip a few
 * kilometres out would cut a bearing short that is in sight for most of its length.
 */
export const RANGE_SHADOW_TOLERANCE_METERS = 1_000;
/** The aerial height used for a repeater whose list does not give one. Low on purpose: most are higher. */
export const RANGE_DEFAULT_AERIAL_METERS = 10;
export const RANGE_MAX_HEIGHT_METERS = 1000;

/** The other station: where its aerial is, and how high above the ground. */
export const RANGE_STATIONS = [
  { id: "handheld", name: "Handheld", meters: 1.5, about: "held at head height" },
  { id: "car", name: "Car", meters: 2, about: "an aerial on the car's roof" },
  { id: "roof", name: "Roof aerial", meters: 8, about: "an aerial on a house roof" },
] as const;
export type RangeStationId = (typeof RANGE_STATIONS)[number]["id"];

/** The distances, in metres from the repeater, at which the ground is read on every bearing. */
export function rangeDistances(maxMeters = RANGE_MAX_METERS, bands = RANGE_BANDS): number[] {
  const distances: number[] = [];
  let from = 0;
  for (const band of bands) {
    for (let d = from + band.stepMeters; d <= Math.min(band.toMeters, maxMeters) + 1e-6; d += band.stepMeters)
      distances.push(Math.round(d));
    from = band.toMeters;
    if (from >= maxMeters) break;
  }
  return distances;
}

/**
 * The index of the sample at or just beyond a distance along a bearing, worked out from the bands rather than looked
 * for: what draws the shading asks it for every pixel. -1 before the first sample; past the last, the count.
 */
export function rangeSampleIndex(meters: number, bands: ReadonlyArray<{ toMeters: number; stepMeters: number }>): number {
  let from = 0;
  let before = 0;
  for (const band of bands) {
    const count = Math.round((band.toMeters - from) / band.stepMeters);
    if (meters <= band.toMeters) return before + Math.ceil((meters - from) / band.stepMeters) - 1;
    before += count;
    from = band.toMeters;
  }
  return before;
}

// ── In sight or not, every sample of every bearing, as bits ────────────────

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Bits as base64, the first bit of each byte the lowest. Written out by hand so that it is the same in Node and the browser. */
export function encodeBits(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]!;
    out += index + 1 < bytes.length ? BASE64[(n >> 6) & 63]! : "=";
    out += index + 2 < bytes.length ? BASE64[n & 63]! : "=";
  }
  return out;
}

const BASE64_VALUE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64.length; index += 1) table[BASE64.charCodeAt(index)] = index;
  return table;
})();

export function decodeBits(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let filled = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const values = [0, 1, 2, 3].map((offset) => Math.max(0, BASE64_VALUE[clean.charCodeAt(index + offset)] ?? 0));
    const n = (values[0]! << 18) | (values[1]! << 12) | (values[2]! << 6) | values[3]!;
    if (filled < bytes.length) bytes[filled++] = (n >> 16) & 255;
    if (filled < bytes.length) bytes[filled++] = (n >> 8) & 255;
    if (filled < bytes.length) bytes[filled++] = n & 255;
  }
  return bytes;
}

/** A range's viewshed made ready to read: whether the sample `index` out along bearing `bearing` (by number) is in sight. */
export interface RangeGrid {
  bearingCount: number;
  distances: number[];
  seen(bearing: number, index: number): boolean;
}

export function rangeGrid(range: Pick<SightRange, "seen" | "bearingCount" | "bands" | "maxMeters">): RangeGrid {
  const bits = decodeBits(range.seen);
  const distances = rangeDistances(range.maxMeters, range.bands);
  const count = distances.length;
  return {
    bearingCount: range.bearingCount,
    distances,
    seen(bearing, index) {
      if (index < 0 || index >= count) return false;
      const bit = (((bearing % range.bearingCount) + range.bearingCount) % range.bearingCount) * count + index;
      return ((bits[bit >> 3]! >> (bit & 7)) & 1) === 1;
    },
  };
}

/** The stretches in sight along one bearing, [from, to] in metres, each sample counting for half a step either side. */
export function seenRunsOf(grid: RangeGrid, bearing: number): Array<[number, number]> {
  const { distances } = grid;
  const runs: Array<[number, number]> = [];
  for (let index = 0; index < distances.length; index += 1) {
    if (!grid.seen(bearing, index)) continue;
    const before = index === 0 ? 0 : (distances[index - 1]! + distances[index]!) / 2;
    const after = index + 1 < distances.length ? (distances[index]! + distances[index + 1]!) / 2 : distances[index]!;
    const last = runs.at(-1);
    if (last && index > 0 && grid.seen(bearing, index - 1)) last[1] = after;
    else runs.push([before, after]);
  }
  return runs;
}

const COMPASS = [
  "north",
  "north-north-east",
  "north-east",
  "east-north-east",
  "east",
  "east-south-east",
  "south-east",
  "south-south-east",
  "south",
  "south-south-west",
  "south-west",
  "west-south-west",
  "west",
  "west-north-west",
  "north-west",
  "north-north-west",
] as const;

/** A bearing as the 16 points of the compass, in words: "north-east" (`compassPoint` in compass.ts gives "NE"). */
export function compassWords(bearingDeg: number): string {
  return COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16]!;
}

/** The point a distance away along a bearing, on the sphere distances are measured on. */
export function destinationPoint(from: RoutePoint, bearingDeg: number, meters: number): RoutePoint {
  const angle = meters / EARTH_RADIUS_METERS;
  const bearing = bearingDeg * DEG;
  const lat1 = from.lat * DEG;
  const lon1 = from.lon * DEG;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angle) + Math.cos(lat1) * Math.sin(angle) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat1), Math.cos(angle) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / DEG, lon: ((((lon2 / DEG + 540) % 360) + 360) % 360) - 180 };
}

export interface ReachInput {
  /** Ground height under the repeater, in metres above sea level. */
  groundMeters: number;
  /** Distances of the samples from the repeater, in metres, increasing. */
  distances: ReadonlyArray<number>;
  /** Ground height at each distance; null where no terrain is installed. */
  heights: ReadonlyArray<number | null>;
  aerialMeters: number;
  stationMeters: number;
  earthFactor?: number;
}

export interface Reach {
  /** How far out the station stays in sight, allowing short shadows; 0 when not even the first sample is. */
  reachMeters: number;
  /**
   * Why the reach ends there: the ground hides the aerial (`sight`), the walk reached the
   * maximum distance still in sight (`max`), or terrain runs out while the aerial is
   * still in sight, so the reach may be longer (`terrain`).
   */
  limit: "sight" | "max" | "terrain";
  /** The furthest sample beyond the reach that is in sight again (high ground further out), or null. */
  furtherMeters: number | null;
  /** Where terrain first runs out on this bearing, or null when it is held all the way. */
  unknownFromMeters: number | null;
  /** Of the ground inside the reach, weighted by area, the share hidden from the aerial (0 to 1). */
  hiddenShare: number;
}

/** In sight from the aerial at each sample, in one pass outward: null where the ground is not known (and beyond). */
export function sightAlong(input: ReachInput): Array<boolean | null> {
  const k = input.earthFactor ?? RADIO_EARTH_FACTOR;
  const curve = 2 * k * EARTH_RADIUS_METERS;
  const eye = input.groundMeters + input.aerialMeters;
  const seen: Array<boolean | null> = [];
  let steepest = Number.NEGATIVE_INFINITY;
  let known = true;
  for (let index = 0; index < input.distances.length; index += 1) {
    const ground = input.heights[index];
    // Unknown ground could hide everything behind it: nothing past it is said.
    if (!known || ground == null) {
      known = false;
      seen.push(null);
      continue;
    }
    const d = input.distances[index]!;
    const drop = (d * d) / curve;
    seen.push((ground + input.stationMeters - drop - eye) / d >= steepest);
    steepest = Math.max(steepest, (ground - drop - eye) / d);
  }
  return seen;
}

export function reachAlong(input: ReachInput): Reach {
  const seen = sightAlong(input);
  const { distances } = input;
  let reach = 0;
  let reachIndex = -1;
  let limit: Reach["limit"] = "sight";
  let unknownFrom: number | null = null;
  let further: number | null = null;
  let ended = false;
  for (let index = 0; index < seen.length; index += 1) {
    const here = seen[index];
    const d = distances[index]!;
    if (here === null) {
      unknownFrom = d;
      // Terrain ran out before the aerial had been out of sight for long: the reach may go on.
      if (!ended) limit = "terrain";
      break;
    }
    if (!ended) {
      if (here) {
        reach = d;
        reachIndex = index;
      } else if (d - reach > RANGE_SHADOW_TOLERANCE_METERS) {
        ended = true;
      }
    } else if (here) {
      further = d;
    }
  }
  // Still in sight at the last sample: the maximum distance is what ends it.
  if (!ended && limit !== "terrain") limit = reachIndex === seen.length - 1 ? "max" : "sight";
  let hidden = 0;
  let total = 0;
  for (let index = 0; index <= reachIndex; index += 1) {
    const d = distances[index]!;
    const width = (distances[index + 1] ?? d) - (distances[index - 1] ?? 0);
    const weight = d * width;
    total += weight;
    if (seen[index] === false) hidden += weight;
  }
  return { reachMeters: reach, limit, furtherMeters: further, unknownFromMeters: unknownFrom, hiddenShare: total > 0 ? hidden / total : 0 };
}

/**
 * What is in sight along one bearing, all of it: the stretches of ground in sight from the aerial, the furthest of them,
 * and how much of the ground out to there is hidden.
 *
 * `reachAlong` ends a bearing at the first stretch out of sight longer than a kilometre. From a mast in a valley that
 * is the reach; from a summit it is the opposite of the truth: the slopes just below fall away out of sight within a
 * hundred metres, while other hills and the sea are in sight for tens of kilometres. Measured from Scafell Pike with a
 * handheld at both ends (18 November 2026): the first stretch ended at 0.1 to 3.3 km on every bearing, and ground was
 * in sight again 55 to 100 km out on every one. So the map shades what is in sight and leaves the rest clear, and the
 * outline is the furthest ground in sight.
 */
export interface SightRuns {
  /** Stretches of ground in sight, [from, to] in metres from the aerial, each sample counting for half a step either side. */
  runs: Array<[number, number]>;
  /** The furthest ground in sight on this bearing; 0 when none is. */
  furthestMeters: number;
  /**
   * What ends the outline here: the ground beyond is out of sight (`sight`), it is still in sight at the maximum distance
   * (`max`), or terrain runs out while the ground is in sight, so more may be (`terrain`).
   */
  limit: Reach["limit"];
  /** Of the ground out to `furthestMeters`, weighted by area: what is hidden, and all of it. */
  hiddenWeight: number;
  totalWeight: number;
}

export function sightRunsAlong(input: ReachInput): SightRuns {
  const seen = sightAlong(input);
  const { distances } = input;
  const runs: Array<[number, number]> = [];
  const edgeBefore = (index: number) => (index === 0 ? 0 : (distances[index - 1]! + distances[index]!) / 2);
  const edgeAfter = (index: number) => (index + 1 < distances.length ? (distances[index]! + distances[index + 1]!) / 2 : distances[index]!);
  let furthestIndex = -1;
  let lastKnown = -1;
  for (let index = 0; index < seen.length; index += 1) {
    const here = seen[index];
    if (here === null) break;
    lastKnown = index;
    if (!here) continue;
    furthestIndex = index;
    const last = runs.at(-1);
    if (last && index > 0 && seen[index - 1] === true) last[1] = edgeAfter(index);
    else runs.push([edgeBefore(index), edgeAfter(index)]);
  }
  const limit: Reach["limit"] =
    furthestIndex === -1 || furthestIndex < lastKnown ? "sight" : lastKnown === seen.length - 1 ? "max" : "terrain";
  let hiddenWeight = 0;
  let totalWeight = 0;
  for (let index = 0; index <= furthestIndex; index += 1) {
    const d = distances[index]!;
    const weight = d * ((distances[index + 1] ?? d) - (distances[index - 1] ?? 0));
    totalWeight += weight;
    if (seen[index] === false) hiddenWeight += weight;
  }
  return {
    runs: runs.map(([from, to]) => [Math.round(from), Math.round(to)]),
    furthestMeters: furthestIndex === -1 ? 0 : distances[furthestIndex]!,
    limit,
    hiddenWeight,
    totalWeight,
  };
}

/**
 * The radio horizon over a smooth Earth, for a repeater with no terrain to work from:
 * √(2·k·R·h1) + √(2·k·R·h2), which with k = 4/3 is about 4.12 × (√h1 + √h2) km for
 * heights in metres above the ground around them.
 */
export function smoothRangeMeters(aerialMeters: number, stationMeters: number): number {
  return maxSightDistanceMeters(aerialMeters, stationMeters);
}

export interface SightRangeBearing {
  bearingDeg: number;
  /** The furthest ground in sight on this bearing; 0 when none is. */
  furthestMeters: number;
  /** What ends the view at `furthestMeters` (see `SightRuns.limit`). */
  limit: Reach["limit"];
  /** Where terrain first runs out on this bearing, or null when it is held all the way. */
  unknownFromMeters: number | null;
}

/** `GET /api/maps/sight-range`: the estimated range of an aerial at a place, from installed terrain. */
export interface SightRange {
  at: RoutePoint;
  aerialMeters: number;
  stationMeters: number;
  maxMeters: number;
  /** How often the ground was read on each bearing (`RANGE_BANDS`): the distances of the samples follow from these. */
  bands: Array<{ toMeters: number; stepMeters: number }>;
  /** How many bearings the ground was looked along, clockwise from north and evenly spaced. 0 with no terrain. */
  bearingCount: number;
  /**
   * The viewshed: for every sample of every bearing, whether ground there is in sight of the aerial (for a station at
   * its height), as bits in base64 (`rangeGrid` reads them). Bearing `b`, sample `i` is bit `b × samples + i`, the
   * lowest bit of each byte first. Ground not known (no terrain) is never in sight.
   */
  seen: string;
  /**
   * Of the ground within each distance (`RANGE_SHARE_WITHIN_METERS`), weighted by area, the share in sight (0 to 1);
   * null where none of the ground within it is known.
   */
  shares: Array<{ withinMeters: number; share: number | null }>;
  /**
   * `terrain`: terrain is held under the repeater and on every bearing out to the
   * maximum distance. `partial`: under the repeater, but it runs out on some bearings.
   * `none`: none under the repeater, so `bearings` is empty and the smooth-Earth
   * horizon is all there is.
   */
  coverage: RouteElevation;
  /** Ground height under the repeater, or null. */
  groundMeters: number | null;
  /** The smooth-Earth radio horizon for these heights, in metres. */
  horizonMeters: number;
  /** One per bearing, clockwise from north, `360 / bearingCount` degrees apart. */
  bearings: SightRangeBearing[];
  /**
   * Of the ground out to the furthest ground in sight on each bearing, the share hidden from the aerial by nearer
   * ground (0 to 1); null with no terrain.
   */
  hiddenShare: number | null;
  /** How fine the terrain that was read is, as in `TerrainProfile.terrain`. */
  terrain: { finestCellMeters: number; coarsestCellMeters: number; installedMaxZoom: number } | null;
}

// ── The relay planner ───────────────────────────────────────────────────────

/** The most places the relay planner names. */
export const RELAY_MOST = 8;

/** One place in sight of both ends: high ground a relay could stand on. */
export interface RelayCandidate {
  at: RoutePoint;
  /** Height of the ground there above sea level. */
  groundMeters: number;
  /** Distance from each end, in metres. */
  fromAMeters: number;
  fromBMeters: number;
}

/**
 * `GET /api/maps/relay`: high ground in sight of two places, for a relay between them, from the two places'
 * viewsheds (each as the estimated range works it out, with the relay's aerial as the other station).
 */
export interface RelayPlan {
  a: RoutePoint;
  b: RoutePoint;
  /** The aerials' heights above the ground at A, at B and at the relay. */
  aMeters: number;
  bMeters: number;
  relayMeters: number;
  distanceMeters: number;
  /** `none` when either end has no terrain under it; `partial` when terrain runs out within reach of either. */
  coverage: RouteElevation;
  /**
   * The ground in sight of both, laid out as A's range is (bearings from A), for the map to shade as it shades a
   * range. Null with no terrain.
   */
  both: SightRange | null;
  /** The best places: the highest, each well apart from the others, and then the nearest to both; at most `RELAY_MOST` of each. */
  candidates: RelayCandidate[];
}
