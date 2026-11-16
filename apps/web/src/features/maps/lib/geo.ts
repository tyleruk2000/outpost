/** Arithmetic on positions, boxes and distances. Pure, so it can be tested without a map. */
import { type Bbox, haversineMeters, initialBearingDeg } from "@outpost/shared";
import { formatNumber } from "@/lib/utils";

export interface LatLon {
  lat: number;
  lon: number;
}

/** The limit of the Web Mercator map; the server refuses boxes beyond it. */
export const MAX_LATITUDE = 85.0511;
const DEG = Math.PI / 180;
const METERS_PER_MILE = 1609.344;

/** Brings a longitude into -180…180. MapLibre reports positions on repeated worlds as 190, -200 and so on. */
export function wrapLongitude(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  // Keep +180 as the eastern edge rather than turning it into -180.
  return wrapped === -180 && lon > 0 ? 180 : wrapped;
}

export type BoxResult = { ok: true; bbox: Bbox } | { ok: false; reason: "antimeridian" | "too-small" };

const round = (value: number, digits = 5) => Number(value.toFixed(digits));

/**
 * A download box from two corners dragged on the map, in any order. Latitudes are
 * clamped to the map's edge. A box that spans the 180° meridian is refused, because
 * the server cannot cut one: it has to be two regions.
 */
export function boxFromCorners(a: LatLon, b: LatLon): BoxResult {
  const south = Math.max(-MAX_LATITUDE, Math.min(a.lat, b.lat));
  const north = Math.min(MAX_LATITUDE, Math.max(a.lat, b.lat));
  const westRaw = Math.min(a.lon, b.lon);
  const eastRaw = Math.max(a.lon, b.lon);
  if (eastRaw - westRaw >= 360) return { ok: true, bbox: [-180, round(south), 180, round(north)] };
  const west = wrapLongitude(westRaw);
  const east = wrapLongitude(eastRaw);
  if (west > east) return { ok: false, reason: "antimeridian" };
  if (north - south < 0.0005 || east - west < 0.0005) return { ok: false, reason: "too-small" };
  return { ok: true, bbox: [round(west), round(south), round(east), round(north)] };
}

export function isValidBbox(bbox: Bbox): boolean {
  const [west, south, east, north] = bbox;
  return (
    [west, south, east, north].every(Number.isFinite) &&
    west < east &&
    south < north &&
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90
  );
}

export function bboxCenter(bbox: Bbox): LatLon {
  return { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 };
}

export function bboxUnion(boxes: Bbox[]): Bbox | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}

/** Width (along the middle latitude) and height of a box, in metres. */
export function bboxSizeMeters(bbox: Bbox): { width: number; height: number } {
  const [west, south, east, north] = bbox;
  const middle = (south + north) / 2;
  return { width: haversineMeters(middle, west, middle, east), height: haversineMeters(south, west, north, west) };
}

const hemisphere = (value: number, positive: string, negative: string, digits: number) =>
  `${Math.abs(value).toFixed(digits)}°${value < 0 ? negative : positive}`;

/** "52.72°N to 53.33°N, 4.36°W to 3.50°W" */
export function formatBbox(bbox: Bbox, digits = 2): string {
  const [west, south, east, north] = bbox;
  return `${hemisphere(south, "N", "S", digits)} to ${hemisphere(north, "N", "S", digits)}, ${hemisphere(west, "E", "W", digits)} to ${hemisphere(east, "E", "W", digits)}`;
}

/** "58 × 68 km", or the whole world named as such. */
export function formatBboxSize(bbox: Bbox): string {
  if (bbox[2] - bbox[0] >= 359 && bbox[3] - bbox[1] >= 160) return "The whole world";
  const { width, height } = bboxSizeMeters(bbox);
  const km = (meters: number) =>
    meters >= 100_000 ? formatNumber(Math.round(meters / 1000)) : (meters / 1000).toFixed(meters >= 10_000 ? 0 : 1);
  return `${km(width)} × ${km(height)} km`;
}

