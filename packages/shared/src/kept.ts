/**
 * Keeping a map area on a phone: the arithmetic the server and the web app must agree
 * on. The server measures a box before anything is fetched; the web app then asks for
 * exactly the same tiles, one by one, and stores them in the browser.
 */
import type { Bbox } from "./maps.ts";

/**
 * The most tiles one kept area may hold, map and terrain counted separately. A phone
 * fetches them one at a time over the home network and a browser's storage is not a
 * disk: past this, the box is too big for the detail asked for.
 */
export const MAX_KEPT_AREA_TILES = 12_000;

/** The most one kept area may take in the browser's storage, as measured before it starts. */
export const MAX_KEPT_AREA_BYTES = 400 * 1024 * 1024;

/** Web Mercator stops here; tiles do not exist beyond it. */
const MAX_LATITUDE = 85.0511287798066;

export interface TileRect {
  z: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The rectangle of tiles a box touches at one zoom. */
export function tileRect(bbox: Bbox, z: number): TileRect {
  const size = 2 ** z;
  const column = (lon: number) => clamp(Math.floor(((lon + 180) / 360) * size), 0, size - 1);
  const row = (lat: number) => {
    const sin = Math.sin((clamp(lat, -MAX_LATITUDE, MAX_LATITUDE) * Math.PI) / 180);
    return clamp(Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size), 0, size - 1);
  };
  const [west, south, east, north] = bbox;
  return { z, minX: column(west), minY: row(north), maxX: column(east), maxY: row(south) };
}

/** The rectangles a box touches from one zoom to another, coarsest first. */
export function tileRects(bbox: Bbox, minZoom: number, maxZoom: number): TileRect[] {
  const rects: TileRect[] = [];
  for (let z = minZoom; z <= maxZoom; z += 1) rects.push(tileRect(bbox, z));
  return rects;
}

export function countRectTiles(rects: TileRect[]): number {
  let total = 0;
  for (const rect of rects) total += (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
  return total;
}

/** One layer of a measured area: the map itself, or the terrain under it. */
export interface MapAreaLayerSize {
  /** Tiles the installed maps actually hold inside the box. */
  tiles: number;
  /** What those tiles take as stored, which is also what the phone will hold. */
  bytes: number;
  minZoom: number;
  /** The deepest zoom measured: the zoom asked for, or the deepest installed if that is less. */
  maxZoom: number;
}

/** `GET /api/maps/area-size`: what keeping a box on a phone would fetch, read from the installed maps. */
export interface MapAreaSize {
  bbox: Bbox;
  /** Null when no detailed map is installed. */
  map: MapAreaLayerSize | null;
  /** Null when terrain was not asked for or none is installed. */
  terrain: MapAreaLayerSize | null;
  totalTiles: number;
  totalBytes: number;
}
