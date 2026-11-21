/** Lines of position, the fix and its error ellipse from Celestial navigation, as map data and the layers that draw them. */
import { offset } from "@outpost/shared/sky";
import { MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
import type { CelnavPlot } from "./sights";

export const CELNAV_SOURCE = "o-celnav";

/** The ellipse's outline: semi-axes in nautical miles, the long one along a bearing. */
function ellipseRing(centre: { lat: number; lon: number }, major: number, minor: number, bearing: number): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  const b = (bearing * Math.PI) / 180;
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * 2 * Math.PI;
    const along = major * Math.cos(t);
    const across = minor * Math.sin(t);
    const east = along * Math.sin(b) + across * Math.cos(b);
    const north = along * Math.cos(b) - across * Math.sin(b);
    const p = offset(centre, east, north);
    ring.push([p.lon, p.lat]);
  }
  return ring;
}

export function celnavData(plot: CelnavPlot | null): FeatureCollection {
  if (!plot) return { type: "FeatureCollection", features: [] };
  const features: FeatureCollection["features"] = plot.lines.map((line) => ({
    type: "Feature",
    properties: { kind: "line", label: line.label },
    geometry: {
      type: "LineString",
      coordinates: line.ends.map((end) => [end.lon, end.lat]),
    },
  }));
  features.push({
    type: "Feature",
    properties: { kind: "dr", label: "DR" },
    geometry: { type: "Point", coordinates: [plot.dr.lon, plot.dr.lat] },
  });
  if (plot.fix) {
    // At least a few cables across, so that it can be seen.
    const ring = ellipseRing(plot.fix, Math.max(0.2, plot.fix.major), Math.max(0.2, plot.fix.minor), plot.fix.bearing);
    features.push({ type: "Feature", properties: { kind: "ellipse" }, geometry: { type: "Polygon", coordinates: [ring] } });
    features.push({ type: "Feature", properties: { kind: "fix" }, geometry: { type: "Point", coordinates: [plot.fix.lon, plot.fix.lat] } });
  }
  return { type: "FeatureCollection", features };
}

export function celnavLayers(theme: MapTheme): LayerSpecification[] {
  const kind = (value: string) => ["==", ["get", "kind"], value];
  return [
    {
      id: "o-celnav-ellipse",
      type: "fill",
      source: CELNAV_SOURCE,
      filter: kind("ellipse") as never,
      paint: { "fill-color": theme.primary, "fill-opacity": 0.18 },
    },
    {
      id: "o-celnav-ellipse-edge",
      type: "line",
      source: CELNAV_SOURCE,
      filter: kind("ellipse") as never,
      paint: { "line-color": theme.primary, "line-width": 1.5, "line-dasharray": [2, 1.5] },
    },
    {
      id: "o-celnav-casing",
      type: "line",
      source: CELNAV_SOURCE,
      filter: kind("line") as never,
      layout: { "line-cap": "round" },
      paint: { "line-color": theme.page, "line-width": 5, "line-opacity": 0.85 },
    },
    {
      id: "o-celnav-line",
      type: "line",
      source: CELNAV_SOURCE,
      filter: kind("line") as never,
      paint: { "line-color": theme.ink, "line-width": 2 },
    },
    {
      id: "o-celnav-line-label",
      type: "symbol",
      source: CELNAV_SOURCE,
      filter: kind("line") as never,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "label"],
        "text-font": [MAP_FONTS.medium],
        "text-size": 12,
        "text-offset": [0, -0.9],
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.5 },
    },
    {
      id: "o-celnav-dr",
      type: "circle",
      source: CELNAV_SOURCE,
      filter: kind("dr") as never,
      paint: { "circle-radius": 5, "circle-color": theme.page, "circle-stroke-color": theme.ink, "circle-stroke-width": 2 },
    },
    {
      id: "o-celnav-fix",
      type: "circle",
      source: CELNAV_SOURCE,
      filter: kind("fix") as never,
      paint: { "circle-radius": 6, "circle-color": theme.primary, "circle-stroke-color": theme.page, "circle-stroke-width": 2.5 },
    },
  ];
}
