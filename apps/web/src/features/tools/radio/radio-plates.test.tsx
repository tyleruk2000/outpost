import { maxSightDistanceMeters } from "@outpost/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { antennaLengths, radioHorizonMeters } from "./formulas";
import { AntennaPlate, HorizonPlate } from "./radio-plates";

describe("the radio calculators' drawings", () => {
  it("marks a dipole's two legs and its length tip to tip as the calculator gives them", () => {
    // 7.1 MHz at 0.95: 299,792,458 ÷ 7.1e6 × 0.5 × 0.95 = 20.06 m, legs of 10.03 m.
    const lengths = antennaLengths("dipole", 7.1, 0.95);
    render(<AntennaPlate kind="dipole" total={lengths.total} leg={lengths.leg} />);
    expect(screen.getByRole("img", { name: /two legs of 10\.03 m either side of the feed point, 20\.06 m tip to tip/ })).toBeTruthy();
    expect(screen.getAllByText("10.03 m")).toHaveLength(2);
  });

  it("draws the two horizons that add up to the calculator's line of sight", () => {
    const a = radioHorizonMeters(10);
    const b = radioHorizonMeters(2);
    expect(a + b).toBeCloseTo(maxSightDistanceMeters(10, 2), 6);
    render(<HorizonPlate heightA={10} heightB={2} horizonA={a} horizonB={b} />);
    // 4.12 √h km: 13.0 km and 5.8 km, 18.9 km in all.
    expect(
      screen.getByRole("img", { name: /13 km for yours, 5\.8 km for the other; together 18\.9 km\. The Earth is drawn far smaller/ }),
    ).toBeTruthy();
    expect(screen.getByText("18.9 km in all")).toBeTruthy();
  });
});
