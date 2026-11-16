/**
 * HF coverage maps: the same question the planner asks about one path, asked of every
 * cell of a grid laid over an area, with the transmitter fixed.
 *
 * Every cell holds what the engine answered for a receiver at that cell's centre.
 * Nothing between cells is worked out, and a cell the engine did not answer holds
 * nothing. The grid itself (how an area is cut into cells) is arithmetic and lives here
 * so that the server and the screen agree on it.
 */
import type {
  AntennaSpec,
  EngineDescription,
  ModeId,
  ModeLine,
  NoiseEnvironment,
  PredictionBasis,
  PropagationSite,
  SolarInput,
} from "./propagation.ts";

/** An area in degrees. `east` may run past 180 (up to `west` + 360) for an area that crosses the date line. */
export interface CoverageArea {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type CoverageResolution = "coarse" | "medium" | "fine";

export interface CoverageResolutionSetting {
  id: CoverageResolution;
  label: string;
  /** How many cells the longer side of the area is cut into. The grid has at most this many squared. */
  longSide: number;
}

/**
 * The three grids offered. The work is one engine run per cell, so the finest grid is
 * nine times the work of the coarsest; how long each takes is measured in
 * docs/hf-propagation.md and by `bench-propagation.ts`.
 */
export const COVERAGE_RESOLUTIONS: readonly CoverageResolutionSetting[] = [
  { id: "coarse", label: "Coarse", longSide: 16 },
  { id: "medium", label: "Medium", longSide: 32 },
  { id: "fine", label: "Fine", longSide: 48 },
];

/** The most cells one coverage map may hold: the finest grid on a square area. */
export const COVERAGE_MAX_CELLS = 48 * 48;
/** The smallest area a grid is laid over, in degrees each way: below it every cell would be the same hundredth of a degree. */
export const COVERAGE_MIN_SPAN_DEG = 0.5;
/** Cell centres are kept this far from the poles, in degrees of latitude. */
export const COVERAGE_MAX_LAT = 89;

export interface CoverageGrid {
  columns: number;
  rows: number;
  /** The south-west corner of the grid, and the size of a cell in degrees. */
  west: number;
  south: number;
  lonStep: number;
  latStep: number;
  /** A cell's size on the ground at the middle of the grid, km. */
  cellWidthKm: number;
  cellHeightKm: number;
}

const KM_PER_DEGREE = 111.195;

/**
 * How an area is cut into cells: the longer side (measured on the ground at the middle
 * latitude) into `longSide` cells, the other side into as many cells of about the same
 * size as fit. Cells tile the area exactly.
 */
export function coverageGrid(area: CoverageArea, resolution: CoverageResolution): CoverageGrid {
  const longSide = COVERAGE_RESOLUTIONS.find((item) => item.id === resolution)?.longSide ?? 16;
  const middle = (area.south + area.north) / 2;
  const shrink = Math.max(0.05, Math.cos((middle * Math.PI) / 180));
  const widthKm = (area.east - area.west) * KM_PER_DEGREE * shrink;
  const heightKm = (area.north - area.south) * KM_PER_DEGREE;
  const cellKm = Math.max(widthKm, heightKm) / longSide;
  const columns = Math.max(1, Math.min(longSide, Math.round(widthKm / cellKm)));
  const rows = Math.max(1, Math.min(longSide, Math.round(heightKm / cellKm)));
  const lonStep = (area.east - area.west) / columns;
  const latStep = (area.north - area.south) / rows;
  return {
    columns,
    rows,
    west: area.west,
    south: area.south,
    lonStep,
    latStep,
    cellWidthKm: lonStep * KM_PER_DEGREE * shrink,
    cellHeightKm: latStep * KM_PER_DEGREE,
  };
}

/** A longitude brought into −180 to 180. */
export const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/** The centre of a cell, by its index (row by row from the south-west corner, each row west to east). */
export function coverageCellCentre(grid: CoverageGrid, index: number): { lat: number; lon: number } {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return { lat: grid.south + (row + 0.5) * grid.latStep, lon: wrapLon(grid.west + (column + 0.5) * grid.lonStep) };
}

/** The corners of a cell as [west, south, east, north], longitudes left unwrapped so that a cell is never split. */
export function coverageCellBox(grid: CoverageGrid, index: number): [number, number, number, number] {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return [
    grid.west + column * grid.lonStep,
    grid.south + row * grid.latStep,
    grid.west + (column + 1) * grid.lonStep,
    grid.south + (row + 1) * grid.latStep,
  ];
}

/** The cell a position falls in, or null when it is outside the grid. */
export function coverageCellAt(grid: CoverageGrid, lat: number, lon: number): number | null {
  const row = Math.floor((lat - grid.south) / grid.latStep);
  if (row < 0 || row >= grid.rows) return null;
  // The position may be given a whole turn away from the grid's own longitudes.
  const offset = (((lon - grid.west) % 360) + 360) % 360;
  const column = Math.floor(offset / grid.lonStep);
  if (column < 0 || column >= grid.columns) return null;
  return row * grid.columns + column;
}

/** `POST /api/radio/propagation/coverage` */
export interface CoverageRequest {
  tx: PropagationSite;
  /** The day planned for, YYYY-MM-DD (UTC). The model works by month. */
  date: string;
  powerWatts: number;
  txAntenna: AntennaSpec;
  /** The antenna assumed at every cell, turned towards the transmitter unless it is given a bearing. */
  rxAntenna: AntennaSpec;
  /** Man-made noise assumed at every cell. */
  noise: NoiseEnvironment;
  frequencyMhz: number;
  mode: ModeId;
  requiredSnrDb?: number;
  referenceBandwidthHz?: number;
  /** A measured foF2 belongs to one path and cannot stand for a whole map, so it is not taken here. */
  solar: Exclude<SolarInput, { source: "fof2" }>;
  area: CoverageArea;
  resolution: CoverageResolution;
}

/**
 * One cell: the engine's figures for a receiver at the cell's centre, for each of the
 * 24 hours (index 0 is 01:00 UTC, index 23 is 24:00). An hour at which the engine found
 * no way for the signal to arrive holds null, not a figure.
 */
export interface CoverageCell {
  /** Distance from the transmitter, km, and bearing from it, degrees: the engine's. */
  distanceKm: number;
  bearingDeg: number;
  /** Share of days the mode's requirement is met, 0 to 1. Null when the mode has no figure. */
  reliability: Array<number | null> | null;
  /** Median signal-to-noise ratio in 1 Hz, dB. */
  snrDbHz: Array<number | null>;
  /** Median signal power at the receiver, dBW. */
  signalDbw: Array<number | null>;
}

export interface CoverageResult {
  key: string;
  request: CoverageRequest;
  computedAt: number;
  /** True when this map was found already worked out. */
  cached: boolean;
  /** How long the grid took to work out when it was, in milliseconds. */
  tookMs: number;
  engine: EngineDescription;
  datasets: Array<{ id: string; version: string }>;
  basis: PredictionBasis;
  mode: ModeLine;
  grid: CoverageGrid;
  /** One entry per cell, in index order. Null where the engine gave no answer; `unanswered` says why. */
  cells: Array<CoverageCell | null>;
  unanswered: Array<{ index: number; reason: string }>;
  antennas: { tx: string; rx: string };
  /**
   * Set when an antenna is a level wire longer than a half-wave at the map's frequency,
   * run as VOACAP's sloping long wire: every figure of the map is approximate, and this
   * says why. Shown in the map's legend and on paper. Missing from a map kept before it was added.
   */
  approximate?: string | null;
  /** What a reader must know before relying on the picture. */
  limits: string[];
}

/** A coverage map kept by name. The figures are those it was saved with; they are not worked out again on opening. */
export interface SavedCoverage {
  id: string;
  name: string;
  key: string;
  request: CoverageRequest;
  /** When the figures were worked out, and with what. */
  computedAt: number;
  ssn: number;
  cells: number;
  createdAt: number;
}

/** `GET /api/radio/propagation/coverage` */
export interface CoverageOverview {
  saved: SavedCoverage[];
  limits: { maxCells: number; maxWaiting: number };
}

/** What `POST /api/radio/propagation/coverage` answers: the map if it was already worked out, else the job working it out. */
export type CoverageResponse = { coverage: CoverageResult; job?: undefined } | { job: { id: string }; coverage?: undefined };

// ── Reading a map ───────────────────────────────────────────────────────────

export type CoverageQuantity = "reliability" | "snr" | "signal";

export interface CoverageClass {
  /** The class holds values from this figure up to the next class's. */
  from: number;
  label: string;
}

/**
 * The classes a map is shaded in, lowest first. A value below the first class is left
 * unshaded. Reliability uses the planner's own classes. The signal-to-noise classes are
 * measured from what the mode needs (so "0" is exactly enough on the median day); the
 * signal classes are S-meter readings by the convention S9 = −73 dBm, 6 dB to the unit.
 */
export function coverageClasses(quantity: CoverageQuantity): CoverageClass[] {
  if (quantity === "reliability")
    return [
      { from: 0.1, label: "10 to 29%" },
      { from: 0.3, label: "30 to 49%" },
      { from: 0.5, label: "50 to 69%" },
      { from: 0.7, label: "70 to 89%" },
      { from: 0.9, label: "90% or more" },
    ];
  if (quantity === "snr")
    return [
      { from: -20, label: "20 to 10 dB short" },
      { from: -10, label: "Up to 10 dB short" },
      { from: 0, label: "0 to 10 dB over" },
      { from: 10, label: "10 to 20 dB over" },
      { from: 20, label: "20 dB over or more" },
    ];
  // In dBm, at the edges `sMeter` rounds at: S1 is read from −124 dBm, S3 from −112, and so on.
  return [
    { from: -124, label: "S1 to S2" },
    { from: -112, label: "S3 to S4" },
    { from: -100, label: "S5 to S6" },
    { from: -88, label: "S7 to S8" },
    { from: -76, label: "S9 or more" },
  ];
}

/**
 * The figure a cell is shaded by at one hour (1 to 24): the reliability, the median
 * ratio less what the mode needs (both in 1 Hz), or the median signal power in dBm.
 * Null when the cell has no answer or the quantity does not exist for this map.
 */
export function coverageValue(
  cell: CoverageCell | null,
  quantity: CoverageQuantity,
  utcHour: number,
  requiredSnrDbHz: number | null,
): number | null {
  if (!cell) return null;
  const at = utcHour - 1;
  if (quantity === "reliability") return cell.reliability ? (cell.reliability[at] ?? null) : null;
  if (quantity === "snr") {
    const ratio = cell.snrDbHz[at] ?? null;
    return requiredSnrDbHz === null || ratio === null ? null : ratio - requiredSnrDbHz;
  }
  const power = cell.signalDbw[at] ?? null;
  return power === null ? null : power + 30;
}

/** Which class a value falls in: its index in `coverageClasses`, or −1 for below the lowest. */
export function coverageClassOf(classes: CoverageClass[], value: number): number {
  let found = -1;
  for (const [index, item] of classes.entries()) if (value >= item.from) found = index;
  return found;
}
