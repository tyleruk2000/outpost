/**
 * The estimated range of an aerial (a viewshed) for the repeaters on the map, any point
 * on the map and the relay planner. The work is the shared package's (`viewshed.ts`), so
 * that a phone out of reach works it out the same way from the terrain it kept; this file
 * gives it the installed terrain and keeps answers. An answer is kept for the place, the
 * two heights and the terrain installed, so asking again (another device, the same
 * repeater opened twice) costs nothing. Nothing is ever downloaded: where no terrain is
 * installed the answer says so and gives the smooth-Earth horizon.
 */
import { computeViewshed, RANGE_MAX_HEIGHT_METERS, type RoutePoint, type SightRange, type Viewshed } from "@outpost/shared";
import { z } from "zod";
import type { ElevationSampler } from "./elevation.ts";
import { position } from "./terrain-profile.ts";
import type { TileServer } from "./tile-server.ts";

export { positionsAlong, type Viewshed, viewshedOf } from "@outpost/shared";

/** Answers kept, most recently asked last. Each is about 150 kB. */
const KEPT = 32;
/** Viewsheds kept with their heights, for the relay planner: each is a few megabytes. */
const KEPT_GRIDS = 4;

const height = (name: string) =>
  z.coerce
    .number({ error: `Give \`${name}\` as a height in metres.` })
    .min(0, `\`${name}\` is a height above the ground, from 0 to ${RANGE_MAX_HEIGHT_METERS} m.`)
    .max(RANGE_MAX_HEIGHT_METERS, `\`${name}\` is a height above the ground, from 0 to ${RANGE_MAX_HEIGHT_METERS} m.`)
    .transform((value) => Math.round(value * 10) / 10);

export const sightRangeQuery = z.object({ at: position("at"), aerial: height("aerial"), station: height("station") });

export interface SightRanger {
  (at: RoutePoint, aerialMeters: number, stationMeters: number): Promise<SightRange>;
  /** The same, with the heights and bits it was worked out from. */
  viewshed(at: RoutePoint, aerialMeters: number, stationMeters: number): Promise<Viewshed>;
}

export function createSightRanger(sampler: ElevationSampler, tiles: Pick<TileServer, "sources" | "regions">): SightRanger {
  const kept = new Map<string, Promise<SightRange>>();
  const grids = new Map<string, Promise<Viewshed>>();

  const work = (at: RoutePoint, aerialMeters: number, stationMeters: number): Promise<Viewshed> =>
    computeViewshed(sampler, tiles.sources().sources.terrain ?? null, at, aerialMeters, stationMeters);

  const keyOf = (at: RoutePoint, aerialMeters: number, stationMeters: number) => {
    // The terrain installed is part of the question: a region added or removed answers differently.
    const edition = tiles
      .regions()
      .filter((region) => region.tileType === "terrain")
      .map((region) => `${region.id}:${region.installedAt}:${region.status}:${region.available}`)
      .join(",");
    return `${at.lat.toFixed(5)},${at.lon.toFixed(5)}|${aerialMeters}|${stationMeters}|${edition}`;
  };

  /** From a kept list, most recently asked last, or worked out and kept; a failure is not kept, so the next ask tries again. */
  function remembered<T>(list: Map<string, Promise<T>>, most: number, key: string, make: () => Promise<T>): Promise<T> {
    const known = list.get(key);
    if (known) {
      list.delete(key);
      list.set(key, known);
      return known;
    }
    const pending = make();
    list.set(key, pending);
    pending.catch(() => list.delete(key));
    while (list.size > most) list.delete(list.keys().next().value!);
    return pending;
  }

  const viewshed = (at: RoutePoint, aerialMeters: number, stationMeters: number) =>
    remembered(grids, KEPT_GRIDS, keyOf(at, aerialMeters, stationMeters), () => work(at, aerialMeters, stationMeters));

  const ranger = ((at: RoutePoint, aerialMeters: number, stationMeters: number) =>
    remembered(
      kept,
      KEPT,
      keyOf(at, aerialMeters, stationMeters),
      async () => (await viewshed(at, aerialMeters, stationMeters)).range,
    )) as SightRanger;
  ranger.viewshed = viewshed;
  return ranger;
}
