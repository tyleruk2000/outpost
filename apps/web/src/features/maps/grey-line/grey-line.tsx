/**
 * The grey line on the Maps screen: whether it is switched on (remembered in this
 * browser), keeping it drawn for the moment shown, and the legend that says what that
 * moment is and lets another be chosen.
 *
 * The moment is the one the Sun tab shows (see time.ts): choosing a date there moves the
 * line, and choosing a time here moves the Sun tab's date when it crosses midnight. Now
 * is the default; the line then follows the clock, once a minute.
 */
import { ChevronDown, Clock } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClockStyle } from "@/lib/clock";
import { appLocale } from "@/lib/region";
import { cn } from "@/lib/utils";
import { useMapTheme, useStoredState } from "../hooks";
import type { MapTheme } from "../lib/style";
import { clockParts, deviceZone } from "../lib/sun-text";
import { readStored } from "../lib/view";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { mapSurface } from "../ui";
import { greyLineData } from "./geometry";
import { GREY_LINE_SOURCE, shadeOpacity } from "./layers";
import { fieldsOf, momentOf, type SunClock, setMapMoment, useMapMoment, useMinute, useSunClock } from "./time";

const KEY = "outpost.maps.greyLine";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** Whether the grey line is switched on for the map on screen, for anything that starts from how the map is set (a printed page). */
export const greyLineShown = (): boolean => readStored(KEY, isBoolean, false);

/** The years the Sun's arithmetic is good for, as the Sun tab has them. */
const FIRST_DATE = "1900-01-01";
const LAST_DATE = "2100-12-31";

const dateFormats = new Map<string, Intl.DateTimeFormat>();
/** "Sunday 21 June 2026" on a zone's calendar. */
function longDate(ms: number, zone: string): string {
  let format = dateFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat(appLocale(), { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    dateFormats.set(zone, format);
  }
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(ms)) parts[part.type] = part.value;
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/**
 * The moment the line is drawn for, in words: "14:32 UTC on Monday 16 November 2026". UTC is
 * on the 24-hour clock whatever the app's clock is, as everywhere else in Outpost.
 */
export function momentText(ms: number, clock: SunClock, zone: string, style: "24" | "12"): string {
  const shown = clock === "utc" ? "UTC" : zone;
  const parts = clockParts(ms, shown, "", clock === "utc" ? { style: "24", mark: "UTC" } : { style });
  return `${parts.time}${parts.mark ? ` ${parts.mark}` : ""} on ${longDate(ms, shown)}`;
}

/** A small square of the map's land with a number of shades over it, as the map draws them. */
function Swatch({ theme, steps, className }: { theme: MapTheme; steps: number; className?: string }) {
  const opacity = 1 - (1 - shadeOpacity(theme)) ** steps;
  const dark = shadeOpacity(theme) > 0.1;
  const tint = dark ? `rgba(0, 0, 0, ${opacity})` : `color-mix(in srgb, ${theme.ink} ${Math.round(opacity * 100)}%, transparent)`;
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3 w-4 shrink-0 rounded-[2px] border border-border-strong", className)}
      style={{ background: `linear-gradient(${tint}, ${tint}), ${theme.land}` }}
    />
  );
}

/** What the shading and the lines mean. */
function Key({ theme }: { theme: MapTheme }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted">
      <li className="flex items-center gap-1.5">
        <Swatch theme={theme} steps={0} />
        Day
      </li>
      <li className="flex items-center gap-1.5">
        <span className="flex">
          <Swatch theme={theme} steps={1} className="rounded-r-none" />
          <Swatch theme={theme} steps={2} className="rounded-none border-l-0" />
          <Swatch theme={theme} steps={3} className="rounded-l-none border-l-0" />
        </span>
        Twilight, deepening
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch theme={theme} steps={4} />
        Night
      </li>
      <li className="flex items-center gap-1.5">
        <svg aria-hidden viewBox="0 0 20 6" className="h-1.5 w-5 shrink-0 text-ink">
          <line x1="0" y1="3" x2="20" y2="3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Sunrise or sunset
      </li>
    </ul>
  );
}

/**
 * The legend over the map: the moment it is drawn for and whether that is now, what the
 * shading means, and a way to choose another moment and to go back to now.
 */
