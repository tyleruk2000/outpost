/**
 * A game of Sudoku in progress: the puzzle, what has been written in it, the notes, the
 * cells marked wrong by the last check, and a history for undo. Pure functions that
 * return a new state, so the screen can keep it, save it and test it.
 */
import { colOf, type Grid, LEVELS, type Level, makePuzzle, PEERS, rowOf } from "./engine";

/** One cell as it was before a move: undo puts it back. */
interface CellBefore {
  cell: number;
  entry: number;
  notes: number;
}

export interface SudokuGame {
  version: 1;
  seed: number;
  level: Level;
  givens: Grid;
  solution: Grid;
  /** A digit written in each cell to fill, 0 for none. */
  entries: Grid;
  /** The pencil notes of each cell, one bit for each digit (bit 1 for 1 … bit 9 for 9). */
  notes: number[];
  /** Cells the last check found wrong, until they are changed. */
  marked: number[];
  /** Each move, as the cells it changed were before it: the last undone first. */
  history: CellBefore[][];
  /** Entries, notes and erasures made (undo does not count). */
  moves: number;
  /** Seconds spent on the puzzle while it was on screen. */
  seconds: number;
  finished: boolean;
}

export function newGame(seed: number, level: Level): SudokuGame {
  const puzzle = makePuzzle(seed, level);
  return {
    version: 1,
    seed,
    level,
    givens: puzzle.givens,
    solution: puzzle.solution,
    entries: new Array<number>(81).fill(0),
    notes: new Array<number>(81).fill(0),
    marked: [],
    history: [],
    moves: 0,
    seconds: 0,
    finished: false,
  };
}

/** The digit shown in a cell: its given, or what was written there. */
export const digitAt = (game: SudokuGame, cell: number) => game.givens[cell] || game.entries[cell]!;

export const notesOf = (game: SudokuGame, cell: number): number[] =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => game.notes[cell]! & (1 << digit));

const isFull = (game: SudokuGame) => game.givens.every((given, cell) => given || game.entries[cell]);
const isCorrect = (game: SudokuGame) => game.solution.every((digit, cell) => digitAt(game, cell) === digit);

/** Whether every cell is filled but something is wrong. */
export const fullButWrong = (game: SudokuGame) => isFull(game) && !isCorrect(game);

/** Applies a change to some cells, keeping how they were for undo. */
function change(game: SudokuGame, changes: Array<{ cell: number; entry: number; notes: number }>): SudokuGame {
  const real = changes.filter(({ cell, entry, notes }) => game.entries[cell] !== entry || game.notes[cell] !== notes);
  if (real.length === 0 || game.finished) return game;
  const entries = [...game.entries];
  const notes = [...game.notes];
  const before: CellBefore[] = real.map(({ cell }) => ({ cell, entry: entries[cell]!, notes: notes[cell]! }));
  for (const { cell, entry, notes: mask } of real) {
    entries[cell] = entry;
    notes[cell] = mask;
  }
  const touched = new Set(real.filter(({ cell, entry }) => game.entries[cell] !== entry).map(({ cell }) => cell));
  const next: SudokuGame = {
    ...game,
    entries,
    notes,
    marked: game.marked.filter((cell) => !touched.has(cell)),
    history: [...game.history, before],
    moves: game.moves + 1,
  };
  return { ...next, finished: isFull(next) && isCorrect(next) };
}

/**
 * Writes a digit in a cell. A given cannot be changed. Writing the digit already there
 * clears it. The same digit is taken out of the notes of the cell's row, column and box,
 * in the same move, so that one undo puts them all back.
 */
export function enter(game: SudokuGame, cell: number, digit: number): SudokuGame {
  if (game.givens[cell]) return game;
  const entry = game.entries[cell] === digit ? 0 : digit;
  const changes = [{ cell, entry, notes: entry ? 0 : game.notes[cell]! }];
  if (entry) {
    for (const peer of PEERS[cell]!) {
      if (game.notes[peer]! & (1 << digit))
        changes.push({ cell: peer, entry: game.entries[peer]!, notes: game.notes[peer]! & ~(1 << digit) });
    }
  }
  return change(game, changes);
}

/** Adds a pencil note to an empty cell, or takes it away. */
export function toggleNote(game: SudokuGame, cell: number, digit: number): SudokuGame {
  if (game.givens[cell] || game.entries[cell]) return game;
  return change(game, [{ cell, entry: 0, notes: game.notes[cell]! ^ (1 << digit) }]);
}

