/** The back-bearings, their crossings, the triangle of error and the point found, as map data and the layers that draw them. */
import type { LatLon } from "../lib/geo";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import type { FeatureCollection } from "../map/overlays";
import type { Resection } from "./resection";

export const RESECTION_SOURCE = "o-resection";

/** The letters the landmarks go by, on the card and on the map. */
export const LANDMARK_LETTERS = ["A", "B", "C"] as const;

const point = (position: LatLon, properties: Record<string, string>) => ({
  type: "Feature" as const,
  properties,
  geometry: { type: "Point", coordinates: [position.lon, position.lat] },
});

/** The landmarks chosen so far (null for one still to be chosen) and what was worked out from them. */
export function resectionData(landmarks: Array<LatLon | null>, result: Resection | null, lineOf: number[]): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  if (result) {
    if (result.triangle) {
      const ring = [...result.triangle, result.triangle[0]].map((corner) => [corner.lon, corner.lat]);
      features.push({ type: "Feature", properties: { kind: "triangle" }, geometry: { type: "Polygon", coordinates: [ring] } });
    }
    result.lines.forEach((line, index) => {
      features.push({
        type: "Feature",
        properties: { kind: "line", label: LANDMARK_LETTERS[lineOf[index]!] ?? "" },
        geometry: {
          type: "LineString",
          coordinates: [
            [line.from.lon, line.from.lat],
            [line.to.lon, line.to.lat],
          ],
        },
      });
    });
    if (result.fix) features.push(point(result.fix, { kind: "fix" }));
  }
  landmarks.forEach((landmark, index) => {
    if (landmark) features.push(point(landmark, { kind: "landmark", label: LANDMARK_LETTERS[index]! }));
  });
  return { type: "FeatureCollection", features };
}

export function resectionLayers(theme: MapTheme): LayerSpecification[] {
  const kind = (value: string) => ["==", ["get", "kind"], value];
  return [
    {
      id: "o-resection-triangle",
      type: "fill",
      source: RESECTION_SOURCE,
      filter: kind("triangle") as never,
      paint: { "fill-color": theme.primary, "fill-opacity": 0.18 },
    },
    {
      id: "o-resection-triangle-edge",
      type: "line",
      source: RESECTION_SOURCE,
      filter: kind("triangle") as never,
      paint: { "line-color": theme.primary, "line-width": 1.5 },
    },
    {
      id: "o-resection-casing",
      type: "line",
      source: RESECTION_SOURCE,
      filter: kind("line") as never,
      layout: { "line-cap": "round" },
      paint: { "line-color": theme.page, "line-width": 5, "line-opacity": 0.85 },
    },
    {
      id: "o-resection-line",
      type: "line",
      source: RESECTION_SOURCE,
      filter: kind("line") as never,
      paint: { "line-color": theme.ink, "line-width": 2, "line-dasharray": [3, 1.5] },
    },
    {
      id: "o-resection-landmark",
      type: "circle",
      source: RESECTION_SOURCE,
      filter: kind("landmark") as never,
      paint: { "circle-radius": 9, "circle-color": theme.ink, "circle-stroke-color": theme.page, "circle-stroke-width": 2 },
    },
    {
      id: "o-resection-landmark-letter",
      type: "symbol",
      source: RESECTION_SOURCE,
      filter: kind("landmark") as never,
      layout: { "text-field": ["get", "label"], "text-font": [MAP_FONTS.medium], "text-size": 12, "text-allow-overlap": true },
      paint: { "text-color": theme.page },
    },
    {
      id: "o-resection-fix",
      type: "circle",
      source: RESECTION_SOURCE,
      filter: kind("fix") as never,
      paint: { "circle-radius": 6, "circle-color": theme.primary, "circle-stroke-color": theme.page, "circle-stroke-width": 2.5 },
    },
  ];
}
