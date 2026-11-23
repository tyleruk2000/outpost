/**
 * The words of street routes, in one place: the ways of travelling, the short lists of turns
 * at each end of a door-to-door drive ("From your door to the A24 (8 turns, 2.1 km)"), what
 * to say when a way is not available here, and the whole route as condensed plain text.
 */
import {
  type RoadDistanceUnit,
  roadAsciiText,
  roadDistanceText,
  roadDurationText,
  type StreetDirections,
  type StreetsRouteResult,
  type StreetsStatusResponse,
  wrapRoadText,
} from "@outpost/shared";
import { plural } from "@/lib/utils";
import { endLine, routeTitle, startLine } from "./words";

/** The four ways of planning a route: "drive" is Outpost's own main-roads route, the rest need streets. */
export type RouteMode = "drive" | "drive-door" | "walk" | "cycle";

export const ROUTE_MODES: Array<{ value: RouteMode; label: string }> = [
  { value: "drive", label: "Drive" },
  { value: "drive-door", label: "Door to door" },
  { value: "walk", label: "Walk" },
  { value: "cycle", label: "Cycle" },
];

export const isRouteMode = (value: unknown): value is RouteMode =>
  value === "drive" || value === "drive-door" || value === "walk" || value === "cycle";

/** What each way is, in a line under the choice. */
export const MODE_LINES: Record<RouteMode, string> = {
  drive:
    "The main roads, which way, the junctions and the places on the signs, the way you would write a drive down. Not turn by turn, and never live.",
  "drive-door":
    "The main roads as for a drive, with the streets from your door to the first one and from the last one to the door, turn by turn.",
  walk: "Turn by turn on foot, on streets and paths.",
  cycle: "Turn by turn by bicycle, on streets, lanes and cycle paths.",
};

/** Whether streets can answer this way of travelling now. */
export function modeAvailable(status: StreetsStatusResponse | undefined, mode: RouteMode): boolean {
  if (mode === "drive") return true;
  if (!status) return false;
  return mode === "drive-door" ? status.modes.driveDoor : mode === "walk" ? status.modes.walk : status.modes.cycle;
}

/** A country by its two letters and name: where a route or a point is. */
export interface CountryRef {
  code: string;
  name: string;
}

const WAY_WORDS: Record<RouteMode | "reach-walk" | "reach-cycle", string> = {
  drive: "Driving routes",
  "drive-door": "Door-to-door routes",
  walk: "Walking routes",
  cycle: "Cycling routes",
  "reach-walk": "Walking areas",
  "reach-cycle": "Cycling areas",
};

/** Whether streets are built but not for this country (where the streets say which countries they hold). */
export function streetsMissFor(status: StreetsStatusResponse | undefined, country: CountryRef | null | undefined): boolean {
  const held = status?.tileset?.countries ?? [];
  return Boolean(status?.state === "ready" && country && held.length > 0 && !held.includes(country.code));
}

/**
 * Why streets cannot answer now, in one calm line, and what would put it right: naming the
 * country the route or the point is in, where it is known ("Walking routes in France need
 * street detail, built once on this device").
 */
export function unavailableLine(
  status: StreetsStatusResponse,
  options: { way?: keyof typeof WAY_WORDS; country?: CountryRef | null } = {},
): { text: string; action: "add" | "progress" | null } {
  const build = status.build;
  if (build && build.state !== "failed") {
    const step = build.step ? `, step ${build.step.at} of ${build.step.of}` : "";
    return {
      text: `Street detail is being built on this device${step}. This way of travelling works once it is ready.`,
      action: "progress",
    };
  }
  if (status.state === "no-streets" || streetsMissFor(status, options.country)) {
    const way = WAY_WORDS[options.way ?? "walk"];
    return {
      text: `${options.way ? way : "This"} ${options.country ? `in ${options.country.name} ` : ""}${options.way ? "need" : "needs"} street detail, built once on this device.`,
      action: "add",
    };
  }
  if (status.state === "not-answering")
    return { text: status.message ?? "The streets service is not answering just now. Drives still plan on the main roads.", action: null };
  return { text: status.message ?? "Walking and cycling cannot be used just now.", action: null };
}

/** The lines that are turns: everything but setting off and arriving. */
export const turnCount = (directions: StreetDirections) =>
  directions.lines.filter((line) => line.kind !== "start" && line.kind !== "arrive").length;

/** "A24", "the M25": a road's number reads alone; a name reads with "the". */
const roadPhrase = (road: string | null | undefined) => {
  if (!road) return "the main road";
  return /^[A-Z]{1,3}\d/.test(road) ? `the ${road}` : road;
};

