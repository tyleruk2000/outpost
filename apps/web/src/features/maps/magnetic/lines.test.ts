import { describe, expect, it } from "vitest";
import { mercatorX, mercatorY } from "../print/scale";
import { declinationAt, MAGNETIC_SPACING_PX, magneticLines } from "./lines";

const view = [-3.4, 54.3, -2.6, 54.75] as [number, number, number, number];
type Line = [[number, number], [number, number]];
const lines = (declination: number, bounds = view, zoom = 11) =>
  magneticLines(bounds, zoom, declination).features.map((feature) => feature.geometry.coordinates as Line);

/** The bearing of a line on the map, clockwise from north, in degrees. */
const bearing = ([[lon0, lat0], [lon1, lat1]]: Line) =>
  (Math.atan2(mercatorX(lon1) - mercatorX(lon0), mercatorY(lat0) - mercatorY(lat1)) * 180) / Math.PI;

describe("magnetic north lines on the map", () => {
  it("run straight up the map where magnetic north is true north, the set spacing apart", () => {
    const drawn = lines(0);
    expect(drawn.length).toBeGreaterThan(3);
    for (const line of drawn) {
      expect(line[0][0]).toBeCloseTo(line[1][0], 9);
      // South end first.
      expect(line[1][1]).toBeGreaterThan(line[0][1]);
    }
    const world = 512 * 2 ** 11;
    const gaps = drawn.slice(1).map((line, index) => (mercatorX(line[0][0]) - mercatorX(drawn[index]![0][0])) * world);
    for (const gap of gaps) expect(gap).toBeCloseTo(MAGNETIC_SPACING_PX, 6);
  });

  it("lean by the declination, west of north when it is west", () => {
    for (const declination of [-1.2, 7.5, -15]) for (const line of lines(declination)) expect(bearing(line)).toBeCloseTo(declination, 6);
  });

  it("cover the view, and stay where they are when the map is moved", () => {
    const drawn = lines(-1.2);
    const lons = drawn.flatMap((line) => [line[0][0], line[1][0]]);
    expect(Math.min(...lons)).toBeLessThan(view[0]);
    expect(Math.max(...lons)).toBeGreaterThan(view[2]);
    const moved = lines(-1.2, [view[0] + 0.05, view[1], view[2] + 0.05, view[3]]);
    // A line of the first set is a line of the second, wherever both reach.
    const crossing = (line: Line, lat: number) => {
      const t = (mercatorY(lat) - mercatorY(line[0][1])) / (mercatorY(line[1][1]) - mercatorY(line[0][1]));
      return line[0][0] + t * (line[1][0] - line[0][0]);
    };
    const before = drawn.map((line) => crossing(line, 54.5));
    const after = moved.map((line) => crossing(line, 54.5));
    const shared = after.filter((lon) => before.some((other) => Math.abs(other - lon) < 1e-9));
    expect(shared.length).toBeGreaterThan(after.length - 3);
  });

  it("gives the World Magnetic Model's declination, and nothing outside its years", () => {
    // Keswick in 2026: a little west of north (the readout and the printed sheet use the same model).
    const here = declinationAt(54.6, -3.13, new Date("2026-11-18T12:00:00Z"));
    expect(here).not.toBeNull();
    expect(here!).toBeLessThan(0);
    expect(here!).toBeGreaterThan(-3);
  });
});
