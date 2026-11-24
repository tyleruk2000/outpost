/**
 * A repeater's own small map: where it is, the pin of the place it is measured from, and
 * room round both. Tap the map, or drag the pin, to measure from somewhere else.
 */
import type { RepeaterDto } from "@outpost/shared";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/misc";
import { useMapTheme } from "@/features/maps/hooks";
import type { MapEngine } from "@/features/maps/map/engine";
import { REPEATER_SOURCE, repeatersData } from "./map/layers";
import type { Origin } from "./origin";
import { boxAround } from "./repeaters-map";

const PlanMap = lazy(() => import("@/features/propagation/map/plan-map").then((module) => ({ default: module.PlanMap })));

export function RepeaterSpotMap({ repeater, origin, className }: { repeater: RepeaterDto; origin: Origin; className?: string }) {
  const { theme } = useMapTheme();
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const at = repeater.lat !== null && repeater.lon !== null ? { lat: repeater.lat, lon: repeater.lon } : null;
  const from = origin.position;
  const latest = useRef(origin);
  latest.current = origin;

  const atLat = at?.lat;
  const atLon = at?.lon;
  useEffect(() => {
    if (!engine || atLat === undefined || atLon === undefined) return;
    engine.setOverlay(
      REPEATER_SOURCE,
      repeatersData(
        {
          total: 1,
          cells: [],
          points: [
            {
              id: repeater.id,
              callsign: repeater.callsign,
              lat: atLat,
              lon: atLon,
              outputHz: repeater.outputHz,
              band: repeater.band,
              status: repeater.status,
            },
          ],
        },
        { lat: atLat, lon: atLon },
      ),
    );
  }, [engine, atLat, atLon, repeater.id, repeater.callsign, repeater.outputHz, repeater.band, repeater.status]);

  // Opens round the repeater and the place measured from, when that is near enough to show both.
  const fitted = useRef(false);
  useEffect(() => {
    if (!engine || fitted.current || atLat === undefined || atLon === undefined) return;
    fitted.current = true;
    const both =
      from && Math.abs(from.lat - atLat) < 3 && Math.abs(from.lon - atLon) < 5
        ? ([Math.min(from.lon, atLon), Math.min(from.lat, atLat), Math.max(from.lon, atLon), Math.max(from.lat, atLat)] as [
            number,
            number,
            number,
            number,
          ])
        : boxAround({ lat: atLat, lon: atLon }, 15_000);
    // Clear of the zoom buttons and of the readout and credits at the foot.
    engine.fitBounds(both, { animate: false, maxZoom: 12, keepClear: { top: 24, right: 64, bottom: 96 } });
  }, [engine, atLat, atLon, from]);

  const pinLabel = from ? `Measuring from ${origin.name}. Drag to measure from somewhere else.` : "";
  useEffect(() => {
    engine?.setPin(from ? { position: from, color: theme.primary, draggable: true, label: pinLabel } : null);
  }, [engine, from, theme.primary, pinLabel]);
  useEffect(() => {
    if (!engine) return;
    const off = [
      engine.on("pindrag", (to) => latest.current.set({ kind: "point", lat: to.lat, lon: to.lon })),
      engine.on("click", ({ position }) => latest.current.set({ kind: "point", lat: position.lat, lon: position.lon })),
    ];
    return () => {
      for (const stop of off) stop();
    };
  }, [engine]);

  if (!at) return null;
  return (
    <div className={className}>
      <Suspense fallback={<Skeleton className="size-full rounded-panel" />}>
        <PlanMap label={`Map of ${repeater.callsign}: tap anywhere to measure from there`} onEngine={setEngine} className="size-full" />
      </Suspense>
    </div>
  );
}
