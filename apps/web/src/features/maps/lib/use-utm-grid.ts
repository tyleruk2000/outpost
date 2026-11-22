/**
 * The UTM grid on the map on screen: lines of equal easting and northing in the zone of the middle of the view, each
 * with its figure in kilometres, as the printed page draws them (print/utm-grid.ts). Whether it is switched on is
 * remembered in this browser, off at first.
 */
import { useEffect } from "react";
import { useStoredState } from "../hooks";
import type { MapEngine } from "../map/engine";
import { EMPTY, type FeatureCollection } from "../map/overlays";
import { UTM_SOURCE, utmGrid } from "../print/utm-grid";
import { readStored } from "./view";

const KEY = "outpost.maps.utmGrid";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** Whether the grid is switched on for the map on screen, for a printed page to start from. */
export const utmGridShown = (): boolean => readStored(KEY, isBoolean, false);

/** The lines for the view, with the zone written once, above the middle of the view (clear of the cross): "UTM 30U". */
export function utmGridData(bounds: [number, number, number, number], zoom: number): FeatureCollection {
  const grid = utmGrid(bounds, zoom);
  if (!grid) return EMPTY;
  const [west, south, east, north] = bounds;
  const zone: FeatureCollection["features"][number] = {
    type: "Feature",
    properties: { kind: "zone", label: grid.zone.startsWith("UPS") ? grid.zone : `UTM ${grid.zone}` },
    geometry: { type: "Point", coordinates: [(west + east) / 2, south + (north - south) * 0.7] },
  };
  return { type: "FeatureCollection", features: [...grid.lines.features, zone] };
}

export function useUtmGrid(engine: MapEngine | null): [on: boolean, set: (on: boolean) => void] {
  const [on, setOn] = useStoredState(KEY, isBoolean, false);

  useEffect(() => {
    if (!engine) return;
    if (!on) {
      engine.setOverlay(UTM_SOURCE, EMPTY);
      return;
    }
    const draw = () => engine.setOverlay(UTM_SOURCE, utmGridData(engine.getBounds(), engine.getZoom()));
    draw();
    // As the locator grid: afresh when the map comes to rest, and now and then during a long drag or zoom.
    let last = 0;
    const offMove = engine.on("move", () => {
      const now = performance.now();
      if (now - last < 200) return;
      last = now;
      draw();
    });
    const offEnd = engine.on("moveend", draw);
    return () => {
      offMove();
      offEnd();
    };
  }, [engine, on]);

  return [on, setOn];
}
