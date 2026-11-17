/**
 * The figures the solar clock's diagrams are drawn from, worked out by the same functions
 * the screen's answers come from (`sunAt`, `altitudeCrossing`, `shadowLength`,
 * `angleFromPolaris`), so that a picture and the numbers beside it cannot disagree. Pure:
 * the drawing is in the `*-plate.tsx` files.
 */
import { angleFromPolaris, STARS, type Star, starAt, starPlace } from "@/features/maps/lib/sky";
import { altitudeCrossing, geometricFromApparent, type IsoDate, sunAt, sunDay } from "@/features/maps/lib/sun";
import { formatDate } from "@/lib/utils";
import { type Place, shadowLength } from "./recovery";

const MINUTE = 60_000;
const DEG = Math.PI / 180;

/** A date as the rest of the app writes one ("17 Nov 2026"), through the shared formatter: midday on that date here. */
export function dayWords(date: IsoDate): string {
  const [year, month, day] = date.split("-").map(Number);
  return formatDate(new Date(year!, month! - 1, day!, 12).getTime());
}

/** Where the tip of a stick's shadow lies, in metres east and north of the stick's foot. */
export interface Tip {
  at: number;
  east: number;
  north: number;
  /** The shadow's length. */
  length: number;
  /** The shadow's direction from the foot, degrees clockwise from true north. */
  bearing: number;
}

/** The lowest the sun is drawn casting a shadow: below this the shadow runs off any plate. */
const LOWEST_DRAWN = 4;

/** The shadow's tip at an instant, or null with the sun too low for a shadow worth drawing. */
export function shadowTip(place: Place, at: number, stick: number): Tip | null {
  const sun = sunAt(at, place.lat, place.lon);
  if (sun.apparentAltitude < LOWEST_DRAWN) return null;
  const length = shadowLength(stick, sun.apparentAltitude);
  const bearing = (sun.azimuth + 180) % 360;
  return { at, length, bearing, east: length * Math.sin(bearing * DEG), north: length * Math.cos(bearing * DEG) };
}

/** The tip every `step` minutes from `from` to `to`, where the sun is high enough. */
export function tipTrack(place: Place, stick: number, from: number, to: number, step = 5): Tip[] {
  const tips: Tip[] = [];
  for (let at = from; at <= to + 1; at += step * MINUTE) {
    const tip = shadowTip(place, at, stick);
    if (tip) tips.push(tip);
  }
  return tips;
}

export interface EqualShadows {
  noon: Tip;
  before: Tip;
  after: Tip;
  /** The halfway moment, which is what the screen's answer gives. */
  halfway: number;
  /** The track of the tip from a little before the first mark to a little after the second. */
  track: Tip[];
}

/**
 * The two marks of the equal-shadows method on a date: the moments the sun stands at the
 * height whose shadow reaches the circle, before and after noon, worked out as
 * `noonByEqualShadows` works them out. Null where that method refuses.
 */
export function equalShadows(place: Place, date: IsoDate, stick: number, radius: number): EqualShadows | null {
  if (!(stick > 0) || !(radius > 0)) return null;
  const day = sunDay(place.lat, place.lon, date);
  if (day.noonAltitude < 3) return null;
  const noon = shadowTip(place, day.noon, stick);
  if (!noon || radius <= noon.length) return null;
  const apparent = Math.atan(stick / radius) / DEG;
  if (apparent < 3) return null;
  const height = geometricFromApparent(apparent);
  const beforeAt = altitudeCrossing(place.lat, place.lon, date, height, -1);
  const afterAt = altitudeCrossing(place.lat, place.lon, date, height, 1);
  if (beforeAt === null || afterAt === null) return null;
  const before = shadowTip(place, beforeAt, stick);
  const after = shadowTip(place, afterAt, stick);
  if (!before || !after) return null;
  const margin = Math.max(20 * MINUTE, (afterAt - beforeAt) * 0.08);
  const track = tipTrack(place, stick, beforeAt - margin, afterAt + margin, 5).filter((tip) => tip.length <= radius * 1.35);
  return { noon, before, after, halfway: (beforeAt + afterAt) / 2, track };
}

export interface ShortestShadow {
  noon: Tip;
  /** The tip marked every quarter of an hour from two hours before noon to two after. */
  marks: Tip[];
  track: Tip[];
}

