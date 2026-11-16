/**
 * The offline map as the HF planner uses it: the same map, style and installed regions
 * as the Maps screen, with one overlay of the planner's own (coverage cells, stations,
 * the place being chosen) and saved places shown for choosing.
 *
 * It only shows and listens. Whoever mounts it decides what a press means.
 */
import type { Bbox, MarkerDto } from "@outpost/shared";
import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useMapOverview, useMapSources } from "@/features/maps/data";
import { greyLineData } from "@/features/maps/grey-line/geometry";
import { GREY_LINE_SOURCE } from "@/features/maps/grey-line/layers";
import { useMapTheme, useStoredState } from "@/features/maps/hooks";
import { isReadoutFormat, type ReadoutFormat } from "@/features/maps/lib/coords";
import type { LatLon } from "@/features/maps/lib/geo";
import type { StyleInput } from "@/features/maps/lib/style";
import { regionsCacheKey } from "@/features/maps/lib/tiles";
import { DEFAULT_VIEW, STORAGE_KEYS } from "@/features/maps/lib/view";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY, type FeatureCollection, markersData } from "@/features/maps/map/overlays";
import { creditsFor, MapFooter } from "@/features/maps/map-footer";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import "@/features/maps/maps.css";
import { PROPAGATION_SOURCE } from "./layers";

export interface MapPress {
  position: LatLon;
  /** The saved place under the press, if there is one. */
  place: MarkerDto | null;
}

export interface PlanMapProps {
  /** What the planner draws: see `layers.ts`. */
  data?: FeatureCollection;
  /** Saved places to show, and to offer under a press. */
  places?: MarkerDto[];
  onPress?: (press: MapPress) => void;
  /** Handed the map once it can be asked what it shows, and null when it has gone. */
  onReady?: (map: PlanMapHandle | null) => void;
  /** The area on screen, once the map is drawn and each time it comes to rest somewhere new. */
  onMoved?: (bounds: Bbox) => void;
  /** An area to open on, or to move to when it changes. */
  fit?: Bbox | null;
  /** Says what the map is for, to a screen reader. */
  label: string;
  /** Draws day and night for this moment (see features/maps/grey-line); left out or null, they are not drawn. */
  greyLineAt?: number | null;
  className?: string;
}

export interface PlanMapHandle {
  /** The area on screen, as [west, south, east, north]. */
  bounds(): Bbox;
}

export function PlanMap({ data, places, onPress, onReady, onMoved, fit, label, greyLineAt, className }: PlanMapProps) {
  const { flavour, theme } = useMapTheme();
  const sources = useMapSources();
  const overview = useMapOverview();
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [problem, setProblem] = useState("");
  // The same choice of coordinate format as on the Maps screen.
  const [format, setFormat] = useStoredState<ReadoutFormat>(STORAGE_KEYS.coordinateFormat, isReadoutFormat, "decimal");

  const cacheKey = useMemo(() => regionsCacheKey(overview.data?.regions ?? []), [overview.data]);
  const style = useMemo<Omit<StyleInput, "overlays">>(
    () => ({ sources: sources.data, flavour, theme, hillshade: false, contours: false, origin: window.location.origin, cacheKey }),
    [sources.data, flavour, theme, cacheKey],
  );
  const latest = useRef({ style, fit, onPress, onReady, onMoved, places });
  latest.current = { style, fit, onPress, onReady, onMoved, places };
  const applied = useRef<typeof style | undefined>(undefined);

  const settled = !sources.isPending && !overview.isPending;
  useEffect(() => {
    if (!settled || !container.current) return;
    let cancelled = false;
    let created: MapEngine | undefined;
    import("@/features/maps/map/engine")
      .then(({ MapEngine }) => {
        if (cancelled || !container.current) return;
        try {
          created = new MapEngine(container.current, DEFAULT_VIEW, latest.current.style);
        } catch (error) {
          setStatus("failed");
          setProblem(errorMessage(error));
          return;
        }
        applied.current = latest.current.style;
        if (latest.current.fit) created.fitBounds(latest.current.fit, { animate: false, maxZoom: 9 });
        created.setCursor("crosshair");
        created.on("click", (event) => {
          const place = event.hit?.type === "marker" ? (latest.current.places?.find((item) => item.id === event.hit?.id) ?? null) : null;
          latest.current.onPress?.({ position: event.position, place });
        });
        setEngine(created);
        setStatus("ready");
        const made = created;
        latest.current.onReady?.({ bounds: () => made.getBounds() });
        latest.current.onMoved?.(made.getBounds());
        made.on("moveend", () => latest.current.onMoved?.(made.getBounds()));
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("failed");
        setProblem("The map library could not be loaded. Check that the Outpost server is running, then reload.");
      });
    return () => {
      cancelled = true;
      latest.current.onReady?.(null);
      created?.destroy();
      setEngine(null);
    };
  }, [settled]);

  useEffect(() => {
    if (!engine || applied.current === style) return;
    applied.current = style;
    engine.setStyle(style);
  }, [engine, style]);
  useEffect(() => engine?.setOverlay(PROPAGATION_SOURCE, data ?? EMPTY), [engine, data]);
  useEffect(() => engine?.setOverlay("o-markers", places ? markersData(places, null) : EMPTY), [engine, places]);
  useEffect(() => engine?.setOverlay(GREY_LINE_SOURCE, greyLineAt ? greyLineData(greyLineAt) : EMPTY), [engine, greyLineAt]);
  const fitKey = fit ? fit.join(",") : "";
  const fitted = useRef(fitKey);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the area is compared by its numbers, not by the array that holds them
  useEffect(() => {
    if (!engine || !fit || fitted.current === fitKey) return;
    fitted.current = fitKey;
    engine.fitBounds(fit, { maxZoom: 9 });
  }, [engine, fitKey]);

  const credits = useMemo(
    () => creditsFor(sources.data?.attributions ?? [], { hasTiles: sources.data?.hasTiles ?? false, terrain: false }),
    [sources.data],
  );

  if (status === "failed") {
    return (
      <Notice tone="danger" title="The map cannot be drawn here" className={className}>
        {problem} Positions can still be typed as coordinates, a grid reference or a locator.
      </Notice>
    );
  }
  return (
    <div className={cn("outpost-touch relative isolate overflow-hidden rounded-panel border border-border bg-surface", className)}>
      {/* The map takes the keyboard itself: arrow keys pan it, plus and minus zoom. */}
      {/* MapLibre makes its container `position: relative`, so the one that fills the frame is a wrapper. */}
      <div className="absolute inset-0">
        <section ref={container} aria-label={label} className="outpost-map size-full" />
      </div>
      {status === "loading" ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
      {engine ? (
        // One column from the top of the frame to its foot, as on the Maps screen (map-furniture.tsx), so the zoom
        // buttons and the readout cannot lie over each other however short the frame or large the text: where the
        // frame is short the two buttons go side by side, and the readout steps aside before the credits do.
        <div className="outpost-furniture pointer-events-none absolute inset-2 flex flex-col justify-between gap-2">
          <div className="outpost-furniture-zoom pointer-events-auto flex shrink-0 flex-col gap-1 self-end">
            <Button size="icon" aria-label="Zoom in" onClick={() => engine.zoomIn()}>
              <Plus />
            </Button>
            <Button size="icon" aria-label="Zoom out" onClick={() => engine.zoomOut()}>
              <Minus />
            </Button>
          </div>
          <MapFooter engine={engine} format={format} onFormatChange={setFormat} credits={credits} className="shrink-0" />
        </div>
      ) : null}
    </div>
  );
}
