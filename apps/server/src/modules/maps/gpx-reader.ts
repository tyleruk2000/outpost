/**
 * Reads GPX text into GeoJSON in one pass.
 *
 * The file is walked with `XmlTokenizer`, which builds nothing, and only what Outpost
 * stores is kept: positions, times, names and descriptions. Everything else in the
 * file, extensions above all, is checked for being well-formed and then passed over.
 * Memory therefore grows with the points kept and not with the number of elements in
 * the file, and the limits below put a ceiling on the points.
 *
 * What is read, in GPX 1.0 and 1.1 alike:
 *
 *   gpx > metadata > name, desc        the file's own name (GPX 1.1)
 *   gpx > name, desc                   the same, where GPX 1.0 keeps them
 *   gpx > trk > name, desc, cmt        a track; `cmt` stands in for a missing `desc`
 *   gpx > trk > trkseg > trkpt         its points, with `ele` and `time`
 *   gpx > rte > name, desc, cmt        a route
 *   gpx > rte > rtept                  its points, with `ele`
 *   gpx > wpt > name, desc, cmt, time, sym, ele
 *
 * An element counts only where the format puts it, and only in the namespace of the
 * `<gpx>` element itself, whatever prefix the file writes it with.
 */
import type { Position } from "geojson";
import { badRequest } from "../../core/errors.ts";
import type { ParsedGpx, TrackFeature, TrackProperties } from "./gpx.ts";
import { XML_CLOSE, XML_END, XML_LIMITS, XML_OPEN, XML_TEXT, XmlLimitError, XmlSyntaxError, XmlTokenizer } from "./gpx-xml.ts";

/**
 * What one GPX file may hold. A file over any of these is refused with a sentence
 * saying which; none of them is near what a real recording or plan contains.
 * docs/maps.md gives the same numbers.
 */
export const GPX_LIMITS = {
  /** Track points and route points in the whole file. */
  linePoints: 1_000_000,
  waypoints: 20_000,
  /** Tracks and routes together. */
  lines: 10_000,
  /** Track segments in the whole file. */
  segments: 100_000,
  /** Characters kept of a name, description, comment or symbol; the rest is dropped. */
  textLength: 2000,
  /** Elements open inside one another. */
  depth: XML_LIMITS.depth,
  /** Attributes on one element. */
  attributes: XML_LIMITS.attributes,
  /** Namespace declarations in force at one place. */
  namespaces: XML_LIMITS.namespaces,
  /** Characters in one unbroken piece of text, CDATA section, comment or attribute value. */
  run: XML_LIMITS.run,
} as const;

const NOT_WELL_FORMED = "That file is not well-formed XML, so it cannot be read as GPX.";
const NOT_GPX = "That file is XML but not GPX. Export the route as GPX and try again.";
const count = (value: number) => value.toLocaleString("en-GB");
const SPLIT = "Split it into smaller files and import them one at a time.";
const TOO_MANY = {
  linePoints: `That GPX file has more than ${count(GPX_LIMITS.linePoints)} track and route points. ${SPLIT}`,
  waypoints: `That GPX file has more than ${count(GPX_LIMITS.waypoints)} waypoints. ${SPLIT}`,
  lines: `That GPX file has more than ${count(GPX_LIMITS.lines)} tracks and routes. ${SPLIT}`,
  segments: `That GPX file has more than ${count(GPX_LIMITS.segments)} track segments. ${SPLIT}`,
  depth: `That GPX file has elements nested more than ${count(GPX_LIMITS.depth)} deep, which GPX never needs, so Outpost will not read it.`,
  attributes: `That GPX file has an element with more than ${count(GPX_LIMITS.attributes)} attributes, which GPX never needs, so Outpost will not read it.`,
  namespaces: `That GPX file declares more than ${count(GPX_LIMITS.namespaces)} XML namespaces in one place, which GPX never needs, so Outpost will not read it.`,
  run: `That GPX file has a single piece of text longer than ${count(GPX_LIMITS.run)} characters, which GPX never needs, so Outpost will not read it.`,
} as const;

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** A position worth storing, or undefined for one that is nowhere on Earth. */
function cleanPosition(lon: number, lat: number, ele: number): Position | undefined {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  // Six decimals is about ten centimetres: finer than any receiver, and much smaller to store.
  const cleaned: Position = [round(lon, 6), round(lat, 6)];
  if (Number.isFinite(ele)) cleaned.push(round(ele, 1));
  return cleaned;
}

