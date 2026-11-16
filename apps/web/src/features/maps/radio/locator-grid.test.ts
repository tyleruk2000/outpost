import { describe, expect, it } from "vitest";
import { LOCATOR_MIN_ZOOM, locatorGrid, locatorLengthAt } from "./locator-grid";

type Grid = ReturnType<typeof locatorGrid>;
const labels = (grid: Grid) => grid.features.filter((feature) => feature.properties.kind === "label");
const lines = (grid: Grid, kind: string) =>
  grid.features
    .filter((feature) => feature.properties.kind === kind)
    .map((feature) => feature.geometry.coordinates as Array<[number, number]>);
const meridians = (grid: Grid, kind: string) =>
  lines(grid, kind)
    .filter(([a, b]) => a![0] === b![0])
    .map(([a]) => a![0]);
const parallels = (grid: Grid, kind: string) =>
  lines(grid, kind)
    .filter(([a, b]) => a![1] === b![1])
    .map(([a]) => a![1]);

describe("the locator grid", () => {
  it("draws the smallest cell that is wide enough on screen to hold its name", () => {
    expect(locatorLengthAt(0)).toBe(2);
    expect(locatorLengthAt(4.4)).toBe(2);
    expect(locatorLengthAt(4.5)).toBe(4);
    expect(locatorLengthAt(8.9)).toBe(4);
    expect(locatorLengthAt(9)).toBe(6);
    expect(locatorLengthAt(12.5)).toBe(8);
    expect(locatorLengthAt(19)).toBe(8);
    // From its first zoom each cell is at least 60 pixels wide: the map is 512 pixels round at zoom 0.
    for (const [length, degrees] of [
      [4, 2],
      [6, 1 / 12],
      [8, 1 / 120],
    ] as const) {
      expect((degrees / 360) * 512 * 2 ** LOCATOR_MIN_ZOOM[length]).toBeGreaterThanOrEqual(60);
    }
  });

  it("draws squares over Britain with the fields' edges heavier, and names each square at its middle", () => {
    const grid = locatorGrid([-6, 50, 2, 56], 6);
    // A meridian every 2° and a parallel every 1°; those every 20° and 10° are the edges of fields.
    expect(meridians(grid, "fine")).toEqual(expect.arrayContaining([-6, -4, -2, 2]));
    expect(meridians(grid, "coarse")).toEqual([0]);
    expect(parallels(grid, "fine")).toEqual(expect.arrayContaining([51, 52, 53, 54, 55]));
    expect(parallels(grid, "coarse")).toEqual([50]);
    expect(meridians(grid, "fine").every((lon) => Number.isInteger(lon / 2))).toBe(true);
    const named = Object.fromEntries(labels(grid).map((feature) => [feature.properties.text, feature.geometry.coordinates]));
    expect(named.IO83).toEqual([-3, 53.5]);
    expect(named.IO91).toEqual([-1, 51.5]);
    expect(named.JO01).toEqual([1, 51.5]);
    // Every name is four characters, and no cell is named twice.
    expect(labels(grid).every((feature) => String(feature.properties.text).length === 4)).toBe(true);
    expect(new Set(labels(grid).map((feature) => feature.properties.text)).size).toBe(labels(grid).length);
  });

  it("draws subsquares when zoomed in, with the squares' edges heavier", () => {
    const grid = locatorGrid([-2.8, 53.45, -2.45, 53.6], 10.5);
    const named = Object.fromEntries(labels(grid).map((feature) => [feature.properties.text, feature.geometry.coordinates as number[]]));
    expect(named.IO83QM![0]).toBeCloseTo(-2.625, 9);
    expect(named.IO83QM![1]).toBeCloseTo(53.520833, 5);
    // The only whole degree of latitude in view is the edge of squares; 53.5° is the edge of subsquares only.
    expect(parallels(grid, "coarse").filter((lat) => lat > 53.3 && lat < 53.7)).toEqual([]);
    expect(parallels(grid, "fine").some((lat) => Math.abs(lat - 53.5) < 1e-9)).toBe(true);
    expect(locatorGrid([-2.8, 53.9, -2.45, 54.1], 10.5).features.some((feature) => feature.properties.kind === "coarse")).toBe(true);
    // Extended squares closer still.
    const close = locatorGrid([-2.63, 53.52, -2.61, 53.53], 14);
    expect(labels(close).some((feature) => feature.properties.text === "IO83QM45")).toBe(true);
    expect(labels(close).every((feature) => String(feature.properties.text).length === 8)).toBe(true);
  });

  it("names every field once on a view of the whole world, and stops where the map does", () => {
    // MapLibre reports a view wider than the world with edges past 180°.
    const grid = locatorGrid([-300, -85, 300, 85], 1);
    expect(labels(grid)).toHaveLength(18 * 18);
    expect(new Set(labels(grid).map((feature) => feature.properties.text)).size).toBe(18 * 18);
    expect(meridians(grid, "coarse")).toHaveLength(18);
    for (const line of [...lines(grid, "coarse"), ...lines(grid, "fine")]) {
      for (const [lon, lat] of line) {
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(85.0511);
      }
    }
  });

  it("carries on across the 180° meridian", () => {
    const grid = locatorGrid([172, -4, 188, 4], 6);
    const names = labels(grid).map((feature) => feature.properties.text);
    // The last squares of field R and the first of field A, side by side.
    expect(names).toEqual(expect.arrayContaining(["RJ90", "AJ00", "RI99", "AI09"]));
    for (const feature of grid.features) {
      const coordinates = feature.properties.kind === "label" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const [lon] of coordinates as Array<[number, number]>) expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    }
    // The equator is drawn on both sides of the meridian, not round the world between them.
    const equator = lines(grid, "coarse").filter(([a, b]) => a![1] === 0 && b![1] === 0);
    expect(equator).toHaveLength(2);
    for (const [a, b] of equator) expect(Math.abs(b![0] - a![0])).toBeLessThan(40);
  });
});