/** Clears a cell's digit and notes. */
export function erase(game: SudokuGame, cell: number): SudokuGame {
  if (game.givens[cell]) return game;
  return change(game, [{ cell, entry: 0, notes: 0 }]);
}

/** Takes back the last move. */
export function undo(game: SudokuGame): SudokuGame {
  const last = game.history.at(-1);
  if (!last || game.finished) return game;
  const entries = [...game.entries];
  const notes = [...game.notes];
  for (const { cell, entry, notes: mask } of last) {
    entries[cell] = entry;
    notes[cell] = mask;
  }
  const touched = new Set(last.map(({ cell }) => cell));
  return { ...game, entries, notes, marked: game.marked.filter((cell) => !touched.has(cell)), history: game.history.slice(0, -1) };
}

/** Marks the written digits that do not agree with the solution. It never says what they should be. */
export function check(game: SudokuGame): SudokuGame {
  const marked = game.entries.flatMap((entry, cell) => (entry && entry !== game.solution[cell] ? [cell] : []));
  return { ...game, marked };
}

/** How many of each digit are still to be placed, 1 to 9 (index 0 unused). */
export function digitsLeft(game: SudokuGame): number[] {
  const left = new Array<number>(10).fill(9);
  left[0] = 0;
  for (let cell = 0; cell < 81; cell += 1) {
    const digit = digitAt(game, cell);
    if (digit) left[digit] = Math.max(0, left[digit]! - 1);
  }
  return left;
}

/** "notes 2 and 7", "note 4". */
function listNotes(digits: number[]): string {
  if (digits.length === 1) return `note ${digits[0]}`;
  return `notes ${digits.slice(0, -1).join(", ")} and ${digits.at(-1)}`;
}

/** The cell's spoken name: "Row 3, column 5, given 7", "Row 1, column 2, empty, notes 2 and 7", "Row 4, column 4, 6, marked wrong". */
export function cellName(game: SudokuGame, cell: number): string {
  const place = `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`;
  const given = game.givens[cell];
  if (given) return `${place}, given ${given}`;
  const entry = game.entries[cell];
  if (entry) return `${place}, ${entry}${game.marked.includes(cell) ? ", marked wrong" : ""}`;
  const notes = notesOf(game, cell);
  return notes.length ? `${place}, empty, ${listNotes(notes)}` : `${place}, empty`;
}

/** A game read back from the device, accepted only if every field is the right shape and agrees with the puzzle. */
export function isSudokuGame(value: unknown): value is SudokuGame {
  if (!value || typeof value !== "object") return false;
  const game = value as Partial<SudokuGame>;
  const digits = (grid: unknown, min: number): grid is Grid =>
    Array.isArray(grid) && grid.length === 81 && grid.every((d) => Number.isInteger(d) && d >= min && d <= 9);
  const cellList = (list: unknown): list is number[] =>
    Array.isArray(list) && list.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 81);
  if (game.version !== 1 || !Number.isInteger(game.seed) || !LEVELS.includes(game.level as Level)) return false;
  if (!digits(game.givens, 0) || !digits(game.solution, 1) || !digits(game.entries, 0)) return false;
  if (!Array.isArray(game.notes) || game.notes.length !== 81 || !game.notes.every((n) => Number.isInteger(n) && n >= 0 && n <= 0x3fe))
    return false;
  if (!cellList(game.marked) || typeof game.finished !== "boolean") return false;
  if (!Number.isInteger(game.moves) || game.moves! < 0 || typeof game.seconds !== "number" || !(game.seconds >= 0)) return false;
  if (!Array.isArray(game.history)) return false;
  const historyOk = game.history.every(
    (move) =>
      Array.isArray(move) &&
      move.every(
        (before) =>
          before &&
          Number.isInteger(before.cell) &&
          before.cell >= 0 &&
          before.cell < 81 &&
          Number.isInteger(before.entry) &&
          before.entry >= 0 &&
          before.entry <= 9 &&
          Number.isInteger(before.notes),
      ),
  );
  if (!historyOk) return false;
  // Givens agree with the solution, and nothing is written over a given.
  return game.givens.every((given, cell) => (given ? given === game.solution![cell] && game.entries![cell] === 0 : true));
}
