/**
 * Contour lines, worked out on this device from the terrain that is already installed.
 *
 * Nothing is downloaded for them and no server draws them: the same elevation tiles
 * that shade the hills are read in a worker, traced into lines of equal height, and
 * handed to the map as if they were vector tiles. This module is the arithmetic and
 * the addresses; `map/contours.ts` and `map/contour.worker.ts` do the work.
 *
 * Nothing here touches MapLibre or a worker, so it can be checked in tests.
 */
import type { Bbox } from "@outpost/shared";

/** The address scheme the map asks for contour tiles through. It never leaves the browser. */
export const CONTOUR_PROTOCOL = "outpost-contours";
/** The layer inside each generated tile, and the two properties every line carries. */
export const CONTOUR_SOURCE_LAYER = "contours";
export const CONTOUR_ELEVATION_KEY = "ele";
/** 1 on an index line (every fifth line or so, drawn heavier and labelled), 0 on the lines between. */
export const CONTOUR_LEVEL_KEY = "level";

/**
 * The height between lines at each zoom, in metres: `[from zoom, every line, index line]`.
 * A zoom between two entries uses the one below it. Chosen so that lines on a steep
 * hillside stay a few pixels apart: closer than that and they merge into a smear.
 */
export const CONTOUR_INTERVALS: ReadonlyArray<readonly [zoom: number, interval: number, index: number]> = [
  [9, 200, 1000],
  [10, 100, 500],
  [11, 50, 250],
  [13, 20, 100],
  [15, 10, 50],
];

/** Below this zoom a screen covers a whole mountain range and lines would only be clutter. */
export const CONTOUR_MIN_ZOOM = CONTOUR_INTERVALS[0]![0];
/** The deepest zoom tiles are generated for; closer in, those tiles are magnified. */
export const CONTOUR_MAX_ZOOM = 15;

export interface ContourInterval {
  /** Metres between one line and the next. */
  interval: number;
  /** Metres between index lines. Always a multiple of `interval`. */
  index: number;
}

/** The spacing of lines at a zoom, or null where none are drawn. */
export function contourInterval(zoom: number): ContourInterval | null {
  let found: ContourInterval | null = null;
  for (const [from, interval, index] of CONTOUR_INTERVALS) {
    if (zoom >= from) found = { interval, index };
  }
  return found;
}

export interface ContourSource {
  /** Same-origin path of the terrain tiles, with `{z}`, `{x}` and `{y}`: "/api/maps/terrain/{z}/{x}/{y}.webp?v=…". */
  dem: string;
  encoding: "terrarium" | "mapbox";
  /** The deepest zoom the terrain has. */
  maxZoom: number;
}

/**
 * The tile address for a contour source. Everything the worker needs travels in the
 * address, so the style alone says where the lines come from.
 */
export function contourTemplate(source: ContourSource): string {
  const query = new URLSearchParams({ dem: source.dem, encoding: source.encoding, maxzoom: String(source.maxZoom) });
  // URLSearchParams escapes the braces of the terrain template, so MapLibre fills in only the three below.
  return `${CONTOUR_PROTOCOL}://local/{z}/{x}/{y}?${query.toString()}`;
}

export interface ContourRequest extends ContourSource {
  z: number;
  x: number;
  y: number;
}

/**
 * Reads a contour tile address back. Anything that is not one of ours, or that names
 * terrain outside Outpost's own maps API, gives null: a style cannot use this to make
 * the browser fetch something else.
 */
export function parseContourRequest(url: string): ContourRequest | null {
  const match = new RegExp(`^${CONTOUR_PROTOCOL}://local/(\\d{1,2})/(\\d{1,8})/(\\d{1,8})\\?(.*)$`).exec(url);
  if (!match) return null;
  const [z, x, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const query = new URLSearchParams(match[4]);
  const dem = query.get("dem") ?? "";
  const encoding = query.get("encoding");
  const maxZoom = Number(query.get("maxzoom"));
  if (z > 24 || x >= 2 ** z || y >= 2 ** z) return null;
  if (!dem.startsWith("/api/maps/") || dem.includes("//") || dem.includes("..")) return null;
  if (!["{z}", "{x}", "{y}"].every((part) => dem.includes(part))) return null;
  if (encoding !== "terrarium" && encoding !== "mapbox") return null;
  if (!Number.isInteger(maxZoom) || maxZoom < 0 || maxZoom > 24) return null;
  return { z, x, y, dem, encoding, maxZoom };
}

/** Why contour lines are, or are not, on screen for a view. */
export type ContourReach =
  /** Terrain is installed under this view and the map is close enough: lines are drawn. */
  | "drawn"
  /** Terrain is installed here, but the map is too far out for lines. */
  | "too-far-out"
  /** Terrain is installed, but not for this part of the map. */
  | "no-terrain-here"
  /** No terrain is installed at all. */
  | "no-terrain";

const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * What a person looking at `view` can expect of contour lines, given the boxes of the
 * terrain that is installed. This is what lets the control explain itself instead of
 * doing nothing.
 */
export function contourReach(view: { bounds: Bbox; zoom: number }, terrain: Bbox[]): ContourReach {
  if (terrain.length === 0) return "no-terrain";
  if (!terrain.some((box) => overlaps(view.bounds, box))) return "no-terrain-here";
  // Tiles are chosen by the whole zoom the map is past, as MapLibre does.
  return Math.floor(view.zoom) >= CONTOUR_MIN_ZOOM ? "drawn" : "too-far-out";
}

/**
 * Whether this browser can trace contour lines: the worker reads terrain images with
 * `createImageBitmap` and an off-screen canvas. Every browser that can draw the map at
 * all has had both for some years; Safari before 16.4 is the one that does not.
 */
export function contoursSupported(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";
}
