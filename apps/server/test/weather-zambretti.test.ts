/** The Zambretti forecaster's tables, as read off the instrument by Meteormetrics (tables 1a to 1c). */
import { ZAMBRETTI_SERIES, zambretti, zambrettiOtherTrend, zambrettiSeason, zambrettiTrend } from "@outpost/shared";
import { describe, expect, it } from "vitest";

describe("the Zambretti forecast", () => {
  it("gives the letter the paper lists at each pressure of each series", () => {
    for (const [trend, series] of Object.entries(ZAMBRETTI_SERIES)) {
      for (const [letter, hpa] of series) expect(zambretti(hpa, trend as "steady").letter).toBe(letter);
    }
  });

  it("reads the paper's own observation: N at 1000 hPa and steady", () => {
    expect(zambretti(1000, "steady")).toMatchObject({ letter: "N", words: "Showery, bright intervals", outsideScale: null });
  });

  it("takes the nearest listed pressure, and says when the reading is off the dial's scale", () => {
    expect(zambretti(1015.9, "falling").letter).toBe("H");
    expect(zambretti(1013.9, "falling").letter).toBe("O");
    expect(zambretti(1062, "rising")).toMatchObject({ letter: "A", outsideScale: "above" });
    expect(zambretti(940, "falling")).toMatchObject({ letter: "X", outsideScale: "below" });
  });

  it("names what a northerly or southerly wind could move it to, and nothing for a westerly", () => {
    expect(zambretti(1000, "steady", "N").wind).toEqual({
      direction: "northerly",
      letters: [{ letter: "K", words: "Fairly fine, showers likely" }],
    });
    expect(zambretti(1000, "steady", "SSW").wind?.letters.map((entry) => entry.letter)).toEqual(["P", "S"]);
    expect(zambretti(1000, "steady", "W").wind).toBeNull();
    expect(zambretti(1033, "steady", "N").wind).toBeNull();
  });

  it("reads under 1.6 hPa in three hours as steady, and says what else it could be read as", () => {
    expect(zambrettiTrend(1.5)).toBe("steady");
    expect(zambrettiTrend(-1.6)).toBe("falling");
    expect(zambrettiTrend(3.2)).toBe("rising");
    expect(zambrettiOtherTrend(1.2)).toBe("rising");
    expect(zambrettiOtherTrend(0)).toBeNull();
    expect(zambrettiOtherTrend(-2)).toBeNull();
  });

  it("calls April to September summer, as the dial's directions do", () => {
    expect([2, 3, 8, 9].map(zambrettiSeason)).toEqual(["winter", "summer", "summer", "winter"]);
  });
});
