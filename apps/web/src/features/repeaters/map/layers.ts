/**
 * Repeaters as the map draws them. Where there are few enough in view to tell apart,
 * each is a small mark in the ink colour, its shape saying its band (band-shapes.tsx),
 * with its callsign, and from closer in its frequency; where there are more, the server counts them by patch and each patch is a
 * numbered disc. Either way they sit under saved places and routes, and their names
 * give way to the map's own, so switching them on never buries the map.
 */
import { formatMHz, type RepeaterOverlayResponse } from "@outpost/shared";
import { circleRing } from "@/features/maps/lib/geo";
import { MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
import { formatNumber } from "@/lib/utils";
import { bandShape } from "./band-shapes";

export const REPEATER_SOURCE = "o-repeaters";

export function repeaterLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      // The "within" distance of the list, round the place it is measured from (the Repeaters screen's map only).
      id: "o-repeaters-within",
      type: "line",
      source: REPEATER_SOURCE,
      filter: ["==", ["get", "kind"], "within"],
      paint: { "line-color": theme.primary, "line-width": 1.75, "line-dasharray": [3, 2], "line-opacity": 0.9 },
    },
    {
      id: "o-repeaters-cell",
      type: "circle",
      source: REPEATER_SOURCE,
      filter: ["==", ["get", "kind"], "cell"],
      paint: {
        // Larger for more, but gently: a patch of a thousand is not ten times a patch of a hundred.
        "circle-radius": ["interpolate", ["linear"], ["get", "count"], 2, 11, 100, 15, 1000, 19, 10000, 23],
        "circle-color": theme.page,
        "circle-opacity": 0.94,
        "circle-stroke-color": theme.ink,
        "circle-stroke-width": 1.5,
      },
    },
    {
      id: "o-repeaters-cell-label",
      type: "symbol",
      source: REPEATER_SOURCE,
      filter: ["==", ["get", "kind"], "cell"],
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 11.5,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": theme.ink },
    },
    {
      id: "o-repeaters-selected",
      type: "circle",
      source: REPEATER_SOURCE,
      filter: ["==", ["get", "kind"], "selected"],
      paint: { "circle-radius": 12, "circle-opacity": 0, "circle-stroke-color": theme.primary, "circle-stroke-width": 3 },
    },
    {
      id: "o-repeaters-point",
      type: "symbol",
      source: REPEATER_SOURCE,
      filter: ["==", ["get", "kind"], "point"],
      layout: {
        // The band by its shape, in the ink colour; one its list says is not operational is drawn hollow. The card says so in words.
        "icon-image": [
          "concat",
          "repeater-",
          ["get", "shape"],
          ["case", ["get", "offAir"], `|${theme.page}|${theme.ink}|${theme.page}`, `|${theme.ink}|${theme.ink}|${theme.page}`],
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    {
      id: "o-repeaters-label",
      type: "symbol",
      source: REPEATER_SOURCE,
      filter: ["==", ["get", "kind"], "point"],
      minzoom: 7.5,
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        // The callsign, and from closer in the frequency to listen on beneath it.
        "text-field": ["step", ["zoom"], ["get", "callsign"], 10.5, ["get", "detail"]],
        "text-size": 11.5,
        "text-anchor": "top",
        "text-offset": [0, 0.65],
        "text-max-width": 9,
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.5 },
    },
  ];
}

/**
 * What the server gave for the view, as map data, with a ring round the repeater that is open and, on the Repeaters
 * screen, the dashed circle of the list's "within" distance.
 */
export function repeatersData(
  overlay: RepeaterOverlayResponse | undefined,
  selected: { lat: number; lon: number } | null,
  within?: { centre: { lat: number; lon: number }; meters: number } | null,
): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  if (within) {
    features.push({
      type: "Feature",
      properties: { kind: "within" },
      geometry: { type: "LineString", coordinates: circleRing(within.centre, within.meters, 96) },
    });
  }
  const at = (lon: number, lat: number) => ({ type: "Point", coordinates: [lon, lat] });
  for (const cell of overlay?.cells ?? []) {
    features.push({
      type: "Feature",
      properties: { kind: "cell", count: cell.count, label: formatNumber(cell.count) },
      geometry: at(cell.lon, cell.lat),
    });
  }
  for (const point of overlay?.points ?? []) {
    features.push({
      type: "Feature",
      properties: {
        kind: "point",
        id: point.id,
        callsign: point.callsign,
        detail: `${point.callsign}\n${formatMHz(point.outputHz)}`,
        offAir: point.status === "off-air",
        shape: bandShape(point.band),
      },
      geometry: at(point.lon, point.lat),
    });
  }
  if (selected) features.push({ type: "Feature", properties: { kind: "selected" }, geometry: at(selected.lon, selected.lat) });
  return { type: "FeatureCollection", features };
}

/** The view as the server is asked about it: a box in degrees, rounded so that a small nudge of the map asks nothing new. */
export function overlayBox(bounds: [number, number, number, number]): string {
  const [west, south, east, north] = bounds;
  const height = Math.max(north - south, 0.001);
  // The box is rounded outwards to a power of ten of a degree, no more than half the view's height.
  const step = 10 ** Math.floor(Math.log10(height / 2));
  const down = (value: number) => Math.floor(value / step) * step;
  const up = (value: number) => Math.ceil(value / step) * step;
  const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  const lats = [Math.max(-90, down(south)), Math.min(90, up(north))];
  // A view wider than the world is the whole world; one across the 180° meridian has its west edge east of its east edge.
  const lons = east - west >= 360 ? [-180, 180] : [wrap(down(west)), wrap(up(east)) === -180 && east > 0 ? 180 : wrap(up(east))];
  return [lons[0]!, lats[0]!, lons[1]!, lats[1]!].map((value) => value.toFixed(digits)).join(",");
}

export interface OverlayHit {
  kind: "point" | "cell";
  id?: string;
  lat: number;
  lon: number;
}

/**
 * The repeater or patch nearest a press, if one is within reach. Worked out from the
 * data that was drawn and where it is on screen, so the map engine needs to know
 * nothing about repeaters.
 */
export function nearestHit(
  overlay: RepeaterOverlayResponse | undefined,
  press: { x: number; y: number },
  project: (position: { lat: number; lon: number }) => { x: number; y: number },
  reach = 22,
): OverlayHit | null {
  let best: (OverlayHit & { distance: number }) | null = null;
  const consider = (hit: OverlayHit) => {
    const point = project(hit);
    const distance = Math.hypot(point.x - press.x, point.y - press.y);
    // A single repeater wins over a patch it sits beside.
    const weighted = hit.kind === "point" ? distance : distance + 4;
    if (distance <= reach && (!best || weighted < best.distance)) best = { ...hit, distance: weighted };
  };
  for (const point of overlay?.points ?? []) consider({ kind: "point", id: point.id, lat: point.lat, lon: point.lon });
  for (const cell of overlay?.cells ?? []) consider({ kind: "cell", lat: cell.lat, lon: cell.lon });
  if (!best) return null;
  const { distance: _distance, ...hit } = best as OverlayHit & { distance: number };
  return hit;
}
