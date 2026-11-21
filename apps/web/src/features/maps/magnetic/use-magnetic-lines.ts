/** Magnetic north lines on the map: whether they are switched on (remembered in this browser, off at first), and keeping them drawn for the view. */
import { useEffect } from "react";
import { useStoredState } from "../hooks";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { declinationAt, magneticLines } from "./lines";

const KEY = "outpost.maps.magneticLines";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export function useMagneticLines(engine: MapEngine | null): [on: boolean, set: (on: boolean) => void] {
  const [on, setOn] = useStoredState(KEY, isBoolean, false);

  useEffect(() => {
    if (!engine) return;
    if (!on) {
      engine.setOverlay("o-magnetic", EMPTY);
      return;
    }
    const draw = () => {
      const centre = engine.getCenter();
      const declination = declinationAt(centre.lat, centre.lon);
      engine.setOverlay("o-magnetic", declination === null ? EMPTY : magneticLines(engine.getBounds(), engine.getZoom(), declination));
    };
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
