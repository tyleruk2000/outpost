/**
 * An estimated range as the server gives it, made from a rule for what is in sight, for the tests of what reads one.
 * Every figure is made up.
 */
import {
  encodeBits,
  RANGE_BANDS,
  RANGE_BEARINGS,
  RANGE_SHARE_WITHIN_METERS,
  type RoutePoint,
  rangeDistances,
  type SightRange,
  typicalRangeMeters,
} from "@outpost/shared";

/**
 * By default the ground is in sight to 18 km all round, the smooth-Earth horizon for 10 m and 1.5 m. `unknownFrom` is
 * where terrain runs out on a bearing (partial only).
 */
export function rangeFixture(
  coverage: SightRange["coverage"],
  {
    seen = (_bearing: number, meters: number) => meters <= 18_000,
    unknownFrom = () => 30_000,
    groundMeters = 100,
  }: { seen?: (bearingDeg: number, meters: number) => boolean; unknownFrom?: (bearingDeg: number) => number; groundMeters?: number } = {},
  at: RoutePoint = { lat: 57, lon: -3.4 },
  heights: { aerialMeters: number; stationMeters: number } = { aerialMeters: 10, stationMeters: 1.5 },
): SightRange {
  const base = {
    at,
    ...heights,
    maxMeters: 100_000,
    bands: RANGE_BANDS.map((band) => ({ ...band })),
    horizonMeters: 18_085,
  };
  if (coverage === "none")
    return {
      ...base,
      coverage,
      groundMeters: null,
      bearingCount: 0,
      seen: "",
      shares: RANGE_SHARE_WITHIN_METERS.map((withinMeters) => ({ withinMeters, share: null })),
      bearings: [],
      typicalMeters: null,
      hiddenShare: null,
      terrain: null,
    };
  const distances = rangeDistances();
  const bits = new Uint8Array(Math.ceil((RANGE_BEARINGS * distances.length) / 8));
  const within = RANGE_SHARE_WITHIN_METERS.map((meters) => ({ meters, seen: 0, known: 0 }));
  const bearings = Array.from({ length: RANGE_BEARINGS }, (_, b) => {
    const bearingDeg = (b * 360) / RANGE_BEARINGS;
    const end = coverage === "partial" ? unknownFrom(bearingDeg) : Number.POSITIVE_INFINITY;
    let furthest = 0;
    let lastKnown = 0;
    distances.forEach((d, i) => {
      if (d >= end) return;
      lastKnown = d;
      const inSight = seen(bearingDeg, d);
      const weight = d * ((distances[i + 1] ?? d) - (distances[i - 1] ?? 0));
      for (const share of within) {
        if (d > share.meters) continue;
        share.known += weight;
        if (inSight) share.seen += weight;
      }
      if (!inSight) return;
      const bit = b * distances.length + i;
      bits[bit >> 3]! |= 1 << (bit & 7);
      furthest = d;
    });
    return {
      bearingDeg,
      furthestMeters: furthest,
      limit: furthest === lastKnown && end <= 100_000 ? ("terrain" as const) : ("sight" as const),
      unknownFromMeters: end <= 100_000 ? end : null,
    };
  });
  return {
    ...base,
    coverage,
    groundMeters,
    bearingCount: RANGE_BEARINGS,
    seen: encodeBits(bits),
    shares: within.map((share) => ({ withinMeters: share.meters, share: share.known > 0 ? share.seen / share.known : null })),
    bearings,
    typicalMeters: typicalRangeMeters(bearings),
    hiddenShare: 0,
    terrain: { finestCellMeters: 41, coarsestCellMeters: 171, installedMaxZoom: 12 },
  };
}
