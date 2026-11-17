/**
 * The moment the map's sun is shown for, shared by the grey line and the Sun tab so the
 * two always agree: "now" (null) unless a person has chosen another. It is held for the
 * visit to the Maps screen only, and goes back to now when the screen is left, so the
 * map never opens on a moment nobody remembers choosing.
 *
 * The clock the Sun's times are written on (this device's or UTC) is shared the same way,
 * and remembered in this browser as the Sun tab always remembered it.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { addDays, dateToUtc, type IsoDate } from "../lib/sun";
import { dateIn, zoneOffsetMinutes } from "../lib/sun-text";
import { readStored, writeStored } from "../lib/view";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// ── The moment ──

let chosen: number | null = null;
const momentListeners = new Set<() => void>();
const subscribeMoment = (listener: () => void) => {
  momentListeners.add(listener);
  return () => momentListeners.delete(listener);
};

/** The moment chosen, or null for now. */
export const mapMoment = (): number | null => chosen;
export function setMapMoment(at: number | null): void {
  if (at === chosen) return;
  chosen = at;
  for (const listener of momentListeners) listener();
}

export function useMapMoment(): [at: number | null, set: (at: number | null) => void] {
  return [useSyncExternalStore(subscribeMoment, mapMoment), setMapMoment];
}

/**
 * The time now, read again at the turn of every minute while `active`, and not at all
 * while the page is out of sight: the line moves a quarter of a degree a minute, and
 * nothing finer is worth waking the map for.
 */
export function useMinute(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, MINUTE - (Date.now() % MINUTE) + 50);
    };
    const start = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "hidden") tick();
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [active]);
  return now;
}

/**
 * Today's date on a zone's clock, read again at that clock's midnight and when the page is
 * shown after being out of sight. Nothing is timed while it is hidden.
 */
export function useToday(zone: string): IsoDate {
  const [today, setToday] = useState(() => dateIn(zone, Date.now()));
  useEffect(() => {
    let timer: number | undefined;
    const read = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      const date = dateIn(zone, now);
      setToday(date);
      const midnight = momentOf(addDays(date, 1), "00:00", zone);
      timer = window.setTimeout(read, Math.max(1_000, midnight - now + 1_000));
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, [zone]);
  return today;
}

// ── The clock the Sun's times are written on ──

export type SunClock = "device" | "utc";
export const SUN_CLOCK_KEY = "outpost.maps.sun.clock";
const isSunClock = (value: unknown): value is SunClock => value === "device" || value === "utc";

// Read from storage each time it is asked for, so that it is never out of step with what is kept there.
const clockListeners = new Set<() => void>();
const readClock = () => readStored(SUN_CLOCK_KEY, isSunClock, "device");
const setClock = (value: SunClock) => {
  writeStored(SUN_CLOCK_KEY, value);
  for (const listener of clockListeners) listener();
};
const subscribeClock = (listener: () => void) => {
  clockListeners.add(listener);
  return () => clockListeners.delete(listener);
};

export function useSunClock(): [clock: SunClock, set: (clock: SunClock) => void] {
  return [useSyncExternalStore(subscribeClock, readClock), setClock];
}

// ── A moment as a date and a time on a clock, and back ──

/** What a date field and a time field show for a moment on a zone's clock: "2026-06-21" and "03:00". */
export function fieldsOf(ms: number, zone: string): { date: IsoDate; time: string } {
  const whole = Math.floor(ms / MINUTE) * MINUTE;
  const local = whole + zoneOffsetMinutes(zone, whole) * MINUTE;
  const reading = new Date(local);
  const two = (value: number) => String(value).padStart(2, "0");
  return { date: dateIn(zone, whole), time: `${two(reading.getUTCHours())}:${two(reading.getUTCMinutes())}` };
}

/**
 * The moment a date and a time on a zone's clock stand for, or NaN when they are not a
 * date and a time. A time that a change of clocks skips is taken an hour on; one that it
 * repeats is taken the first time round.
 */
export function momentOf(date: IsoDate, time: string, zone: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  const day = dateToUtc(date);
  if (!match || !Number.isFinite(day)) return Number.NaN;
  const asUtc = day + Number(match[1]) * HOUR + Number(match[2]) * MINUTE;
  let guess = asUtc - zoneOffsetMinutes(zone, asUtc) * MINUTE;
  guess = asUtc - zoneOffsetMinutes(zone, guess) * MINUTE;
  return guess;
}
