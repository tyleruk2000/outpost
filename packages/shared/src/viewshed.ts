/**
 * The estimated range of an aerial: the ground a station at a stated height would be in
 * sight of it from, on each of 720 bearings out to 100 km, from terrain (a viewshed).
 * The server works it out from its installed terrain; a phone out of reach works it out
 * the same way from the terrain tiles it kept (`terrain-sampler.ts` reads both), so the
 * two give the same answer where they hold the same tiles.
 *
 * The ground is read in four bands, each one call to the sampler, bearing by bearing so
 * that neighbouring positions fall on the same tiles: every 10 m out to 2 km, every 50 m
 * to 25 km, every 100 m to 50 km and every 250 m to 100 km, each from tiles about as
 * fine as its step, and the last from tiles as fine as the band before it where the terrain
 * has them (`RANGE_FAR_READ_METERS`). Checked against GDAL's gdal_viewshed and a reading every 5 m over the
 * finest terrain on real ground (docs/radio.md, "How accurate it is").
 */
import type { RoutePoint } from "./maps.ts";
import { EARTH_RADIUS_METERS, RADIO_EARTH_FACTOR } from "./radio.ts";
import {
  encodeBits,
  RANGE_BANDS,
  RANGE_BEARINGS,
  RANGE_FAR_READ_METERS,
  RANGE_MAX_METERS,
  RANGE_SHARE_WITHIN_METERS,
  rangeDistances,
  type SightRange,
  type SightRangeBearing,
  smoothRangeMeters,
  typicalRangeMeters,
} from "./radio-range.ts";
import type { ElevationSampler, StopSignal } from "./terrain-sampler.ts";

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

/**
 * The ground a range is worked out over: the heights on every bearing out to the maximum distance, read once for a
 * place. It does not depend on the heights of the two aerials, so the server keeps it for a place and another pair of
 * heights there costs only the sums (`rangeFromGround`), not reading the terrain again.
 */
export interface RangeGround {
  at: RoutePoint;
  /** Ground height under the aerial. */
  groundMeters: number;
  /** Distances of the samples on every bearing, in metres. */
  distances: Float64Array;
  /** Ground height at every sample of every bearing, bearing by bearing; NaN where none is known. */
  heights: Float32Array;
  /** Samples on each bearing read so far: all of them once the ground is read. */
  filled: number;
  /** How fine the terrain read so far is, as in `SightRange.terrain`; null where none was. */
  terrain: SightRange["terrain"];
}

/** Each band as it is read: how many of the bands are done, and the ground read so far. */
export interface RangeBandRead {
  done: number;
  total: number;
  ground: RangeGround;
}

/**
 * The bands' share of the time the ground takes to read, as measured over the UK terrain Outpost installs (most of it
 * decoding tiles; the far band reads the most): for a progress bar, not a promise.
 */
export const RANGE_BAND_WORK = [0.07, 0.25, 0.23, 0.45] as const;

/** The share of the work done once `done` bands are read, from 0 to 1. */
export function rangeWorkDone(done: number): number {
  let sum = 0;
  for (let index = 0; index < Math.min(done, RANGE_BAND_WORK.length); index += 1) sum += RANGE_BAND_WORK[index]!;
  return done >= RANGE_BAND_WORK.length ? 1 : round(sum, 3);
}

/**
 * Reads the ground out to the maximum distance on every bearing, band by band, near first: null where no terrain is
 * held under the aerial. `onBand` is told as each band is read, so that the near ground can be drawn while the far is
 * still being read. Stops with the signal's reason once it is aborted, between one tile and the next.
 */
