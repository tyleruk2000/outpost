/**
 * The sky as seen from a place: altitude and azimuth of stars, planets, the Sun and the
 * Moon; the Moon's phase, rise and set; and finding north by the stars. Pure.
 *
 * Rising and setting follow the US Naval Observatory's definitions ("Rise, Set, and
 * Twilight Definitions", aa.usno.navy.mil/faq/RST_defs, read 21 November 2026): the
 * Moon rises or sets when its centre's geometric zenith distance is 90.5666° plus its
 * apparent radius less its horizontal parallax, from the Earth's centre: 34′ of
 * refraction, the upper limb on a flat horizon. The Observatory warns that the air can
 * move this by a minute or more, and much more near the poles.
 */

import { refraction } from "../sun.ts";
import { DAY_MS, ghaAries, horizonFrom, norm360 } from "./astro.ts";
import { BODY_NAMES, type BodyId, bodyPlace, PLANETS, type PlanetId, planetLook } from "./bodies.ts";
import { type CatalogueStar, STARS, starPlaceOfDate } from "./stars.ts";

export interface SkyObject {
  kind: "star" | "planet" | "sun" | "moon";
  /** "hr:1234" for a star, the body's id otherwise. */
  key: string;
  name: string | null;
  magnitude: number;
  /** Geometric altitude, degrees; and as seen, with refraction. */
  altitude: number;
  apparentAltitude: number;
  azimuth: number;
  star?: CatalogueStar;
}

/** Every catalogue star and body, placed for a moment and a place (below the horizon too). */
export function skyAt(ms: number, latitude: number, longitude: number): SkyObject[] {
  const aries = ghaAries(ms);
  const out: SkyObject[] = [];
  for (const star of STARS) {
    const { ra, dec } = starPlaceOfDate(star, ms);
    const { altitude, azimuth } = horizonFrom(norm360(aries - ra), dec, latitude, longitude);
    out.push({
      kind: "star",
      key: `hr:${star.hr}`,
      name: star.name,
      magnitude: star.magnitude,
      altitude,
      apparentAltitude: altitude + refraction(altitude),
      azimuth,
      star,
    });
  }
  for (const id of ["sun", "moon", ...PLANETS] as BodyId[]) {
    const place = bodyPlace(id, ms);
    const geo = horizonFrom(place.gha, place.dec, latitude, longitude);
    // Seen from the ground, not the Earth's centre: the parallax lowers the Moon by up to a degree.
    const altitude = geo.altitude - place.hp * Math.cos(geo.altitude * (Math.PI / 180));
    const magnitude = id === "sun" ? -26.7 : id === "moon" ? -12.7 : planetLook(id as PlanetId, ms).magnitude;
    out.push({
      kind: id === "sun" || id === "moon" ? id : "planet",
      key: id,
      name: BODY_NAMES[id],
      magnitude,
      altitude,
      apparentAltitude: altitude + refraction(altitude),
      azimuth: geo.azimuth,
    });
  }
  return out;
}

export type MoonPhaseName =
  | "New moon"
  | "Waxing crescent"
  | "First quarter"
  | "Waxing gibbous"
  | "Full moon"
  | "Waning gibbous"
  | "Last quarter"
  | "Waning crescent";

export interface MoonState {
  /** The lit part of the face, 0 to 1. */
  illuminated: number;
  /** The Moon's ecliptic longitude less the Sun's, degrees: 0 new, 90 first quarter, 180 full, 270 last quarter. */
  age: number;
  name: MoonPhaseName;
  waxing: boolean;
  distanceKm: number;
}

/** The Moon's phase at an instant (Schlyter, section 15: the elongation from the ecliptic longitudes and the Moon's latitude). */
export function moonState(ms: number): MoonState {
  const moon = bodyPlace("moon", ms);
  const sun = bodyPlace("sun", ms);
  const D = Math.PI / 180;
  const elongation = Math.acos(Math.cos((sun.lon - moon.lon) * D) * Math.cos(moon.lat * D)) / D;
  const illuminated = (1 + Math.cos((180 - elongation) * D)) / 2;
  const age = norm360(moon.lon - sun.lon);
  // A quarter is named on the day it falls: the Moon gains about 12° a day on the Sun, so within 6° of it.
  const near = (target: number) => Math.abs(((age - target + 540) % 360) - 180) <= 6;
  const name: MoonPhaseName = near(0)
    ? "New moon"
    : near(90)
      ? "First quarter"
      : near(180)
        ? "Full moon"
        : near(270)
          ? "Last quarter"
          : age < 90
            ? "Waxing crescent"
            : age < 180
              ? "Waxing gibbous"
              : age < 270
                ? "Waning gibbous"
                : "Waning crescent";
  return { illuminated, age, name, waxing: age < 180, distanceKm: moon.distanceKm };
}

