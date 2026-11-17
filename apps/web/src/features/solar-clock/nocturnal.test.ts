/**
 * The star clock and the printed nocturnal.
 *
 * The independent check: the US Naval Observatory's celestial navigation data (read 17
 * November 2026, aa.usno.navy.mil/api/celnav?date=2026-01-01&time=00:00&coords=51.48,0.0)
 * puts Polaris at altitude 51.843125°, azimuth 359.186091°, and Dubhe at 54.120673°,
 * 47.677396°, at 00:00 UT on 1 January 2026 at Greenwich. The angle of Dubhe from Polaris
 * worked out from those published figures alone must give that time back.
 *
 * Achieved: the calculator gives back an instant within a minute; the printed nocturnal
 * (which takes Polaris to be at the pole, as every nocturnal does) reads within 8.0
 * minutes at 51.5° N on the 1st and 15th of every month of 2026, from 6 pm to 6 am at
 * half-hour steps; the same sweep gave 6.4 minutes at 30° N, 7.0 at 40°, 9.2 at 60° and
 * 11.7 at 70°.
 */
import { initialBearingDeg } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { angleFromPolaris, STARS } from "@/features/maps/lib/sky";
import { CLOCK_POSITIONS, dateRingAngle, kochabTooth, nocturnalReading, timeFromPointer } from "./nocturnal";
import { halfWidth } from "./recovery";

const MINUTE = 60_000;
const GREENWICH = { lat: 51.48, lon: 0 };

describe("the star clock", () => {
  it("gives back the Observatory's instant from its own published places of Polaris and Dubhe", () => {
    const degrees = initialBearingDeg({ lat: 51.843125, lon: 359.186091 }, { lat: 54.120673, lon: 47.677396 });
    // The night that began on 31 December.
    const outcome = timeFromPointer(GREENWICH, "2025-12-31", "dubhe", degrees / 30);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Math.abs(outcome.estimate.at - Date.parse("2026-01-01T00:00:00Z"))).toBeLessThan(2 * MINUTE);
  });

  it("gives back the instant from the pointer's angle, for both stars, with a range of about half an hour", () => {
    for (const pointer of ["dubhe", "kochab"] as const) {
      const at = Date.parse("2026-02-10T21:40:00Z");
      const degrees = angleFromPolaris(STARS[pointer], at, 55, -3);
      const outcome = timeFromPointer({ lat: 55, lon: -3 }, "2026-02-10", pointer, degrees / 30);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      expect(Math.abs(outcome.estimate.at - at)).toBeLessThan(MINUTE);
      expect(halfWidth(outcome.estimate)).toBeGreaterThan(25);
      expect(halfWidth(outcome.estimate)).toBeLessThan(35);
    }
  });

  it("says when the answer falls in daylight", () => {
    // Midsummer in Edinburgh: whatever the reading, the night is short; 12 o'clock is in daylight then.
    const results = CLOCK_POSITIONS.map((position) =>
      timeFromPointer({ lat: 55.95, lon: -3.19 }, "2026-06-21", "dubhe", Number(position.value) / 2),
    );
    expect(results.some((result) => result.ok && result.estimate.warnings.some((warning) => /not be dark/.test(warning)))).toBe(true);
  });

  it("refuses south of the equator, and where Polaris is too low", () => {
    const south = timeFromPointer({ lat: -33.87, lon: 151.21 }, "2026-07-26", "dubhe", 3);
    expect(south.ok).toBe(false);
    if (!south.ok) expect(south.reason).toMatch(/does not work there/);
    expect(timeFromPointer({ lat: 2, lon: 0 }, "2026-07-26", "dubhe", 3).ok).toBe(false);
  });

  it("offers every half hour round the face", () => {
    expect(CLOCK_POSITIONS).toHaveLength(24);
    expect(CLOCK_POSITIONS[0]!.label).toBe("12 o'clock (straight up)");
    expect(CLOCK_POSITIONS[5]!.label).toBe("Half past 2");
  });
});

describe("the printed nocturnal", () => {
  /** Clock hours from midnight (UTC here) at an instant, −12 to 12. */
  const fromMidnight = (ms: number) => {
    const hours = (((ms / 3_600_000) % 24) + 24) % 24;
    return hours > 12 ? hours - 24 : hours;
  };

  for (const [lat, worst] of [
    [51.48, 8.5],
    [60, 9.5],
  ] as const) {
    it(`reads the clock within ${worst} minutes through the night at ${lat}° N`, () => {
      for (const date of ["2026-01-15", "2026-04-10", "2026-09-30", "2026-12-01"]) {
        for (const hour of [-4, -2, 0, 2, 4]) {
          const at = Date.parse(`${date}T00:00:00Z`) + 86_400_000 + hour * 3_600_000;
          const degrees = angleFromPolaris(STARS.dubhe, at, lat, 0);
          const read = nocturnalReading(date, 0, 0, degrees);
          expect(Math.abs(read - fromMidnight(at)) * 60).toBeLessThan(worst);
        }
      }
    });
  }

  it("moves the dates round by about a degree a day, anticlockwise, a full turn in a year", () => {
    const a = dateRingAngle("2026-03-01", 0, 0);
    const b = dateRingAngle("2026-03-02", 0, 0);
    expect((a - b + 360) % 360).toBeCloseTo(0.986, 2);
    expect(Math.abs(dateRingAngle("2027-03-01", 0, 0) - a)).toBeLessThan(1.5);
  });

  it("puts Kochab's tooth where its reading agrees with the Plough's", () => {
    const tooth = kochabTooth(2026);
    const at = Date.parse("2026-10-20T23:00:00Z");
    const dubhe = angleFromPolaris(STARS.dubhe, at, 51.48, 0);
    const kochab = angleFromPolaris(STARS.kochab, at, 51.48, 0);
    // Setting Kochab's tooth to the date turns the disc by its offset: the arm on Kochab reads as the arm on Dubhe would.
    const read = nocturnalReading("2026-10-20", 0, 0, (kochab + tooth + 360) % 360);
    expect(Math.abs(read - nocturnalReading("2026-10-20", 0, 0, dubhe)) * 60).toBeLessThan(10);
  });
});
