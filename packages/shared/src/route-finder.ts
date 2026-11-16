/**
 * Finding a known route (a waymarked walk, a cycle route, a named path) in a route
 * source and adding it to the map. A route source is a server on the internet that
 * answers questions about OpenStreetMap; it is asked only when a person searches, and
 * what comes back is kept only if they add it. See docs/maps.md.
 */
import type { Bbox, MarkerColor } from "./maps.ts";

/** The shortest name worth sending to a route source, and the longest it will be sent. */
export const ROUTE_SEARCH_MIN_TEXT = 3;
export const ROUTE_SEARCH_MAX_TEXT = 80;
/**
 * The largest map view a route source is asked about, in degrees of longitude and of
 * latitude (about 220 km north to south). A wider view holds more routes than a list
 * can usefully show and costs the source's server real work.
 */
export const ROUTE_SEARCH_MAX_SPAN = 2;

/** Where found routes come from, and what must be said about them. */
export interface RouteSourceDto {
  id: string;
  name: string;
  /** The host a search is sent to, as a person would recognise it: "overpass.example.org". */
  host: string;
  operator: string;
  /** What part of the world it knows, in words: "The whole world". */
  coverage: string;
  /**
   * The part of the world it is asked about first: a search of a view whose middle is
   * inside this box goes to it unless the person chose another server. Null for a
   * source that is asked about anywhere.
   */
  bbox: Bbox | null;
  /** The page that says how the server may be used. */
  termsUrl: string;
  data: RouteDataCredit;
}

/** The licence and credit of the data a source answers from. */
export interface RouteDataCredit {
  /** "OpenStreetMap" */
  name: string;
  /** "© OpenStreetMap contributors" */
  attribution: string;
  /** "Open Database Licence (ODbL) 1.0" */
  license: string;
  licenseUrl: string;
  /** The page that explains the credit: "https://www.openstreetmap.org/copyright". */
  url: string;
}

export interface RouteSourcesResponse {
  sources: RouteSourceDto[];
  /**
   * The source an administrator has said to ask first, wherever the map is. Null when
   * none was named: the source is then chosen by where the map is (`pickRouteSource`).
   */
  defaultId: string | null;
  /** What was wrong with a route source file, in words, when one could not be read. */
  problems: string[];
  /** The name Outpost gives a route source when it searches: the application, its version and the project's web address. */
  clientName: string;
}

/**
 * Which source a search goes to when the person has not chosen one: the one an
 * administrator named; failing that, the first declared whose box holds the middle of
 * the map; failing that, the first that is asked about anywhere; failing that, the first.
 * A server that knows one region well is asked about that region before one that
 * serves the whole world.
 */
export function pickRouteSource<T extends Pick<RouteSourceDto, "id" | "bbox">>(
  sources: T[],
  defaultId: string | null,
  centre: { lat: number; lon: number } | null,
): T | null {
  const named = sources.find((source) => source.id === defaultId);
  if (named) return named;
  const holds = (box: Bbox) =>
    centre !== null && centre.lon >= box[0] && centre.lon <= box[2] && centre.lat >= box[1] && centre.lat <= box[3];
  return sources.find((source) => source.bbox && holds(source.bbox)) ?? sources.find((source) => !source.bbox) ?? sources[0] ?? null;
}

export type RouteKind = "walking" | "running" | "cycling" | "mountain-biking" | "riding" | "path";
export type RouteNetwork = "local" | "regional" | "national" | "international";

/**
 * What a result points at in OpenStreetMap: a route relation, or the ways that share a
 * name where nobody has gathered them into a relation.
 */
export type FoundRouteRef = { type: "relation"; id: number } | { type: "ways"; ids: number[] };

export interface RouteSearchRequest {
  /** One of the declared sources; the default one when absent. */
  sourceId?: string;
  /** Part of a route's name. May be absent when `bbox` is given. */
  text?: string;
  /** The map view to search. Without it, routes are looked for by name everywhere the source knows. */
  bbox?: Bbox;
}

export interface RouteSearchResult {
  key: string;
  ref: FoundRouteRef;
  name: string;
  /** Other names it carries (in English, an alternative name), when they differ. */
  otherNames: string[];
  kind: RouteKind;
  network: RouteNetwork | null;
  from: string | null;
  to: string | null;
  /** Length as the source measures it; null when it did not say. */
  lengthMeters: number | null;
  bounds: Bbox | null;
  /** For a named path: how many ways share the name here. Null for a route relation. */
  wayCount: number | null;
}

export interface RouteSearchResponse {
  results: RouteSearchResult[];
  /** More matched than are listed. */
  truncated: boolean;
  /** When the source's copy of OpenStreetMap was last brought up to date (ISO 8601), if it said. */
  dataAsOf: string | null;
  source: Pick<RouteSourceDto, "id" | "name" | "host">;
  /** Named paths that are not route relations were looked for too (only inside a map view, with a name). */
  includedPaths: boolean;
}

