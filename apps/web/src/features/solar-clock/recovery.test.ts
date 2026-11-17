/**
 * Clock recovery. Each method is run backwards from a known instant (the sun placed by
 * sun.ts, which sun.test.ts and sun-at.test.ts hold to the US Naval Observatory) and must
 * give that instant back; its range must widen where the method is weak. The published
 * figures used directly are the Observatory's, read 17 November 2026 from "Complete Sun
 * and Moon Data for One Day" (aa.usno.navy.mil/api/rstt/oneday?date=2026-11-17&coords=51.48,0.0&tz=0):
 * at Greenwich on 17 November 2026, sunrise 07:21, upper transit (solar noon) 11:45 and
 * sunset 16:08 UT.
 */
import { describe, expect, it } from "vitest";
import { sunAt, sunDay } from "@/features/maps/lib/sun";
import {
  clockError,
  dateShift,
  halfWidth,
  halfwayReading,
  horizonDip,
  noonByEqualShadows,
  noonByShortestShadow,
  shadowLength,
  timeFromSeaHorizon,
  timeFromShadowBearing,
  timeFromShadowLength,
} from "./recovery";

const MINUTE = 60_000;
const GREENWICH = { lat: 51.48, lon: 0 };
const DATE = "2026-11-17";
const utc = (time: string) => Date.parse(`${DATE}T${time}:00Z`);

function estimate(outcome: ReturnType<typeof noonByShortestShadow>) {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.estimate;
}

describe("noon by the shortest shadow", () => {
  it("is the Observatory's solar noon, with a range of minutes", () => {
    const result = estimate(noonByShortestShadow(GREENWICH, DATE, 1, 0.005));
    // USNO: upper transit 11:45 UT.
    expect(Math.abs(result.at - utc("11:45"))).toBeLessThan(MINUTE);
    expect(halfWidth(result)).toBeGreaterThan(5);
    expect(halfWidth(result)).toBeLessThan(30);
  });

  it("is worse, not better, with a shorter stick or a coarser mark", () => {
    const fine = halfWidth(estimate(noonByShortestShadow(GREENWICH, DATE, 2, 0.002)));
    const coarse = halfWidth(estimate(noonByShortestShadow(GREENWICH, DATE, 0.5, 0.01)));
    expect(coarse).toBeGreaterThan(fine * 2);
  });

  it("refuses in the polar night, and works on the equator and with the sun overhead", () => {
    const tromso = noonByShortestShadow({ lat: 69.65, lon: 18.96 }, "2026-12-21", 1, 0.005);
    expect(tromso.ok).toBe(false);
    if (!tromso.ok) expect(tromso.reason).toMatch(/polar night/);
    expect(noonByShortestShadow({ lat: 90, lon: 0 }, "2026-12-21", 1, 0.005).ok).toBe(false);
    expect(noonByShortestShadow({ lat: 0, lon: -78.5 }, "2026-03-20", 1, 0.005).ok).toBe(true);
  });
});

describe("noon by two equal shadows", () => {
  it("puts the halfway moment within a minute of solar noon, closer than the shortest shadow can", () => {
    const equal = estimate(noonByEqualShadows(GREENWICH, DATE, 1, 4, 0.005));
    const shortest = estimate(noonByShortestShadow(GREENWICH, DATE, 1, 0.005));
    expect(Math.abs(equal.at - sunDay(51.48, 0, DATE).noon)).toBeLessThan(MINUTE);
    expect(halfWidth(equal)).toBeLessThan(halfWidth(shortest));
  });

  it("widens as the circle comes in towards the noon shadow", () => {
    // The noon shadow of a 1 m stick at Greenwich on 17 November is about 2.8 m.
    const wide = halfWidth(estimate(noonByEqualShadows(GREENWICH, DATE, 1, 5, 0.02)));
    const tight = halfWidth(estimate(noonByEqualShadows(GREENWICH, DATE, 1, 2.85, 0.02)));
    expect(tight).toBeGreaterThan(wide);
  });

  it("refuses a circle inside the shortest shadow", () => {
    const outcome = noonByEqualShadows(GREENWICH, DATE, 1, 2, 0.005);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/wider than the shortest shadow/);
  });

  it("turns two readings of a wrong clock into how far it is out", () => {
    expect(halfwayReading(10 * 60, 14 * 60)).toBe(12 * 60);
    expect(halfwayReading(23 * 60, 1 * 60)).toBe(0);
    expect(clockError(11 * 60 + 45, 12 * 60 + 10)).toBe(-25);
    expect(clockError(30, 23 * 60 + 50)).toBe(40);
  });
});

