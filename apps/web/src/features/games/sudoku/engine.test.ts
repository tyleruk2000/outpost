import { describe, expect, it } from "vitest";
import { countSolutions, type Grid, givenCount, LEVEL_RULES, LEVELS, makePuzzle, solvableBySingles, solve } from "./engine";

const grid = (text: string): Grid => [...text.replace(/\s/g, "")].map((ch) => (ch === "." ? 0 : Number(ch)));

// A well-known puzzle with one solution, and that solution.
const KNOWN = grid(`
  53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79`);
const KNOWN_SOLUTION = grid(`
  534678912672195348198342567859761423426853791713924856961537284287419635345286179`);

describe("the solver", () => {
  it("solves a known puzzle to its known solution, and counts it as having one", () => {
    expect(solve(KNOWN)).toEqual(KNOWN_SOLUTION);
    expect(countSolutions(KNOWN)).toBe(1);
  });

  it("counts a puzzle with two solutions as 2", () => {
    // The known solution with its first two rows emptied: they can be filled as they were, or swapped.
    const two = [...KNOWN_SOLUTION];
    for (let c = 0; c < 9; c += 1) {
      two[c] = 0;
      two[9 + c] = 0;
    }
    expect(countSolutions(two)).toBe(2);
    expect(countSolutions(new Array<number>(81).fill(0))).toBe(2);
  });

  it("counts a grid that breaks a rule as having none", () => {
    const broken = [...KNOWN];
    broken[2] = 5;
    expect(countSolutions(broken)).toBe(0);
    expect(solve(broken)).toBeNull();
  });

  it("finishes the known puzzle by singles alone", () => {
    expect(solvableBySingles(KNOWN)).toBe(true);
  });
});

describe("making puzzles", () => {
  for (const level of LEVELS) {
    it(`gives ${level} puzzles with exactly one solution, the grid they were made from`, () => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const puzzle = makePuzzle(seed * 7919, level);
        expect(countSolutions(puzzle.givens)).toBe(1);
        expect(solve(puzzle.givens)).toEqual(puzzle.solution);
        expect(countSolutions(puzzle.solution)).toBe(1);
        expect(puzzle.solution.every((digit) => digit >= 1 && digit <= 9)).toBe(true);
        puzzle.givens.forEach((digit, cell) => {
          if (digit) expect(digit).toBe(puzzle.solution[cell]);
        });
        expect(givenCount(puzzle.givens)).toBeGreaterThanOrEqual(LEVEL_RULES[level].givens);
        if (LEVEL_RULES[level].singles) expect(solvableBySingles(puzzle.givens)).toBe(true);
      }
    });
  }

  it("gives the same puzzle for the same seed, and another for another", () => {
    expect(makePuzzle(42, "steady")).toEqual(makePuzzle(42, "steady"));
    expect(makePuzzle(42, "steady").givens).not.toEqual(makePuzzle(43, "steady").givens);
  });

  it("makes each level quickly enough for a phone (times logged for 50 seeds each)", () => {
    for (const level of LEVELS) {
      const times: number[] = [];
      const givens: number[] = [];
      let beyond = 0;
      for (let seed = 1; seed <= 50; seed += 1) {
        const start = performance.now();
        const puzzle = makePuzzle(seed * 104_729, level);
        times.push(performance.now() - start);
        givens.push(givenCount(puzzle.givens));
        if (!solvableBySingles(puzzle.givens)) beyond += 1;
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
      console.log(
        `${level}: mean ${mean.toFixed(1)} ms, median ${times[25]!.toFixed(1)} ms, slowest ${times.at(-1)!.toFixed(1)} ms; givens ${Math.min(...givens)} to ${Math.max(...givens)}; ${beyond} of 50 need more than singles`,
      );
      expect(times.at(-1)).toBeLessThan(5000);
    }
  });
});
