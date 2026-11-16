/**
 * How a time of day is written, everywhere in the app: on the 24-hour clock ("14:32")
 * or the 12-hour one ("2:32 pm"). The choice is kept in this browser only, like the
 * theme, and follows the device until someone chooses.
 *
 * Every clock time the app writes goes through `clockText`, so one screen never shows
 * two styles. The exception is UTC, which is always on the 24-hour clock: callers that
 * show UTC pass "24" themselves.
 */
import { useSyncExternalStore } from "react";

export type ClockChoice = "device" | "24" | "12";
export type ClockStyle = "24" | "12";

export const CLOCK_CHOICES: readonly ClockChoice[] = ["device", "24", "12"];
const KEY = "outpost.clock";

const two = (value: number) => String(value).padStart(2, "0");

/**
 * A time of day in words a clock would use: "07:42" or "7:42 am", "00:07" or "12:07 am",
 * "12:00" or "12:00 pm". Seconds are added when given: "14:32:07", "2:32:07 pm".
 */
export function clockText(hour: number, minute: number, style: ClockStyle, second?: number): string {
  const rest = `:${two(minute)}${second === undefined ? "" : `:${two(second)}`}`;
  if (style === "24") return `${two(hour)}${rest}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}${rest} ${hour < 12 ? "am" : "pm"}`;
}

/** Which clock this device uses, as its browser reports it for the device's language and region. */
function detectDeviceStyle(): ClockStyle {
  try {
    const options = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    const cycle = options.hourCycle ?? (options.hour12 ? "h12" : "h23");
    return cycle === "h11" || cycle === "h12" ? "12" : "24";
  } catch {
    return "24";
  }
}

function readChoice(): ClockChoice {
  try {
    const value = localStorage.getItem(KEY) as ClockChoice | null;
    return value && CLOCK_CHOICES.includes(value) ? value : "device";
  } catch {
    // No storage here (a private window, the service worker): follow the device.
    return "device";
  }
}

let choice: ClockChoice = readChoice();
let device: ClockStyle | undefined;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

export function deviceClockStyle(): ClockStyle {
  device ??= detectDeviceStyle();
  return device;
}

/** What the tests take the device to use: a test runner's own language is not the point of any test. */
export function setDeviceClockStyle(style: ClockStyle | undefined): void {
  device = style;
  changed();
}

export const clockChoice = (): ClockChoice => choice;

/** The style in force: the one chosen, or the device's. */
export const clockStyle = (): ClockStyle => (choice === "device" ? deviceClockStyle() : choice);

export function setClockChoice(next: ClockChoice): void {
  choice = next;
  try {
    if (next === "device") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Storage refused: the choice then lasts for this visit only.
  }
  changed();
}

// Another tab of this browser changed the choice.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    choice = readChoice();
    changed();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The clock style in force, for a component that must be drawn again when it changes. */
export function useClockStyle(): ClockStyle {
  return useSyncExternalStore(subscribe, clockStyle);
}

/** The choice itself, for the place where it is made. */
export function useClockChoice(): [ClockChoice, (next: ClockChoice) => void] {
  return [useSyncExternalStore(subscribe, clockChoice), setClockChoice];
}

/** A moment as a time of day on this device's clock, in the style in force: "14:32", "2:32 pm". */
export function formatTimeOfDay(at: number | Date, options: { seconds?: boolean } = {}): string {
  const date = new Date(at);
  return clockText(date.getHours(), date.getMinutes(), clockStyle(), options.seconds ? date.getSeconds() : undefined);
}

/** A time of day stored as "HH:MM", in the style in force: "03:00", "3:00 am". Anything else is given back as it came. */
export function formatStoredTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? clockText(Number(match[1]), Number(match[2]), clockStyle()) : value;
}
