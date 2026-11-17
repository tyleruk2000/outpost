/**
 * The height of the ground at one point: what the readout at the foot of the map shows
 * beside the coordinates once the pointer (or the map) has come to rest.
 *
 * It is read through the same sampler as a route's heights and a line-of-sight path, from
 * the finest terrain installed there and from nowhere else. Where none covers the point
 * the answer says so; nothing is downloaded. The sampler keeps the last few tiles it
 * decoded, so a pointer resting here and there over the same ground costs a lookup, not a
 * decode, and one person can ask a few times a second.
 */
import type { PointHeight } from "@outpost/shared";
import { z } from "zod";
import type { ElevationSampler } from "./elevation.ts";
import { position } from "./terrain-profile.ts";

export const pointHeightQuery = z.object({ at: position("at") });

/** Told to read at this spacing, the sampler takes the finest tiles installed. */
const FINEST = 1;

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export function createPointHeight(sampler: ElevationSampler) {
  return async (at: { lat: number; lon: number }): Promise<PointHeight> => {
    const { heights, cells } = await sampler.sampleWithCells([[at.lon, at.lat]], FINEST);
    const height = heights[0] ?? null;
    const cell = cells[0] ?? null;
    return { at, heightMeters: height, cellMeters: height === null || cell === null ? null : round(cell, 1) };
  };
}
