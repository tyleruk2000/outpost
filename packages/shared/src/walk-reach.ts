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

/** The times a walk is offered for, in minutes: the same as Reachable from here offers on foot, up to 8 hours. */
export const WALK_MINUTES = [30, 60, 120, 240, 360, 480] as const;
export type WalkMinutes = (typeof WALK_MINUTES)[number];
/** Every time the server answers for: the times offered, and an hour and a half and three hours, offered before. */
export const WALK_MINUTES_ANSWERED: readonly number[] = [30, 60, 90, 120, 180, 240, 360, 480];

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

/** A walker's speed on a slope as a share of the speed on the flat, by Tobler's function (above 1 on a gentle descent). */
export function walkGradeFactor(slope: number): number {
  return toblerKmh(slope) / toblerKmh(0);
}

/**
 * How much faster or slower a bicycle goes on a slope than on the flat: Valhalla's own table for its bicycle costing
 * (`kGradeBasedSpeedFactor` in src/sif/bicyclecost.cc, MIT licence, read 24 November 2026), "speed adjustment factors
 * based on weighted grade", one for each of these grades in per cent (its comments: 18 km/h on the flat, 9 km/h up
 * 10%, 39.6 km/h down 10%). Between two grades the factor is read along the straight line between them; beyond the
 * ends it stays at the end's.
 */
export const CYCLE_GRADE_FACTORS: ReadonlyArray<readonly [gradePercent: number, factor: number]> = [
  [-10, 2.2],
  [-8, 2.0],
  [-6.5, 1.9],
  [-5, 1.7],
  [-3, 1.4],
  [-1.5, 1.2],
  [0, 1.0],
  [1.5, 0.95],
  [3, 0.85],
  [5, 0.75],
  [6.5, 0.65],
  [8, 0.55],
  [10, 0.5],
  [11.5, 0.45],
  [13, 0.4],
  [15, 0.3],
];

/** A bicycle's speed on a slope (rise over run, uphill positive) as a share of its speed on the flat. */
export function cycleGradeFactor(slope: number): number {
  const grade = slope * 100;
  const table = CYCLE_GRADE_FACTORS;
  if (grade <= table[0]![0]) return table[0]![1];
  for (let index = 1; index < table.length; index += 1) {
    const [g1, f1] = table[index]!;
    if (grade <= g1) {
      const [g0, f0] = table[index - 1]!;
      return f0 + ((grade - g0) / (g1 - g0)) * (f1 - f0);
    }
  }
  return table.at(-1)![1];
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
