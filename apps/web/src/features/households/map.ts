/**
 * Every household's home on the map, labelled with the household's name: a fixed
 * household's at its saved place (the place itself is drawn as every saved place is; this
 * adds the name under it), a portable household's where it was last said to be, with a
 * mark of its own (a ringed dot, not a saved place) and how old the position is. The
 * current household's is the one the map's "near home" uses.
 *
 * With one household whose home is a saved place, nothing is added: the map looks as it
 * always has. Worked out from the households list; nothing is fetched.
 */
import { type HouseholdDto, homeAsOf } from "@outpost/shared";
import { useEffect, useMemo, useState } from "react";
import { MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY, type FeatureCollection } from "@/features/maps/map/overlays";
import { useHouseholds } from "./use-household";

export const HOUSEHOLDS_SOURCE = "o-households";

type Feature = FeatureCollection["features"][number];

/** The marks for each household's home; none when there is one household whose home is a saved place. */
export function householdFeatures(households: readonly HouseholdDto[], currentId: string | null, now: number): FeatureCollection {
  const several = households.length > 1;
  const features: Feature[] = [];
  for (const household of households) {
    const home = household.home;
    if (!home) continue;
    if (home.kind === "place" && !several) continue;
    const asOf = homeAsOf(home, now);
    features.push({
      type: "Feature",
      properties: {
        kind: home.kind,
        current: household.id === currentId,
        label: asOf ? `${household.name}\n${asOf}` : household.name,
      },
      geometry: { type: "Point", coordinates: [home.lon, home.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function householdLayers(theme: MapTheme): LayerSpecification[] {
  return [
    // A portable household's position: a ringed dot, so that it is not taken for a saved place.
    {
      id: "o-households-here-ring",
      type: "circle",
      source: HOUSEHOLDS_SOURCE,
      filter: ["==", ["get", "kind"], "here"],
      paint: {
        "circle-radius": ["case", ["get", "current"], 11, 9],
        "circle-color": theme.page,
        "circle-stroke-color": theme.primary,
        "circle-stroke-width": 2.5,
      },
    },
    {
      id: "o-households-here-dot",
      type: "circle",
      source: HOUSEHOLDS_SOURCE,
      filter: ["==", ["get", "kind"], "here"],
      paint: { "circle-radius": 4, "circle-color": theme.primary },
    },
    // Each household's name, under its home (below the place's own name, for a saved place).
    {
      id: "o-households-label",
      type: "symbol",
      source: HOUSEHOLDS_SOURCE,
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": ["case", ["==", ["get", "kind"], "place"], ["literal", [0, 2.6]], ["literal", [0, 1.1]]],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: { "text-color": theme.primary, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
  ];
}

/** Draws every household's home while the map is open; refreshed when the households change, and its age each minute. */
export function useHouseholdsOnMap({ engine }: { engine: MapEngine | null }) {
  const households = useHouseholds();
  const [now, setNow] = useState(() => Date.now());
  const data = Array.isArray(households.data?.households) ? households.data : undefined;
  const moving = data?.households.some((household) => household.home?.kind === "here") ?? false;
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [moving]);
  const features = useMemo(() => (data ? householdFeatures(data.households, data.currentId, now) : EMPTY), [data, now]);
  useEffect(() => {
    engine?.setOverlay(HOUSEHOLDS_SOURCE, features);
  }, [engine, features]);
}
