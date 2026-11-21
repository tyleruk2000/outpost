/**
 * Celestial navigation: from a sextant altitude to a line of position, and from lines to
 * a fix, with every step kept so that a person can follow it and check it by hand. Pure.
 *
 * - Almanac: the Greenwich hour angle and declination of the body at the moment of the
 *   sight, worked out here (bodies.ts, stars.ts) in place of the Nautical Almanac.
 * - Corrections, in the order the almanac's own tables take them: index error; dip of the
 *   sea horizon, 1.76′ × √(height of eye in metres) (N. Bowditch, The American Practical
 *   Navigator, 2019, appendix B, article 3); refraction, from NOAA's model of the air's
 *   refraction (as for Sun times); semi-diameter for a limb; and parallax, horizontal
 *   parallax × cos(altitude) (P. Schlyter, "How to compute planetary positions",
 *   section 13). Augmentation of the Moon's semi-diameter (a few tenths of a minute at
 *   most) is left out.
 * - Reduction: the computed altitude and azimuth at an assumed position by the formulas
 *   for sight reduction by calculator (Bowditch, appendix B, article 5); the intercept is
 *   observed less computed altitude, one minute of arc being one nautical mile.
 * - Fix: where the lines cross, by least squares when there are more than two, repeated
 *   from the point found so that the curvature of the circles of position does not matter.
 */

import { geometricFromApparent } from "../sun.ts";
import { DEG, ghaAries, horizonFrom, norm180, norm360 } from "./astro.ts";
import { type BodyId, bodyPlace } from "./bodies.ts";
import { type CatalogueStar, starPlaceOfDate } from "./stars.ts";

/** What was observed: the Sun, the Moon, a planet, or a star by its catalogue number. */
export type SightBody = { kind: "body"; id: BodyId } | { kind: "star"; star: CatalogueStar };

export type Limb = "lower" | "upper" | "centre";

export interface SightInput {
  body: SightBody;
  /** The moment of the sight, UT milliseconds. */
  at: number;
  /** Sextant altitude, degrees. */
  hs: number;
  /** Index error, minutes of arc: positive when the sextant reads high ("on the arc"), negative when it reads low ("off the arc"). */
  indexError: number;
  /** Height of eye above the sea, metres. Ignored with an artificial horizon. */
  heightOfEye: number;
  /**
   * A sea horizon; an artificial one (a dish of water or oil), which doubles the angle and
   * has no dip; or a plumb line on a quadrant or protractor, which reads the altitude
   * from the vertical and has no dip either.
   */
  horizon: "sea" | "artificial" | "plumb";
  limb: Limb;
}

export interface CorrectionStep {
  /** What the step is, in words. */
  label: string;
  /** The correction, minutes of arc (signed), or null for a step that halves rather than adds. */
  minutes: number | null;
  /** The altitude after the step, degrees. */
  after: number;
  /** How the figure was found, in one line. */
  how: string;
}

export interface Almanac {
  gha: number;
  dec: number;
  /** Semi-diameter and horizontal parallax, minutes of arc (0 for stars). */
  sd: number;
  hp: number;
}

export function almanacFor(body: SightBody, at: number): Almanac {
  if (body.kind === "star") {
    const place = starPlaceOfDate(body.star, at);
    return { gha: norm360(ghaAries(at) - place.ra), dec: place.dec, sd: 0, hp: 0 };
  }
  const place = bodyPlace(body.id, at);
  return { gha: place.gha, dec: place.dec, sd: place.sd * 60, hp: place.hp * 60 };
}

/** Dip of the sea horizon, minutes of arc, for a height of eye in metres (Bowditch: D = 1.76′ √h). */
export const dipMinutes = (heightOfEye: number): number => 1.76 * Math.sqrt(Math.max(0, heightOfEye));

/** Sextant altitude to observed altitude, step by step. */
export function correctSight(input: SightInput, almanac: Almanac): { steps: CorrectionStep[]; ho: number } {
  const steps: CorrectionStep[] = [];
  let h = input.hs;
  const push = (label: string, minutes: number | null, how: string) => steps.push({ label, minutes, after: h, how });

  if (input.indexError !== 0) {
    h -= input.indexError / 60;
    push(
      "Index error",
      -input.indexError,
      input.indexError > 0
        ? `The sextant reads ${fmtMin(input.indexError)} high (on the arc): take it off.`
        : `The sextant reads ${fmtMin(-input.indexError)} low (off the arc): add it on.`,
    );
  }
  if (input.horizon === "artificial") {
    h /= 2;
    push("Halve for the artificial horizon", null, "The reflection doubles the angle, and there is no dip.");
  } else if (input.horizon === "sea") {
    const dip = dipMinutes(input.heightOfEye);
    h -= dip / 60;
    push("Dip", -dip, `1.76′ × √${trim(input.heightOfEye)} m height of eye.`);
  }
  // h is now the apparent altitude.
  const refraction = (h - geometricFromApparent(h)) * 60;
  h -= refraction / 60;
  push("Refraction", -refraction, `The air lifts the body by ${fmtMin(refraction)} at ${trim(h + refraction / 60, 2)}° (average air).`);
  if (almanac.sd > 0 && input.limb !== "centre") {
    const sd = input.limb === "lower" ? almanac.sd : -almanac.sd;
    h += sd / 60;
    push(
      "Semi-diameter",
      sd,
      input.limb === "lower" ? "The lower limb was brought down: add the radius." : "The upper limb was brought down: take off the radius.",
    );
  }
  if (almanac.hp > 0) {
    const parallax = almanac.hp * Math.cos(h * DEG);
    h += parallax / 60;
    push("Parallax", parallax, `Horizontal parallax ${fmtMin(almanac.hp)} × cos ${trim(h - parallax / 60, 1)}°.`);
  }
  return { steps, ho: h };
}

