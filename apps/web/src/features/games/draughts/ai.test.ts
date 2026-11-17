/**
 * The computer: whatever the position, it answers with a move from the legal list, at the
 * depth it really plays at; it takes a piece left for it; and the same seed gives the same
 * game while different seeds give different ones.
 */
import { describe, expect, it } from "vitest";
import { randomInt, seededRng } from "../kit/rng";
import { chooseMove, createSearch, moveSeed, SEARCH_DEPTH } from "./ai";
import { applyMove, legalMoves, moveWords, outcomeOf, type Position, parseSquare, positionFrom, sameMove, startPosition } from "./engine";

/** A position reached by random play from the start, `plies` moves in, or null if the game ended first. */
function randomPosition(seed: number, plies: number): Position | null {
  const rng = seededRng(seed);
  let position = startPosition();
  for (let index = 0; index < plies; index += 1) {
    const moves = legalMoves(position);
    if (moves.length === 0) return null;
    position = applyMove(position, moves[randomInt(rng, moves.length)]!);
  }
  return outcomeOf(position).kind === "playing" ? position : null;
}

describe("the computer", () => {
  it("always returns a legal move, on many positions reached by random play, at the real depth", () => {
    let tried = 0;
    let slowest = 0;
    for (let seed = 1; tried < 120; seed += 1) {
      const position = randomPosition(seed, 2 + (seed % 50));
      if (!position) continue;
      tried += 1;
      const started = performance.now();
      const move = chooseMove(position, moveSeed(seed, tried), SEARCH_DEPTH);
      slowest = Math.max(slowest, performance.now() - started);
      expect(legalMoves(position).some((legal) => sameMove(legal, move))).toBe(true);
    }
    // Printed so that the worst time on the machine running the tests can be read off.
    console.info(`Slowest search at depth ${SEARCH_DEPTH}: ${Math.round(slowest)} ms`);
  });

  it("takes a piece offered for nothing rather than one that is taken back", () => {
    // Two captures: b2 takes c3 and lands safe on d4; g3 takes f4 and lands on e5, where f6 takes it back.
    const position = positionFrom({ b2: "d", g3: "d", h2: "d", c3: "l", f4: "l", f6: "l", g7: "l" });
    expect(legalMoves(position).map(moveWords).sort()).toEqual(["b2 jumps to d4", "g3 jumps to e5"]);
    for (const seed of [1, 2, 3, 4, 5]) expect(moveWords(chooseMove(position, seed))).toBe("b2 jumps to d4");
  });

  it("takes a piece left hanging when it is the only capture", () => {
    const position = positionFrom({ e3: "d", a1: "d", f4: "l", h8: "l" });
    expect(chooseMove(position, 5).captures).toEqual([parseSquare("f4")]);
  });

  it("plays the same move for the same seed, and not always the same move for different seeds", () => {
    const start = startPosition();
    expect(sameMove(chooseMove(start, 42), chooseMove(start, 42))).toBe(true);
    const openings = new Set(Array.from({ length: 12 }, (_, seed) => moveWords(chooseMove(start, seed + 1))));
    expect(openings.size).toBeGreaterThan(1);
  });

  it("searches one top move per step, so it can be run in slices", () => {
    const start = startPosition();
    const search = createSearch(start, { rng: seededRng(9) });
    let steps = 1;
    while (!search.step()) steps += 1;
    expect(steps).toBe(legalMoves(start).length);
    expect(legalMoves(start).some((legal) => sameMove(legal, search.best()))).toBe(true);
  });
});
