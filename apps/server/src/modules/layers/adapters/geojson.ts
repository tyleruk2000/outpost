/**
 * Reading GeoJSON: features in WGS 84 (converted from another system where `crs.ts`
 * can), each with a representative point and a box, anything else refused one feature
 * at a time with a reason.
 */
import fs from "node:fs";
import type { Bbox } from "@outpost/shared";
import { PermanentJobError } from "../../../core/jobs.ts";
import { type Crs, CrsError, crsFromName, geoJsonCrs, mapCoordinates, toWgs84 } from "../crs.ts";
import { containsPoint, geometryBbox } from "../store.ts";
import type { GeoJsonGeometry } from "../types.ts";

/** Larger than this is refused rather than read into memory. */
export const MAX_GEOJSON_BYTES = 160 * 1024 * 1024;

export interface ReadFeature {
  properties: Record<string, unknown>;
  /** Null for a point: the point is `lat`/`lon`. */
  geometry: GeoJsonGeometry | null;
  lat: number;
  lon: number;
  bbox: Bbox;
}

const GEOMETRY_TYPES = new Set(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]);

/** The point a feature is listed and labelled at: a polygon's centre if it lies inside, otherwise its first corner. */
export function representativePoint(geometry: GeoJsonGeometry, bbox: Bbox): [number, number] {
  if (geometry.type === "Point") return geometry.coordinates as [number, number];
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    // The area-weighted centre of the largest ring.
    const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as number[][][][];
    let best: { area: number; x: number; y: number } | null = null;
    for (const polygon of polygons) {
      const ring = polygon[0];
      if (!ring || ring.length < 4) continue;
      let area = 0;
      let cx = 0;
      let cy = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const cross = ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
        area += cross;
        cx += (ring[j]![0]! + ring[i]![0]!) * cross;
        cy += (ring[j]![1]! + ring[i]![1]!) * cross;
      }
      if (area === 0) continue;
      const centre = { area: Math.abs(area / 2), x: cx / (3 * area), y: cy / (3 * area) };
      if (!best || centre.area > best.area) best = centre;
    }
    if (best && containsPoint(geometry, best.x, best.y)) return [best.x, best.y];
  }
  const centre: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  if (geometry.type === "LineString" || geometry.type === "MultiLineString" || geometry.type === "MultiPoint") {
    const first =
      geometry.type === "MultiLineString" ? (geometry.coordinates as number[][][])[0]?.[0] : (geometry.coordinates as number[][])[0];
    if (first) return [first[0]!, first[1]!];
  }
  const outer = (
    geometry.type === "Polygon" ? (geometry.coordinates as number[][][])[0]?.[0] : (geometry.coordinates as number[][][][])[0]?.[0]?.[0]
  ) as number[] | undefined;
  return outer && !containsPoint(geometry, centre[0], centre[1]) ? [outer[0]!, outer[1]!] : centre;
}

/** Reads a GeoJSON file of features. `crsName` overrides the file's own `crs` member (a person saying what system it is in). */
export async function readGeoJsonFile(
  filePath: string,
  options: { crsName?: string | null; onFeature: (feature: ReadFeature) => Promise<void>; onSkip: (reason: string) => void },
): Promise<{ crs: Crs; total: number }> {
  const stat = await fs.promises.stat(filePath);
  if (stat.size > MAX_GEOJSON_BYTES) {
    throw new PermanentJobError(
      `The file is ${Math.round(stat.size / 1048576)} MB; GeoJSON files over 160 MB are not read. Split it, or keep only the area you need.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch {
    throw new PermanentJobError("The file is not valid JSON, so it is not a GeoJSON file.");
  }
  if (typeof parsed !== "object" || parsed === null) throw new PermanentJobError("The file is not a GeoJSON object.");
  const object = parsed as { type?: unknown; features?: unknown };
  const features =
    object.type === "FeatureCollection" && Array.isArray(object.features) ? object.features : object.type === "Feature" ? [object] : null;
  if (!features) throw new PermanentJobError("The file is not a GeoJSON FeatureCollection.");
  let crs: Crs;
  try {
    crs = options.crsName ? crsFromName(options.crsName) : geoJsonCrs(parsed);
  } catch (error) {
    if (error instanceof CrsError) throw new PermanentJobError(error.message);
    throw error;
  }
  let index = 0;
  let outOfRange = 0;
  for (const raw of features) {
    index += 1;
    const feature = raw as { properties?: unknown; geometry?: { type?: unknown; coordinates?: unknown } | null };
    const properties =
      typeof feature?.properties === "object" && feature.properties !== null ? (feature.properties as Record<string, unknown>) : {};
    const type = feature?.geometry?.type;
    if (typeof type !== "string" || !GEOMETRY_TYPES.has(type)) {
      options.onSkip(`Feature ${index} has no point, line or area.`);
      continue;
    }
    let geometry: GeoJsonGeometry;
    try {
      geometry = { type, coordinates: mapCoordinates(feature.geometry!.coordinates, (x, y) => toWgs84(crs, x, y)) };
    } catch (error) {
      if (error instanceof CrsError) {
        outOfRange += 1;
        options.onSkip(`Feature ${index}: ${error.message}`);
        // A file whose first features are all out of range is in another system: say so once and stop.
        if (outOfRange >= 5 && outOfRange === index) {
          throw new PermanentJobError(
            "The file's coordinates are not latitude and longitude in degrees, and it does not say what system they are in. Say which system it uses when importing (for example EPSG:27700), or save it again in WGS 84 (EPSG:4326).",
          );
        }
        continue;
      }
      throw error;
    }
    const bbox = geometryBbox(geometry);
    if (!bbox) {
      options.onSkip(`Feature ${index} has an empty shape.`);
      continue;
    }
    const [lon, lat] = representativePoint(geometry, bbox);
    await options.onFeature({ properties, geometry: type === "Point" ? null : geometry, lat, lon, bbox });
  }
  return { crs, total: index };
}

/** A property as text fit to show, from the first of `keys` that has one. */
export function textProp(properties: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
