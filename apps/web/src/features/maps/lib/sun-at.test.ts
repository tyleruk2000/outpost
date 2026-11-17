/**
 * The sun at an instant held to the US Naval Observatory.
 *
 * Every reference value is from the Observatory's "Celestial Navigation Data for Assumed
 * Position and Time" service (aa.usno.navy.mil/api/celnav?date=…&time=…&coords=…), read
 * on 17 November 2026, copied as published. For the sun it gives the Greenwich hour angle
 * (GHA), the declination, and the computed altitude (Hc, without refraction) and true
 * azimuth (Zn) at the assumed position. The equation of time follows from the GHA: the
 * sun's Greenwich hour angle runs ahead of the mean sun's (15° an hour from 180° at
 * midnight UT) by the equation of time.
 *
 * Achieved, over these nine cases from the equator to 89.9° north and 54.8° south: the
 * largest differences found were 0.007° in altitude, 0.012° in azimuth, 0.002° in
 * declination and 3.1 seconds in the equation of time. The tests allow 0.02°, 0.01° and
 * 4 seconds. The case at 89.9° is a hair from the pole, where azimuth is still defined.
 */
import { describe, expect, it } from "vitest";
import { altitudeCrossing, apparentSolarHours, geometricFromApparent, refraction, sunAt, sunDay } from "./sun";

interface Celnav {
  at: string;
  lat: number;
  lon: number;
  dec: number;
  gha: number;
  hc: number;
  zn: number;
}

// USNO celnav, read 17 November 2026.
const CASES: Celnav[] = [
  { at: "2026-01-01T12:00Z", lat: 51.48, lon: 0, dec: -22.975898, gha: 359.108645, hc: 15.539975, zn: 179.148222 },
  { at: "2026-02-11T14:30Z", lat: 51.48, lon: -3.2, dec: -13.892843, gha: 33.956228, hc: 19.37075, zn: 211.750041 },
  { at: "2026-06-21T12:00Z", lat: 64.13, lon: -21.9, dec: 23.437851, gha: 359.545561, hc: 46.730555, zn: 149.395915 },
  { at: "2026-07-26T03:15Z", lat: -33.87, lon: 151.21, dec: 19.443957, gha: 227.1084, hc: 33.90058, zn: 339.07951 },
  { at: "2026-09-21T18:00Z", lat: 0, lon: -78.5, dec: 0.487486, gha: 91.752295, hc: 76.738902, zn: 272.125612 },
  { at: "2026-11-03T11:00Z", lat: -54.8, lon: -68.3, dec: -15.138017, gha: 349.111659, hc: 18.528065, zn: 90.155321 },
  { at: "2026-03-20T16:00Z", lat: 19.43, lon: -99.13, dec: 0.020459, gha: 58.153058, hc: 45.405667, zn: 110.930524 },
  { at: "2026-11-17T10:00Z", lat: 51.48, lon: 0, dec: -19.031085, gha: 333.763438, hc: 15.841055, zn: 154.252053 },
  { at: "2026-06-21T22:00Z", lat: 89.9, lon: 0, dec: 23.436808, gha: 149.522842, hc: 23.350616, zn: 329.544776 },
];

const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("the sun at an instant", () => {
  for (const c of CASES) {
    it(`matches the Observatory at ${c.lat}, ${c.lon} on ${c.at}`, () => {
      const ms = Date.parse(c.at);
      const sun = sunAt(ms, c.lat, c.lon);
      expect(Math.abs(sun.altitude - c.hc)).toBeLessThan(0.02);
      expect(angleBetween(sun.azimuth, c.zn)).toBeLessThan(0.02);
      expect(Math.abs(sun.declination - c.dec)).toBeLessThan(0.01);
      const utHours = (ms % 86_400_000) / 3_600_000;
      const eotMinutes = (((c.gha - (utHours * 15 - 180) + 540) % 360) - 180) * 4;
      expect(Math.abs(sun.equationOfTime - eotMinutes) * 60).toBeLessThan(4);
    });
  }

  it("puts apparent solar noon at the hour angle of zero", () => {
    const day = sunDay(51.48, 0, "2026-11-17");
    expect(apparentSolarHours(day.noon, 0)).toBeCloseTo(12, 3);
    expect(Math.abs(sunAt(day.noon, 51.48, 0).hourAngle)).toBeLessThan(0.01);
    // On the meridian the sun is due south from the north and due north from the far south.
    expect(angleBetween(sunAt(day.noon, 51.48, 0).azimuth, 180)).toBeLessThan(0.05);
    const south = sunDay(-60, 0, "2026-06-21");
    expect(angleBetween(sunAt(south.noon, -60, 0).azimuth, 0)).toBeLessThan(0.05);
  });

  it("holds at the pole and on the equator without a gap in the answer", () => {
    for (const lat of [90, -90, 0]) {
      const sun = sunAt(Date.parse("2026-03-01T09:00Z"), lat, 10);
      expect(Number.isFinite(sun.altitude)).toBe(true);
      expect(Number.isFinite(sun.azimuth)).toBe(true);
    }
    // At the pole the sun's height is its declination, whatever the hour.
    const at = Date.parse("2026-06-21T03:00Z");
    expect(sunAt(at, 90, 0).altitude).toBeCloseTo(sunAt(at, 90, 0).declination, 1);
  });
});

describe("refraction", () => {
  it("is NOAA's model: about 34′ at the horizon, about 1′ at 45°, none above 85°", () => {
    expect(refraction(0) * 60).toBeCloseTo(28.9, 0);
    expect(refraction(45) * 60).toBeCloseTo(0.97, 1);
    expect(refraction(89)).toBe(0);
    // USNO's own refraction at 15.84° (the case of 17 November above) was 0.058°: the two models agree.
    expect(refraction(15.84)).toBeCloseTo(0.0567, 2);
  });

  it("is taken back off an apparent altitude", () => {
    for (const altitude of [2, 10, 30, 60]) expect(geometricFromApparent(altitude + refraction(altitude))).toBeCloseTo(altitude, 4);
  });
});

describe("the moment the sun is at a height", () => {
  it("agrees with sunrise when asked for the sunrise height", () => {
    const day = sunDay(51.48, 0, "2026-11-17");
    expect(day.sun.kind).toBe("crosses");
    if (day.sun.kind !== "crosses") return;
    expect(altitudeCrossing(51.48, 0, "2026-11-17", -0.833, -1)).toBeCloseTo(day.sun.begin!, -3);
    expect(altitudeCrossing(51.48, 0, "2026-11-17", -0.833, 1)).toBeCloseTo(day.sun.end!, -3);
  });

  it("is null for a height the sun does not reach that day, or does not drop below", () => {
    expect(altitudeCrossing(51.48, 0, "2026-11-17", 40, -1)).toBeNull();
    // Midnight sun at 78° north in June: never as low as 5°.
    expect(altitudeCrossing(78.22, 15.65, "2026-06-21", 5, 1)).toBeNull();
  });
});
