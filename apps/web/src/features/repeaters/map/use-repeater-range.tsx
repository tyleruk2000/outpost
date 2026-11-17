/**
 * The estimated range of the repeater that is open on the map: a switch in its card,
 * the heights it is worked out with, the outline on the map and what it means.
 *
 * Off by default and remembered on this device. While it is off, or no repeater is
 * open, nothing is asked of the server and nothing is drawn. While it is on, the server
 * is asked once for each repeater, pair of heights and installed terrain (the query's
 * key starts with "maps", so installing or removing terrain asks again); moving or
 * zooming the map asks nothing.
 */
import {
  RANGE_BEARINGS,
  RANGE_MAX_HEIGHT_METERS,
  RANGE_MAX_METERS,
  RANGE_STATIONS,
  type RepeaterDto,
  type SightRange,
} from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CircleAlert } from "lucide-react";
import { type ReactNode, type Ref, useCallback, useEffect, useId, useRef } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented, Spinner, Switch } from "@/components/ui/misc";
import { useDebounced, useStoredState } from "@/features/maps/hooks";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY } from "@/features/maps/map/overlays";
import { NumberField } from "@/features/maps/radio/sight-panel";
import { api, errorMessage } from "@/lib/api";
import {
  aerialOf,
  DEFAULT_RANGE_PREFS,
  describeRangeTerrain,
  formatHeight,
  formatReach,
  isRangePrefs,
  RANGE_KEY,
  RANGE_SOURCE,
  type RangePrefs,
  rangeBounds,
  rangeData,
  readRange,
  stationOf,
} from "./range";

/**
 * How much of the bottom of the map the repeater's card covers. On a phone the card sits
 * over the map, and with the range on it is tall, so it is measured rather than assumed.
 */
function cardCover(inside: Element | null): number {
  if (window.matchMedia("(min-width: 48rem)").matches) return 0;
  const card = inside?.closest(".outpost-map-card")?.getBoundingClientRect();
  const map = document.querySelector(".outpost-map")?.getBoundingClientRect();
  return card && map ? Math.max(0, map.bottom - card.top + 8) : 290;
}

type Placed = Pick<RepeaterDto, "id" | "lat" | "lon" | "antennaMeters">;

export function useSightRange(at: { lat: number; lon: number } | null, aerial: number, station: number) {
  const where = at ? `${at.lat.toFixed(5)},${at.lon.toFixed(5)}` : "";
  return useQuery({
    queryKey: ["maps", "sight-range", where, aerial, station],
    queryFn: ({ signal }) =>
      api.get<SightRange>("/api/maps/sight-range", { at: where, aerial: String(aerial), station: String(station) }, signal),
    enabled: Boolean(at),
    // The answer changes only with the terrain installed, and installing it asks again.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export interface RepeaterRange {
  /** The switch and what it says, for the repeater's card; null for a repeater with no position. */
  control: ReactNode | null;
  /** Switches the range on and brings the outline into view once it is worked out: what a link from the repeater's page does. */
  show(): void;
}

export function useRepeaterRange({
  engine,
  repeater,
  onOpenOffline,
}: {
  engine: MapEngine | null;
  /** The repeater that is open on the map, or null when none is. */
  repeater: Placed | null;
  /** Opens the part of the map's panel where terrain is downloaded. */
  onOpenOffline?: () => void;
}): RepeaterRange {
  const [prefs, setPrefs] = useStoredState<RangePrefs>(RANGE_KEY, isRangePrefs, DEFAULT_RANGE_PREFS);
  const placed = repeater && repeater.lat !== null && repeater.lon !== null ? { lat: repeater.lat, lon: repeater.lon } : null;
  const aerial = aerialOf(repeater?.antennaMeters ?? null, prefs);
  // A height being typed is asked about once the typing stops.
  const aerialMeters = useDebounced(aerial.meters, 600);
  const station = stationOf(prefs.station);
  const asked = prefs.on && placed ? placed : null;
  const range = useSightRange(asked, aerialMeters, station.meters);
  const shown = asked ? range.data : undefined;

  useEffect(() => {
    engine?.setOverlay(RANGE_SOURCE, shown ? rangeData(shown) : EMPTY);
  }, [engine, shown]);
  useEffect(() => () => engine?.setOverlay(RANGE_SOURCE, EMPTY), [engine]);

  // Switched on by a person: once the outline is known, bring it into view, unless it is in view already. From a
  // link the map is still flying to the repeater, so whether it is in view now says nothing: it is always fitted.
  const fit = useRef<"no" | "if-out" | "always">("no");
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!engine || !shown || fit.current === "no") return;
    const always = fit.current === "always";
    fit.current = "no";
    const cover = cardCover(section.current);
    const [west, south, east, north] = rangeBounds(shown);
    const corners = [
      { lat: south, lon: west },
      { lat: north, lon: east },
    ];
    if (always || !corners.every((corner) => engine.isInView(corner, cover)))
      engine.fitBounds([west, south, east, north], { clearBottom: cover });
  }, [engine, shown]);

  const setOn = useCallback(
    (on: boolean, from: "switch" | "link" = "switch") => {
      fit.current = !on ? "no" : from === "link" ? "always" : "if-out";
      setPrefs((current) => ({ ...current, on }));
    },
    [setPrefs],
  );
  const show = useCallback(() => setOn(true, "link"), [setOn]);

  const control = placed ? (
    <RangeControl
      ref={section}
      prefs={prefs}
      onPrefs={setPrefs}
      onOn={(on) => setOn(on)}
      aerial={aerial}
      range={range}
      onOpenOffline={onOpenOffline}
    />
  ) : null;
  return { control, show };
}

