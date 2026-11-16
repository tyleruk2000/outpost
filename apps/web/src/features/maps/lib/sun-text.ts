/**
 * The sun's day put into words and clock times: what the Sun section shows.
 *
 * Offline, Outpost cannot know the time zone of an arbitrary point on the map, so a
 * time is shown on a clock the caller names (the device's zone, or UTC) and never on a
 * guess at the place's own. Every function takes the zone, so nothing here depends on
 * where the tests run. Pure.
 */
import { formatBearing } from "./geo";
import type { MoonPhase } from "./moon";
import { type Band, type IsoDate, type SunDay, utcToDate } from "./sun";

const MINUTE = 60_000;

/** The zone this device keeps its clock in, as the browser names it ("Europe/London"). */
export function deviceZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const partFormats = new Map<string, Intl.DateTimeFormat>();

/** The clock and calendar reading in a zone at an instant, to the minute. */
function readingIn(zone: string, ms: number): { date: IsoDate; time: string; asUtc: number } {
  let format = partFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partFormats.set(zone, format);
  }
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(ms)) parts[part.type] = part.value;
  const [year, month, day, hour, minute] = [parts.year, parts.month, parts.day, parts.hour, parts.minute].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  return { date: utcToDate(asUtc), time: `${parts.hour}:${parts.minute}`, asUtc };
}

/** The calendar date in a zone at an instant. */
export function dateIn(zone: string, ms: number): IsoDate {
  return readingIn(zone, ms).date;
}

/** Minutes a zone's clock is ahead of UTC at an instant; negative west of Greenwich. */
export function zoneOffsetMinutes(zone: string, ms: number): number {
  const whole = Math.floor(ms / MINUTE) * MINUTE;
  return (readingIn(zone, whole).asUtc - whole) / MINUTE;
}