export interface Reduction {
  /** Assumed position used. */
  ap: { lat: number; lon: number };
  lha: number;
  hc: number;
  zn: number;
  /** Observed less computed altitude, nautical miles: positive is towards the body. */
  intercept: number;
}

/** Computed altitude and azimuth at an assumed position, and the intercept. */
export function reduce(almanac: Almanac, ho: number, ap: { lat: number; lon: number }): Reduction {
  const { altitude, azimuth } = horizonFrom(almanac.gha, almanac.dec, ap.lat, ap.lon);
  return { ap, lha: norm360(almanac.gha + ap.lon), hc: altitude, zn: azimuth, intercept: (ho - altitude) * 60 };
}

const NM_PER_DEG = 60;

/** A point a distance (nautical miles) along a bearing from another, on a flat chart near it. */
export function offset(from: { lat: number; lon: number }, east: number, north: number): { lat: number; lon: number } {
  const lat = from.lat + north / NM_PER_DEG;
  const lon = from.lon + east / (NM_PER_DEG * Math.max(0.01, Math.cos(((from.lat + lat) / 2) * DEG)));
  return { lat, lon: norm180(lon) };
}

/** A line of position: the foot of the intercept and the line through it at right angles to the azimuth. */
export interface LineOfPosition {
  /** The point on the line nearest the assumed position. */
  foot: { lat: number; lon: number };
  zn: number;
  /** Two ends, a distance either side of the foot, for drawing. */
  ends: [{ lat: number; lon: number }, { lat: number; lon: number }];
}

export function lineOfPosition(reduction: Reduction, halfLengthNm = 30, advance?: { east: number; north: number }): LineOfPosition {
  const z = reduction.zn * DEG;
  const shift = advance ?? { east: 0, north: 0 };
  const foot = offset(reduction.ap, reduction.intercept * Math.sin(z) + shift.east, reduction.intercept * Math.cos(z) + shift.north);
  // Along the line: at right angles to the azimuth.
  const along = { east: Math.cos(z), north: -Math.sin(z) };
  return {
    foot,
    zn: reduction.zn,
    ends: [
      offset(foot, -along.east * halfLengthNm, -along.north * halfLengthNm),
      offset(foot, along.east * halfLengthNm, along.north * halfLengthNm),
    ],
  };
}

export interface FixSight {
  almanac: Almanac;
  ho: number;
  /** How far the vessel or walker moved from this sight to the time of the fix, nautical miles east and north (for a running fix). */
  advance?: { east: number; north: number };
  /** The likely size of this sight's error, minutes of arc (one standard deviation). */
  sigma: number;
}

export interface Fix {
  position: { lat: number; lon: number };
  /** The error ellipse at one standard deviation: semi-axes (nautical miles) and the bearing of the long one. */
  ellipse: { major: number; minor: number; bearing: number };
  /** The largest distance of the fix from any of the lines, nautical miles. */
  worstResidual: number;
  /** The best angle at which two of the lines cross, degrees: under about 30° the fix is weak along the lines. */
  cut: number;
}

/** A sight reduced from where the observer was when it was taken, if the fix is at a later place: the fix less the run. */
function reduceFrom(sight: FixSight, fix: { lat: number; lon: number }): Reduction {
  const at = sight.advance ? offset(fix, -sight.advance.east, -sight.advance.north) : fix;
  return reduce(sight.almanac, sight.ho, at);
}

/**
 * The fix from two or more lines, by least squares, worked again from the point found until
 * it settles. Null when there are fewer than two lines or they are near parallel.
 */
