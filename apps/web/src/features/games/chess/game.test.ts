/**
 * A game as kept and carried: a damaged save refused, undo by whole turns, and PGN and
 * FEN written out and read back, including the PGN people paste from elsewhere, with
 * comments, variations and annotations.
 */
import { describe, expect, it } from "vitest";
import { NotationError, START_FEN } from "./engine";
import { isGame, newGame, play, readPasted, toPgn, undoTurn } from "./game";

const opening = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"];

describe("a kept game", () => {
  it("is accepted only when every field is sound and its moves replay legally", () => {
    const game = { ...newGame(5, "computer", "white", "easy"), moves: opening };
    expect(isGame(game)).toBe(true);
    expect(isGame({ ...game, moves: ["e2e5"] })).toBe(false);
    expect(isGame({ ...game, level: "grandmaster" })).toBe(false);
    expect(isGame({ ...game, start: "nonsense" })).toBe(false);
    expect(isGame({ ...game, version: 2 })).toBe(false);
    expect(isGame(null)).toBe(false);
  });

  it("undoes a whole turn: the person's move and the reply, or one move with two players", () => {
    const computer = { ...newGame(5, "computer", "white", "easy"), moves: opening.slice(0, 4) };
    expect(undoTurn(computer)).toEqual(opening.slice(0, 2));
    expect(undoTurn({ ...computer, moves: opening })).toEqual(opening.slice(0, 4));
    const two = { ...newGame(5, "two-player", "white", "easy"), moves: opening };
    expect(undoTurn(two)).toEqual(opening.slice(0, 4));
    const asBlack = { ...newGame(5, "computer", "black", "easy"), moves: opening.slice(0, 3) };
    expect(undoTurn(asBlack)).toEqual(opening.slice(0, 1));
  });
});

describe("PGN", () => {
  it("writes the seven standard tags and the moves, and reads them back", () => {
    const game = { ...newGame(5, "computer", "white", "medium"), moves: opening };
    const pgn = toPgn(game, play(game), new Date(2026, 10, 21));
    expect(pgn).toContain('[Event "Casual game"]');
    expect(pgn).toContain('[Date "2026.11.21"]');
    expect(pgn).toContain('[White "You"]');
    expect(pgn).toContain('[Black "Outpost computer (medium)"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).toContain("1. e4 e5 2. Nf3 Nc6 3. Bb5 *");
    expect(readPasted(pgn)).toEqual({ start: START_FEN, moves: opening, kind: "pgn" });
  });

  it("keeps the start position of a game that began from one, and the result once it is over", () => {
    const start = "4k3/8/3K4/8/8/8/8/R7 w - - 0 1";
    const game = { ...newGame(5, "two-player", "white", "easy", start), moves: ["a1a7", "e8d8", "a7a8"] };
    const played = play(game);
    expect(played.outcome).toEqual({ kind: "won", winner: "white" });
    const pgn = toPgn(game, played);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${start}"]`);
    expect(pgn.trim().endsWith("1. Ra7 Kd8 2. Ra8# 1-0")).toBe(true);
    expect(pgn.split("\n").every((line) => line.length < 80)).toBe(true);
    expect(readPasted(pgn)).toEqual({ start, moves: game.moves, kind: "pgn" });
  });

  it("reads a game pasted from elsewhere: comments, variations, annotations and numbers passed over", () => {
    const pasted = `[Event "Club night"]
[White "A"]
[Black "B"]

1. e4 {the king's pawn} e5 2. Nf3 (2. f4 exf4 (2... d5)) 2... Nc6 $1 3. Bb5!? a6 ; the Morphy defence
4. Ba4 1/2-1/2`;
    expect(readPasted(pasted).moves).toEqual([...opening, "a7a6", "b5a4"]);
    expect(readPasted("1.e4 e5 2.Nf3").moves).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("says which move it could not read", () => {
    expect(() => readPasted("1. e4 e5 2. Ke3")).toThrow(NotationError);
    expect(() => readPasted("1. e4 e5 2. Ke3")).toThrow('"Ke3" is not a legal move here (move 2).');
    expect(() => readPasted("hello there")).toThrow(/not a legal move/);
    expect(() => readPasted("   ")).toThrow(/nothing to read/);
    expect(() => readPasted("1. f3 e5 2. g4 Qh4# 3. a3")).toThrow(/already over/);
  });
});

describe("FEN pasted in", () => {
  it("starts a game from that position", () => {
    expect(readPasted("4k3/8/8/8/8/8/8/R3K3 w Q - 0 1")).toEqual({ start: "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1", moves: [], kind: "fen" });
    expect(readPasted("4k3/8/8/8/8/8/8/R3K3 b -").start).toBe("4k3/8/8/8/8/8/8/R3K3 b - - 0 1");
  });

  it("is refused when it is not a legal position", () => {
    expect(() => readPasted("8/8/8/8/8/8/8/8 w - - 0 1")).toThrow(/one white king/);
  });
});
