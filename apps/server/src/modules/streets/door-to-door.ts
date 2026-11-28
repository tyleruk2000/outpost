/**
 * Door to door: Outpost's own road route is the spine, with its legs in the owner's
 * style ("M25", "M20 - Folkestone"); the streets service adds the streets at each end,
 * from the door to where Outpost's route joins the main roads, and from where it leaves
 * them to the door, as turn-by-turn lines. Valhalla's narrative never replaces the
 * owner's lines: on long drives it names roads by their European numbers ("Keep right to
 * stay on E 05") and runs to fifty steps (docs/development/street-routes-measurements.md).
 *
 * A short trip (the doors under 15 km apart in a straight line), or one where no road
 * network is installed, is driven on streets all the way instead. An end outside the
 * streets built (a French door with British streets) keeps Outpost's route to the main
 * road nearest it, with a warning.
 */
import type { RoadDistanceUnit, RoadRouteResult, StreetDirections } from "@outpost/shared";
import { roadDistanceText } from "@outpost/shared";
import { AppError } from "../../core/errors.ts";
import { meters } from "../roads/graph.ts";
import type { StreetsClient } from "./client.ts";
import { streetDirections } from "./narrative.ts";

/** Closer than this to the main road, a door needs no streets of its own. */
export const DOOR_ON_ROUTE_M = 100;
/** Doors closer than this (straight line) are a short trip: streets all the way. */
export const SHORT_TRIP_M = 15_000;

export interface Point {
  lat: number;
  lon: number;
  name: string | null;
}

export interface DoorToDoorParts {
  spine: "main-roads" | "streets";
  road: RoadRouteResult | null;
  start: StreetDirections | null;
  end: StreetDirections | null;
  streets: StreetDirections | null;
  warnings: string[];
}

/** What to say when an end could not be given streets; rethrows what is not about coverage. */
export type EndProblem = (error: unknown, point: Point) => string;

export async function doorToDoor(input: {
  points: Point[];
  units: RoadDistanceUnit;
  crossing: string;
  client: StreetsClient;
  plan: () => Promise<RoadRouteResult>;
  /** Turns a refusal at one end into a sentence (or rethrows). */
  endProblem: EndProblem;
  signal?: AbortSignal;
}): Promise<DoorToDoorParts> {
  const { points, units, client } = input;
  const first = points[0]!;
  const last = points.at(-1)!;
  const warnings: string[] = [];

  let road: RoadRouteResult | null = null;
  let noNetwork = false;
  if (meters(first.lat, first.lon, last.lat, last.lon) >= SHORT_TRIP_M || points.length > 2) {
    try {
      road = await input.plan();
    } catch (error) {
      // No roads kept at all, or none where a point is: the whole drive goes on streets.
      const reason = error instanceof AppError ? (error.details as { reason?: string } | undefined)?.reason : undefined;
      if (reason === "empty" || reason === "point") noNetwork = true;
      else throw error;
    }
  }

  if (!road) {
    const reply = await client.route({ points, costing: "auto", ...(input.signal ? { signal: input.signal } : {}) });
    if (noNetwork)
      warnings.push(
        "No roads for routes are kept where this drive goes, so the whole drive is on streets, turn by turn. Add roads for routes for the main-road lines.",
      );
    return {
      spine: "streets",
      road: null,
      start: null,
      end: null,
      streets: streetDirections(reply, { units, costing: "auto", viaNames: points.slice(1, -1).map((p) => p.name) }),
      warnings,
    };
  }

  const join = road.snapped[0]!;
  const leave = road.snapped.at(-1)!;
  async function ends(from: Point, to: Point, door: Point, which: "start" | "end"): Promise<StreetDirections | null> {
    try {
      const reply = await client.route({ points: [from, to], costing: "auto", ...(input.signal ? { signal: input.signal } : {}) });
      // The streets from the door end where the main-road lines begin: "Join Kingston Road (B2430), then the main roads below".
      return streetDirections(reply, { units, costing: "auto", ...(which === "start" ? { endsOnMainRoad: join.road } : {}) });
    } catch (error) {
      if (input.signal?.aborted) throw error;
      const why = input.endProblem(error, door);
      warnings.push(
        which === "start"
          ? `${why} The directions start on the main road ${roadDistanceText(join.distanceM, units)} from the start.`
          : `${why} The directions end on the main road ${roadDistanceText(leave.distanceM, units)} from the end.`,
      );
      return null;
    }
  }
  const joinPoint: Point = { lat: join.lat, lon: join.lon, name: join.road };
  const leavePoint: Point = { lat: leave.lat, lon: leave.lon, name: leave.road };
  const [start, end] = await Promise.all([
    join.distanceM > DOOR_ON_ROUTE_M ? ends(first, joinPoint, first, "start") : Promise.resolve(null),
    leave.distanceM > DOOR_ON_ROUTE_M ? ends(leavePoint, last, last, "end") : Promise.resolve(null),
  ]);

  // The last road line says "then local roads to the end": with streets to the door, they follow.
  if (end) {
    const legs = road.legs.map((leg) => ({ ...leg }));
    const lastRoad = [...legs].reverse().find((leg) => leg.kind === "road");
    if (lastRoad)
      lastRoad.detail = lastRoad.detail.replace(/, then local roads(, [^,]+ to the end| to the end)$/, ", then the streets to the door");
    road = { ...road, legs };
  }
  // Outpost's own "the start is 2 km from the nearest main road" is answered by the streets from that door.
  const far = /in a straight line from the nearest main road/;
  const roadWarnings = road.warnings.filter(
    (w) => !(far.test(w) && ((start && /start there/.test(w)) || (end && points.length === 2 && /pass there/.test(w)))),
  );
  return { spine: "main-roads", road, start, end, streets: null, warnings: [...roadWarnings, ...warnings] };
}