/** "From your door to the A24" and "From the A20 to your door". */
export function endTurnsTitle(result: StreetsRouteResult, which: "start" | "end"): string {
  const snapped = which === "start" ? result.road?.snapped[0] : result.road?.snapped.at(-1);
  return which === "start" ? `From your door to ${roadPhrase(snapped?.road)}` : `From ${roadPhrase(snapped?.road)} to your door`;
}

/** "8 turns, 2.1 km". */
export function turnsSummary(directions: StreetDirections, units: RoadDistanceUnit): string {
  return `${plural(turnCount(directions), "turn")}, ${roadDistanceText(directions.distanceM, units)}`;
}

const WAYS: Record<StreetsRouteResult["mode"], string> = { "drive-door": "driving", walk: "walking", cycle: "cycling" };

/** "Leatherhead to Box Hill". */
export function streetsTitle(result: StreetsRouteResult): string {
  if (result.road) return routeTitle(result.road);
  const named = result.request.points.map((point) => point.name).filter(Boolean);
  const first = result.request.points[0]?.name;
  const last = result.request.points.at(-1)?.name;
  if (first && last) return `${first} to ${last}`;
  return named[0] ?? (result.mode === "walk" ? "A walk" : result.mode === "cycle" ? "A ride" : "Door to door");
}

/** "6.3 km, about 1 h 20 min walking". */
export function streetsTotals(result: StreetsRouteResult): string {
  const units = result.request.units ?? "km";
  return `${roadDistanceText(result.summary.distanceM, units)}, about ${roadDurationText(result.summary.durationS)} ${WAYS[result.mode]}`;
}

/** The text of the ends of the trip, as the door-to-door list writes them. */
export function streetsEnds(result: StreetsRouteResult) {
  return {
    start: result.road ? startLine(result.road) : null,
    end: result.road ? endLine(result.road) : null,
  };
}

function plainMarks(text: string): string {
  return text.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

/**
 * The whole route as plain text, `width` characters a line at most: for a door-to-door drive
 * the owner's lines with the turns at each end indented under them; for a walk or a ride the
 * turns, each with its distance.
 */
export function streetsAsPlainText(result: StreetsRouteResult, options: { width?: number; ascii?: boolean; title?: string } = {}): string {
  const width = Math.max(16, Math.floor(options.width ?? 48));
  const units = result.request.units ?? "km";
  const clean = (text: string) => (options.ascii ? roadAsciiText(text) : plainMarks(text));
  const rule = "-".repeat(width);
  const out: string[] = [];
  const add = (text: string, indent = "") => out.push(...wrapRoadText(clean(text), width, indent));
  const turns = (directions: StreetDirections, indent: string) => {
    for (const line of directions.lines) add(line.distanceText ? `${line.text}, ${line.distanceText}` : line.text, indent);
  };

  add(options.title ?? streetsTitle(result));
  add(`Planned ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(result.plannedAt)}`);
  add(streetsTotals(result));
  out.push(rule);
  if (result.road) {
    if (result.start) {
      add(`${endTurnsTitle(result, "start")} (${turnsSummary(result.start, units)})`);
      turns(result.start, "  ");
      out.push(rule);
    } else {
      const start = startLine(result.road);
      if (start) add(`Start: ${start.title}`);
    }
    for (const leg of result.road.legs) {
      if (leg.kind === "via") {
        out.push(rule);
        add(leg.title);
        out.push(rule);
        continue;
      }
      add(leg.title);
      add(leg.detail, "  ");
    }
    if (result.end) {
      out.push(rule);
      add(`${endTurnsTitle(result, "end")} (${turnsSummary(result.end, units)})`);
      turns(result.end, "  ");
    }
  } else if (result.streets) {
    turns(result.streets, "");
  }
  out.push(rule);
  add("Planned in advance, not live: no traffic or closures. Follow the signs and check closures before you go.");
  add(result.credit);
  return out.map((line) => line.replace(/\s+$/, "")).join("\n");
}

/** The box round everything a route on streets draws, to bring it into view. */
export function geometryBounds(result: StreetsRouteResult): [number, number, number, number] {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of result.geometry.coordinates)
    for (const [lon, lat] of line) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  if (!Number.isFinite(west)) {
    const point = result.request.points.find((each) => "lat" in each) as { lat: number; lon: number } | undefined;
    if (point) return [point.lon - 0.01, point.lat - 0.01, point.lon + 0.01, point.lat + 0.01];
    return [-1, 50, 1, 52];
  }
  return [west, south, east, north];
}

/** "Add walking and cycling for France": for the country the route or the point is in, where known. Never the home country by default. */
export const addStreetsLabel = (country: { name: string } | null | undefined) =>
  country ? `Add walking and cycling for ${country.name}` : "Add walking and cycling";

/** Words for a time on the map: "15 min", "1 hour". */
export const reachTimeText = (minutes: number) => (minutes >= 60 ? `${minutes / 60} hour${minutes > 60 ? "s" : ""}` : `${minutes} min`);
