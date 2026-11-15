/**
 * GPX in and out.
 *
 * Reading: a GPX file is XML from who knows where, so it is checked before it is
 * parsed (no DOCTYPE, no entity declarations, a `<gpx>` root) and then converted to
 * GeoJSON, which is what the map draws and what is stored. Writing: GPX 1.1 built by
 * hand from that GeoJSON, with every piece of text escaped.
 */
import { Worker } from "node:worker_threads";
import type { Bbox } from "@outpost/shared";
import { haversineMeters } from "@outpost/shared";
import { gpx as gpxToGeoJson } from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";
import type { Feature, FeatureCollection, LineString, MultiLineString, Point, Position } from "geojson";
import { AppError, badRequest } from "../../core/errors.ts";
import { workerUrl } from "../../core/paths.ts";

export const MAX_GPX_BYTES = 20 * 1024 * 1024;
/** Elevation has to change by this much before it counts as climbing, to ignore GPS jitter. */
const ASCENT_THRESHOLD_METERS = 3;

export type TrackFeature = Feature<LineString | MultiLineString | Point, TrackProperties>;
export type TrackCollection = FeatureCollection<LineString | MultiLineString | Point, TrackProperties>;

export interface TrackProperties {
  name?: string;
  desc?: string;
  /** "trk" or "rte" for lines; absent for waypoints. */
  _gpxType?: "trk" | "rte";
  /** Waypoint or track timestamp, ISO 8601. */
  time?: string;
  sym?: string;
  /** Per-point timestamps: one array per line, or one per segment for multi-segment tracks. */
  coordinateProperties?: { times?: Array<string | null> | Array<Array<string | null>> };
}

export interface TrackStats {
  distanceMeters: number;
  ascentMeters: number | null;
  pointCount: number;
  bounds: Bbox | null;
}

