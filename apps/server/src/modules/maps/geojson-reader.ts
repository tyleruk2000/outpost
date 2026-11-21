/**
 * Reads GeoJSON text (RFC 7946) into the GeoJSON Outpost stores.
 *
 * The text is counted before it is parsed: how many arrays and objects it opens and
 * how deep they go. A position is one array, so that count bounds what parsing it can
 * cost, and a file that is nothing but brackets is refused before a byte of it is
 * built. What is read:
 *
 *   Point, MultiPoint                       places
 *   LineString, MultiLineString             lines of the route
 *   Polygon, MultiPolygon                   outlines: each ring a closed line
 *   GeometryCollection                      any of these
 *   properties.name (or title), .description (or desc)
 *
 * A FeatureCollection, a single Feature and a bare geometry are all accepted. RFC 7946
 * positions are longitude and latitude in WGS 84; a file of the older kind that names
 * another coordinate system in `crs` is refused with a sentence saying so, rather
 * than drawn in the wrong place.
 */
import type { Position } from "geojson";
import { badRequest } from "../../core/errors.ts";
import type { TrackFeature, TrackProperties } from "./gpx.ts";
import { cleanPosition } from "./gpx-reader.ts";
import { MAP_FILE_LIMITS, type ParsedMapFile, plainText } from "./map-file-limits.ts";

const count = (value: number) => value.toLocaleString("en-GB");
const SPLIT = "Split it into smaller files and import them one at a time.";
const NOT_JSON = "That file is not valid JSON, so it cannot be read as GeoJSON.";
const NOT_GEOJSON = "That file is JSON but not GeoJSON. Export it as GeoJSON, KML or GPX and try again.";
const TOO_MANY = {
  containers: `That GeoJSON file holds more than Outpost reads at once. ${SPLIT}`,
  depth: "That GeoJSON file nests its arrays and objects more deeply than GeoJSON ever needs, so Outpost will not read it.",
  linePoints: `That file has more than ${count(MAP_FILE_LIMITS.linePoints)} points in its lines and outlines. ${SPLIT}`,
  places: `That file has more than ${count(MAP_FILE_LIMITS.places)} points. ${SPLIT}`,
  lines: `That file has more than ${count(MAP_FILE_LIMITS.lines)} lines and outlines. ${SPLIT}`,
};

/** Coordinate systems that are WGS 84 longitude and latitude, as older files name them. */
const WGS84 = /^(urn:ogc:def:crs:OGC:(1\.3:)?CRS84|urn:ogc:def:crs:EPSG:(\d*\.?\d*)?:4326|EPSG:4326|CRS84)$/i;

/**
 * Counts arrays and objects outside strings, and their depth, in one pass over the text.
 * Throws as soon as either is over its limit.
 */
function checkShape(source: string): void {
  let containers = 0;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    if (inString) {
      if (code === 0x5c)
        i += 1; // a backslash: the next character is escaped
      else if (code === 0x22) inString = false;
      continue;
    }
    if (code === 0x22) inString = true;
    else if (code === 0x5b || code === 0x7b) {
      containers += 1;
      depth += 1;
      if (containers > MAP_FILE_LIMITS.jsonContainers) throw badRequest(TOO_MANY.containers);
      if (depth > MAP_FILE_LIMITS.depth) throw badRequest(TOO_MANY.depth);
    } else if (code === 0x5d || code === 0x7d) depth -= 1;
  }
}

