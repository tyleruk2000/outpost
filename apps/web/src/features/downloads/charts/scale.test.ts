import { describe, expect, it } from "vitest";
import { bucketReadings, clamp, linearScale, nearestIndex, niceStep, niceTicks } from "./scale";

describe("scales", () => {
  it("maps a domain onto a range in a straight line, in either direction", () => {
    const x = linearScale([0, 600], [40, 340]);
    expect(x(0)).toBe(40);
    expect(x(300)).toBe(190);
    expect(x(600)).toBe(340);
    const y = linearScale([0, 100], [200, 0]);
    expect(y(25)).toBe(150);
  });

  it("puts everything at the start of the range when the domain has no width", () => {
    expect(linearScale([5, 5], [10, 90])(5)).toBe(10);
  });

  it("clamps", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });
});

describe("round axis values", () => {
  it("chooses steps of 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceStep(100, 4)).toBe(25);
    expect(niceStep(520_000, 4)).toBe(200_000);
    expect(niceStep(3, 4)).toBe(1);
    expect(niceStep(0.3, 3)).toBeCloseTo(0.1);
    expect(niceStep(9_000_000, 4)).toBe(2_500_000);
  });

  it("ends the axis on the first tick at or above the highest value", () => {
    expect(niceTicks(520_000)).toEqual({ ticks: [0, 200_000, 400_000, 600_000], max: 600_000 });
    expect(niceTicks(500_000, 2)).toEqual({ ticks: [0, 250_000, 500_000], max: 500_000 });
    expect(niceTicks(1_000_000, 4)).toEqual({ ticks: [0, 250_000, 500_000, 750_000, 1_000_000], max: 1_000_000 });
    expect(niceTicks(0.3, 3).ticks).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it("has a single tick at zero when there is nothing to show", () => {
    expect(niceTicks(0)).toEqual({ ticks: [0], max: 0 });
  });
});

describe("finding the reading under the pointer", () => {
  it("returns the closest entry of a sorted list", () => {
    const times = [10, 20, 30, 40];
    expect(nearestIndex(times, 0)).toBe(0);
    expect(nearestIndex(times, 24)).toBe(1);
    expect(nearestIndex(times, 26)).toBe(2);
    expect(nearestIndex(times, 99)).toBe(3);
    expect(nearestIndex([], 5)).toBe(-1);
    expect(nearestIndex([7], 100)).toBe(0);
  });
});

describe("the table behind a line chart", () => {
  it("averages readings into equal spans of time", () => {
    const readings = [
      { at: 0, value: 100 },
      { at: 5_000, value: 300 },
      { at: 15_000, value: 500 },
      { at: 31_000, value: 50 },
    ];
    expect(bucketReadings(readings, 15)).toEqual([
      { at: 0, value: 200 },
      { at: 15_000, value: 500 },
      { at: 30_000, value: 50 },
    ]);
    expect(bucketReadings([], 15)).toEqual([]);
  });
});
