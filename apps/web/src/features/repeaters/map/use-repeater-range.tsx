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
import { ChevronDown, ChevronRight, ChevronUp, CircleAlert, X } from "lucide-react";
import { type ReactNode, type Ref, useCallback, useEffect, useId, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented, Spinner, Switch } from "@/components/ui/misc";
import { useStoredState } from "@/features/maps/hooks";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY } from "@/features/maps/map/overlays";
import { NumberField } from "@/features/maps/radio/sight-panel";
import { mapCard } from "@/features/maps/ui";
import { api, errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
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
 * The part of the map the repeater's card leaves clear, measured: on a phone the card
 * spans the width of the map at its foot, on a wide screen it stands at the top right
 * beside the map's tools. Of the room above the card, below it and beside it, the
 * largest is the room the outline is fitted into.
 */
function cardClearance(inside: Element | null): { keepClear?: { top?: number; right?: number; bottom?: number } } {
  const card = inside?.closest(".outpost-map-card")?.getBoundingClientRect();
  const map = document.querySelector(".outpost-map")?.getBoundingClientRect();
  if (!card || !map) return {};
  const above = { bottom: Math.max(0, map.bottom - card.top + 8) };
  const below = { top: Math.max(0, card.bottom - map.top + 8) };
  const beside = { right: Math.max(0, map.right - card.left + 8) };
  const room = [
    { keep: above, area: map.width * (card.top - map.top) },
    { keep: below, area: map.width * (map.bottom - card.bottom) },
    { keep: beside, area: (card.left - map.left) * map.height },
  ];
  return { keepClear: room.reduce((best, next) => (next.area > best.area ? next : best)).keep };
}

type Placed = Pick<RepeaterDto, "id" | "callsign" | "lat" | "lon" | "antennaMeters">;

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
  /** A button for the card's header that folds the card to one line, while the range is on. */
  foldButton: ReactNode | null;
  /** The card folded to one line (callsign, the answer in a few words, the switch), or null when it is not folded. */
  folded: ReactNode | null;
  /** Classes for the repeater's card: while the range is on, on a wide screen, it scrolls inside a greatest height rather than growing over the map. */
  cardClass: string | undefined;
  /** Switches the range on and brings the outline into view once it is worked out: what a link from the repeater's page does. */
  show(): void;
}

export function useRepeaterRange({
  engine,
  repeater,
  onOpenOffline,
  onClose,
}: {
  engine: MapEngine | null;
  /** The repeater that is open on the map, or null when none is. */
  repeater: Placed | null;
  /** Opens the part of the map's panel where terrain is downloaded. */
  onOpenOffline?: () => void;
  /** Closes the repeater's card. */
  onClose?: () => void;
}): RepeaterRange {
  const [prefs, setPrefs] = useStoredState<RangePrefs>(RANGE_KEY, isRangePrefs, DEFAULT_RANGE_PREFS);
  const [folded, setFolded] = useState(false);
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

  // Switched on, or another repeater opened with it on: once the outline is known the card folds to one line, so
  // that there is room to see it, and the outline is brought into the part of the map the card leaves clear.
  const pending = useRef(false);
  const card = useRef<HTMLElement | null>(null);
  const id = repeater?.id;
  useEffect(() => {
    if (id && prefs.on) pending.current = true;
    if (!id) setFolded(false);
  }, [id, prefs.on]);
  useEffect(() => {
    if (!engine || !shown || !pending.current) return;
    if (!folded) {
      setFolded(true);
      return;
    }
    pending.current = false;
    engine.fitBounds(rangeBounds(shown), cardClearance(card.current));
  }, [engine, shown, folded]);

  const setOn = useCallback(
    (on: boolean) => {
      pending.current = on;
      if (!on) setFolded(false);
      setPrefs((current) => ({ ...current, on }));
    },
    [setPrefs],
  );
  const show = useCallback(() => setOn(true), [setOn]);
  const keep = useCallback((element: HTMLElement | null) => {
    if (element) card.current = element;
  }, []);

  const reading = range.data ? readRange(range.data) : null;
  const control = placed ? (
    <RangeControl ref={keep} prefs={prefs} onPrefs={setPrefs} onOn={setOn} aerial={aerial} range={range} onOpenOffline={onOpenOffline} />
  ) : null;
  const foldButton =
    placed && prefs.on ? (
      <Button variant="ghost" size="icon-sm" aria-label="Show less" aria-expanded onClick={() => setFolded(true)} className="-mt-1">
        <ChevronDown />
      </Button>
    ) : null;
  const short = range.isPending ? "Working out the range" : range.isError ? "The range could not be worked out" : (reading?.short ?? "");
  const foldedCard =
    placed && prefs.on && folded && repeater ? (
      // Two short lines: the callsign with the switch and the buttons, then the answer in a few words. Kept that
      // small so that it fits in the room a phone gives a card even with large text, and leaves the map clear.
      <section ref={keep} aria-label={`${repeater.callsign}: estimated range`} className={cn(mapCard, "py-1.5")}>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-body font-semibold text-ink">{repeater.callsign}</h2>
          <Switch aria-label="Estimated range" checked={prefs.on} onCheckedChange={setOn} className="max-md:my-[10px]" />
          <Button variant="ghost" size="icon-sm" aria-label="Show the details" aria-expanded={false} onClick={() => setFolded(false)}>
            <ChevronUp />
          </Button>
          {onClose ? (
            <Button variant="ghost" size="icon-sm" aria-label="Close this repeater" onClick={onClose} className="-mr-1.5">
              <X />
            </Button>
          ) : null}
        </div>
        <p className="tabular text-small text-ink-muted">{short}</p>
      </section>
    ) : null;
  const cardClass = placed && prefs.on ? "md:max-h-[min(40rem,80vh)] md:overflow-y-auto md:overscroll-contain" : undefined;
  return { control, foldButton, folded: foldedCard, cardClass, show };
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
  ref: Ref<HTMLElement | null> | ((element: HTMLElement | null) => void);
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
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="min-w-0 flex-1 text-small font-medium text-ink">
          Estimated range
        </label>
        <Switch id={id} checked={prefs.on} onCheckedChange={onOn} className="max-md:my-[10px]" />
      </div>
      {prefs.on ? (
        <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)] gap-2.5">
          <Segmented
            label="The other station"
            value={prefs.station}
            onChange={(next) => onPrefs((current) => ({ ...current, station: next }))}
            options={STATION_OPTIONS}
          />
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
            Line of sight only. Repeater aerial {formatHeight(aerial.meters)} above the ground,{" "}
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
                {reading.note ? (
                  <p className="text-ink-muted">
                    {reading.note}{" "}
                    {onOpenOffline ? (
                      <button
                        type="button"
                        onClick={onOpenOffline}
                        className="font-medium text-primary underline underline-offset-2 hover:no-underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
                      >
                        Get terrain in Offline maps
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <details className="group">
            <summary className="flex min-h-11 cursor-default items-center gap-2 py-1 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
              What this is, and is not
            </summary>
            {/* The long account scrolls inside the card rather than growing it over the map. */}
            <div className="scroll-quiet grid max-h-56 gap-1.5 overflow-y-auto pb-1 pl-6 text-small text-ink-muted">
              {reading?.sentences.map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
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