export async function readRangeGround(
  sampler: ElevationSampler,
  terrain: { maxzoom: number } | null,
  at: RoutePoint,
  options: { signal?: StopSignal; onBand?: (read: RangeBandRead) => void } = {},
): Promise<RangeGround | null> {
  const { signal, onBand } = options;
  signal?.throwIfAborted();
  if (!terrain) return null;
  const [groundMeters] = await sampler.sample([[at.lon, at.lat]], RANGE_BANDS[0]!.stepMeters * 2);
  if (groundMeters == null) return null;

  const distances = Float64Array.from(rangeDistances());
  const samples = distances.length;
  const heights = new Float32Array(RANGE_BEARINGS * samples);
  let finest = Number.POSITIVE_INFINITY;
  let coarsest = 0;
  let from = 0;
  const snapshot = (filled: number): RangeGround => ({
    at,
    groundMeters,
    distances,
    heights,
    filled,
    terrain:
      coarsest > 0
        ? { finestCellMeters: round(finest, 1), coarsestCellMeters: round(coarsest, 1), installedMaxZoom: terrain.maxzoom }
        : null,
  });
  for (const [index, band] of RANGE_BANDS.entries()) {
    signal?.throwIfAborted();
    let to = from;
    while (to < samples && distances[to]! <= band.toMeters + 1e-6) to += 1;
    if (to === from) continue;
    const { lons, lats } = positionsAlong(at, RANGE_BEARINGS, distances, from, to);
    // As for a profile, the sampler is told twice the step, so that its cells are between half a step and a step wide;
    // the far band is read from tiles no coarser than the band before it, where they are installed.
    const read = await sampler.sampleGrid(lons, lats, Math.min(band.stepMeters, RANGE_FAR_READ_METERS) * 2, signal);
    const width = to - from;
    for (let b = 0; b < RANGE_BEARINGS; b += 1) heights.set(read.heights.subarray(b * width, (b + 1) * width), b * samples + from);
    if (read.finestCellMeters !== null) finest = Math.min(finest, read.finestCellMeters);
    if (read.coarsestCellMeters !== null) coarsest = Math.max(coarsest, read.coarsestCellMeters);
    from = to;
    if (to < samples) onBand?.({ done: index + 1, total: RANGE_BANDS.length, ground: snapshot(to) });
  }
  return snapshot(samples);
}

/**
 * The range for a pair of heights over ground already read (`readRangeGround`); null ground gives the answer for no
 * terrain, the smooth-Earth horizon. Over ground read only part of the way out (`filled` short of every sample) it is
 * the range out to there: the same answer for that ground as the whole would give, since each bearing is worked
 * outward, with `maxMeters` and `bands` saying how far it goes.
 */
export function rangeFromGround(ground: RangeGround | null, at: RoutePoint, aerialMeters: number, stationMeters: number): Viewshed {
  const horizonMeters = Math.round(smoothRangeMeters(aerialMeters, stationMeters));
  const samples = ground?.distances.length ?? 0;
  const filled = ground ? Math.min(ground.filled, samples) : 0;
  const maxMeters = ground && filled < samples ? ground.distances[filled - 1]! : RANGE_MAX_METERS;
  const bands: SightRange["bands"] = [];
  for (const band of RANGE_BANDS) {
    if (bands.length > 0 && bands.at(-1)!.toMeters >= maxMeters) break;
    bands.push({ ...band });
  }
  const base = { at, aerialMeters, stationMeters, maxMeters, bands, horizonMeters };
  if (!ground || filled === 0) {
    return {
      distances: new Float64Array(0),
      heights: new Float32Array(0),
      bits: new Uint8Array(0),
      range: {
        ...base,
        coverage: "none",
        groundMeters: null,
        bearingCount: 0,
        seen: "",
        shares: RANGE_SHARE_WITHIN_METERS.map((withinMeters) => ({ withinMeters, share: null })),
        bearings: [],
        typicalMeters: null,
        hiddenShare: null,
        terrain: null,
      },
    };
  }
  let { distances, heights } = ground;
  if (filled < samples) {
    // The near part of every bearing, laid out bearing by bearing as the whole is.
    distances = ground.distances.slice(0, filled);
    heights = new Float32Array(RANGE_BEARINGS * filled);
    for (let b = 0; b < RANGE_BEARINGS; b += 1) heights.set(ground.heights.subarray(b * samples, b * samples + filled), b * filled);
  }
  const shed = viewshedOf({ groundMeters: ground.groundMeters, aerialMeters, stationMeters, bearings: RANGE_BEARINGS, distances, heights });
  return {
    distances,
    heights,
    bits: shed.bits,
    range: {
      ...base,
      coverage: shed.bearings.some((bearing) => bearing.unknownFromMeters !== null) ? "partial" : "terrain",
      groundMeters: ground.groundMeters,
      bearingCount: RANGE_BEARINGS,
      seen: encodeBits(shed.bits),
      shares: shed.shares,
      bearings: shed.bearings,
      typicalMeters: typicalRangeMeters(shed.bearings),
      hiddenShare: shed.hiddenShare,
      terrain: ground.terrain,
    },
  };
}

export async function computeViewshed(
  sampler: ElevationSampler,
  terrain: { maxzoom: number } | null,
  at: RoutePoint,
  aerialMeters: number,
  stationMeters: number,
  options: { signal?: StopSignal; onBand?: (read: RangeBandRead) => void } = {},
): Promise<Viewshed> {
  return rangeFromGround(await readRangeGround(sampler, terrain, at, options), at, aerialMeters, stationMeters);
}
