/**
 * Sun times on paper, laid out with the print kit: the same times as sun-document.ts
 * (and so as the Sun section, to the minute), with a chart of the light through the span
 * drawn from those times: first light to last light, sunrise to sunset, and solar noon,
 * day by day on the sheet's own clock. A place named in another script is set in the
 * kit's fallback typefaces.
 */
import { toMaidenhead } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  bullets,
  PRINT_COLOURS as C,
  callout,
  chart,
  dataTable,
  figure,
  heading,
  label,
  measureOf,
  note,
  type PrintPaper,
  para,
  printable,
  printDocument,
} from "@/features/print-kit";
import { clockText } from "@/lib/clock";
import { appLocale } from "@/lib/region";
import { dateToUtc, type IsoDate, type SunDay, sunDay } from "./sun";
import { dayCells, type SunSheetInput, spanDays, spanWords, sunTitle } from "./sun-document";
import { type ClockWriting, formatDayLength, formatOffset, hoursFromZone, zoneOffsetMinutes } from "./sun-text";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat(appLocale(), { month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
const rowDate = new Intl.DateTimeFormat(appLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const at = (date: IsoDate) => new Date(dateToUtc(date));

/** Words for the kit: its stand-ins, and a hyphen for the minus sign a zone's offset is written with. */
const plain = (text: string) => printable(text).replace(/−/g, "-");

const placeWords = (input: SunSheetInput) =>
  plain(input.place.name?.trim() || input.place.coordinates || `${input.place.lat.toFixed(5)}, ${input.place.lon.toFixed(5)}`);

/** The clock the times are on, in a sentence (as sun-document.ts says it). */
function clockSentence(input: SunSheetInput, days: IsoDate[]): string {
  if (input.utc) return "Times are in UTC, on the 24-hour clock.";
  const changes: string[] = [];
  let last: number | null = null;
  for (const date of days) {
    const offset = zoneOffsetMinutes(input.zone, sunDay(input.place.lat, input.place.lon, date).noon);
    if (offset !== last) {
      changes.push(last === null ? formatOffset(offset) : `${formatOffset(offset)} from ${shortDate.format(at(date))}`);
      last = offset;
    }
  }
  return plain(
    `Times are on the clock of the device that made this sheet: time zone ${input.zone}, ${changes.join(", then ")}, on the ${input.style === "12" ? "12-hour" : "24-hour"} clock.`,
  );
}

/**
 * The hours of a moment on the sheet's clock, counted from the start of the row's date
 * there: 6.5 is half past six. Null where it falls on another date: the chart leaves a gap.
 */
function hourOn(ms: number, date: IsoDate, zone: string): number | null {
  const offset = zone === "UTC" ? 0 : zoneOffsetMinutes(zone, ms);
  const hours = (ms + offset * 60_000 - dateToUtc(date)) / 3_600_000;
  return hours >= 0 && hours <= 24 ? hours : null;
}

/** A band's start and end on the day, in hours: all day where it lasts all day, nothing where it does not come. */
function bandHours(band: SunDay["sun"], date: IsoDate, zone: string): [number | null, number | null] {
  if (band.kind === "below") return [null, null];
  if (band.kind === "above") return [0, 24];
  return [band.begin === null ? 0 : hourOn(band.begin, date, zone), band.end === null ? 24 : hourOn(band.end, date, zone)];
}

/**
 * The light through the span as bands over the day: twilight (first light to last light)
 * pale, daylight (sunrise to sunset) amber, solar noon a dashed line. The y axis runs in
 * quarters of a day so that its ticks fall at midnight, 6, noon and 18.
 */
export function lightChart(input: SunSheetInput, width: number, height = 165): string {
  const days = spanDays(input.date, input.span);
  const zone = input.utc ? "UTC" : input.zone;
  const style = input.utc ? "24" : input.style;
  const figures = days.map((date) => {
    const day = sunDay(input.place.lat, input.place.lon, date);
    return { sun: bandHours(day.sun, date, zone), civil: bandHours(day.civil, date, zone), noon: hourOn(day.noon, date, zone) };
  });
  const quarter = (hours: number | null) => (hours === null ? null : hours / 6);
  const xs = days.map((_, index) => index);
  const ticks =
    input.span === "year"
      ? days.flatMap((date, index) => (date.endsWith("-01") ? [index] : []))
      : input.span === "month"
        ? xs.filter((index) => index % 7 === 0)
        : xs.filter((index) => index % 2 === 0);
  return chart({
    width,
    height,
    xs,
    series: [
      {
        kind: "band",
        name: "First light to sunrise",
        low: figures.map((day) => quarter(day.civil[0])),
        // With no sunrise, the twilight runs from first light to last light.
        high: figures.map((day) => quarter(day.sun[0] ?? day.civil[1])),
        colour: C.know,
        opacity: 0.3,
      },
      {
        kind: "band",
        name: "Sunrise to sunset",
        low: figures.map((day) => quarter(day.sun[0])),
        high: figures.map((day) => quarter(day.sun[1])),
        colour: C.warn,
        opacity: 0.45,
      },
      {
        kind: "band",
        name: "Sunset to last light",
        low: figures.map((day) => quarter(day.sun[1])),
        high: figures.map((day) => quarter(day.sun[1] === null ? null : day.civil[1])),
        colour: C.know,
        opacity: 0.3,
      },
      { kind: "line", name: "Solar noon", values: figures.map((day) => quarter(day.noon)), colour: C.warnInk, dash: "3 2", width: 1 },
    ],
    yDomain: [0, 4],
    yTicks: 4,
    // Up the side in quarters of a day: midnight at the foot, 6, noon, 18, and midnight again at the top.
    yTick: (q) => (q === 4 ? (style === "24" ? "24:00" : "12:00 am") : clockText(q * 6, 0, style)),
    xTicks: ticks,
    xTick: (index) => {
      const date = days[index];
      if (!date) return "";
      return input.span === "year" ? monthName.format(at(date)) : dayMonth.format(at(date));
    },
  }).svg;
}

/** The longest and shortest days of the span, for the words under the chart. */
function extremes(input: SunSheetInput, days: IsoDate[]): string {
  const lengths = days.map((date) => ({ date, day: sunDay(input.place.lat, input.place.lon, date) }));
  const longest = lengths.reduce((best, item) => (item.day.dayLength > best.day.dayLength ? item : best), lengths[0]!);
  const shortest = lengths.reduce((best, item) => (item.day.dayLength < best.day.dayLength ? item : best), lengths[0]!);
  const words = (item: { date: IsoDate; day: SunDay }) =>
    item.day.sun.kind === "below" ? "no sunrise" : item.day.sun.kind === "above" ? "24 h" : formatDayLength(item.day.dayLength);
  return `Longest day ${words(longest)} on ${dayMonth.format(at(longest.date))}; shortest ${words(shortest)} on ${dayMonth.format(at(shortest.date))}.`;
}

export function sunKitDocument(input: SunSheetInput, paper: PrintPaper): TDocumentDefinitions {
  const { place } = input;
  const measure = measureOf(paper);
  const days = spanDays(input.date, input.span);
  const zone = input.utc ? "UTC" : input.zone;
  const writing: ClockWriting = input.utc ? { style: "24", mark: "UTC" } : { style: input.style };
  const locator = toMaidenhead(place.lat, place.lon, 6);
  const decimal = `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;
  const position = place.coordinates && place.coordinates !== decimal ? `${place.coordinates} (${decimal})` : decimal;
  const where = plain(`At ${position}${locator ? `, Maidenhead locator ${locator}` : ""}.`);
  const far = input.utc ? null : hoursFromZone(place.lon, input.zone, sunDay(place.lat, place.lon, days[0]!).noon);

  const content: Content[] = [
    { text: "Sun times", fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: placeWords(input), fontSize: 22, bold: true, margin: [0, 2, 0, 2] },
    {
      text: `${where} ${days.length} days, ${longDate.format(at(days[0]!))} to ${longDate.format(at(days[days.length - 1]!))}.`,
      color: C.muted,
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 8, 0, 12] },
    callout("know", "The clock these times are on", para(clockSentence(input, days))),
    ...(far
      ? [
          callout(
            "warn",
            "Not this place's own clock",
            para(
              `By the sun, this place runs about ${far.hours} hours ${far.direction === "ahead" ? "ahead of" : "behind"} that time zone, so clocks there probably read differently. Outpost cannot tell a place's time zone offline and does not guess. Each date is the date at the place.`,
            ),
          ),
        ]
      : []),
    figure(lightChart(input, measure), {
      title: "Light through the days",
      width: measure,
      caption: `Each day from left to right; the time of day up the side, on the clock above. Blue: twilight, from first light to sunrise and from sunset to last light. Amber: the sun is up. ${extremes(input, days)}`,
    }),
  ];

  // One table to a month, under the month's name.
  const head = ["Date", "First light", "Sunrise", "Solar noon", "Sunset", "Last light", "Day length"];
  let month = "";
  let rows: string[][] = [];
  const flush = () => {
    if (rows.length === 0) return;
    content.push(label(month), dataTable(head, rows, { bold: [0], right: [6] }));
    rows = [];
  };
  for (const date of days) {
    const name = monthYear.format(at(date));
    if (name !== month) {
      flush();
      month = name;
    }
    rows.push([rowDate.format(at(date)).replace(",", ""), ...dayCells(sunDay(place.lat, place.lon, date), zone, writing)]);
  }
  flush();

  content.push(
    heading("What the times are"),
    bullets([
      "**First light and last light:** civil dawn and dusk, when the centre of the sun is 6° below the horizon.",
      "**Sunrise and sunset:** when the top of the sun is on the horizon, taken as the centre of the sun 0.833° below it (0.567° for the usual bending of light by the air, and 0.267° for the sun's radius).",
      "**Solar noon:** when the sun crosses the place's meridian and is at its highest.",
      "**Day length:** from sunrise to sunset.",
      "A time followed by a date falls on that date on this clock, not on the day of its row.",
      '"none": the sun stays more than 6° below the horizon, or does not rise, all day (polar night). "all night": twilight lasts through the night. "night before": it was already twilight when the day began. "up all day" and "no sunset": the sun does not set (midnight sun). "already up": it did not set the night before. "-": does not apply on that day.',
    ]),
    callout(
      "warn",
      "Before relying on them",
      bullets([
        "For a flat horizon at sea level, to about a minute; hills make sunrise later and sunset earlier. In the far north and south it can be several minutes out.",
        "Worked out on the device with the method behind NOAA's solar calculator (Jean Meeus, Astronomical Algorithms), which NOAA gives as good to about a minute between 72° north and south and to about ten minutes beyond.",
      ]),
    ),
    note(`Made in Outpost on ${longDate.format(at(input.made))}.`),
  );

  return printDocument({
    paper,
    title: sunTitle(input),
    made: new Date(`${input.made}T00:00:00Z`),
    footerName: plain(`Sun times · ${placeWords(input)}`),
    footerRight: spanWords(input.date, input.span),
    parts: [{ kind: "plain", content }],
  });
}
