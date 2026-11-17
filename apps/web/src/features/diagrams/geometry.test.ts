import { describe, expect, it } from "vitest";
import { arcPath, aroundGroup, type Box, exaggeration, heading, labelBox, overlaps, placeLabel, polar } from "./geometry";

describe("the diagrams' arithmetic", () => {
  it("measures angles clockwise from straight up, on a screen whose y grows downwards", () => {
    const [x, y] = polar(100, 100, 10, 90);
    expect(x).toBeCloseTo(110);
    expect(y).toBeCloseTo(100);
    expect(polar(0, 0, 10, 0)[1]).toBeCloseTo(-10);
    expect(heading([0, 0], [0, -5])).toBeCloseTo(0);
    expect(heading([0, 0], [-5, 0])).toBeCloseTo(270);
  });

  it("draws an arc the short way, or clockwise however far when asked (a bearing of 330°)", () => {
    // Flags: large-arc then sweep.
    expect(arcPath(0, 0, 10, 0, 330)).toMatch(/A10,10 0 0 0 /);
    expect(arcPath(0, 0, 10, 0, 330, true)).toMatch(/A10,10 0 1 1 /);
    expect(arcPath(0, 0, 10, 0, 90)).toMatch(/A10,10 0 0 1 /);
  });

  it("enlarges small angles by a whole, stated factor, and leaves large ones alone", () => {
    expect(exaggeration([0.9, 0.1], 10, 32)).toBe(10);
    expect(exaggeration([3], 10, 32)).toBe(5);
    expect(exaggeration([15], 10, 32)).toBe(1);
    expect(exaggeration([8], 10, 32)).toBe(2);
  });

  it("places labels so that none overlaps another or leaves the plate", () => {
    const taken: Box[] = [];
    const bounds = { width: 200, height: 100 };
    const names = ["Dubhe", "Merak", "Phecda", "Megrez"];
    const placed = names.map((name) => placeLabel([100, 50], name, 14, taken, bounds));
    const boxes = placed.filter((each) => each !== null).map((each) => each!.box);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(200);
    }
    // With no room left, a label is left out rather than drawn over another.
    const full: Box[] = [{ x: 0, y: 0, width: 200, height: 100 }];
    expect(placeLabel([100, 50], "Alkaid", 14, full, bounds)).toBeNull();
  });

  it("offers places round a group of points below it first", () => {
    const [first] = aroundGroup(
      [
        [10, 10],
        [30, 40],
      ],
      14,
    );
    expect(first![1]).toBeGreaterThan(40);
    expect(labelBox(0, 0, "abc", 10, "end").x).toBeLessThan(0);
  });
});
