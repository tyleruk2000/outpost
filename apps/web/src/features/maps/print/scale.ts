/**
 * Scale on paper, for a map in the Web Mercator projection.
 *
 * A scale of 1:25,000 means a metre on the page is 25,000 m on the ground. This map's
 * projection stretches towards the poles, so that is only exactly true along one line
 * of latitude: here, the one through the middle of the sheet. North of it the map is
 * a little larger than stated and south of it a little smaller. `scaleVariation` says
 * by how much, and the page prints it.
 *
 * The ground is measured the way the rest of the maps screen measures it
 * (`metersPerPixel` in lib/geo): on a sphere with the Earth's equatorial circumference.
 * On the real, slightly flattened Earth that is within 0.7% in every direction, which
 * is 0.4 mm in the length of a 60 mm scale bar.
 *
 * Pure arithmetic, so it can be checked against values worked out by hand.
 */
import type { Bbox } from "@outpost/shared";
import { formatNumber } from "@/lib/utils";
import type { BoxHandle } from "../lib/box-handles";
import { type LatLon, MAX_LATITUDE } from "../lib/geo";
import { MAP_PX_PER_INCH } from "./paper";

const DEG = Math.PI / 180;
/** The same figure `metersPerPixel` uses. */
const EARTH_CIRCUMFERENCE = 40_075_016.686;
/** MapLibre's zoom 0 is the world in one 512 px tile. */
const WORLD_PX = 512;
const METERS_PER_INCH = 0.0254;
export const METERS_PER_MILE = 1609.344;

/** Metres of paper covered by one of the map's pixels. */
const PAPER_METERS_PER_PX = METERS_PER_INCH / MAP_PX_PER_INCH;

/** The scales offered by name: the ones printed walking, cycling and touring maps use. */
export const ROUND_SCALES = [10_000, 25_000, 50_000, 100_000, 250_000] as const;

/** The furthest out a sheet may go (about the whole world on A4) and the closest in. */
export const MAX_SCALE = 150_000_000;
export const MIN_SCALE = 500;

// ── Web Mercator ──

/** A longitude as a fraction of the way round the world, from 180° west. */
export const mercatorX = (lon: number) => (lon + 180) / 360;

/** A latitude as a fraction of the way down the map, from its northern limit. */
export function mercatorY(lat: number): number {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  return (1 - Math.log(Math.tan(Math.PI / 4 + (clamped * DEG) / 2)) / Math.PI) / 2;
}

export const longitudeAt = (x: number) => x * 360 - 180;
export const latitudeAt = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / DEG;

// ── Scale and zoom ──

/** The zoom at which the map, printed at MAP_PX_PER_INCH, is at 1:`scale` along latitude `lat`. */
export function zoomForScale(scale: number, lat: number): number {
  const groundPerPx = scale * PAPER_METERS_PER_PX;
  return Math.log2((EARTH_CIRCUMFERENCE * Math.cos(lat * DEG)) / (WORLD_PX * groundPerPx));
}

/** The other way round: what 1:n a zoom comes out as on paper, along latitude `lat`. */
export function scaleForZoom(zoom: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos(lat * DEG)) / (WORLD_PX * 2 ** zoom) / PAPER_METERS_PER_PX;
}

/** "1:25,000". A scale that is not one of the round ones is given to three figures, which is all it is good for. */
export function formatScale(scale: number): string {
  if (!Number.isFinite(scale) || scale <= 0) return "1:?";
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(scale)) - 2);
  return `1:${formatNumber(Math.round(scale / magnitude) * magnitude)}`;
}

// ── The frame: what the page shows ──