type Json = unknown;
const isObject = (value: Json): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: Json): string | undefined {
  if (typeof value === "string") return plainText(value) || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Reads GeoJSON text. Throws a `bad_request` with a plain explanation for anything that
 * is not a GeoJSON file Outpost is willing to read. The caller has already refused
 * files that are too large.
 */
export function readGeoJson(source: string): ParsedMapFile {
  checkShape(source);
  let root: Json;
  try {
    root = JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
  } catch {
    throw badRequest(NOT_JSON);
  }
  if (!isObject(root) || typeof root.type !== "string") throw badRequest(NOT_GEOJSON);

  const crs = root.crs;
  if (isObject(crs) && isObject(crs.properties) && typeof crs.properties.name === "string" && !WGS84.test(crs.properties.name)) {
    throw badRequest(
      `That file's positions are in another coordinate system (${crs.properties.name.slice(0, 80)}), not longitude and latitude. Export it again as GeoJSON in WGS 84 (EPSG:4326), and try again.`,
    );
  }

  const places: TrackFeature[] = [];
  const lines: TrackFeature[] = [];
  const outlines: TrackFeature[] = [];
  let lineCount = 0;
  let linePointCount = 0;
  let recognised = false;
  /** Positions that are nowhere on Earth as longitude and latitude. */
  let dropped = 0;

  const positionOf = (value: Json): Position | undefined => {
    if (!Array.isArray(value) || value.length < 2) return undefined;
    const [lon, lat, ele] = value;
    const position = cleanPosition(
      typeof lon === "number" ? lon : Number.NaN,
      typeof lat === "number" ? lat : Number.NaN,
      typeof ele === "number" ? ele : Number.NaN,
    );
    if (!position) dropped += 1;
    return position;
  };
  const lineOf = (value: Json): Position[] => {
    if (!Array.isArray(value)) return [];
    const positions: Position[] = [];
    for (const item of value) {
      const position = positionOf(item);
      if (position) positions.push(position);
    }
    return positions;
  };
  const countLine = (points: number) => {
    lineCount += 1;
    if (lineCount > MAP_FILE_LIMITS.lines) throw badRequest(TOO_MANY.lines);
    linePointCount += points;
    if (linePointCount > MAP_FILE_LIMITS.linePoints) throw badRequest(TOO_MANY.linePoints);
  };
  const ring = (value: Json): Position[] | undefined => {
    const positions = lineOf(value);
    if (positions.length < 3) return undefined;
    const first = positions[0]!;
    const last = positions[positions.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) positions.push(first);
    countLine(positions.length);
    return positions;
  };

  const addGeometry = (geometry: Json, properties: TrackProperties) => {
    if (!isObject(geometry)) return;
    const coordinates = geometry.coordinates;
    const list = Array.isArray(coordinates) ? coordinates : [];
    switch (geometry.type) {
      case "Point":
      case "MultiPoint": {
        recognised = true;
        const points = geometry.type === "Point" ? [positionOf(coordinates)] : list.map(positionOf);
        for (const point of points) {
          if (!point) continue;
          if (places.length >= MAP_FILE_LIMITS.places) throw badRequest(TOO_MANY.places);
          places.push({ type: "Feature", properties: { ...properties }, geometry: { type: "Point", coordinates: point } });
        }
        return;
      }
      case "LineString":
      case "MultiLineString": {
        recognised = true;
        const parts = (geometry.type === "LineString" ? [lineOf(coordinates)] : list.map(lineOf)).filter((part) => part.length >= 2);
        for (const part of parts) countLine(part.length);
        if (parts.length === 1)
          lines.push({ type: "Feature", properties: { ...properties }, geometry: { type: "LineString", coordinates: parts[0]! } });
        else if (parts.length > 1)
          lines.push({ type: "Feature", properties: { ...properties }, geometry: { type: "MultiLineString", coordinates: parts } });
        return;
      }
      case "Polygon":
      case "MultiPolygon": {
        recognised = true;
        const polygons = geometry.type === "Polygon" ? [coordinates] : list;
        const rings: Position[][] = [];
        for (const polygon of polygons) {
          if (!Array.isArray(polygon)) continue;
          for (const item of polygon) {
            const closed = ring(item);
            if (closed) rings.push(closed);
          }
        }
        const outline: TrackProperties = { ...properties, _outline: true };
        if (rings.length === 1)
          outlines.push({ type: "Feature", properties: outline, geometry: { type: "LineString", coordinates: rings[0]! } });
        else if (rings.length > 1)
          outlines.push({ type: "Feature", properties: outline, geometry: { type: "MultiLineString", coordinates: rings } });
        return;
      }
      case "GeometryCollection":
        recognised = true;
        if (Array.isArray(geometry.geometries)) for (const part of geometry.geometries) addGeometry(part, properties);
        return;
    }
  };

  const describe = (value: Json): TrackProperties => {
    const properties: TrackProperties = {};
    if (!isObject(value)) return properties;
    const name = text(value.name) ?? text(value.title) ?? text(value.Name) ?? text(value.NAME);
    const desc = text(value.description) ?? text(value.desc) ?? text(value.Description);
    if (name) properties.name = name;
    if (desc) properties.desc = desc;
    return properties;
  };

  const addFeature = (feature: Json) => {
    if (!isObject(feature) || feature.type !== "Feature") return;
    recognised = true;
    addGeometry(feature.geometry, describe(feature.properties));
  };

  if (root.type === "FeatureCollection") {
    recognised = true;
    if (Array.isArray(root.features)) for (const feature of root.features) addFeature(feature);
  } else if (root.type === "Feature") addFeature(root);
  else addGeometry(root, {});
  if (!recognised) throw badRequest(NOT_GEOJSON);

  const features = [...lines, ...outlines, ...places];
  if (features.length === 0 && dropped > 0) {
    throw badRequest(
      "That file's positions are not longitude and latitude (they may be in metres, in a national grid). Export it again as GeoJSON in WGS 84 (EPSG:4326), and try again.",
    );
  }
  if (features.length === 0) throw badRequest("That GeoJSON file has no points, lines or outlines in it.");
  return {
    collection: { type: "FeatureCollection", features },
    name: text(root.name) ?? lines[0]?.properties.name ?? outlines[0]?.properties.name ?? null,
    description: text(root.description) ?? null,
    lines: lines.length,
    outlines: outlines.length,
    waypoints: places.length,
  };
}
