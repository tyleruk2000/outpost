/**
 * The ground a walk reaches, on the map, apart from React: the grid of minutes made into a picture shaded by the
 * hour, the rings at each hour traced round it, and the layers that draw the rings.
 */

import type { Bbox } from "@outpost/shared";
import { decodeBits, EARTH_RADIUS_METERS, type WalkReach } from "@outpost/shared";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import type { FeatureCollection } from "../map/overlays";
import { paintShade, rgbOf, type ShadePicture } from "../map/shades";

export const WALK_SOURCE = "o-walk";
/** How solid the shading is at its strongest, within the first hour; later hours are paler. */
export const WALK_SHADE_OPACITY = 0.5;
const NEVER = 255;
const DEG = Math.PI / 180;

/** The share of full strength for each band: within the first hour (or half hour, for a short walk), the next, … */
const BAND_STRENGTH = [1, 0.7, 0.5, 0.36];

/** The minutes between rings: half an hour for a walk of an hour or less, an hour for longer. */
export const ringStep = (minutes: number) => (minutes <= 60 ? 30 : 60);

export interface WalkGrid {
  reach: WalkReach;
  minutes: Uint8Array;
  half: number;
}

export function walkGrid(reach: WalkReach): WalkGrid | null {
  if (reach.coverage === "none" || !reach.minutesGrid) return null;
  return { reach, minutes: decodeBits(reach.minutesGrid), half: (reach.size - 1) / 2 };
}

/** The grid cell a place falls in, as column and row (fractional), on the plane the server laid the grid out on. */
export function cellOf(grid: WalkGrid, lat: number, lon: number): { column: number; row: number } {
  const { at, cellMeters } = grid.reach;
  return {
    column: grid.half + ((lon - at.lon) * DEG * EARTH_RADIUS_METERS * Math.cos(at.lat * DEG)) / cellMeters,
    row: grid.half - ((lat - at.lat) * DEG * EARTH_RADIUS_METERS) / cellMeters,
  };
}

/** Minutes to reach a place, or null where the walk does not reach it. */
export function minutesAt(grid: WalkGrid, lat: number, lon: number): number | null {
  const { column, row } = cellOf(grid, lat, lon);
  const c = Math.round(column);
  const r = Math.round(row);
  const { size } = grid.reach;
  if (c < 0 || r < 0 || c >= size || r >= size) return null;
  const value = grid.minutes[r * size + c]!;
  return value === NEVER ? null : value;
}

/** The box the reach fills, to bring it into view. */
export function walkBounds(reach: WalkReach): Bbox {
  const extent = Math.max(300, reach.furthestMeters + reach.cellMeters);
  const lat = extent / EARTH_RADIUS_METERS / DEG;
  const lon = lat / Math.max(0.05, Math.cos(reach.at.lat * DEG));
  return [reach.at.lon - lon, reach.at.lat - lat, reach.at.lon + lon, reach.at.lat + lat];
}

/** The ground reached as a picture: in the walk's colour, strongest in the first band and paler by the hour. */
export function walkShade(grid: WalkGrid, colour: string, pixels = 1536): ShadePicture | null {
  if (grid.reach.furthestMeters <= 0) return null;
  const [west, south, east, north] = walkBounds(grid.reach);
  const [red, green, blue] = rgbOf(colour);
  const step = ringStep(grid.reach.minutes);
  return paintShade({ west, south, east, north }, { pixels, finestMeters: grid.reach.cellMeters / 2 }, (lat, lon, out, offset) => {
    const minutes = minutesAt(grid, lat, lon);
    if (minutes === null) return;
    const band = Math.min(BAND_STRENGTH.length - 1, Math.floor(minutes / step));
    out[offset] = red;
    out[offset + 1] = green;
    out[offset + 2] = blue;
    out[offset + 3] = Math.round(255 * BAND_STRENGTH[band]!);
  });
}

