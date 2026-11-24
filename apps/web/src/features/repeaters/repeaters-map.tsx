/**
 * The Repeaters screen's map: the repeaters the list shows (the same filters, and the
 * ring of its "within" distance), each drawn by the shape of its band, and the pin of the
 * place they are measured from.
 *
 * Tap a repeater for its card; tap anywhere else, or drag the pin, to measure from that
 * point instead, and the list re-sorts. Choosing a row of the list rings its repeater
 * here. The map draws installed regions and the bundled outline of the world beneath
 * them; nothing is fetched from the internet.
 */
import type { Bbox } from "@outpost/shared";
import { bearingDegrees, formatMHz, haversineMeters } from "@outpost/shared";
import { Crosshair } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useMapTheme } from "@/features/maps/hooks";
import { formatBearing } from "@/features/maps/lib/geo";
import type { CameraView } from "@/features/maps/lib/view";
import type { MapEngine } from "@/features/maps/map/engine";
import { MapCard } from "@/features/maps/map-chrome";
import { cn } from "@/lib/utils";
import { type LatLon, type RepeaterFilters, useRepeater, useRepeaterOverlay } from "./data";
import { BandKey } from "./map/band-key";
import { nearestHit, overlayBox, REPEATER_SOURCE, repeatersData } from "./map/layers";
import type { Origin } from "./origin";
import { useDistanceText } from "./units";
import { accessParts, isApproximate, shiftWords } from "./words";

const PlanMap = lazy(() => import("@/features/propagation/map/plan-map").then((module) => ({ default: module.PlanMap })));

/** A box round a place wide enough to hold a circle of `meters` round it. */
export function boxAround(position: LatLon, meters: number): Bbox {
  const dLat = meters / 111_195;
  const dLon = dLat / Math.max(0.05, Math.cos((position.lat * Math.PI) / 180));
  return [
    Math.max(-180, position.lon - dLon),
    Math.max(-85, position.lat - dLat),
    Math.min(180, position.lon + dLon),
    Math.min(85, position.lat + dLat),
  ];
}

