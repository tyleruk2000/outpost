/**
 * Tide predictions from harmonic constants, worked out on the device.
 *
 * The method is the one in P. Schureman, "Manual of Harmonic Analysis and Prediction of
 * Tides", US Coast and Geodetic Survey Special Publication 98 (revised 1940, reprinted
 * 1958), as NOAA publishes it (tidesandcurrents.noaa.gov/publications/SpecialPubNo98.pdf,
 * read 21 November 2026):
 *
 *   height = mean sea level + Σ f · H · cos(V + u − κ′)
 *
 * for each constituent, with H its amplitude and κ′ its Greenwich phase (as NOAA gives
 * them, `phase_GMT`), V its equilibrium argument at the instant, from the mean longitudes
 * of the moon, sun, lunar perigee, solar perigee and the hour angle of the mean sun
 * (table 1), and u and f the slow corrections for the moon's node (node factor formulas
 * 73 to 80, 141 to 150, 195 to 235). The arguments are those of table 2 and, for the
 * shallow-water constituents, table 2a. I, ν, ξ, ν′ and 2ν″ come from solving the
 * spherical triangle of paragraph 24 and formulas 224 and 232; the tests hold them to
 * table 6.
 *
 * Pure: no clock, no network. Times are milliseconds since 1970 (UTC), heights metres.
 */

const DEG = Math.PI / 180;
const HOUR = 3_600_000;
const sin = (d: number) => Math.sin(d * DEG);
const cos = (d: number) => Math.cos(d * DEG);
const norm = (d: number) => ((d % 360) + 360) % 360;
/** Arc tangent in degrees, in (−90°, 90°]: the formulas give these small corrections as tan⁻¹. */
const atanDeg = (y: number, x: number) => {
  const a = Math.atan2(y, x) / DEG;
  return a > 90 ? a - 180 : a < -90 ? a + 180 : a;
};

/** Obliquity of the ecliptic (ω) and inclination of the moon's orbit (i), table 1. */
const OMEGA = 23.452;
const INCLINATION = 5.145;

const SECONDS = 1 / 3600;
/** Greenwich mean noon, 31 December 1899: the epoch of table 1's formulas. */
const EPOCH = Date.UTC(1899, 11, 31, 12);

export interface TideAstronomy {
  /** Hour angle of the mean sun at Greenwich, degrees. */
  T: number;
  /** Mean longitudes, degrees: moon (s), sun (h), lunar perigee (p), solar perigee (p1), moon's node (N). */
  s: number;
  h: number;
  p: number;
  p1: number;
  N: number;
  /** Inclination of the moon's orbit to the equator, and ν, ξ, ν′, 2ν″ (table 6), degrees. */
  I: number;
  nu: number;
  xi: number;
  nuPrime: number;
  twoNuDoublePrime: number;
}

/** The astronomical elements at an instant (Schureman, table 1 and paragraph 24). */
export function tideAstronomy(ms: number): TideAstronomy {
  const t = (ms - EPOCH) / (36_525 * 24 * HOUR);
  const s = norm(
    270 + 26 / 60 + 14.72 * SECONDS + (1336 * 360 + 1_108_411.2 * SECONDS) * t + 9.09 * SECONDS * t * t + 0.0068 * SECONDS * t ** 3,
  );
  const h = norm(279 + 41 / 60 + 48.04 * SECONDS + 129_602_768.13 * SECONDS * t + 1.089 * SECONDS * t * t);
  const p1 = norm(281 + 13 / 60 + 15.0 * SECONDS + 6_189.03 * SECONDS * t + 1.63 * SECONDS * t * t + 0.012 * SECONDS * t ** 3);
  const p = norm(
    334 + 19 / 60 + 40.87 * SECONDS + (11 * 360 + 392_515.94 * SECONDS) * t - 37.24 * SECONDS * t * t - 0.045 * SECONDS * t ** 3,
  );
  const N = norm(
    259 + 10 / 60 + 57.12 * SECONDS - (5 * 360 + 482_912.63 * SECONDS) * t + 7.58 * SECONDS * t * t + 0.008 * SECONDS * t ** 3,
  );
  const dayStart = Math.floor(ms / (24 * HOUR)) * 24 * HOUR;
  const T = norm(180 + (15 * (ms - dayStart)) / HOUR);
  return { T, s, h, p, p1, N, ...nodeAngles(N) };
}

