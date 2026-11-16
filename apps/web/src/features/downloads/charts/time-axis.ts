/** Ticks and labels for axes that count time from now, and clock times for forecasts. Pure, but for the clock style in use. */
import { formatTimeOfDay } from "@/lib/clock";

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

/** Steps a person reads at a glance, in seconds: never "every 7 minutes". */
const STEPS = [
  5,
  10,
  15,
  30,
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
];

/** The step between ticks for an axis `spanSeconds` long that has room for `maxTicks` labels after "now". */
export function durationStep(spanSeconds: number, maxTicks: number): number {
  const wanted = Math.max(1, Math.floor(maxTicks));
  return STEPS.find((step) => spanSeconds / step <= wanted) ?? Math.ceil(spanSeconds / wanted / (30 * DAY)) * 30 * DAY;
}

/** Tick positions in seconds from now: 0, then every step that still fits inside the span. */
export function durationTicks(spanSeconds: number, maxTicks: number): number[] {
  if (!(spanSeconds > 0)) return [0];
  const step = durationStep(spanSeconds, maxTicks);
  const ticks: number[] = [];
  for (let at = 0; at <= spanSeconds + 1e-6; at += step) ticks.push(at);
  return ticks;
}

function parts(seconds: number): string {
  const total = Math.round(seconds);
  if (total < MINUTE) return `${total} s`;
  if (total < HOUR) {
    const rest = total % MINUTE;
    return rest === 0 ? `${total / MINUTE} min` : `${Math.floor(total / MINUTE)} min ${rest} s`;
  }
  if (total < DAY) {
    const minutes = Math.round((total % HOUR) / MINUTE);
    return minutes === 0 ? `${Math.floor(total / HOUR)} h` : `${Math.floor(total / HOUR)} h ${minutes} min`;
  }
  const hours = Math.round((total % DAY) / HOUR);
  return hours === 0 ? `${Math.floor(total / DAY)} d` : `${Math.floor(total / DAY)} d ${hours} h`;
}

/** A tick on an axis that looks ahead: "now", "+30 s", "+10 min", "+1 h 30 min", "+2 d". */
export function aheadLabel(seconds: number): string {
  return Math.round(seconds) <= 0 ? "now" : `+${parts(seconds)}`;
}

/** A tick on an axis that looks back: "now", "30 s ago", "2 min ago". */
export function agoLabel(seconds: number): string {
  return Math.round(seconds) <= 0 ? "now" : `${parts(seconds)} ago`;
}

/** "14:32" in the device's own time zone, or "2:32 pm" where the 12-hour clock is in use. */
export const clockTime = (at: number | Date): string => formatTimeOfDay(at);

/** "14:32:07", for readings a second apart. */
export const clockTimeWithSeconds = (at: number | Date): string => formatTimeOfDay(at, { seconds: true });

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayNumber = (date: Date) => Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime() / 86_400_000);

/** "17 Nov" */
export function shortDate(at: number | Date): string {
  const date = new Date(at);
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * A moment as a person would say it from `now`: "14:32" today, "tomorrow at 02:10",
 * "yesterday at 23:50", otherwise "Tue 17 Nov at 02:10".
 */
export function clockAt(at: number | Date, now: number | Date = Date.now()): string {
  const date = new Date(at);
  const days = dayNumber(date) - dayNumber(new Date(now));
  const time = clockTime(date);
  if (days === 0) return time;
  if (days === 1) return `tomorrow at ${time}`;
  if (days === -1) return `yesterday at ${time}`;
  return `${weekdays[date.getDay()]} ${shortDate(date)} at ${time}`;
}

/**
 * The same moment as the end of a sentence: "at 14:32" today, "tomorrow at 02:10",
 * "on Tue 17 Nov at 02:10". Never "at tomorrow at".
 */
export function atClock(at: number | Date, now: number | Date = Date.now()): string {
  const said = clockAt(at, now);
  if (said === clockTime(at)) return `at ${said}`;
  return /^(tomorrow|yesterday) /.test(said) ? said : `on ${said}`;
}

/**
 * Ticks for an axis of clock time between two moments: on round times ("18:40",
 * "18:45"), with seconds only when the whole axis is a couple of minutes long.
 */
export function clockTicks(from: number, to: number, maxTicks: number): Array<{ at: number; label: string }> {
  const span = (to - from) / 1000;
  if (!(span > 0)) return [];
  const step = durationStep(span, maxTicks) * 1000;
  // Round times are round on the wall clock, so the device's offset from UTC is taken out before rounding.
  const offset = new Date(from).getTimezoneOffset() * 60_000;
  const ticks: Array<{ at: number; label: string }> = [];
  for (let at = Math.ceil((from - offset) / step) * step + offset; at <= to; at += step) {
    ticks.push({ at, label: step < 60_000 ? clockTimeWithSeconds(at) : clockTime(at) });
  }
  return ticks;
}
