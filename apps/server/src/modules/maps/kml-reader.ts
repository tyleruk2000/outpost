/**
 * Reads KML text into the GeoJSON Outpost stores, in one pass.
 *
 * The file is walked with `XmlTokenizer`, which builds nothing, as GPX files are. Only
 * what Outpost keeps is read: each Placemark's name and description, and its geometry.
 *
 *   Placemark > name, description
 *   Placemark > Point > coordinates                       a place
 *   Placemark > LineString > coordinates                  a line of the route
 *   Placemark > gx:Track > gx:coord                       a line of the route (a recording)
 *   Placemark > Polygon > outer/innerBoundaryIs >
 *               LinearRing > coordinates                  an outline: a closed line
 *   Placemark > LinearRing > coordinates                  an outline
 *   Placemark > MultiGeometry / gx:MultiTrack > …         any of these, nested
 *   kml > Document (or Folder) > name, description        the file's own name
 *   Folder > name                                         a route's name, when lines are in more than one folder
 *
 * A file's lines and outlines are one route, as a GPX file's are, unless they lie in
 * more than one Folder: then each Folder that holds any is a route of its own, named
 * after it, holding what lies in it and not in a Folder inside it. What lies outside
 * every Folder is a route too, named after the file. Points are places either way.
 *
 * Elements are matched by their local name, whatever namespace they are in, so files
 * written to KML 2.0, 2.1 and 2.2, with or without the Google extensions, are read the
 * same way. A NetworkLink, an overlay's image or any other reference to another file
 * is not followed: Outpost reads what is in the file and nothing else.
 */
import type { Position } from "geojson";
import { badRequest } from "../../core/errors.ts";
import type { TrackFeature, TrackProperties } from "./gpx.ts";
import { cleanPosition } from "./gpx-reader.ts";
import { XML_CLOSE, XML_END, XML_OPEN, XML_TEXT, XmlLimitError, XmlSyntaxError, XmlTokenizer } from "./gpx-xml.ts";
import { MAP_FILE_LIMITS, type ParsedMapFile, plainText } from "./map-file-limits.ts";

const NOT_WELL_FORMED = "That file is not well-formed XML, so it cannot be read as KML.";
const NOT_KML = "That file is XML but not KML. Export it as KML, KMZ or GeoJSON and try again.";
const count = (value: number) => value.toLocaleString("en-GB");
const SPLIT = "Split it into smaller files and import them one at a time.";
const TOO_MANY = {
  linePoints: `That file has more than ${count(MAP_FILE_LIMITS.linePoints)} points in its lines and outlines. ${SPLIT}`,
  places: `That file has more than ${count(MAP_FILE_LIMITS.places)} points. ${SPLIT}`,
  lines: `That file has more than ${count(MAP_FILE_LIMITS.lines)} lines and outlines. ${SPLIT}`,
  depth: "That file has elements nested more deeply than KML ever needs, so Outpost will not read it.",
  attributes: "That file has an element with more attributes than KML ever needs, so Outpost will not read it.",
  namespaces: "That file declares more XML namespaces in one place than KML ever needs, so Outpost will not read it.",
  run: "That file has a single piece of text longer than the file may be, so Outpost will not read it.",
} as const;

// What an open element is. Anything else, and anything inside it, is OTHER.
const OTHER = 0;
const ROOT = 1;
const CONTAINER = 2;
const PLACEMARK = 3;
const POINT = 4;
const LINE = 5;
const RING = 6;
const POLYGON = 7;
const BOUNDARY = 8;
const MULTI = 9;
const TRACK = 10;
const FIELD = 11;
/** The owner of a name being gathered that is a Folder's. */
const FOLDER_NAME = 12;

type Field = "name" | "description" | "coordinates" | "coord";

/**
 * Reads KML text. Throws a `bad_request` with a plain explanation for anything that is
 * not a KML file Outpost is willing to read. The caller has already refused files that
 * are too large or declare a DOCTYPE.
 */
