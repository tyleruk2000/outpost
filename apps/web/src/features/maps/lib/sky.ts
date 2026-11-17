/**
 * The turning sky: sidereal time, and where a star stands seen from a place.
 *
 * Sidereal time is the US Naval Observatory's approximate formula ("Computing
 * Approximate Sidereal Time", aa.usno.navy.mil/faq/GAST, read 17 November 2026), which
 * it gives as good to about 0.1 second of time: GMST = 18.697375 + 24.065709824279 D
 * hours, D being days of Universal Time from noon on 1 January 2000. Altitude and
 * azimuth come from the same navigational triangle as the sun's (`sunAt` in sun.ts).
 *
 * The stars' places are not worked out from a catalogue: they are the apparent places
 * the Observatory's own celestial navigation service gives (`/api/celnav`) for the start
 * of 2026 and of 2046, read on 17 November 2026, with the years between and a little
 * beyond taken on a straight line between the two. Precession moves them slowly
 * (Dubhe by about half a minute of time in ten years), so that is ample for telling the
 * time by them. Pure.
 */
import { initialBearingDeg } from "@outpost/shared";

const DEG = Math.PI / 180;
const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);

/** Greenwich mean sidereal time at an instant, in hours, 0 to 24. */
export function greenwichSiderealHours(ms: number): number {
  const days = (ms - J2000) / DAY;
  return (((18.697375 + 24.065709824279 * days) % 24) + 24) % 24;
}

/** Local mean sidereal time at a longitude (degrees, east positive), in hours, 0 to 24. */
export function localSiderealHours(ms: number, longitude: number): number {
  return (((greenwichSiderealHours(ms) + longitude / 15) % 24) + 24) % 24;
}

/** How much faster the stars turn than the sun: a mean solar day holds 1.0027379 sidereal days (Bowditch, appendix B). */
export const SIDEREAL_RATE = 1.0027379;

export interface Star {
  id: "polaris" | "dubhe" | "kochab";
  name: string;
  /** Apparent right ascension (hours) and declination (degrees) at the start of 2026 and of 2046. */
  at2026: readonly [number, number];
  at2046: readonly [number, number];
}

/** From the Observatory's celestial navigation data for 1 January 2026 and 2046, 00:00 UT (right ascension from Aries's and the star's Greenwich hour angles). */
export const STARS: Record<Star["id"], Star> = {
  polaris: { id: "polaris", name: "Polaris", at2026: [3.11374, 89.378109], at2046: [3.70323, 89.448094] },
  dubhe: { id: "dubhe", name: "Dubhe", at2026: [11.08919, 61.605356], at2046: [11.10944, 61.49604] },
  kochab: { id: "kochab", name: "Kochab", at2026: [14.8439, 74.042438], at2046: [14.8433, 73.960449] },
};

const START_2026 = Date.UTC(2026, 0, 1);
const START_2046 = Date.UTC(2046, 0, 1);

/** A star's right ascension (hours) and declination (degrees) at an instant. */
export function starPlace(star: Star, ms: number): { ra: number; dec: number } {
  const share = (ms - START_2026) / (START_2046 - START_2026);
  return {
    ra: star.at2026[0] + share * (star.at2046[0] - star.at2026[0]),
    dec: star.at2026[1] + share * (star.at2046[1] - star.at2026[1]),
  };
}

/** Altitude (geometric, degrees) and azimuth (degrees clockwise from true north) of a star from a place. */
export function starAt(star: Star, ms: number, latitude: number, longitude: number): { altitude: number; azimuth: number } {
  const lat = Math.max(-89.99, Math.min(89.99, latitude)) * DEG;
  const { ra, dec } = starPlace(star, ms);
  const hourAngle = (localSiderealHours(ms, longitude) - ra) * 15 * DEG;
  const d = dec * DEG;
  const altitude = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(hourAngle))));
  const fromSouth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(d) * Math.cos(lat));
  return { altitude: altitude / DEG, azimuth: (((fromSouth / DEG + 180) % 360) + 360) % 360 };
}

/**
 * Where a star stands around Polaris as a person facing north sees it, as the hand of a
 * clock whose centre is Polaris: degrees clockwise from straight up (towards the zenith).
 * Worked out on the sky as seen, so Polaris's own small distance from the pole is
 * allowed for: it is the direction from Polaris to the star along the great circle
 * through both, with "up" the vertical through Polaris.
 */
export function angleFromPolaris(star: Star, ms: number, latitude: number, longitude: number): number {
  const pole = starAt(STARS.polaris, ms, latitude, longitude);
  const other = starAt(star, ms, latitude, longitude);
  // A bearing on the sphere of the sky, with altitude in place of latitude and azimuth in place of longitude:
  // "north" is then the zenith, and "east" the way azimuth grows, which is to the right for someone facing north.
  return initialBearingDeg({ lat: pole.altitude, lon: pole.azimuth }, { lat: other.altitude, lon: other.azimuth });
}
