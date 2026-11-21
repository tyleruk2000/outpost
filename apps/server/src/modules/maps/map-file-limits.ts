/**
 * What a KML, KMZ or GeoJSON file may hold, and what reading one gives. The numbers
 * are the GPX reader's (`GPX_LIMITS`), so every map file is held to the same ceiling.
 * docs/maps.md gives them.
 */
import type { ParsedGpx } from "./gpx.ts";
import { GPX_LIMITS } from "./gpx-reader.ts";
import { XML_LIMITS } from "./gpx-xml.ts";

export const MAP_FILE_LIMITS = {
  /** Points in all the lines and outlines of a file. */
  linePoints: GPX_LIMITS.linePoints,
  /** Points, each of which becomes a saved place. */
  places: GPX_LIMITS.waypoints,
  /** Lines and outline rings together. */
  lines: GPX_LIMITS.lines,
  /** Characters kept of a name or a description. */
  textLength: GPX_LIMITS.textLength,
  /** Elements (KML) or arrays and objects (GeoJSON) open inside one another. */
  depth: XML_LIMITS.depth,
  /**
   * Arrays and objects in a GeoJSON file. Each position is one array, so this leaves
   * room for every point the limits above allow and the features around them, and
   * stops a file of nothing but brackets before it is parsed.
   */
  jsonContainers: 1_500_000,
} as const;

/** The formats a map file can come in. */
export const MAP_FILE_FORMATS = ["gpx", "kml", "kmz", "geojson"] as const;
export type MapFileFormat = (typeof MAP_FILE_FORMATS)[number];

/** What reading any map file gives: GPX's reading, with outlines (closed lines from polygons) counted apart. */
export interface ParsedMapFile extends ParsedGpx {
  outlines: number;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

/**
 * A name or description as plain text. KML descriptions are often HTML (Google Earth
 * shows them as a web page), and saved places hold plain text, so tags are taken out,
 * a line break stays a line break, and the commonest named characters are written out.
 */
export function plainText(value: string): string {
  const text = value
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_, name: string) => ENTITIES[name] ?? "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, MAP_FILE_LIMITS.textLength);
}
