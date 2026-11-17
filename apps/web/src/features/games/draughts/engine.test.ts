/**
 * The rules of English draughts as the engine plays them: the moves from the start, simple
 * moves, compulsory captures and the choice between them, jumps that go on, crowning that
 * ends the move, kings going backwards, a side with no move losing, and the quiet-move draw.
 */
import { describe, expect, it } from "vitest";
import {
  applyMove,
  findMove,
  legalMoves,
  type Move,
  moveWords,
  outcomeOf,
  parseSquare,
  pieceCount,
  positionFrom,
  QUIET_LIMIT,
  replay,
  squareName,
  startPosition,
} from "./engine";

const words = (moves: Move[]) => moves.map(moveWords).sort();
const path = (...names: string[]) => names.map(parseSquare);

describe("the start", () => {
  it("has twelve men each on the dark squares, dark to move, with seven moves", () => {
    const start = startPosition();
    expect(pieceCount(start, "dark")).toBe(12);
    expect(pieceCount(start, "light")).toBe(12);
    expect(start.turn).toBe("dark");
    expect(start.board[parseSquare("a1")]).toBe(1);
    expect(start.board[parseSquare("h8")]).toBe(-1);
    expect(words(legalMoves(start))).toEqual(["a3 to b4", "c3 to b4", "c3 to d4", "e3 to d4", "e3 to f4", "g3 to f4", "g3 to h4"].sort());
  });

  it("names squares from dark's side, as on a chess board", () => {
    expect(squareName(0)).toBe("a1");
    expect(squareName(63)).toBe("h8");
    expect(parseSquare("c3")).toBe(18);
  });
});

describe("simple moves", () => {
  it("moves a man one square diagonally forward only, and not onto another piece", () => {
    const position = positionFrom({ d4: "d", c5: "d" });
    expect(words(legalMoves(position))).toEqual(["c5 to b6", "c5 to d6", "d4 to e5"]);
    const after = applyMove(position, legalMoves(position).find((move) => moveWords(move) === "d4 to e5")!);
    expect(after.board[parseSquare("e5")]).toBe(1);
    expect(after.board[parseSquare("d4")]).toBe(0);
    expect(after.turn).toBe("light");
  });

  it("moves light men down the board", () => {
    expect(words(legalMoves(positionFrom({ e5: "l" }, "light")))).toEqual(["e5 to d4", "e5 to f4"]);
  });
});

describe("captures", () => {
  it("must be made: a capture removes every other move", () => {
    const position = positionFrom({ c3: "d", g3: "d", d4: "l" });
    expect(words(legalMoves(position))).toEqual(["c3 jumps to e5"]);
    const after = applyMove(position, legalMoves(position)[0]!);
    expect(after.board[parseSquare("d4")]).toBe(0);
    expect(pieceCount(after, "light")).toBe(0);
  });

  it("may be chosen among several, and the shorter one is allowed", () => {
    // c3 can take one piece; e3 can take two. Either is legal.
    const position = positionFrom({ c3: "d", e3: "d", b4: "l", f4: "l", f6: "l" });
    expect(words(legalMoves(position))).toEqual(["c3 jumps to a5", "e3 jumps to g5 and e7"].sort());
    const both = positionFrom({ c3: "d", d4: "l", f6: "l", b4: "l" });
    expect(words(legalMoves(both))).toEqual(["c3 jumps to a5", "c3 jumps to e5 and g7"].sort());
  });

  it("go on as a double and a triple jump in one move", () => {
    const double = positionFrom({ a1: "d", b2: "l", d4: "l" });
    expect(words(legalMoves(double))).toEqual(["a1 jumps to c3 and e5"]);
    const triple = positionFrom({ a1: "d", b2: "l", d4: "l", d6: "l" });
    const [move] = legalMoves(triple);
    expect(moveWords(move!)).toBe("a1 jumps to c3, e5 and c7");
    const after = applyMove(triple, move!);
    expect(pieceCount(after, "light")).toBe(0);
    expect(after.board[parseSquare("c7")]).toBe(1);
  });

  it("cannot jump the same piece twice or land on a piece already taken", () => {
    // A king going round a square of four: it takes each piece once and ends where it started.
    const position = positionFrom({ c3: "D", d4: "l", f4: "l", f2: "l", d2: "l" });
    const moves = legalMoves(position);
    expect(moves.every((move) => new Set(move.captures).size === move.captures.length)).toBe(true);
    expect(Math.max(...moves.map((move) => move.captures.length))).toBe(4);
    expect(words(moves)).toEqual(["c3 jumps to e1, g3, e5 and c3", "c3 jumps to e5, g3, e1 and c3"]);
  });
});

