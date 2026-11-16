/**
 * Radio on the map: the geometry of a line-of-sight check between two points. Pure
 * arithmetic, used by the server (to lay samples along a path) and by the web app (to
 * draw the path and to say the result). Maidenhead locators are in `locator.ts`.
 *
 * The line-of-sight sums are the textbook ones for a path profile:
 *
 * - The Earth's curve raises the ground between the two ends by d1·d2 / (2·k·R), where
 *   d1 and d2 are the distances to each end, R is the Earth's radius and k is the
 *   effective-radius factor. k = 4/3 is the value radio planning uses for a standard
 *   atmosphere, in which a ray bends gently downwards and so sees a little further than
 *   a straight line would.
 * - The radius of the first Fresnel zone at that point is √(λ·d1·d2 / (d1 + d2)), with λ
 *   the wavelength. The usual guide is that 60% of that radius should be clear of the
 *   ground.
 *
 * This is geometry over a terrain model. It is not a prediction of signal strength.
 */
import type { RouteElevation, RoutePoint } from "./maps.ts";

const DEG = Math.PI / 180;

// ── A path between two points ───────────────────────────────────────────────

/**
 * The point a share of the way along the great circle from one position to another:
 * the shortest path over the sphere, which is the path a radio signal's ground track
 * follows. `fraction` runs from 0 (the first point) to 1 (the second).
 */
export function greatCirclePoint(from: RoutePoint, to: RoutePoint, fraction: number): RoutePoint {
  const lat1 = from.lat * DEG;
  const lon1 = from.lon * DEG;
  const lat2 = to.lat * DEG;
  const lon2 = to.lon * DEG;
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  const angle = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  // The same place, or as near as makes no difference: nothing to interpolate.
  if (angle < 1e-12) return { lat: from.lat, lon: from.lon };
  const a = Math.sin((1 - fraction) * angle) / Math.sin(angle);
  const b = Math.sin(fraction * angle) / Math.sin(angle);
  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / DEG, lon: Math.atan2(y, x) / DEG };
}

