/** The Maidenhead grid on the map: whether it is switched on (remembered in this browser), and keeping it drawn for the view. */
import { useEffect } from "react";
import { useStoredState } from "../hooks";
import { readStored } from "../lib/view";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { locatorGrid } from "./locator-grid";

const KEY = "outpost.maps.locatorGrid";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** Whether the grid is switched on for the map on screen, for anything that starts from how the map is set (a printed page). */
export const locatorGridShown = (): boolean => readStored(KEY, isBoolean, false);

export function useLocatorGrid(engine: MapEngine | null): [on: boolean, set: (on: boolean) => void] {
  const [on, setOn] = useStoredState(KEY, isBoolean, false);

  useEffect(() => {
    if (!engine) return;
    if (!on) {
      engine.setOverlay("o-grid", EMPTY);
      return;
    }
    const draw = () => engine.setOverlay("o-grid", locatorGrid(engine.getBounds(), engine.getZoom()));
    draw();
    // Drawn afresh when the map comes to rest, and now and then during a long drag or zoom,
    // so the edge of the grid is not dragged into view.
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
