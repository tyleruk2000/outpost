/**
 * What a planned road route says, beyond the lines the server writes: the first and last
 * lines (from the door to the first main road, and from the last one to the end), the
 * crossing choices, the route's name, and which part of the drawn line belongs to each leg.
 * Pure, so that it can be checked by hand.
 */
import {
  type RoadCrossingChoice,
  type RoadCrossingDto,
  type RoadDistanceUnit,
  type RoadLeg,
  type RoadRouteResult,
  roadDistanceText,
} from "@outpost/shared";
import { countryName } from "../lib/search";

/** A point of the route as the person chose it. */
export interface RoutePointChoice {
  name: string;
  lat: number;
  lon: number;
  /** How it was chosen: a saved place, a place found by name, the map's centre, or a point pressed on the map. */
  from: "place" | "search" | "centre" | "map";
}

/** "Leatherhead to Chamonix", or "Road route" when the ends have no names. */
export function routeTitle(route: Pick<RoadRouteResult, "snapped">): string {
  const first = route.snapped[0]?.input.name;
  const last = route.snapped.at(-1)?.input.name;
  return first && last ? `${first} to ${last}` : "Road route";
}

/** "Leatherhead to Chamonix, via Reims" for a route's name, until the person gives it another. */
export function suggestedName(route: Pick<RoadRouteResult, "snapped">): string {
  const vias = route.snapped
    .slice(1, -1)
    .map((point) => point.input.name)
    .filter(Boolean);
  const title = routeTitle(route);
  return vias.length > 0 ? `${title}, via ${vias.join(", ")}` : title;
}

/** Below this, a point is on the road it joins: "join the A24", not "local roads to the A24". */
const ON_THE_ROAD_M = 300;

export interface EndLine {
  role: "start" | "end";
  /** The place: "Leatherhead". */
  title: string;
  /** "Join the A24", "Local roads to the A24, about 1.2 km"; "Leave the N205, then local roads". */
  detail: string;
}

const roadWords = (road: string | null) => (road ? `the ${road}` : "the main road");

/** The line before the first road: where the trip starts and how it reaches the network. */
export function startLine(route: Pick<RoadRouteResult, "snapped" | "request">): EndLine | null {
  const first = route.snapped[0];
  if (!first) return null;
  const units: RoadDistanceUnit = route.request.units ?? "km";
  const title = first.input.name ?? "Start";
  const detail =
    first.distanceM < ON_THE_ROAD_M
      ? `Join ${roadWords(first.road)}`
      : `Local roads to ${roadWords(first.road)}, about ${roadDistanceText(first.distanceM, units)}`;
  return { role: "start", title, detail };
}

/** The line after the last road: leaving it, then local roads to the end. */
export function endLine(route: Pick<RoadRouteResult, "snapped" | "legs" | "request">): EndLine | null {
  const last = route.snapped.at(-1);
  if (!last || route.snapped.length < 2) return null;
  const units: RoadDistanceUnit = route.request.units ?? "km";
  const lastRoad = [...route.legs].reverse().find((leg) => leg.kind === "road");
  const road = lastRoad?.road ?? last.road;
  const local = last.distanceM < ON_THE_ROAD_M ? "then local roads" : `then local roads, about ${roadDistanceText(last.distanceM, units)}`;
  return { role: "end", title: last.input.name ?? "End", detail: `Leave ${roadWords(road)}, ${local}` };
}