/** "UTC+1", "UTC−3:30", "UTC+0". */
export function formatOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `UTC${minutes < 0 ? "−" : "+"}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

/** "17 May" */
export const formatShortDate = (date: IsoDate) => dayFormat.format(new Date(`${date}T00:00:00Z`));

/**
 * An instant on a zone's 24-hour clock, to the nearest minute: "07:42". When that falls
 * on another calendar day there than the date asked about, the day is said: "23:53 on 17 May".
 */
export function formatClock(ms: number, zone: string, date: IsoDate): string {
  const reading = readingIn(zone, Math.round(ms / MINUTE) * MINUTE);
  return reading.date === date ? reading.time : `${reading.time} on ${formatShortDate(reading.date)}`;
}

/** "8 h 29 min" */
export function formatDayLength(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** "2 min 51 s longer than the day before", or nothing when the two days are the same length. */
export function formatDayChange(ms: number): string | undefined {
  const seconds = Math.round(Math.abs(ms) / 1000);
  if (seconds === 0) return undefined;
  const amount = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return `${amount} ${ms > 0 ? "longer" : "shorter"} than the day before`;
}

/**
 * How far the sun's time at a longitude runs from a zone's standard time, when that is
 * far enough that clocks at the place probably read differently: two hours or more. Zones
 * are drawn generously (Spain keeps Berlin's time), so anything nearer is left alone
 * rather than guessed at. Standard time is the zone's clock without daylight saving.
 */
export function hoursFromZone(longitude: number, zone: string, ms: number): { hours: number; direction: "ahead" | "behind" } | null {
  const year = new Date(ms).getUTCFullYear();
  const standard = Math.min(zoneOffsetMinutes(zone, Date.UTC(year, 0, 1)), zoneOffsetMinutes(zone, Date.UTC(year, 6, 1)));
  const difference = longitude / 15 - standard / 60;
  if (Math.abs(difference) < 2) return null;
  return { hours: Math.round(Math.abs(difference)), direction: difference > 0 ? "ahead" : "behind" };
}

export interface SunRow {
  key: string;
  label: string;
  value: string;
  /** A second, quieter piece: a bearing, a height, a comparison. */
  detail?: string;
  /** The detail is long enough to want a line of its own. */
  detailBelow?: boolean;
}

/** One line for the day, for when the section is folded away. */
export function sunSummary(day: SunDay, zone: string): string {
  const { sun } = day;
  if (sun.kind === "below") return "The sun does not rise";
  if (sun.kind === "above") return "The sun does not set";
  const rise = sun.begin === null ? null : `sunrise ${formatClock(sun.begin, zone, day.date)}`;
  const set = sun.end === null ? null : `sunset ${formatClock(sun.end, zone, day.date)}`;
  const text = [rise, set].filter(Boolean).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function noonHeight(altitude: number): string {
  const degrees = Math.round(altitude);
  if (degrees === 0) return "sun on the horizon";
  return degrees > 0 ? `sun ${degrees}° up` : `sun ${-degrees}° below the horizon`;
}

function nauticalText(band: Band, zone: string, date: IsoDate): string {
  if (band.kind === "below") return "None on this date";
  if (band.kind === "above") return "Lasts all night";
  if (band.begin === null) return `From the night before to ${formatClock(band.end as number, zone, date)}`;
  if (band.end === null) return `From ${formatClock(band.begin, zone, date)} through the night`;
  return `${formatClock(band.begin, zone, date)} to ${formatClock(band.end, zone, date)}`;
}

/**
 * The rows of the Sun section, in the order of the day. Days without a sunrise or a
 * sunset, and nights that never get darker than twilight, are said in words.
 */
export function sunRows(day: SunDay, change: number, moon: MoonPhase, zone: string): SunRow[] {
  const { sun, civil, nautical, date } = day;
  const clock = (ms: number) => formatClock(ms, zone, date);
  const rows: SunRow[] = [];
  const noon: SunRow = { key: "noon", label: "Solar noon", value: clock(day.noon), detail: noonHeight(day.noonAltitude) };

  // The sun up all day leaves no twilight to speak of.
  if (sun.kind === "above") {
    rows.push({ key: "sun", label: "Sun", value: "Does not set on this date (midnight sun)" }, noon);
  } else {
    if (civil.kind === "below") {
      rows.push({ key: "light", label: "First and last light", value: "None: the sun stays more than 6° below the horizon" });
    } else if (civil.kind === "above") {
      rows.push({ key: "light", label: "First and last light", value: "Twilight lasts all night" });
    } else {
      rows.push({
        key: "first-light",
        label: "First light (civil dawn)",
        value: civil.begin === null ? "Twilight from the night before" : clock(civil.begin),
      });
    }

    if (sun.kind === "below") {
      rows.push({ key: "sun", label: "Sun", value: "Does not rise on this date (polar night)" }, noon);
    } else {
      rows.push(
        {
          key: "sunrise",
          label: "Sunrise",
          value: sun.begin === null ? "Already up: it did not set the night before" : clock(sun.begin),
          detail: day.sunriseBearing === null ? undefined : formatBearing(day.sunriseBearing),
        },
        noon,
        {
          key: "sunset",
          label: "Sunset",
          value: sun.end === null ? "Does not set tonight" : clock(sun.end),
          detail: day.sunsetBearing === null ? undefined : formatBearing(day.sunsetBearing),
        },
      );
    }

    if (civil.kind === "crosses") {
      rows.push({
        key: "last-light",
        label: "Last light (civil dusk)",
        value: civil.end === null ? "Twilight through the night" : clock(civil.end),
      });
    }
  }

  rows.push({
    key: "day-length",
    label: "Day length",
    value: sun.kind === "below" ? "No daylight" : sun.kind === "above" ? "24 hours" : formatDayLength(day.dayLength),
    detail: formatDayChange(change),
    detailBelow: true,
  });
  // Said already when civil twilight lasts all night, and beside the point under the midnight sun.
  if (sun.kind !== "above" && civil.kind !== "above") {
    rows.push({ key: "nautical", label: "Nautical twilight", value: nauticalText(nautical, zone, date) });
  }
  rows.push({
    key: "moon",
    label: "Moon",
    value: `${moon.name}, ${Math.round(moon.illuminated * 100)}% lit`,
  });
  return rows;
}
