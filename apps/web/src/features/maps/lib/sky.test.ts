/**
 * Sidereal time and the stars held to the US Naval Observatory, read 17 November 2026:
 *
 * - "Sidereal Time" (aa.usno.navy.mil/api/siderealtime?date=2026-11-17&time=10:00:00&coords=51.48,0.0):
 *   Greenwich mean sidereal time 13:45:54.8849 at 10:00 UT1. Achieved: within a second.
 * - "Celestial Navigation Data" (aa.usno.navy.mil/api/celnav?date=…&time=00:00&coords=51.48,0.0):
 *   the computed altitude and true azimuth of Polaris, Dubhe and Kochab at 00:00 UT on
 *   1 January 2026 and 2036 (2036 lies between the two years the places are taken from).
 *   Achieved: within 0.02°.
 */
import { describe, expect, it } from "vitest";
import { angleFromPolaris, greenwichSiderealHours, localSiderealHours, STARS, starAt } from "./sky";

const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("sidereal time", () => {
  it("matches the Observatory's Greenwich mean sidereal time", () => {
    const hours = greenwichSiderealHours(Date.parse("2026-11-17T10:00:00Z"));
    const published = 13 + 45 / 60 + 54.8849 / 3600;
    expect(Math.abs(hours - published) * 3600).toBeLessThan(1);
  });

  it("is an hour later for every 15° east", () => {
    const ms = Date.parse("2026-11-17T10:00:00Z");
    expect(localSiderealHours(ms, 15) - greenwichSiderealHours(ms)).toBeCloseTo(1, 6);
    expect(localSiderealHours(ms, -180)).toBeGreaterThanOrEqual(0);
  });

  it("gains a sidereal day on the sun once a year: about 3 min 56 s a day", () => {
    const one = greenwichSiderealHours(Date.parse("2026-03-01T00:00:00Z"));
    const next = greenwichSiderealHours(Date.parse("2026-03-02T00:00:00Z"));
    expect((((next - one + 24) % 24) * 3600) / 60).toBeCloseTo(3.943, 2);
  });
});

// USNO celnav, read 17 November 2026: [star, Hc, Zn] at 00:00 UT, 51.48° N 0° E.
const SEEN: Array<[string, keyof typeof STARS, number, number]> = [
  ["2026-01-01T00:00Z", "polaris", 51.843125, 359.186091],
  ["2026-01-01T00:00Z", "dubhe", 54.120673, 47.677396],
  ["2026-01-01T00:00Z", "kochab", 41.415772, 18.113982],
  ["2036-01-01T00:00Z", "polaris", 51.862737, 359.276398],
  ["2036-01-01T00:00Z", "dubhe", 53.850009, 47.65122],
  ["2036-01-01T00:00Z", "kochab", 41.311706, 18.042889],
];

describe("the stars a nocturnal is read by", () => {
  for (const [at, id, hc, zn] of SEEN) {
    it(`puts ${STARS[id].name} where the Observatory does on ${at.slice(0, 10)}`, () => {
      const seen = starAt(STARS[id], Date.parse(at), 51.48, 0);
      expect(Math.abs(seen.altitude - hc)).toBeLessThan(0.02);
      expect(angleBetween(seen.azimuth, zn)).toBeLessThan(0.02);
    });
  }

  it("turns the pointer anticlockwise round Polaris, once in a sidereal day", () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const a = angleFromPolaris(STARS.dubhe, start, 51.48, 0);
    const b = angleFromPolaris(STARS.dubhe, start + 3_600_000, 51.48, 0);
    // Anticlockwise: the clockwise angle falls, by about 15° an hour.
    expect(((a - b + 360) % 360) - 15).toBeLessThan(1);
    expect(((a - b + 360) % 360) - 15).toBeGreaterThan(-1);
    const sidereal = 86_164_091;
    expect(angleBetween(angleFromPolaris(STARS.dubhe, start + sidereal, 51.48, 0), a)).toBeLessThan(0.1);
  });

  it("puts the pointer straight up from Polaris when Dubhe is on the meridian above the pole", () => {
    // Dubhe is above the pole when the local sidereal time equals its right ascension.
    const start = Date.parse("2026-03-10T00:00:00Z");
    let at = start;
    for (let step = 0; step < 24 * 60; step += 1) {
      const ms = start + step * 60_000;
      if (Math.abs(localSiderealHours(ms, 0) - 11.0905) < 0.02) {
        at = ms;
        break;
      }
    }
    // Within a degree or so: Polaris is not quite at the pole.
    expect(angleBetween(angleFromPolaris(STARS.dubhe, at, 51.48, 0), 0)).toBeLessThan(1.5);
  });
});
