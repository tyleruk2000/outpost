/**
 * Where the Sun, the Moon and the planets are, worked out on the device. Pure.
 *
 * The orbits are Paul Schlyter's "How to compute planetary positions"
 * (stjarnhimlen.se/comp/ppcomp.html, read 21 November 2026): mean orbital elements of
 * date, Kepler's equation, and the largest perturbations of the Moon, Jupiter and Saturn.
 * He gives the method as good to one or two minutes of arc. On top of his geometric
 * positions this adds what he leaves out: Terrestrial Time (astro.ts), the light's travel
 * time from a planet, nutation, and the aberration of light from the Earth's motion. The
 * tests hold the results to the US Naval Observatory's almanac and say how close they are.
 */
import {
  aberrate,
  DEG,
  eclipticToEquatorial,
  ghaAries,
  LIGHT_AU_PER_DAY,
  meanObliquity,
  norm360,
  nutation,
  toRaDec,
  ttCenturies,
  ttDaysFromJ2000,
  type Vec3,
} from "./astro.ts";

const sin = (d: number) => Math.sin(d * DEG);
const cos = (d: number) => Math.cos(d * DEG);

export const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn"] as const;
export type PlanetId = (typeof PLANETS)[number];
export type BodyId = "sun" | "moon" | PlanetId;

export const BODY_NAMES: Record<BodyId, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
};

interface Elements {
  N: number;
  i: number;
  w: number;
  a: number;
  e: number;
  M: number;
}

/** Schlyter's day number: days from 0h UT on 31 December 1999, here counted in TT. */
const dayNumber = (ms: number): number => ttDaysFromJ2000(ms) + 1.5;

function elements(body: "sun" | "moon" | PlanetId, d: number): Elements {
  switch (body) {
    case "sun":
      return { N: 0, i: 0, w: 282.9404 + 4.70935e-5 * d, a: 1, e: 0.016709 - 1.151e-9 * d, M: 356.047 + 0.9856002585 * d };
    case "moon":
      return {
        N: 125.1228 - 0.0529538083 * d,
        i: 5.1454,
        w: 318.0634 + 0.1643573223 * d,
        a: 60.2666,
        e: 0.0549,
        M: 115.3654 + 13.0649929509 * d,
      };
    case "mercury":
      return {
        N: 48.3313 + 3.24587e-5 * d,
        i: 7.0047 + 5e-8 * d,
        w: 29.1241 + 1.01444e-5 * d,
        a: 0.387098,
        e: 0.205635 + 5.59e-10 * d,
        M: 168.6562 + 4.0923344368 * d,
      };
    case "venus":
      return {
        N: 76.6799 + 2.4659e-5 * d,
        i: 3.3946 + 2.75e-8 * d,
        w: 54.891 + 1.38374e-5 * d,
        a: 0.72333,
        e: 0.006773 - 1.302e-9 * d,
        M: 48.0052 + 1.6021302244 * d,
      };
    case "mars":
      return {
        N: 49.5574 + 2.11081e-5 * d,
        i: 1.8497 - 1.78e-8 * d,
        w: 286.5016 + 2.92961e-5 * d,
        a: 1.523688,
        e: 0.093405 + 2.516e-9 * d,
        M: 18.6021 + 0.5240207766 * d,
      };
    case "jupiter":
      return {
        N: 100.4542 + 2.76854e-5 * d,
        i: 1.303 - 1.557e-7 * d,
        w: 273.8777 + 1.64505e-5 * d,
        a: 5.20256,
        e: 0.048498 + 4.469e-9 * d,
        M: 19.895 + 0.0830853001 * d,
      };
    case "saturn":
      return {
        N: 113.6634 + 2.3898e-5 * d,
        i: 2.4886 - 1.081e-7 * d,
        w: 339.3939 + 2.97661e-5 * d,
        a: 9.55475,
        e: 0.055546 - 9.499e-9 * d,
        M: 316.967 + 0.0334442282 * d,
      };
  }
}

