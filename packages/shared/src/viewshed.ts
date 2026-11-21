/**
 * The estimated range of an aerial: the ground a station at a stated height would be in
 * sight of it from, on each of 720 bearings out to 100 km, from terrain (a viewshed).
 * The server works it out from its installed terrain; a phone out of reach works it out
 * the same way from the terrain tiles it kept (`terrain-sampler.ts` reads both), so the
 * two give the same answer where they hold the same tiles.
 *
 * The ground is read in three bands, each one call to the sampler, bearing by bearing so
 * that neighbouring positions fall on the same tiles: every 50 m out to 25 km, every
 * 100 m to 50 km and every 250 m to 100 km, each from tiles about as fine as its step.
 */
import type { RoutePoint } from "./maps.ts";
import { EARTH_RADIUS_METERS, RADIO_EARTH_FACTOR } from "./radio.ts";
import {
  encodeBits,
  RANGE_BANDS,
  RANGE_BEARINGS,
  RANGE_MAX_METERS,
  RANGE_SHARE_WITHIN_METERS,
  rangeDistances,
  type SightRange,
  type SightRangeBearing,
  smoothRangeMeters,
} from "./radio-range.ts";
import type { ElevationSampler } from "./terrain-sampler.ts";

const DEG = Math.PI / 180;

/** A viewshed with what it was worked out from: the answer, and the heights and bits behind it. */
export interface Viewshed {
  range: SightRange;
  /** Distances of the samples on every bearing, in metres. */
  distances: Float64Array;
  /** Ground height at every sample of every bearing, bearing by bearing; NaN where none is known. */
  heights: Float32Array;
  /** In sight or not, as in `SightRange.seen`. */
  bits: Uint8Array;
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Positions along every bearing for the samples `from` to `to` (exclusive), bearing by bearing, on the sphere
 * distances are measured on (as `destinationPoint`, with the sines worked out once).
 */
export function positionsAlong(at: RoutePoint, bearings: number, distances: Float64Array, from: number, to: number) {
  const count = to - from;
  const lons = new Float64Array(bearings * count);
  const lats = new Float64Array(bearings * count);
  const lat1 = at.lat * DEG;
  const lon1 = at.lon * DEG;
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngle = new Float64Array(count);
  const cosAngle = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const angle = distances[from + i]! / EARTH_RADIUS_METERS;
    sinAngle[i] = Math.sin(angle);
    cosAngle[i] = Math.cos(angle);
  }
  for (let b = 0; b < bearings; b += 1) {
    const bearing = ((b * 360) / bearings) * DEG;
    const sinB = Math.sin(bearing);
    const cosB = Math.cos(bearing);
    for (let i = 0; i < count; i += 1) {
      const sinLat2 = sinLat1 * cosAngle[i]! + cosLat1 * sinAngle[i]! * cosB;
      const lat2 = Math.asin(sinLat2);
      const lon2 = lon1 + Math.atan2(sinB * sinAngle[i]! * cosLat1, cosAngle[i]! - sinLat1 * sinLat2);
      const index = b * count + i;
      lats[index] = lat2 / DEG;
      lons[index] = ((((lon2 / DEG + 540) % 360) + 360) % 360) - 180;
    }
  }
  return { lons, lats };
}

/**
 * The viewshed over heights already read: on each bearing in one pass outward, as `sightAlong` in the shared package
 * (the tests hold the two to the same answers). Seen from the aerial, with each height lowered by the Earth's curve, a
 * station is in sight when the slope up to it is at least the steepest slope up to any ground nearer in.
 */