export interface ParsedGpx {
  collection: TrackCollection;
  /** The file's own name for itself, from its metadata or its first track. */
  name: string | null;
  description: string | null;
  lines: number;
  waypoints: number;
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

function cleanPosition(position: Position): Position | undefined {
  const [lon, lat, ele] = position;
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  // Six decimals is about ten centimetres: finer than any receiver, and much smaller to store.
  const cleaned: Position = [round(lon, 6), round(lat, 6)];
  if (typeof ele === "number" && Number.isFinite(ele)) cleaned.push(round(ele, 1));
  return cleaned;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim().slice(0, 2000) : undefined);

/** Keeps the positions that are valid, and the timestamps that belong to them. */
function cleanLine(positions: Position[], times: unknown): { coordinates: Position[]; times: Array<string | null> | undefined } {
  const coordinates: Position[] = [];
  const kept: Array<string | null> = [];
  const source = Array.isArray(times) && times.length === positions.length ? times : undefined;
  positions.forEach((position, index) => {
    const cleaned = cleanPosition(position);
    if (!cleaned) return;
    coordinates.push(cleaned);
    const time = source?.[index];
    kept.push(typeof time === "string" && !Number.isNaN(Date.parse(time)) ? time : null);
  });
  return { coordinates, times: source && kept.some((time) => time !== null) ? kept : undefined };
}

function cleanFeature(feature: Feature): TrackFeature | undefined {
  const geometry = feature.geometry;
  const source = (feature.properties ?? {}) as Record<string, unknown>;
  const properties: TrackProperties = {};
  const name = text(source.name);
  const desc = text(source.desc) ?? text(source.cmt);
  if (name) properties.name = name;
  if (desc) properties.desc = desc;
  const time = text(source.time);
  if (time && !Number.isNaN(Date.parse(time))) properties.time = time;
  const times = (source.coordinateProperties as { times?: unknown } | undefined)?.times;

  if (geometry?.type === "Point") {
    const coordinates = cleanPosition(geometry.coordinates);
    if (!coordinates) return undefined;
    const sym = text(source.sym);
    if (sym) properties.sym = sym;
    return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
  }
  properties._gpxType = source._gpxType === "rte" ? "rte" : "trk";
  if (geometry?.type === "LineString") {
    const line = cleanLine(geometry.coordinates, times);
    if (line.coordinates.length < 2) return undefined;
    if (line.times) properties.coordinateProperties = { times: line.times };
    return { type: "Feature", properties, geometry: { type: "LineString", coordinates: line.coordinates } };
  }
  if (geometry?.type === "MultiLineString") {
    const segments = geometry.coordinates
      .map((segment, index) => cleanLine(segment, Array.isArray(times) ? times[index] : undefined))
      .filter((segment) => segment.coordinates.length >= 2);
    if (segments.length === 0) return undefined;
    if (segments.some((segment) => segment.times)) {
      properties.coordinateProperties = { times: segments.map((segment) => segment.times ?? segment.coordinates.map(() => null)) };
    }
    return {
      type: "Feature",
      properties,
      geometry: { type: "MultiLineString", coordinates: segments.map((segment) => segment.coordinates) },
    };
  }
  return undefined;
}

/**
 * Parses GPX text into GeoJSON. Throws a `bad_request` with a plain explanation for
 * anything that is not a GPX file Outpost is willing to read.
 */
export function parseGpx(source: string): ParsedGpx {
  if (Buffer.byteLength(source) > MAX_GPX_BYTES) throw badRequest("That GPX file is larger than 20 MB. Split it into smaller files.");
  // Entity declarations are how XML files are made to balloon in memory or pull in
  // other files. GPX has no use for them, so a file with a DOCTYPE is refused unread.
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw badRequest("That file declares a DOCTYPE or entities, which GPX files do not need and Outpost does not accept.");
  }
  let document: ReturnType<DOMParser["parseFromString"]>;
  try {
    document = new DOMParser({
      onError(level, message) {
        if (level !== "warning") throw new Error(message);
      },
    }).parseFromString(source, "text/xml");
  } catch {
    throw badRequest("That file is not well-formed XML, so it cannot be read as GPX.");
  }
  const root = document.documentElement;
  if (root?.localName !== "gpx") throw badRequest("That file is XML but not GPX. Export the route as GPX and try again.");

  let converted: FeatureCollection;
  try {
    // The two packages each ship their own copy of the DOM typings; the objects are the same.
    converted = gpxToGeoJson(document as unknown as Parameters<typeof gpxToGeoJson>[0]);
  } catch {
    throw badRequest("That GPX file could not be understood.");
  }
  const features = converted.features.map(cleanFeature).filter((feature): feature is TrackFeature => feature !== undefined);
  const lines = features.filter((feature) => feature.geometry.type !== "Point").length;
  const waypoints = features.length - lines;
  if (features.length === 0) throw badRequest("That GPX file has no tracks, routes or waypoints in it.");

  const childText = (
    parent: { getElementsByTagName(name: string): ArrayLike<{ textContent: string | null; parentNode: unknown }> } | null | undefined,
    tag: string,
  ) => {
    const nodes = parent?.getElementsByTagName(tag);
    for (let i = 0; nodes && i < nodes.length; i += 1) if (nodes[i]!.parentNode === parent) return text(nodes[i]!.textContent);
    return undefined;
  };
  const metadata = root.getElementsByTagName("metadata")[0];
  const firstLine = features.find((feature) => feature.geometry.type !== "Point");
  return {
    collection: { type: "FeatureCollection", features },
    name: childText(metadata, "name") ?? firstLine?.properties.name ?? null,
    description: childText(metadata, "desc") ?? firstLine?.properties.desc ?? null,
    lines,
    waypoints,
  };
}

/** Every line of a collection as plain arrays of positions, one per segment. */
function segmentsOf(collection: TrackCollection): Position[][] {
  const segments: Position[][] = [];
  for (const feature of collection.features) {
    if (feature.geometry.type === "LineString") segments.push(feature.geometry.coordinates);
    else if (feature.geometry.type === "MultiLineString") segments.push(...feature.geometry.coordinates);
  }
  return segments;
}