const validTime = (time: string | undefined): string | undefined => (time && !Number.isNaN(Date.parse(time)) ? time : undefined);

// What an open element is, as far as GPX goes. Anything else, and anything inside it, is OTHER.
const OTHER = 0;
const GPX = 1;
const METADATA = 2;
const TRK = 3;
const TRKSEG = 4;
const TRKPT = 5;
const RTE = 6;
const RTEPT = 7;
const WPT = 8;
const FIELD = 9;

/** Characters kept of a time and of a height: far more than either needs. */
const TIME_LENGTH = 100;
const NUMBER_LENGTH = 64;

type Fields = Record<string, string | undefined>;

interface Segment {
  coordinates: Position[];
  /** One entry per coordinate once any point has a usable time; undefined until then. */
  times: Array<string | null> | undefined;
  /** Points with a latitude and longitude that are numbers, whether or not they were kept. */
  read: number;
  /** How many of those carried a time. */
  timed: number;
}

const newSegment = (): Segment => ({ coordinates: [], times: undefined, read: 0, timed: 0 });

/** A segment's times, when every point it read had one and at least one of them is a real time. */
const timesOf = (segment: Segment) => (segment.timed === segment.read ? segment.times : undefined);

/**
 * Reads GPX text. Throws a `bad_request` with a plain explanation for anything that is
 * not a GPX file Outpost is willing to read. The caller has already refused files that
 * are too large or declare a DOCTYPE.
 */