/** I, ν, ξ, ν′ and 2ν″ for a longitude of the moon's node, degrees: Schureman's table 6. */
export function nodeAngles(N: number): Pick<TideAstronomy, "I" | "nu" | "xi" | "nuPrime" | "twoNuDoublePrime"> {
  // The triangle of paragraph 24: side N between the node and the equinox, angles i (at
  // the node) and ω (at the equinox); the third angle is 180° − I, the side opposite i is
  // ν and the side opposite ω is N − ξ. Napier's analogies give the two sides.
  const I = Math.acos(cos(INCLINATION) * cos(OMEGA) - sin(INCLINATION) * sin(OMEGA) * cos(N)) / DEG;
  // N is taken between −180° and 180° so that each half-angle stays on the branch where
  // ν and ξ are small and share N's sign, as paragraph 25 says they do.
  const n = norm(N) > 180 ? norm(N) - 360 : norm(N);
  const halfN = Math.tan((n / 2) * DEG);
  const sum = (2 * Math.atan((halfN * cos((OMEGA - INCLINATION) / 2)) / cos((OMEGA + INCLINATION) / 2))) / DEG; // ν + (N − ξ)
  const diff = (2 * Math.atan((halfN * sin((INCLINATION - OMEGA) / 2)) / sin((INCLINATION + OMEGA) / 2))) / DEG; // ν − (N − ξ)
  const nu = (sum + diff) / 2;
  const xi = n - (sum - diff) / 2;
  // Formulas 224 and 232.
  const nuPrime = atanDeg(sin(2 * I) * sin(nu), sin(2 * I) * cos(nu) + 0.3347);
  const twoNuDoublePrime = atanDeg(sin(I) ** 2 * sin(2 * nu), sin(I) ** 2 * cos(2 * nu) + 0.0727);
  return { I, nu, xi, nuPrime, twoNuDoublePrime };
}

type NodeFactor = (a: TideAstronomy) => { f: number; u: number };

// Node factors, with the u that goes with them: the formula numbers are Schureman's.
const fM2: NodeFactor = (a) => ({ f: cos(a.I / 2) ** 4 / 0.9154, u: 2 * a.xi - 2 * a.nu }); // 78
const fO1: NodeFactor = (a) => ({ f: (sin(a.I) * cos(a.I / 2) ** 2) / 0.38, u: 2 * a.xi - a.nu }); // 75
const fJ1: NodeFactor = (a) => ({ f: sin(2 * a.I) / 0.7214, u: -a.nu }); // 76
const fOO1: NodeFactor = (a) => ({ f: (sin(a.I) * sin(a.I / 2) ** 2) / 0.0164, u: -2 * a.xi - a.nu }); // 77
const fMm: NodeFactor = (a) => ({ f: (2 / 3 - sin(a.I) ** 2) / 0.5021, u: 0 }); // 73
const fMf: NodeFactor = (a) => ({ f: sin(a.I) ** 2 / 0.1578, u: -2 * a.xi }); // 74
const fM3: NodeFactor = (a) => ({ f: cos(a.I / 2) ** 6 / 0.8758, u: 3 * a.xi - 3 * a.nu }); // 149
const fK1: NodeFactor = (a) => ({
  f: Math.sqrt(0.8965 * sin(2 * a.I) ** 2 + 0.6001 * sin(2 * a.I) * cos(a.nu) + 0.1006), // 227
  u: -a.nuPrime,
});
const fK2: NodeFactor = (a) => ({
  f: Math.sqrt(19.0444 * sin(a.I) ** 4 + 2.7702 * sin(a.I) ** 2 * cos(2 * a.nu) + 0.0981), // 235
  u: -a.twoNuDoublePrime,
});
const fM1: NodeFactor = (a) => {
  // Formulas 195, 202 and 206, with P = p − ξ (191).
  const P = a.p - a.xi;
  const halfI = cos(a.I / 2) ** 2;
  const invQa = Math.sqrt(0.25 + 1.5 * (cos(a.I) / halfI) * cos(2 * P) + 2.25 * (cos(a.I) ** 2 / halfI ** 2));
  // Q keeps to the quadrant of P: tan Q is a fraction of tan P (203), and Q grows with P.
  const Q = Math.atan2(((5 * cos(a.I) - 1) / (7 * cos(a.I) + 1)) * sin(P), cos(P)) / DEG;
  return { f: ((sin(a.I) * halfI) / 0.38) * invQa, u: a.xi - a.nu + Q };
};
const fL2: NodeFactor = (a) => {
  // Formulas 213 to 215.
  const P = a.p - a.xi;
  const tanHalf = Math.tan((a.I / 2) * DEG);
  const invRa = Math.sqrt(1 - 12 * tanHalf ** 2 * cos(2 * P) + 36 * tanHalf ** 4);
  const R = atanDeg(sin(2 * P), 1 / (6 * tanHalf ** 2) - cos(2 * P));
  return { f: (cos(a.I / 2) ** 4 / 0.9154) * invRa, u: 2 * a.xi - 2 * a.nu - R };
};
const unity: NodeFactor = () => ({ f: 1, u: 0 });
/** A compound tide's factor: the product of its parts' factors, and the sum of their u. */
const product =
  (...parts: Array<[NodeFactor, number]>): NodeFactor =>
  (a) => {
    let f = 1;
    let u = 0;
    for (const [factor, power] of parts) {
      const one = factor(a);
      f *= one.f ** Math.abs(power);
      u += one.u * power;
    }
    return { f, u };
  };

