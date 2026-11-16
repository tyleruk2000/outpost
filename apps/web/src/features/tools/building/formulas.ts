/**
 * The sums behind the building calculators. Lengths in metres, areas in square metres,
 * volumes in cubic metres. Geometry needs no source; the figures that do (mix ratios,
 * yields, surface resistances) are named beside them and in docs/tools.md.
 */

// ── Area and volume ─────────────────────────────────────────────────────────

export type Shape = "rectangle" | "triangle" | "circle" | "trapezium";

/** Plan area of a shape from its dimensions: a, b for a rectangle; base, height for a triangle; diameter for a circle; two parallel sides and the height for a trapezium. */
export function shapeArea(shape: Shape, a: number, b = 0, c = 0): number {
  switch (shape) {
    case "rectangle":
      return a * b;
    case "triangle":
      return (a * b) / 2;
    case "circle":
      return Math.PI * (a / 2) ** 2;
    case "trapezium":
      return ((a + b) / 2) * c;
  }
}

// ── Roof pitch ──────────────────────────────────────────────────────────────

export interface Pitch {
  degrees: number;
  /** Rise for each 12 of run, as pitch is given in the US ("6 in 12"). */
  inTwelve: number;
  percent: number;
  /** The length along the slope over the run, from the eaves to the ridge, without the overhang. */
  slopeLength: number;
}

export function roofPitch(rise: number, run: number): Pitch {
  return {
    degrees: (Math.atan2(rise, run) * 180) / Math.PI,
    inTwelve: (rise / run) * 12,
    percent: (rise / run) * 100,
    slopeLength: Math.hypot(rise, run),
  };
}

/** The rise over a run at a pitch in degrees. */
export const riseAtPitch = (degrees: number, run: number): number => Math.tan((degrees * Math.PI) / 180) * run;

// ── Cutting list ────────────────────────────────────────────────────────────

export interface Board {
  /** The stock length it is cut from. */
  stock: number;
  /** The pieces cut from it, longest first. */
  pieces: number[];
  /** What is left at the end, after the saw cuts. */
  offcut: number;
}

export interface CuttingPlan {
  boards: Board[];
  /** Pieces longer than every stock length, which no board can give. */
  tooLong: number[];
}

/**
 * Which stock lengths to buy and how to cut them, by a simple, stated method ("first fit
 * decreasing"): pieces longest first; each goes on the first board already started that
 * has room for it; when none has, a new board of the shortest stock length it fits on is
 * started. Every cut costs one kerf, except a piece that takes the last of a board. It is
 * quick and usually close, but not guaranteed to use the fewest boards.
 */
export function cuttingPlan(pieces: readonly number[], stockLengths: readonly number[], kerf: number): CuttingPlan {
  const stocks = [...stockLengths].filter((length) => length > 0).sort((a, b) => a - b);
  const longest = stocks[stocks.length - 1] ?? 0;
  const boards: Array<Board & { left: number }> = [];
  const tooLong: number[] = [];
  const ordered = [...pieces].filter((piece) => piece > 0).sort((a, b) => b - a);
  const tolerance = 1e-9;
  const place = (board: Board & { left: number }, piece: number) => {
    board.pieces.push(piece);
    // The last piece of a board needs no cut after it.
    board.left = Math.max(0, board.left - piece - (board.left - piece > tolerance ? kerf : 0));
  };
  for (const piece of ordered) {
    if (piece > longest + tolerance) {
      tooLong.push(piece);
      continue;
    }
    const open = boards.find((board) => board.left + tolerance >= piece);
    if (open) {
      place(open, piece);
      continue;
    }
    const stock = stocks.find((length) => length + tolerance >= piece)!;
    const board = { stock, pieces: [] as number[], offcut: 0, left: stock };
    place(board, piece);
    boards.push(board);
  }
  return { boards: boards.map(({ left, ...board }) => ({ ...board, offcut: left })), tooLong };
}

/** "3 × 2.4 m, 1 × 3.6 m": how many of each stock length a plan uses. */
export function boardsByStock(plan: CuttingPlan): Array<{ stock: number; count: number }> {
  const counts = new Map<number, number>();
  for (const board of plan.boards) counts.set(board.stock, (counts.get(board.stock) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0] - b[0]).map(([stock, count]) => ({ stock, count }));
}

// ── Heat loss ───────────────────────────────────────────────────────────────

/**
 * Surface resistances of BS EN ISO 6946, in m²K/W, for heat flowing sideways (a wall),
 * upwards (a roof or ceiling) and downwards (a floor).
 */
export const SURFACE_RESISTANCE = {
  horizontal: { inside: 0.13, outside: 0.04 },
  upwards: { inside: 0.1, outside: 0.04 },
  downwards: { inside: 0.17, outside: 0.04 },
} as const;

export type HeatFlow = keyof typeof SURFACE_RESISTANCE;

export interface Layer {
  /** Thickness in metres. */
  thickness: number;
  /** Thermal conductivity in W/mK. */
  conductivity: number;
}

/**
 * The U-value of a build-up of plain layers by the simple sum of BS EN ISO 6946:
 * U = 1 / (Rsi + Σ d/λ + Rse). It leaves out timber studs and other bridges through the
 * insulation, air gaps and fixings, which the standard's full method corrects for.
 */
export function uValue(layers: readonly Layer[], flow: HeatFlow): number {
  const { inside, outside } = SURFACE_RESISTANCE[flow];
  const layersR = layers.reduce((sum, layer) => sum + layer.thickness / layer.conductivity, 0);
  return 1 / (inside + layersR + outside);
}

/** Heat flowing through an element, in watts: U × A × ΔT. */
export const fabricLossWatts = (u: number, area: number, deltaT: number): number => u * area * deltaT;

// ── Sheets and fixings ──────────────────────────────────────────────────────

/** Whole sheets to cover an area, with a share added for cutting waste. */
export function sheetsFor(area: number, sheetArea: number, wastePercent: number): number {
  return Math.ceil(((area * (1 + wastePercent / 100)) / sheetArea) * (1 - 1e-12));
}

/** Fixings on a grid over a sheet: a row at each edge and at each spacing between them, both ways. */
export function fixingsPerSheet(width: number, height: number, spacingAcross: number, spacingAlong: number): number {
  const across = Math.ceil(width / spacingAcross - 1e-9) + 1;
  const along = Math.ceil(height / spacingAlong - 1e-9) + 1;
  return across * along;
}
