/**
 * What the radio tools draw on the map: the Maidenhead grid, the path of a
 * line-of-sight check with its two ends, and the relay planner's places. Described here and handed to the map with the
 * other overlays.
 */
import { greatCirclePoint } from "@outpost/shared";
import type { LatLon } from "../lib/geo";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import type { FeatureCollection } from "../map/overlays";

/**
 * The grid, beneath everything else drawn over the map. Lines and names are the ink
 * colour of the theme in use, thinned out: dark on the light map, light on the dark
 * one, and never as strong as a road or a route.
 */
export function gridLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-grid-fine",
      type: "line",
      source: "o-grid",
      filter: ["==", ["get", "kind"], "fine"],
      paint: { "line-color": theme.ink, "line-width": 1, "line-opacity": 0.22 },
    },
    {
      id: "o-grid-coarse",
      type: "line",
      source: "o-grid",
      filter: ["==", ["get", "kind"], "coarse"],
      paint: { "line-color": theme.ink, "line-width": 1.5, "line-opacity": 0.42 },
    },
    {
      id: "o-grid-label",
      type: "symbol",
      source: "o-grid",
      filter: ["==", ["get", "kind"], "label"],
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "text"],
        "text-size": ["get", "size"],
        "text-letter-spacing": 0.04,
        // Every cell in view is named, and a name takes no room from the map's own: a town
        // keeps its name with the grid on. Cells are never drawn too small to hold theirs.
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": theme.ink, "text-opacity": 0.72, "text-halo-color": theme.page, "text-halo-width": 1.4 },
    },
  ];
}

/** The path being checked: a solid line in ink, cased like the other lines, with a lettered dot at each end. */
export function sightLayers(theme: MapTheme): LayerSpecification[] {
  const label = { "text-font": [MAP_FONTS.medium] as string[], "text-size": 12.5 };
  const halo = { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 } as const;
  return [
    {
      id: "o-sight-casing",
      type: "line",
      source: "o-sight",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": 6, "line-opacity": 0.9 },
    },
    {
      id: "o-sight-line",
      type: "line",
      source: "o-sight",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.ink, "line-width": 2.5 },
    },
    {
      id: "o-sight-mark",
      type: "circle",
      source: "o-sight",
      filter: ["==", ["get", "kind"], "mark"],
      paint: { "circle-radius": 6, "circle-color": theme.page, "circle-stroke-color": theme.ink, "circle-stroke-width": 2.5 },
    },
    {
      id: "o-sight-mark-label",
      type: "symbol",
      source: "o-sight",
      filter: ["==", ["get", "kind"], "mark"],
      layout: { ...label, "text-field": ["get", "label"], "text-anchor": "top", "text-offset": [0, 0.9], "text-optional": true },
      paint: halo,
    },
    {
      id: "o-sight-ends",
      type: "circle",
      source: "o-sight",
      filter: ["==", ["get", "kind"], "end"],
      paint: { "circle-radius": 10, "circle-color": theme.ink, "circle-stroke-color": theme.page, "circle-stroke-width": 2 },
    },
    {
      id: "o-sight-ends-label",
      type: "symbol",
      source: "o-sight",
      filter: ["==", ["get", "kind"], "end"],
      layout: { ...label, "text-field": ["get", "label"], "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": theme.page },
    },
    {
      id: "o-sight-scrub",
      type: "circle",
      source: "o-sight",
      filter: ["==", ["get", "kind"], "scrub"],
      paint: { "circle-radius": 7, "circle-color": theme.page, "circle-stroke-color": theme.ink, "circle-stroke-width": 3 },
    },
  ];
}

/** Enough pieces that the curve of a long great circle on the flat map is smooth. */
const PATH_PIECES = 64;

export interface SightOverlay {
  from: LatLon | null;
  to: LatLon | null;
  /** A place along the path to mark, with a word for why: where the ground is in the way, or where it comes closest. */
  mark?: { position: LatLon; label: string } | null;
  /** The place the pointer is at on the chart. */
  scrub?: LatLon | null;
}

/**
 * The path as the map draws it: the great circle between the two ends, which on this
 * map is a curve for any path long enough to show it, with "A" and "B" at the ends.
 */
export function sightData({ from, to, mark, scrub }: SightOverlay): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  const point = (position: LatLon, properties: Record<string, string>) =>
    features.push({ type: "Feature", properties, geometry: { type: "Point", coordinates: [position.lon, position.lat] } });
  if (from && to) {
    const coordinates: Array<[number, number]> = [];
    let previous = from.lon;
    for (let index = 0; index <= PATH_PIECES; index += 1) {
      const position = index === 0 ? from : index === PATH_PIECES ? to : greatCirclePoint(from, to, index / PATH_PIECES);
      // Kept continuous across the 180° meridian, so the line does not run the long way round the map.
      let lon = position.lon;
      while (lon - previous > 180) lon -= 360;
      while (lon - previous < -180) lon += 360;
      previous = lon;
      coordinates.push([lon, position.lat]);
    }
    features.push({ type: "Feature", properties: { kind: "path" }, geometry: { type: "LineString", coordinates } });
  }
  if (mark) point(mark.position, { kind: "mark", label: mark.label });
  if (scrub) point(scrub, { kind: "scrub" });
  if (from) point(from, { kind: "end", label: "A" });
  if (to) point(to, { kind: "end", label: "B" });
  return { type: "FeatureCollection", features };
}
/** The places in the range's colour, numbered in the page colour; the lines of sight dashed, cased in the page colour. */
export function relayLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-relay-leg-casing",
      type: "line",
      source: "o-relay",
      filter: ["==", ["get", "kind"], "leg"],
      layout: { "line-cap": "round" },
      paint: { "line-color": theme.page, "line-width": 5.5, "line-opacity": 0.9 },
    },
    {
      id: "o-relay-leg",
      type: "line",
      source: "o-relay",
      filter: ["==", ["get", "kind"], "leg"],
      paint: { "line-color": theme.range, "line-width": 2.5, "line-dasharray": [2, 1.5] },
    },
    {
      id: "o-relay-point",
      type: "circle",
      source: "o-relay",
      filter: ["==", ["get", "kind"], "relay"],
      paint: {
        "circle-radius": ["case", ["get", "chosen"], 12, 9],
        "circle-color": theme.range,
        "circle-stroke-color": ["case", ["get", "chosen"], theme.ink, theme.page],
        "circle-stroke-width": ["case", ["get", "chosen"], 2.5, 2],
      },
    },
    {
      id: "o-relay-label",
      type: "symbol",
      source: "o-relay",
      filter: ["==", ["get", "kind"], "relay"],
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-size": 11.5,
        "text-field": ["get", "label"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": theme.page },
    },
  ];
}
