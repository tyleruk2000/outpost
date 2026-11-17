/**
 * Grid convergence and the rule between a map and a compass (packages/shared/src/compass.ts).
 *
 * No Ordnance Survey publication that could be read gives worked figures for grid
 * convergence on the National Grid: "A guide to coordinate systems in Great Britain"
 * (v3.6, 2020, read 2026-11-17) gives the projection's formulae and a worked example of
 * them, but not the convergence. So the method is checked against a worked example of a
 * Transverse Mercator grid that NOAA does publish (Table 3d of the WMM2025 technical
 * report: the UTM convergence at 80° S, 120° W, in zones 10 and 11), with the projection
 * built here from the Ordnance Survey's own formulae (C1 to C5 of the guide) for WGS 84
 * and UTM; and the National Grid against what its projection must give: nothing on its
 * central meridian, equal and opposite either side of it, and the textbook series away
 * from it.
 */
import {
  compassPoint,
  compassRule,
  convergenceOf,
  convertBearing,
  nationalGridConvergence,
  normaliseBearing,
  northsAt,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

const DEG = Math.PI / 180;

/** Ordnance Survey, A guide to coordinate systems in Great Britain, annex C, equations C1 to C5, for any ellipsoid and grid. */
function transverseMercator(a: number, b: number, f0: number, lat0: number, lon0: number, e0: number, n0: number) {
  const e2 = (a * a - b * b) / (a * a);
  const n = (a - b) / (a + b);
  return (latDeg: number, lonDeg: number) => {
    const phi = latDeg * DEG;
    const lambda = lonDeg * DEG;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    const tan2 = Math.tan(phi) ** 2;
    const nu = (a * f0) / Math.sqrt(1 - e2 * sin * sin);
    const rho = (a * f0 * (1 - e2)) / (1 - e2 * sin * sin) ** 1.5;
    const eta2 = nu / rho - 1;
    const d = phi - lat0 * DEG;
    const s = phi + lat0 * DEG;
    const M =
      b *
      f0 *
      ((1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * d -
        (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(d) * Math.cos(s) +
        ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * d) * Math.cos(2 * s) -
        (35 / 24) * n ** 3 * Math.sin(3 * d) * Math.cos(3 * s));
    const I = M + n0;
    const II = (nu / 2) * sin * cos;
    const III = (nu / 24) * sin * cos ** 3 * (5 - tan2 + 9 * eta2);
    const IIIA = (nu / 720) * sin * cos ** 5 * (61 - 58 * tan2 + tan2 ** 2);
    const IV = nu * cos;
    const V = (nu / 6) * cos ** 3 * (nu / rho - tan2);
    const VI = (nu / 120) * cos ** 5 * (5 - 18 * tan2 + tan2 ** 2 + 14 * eta2 - 58 * tan2 * eta2);
    const L = lambda - lon0 * DEG;
    return { northing: I + II * L ** 2 + III * L ** 4 + IIIA * L ** 6, easting: e0 + IV * L + V * L ** 3 + VI * L ** 5 };
  };
}

describe("grid convergence", () => {
  it("works the projection as the Ordnance Survey's worked example does", () => {
    // The guide's own example (annex C): 52° 39′ 27.2531″ N, 1° 43′ 4.5177″ E on Airy 1830 is E 651409.903, N 313177.270.
    const grid = transverseMercator(6377563.396, 6356256.909, 0.9996012717, 49, -2, 400000, -100000);
    const at = grid(52 + 39 / 60 + 27.2531 / 3600, 1 + 43 / 60 + 4.5177 / 3600);
    expect(at.easting).toBeCloseTo(651409.903, 2);
    expect(at.northing).toBeCloseTo(313177.27, 2);
  });

  it("gives NOAA's UTM worked example: 80° S, 120° W in zones 10 and 11 (WMM2025 report, Table 3d)", () => {
    const wgs84 = { a: 6378137, b: 6356752.314245 };
    const zone10 = transverseMercator(wgs84.a, wgs84.b, 0.9996, 0, -123, 500000, 10000000);
    const zone11 = transverseMercator(wgs84.a, wgs84.b, 0.9996, 0, -117, 500000, 10000000);
    expect(convergenceOf(zone10, -80, -120)).toBeCloseTo(-2.9545046801, 6);
    expect(convergenceOf(zone11, -80, -120)).toBeCloseTo(2.9545046801, 6);
  });

  it("is nothing on the National Grid's central meridian, 2° W, and opposite either side of it", () => {
    for (const lat of [50.5, 52, 54.45, 57, 60]) {
      // 2° W on OSGB36 is a little under 0.002° from 2° W on WGS 84.
      expect(Math.abs(nationalGridConvergence(lat, -2)!)).toBeLessThan(0.003);
      const east = nationalGridConvergence(lat, 0)!;
      const west = nationalGridConvergence(lat, -4)!;
      expect(east).toBeGreaterThan(0);
      expect(west).toBeLessThan(0);
      expect(east + west).toBeCloseTo(0, 2);
    }
  });

  it("follows the textbook series Δλ·sin φ·(1 + Δλ²cos²φ(1 + 3η²)/3) on the National Grid", () => {
    const e2 = 0.0066705397616; // Airy 1830, (a² − b²)/a²
    for (const [lat, lon] of [
      [50.07, -5.71], // Land's End
      [51.48, 0.0], // Greenwich
      [52.63, 1.3], // Norwich
      [54.45, -3.21], // Scafell Pike
      [57.8, -7.0], // the Outer Hebrides
      [60.15, -1.15], // Lerwick
    ] as const) {
      const dl = (lon + 2) * DEG;
      const phi = lat * DEG;
      const eta2 = (e2 / (1 - e2)) * Math.cos(phi) ** 2;
      const series = (dl * Math.sin(phi) * (1 + ((dl * Math.cos(phi)) ** 2 * (1 + 3 * eta2)) / 3)) / DEG;
      // The difference left is the WGS 84 to OSGB36 shift, a thousandth of a degree or two.
      expect(nationalGridConvergence(lat, lon)!, `${lat}, ${lon}`).toBeCloseTo(series, 2);
    }
  });

  it("is not given outside Great Britain's grid", () => {
    expect(nationalGridConvergence(48.85, 2.35)).toBeNull(); // Paris
    expect(nationalGridConvergence(40.71, -74.0)).toBeNull();
    expect(northsAt(48.85, 2.35, Date.UTC(2026, 10, 17)).gridMagneticAngle).toBeNull();
  });
});

describe("the rule between map and compass", () => {
  // Magnetic north from the map's north: grid magnetic angle = declination − convergence.
  const gma = (declination: number, convergence: number) => declination - convergence;

  it("is right in each of the four combinations of east and west", () => {
    // Declination east, grid north east of true by more: magnetic is west of grid. Map to compass: add.
    expect(compassRule(gma(1, 3))).toEqual({ degrees: 2, side: "west", mapToCompass: "add", compassToMap: "subtract" });
    // Declination east, grid north west of true: magnetic is further east of grid. Map to compass: subtract.
    expect(compassRule(gma(1, -2))).toEqual({ degrees: 3, side: "east", mapToCompass: "subtract", compassToMap: "add" });
    // Declination west, grid north east of true: magnetic is further west of grid. Map to compass: add.
    expect(compassRule(gma(-1, 1.5))).toEqual({ degrees: 3, side: "west", mapToCompass: "add", compassToMap: "subtract" });
    // Declination west, grid north west of true by more: magnetic is east of grid. Map to compass: subtract.
    expect(compassRule(gma(-0.6, -2.8))).toEqual({ degrees: 2, side: "east", mapToCompass: "subtract", compassToMap: "add" });
  });

  it("agrees with converting a bearing: map to compass is the grid bearing less the angle", () => {
    for (const [declination, convergence] of [
      [1, 3],
      [1, -2],
      [-1, 1.5],
      [-0.6, -2.8],
    ] as const) {
      const rule = compassRule(gma(declination, convergence));
      const onCompass = convertBearing(100, "grid", "magnetic", { declination, convergence })!;
      const sign = rule.mapToCompass === "add" ? 1 : -1;
      expect(Math.round(onCompass)).toBe(100 + sign * rule.degrees);
      const back = convertBearing(onCompass, "magnetic", "grid", { declination, convergence })!;
      expect(back).toBeCloseTo(100, 9);
    }
  });

  it("says nothing needs doing when the angle rounds to no whole degree", () => {
    expect(compassRule(0.4)).toEqual({ degrees: 0, side: null, mapToCompass: null, compassToMap: null });
    expect(compassRule(-0.49)).toMatchObject({ degrees: 0, side: null });
    expect(compassRule(0.5)).toMatchObject({ degrees: 1, side: "east", mapToCompass: "subtract" });
  });

  it("converts bearings between the norths, and refuses grid outside Great Britain", () => {
    const offsets = { declination: -0.6, convergence: -1.4 };
    expect(convertBearing(0, "true", "magnetic", offsets)).toBeCloseTo(0.6, 9);
    expect(convertBearing(0, "true", "grid", offsets)).toBeCloseTo(1.4, 9);
    expect(convertBearing(359.8, "magnetic", "true", offsets)).toBeCloseTo(359.2, 9);
    expect(convertBearing(0.5, "true", "magnetic", { declination: 2, convergence: null })).toBeCloseTo(358.5, 9);
    expect(convertBearing(10, "grid", "true", { declination: 2, convergence: null })).toBeNull();
    expect(normaliseBearing(-90)).toBe(270);
    expect(normaliseBearing(720)).toBe(0);
  });

  it("names the sixteen points", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(11)).toBe("N");
    expect(compassPoint(12)).toBe("NNE");
    expect(compassPoint(315)).toBe("NW");
    expect(compassPoint(359)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
  });

  it("works the three norths out for a place in Great Britain", () => {
    // Scafell Pike in November 2026: worked out here, and the parts agree with each other.
    const norths = northsAt(54.4542, -3.2116, Date.UTC(2026, 10, 17));
    expect(norths.field.model).toBe("WMM2025");
    expect(norths.convergence!).toBeLessThan(0); // west of 2° W, grid north is west of true north
    expect(norths.gridMagneticAngle!).toBeCloseTo(norths.declination - norths.convergence!, 12);
  });
});
