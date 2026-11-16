/**
 * The Sun section of a place: sunrise, sunset, twilight, solar noon and the length of
 * the day, with the moon's phase, for a date. Everything is worked out in the browser
 * from the position and the date (`lib/sun`, `lib/moon`); nothing is asked of the server.
 *
 * `SunSection` folds away to one line, so it never pushes a place's own details off the
 * screen, and remembers in this browser whether it was left open. `SunTimes` is the same
 * thing always open: the Sun tab of the map's panel. Both remember which clock was
 * chosen, and write times in the style chosen for the whole app (`lib/clock`), except
 * UTC, which is always 24-hour.
 *
 * The times are laid out to be read on a phone held at arm's length, outdoors: sunrise
 * and sunset large at the top, first and last light under them, and everything else in
 * a quiet list below, so that nothing crowds the two times most people came for.
 */
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { useClockStyle } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { useMapMoment, useSunClock } from "../grey-line/time";
import type { LatLon } from "../lib/geo";
import { moonPhase } from "../lib/moon";
import { addDays, dateToUtc, dayLengthChange, type IsoDate, isIsoDate, sunDay } from "../lib/sun";
import {
  type ClockWriting,
  dateIn,
  deviceZone,
  formatOffset,
  formatShortDate,
  hoursFromZone,
  type SunRow,
  sunLayout,
  sunRows,
  sunSummary,
  zoneOffsetMinutes,
} from "../lib/sun-text";
import { readStored, writeStored } from "../lib/view";
import { Fact } from "../ui";
import { SunPdf } from "./sun-pdf";

const OPEN_KEY = "outpost.maps.sun.open";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * In a card over the map on a wide screen the opened section takes what height the screen can
 * spare and scrolls inside it. On a phone the card itself is given its greatest height and
 * scrolls (see `mapCard`), and a second place to scroll inside it would only be in the way.
 */
const CONTAINED = "scroll-quiet md:max-h-[min(24rem,max(8rem,calc(100dvh-32rem)))] md:overflow-y-auto md:pr-1";

/** The years the method is good for; see `lib/sun`. */
const FIRST_DATE = "1900-01-01";
const LAST_DATE = "2100-12-31";

const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

/**
 * The day's sun at a position, and everything the two layouts below share. `shared`: the
 * date is the day of the moment the map's sun is shown for (grey-line/time.ts), so that the
 * Sun tab and the grey line on the map are always about the same day.
 */
function useSun(position: LatLon, zone: string | undefined, shared = false) {
  const device = useMemo(() => zone ?? deviceZone(), [zone]);
  const style = useClockStyle();
  const [clock, setClock] = useSunClock();
  const [today] = useState(() => dateIn(device, Date.now()));
  const [ownDate, setOwnDate] = useState<IsoDate>(today);
  const [moment, setMoment] = useMapMoment();
  const date = shared ? (moment === null ? today : dateIn(device, moment)) : ownDate;
  /** Another day, at the same time of day: the moment moves by whole days. */
  const setDate = (next: IsoDate) => {
    if (!shared) return setOwnDate(next);
    if (next === date) return;
    setMoment((moment ?? Date.now()) + dateToUtc(next) - dateToUtc(date));
  };
  /** Back to today: for the shared moment, back to now. */
  const goToday = () => (shared ? setMoment(null) : setOwnDate(today));

  const { lat, lon } = position;
  const utc = clock === "utc";
  const shownZone = utc ? "UTC" : device;
  const day = useMemo(() => sunDay(lat, lon, date), [lat, lon, date]);
  const rows = useMemo(() => {
    // UTC is written as a radio log writes it, whatever style the rest of the app is in.
    const writing: ClockWriting = utc ? { style: "24", mark: "UTC" } : { style };
    return sunRows(day, dayLengthChange(lat, lon, date), moonPhase(day.noon), shownZone, writing);
  }, [day, lat, lon, date, shownZone, utc, style]);
  const summary = `${date === today ? "" : `${formatShortDate(date)}: `}${sunSummary(day, shownZone, utc ? { style: "24", mark: "UTC" } : { style })}`;
  const choose = (next: string) => {
    if (isIsoDate(next) && next >= FIRST_DATE && next <= LAST_DATE) setDate(next);
  };
  return {
    position,
    device,
    style,
    clock,
    setClock,
    today,
    date,
    goToday,
    choose,
    day,
    rows,
    summary,
    far: hoursFromZone(lon, device, day.noon),
  };
}

