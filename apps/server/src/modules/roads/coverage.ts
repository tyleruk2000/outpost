/**
 * Which countries a route needs: the country of each point and of the straight lines
 * between them, sampled every few kilometres over the country outlines (countries.ts), and
 * whether each has roads kept. Local and quick: no network is read into memory and nothing
 * is asked of anyone, so the route screen can say "France has no roads yet" before a person
 * presses Plan route.
 */
import type { RoadCoverageCountry, RoadCoverageResponse, RoadMissingCountry, RoadNetworkBuilding, RoadNetworkDto } from "@outpost/shared";
import { countryOf } from "../layers/countries.ts";
import { countryOfPoint, inNorthernIreland } from "./countries.ts";
import { meters } from "./graph.ts";

/** Between samples along a line: small enough to see the narrowest sea crossings (Dover to Calais is 33 km). */
const STEP_M = 5_000;
/** At most this many samples a line, so a line across a continent stays quick. */
const MOST_SAMPLES = 600;
/** How far a point may lie outside a network's box, in degrees, and still count as in it (outlines are a few km out). */
const BOX_SLACK = 0.15;

export interface Sample {
  lat: number;
  lon: number;
  country: string | null;
  /** Which line between points (0 is the first to the second); -1 for a point itself. */
  segment: number;
}

interface LatLon {
  lat: number;
  lon: number;
}

/** The points and the samples between each and the next, in route order. */
export function samplesAlong(points: readonly LatLon[]): { samples: Sample[]; pointCountries: Array<string | null>; seaCrossing: boolean } {
  const pointCountries = points.map((p) => countryOfPoint(p.lat, p.lon));
  const samples: Sample[] = [];
  let seaCrossing = false;
  points.forEach((point, index) => {
    samples.push({ lat: point.lat, lon: point.lon, country: pointCountries[index]!, segment: -1 });
    const next = points[index + 1];
    if (!next) return;
    const steps = Math.min(MOST_SAMPLES, Math.max(2, Math.ceil(meters(point.lat, point.lon, next.lat, next.lon) / STEP_M)));
    let landBefore = pointCountries[index] !== null;
    let sea = false;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const lat = point.lat + (next.lat - point.lat) * t;
      const lon = point.lon + (next.lon - point.lon) * t;
      const country = countryOfPoint(lat, lon);
      samples.push({ lat, lon, country, segment: index });
      if (country === null) sea = true;
      else {
        // Water with land on both sides of it: a crossing.
        if (sea && landBefore) seaCrossing = true;
        landBefore = true;
        sea = false;
      }
    }
    if (sea && landBefore && pointCountries[index + 1] !== null) seaCrossing = true;
  });
  return { samples, pointCountries, seaCrossing };
}

/**
 * A country only the straight line passes over (no point is in it) counts when the line
 * spends this many samples in it (40 km), or a quarter of a short line: a corner clipped
 * (Geneva, on a line from London to Chamonix) is one the roads most likely go round.
 */
const WAY_ONLY_SAMPLES = 8;

/** The countries in route order, each once: every point's own, and those the lines between run through for more than a corner. */
export function countriesInOrder(samples: readonly Sample[]): string[] {
  const own = new Set(samples.filter((s) => s.segment === -1 && s.country).map((s) => s.country!));
  const perSegment = new Map<number, number>();
  const inSegment = new Map<string, number>();
  for (const s of samples) {
    if (s.segment < 0) continue;
    perSegment.set(s.segment, (perSegment.get(s.segment) ?? 0) + 1);
    if (s.country) inSegment.set(`${s.segment}:${s.country}`, (inSegment.get(`${s.segment}:${s.country}`) ?? 0) + 1);
  }
  const counts = (s: Sample) => {
    if (!s.country) return false;
    if (own.has(s.country) || s.segment < 0) return true;
    const n = inSegment.get(`${s.segment}:${s.country}`) ?? 0;
    return n >= WAY_ONLY_SAMPLES || n >= (perSegment.get(s.segment) ?? 0) / 4;
  };
  const out: string[] = [];
  for (const sample of samples) if (counts(sample) && !out.includes(sample.country!)) out.push(sample.country!);
  return out;
}

export const countryName = (code: string) => countryOf(code)?.name ?? code;

export function missingCountry(code: string, regionOf: (code: string) => string | null): RoadMissingCountry {
  return { code, name: countryName(code), regionId: regionOf(code) };
}

const inBox = (box: [number, number, number, number], lat: number, lon: number) =>
  lon >= box[0] - BOX_SLACK && lon <= box[2] + BOX_SLACK && lat >= box[1] - BOX_SLACK && lat <= box[3] + BOX_SLACK;

/** Coverage of a route's points: the country of each, and each country it touches with where its roads stand. */
export function coverageOf(
  points: readonly LatLon[],
  networks: readonly (Pick<RoadNetworkDto, "name" | "country" | "bbox" | "available" | "dataDate"> & { northernIreland?: boolean })[],
  building: readonly RoadNetworkBuilding[],
  regionOf: (code: string) => string | null,
): RoadCoverageResponse {
  const { samples, pointCountries, seaCrossing } = samplesAlong(points);
  // Northern Ireland's roads are in a network whose junctions reach it (the United Kingdom's, Ireland and Northern Ireland's), never in Great Britain's.
  const reachingNi = networks.filter((n) => n.available && n.northernIreland);
  const countries: RoadCoverageCountry[] = countriesInOrder(samples).map((code) => {
    const ownKept = networks.filter((n) => n.country === code && n.available);
    const kept = code === "GB" ? [...new Set([...ownKept, ...reachingNi])] : ownKept;
    const onItsWay = building.find((b) => b.country === code && b.phase !== "failed") ?? null;
    const failed = building.find((b) => b.country === code && b.phase === "failed") ?? null;
    const dates = kept.map((n) => n.dataDate).filter((d): d is string => Boolean(d));
    const base = { code, name: countryName(code), regionId: regionOf(code), dataDate: dates.sort()[0] ?? null };
    if (onItsWay) return { ...base, state: "downloading", parts: [], progress: onItsWay };
    if (kept.length === 0) return { ...base, state: "missing", parts: [], progress: failed };
    // Kept, but does what is kept reach the points in it? (Points only: the road between may well go round a part not kept.) A network with no box is taken as the whole country.
    const covering = (s: Sample) => (code === "GB" && inNorthernIreland(s.lat, s.lon) ? reachingNi : ownKept);
    const outside = samples.some(
      (s) => s.segment === -1 && s.country === code && !covering(s).some((n) => !n.bbox || inBox(n.bbox, s.lat, s.lon)),
    );
    if (outside) return { ...base, state: "part", parts: kept.map((n) => n.name), progress: failed };
    // The United Kingdom's roads kept for Great Britain alone, and no point of the route in Northern Ireland: say Great Britain.
    const name = code === "GB" && reachingNi.length === 0 ? "Great Britain" : base.name;
    return { ...base, name, state: "ready", parts: [], progress: null };
  });
  return { points: pointCountries.map((country) => ({ country })), countries, seaCrossing };
}
