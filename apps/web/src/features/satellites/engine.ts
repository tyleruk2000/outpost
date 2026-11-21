/**
 * The orbital sums for Radio → Satellites, ported from LogBook73's satellite engine
 * (packages/domain/src/satellite: engine.ts and schedule.ts, MIT, © 2026 Tyler Allen),
 * on satellite.js (SGP4/SDP4, MIT). All of it runs in the browser on the elements the
 * server keeps; nothing is fetched.
 *
 * - `satelliteState`: where a satellite is (sub-satellite point, height, speed) and how
 *   it looks from a place (azimuth, elevation, slant range, and the range rate by a
 *   central difference over one second, for Doppler).
 * - `predictPasses`: horizon to horizon, found on a 30-second scan and refined by
 *   bisection to under a second; the highest point by a ternary search. A pass already
 *   under way is walked back to its real start, and one that starts inside the window
 *   is followed to its real end.
 * - `passSchedule`: every pass of many satellites over one place, in time order, with a
 *   cap per satellite above anything a real orbit makes.
 * - `groundTrack`, `passSkyPath`, `footprintRadiusKm`, `dopplerShiftHz`.
 */
import type { OmmElements, SatelliteElements } from "@outpost/shared";
import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  json2satrec,
  type OMMJsonObject,
  propagate,
  radiansToDegrees,
  type SatRec,
  twoline2satrec,
} from "satellite.js";

const LIGHT_KM_S = 299_792.458;
export const EARTH_RADIUS_KM = 6371;

/** Anything the engine can propagate: catalogue elements (OMM) or a pasted TLE. */
export type Orbit = { noradId: number; epoch: number } & ({ elements: OmmElements } | { line1: string; line2: string });

export interface ObserverLocation {
  lat: number;
  lon: number;
  heightM?: number;
}

export interface SatelliteState {
  at: Date;
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmS: number;
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
  /** Negative while the satellite comes nearer. */
  rangeRateKmS: number;
}

export interface SatellitePass {
  aos: Date;
  tca: Date;
  los: Date;
  maxElevationDeg: number;
  aosAzimuthDeg: number;
  tcaAzimuthDeg: number;
  losAzimuthDeg: number;
  minRangeKm: number;
  durationSeconds: number;
}

export interface TrackPoint {
  at: Date;
  lat: number;
  lon: number;
}

const SATREC_LIMIT = 2000;
const satrecs = new Map<string, SatRec | null>();

function keyOf(orbit: Orbit): string {
  return "elements" in orbit ? `${orbit.noradId}:${orbit.epoch}:${orbit.elements.MEAN_ANOMALY}` : `${orbit.line1}\n${orbit.line2}`;
}

/** The SGP4 record, made once per element set; throws in words when the elements will not initialise. */
export function satrecOf(orbit: Orbit): SatRec {
  const key = keyOf(orbit);
  let satrec = satrecs.get(key);
  if (satrec === undefined) {
    if (satrecs.size >= SATREC_LIMIT) satrecs.clear();
    try {
      satrec = "elements" in orbit ? json2satrec(orbit.elements as unknown as OMMJsonObject) : twoline2satrec(orbit.line1, orbit.line2);
      if (satrec.error !== 0) satrec = null;
    } catch {
      satrec = null;
    }
    satrecs.set(key, satrec);
  }
  if (!satrec) throw new Error("These orbital elements could not be used: SGP4 would not start from them.");
  return satrec;
}

function observerGeodetic(observer: ObserverLocation) {
  return { latitude: degreesToRadians(observer.lat), longitude: degreesToRadians(observer.lon), height: (observer.heightM ?? 0) / 1000 };
}
type ObserverGeodetic = ReturnType<typeof observerGeodetic>;

function propagated(satrec: SatRec, at: Date) {
  const pv = propagate(satrec, at);
  if (!pv || typeof pv.position === "boolean") throw new Error(`The orbit could not be worked out for ${at.toISOString()}.`);
  const gmst = gstime(at);
  return { pv, ecf: eciToEcf(pv.position, gmst), geodetic: eciToGeodetic(pv.position, gmst) };
}

/** Elevation alone, from one SGP4 step: the horizon scan asks only this. */
function elevationAt(satrec: SatRec, observer: ObserverGeodetic, at: Date): number {
  return radiansToDegrees(ecfToLookAngles(observer, propagated(satrec, at).ecf).elevation);
}

