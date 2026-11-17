/**
 * Which clock a time is written on: this device's time zone (with its summer time, from
 * the zone data the browser carries), or a fixed "UTC+n" said by hand, for when the
 * device's zone is wrong or it is not the device being set. And times written to the
 * precision a method deserves. Pure, apart from asking the browser for its zone.
 */
import { type ClockStyle, clockText } from "@/lib/clock";
import { type IsoDate, utcToDate } from "@/features/maps/lib/sun";
import { formatOffset, formatShortDate, zoneOffsetMinutes } from "@/features/maps/lib/sun-text";

const MINUTE = 60_000;

export type ZoneChoice = { kind: "device"; zone: string } | { kind: "fixed"; minutes: number };

/** Minutes the chosen clock is ahead of UTC at an instant. */
export function offsetAt(choice: ZoneChoice, ms: number): number {
  return choice.kind === "fixed" ? choice.minutes : zoneOffsetMinutes(choice.zone, ms);
}

/**
 * The zone's offset without summer time, in minutes: the smaller of its offsets in
 * January and July, which is standard time on either side of the equator. A fixed offset
 * is taken as it is: whoever typed it knows whether it includes summer time.
 */
export function standardOffset(choice: ZoneChoice, ms: number): number {
  if (choice.kind === "fixed") return choice.minutes;
  const year = new Date(ms).getUTCFullYear();
  return Math.min(zoneOffsetMinutes(choice.zone, Date.UTC(year, 0, 1)), zoneOffsetMinutes(choice.zone, Date.UTC(year, 6, 1)));
}

/** "Europe/London (UTC+0 then)", "UTC+2, set by hand". */
export function zoneWords(choice: ZoneChoice, ms: number): string {
  return choice.kind === "fixed"
    ? `${formatOffset(choice.minutes)}, set by hand`
    : `${choice.zone.replace(/_/g, " ")} (${formatOffset(offsetAt(choice, ms))} then)`;
}

/** The clock's reading at an instant: its calendar date and minutes past midnight. */
export function reading(choice: ZoneChoice, ms: number): { date: IsoDate; minutes: number } {
  const local = ms + offsetAt(choice, ms) * MINUTE;
  const day = Math.floor(local / 86_400_000) * 86_400_000;
  return { date: utcToDate(day), minutes: (local - day) / MINUTE };
}

/** "12:07", or "00:12 on 18 Nov" when it falls on another day than `date`. Rounded to `step` minutes. */
export function clockAt(ms: number, choice: ZoneChoice, style: ClockStyle, date?: IsoDate, step = 1): string {
  const { minutes } = reading(choice, ms);
  // Rounded on the clock's own face, so that rounding past midnight moves the day on.
  const shown = reading(choice, ms + (Math.round(minutes / step) * step - minutes) * MINUTE);
  const whole = Math.round(shown.minutes) % 1440;
  const text = clockText(Math.floor(whole / 60), whole % 60, style);
  return date && shown.date !== date ? `${text} on ${formatShortDate(shown.date)}` : text;
}

/**
 * How finely to write an answer good to ± `halfWidth` minutes: to the minute when it is
 * good to three, to five minutes up to twenty, to ten up to an hour, to a quarter beyond.
 * Never more figures than the method deserves.
 */
export function stepFor(halfWidth: number): number {
  if (halfWidth <= 3) return 1;
  if (halfWidth <= 20) return 5;
  if (halfWidth <= 60) return 10;
  return 15;
}

/** "give or take 10 minutes", "give or take 1 hour 15 minutes", on the step the answer is written to. */
export function giveOrTake(halfWidth: number): string {
  const step = stepFor(halfWidth);
  const minutes = Math.max(step, Math.ceil(halfWidth / step) * step);
  if (minutes < 60) return `give or take ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `give or take ${hours} ${hours === 1 ? "hour" : "hours"}${rest ? ` ${rest} minutes` : ""}`;
}

/** The offsets a person may choose by hand, every half hour from UTC−12 to UTC+14 (and the quarter hours some zones keep). */
export const FIXED_OFFSETS: number[] = (() => {
  const offsets: number[] = [];
  for (let minutes = -12 * 60; minutes <= 14 * 60; minutes += 30) offsets.push(minutes);
  offsets.push(345, 525, 765);
  return offsets.sort((a, b) => a - b);
})();

export { formatOffset };