/** Compass bearing in degrees (0 to 360) to set out on from the first point towards the second, along the great circle. */
export function initialBearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const dLon = (to.lon - from.lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(to.lat * DEG);
  const x = Math.cos(from.lat * DEG) * Math.sin(to.lat * DEG) - Math.sin(from.lat * DEG) * Math.cos(to.lat * DEG) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

// ── Line of sight ───────────────────────────────────────────────────────────

/** Mean radius of the Earth in metres: the same sphere distances are measured on. */
export const EARTH_RADIUS_METERS = 6_371_008.8;
/** The effective Earth radius factor radio planning uses for a standard atmosphere. */
export const RADIO_EARTH_FACTOR = 4 / 3;
/** The share of the first Fresnel zone's radius that the usual guide wants clear. */
export const FRESNEL_GUIDE = 0.6;
/**
 * Line of sight is not checked further than this. From the top of the highest mountain
 * the radio horizon is under 400 km away (see `maxSightDistanceMeters`), so no two
 * points on the ground this far apart can see each other.
 */
export const MAX_SIGHT_PATH_METERS = 1_000_000;

const SPEED_OF_LIGHT = 299_792_458;

/** How far the Earth's curve lifts the ground above the straight line between the ends, at d1 from one and d2 from the other. */
export function earthBulgeMeters(d1: number, d2: number, earthFactor = RADIO_EARTH_FACTOR): number {
  return (d1 * d2) / (2 * earthFactor * EARTH_RADIUS_METERS);
}

export function wavelengthMeters(frequencyMHz: number): number {
  return SPEED_OF_LIGHT / (frequencyMHz * 1e6);
}

/** Radius of the first Fresnel zone, in metres, at d1 from one end and d2 from the other. */
export function fresnelRadiusMeters(d1: number, d2: number, frequencyMHz: number): number {
  const total = d1 + d2;
  if (!(total > 0) || d1 <= 0 || d2 <= 0) return 0;
  return Math.sqrt((wavelengthMeters(frequencyMHz) * d1 * d2) / total);
}

/**
 * `GET /api/maps/terrain-profile`: the ground along the great circle between two
 * points, read from installed terrain. Nothing is downloaded to answer it.
 */
export interface TerrainProfile {
  from: RoutePoint;
  to: RoutePoint;
  distanceMeters: number;
  /** Metres from one sample to the next. */
  stepMeters: number;
  /**
   * Height of the ground in metres above sea level at each sample. The samples are
   * evenly spaced along the great circle and include both ends, so sample `i` of `n` is
   * `i / (n - 1)` of the way along. Null where no installed terrain covers the sample.
   */
  heights: Array<number | null>;
  /** Whether terrain was found for all of the path, part of it, or none. */
  coverage: RouteElevation;
  /** Each stretch with no terrain, in metres from the first point. */
  gaps: Array<{ startMeters: number; endMeters: number }>;
  /**
   * How fine the terrain that was read is: the width in metres of one cell of the
   * finest and the coarsest tiles used, and the deepest zoom installed anywhere. Null
   * when no terrain was read.
   */
  terrain: { finestCellMeters: number; coarsestCellMeters: number; installedMaxZoom: number } | null;
}

export interface SightInput {
  distanceMeters: number;
  /** Ground heights as in `TerrainProfile.heights`. */
  heights: ReadonlyArray<number | null>;
  /** Height of each antenna above the ground it stands on, in metres. */
  antennaFromMeters: number;
  antennaToMeters: number;
  frequencyMHz: number;
  /** Defaults to 4/3. */
  earthFactor?: number;
}

/** One sample of the path, with everything the check works out about it. */
export interface SightSample {
  distanceMeters: number;
  /** Null where no terrain is installed. */
  groundMeters: number | null;
  /** How far the Earth's curve lifts the ground here, relative to the ends. */
  bulgeMeters: number;
  /** Height of the straight ray between the antennas here. */
  rayMeters: number;
  fresnelRadiusMeters: number;
  /** Ray minus ground minus bulge: negative where the ground is in the way. Null where the ground is not known. */
  clearanceMeters: number | null;
}

/**
 * Every sample of the path with the ray, the curve and the Fresnel radius worked out,
 * or null when the ground at either end is not known: without it there is nothing to
 * stand an antenna on.
 */
export function sightSamples(input: SightInput): SightSample[] | null {
  const { heights, distanceMeters } = input;
  const first = heights[0];
  const last = heights[heights.length - 1];
  if (heights.length < 2 || first == null || last == null) return null;
  const rayFrom = first + input.antennaFromMeters;
  const rayTo = last + input.antennaToMeters;
  const samples: SightSample[] = [];
  for (let index = 0; index < heights.length; index += 1) {
    const share = index / (heights.length - 1);
    const d1 = share * distanceMeters;
    const d2 = distanceMeters - d1;
    const ground = heights[index] ?? null;
    const bulge = earthBulgeMeters(d1, d2, input.earthFactor);
    const ray = rayFrom + (rayTo - rayFrom) * share;
    samples.push({
      distanceMeters: d1,
      groundMeters: ground,
      bulgeMeters: bulge,
      rayMeters: ray,
      fresnelRadiusMeters: fresnelRadiusMeters(d1, d2, input.frequencyMHz),
      clearanceMeters: ground === null ? null : ray - ground - bulge,
    });
  }
  return samples;
}

/**
 * - `clear`: nothing is in the way and at least 60% of the first Fresnel zone is clear
 *   everywhere, with terrain known for the whole path.
 * - `fresnel`: nothing is in the way of the ray, but less than 60% of the first
 *   Fresnel zone is clear at the tightest point.
 * - `blocked`: ground stands above the ray. This holds even when part of the path has
 *   no terrain: what is known is enough.
 * - `incomplete`: nothing is in the way where terrain is installed, but part of the
 *   path has none, so there is no saying.
 * - `end-unknown`: no terrain under one of the two ends, so no ray can be drawn.
 * - `no-terrain`: no terrain anywhere along the path.
 */
export type SightVerdict = "clear" | "fresnel" | "blocked" | "incomplete" | "end-unknown" | "no-terrain";

export interface SightResult {
  verdict: SightVerdict;
  /** Which end has no terrain under it, for `end-unknown`. */
  missingEnd: "from" | "to" | "both" | null;
  /** The share of the samples with a known height, 0 to 1. */
  knownShare: number;
  /** How far the Earth's curve lifts the middle of the path. */
  midBulgeMeters: number;
  /** Radius of the first Fresnel zone at the middle of the path, where it is widest. */
  midFresnelRadiusMeters: number;
  /**
   * When blocked: where the ground stands highest above the ray, by how much, where
   * ground first and last crosses the ray, and how much of the path is under ground.
   */
  obstruction: {
    distanceMeters: number;
    depthMeters: number;
    firstMeters: number;
    lastMeters: number;
    blockedMeters: number;
  } | null;
  /**
   * Where the least of the first Fresnel zone is clear, among the samples with a known
   * height: the clearance there, the zone's radius there, and one over the other (1 is
   * the whole radius clear, 0.6 the usual guide, negative under ground). Null when no
   * ray can be drawn.
   */
  tightest: { distanceMeters: number; clearanceMeters: number; fresnelRadiusMeters: number; share: number } | null;
}

export function analyseSight(input: SightInput): SightResult {
  const { heights, distanceMeters } = input;
  const known = heights.filter((height) => height !== null).length;
  const half = distanceMeters / 2;
  const result: SightResult = {
    verdict: "no-terrain",
    missingEnd: null,
    knownShare: heights.length === 0 ? 0 : known / heights.length,
    midBulgeMeters: earthBulgeMeters(half, half, input.earthFactor),
    midFresnelRadiusMeters: fresnelRadiusMeters(half, half, input.frequencyMHz),
    obstruction: null,
    tightest: null,
  };
  if (known === 0) return result;

  const samples = sightSamples(input);
  if (!samples) {
    const noFrom = heights[0] == null;
    const noTo = heights[heights.length - 1] == null;
    return { ...result, verdict: "end-unknown", missingEnd: noFrom && noTo ? "both" : noFrom ? "from" : "to" };
  }

  const step = distanceMeters / (samples.length - 1);
  let tightest: SightResult["tightest"] = null;
  let deepest: SightSample | null = null;
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  let blockedSamples = 0;
  // The two ends are the antennas themselves: the zone has no width there and nothing can be in the way.
  for (const sample of samples.slice(1, -1)) {
    const clearance = sample.clearanceMeters;
    if (clearance === null) continue;
    if (clearance < 0) {
      blockedSamples += 1;
      first = Math.min(first, sample.distanceMeters);
      last = Math.max(last, sample.distanceMeters);
      if (!deepest || clearance < deepest.clearanceMeters!) deepest = sample;
    }
    if (sample.fresnelRadiusMeters > 0) {
      const share = clearance / sample.fresnelRadiusMeters;
      if (!tightest || share < tightest.share)
        tightest = {
          distanceMeters: sample.distanceMeters,
          clearanceMeters: clearance,
          fresnelRadiusMeters: sample.fresnelRadiusMeters,
          share,
        };
    }
  }
  result.tightest = tightest;
  if (deepest) {
    result.obstruction = {
      distanceMeters: deepest.distanceMeters,
      depthMeters: -deepest.clearanceMeters!,
      firstMeters: first,
      lastMeters: last,
      blockedMeters: blockedSamples * step,
    };
    result.verdict = "blocked";
  } else if (known < heights.length) {
    result.verdict = "incomplete";
  } else if (tightest && tightest.share < FRESNEL_GUIDE) {
    result.verdict = "fresnel";
  } else {
    result.verdict = "clear";
  }
  return result;
}

/**
 * The furthest two antennas can be apart and still see each other over a smooth Earth
 * (the sea, with nothing between them): each sees to its own horizon, √(2·k·R·h) away.
 * Heights are above the smooth surface, in metres.
 */
export function maxSightDistanceMeters(heightFromMeters: number, heightToMeters: number, earthFactor = RADIO_EARTH_FACTOR): number {
  const horizon = (height: number) => Math.sqrt(2 * earthFactor * EARTH_RADIUS_METERS * Math.max(0, height));
  return horizon(heightFromMeters) + horizon(heightToMeters);
}