interface Constituent {
  /** Coefficients of T, s, h, p and p1 in V, and a constant, degrees (table 2 and 2a). */
  v: readonly [number, number, number, number, number, number];
  node: NodeFactor;
}

/** NOAA's 37 constituents, by NOAA's names, with Schureman's arguments. */
export const TIDE_CONSTITUENTS: Record<string, Constituent> = {
  M2: { v: [2, -2, 2, 0, 0, 0], node: fM2 },
  S2: { v: [2, 0, 0, 0, 0, 0], node: unity },
  N2: { v: [2, -3, 2, 1, 0, 0], node: fM2 },
  K1: { v: [1, 0, 1, 0, 0, -90], node: fK1 },
  M4: { v: [4, -4, 4, 0, 0, 0], node: product([fM2, 2]) },
  O1: { v: [1, -2, 1, 0, 0, 90], node: fO1 },
  M6: { v: [6, -6, 6, 0, 0, 0], node: product([fM2, 3]) },
  MK3: { v: [3, -2, 3, 0, 0, -90], node: product([fM2, 1], [fK1, 1]) },
  S4: { v: [4, 0, 0, 0, 0, 0], node: unity },
  MN4: { v: [4, -5, 4, 1, 0, 0], node: product([fM2, 2]) },
  NU2: { v: [2, -3, 4, -1, 0, 0], node: fM2 },
  S6: { v: [6, 0, 0, 0, 0, 0], node: unity },
  MU2: { v: [2, -4, 4, 0, 0, 0], node: fM2 },
  "2N2": { v: [2, -4, 2, 2, 0, 0], node: fM2 },
  OO1: { v: [1, 2, 1, 0, 0, -90], node: fOO1 },
  LAM2: { v: [2, -1, 0, 1, 0, 180], node: fM2 },
  S1: { v: [1, 0, 0, 0, 0, 0], node: unity },
  M1: { v: [1, -1, 1, 0, 0, -90], node: fM1 },
  J1: { v: [1, 1, 1, -1, 0, -90], node: fJ1 },
  MM: { v: [0, 1, 0, -1, 0, 0], node: fMm },
  SSA: { v: [0, 0, 2, 0, 0, 0], node: unity },
  SA: { v: [0, 0, 1, 0, 0, 0], node: unity },
  MSF: { v: [0, 2, -2, 0, 0, 0], node: fMm },
  MF: { v: [0, 2, 0, 0, 0, 0], node: fMf },
  RHO: { v: [1, -3, 3, -1, 0, 90], node: fO1 },
  Q1: { v: [1, -3, 1, 1, 0, 90], node: fO1 },
  T2: { v: [2, 0, -1, 0, 1, 0], node: unity },
  R2: { v: [2, 0, 1, 0, -1, 180], node: unity },
  "2Q1": { v: [1, -4, 1, 2, 0, 90], node: fO1 },
  P1: { v: [1, 0, -1, 0, 0, 90], node: unity },
  "2SM2": { v: [2, 2, -2, 0, 0, 0], node: product([fM2, -1]) },
  M3: { v: [3, -3, 3, 0, 0, 0], node: fM3 },
  L2: { v: [2, -1, 2, -1, 0, 180], node: fL2 },
  "2MK3": { v: [3, -4, 3, 0, 0, 90], node: product([fM2, 2], [fK1, -1]) },
  K2: { v: [2, 0, 2, 0, 0, 0], node: fK2 },
  M8: { v: [8, -8, 8, 0, 0, 0], node: product([fM2, 4]) },
  MS4: { v: [4, -2, 2, 0, 0, 0], node: fM2 },
};