/** The middle of the page and the zoom it is drawn at. With the map's size in pixels, that is everything the drawing needs. */
export interface Frame {
  center: LatLon;
  zoom: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

/** The ground a frame covers, as [west, south, east, north]. */
export function frameBox(frame: Frame, pixels: PixelSize): Bbox {
  const world = WORLD_PX * 2 ** frame.zoom;
  const x = mercatorX(frame.center.lon) * world;
  const y = mercatorY(frame.center.lat) * world;
  return [
    longitudeAt((x - pixels.width / 2) / world),
    latitudeAt((y + pixels.height / 2) / world),
    longitudeAt((x + pixels.width / 2) / world),
    latitudeAt((y - pixels.height / 2) / world),
  ];
}

/**
 * The frame that shows a box. The zoom comes from the box's width; its centre is the
 * middle of the box as the map draws it, which on a tall box is north of the average
 * of its two latitudes.
 */
export function frameOfBox(bbox: Bbox, pixels: PixelSize): Frame {
  const [west, south, east, north] = bbox;
  const zoom = Math.log2(pixels.width / ((mercatorX(east) - mercatorX(west)) * WORLD_PX));
  return { center: { lon: (west + east) / 2, lat: latitudeAt((mercatorY(south) + mercatorY(north)) / 2) }, zoom };
}

/** The box a page of `pixels` covers at 1:`scale`, centred on a position. */
export function boxAtScale(center: LatLon, scale: number, pixels: PixelSize): Bbox {
  return keepOnMap(frameBox({ center, zoom: zoomForScale(scale, center.lat) }, pixels), pixels.width / pixels.height);
}

/** The scale at the middle of a box drawn on a page of `pixels`. */
export function scaleOfBox(bbox: Bbox, pixels: PixelSize): number {
  const frame = frameOfBox(bbox, pixels);
  return scaleForZoom(frame.zoom, frame.center.lat);
}

/** How a box was changed: by one of its handles, or as a whole. */
export type ShapeBy = BoxHandle | "around" | "inside";

/**
 * Gives a box the shape of the page (`aspect` is width over height, as the map draws
 * them, not in degrees).
 *
 * - A corner handle keeps the opposite corner where it is and takes the larger of the
 *   two sizes the drag asked for.
 * - An edge handle keeps the opposite edge where it is; the other two edges move in or
 *   out together, about the middle.
 * - "around" keeps the middle and grows the box until it holds everything it held;
 *   "inside" keeps the middle and shrinks it until nothing new is taken in.
 */
export function shapeBox(bbox: Bbox, aspect: number, by: ShapeBy): Bbox {
  let left = mercatorX(bbox[0]);
  let right = mercatorX(bbox[2]);
  let top = mercatorY(bbox[3]);
  let bottom = mercatorY(bbox[1]);
  const wide = right - left;
  const high = bottom - top;
  const middleX = (left + right) / 2;
  const middleY = (top + bottom) / 2;

  if (by === "around" || by === "inside") {
    const width = by === "around" ? Math.max(wide, high * aspect) : Math.min(wide, high * aspect);
    left = middleX - width / 2;
    right = middleX + width / 2;
    top = middleY - width / aspect / 2;
    bottom = middleY + width / aspect / 2;
  } else if (by === "n" || by === "s") {
    const width = high * aspect;
    left = middleX - width / 2;
    right = middleX + width / 2;
  } else if (by === "e" || by === "w") {
    const height = wide / aspect;
    top = middleY - height / 2;
    bottom = middleY + height / 2;
  } else {
    const width = Math.max(wide, high * aspect);
    const height = width / aspect;
    if (by.includes("w")) left = right - width;
    else right = left + width;
    if (by.includes("n")) top = bottom - height;
    else bottom = top + height;
  }
  return keepOnMap([longitudeAt(left), latitudeAt(bottom), longitudeAt(right), latitudeAt(top)], aspect);
}

/**
 * Brings a page-shaped box back onto the map: slid sideways off the 180° meridian and
 * down or up off the map's northern and southern limits, and made smaller (about its
 * middle) only if it is larger than the map itself.
 */
function keepOnMap(bbox: Bbox, aspect: number): Bbox {
  let left = mercatorX(bbox[0]);
  let right = mercatorX(bbox[2]);
  // Beyond the limits `mercatorY` clamps, so work from the unclamped middle and size.
  const limitTop = mercatorY(MAX_LATITUDE);
  const limitBottom = mercatorY(-MAX_LATITUDE);
  let width = right - left;
  const largest = Math.min(1, (limitBottom - limitTop) * aspect);
  if (width > largest) {
    const middle = (left + right) / 2;
    width = largest;
    left = middle - width / 2;
    right = middle + width / 2;
  }
  if (left < 0) {
    right -= left;
    left = 0;
  }
  if (right > 1) {
    left -= right - 1;
    right = 1;
  }
  const height = width / aspect;
  let top = (mercatorY(bbox[3]) + mercatorY(bbox[1])) / 2 - height / 2;
  top = Math.max(limitTop, Math.min(limitBottom - height, top));
  return [longitudeAt(left), latitudeAt(top + height), longitudeAt(right), latitudeAt(top)];
}

/** A box of the same size with its middle somewhere else. */
export function moveBox(bbox: Bbox, center: LatLon, pixels: PixelSize): Bbox {
  const frame = frameOfBox(bbox, pixels);
  return keepOnMap(frameBox({ center, zoom: frame.zoom }, pixels), pixels.width / pixels.height);
}

// ── How the scale changes across the sheet ──

export interface ScaleVariation {
  /** The latitude the stated scale is true along: the middle of the sheet. */
  latitude: number;
  /** The 1:n along the top and bottom edges. */
  top: number;
  bottom: number;
  /** The larger of the two differences from the stated scale, as a percentage of it. */
  percent: number;
}

/**
 * Along a line of latitude this projection draws the ground 1/cos(latitude) times too
 * large, so the scale at latitude φ is the stated scale × cos φ / cos φ₀, where φ₀ is
 * the latitude of the middle of the sheet.
 */
export function scaleVariation(bbox: Bbox, scale: number): ScaleVariation {
  const [, south, , north] = bbox;
  const latitude = latitudeAt((mercatorY(south) + mercatorY(north)) / 2);
  const at = (lat: number) => (scale * Math.cos(lat * DEG)) / Math.cos(latitude * DEG);
  const top = at(north);
  const bottom = at(south);
  return { latitude, top, bottom, percent: (Math.max(Math.abs(top - scale), Math.abs(bottom - scale)) / scale) * 100 };
}

/** "0.07%", "1.3%", "12%": as many figures as mean something. */
export function formatPercent(percent: number): string {
  if (percent < 0.005) return "less than 0.01%";
  return `${percent.toFixed(percent < 0.1 ? 2 : percent < 10 ? 1 : 0)}%`;
}

// ── Scale bars ──

export interface ScaleBar {
  /** What the whole bar stands for, in metres on the ground. */
  meters: number;
  /** Its length on the page, in points. */
  length: number;
  /** Where each division falls along the bar, in points from its start, and what is written there. */
  ticks: Array<{ at: number; label: string }>;
  /** "km" or "mi", written after the last figure. */
  unit: string;
}

/** Points of paper for a distance on the ground at 1:`scale`. */
export const paperPoints = (meters: number, scale: number) => (meters / scale / METERS_PER_INCH) * 72;

/** How a round length is divided: 1 into four, 2 into four, 5 into five. */
const DIVISIONS: Record<number, number> = { 1: 4, 2: 4, 5: 5 };

function roundBar(scale: number, maxLength: number, unitMeters: number, unit: string): ScaleBar {
  const maxUnits = ((maxLength / 72) * METERS_PER_INCH * scale) / unitMeters;
  const magnitude = 10 ** Math.floor(Math.log10(maxUnits));
  const lead = [5, 2, 1].find((candidate) => candidate * magnitude <= maxUnits) ?? 1;
  const total = lead * magnitude;
  const divisions = DIVISIONS[lead] ?? 4;
  const length = paperPoints(total * unitMeters, scale);
  const figure = (value: number) => formatNumber(Number(value.toPrecision(6)));
  const ticks = Array.from({ length: divisions + 1 }, (_, index) => ({
    at: (length * index) / divisions,
    // Every division is marked; the figures go on the ends and the middle, where there is room for them.
    label: index === 0 || index === divisions || index * 2 === divisions ? figure((total * index) / divisions) : "",
  }));
  return { meters: total * unitMeters, length, ticks, unit };
}

/** A bar in kilometres (or metres) and one in miles, each a round length no longer than `maxLength` points. */
export function scaleBars(scale: number, maxLength: number): { metric: ScaleBar; miles: ScaleBar } {
  const kilometres = roundBar(scale, maxLength, 1000, "km");
  // Under a kilometre the bar is marked in metres.
  const metric = kilometres.meters >= 1000 ? kilometres : roundBar(scale, maxLength, 1, "m");
  return { metric, miles: roundBar(scale, maxLength, METERS_PER_MILE, "mi") };
}