describe("the time from a shadow's length", () => {
  const backFrom = (time: string, half: "morning" | "afternoon", error = 0.005) => {
    const sun = sunAt(utc(time), 51.48, 0);
    return estimate(timeFromShadowLength(GREENWICH, DATE, 1, shadowLength(1, sun.apparentAltitude), half, error));
  };

  it("gives back the instant the shadow was that long", () => {
    expect(Math.abs(backFrom("09:15", "morning").at - utc("09:15"))).toBeLessThan(MINUTE);
    expect(Math.abs(backFrom("14:30", "afternoon").at - utc("14:30"))).toBeLessThan(MINUTE);
  });

  it("is good well away from noon and poor near it, and says so", () => {
    const away = backFrom("08:45", "morning");
    const near = backFrom("11:20", "morning");
    expect(halfWidth(near)).toBeGreaterThan(halfWidth(away) * 2);
    expect(near.warnings.join(" ")).toMatch(/too near noon/);
    expect(away.warnings).toEqual([]);
  });

  it("widens with the marking error", () => {
    expect(halfWidth(backFrom("09:15", "morning", 0.02))).toBeGreaterThan(halfWidth(backFrom("09:15", "morning", 0.002)));
  });

  it("refuses a shadow shorter than the sun can make that day", () => {
    const outcome = timeFromShadowLength(GREENWICH, DATE, 1, 0.5, "morning", 0.005);
    expect(outcome.ok).toBe(false);
  });
});

describe("the time from a shadow's bearing", () => {
  const shadowBearingAt = (time: string) => (sunAt(utc(time), 51.48, 0).azimuth + 180) % 360;

  it("gives back the instant, with a true bearing", () => {
    const result = estimate(timeFromShadowBearing(GREENWICH, DATE, shadowBearingAt("10:00"), 0, 2));
    expect(Math.abs(result.at - utc("10:00"))).toBeLessThan(MINUTE);
    expect(result.warnings).toEqual([]);
  });

  it("applies a magnetic declination, east positive", () => {
    // A compass in a place with 3° east declination reads 3° less than the true bearing.
    const result = estimate(timeFromShadowBearing(GREENWICH, DATE, shadowBearingAt("13:00") - 3, 3, 2));
    expect(Math.abs(result.at - utc("13:00"))).toBeLessThan(MINUTE);
  });

  it("says when the declination is not known", () => {
    const result = estimate(timeFromShadowBearing(GREENWICH, DATE, shadowBearingAt("10:00"), null, 2));
    expect(result.warnings.join(" ")).toMatch(/unknown amount/);
  });

  it("widens with the compass error, and refuses a bearing the sun never has that day", () => {
    const fine = halfWidth(estimate(timeFromShadowBearing(GREENWICH, DATE, shadowBearingAt("10:00"), 0, 1)));
    const rough = halfWidth(estimate(timeFromShadowBearing(GREENWICH, DATE, shadowBearingAt("10:00"), 0, 5)));
    expect(rough).toBeGreaterThan(fine * 3);
    // A shadow pointing south means the sun is in the north: never, in November at 51° N.
    expect(timeFromShadowBearing(GREENWICH, DATE, 180, 0, 2).ok).toBe(false);
  });
});

describe("sunrise and sunset on a sea horizon", () => {
  it("is the Observatory's sunrise and sunset for an eye at the water", () => {
    const rise = estimate(timeFromSeaHorizon(GREENWICH, DATE, "rise", 0));
    const set = estimate(timeFromSeaHorizon(GREENWICH, DATE, "set", 0));
    // USNO: rise 07:21, set 16:08 UT, to the minute.
    expect(Math.abs(rise.at - utc("07:21"))).toBeLessThan(MINUTE);
    expect(Math.abs(set.at - utc("16:08"))).toBeLessThan(MINUTE);
    expect(rise.warnings.join(" ")).toMatch(/rough check/);
  });

  it("comes earlier for an eye higher above the sea, by the dip of the horizon", () => {
    // Bowditch: 1.76′ √h; at 10 m, 5.6′.
    expect(horizonDip(10) * 60).toBeCloseTo(5.57, 2);
    const low = estimate(timeFromSeaHorizon(GREENWICH, DATE, "rise", 0));
    const high = estimate(timeFromSeaHorizon(GREENWICH, DATE, "rise", 10));
    expect(high.at).toBeLessThan(low.at);
  });

  it("is a wider range far north, where the sun rises at a shallow slant", () => {
    const here = halfWidth(estimate(timeFromSeaHorizon(GREENWICH, DATE, "rise", 2)));
    const north = halfWidth(estimate(timeFromSeaHorizon({ lat: 66, lon: 0 }, DATE, "rise", 2)));
    expect(north).toBeGreaterThan(here * 1.5);
  });

  it("refuses under the midnight sun and in the polar night", () => {
    expect(timeFromSeaHorizon({ lat: 78.22, lon: 15.65 }, "2026-06-21", "set", 2).ok).toBe(false);
    expect(timeFromSeaHorizon({ lat: 78.22, lon: 15.65 }, "2026-12-21", "rise", 2).ok).toBe(false);
  });
});

describe("a date not known exactly", () => {
  it("matters little for noon and much more for the sun's height", () => {
    const noon = dateShift((date) => noonByShortestShadow(GREENWICH, date, 1, 0.005), DATE);
    const length = dateShift((date) => timeFromShadowLength(GREENWICH, date, 1, 3.6, "morning", 0.005), DATE);
    const noonWeek = noon.find((row) => row.days === 7)!.minutes!;
    const lengthWeek = length.find((row) => row.days === 7)!.minutes!;
    // The equation of time moves noon by a few minutes in a week at most.
    expect(noonWeek).toBeLessThan(3);
    expect(lengthWeek).toBeGreaterThan(noonWeek * 3);
  });
});