export function satelliteState(orbit: Orbit | SatRec, observer: ObserverLocation, at: Date): SatelliteState {
  const satrec = "satnum" in orbit ? orbit : satrecOf(orbit);
  const geo = observerGeodetic(observer);
  const now = propagated(satrec, at);
  const look = ecfToLookAngles(geo, now.ecf);
  const before = ecfToLookAngles(geo, propagated(satrec, new Date(at.getTime() - 500)).ecf).rangeSat;
  const after = ecfToLookAngles(geo, propagated(satrec, new Date(at.getTime() + 500)).ecf).rangeSat;
  const v = now.pv.velocity as { x: number; y: number; z: number };
  return {
    at,
    lat: degreesLat(now.geodetic.latitude),
    lon: degreesLong(now.geodetic.longitude),
    altitudeKm: now.geodetic.height,
    velocityKmS: Math.hypot(v.x, v.y, v.z),
    azimuthDeg: (radiansToDegrees(look.azimuth) + 360) % 360,
    elevationDeg: radiansToDegrees(look.elevation),
    rangeKm: look.rangeSat,
    rangeRateKmS: after - before,
  };
}

/** The shift of a frequency heard on the ground: positive while the satellite comes nearer. */
export function dopplerShiftHz(frequencyHz: number, rangeRateKmS: number): number {
  return (-frequencyHz * rangeRateKmS) / LIGHT_KM_S;
}

/**
 * What to set a radio to, for a downlink and an uplink at one moment: listen on the
 * downlink plus its shift; send on the uplink less its shift, so that the satellite hears
 * the uplink where it expects it.
 */
export function dopplerTuning(rangeRateKmS: number, downlinkHz: number | null, uplinkHz: number | null) {
  return {
    downlinkHz: downlinkHz === null ? null : downlinkHz + dopplerShiftHz(downlinkHz, rangeRateKmS),
    uplinkHz: uplinkHz === null ? null : uplinkHz - dopplerShiftHz(uplinkHz, rangeRateKmS),
  };
}

function refineCrossing(satrec: SatRec, observer: ObserverGeodetic, a: Date, b: Date, rising: boolean): Date {
  let low = a.getTime();
  let high = b.getTime();
  for (let i = 0; i < 16; i += 1) {
    const mid = (low + high) / 2;
    if (elevationAt(satrec, observer, new Date(mid)) >= 0 === rising) high = mid;
    else low = mid;
  }
  return new Date((low + high) / 2);
}

function peakWithin(satrec: SatRec, observer: ObserverGeodetic, aos: Date, los: Date): Date {
  let low = aos.getTime();
  let high = los.getTime();
  for (let i = 0; i < 22; i += 1) {
    const third = (high - low) / 3;
    if (elevationAt(satrec, observer, new Date(low + third)) < elevationAt(satrec, observer, new Date(high - third))) low += third;
    else high -= third;
  }
  return new Date((low + high) / 2);
}

/** The longest pass the edge searches follow: a high elliptical orbit's pass runs for hours. */
const EDGE_SEARCH_LIMIT_MS = 12 * 3_600_000;

function findEdge(satrec: SatRec, observer: ObserverGeodetic, start: Date, stepMs: number): Date {
  let inside = start;
  for (let offset = stepMs; Math.abs(offset) <= EDGE_SEARCH_LIMIT_MS; offset += stepMs) {
    const at = new Date(start.getTime() + offset);
    if (elevationAt(satrec, observer, at) < 0) {
      return stepMs < 0 ? refineCrossing(satrec, observer, at, inside, true) : refineCrossing(satrec, observer, inside, at, false);
    }
    inside = at;
  }
  return start;
}

export function predictPasses(orbit: Orbit, observer: ObserverLocation, from: Date, hours = 24, limit = 8): SatellitePass[] {
  const satrec = satrecOf(orbit);
  const geo = observerGeodetic(observer);
  const end = from.getTime() + hours * 3_600_000;
  const stepMs = 30_000;
  const passes: SatellitePass[] = [];
  const push = (aos: Date, los: Date) => {
    const peak = satelliteState(satrec, observer, peakWithin(satrec, geo, aos, los));
    passes.push({
      aos,
      tca: peak.at,
      los,
      maxElevationDeg: peak.elevationDeg,
      aosAzimuthDeg: satelliteState(satrec, observer, aos).azimuthDeg,
      tcaAzimuthDeg: peak.azimuthDeg,
      losAzimuthDeg: satelliteState(satrec, observer, los).azimuthDeg,
      minRangeKm: peak.rangeKm,
      durationSeconds: Math.round((los.getTime() - aos.getTime()) / 1000),
    });
  };
  let previousAt = from;
  let previous = elevationAt(satrec, geo, previousAt);
  let aos: Date | null = previous >= 0 ? findEdge(satrec, geo, from, -stepMs) : null;
  for (let time = from.getTime() + stepMs; time <= end && passes.length < limit; time += stepMs) {
    const at = new Date(Math.min(time, end));
    const elevation = elevationAt(satrec, geo, at);
    if (!aos && previous < 0 && elevation >= 0) aos = refineCrossing(satrec, geo, previousAt, at, true);
    else if (aos && previous >= 0 && elevation < 0) {
      push(aos, refineCrossing(satrec, geo, previousAt, at, false));
      aos = null;
    }
    previousAt = at;
    previous = elevation;
  }
  if (aos && passes.length < limit) {
    const los = findEdge(satrec, geo, previousAt, stepMs);
    if (los.getTime() !== previousAt.getTime()) push(aos, los);
  }
  return passes;
}

