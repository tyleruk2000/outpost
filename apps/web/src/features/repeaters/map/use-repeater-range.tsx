/**
 * Estimated ranges on the map: a switch in each repeater's card, the heights they are
 * worked out with, the outlines on the map and what they mean.
 *
 * The switch belongs to the repeater. Each repeater switched on keeps its outline on
 * the map after its card is closed, until it is switched off in its card or all are
 * hidden; up to RANGE_MOST at once, remembered on this device. While none is chosen, or
 * the map's repeaters are switched off, nothing is asked of the server and nothing is
 * drawn. Each chosen repeater is asked about once for each pair of heights and installed
 * terrain (the query's key starts with "maps", so installing or removing terrain asks
 * again), each outline drawn as its answer comes; moving or zooming the map asks nothing.
 */
import {
  RANGE_BEARINGS,
  RANGE_MAX_HEIGHT_METERS,
  RANGE_MAX_METERS,
  RANGE_STATIONS,
  type RepeaterDetailResponse,
  type RepeaterDto,
  type SightRange,
} from "@outpost/shared";
import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp, CircleAlert, X } from "lucide-react";
import { type ReactNode, type Ref, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented, Spinner, Switch } from "@/components/ui/misc";
import { useShadeColour, useStoredState } from "@/features/maps/hooks";
import { readStored } from "@/features/maps/lib/view";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY } from "@/features/maps/map/overlays";
import { canShade } from "@/features/maps/map/shades";
import { useShades } from "@/features/maps/map/use-shades";
import { RangeWhy } from "@/features/maps/radio/range-why";
import { NumberField } from "@/features/maps/radio/sight-panel";
import { mapCard } from "@/features/maps/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { repeaterQuery } from "../data";
import {
  aerialOf,
  describeRangeTerrain,
  formatHeight,
  formatReach,
  isRangePrefs,
  migrateRangePrefs,
  RANGE_ACCURACY,
  RANGE_KEY,
  RANGE_MOST,
  RANGE_SHADE_OPACITY,
  RANGE_SOURCE,
  type RangePrefs,
  rangeFitBounds,
  rangeShade,
  rangesData,
  readRange,
  setRangesShown,
  stationOf,
} from "./range";
import { RangeKey } from "./range-key";

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

