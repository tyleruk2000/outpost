/**
 * Peg solitaire's engine (packages/shared/src/games/peg-solitaire), run with the server's
 * tests as the allotment's is. The English board of 33 holes, jumps only straight over a
 * neighbour into an empty hole, the end found when no jump is left, undo as a replay one
 * jump shorter, and a whole solution played out to one peg in the centre.
 */
import {
  applyJump,
  CENTRE,
  endingOf,
  findJump,
  HOLES,
  holeName,
  isHole,
  isOver,
  type JumpPair,
  jumpWords,
  legalJumps,
  parseHole,
  pegCount,
  replay,
  startBoard,
} from "@outpost/shared/games/peg-solitaire";
import { describe, expect, it } from "vitest";

const hole = (name: string) => {
  const place = parseHole(name);
  if (place === null) throw new Error(`${name} is not a hole.`);
  return place;
};
const pair = (text: string): JumpPair => {
  const [from, to] = text.split("-");
  return [hole(from!), hole(to!)];
};
const names = (pairs: readonly JumpPair[]) => pairs.map(([from, to]) => `${holeName(from)}-${holeName(to)}`);

/**
 * A solution of the English board from the centre-empty start to one peg in the centre,
 * found by a search and replayed jump by jump below.
 */
const SOLUTION = [
  "d6-d4",
  "b5-d5",
  "c7-c5",
  "e7-c7",
  "d5-b5",
  "a5-c5",
  "e5-e7",
  "g5-e5",
  "c4-c6",
  "c7-c5",
  "a4-c4",
  "c4-c6",
  "e4-e6",
  "e7-e5",
  "g4-e4",
  "e4-e6",
  "c2-c4",
  "a3-c3",
  "c3-c5",
  "c6-c4",
  "c4-e4",
  "e3-e5",
  "e6-e4",
  "g3-e3",
  "d3-f3",
  "e1-e3",
  "e4-e2",
  "c1-e1",
  "e1-e3",
  "f3-d3",
  "d2-d4",
].map(pair);

describe("the board", () => {
  it("has 33 holes in a cross, named a1 to g7 with the centre d4", () => {
    expect(HOLES).toHaveLength(33);
    expect(holeName(CENTRE)).toBe("d4");
    expect(parseHole("d4")).toBe(CENTRE);
    // The 2 by 2 corners are not holes.
    for (const corner of ["a1", "b2", "a7", "b6", "f2", "g1", "f6", "g7"]) expect(parseHole(corner)).toBeNull();
    for (const name of ["c1", "e1", "a3", "a5", "g3", "g5", "c7", "e7"]) expect(parseHole(name)).not.toBeNull();
    expect(parseHole("h4")).toBeNull();
    expect(parseHole("d8")).toBeNull();
    expect(HOLES.every((place) => parseHole(holeName(place)) === place)).toBe(true);
  });

  it("starts with 32 pegs and the centre empty, with four first jumps, all into the centre", () => {
    const board = startBoard();
    expect(pegCount(board)).toBe(32);
    expect(board[CENTRE]).toBe(false);
    expect(HOLES.filter((place) => place !== CENTRE).every((place) => board[place])).toBe(true);
    // Places off the cross never hold a peg.
    expect(board.filter((peg, place) => peg && !isHole(place))).toEqual([]);
    const first = legalJumps(board);
    expect(first.map(jumpWords).sort()).toEqual(["b4 over c4 to d4", "d2 over d3 to d4", "d6 over d5 to d4", "f4 over e4 to d4"]);
    expect(endingOf(board)).toEqual({ kind: "playing" });
  });
});

