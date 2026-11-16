import { describe, expect, it } from "vitest";
import { mixMaterials } from "./concrete";
import { readLengths } from "./cutting-list";
import { boardsByStock, cuttingPlan, fabricLossWatts, fixingsPerSheet, riseAtPitch, roofPitch, shapeArea, sheetsFor, uValue } from "./formulas";

describe("areas", () => {
  it("are the textbook ones", () => {
    expect(shapeArea("rectangle", 4, 3)).toBe(12);
    expect(shapeArea("triangle", 4, 3)).toBe(6);
    expect(shapeArea("circle", 2)).toBeCloseTo(Math.PI, 9);
    expect(shapeArea("trapezium", 2, 4, 3)).toBe(9);
  });
});

describe("roof pitch", () => {
  it("is 26.57° for 6 in 12, with the slope by Pythagoras", () => {
    const pitch = roofPitch(1.5, 3);
    expect(pitch.degrees).toBeCloseTo(26.565, 3);
    expect(pitch.inTwelve).toBeCloseTo(6, 9);
    expect(pitch.slopeLength).toBeCloseTo(Math.sqrt(11.25), 9);
    expect(riseAtPitch(45, 2)).toBeCloseTo(2, 9);
  });
});

describe("the cutting list", () => {
  it("reads a list as people write one", () => {
    expect(readLengths("1.2 x 2\n0.6×1, 2.4", (v) => v)).toEqual({ ok: true, lengths: [1.2, 1.2, 0.6, 2.4] });
    expect(readLengths("1.2 m", (v) => v).ok).toBe(false);
    expect(readLengths("", (v) => v).ok).toBe(false);
  });

  it("packs longest first into the first board with room, allowing a kerf for each cut", () => {
    const plan = cuttingPlan([1.8, 1.8, 0.6, 0.6], [2.4], 0.003);
    // 2.4 − 1.8 − one 3 mm cut leaves 0.597: a 0.6 no longer fits beside a 1.8.
    expect(plan.boards.map((board) => board.pieces)).toEqual([[1.8], [1.8], [0.6, 0.6]]);
    expect(cuttingPlan([1.8, 0.6], [2.4], 0).boards).toHaveLength(1);
  });

  it("needs no kerf after the last piece of a board", () => {
    const plan = cuttingPlan([1.2, 1.2], [2.4], 0.003);
    expect(plan.boards).toHaveLength(2);
    const exact = cuttingPlan([2.4], [2.4], 0.003);
    expect(exact.boards[0]!.offcut).toBe(0);
  });

  it("starts a board of the shortest stock that fits, and names pieces no stock can give", () => {
    const plan = cuttingPlan([3.2, 1.0, 5.0], [2.4, 3.6], 0.003);
    expect(plan.tooLong).toEqual([5.0]);
    // 3.6 − 3.2 − a cut leaves 0.397, too short for the 1.0, which goes on a new board of the shortest stock: 2.4.
    expect(boardsByStock(plan)).toEqual([
      { stock: 2.4, count: 1 },
      { stock: 3.6, count: 1 },
    ]);
  });
});

describe("U-value", () => {
  it("is 1 ÷ (Rsi + Σ d/λ + Rse), with BS EN ISO 6946's surface resistances", () => {
    const u = uValue([{ thickness: 0.1, conductivity: 0.022 }], "horizontal");
    expect(u).toBeCloseTo(1 / (0.13 + 0.1 / 0.022 + 0.04), 9);
    expect(uValue([{ thickness: 0.1, conductivity: 0.022 }], "upwards")).toBeCloseTo(1 / (0.1 + 0.1 / 0.022 + 0.04), 9);
  });

  it("agrees with Knauf's published R-value for Loft Roll 44 at 100 mm (2.25 m²K/W, rounded down)", () => {
    expect(Math.floor((0.1 / 0.044) * 20) / 20).toBe(2.25);
  });

  it("gives heat loss as U × A × ΔT", () => {
    expect(fabricLossWatts(0.3, 20, 22)).toBeCloseTo(132, 9);
  });
});

describe("sheets and fixings", () => {
  it("round sheets up after the allowance", () => {
    expect(sheetsFor(24, 1.2 * 2.4, 10)).toBe(10);
    expect(sheetsFor(2.88, 2.88, 0)).toBe(1);
  });

  it("put a row of fixings at each edge and at each spacing", () => {
    expect(fixingsPerSheet(1.2, 2.4, 0.6, 0.3)).toBe(3 * 9);
  });
});

describe("concrete", () => {
  it("shares the loose volume in the mix's proportions", () => {
    const [cement, sand, stone] = mixMaterials(1, 0, 1.5, [1, 2, 3]);
    expect(cement).toBeCloseTo(0.25, 9);
    expect(sand).toBeCloseTo(0.5, 9);
    expect(stone).toBeCloseTo(0.75, 9);
  });
});
