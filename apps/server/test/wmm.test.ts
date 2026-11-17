/**
 * The World Magnetic Model (packages/shared/src/wmm.ts) against NOAA's own figures:
 *
 * - every row of "WMM2025_TEST_VALUES.txt", the test values NOAA publishes on the model's
 *   page (https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt,
 *   the same as Table 6 of the technical report), to the precision they are printed to:
 *   0.1 nT, 0.1 nT a year and 0.01°;
 * - every row of the longer list in NOAA's coefficient package (WMM2025COF.zip,
 *   WMM2025_TestValues.txt), printed to a millionth of a nT;
 * - the high-precision worked example of Table 3b of the technical report (Chulliat et
 *   al. 2025, https://doi.org/10.25923/prbc-s316), step by step.
 *
 * The report (section 1.10) asks of a new implementation that "Quantities in nanotesla
 * (nT) shall be correct to within 0.1 nT" between 89.992° S and 89.992° N.
 */
import fs from "node:fs";
import path from "node:path";
import { decimalYear, geocentricOf, magneticField, magneticModelInfo } from "@outpost/shared";
import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
  fs
    .readFileSync(path.join(import.meta.dirname, "fixtures", "wmm", name), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.trim().split(/\s+/).map(Number));

/** Within half a unit of the last printed digit, with room for the binary representation of the printed figure. */
const within = (actual: number, printed: number, unit: number) => Math.abs(actual - printed) <= unit / 2 + 1e-9;

