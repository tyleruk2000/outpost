/**
 * Natural Earth's outline of the land, for the world drawn on a radio paper. It is a file
 * Outpost serves itself (public/world/land.json, kept by the offline cache), so nothing
 * is fetched from anywhere else; it is read once and kept. `settled` is false until it
 * has loaded or failed; a paper made without it draws the world with no coasts.
 */
import { useEffect, useState } from "react";
import type { LandShapes } from "./radio-diagrams";

let reading: Promise<LandShapes | null> | null = null;

function readLand(): Promise<LandShapes | null> {
  reading ??= fetch("/world/land.json")
    .then((response) => (response.ok ? (response.json() as Promise<LandShapes>) : null))
    .catch(() => null);
  return reading;
}

export function useLand(): { land: LandShapes | null; settled: boolean } {
  const [state, setState] = useState<{ land: LandShapes | null; settled: boolean }>({ land: null, settled: false });
  useEffect(() => {
    let live = true;
    readLand().then((land) => {
      if (live) setState({ land, settled: true });
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
