/**
 * Road routes: planned, high-level road directions worked out offline from a main-roads
 * network kept per country or region (built from a Geofabrik extract). Never live
 * navigation: a route is planned once, read like a list a driver writes for themselves
 * ("M25", "M20 - Folkestone", "A26 (E17) - Reims (A4)"), and printed. See
 * docs/road-routes.md (for people) and docs/development/road-routes.md (the shapes).
 */

import type { StreetsRouteMode, StreetsRouteResult } from "./streets.ts";

// ── Networks ────────────────────────────────────────────────────────────────

/** One installed road network: the main roads of a country or a part of one. */
export interface RoadNetworkDto {
  id: string;
  /** Geofabrik's id for the region ("great-britain", "france/nord-pas-de-calais"), or null for a file the person brought. */
  regionId: string | null;
  /** "Kent", "Luxembourg". */
  name: string;
  /** ISO 3166-1 alpha-2, upper case, where known ("GB"). */
  country: string | null;
  /** The day the map data is from (the extract's own timestamp), "2026-11-20", or null when the file gives none. */
  dataDate: string | null;
  builtAt: number;
  /** Bytes the network takes on disk. */
  sizeBytes: number;
  /** Junctions and road pieces in the network. */
  nodes: number;
  edges: number;
  /** Sea and river crossings (ferries, the Channel Tunnel shuttle) found in it. */
  crossings: number;
  /** The extract it was built from: kept (and where), or deleted once read. */
  extract: { kept: boolean; locationId: string | null; relPath: string | null; bytes: number; collectionId?: string | null };
  /** Where the extract came from: Geofabrik's address, or "Your file". */
  source: string;
  bbox: [number, number, number, number] | null;
  /**
   * Whether its roads reach Northern Ireland, by its own junctions. Geofabrik's United
   * Kingdom does, its Great Britain does not; a United Kingdom network that does not is
   * named Great Britain, and a point in Northern Ireland is not taken as covered by it.
   */
  northernIreland: boolean;
  /** False when its file is missing (a restore from another machine, a drive): install it again. */
  available: boolean;
}

export interface RoadNetworksResponse {
  networks: RoadNetworkDto[];
  /**
   * Networks being built now (jobs), so the screen can show them before they are listed.
   * One entry a region: a download and the read after it, or a failed read and a new try,
   * are one entry.
   */
  building: RoadNetworkBuilding[];
  credit: RoadDataCredit;
}

/** "waiting", "downloading", "building" or "failed": where a network on its way stands, in Map data's words. */
export type RoadBuildingPhase = "waiting" | "downloading" | "building" | "failed";

/** A network on its way: downloading its country file, waiting, or being built. */
export interface RoadNetworkBuilding {
  jobId: string;
  name: string;
  state: string;
  message: string | null;
  /** ISO 3166-1 alpha-2, upper case, where known. */
  country?: string | null;
  regionId?: string | null;
  phase?: RoadBuildingPhase;
  /** While downloading: bytes so far, of how many, and the time left in seconds, where known. */
  receivedBytes?: number | null;
  totalBytes?: number | null;
  etaSeconds?: number | null;
  /** For a failed one: what went wrong, in plain words. */
  error?: string | null;
}

/** A country a route needs and has no roads for (in a failed plan's error `details.missing`). */
export interface RoadMissingCountry {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  /** "France". */
  name: string;
  /** Geofabrik's id for the whole country, where its list has been read on this device; else null. */
  regionId: string | null;
}

/**
 * Why a route could not be planned, in a failed plan's error `details` (the message says the
 * same in words). `missing`: countries with no roads kept. `far`: points in a country that
 * has roads, but further than `distanceM` from any main road kept (only part of it is kept).
 */
export interface RoadRouteProblem {
  missing: RoadMissingCountry[];
  far: Array<{ index: number; name: string | null; country: RoadMissingCountry | null; distanceM: number }>;
  /** No roads kept at all; a point no road kept reaches; or roads kept that do not join the points. */
  reason?: "empty" | "point" | "between";
}

// ── Coverage: which countries a route needs ─────────────────────────────────

/**
 * POST /api/roads/coverage: for the points of a route (or one point), the country of each
 * and the countries the straight lines between them pass over, with whether each has roads
 * kept. Worked out on this device from the country outlines it holds and the networks
 * installed; nothing is asked of anyone, and no network is read into memory.
 */
export interface RoadCoverageRequest {
  /** One to twelve. */
  points: Array<{ lat: number; lon: number }>;
}