export interface ScheduledPass<S extends Orbit = SatelliteElements> {
  satellite: S;
  pass: SatellitePass;
  /** Peaks high enough to be worth setting up for. Advisory: low passes stay in the list. */
  workable: boolean;
}

/** Peak elevation at or above which a pass is flagged workable (LogBook73's figure). */
export const WORKABLE_ELEVATION_DEG = 10;
/** Passes peaking lower than this are left out of the schedule: behind the houses for nearly everyone. */
export const FLOOR_ELEVATION_DEG = 2;
/** No real orbit passes over one place more often than this. */
const MAX_PASSES_PER_HOUR = 0.75;

export function passSchedule<S extends Orbit>(
  satellites: readonly S[],
  observer: ObserverLocation,
  from: Date,
  options: { hours?: number; workableElevationDeg?: number; minElevationDeg?: number } = {},
): ScheduledPass<S>[] {
  const hours = options.hours ?? 24;
  const workable = options.workableElevationDeg ?? WORKABLE_ELEVATION_DEG;
  const floor = options.minElevationDeg ?? 0;
  const cap = Math.ceil(hours * MAX_PASSES_PER_HOUR);
  const out: ScheduledPass<S>[] = [];
  for (const satellite of satellites) {
    let passes: SatellitePass[];
    try {
      passes = predictPasses(satellite, observer, from, hours, cap * 2);
    } catch {
      // One element set that will not propagate must not blank the whole schedule.
      continue;
    }
    let kept = 0;
    for (const pass of passes) {
      if (pass.maxElevationDeg < floor) continue;
      if (kept >= cap) break;
      kept += 1;
      out.push({ satellite, pass, workable: pass.maxElevationDeg >= workable });
    }
  }
  return out.sort((a, b) => a.pass.aos.getTime() - b.pass.aos.getTime());
}

/** The ground track around a moment, split where it crosses the date line. */
export function groundTrack(orbit: Orbit, center: Date, pastMinutes = 45, futureMinutes = 90, stepSeconds = 30): TrackPoint[][] {
  const satrec = satrecOf(orbit);
  const segments: TrackPoint[][] = [[]];
  for (let offset = -pastMinutes * 60; offset <= futureMinutes * 60; offset += stepSeconds) {
    const at = new Date(center.getTime() + offset * 1000);
    let point: TrackPoint;
    try {
      const { geodetic } = propagated(satrec, at);
      point = { at, lat: degreesLat(geodetic.latitude), lon: degreesLong(geodetic.longitude) };
    } catch {
      continue;
    }
    const current = segments[segments.length - 1]!;
    const last = current[current.length - 1];
    if (last && Math.abs(point.lon - last.lon) > 180) segments.push([]);
    segments[segments.length - 1]!.push(point);
  }
  return segments.filter((segment) => segment.length > 1);
}

/** Look angles through a pass, from rise to set, for the sky track and the Doppler table. */
export function passSkyPath(orbit: Orbit, observer: ObserverLocation, pass: SatellitePass, samples = 60): SatelliteState[] {
  const satrec = satrecOf(orbit);
  const span = pass.los.getTime() - pass.aos.getTime();
  return Array.from({ length: samples + 1 }, (_, index) =>
    satelliteState(satrec, observer, new Date(pass.aos.getTime() + (index / samples) * span)),
  );
}

/** The ground radius inside which the satellite is above the horizon. */
export function footprintRadiusKm(altitudeKm: number): number {
  const altitude = Math.max(0, altitudeKm);
  return EARTH_RADIUS_KM * Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitude));
}

/** The footprint as a ring of [lon, lat] for the map, unwrapped across the date line, closed. */
export function footprintRing(center: { lat: number; lon: number }, radiusKm: number, stepDeg = 4): Array<[number, number]> {
  const d = radiusKm / EARTH_RADIUS_KM;
  const lat1 = degreesToRadians(center.lat);
  const lon1 = degreesToRadians(center.lon);
  const ring: Array<[number, number]> = [];
  let previous: number | null = null;
  for (let bearing = 0; bearing <= 360; bearing += stepDeg) {
    const b = degreesToRadians(bearing);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    let lon = radiansToDegrees(
      lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)),
    );
    if (previous !== null) {
      while (lon - previous > 180) lon -= 360;
      while (lon - previous < -180) lon += 360;
    }
    previous = lon;
    ring.push([lon, radiansToDegrees(lat2)]);
  }
  // A ring that ends a whole turn from where it began went round a pole: close it along that pole.
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (Math.abs(last[0] - first[0]) > 180) {
    const pole = center.lat >= 0 ? 85 : -85;
    ring.push([last[0], pole], [first[0], pole], first);
  }
  return ring;
}
