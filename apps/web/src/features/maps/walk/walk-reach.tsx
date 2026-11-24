/**
 * Reachable from here, on foot: the ground reachable from a point in a set time, worked out over installed terrain
 * with Tobler's hiking function, faster along the installed map's paths and roads, barred by water and cliffs.
 * Shaded on the map by the hour with a ring at each, and said in Reachable from here's card (reach-tool.tsx) with the
 * time, the pace and what the estimate rests on. For planning a way home or a place to meet.
 *
 * The server works it out (`GET /api/maps/walk-reach`, its progress at `/progress` while a long walk takes seconds);
 * see `walk-reach.ts` in the shared package for the pace rule. A car or a bicycle are the streets service's; a walk is
 * this, which needs only terrain, so it works on an Outpost without streets.
 */
import { WALK_PACES, type WalkPaceId, type WalkReach } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CircleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Segmented, Spinner } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useShadeColour } from "../hooks";
import { formatDistance, formatHeight, type LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { canShade } from "../map/shades";
import { useShades } from "../map/use-shades";
import { formatWalkTime, setWalkShown, WALK_SHADE_OPACITY, WALK_SOURCE, walkBounds, walkData, walkGrid, walkShade } from "./walk-map";

export const PACE_OPTIONS = WALK_PACES.map((pace) => ({ value: pace.id, label: pace.name }));

/** "For a fit adult with no load." or "For a slower walker (three quarters of the pace: …)." */
export function paceSentence(paceId: WalkPaceId): string {
  const pace = WALK_PACES.find((one) => one.id === paceId) ?? WALK_PACES[0];
  return pace.id === "standard" ? "For a fit adult with no load." : `For a ${pace.name.toLowerCase()} walker (${pace.about}).`;
}

/** What the walk rests on and leaves out, in full: for the card's details and for the printed page. */
export const WALK_METHOD = [
  "Tobler's hiking function: about 5 km/h on a flat path, fastest (6 km/h) on a gentle descent, slower uphill and on steep descents. Off paths and roads, three fifths of that. It assumes a fit adult with no load; the slower paces are Outpost's own allowances, three quarters and half of it.",
  "Paths and roads come from the installed map. Water, rivers, canals and cliffs on the map are taken as barred, except where a bridge crosses them; so is ground steeper than 45° and ground with no terrain. Streams are stepped over.",
  "It knows nothing of fences, walls, private land, bog, deep heather, woods, snow, darkness or the weather, which can each halve a pace or stop it. Allow for them, and for rests.",
] as const;

export interface WalkArea {
  reach: { isPending: boolean; isError: boolean; data: WalkReach | undefined };
  /** The answer in words, or its loading, error or no-terrain state. */
  body: ReactNode;
  /** "Pace and what this is", folded until asked for: the pace to choose and what the estimate rests on. */
  details: ReactNode;
  /** ", ground 120 m above sea level", once known. */
  ground: string;
}

export function useWalkArea({
  engine,
  at,
  minutes,
  pace,
  onPace,
  onOpenOffline,
  clearBottom,
}: {
  engine: MapEngine | null;
  /** The start, or null when the walk is not being shown. */
  at: LatLon | null;
  minutes: number;
  pace: WalkPaceId;
  onPace: (pace: WalkPaceId) => void;
  onOpenOffline?: () => void;
  /** How much of the map at the bottom the card covers, to bring the walk into view above it. */
  clearBottom: () => number;
}): WalkArea {
  const [details, setDetails] = useState(false);
  const where_ = at ? `${at.lat.toFixed(5)},${at.lon.toFixed(5)}` : "";
  const query = { at: where_, minutes: String(minutes), pace };
  const reach = useQuery({
    queryKey: ["maps", "walk-reach", where_, minutes, pace],
    queryFn: ({ signal }) => api.get<WalkReach>("/api/maps/walk-reach", query, signal),
    enabled: Boolean(at),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  // A long walk takes seconds on a Pi: how far it has got, asked every so often while it is worked out.
  const progress = useQuery({
    queryKey: ["maps", "walk-reach", "progress", where_, minutes, pace],
    queryFn: ({ signal }) => api.get<{ share: number | null }>("/api/maps/walk-reach/progress", query, signal),
    enabled: Boolean(at) && reach.isPending && minutes >= 120,
    refetchInterval: 600,
    retry: false,
  });
  const shown = at ? reach.data : undefined;
  const grid = useMemo(() => (shown ? walkGrid(shown) : null), [shown]);

  // On the map: the shading by the hour and the rings, while the walk is shown; kept for the printed page too.
  useEffect(() => {
    engine?.setOverlay(WALK_SOURCE, grid ? walkData(grid) : EMPTY);
    setWalkShown(grid ? shown! : null);
  }, [engine, grid, shown]);
  useEffect(
    () => () => {
      engine?.setOverlay(WALK_SOURCE, EMPTY);
      setWalkShown(null);
    },
    [engine],
  );
  const colour = useShadeColour("walk");
  const pictures = useMemo(() => {
    const picture = engine && grid && canShade() ? walkShade(grid, colour) : null;
    return picture ? [picture] : [];
  }, [engine, grid, colour]);
  useShades(engine, "walk", pictures, WALK_SHADE_OPACITY);

  // Once known, all of it is brought into view, clear of the card.
  const fitted = useRef<string | null>(null);
  const clear = useRef(clearBottom);
  clear.current = clearBottom;
  useEffect(() => {
    if (!at) fitted.current = null;
    if (!engine || !shown || shown.coverage === "none") return;
    const key = `${where_}|${shown.minutes}|${shown.pace}`;
    if (fitted.current === key) return;
    fitted.current = key;
    engine.fitBounds(walkBounds(shown), { clearBottom: clear.current(), maxZoom: 15 });
  }, [engine, shown, where_, at]);

  const share = progress.data?.share ?? null;
  const body = !at ? null : reach.isPending ? (
    <div className="grid gap-1.5" role="status">
      <p className="flex items-center gap-2 text-small text-ink-muted">
        <Spinner label="Working out the walk" delay /> Working out the ground within reach
        {minutes >= 240 ? ": a long walk takes a few seconds." : ""}
      </p>
      {share !== null && share > 0 ? <Progress value={share} label="How far the walk is worked out" /> : null}
    </div>
  ) : reach.isError ? (
    <Notice
      tone="danger"
      icon={<CircleAlert />}
      title="The walk could not be worked out"
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
        Shaded by the {shown.minutes <= 60 ? "half hour" : "hour"}, darkest nearest, with a ring at each. Hills, paths and water counted.{" "}
        {paceSentence(shown.pace)}
        {shown.minutes > 120 ? " No rests counted: a real walk of hours takes longer." : ""}
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
  ) : null;

  const detailsContent = !at ? null : (
    <>
      <button
        type="button"
        aria-expanded={details}
        onClick={() => setDetails((open) => !open)}
        className="flex min-h-11 items-center gap-2 text-left text-small font-medium text-ink hover:text-primary"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-4 text-ink-muted transition-transform motion-reduce:transition-none", details && "rotate-90")}
        />
        Pace and what this is
      </button>
      {details ? (
        <>
          <Segmented label="Pace" value={pace} onChange={(next) => onPace(next)} options={PACE_OPTIONS} />
          <div className="grid gap-1.5 pb-1 text-small text-ink-muted">
            {WALK_METHOD.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
            {shown && shown.coverage !== "none" ? (
              <p>
                The ground is read in squares {formatDistance(shown.cellMeters)} across from installed terrain, so a narrow gully or a
                footbridge can be missed.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );

  return {
    reach: { isPending: reach.isPending, isError: reach.isError, data: shown },
    body,
    details: detailsContent,
    ground: shown?.groundMeters != null ? `, ground ${formatHeight(shown.groundMeters)} above sea level` : "",
  };
}
