/**
 * The computer: at every level it answers with a legal move, on many positions reached by
 * random play; the stronger levels take a piece left hanging, mate in one when they can,
 * and see a mate in two; the same seed plays the same move; and the hardest level is
 * quick enough for a phone.
 */
import { describe, expect, it } from "vitest";
import { randomInt, seededRng } from "../kit/rng";
import { chooseMove, evaluate, LEVELS } from "./ai";
import { applyMove, legalMoves, moveCode, outcomeOf, type Position, parseFen, startPosition } from "./engine";

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
  it("always returns a legal move, at every level, on positions reached by random play", () => {
    for (const level of LEVELS) {
      let tried = 0;
      for (let seed = 1; tried < (level === "hard" ? 6 : 20); seed += 1) {
        const position = randomPosition(seed, 4 + (seed % 40));
        if (!position) continue;
        tried += 1;
        const move = chooseMove(position, seed, level);
        expect(legalMoves(position).map(moveCode)).toContain(moveCode(move));
      }
    }
  }, 30_000);

  it("takes a queen left hanging, from easy up", () => {
    const position = parseFen("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1");
    for (const level of ["easy", "medium", "hard"] as const) expect(moveCode(chooseMove(position, 7, level))).toBe("d1d5");
  });

  it("mates in one when it can, at every level", () => {
    const position = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    for (const level of LEVELS) expect(moveCode(chooseMove(position, 3, level))).toBe("a1a8");
  });

  it("finds a mate in two at medium and hard", () => {
    // Two rooks against a king on the edge: no mate in one, but one rook to the seventh rank and the other mates on the eighth.
    const position = parseFen("7k/8/8/8/8/8/8/RR4K1 w - - 0 1");
    for (const level of ["medium", "hard"] as const) {
      const first = chooseMove(position, 11, level);
      const after = applyMove(position, first);
      const reply = legalMoves(after);
      expect(reply.length).toBeGreaterThan(0);
      // Whatever black replies, white has a mate next.
      for (const answer of reply) {
        const then = applyMove(after, answer);
        const mate = legalMoves(then).some((move) => outcomeOf(applyMove(then, move)).kind === "won");
        expect(mate).toBe(true);
      }
    }
  });

  it("plays the same move for the same seed, and different games for different seeds at the learner level", () => {
    const start = startPosition();
    expect(moveCode(chooseMove(start, 99, "medium"))).toBe(moveCode(chooseMove(start, 99, "medium")));
    const openings = new Set(Array.from({ length: 12 }, (_, seed) => moveCode(chooseMove(start, seed + 1, "learner"))));
    expect(openings.size).toBeGreaterThan(3);
  });

  it("counts material: a queen up is far better", () => {
    expect(evaluate(parseFen("4k3/8/8/8/8/8/8/3QK3 w - - 0 1"))).toBeGreaterThan(800);
    expect(evaluate(parseFen("4k3/8/8/8/8/8/8/3QK3 b - - 0 1"))).toBeLessThan(-800);
    expect(evaluate(startPosition())).toBe(0);
  });

  it("answers at the hardest level within a few seconds in a busy middle game", () => {
    const position = parseFen("r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R w KQ - 0 8");
    const started = performance.now();
    chooseMove(position, 5, "hard");
    expect(performance.now() - started).toBeLessThan(5000);
  }, 30_000);
});