export function viewshedOf(input: {
  groundMeters: number;
  aerialMeters: number;
  stationMeters: number;
  bearings: number;
  distances: Float64Array;
  heights: Float32Array;
  earthFactor?: number;
}): { bits: Uint8Array; bearings: SightRangeBearing[]; shares: SightRange["shares"]; hiddenShare: number } {
  const { distances, heights, bearings: count } = input;
  const samples = distances.length;
  const curve = 2 * (input.earthFactor ?? RADIO_EARTH_FACTOR) * EARTH_RADIUS_METERS;
  const eye = input.groundMeters + input.aerialMeters;
  const drop = new Float64Array(samples);
  const weight = new Float64Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const d = distances[i]!;
    drop[i] = (d * d) / curve;
    // The ground a sample stands for grows with its distance and the step around it: a ring's area.
    weight[i] = d * ((distances[i + 1] ?? d) - (distances[i - 1] ?? 0));
  }
  const within = RANGE_SHARE_WITHIN_METERS.map((meters) => ({ meters, seen: 0, known: 0 }));
  const bits = new Uint8Array(Math.ceil((count * samples) / 8));
  const answer: SightRangeBearing[] = [];
  let hidden = 0;
  let inside = 0;
  for (let b = 0; b < count; b += 1) {
    const offset = b * samples;
    let steepest = Number.NEGATIVE_INFINITY;
    let furthest = -1;
    let lastKnown = -1;
    let unknownFrom: number | null = null;
    for (let i = 0; i < samples; i += 1) {
      const ground = heights[offset + i]!;
      // Unknown ground could hide everything behind it: nothing past it is said.
      if (Number.isNaN(ground)) {
        unknownFrom = distances[i]!;
        break;
      }
      lastKnown = i;
      const d = distances[i]!;
      const base = ground - drop[i]! - eye;
      const seen = (base + input.stationMeters) / d >= steepest;
      if (base / d > steepest) steepest = base / d;
      const w = weight[i]!;
      for (const share of within) {
        if (d > share.meters) continue;
        share.known += w;
        if (seen) share.seen += w;
      }
      if (seen) {
        const bit = offset + i;
        bits[bit >> 3]! |= 1 << (bit & 7);
        furthest = i;
      }
    }
    for (let i = 0; i <= furthest; i += 1) {
      const w = weight[i]!;
      inside += w;
      const bit = offset + i;
      if (((bits[bit >> 3]! >> (bit & 7)) & 1) === 0) hidden += w;
    }
    answer.push({
      bearingDeg: (b * 360) / count,
      furthestMeters: furthest === -1 ? 0 : distances[furthest]!,
      limit: furthest === -1 || furthest < lastKnown ? "sight" : lastKnown === samples - 1 ? "max" : "terrain",
      unknownFromMeters: unknownFrom,
    });
  }
  return {
    bits,
    bearings: answer,
    shares: within.map((share) => ({ withinMeters: share.meters, share: share.known > 0 ? round(share.seen / share.known, 3) : null })),
    hiddenShare: inside > 0 ? round(hidden / inside, 3) : 0,
  };
}

export async function computeViewshed(
  sampler: ElevationSampler,
  terrain: { maxzoom: number } | null,
  at: RoutePoint,
  aerialMeters: number,
  stationMeters: number,
): Promise<Viewshed> {
  const horizonMeters = Math.round(smoothRangeMeters(aerialMeters, stationMeters));
  const base = {
    at,
    aerialMeters,
    stationMeters,
    maxMeters: RANGE_MAX_METERS,
    bands: RANGE_BANDS.map((band) => ({ ...band })),
    horizonMeters,
  };
  const empty = { distances: new Float64Array(0), heights: new Float32Array(0), bits: new Uint8Array(0) };
  const none: Viewshed = {
    ...empty,
    range: {
      ...base,
      coverage: "none",
      groundMeters: null,
      bearingCount: 0,
      seen: "",
      shares: RANGE_SHARE_WITHIN_METERS.map((withinMeters) => ({ withinMeters, share: null })),
      bearings: [],
      hiddenShare: null,
      terrain: null,
    },
  };
  if (!terrain) return none;
  const [ground] = await sampler.sample([[at.lon, at.lat]], RANGE_BANDS[0]!.stepMeters * 2);
  if (ground == null) return none;

  const distances = Float64Array.from(rangeDistances());
  const samples = distances.length;
  const heights = new Float32Array(RANGE_BEARINGS * samples);
  let finest = Number.POSITIVE_INFINITY;
  let coarsest = 0;
  let from = 0;
  for (const band of RANGE_BANDS) {
    let to = from;
    while (to < samples && distances[to]! <= band.toMeters + 1e-6) to += 1;
    if (to === from) continue;
    const { lons, lats } = positionsAlong(at, RANGE_BEARINGS, distances, from, to);
    // As for a profile, the sampler is told twice the step, so that its cells are between half a step and a step wide.
    const read = await sampler.sampleGrid(lons, lats, band.stepMeters * 2);
    const width = to - from;
    for (let b = 0; b < RANGE_BEARINGS; b += 1) heights.set(read.heights.subarray(b * width, (b + 1) * width), b * samples + from);
    if (read.finestCellMeters !== null) finest = Math.min(finest, read.finestCellMeters);
    if (read.coarsestCellMeters !== null) coarsest = Math.max(coarsest, read.coarsestCellMeters);
    from = to;
  }

  const shed = viewshedOf({ groundMeters: ground, aerialMeters, stationMeters, bearings: RANGE_BEARINGS, distances, heights });
  return {
    distances,
    heights,
    bits: shed.bits,
    range: {
      ...base,
      coverage: shed.bearings.some((bearing) => bearing.unknownFromMeters !== null) ? "partial" : "terrain",
      groundMeters: ground,
      bearingCount: RANGE_BEARINGS,
      seen: encodeBits(shed.bits),
      shares: shed.shares,
      bearings: shed.bearings,
      hiddenShare: shed.hiddenShare,
      terrain:
        coarsest > 0
          ? { finestCellMeters: round(finest, 1), coarsestCellMeters: round(coarsest, 1), installedMaxZoom: terrain.maxzoom }
          : null,
    },
  };
}
