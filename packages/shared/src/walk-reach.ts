/**
 * How far a person can walk in a set time from a point: the ground reachable on foot, worked out over installed
 * terrain with Tobler's hiking function, faster along the paths and roads of the installed map, barred by water,
 * cliffs and ground too steep to walk. The server works it out (`GET /api/maps/walk-reach`); the map shades it in
 * bands by the hour.
 *
 * Tobler's hiking function, as published (W. Tobler, "Three presentations on geographical analysis and modeling",
 * NCGIA Technical Report 93-1, 1993, p. 4 of the eScholarship copy, read 21 November 2026): "For walking on
 * footpaths in hilly terrain: W = 6 exp(-3.5 * abs(S + 0.05)) where W is the walking velocity, S is dh/dx = slope =
 * tan(theta) ... The velocity is given in km/hr. On flat terrain this works out to 5 km/hr. For off-path travel
 * multiply by 3/5 (= 0.6)."
 */
import type { RoutePoint } from "./maps.ts";

/** The times a walk can be asked for, in minutes. */
export const WALK_MINUTES = [30, 60, 90, 120, 180, 240] as const;
export type WalkMinutes = (typeof WALK_MINUTES)[number];

/**
 * The paces offered. The first is Tobler's function as published, for a fit adult with no load; the others are
 * Outpost's own allowances for a slower walker, a fixed share of it, and are said to be.
 */
export const WALK_PACES = [
  { id: "standard", name: "Fit adult, no load", factor: 1 },
  { id: "slower", name: "Slower", factor: 0.75, about: "three quarters of the pace: a heavy pack, children, or an easy day" },
  { id: "slowest", name: "Much slower", factor: 0.5, about: "half the pace: someone hurt, tired or unused to hills" },
] as const;
export type WalkPaceId = (typeof WALK_PACES)[number]["id"];

/** Off a path or road Tobler's function is multiplied by this (his 3/5). */
export const WALK_OFF_PATH_FACTOR = 0.6;
/** Ground steeper than this (rise over run; 1 is 45°) is taken as not walkable: a scramble or a crag, not a walk. */
export const WALK_STEEPEST_SLOPE = 1;

/** Tobler's hiking function: walking speed in km/h on a path, for a slope given as rise over run (uphill positive). */
export function toblerKmh(slope: number): number {
  return 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
}

/** A walk's grid cell is never finer than this, and is coarser for longer walks so that the grid stays a size a Pi can work. */
export function walkCellMeters(minutes: number): number {
  return Math.max(25, Math.round((minutes / 60) * 15));
}

/** `GET /api/maps/walk-reach`. */
export interface WalkReach {
  at: RoutePoint;
  minutes: number;
  pace: WalkPaceId;
  /** `none` when no terrain is held at the start; `partial` when it runs out within reach. */
  coverage: "terrain" | "partial" | "none";
  groundMeters: number | null;
  /**
   * The grid: `size` cells a side, each `cellMeters` across, centred on the start, laid out east and north in metres
   * on a plane touching the Earth at the start (x = Δlon × cos(lat of start), y = Δlat, both in metres along the
   * Earth's radius `EARTH_RADIUS_METERS`). Row 0 is the northern edge.
   */
  cellMeters: number;
  size: number;
  /**
   * Minutes to reach each cell, row by row, one byte each, base64: 0 to 254; 255 where it is not reached in the time
   * (or cannot be: water, a cliff, no terrain). Empty with no terrain.
   */
  minutesGrid: string;
  /** Whether paths and roads were read from an installed map; without one the walk is all off-path. */
  paths: boolean;
  /** The furthest the walk reaches from the start, straight-line, in metres. */
  furthestMeters: number;
}
