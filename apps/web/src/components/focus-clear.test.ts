import { describe, expect, it } from "vitest";
import { clearance } from "./focus-clear";

// A phone 844 px tall: the top bar ends at 52, the bar of screens starts at 780.
const BELOW = 52;
const ABOVE = 780;

describe("clearance: how far to scroll so that a focused control is not under a bar", () => {
  it("leaves a control between the bars where it is", () => {
    expect(clearance({ top: 300, bottom: 344 }, BELOW, ABOVE)).toBe(0);
  });

  it("brings a control up from under the bar of screens", () => {
    expect(clearance({ top: 770, bottom: 814 }, BELOW, ABOVE)).toBe(814 - 780 + 8);
  });

  it("brings a control down from under the top bar", () => {
    expect(clearance({ top: 20, bottom: 64 }, BELOW, ABOVE)).toBe(20 - 52 - 8);
  });

  it("never pushes the top of something taller than the room under the top bar", () => {
    expect(clearance({ top: 100, bottom: 1400 }, BELOW, ABOVE)).toBe(100 - 52 - 8);
    expect(clearance({ top: 55, bottom: 1400 }, BELOW, ABOVE)).toBe(0);
  });
});
