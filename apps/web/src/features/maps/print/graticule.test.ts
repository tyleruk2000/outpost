import type { Bbox } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { graticule, graticuleLines } from "./graticule";
import { pageGeometry } from "./paper";
import { boxAtScale } from "./scale";

const a4 = pageGeometry("a4", "portrait");

describe("the graticule round the printed map", () => {
  it("marks whole minutes on a walking map, in degrees and minutes", () => {
    const box = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, a4.mapPixels);
    const ticks = graticule(box, a4.map, "dms");
    // The sheet is about 4.4′ of longitude and 3.4′ of latitude; a minute of latitude is 1,855 m = 74 mm of paper.
    expect(ticks.step).toBeCloseTo(1 / 60, 12);
    expect(ticks.latitudes.map((tick) => tick.label)).toEqual(["54°29'N", "54°30'N", "54°31'N"]);
    expect(ticks.longitudes.map((tick) => tick.label)).toEqual(["3°08'W", "3°07'W", "3°06'W", "3°05'W", "3°04'W"]);
    // 54°30′ is the middle of the sheet; latitudes are measured down from the top.
    expect(ticks.latitudes[1]!.at).toBeCloseTo(0.5, 6);
    expect(ticks.latitudes[0]!.at).toBeGreaterThan(0.5);
    for (const tick of [...ticks.latitudes, ...ticks.longitudes]) {
      expect(tick.at).toBeGreaterThanOrEqual(0);
      expect(tick.at).toBeLessThanOrEqual(1);
    }
  });

  it("uses round decimal steps when positions are shown as decimal degrees", () => {
    const box = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, a4.mapPixels);
    const ticks = graticule(box, a4.map, "decimal");
    // The sheet is 0.0734° of longitude across 537.6 points: 0.01° is 73 points, 0.005° too close for the figures.
    expect(ticks.step).toBe(0.01);
    expect(ticks.latitudes.map((tick) => tick.label)).toEqual(["54.48°N", "54.49°N", "54.50°N", "54.51°N", "54.52°N"]);
    expect(ticks.longitudes.map((tick) => tick.label)).toEqual(["3.13°W", "3.12°W", "3.11°W", "3.10°W", "3.09°W", "3.08°W", "3.07°W"]);
  });

  it("writes seconds only when the step needs them, and never sixty of them", () => {
    const box = boxAtScale({ lat: 54.5, lon: -3.1 }, 5_000, a4.mapPixels);
    const ticks = graticule(box, a4.map, "dms");
    // A fifth of the ground of the sheet above: 0.0147° of longitude across, so 10″ is 102 points and 5″ too close.
    expect(ticks.step).toBeCloseTo(10 / 3600, 12);
    expect(ticks.latitudes.map((tick) => tick.label)).toContain(`54°30'00"N`);
    expect(ticks.latitudes.every((tick) => !tick.label.includes('60"'))).toBe(true);
  });

  it("leaves the hemisphere off the equator and the prime meridian", () => {
    const box: Bbox = [-2, -2, 2, 2];
    const ticks = graticule(box, { width: 250, height: 250 }, "dms");
    expect(ticks.step).toBe(1);
    expect(ticks.longitudes.map((tick) => tick.label)).toEqual(["2°W", "1°W", "0°", "1°E", "2°E"]);
    expect(ticks.latitudes.map((tick) => tick.label)).toEqual(["2°S", "1°S", "0°", "1°N", "2°N"]);
  });

  it("gives one straight line across the map for every tick", () => {
    const box: Bbox = [-2, -2, 2, 2];
    const ticks = graticule(box, { width: 500, height: 500 }, "decimal");
    const lines = graticuleLines(box, ticks);
    expect(lines.features).toHaveLength(ticks.longitudes.length + ticks.latitudes.length);
    expect(lines.features[0]!.geometry).toEqual({
      type: "LineString",
      coordinates: [
        [-2, -2],
        [-2, 2],
      ],
    });
  });
});
