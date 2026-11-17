/**
 * The horizontal sundial, held to a published table: Keith Gibbs, schoolphysics, "Making
 * a horizontal sundial" (www.schoolphysics.co.uk/age14-16/Astronomy/text/Sundial_/,
 * read 17 November 2026), which tabulates A = tan⁻¹[sin L × tan H] to a tenth of a
 * degree for latitudes 50° to 55°. Achieved: every figure within 0.06°. The five that
 * differ by more than 0.05° are the table cutting a figure short rather than rounding it:
 * 23.859° (50°, 2 hours) is printed 23.8, likewise 37.454° (50°, 3 h), 37.852° (51°, 3 h),
 * 24.754° (53°, 2 h) and 71.453° (53°, 5 h).
 */
import { describe, expect, it } from "vitest";
import { solarPosition } from "@/features/maps/lib/sun";
import { dialFit, dialHalfSpan, hourLineAngle, hourLines, signedMinutes, sundialToClock, tableDates } from "./sundial";

// schoolphysics, "Making a horizontal sundial": hours from noon 1 to 6 at each latitude.
const TABLE: Record<number, number[]> = {
  50: [11.6, 23.8, 37.4, 53.0, 70.7, 90.0],
  51: [11.8, 24.2, 37.8, 53.4, 71.0, 90.0],
  52: [11.9, 24.5, 38.2, 53.8, 71.2, 90.0],
  53: [12.1, 24.7, 38.6, 54.1, 71.4, 90.0],
  55: [12.4, 25.3, 39.3, 54.8, 71.9, 90.0],
};

describe("hour lines", () => {
  for (const [lat, angles] of Object.entries(TABLE)) {
    it(`match the published table at ${lat}° to within 0.06°`, () => {
      angles.forEach((angle, index) => {
        expect(Math.abs(hourLineAngle(Number(lat), index + 1) - angle)).toBeLessThan(0.06);
        // Morning lines mirror the afternoon's.
        expect(hourLineAngle(Number(lat), -(index + 1))).toBeCloseTo(-hourLineAngle(Number(lat), index + 1), 9);
      });
    });
  }

  it("run back past the east–west line for hours more than six from noon", () => {
    expect(hourLineAngle(51.5, 7)).toBeGreaterThan(90);
    expect(hourLineAngle(51.5, -7)).toBeLessThan(-90);
  });

  it("are 15° apart at the pole and all on the noon line at the equator", () => {
    expect(hourLineAngle(90, 3)).toBeCloseTo(45, 6);
    expect(hourLineAngle(0, 3)).toBeCloseTo(0, 6);
    expect(hourLineAngle(-51, 3)).toBeCloseTo(hourLineAngle(51, 3), 9);
  });

  it("cover the longest day, from 6 to 6 at least and 4 to 8 at most", () => {
    expect(dialHalfSpan(0)).toBe(6);
    expect(dialHalfSpan(51.5)).toBe(8);
    expect(dialHalfSpan(85)).toBe(8);
    expect(hourLines(40).map((line) => line.hour)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it("say where a horizontal dial is practical", () => {
    expect(dialFit(0.5)).toBe("none");
    expect(dialFit(10)).toBe("poor");
    expect(dialFit(51.5)).toBe("good");
    expect(dialFit(-35)).toBe("good");
    expect(dialFit(78)).toBe("polar");
  });
});

describe("clock time from the sundial", () => {
  it("is the dial less the equation of time, with four minutes for each degree from the zone's meridian", () => {
    // Greenwich on 3 November, when the sundial runs about 16½ minutes ahead of the clock.
    expect(sundialToClock("2026-11-03", 0, 0)).toBeCloseTo(-solarPosition(Date.parse("2026-11-03T12:00:00Z")).equationOfTime, 1);
    expect(sundialToClock("2026-11-03", 0, 0)).toBeLessThan(-16);
    // A degree west of Greenwich on the same clock: four minutes later.
    expect(sundialToClock("2026-11-03", -1, 0) - sundialToClock("2026-11-03", 0, 0)).toBeCloseTo(4, 1);
    // Central European Time at Greenwich's longitude: an hour more.
    expect(sundialToClock("2026-11-03", 0, 60) - sundialToClock("2026-11-03", 0, 0)).toBeCloseTo(60, 1);
  });

  it("is tabulated for the 1st and 15th of each month, in whole minutes", () => {
    expect(tableDates(2027)).toHaveLength(24);
    expect(tableDates(2027)[0]).toBe("2027-01-01");
    expect(signedMinutes(-14.4)).toBe("−14 min");
    expect(signedMinutes(4.6)).toBe("+5 min");
    expect(signedMinutes(0.2)).toBe("0 min");
  });
});
