/**
 * A horizontal sundial for a latitude, and how to read clock time from it.
 *
 * Hour lines: tan θ = sin φ × tan(15° × hours from noon), θ measured on the dial from the
 * noon line (the North American Sundial Society's "Calculating Dial Lines"). Written here
 * with atan2 so that hours more than six from noon, whose lines run back past the
 * east–west line, fall on the right side by themselves. The gnomon's edge rises at the
 * latitude and points to the true pole.
 *
 * Clock time from sundial time: clock = sundial − equation of time + (zone offset −
 * 4 minutes × longitude east), the zone offset in minutes and the equation of time in
 * NOAA's sense (sundial ahead of the clock when positive). The same as the British
 * Sundial Society's "Setting up a sundial" in words and NASS's "Civil = Sundial + EoT +
 * dLon", whose EoT has the opposite sign. Pure.
 */
import { dateToUtc, type IsoDate, solarPosition } from "@/features/maps/lib/sun";

const DEG = Math.PI / 180;

/** Degrees from the noon line on the dial to an hour line; positive on the afternoon side. */
export function hourLineAngle(latitude: number, hoursFromNoon: number): number {
  const h = hoursFromNoon * 15 * DEG;
  return Math.atan2(Math.sin(Math.abs(latitude) * DEG) * Math.sin(h), Math.cos(h)) / DEG;
}

/** The obliquity of the ecliptic, to the degree's hundredth, for the longest day. */
const OBLIQUITY = 23.44;

/**
 * Hours either side of noon the sun can be up at this latitude on the longest day, so
 * many lines the dial needs: never more than eight (4 am to 8 pm), the most a page can
 * hold sensibly, and at least six (the lines to 6 am and 6 pm).
 */
export function dialHalfSpan(latitude: number): number {
  const lat = Math.min(89.99, Math.abs(latitude));
  const cosine = -Math.tan(lat * DEG) * Math.tan(OBLIQUITY * DEG);
  const hours = cosine <= -1 ? 12 : Math.acos(Math.max(-1, Math.min(1, cosine))) / DEG / 15;
  return Math.max(6, Math.min(8, Math.floor(hours)));
}

export interface HourLine {
  /** Hours from noon: −3 is 9 am. */
  fromNoon: number;
  /** On a 24-hour clock: 9, 12, 15. */
  hour: number;
  angle: number;
}

export function hourLines(latitude: number): HourLine[] {
  const span = dialHalfSpan(latitude);
  const lines: HourLine[] = [];
  for (let fromNoon = -span; fromNoon <= span; fromNoon += 1)
    lines.push({ fromNoon, hour: 12 + fromNoon, angle: hourLineAngle(latitude, fromNoon) });
  return lines;
}

export type DialFit = "none" | "poor" | "good" | "polar";

/**
 * Where a horizontal dial is practical. On the equator every hour line falls on the noon
 * line; below about 20° the lines between 9 am and 3 pm are squeezed within about 19° of
 * it (at 20° the 3 pm line is 18.9° from noon) and the dial is hard to read, so an
 * equatorial dial is better there. Beyond the polar circles the dial works, but the sun
 * is gone for part of the winter. These bounds are Outpost's judgement from the angles,
 * not a published rule.
 */
export function dialFit(latitude: number): DialFit {
  const lat = Math.abs(latitude);
  if (lat < 1) return "none";
  if (lat < 20) return "poor";
  if (lat > 66.56) return "polar";
  return "good";
}

/** Minutes to add to a sundial's reading for clock time without summer time, on a date. */
export function sundialToClock(date: IsoDate, longitude: number, standardOffsetMinutes: number): number {
  const noonUtc = dateToUtc(date) + 12 * 3_600_000 - longitude * 4 * 60_000;
  return -solarPosition(noonUtc).equationOfTime + standardOffsetMinutes - 4 * longitude;
}

/** The days a correction table is given for: the 1st and the 15th of each month. */
export function tableDates(year: number): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let month = 1; month <= 12; month += 1) {
    for (const day of [1, 15]) dates.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

/** "+4 min", "−14 min", "0 min": minutes said to the whole minute, as a table on paper can be read. */
export function signedMinutes(minutes: number): string {
  const whole = Math.round(minutes);
  return whole === 0 ? "0 min" : `${whole > 0 ? "+" : "−"}${Math.abs(whole)} min`;
}
