import { describe, expect, it } from "vitest";
import {
  cellName,
  check,
  digitsLeft,
  enter,
  erase,
  fullButWrong,
  isSudokuGame,
  newGame,
  notesOf,
  type SudokuGame,
  toggleNote,
  undo,
} from "./game";

const fresh = () => newGame(1234, "gentle");
const emptyCells = (game: SudokuGame) => game.givens.flatMap((given, cell) => (given ? [] : [cell]));
const givenCell = (game: SudokuGame) => game.givens.findIndex((given) => given !== 0);

describe("a game of Sudoku", () => {
  it("writes a digit in an empty cell, and not over a given", () => {
    const game = fresh();
    const [cell] = emptyCells(game);
    const next = enter(game, cell!, 5);
    expect(next.entries[cell!]).toBe(5);
    expect(next.moves).toBe(1);
    expect(enter(game, givenCell(game), 5)).toBe(game);
  });

  it("keeps notes, and drops a note from the row, column and box when its digit is written", () => {
    let game = fresh();
    const [a, b] = emptyCells(game).filter((cell) => Math.floor(cell / 9) === Math.floor(emptyCells(game)[0]! / 9));
    game = toggleNote(game, a!, 2);
    game = toggleNote(game, a!, 7);
    expect(notesOf(game, a!)).toEqual([2, 7]);
    expect(cellName(game, a!)).toMatch(/^Row \d, column \d, empty, notes 2 and 7$/);
    game = enter(game, b!, 7);
    expect(notesOf(game, a!)).toEqual([2]);
    // One undo puts back the digit and the note it took away.
    game = undo(game);
    expect(game.entries[b!]).toBe(0);
    expect(notesOf(game, a!)).toEqual([2, 7]);
  });

  it("undoes every entry, note and erasure, in turn", () => {
    let game = fresh();
    const [cell] = emptyCells(game);
    game = toggleNote(game, cell!, 3);
    game = enter(game, cell!, 4);
    game = erase(game, cell!);
    expect(game.entries[cell!]).toBe(0);
    expect(notesOf(game, cell!)).toEqual([]);
    game = undo(game);
    expect(game.entries[cell!]).toBe(4);
    game = undo(game);
    expect(game.entries[cell!]).toBe(0);
    expect(notesOf(game, cell!)).toEqual([3]);
    game = undo(game);
    expect(notesOf(game, cell!)).toEqual([]);
    expect(undo(game)).toBe(game);
  });

  it("marks a wrong digit without saying the answer, and drops the mark when it is changed", () => {
    let game = fresh();
    const [cell] = emptyCells(game);
    const wrong = (game.solution[cell!]! % 9) + 1;
    game = check(enter(game, cell!, wrong));
    expect(game.marked).toEqual([cell]);
    expect(cellName(game, cell!)).toMatch(new RegExp(`, ${wrong}, marked wrong$`));
    game = enter(game, cell!, game.solution[cell!]!);
    expect(game.marked).toEqual([]);
  });

  it("finishes on a full correct grid, and says a full wrong one is not finished", () => {
    let game = fresh();
    const cells = emptyCells(game);
    for (const cell of cells.slice(0, -1)) game = enter(game, cell, game.solution[cell]!);
    const last = cells.at(-1)!;
    const wrong = enter(game, last, (game.solution[last]! % 9) + 1);
    expect(wrong.finished).toBe(false);
    expect(fullButWrong(wrong)).toBe(true);
    game = enter(game, last, game.solution[last]!);
    expect(game.finished).toBe(true);
    expect(digitsLeft(game).slice(1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(enter(game, last, 1)).toBe(game);
  });

  it("names a given cell", () => {
    const game = fresh();
    const cell = givenCell(game);
    expect(cellName(game, cell)).toBe(`Row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}, given ${game.givens[cell]}`);
  });

  it("accepts its own saved game and refuses a damaged one", () => {
    const game = toggleNote(enter(fresh(), emptyCells(fresh())[0]!, 3), emptyCells(fresh())[1]!, 6);
    expect(isSudokuGame(JSON.parse(JSON.stringify(game)))).toBe(true);
    expect(isSudokuGame({ ...game, level: "hard" })).toBe(false);
    expect(isSudokuGame({ ...game, entries: game.entries.slice(1) })).toBe(false);
    const overGiven = [...game.entries];
    overGiven[givenCell(game)] = 1;
    expect(isSudokuGame({ ...game, entries: overGiven })).toBe(false);
    expect(isSudokuGame(null)).toBe(false);
  });
});