/**
 * Length, climb, size and extent of a set of lines. Climb is the sum of rises, counted
 * only once the elevation has moved by a few metres from the last counted point, so
 * the wobble of a GPS standing still does not add up to a mountain.
 */
export function trackStats(collection: TrackCollection): TrackStats {
  let distance = 0;
  let ascent = 0;
  let hasElevation = false;
  let pointCount = 0;
  for (const segment of segmentsOf(collection)) {
    pointCount += segment.length;
    let reference: number | undefined;
    for (let i = 0; i < segment.length; i += 1) {
      const [lon, lat, ele] = segment[i] as [number, number, number | undefined];
      if (i > 0) distance += haversineMeters(segment[i - 1]![1]!, segment[i - 1]![0]!, lat, lon);
      if (ele === undefined) continue;
      hasElevation = true;
      if (reference === undefined) reference = ele;
      else if (ele - reference >= ASCENT_THRESHOLD_METERS) {
        ascent += ele - reference;
        reference = ele;
      } else if (reference - ele >= ASCENT_THRESHOLD_METERS) {
        reference = ele;
      }
    }
  }

  let bounds: Bbox | null = null;
  const extend = ([lon, lat]: Position) => {
    bounds = bounds
      ? [Math.min(bounds[0], lon!), Math.min(bounds[1], lat!), Math.max(bounds[2], lon!), Math.max(bounds[3], lat!)]
      : [lon!, lat!, lon!, lat!];
  };
  for (const feature of collection.features) {
    if (feature.geometry.type === "Point") extend(feature.geometry.coordinates);
  }
  for (const segment of segmentsOf(collection)) for (const position of segment) extend(position);
  return { distanceMeters: round(distance, 1), ascentMeters: hasElevation ? round(ascent, 1) : null, pointCount, bounds };
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** Text made safe inside an XML element or attribute. Characters XML 1.0 forbids are dropped. */
export function escapeXml(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

export interface GpxWaypoint {
  name: string;
  description?: string;
  lat: number;
  lon: number;
  elevation?: number;
  time?: string;
  sym?: string;
}

export interface GpxDocument {
  name: string;
  description?: string;
  waypoints: GpxWaypoint[];
  /** Line features; `_gpxType: "rte"` ones are written as routes, the rest as tracks. */
  lines: Array<Feature<LineString | MultiLineString, TrackProperties>>;
}

const element = (tag: string, value: string | undefined, indent: string) =>
  value ? `${indent}<${tag}>${escapeXml(value)}</${tag}>\n` : "";

function pointXml(tag: string, position: Position, time: string | null | undefined, indent: string, extra = ""): string {
  const [lon, lat, ele] = position;
  const inner = `${typeof ele === "number" ? `${indent}  <ele>${ele}</ele>\n` : ""}${time ? `${indent}  <time>${escapeXml(time)}</time>\n` : ""}${extra}`;
  const open = `${indent}<${tag} lat="${lat}" lon="${lon}"`;
  return inner ? `${open}>\n${inner}${indent}</${tag}>\n` : `${open}/>\n`;
}

/** A GPX 1.1 document. Element order follows the schema: metadata, waypoints, routes, tracks. */
export function buildGpx(document: GpxDocument): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">\n';
  xml += `  <metadata>\n${element("name", document.name, "    ")}${element("desc", document.description, "    ")}  </metadata>\n`;

  for (const waypoint of document.waypoints) {
    const extra =
      element("name", waypoint.name, "    ") + element("desc", waypoint.description, "    ") + element("sym", waypoint.sym, "    ");
    const position: Position =
      waypoint.elevation === undefined ? [waypoint.lon, waypoint.lat] : [waypoint.lon, waypoint.lat, waypoint.elevation];
    xml += pointXml("wpt", position, waypoint.time, "  ", extra);
  }

  const routes = document.lines.filter((line) => line.properties._gpxType === "rte");
  const tracks = document.lines.filter((line) => line.properties._gpxType !== "rte");
  const segmentsAndTimes = (
    line: Feature<LineString | MultiLineString, TrackProperties>,
  ): Array<{ coordinates: Position[]; times: Array<string | null> | undefined }> => {
    const times = line.properties.coordinateProperties?.times;
    if (line.geometry.type === "LineString") {
      return [{ coordinates: line.geometry.coordinates, times: times as Array<string | null> | undefined }];
    }
    return line.geometry.coordinates.map((coordinates, index) => ({
      coordinates,
      times: (times as Array<Array<string | null>> | undefined)?.[index],
    }));
  };

  for (const route of routes) {
    xml += `  <rte>\n${element("name", route.properties.name, "    ")}${element("desc", route.properties.desc, "    ")}`;
    for (const segment of segmentsAndTimes(route)) {
      segment.coordinates.forEach((position, index) => {
        xml += pointXml("rtept", position, segment.times?.[index], "    ");
      });
    }
    xml += "  </rte>\n";
  }
  for (const track of tracks) {
    xml += `  <trk>\n${element("name", track.properties.name, "    ")}${element("desc", track.properties.desc, "    ")}`;
    for (const segment of segmentsAndTimes(track)) {
      xml += "    <trkseg>\n";
      segment.coordinates.forEach((position, index) => {
        xml += pointXml("trkpt", position, segment.times?.[index], "      ");
      });
      xml += "    </trkseg>\n";
    }
    xml += "  </trk>\n";
  }
  return `${xml}</gpx>\n`;
}

/** The lines and waypoints of a stored track, split the way `buildGpx` wants them. */
export function splitCollection(collection: TrackCollection): Pick<GpxDocument, "lines" | "waypoints"> {
  const lines: GpxDocument["lines"] = [];
  const waypoints: GpxWaypoint[] = [];
  for (const feature of collection.features) {
    if (feature.geometry.type === "Point") {
      const [lon, lat, ele] = feature.geometry.coordinates as [number, number, number | undefined];
      waypoints.push({
        name: feature.properties.name ?? "Waypoint",
        description: feature.properties.desc,
        lat,
        lon,
        elevation: ele,
        time: feature.properties.time,
        sym: feature.properties.sym,
      });
    } else {
      lines.push(feature as Feature<LineString | MultiLineString, TrackProperties>);
    }
  }
  return { lines, waypoints };
}

// ── Parsing off the main thread ─────────────────────────────────────────────

/** Heap a GPX parse may use, and how long it may take. Real tracks need a fraction of either. */
const GPX_WORKER_HEAP_MB = 384;
const GPX_WORKER_TIMEOUT_MS = 30_000;
const TOO_COMPLEX = "That GPX file is too complex to read. If it holds many routes, export them one at a time and import them separately.";

/**
 * `parseGpx` in a worker thread with limits of its own. Use this for anything that
 * arrives from outside; a hostile or freakish file then costs one worker, not the server.
 */
export function parseGpxSafely(source: string): Promise<ParsedGpx> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(new URL("./gpx.worker.ts", import.meta.url), "gpx"), {
      workerData: { source },
      resourceLimits: { maxOldGenerationSizeMb: GPX_WORKER_HEAP_MB },
    });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      finish();
    };
    const timer = setTimeout(() => settle(() => reject(badRequest(TOO_COMPLEX))), GPX_WORKER_TIMEOUT_MS);
    worker.once("message", (message: { ok: true; parsed: ParsedGpx } | { ok: false; code: string; message: string }) => {
      settle(() => (message.ok ? resolve(message.parsed) : reject(new AppError(message.code as never, message.message))));
    });
    // Running out of its memory allowance ends the worker with an error or a non-zero exit.
    worker.once("error", () => settle(() => reject(badRequest(TOO_COMPLEX))));
    worker.once("exit", (code) => {
      if (code !== 0) settle(() => reject(badRequest(TOO_COMPLEX)));
    });
  });
}