/** The pegs of the shortest-shadow method (and of finding true north): every 15 minutes from two hours before noon to two after. */
export function shortestShadow(place: Place, date: IsoDate, stick: number): ShortestShadow | null {
  if (!(stick > 0)) return null;
  const day = sunDay(place.lat, place.lon, date);
  if (day.noonAltitude < 3) return null;
  const noon = shadowTip(place, day.noon, stick);
  if (!noon) return null;
  const marks: Tip[] = [];
  for (let quarter = -8; quarter <= 8; quarter += 1) {
    const tip = shadowTip(place, day.noon + quarter * 15 * MINUTE, stick);
    if (tip) marks.push(tip);
  }
  const track = tipTrack(place, stick, day.noon - 130 * MINUTE, day.noon + 130 * MINUTE, 5);
  return { noon, marks, track };
}

/** "true north" or "true south": the way a shadow points at noon, read from its bearing. */
export const noonWord = (bearing: number) => (Math.cos(bearing * DEG) >= 0 ? "true north" : "true south");

// ── The sun through a day, for the answer's picture ─────────────────────────

export interface DayPoint {
  at: number;
  /** The sun's apparent height, or its true bearing unwrapped about noon's (so that it runs on smoothly through north). */
  value: number;
}

/** The sun's apparent height (or bearing) every `step` minutes from `from` to `to`. */
export function sunThroughDay(place: Place, from: number, to: number, kind: "height" | "bearing", step = 5): DayPoint[] {
  const noonBearing = sunAt((from + to) / 2, place.lat, place.lon).azimuth;
  const points: DayPoint[] = [];
  for (let at = from; at <= to + 1; at += step * MINUTE) {
    const sun = sunAt(at, place.lat, place.lon);
    points.push({
      at,
      value: kind === "height" ? sun.apparentAltitude : noonBearing + ((((sun.azimuth - noonBearing + 540) % 360) + 360) % 360) - 180,
    });
  }
  return points;
}

/** A bearing put back in 0 to 360. */
export const wrapBearing = (value: number) => ((value % 360) + 360) % 360;

/** An unwrapped bearing nearest to `near` for a bearing given 0 to 360. */
export const unwrapNear = (bearing: number, near: number) => near + ((((bearing - near + 540) % 360) + 360) % 360) - 180;

// ── The northern sky about Polaris ──────────────────────────────────────────

export interface SkyStar {
  name: string;
  magnitude: number;
  /** Right ascension in hours and declination in degrees. */
  ra: number;
  dec: number;
}

/**
 * The stars drawn round the pole for their shapes: the Plough's seven and Cassiopeia's five,
 * at their J2000 places (Hipparcos, as given in the Yale Bright Star Catalogue), each moved
 * on in right ascension by as much as the US Naval Observatory's Dubhe has moved since
 * 2000, so that the shapes sit where the calculator's Dubhe does. They are for drawing
 * only: no time on the screen is worked out from them. Polaris, Dubhe and Kochab come
 * from `sky.ts`, as the calculator's do.
 */
const J2000_DUBHE_RA = 11 + 3 / 60 + 43.7 / 3600;
const SHAPES: { plough: SkyStar[]; cassiopeia: SkyStar[] } = {
  plough: [
    { name: "Merak", magnitude: 2.4, ra: 11 + 1 / 60 + 50.5 / 3600, dec: 56 + 22 / 60 + 57 / 3600 },
    { name: "Phecda", magnitude: 2.4, ra: 11 + 53 / 60 + 49.8 / 3600, dec: 53 + 41 / 60 + 41 / 3600 },
    { name: "Megrez", magnitude: 3.3, ra: 12 + 15 / 60 + 25.6 / 3600, dec: 57 + 1 / 60 + 57 / 3600 },
    { name: "Alioth", magnitude: 1.8, ra: 12 + 54 / 60 + 1.7 / 3600, dec: 55 + 57 / 60 + 35 / 3600 },
    { name: "Mizar", magnitude: 2.2, ra: 13 + 23 / 60 + 55.5 / 3600, dec: 54 + 55 / 60 + 31 / 3600 },
    { name: "Alkaid", magnitude: 1.9, ra: 13 + 47 / 60 + 32.4 / 3600, dec: 49 + 18 / 60 + 48 / 3600 },
  ],
  cassiopeia: [
    { name: "Caph", magnitude: 2.3, ra: 0 + 9 / 60 + 10.7 / 3600, dec: 59 + 8 / 60 + 59 / 3600 },
    { name: "Schedar", magnitude: 2.2, ra: 0 + 40 / 60 + 30.4 / 3600, dec: 56 + 32 / 60 + 14 / 3600 },
    { name: "Gamma Cas", magnitude: 2.2, ra: 0 + 56 / 60 + 42.5 / 3600, dec: 60 + 43 / 60 + 0 / 3600 },
    { name: "Ruchbah", magnitude: 2.7, ra: 1 + 25 / 60 + 49 / 3600, dec: 60 + 14 / 60 + 7 / 3600 },
    { name: "Segin", magnitude: 3.4, ra: 1 + 54 / 60 + 23.7 / 3600, dec: 63 + 40 / 60 + 12 / 3600 },
  ],
};

