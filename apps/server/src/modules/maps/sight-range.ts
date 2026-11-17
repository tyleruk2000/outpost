/**
 * The estimated range of an aerial: how far out a station at a stated height still has
 * line of sight to it, on each of 72 bearings, from the terrain installed on this
 * device. The repeaters on the map ask for it (see `radio-range.ts` in the shared
 * package for the sums and docs/radio.md for what the result means).
 *
 * Heights are read through the same sampler as the ground between two points, so
 * nothing here touches a file or a path of its own and nothing is ever downloaded:
 * where no terrain is installed the answer says so and gives the smooth-Earth horizon.
 *
 * The ground is read in two passes, each one call to the sampler: every 100 m out to
 * 25 km, where the shape of the nearer ground matters most, and every 250 m from there
 * out to 100 km, read from coarser tiles. The sampler yields to other requests between
 * one decoded tile and the next, so an outline that needs a few dozen tiles does not
 * hold the server up. An answer is kept for the place, the two heights and the terrain
 * installed, so asking again (another device, the same repeater opened twice) costs
 * nothing.
 */
import {
  destinationPoint,
  RANGE_BEARINGS,
  RANGE_FAR_STEP_METERS,
  RANGE_MAX_HEIGHT_METERS,
  RANGE_MAX_METERS,
  RANGE_NEAR_METERS,
  RANGE_NEAR_STEP_METERS,
  type RoutePoint,
  rangeDistances,
  reachAlong,
  type SightRange,
  smoothRangeMeters,
} from "@outpost/shared";
import { z } from "zod";
import type { ElevationSampler } from "./elevation.ts";
import { position } from "./terrain-profile.ts";
import type { TileServer } from "./tile-server.ts";

/** Answers kept, most recently asked last. Each is a few kilobytes. */
const KEPT = 32;

const height = (name: string) =>
  z.coerce
    .number({ error: `Give \`${name}\` as a height in metres.` })
    .min(0, `\`${name}\` is a height above the ground, from 0 to ${RANGE_MAX_HEIGHT_METERS} m.`)
    .max(RANGE_MAX_HEIGHT_METERS, `\`${name}\` is a height above the ground, from 0 to ${RANGE_MAX_HEIGHT_METERS} m.`)
    .transform((value) => Math.round(value * 10) / 10);

export const sightRangeQuery = z.object({ at: position("at"), aerial: height("aerial"), station: height("station") });

export type SightRanger = (at: RoutePoint, aerialMeters: number, stationMeters: number) => Promise<SightRange>;

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export function createSightRanger(sampler: ElevationSampler, tiles: Pick<TileServer, "sources" | "regions">): SightRanger {
  const kept = new Map<string, Promise<SightRange>>();

  const work = async (at: RoutePoint, aerialMeters: number, stationMeters: number): Promise<SightRange> => {
    const horizonMeters = Math.round(smoothRangeMeters(aerialMeters, stationMeters));
    const base = {
      at,
      aerialMeters,
      stationMeters,
      maxMeters: RANGE_MAX_METERS,
      nearStepMeters: RANGE_NEAR_STEP_METERS,
      farStepMeters: RANGE_FAR_STEP_METERS,
      nearMeters: RANGE_NEAR_METERS,
      horizonMeters,
    };
    const none: SightRange = { ...base, coverage: "none", groundMeters: null, bearings: [], hiddenShare: null, terrain: null };
    const terrain = tiles.sources().sources.terrain;
    if (!terrain) return none;
    const [ground] = await sampler.sample([[at.lon, at.lat]], RANGE_NEAR_STEP_METERS * 2);
    if (ground == null) return none;

    const distances = rangeDistances();
    const nearCount = distances.filter((d) => d <= RANGE_NEAR_METERS).length;
    const bearings = Array.from({ length: RANGE_BEARINGS }, (_, index) => (index * 360) / RANGE_BEARINGS);
    // Bearing by bearing, so that one bearing's tiles are still decoded when the next is read.
    const positionsFor = (from: number, to: number) =>
      bearings.flatMap((bearing) =>
        distances.slice(from, to).map((d) => {
          const point = destinationPoint(at, bearing, d);
          return [point.lon, point.lat] as [number, number];
        }),
      );
    // As for a profile, the sampler is told twice the step, so that its cells are between half a step and a step wide.
    const near = await sampler.sampleWithCells(positionsFor(0, nearCount), RANGE_NEAR_STEP_METERS * 2);
    const far = await sampler.sampleWithCells(positionsFor(nearCount, distances.length), RANGE_FAR_STEP_METERS * 2);
    const farCount = distances.length - nearCount;

    let hidden = 0;
    let inside = 0;
    const answer: SightRange["bearings"] = bearings.map((bearingDeg, index) => {
      const heights = [
        ...near.heights.slice(index * nearCount, (index + 1) * nearCount),
        ...far.heights.slice(index * farCount, (index + 1) * farCount),
      ];
      const reach = reachAlong({ groundMeters: ground, distances, heights, aerialMeters, stationMeters });
      // The share hidden is weighted by the area each bearing's wedge holds inside the outline.
      const area = reach.reachMeters ** 2;
      hidden += reach.hiddenShare * area;
      inside += area;
      return {
        bearingDeg,
        reachMeters: Math.round(reach.reachMeters),
        limit: reach.limit,
        furtherMeters: reach.furtherMeters,
        unknownFromMeters: reach.unknownFromMeters,
      };
    });

    let finest = Number.POSITIVE_INFINITY;
    let coarsest = 0;
    for (const cell of [...near.cells, ...far.cells]) {
      if (cell === null) continue;
      finest = Math.min(finest, cell);
      coarsest = Math.max(coarsest, cell);
    }
    return {
      ...base,
      coverage: answer.some((bearing) => bearing.unknownFromMeters !== null) ? "partial" : "terrain",
      groundMeters: ground,
      bearings: answer,
      hiddenShare: inside > 0 ? round(hidden / inside, 3) : 0,
      terrain:
        coarsest > 0
          ? { finestCellMeters: round(finest, 1), coarsestCellMeters: round(coarsest, 1), installedMaxZoom: terrain.maxzoom }
          : null,
    };
  };

  return (at, aerialMeters, stationMeters) => {
    // The terrain installed is part of the question: a region added or removed answers differently.
    const edition = tiles
      .regions()
      .filter((region) => region.tileType === "terrain")
      .map((region) => `${region.id}:${region.installedAt}:${region.status}:${region.available}`)
      .join(",");
    const key = `${at.lat.toFixed(5)},${at.lon.toFixed(5)}|${aerialMeters}|${stationMeters}|${edition}`;
    const known = kept.get(key);
    if (known) {
      kept.delete(key);
      kept.set(key, known);
      return known;
    }
    const pending = work(at, aerialMeters, stationMeters);
    kept.set(key, pending);
    // A failure is not kept: the next ask tries again.
    pending.catch(() => kept.delete(key));
    while (kept.size > KEPT) kept.delete(kept.keys().next().value!);
    return pending;
  };
}
