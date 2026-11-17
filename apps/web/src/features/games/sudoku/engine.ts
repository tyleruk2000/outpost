/**
 * Sudoku puzzles, made on this device from a seed. A full grid is filled by a seeded
 * search that tries the digits of each cell in a shuffled order; then givens are taken
 * away one at a time in a seeded order, and a removal is kept only if the puzzle still
 * has exactly one solution (counted by a solver that stops at two). The levels differ
 * in how many givens are left and in whether the puzzle can be finished by singles
 * alone. Pure: no React, no clock, no storage.
 */
import { type Rng, seededRng, shuffled } from "../kit/rng";

/** 81 digits, row by row; 0 is an empty cell. */
export type Grid = number[];

export const LEVELS = ["gentle", "steady", "testing"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = { gentle: "Gentle", steady: "Steady", testing: "Testing" };

/**
 * What each level asks of its puzzle. `givens` is the number of givens removal stops
 * at (it can stop above it, when no further cell can be taken away under the rules).
 * `singles` says the puzzle must be solvable by singles alone after every removal;
 * `beyondSingles` says the finished puzzle should need more than singles, tried on a
 * few grids from the same seed and given up on quietly if none does.
 */
export const LEVEL_RULES: Record<Level, { givens: number; singles: boolean; beyondSingles: boolean }> = {
  gentle: { givens: 38, singles: true, beyondSingles: false },
  steady: { givens: 30, singles: true, beyondSingles: false },
  testing: { givens: 17, singles: false, beyondSingles: true },
};

/** How many grids Testing tries for one that needs more than singles. */
const TESTING_TRIES = 4;

export const rowOf = (cell: number) => Math.floor(cell / 9);
export const colOf = (cell: number) => cell % 9;
export const boxOf = (cell: number) => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);

/** For each cell, the 20 other cells in its row, column and box. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: 81 }, (_, cell) => {
  const out: number[] = [];
  for (let other = 0; other < 81; other += 1) {
    if (other === cell) continue;
    if (rowOf(other) === rowOf(cell) || colOf(other) === colOf(cell) || boxOf(other) === boxOf(cell)) out.push(other);
  }
  return out;
});

/** The 27 units: nine rows, nine columns, nine boxes, each a list of nine cells. */
const UNITS: readonly (readonly number[])[] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, i) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 + (b % 3) * 3 + (i % 3)),
  ),
];

const ALL = 0x3fe; // bits 1 to 9
const bit = (digit: number) => 1 << digit;
function bitCount(mask: number): number {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count += 1;
  return count;
}

/** Bit masks of the digits used in each row, column and box; null when the grid breaks a rule. */
function usedMasks(grid: Grid): { rows: Int16Array; cols: Int16Array; boxes: Int16Array } | null {
  const rows = new Int16Array(9);
  const cols = new Int16Array(9);
  const boxes = new Int16Array(9);
  for (let cell = 0; cell < 81; cell += 1) {
    const digit = grid[cell]!;
    if (!digit) continue;
    const b = bit(digit);
    const r = rowOf(cell);
    const c = colOf(cell);
    const x = boxOf(cell);
    if (rows[r]! & b || cols[c]! & b || boxes[x]! & b) return null;
    rows[r]! |= b;
    cols[c]! |= b;
    boxes[x]! |= b;
  }
  return { rows, cols, boxes };
}

/**
 * Searches the grid's solutions, filling the cell with fewest candidates first. Stops
 * once `limit` solutions are found. `order` shuffles the digits tried (for making a
 * grid); `found` receives the first solution.
 */
