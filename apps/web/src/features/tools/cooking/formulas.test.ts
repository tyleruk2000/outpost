import { describe, expect, it } from "vitest";
import { boilingPointAtHeight, readQuantity, scaleRecipe, standardPressurePa } from "./formulas";
import { nearestGasMark, roastGuide } from "./safety";

describe("boiling at altitude", () => {
  it("is 100 °C at sea level in the standard atmosphere", () => {
    expect(standardPressurePa(0)).toBe(101_325);
    expect(boilingPointAtHeight(0)).toBeCloseTo(100, 1);
  });

  it("agrees with the CDC: about 83 °C at about 4,900 m", () => {
    expect(Math.round(boilingPointAtHeight(4900))).toBeGreaterThanOrEqual(83);
    expect(Math.round(boilingPointAtHeight(4900))).toBeLessThanOrEqual(84);
  });

  it("stays inside the Antoine coefficients' range up to the screen's limit", () => {
    expect(boilingPointAtHeight(8000)).toBeGreaterThan(71);
  });
});

describe("roasting times", () => {
  it("follow the FSA's weight bands for turkey", () => {
    expect(roastGuide("turkey", 4).minutes).toBe(45 * 4 + 20);
    expect(roastGuide("turkey", 5).minutes).toBe(200);
    expect(roastGuide("turkey", 8).minutes).toBe(280);
  });

  it("and its figures for chicken, goose and duck", () => {
    expect(roastGuide("chicken", 2).minutes).toBe(110);
    expect(roastGuide("goose", 4).minutes).toBe(140);
    expect(roastGuide("duck", 2).minutes).toBe(90);
  });
});

describe("gas marks", () => {
  it("are read from the table", () => {
    expect(nearestGasMark(180)?.mark).toBe(4);
    expect(nearestGasMark(200)?.mark).toBe(6);
    expect(nearestGasMark(100)).toBeNull();
  });
});

describe("scaling a recipe", () => {
  it("reads quantities as recipes write them", () => {
    expect(readQuantity("1/2")).toBe(0.5);
    expect(readQuantity("1 1/2")).toBe(1.5);
    expect(readQuantity("1½")).toBe(1.5);
    expect(readQuantity("200")).toBe(200);
    expect(readQuantity("a pinch")).toBeNull();
    // A fraction over nothing is not an amount, and is left as it is rather than scaled to "Infinity".
    expect(readQuantity("1/0")).toBeNull();
    expect(scaleRecipe("1/0 egg", 2)).toEqual([{ line: "1/0 egg", scaled: false }]);
  });

  it("scales the amount at the start of each line and leaves the rest", () => {
    expect(scaleRecipe("500 g beef\n1 onion\nSalt to taste\n1/2 tsp cumin", 1.5)).toEqual([
      { line: "750 g beef", scaled: true },
      { line: "1.5 onion", scaled: true },
      { line: "Salt to taste", scaled: false },
      { line: "0.75 tsp cumin", scaled: true },
    ]);
  });
});
