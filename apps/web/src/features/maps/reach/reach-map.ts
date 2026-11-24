/**
 * Reachable areas on the map, apart from React: the areas from the server as fills of one
 * hue, nested so each shorter time reads darker (up to three steps), with an outline of
 * its own for each step (solid for the shortest time, then dashed, then dotted, whatever
 * the times are) and its time written along it, so the steps read
 * apart in grey and on a printer with no colour. What is shown now is kept here for the
 * print overlays (print/overlays.ts), as the radio range does.
 */
import type { Bbox, StreetsReachResult } from "@outpost/shared";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import type { FeatureCollection } from "../map/overlays";
import { reachTimeText } from "../road-route/street-words";

export const REACH_SOURCE = "o-reach";

/** How solid each area's fill is: three laid one over another make the three steps. */
export const REACH_FILL_OPACITY = 0.16;

/** The outline for each step, shortest time first: solid, then dashed, then dotted. */
export const REACH_DASHES: ReadonlyArray<number[] | null> = [null, [4, 2], [1, 1.6]];

/** The outline's words for each step, for the printed key. */
export const REACH_LINE_WORDS = ["solid", "dashed", "dotted"] as const;

const MODE_WORDS = { drive: "by car", cycle: "by bicycle", walk: "on foot" } as const;

/** "Within 30 min by car, over every street" — the words for the legend and the printed note. */
export function reachSentence(result: StreetsReachResult): string {
  const times = result.areas.features.map((feature) => reachTimeText(feature.properties.minutes));
  const list = times.length > 1 ? `${times.slice(0, -1).join(", ")} and ${times.at(-1)}` : (times[0] ?? "");
  return `Reachable ${MODE_WORDS[result.mode]} within ${list}${result.point.name ? ` from ${result.point.name}` : ""} (${result.label.toLowerCase()}).`;
}

/** The areas, largest first so the smaller lie on top, each with its time and its words. */
export function reachData(result: StreetsReachResult | null): FeatureCollection {
  if (!result) return { type: "FeatureCollection", features: [] };
  const areas = [...result.areas.features].sort((a, b) => b.properties.minutes - a.properties.minutes);
  // Step 0 is the shortest time, whichever it is.
  const step = (index: number) => areas.length - 1 - index;
  return {
    type: "FeatureCollection",
    features: [
      ...areas.map((feature, index) => ({
        type: "Feature" as const,
        properties: {
          kind: "area",
          minutes: feature.properties.minutes,
          step: step(index),
          label: reachTimeText(feature.properties.minutes),
        },
        geometry: feature.geometry,
      })),
      // Each time written at the top of its outline: an outline is too ragged for words to follow it.
      ...areas.map((feature) => ({
        type: "Feature" as const,
        properties: { kind: "label", minutes: feature.properties.minutes, label: reachTimeText(feature.properties.minutes) },
        geometry: { type: "Point" as const, coordinates: northernmost(feature) },
      })),
      {
        type: "Feature" as const,
        properties: { kind: "point" },
        geometry: { type: "Point" as const, coordinates: [result.point.lon, result.point.lat] },
      },
    ],
  };
}

/** The northernmost corner of an area's outlines, where its time is written. */
function northernmost(feature: StreetsReachResult["areas"]["features"][number]): [number, number] {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let best: [number, number] = [0, -90];
  for (const polygon of polygons) for (const at of polygon[0] ?? []) if (at[1] > best[1]) best = at;
  return best;
}

/** The box the largest area fills, to bring it into view. */
export function reachBounds(result: StreetsReachResult): Bbox {
  let [west, south, east, north] = [result.point.lon, result.point.lat, result.point.lon, result.point.lat];
  for (const feature of result.areas.features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons)
      for (const [lon, lat] of polygon[0] ?? []) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
  }
  const pad = Math.max(east - west, north - south) * 0.04 + 0.002;
  return [west - pad, south - pad, east + pad, north + pad];
}

export function reachLayers(theme: MapTheme): LayerSpecification[] {
  const area = ["==", ["get", "kind"], "area"] as never;
  const of = (step: number) => ["all", area, ["==", ["get", "step"], step]] as never;
  return [
    {
      id: "o-reach-fill",
      type: "fill",
      source: REACH_SOURCE,
      filter: area,
      paint: { "fill-color": theme.walk, "fill-opacity": REACH_FILL_OPACITY },
    },
    {
      id: "o-reach-casing",
      type: "line",
      source: REACH_SOURCE,
      filter: area,
      layout: { "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": 4, "line-opacity": 0.7 },
    },
    ...REACH_DASHES.map(
      (dash, step): LayerSpecification => ({
        id: `o-reach-line-${step}`,
        type: "line",
        source: REACH_SOURCE,
        filter: of(step),
        layout: { "line-join": "round" },
        paint: { "line-color": theme.walk, "line-width": 2, ...(dash ? { "line-dasharray": dash } : {}) },
      }),
    ),
    {
      id: "o-reach-label",
      type: "symbol",
      source: REACH_SOURCE,
      filter: ["==", ["get", "kind"], "label"] as never,
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 12.5,
        "text-anchor": "bottom",
        "text-offset": [0, -0.3],
        "text-allow-overlap": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.8 },
    },
    {
      id: "o-reach-point",
      type: "circle",
      source: REACH_SOURCE,
      filter: ["==", ["get", "kind"], "point"] as never,
      paint: { "circle-radius": 6, "circle-color": theme.ink, "circle-stroke-color": theme.page, "circle-stroke-width": 2.5 },
    },
  ];
}

/** The reachable areas on the map now, for the print overlays. */
let shown: StreetsReachResult | null = null;
export const setReachShown = (result: StreetsReachResult | null) => {
  shown = result;
};
export const reachShown = () => shown;
