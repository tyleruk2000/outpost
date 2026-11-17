/**
 * The Satellite button on the Maps screen: whether imagery is drawn (remembered in this
 * browser), what the button says when there is none to draw, and the credits for the
 * imagery on screen, each with the date of its picture.
 */
import type { Bbox, ImageryStyleSource } from "@outpost/shared";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStoredState } from "../hooks";
import { parseAttribution } from "../lib/attribution";
import type { MapEngine } from "../map/engine";
import type { Credit } from "../map-footer";

export const SATELLITE_KEY = "outpost.maps.satellite";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export type SatelliteReach = "drawn" | "none-installed" | "none-here";

export const SATELLITE_NOTES: Record<Exclude<SatelliteReach, "drawn">, { label: string; message: string }> = {
  "none-installed": {
    label: "Satellite: none downloaded yet",
    message:
      "No satellite imagery is downloaded yet. Under Offline maps, Satellite imagery, get the world from NASA or a small area of your own from Sentinel-2. Both are free.",
  },
  "none-here": {
    label: "Satellite: none downloaded for this area",
    message: "Satellite imagery is on, but none is downloaded for this part of the map. Choose an area for it under Offline maps.",
  },
};

const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** The imagery sets that can be seen in a view: those overlapping it and not too coarse to be drawn. */
export function setsInView(sets: ImageryStyleSource[], view: { bounds: Bbox; zoom: number }): ImageryStyleSource[] {
  return sets.filter((set) => overlaps(set.bounds, view.bounds) && view.zoom >= set.minzoom - 0.5);
}

/** The credits for the imagery in view: the publisher's words, and the day of the picture, most detailed first. */
export function imageryCredits(sets: ImageryStyleSource[]): Credit[] {
  const seen = new Set<string>();
  const credits: Credit[] = [];
  for (const set of [...sets].reverse()) {
    if (seen.has(set.attribution)) continue;
    seen.add(set.attribution);
    credits.push({ key: `imagery-${set.id}`, parts: parseAttribution(set.attribution) });
  }
  return credits;
}

export function useSatellite({
  engine,
  imagery,
  onGetImagery,
}: {
  engine: MapEngine | null;
  /** Installed imagery, as the server lists it for the map; undefined while it is being read. */
  imagery: ImageryStyleSource[] | undefined;
  /** Opens the place where imagery is downloaded. */
  onGetImagery: () => void;
}): { on: boolean; setOn: (on: boolean) => void; reach: SatelliteReach; label: string; credits: Credit[] } {
  const [on, setStoredOn] = useStoredState(SATELLITE_KEY, isBoolean, false);
  const [view, setView] = useState<{ bounds: Bbox; zoom: number } | null>(null);
  const sets = imagery ?? [];

  useEffect(() => {
    if (!engine) return;
    const read = () => setView({ bounds: engine.getBounds(), zoom: engine.getZoom() });
    read();
    return engine.on("moveend", read);
  }, [engine]);

  const visible = useMemo(() => (view ? setsInView(sets, view) : sets), [sets, view]);
  const reach: SatelliteReach = sets.length === 0 ? "none-installed" : visible.length === 0 ? "none-here" : "drawn";
  const credits = useMemo(() => (on ? imageryCredits(visible) : []), [on, visible]);

  const setOn = (next: boolean) => {
    if (!next) return setStoredOn(false);
    // With nothing downloaded there is nothing to switch on yet; the button says what it needs instead.
    if (imagery !== undefined && reach !== "none-installed") setStoredOn(true);
    if (reach === "drawn" || imagery === undefined) return;
    toast(SATELLITE_NOTES[reach].message, { action: { label: "Offline maps", onClick: onGetImagery } });
  };

  const label =
    on && reach !== "drawn"
      ? SATELLITE_NOTES[reach].label
      : sets.length === 0
        ? SATELLITE_NOTES["none-installed"].label
        : "Satellite imagery";
  return { on: on && sets.length > 0, setOn, reach, label, credits };
}