describe("a jump", () => {
  it("takes the peg jumped over and moves the jumping peg", () => {
    expect(findJump(startBoard(), hole("d6"), hole("d4"))).toEqual({ from: hole("d6"), over: hole("d5"), to: hole("d4") });
    const board = applyJump(startBoard(), hole("d6"), hole("d4"))!;
    expect(board[hole("d6")]).toBe(false);
    expect(board[hole("d5")]).toBe(false);
    expect(board[hole("d4")]).toBe(true);
    expect(pegCount(board)).toBe(31);
  });

  it("is refused diagonally, onto a peg, over a hole, off the board, from an empty hole, and further than two", () => {
    const start = startBoard();
    // After d6 over d5 to d4, d5 and d6 are the only empty holes.
    const after = applyJump(start, hole("d6"), hole("d4"))!;
    // Diagonal, with a peg between and the landing empty: f4 over e5 to d6, b3 over c4 to d5.
    expect(applyJump(after, hole("f4"), hole("d6"))).toBeNull();
    expect(applyJump(after, hole("b3"), hole("d5"))).toBeNull();
    // Onto a peg: at the start every hole but the centre is full.
    expect(applyJump(start, hole("d7"), hole("d5"))).toBeNull();
    // Over a hole: d7 over the empty d6 into the empty d5.
    expect(applyJump(after, hole("d7"), hole("d5"))).toBeNull();
    // Off the board: two places left of a3, and two below c1, are not holes (the first would wrap round to f4 by number).
    const a3 = hole("a3");
    expect(applyJump(after, a3, a3 - 2)).toBeNull();
    expect(applyJump(after, hole("c1"), hole("c1") + 14)).toBeNull();
    expect(applyJump(after, hole("c1"), -1)).toBeNull();
    expect(legalJumps(after).every((jump) => isHole(jump.from) && isHole(jump.over) && isHole(jump.to))).toBe(true);
    // From an empty hole.
    expect(applyJump(after, hole("d6"), hole("d4"))).toBeNull();
    // Not exactly two holes along.
    expect(applyJump(start, hole("d7"), hole("d4"))).toBeNull();
    expect(applyJump(start, hole("d5"), hole("d4"))).toBeNull();
    // The board given is never changed.
    expect(start).toEqual(startBoard());
  });
});

describe("the end", () => {
  it("is found when no jump is left, with the pegs left counted", () => {
    // A game played to its end by always taking the first jump found.
    let pairs: JumpPair[] = [];
    let board = startBoard();
    while (!isOver(board)) {
      const jump = legalJumps(board)[0]!;
      pairs = [...pairs, [jump.from, jump.to]];
      board = applyJump(board, jump.from, jump.to)!;
    }
    expect(legalJumps(board)).toEqual([]);
    const ending = endingOf(board);
    expect(ending.kind).not.toBe("playing");
    expect(pegCount(board)).toBe(32 - pairs.length);
    if (ending.kind === "stuck") expect(ending.left).toBe(pegCount(board));
    expect(replay(pairs)?.board).toEqual(board);
  });

  it("is one peg in the centre at the end of a whole solution, replayed jump by jump", () => {
    expect(SOLUTION).toHaveLength(31);
    let board = startBoard();
    SOLUTION.forEach(([from, to], index) => {
      const next = applyJump(board, from, to);
      expect(next, `jump ${index + 1}, ${holeName(from)} to ${holeName(to)}`).not.toBeNull();
      board = next!;
      expect(pegCount(board)).toBe(31 - index);
      expect(isOver(board)).toBe(index === 30);
    });
    expect(pegCount(board)).toBe(1);
    expect(board[CENTRE]).toBe(true);
    expect(endingOf(board)).toEqual({ kind: "solved", inCentre: true });
    expect(replay(SOLUTION)?.board).toEqual(board);
  });

  it("says solved but not in the centre when the last peg is elsewhere", () => {
    const board = startBoard().map(() => false);
    board[hole("c5")] = true;
    expect(endingOf(board)).toEqual({ kind: "solved", inCentre: false });
  });

  it("is not reached while two pegs side by side have an empty hole beyond, and is when they are apart", () => {
    const board = startBoard().map(() => false);
    board[hole("c5")] = true;
    board[hole("d5")] = true;
    expect(endingOf(board)).toEqual({ kind: "playing" });
    board[hole("d5")] = false;
    board[hole("e3")] = true;
    expect(endingOf(board)).toEqual({ kind: "stuck", left: 2 });
  });
});

describe("undo", () => {
  it("is the same jumps one shorter, and restores the board exactly at every step", () => {
    const boards = [startBoard()];
    for (const [from, to] of SOLUTION) boards.push(applyJump(boards[boards.length - 1]!, from, to)!);
    for (let length = SOLUTION.length; length >= 0; length -= 1) {
      const replayed = replay(SOLUTION.slice(0, length))!;
      expect(replayed.board).toEqual(boards[length]);
      expect(replayed.jumps).toHaveLength(length);
    }
    expect(replay([])?.board).toEqual(startBoard());
  });

  it("refuses jumps that are not legal in their turn", () => {
    expect(replay([pair("d6-d4"), pair("d6-d4")])).toBeNull();
    expect(replay([[hole("d7"), hole("d5")]])).toBeNull();
    expect(replay([[0, 2]])).toBeNull();
    expect(names(SOLUTION.slice(0, 2))).toEqual(["d6-d4", "b5-d5"]);
  });
});
