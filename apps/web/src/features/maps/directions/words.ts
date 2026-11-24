/**
 * What Directions says and works out, apart from the screen: the name of each point, the
 * start it is given before anything is asked, the answer's first line, and the route cut
 * into steps to walk through one at a time. Pure, so that it can be checked by hand.
 */
import {
  haversineMeters,
  homeAsOf,
  type RoadCrossingChoice,
  type RoadDistanceUnit,
  type RoadRouteResult,
  roadDistanceText,
  roadDurationText,
  type StreetsRouteResult,
} from "@outpost/shared";
import { countryName } from "../lib/search";
import type { FeatureCollection } from "../map/overlays";
import { geometryBounds, type RouteMode } from "../road-route/street-words";
import { legBounds, legLines, type RoutePointChoice, routeBounds } from "../road-route/words";

/** A route the screen shows: a drive on Outpost's main roads, or one planned on streets. */
export type DirectionsRoute = RoadRouteResult | StreetsRouteResult;

export type Bbox = [number, number, number, number];

/** "From", "To", "Stop 1": the name of the point at `index` of `count`. */
export function pointLabel(index: number, count: number): string {
  if (index === 0) return "From";
  if (index === count - 1) return "To";
  return `Stop ${index}`;
}

/** The same place, near enough: within 50 m. */
export const samePlace = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  haversineMeters(a.lat, a.lon, b.lat, b.lon) < 50;

/** The current household's home as Directions takes it: a saved place, or a portable household's last position. */
export interface HomeStart {
  name: string;
  lat: number;
  lon: number;
  /** When a portable household's position was set; null for a saved place. */
  at: number | null;
}

/**
 * Where a route starts before anything is asked, in this order: a point handed in ("Directions
 * from here"); where the device is, while it is being followed; the household's home; or
 * nothing, to be asked after the end. Never the end itself: if the end is the start, the start
 * is asked.
 */
export function defaultStart(input: {
  handed?: RoutePointChoice | null;
  here?: { lat: number; lon: number } | null;
  home?: HomeStart | null;
  to?: RoutePointChoice | null;
}): RoutePointChoice | null {
  const start: RoutePointChoice | null = input.handed
    ? input.handed
    : input.here
      ? { name: "Where you are", lat: input.here.lat, lon: input.here.lon, from: "map" }
      : input.home
        ? { name: input.home.name, lat: input.home.lat, lon: input.home.lon, from: "place" }
        : null;
  if (start && input.to && samePlace(start, input.to)) return null;
  return start;
}

/** "Home, as of 3 hours ago" for a portable household's home; its name alone for a saved place. */
export function homeDetail(home: HomeStart, now = Date.now()): string {
  const asOf = homeAsOf(home, now);
  return asOf ? `Household home, ${asOf}` : "Household home";
}

/** The key a plan is kept under for this visit: the same request is never planned twice. */
export function planKey(input: {
  mode: RouteMode;
  units: RoadDistanceUnit;
  crossing: RoadCrossingChoice;
  points: readonly RoutePointChoice[];
}): string {
  const at = input.points.map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)},${point.name}`).join(";");
  return `${input.mode}|${input.units}|${input.mode === "walk" || input.mode === "cycle" ? "" : input.crossing}|${at}`;
}

const WAY_WORD: Record<RouteMode, string> = { drive: "Driving", "drive-door": "Driving door to door", walk: "Walking", cycle: "Cycling" };

/** The answer's first lines: "941 km", "about 9 h 10 min", "Driving, with the Eurotunnel, through United Kingdom and France." */
export function routeSummary(route: DirectionsRoute): { distance: string; time: string; how: string } {
  const units = route.request.units ?? "km";
  const mode: RouteMode = "mode" in route ? route.mode : "drive";
  const road = "mode" in route ? route.road : route;
  const crossing = road?.summary.crossings[0];
  const countries = road?.summary.countries ?? [];
  const named = countries.map((code) => countryName(code) ?? code);
  const through = named.length > 0 ? `through ${named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named[0]}` : "";
  const parts = [WAY_WORD[mode], crossing ? `with the ${crossing.kind === "shuttle" ? "Eurotunnel" : crossing.name}` : "", through].filter(
    Boolean,
  );
  return {
    distance: roadDistanceText(route.summary.distanceM, units),
    time: `about ${roadDurationText(route.summary.durationS)}`,
    how: `${parts.join(", ")}.`,
  };
}

/** "Home → Chamonix" for the bar while the steps are read. */
export function endsTitle(points: ReadonlyArray<RoutePointChoice | null>): string {
  const first = points[0]?.name ?? "Start";
  const last = points.at(-1)?.name ?? "End";
  return `${first} → ${last}`;
}

/** One step of a route, walked through one at a time: what the line says, and what to bring into view. */
export interface RouteStep {
  title: string;
  detail: string;
  bounds: Bbox;
  /** The leg of a drive it is (to draw it heavier on the map), or null for a turn on streets. */
  leg: number | null;
}

const around = ([lon, lat]: [number, number]): Bbox => [lon - 0.002, lat - 0.0013, lon + 0.002, lat + 0.0013];

/** The route's steps: each road and crossing of a drive, or each turn of a walk or a ride. */
export function routeSteps(route: DirectionsRoute): RouteStep[] {
  const road = "mode" in route ? route.road : route;
  if (road) {
    const lines = legLines(road);
    return road.legs.flatMap((leg, index) =>
      leg.kind === "via" ? [] : [{ title: leg.title, detail: leg.detail, bounds: legBounds(leg, lines[index] ?? []), leg: index }],
    );
  }
  const streets = "mode" in route ? route.streets : null;
  return (streets?.lines ?? []).map((line) => ({ title: line.text, detail: line.distanceText, bounds: around(line.at), leg: null }));
}

/** The box round the whole of a route. */
export function directionsBounds(route: DirectionsRoute): Bbox {
  return "mode" in route ? geometryBounds(route) : routeBounds(route);
}

/** The box round some points, a little larger than they are, to bring them into view before the route is there. */
export function pointsBounds(points: ReadonlyArray<{ lat: number; lon: number }>): Bbox | null {
  if (points.length === 0) return null;
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { lat, lon } of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const pad = Math.max(0.01, (east - west) * 0.05, (north - south) * 0.05);
  return [west - pad, south - pad, east + pad, north + pad];
}

/** "941 km" from here to a place, for a row of the picker; null with nothing to measure from. */
export function distanceFrom(from: { lat: number; lon: number } | null, to: { lat: number; lon: number }, units: RoadDistanceUnit) {
  if (!from) return null;
  const metres = haversineMeters(from.lat, from.lon, to.lat, to.lon);
  return roadDistanceText(metres, units);
}

/** The chosen ends as map data, marked as a route's are, while the route itself is being planned. */
export function endsData(points: ReadonlyArray<RoutePointChoice | null>): FeatureCollection {
  const last = points.length - 1;
  return {
    type: "FeatureCollection",
    features: points.flatMap((point, index) =>
      point
        ? [
            {
              type: "Feature" as const,
              properties: {
                kind: "point",
                role: index === 0 ? "start" : index === last ? "end" : "via",
                label: index === 0 ? "Start" : index === last ? "End" : `Via ${index}`,
              },
              geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
            },
          ]
        : [],
    ),
  };
}