/** Tiles a box touches from `minZoom` to `maxZoom`: the same count the server limits. */
export function countTiles(bbox: Bbox, minZoom: number, maxZoom: number): number {
  const [west, south, east, north] = bbox;
  const row = (lat: number, size: number) => {
    const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
    const y = (1 - Math.log(Math.tan(clamped * DEG) + 1 / Math.cos(clamped * DEG)) / Math.PI) / 2;
    return Math.min(size - 1, Math.max(0, Math.floor(y * size)));
  };
  const column = (lon: number, size: number) => Math.min(size - 1, Math.max(0, Math.floor(((lon + 180) / 360) * size)));
  let total = 0;
  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const size = 2 ** zoom;
    total += (column(east, size) - column(west, size) + 1) * (row(south, size) - row(north, size) + 1);
  }
  return total;
}

/** Compass bearing in degrees (0–360) to set out on from the first point towards the second. */
export function initialBearing(from: LatLon, to: LatLon): number {
  return initialBearingDeg(from, to);
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

/** "284° WNW" */
export function formatBearing(degrees: number): string {
  const rounded = Math.round(degrees) % 360;
  return `${rounded}° ${COMPASS[Math.round(degrees / 22.5) % 16]}`;
}

/** "420 m" or "3.42 km": three significant figures, as much as a map measurement can honestly claim. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "unknown distance";
  // Below the point where rounding would print "1000 m".
  if (meters < 999.5) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km >= 1000) return `${formatNumber(Math.round(km))} km`;
  return `${km.toFixed(km >= 100 ? 0 : km >= 10 ? 1 : 2)} km`;
}

export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles >= 1000) return `${formatNumber(Math.round(miles))} mi`;
  return `${miles.toFixed(miles >= 100 ? 0 : miles >= 10 ? 1 : 2)} mi`;
}

/** "3.42 km (2.13 mi)" */
export function formatDistanceWithMiles(meters: number): string {
  return `${formatDistance(meters)} (${formatMiles(meters)})`;
}

/** "1,046 m" for a height or a height gained. */
export function formatHeight(meters: number): string {
  return `${formatNumber(Math.round(meters))} m`;
}

/** Ground metres per CSS pixel at a latitude and zoom. MapLibre's zoom 0 is one 512 px tile. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (40_075_016.686 * Math.cos(lat * DEG)) / (512 * 2 ** zoom);
}

/** A scale bar no wider than `maxWidth` px, sized to a round distance. */
export function scaleBar(metersPerPx: number, maxWidth: number): { meters: number; width: number; label: string } {
  const maxMeters = metersPerPx * maxWidth;
  if (!(maxMeters > 0) || !Number.isFinite(maxMeters)) return { meters: 0, width: 0, label: "" };
  const magnitude = 10 ** Math.floor(Math.log10(maxMeters));
  const step = [5, 3, 2, 1].find((candidate) => candidate * magnitude <= maxMeters) ?? 1;
  const meters = step * magnitude;
  const label = meters >= 1000 ? `${formatNumber(meters / 1000)} km` : `${formatNumber(meters)} m`;
  return { meters, width: meters / metersPerPx, label };
}

/** A circle of `radius` metres as a polygon ring, for drawing how accurate a position fix is. */
export function circleRing(center: LatLon, radius: number, steps = 48): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  const angular = radius / 6_371_008.8;
  const lat1 = center.lat * DEG;
  const lon1 = center.lon * DEG;
  for (let step = 0; step <= steps; step += 1) {
    const bearing = (step / steps) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
    const lon2 =
      lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([round(lon2 / DEG, 6), round(lat2 / DEG, 6)]);
  }
  return ring;
}

/** The corners of a box as a closed polygon ring. */
export function bboxRing(bbox: Bbox): Array<[number, number]> {
  const [west, south, east, north] = bbox;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}