const STATION_OPTIONS = RANGE_STATIONS.map((station) => ({ value: station.id, label: station.name }));

function RangeControl({
  ref,
  prefs,
  onPrefs,
  onOn,
  aerial,
  range,
  onOpenOffline,
}: {
  ref: Ref<HTMLElement>;
  prefs: RangePrefs;
  onPrefs: (next: (current: RangePrefs) => RangePrefs) => void;
  onOn: (on: boolean) => void;
  aerial: { meters: number; listed: boolean };
  range: ReturnType<typeof useSightRange>;
  onOpenOffline: (() => void) | undefined;
}) {
  const id = useId();
  const station = stationOf(prefs.station);
  const reading = range.data ? readRange(range.data) : null;
  const terrain = range.data ? describeRangeTerrain(range.data) : null;
  return (
    <section ref={ref} aria-label="Estimated range" className="mt-3 border-t border-border pt-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="text-small font-medium text-ink">
            Estimated range
          </label>
          <p className="text-small text-ink-muted">Where its aerial is in line of sight over the ground.</p>
        </div>
        <Switch id={id} checked={prefs.on} onCheckedChange={onOn} className="mt-0.5 max-md:my-[10px]" />
      </div>
      {prefs.on ? (
        <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)] gap-2.5">
          <div className="grid gap-1.5">
            <span className="text-small font-medium text-ink">The other station</span>
            <Segmented
              label="The other station"
              value={prefs.station}
              onChange={(next) => onPrefs((current) => ({ ...current, station: next }))}
              options={STATION_OPTIONS}
            />
          </div>
          {aerial.listed ? null : (
            <div className="max-w-44">
              <NumberField
                label="Repeater aerial"
                value={prefs.assumedAerial}
                min={0}
                max={RANGE_MAX_HEIGHT_METERS}
                unit="m"
                onChange={(assumedAerial) => onPrefs((current) => ({ ...current, assumedAerial }))}
              />
            </div>
          )}
          <p className="tabular text-small text-ink-muted">
            Repeater aerial {formatHeight(aerial.meters)} above the ground,{" "}
            {aerial.listed ? "as listed" : "assumed: its list gives no height"}. {station.name} {formatHeight(station.meters)}:{" "}
            {station.about}. Out to {formatReach(RANGE_MAX_METERS)}.
          </p>

          <div aria-live="polite">
            {range.isPending ? (
              <p className="flex items-center gap-2 text-small text-ink-muted">
                <Spinner label="Working out the range" /> Working out the range from the terrain
              </p>
            ) : range.isError ? (
              <Notice
                tone="danger"
                icon={<CircleAlert />}
                title="The range could not be worked out"
                action={
                  <Button size="sm" variant="ghost" onClick={() => range.refetch()}>
                    Try again
                  </Button>
                }
              >
                {errorMessage(range.error)}
              </Notice>
            ) : reading ? (
              <div className="grid gap-1 text-small">
                <p className="font-medium text-ink">{reading.title}</p>
                {reading.sentences.map((sentence) => (
                  <p key={sentence} className="text-ink-muted">
                    {sentence}
                  </p>
                ))}
                {reading.needsTerrain && onOpenOffline ? (
                  <div className="mt-1.5">
                    <Button size="sm" onClick={onOpenOffline}>
                      Offline maps
                    </Button>
                    <p className="mt-1 text-small text-ink-muted">Terrain comes with a map region, under Offline maps.</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <details className="group">
            <summary className="flex min-h-11 cursor-default items-center gap-2 py-1 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
              What this is, and is not
            </summary>
            <div className="grid gap-1.5 pb-1 pl-6 text-small text-ink-muted">
              <p>
                An estimate of line of sight only: on each of {RANGE_BEARINGS} bearings, how far out a station at the height above stays in
                sight of the repeater's aerial over the ground, on an Earth of 4/3 radius, as the line-of-sight check uses.
              </p>
              <p>
                It takes no account of transmitter power, aerial gain or pattern, frequency, buildings and trees, or signals bending over
                ridges. A repeater may be heard beyond the outline and not heard inside it.
              </p>
              <p>
                Each bearing ends where the aerial has been out of sight for more than 1 km, so a small hollow does not end it. A dashed
                edge is where terrain ran out, or where none is held: there the shape is not from the ground.
              </p>
              <p>
                With no terrain the circle is the smooth-Earth radio horizon, about 4.12 × (√h1 + √h2) km for heights in metres above the
                ground around them.
              </p>
              {terrain ? <p>{terrain}</p> : null}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