describe("the World Magnetic Model", () => {
  it("is WMM2025, for 2025.0 to 2030.0", () => {
    expect(magneticModelInfo()).toEqual({ name: "WMM2025", epoch: 2025, end: 2030 });
  });

  it("gives every one of NOAA's published test values to the precision they are printed to", () => {
    const rows = fixture("WMM2025_TEST_VALUES.txt");
    expect(rows).toHaveLength(12);
    const misses: string[] = [];
    for (const row of rows) {
      const [year, height, lat, lon, X, Y, Z, H, F, I, D, , Xd, Yd, Zd, Hd, Fd, Id, Dd] = row as number[];
      const f = magneticField(lat!, lon!, year!, height!);
      const checks: Array<[string, number, number, number]> = [
        ["X", f.north, X!, 0.1],
        ["Y", f.east, Y!, 0.1],
        ["Z", f.down, Z!, 0.1],
        ["H", f.horizontal, H!, 0.1],
        ["F", f.total, F!, 0.1],
        ["I", f.inclination, I!, 0.01],
        ["D", f.declination, D!, 0.01],
        ["Xdot", f.northPerYear, Xd!, 0.1],
        ["Ydot", f.eastPerYear, Yd!, 0.1],
        ["Zdot", f.downPerYear, Zd!, 0.1],
        ["Hdot", f.horizontalPerYear, Hd!, 0.1],
        ["Fdot", f.totalPerYear, Fd!, 0.1],
        ["Idot", f.inclinationPerYear, Id!, 0.01],
        ["Ddot", f.declinationPerYear, Dd!, 0.01],
      ];
      for (const [name, actual, printed, unit] of checks) {
        if (!within(actual, printed, unit)) misses.push(`${row.slice(0, 4).join(" ")} ${name}: ${actual} against ${printed}`);
      }
      expect(f.outsideYears).toBeNull();
    }
    expect(misses).toEqual([]);
  });

  it("gives every row of the coefficient package's longer list of test values", () => {
    const rows = fixture("WMM2025_TestValues_package.txt");
    expect(rows.length).toBeGreaterThanOrEqual(100);
    const misses: string[] = [];
    for (const row of rows) {
      const [year, height, lat, lon, D, I, H, X, Y, Z, F, Dd, Id, Hd, Xd, Yd, Zd, Fd] = row as number[];
      const f = magneticField(lat!, lon!, year!, height!);
      // Angles are printed to 0.01°, rates of angles to a millionth of a degree, the rest to a millionth of a nT;
      // a thousandth of a nT is a hundred times finer than the 0.1 nT the report asks for.
      const checks: Array<[string, number, number, number]> = [
        ["D", f.declination, D!, 0.01],
        ["I", f.inclination, I!, 0.01],
        ["H", f.horizontal, H!, 0.002],
        ["X", f.north, X!, 0.002],
        ["Y", f.east, Y!, 0.002],
        ["Z", f.down, Z!, 0.002],
        ["F", f.total, F!, 0.002],
        ["Ddot", f.declinationPerYear, Dd!, 0.00001],
        ["Idot", f.inclinationPerYear, Id!, 0.00001],
        ["Hdot", f.horizontalPerYear, Hd!, 0.002],
        ["Xdot", f.northPerYear, Xd!, 0.002],
        ["Ydot", f.eastPerYear, Yd!, 0.002],
        ["Zdot", f.downPerYear, Zd!, 0.002],
        ["Fdot", f.totalPerYear, Fd!, 0.002],
      ];
      for (const [name, actual, printed, unit] of checks) {
        if (!within(actual, printed, unit)) misses.push(`${row.slice(0, 4).join(" ")} ${name}: ${actual} against ${printed}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it("follows the report's worked example (Table 3b) step by step", () => {
    // 2027.5, 100 km above the ellipsoid, 80° S, 240° E.
    const { phiPrime, r } = geocentricOf(-80, 100);
    expect(phiPrime).toBeCloseTo(-1.3951289589, 9);
    expect(r).toBeCloseTo(6457402.34844737, 6);
    const f = magneticField(-80, 240, 2027.5, 100);
    expect(f.north).toBeCloseTo(5983.9760496518, 6);
    expect(f.east).toBeCloseTo(14760.1359757868, 6);
    expect(f.down).toBeCloseTo(-49317.6706154255, 6);
    expect(f.northPerYear).toBeCloseTo(30.555353353, 6);
    expect(f.eastPerYear).toBeCloseTo(-8.0494228995, 6);
    expect(f.downPerYear).toBeCloseTo(89.2174069382, 6);
    expect(f.total).toBeCloseTo(51825.6907172314, 6);
    expect(f.horizontal).toBeCloseTo(15927.007986013, 6);
    expect((f.declination * Math.PI) / 180).toBeCloseTo(1.1856308407, 9);
    expect((f.inclination * Math.PI) / 180).toBeCloseTo(-1.2584221541, 9);
    expect(f.totalPerYear).toBeCloseTo(-83.6643506802, 6);
    expect(f.horizontalPerYear).toBeCloseTo(4.0203361601, 6);
    expect((f.declinationPerYear * Math.PI) / 180).toBeCloseTo(-0.001967791, 9);
    expect((f.inclinationPerYear * Math.PI) / 180).toBeCloseTo(0.0006028663, 9);
    // The same answer for the same longitude written the other way.
    expect(magneticField(-80, -120, 2027.5, 100).declination).toBeCloseTo(f.declination, 9);
  });

  it("still answers outside its years, and says by how much", () => {
    const inside = magneticField(54.45, -3.21, 2029.99);
    expect(inside.outsideYears).toBeNull();
    const after = magneticField(54.45, -3.21, 2031.5);
    expect(after.outsideYears).toBeCloseTo(1.5, 9);
    // The straight lines carried on: the declination moves on at the rate the model gives.
    expect(after.declination - inside.declination).toBeCloseTo(inside.declinationPerYear * 1.51, 1);
    const before = magneticField(54.45, -3.21, 2024.25);
    expect(before.outsideYears).toBeCloseTo(-0.75, 9);
  });

  it("marks NOAA's blackout and caution zones near the magnetic poles", () => {
    // 2025.0, near the north magnetic pole (one of NOAA's own test points has H 1504 nT).
    expect(magneticField(89, -121, 2025, 28).zone).toBe("blackout");
    expect(magneticField(80, -96, 2025, 48).zone).toBe("caution");
    expect(magneticField(54.45, -3.21, 2026).zone).toBeNull();
  });

  it("gives the report's error model for the declination", () => {
    // δD = √(0.26² + (5417/H)²): 0.29° where H is greatest (41,875 nT), as the report says.
    const equator = magneticField(0, 120, 2025);
    expect(Math.sqrt(0.26 ** 2 + (5417 / 41875) ** 2)).toBeCloseTo(0.29, 2);
    expect(equator.declinationUncertainty).toBeCloseTo(Math.sqrt(0.26 ** 2 + (5417 / equator.horizontal) ** 2), 9);
    // In the Lake District, about 0.4°.
    expect(magneticField(54.45, -3.21, 2026.9).declinationUncertainty).toBeCloseTo(0.4, 1);
  });

  it("counts a date as a decimal year", () => {
    expect(decimalYear(Date.UTC(2025, 0, 1))).toBe(2025);
    expect(decimalYear(Date.UTC(2027, 6, 2, 12))).toBeCloseTo(2027.5, 2);
    expect(decimalYear(new Date(Date.UTC(2028, 11, 31, 23, 59)))).toBeLessThan(2029);
  });
});