export function fixFrom(sights: FixSight[], start: { lat: number; lon: number }): Fix | null {
  if (sights.length < 2) return null;
  let ap = start;
  for (let pass = 0; pass < 6; pass++) {
    let a11 = 0;
    let a12 = 0;
    let a22 = 0;
    let b1 = 0;
    let b2 = 0;
    for (const sight of sights) {
      const r = reduceFrom(sight, ap);
      const n = { e: Math.sin(r.zn * DEG), n: Math.cos(r.zn * DEG) };
      const w = 1 / (sight.sigma * sight.sigma);
      const rhs = r.intercept;
      a11 += w * n.e * n.e;
      a12 += w * n.e * n.n;
      a22 += w * n.n * n.n;
      b1 += w * n.e * rhs;
      b2 += w * n.n * rhs;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-6 * (a11 + a22) ** 2) return null;
    const east = (a22 * b1 - a12 * b2) / det;
    const north = (a11 * b2 - a12 * b1) / det;
    ap = offset(ap, east, north);
    if (Math.hypot(east, north) < 0.001) {
      // Covariance (AᵀWA)⁻¹: its eigenvalues are the squared semi-axes.
      const c11 = a22 / det;
      const c22 = a11 / det;
      const c12 = -a12 / det;
      const mean = (c11 + c22) / 2;
      const spread = Math.sqrt(((c11 - c22) / 2) ** 2 + c12 * c12);
      const major = Math.sqrt(mean + spread);
      const minor = Math.sqrt(Math.max(0, mean - spread));
      const bearing = norm360(90 - Math.atan2(mean + spread - c11, c12 || 1e-12) / DEG);
      const zns = sights.map((s) => reduceFrom(s, ap));
      const worstResidual = Math.max(...zns.map((r) => Math.abs(r.intercept)));
      let cut = 0;
      for (let i = 0; i < zns.length; i++)
        for (let j = i + 1; j < zns.length; j++) {
          const between = Math.abs(norm180(zns[i]!.zn - zns[j]!.zn));
          cut = Math.max(cut, Math.min(between, 180 - between));
        }
      return { position: ap, ellipse: { major, minor, bearing: norm360(bearing) % 180 }, worstResidual, cut };
    }
  }
  return null;
}

/**
 * Latitude from the Sun (or any body) on the meridian: the zenith distance and the
 * declination, the body bearing south or north of the observer.
 */
export function noonLatitude(ho: number, dec: number, bears: "south" | "north"): number {
  const zenithDistance = 90 - ho;
  return bears === "south" ? dec + zenithDistance : dec - zenithDistance;
}

/** Longitude from the moment of the Sun's meridian passage: the Sun's Greenwich hour angle then, west negative. */
export function noonLongitude(at: number): number {
  return norm180(-bodyPlace("sun", at).gha);
}

/**
 * Latitude from Polaris: the latitude at which Polaris stands at the observed altitude, at
 * the longitude given (found by Newton's method; Polaris is near enough the pole that a
 * longitude a degree or two out makes a few tenths of a minute of difference).
 */
export function polarisLatitude(almanac: Almanac, ho: number, longitude: number): number {
  let lat = ho;
  for (let pass = 0; pass < 20; pass++) {
    const here = horizonFrom(almanac.gha, almanac.dec, lat, longitude).altitude;
    const step = 0.001;
    const slope = (horizonFrom(almanac.gha, almanac.dec, lat + step, longitude).altitude - here) / step;
    const next = lat - (here - ho) / (slope || 1);
    if (Math.abs(next - lat) < 1e-7) return next;
    lat = Math.max(-89.9, Math.min(89.9, next));
  }
  return lat;
}

/** Nautical miles of longitude that a clock error (seconds) makes at a latitude: 4 seconds is a minute of longitude. */
export const clockErrorMiles = (seconds: number, latitude: number): number => (Math.abs(seconds) / 4) * Math.cos(latitude * DEG);

function fmtMin(minutes: number): string {
  return `${Math.abs(minutes).toFixed(1)}′`;
}
function trim(value: number, places = 1): string {
  return String(Number(value.toFixed(places)));
}

export interface StarToShoot {
  star: CatalogueStar;
  altitude: number;
  azimuth: number;
}

/**
 * The navigational stars best placed for a round of sights: between 15° and 70° up
 * (lower, refraction is uncertain; higher, the azimuth is hard to swing), the brightest
 * first, each at least 60° of azimuth from those already chosen and with lines crossing
 * theirs at 30° or more. Three, if three are up.
 */
export function starsToShoot(stars: readonly CatalogueStar[], at: number, latitude: number, longitude: number): StarToShoot[] {
  const placed = stars
    .filter((star) => star.navNumber !== null)
    .map((star) => {
      const almanac = almanacFor({ kind: "star", star }, at);
      const { altitude, azimuth } = horizonFrom(almanac.gha, almanac.dec, latitude, longitude);
      return { star, altitude, azimuth };
    })
    .filter((s) => s.altitude >= 15 && s.altitude <= 70)
    .sort((a, b) => a.star.magnitude - b.star.magnitude);
  const chosen: StarToShoot[] = [];
  for (const candidate of placed) {
    const fits = chosen.every((c) => {
      const apart = Math.abs(norm180(c.azimuth - candidate.azimuth));
      return apart >= 60 && Math.min(apart, 180 - apart) >= 30;
    });
    if (fits) chosen.push(candidate);
    if (chosen.length === 3) break;
  }
  return chosen;
}