describe("crowning", () => {
  it("makes a man a king on the far rank and ends the move there, even if a king could jump on", () => {
    // After b6 to c7 to... the man lands on d8 by taking c7; a king on d8 could go on over e7.
    const position = positionFrom({ b6: "d", c7: "l", e7: "l" });
    const moves = legalMoves(position);
    expect(words(moves)).toEqual(["b6 jumps to d8"]);
    const after = applyMove(position, moves[0]!);
    expect(after.board[parseSquare("d8")]).toBe(2);
    expect(after.board[parseSquare("e7")]).toBe(-1);
    expect(after.turn).toBe("light");
  });

  it("crowns a light man on rank 1", () => {
    const position = positionFrom({ d2: "l", h8: "D" }, "light");
    const after = applyMove(position, findMove(position, path("d2", "c1"))!);
    expect(after.board[parseSquare("c1")]).toBe(-2);
  });
});

describe("kings", () => {
  it("move one square backwards as well as forwards, not flying", () => {
    expect(words(legalMoves(positionFrom({ d4: "D" })))).toEqual(["d4 to c3", "d4 to c5", "d4 to e3", "d4 to e5"]);
  });

  it("capture backwards", () => {
    expect(words(legalMoves(positionFrom({ d4: "D", c3: "l" })))).toEqual(["d4 jumps to b2"]);
  });
});

describe("the end", () => {
  it("is a loss for a side with no legal move, whether blocked or with no pieces left", () => {
    const blocked = positionFrom({ a1: "d", b2: "l", c3: "l" });
    expect(legalMoves(blocked)).toEqual([]);
    expect(outcomeOf(blocked)).toEqual({ kind: "won", winner: "light" });
    expect(outcomeOf(positionFrom({ c5: "l" }, "dark"))).toEqual({ kind: "won", winner: "light" });
    expect(outcomeOf(startPosition())).toEqual({ kind: "playing" });
  });

  it("is a draw after 40 moves each with no capture and no man moved", () => {
    // Two kings going to and fro: a1 and b2, h8 and g7.
    let position = positionFrom({ a1: "D", h8: "L" });
    const shuttle = [path("a1", "b2"), path("h8", "g7"), path("b2", "a1"), path("g7", "h8")];
    for (let index = 0; index < QUIET_LIMIT; index += 1) {
      expect(outcomeOf(position).kind).toBe("playing");
      position = applyMove(position, findMove(position, shuttle[index % 4]!)!);
    }
    expect(position.quiet).toBe(80);
    expect(outcomeOf(position)).toEqual({ kind: "draw", reason: "quiet" });
  });

  it("starts the count again when a man moves or a piece is taken", () => {
    const position = positionFrom({ a1: "D", c3: "d", h8: "L" }, "dark", 50);
    expect(applyMove(position, findMove(position, path("a1", "b2"))!).quiet).toBe(51);
    expect(applyMove(position, findMove(position, path("c3", "d4"))!).quiet).toBe(0);
  });
});

describe("replay", () => {
  it("rebuilds a game from its moves and refuses one with an illegal move", () => {
    const game = replay([path("c3", "d4"), path("f6", "e5"), path("d4", "f6")]);
    expect(game?.moves.map(moveWords)).toEqual(["c3 to d4", "f6 to e5", "d4 jumps to f6"]);
    expect(replay([path("c3", "d4"), path("f6", "e5"), path("a3", "b4")])).toBeNull();
    expect(replay([path("c3", "c4")])).toBeNull();
  });
});
