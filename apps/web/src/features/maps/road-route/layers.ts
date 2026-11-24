/**
 * A planned road route on the map: its main roads as a bold line, a crossing or a ferry dashed, the
 * leg chosen in the directions thicker, and the start, via points and end marked.
 */
import type { RoadRouteResult, StreetsRouteResult } from "@outpost/shared";
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

/** A route planned on streets as map data: Outpost's main roads where it has them, the streets thinner, and the ends. */
export function streetsRouteData(result: StreetsRouteResult, selected: number | null): FeatureCollection {
  const base: FeatureCollection = result.road ? roadRouteData(result.road, selected) : { type: "FeatureCollection", features: [] };
  const parts = [result.start, result.end, result.streets].filter((part) => part !== null);
  const streets: FeatureCollection["features"] = parts.map((part) => ({
    type: "Feature",
    properties: { kind: "street", selected: false },
    geometry: part.geometry,
  }));
  // A ferry on the way (taken only for want of another): dashed over the streets, as a crossing is on a drive.
  const ferries: FeatureCollection["features"] = parts.flatMap((part) =>
    (part.ferries ?? []).map((ferry) => ({
      type: "Feature" as const,
      properties: { kind: "crossing", selected: false },
      geometry: { type: "LineString" as const, coordinates: ferry.coordinates },
    })),
  );
  // On streets all the way, the ends are the walk's or the ride's own; a drive's are Outpost's route's points.
  const points: FeatureCollection["features"] = [];
  const line = result.streets?.geometry.coordinates;
  if (!result.road && line && line.length > 0) {
    const end = (role: "start" | "end", at: [number, number]) =>
      points.push({
        type: "Feature",
        properties: { kind: "point", role, label: role === "start" ? "Start" : "End" },
        geometry: { type: "Point", coordinates: at },
      });
    end("start", line[0]!);
    end("end", line.at(-1)!);
    // The via points of a walk or a ride, marked as a drive's are.
    result.request.points.slice(1, -1).forEach((point, index) => {
      if ("lat" in point)
        points.push({
          type: "Feature",
          properties: { kind: "point", role: "via", label: `Via ${index + 1}` },
          geometry: { type: "Point", coordinates: [point.lon, point.lat] },
        });
    });
  }
  return { type: "FeatureCollection", features: [...streets, ...base.features, ...ferries, ...points] };
}

/** Whatever the route panel is showing: a road route, or one planned on streets. */
export function shownRouteData(route: RoadRouteResult | StreetsRouteResult | null, selected: number | null): FeatureCollection {
  if (!route) return { type: "FeatureCollection", features: [] };
  return "mode" in route ? streetsRouteData(route, selected) : roadRouteData(route, selected);
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
      paint: {
        "line-color": theme.page,
        "line-width": ["case", ["==", ["get", "kind"], "street"], 7, ["get", "selected"], 13, 9] as never,
        "line-opacity": 0.92,
      },
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
      // Streets at the ends of a drive, or a whole walk or ride: thinner than a main road, so the two read apart in grey.
      id: "o-road-route-street",
      type: "line",
      source: ROAD_ROUTE_SOURCE,
      filter: kind("street"),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.primary, "line-width": 3.5 },
    },
    {
      // Under the dashes, the line beneath them taken out: a ferry over a walk's streets reads as dashes, not a solid line.
      id: "o-road-route-crossing-gap",
      type: "line",
      source: ROAD_ROUTE_SOURCE,
      filter: kind("crossing"),
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": width(5, 7) },
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
