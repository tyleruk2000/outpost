/**
 * Telling the time at night from the stars turning about the pole: the "star clock"
 * calculator and the scales of a nocturnal to print.
 *
 * Facing north, the stars turn anticlockwise about the pole once in a sidereal day
 * (23 h 56 min 4 s), so a line from Polaris to a pointer star is the hand of a 24-hour
 * clock that runs backwards and gains about 3 min 56 s a day on the sun. A nocturnal's
 * date ring takes that gain out: the hour disc is turned to the date, and the arm laid
 * along the pointer reads the time (Royal Museums Greenwich, "What is a nocturnal?").
 *
 * The calculator works on the sky as seen (`angleFromPolaris` in features/maps/lib/sky.ts),
 * so it allows for Polaris being about 0.6° from the pole. The printed nocturnal, like
 * every nocturnal, takes Polaris to be at the pole; that costs it a few minutes at
 * most, which the tests measure. Pure.
 */

import { angleFromPolaris, localSiderealHours, STARS, type Star, starAt, starPlace } from "@/features/maps/lib/sky";
import { addDays, dateToUtc, type IsoDate, sunAt, sunDay } from "@/features/maps/lib/sun";
import type { Estimate, Outcome, Place } from "./recovery";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type PointerStar = "dubhe" | "kochab";

export const POINTER_STARS: Record<PointerStar, { star: Star; words: string }> = {
  dubhe: { star: STARS.dubhe, words: "the Plough's pointers (Merak to Dubhe)" },
  kochab: { star: STARS.kochab, words: "Kochab, the brighter of the two stars at the end of the Little Bear's bowl" },
};

/** The positions a person can read the pointer at: every half hour round a 12-hour clock face, as twice the hour (0 = 12 o'clock). */
export const CLOCK_POSITIONS: Array<{ value: string; label: string }> = Array.from({ length: 24 }, (_, half) => {
  const hour = Math.floor(half / 2);
  const shown = hour === 0 ? 12 : hour;
  const label =
    half % 2 === 0 ? `${shown} o'clock${hour === 0 ? " (straight up)" : hour === 6 ? " (straight down)" : ""}` : `Half past ${shown}`;
  return { value: String(half), label };
});

/** How finely a pointer is read by eye against an imagined clock face: to the nearest half hour, so ±7.5°. */
export const READING_DEGREES = 7.5;

/** Polaris must be at least this high to sight it and the stars about it. */
const LOWEST_POLARIS = 5;

/**
 * The instant on the night that begins on `date` (between that day's solar noon and the
 * next) when the pointer stands at a clock-face position, 0 to 12 hours with 12 o'clock
 * straight up; the darkest of the instants if there are two.
 */
function whenPointerAt(place: Place, date: IsoDate, star: Star, degrees: number): number | null {
  const start = sunDay(place.lat, place.lon, date).noon;
  const end = sunDay(place.lat, place.lon, addDays(date, 1)).noon;
  const off = (at: number) => ((angleFromPolaris(star, at, place.lat, place.lon) - degrees + 540) % 360) - 180;
  const found: number[] = [];
  const step = 5 * MINUTE;
  let previous = off(start);
  for (let at = start + step; at <= end; at += step) {
    const now = off(at);
    if (Math.sign(now) !== Math.sign(previous) && Math.abs(now - previous) < 90) {
      let lo = at - step;
      let hi = at;
      for (let pass = 0; pass < 30; pass += 1) {
        const mid = (lo + hi) / 2;
        if (Math.sign(off(mid)) === Math.sign(off(lo))) lo = mid;
        else hi = mid;
      }
      found.push((lo + hi) / 2);
    }
    previous = now;
  }
  if (found.length === 0) return null;
  return found.reduce((best, at) => (sunAt(at, place.lat, place.lon).altitude < sunAt(best, place.lat, place.lon).altitude ? at : best));
}

/**
 * The time from the pointer's position read as the hour hand of an ordinary clock face
 * with Polaris at its centre: "half past 2" is 2.5. The range is the reading's own
 * coarseness, half a clock-hour position (7.5°) either way, which the stars turn through
 * in about half an hour.
 */
