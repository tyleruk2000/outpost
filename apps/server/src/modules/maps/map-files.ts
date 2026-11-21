/**
 * Map files other than GPX: KML, KMZ (KML in a zip) and GeoJSON.
 *
 * Each is read into the same GeoJSON a GPX file is, by a reader that counts what it
 * keeps (`MAP_FILE_LIMITS`), in the same worker and the same turns as GPX
 * (`parseMapFileSafely` in `gpx.ts`). A KMZ is opened here, on the server's thread,
 * with the zip reader the library uses for books: its entries are read into memory
 * only, against a budget, so one that inflates to far more than it says is abandoned.
 */
import { badRequest } from "../../core/errors.ts";
import { ExtractionError } from "../documents/extract-types.ts";
import { openZipBuffer } from "../documents/zip.ts";
import { readGeoJson } from "./geojson-reader.ts";
import { MAX_GPX_BYTES, parseGpxSafely, parseMapFileSafely } from "./gpx.ts";
import { readKml } from "./kml-reader.ts";
import type { MapFileFormat, ParsedMapFile } from "./map-file-limits.ts";

const MEGABYTES = MAX_GPX_BYTES / (1024 * 1024);

/** Which format a file is in, from its name and then from its first bytes. Undefined when it is none Outpost reads. */
export function mapFileFormat(filename: string | undefined, bytes: Buffer): MapFileFormat | undefined {
  const extension = /\.([a-z]+)$/i.exec(filename ?? "")?.[1]?.toLowerCase();
  if (extension === "gpx") return "gpx";
  if (extension === "kml") return "kml";
  if (extension === "kmz") return "kmz";
  if (extension === "geojson" || extension === "json") return "geojson";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "kmz";
  const start = bytes.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart();
  if (start.startsWith("{")) return "geojson";
  if (start.startsWith("<")) {
    if (/<(\w+:)?kml[\s>]/.test(start)) return "kml";
    if (/<(\w+:)?gpx[\s>]/.test(start)) return "gpx";
  }
  return undefined;
}

/** Checks every text format has in common: its size, no DOCTYPE in XML, not UTF-16. */
function checkText(source: string, format: "kml" | "geojson"): void {
  const label = format === "kml" ? "KML" : "GeoJSON";
  if (Buffer.byteLength(source) > MAX_GPX_BYTES) {
    throw badRequest(`That ${label} file is larger than ${MEGABYTES} MB. Split it into smaller files.`);
  }
  if (format === "kml" && /<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw badRequest("That file declares a DOCTYPE or entities, which KML files do not need and Outpost does not accept.");
  }
  const first = source.charCodeAt(0) === 0xfffd && source.charCodeAt(1) === 0xfffd ? 2 : 0;
  const pair = [source.charCodeAt(first), source.charCodeAt(first + 1)];
  if ((pair[0] !== 0 && pair[1] === 0) || (pair[0] === 0 && pair[1] !== 0)) {
    throw badRequest("That file is saved as UTF-16 text, which Outpost cannot read. Save or export it as UTF-8 and try again.");
  }
}

/**
 * Parses map text of a known format on the thread that calls it. Anything from outside
 * goes through `parseMapFileSafely` instead. A KMZ has already been opened into its KML.
 */
export function parseMapText(source: string, format: "kml" | "geojson"): ParsedMapFile {
  checkText(source, format);
  return format === "kml" ? readKml(source) : readGeoJson(source);
}

/**
 * The KML inside a KMZ. The main document is `doc.kml` where there is one, as Google
 * Earth writes it, and otherwise the first `.kml` file the archive lists, which is the
 * one Google Earth opens. Pictures and other files in the archive are not read.
 */
export async function kmlFromKmz(bytes: Buffer): Promise<string> {
  let zip: Awaited<ReturnType<typeof openZipBuffer>>;
  try {
    zip = await openZipBuffer(bytes, MAX_GPX_BYTES);
  } catch (error) {
    if (error instanceof ExtractionError) throw badRequest(`That KMZ file could not be opened. ${error.message}`);
    throw error;
  }
  try {
    const kml = zip.names().filter((name) => /\.kml$/i.test(name));
    const main = kml.find((name) => name.toLowerCase() === "doc.kml") ?? kml[0];
    if (!main) throw badRequest("That KMZ file holds no KML document.");
    const size = zip.sizeOf(main) ?? 0;
    if (size > MAX_GPX_BYTES) {
      throw badRequest(`The KML inside that KMZ file is larger than ${MEGABYTES} MB once unpacked. Split it into smaller files.`);
    }
    try {
      return (await zip.read(main, MAX_GPX_BYTES)).toString("utf8");
    } catch (error) {
      if (error instanceof ExtractionError) {
        throw badRequest(`The KML inside that KMZ file could not be read. ${error.message}`);
      }
      throw error;
    }
  } finally {
    zip.close();
  }
}

/** The words for a format, for messages. */
export const formatName = (format: MapFileFormat): string =>
  format === "gpx" ? "GPX" : format === "kml" ? "KML" : format === "kmz" ? "KMZ" : "GeoJSON";

/**
 * Reads an uploaded map file of any format Outpost takes, away from the server's
 * thread. GPX goes to the GPX reader as it always has; a KMZ is opened into its KML.
 */
export async function readMapFile(bytes: Buffer, filename: string | undefined): Promise<{ format: MapFileFormat; parsed: ParsedMapFile }> {
  const format = mapFileFormat(filename, bytes);
  if (!format) {
    throw badRequest("Outpost cannot read that kind of file as a map. Choose a GPX, KML, KMZ or GeoJSON file.");
  }
  if (format === "gpx") return { format, parsed: { ...(await parseGpxSafely(bytes.toString("utf8"))), outlines: 0 } };
  const source = format === "kmz" ? await kmlFromKmz(bytes) : bytes.toString("utf8");
  return { format, parsed: await parseMapFileSafely(source, format === "geojson" ? "geojson" : "kml") };
}
