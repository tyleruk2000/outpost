/**
 * GPX in and out.
 *
 * Reading: a GPX file is XML from who knows where, so it is checked before it is read
 * (its size, no DOCTYPE, no entity declarations) and then read in one pass into
 * GeoJSON, which is what the map draws and what is stored. The reading itself is in
 * `gpx-reader.ts`, on top of the small XML reader in `gpx-xml.ts`; nothing here builds
 * a tree of the file. Writing: GPX 1.1 built by hand from that GeoJSON, with every
 * piece of text escaped.
 */
import { Worker } from "node:worker_threads";
import type { Bbox, RouteElevation } from "@outpost/shared";
import { ASCENT_THRESHOLD_METERS, haversineMeters } from "@outpost/shared";
import type { Feature, FeatureCollection, LineString, MultiLineString, Point, Position } from "geojson";
import { AppError, badRequest, conflict } from "../../core/errors.ts";
import { workerUrl } from "../../core/paths.ts";
import { readGpx } from "./gpx-reader.ts";

export const MAX_GPX_BYTES = 20 * 1024 * 1024;

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
  /** Set on a line that was drawn on the map rather than imported. See `drawn-route.ts`. */
  _drawn?: true;
  /** Set on a line that was recorded on the map as its maker walked it, rather than imported from a file. */
  _recorded?: true;
  /** For a drawn line: whether its heights could be read from installed terrain. */
  _elevation?: RouteElevation;
  /** For a drawn line: the line sampled between its points, with heights. Never exported. */
  _profile?: Position[];
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

/**
 * Parses GPX text into GeoJSON. Throws a `bad_request` with a plain explanation for
 * anything that is not a GPX file Outpost is willing to read, including a file that
 * holds more than `GPX_LIMITS` allows.
 *
 * This runs on the thread that calls it. Anything that arrives from outside goes
 * through `parseGpxSafely` instead.
 */
export function parseGpx(source: string): ParsedGpx {
  if (Buffer.byteLength(source) > MAX_GPX_BYTES) throw badRequest("That GPX file is larger than 20 MB. Split it into smaller files.");
  // Entity declarations are how XML files are made to balloon in memory or pull in
  // other files. GPX has no use for them, so a file with a DOCTYPE is refused unread.
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw badRequest("That file declares a DOCTYPE or entities, which GPX files do not need and Outpost does not accept.");
  }
  // Uploads are read as UTF-8. A file saved as UTF-16 arrives with a NUL beside every
  // character, after two unreadable ones if it began with a byte-order mark.
  const first = source.charCodeAt(0) === 0xfffd && source.charCodeAt(1) === 0xfffd ? 2 : 0;
  const pair = [source.charCodeAt(first), source.charCodeAt(first + 1)];
  if ((pair[0] === 0x3c && pair[1] === 0) || (pair[0] === 0 && pair[1] === 0x3c)) {
    throw badRequest("That file is saved as UTF-16 text, which Outpost cannot read. Save or export it as UTF-8 and try again.");
  }
  return readGpx(source);
}