/**
 * - ready: roads are kept for it
 * - part: roads are kept for part of it, and a point of the route is outside that part
 * - downloading: on its way (waiting, downloading or being built: see `progress.phase`)
 * - missing: none kept (after a failed try, `progress.phase` is "failed")
 */
export type RoadCoverageState = "ready" | "part" | "downloading" | "missing";

export interface RoadCoverageCountry {
  code: string;
  name: string;
  state: RoadCoverageState;
  regionId: string | null;
  /** The parts kept, by name, for "part" ("Nord-Pas-de-Calais"); empty otherwise. */
  parts: string[];
  /** The oldest kept data's day for a country with roads ("2026-11-20"), or null. */
  dataDate: string | null;
  /** While on its way, or after a failed try. */
  progress: RoadNetworkBuilding | null;
}

export interface RoadCoverageResponse {
  /** Each point's country (null at sea or where none is known), in the order given. */
  points: Array<{ country: string | null }>;
  /** Every country the route touches, in the order it reaches them, each once. */
  countries: RoadCoverageCountry[];
  /** True when a straight line between two points crosses open sea: a crossing may be needed. */
  seaCrossing: boolean;
}

/** POST /api/roads/networks: build a network from Geofabrik (`regionId`) or from a file already in storage. */
export type RoadNetworkInstallRequest =
  | { regionId: string; keepExtract?: boolean; locationId?: string }
  | { locationId: string; relPath: string; name: string; country?: string | null; keepExtract?: true };

export interface RoadNetworkInstallResponse {
  /** For a Geofabrik region: the download (on the Downloads screen); the network is built when it finishes. */
  downloadId: string | null;
  /** For a file already here: the build job. */
  jobId: string | null;
}

/**
 * POST /api/roads/countries: the countries some boxes cover (the installed map regions'),
 * so that the networks for the map areas a person has downloaded can be offered first.
 * Worked out on the server from the country outlines it holds; nothing is asked of anyone.
 */
export interface RoadCountriesRequest {
  /** [west, south, east, north] each; at most 200. */
  boxes: Array<[number, number, number, number]>;
}

export interface RoadCountriesResponse {
  /** ISO 3166-1 alpha-2, upper case, most covered first. */
  countries: string[];
}

// ── Crossings ───────────────────────────────────────────────────────────────

export type RoadCrossingKind = "ferry" | "shuttle";

/** A crossing found in the installed networks: a car ferry or the Channel Tunnel shuttle. */
export interface RoadCrossingDto {
  /** Stable across rebuilds: the OpenStreetMap way it was named from, "way/23637666". */
  id: string;
  kind: RoadCrossingKind;
  /** "Dover (UK) - Calais (F)", "Le Shuttle". */
  name: string;
  operator: string | null;
  /** Time on board, from the data's `duration`, or Outpost's assumption (said in `durationSource`). */
  durationS: number;
  durationSource: "tagged" | "assumed";
  lengthM: number;
  /** Where it starts and ends: [lon, lat]. */
  ends: [[number, number], [number, number]];
  /** True when both ends reach an installed road network. */
  joined: boolean;
}

export interface RoadCrossingsResponse {
  crossings: RoadCrossingDto[];
}

/** Which way to cross water: whichever is quickest, the Channel Tunnel shuttle, or one ferry (by its id). */
export type RoadCrossingChoice = "any" | "eurotunnel" | string;

// ── Planning a route ────────────────────────────────────────────────────────

export type RoadRoutePoint = { lat: number; lon: number; name?: string } | { placeId: string; name?: string };

export type RoadDistanceUnit = "km" | "miles";

export interface RoadRouteRequest {
  /** Start, any via points in order, end: two to twelve. */
  points: RoadRoutePoint[];
  crossing?: RoadCrossingChoice;
  /** How distances are written in `title`/`detail` text: kilometres (default) or miles. Numbers are always metres. */
  units?: RoadDistanceUnit;
}

/** A motorway junction as signed: "J10" with its name in Britain, "exit 21" elsewhere. */
export interface RoadJunction {
  /** The number as mapped ("10", "11a", "21"), or null for a junction known only by name. */
  ref: string | null;
  name: string | null;
  /** "J10 (Ardley)", "exit 21 (Reims-Centre)", "Ardley". */
  label: string;
  /** [lon, lat] */
  at: [number, number];
}

export interface RoadCrossingOnRoute {
  id: string;
  kind: RoadCrossingKind;
  name: string;
  operator: string | null;
  /** "Folkestone", "Dover": the side boarded, as the data names it, or null. */
  from: string | null;
  to: string | null;
  durationS: number;
  durationSource: "tagged" | "assumed";
}

