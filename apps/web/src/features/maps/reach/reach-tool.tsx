/**
 * "Reachable from here": the areas reachable in 15, 30 or 60 minutes from a point, by car,
 * bicycle or on foot, from the menu a long press or a right-click opens and from the quick
 * search. Drawn as three steps of one hue with an outline of its own for each time, said in
 * a card with a legend, the source ("Streets", or "Main roads only" where the optional
 * streets service is not installed) and "Free-flowing traffic, no stops". Printed with the
 * map (print/overlays.ts).
 *
 * The server works it out (`POST /api/streets/reach`): over every street where streets are
 * built, else over Outpost's own main roads for a drive, which every installation with a
 * road network can do.
 */
import type { RoadCoverageCountry, StreetsReachMode, StreetsReachRequest, StreetsStatusResponse } from "@outpost/shared";
import { CircleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Segmented, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useStoredState } from "../hooks";
import type { LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { MapCard } from "../map-chrome";
import { useRoadCoverage } from "../road-route/data";
import { AddRoadsButton, CountryProgress, progressText } from "../road-route/route-needs";
import { addStreetsLabel, reachTimeText, streetsMissFor, unavailableLine } from "../road-route/street-words";
import { useStreetsReach, useStreetsStatus } from "../road-route/streets-data";
import { REACH_DASHES, REACH_FILL_OPACITY, REACH_SOURCE, reachBounds, reachData, setReachShown } from "./reach-map";

const PREFS_KEY = "outpost.maps.reach";
const TIMES = [15, 30, 60] as const;
type ReachTime = (typeof TIMES)[number];

interface ReachPrefs {
  mode: StreetsReachMode;
  minutes: ReachTime;
}

const isPrefs = (value: unknown): value is ReachPrefs =>
  typeof value === "object" &&
  value !== null &&
  ["drive", "walk", "cycle"].includes((value as ReachPrefs).mode) &&
  (TIMES as readonly number[]).includes((value as ReachPrefs).minutes);

export const REACH_MODES: Array<{ value: StreetsReachMode; label: string }> = [
  { value: "drive", label: "Drive" },
  { value: "cycle", label: "Cycle" },
  { value: "walk", label: "Walk" },
];
const TIME_OPTIONS = TIMES.map((minutes) => ({ value: String(minutes), label: reachTimeText(minutes) }));

/** Each time up to the one chosen: 30 minutes draws 15 and 30, an hour all three. */
export const timesUpTo = (minutes: number) => TIMES.filter((each) => each <= minutes);

/** Whether this way can be drawn here now. */
export function reachAvailable(status: StreetsStatusResponse | undefined, mode: StreetsReachMode): boolean {
  if (!status) return false;
  return mode === "drive" ? status.modes.reach.drive !== null : status.modes.reach[mode];
}

/** A small picture of one step: its share of the hue, and its outline. */
export function ReachSwatch({ minutes, steps }: { minutes: number; steps: number }) {
  const dash = REACH_DASHES[minutes];
  // The nested areas lie one over another: the shortest time is covered `steps` times.
  const opacity = 1 - (1 - REACH_FILL_OPACITY) ** steps;
  return (
    <svg aria-hidden width="28" height="18" viewBox="0 0 28 18" className="shrink-0">
      <rect x="1" y="1" width="26" height="16" rx="2" fill="var(--map-walk)" fillOpacity={opacity} />
      <rect
        x="1"
        y="1"
        width="26"
        height="16"
        rx="2"
        fill="none"
        stroke="var(--map-walk)"
        strokeWidth="2"
        strokeDasharray={dash ? dash.map((each) => each * 2).join(" ") : undefined}
      />
    </svg>
  );
}

/** "France has no roads yet. [Add roads for France]", for the point's own country. */
function NoRoadsHere({ country, onAdd }: { country: RoadCoverageCountry | null; onAdd: (countries?: readonly string[]) => void }) {
  const text = !country
    ? "A drive's reach is worked out from the roads kept for routes, and none are kept for here yet."
    : country.state === "part"
      ? `Only part of ${country.name} has roads, and this point is outside it.`
      : `${country.name} has no roads yet.`;
  return (
    <div className="grid justify-items-start gap-2">
      <p className="text-small text-ink">{text}</p>
      {country?.progress?.phase === "failed" ? (
        <p className="text-small text-ink-muted">
          {country.name}: {progressText(country.progress)}.
        </p>
      ) : null}
      {country ? (
        <AddRoadsButton countries={[country]} onAdd={(codes) => onAdd(codes)} size="sm" all={country.state === "part"} />
      ) : (
        <Button size="sm" variant="primary" onClick={() => onAdd([])}>
          Add roads for routes
        </Button>
      )}
    </div>
  );
}

export interface ReachTool {
  start(position: LatLon, name?: string | null): void;
  stop(): void;
  card: ReactNode | null;
}

export function useReach({
  engine,
  where,
  onOpenStreets,
  onOpenNetworks,
}: {
  engine: MapEngine | null;
  /** The point's coordinates in the readout's format, for the card. */
  where: (position: LatLon) => string;
  onOpenStreets: (country?: string | null) => void;
  /** Opens Map data's add flow with roads for routes for these countries (two letters each). */
  onOpenNetworks: (countries?: readonly string[]) => void;
}): ReachTool {
  const [at, setAt] = useState<{ position: LatLon; name: string | null } | null>(null);
  const [prefs, setPrefs] = useStoredState<ReachPrefs>(PREFS_KEY, isPrefs, { mode: "drive", minutes: 30 });
  const status = useStreetsStatus();
  const installed = status.data?.installed ?? false;
  // Without the streets service only a drive can be drawn, whatever was chosen elsewhere.
  const mode: StreetsReachMode = installed ? prefs.mode : "drive";
  // The point's country and where its roads stand, worked out on this device: what to offer is for there, never home.
  const coverage = useRoadCoverage(at ? [at.position] : []);
  const here = at ? (coverage.data?.countries[0] ?? null) : null;
  const country = here ? { code: here.code, name: here.name } : null;
  const roadsHere =
    mode === "drive" && here && here.state !== "ready" ? (
      here.state === "downloading" ? (
        <div className="grid gap-2" role="status">
          <CountryProgress country={here} />
          <p className="text-small text-ink-muted">You can leave this screen.</p>
        </div>
      ) : (
        <NoRoadsHere country={here} onAdd={onOpenNetworks} />
      )
    ) : null;
  const available =
    !(at && coverage.isPending) &&
    reachAvailable(status.data, mode) &&
    roadsHere === null &&
    !(mode !== "drive" && streetsMissFor(status.data, country));
  const request = useMemo<StreetsReachRequest | null>(
    () =>
      at && available
        ? {
            point: { lat: at.position.lat, lon: at.position.lon, ...(at.name ? { name: at.name } : {}) },
            mode,
            minutes: timesUpTo(prefs.minutes),
          }
        : null,
    [at, available, mode, prefs.minutes],
  );
  const reach = useStreetsReach(request);
  const shown = at && request ? reach.data : undefined;

  // On the map while the card is open, and kept for the print overlays.
  useEffect(() => {
    engine?.setOverlay(REACH_SOURCE, shown ? reachData(shown) : EMPTY);
    setReachShown(shown ?? null);
  }, [engine, shown]);
  useEffect(
    () => () => {
      engine?.setOverlay(REACH_SOURCE, EMPTY);
      setReachShown(null);
    },
    [engine],
  );

  // Once known, the largest area is brought into view, clear of the card.
  const card = useRef<HTMLDivElement>(null);
  const fitted = useRef<number | null>(null);
  useEffect(() => {
    if (!engine || !shown || fitted.current === shown.madeAt) return;
    fitted.current = shown.madeAt;
    const clearBottom = (card.current?.closest(".outpost-map-card")?.getBoundingClientRect().height ?? 0) + 16;
    engine.fitBounds(reachBounds(shown), { clearBottom, maxZoom: 14 });
  }, [engine, shown]);

  const stop = () => {
    setAt(null);
    fitted.current = null;
  };

  const notHere = () => {
    if (!status.data) return null;
    // Cycling and walking need streets; a drive needs streets or roads for the point's country.
    if (mode !== "drive") {
      const { text, action } = unavailableLine(status.data, { way: mode === "walk" ? "reach-walk" : "reach-cycle", country });
      return (
        <div className="grid justify-items-start gap-2">
          <p className="text-small text-ink">{text}</p>
          {action === "add" ? (
            <Button size="sm" variant="primary" onClick={() => onOpenStreets(country?.code)}>
              {addStreetsLabel(country)}
            </Button>
          ) : action === "progress" ? (
            <Button size="sm" onClick={() => onOpenStreets()}>
              See its progress
            </Button>
          ) : null}
        </div>
      );
    }
    return roadsHere ?? <NoRoadsHere country={null} onAdd={onOpenNetworks} />;
  };

  const content = at ? (
    <MapCard title="Reachable from here" onClose={stop} closeLabel="Stop showing what is reachable">
      <div ref={card} className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-2.5" data-testid="reach-card">
        <p className="tabular text-small text-ink-muted">From {at.name ?? where(at.position)}</p>
        {installed ? (
          <Segmented<StreetsReachMode>
            label="Way of travelling"
            value={mode}
            onChange={(next) => setPrefs((current) => ({ ...current, mode: next }))}
            options={REACH_MODES}
          />
        ) : null}
        <Segmented
          label="Time"
          value={String(prefs.minutes)}
          onChange={(next) => setPrefs((current) => ({ ...current, minutes: Number(next) as ReachTime }))}
          options={TIME_OPTIONS}
        />
        <div aria-live="polite">
          {status.isPending || (at && coverage.isPending) || (request && reach.isPending) ? (
            <p className="flex items-center gap-2 text-small text-ink-muted">
              <Spinner label="Working out the areas" delay /> Working out what is reachable
            </p>
          ) : status.isError ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Could not tell what can be drawn">
              {errorMessage(status.error)}
            </Notice>
          ) : !available ? (
            notHere()
          ) : reach.isError ? (
            <Notice
              tone="danger"
              icon={<CircleAlert />}
              title="The areas could not be worked out"
              action={
                <Button size="sm" variant="ghost" onClick={() => reach.refetch()}>
                  Try again
                </Button>
              }
            >
              {errorMessage(reach.error)}
            </Notice>
          ) : shown ? (
            <div className="grid gap-2">
              <ul aria-label="Legend" className="grid gap-1.5">
                {shown.areas.features.map((feature, index, all) => (
                  <li key={feature.properties.minutes} className="flex items-center gap-2.5 text-small text-ink">
                    <ReachSwatch minutes={feature.properties.minutes} steps={all.length - index} />
                    Within {reachTimeText(feature.properties.minutes)}
                  </li>
                ))}
              </ul>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
                <Badge>{shown.label}</Badge>
                {shown.note}
              </p>
              <p className="text-micro text-ink-muted">{shown.credit}</p>
            </div>
          ) : null}
        </div>
      </div>
    </MapCard>
  ) : null;

  return {
    start(position, name = null) {
      fitted.current = null;
      setAt({ position, name });
    },
    stop,
    card: content,
  };
}