/** The next new, first quarter, full and last quarter moon after an instant, to the minute or so. */
export function nextPhases(ms: number): Array<{ name: "New moon" | "First quarter" | "Full moon" | "Last quarter"; at: number }> {
  const targets = [
    [0, "New moon"],
    [90, "First quarter"],
    [180, "Full moon"],
    [270, "Last quarter"],
  ] as const;
  const out: Array<{ name: (typeof targets)[number][1]; at: number }> = [];
  for (const [angle, name] of targets) {
    const offset = (time: number) => ((moonState(time).age - angle + 540) % 360) - 180;
    // Step a day at a time to where the offset crosses zero going up, then halve.
    let a = ms;
    let fa = offset(a);
    for (let day = 0; day < 32; day++) {
      const b = a + DAY_MS;
      const fb = offset(b);
      if (fa < 0 && fb >= 0 && fb - fa < 90) {
        let lo = a;
        let hi = b;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          if (offset(mid) < 0) lo = mid;
          else hi = mid;
        }
        out.push({ name, at: Math.round((lo + hi) / 2) });
        break;
      }
      a = b;
      fa = fb;
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

/** How far the Moon's centre is above the altitude at which it rises or sets, degrees, from the Earth's centre. */
function moonAboveRising(ms: number, latitude: number, longitude: number): number {
  const place = bodyPlace("moon", ms);
  const { altitude } = horizonFrom(place.gha, place.dec, latitude, longitude);
  return altitude - (-0.5666 - place.sd + place.hp);
}

export interface RiseSet {
  rise: number | null;
  set: number | null;
}

/** Moonrise and moonset between two instants (the first of each, or null if there is none). */
export function moonRiseSet(from: number, to: number, latitude: number, longitude: number): RiseSet {
  const step = 10 * 60_000;
  let rise: number | null = null;
  let set: number | null = null;
  let a = from;
  let fa = moonAboveRising(a, latitude, longitude);
  while (a < to && (rise === null || set === null)) {
    const b = Math.min(to, a + step);
    const fb = moonAboveRising(b, latitude, longitude);
    if (fa < 0 !== fb < 0) {
      let lo = a;
      let hi = b;
      let flo = fa;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        const fm = moonAboveRising(mid, latitude, longitude);
        if (fm < 0 === flo < 0) {
          lo = mid;
          flo = fm;
        } else hi = mid;
      }
      const at = Math.round((lo + hi) / 2);
      if (fa < 0 && rise === null) rise = at;
      if (fa >= 0 && set === null) set = at;
    }
    a = b;
    fa = fb;
  }
  return { rise, set };
}

/**
 * Finding north by the stars, for a place and a moment, as the US Army Survival Manual
 * teaches it (FM 21-76, chapter 18, "Using the stars"): in the north, the two pointer
 * stars of the Plough (Merak to Dubhe) lead to Polaris, about five times their distance
 * apart; in the south, the long axis of the Southern Cross (Gacrux to Acrux) carried on
 * about five times its length is the general direction of south. The stars' places, and
 * the pole's, are worked out here, so the drawing is the sky of that night.
 */
export interface PoleFinding {
  hemisphere: "north" | "south";
  /** Where the pole of the sky is: altitude equals the latitude, due north or south. */
  pole: { altitude: number; azimuth: number };
  /** The stars of the method, with their places, if they are above the horizon. */
  stars: Array<{ name: string; altitude: number; azimuth: number; up: boolean }>;
}

export function poleFinding(ms: number, latitude: number, longitude: number): PoleFinding {
  const north = latitude >= 0;
  const names = north ? ["Polaris", "Dubhe", "Merak"] : ["Acrux", "Gacrux"];
  const sky = skyAt(ms, latitude, longitude);
  return {
    hemisphere: north ? "north" : "south",
    pole: { altitude: Math.abs(latitude), azimuth: north ? 0 : 180 },
    stars: names.map((name) => {
      const object = sky.find((o) => o.name === name);
      const altitude = object?.apparentAltitude ?? -90;
      return { name, altitude, azimuth: object?.azimuth ?? 0, up: altitude > 0 };
    }),
  };
}
