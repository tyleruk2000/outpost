/**
 * The Sun section of a place: sunrise, sunset, twilight, solar noon and the length of
 * the day, with the moon's phase, for a date. Everything is worked out in the browser
 * from the position and the date (`lib/sun`, `lib/moon`); nothing is asked of the server.
 *
 * It folds away to one line, so it never pushes a place's own details off the screen,
 * and remembers in this browser whether it was left open and which clock was chosen.
 */
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useStoredState } from "../hooks";
import type { LatLon } from "../lib/geo";
import { moonPhase } from "../lib/moon";
import { addDays, dayLengthChange, type IsoDate, isIsoDate, sunDay } from "../lib/sun";
import { dateIn, deviceZone, formatOffset, formatShortDate, hoursFromZone, sunRows, sunSummary, zoneOffsetMinutes } from "../lib/sun-text";
import { readStored, writeStored } from "../lib/view";
import { Fact } from "../ui";

const OPEN_KEY = "outpost.maps.sun.open";
const CLOCK_KEY = "outpost.maps.sun.clock";

type Clock = "device" | "utc";
const isClock = (value: unknown): value is Clock => value === "device" || value === "utc";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * In a card over the map the opened section takes what height the screen can spare and scrolls
 * inside it: the card's own title, its close button and the bar across the top of the screen
 * stay in view on a short phone. 32rem is what the rest of the screen needs there.
 */
const CONTAINED = "scroll-quiet max-h-[min(24rem,max(8rem,calc(100dvh-32rem)))] overflow-y-auto pr-1";

/** The years the method is good for; see `lib/sun`. */
const FIRST_DATE = "1900-01-01";
const LAST_DATE = "2100-12-31";

export function SunSection({
  position,
  defaultOpen = false,
  contained = false,
  zone,
  className,
}: {
  position: LatLon;
  /** Open to begin with, whatever was remembered: the person has just asked for sun times. */
  defaultOpen?: boolean;
  /** Inside a card over the map: the opened section scrolls within itself instead of growing past the screen. */
  contained?: boolean;
  /** The time zone of the device's clock; read from the browser unless given. */
  zone?: string;
  className?: string;
}) {
  const bodyId = useId();
  const device = useMemo(() => zone ?? deviceZone(), [zone]);
  const [open, setOpen] = useState(() => defaultOpen || readStored(OPEN_KEY, isBoolean, false));
  const [clock, setClock] = useStoredState<Clock>(CLOCK_KEY, isClock, "device");
  const [today] = useState(() => dateIn(device, Date.now()));
  const [date, setDate] = useState<IsoDate>(today);

  const { lat, lon } = position;
  const shownZone = clock === "utc" ? "UTC" : device;
  const day = useMemo(() => sunDay(lat, lon, date), [lat, lon, date]);
  const rows = useMemo(
    () => sunRows(day, dayLengthChange(lat, lon, date), moonPhase(day.noon), shownZone),
    [day, lat, lon, date, shownZone],
  );
  const far = hoursFromZone(lon, device, day.noon);
  const summary = `${date === today ? "" : `${formatShortDate(date)}: `}${sunSummary(day, shownZone)}`;

  const toggle = () => {
    writeStored(OPEN_KEY, !open);
    setOpen(!open);
  };
  const choose = (next: string) => {
    if (isIsoDate(next) && next >= FIRST_DATE && next <= LAST_DATE) setDate(next);
  };

  return (
    <section className={cn("grid", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={toggle}
        className="flex min-h-9 w-full items-center gap-3 rounded-control text-left max-md:min-h-11"
      >
        <span className="text-small font-medium text-ink">Sun</span>
        <span className="tabular min-w-0 flex-1 truncate text-right text-small text-ink-muted">{open ? "" : summary}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-out", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div id={bodyId} className={cn("grid gap-3 pt-1", contained && CONTAINED)}>
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
              <Button variant="link" size="sm" onClick={() => setDate(today)}>
                Today
              </Button>
            ) : null}
          </div>

          {/* Before the times, because it changes how they are read. */}
          {far ? (
            <p className="text-small text-ink-muted">
              By the sun, this place runs about {far.hours} hours {far.direction === "ahead" ? "ahead of" : "behind"} this device’s time
              zone, so clocks there probably read differently. Outpost cannot tell a place’s time zone offline and does not guess. The date
              is the date at the place.
            </p>
          ) : null}

          <dl>
            {rows.map((row) => (
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
              {clock === "utc"
                ? "Times are in UTC."
                : `Times are in this device’s time zone, ${device} (${formatOffset(zoneOffsetMinutes(device, day.noon))}).`}
            </p>
            <p className="text-small text-ink-muted">
              For a flat horizon at sea level, to about a minute; hills make sunrise later and sunset earlier. In the far north and south it
              can be several minutes out.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