/**
 * One line of directions. `title` reads like the owner's own list ("A26 (E17) - Reims (A4)");
 * `detail` is the quieter second part (junctions, distance, time).
 */
export interface RoadLeg {
  kind: "road" | "crossing" | "via";
  /** "A26", "M25"; a road's name where it has no number; null for unnumbered local roads. */
  road: string | null;
  /** European route numbers along the leg, each step a set: [["E17"]], [["E17"], ["E54"]], [["E21", "E62"]]. */
  europeanRoutes: string[][];
  /** The place signed to follow, as the sign spells it ("Reims", "Genève"), from the data's destination tags. */
  towards: string | null;
  /** The road the sign gives with that place, when it is another road ("A4"). */
  towardsRef: string | null;
  /** "north", "south-east", "clockwise", "anticlockwise": which way the road is driven (in `detail`, not the title). */
  direction: string | null;
  /** Where the road is joined and left, when those are numbered or named junctions. */
  joinAt: RoadJunction | null;
  leaveAt: RoadJunction | null;
  /** The place signed on the slip road taken off this road ("Reigate"), when the data has it. */
  exitSign: string | null;
  distanceM: number;
  durationS: number;
  /** Countries the leg runs through, in order (ISO alpha-2). */
  countries: string[];
  /** Set on a crossing leg. */
  crossing: RoadCrossingOnRoute | null;
  /** Set on a via leg: which point (1 is the first via point) and its name. */
  via: { index: number; name: string | null } | null;
  /** [lon, lat] where the leg starts and ends. */
  start: [number, number];
  end: [number, number];
  title: string;
  detail: string;
}

/** Where a point was joined to the network: the nearest main-road junction it can be reached from. */
export interface RoadSnappedPoint {
  /** What was asked: the point, with its name. */
  input: { lat: number; lon: number; name: string | null };
  /** The point on the network used. */
  lat: number;
  lon: number;
  /** Straight-line distance from what was asked, in metres. */
  distanceM: number;
  /** The road there ("A24") or null. */
  road: string | null;
  country: string | null;
}

export interface RoadRouteSummary {
  distanceM: number;
  /** Driving at typical speeds plus time on board crossings; no stops, traffic or check-in. */
  durationS: number;
  countries: string[];
  crossings: RoadCrossingOnRoute[];
}

export interface RoadDataCredit {
  attribution: string;
  license: string;
  licenseUrl: string;
  url: string;
  /** One sentence for the foot of a page: who, what licence, how old. */
  line: string;
}

export interface RoadRouteResult {
  legs: RoadLeg[];
  summary: RoadRouteSummary;
  /** The path for drawing: a simplified LineString per part between crossings. */
  geometry: { type: "MultiLineString"; coordinates: Array<Array<[number, number]>> };
  snapped: RoadSnappedPoint[];
  /** Plain sentences: a far snap, an unused crossing choice, old data. */
  warnings: string[];
  credit: RoadDataCredit;
  /** The request it answers (points as given), so a saved route can be planned again. */
  request: RoadRouteRequest;
  /** When it was planned (ms) and the networks it used. */
  plannedAt: number;
  networks: Array<{ id: string; name: string; dataDate: string | null }>;
}

// ── Saved routes ────────────────────────────────────────────────────────────

/** A saved route: a drive on main roads, or one planned on streets (door to door, a walk, a ride). */
export type SavedRouteResult = RoadRouteResult | StreetsRouteResult;