const dayParts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "Today, Sunday 21 June", or "Friday 20 March 2026" for any other day. Put together from its parts: browsers differ over the commas. */
export function dayCaption(date: IsoDate, today: IsoDate): string {
  const parts: Record<string, string> = {};
  for (const part of dayParts.formatToParts(new Date(`${date}T00:00:00Z`))) parts[part.type] = part.value;
  const day = `${parts.weekday} ${parts.day} ${parts.month}`;
  return date === today ? `Today, ${day}` : `${day} ${parts.year}`;
}

/**
 * One time, set large. The figures stand alone; "am", "UTC" and the date of another day are
 * small beside or under them, so that the figures are as large as the width allows. A day
 * without the event is said in words at reading size.
 */
function Figure({ row, size }: { row: SunRow; size: "large" | "medium" }) {
  if (!row.clock) return <span className="text-body font-medium text-balance text-ink">{row.value}</span>;
  const [figures, suffix] = row.clock.time.split(" ");
  const small = [suffix, row.clock.mark].filter(Boolean).join(" ");
  return (
    <>
      <span className="whitespace-nowrap">
        <span className={cn("tabular font-semibold text-ink", size === "large" ? "text-display" : "text-heading")}>{figures}</span>
        {small ? <span className="text-small font-medium text-ink-muted"> {small}</span> : null}
      </span>
      {row.clock.day ? <span className="block text-small text-ink-muted"> on {row.clock.day}</span> : null}
    </>
  );
}

/**
 * Two times side by side, each under its name. The names share one row and the times the
 * next, so a name that takes two lines on a narrow phone does not push its time out of line
 * with the other. Where the text is too large for two columns they stack.
 */
