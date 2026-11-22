/**
 * Sun times for a place, written out to be printed and carried: first light, sunrise,
 * solar noon, sunset, last light and the length of the day, day by day, for two weeks,
 * a month or a year.
 *
 * Every time comes from the code the Sun section uses (`sunDay` in sun.ts, written by
 * `clockParts` in sun-text.ts) on the clock the screen is showing, so a time on the
 * page is the time on the screen to the minute. What a day without a sunrise or without
 * a night looks like is said in a word in its cell. The sheet itself is laid out with
 * the print kit in sun-kit.ts; this file has the days, the cells and the title.
 */
import type { ClockStyle } from "@/lib/clock";
import { appLocale } from "@/lib/region";
import { addDays, dateToUtc, type IsoDate, type SunDay } from "./sun";
import { type ClockWriting, clockParts, formatDayLength } from "./sun-text";

export type SunSpan = "fortnight" | "month" | "year";
export const SUN_SPANS: readonly SunSpan[] = ["fortnight", "month", "year"];
export const isSunSpan = (value: unknown): value is SunSpan => (SUN_SPANS as readonly unknown[]).includes(value);

export interface SunSheetPlace {
  /** A saved place's name. The centre of the map has none. */
  name?: string;
  lat: number;
  lon: number;
  /** The position as the screen writes it, in the format chosen for coordinates. */
  coordinates?: string;
}

export interface SunSheetInput {
  place: SunSheetPlace;
  /** The day shown on screen: the first day of two weeks, or a day of the month or year. */
  date: IsoDate;
  span: SunSpan;
  /** The device's time zone, which the screen shows times in unless it shows UTC. */
  zone: string;
  utc: boolean;
  /** The app's clock style, for the device's zone. UTC is always on the 24-hour clock, as on screen. */
  style: ClockStyle;
  /** The day the sheet is made, as a date. */
  made: IsoDate;
}

const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
const at = (date: IsoDate) => new Date(dateToUtc(date));

/** The days of a span: two weeks from the day, or the calendar month or year it is in. */
export function spanDays(date: IsoDate, span: SunSpan): IsoDate[] {
  const [year, month] = date.split("-").map(Number) as [number, number];
  const first = span === "fortnight" ? date : span === "month" ? `${date.slice(0, 7)}-01` : `${year}-01-01`;
  const count =
    span === "fortnight"
      ? 14
      : span === "month"
        ? new Date(Date.UTC(year, month, 0)).getUTCDate()
        : (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

/** The span in words, for the title: "14 days from 16 Nov 2026", "November 2026", "2026". */
export function spanWords(date: IsoDate, span: SunSpan): string {
  if (span === "fortnight") return `14 days from ${shortDate.format(at(date))}`;
  if (span === "month") return monthYear.format(at(date));
  return date.slice(0, 4);
}

/** Prime and double prime as the PDF's typeface writes them, as the map's printed graticule does: 54°30'27"N. */
const plainPrimes = (text: string) => text.replace(/′/g, "'").replace(/″/g, '"');

/** The place in a few words: its name, or its position. */
const placeWords = (place: SunSheetPlace) =>
  place.name?.trim() || (place.coordinates ? plainPrimes(place.coordinates) : `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`);

/** What the library calls it: "Sun times, Helvellyn, November 2026". */
export const sunTitle = (input: Pick<SunSheetInput, "place" | "date" | "span">) =>
  `Sun times, ${placeWords(input.place)}, ${spanWords(input.date, input.span)}`;

/**
 * The cells of a day, in the table's order: first light, sunrise, solar noon, sunset,
 * last light, day length. A time is as the screen writes it, without the "UTC" the
 * screen puts after each one (the page says once that the times are UTC).
 */
export function dayCells(day: SunDay, zone: string, writing: ClockWriting): string[] {
  const time = (ms: number) => {
    const parts = clockParts(ms, zone, day.date, { style: writing.style });
    return parts.day ? `${parts.time} on ${parts.day}` : parts.time;
  };
  const { sun, civil } = day;
  const midnightSun = sun.kind === "above";
  const firstLight = midnightSun
    ? "-"
    : civil.kind === "below"
      ? "none"
      : civil.kind === "above"
        ? "all night"
        : civil.begin === null
          ? "night before"
          : time(civil.begin);
  const lastLight = midnightSun
    ? "-"
    : civil.kind === "below"
      ? "none"
      : civil.kind === "above"
        ? "all night"
        : civil.end === null
          ? "all night"
          : time(civil.end);
  const sunrise =
    sun.kind === "below" ? "no sunrise" : sun.kind === "above" ? "up all day" : sun.begin === null ? "already up" : time(sun.begin);
  const sunset = sun.kind === "below" ? "-" : sun.kind === "above" ? "no sunset" : sun.end === null ? "no sunset" : time(sun.end);
  const length = sun.kind === "below" ? "none" : sun.kind === "above" ? "24 h" : formatDayLength(day.dayLength);
  return [firstLight, sunrise, time(day.noon), sunset, lastLight, length];
}