/** Ecliptic longitude, latitude (degrees) and distance from an orbit, before perturbations. */
function orbitPosition(el: Elements): { lon: number; lat: number; r: number } {
  const M = norm360(el.M);
  let E = M + (el.e / DEG) * sin(M) * (1 + el.e * cos(M));
  for (let pass = 0; pass < 10; pass++) {
    const next = E - (E - (el.e / DEG) * sin(E) - M) / (1 - el.e * cos(E));
    if (Math.abs(next - E) < 1e-9) {
      E = next;
      break;
    }
    E = next;
  }
  const xv = el.a * (cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * sin(E);
  const v = Math.atan2(yv, xv) / DEG;
  const r = Math.hypot(xv, yv);
  const xh = r * (cos(el.N) * cos(v + el.w) - sin(el.N) * sin(v + el.w) * cos(el.i));
  const yh = r * (sin(el.N) * cos(v + el.w) + cos(el.N) * sin(v + el.w) * cos(el.i));
  const zh = r * sin(v + el.w) * sin(el.i);
  return { lon: norm360(Math.atan2(yh, xh) / DEG), lat: Math.atan2(zh, Math.hypot(xh, yh)) / DEG, r };
}

const rect = (lon: number, lat: number, r: number): Vec3 => [r * cos(lon) * cos(lat), r * sin(lon) * cos(lat), r * sin(lat)];

/** The Sun seen from the Earth's centre: ecliptic of date, rectangular, AU. */
function sunVector(d: number): Vec3 {
  const p = orbitPosition(elements("sun", d));
  return rect(p.lon, 0, p.r);
}

/** The Earth's velocity, ecliptic of date, AU a day: the Sun's apparent motion, turned round. */
function earthVelocity(d: number): Vec3 {
  const a = sunVector(d - 0.5);
  const b = sunVector(d + 0.5);
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** A planet from the Sun: ecliptic of date, with Schlyter's perturbations of Jupiter and Saturn. */
function heliocentric(planet: PlanetId, d: number): Vec3 {
  const p = orbitPosition(elements(planet, d));
  if (planet === "jupiter" || planet === "saturn") {
    const mj = elements("jupiter", d).M;
    const ms = elements("saturn", d).M;
    if (planet === "jupiter") {
      p.lon +=
        -0.332 * sin(2 * mj - 5 * ms - 67.6) -
        0.056 * sin(2 * mj - 2 * ms + 21) +
        0.042 * sin(3 * mj - 5 * ms + 21) -
        0.036 * sin(mj - 2 * ms) +
        0.022 * cos(mj - ms) +
        0.023 * sin(2 * mj - 3 * ms + 52) -
        0.016 * sin(mj - 5 * ms - 69);
    } else {
      p.lon +=
        0.812 * sin(2 * mj - 5 * ms - 67.6) -
        0.229 * cos(2 * mj - 4 * ms - 2) +
        0.119 * sin(mj - 2 * ms - 3) +
        0.046 * sin(2 * mj - 6 * ms - 69) +
        0.014 * sin(mj - 3 * ms + 32);
      p.lat += -0.02 * cos(2 * mj - 4 * ms - 2) + 0.018 * sin(2 * mj - 6 * ms - 49);
    }
  }
  return rect(p.lon, p.lat, p.r);
}

/** The Moon from the Earth's centre: ecliptic longitude, latitude (degrees) and distance (Earth radii), with Schlyter's perturbations. */
function moonEcliptic(d: number): { lon: number; lat: number; r: number } {
  const moon = elements("moon", d);
  const sun = elements("sun", d);
  const p = orbitPosition(moon);
  const Ms = norm360(sun.M);
  const Mm = norm360(moon.M);
  const Ls = norm360(sun.M + sun.w);
  const Lm = norm360(moon.M + moon.w + moon.N);
  const D = Lm - Ls;
  const F = Lm - moon.N;
  p.lon +=
    -1.274 * sin(Mm - 2 * D) +
    0.658 * sin(2 * D) -
    0.186 * sin(Ms) -
    0.059 * sin(2 * Mm - 2 * D) -
    0.057 * sin(Mm - 2 * D + Ms) +
    0.053 * sin(Mm + 2 * D) +
    0.046 * sin(2 * D - Ms) +
    0.041 * sin(Mm - Ms) -
    0.035 * sin(D) -
    0.031 * sin(Mm + Ms) -
    0.015 * sin(2 * F - 2 * D) +
    0.011 * sin(Mm - 4 * D);
  p.lat +=
    -0.173 * sin(F - 2 * D) - 0.055 * sin(Mm - F - 2 * D) - 0.046 * sin(Mm + F - 2 * D) + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * Mm + F);
  p.r += -0.58 * cos(Mm - 2 * D) - 0.46 * cos(2 * D);
  return { lon: norm360(p.lon), lat: p.lat, r: p.r };
}

/** The Earth's equatorial radius, km, and the astronomical unit, km (Circular 179's constants). */
const EARTH_RADIUS_KM = 6378.1366;
const AU_KM = 149_597_870.7;

export interface BodyPlace {
  id: BodyId;
  /** Apparent right ascension and declination, true equator and equinox of date, degrees. */
  ra: number;
  dec: number;
  /** Greenwich hour angle, degrees, 0 to 360. */
  gha: number;
  /** From the Earth's centre, km. */
  distanceKm: number;
  /** Horizontal parallax, degrees. */
  hp: number;
  /** Semi-diameter, degrees (0 for the planets: they are taken as points). */
  sd: number;
  /** Ecliptic longitude and latitude of date, degrees (for phases). */
  lon: number;
  lat: number;
  /** For the planets: from the Sun, AU (for brightness). */
  sunDistanceAu?: number;
}

/** Turn an ecliptic-of-date direction into an apparent place: aberration, nutation, the true obliquity. */
function apparent(eclipticVector: Vec3, d: number, t: number, aberration: boolean): { ra: number; dec: number; lon: number; lat: number } {
  const v = aberration ? aberrate(eclipticVector, earthVelocity(d)) : eclipticVector;
  const { dpsi, deps } = nutation(t);
  const lon = norm360(Math.atan2(v[1], v[0]) / DEG + dpsi);
  const lat = Math.atan2(v[2], Math.hypot(v[0], v[1])) / DEG;
  const unit = rect(lon, lat, 1);
  const eq = eclipticToEquatorial(unit[0], unit[1], unit[2], meanObliquity(t) + deps);
  return { ...toRaDec(eq), lon, lat };
}

/** Where a body is at an instant (milliseconds of UT). */
export function bodyPlace(id: BodyId, ms: number): BodyPlace {
  const d = dayNumber(ms);
  const t = ttCenturies(ms);
  const aries = ghaAries(ms);
  if (id === "moon") {
    const m = moonEcliptic(d);
    const place = apparent(rect(m.lon, m.lat, 1), d, t, false);
    const distanceKm = m.r * EARTH_RADIUS_KM;
    // Schlyter: parallax asin(1/r), r in Earth radii; apparent diameter 1873.7″ × 60 / r.
    return {
      id,
      ...place,
      gha: norm360(aries - place.ra),
      distanceKm,
      hp: Math.asin(1 / m.r) / DEG,
      sd: (1873.7 * 60) / m.r / 2 / 3600,
      lon: place.lon,
      lat: place.lat,
    };
  }
  const sun = sunVector(d);
  if (id === "sun") {
    const place = apparent(sun, d, t, true);
    const au = Math.hypot(sun[0], sun[1], sun[2]);
    // Parallax 8.794″ at 1 AU (Schlyter, section 13); diameter 1919.26″ at 1 AU (section 15).
    return { id, ...place, gha: norm360(aries - place.ra), distanceKm: au * AU_KM, hp: 8.794 / au / 3600, sd: 1919.26 / au / 2 / 3600 };
  }
  // A planet: where it was when the light now arriving left it.
  let helio = heliocentric(id, d);
  let geo: Vec3 = [helio[0] + sun[0], helio[1] + sun[1], helio[2] + sun[2]];
  for (let pass = 0; pass < 2; pass++) {
    const tau = Math.hypot(geo[0], geo[1], geo[2]) / LIGHT_AU_PER_DAY;
    helio = heliocentric(id, d - tau);
    geo = [helio[0] + sun[0], helio[1] + sun[1], helio[2] + sun[2]];
  }
  const place = apparent(geo, d, t, true);
  const au = Math.hypot(geo[0], geo[1], geo[2]);
  return {
    id,
    ...place,
    gha: norm360(aries - place.ra),
    distanceKm: au * AU_KM,
    hp: 8.794 / au / 3600,
    sd: 0,
    sunDistanceAu: Math.hypot(helio[0], helio[1], helio[2]),
  };
}

const MAGNITUDE: Record<PlanetId, (fv: number) => number> = {
  mercury: (fv) => -0.36 + 0.027 * fv + 2.2e-13 * fv ** 6,
  venus: (fv) => -4.34 + 0.013 * fv + 4.2e-7 * fv ** 3,
  mars: (fv) => -1.51 + 0.016 * fv,
  jupiter: (fv) => -9.25 + 0.014 * fv,
  // Without the rings' share, which brightens Saturn by up to about a magnitude.
  saturn: (fv) => -9.0 + 0.044 * fv,
};

/** A planet's brightness (visual magnitude) and its angle from the Sun, degrees (Schlyter, section 15). */
export function planetLook(id: PlanetId, ms: number): { magnitude: number; elongation: number } {
  const p = bodyPlace(id, ms);
  const s = bodyPlace("sun", ms).distanceKm / AU_KM;
  const R = p.distanceKm / AU_KM;
  const r = p.sunDistanceAu ?? 1;
  const elongation = Math.acos(Math.max(-1, Math.min(1, (s * s + R * R - r * r) / (2 * s * R)))) / DEG;
  const fv = Math.acos(Math.max(-1, Math.min(1, (r * r + R * R - s * s) / (2 * r * R)))) / DEG;
  return { magnitude: MAGNITUDE[id](fv) + 5 * Math.log10(r * R), elongation };
}