function Figures({ rows, size }: { rows: SunRow[]; size: "large" | "medium" }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-x-4 gap-y-2">
      {rows.map((row) => (
        <div key={row.key} className="row-span-2 grid grid-rows-subgrid gap-y-0">
          <dt className="self-end text-small text-ink-muted">{row.label}</dt>
          <dd className="min-w-0">
            <Figure row={row} size={size} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The date, the day's times, and which clock they are on. */
function SunBody({
  sun,
  id,
  place,
  children,
  className,
}: {
  sun: ReturnType<typeof useSun>;
  id?: string;
  /** What the times are for, for the sheet on paper: a saved place's name, the position as the screen writes it. */
  place?: { name?: string; coordinates?: string };
  /** Said between the times and the quieter list: which point the times are for. */
  children?: ReactNode;
  className?: string;
}) {
  const { position, device, style, clock, setClock, today, date, goToday, choose, day, rows, far } = sun;
  const layout = useMemo(() => sunLayout(rows), [rows]);
  return (
    <div id={id} className={cn("grid gap-3", className)}>
      {/* Before the times, because it changes how they are read. */}
      {far ? (
        <p className="text-small text-ink-muted">
          By the sun, this place runs about {far.hours} hours {far.direction === "ahead" ? "ahead of" : "behind"} this device’s time zone,
          so clocks there probably read differently. Outpost cannot tell a place’s time zone offline and does not guess. The date is the
          date at the place.
        </p>
      ) : null}

      <div className="grid gap-1">
        <p className="text-small font-medium text-ink">{dayCaption(date, today)}</p>
        <Figures rows={layout.main} size="large" />
      </div>
      {layout.light.length > 0 ? <Figures rows={layout.light} size="medium" /> : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="icon" aria-label="The day before" onClick={() => choose(addDays(date, -1))}>
          <ChevronLeft />
        </Button>
        <Input
          type="date"
          value={date}
          min={FIRST_DATE}
          max={LAST_DATE}
          onChange={(event) => choose(event.target.value)}
          // Inside a place's form, Enter here would otherwise save the place.
          onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
          aria-label="Date"
          className="tabular w-auto min-w-0 flex-1 text-small"
        />
        <Button variant="ghost" size="icon" aria-label="The day after" onClick={() => choose(addDays(date, 1))}>
          <ChevronRight />
        </Button>
        {date !== today ? (
          <Button variant="link" size="sm" onClick={goToday}>
            Today
          </Button>
        ) : null}
      </div>

      {children}

      <dl className="border-t border-border">
        {layout.rest.map((row) => (
          <Fact key={row.key} label={row.label}>
            {row.value}
            {row.detail ? (
              <span className={cn("text-ink-muted", row.detailBelow ? "block" : "ml-2 whitespace-nowrap")}>{row.detail}</span>
            ) : null}
          </Fact>
        ))}
      </dl>

      <div className="grid gap-1.5">
        <Segmented
          label="Clock the times are shown on"
          value={clock}
          onChange={setClock}
          options={[
            { value: "device", label: "This device’s time" },
            { value: "utc", label: "UTC" },
          ]}
          className="justify-self-start"
        />
        <p className="text-small text-ink-muted">
          {clock === "utc" ? (
            <>Times are in UTC.{style === "12" ? " UTC is written on the 24-hour clock, whichever clock is chosen in Settings." : ""}</>
          ) : (
            <>
              Times are in this device’s time zone, {device} ({formatOffset(zoneOffsetMinutes(device, day.noon))}). For{" "}
              {style === "12" ? "the 24-hour clock" : "a 12-hour clock"}, see{" "}
              <Link to="/settings#appearance" className={link}>
                Settings → Appearance
              </Link>
              .
            </>
          )}
        </p>
        <p className="text-small text-ink-muted">
          For a flat horizon at sea level, to about a minute; hills make sunrise later and sunset earlier. In the far north and south it can
          be several minutes out.
        </p>
      </div>

      <SunPdf place={{ ...place, lat: position.lat, lon: position.lon }} date={date} zone={device} utc={clock === "utc"} style={style} />
    </div>
  );
}

export function SunSection({
  position,
  name,
  defaultOpen = false,
  contained = false,
  zone,
  onOpen,
  className,
}: {
  position: LatLon;
  /** The saved place's name, for the sheet on paper. */
  name?: string;
  /** Open to begin with, whatever was remembered: the person has just asked for sun times. */
  defaultOpen?: boolean;
  /** Inside a card over the map: the opened section scrolls within itself instead of growing past the screen. */
  contained?: boolean;
  /** The time zone of the device's clock; read from the browser unless given. */
  zone?: string;
  /** A person has opened the section: on a phone, whatever holds it can make room. */
  onOpen?: () => void;
  className?: string;
}) {
  const bodyId = useId();
  const sun = useSun(position, zone);
  const [open, setOpen] = useState(() => defaultOpen || readStored(OPEN_KEY, isBoolean, false));

  const toggle = () => {
    writeStored(OPEN_KEY, !open);
    setOpen(!open);
    if (!open) onOpen?.();
  };
  // In a card that scrolls, the times that were asked for are brought to the top of what shows, under the card's title.
  const section = useRef<HTMLElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (contained && open && !wasOpen.current) section.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    wasOpen.current = open;
  }, [contained, open]);

  return (
    <section ref={section} className={cn("grid scroll-mt-12", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={toggle}
        className="flex min-h-9 w-full items-center gap-3 rounded-control text-left max-md:min-h-11"
      >
        <span className="text-small font-medium text-ink">Sun</span>
        {/* At reading size and in ink: this line is the answer for most people. Two lines on a narrow phone rather than a sunset cut off. */}
        <span className="tabular min-w-0 flex-1 text-right text-body font-medium text-balance text-ink">{open ? "" : sun.summary}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-out", open && "rotate-180")}
        />
      </button>
      {open ? <SunBody sun={sun} id={bodyId} place={{ name }} className={cn("pt-1", contained && CONTAINED)} /> : null}
    </section>
  );
}

/**
 * The same times, always open. The one line that answers the usual question is kept for
 * screen readers, which are told when the map has moved and the times with it; on screen
 * the two large times say the same.
 */
export function SunTimes({
  position,
  zone,
  shared = false,
  coordinates,
  children,
  className,
}: {
  position: LatLon;
  zone?: string;
  /** The position as the screen writes it, for the sheet on paper. */
  coordinates?: string;
  /** The day is the one the map's sun is shown for, which the grey line is drawn for too. */
  shared?: boolean;
  /** Said between the times and the quieter list: which point the times are for. */
  children?: ReactNode;
  className?: string;
}) {
  const sun = useSun(position, zone, shared);
  return (
    <div className={cn("grid", className)}>
      <p className="sr-only" aria-live="polite" aria-atomic>
        {sun.summary}
      </p>
      <SunBody sun={sun} place={{ coordinates }}>
        {children}
      </SunBody>
    </div>
  );
}
