/**
 * Routes made by placing points on the map, as opposed to recordings imported from GPX.
 *
 * A drawn route is exactly what was placed: straight lines between the points, in
 * order. It does not follow paths or roads. Where terrain is installed, each point is
 * given a height, and the line is also sampled every few tens of metres so that the
 * climb between two points a kilometre apart is counted and can be drawn as a profile.
 */
import { haversineMeters, MAX_ROUTE_POINTS, type RouteElevation, type RoutePoint } from "@outpost/shared";
import type { Position } from "geojson";
import { z } from "zod";
import { badRequest } from "../../core/errors.ts";
import type { ElevationSampler } from "./elevation.ts";
import type { TrackFeature } from "./gpx.ts";

/** Samples are never closer than this: about two pixels of the most detailed terrain. */
const MIN_SAMPLE_SPACING_METERS = 25;
/** However long the route, about this many samples describe its profile. */
const TARGET_SAMPLES = 2000;
const DEG = Math.PI / 180;
/** Where the map's projection stops; lines beyond it are interpolated plainly. */
const MERCATOR_LIMIT = 85;

export const routePointsSchema = z
  .array(
    z.object({
      lat: z.number().finite().min(-90, "Latitude must be between -90 and 90.").max(90, "Latitude must be between -90 and 90."),
      lon: z.number().finite().min(-180, "Longitude must be between -180 and 180.").max(180, "Longitude must be between -180 and 180."),
    }),
    { error: "Send the route's points as a list of { lat, lon }." },
  )
  .min(2, "A route needs at least two points.")
  .max(MAX_ROUTE_POINTS, `A route can have at most ${MAX_ROUTE_POINTS} points. Remove some, or save it as two routes.`);

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The points as stored: six decimal places, and no point repeated straight after itself. */
export function cleanRoutePoints(points: RoutePoint[]): Array<[lon: number, lat: number]> {
  const cleaned: Array<[number, number]> = [];
  for (const point of points) {
    const position: [number, number] = [round(point.lon, 6), round(point.lat, 6)];
    const previous = cleaned.at(-1);
    if (previous && previous[0] === position[0] && previous[1] === position[1]) continue;
    cleaned.push(position);
  }
  if (cleaned.length < 2) throw badRequest("Those points are all in the same place. A route needs at least two different points.");
  return cleaned;
}

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
const latitudeOf = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG;

/**
 * The line with extra positions along each leg, no more than `spacingMeters` apart.
 * They lie on the straight line the map draws between two points (straight on the
 * map's projection), so the heights belong to the line the person sees. `vertex` is
 * the index of the placed point a position is, or -1 for one added in between.
 */
export function densify(
  line: ReadonlyArray<readonly [lon: number, lat: number]>,
  spacingMeters: number,
): Array<{ position: [lon: number, lat: number]; vertex: number }> {
  const dense: Array<{ position: [number, number]; vertex: number }> = [];
  line.forEach((point, index) => {
    const previous = line[index - 1];
    if (previous) {
      const steps = Math.ceil(haversineMeters(previous[1], previous[0], point[1], point[0]) / spacingMeters);
      const projected = Math.abs(previous[1]) < MERCATOR_LIMIT && Math.abs(point[1]) < MERCATOR_LIMIT;
      for (let step = 1; step < steps; step += 1) {
        const t = step / steps;
        const lon = previous[0] + (point[0] - previous[0]) * t;
        const lat = projected
          ? latitudeOf(mercatorY(previous[1]) + (mercatorY(point[1]) - mercatorY(previous[1])) * t)
          : previous[1] + (point[1] - previous[1]) * t;
        dense.push({ position: [round(lon, 6), round(lat, 6)], vertex: -1 });
      }
    }
    dense.push({ position: [point[0], point[1]], vertex: index });
  });
  return dense;
}

export function lineLengthMeters(line: ReadonlyArray<readonly [lon: number, lat: number]>): number {
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    total += haversineMeters(line[index - 1]![1], line[index - 1]![0], line[index]![1], line[index]![0]);
  }
  return total;
}

export interface DrawnLine {
  feature: TrackFeature;
  /** The sampled line with heights, for working out the climb; null when no height is known anywhere. */
  profile: Position[] | null;
  elevation: RouteElevation;
}

/**
 * The GeoJSON line of a drawn route. Heights are filled in from installed terrain
 * where there is any. It is written as a GPX track on export: more apps read tracks
 * than routes, and none will try to re-plan one along roads.
 */
export async function buildDrawnLine(points: RoutePoint[], sampler: ElevationSampler): Promise<DrawnLine> {
  const line = cleanRoutePoints(points);
  const spacing = Math.max(MIN_SAMPLE_SPACING_METERS, lineLengthMeters(line) / TARGET_SAMPLES);
  const dense = densify(line, spacing);
  const heights = await sampler.sample(
    dense.map((sample) => sample.position),
    spacing,
  );
  const known = heights.filter((height) => height !== null).length;
  const elevation: RouteElevation = known === 0 ? "none" : known === heights.length ? "terrain" : "partial";

  const coordinates: Position[] = line.map((position) => [...position]);
  const profile: Position[] = [];
  dense.forEach((sample, index) => {
    const height = heights[index] ?? null;
    profile.push(height === null ? [...sample.position] : [...sample.position, height]);
    if (sample.vertex >= 0 && height !== null) coordinates[sample.vertex]!.push(height);
  });

  return {
    feature: {
      type: "Feature",
      properties: { _gpxType: "trk", _drawn: true, _elevation: elevation, ...(elevation === "none" ? {} : { _profile: profile }) },
      geometry: { type: "LineString", coordinates },
    },
    profile: elevation === "none" ? null : profile,
    elevation,
  };
}