export function timeFromPointer(place: Place, date: IsoDate, pointer: PointerStar, clockHours: number): Outcome {
  if (place.lat < 0) {
    return {
      ok: false,
      reason:
        "South of the equator Polaris is below the horizon and there is no bright star at the south pole of the sky, so this method does not work there. Outpost does not offer a southern method: none was found from a source it could check.",
    };
  }
  const { star } = POINTER_STARS[pointer];
  const middle = sunDay(place.lat, place.lon, date).noon + 12 * HOUR;
  if (starAt(STARS.polaris, middle, place.lat, place.lon).altitude < LOWEST_POLARIS) {
    return {
      ok: false,
      reason: `Polaris is less than ${LOWEST_POLARIS}° above the horizon at this latitude, too low to sight it and the stars about it. The method needs a clear northern sky well north of the equator.`,
    };
  }
  const degrees = (((clockHours % 12) + 12) % 12) * 30;
  const at = whenPointerAt(place, date, star, degrees);
  if (at === null) return { ok: false, reason: "The pointer does not stand there on this night. Check the date and the reading." };
  const a = whenPointerAt(place, date, star, degrees + READING_DEGREES);
  const b = whenPointerAt(place, date, star, degrees - READING_DEGREES);
  // The window is a night long; a reading at its edges can wrap past it on one side.
  const low = Math.min(a ?? at - 30 * MINUTE, b ?? at - 30 * MINUTE, at);
  const high = Math.max(a ?? at + 30 * MINUTE, b ?? at + 30 * MINUTE, at);
  const warnings: string[] = [];
  if (starAt(star, at, place.lat, place.lon).altitude < 5)
    warnings.push(`${star.name} is at most 5° above the horizon then, if it is up at all: check which star you read.`);
  if (sunAt(at, place.lat, place.lon).altitude > -6)
    warnings.push("The sky would not be dark then (the sun is less than 6° below the horizon): check the date and the reading.");
  const estimate: Estimate = {
    at,
    low,
    high: Math.max(high, low + MINUTE),
    because: `Read against an imagined clock face, the pointer is good to about half an hour position (${READING_DEGREES}°) either way, which the stars turn through in about half an hour. A made nocturnal is better: Royal Museums Greenwich gives navigators' wooden ones as good to within 15 minutes.`,
    warnings,
  };
  return { ok: true, estimate };
}

// ── The printed nocturnal ───────────────────────────────────────────────────

/**
 * Where each date goes on the date ring, in degrees clockwise from the top as the
 * instrument is held, for a place's longitude and a clock's standard offset: the angle
 * at which the pointer stands at midnight on that clock that night. The hour disc's
 * midnight tooth is set to the date; its hours run anticlockwise, 15° to the hour, so
 * the arm along the pointer reads the clock. Polaris is taken to be at the pole.
 */
export function dateRingAngle(date: IsoDate, longitude: number, standardOffsetMinutes: number, star: Star = STARS.dubhe): number {
  // Midnight at the end of the date's evening: the start of the next day on that clock.
  const midnight = dateToUtc(addDays(date, 1)) - standardOffsetMinutes * MINUTE;
  const hourAngle = localSiderealHours(midnight, longitude) - starPlace(star, midnight).ra;
  return (((-15 * hourAngle) % 360) + 360) % 360;
}

/** Where Kochab's tooth sits on the hour disc, in degrees clockwise from the Plough's tooth (which marks midnight). */
export function kochabTooth(year: number): number {
  const at = Date.UTC(year, 6, 1);
  return (((-15 * (starPlace(STARS.kochab, at).ra - starPlace(STARS.dubhe, at).ra)) % 360) + 360) % 360;
}

/** What the printed nocturnal reads (clock hours after midnight, −12 to 12) for a pointer angle on a date. */
export function nocturnalReading(date: IsoDate, longitude: number, standardOffsetMinutes: number, pointerDegrees: number): number {
  const turned = (((dateRingAngle(date, longitude, standardOffsetMinutes) - pointerDegrees) % 360) + 360) % 360;
  const hours = turned / 15;
  return hours > 12 ? hours - 24 : hours;
}