/** One repeater's card on the map: what to listen on, how to get in, and how far it is. */
function RepeaterMapCard({
  id,
  origin,
  onClose,
  onMeasureFrom,
}: {
  id: string;
  origin: Origin;
  onClose: () => void;
  onMeasureFrom: (at: { lat: number; lon: number; name: string }) => void;
}) {
  const detail = useRepeater(id);
  const distance = useDistanceText();
  const card = "absolute top-2 left-2 right-14 z-[2] w-auto max-h-[calc(100%-1rem)] sm:right-auto sm:w-[21rem]";
  if (!detail.data) {
    return (
      <MapCard title="Repeater" onClose={onClose} closeLabel="Close this repeater" className={card}>
        {detail.isError ? (
          <p className="mt-1 text-small text-ink-muted">This repeater could not be read. It may have been removed.</p>
        ) : (
          <div className="mt-2 grid gap-2" aria-busy>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
            <span className="sr-only">Loading the repeater</span>
          </div>
        )}
      </MapCard>
    );
  }
  const { repeater } = detail.data;
  const access = accessParts(repeater);
  const placed = repeater.lat !== null && repeater.lon !== null;
  const from = origin.position;
  const meters = placed && from ? haversineMeters(from.lat, from.lon, repeater.lat!, repeater.lon!) : null;
  return (
    <MapCard title={repeater.callsign} onClose={onClose} closeLabel="Close this repeater" className={card}>
      <p className="tabular mt-0.5 text-body text-ink">
        <span className="font-mono text-[0.9375rem]">{formatMHz(repeater.outputHz)} MHz</span>, {shiftWords(repeater)}
      </p>
      <p className="tabular text-small text-ink">{access.join(", ") || "No tone or code listed"}</p>
      {meters !== null && from ? (
        <p className="tabular mt-1 text-small text-ink">
          {isApproximate(repeater) ? "About " : ""}
          {distance(meters)}, {formatBearing(bearingDegrees(from.lat, from.lon, repeater.lat!, repeater.lon!))} (true) from {origin.name}
        </p>
      ) : null}
      {repeater.place ? <p className="text-small text-ink-muted">{repeater.place}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="primary">
          <Link to={`/radio/repeaters/${repeater.id}`}>Details</Link>
        </Button>
        {placed ? (
          <Button size="sm" onClick={() => onMeasureFrom({ lat: repeater.lat!, lon: repeater.lon!, name: repeater.callsign })}>
            <Crosshair /> Measure from here
          </Button>
        ) : null}
      </div>
    </MapCard>
  );
}

export function RepeatersMap({
  filters,
  origin,
  withinKm,
  selectedId,
  onSelect,
  view,
  onView,
  fallbackFit,
  className,
}: {
  filters: RepeaterFilters;
  origin: Origin;
  withinKm: number | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Where the map was left, from the address: it opens there again after Back. */
  view: CameraView | null;
  onView: (view: CameraView) => void;
  /** Where to open when there is neither a view nor a place: round the repeaters the list shows. */
  fallbackFit: Bbox | null;
  className?: string;
}) {
  const { theme } = useMapTheme();
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [box, setBox] = useState<string | null>(null);
  const position = origin.position;
  const overlay = useRepeaterOverlay(box, filters, position, withinKm);
  const detail = useRepeater(selectedId);

  const latest = useRef({ overlay: overlay.data, onSelect, origin, onView });
  latest.current = { overlay: overlay.data, onSelect, origin, onView };

  // Which part of the map to ask about, and where it was left: now, and each time it comes to rest.
  useEffect(() => {
    if (!engine) return;
    const read = () => {
      setBox(overlayBox(engine.getBounds()));
      latest.current.onView(engine.getView());
    };
    read();
    return engine.on("moveend", read);
  }, [engine]);

  // Where the map opens: where it was left, else round the place measured from, else round what the list shows.
  const opened = useRef(false);
  const fallbackKey = fallbackFit?.join(",") ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: the fallback is compared by its numbers, not by the array that holds them
  useEffect(() => {
    if (!engine || opened.current) return;
    if (view) engine.jumpTo(view);
    else if (position) engine.fitBounds(boxAround(position, (withinKm ?? 25) * 1000), { animate: false, maxZoom: 12 });
    else if (fallbackFit) engine.fitBounds(fallbackFit, { animate: false, maxZoom: 10 });
    else return;
    opened.current = true;
  }, [engine, view, position, withinKm, fallbackKey]);

  // A place chosen in the list's controls (not on the map) is brought into view.
  const placeKey = position ? `${position.lat},${position.lon}` : "";
  const shownPlace = useRef(placeKey);
  useEffect(() => {
    if (!engine || !position || !opened.current || shownPlace.current === placeKey) return;
    shownPlace.current = placeKey;
    if (!engine.isInView(position)) engine.fitBounds(boxAround(position, (withinKm ?? 25) * 1000), { maxZoom: 12 });
  }, [engine, position, placeKey, withinKm]);

  // The pin of the place measured from: dragged, or moved with the arrow keys, it becomes a point on the map.
  const pinLabel = position ? `Measuring from ${origin.name}. Drag to measure from somewhere else.` : "";
  useEffect(() => {
    if (!engine) return;
    engine.setPin(position ? { position, color: theme.primary, draggable: true, label: pinLabel } : null);
  }, [engine, position, theme.primary, pinLabel]);
  useEffect(() => {
    if (!engine) return;
    return engine.on("pindrag", (at) => latest.current.origin.set({ kind: "point", lat: at.lat, lon: at.lon }));
  }, [engine]);

  // The ring round the repeater that is open: at once from what is drawn, else from its details.
  const fromOverlay = selectedId ? overlay.data?.points.find((point) => point.id === selectedId) : undefined;
  const chosen = detail.data?.repeater;
  const ringAt = fromOverlay ?? (chosen && chosen.lat !== null && chosen.lon !== null ? { lat: chosen.lat, lon: chosen.lon } : null);
  const ringLat = selectedId ? ringAt?.lat : undefined;
  const ringLon = selectedId ? ringAt?.lon : undefined;
  const within = useMemo(() => (position && withinKm ? { centre: position, meters: withinKm * 1000 } : null), [position, withinKm]);
  useEffect(() => {
    if (!engine) return;
    const ring = ringLat !== undefined && ringLon !== undefined ? { lat: ringLat, lon: ringLon } : null;
    engine.setOverlay(REPEATER_SOURCE, repeatersData(overlay.data, ring, within));
  }, [engine, overlay.data, ringLat, ringLon, within]);

  // A repeater chosen in the list is brought into view.
  useEffect(() => {
    if (!engine || ringLat === undefined || ringLon === undefined) return;
    const at = { lat: ringLat, lon: ringLon };
    if (!engine.isInView(at)) engine.panTo(at);
  }, [engine, ringLat, ringLon]);

  // A tap on a repeater opens it, on a patch goes in closer, anywhere else measures from there.
  useEffect(() => {
    if (!engine) return;
    return engine.on("click", ({ point, position: at }) => {
      const now = latest.current;
      const found = nearestHit(now.overlay, point, (where) => engine.project(where));
      if (found?.kind === "point" && found.id) now.onSelect(found.id);
      else if (found) engine.flyTo({ lat: found.lat, lon: found.lon }, Math.min(engine.getZoom() + 2, 14));
      else {
        now.onSelect(null);
        now.origin.set({ kind: "point", lat: at.lat, lon: at.lon });
      }
    });
  }, [engine]);

  return (
    <div className={cn("grid grid-rows-[minmax(0,1fr)_auto] gap-2", className)}>
      <div className="relative min-h-0">
        <Suspense fallback={<Skeleton className="size-full rounded-panel" />}>
          <PlanMap
            label="Map of repeaters: tap a repeater for its details, or tap anywhere else to measure from there"
            onEngine={setEngine}
            className="size-full"
          />
        </Suspense>
        {selectedId ? (
          <RepeaterMapCard
            id={selectedId}
            origin={origin}
            onClose={() => onSelect(null)}
            onMeasureFrom={(at) => {
              onSelect(null);
              origin.set({ kind: "at", ...at });
            }}
          />
        ) : null}
      </div>
      <BandKey />
    </div>
  );
}
