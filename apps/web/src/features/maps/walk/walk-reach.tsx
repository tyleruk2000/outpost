/**
 * "How far can I walk from here": the ground reachable on foot from a point in a set time, from the menu a long
 * press or a right-click opens. Shaded on the map by the hour with a ring at each, and said in a card with the time,
 * the pace and what the estimate rests on. For planning a way home or a place to meet.
 *
 * The server works it out from installed terrain and the installed map's paths (`GET /api/maps/walk-reach`); see
 * `walk-reach.ts` in the shared package for the pace rule.
 */
import { WALK_MINUTES, WALK_PACES, type WalkMinutes, type WalkPaceId, type WalkReach } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CircleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented, Spinner } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useShadeColour, useStoredState } from "../hooks";
import { formatDistance, formatHeight, type LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { canShade } from "../map/shades";
import { useShades } from "../map/use-shades";
import { MapCard } from "../map-chrome";
import { formatWalkTime, WALK_SHADE_OPACITY, WALK_SOURCE, walkBounds, walkData, walkGrid, walkShade } from "./walk-map";

const PREFS_KEY = "outpost.maps.walk";

interface WalkPrefs {
  minutes: WalkMinutes;
  pace: WalkPaceId;
}

const isPrefs = (value: unknown): value is WalkPrefs =>
  typeof value === "object" &&
  value !== null &&
  (WALK_MINUTES as readonly number[]).includes((value as WalkPrefs).minutes) &&
  WALK_PACES.some((pace) => pace.id === (value as WalkPrefs).pace);

const TIME_OPTIONS = WALK_MINUTES.map((minutes) => ({ value: String(minutes), label: formatWalkTime(minutes) }));
const PACE_OPTIONS = WALK_PACES.map((pace) => ({ value: pace.id, label: pace.name }));

export interface WalkReachTool {
  start(position: LatLon): void;
  stop(): void;
  card: ReactNode | null;
}

export function useWalkReach({
  engine,
  where,
  onOpenOffline,
}: {
  engine: MapEngine | null;
  /** The point's coordinates in the readout's format, for the card. */
  where: (position: LatLon) => string;
  onOpenOffline?: () => void;
}): WalkReachTool {
  const [at, setAt] = useState<LatLon | null>(null);
  const [details, setDetails] = useState(false);
  const [prefs, setPrefs] = useStoredState<WalkPrefs>(PREFS_KEY, isPrefs, { minutes: 60, pace: "standard" });
  const where_ = at ? `${at.lat.toFixed(5)},${at.lon.toFixed(5)}` : "";
  const reach = useQuery({
    queryKey: ["maps", "walk-reach", where_, prefs.minutes, prefs.pace],
    queryFn: ({ signal }) =>
      api.get<WalkReach>("/api/maps/walk-reach", { at: where_, minutes: String(prefs.minutes), pace: prefs.pace }, signal),
    enabled: Boolean(at),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const shown = at ? reach.data : undefined;
  const grid = useMemo(() => (shown ? walkGrid(shown) : null), [shown]);

  // On the map: the shading by the hour and the rings, while the card is open.
  useEffect(() => {
    engine?.setOverlay(WALK_SOURCE, grid ? walkData(grid) : EMPTY);
  }, [engine, grid]);
  useEffect(() => () => engine?.setOverlay(WALK_SOURCE, EMPTY), [engine]);
  const colour = useShadeColour("walk");
  const pictures = useMemo(() => {
    const picture = engine && grid && canShade() ? walkShade(grid, colour) : null;
    return picture ? [picture] : [];
  }, [engine, grid, colour]);
  useShades(engine, "walk", pictures, WALK_SHADE_OPACITY);

  // Once known, all of it is brought into view, clear of the card.
  const card = useRef<HTMLDivElement>(null);
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!engine || !shown || shown.coverage === "none") return;
    const key = `${where_}|${shown.minutes}|${shown.pace}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const clearBottom = (card.current?.closest(".outpost-map-card")?.getBoundingClientRect().height ?? 0) + 16;
    engine.fitBounds(walkBounds(shown), { clearBottom, maxZoom: 15 });
  }, [engine, shown, where_]);

  const pace = WALK_PACES.find((one) => one.id === prefs.pace) ?? WALK_PACES[0];
  const content = at ? (
    <MapCard
      title="How far on foot"
      onClose={() => {
        setAt(null);
        fitted.current = null;
      }}
      closeLabel="Stop showing how far on foot"
    >
      <div ref={card} className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-2.5">
        <p className="tabular text-small text-ink-muted">
          From {where(at)}
          {shown?.groundMeters != null ? `, ground ${formatHeight(shown.groundMeters)} above sea level` : ""}
        </p>
        <Segmented
          label="Time"
          value={String(prefs.minutes)}
          onChange={(next) => setPrefs((current) => ({ ...current, minutes: Number(next) as WalkMinutes }))}
          options={TIME_OPTIONS}
        />
        <div aria-live="polite">
          {reach.isPending ? (
            <p className="flex items-center gap-2 text-small text-ink-muted">
              <Spinner label="Working out the walk" /> Working out the ground within reach
            </p>
          ) : reach.isError ? (
            <Notice
              tone="danger"
              icon={<CircleAlert />}
              title="How far on foot could not be worked out"
              action={
                <Button size="sm" variant="ghost" onClick={() => reach.refetch()}>
                  Try again
                </Button>
              }
            >
              {errorMessage(reach.error)}
            </Notice>
          ) : shown?.coverage === "none" ? (
            <p className="text-small text-ink">
              No terrain is held here, so there is no saying how steep the ground is.{" "}
              {onOpenOffline ? (
                <button
                  type="button"
                  onClick={onOpenOffline}
                  className="font-medium text-primary underline underline-offset-2 hover:no-underline max-md:inline-flex md:pointer-coarse:inline-flex max-md:min-h-11 md:pointer-coarse:min-h-11 max-md:items-center md:pointer-coarse:items-center"
                >
                  Get terrain in Offline maps
                </button>
              ) : null}
            </p>
          ) : shown ? (
            <div className="grid gap-1 text-small">
              <p className="font-medium text-ink">
                {shown.furthestMeters > 0
                  ? `Within ${formatWalkTime(shown.minutes)}: as far as ${formatDistance(shown.furthestMeters)} from here, straight-line.`
                  : `Nowhere is within reach in ${formatWalkTime(shown.minutes)}: the ground all round is barred or too steep.`}
              </p>
              <p className="text-ink-muted">
                Shaded by the {shown.minutes <= 60 ? "half hour" : "hour"}, darkest nearest, with a ring at each. For a{" "}
                {pace.id === "standard" ? "fit adult with no load" : `${pace.name.toLowerCase()} walker (${pace.about})`}.
              </p>
              {!shown.paths ? (
                <p className="text-ink-muted">
                  No paths or roads from an installed map here: every step is taken as off-path, at three fifths of the pace.
                </p>
              ) : null}
              {shown.coverage === "partial" ? (
                <p className="text-ink-muted">Terrain runs out within reach; no ground without it is shaded.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          aria-expanded={details}
          onClick={() => setDetails((open) => !open)}
          className="flex min-h-11 items-center gap-2 text-left text-small font-medium text-ink hover:text-primary"
        >
          <ChevronRight aria-hidden className={cn("size-4 text-ink-muted transition-transform", details && "rotate-90")} />
          Pace and what this is
        </button>
        {details ? (
          <>
            <Segmented
              label="Pace"
              value={prefs.pace}
              onChange={(next) => setPrefs((current) => ({ ...current, pace: next }))}
              options={PACE_OPTIONS}
            />
            <div className="scroll-quiet grid max-h-56 gap-1.5 overflow-y-auto pb-1 text-small text-ink-muted">
              <p>
                Tobler's hiking function: about 5 km/h on a flat path, fastest (6 km/h) on a gentle descent, slower uphill and on steep
                descents. Off paths and roads, three fifths of that. It assumes a fit adult with no load; the slower paces are Outpost's own
                allowances, three quarters and half of it.
              </p>
              <p>
                Paths and roads come from the installed map. Water, rivers, canals and cliffs on the map are taken as barred, except where a
                bridge crosses them; so is ground steeper than 45° and ground with no terrain. Streams are stepped over.
              </p>
              <p>
                It knows nothing of fences, walls, private land, bog, deep heather, woods, snow, darkness or the weather, which can each
                halve a pace or stop it. Allow for them, and for rests.
              </p>
              {shown && shown.coverage !== "none" ? (
                <p>
                  The ground is read in squares {formatDistance(shown.cellMeters)} across from installed terrain, so a narrow gully or a
                  footbridge can be missed.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </MapCard>
  ) : null;

  return {
    start(position) {
      fitted.current = null;
      setDetails(false);
      setAt(position);
    },
    stop() {
      setAt(null);
      fitted.current = null;
    },
    card: content,
  };
}