export interface SkyPoint {
  name: string;
  magnitude: number;
  /** Degrees clockwise from straight up about Polaris, as a person facing north sees it. */
  angle: number;
  /** Degrees of sky from Polaris. */
  distance: number;
  /** Height above the horizon, degrees (below it when negative). */
  altitude: number;
}

/** Degrees of sky between two places given as right ascension (hours) and declination. */
export function separation(a: { ra: number; dec: number }, b: { ra: number; dec: number }): number {
  const cosine =
    Math.sin(a.dec * DEG) * Math.sin(b.dec * DEG) + Math.cos(a.dec * DEG) * Math.cos(b.dec * DEG) * Math.cos((a.ra - b.ra) * 15 * DEG);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) / DEG;
}

const asStar = (name: string, ra: number, dec: number): Star => ({ id: "dubhe", name, at2026: [ra, dec], at2046: [ra, dec] }) as Star;

/** Where a star stands about Polaris for a person facing north at an instant. */
function skyPoint(star: Star, magnitude: number, at: number, place: Place): SkyPoint {
  return {
    name: star.name,
    magnitude,
    angle: angleFromPolaris(star, at, place.lat, place.lon),
    distance: separation(starPlace(star, at), starPlace(STARS.polaris, at)),
    altitude: starAt(star, at, place.lat, place.lon).altitude,
  };
}

export interface NorthSky {
  polaris: { magnitude: number };
  dubhe: SkyPoint;
  kochab: SkyPoint;
  plough: SkyPoint[];
  cassiopeia: SkyPoint[];
  /** The north horizon: points along it as seen about Polaris, from north-west round to north-east. */
  horizon: Array<{ angle: number; distance: number }>;
}

/** The northern sky about Polaris at an instant, for a place north of the equator. */
export function northSky(place: Place, at: number): NorthSky {
  const shift = starPlace(STARS.dubhe, at).ra - J2000_DUBHE_RA;
  const shaped = (list: SkyStar[]) => list.map((star) => skyPoint(asStar(star.name, star.ra + shift, star.dec), star.magnitude, at, place));
  const dubhe = skyPoint(STARS.dubhe, 1.8, at, place);
  // The horizon, as places on the sky: a point at height 0 and a bearing, turned into its angle and distance from Polaris.
  const pole = starAt(STARS.polaris, at, place.lat, place.lon);
  const horizon: NorthSky["horizon"] = [];
  for (let azimuth = -80; azimuth <= 80; azimuth += 4) {
    horizon.push(fromPolaris(pole, { altitude: 0, azimuth: (azimuth + 360) % 360 }));
  }
  return {
    polaris: { magnitude: 2.0 },
    dubhe,
    kochab: skyPoint(STARS.kochab, 2.1, at, place),
    plough: [dubhe, ...shaped(SHAPES.plough)],
    cassiopeia: shaped(SHAPES.cassiopeia),
    horizon,
  };
}

/** A place on the sky by height and bearing, as its angle (clockwise from up) and distance from Polaris: the same bearing on the sphere as `angleFromPolaris`. */
function fromPolaris(pole: { altitude: number; azimuth: number }, other: { altitude: number; azimuth: number }) {
  const p1 = pole.altitude * DEG;
  const p2 = other.altitude * DEG;
  const dl = (other.azimuth - pole.azimuth) * DEG;
  const cosine = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  const distance = Math.acos(Math.max(-1, Math.min(1, cosine))) / DEG;
  const angle = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / DEG;
  return { angle: ((angle % 360) + 360) % 360, distance };
}
