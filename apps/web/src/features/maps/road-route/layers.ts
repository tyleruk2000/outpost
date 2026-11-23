/**
 * A planned road route on the map: its main roads as a bold line, a crossing dashed, the
 * leg chosen in the directions thicker, and the start, via points and end marked.
 */
import type { RoadRouteResult } from "@outpost/shared";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import type { FeatureCollection } from "../map/overlays";
import { legLines } from "./words";

export const ROAD_ROUTE_SOURCE = "o-road-route";

/** The route as map data; `selected` is the index of the leg to draw thicker, or null. */
export function roadRouteData(route: RoadRouteResult | null, selected: number | null): FeatureCollection {
  if (!route) return { type: "FeatureCollection", features: [] };
  const features: FeatureCollection["features"] = [];
  const parts = legLines(route);
  route.legs.forEach((leg, index) => {
    for (const line of parts[index] ?? []) {
      features.push({
        type: "Feature",
        properties: { kind: leg.kind === "crossing" ? "crossing" : "road", leg: index, selected: selected === index },
        geometry: { type: "LineString", coordinates: line },
      });
    }
  });
  const last = route.snapped.length - 1;
  route.snapped.forEach((point, index) => {
    const label = index === 0 ? "Start" : index === last ? "End" : `Via ${index}`;
    features.push({
      type: "Feature",
      properties: { kind: "point", role: index === 0 ? "start" : index === last ? "end" : "via", label },
      geometry: { type: "Point", coordinates: [point.input.lon, point.input.lat] },
    });
  });
  return { type: "FeatureCollection", features };
}

export function roadRouteLayers(theme: MapTheme): LayerSpecification[] {
  const kind = (value: string) => ["==", ["get", "kind"], value] as never;
  const width = (normal: number, chosen: number) => ["case", ["get", "selected"], chosen, normal] as never;
  return [
    {
      id: "o-road-route-casing",
      type: "line",
      source: ROAD_ROUTE_SOURCE,
      filter: ["==", ["geometry-type"], "LineString"] as never,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": width(9, 13), "line-opacity": 0.92 },
    },
    {
      id: "o-road-route-road",
      type: "line",
      source: ROAD_ROUTE_SOURCE,
      filter: kind("road"),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.primary, "line-width": width(5, 8) },
    },
    {
      id: "o-road-route-crossing",
      type: "line",
      source: ROAD_ROUTE_SOURCE,
      filter: kind("crossing"),
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": theme.ink, "line-width": width(3.5, 6), "line-dasharray": [2, 1.5] },
    },
    {
      id: "o-road-route-point",
      type: "circle",
      source: ROAD_ROUTE_SOURCE,
      filter: kind("point"),
      paint: {
        "circle-radius": 7,
        "circle-color": ["case", ["==", ["get", "role"], "via"], theme.page, theme.ink] as never,
        "circle-stroke-color": ["case", ["==", ["get", "role"], "via"], theme.ink, theme.page] as never,
        "circle-stroke-width": 2.5,
      },
    },
    {
      id: "o-road-route-point-label",
      type: "symbol",
      source: ROAD_ROUTE_SOURCE,
      filter: kind("point"),
      layout: {
        "text-font": [MAP_FONTS.medium],
        "text-size": 12.5,
        "text-field": ["get", "label"] as never,
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
  ];
}
