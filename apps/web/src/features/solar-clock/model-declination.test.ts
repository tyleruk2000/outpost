import { northsAt } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { modelDeclination } from "./model-declination";

describe("the declination offered to the bearing method", () => {
  it("is the World Magnetic Model's for the place at noon on the date, to a tenth of a degree", () => {
    const keswick = { lat: 54.6, lon: -3.13 };
    const figure = modelDeclination(keswick, "2026-11-17")!;
    expect(figure).toBeCloseTo(northsAt(keswick.lat, keswick.lon, Date.UTC(2026, 10, 17, 12)).declination, 1);
    expect(Number.isInteger(figure * 10 + 1e-9) || Math.abs(figure * 10 - Math.round(figure * 10)) < 1e-9).toBe(true);
    // Anchorage lies well east, about 13° in 2026: the sign is the field's (east positive).
    expect(modelDeclination({ lat: 61.2, lon: -149.9 }, "2026-11-17")!).toBeGreaterThan(10);
  });

  it("is not offered without a place or a date", () => {
    expect(modelDeclination(null, "2026-11-17")).toBeNull();
    expect(modelDeclination({ lat: 51.5, lon: 0 }, null)).toBeNull();
  });
});