export interface SavedRoadRouteSummaryDto {
  id: string;
  name: string;
  /** "drive" for a road route; otherwise the way it was planned on streets. */
  mode: "drive" | StreetsRouteMode;
  /** When it was planned (ms): a saved route is the plan as made, never planned again on opening. */
  plannedAt: number;
  /** "Leatherhead to Chamonix" */
  fromTo: string;
  distanceM: number;
  durationS: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedRoadRouteDto extends SavedRoadRouteSummaryDto {
  route: SavedRouteResult;
}

export interface SaveRoadRouteRequest {
  name: string;
  route: SavedRouteResult;
}

export interface SavedRoadRoutesResponse {
  routes: SavedRoadRouteSummaryDto[];
}

// ── Words ───────────────────────────────────────────────────────────────────

const KM_PER_MILE = 1.609344;

/** "87 km", "4.2 km", "54 miles", "1 mile", "0.6 miles". */
export function roadDistanceText(meters: number, units: RoadDistanceUnit = "km"): string {
  if (units === "miles") {
    const miles = meters / 1000 / KM_PER_MILE;
    const shown = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
    return `${shown.toLocaleString("en-GB")} ${shown === 1 ? "mile" : "miles"}`;
  }
  const km = meters / 1000;
  const shown = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${shown.toLocaleString("en-GB")} km`;
}

/** "52 min", "1 h 05 min", "14 h". */
export function roadDurationText(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

/** "E17", "E21 E62", "E17 - E54". */
export function europeanRoutesText(steps: string[][]): string {
  return steps.map((step) => step.join(" ")).join(" - ");
}

/**
 * The line for a road leg, as a driver writes it: "A26 (E17) - Reims (A4)", "M25",
 * "N205 - Chamonix". Which way round (north, clockwise) is in the leg's detail, not here.
 */
export function roadLegTitle(leg: Pick<RoadLeg, "road" | "europeanRoutes" | "towards" | "towardsRef">): string {
  const road = leg.road ?? "Local roads";
  const e = leg.europeanRoutes.length > 0 ? ` (${europeanRoutesText(leg.europeanRoutes)})` : "";
  if (!leg.towards) return `${road}${e}`;
  const ref = leg.towardsRef && leg.towardsRef !== leg.road ? ` (${leg.towardsRef})` : "";
  return `${road}${e} - ${leg.towards}${ref}`;
}

// ── Condensed plain text ────────────────────────────────────────────────────

export interface PlainTextOptions {
  /** Characters a line; no line is longer. Default 48. */
  width?: number;
  /** Write accented letters without their accents ("Genève" as "Geneve"), for printers that lack them. */
  ascii?: boolean;
  /** A title for the top; default "<start> to <end>". */
  title?: string;
  /** The locale the date made is written in; default British English. */
  locale?: string;
}

/** Typographic marks a small printer may lack, as plain ones. */
function plainMarks(text: string): string {
  return text
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/·/g, "-")
    .replace(/→/g, "->");
}

const LIGATURES: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  ø: "o",
  Ø: "O",
  œ: "oe",
  Œ: "OE",
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  þ: "th",
  ð: "d",
};

/** "Genève" as "Geneve", "Straße" as "Strasse"; anything else outside ASCII as "?". */
export function roadAsciiText(text: string): string {
  return plainMarks(text)
    .replace(/[ßæÆøØœŒłŁđĐþð]/g, (c) => LIGATURES[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

/** Words wrapped to `width`, the first line at `indent` as every other; a word longer than a line is broken. */
export function wrapRoadText(text: string, width: number, indent = ""): string[] {
  const room = Math.max(1, width - indent.length);
  const lines: string[] = [];
  let line = "";
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    while (word.length > room) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, room));
      word = word.slice(room);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= room) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l);
}

/**
 * A route's directions as condensed plain text, every line at most `width` characters
 * (48 by default): a title, the day it was made, the totals, each leg as a line in the
 * owner's style with its junctions, distance and time indented below, rules of dashes
 * between sections, and the note and the OpenStreetMap credit at the foot. For copying
 * and printing on one's own small printer; Outpost prints nothing itself.
 */
export function directionsAsPlainText(route: RoadRouteResult, options: PlainTextOptions = {}): string {
  const width = Math.max(16, Math.floor(options.width ?? 48));
  // Distances in the units the route was planned with, as its lines are.
  const units = route.request.units ?? "km";
  const clean = (text: string) => (options.ascii ? roadAsciiText(text) : plainMarks(text));
  const rule = "-".repeat(width);
  const out: string[] = [];
  const add = (text: string, indent = "") => out.push(...wrapRoadText(clean(text), width, indent));

  const first = route.snapped[0]?.input.name;
  const last = route.snapped.at(-1)?.input.name;
  add(options.title ?? (first && last ? `${first} to ${last}` : "Road route"));
  const made = new Intl.DateTimeFormat(options.locale ?? "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    route.plannedAt,
  );
  add(`Planned ${made}`);
  add(`${roadDistanceText(route.summary.distanceM, units)}, about ${roadDurationText(route.summary.durationS)} driving`);
  out.push(rule);
  for (const leg of route.legs) {
    if (leg.kind === "via") {
      out.push(rule);
      add(leg.title);
      out.push(rule);
      continue;
    }
    add(leg.title);
    add(leg.detail, "  ");
  }
  out.push(rule);
  add("Planned in advance, not live: no traffic or closures. Follow the signs and check closures before you go. Crossings must be booked.");
  add(route.credit.line);
  return out.map((line) => line.replace(/\s+$/, "")).join("\n");
}