export interface CrossingOption {
  value: RoadCrossingChoice;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Any, Eurotunnel, then each ferry by name, as the installed networks hold them. */
export function crossingOptions(crossings: readonly RoadCrossingDto[]): CrossingOption[] {
  const options: CrossingOption[] = [
    { value: "any", label: "Any", description: "Whichever is quickest, or none if no water is in the way" },
  ];
  const shuttle = crossings.filter((crossing) => crossing.kind === "shuttle");
  if (shuttle.length > 0) {
    const joined = shuttle.some((crossing) => crossing.joined);
    options.push({
      value: "eurotunnel",
      label: "Eurotunnel",
      description: joined ? "Le Shuttle, Folkestone to Calais" : "Not reachable: install the road networks on both sides",
      disabled: !joined,
    });
  }
  const seen = new Set<string>();
  for (const ferry of crossings.filter((crossing) => crossing.kind === "ferry")) {
    if (seen.has(ferry.name)) continue;
    seen.add(ferry.name);
    options.push({
      value: ferry.id,
      label: ferry.name,
      description: ferry.joined
        ? [ferry.operator, "car ferry"].filter(Boolean).join(", ")
        : "Not reachable: install the road networks on both sides",
      disabled: !ferry.joined,
    });
  }
  return options;
}

/** An error the server gave that a road network would put right: it leads to installing one. */
export function wantsANetwork(message: string): boolean {
  return /no road network is installed|has no network installed|networks installed do not join|not reach both sides/i.test(message);
}

/** "Great Britain, France": the countries a route runs through, by name. */
export function countriesText(codes: readonly string[]): string {
  return codes.map((code) => countryName(code) ?? code).join(", ");
}

// ── Which part of the line is which leg ──

type Position = [number, number];

const near = (a: Position, b: Position) => {
  const dx = (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

/** About 100 m, in squared degrees of latitude: a leg's end is a node of the path, kept within the line's 25 m simplification. */
const CLOSE = (100 / 111_320) ** 2;

/**
 * The drawn line cut into each leg's part: for each leg, the lines that are its (none for a
 * via point). The line is one piece per stretch between points; each leg's part runs from
 * where the last one ended to the first point of the line beyond it that is close to the
 * leg's own end (or, failing that, the closest), and the last leg takes the rest.
 */
export function legLines(route: Pick<RoadRouteResult, "legs" | "geometry">): Position[][][] {
  const lines = route.geometry.coordinates as Position[][];
  const parts: Position[][][] = route.legs.map(() => []);
  let line = 0;
  let vertex = 0;
  const lastMoving = route.legs.reduce((found, leg, index) => (leg.kind === "via" ? found : index), -1);
  route.legs.forEach((leg, index) => {
    if (leg.kind === "via" || line >= lines.length) return;
    let to = { line: lines.length - 1, vertex: (lines.at(-1)?.length ?? 1) - 1 };
    if (index !== lastMoving) {
      let best: { line: number; vertex: number; d: number } | null = null;
      search: for (let l = line; l < lines.length; l += 1) {
        const points = lines[l]!;
        for (let v = l === line ? vertex : 0; v < points.length; v += 1) {
          const d = near(points[v]!, leg.end);
          if (!best || d < best.d) best = { line: l, vertex: v, d };
          if (d <= CLOSE) break search;
        }
      }
      if (best) to = best;
    }
    for (let l = line; l <= to.line; l += 1) {
      const points = lines[l]!;
      const piece = points.slice(l === line ? vertex : 0, l === to.line ? to.vertex + 1 : points.length);
      if (piece.length >= 2) parts[index]!.push(piece);
    }
    line = to.line;
    vertex = to.vertex;
  });
  return parts;
}

/** The box round a leg's part of the line, [west, south, east, north], or round its two ends when it has none. */
export function legBounds(leg: Pick<RoadLeg, "start" | "end">, lines: Position[][]): [number, number, number, number] {
  const all = lines.length > 0 ? lines.flat() : [leg.start, leg.end];
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of all) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

/** The box round the whole route. */
export function routeBounds(route: Pick<RoadRouteResult, "geometry" | "snapped">): [number, number, number, number] {
  const all: Position[] = [
    ...(route.geometry.coordinates as Position[][]).flat(),
    ...route.snapped.map((point): Position => [point.input.lon, point.input.lat]),
  ];
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of all) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}
