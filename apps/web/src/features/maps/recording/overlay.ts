/**
 * The recording as it is drawn on the map: its line so far, and a dot where it ends
 * while it is live. Kept apart from saved routes, which are drawn in their own colours:
 * this line is ink, and the dot is the lamp, which in Outpost means "alive right now".
 */
import type { MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import type { FeatureCollection } from "../map/overlays";

export const RECORDING_SOURCE = "o-recording";

export function recordingLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-recording-casing",
      type: "line",
      source: RECORDING_SOURCE,
      filter: ["!=", ["geometry-type"], "Point"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": 7, "line-opacity": 0.9 },
    },
    {
      id: "o-recording-line",
      type: "line",
      source: RECORDING_SOURCE,
      filter: ["!=", ["geometry-type"], "Point"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.ink, "line-width": 3.5 },
    },
    {
      id: "o-recording-head",
      type: "circle",
      source: RECORDING_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 6.5, "circle-color": theme.lamp, "circle-stroke-color": theme.ink, "circle-stroke-width": 2.5 },
    },
  ];
}

/**
 * `lines` are the stretches recorded so far. `head` is where the device is now, shown
 * only while positions are being kept.
 */
export function recordingData(
  lines: Array<Array<[lon: number, lat: number]>>,
  head: { lat: number; lon: number } | null,
): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  const drawable = lines.filter((line) => line.length >= 2);
  if (drawable.length > 0) features.push({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: drawable } });
  if (head) features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [head.lon, head.lat] } });
  return { type: "FeatureCollection", features };
}