export interface RoutePreviewRequest {
  sourceId?: string;
  ref: FoundRouteRef;
}

export type RouteLine = Array<[lon: number, lat: number]>;

export interface RoutePreview {
  /** Hands the previewed route back to the server to be added. It expires. */
  token: string;
  expiresAt: number;
  ref: FoundRouteRef;
  name: string;
  otherNames: string[];
  kind: RouteKind;
  /**
   * The route as unbroken lines, in the order they are walked as far as that can be
   * told. Each line is ways joined end to end; nothing is drawn between two lines.
   */
  lines: RouteLine[];
  lengthMeters: number;
  pointCount: number;
  wayCount: number;
  bounds: Bbox;
  /** Places where one part of the route does not meet the next in OpenStreetMap. Left open. */
  gaps: number;
  /** The widest of those gaps, in metres. */
  largestGapMeters: number;
  /** Lines that leave or rejoin another line: a fork, a loop, a second carriageway. */
  branches: number;
  /** Legs marked in OpenStreetMap as an alternative, an excursion or an approach. Added only on request. */
  alternatives: { lines: RouteLine[]; lengthMeters: number };
  /** For a long route kept as sections: the sections, each of which can be previewed itself. */
  sections: RouteSearchResult[];
  /** What was left out, so nothing goes missing without a word. */
  skipped: { points: number; unusableWays: number };
  dataAsOf: string | null;
  source: Pick<RouteSourceDto, "id" | "name" | "host">;
  credit: TrackSource;
}

export interface RouteAddRequest {
  token: string;
  name?: string;
  color?: MarkerColor;
  includeAlternatives?: boolean;
}

/**
 * Where a saved route came from, when it was found in a route source. It is stored
 * with the route (as `source` on its GeoJSON), shown with it, and written into its
 * GPX export.
 */
export interface TrackSource {
  provider: "openstreetmap";
  /** "© OpenStreetMap contributors" */
  attribution: string;
  /** "Open Database Licence (ODbL) 1.0" */
  license: string;
  licenseUrl: string;
  /** "https://www.openstreetmap.org/copyright" */
  creditUrl: string;
  /** The route's own page: "https://www.openstreetmap.org/relation/4004181"; null for a named path. */
  url: string | null;
  /** "relation 4004181", or "12 ways named Miners' Track". */
  element: string;
  relationId: number | null;
  wayIds: number[];
  /** When it was fetched, ISO 8601. */
  fetchedAt: string;
  /** How fresh the source's copy of OpenStreetMap was, ISO 8601, if it said. */
  dataAsOf: string | null;
  /** The host it was fetched from. */
  server: string;
}

const isString = (value: unknown): value is string => typeof value === "string";

/** The only pages a found route's credit links to. Anything else stored in their place is not a credit. */
export const OSM_CREDIT_URL = "https://www.openstreetmap.org/copyright";
export const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";
const RELATION_PAGE = /^https:\/\/www\.openstreetmap\.org\/relation\/[1-9]\d{0,17}$/;

/**
 * Reads the `source` of a stored route's GeoJSON. Anything that is not exactly the
 * shape above is "no source". A stored route can come from a drive that has been in
 * other computers, and the web app shows these words and links: so the words are
 * length-checked text, and the links can only be OpenStreetMap's copyright page, the
 * licence's own page, and a relation's page on openstreetmap.org.
 */
export function readTrackSource(geojson: unknown): TrackSource | null {
  const raw = (geojson as { source?: unknown } | null)?.source as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== "object" || raw.provider !== "openstreetmap") return null;
  const text = (value: unknown, max: number) => (isString(value) && value.length > 0 && value.length <= max ? value : null);
  const attribution = text(raw.attribution, 200);
  const license = text(raw.license, 200);
  const element = text(raw.element, 300);
  const fetchedAt = text(raw.fetchedAt, 40);
  const server = text(raw.server, 255);
  if (raw.licenseUrl !== ODBL_URL || raw.creditUrl !== OSM_CREDIT_URL) return null;
  if (!attribution || !license || !element || !fetchedAt || !server) return null;
  const relationId =
    typeof raw.relationId === "number" && Number.isSafeInteger(raw.relationId) && raw.relationId > 0 ? raw.relationId : null;
  const wayIds = Array.isArray(raw.wayIds)
    ? raw.wayIds.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0).slice(0, 500)
    : [];
  return {
    provider: "openstreetmap",
    attribution,
    license,
    licenseUrl: ODBL_URL,
    creditUrl: OSM_CREDIT_URL,
    url: isString(raw.url) && RELATION_PAGE.test(raw.url) ? raw.url : null,
    element,
    relationId,
    wayIds,
    fetchedAt,
    dataAsOf: text(raw.dataAsOf, 40),
    server,
  };
}