function search(grid: Grid, limit: number, rng?: Rng, found?: (solution: Grid) => void): number {
  const masks = usedMasks(grid);
  if (!masks) return 0;
  const { rows, cols, boxes } = masks;
  const work = [...grid];
  const empties: number[] = [];
  for (let cell = 0; cell < 81; cell += 1) if (!work[cell]) empties.push(cell);
  let count = 0;

  const step = (depth: number): boolean => {
    if (depth === empties.length) {
      count += 1;
      if (count === 1) found?.([...work]);
      return count >= limit;
    }
    // The empty cell with the fewest candidates, swapped into place at this depth.
    let best = depth;
    let bestMask = 0;
    let bestCount = 10;
    for (let index = depth; index < empties.length; index += 1) {
      const cell = empties[index]!;
      const mask = ALL & ~(rows[rowOf(cell)]! | cols[colOf(cell)]! | boxes[boxOf(cell)]!);
      const n = bitCount(mask);
      if (n < bestCount) {
        best = index;
        bestMask = mask;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (bestCount === 0) return false;
    [empties[depth], empties[best]] = [empties[best]!, empties[depth]!];
    const cell = empties[depth]!;
    const r = rowOf(cell);
    const c = colOf(cell);
    const x = boxOf(cell);
    let digits: number[] = [];
    for (let digit = 1; digit <= 9; digit += 1) if (bestMask & bit(digit)) digits.push(digit);
    if (rng) digits = shuffled(digits, rng);
    for (const digit of digits) {
      const b = bit(digit);
      work[cell] = digit;
      rows[r]! |= b;
      cols[c]! |= b;
      boxes[x]! |= b;
      const done = step(depth + 1);
      rows[r]! &= ~b;
      cols[c]! &= ~b;
      boxes[x]! &= ~b;
      work[cell] = 0;
      if (done) return true;
    }
    [empties[depth], empties[best]] = [empties[best]!, empties[depth]!];
    return false;
  };

  step(0);
  return count;
}

/** How many solutions the grid has, counting no further than `limit` (2 tells one from many). */
export function countSolutions(grid: Grid, limit = 2): number {
  return search(grid, limit);
}

/** The grid's first solution, or null when it has none. */
export function solve(grid: Grid): Grid | null {
  let solution: Grid | null = null;
  search(grid, 1, undefined, (found) => {
    solution = found;
  });
  return solution;
}

/** A full valid grid, the same for the same generator state. */
export function fullGrid(rng: Rng): Grid {
  let solution: Grid | null = null;
  search(new Array<number>(81).fill(0), 1, rng, (found) => {
    solution = found;
  });
  if (!solution) throw new Error("No grid could be filled");
  return solution;
}

/**
 * Whether the grid can be finished by singles alone: a cell with only one candidate
 * left (a naked single), or a digit with only one place left in a row, column or box
 * (a hidden single), filled again and again until the grid is full or neither is found.
 */
export function solvableBySingles(grid: Grid): boolean {
  const masks = usedMasks(grid);
  if (!masks) return false;
  const { rows, cols, boxes } = masks;
  const work = [...grid];
  const place = (cell: number, digit: number) => {
    const b = bit(digit);
    work[cell] = digit;
    rows[rowOf(cell)]! |= b;
    cols[colOf(cell)]! |= b;
    boxes[boxOf(cell)]! |= b;
  };
  const candidates = (cell: number) => ALL & ~(rows[rowOf(cell)]! | cols[colOf(cell)]! | boxes[boxOf(cell)]!);
  let empty = work.filter((digit) => !digit).length;
  while (empty > 0) {
    let progress = false;
    for (let cell = 0; cell < 81; cell += 1) {
      if (work[cell]) continue;
      const mask = candidates(cell);
      if (mask === 0) return false;
      if ((mask & (mask - 1)) === 0) {
        place(cell, Math.log2(mask));
        empty -= 1;
        progress = true;
      }
    }
    for (const unit of UNITS) {
      for (let digit = 1; digit <= 9; digit += 1) {
        let spot = -1;
        let spots = 0;
        let present = false;
        for (const cell of unit) {
          if (work[cell] === digit) {
            present = true;
            break;
          }
          if (!work[cell] && candidates(cell) & bit(digit)) {
            spots += 1;
            spot = cell;
          }
        }
        if (present) continue;
        if (spots === 0) return false;
        if (spots === 1) {
          place(spot, digit);
          empty -= 1;
          progress = true;
        }
      }
    }
    if (!progress) return false;
  }
  return true;
}

export interface Puzzle {
  seed: number;
  level: Level;
  /** The givens; 0 for the cells to fill. */
  givens: Grid;
  /** The one solution, the full grid the puzzle was made from. */
  solution: Grid;
}

/** Takes givens away from a full grid in a seeded order, under the level's rules. */
function carve(solution: Grid, level: Level, rng: Rng): Grid {
  const rules = LEVEL_RULES[level];
  const puzzle = [...solution];
  let left = 81;
  for (const cell of shuffled(
    Array.from({ length: 81 }, (_, index) => index),
    rng,
  )) {
    if (left <= rules.givens) break;
    const digit = puzzle[cell]!;
    puzzle[cell] = 0;
    const ok = rules.singles ? solvableBySingles(puzzle) : countSolutions(puzzle, 2) === 1;
    if (ok) left -= 1;
    else puzzle[cell] = digit;
  }
  return puzzle;
}

/**
 * The puzzle for this seed and level, the same every time. A puzzle solvable by singles
 * has exactly one solution, so the singles test also keeps the answer unique.
 */
export function makePuzzle(seed: number, level: Level): Puzzle {
  const rng = seededRng(seed);
  const rules = LEVEL_RULES[level];
  let solution = fullGrid(rng);
  let givens = carve(solution, level, rng);
  for (let attempt = 1; rules.beyondSingles && attempt < TESTING_TRIES && solvableBySingles(givens); attempt += 1) {
    solution = fullGrid(rng);
    givens = carve(solution, level, rng);
  }
  return { seed, level, givens, solution };
}

export const givenCount = (grid: Grid) => grid.filter((digit) => digit !== 0).length;