function sightRangeQuery(at: { lat: number; lon: number } | null, aerial: number, station: number) {
  const where = at ? `${at.lat.toFixed(5)},${at.lon.toFixed(5)}` : "";
  return {
    queryKey: ["maps", "sight-range", where, aerial, station],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.get<SightRange>("/api/maps/sight-range", { at: where, aerial: String(aerial), station: String(station) }, signal),
    enabled: Boolean(at),
    // The answer changes only with the terrain installed, and installing it asks again.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  };
}

export function useSightRange(at: { lat: number; lon: number } | null, aerial: number, station: number) {
  return useQuery(sightRangeQuery(at, aerial, station));
}

// Kept outside the hook: with a stable `combine`, each list keeps its identity until an answer changes, so the
// outlines are not drawn again on every render.
const chosenRepeaters = (results: Array<UseQueryResult<RepeaterDetailResponse>>) =>
  results.map((result) => ({
    repeater: result.data?.repeater,
    // Its list was removed, or it was: the range is dropped quietly.
    gone: result.error instanceof ApiError && result.error.status === 404,
  }));
const outlinesOf = (results: Array<UseQueryResult<SightRange>>) => results.map((result) => result.data);

const isPlaced = (repeater: Placed | undefined): repeater is Placed & { lat: number; lon: number } =>
  Boolean(repeater && repeater.lat !== null && repeater.lon !== null);

/** What is stored, read once and made into the present shape (see migrateRangePrefs). */
const storedPrefs = () => migrateRangePrefs(readStored(RANGE_KEY, (value: unknown): value is unknown => true, null));

export interface RepeaterRange {
  /** The switch and what it says, for the repeater's card; null for a repeater with no position. */
  control: ReactNode | null;
  /** A button for the card's header that folds the card to one line, while its range is on. */
  foldButton: ReactNode | null;
  /** The card folded to one line (callsign, the answer in a few words, the switch), or null when it is not folded. */
  folded: ReactNode | null;
  /** Classes for the repeater's card: while its range is on, on a wide screen, it scrolls inside a greatest height rather than growing over the map. */
  cardClass: string | undefined;
  /** Switches this repeater's range on and brings its outline into view once it is worked out: what a link from the repeater's page does. */
  show(id: string): void;
}

export function useRepeaterRange({
  engine,
  visible,
  repeater,
  onOpenOffline,
  onClose,
  extra,
}: {
  /** One more outline drawn with the repeaters', whether or not they are switched on: a point's range (maps/radio/point-range.tsx). */
  extra?: { range: SightRange; name: string } | null;
  engine: MapEngine | null;
  /** The map's repeaters are switched on: the chosen ranges are drawn only then, as the dots are. */
  visible: boolean;
  /** The repeater that is open on the map, or null when none is. */
  repeater: Placed | null;
  /** Opens the part of the map's panel where terrain is downloaded. */
  onOpenOffline?: () => void;
  /** Closes the repeater's card. */
  onClose?: () => void;
}): RepeaterRange {
  const [initial] = useState(storedPrefs);
  const [prefs, setPrefs] = useStoredState<RangePrefs>(RANGE_KEY, isRangePrefs, initial);
  const [folded, setFolded] = useState(false);
  // The repeater whose switch was pressed with RANGE_MOST already shown: its card says so.
  const [full, setFull] = useState<string | null>(null);
  // A height being typed is asked about once the typing stops.
  const assumed = useDebounced(prefs.assumedAerial, 600);
  const station = stationOf(prefs.station);

  // Every chosen repeater: where it is from its own record (the one its card shows), then its outline.
  const chosen = useQueries({ queries: (visible ? prefs.chosen : []).map(repeaterQuery), combine: chosenRepeaters });
  const placedChosen = chosen.flatMap(({ repeater: one }) => (isPlaced(one) ? [one] : []));
  const outlines = useQueries({
    queries: placedChosen.map((one) => sightRangeQuery(one, one.antennaMeters ?? assumed, station.meters)),
    combine: outlinesOf,
  });
  const names = placedChosen.map((one) => one.callsign).join("\n");
  const drawn = useMemo(() => {
    const callsigns = names.split("\n");
    const repeaters = outlines.flatMap((range, index) => (range ? [{ range, name: callsigns[index] ?? "" }] : []));
    return extra ? [...repeaters, extra] : repeaters;
  }, [outlines, names, extra]);
  useEffect(() => {
    engine?.setOverlay(RANGE_SOURCE, drawn.length > 0 ? rangesData(drawn) : EMPTY);
    setRangesShown(engine ? drawn : []);
  }, [engine, drawn]);
  useEffect(
    () => () => {
      engine?.setOverlay(RANGE_SOURCE, EMPTY);
      setRangesShown([]);
    },
    [engine],
  );
  // The ground in sight, one picture for each range, painted once for each answer and theme.
  const colour = useShadeColour("range");
  const pictures = useMemo(
    () => (engine && canShade() ? drawn.flatMap(({ range: one }) => rangeShade(one, colour, drawn.length > 2 ? 1024 : 1536) ?? []) : []),
    [engine, drawn, colour],
  );
  useShades(engine, "range", pictures, RANGE_SHADE_OPACITY);

  // A repeater that is no longer held, or no longer has a position, is dropped from the chosen.
  const dropped = prefs.chosen.filter((_, index) => {
    const one = visible ? chosen[index] : undefined;
    return Boolean(one && (one.gone || (one.repeater && !isPlaced(one.repeater))));
  });
  const droppedKey = dropped.join(",");
  useEffect(() => {
    if (!droppedKey) return;
    const gone = new Set(droppedKey.split(","));
    setPrefs((current) => ({ ...current, chosen: current.chosen.filter((id) => !gone.has(id)) }));
  }, [droppedKey, setPrefs]);

  // The open repeater: its own switch, and its outline's answer for the card (the same request as the one drawn).
  const placed = isPlaced(repeater ?? undefined) ? { lat: repeater!.lat!, lon: repeater!.lon! } : null;
  const aerial = aerialOf(repeater?.antennaMeters ?? null, prefs);
  const id = repeater?.id;
  const on = Boolean(id && prefs.chosen.includes(id));
  const range = useSightRange(on && visible ? placed : null, repeater?.antennaMeters ?? assumed, station.meters);
  const shown = on ? range.data : undefined;

  // Switched on: once the outline is known the card folds to one line, so that there is room to see it, and that
  // outline (not the others) is brought into the part of the map the card leaves clear.
  const pending = useRef<string | null>(null);
  const card = useRef<HTMLElement | null>(null);
  const fitting = useRef<number | undefined>(undefined);
  // Another repeater opened, or none: its card starts open out, with nothing said of the limit.
  const [opened, setOpened] = useState(id);
  if (opened !== id) {
    setOpened(id);
    setFolded(false);
    setFull(null);
  }
  useEffect(() => {
    if (!engine || !shown || !id || pending.current !== id) return;
    if (!folded) {
      setFolded(true);
      return;
    }
    pending.current = null;
    // Once the folded card and the readout under it have settled (the line of sun times gives way to the card, and
    // the camera's room follows in 200 ms), so that the outline is fitted into the room there is, not the room there was.
    const bounds = rangeFitBounds(shown);
    window.clearTimeout(fitting.current);
    fitting.current = window.setTimeout(() => engine.fitBounds(bounds, cardClearance(card.current)), 260);
  }, [engine, shown, folded, id]);
  useEffect(() => () => window.clearTimeout(fitting.current), []);

  const latest = useRef(prefs.chosen);
  latest.current = prefs.chosen;
  const choose = useCallback(
    (which: string, next: boolean) => {
      const now = latest.current;
      if (next && !now.includes(which) && now.length >= RANGE_MOST) {
        setFull(which);
        return;
      }
      setFull(null);
      pending.current = next ? which : null;
      if (!next) setFolded(false);
      setPrefs((current) => ({
        ...current,
        chosen: next ? [...current.chosen.filter((one) => one !== which), which] : current.chosen.filter((one) => one !== which),
      }));
    },
    [setPrefs],
  );
  const setOn = useCallback((next: boolean) => (id ? choose(id, next) : undefined), [choose, id]);
  const show = useCallback((which: string) => choose(which, true), [choose]);
  const hideAll = useCallback(() => {
    setFull(null);
    setFolded(false);
    pending.current = null;
    setPrefs((current) => ({ ...current, chosen: [] }));
  }, [setPrefs]);
  const keep = useCallback((element: HTMLElement | null) => {
    if (element) card.current = element;
  }, []);

  const reading = range.data ? readRange(range.data) : null;
  const control = placed ? (
    <RangeControl
      ref={keep}
      on={on}
      count={visible ? prefs.chosen.length : 0}
      full={full !== null && full === id}
      onHideAll={hideAll}
      prefs={prefs}
      onPrefs={setPrefs}
      onOn={setOn}
      aerial={aerial}
      range={range}
      onOpenOffline={onOpenOffline}
    />
  ) : null;
  const foldButton =
    placed && on ? (
      <Button variant="ghost" size="icon-sm" aria-label="Show less" aria-expanded onClick={() => setFolded(true)} className="-mt-1">
        <ChevronDown />
      </Button>
    ) : null;
  const short = range.isPending ? "Working out the range" : range.isError ? "The range could not be worked out" : (reading?.short ?? "");
  const foldedCard =
    placed && on && folded && repeater ? (
      // Two short lines: the callsign with the switch and the buttons, then the answer in a few words. Kept that
      // small so that it fits in the room a phone gives a card even with large text, and leaves the map clear.
      <section ref={keep} aria-label={`${repeater.callsign}: estimated range`} className={cn(mapCard, "py-1.5")}>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-body font-semibold text-ink">{repeater.callsign}</h2>
          <Switch aria-label="Estimated range" checked={on} onCheckedChange={setOn} className="max-md:my-[10px]" />
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
  const cardClass = placed && on ? "md:max-h-[min(40rem,80vh)] md:overflow-y-auto md:overscroll-contain" : undefined;
  return { control, foldButton, folded: foldedCard, cardClass, show };
}

const STATION_OPTIONS = RANGE_STATIONS.map((station) => ({ value: station.id, label: station.name }));

function RangeControl({
  ref,
  on,
  count,
  full,
  onHideAll,
  prefs,
  onPrefs,
  onOn,
  aerial,
  range,
  onOpenOffline,
}: {
  ref: Ref<HTMLElement | null> | ((element: HTMLElement | null) => void);
  /** This repeater's range is shown. */
  on: boolean;
  /** How many ranges are shown, this one among them or not. */
  count: number;
  /** This one was switched on with as many shown as there can be. */
  full: boolean;
  onHideAll: () => void;
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
        <Switch id={id} checked={on} onCheckedChange={onOn} className="max-md:my-[10px]" />
      </div>
      {full || count > 1 ? (
        // One line of words with the way out written into it, as "Get terrain in Offline maps" is, so that it adds
        // little to the card's height.
        <p role="status" className="mt-0.5 text-small text-ink-muted">
          {full
            ? `${RANGE_MOST} ranges are shown, as many as can be at once. Switch one off in its card, or hide them all, to show this one.`
            : `${count} ranges are shown on the map.`}{" "}
          <button
            type="button"
            onClick={onHideAll}
            className="font-medium text-primary underline underline-offset-2 hover:no-underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
          >
            Hide all ranges
          </button>
        </p>
      ) : null}
      {on ? (
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
                {reading.furthest ? <p className="text-ink">{reading.furthest}</p> : null}
                {reading.typicalMeans ? <p className="text-ink-muted">{reading.typicalMeans}</p> : null}
                {range.data && range.data.coverage !== "none" ? <RangeKey typical={Boolean(reading.typicalMeans)} /> : null}
                {reading.note ? (
                  <p className="text-ink-muted">
                    {reading.note}{" "}
                    {onOpenOffline && reading.needsTerrain ? (
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
                An estimate of line of sight only: along {RANGE_BEARINGS} bearings, which ground a station at the height above would be in
                sight of the repeater's aerial from, on an Earth of 4/3 radius, as the line-of-sight check uses.
              </p>
              <p>
                It takes no account of transmitter power, aerial gain or pattern, frequency, buildings and trees, or signals bending over
                ridges. A repeater may be heard from ground left clear and not heard from shaded ground.
              </p>
              <p>
                The shaded ground is in sight of the aerial; ground left clear is hidden by nearer ground, or too far. The grey rings are
                10, 25, 50 and 100 km from the aerial, drawn out to the first beyond the furthest ground in sight. The dashed circle is the
                typical range: half the directions round the aerial reach further, half not as far.
              </p>
              <p>
                With no terrain the dashed circle is the smooth-Earth radio horizon, about 4.12 × (√h1 + √h2) km for heights in metres above
                the ground around them.
              </p>
              {terrain ? <p>{terrain}</p> : null}
              {range.data && range.data.coverage !== "none" ? <p>{RANGE_ACCURACY}</p> : null}
            </div>
          </details>
          {range.data && range.data.coverage !== "none" ? (
            <details className="group/why">
              <summary className="flex min-h-11 cursor-default items-center gap-2 py-1 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open/why:rotate-90" />
                Why this shape: look along one direction
              </summary>
              <div className="pb-1">
                <RangeWhy range={range.data} aerialName="the repeater" />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