/**
 * The line round the ground reached within `limit` minutes, traced through the grid (marching squares, between cell
 * centres), as segments in longitude and latitude.
 */
export function ringAt(grid: WalkGrid, limit: number): Array<[[number, number], [number, number]]> {
  const { size, at, cellMeters } = grid.reach;
  const inside = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= size || r >= size) return false;
    const value = grid.minutes[r * size + c]!;
    return value !== NEVER && value < limit;
  };
  const point = (c: number, r: number): [number, number] => [
    Number((at.lon + ((c - grid.half) * cellMeters) / (EARTH_RADIUS_METERS * Math.cos(at.lat * DEG)) / DEG).toFixed(6)),
    Number((at.lat + ((grid.half - r) * cellMeters) / EARTH_RADIUS_METERS / DEG).toFixed(6)),
  ];
  const segments: Array<[[number, number], [number, number]]> = [];
  // Each square of four cell centres: the edges where inside meets outside, joined at their midpoints.
  for (let r = -1; r < size; r += 1) {
    for (let c = -1; c < size; c += 1) {
      const a = inside(c, r);
      const b = inside(c + 1, r);
      const d = inside(c, r + 1);
      const e = inside(c + 1, r + 1);
      const code = (a ? 8 : 0) | (b ? 4 : 0) | (e ? 2 : 0) | (d ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = point(c + 0.5, r);
      const right = point(c + 1, r + 0.5);
      const bottom = point(c + 0.5, r + 1);
      const left = point(c, r + 0.5);
      const pairs: Record<number, Array<[[number, number], [number, number]]>> = {
        1: [[left, bottom]],
        2: [[bottom, right]],
        3: [[left, right]],
        4: [[top, right]],
        5: [
          [left, top],
          [bottom, right],
        ],
        6: [[top, bottom]],
        7: [[left, top]],
        8: [[left, top]],
        9: [[top, bottom]],
        10: [
          [top, right],
          [left, bottom],
        ],
        11: [[top, right]],
        12: [[left, right]],
        13: [[bottom, right]],
        14: [[left, bottom]],
      };
      segments.push(...(pairs[code] ?? []));
    }
  }
  return segments;
}

/** A time as a ring is labelled: "30 min", "1 h", "1 h 30 min". */
export function formatWalkTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The rings at each half hour or hour, each labelled once at its northernmost point. */
export function walkData(grid: WalkGrid | null): FeatureCollection {
  if (!grid) return { type: "FeatureCollection", features: [] };
  const features: FeatureCollection["features"] = [];
  const step = ringStep(grid.reach.minutes);
  for (let limit = step; limit <= grid.reach.minutes; limit += step) {
    const segments = ringAt(grid, limit);
    if (segments.length === 0) continue;
    features.push({ type: "Feature", properties: { kind: "ring" }, geometry: { type: "MultiLineString", coordinates: segments } });
    let top = segments[0]![0];
    for (const segment of segments) for (const end of segment) if (end[1] > top[1]) top = end;
    features.push({
      type: "Feature",
      properties: { kind: "label", label: formatWalkTime(limit) },
      geometry: { type: "Point", coordinates: top },
    });
  }
  return { type: "FeatureCollection", features };
}

/** The rings in the walk's colour, cased in the page colour; their times in ink. */
export function walkLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-walk-casing",
      type: "line",
      source: WALK_SOURCE,
      filter: ["==", ["get", "kind"], "ring"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.page, "line-width": 3.5, "line-opacity": 0.6 },
    },
    {
      id: "o-walk-ring",
      type: "line",
      source: WALK_SOURCE,
      filter: ["==", ["get", "kind"], "ring"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.walk, "line-width": 1.5 },
    },
    {
      id: "o-walk-label",
      type: "symbol",
      source: WALK_SOURCE,
      filter: ["==", ["get", "kind"], "label"],
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 11.5,
        "text-anchor": "bottom",
        "text-offset": [0, -0.2],
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
  ];
}
