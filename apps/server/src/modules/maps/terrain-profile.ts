/**
 * The ground along the path between two points, for a line-of-sight check.
 *
 * The path is the great circle between them, which is the way a radio signal goes.
 * Heights are read from the terrain installed on this device and from nowhere else:
 * where there is none the answer says so, sample by sample, and nothing is downloaded.
 *
 * How closely the path is sampled follows from the terrain. Its finest tiles hold one
 * height per cell, and a height between cells is only a blend of the four around it, so
 * a sample for every cell reads everything that is there and a closer one would read
 * nothing new. That is the step, for as long as it gives no more than
 * `MAX_PROFILE_SAMPLES` samples: about 47 km of path in Britain, 78 km at the equator
 * (cells are narrower further from it). A longer path is sampled more widely, and its heights
 * are then read from coarser tiles whose cells are about as wide as the step. Nothing
 * between two samples is skipped that way, but each cell stands for more ground, so a
 * narrow ridge reads lower on a long path than it does on a short one.
 *
 * The cap is what keeps a path of hundreds of kilometres from holding up the server: a
 * few thousand samples touch a couple of dozen tiles at most, however long the path.
 */
import { greatCirclePoint, haversineMeters, MAX_SIGHT_PATH_METERS, type RoutePoint, type TerrainProfile } from "@outpost/shared";
import { z } from "zod";
import { badRequest } from "../../core/errors.ts";
import { type ElevationSampler, terrainCellMeters } from "./elevation.ts";
import type { TileServer } from "./tile-server.ts";

/** The most samples one profile holds, both ends included. */
export const MAX_PROFILE_SAMPLES = 4096;
/** Samples are never closer than this, however fine the terrain: the heights themselves are only good to a few metres. */
const MIN_STEP_METERS = 5;

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const gap = (startMeters: number, endMeters: number) => ({ startMeters: round(startMeters, 1), endMeters: round(endMeters, 1) });

const position = (name: string) =>
  z
    .string({ error: `Give \`${name}\` as latitude,longitude, for example 54.46,-3.09.` })
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, `Give \`${name}\` as latitude,longitude, for example 54.46,-3.09.`)
    .transform((value) => {
      const [lat, lon] = value.split(",").map(Number) as [number, number];
      return { lat, lon };
    })
    .refine(
      (point) => Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180,
      `\`${name}\` is not a place on Earth: latitude runs from -90 to 90 and longitude from -180 to 180.`,
    );

export const terrainProfileQuery = z.object({ from: position("from"), to: position("to") });

export type TerrainProfiler = (from: RoutePoint, to: RoutePoint) => Promise<TerrainProfile>;

export function createTerrainProfiler(sampler: ElevationSampler, tiles: Pick<TileServer, "sources">): TerrainProfiler {
  return async (from, to) => {
    const distance = haversineMeters(from.lat, from.lon, to.lat, to.lon);
    if (distance < 1) throw badRequest("Those two points are in the same place. Choose two different points.");
    if (distance > MAX_SIGHT_PATH_METERS) {
      throw badRequest(
        `Those two points are ${Math.round(distance / 1000).toLocaleString("en-GB")} km apart. Line of sight is checked up to ${(MAX_SIGHT_PATH_METERS / 1000).toLocaleString("en-GB")} km: beyond that the curve of the Earth is in the way of any two points on the ground.`,
      );
    }
    const base = { from, to, distanceMeters: round(distance, 1) };

    const terrain = tiles.sources().sources.terrain;
    if (!terrain) {
      return { ...base, stepMeters: base.distanceMeters, heights: [null, null], coverage: "none", gaps: [gap(0, distance)], terrain: null };
    }

    const middle = greatCirclePoint(from, to, 0.5).lat;
    const wanted = Math.max(MIN_STEP_METERS, terrainCellMeters(terrain.maxzoom, middle), distance / (MAX_PROFILE_SAMPLES - 1));
    const intervals = Math.max(1, Math.ceil(distance / wanted - 1e-9));
    const step = distance / intervals;
    const positions: Array<[number, number]> = [];
    for (let index = 0; index <= intervals; index += 1) {
      const point = index === 0 ? from : index === intervals ? to : greatCirclePoint(from, to, index / intervals);
      positions.push([point.lon, point.lat]);
    }
    // The sampler reads tiles whose cells are about half the spacing it is told, so it is told
    // twice the step: the cells are then between half a step and a step wide, and leave no gaps.
    const { heights, cells } = await sampler.sampleWithCells(positions, step * 2);

    // Each run of samples with no height, from the first of them to the last.
    const gaps: TerrainProfile["gaps"] = [];
    for (let index = 0; index < heights.length; index += 1) {
      if (heights[index] !== null) continue;
      const start = index;
      while (index + 1 < heights.length && heights[index + 1] === null) index += 1;
      gaps.push(gap(start * step, index * step));
    }
    let finest = Number.POSITIVE_INFINITY;
    let coarsest = 0;
    let known = 0;
    for (const cell of cells) {
      if (cell === null) continue;
      known += 1;
      finest = Math.min(finest, cell);
      coarsest = Math.max(coarsest, cell);
    }
    return {
      ...base,
      stepMeters: round(step, 2),
      heights,
      coverage: known === 0 ? "none" : known === heights.length ? "terrain" : "partial",
      gaps,
      terrain:
        known === 0
          ? null
          : { finestCellMeters: round(finest, 1), coarsestCellMeters: round(coarsest, 1), installedMaxZoom: terrain.maxzoom },
    };
  };
}