/** Equilibrium argument V of a constituent at an instant, degrees, 0 to 360. */
export function tideArgument(name: string, a: TideAstronomy): number {
  const c = TIDE_CONSTITUENTS[name];
  if (!c) throw new Error(`Unknown constituent ${name}`);
  const [kT, ks, kh, kp, kp1, k0] = c.v;
  return norm(kT * a.T + ks * a.s + kh * a.h + kp * a.p + kp1 * a.p1 + k0);
}

/** A station's constants, ready to predict from. */
export interface HarmonicStation {
  /** Mean sea level above the chart datum the heights are given on, metres. */
  datumOffset: number;
  constituents: ReadonlyArray<{ name: string; amplitude: number; phase: number }>;
}

/** Constituents with the node corrections fixed for a stretch of time, as tide tables do for a year. */
interface Prepared {
  /** Per constituent: f·H (m), speed (degrees an hour), and the phase at the reference instant (V + u − κ′). */
  terms: Array<{ amp: number; speed: number; phase0: number }>;
  ref: number;
  offset: number;
}

/** Degrees an hour, from the rates of change of T, s, h, p and p1 (table 1). */
function speedOf(c: Constituent): number {
  const rates = [15, 0.549_016_53, 0.041_068_64, 0.004_641_83, 0.000_001_96];
  return c.v.slice(0, 5).reduce((sum, k, i) => sum + k * (rates[i] as number), 0);
}

/** The middle of the UTC year an instant falls in: node factors and u are taken there, for the whole year. */
function middleOfYear(ms: number): number {
  const year = new Date(ms).getUTCFullYear();
  return (Date.UTC(year, 0, 1) + Date.UTC(year + 1, 0, 1)) / 2;
}

function prepare(station: HarmonicStation, ref: number): Prepared {
  const a = tideAstronomy(ref);
  const node = tideAstronomy(middleOfYear(ref));
  const terms: Prepared["terms"] = [];
  for (const each of station.constituents) {
    const c = TIDE_CONSTITUENTS[each.name];
    if (!c || each.amplitude === 0) continue;
    const { f, u } = c.node(node);
    terms.push({ amp: f * each.amplitude, speed: speedOf(c), phase0: tideArgument(each.name, a) + u - each.phase });
  }
  return { terms, ref, offset: station.datumOffset };
}

function heightAt(p: Prepared, ms: number): number {
  const hours = (ms - p.ref) / HOUR;
  let h = p.offset;
  for (const t of p.terms) h += t.amp * cos(t.phase0 + t.speed * hours);
  return h;
}

/** Rate of rise, metres an hour. */
function rateAt(p: Prepared, ms: number): number {
  const hours = (ms - p.ref) / HOUR;
  let r = 0;
  for (const t of p.terms) r -= t.amp * t.speed * DEG * sin(t.phase0 + t.speed * hours);
  return r;
}

/**
 * Node factors and u are worked out for the middle of each calendar year and held for
 * the year, as Schureman advises ("for practical purposes, however, the values for the
 * middle of the year are generally taken as constant for the entire year", paragraph 77)
 * and as NOAA's own predictions do. V is worked out afresh for each stretch of up to
 * 31 days, which never crosses the turn of a year.
 */
const STRETCH = 31 * 24 * HOUR;
function stretches(from: number, to: number, station: HarmonicStation): Array<{ from: number; to: number; p: Prepared }> {
  const out = [];
  for (let start = from; start < to; ) {
    const yearEnd = Date.UTC(new Date(start).getUTCFullYear() + 1, 0, 1);
    const end = Math.min(to, start + STRETCH, yearEnd);
    out.push({ from: start, to: end, p: prepare(station, start) });
    start = end;
  }
  return out;
}

