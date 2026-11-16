/**
 * Sun times for a place, written out to be printed and carried: first light, sunrise,
 * solar noon, sunset, last light and the length of the day, day by day, for two weeks,
 * a month or a year.
 *
 * Every time comes from the code the Sun section uses (`sunDay` in sun.ts, written by
 * `clockParts` in sun-text.ts) on the clock the screen is showing, so a time on the
 * page is the time on the screen to the minute. What a day without a sunrise or without
 * a night looks like is said in a word in its cell, and the words are explained under
 * the table. The page says what the times assume: a flat horizon at sea level and the
 * usual refraction, which hills and the far north and south do not keep to.
 *
 * Pure: a place, a span and a clock in, blocks of text out (see plans/document.ts for
 * how blocks become pages).
 */
import { toMaidenhead } from "@outpost/shared";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import type { ClockStyle } from "@/lib/clock";
import type { Sheet } from "../print/sheet";
import { addDays, dateToUtc, type IsoDate, type SunDay, sunDay } from "./sun";
import { type ClockWriting, clockParts, formatDayLength, formatOffset, hoursFromZone, zoneOffsetMinutes } from "./sun-text";

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

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const rowDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
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

/** The clock the times are on, in a sentence. */
function clockSentence(input: SunSheetInput, days: IsoDate[]): string {
  if (input.utc) return "Times are in UTC, on the 24-hour clock.";
  // The zone's offset on each day at solar noon, said where it changes.
  const changes: string[] = [];
  let last: number | null = null;
  for (const date of days) {
    const offset = zoneOffsetMinutes(input.zone, sunDay(input.place.lat, input.place.lon, date).noon);
    if (offset !== last) {
      changes.push(last === null ? formatOffset(offset) : `${formatOffset(offset)} from ${shortDate.format(at(date))}`);
      last = offset;
    }
  }
  return `Times are on the clock of the device that made this sheet: time zone ${input.zone}, ${changes.join(", then ")}, on the ${input.style === "12" ? "12-hour" : "24-hour"} clock.`;
}

/** The sheet as blocks of text, in reading order. */
export function sunDocument(input: SunSheetInput): Block[] {
  const { place } = input;
  const days = spanDays(input.date, input.span);
  const zone = input.utc ? "UTC" : input.zone;
  const writing: ClockWriting = input.utc ? { style: "24", mark: "UTC" } : { style: input.style };
  const locator = toMaidenhead(place.lat, place.lon, 6);
  const decimal = `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;
  const position = place.coordinates && place.coordinates !== decimal ? `${plainPrimes(place.coordinates)} (${decimal})` : decimal;
  const where = `${place.name?.trim() ? `${place.name.trim()}, at ` : "At "}${position}${locator ? `, Maidenhead locator ${locator}` : ""}.`;
  const blocks: Block[] = [
    { kind: "title", text: `Sun times: ${placeWords(place)}` },
    {
      kind: "para",
      text: `${where} ${days.length} days, ${longDate.format(at(days[0]!))} to ${longDate.format(at(days[days.length - 1]!))}.`,
    },
    { kind: "para", text: clockSentence(input, days) },
  ];
  const far = input.utc ? null : hoursFromZone(place.lon, input.zone, sunDay(place.lat, place.lon, days[0]!).noon);
  if (far) {
    blocks.push({
      kind: "para",
      text: `By the sun, this place runs about ${far.hours} hours ${far.direction === "ahead" ? "ahead of" : "behind"} that time zone, so clocks there probably read differently. Outpost cannot tell a place's time zone offline and does not guess. Each date is the date at the place.`,
    });
  }

  // One table to a month, under the month's name; a year is one table that runs on from page to page, so that it takes a few pages and not twelve.
  const head = ["Date", "First light", "Sunrise", "Solar noon", "Sunset", "Last light", "Day length"];
  let month = "";
  let rows: string[][] = [];
  const flush = () => {
    if (rows.length === 0) return;
    blocks.push({ kind: "heading", text: month }, { kind: "table", head, rows });
    rows = [];
  };
  for (const date of days) {
    const name = input.span === "year" ? date.slice(0, 4) : monthYear.format(at(date));
    if (name !== month) {
      flush();
      month = name;
    }
    rows.push([rowDate.format(at(date)).replace(",", ""), ...dayCells(sunDay(place.lat, place.lon, date), zone, writing)]);
  }
  flush();

  blocks.push(
    { kind: "heading", text: "What the times are" },
    {
      kind: "list",
      items: [
        "First light and last light: civil dawn and dusk, when the centre of the sun is 6° below the horizon.",
        "Sunrise and sunset: when the top of the sun is on the horizon, taken as the centre of the sun 0.833° below it (0.567° for the usual bending of light by the air, and 0.267° for the sun's radius).",
        "Solar noon: when the sun crosses the place's meridian and is at its highest.",
        "Day length: from sunrise to sunset.",
        "A time followed by a date falls on that date on this clock, not on the day of its row.",
        '"none": the sun stays more than 6° below the horizon, or does not rise, all day (polar night). "all night": twilight lasts through the night. "night before": it was already twilight when the day began. "up all day" and "no sunset": the sun does not set (midnight sun). "already up": it did not set the night before. "-": does not apply on that day.',
      ],
    },
    { kind: "heading", text: "Before relying on them" },
    {
      kind: "list",
      items: [
        "For a flat horizon at sea level, to about a minute; hills make sunrise later and sunset earlier. In the far north and south it can be several minutes out.",
        "Worked out on the device with the method behind NOAA's solar calculator (Jean Meeus, Astronomical Algorithms), which NOAA gives as good to about a minute between 72° north and south and to about ten minutes beyond.",
      ],
    },
    { kind: "para", text: `Made in Outpost on ${longDate.format(at(input.made))}.` },
  );
  return blocks;
}

export const sunFooter = (input: SunSheetInput) => `${sunTitle(input)} · Outpost`;

/** The sheet as pages. */
export const sunSheets = (input: SunSheetInput, paper: "a4" | "letter" = "a4"): Sheet[] =>
  toSheets(sunDocument(input), sunFooter(input), paper);
