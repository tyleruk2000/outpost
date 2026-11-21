/**
 * Lines across the map on screen that point to magnetic north, as on the printed sheet
 * (print/sheet.ts): one set for the view, at the declination the World Magnetic Model
 * gives for its centre today.
 *
 * On a Web Mercator map a line of one bearing is straight, so each line is two points.
 * The lines are worked out in the map's own square (0 to 1 each way) and stand on a
 * lattice fixed to that square, so they stay put while the map is dragged and only move
 * as the declination at the centre changes.
 */
import { type Bbox, northsAt } from "@outpost/shared";
import type { FeatureCollection } from "../map/overlays";
import { latitudeAt, longitudeAt, mercatorX, mercatorY } from "../print/scale";

/** How far apart the lines are on screen, in CSS pixels. */
export const MAGNETIC_SPACING_PX = 140;

/** Magnetic declination at a point today, east positive; null outside the model's years or where it cannot be worked out. */
export function declinationAt(lat: number, lon: number, when: Date = new Date()): number | null {
  try {
    const value = northsAt(lat, lon, when).declination;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

type Point = [number, number];

/** Where the line through `point` along `direction` enters and leaves the box, if it does (Liang–Barsky). */
function clip(point: Point, direction: Point, box: { left: number; top: number; right: number; bottom: number }): [Point, Point] | null {
  let low = Number.NEGATIVE_INFINITY;
  let high = Number.POSITIVE_INFINITY;
  const sides: Array<[number, number, number]> = [
    [direction[0], point[0], box.left],
    [-direction[0], -point[0], -box.right],
    [direction[1], point[1], box.top],
    [-direction[1], -point[1], -box.bottom],
  ];
  for (const [d, p, edge] of sides) {
    if (Math.abs(d) < 1e-15) {
      if (p < edge) return null;
      continue;
    }
    const t = (edge - p) / d;
    if (d > 0) low = Math.max(low, t);
    else high = Math.min(high, t);
  }
  if (low >= high) return null;
  return [
    [point[0] + low * direction[0], point[1] + low * direction[1]],
    [point[0] + high * direction[0], point[1] + high * direction[1]],
  ];
}

/**
 * The lines for a view: `bounds` west, south, east, north; `zoom` the map's; `declination`
 * in degrees, east positive. Each line runs from south to north, so its end is the north end.
 */
export function magneticLines(bounds: Bbox, zoom: number, declination: number, spacingPx = MAGNETIC_SPACING_PX): FeatureCollection {
  const spacing = spacingPx / (512 * 2 ** zoom);
  // A margin of one spacing, so no line starts or stops inside the view.
  const box = {
    left: mercatorX(bounds[0]) - spacing,
    right: mercatorX(bounds[2]) + spacing,
    top: Math.max(0, mercatorY(bounds[3]) - spacing),
    bottom: Math.min(1, mercatorY(bounds[1]) + spacing),
  };
  const angle = (declination * Math.PI) / 180;
  // In the map's square x runs east and y runs south: north is up, and magnetic north is `declination` clockwise of it.
  const along: Point = [Math.sin(angle), -Math.cos(angle)];
  const across: Point = [Math.cos(angle), Math.sin(angle)];
  const corners: Point[] = [
    [box.left, box.top],
    [box.right, box.top],
    [box.left, box.bottom],
    [box.right, box.bottom],
  ];
  const offsets = corners.map(([x, y]) => x * across[0] + y * across[1]);
  const first = Math.ceil(Math.min(...offsets) / spacing);
  const last = Math.floor(Math.max(...offsets) / spacing);
  const features: FeatureCollection["features"] = [];
  // Never more than a screenful's worth, whatever is asked.
  if (last - first > 400) return { type: "FeatureCollection", features };
  for (let k = first; k <= last; k += 1) {
    const through: Point = [k * spacing * across[0], k * spacing * across[1]];
    const segment = clip(through, along, box);
    if (!segment) continue;
    // `along` points north, so the second end is the north one.
    const [south, north] = segment;
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [longitudeAt(south[0]), latitudeAt(south[1])],
          [longitudeAt(north[0]), latitudeAt(north[1])],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
