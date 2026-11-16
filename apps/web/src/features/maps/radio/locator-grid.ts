/**
 * The Maidenhead grid as something to draw: the lines of the cells in view and a
 * label in the middle of each. Which cells depends on the zoom: fields from far out,
 * then squares, subsquares and extended squares as each grows wide enough on screen
 * to hold its own name. Pure, so it can be tested without a map.
 */
import { type Bbox, LOCATOR_CELLS, type LocatorLength, toMaidenhead } from "@outpost/shared";
import { MAX_LATITUDE, wrapLongitude } from "../lib/geo";
import type { FeatureCollection } from "../map/overlays";

/**
 * The zoom from which each size of cell is drawn. Fields are drawn from as far out as
 * the map goes; each smaller cell from where it is 60 pixels wide, which is room for
 * its locator.
 */
export const LOCATOR_MIN_ZOOM: Record<LocatorLength, number> = { 2: 0, 4: 4.5, 6: 9, 8: 12.5 };

const LENGTHS: LocatorLength[] = [2, 4, 6, 8];

/** The smallest cell drawn at a zoom. */
export function locatorLengthAt(zoom: number): LocatorLength {
  let length: LocatorLength = 2;
  for (const candidate of LENGTHS) if (zoom >= LOCATOR_MIN_ZOOM[candidate]) length = candidate;
  return length;
}

/** How much of the view is added on each side, so the grid is already there when the map is dragged a little. */
const MARGIN = 0.25;

type Feature = FeatureCollection["features"][number];

/**
 * The grid for a view. Lines of the smallest cell drawn at this zoom are `fine`; where a
 * line is also the edge of the cell one size up it is `coarse` instead, and drawn
 * heavier, so squares can be told from the subsquares inside them. Labels are for the
 * smallest cells only.
 */
export function locatorGrid(bounds: Bbox, zoom: number): FeatureCollection {
  const length = locatorLengthAt(zoom);
  const cell = LOCATOR_CELLS[length];
  const parent = length === 2 ? null : LOCATOR_CELLS[(length - 2) as LocatorLength];
  /** Cells of this size along the edge of the cell one size up: every so many lines is a coarse one. */
  const perParent = parent ? Math.round(parent.lon / cell.lon) : 0;

  // The map repeats sideways, so its edges may be past 180°. Work in those unwrapped
  // longitudes and wrap each piece as it is made.
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  const whole = width * (1 + 2 * MARGIN) >= 360;
  const west = whole ? -180 : bounds[0] - width * MARGIN;
  const east = whole ? 180 : bounds[2] + width * MARGIN;
  const south = Math.max(-90, bounds[1] - height * MARGIN);
  const north = Math.min(90, bounds[3] + height * MARGIN);

  const firstColumn = Math.floor((west + 180) / cell.lon);
  const lastColumn = Math.ceil((east + 180) / cell.lon);
  const firstRow = Math.max(0, Math.floor((south + 90) / cell.lat));
  const lastRow = Math.min(Math.round(180 / cell.lat), Math.ceil((north + 90) / cell.lat));
  const lonOf = (column: number) => column * cell.lon - 180;
  const latOf = (row: number) => row * cell.lat - 90;
  /** The Web Mercator map stops short of the poles. */
  const drawn = (lat: number) => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const weight = (index: number) => (perParent === 0 || index % perParent === 0 ? "coarse" : "fine");

  // Longer names are set smaller, to fit the cells they are first drawn in.
  const size = { 2: 14, 4: 13, 6: 12, 8: 10.5 }[length];
  const features: Feature[] = [];
  const line = (kind: string, coordinates: Array<[number, number]>) =>
    features.push({ type: "Feature", properties: { kind }, geometry: { type: "LineString", coordinates } });

  // Meridians, each from the bottom of the grid in view to the top.
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    // On a view of the whole world the last meridian is the first one again.
    if (whole && column === lastColumn) break;
    const lon = wrapLongitude(lonOf(column));
    line(weight(column), [
      [lon, drawn(latOf(firstRow))],
      [lon, drawn(latOf(lastRow))],
    ]);
  }
  // Parallels, in one piece or, where the view spans the 180° meridian, one each side of it.
  const spans: Array<[number, number]> = [];
  const [from, to] = [lonOf(firstColumn), lonOf(lastColumn)];
  if (whole || (from >= -180 && to <= 180)) spans.push([Math.max(-180, from), Math.min(180, to)]);
  else if (from < -180) spans.push([from + 360, 180], [-180, to]);
  else spans.push([from, 180], [-180, to - 360]);
  for (let row = firstRow; row <= lastRow; row += 1) {
    const lat = latOf(row);
    if (Math.abs(lat) > MAX_LATITUDE) continue;
    for (const [start, end] of spans) {
      line(weight(row), [
        [start, lat],
        [end, lat],
      ]);
    }
  }
  // A name in the middle of every cell.
  for (let column = firstColumn; column < lastColumn; column += 1) {
    const lon = wrapLongitude(lonOf(column) + cell.lon / 2);
    for (let row = firstRow; row < lastRow; row += 1) {
      const lat = latOf(row) + cell.lat / 2;
      if (Math.abs(lat) > MAX_LATITUDE) continue;
      const text = toMaidenhead(lat, lon, length);
      if (text) {
        features.push({ type: "Feature", properties: { kind: "label", text, size }, geometry: { type: "Point", coordinates: [lon, lat] } });
      }
    }
  }
  return { type: "FeatureCollection", features };
}