export function readKml(source: string): ParsedMapFile {
  // A KML file keeps a whole line in one `coordinates` element, so the text of one
  // element may be as long as the file itself (already capped by the caller).
  const xml = new XmlTokenizer(source, { run: source.length + 1 });
  const kinds = new Uint8Array(MAP_FILE_LIMITS.depth + 2);
  let isKml: boolean | undefined;

  let fileName: string | undefined;
  let fileDescription: string | undefined;
  let containerDepth = 0;
  // The containers open, innermost last: a Folder's group, or -1 for a Document. Group 0 is what lies in no Folder.
  const containers: number[] = [];
  const groupNames: Array<string | undefined> = [undefined];
  const group = () => {
    for (let index = containers.length - 1; index >= 0; index -= 1) if (containers[index]! > 0) return containers[index]!;
    return 0;
  };
  // Which group each line and outline belongs to, in the order they are kept.
  const lineGroups: number[] = [];
  const outlineGroups: number[] = [];

  const places: TrackFeature[] = [];
  const lines: TrackFeature[] = [];
  const outlines: TrackFeature[] = [];
  let linePointCount = 0;
  let lineCount = 0;

  // The Placemark being read.
  let placemark: { name?: string; description?: string } = {};
  let placemarkPoints: Position[] = [];
  let placemarkLines: Position[][] = [];
  let placemarkRings: Position[][] = [];
  let track: Position[] = [];

  // The text of one element being gathered.
  let captureField: Field = "name";
  let captureFor = 0;
  let captured = "";
  let capturedTooMuch = false;
  // What the coordinates being gathered belong to.
  let coordinatesOf = OTHER;

  const capture = (field: Field, owner: number): number => {
    captureField = field;
    captureFor = owner;
    captured = "";
    capturedTooMuch = false;
    return FIELD;
  };

  const gather = () => {
    if (capturedTooMuch) return;
    const piece = xml.text();
    const limit = captureField === "name" || captureField === "description" ? MAP_FILE_LIMITS.textLength * 4 : Number.POSITIVE_INFINITY;
    if (captured.length + piece.length > limit) {
      captured += piece.slice(0, limit - captured.length);
      capturedTooMuch = true;
      return;
    }
    captured += piece;
  };

  const countLine = (points: number) => {
    lineCount += 1;
    if (lineCount > MAP_FILE_LIMITS.lines) throw badRequest(TOO_MANY.lines);
    linePointCount += points;
    if (linePointCount > MAP_FILE_LIMITS.linePoints) throw badRequest(TOO_MANY.linePoints);
  };

  /** Positions from KML's "lon,lat[,alt]" tuples, separated by white space. */
  const tuples = (text: string): Position[] => {
    const positions: Position[] = [];
    // Some writers put a space after each comma; a tuple is still one position.
    const pattern = /[^\s,]+(?:\s*,\s*[^\s,]+){1,2}/g;
    for (const match of text.matchAll(pattern)) {
      const parts = match[0].split(",");
      const position = cleanPosition(
        Number.parseFloat(parts[0]!),
        Number.parseFloat(parts[1]!),
        parts[2] === undefined ? Number.NaN : Number.parseFloat(parts[2]),
      );
      if (position) positions.push(position);
      // Counted as read, kept or not, so a file cannot hold more than the limit of anything.
      if (positions.length > MAP_FILE_LIMITS.linePoints) throw badRequest(TOO_MANY.linePoints);
    }
    return positions;
  };

  const endCapture = () => {
    const text = captured;
    captured = "";
    switch (captureField) {
      case "name":
      case "description": {
        const value = plainText(text);
        if (captureFor === FOLDER_NAME) {
          groupNames[group()] ??= value || undefined;
          if (containerDepth <= 1) fileName ??= value;
        } else if (captureFor === PLACEMARK) {
          if (placemark[captureField] === undefined) placemark[captureField] = value;
        } else if (captureField === "name") fileName ??= value;
        else fileDescription ??= value;
        return;
      }
      case "coord": {
        // gx:coord is "lon lat alt", separated by spaces.
        const [lon, lat, ele] = text.trim().split(/\s+/);
        const position = cleanPosition(Number.parseFloat(lon ?? ""), Number.parseFloat(lat ?? ""), Number.parseFloat(ele ?? ""));
        if (position) track.push(position);
        if (track.length > MAP_FILE_LIMITS.linePoints) throw badRequest(TOO_MANY.linePoints);
        return;
      }
      case "coordinates": {
        const positions = tuples(text);
        if (coordinatesOf === POINT) {
          if (positions.length === 0) return;
          if (places.length + placemarkPoints.length >= MAP_FILE_LIMITS.places) throw badRequest(TOO_MANY.places);
          placemarkPoints.push(positions[0]!);
        } else if (coordinatesOf === LINE) {
          if (positions.length < 2) return;
          countLine(positions.length);
          placemarkLines.push(positions);
        } else if (coordinatesOf === RING) {
          if (positions.length < 3) return;
          // A ring is closed: its last position is its first. Close one a writer left open.
          const first = positions[0]!;
          const last = positions[positions.length - 1]!;
          if (first[0] !== last[0] || first[1] !== last[1]) positions.push(first);
          countLine(positions.length);
          placemarkRings.push(positions);
        }
        return;
      }
    }
  };

  const describe = (): TrackProperties => {
    const properties: TrackProperties = {};
    if (placemark.name) properties.name = placemark.name;
    if (placemark.description) properties.desc = placemark.description;
    return properties;
  };

  const endPlacemark = () => {
    for (const coordinates of placemarkPoints) {
      places.push({ type: "Feature", properties: describe(), geometry: { type: "Point", coordinates } });
    }
    if (placemarkLines.length > 0) lineGroups.push(group());
    if (placemarkRings.length > 0) outlineGroups.push(group());
    if (placemarkLines.length === 1) {
      lines.push({ type: "Feature", properties: describe(), geometry: { type: "LineString", coordinates: placemarkLines[0]! } });
    } else if (placemarkLines.length > 1) {
      lines.push({ type: "Feature", properties: describe(), geometry: { type: "MultiLineString", coordinates: placemarkLines } });
    }
    if (placemarkRings.length > 0) {
      const properties: TrackProperties = { ...describe(), _outline: true };
      outlines.push(
        placemarkRings.length === 1
          ? { type: "Feature", properties, geometry: { type: "LineString", coordinates: placemarkRings[0]! } }
          : { type: "Feature", properties, geometry: { type: "MultiLineString", coordinates: placemarkRings } },
      );
    }
  };

  /** A geometry element inside a Placemark or a MultiGeometry. */
  const geometry = (): number => {
    if (xml.is("Point")) return POINT;
    if (xml.is("LineString")) return LINE;
    if (xml.is("LinearRing")) return RING;
    if (xml.is("Polygon")) return POLYGON;
    if (xml.is("MultiGeometry") || xml.is("MultiTrack")) return MULTI;
    if (xml.is("Track")) {
      track = [];
      return TRACK;
    }
    return OTHER;
  };

  const classify = (parent: number): number => {
    switch (parent) {
      case ROOT:
      case CONTAINER:
        if (xml.is("Document") || xml.is("Folder")) {
          containerDepth += 1;
          if (xml.is("Folder")) {
            containers.push(groupNames.length);
            groupNames.push(undefined);
          } else containers.push(-1);
          return CONTAINER;
        }
        if (xml.is("Placemark")) {
          placemark = {};
          placemarkPoints = [];
          placemarkLines = [];
          placemarkRings = [];
          return PLACEMARK;
        }
        // A Folder's own name; the file's own name is the first container's, or one written straight under <kml>.
        if (parent === CONTAINER && xml.is("name") && containers.at(-1)! > 0) return capture("name", FOLDER_NAME);
        if (containerDepth <= 1 && xml.is("name")) return capture("name", ROOT);
        if (containerDepth <= 1 && xml.is("description")) return capture("description", ROOT);
        return OTHER;
      case PLACEMARK:
        if (xml.is("name")) return capture("name", PLACEMARK);
        if (xml.is("description")) return capture("description", PLACEMARK);
        return geometry();
      case MULTI:
        return geometry();
      case POLYGON:
        return xml.is("outerBoundaryIs") || xml.is("innerBoundaryIs") ? BOUNDARY : OTHER;
      case BOUNDARY:
        return xml.is("LinearRing") ? RING : OTHER;
      case POINT:
      case LINE:
      case RING:
        if (!xml.is("coordinates")) return OTHER;
        coordinatesOf = parent;
        return capture("coordinates", parent);
      case TRACK:
        return xml.is("coord") ? capture("coord", TRACK) : OTHER;
      default:
        return OTHER;
    }
  };

  try {
    for (;;) {
      const event = xml.next();
      if (event === XML_TEXT) {
        if (kinds[xml.depth] === FIELD) gather();
      } else if (event === XML_OPEN) {
        const depth = xml.depth;
        if (depth > MAP_FILE_LIMITS.depth) throw new XmlLimitError("depth");
        if (depth === 1) {
          isKml = xml.is("kml");
          kinds[1] = isKml ? ROOT : OTHER;
        } else {
          const parent = kinds[depth - 1]!;
          kinds[depth] = parent === OTHER || parent === FIELD ? OTHER : classify(parent);
        }
      } else if (event === XML_CLOSE) {
        const kind = kinds[xml.depth + 1]!;
        kinds[xml.depth + 1] = OTHER;
        if (kind === FIELD) endCapture();
        else if (kind === PLACEMARK) endPlacemark();
        else if (kind === CONTAINER) {
          containerDepth -= 1;
          containers.pop();
        } else if (kind === TRACK && track.length >= 2) {
          countLine(track.length);
          placemarkLines.push(track);
          track = [];
        }
      } else if (event === XML_END) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof XmlLimitError) throw badRequest(isKml === false ? NOT_KML : TOO_MANY[error.limit]);
    if (error instanceof XmlSyntaxError) throw badRequest(NOT_WELL_FORMED);
    throw error;
  }
  if (!isKml) throw badRequest(NOT_KML);

  const features = [...lines, ...outlines, ...places];
  if (features.length === 0) throw badRequest("That KML file has no points, lines or outlines in it.");
  const name = fileName || lines[0]?.properties.name || outlines[0]?.properties.name || null;
  const used = [...new Set([...lineGroups, ...outlineGroups])].sort((a, b) => a - b);
  const routes =
    used.length > 1
      ? used.map((index, order) => ({
          // What lies in no Folder takes the file's name; a Folder with none is numbered.
          name: (index === 0 ? name : groupNames[index]) || `${name ?? "Folder"} (${order + 1})`,
          features: [...lines.filter((_, at) => lineGroups[at] === index), ...outlines.filter((_, at) => outlineGroups[at] === index)],
        }))
      : undefined;
  return {
    collection: { type: "FeatureCollection", features },
    name,
    description: fileDescription || null,
    lines: lines.length,
    outlines: outlines.length,
    waypoints: places.length,
    ...(routes ? { routes } : {}),
  };
}
