/**
 * Tile arithmetic for PMTiles.
 *
 * A PMTiles archive numbers every tile of the pyramid with one integer, the tile id:
 * zoom 0 is id 0, zoom 1 is ids 1–4, and so on, and within a zoom tiles are ordered
 * along a Hilbert curve. The curve has a property this module leans on: every cell of
 * the quadtree is one unbroken run of ids. A box on the map can therefore be described
 * as a short list of id ranges by walking down the quadtree and stopping wherever a
 * cell is entirely inside or outside the box, without ever listing single tiles.
 */
import type { Bbox } from "@outpost/shared";

/** Beyond zoom 26 tile ids no longer fit a double exactly. */
export const MAX_ZOOM = 26;

/** Web Mercator stops here; tiles do not exist beyond it. */
export const MAX_LATITUDE = 85.0511287798066;

/** A run of tile ids, `end` exclusive. */
export interface TileRange {
  start: number;
  end: number;
}

/** Id of the first tile of zoom `z`: the number of tiles in all the zooms above it. */
export function zoomBase(z: number): number {
  return (4 ** z - 1) / 3;
}

/** Position of a tile along the Hilbert curve of its own zoom. */
function hilbertIndex(z: number, x: number, y: number): number {
  let index = 0;
  let tx = x;
  let ty = y;
  for (let level = z - 1; level >= 0; level -= 1) {
    const s = 2 ** level;
    const rx = (tx & s) > 0 ? 1 : 0;
    const ry = (ty & s) > 0 ? 1 : 0;
    index += s * s * ((3 * rx) ^ ry);
    // Rotate the quadrant so the curve stays continuous one level down. Only the bits
    // below `s` are looked at again, so masking them off keeps the numbers small.
    const lowX = tx & (s - 1);
    const lowY = ty & (s - 1);
    if (ry === 0) {
      if (rx === 1) {
        tx = s - 1 - lowY;
        ty = s - 1 - lowX;
      } else {
        tx = lowY;
        ty = lowX;
      }
    } else {
      tx = lowX;
      ty = lowY;
    }
  }
  return index;
}

export function zxyToTileId(z: number, x: number, y: number): number {
  if (!Number.isInteger(z) || z < 0 || z > MAX_ZOOM) throw new RangeError(`Zoom ${z} is outside 0–${MAX_ZOOM}.`);
  const size = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
    throw new RangeError(`Tile ${z}/${x}/${y} does not exist.`);
  }
  return zoomBase(z) + hilbertIndex(z, x, y);
}

export function tileIdToZxy(id: number): [z: number, x: number, y: number] {
  if (!Number.isInteger(id) || id < 0) throw new RangeError(`Tile id ${id} is not valid.`);
  let z = 0;
  while (z < MAX_ZOOM && zoomBase(z + 1) <= id) z += 1;
  let rest = id - zoomBase(z);
  if (rest >= 4 ** z) throw new RangeError(`Tile id ${id} is beyond zoom ${MAX_ZOOM}.`);
  let x = 0;
  let y = 0;
  for (let s = 1; s < 2 ** z; s *= 2) {
    const quadrant = rest % 4;
    const rx = quadrant >> 1;
    const ry = (quadrant ^ rx) & 1;
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    rest = Math.floor(rest / 4);
  }
  return [z, x, y];
}

export interface TileRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Column and row of the tile containing a position, clamped to the edge of the world. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const size = 2 ** z;
  const clampedLat = clamp(lat, -MAX_LATITUDE, MAX_LATITUDE);
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  const x = Math.floor(((lon + 180) / 360) * size);
  const y = Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size);
  return { x: clamp(x, 0, size - 1), y: clamp(y, 0, size - 1) };
}

/** The rectangle of tiles a box touches at one zoom. */
export function bboxToTileRect(bbox: Bbox, z: number): TileRect {
  const [west, south, east, north] = bbox;
  const topLeft = lonLatToTile(west, north, z);
  const bottomRight = lonLatToTile(east, south, z);
  return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
}

/** Geographic extent of one tile. */
export function tileToBbox(z: number, x: number, y: number): Bbox {
  const size = 2 ** z;
  const lat = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / size))) * 180) / Math.PI;
  return [(x / size) * 360 - 180, lat(y + 1), ((x + 1) / size) * 360 - 180, lat(y)];
}

function collectRanges(z: number, rect: TileRect, out: TileRange[]): void {
  const base = zoomBase(z);
  const descend = (level: number, cx: number, cy: number): void => {
    // The cell (level, cx, cy) covers a square of `span` tiles at zoom z.
    const span = 2 ** (z - level);
    const x0 = cx * span;
    const y0 = cy * span;
    const x1 = x0 + span - 1;
    const y1 = y0 + span - 1;
    if (x1 < rect.minX || x0 > rect.maxX || y1 < rect.minY || y0 > rect.maxY) return;
    if (x0 >= rect.minX && x1 <= rect.maxX && y0 >= rect.minY && y1 <= rect.maxY) {
      const start = base + hilbertIndex(level, cx, cy) * span * span;
      out.push({ start, end: start + span * span });
      return;
    }
    descend(level + 1, cx * 2, cy * 2);
    descend(level + 1, cx * 2 + 1, cy * 2);
    descend(level + 1, cx * 2, cy * 2 + 1);
    descend(level + 1, cx * 2 + 1, cy * 2 + 1);
  };
  descend(0, 0, 0);
}

/** Sorts ranges and joins any that touch or overlap. */
export function mergeRanges(ranges: TileRange[]): TileRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: TileRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

/**
 * Every tile a box touches between two zooms, as sorted, non-overlapping id ranges.
 * A box that crosses the antimeridian (west greater than east) is covered as two halves.
 */
export function bboxToTileRanges(bbox: Bbox, minZoom: number, maxZoom: number): TileRange[] {
  const [west, south, east, north] = bbox;
  const boxes: Bbox[] =
    west > east
      ? [
          [west, south, 180, north],
          [-180, south, east, north],
        ]
      : [bbox];
  const ranges: TileRange[] = [];
  for (let z = minZoom; z <= maxZoom; z += 1) {
    for (const box of boxes) collectRanges(z, bboxToTileRect(box, z), ranges);
  }
  return mergeRanges(ranges);
}

export function countTiles(ranges: TileRange[]): number {
  let total = 0;
  for (const range of ranges) total += range.end - range.start;
  return total;
}

/** Tiles a box touches between two zooms, from the rectangles alone (no ranges built). */
export function countTilesInBbox(bbox: Bbox, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const rect = bboxToTileRect(bbox, z);
    total += (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
  }
  return total;
}