/** Every line of a collection as plain arrays of positions, one per segment. */
function segmentsOf(collection: TrackCollection): Position[][] {
  const segments: Position[][] = [];
  for (const feature of collection.features) {
    if (feature.geometry.type === "LineString") segments.push(feature.geometry.coordinates);
    else if (feature.geometry.type === "MultiLineString") for (const segment of feature.geometry.coordinates) segments.push(segment);
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

/**
 * A number as GPX wants it: plain decimal digits. JavaScript writes very small numbers
 * as "5e-8", which the format does not allow and other apps refuse.
 */
export function decimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(digits);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

function pointXml(tag: string, position: Position, time: string | null | undefined, indent: string, extra = ""): string {
  const [lon, lat, ele] = position;
  const inner = `${typeof ele === "number" && Number.isFinite(ele) ? `${indent}  <ele>${decimal(ele, 2)}</ele>\n` : ""}${time ? `${indent}  <time>${escapeXml(time)}</time>\n` : ""}${extra}`;
  const open = `${indent}<${tag} lat="${decimal(lat!, 7)}" lon="${decimal(lon!, 7)}"`;
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

/**
 * Heap a GPX parse may use, and how long it may take. The reader's own limits
 * (`GPX_LIMITS`) are what keep a file within these: the largest file it accepts needs
 * well under half this heap. The two numbers here are the last line, for a mistake in
 * the reader, and nothing is meant to reach them.
 */
const GPX_WORKER_HEAP_MB = 384;
const GPX_WORKER_TIMEOUT_MS = 30_000;
const TOO_COMPLEX = "That GPX file is too complex to read. If it holds many routes, export them one at a time and import them separately.";
/**
 * Files read at once, and files that may wait behind them. A read holds the text of
 * the file and what is kept of it, a few hundred megabytes for the largest file there
 * can be, so a burst of uploads takes turns instead of adding up.
 */
export const GPX_READS_AT_ONCE = 2;
export const GPX_READS_WAITING = 6;
const BUSY = "Outpost is already reading several GPX files. Wait for those to finish, then import this one again.";

let reading = 0;
const waiting: Array<() => void> = [];

/** How many files are being read and how many are waiting, for tests and for anyone looking into a slow import. */
export const gpxReads = () => ({ reading, waiting: waiting.length });

/** Runs `work` when a place is free. Refuses at once, with a `conflict`, when the line is already full. */
async function inTurn<T>(work: () => Promise<T>): Promise<T> {
  if (reading < GPX_READS_AT_ONCE) reading += 1;
  else if (waiting.length >= GPX_READS_WAITING) throw conflict(BUSY);
  // Whoever finishes hands its place straight to the first in line, so `reading` stays as it is.
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else reading -= 1;
  }
}

/** What one parse cost its worker. */
export interface GpxWorkerUsage {
  /** Heap the worker had claimed when it finished: the text of the file, what was kept of it, and working room. */
  heapBytes: number;
  /** Time spent reading, not counting starting the worker. */
  milliseconds: number;
}

export interface GpxWorkerOptions {
  /** A tighter heap than usual, for tests that prove how little a file needs. */
  heapMb?: number;
  timeoutMs?: number;
  /** Told what the parse cost, whether it ended in a result or a refusal. */
  onUsage?: (usage: GpxWorkerUsage) => void;
}

type GpxWorkerMessage = ({ ok: true; parsed: ParsedGpx } | { ok: false; code: string; message: string }) & { usage: GpxWorkerUsage };

/**
 * `parseGpx` in a worker thread with limits of its own. Use this for anything that
 * arrives from outside: the server's own thread stays free to answer while a large
 * file is read, and a file that somehow got past the reader's limits costs one worker.
 * Only `GPX_READS_AT_ONCE` files are read at a time; the rest wait their turn.
 */
export function parseGpxSafely(source: string, options: GpxWorkerOptions = {}): Promise<ParsedGpx> {
  return inTurn(() => readInWorker(source, options));
}

function readInWorker(source: string, options: GpxWorkerOptions): Promise<ParsedGpx> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(new URL("./gpx.worker.ts", import.meta.url), "gpx"), {
      workerData: { source },
      resourceLimits: { maxOldGenerationSizeMb: options.heapMb ?? GPX_WORKER_HEAP_MB },
    });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      finish();
    };
    const timer = setTimeout(() => settle(() => reject(badRequest(TOO_COMPLEX))), options.timeoutMs ?? GPX_WORKER_TIMEOUT_MS);
    worker.once("message", (message: GpxWorkerMessage) => {
      options.onUsage?.(message.usage);
      settle(() => (message.ok ? resolve(message.parsed) : reject(new AppError(message.code as never, message.message))));
    });
    // Running out of its memory allowance ends the worker with an error or a non-zero exit.
    worker.once("error", () => settle(() => reject(badRequest(TOO_COMPLEX))));
    worker.once("exit", (code) => {
      if (code !== 0) settle(() => reject(badRequest(TOO_COMPLEX)));
    });
  });
}
