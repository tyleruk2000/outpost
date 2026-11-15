/**
 * The handles of the download box: one on each corner and one in the middle of each
 * edge. A corner moves two edges at once; an edge handle moves only its own edge.
 * This is the arithmetic, so it can be tested without a map; the engine draws them.
 */
import type { Bbox } from "@outpost/shared";
import { type BoxResult, boxFromCorners, type LatLon, MAX_LATITUDE } from "./geo";

/** Edges first: the engine adds them in this order, which leaves the corners on top where they meet. */
export const BOX_HANDLES = ["n", "e", "s", "w", "nw", "ne", "se", "sw"] as const;
export type BoxHandle = (typeof BOX_HANDLES)[number];

const NAMES: Record<BoxHandle, string> = {
  n: "North edge",
  e: "East edge",
  s: "South edge",
  w: "West edge",
  nw: "North-west corner",
  ne: "North-east corner",
  se: "South-east corner",
  sw: "South-west corner",
};

export const isCornerHandle = (handle: BoxHandle) => handle.length === 2;

/** "North edge" or "North-west corner". */
export const boxHandleName = (handle: BoxHandle) => NAMES[handle];

const DEG = Math.PI / 180;

/**
 * The latitude half-way up a box as the map draws it. Web Mercator stretches towards
 * the poles, so on a tall box this is north of the plain average.
 */
export function middleLatitude(south: number, north: number): number {
  const project = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * DEG) / 2));
  return (2 * Math.atan(Math.exp((project(south) + project(north)) / 2)) - Math.PI / 2) / DEG;
}

/** Where a handle sits on a box. */
export function boxHandlePosition(bbox: Bbox, handle: BoxHandle): LatLon {
  const [west, south, east, north] = bbox;
  return {
    lat: handle.includes("n") ? north : handle.includes("s") ? south : middleLatitude(south, north),
    lon: handle.includes("w") ? west : handle.includes("e") ? east : (west + east) / 2,
  };
}

/**
 * The box after one of its handles has been moved to `to`. A corner takes both of the
 * position's coordinates; an edge handle takes only the one across its edge, so the
 * other two edges stay where they are. Moved past the opposite side, the box turns
 * inside out rather than collapsing. The same limits apply as when a box is drawn.
 */
export function moveBoxHandle(bbox: Bbox, handle: BoxHandle, to: LatLon): BoxResult {
  const [west, south, east, north] = bbox;
  const moved: LatLon = {
    lat: handle.includes("n") || handle.includes("s") ? to.lat : north,
    lon: handle.includes("w") || handle.includes("e") ? to.lon : east,
  };
  const fixed: LatLon = {
    lat: handle.includes("n") ? south : handle.includes("s") ? north : south,
    lon: handle.includes("w") ? east : handle.includes("e") ? west : west,
  };
  return boxFromCorners(moved, fixed);
}

/**
 * The coordinate an edge handle moves along, for its accessible value: a latitude for
 * the north and south edges, a longitude for the east and west ones.
 */
export function edgeValue(bbox: Bbox, handle: "n" | "e" | "s" | "w"): { now: number; min: number; max: number; text: string } {
  const [west, south, east, north] = bbox;
  const degrees = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`;
  if (handle === "n" || handle === "s") {
    const now = handle === "n" ? north : south;
    return { now, min: -MAX_LATITUDE, max: MAX_LATITUDE, text: degrees(now, "north", "south") };
  }
  const now = handle === "e" ? east : west;
  return { now, min: -180, max: 180, text: degrees(now, "east", "west") };
}

/** A handle's touch target is this many pixels across. */
export const HANDLE_TARGET_PIXELS = 44;

/**
 * Whether an edge is long enough on screen to carry a handle in its middle without
 * that handle's touch target running into the ones on the corners at either end.
 */
export function edgeHandleFits(edgePixels: number): boolean {
  return edgePixels >= HANDLE_TARGET_PIXELS * 2;
}