export function readGpx(source: string): ParsedGpx {
  const xml = new XmlTokenizer(source);
  const kinds = new Uint8Array(XML_LIMITS.depth + 2);
  let isGpx: boolean | undefined;
  let rootUri = "";

  const file: Fields = {};
  let metadataSeen = false;
  let readingMetadata = false;
  const tracks: TrackFeature[] = [];
  const routes: TrackFeature[] = [];
  const waypoints: TrackFeature[] = [];
  let lineCount = 0;
  let segmentCount = 0;
  let linePointCount = 0;
  let waypointCount = 0;

  // The track or route being read, and the point being read.
  let line: Fields = {};
  let insideLine = false;
  let segments: Segment[] = [];
  let segment = newSegment();
  let point: Fields = {};
  let lat = Number.NaN;
  let lon = Number.NaN;
  let pointHasTime = false;

  // The text of one element being gathered: where it goes, and how much of it is kept.
  let captureDepth = 0;
  let captureInto: Fields = file;
  let captureKey = "";
  let captureLimit = 0;
  let captured = "";
  let capturedAny = false;
  let capturedTooMuch = false;

  const capture = (into: Fields, key: string, limit: number): number => {
    // The first element of a kind is the one that counts, as it always was.
    if (into[key] !== undefined) return OTHER;
    captureDepth = xml.depth;
    captureInto = into;
    captureKey = key;
    captureLimit = limit;
    captured = "";
    capturedAny = false;
    capturedTooMuch = false;
    return FIELD;
  };

  /** Adds a piece of text to what is being gathered: trimmed at the start, and cut at the limit. */
  const gather = () => {
    if (xml.textLength === 0) return;
    capturedAny = true;
    if (capturedTooMuch) return;
    let piece = xml.text();
    if (captured === "") piece = piece.trimStart();
    if (piece === "") return;
    const room = captureLimit - captured.length;
    if (piece.length <= room) {
      captured += piece;
      return;
    }
    captured += piece.slice(0, room);
    if (piece.slice(room).trim() !== "") capturedTooMuch = true;
  };

  const endCapture = () => {
    // Exactly what trimming the whole text and then cutting it would give.
    const value = capturedTooMuch ? captured : captured.trimEnd();
    if (captureKey === "time") {
      // Too long to be a time. A point's time also dates its track, if nothing has yet.
      const time = capturedTooMuch ? "" : value;
      captureInto[captureKey] = time;
      if (captureInto === point && insideLine) {
        pointHasTime = capturedAny;
        if (line.time === undefined) line.time = time;
      }
    } else {
      captureInto[captureKey] = value;
    }
    captureDepth = 0;
    captured = "";
  };

  const startPoint = () => {
    point = {};
    pointHasTime = false;
    lat = Number.parseFloat(xml.attribute("lat") ?? "");
    lon = Number.parseFloat(xml.attribute("lon") ?? "");
  };

  /** The point just read, cleaned, or undefined when it is not a usable position. */
  const finishedPosition = (): Position | undefined =>
    cleanPosition(lon, lat, point.ele === undefined ? Number.NaN : Number.parseFloat(point.ele));

  const endLinePoint = () => {
    // A point without numbers for a position was never a point; it does not count for anything.
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    segment.read += 1;
    if (pointHasTime) segment.timed += 1;
    const position = finishedPosition();
    if (!position) return;
    segment.coordinates.push(position);
    const time = validTime(point.time) ?? null;
    if (time !== null && !segment.times) segment.times = new Array<string | null>(segment.coordinates.length - 1).fill(null);
    segment.times?.push(time);
  };

  const describe = (fields: Fields): TrackProperties => {
    const properties: TrackProperties = {};
    if (fields.name) properties.name = fields.name;
    const desc = fields.desc || fields.cmt;
    if (desc) properties.desc = desc;
    const time = validTime(fields.time);
    if (time) properties.time = time;
    return properties;
  };

  const endTrack = () => {
    // A segment needs two points to be a line. Whether the track is one line or several
    // is settled before points nowhere on Earth are dropped, as it always was.
    if (segments.length === 0) return;
    const properties = describe(line);
    properties._gpxType = "trk";
    if (segments.length === 1) {
      const only = segments[0]!;
      if (only.coordinates.length < 2) return;
      const times = timesOf(only);
      if (times) properties.coordinateProperties = { times };
      tracks.push({ type: "Feature", properties, geometry: { type: "LineString", coordinates: only.coordinates } });
      return;
    }
    const kept = segments.filter((item) => item.coordinates.length >= 2);
    if (kept.length === 0) return;
    if (kept.some((item) => timesOf(item))) {
      properties.coordinateProperties = { times: kept.map((item) => timesOf(item) ?? item.coordinates.map(() => null)) };
    }
    tracks.push({ type: "Feature", properties, geometry: { type: "MultiLineString", coordinates: kept.map((item) => item.coordinates) } });
  };

  const endRoute = () => {
    if (segment.read < 2 || segment.coordinates.length < 2) return;
    const properties = describe(line);
    properties._gpxType = "rte";
    routes.push({ type: "Feature", properties, geometry: { type: "LineString", coordinates: segment.coordinates } });
  };

  const endWaypoint = () => {
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    const coordinates = finishedPosition();
    if (!coordinates) return;
    const properties = describe(point);
    if (point.sym) properties.sym = point.sym;
    waypoints.push({ type: "Feature", properties, geometry: { type: "Point", coordinates } });
  };

  /** What the element just opened is, given what it is inside. */
  const classify = (parent: number): number => {
    switch (parent) {
      case GPX:
        if (xml.is("trk")) {
          lineCount += 1;
          if (lineCount > GPX_LIMITS.lines) throw badRequest(TOO_MANY.lines);
          line = {};
          insideLine = true;
          segments = [];
          return TRK;
        }
        if (xml.is("rte")) {
          lineCount += 1;
          if (lineCount > GPX_LIMITS.lines) throw badRequest(TOO_MANY.lines);
          line = {};
          insideLine = true;
          segment = newSegment();
          return RTE;
        }
        if (xml.is("wpt")) {
          waypointCount += 1;
          if (waypointCount > GPX_LIMITS.waypoints) throw badRequest(TOO_MANY.waypoints);
          startPoint();
          return WPT;
        }
        if (xml.is("metadata")) {
          readingMetadata = !metadataSeen;
          metadataSeen = true;
          return METADATA;
        }
        if (xml.is("name")) return capture(file, "ownName", GPX_LIMITS.textLength);
        if (xml.is("desc")) return capture(file, "ownDesc", GPX_LIMITS.textLength);
        return OTHER;
      case METADATA:
        if (!readingMetadata) return OTHER;
        if (xml.is("name")) return capture(file, "name", GPX_LIMITS.textLength);
        if (xml.is("desc")) return capture(file, "desc", GPX_LIMITS.textLength);
        return OTHER;
      case TRKSEG:
        if (!xml.is("trkpt")) return OTHER;
        linePointCount += 1;
        if (linePointCount > GPX_LIMITS.linePoints) throw badRequest(TOO_MANY.linePoints);
        startPoint();
        return TRKPT;
      case TRKPT:
      case RTEPT:
        if (xml.is("ele")) return capture(point, "ele", NUMBER_LENGTH);
        if (xml.is("time")) return capture(point, "time", TIME_LENGTH);
        return OTHER;
      case TRK:
      case RTE:
        if (parent === TRK && xml.is("trkseg")) {
          segmentCount += 1;
          if (segmentCount > GPX_LIMITS.segments) throw badRequest(TOO_MANY.segments);
          segment = newSegment();
          return TRKSEG;
        }
        if (parent === RTE && xml.is("rtept")) {
          linePointCount += 1;
          if (linePointCount > GPX_LIMITS.linePoints) throw badRequest(TOO_MANY.linePoints);
          startPoint();
          return RTEPT;
        }
        if (xml.is("name")) return capture(line, "name", GPX_LIMITS.textLength);
        if (xml.is("desc")) return capture(line, "desc", GPX_LIMITS.textLength);
        if (xml.is("cmt")) return capture(line, "cmt", GPX_LIMITS.textLength);
        if (xml.is("time")) return capture(line, "time", TIME_LENGTH);
        return OTHER;
      case WPT:
        if (xml.is("ele")) return capture(point, "ele", NUMBER_LENGTH);
        if (xml.is("time")) return capture(point, "time", TIME_LENGTH);
        if (xml.is("name")) return capture(point, "name", GPX_LIMITS.textLength);
        if (xml.is("desc")) return capture(point, "desc", GPX_LIMITS.textLength);
        if (xml.is("cmt")) return capture(point, "cmt", GPX_LIMITS.textLength);
        if (xml.is("sym")) return capture(point, "sym", GPX_LIMITS.textLength);
        return OTHER;
      default:
        return OTHER;
    }
  };

  try {
    for (;;) {
      const event = xml.next();
      if (event === XML_TEXT) {
        if (captureDepth > 0) gather();
      } else if (event === XML_OPEN) {
        const depth = xml.depth;
        if (depth === 1) {
          isGpx = xml.is("gpx");
          rootUri = xml.uri;
          kinds[1] = isGpx ? GPX : OTHER;
        } else {
          const parent = kinds[depth - 1]!;
          kinds[depth] = parent === OTHER || parent === FIELD || xml.uri !== rootUri ? OTHER : classify(parent);
        }
      } else if (event === XML_CLOSE) {
        const kind = kinds[xml.depth + 1]!;
        if (kind === OTHER) continue;
        if (kind === FIELD) endCapture();
        else if (kind === TRKPT || kind === RTEPT) endLinePoint();
        else if (kind === TRKSEG) {
          if (segment.read >= 2) segments.push(segment);
        } else if (kind === TRK || kind === RTE) {
          if (kind === TRK) endTrack();
          else endRoute();
          insideLine = false;
        } else if (kind === WPT) endWaypoint();
      } else if (event === XML_END) {
        break;
      }
    }
  } catch (error) {
    // A file that is not GPX is told so, rather than told which limit it went over.
    if (error instanceof XmlLimitError) throw badRequest(isGpx === false ? NOT_GPX : TOO_MANY[error.limit]);
    if (error instanceof XmlSyntaxError) throw badRequest(NOT_WELL_FORMED);
    throw error;
  }
  if (!isGpx) throw badRequest(NOT_GPX);

  // Tracks, then routes, then waypoints, whatever order the file has them in.
  const features = [...tracks, ...routes, ...waypoints];
  if (features.length === 0) throw badRequest("That GPX file has no tracks, routes or waypoints in it.");
  const firstLine = tracks[0] ?? routes[0];
  return {
    collection: { type: "FeatureCollection", features },
    name: file.name || file.ownName || firstLine?.properties.name || null,
    description: file.desc || file.ownDesc || firstLine?.properties.desc || null,
    lines: tracks.length + routes.length,
    waypoints: waypoints.length,
  };
}