/** Heights at a fixed step, metres above the station's datum. */
export function tideCurve(station: HarmonicStation, from: number, to: number, stepMs = 10 * 60_000): Array<{ t: number; h: number }> {
  const out: Array<{ t: number; h: number }> = [];
  for (const part of stretches(from, to, station)) {
    for (let t = part.from; t < part.to; t += stepMs) out.push({ t, h: heightAt(part.p, t) });
  }
  if (to >= from) out.push({ t: to, h: heightAt(prepare(station, to), to) });
  return out;
}

export interface TideTurn {
  kind: "high" | "low";
  t: number;
  /** Metres above the station's datum. */
  h: number;
}

/**
 * A rise or fall smaller than this between a high and the next low (or a low and the next
 * high) is not counted as a tide: where the tide is small and nearly flat (the Gulf of
 * Mexico), the curve can wobble by a few millimetres, and NOAA's own tables leave such a
 * wobble out. Half a centimetre is Outpost's choice, not a published rule; it matches
 * NOAA's tables for the stations in the tests.
 */
export const SMALLEST_TIDE_M = 0.005;

/** High and low waters between two instants: where the rate of rise changes sign, found to within a second. */
export function tideTurns(station: HarmonicStation, from: number, to: number): TideTurn[] {
  const found: TideTurn[] = [];
  const step = 6 * 60_000;
  for (const part of stretches(from, to, station)) {
    let t0 = part.from;
    let r0 = rateAt(part.p, t0);
    while (t0 < part.to) {
      const t1 = Math.min(t0 + step, part.to);
      const r1 = rateAt(part.p, t1);
      if ((r0 > 0 && r1 <= 0) || (r0 < 0 && r1 >= 0)) {
        let lo = t0;
        let hi = t1;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          if (rateAt(part.p, mid) > 0 === r0 > 0) lo = mid;
          else hi = mid;
        }
        const t = Math.round((lo + hi) / 2);
        found.push({ kind: r0 > 0 ? "high" : "low", t, h: heightAt(part.p, t) });
      }
      t0 = t1;
      r0 = r1;
    }
  }
  // Leave out the smallest wobbles first, a high and a low at a time, so that highs and lows still alternate.
  const out = found.filter((turn, i) => i === 0 || turn.kind !== found[i - 1]?.kind);
  const size = (i: number) => Math.abs((out[i] as TideTurn).h - (out[i + 1] as TideTurn).h);
  for (;;) {
    let smallest = -1;
    for (let i = 0; i + 1 < out.length; i++) {
      if (size(i) < SMALLEST_TIDE_M && (smallest < 0 || size(i) < size(smallest))) smallest = i;
    }
    if (smallest < 0) return out;
    out.splice(smallest, 2);
  }
}

/** Height at one instant. */
export function tideHeight(station: HarmonicStation, ms: number): number {
  return heightAt(prepare(station, ms), ms);
}

// ── What the server and the screen exchange ─────────────────────────────────

export interface TideStationDto {
  id: string;
  name: string;
  /** US state or territory, as NOAA writes it; may be empty. */
  state: string;
  lat: number;
  lon: number;
  /** Kilometres from the place asked about. */
  distanceKm: number;
  /** "MLLW" when heights are above mean lower low water, "MSL" when the station has no such datum. */
  datum: "MLLW" | "MSL";
}

export interface TideStationsResponse {
  stations: TideStationDto[];
  /** Where the constants come from, said once for the screen. */
  source: TideSource;
}

export interface TideSource {
  name: string;
  url: string;
  licence: string;
  read: string;
  /** How many stations are held. */
  count: number;
}

export interface TidePredictionResponse {
  station: TideStationDto;
  from: number;
  to: number;
  turns: TideTurn[];
  /** Heights every 10 minutes, metres above the datum. */
  curve: Array<{ t: number; h: number }>;
  /** How many constituents the station has. */
  constituents: number;
  source: TideSource;
}

/** Most days a prediction may cover in one request. */
export const TIDE_MAX_DAYS = 31;