export function GreyLineLegend({
  at,
  isNow,
  onChoose,
  zone,
  className,
}: {
  /** The moment drawn. */
  at: number;
  isNow: boolean;
  /** A moment chosen, or null for now. */
  onChoose: (at: number | null) => void;
  /** The time zone of the device's clock; read from the browser unless given. */
  zone?: string;
  className?: string;
}) {
  const { theme } = useMapTheme();
  const style = useClockStyle();
  const [clock, setClock] = useSunClock();
  const device = useMemo(() => zone ?? deviceZone(), [zone]);
  const shownZone = clock === "utc" ? "UTC" : device;
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const dateId = useId();
  const timeId = useId();
  const fields = fieldsOf(at, shownZone);
  const when = momentText(at, clock, device, style);

  const choose = (date: string, time: string) => {
    if (date < FIRST_DATE || date > LAST_DATE) return;
    const next = momentOf(date, time, shownZone);
    if (Number.isFinite(next)) onChoose(next);
  };

  return (
    <section
      aria-label="Grey line"
      data-grey-line-legend
      className={cn(mapSurface, "pointer-events-auto grid gap-2 px-3 py-2.5", className)}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-small text-ink">
          <span className="font-semibold">Grey line</span>
          {/* Said in words whenever it is not now, so a chosen moment is never taken for the present. */}
          <span className="tabular block" data-grey-line-time>
            {isNow ? `Now, ${when}` : `Not now: drawn for ${when}`}
          </span>
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Choose the time it is drawn for"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen(!open)}
          className="-mt-1 -mr-1.5"
        >
          {open ? <ChevronDown className="rotate-180" /> : <Clock />}
        </Button>
      </div>
      {/* While the time is being chosen, "Now" is beside the fields instead. */}
      {isNow || open ? null : (
        <Button size="md" variant="soft" onClick={() => onChoose(null)} className="justify-self-start">
          Back to now
        </Button>
      )}
      {/* On a phone the key gives way to the fields while they are open, so the card stays short. */}
      <div className={cn(open && "max-md:hidden")}>
        <Key theme={theme} />
      </div>
      {open ? (
        <div id={bodyId} className="grid gap-2 border-t border-border pt-2">
          <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-2">
            <div className="grid min-w-0 gap-1">
              <label htmlFor={dateId} className="text-small text-ink-muted">
                Date<span className="sr-only"> of the grey line</span>
              </label>
              <Input
                id={dateId}
                type="date"
                value={fields.date}
                min={FIRST_DATE}
                max={LAST_DATE}
                onChange={(event) => choose(event.target.value, fields.time)}
                className="tabular w-full min-w-0 px-2 text-small max-md:h-11"
              />
            </div>
            <div className="grid min-w-0 gap-1">
              <label htmlFor={timeId} className="text-small text-ink-muted">
                {clock === "utc" ? "Time (UTC)" : "Time"}
                <span className="sr-only"> of the grey line</span>
              </label>
              <Input
                id={timeId}
                type="time"
                value={fields.time}
                onChange={(event) => choose(fields.date, event.target.value)}
                className="tabular w-full min-w-0 px-2 text-small max-md:h-11"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {isNow ? null : (
              <Button size="md" onClick={() => onChoose(null)}>
                Now
              </Button>
            )}
            <Button size="md" variant="ghost" onClick={() => setClock(clock === "utc" ? "device" : "utc")} className="px-2 text-primary">
              {clock === "utc" ? "Use this device’s time" : "Use UTC"}
            </Button>
          </div>
          <p className="text-small text-ink-muted">
            {clock === "utc" ? "In UTC" : `In this device’s time, ${device}`}. The Sun tab shows the same day. The shading steps at 6°, 12°
            and 18° below the horizon.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The grey line's state on the Maps screen: switched on or off, kept drawn for the moment
 * shown, and the legend to put over the map while it is on.
 */
export function useGreyLine(
  engine: MapEngine | null,
  /** "over": laid over the map under the search box (a wide screen). "flow": one of the things in the phone's column, which places it. */
  placed: "over" | "flow" = "over",
): { on: boolean; setOn: (on: boolean) => void; legend: ReactNode } {
  const [on, setOn] = useStoredState(KEY, isBoolean, false);
  const [chosen, setChosen] = useMapMoment();
  const now = useMinute(on && chosen === null);
  const at = chosen ?? now;

  useEffect(() => {
    engine?.setOverlay(GREY_LINE_SOURCE, on ? greyLineData(at) : EMPTY);
  }, [engine, on, at]);
  // Leaving the screen goes back to now: a moment chosen here is for this visit.
  useEffect(() => () => setMapMoment(null), []);

  const legend = on ? (
    <GreyLineLegend
      at={at}
      isNow={chosen === null}
      onChoose={setChosen}
      className={placed === "flow" ? "w-full" : "absolute top-[4.25rem] left-3 z-10 w-[min(24rem,calc(100%-1.5rem))]"}
    />
  ) : null;
  return { on, setOn, legend };
}
