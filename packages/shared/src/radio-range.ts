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

/** Bearings the reach is worked out on: one every 5°, enough for an outline that reads as a shape. */
export const RANGE_BEARINGS = 72;
/** The reach is never looked for further out than this. */
export const RANGE_MAX_METERS = 100_000;
/** Within this distance the ground is read every `RANGE_NEAR_STEP_METERS`, beyond it every `RANGE_FAR_STEP_METERS`. */
export const RANGE_NEAR_METERS = 25_000;
export const RANGE_NEAR_STEP_METERS = 100;
export const RANGE_FAR_STEP_METERS = 250;
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
export function rangeDistances(maxMeters = RANGE_MAX_METERS): number[] {
  const distances: number[] = [];
  for (let d = RANGE_NEAR_STEP_METERS; d <= Math.min(RANGE_NEAR_METERS, maxMeters) + 1e-6; d += RANGE_NEAR_STEP_METERS) distances.push(d);
  for (let d = RANGE_NEAR_METERS + RANGE_FAR_STEP_METERS; d <= maxMeters + 1e-6; d += RANGE_FAR_STEP_METERS) distances.push(d);
  return distances;
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
 * The radio horizon over a smooth Earth, for a repeater with no terrain to work from:
 * √(2·k·R·h1) + √(2·k·R·h2), which with k = 4/3 is about 4.12 × (√h1 + √h2) km for
 * heights in metres above the ground around them.
 */
export function smoothRangeMeters(aerialMeters: number, stationMeters: number): number {
  return maxSightDistanceMeters(aerialMeters, stationMeters);
}

/** `GET /api/maps/sight-range`: the estimated range of an aerial at a place, from installed terrain. */
export interface SightRange {
  at: RoutePoint;
  aerialMeters: number;
  stationMeters: number;
  maxMeters: number;
  nearStepMeters: number;
  farStepMeters: number;
  nearMeters: number;
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
  /** One per bearing, clockwise from north, `360 / bearings.length` degrees apart. */
  bearings: Array<{
    bearingDeg: number;
    reachMeters: number;
    limit: Reach["limit"];
    furtherMeters: number | null;
    unknownFromMeters: number | null;
  }>;
  /** Of the ground inside the outline, the share hidden from the aerial by nearer ground (0 to 1); null with no terrain. */
  hiddenShare: number | null;
  /** How fine the terrain that was read is, as in `TerrainProfile.terrain`. */
  terrain: { finestCellMeters: number; coarsestCellMeters: number; installedMaxZoom: number } | null;
}
