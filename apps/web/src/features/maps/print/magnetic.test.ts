/**
 * Magnetic north on the printed map: an arrow beside true north, a sentence with the figure, and, when chosen, lines
 * across the map that point to it, to set a compass against anywhere on the sheet.
 */
import { northsAt } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { graticule } from "./graticule";
import { PT_PER_MM, pageGeometry } from "./paper";
import { boxAtScale } from "./scale";
import { layoutSheet, magneticLines, magneticNote, sheetBottom, sheetWords } from "./sheet";

const geometry = pageGeometry("a4", "portrait");
const bbox = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, geometry.mapPixels);
const sheetWith = (magnetic: Parameters<typeof layoutSheet>[0]["magnetic"]) =>
  layoutSheet({
    geometry,
    bbox,
    scale: 25_000,
    title: "Helvellyn from Glenridding",
    date: "18 November 2026",
    credits: "Protomaps © OpenStreetMap",
    graticule: graticule(bbox, geometry.map, "dms"),
    pictures: [{ id: "map", x: 0, y: 0, ...geometry.mapPixels }],
    magnetic,
  });
const BLUE = (item: { kind: string; color?: unknown }) =>
  item.kind === "line" && JSON.stringify(item.color) === JSON.stringify([0.16, 0.32, 0.78]);

describe("magnetic north lines across the map", () => {
  const map = geometry.map;
  const inside = ([x, y]: [number, number]) =>
    x >= map.x - 1e-6 && x <= map.x + map.width + 1e-6 && y >= map.y - 1e-6 && y <= map.y + map.height + 1e-6;

  it("are straight up with no declination, 30 mm apart, one through the middle, edge to edge", () => {
    const lines = magneticLines(map, 0);
    for (const [a, b] of lines) {
      expect(a[0]).toBeCloseTo(b[0], 9);
      expect(Math.abs(a[1] - b[1])).toBeCloseTo(map.height, 6);
    }
    const xs = lines.map(([a]) => a[0]).sort((p, q) => p - q);
    expect(xs).toContainEqual(expect.closeTo(map.x + map.width / 2, 6));
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(30 * PT_PER_MM, 6);
  });

  it("lean east for an east declination and west for a west one, by the angle, and stay inside the map", () => {
    for (const declination of [12.5, -4.2]) {
      for (const [a, b] of magneticLines(map, declination)) {
        expect(inside(a) && inside(b)).toBe(true);
        // From the lower end to the upper, as a compass needle points.
        const [low, high] = a[1] > b[1] ? [a, b] : [b, a];
        const angle = (Math.atan2(high[0] - low[0], low[1] - high[1]) * 180) / Math.PI;
        expect(angle).toBeCloseTo(declination, 6);
      }
    }
  });
});

describe("magnetic north on the sheet", () => {
  const today = northsAt(54.5, -3.1, new Date("2026-11-18T12:00:00Z")).declination;
  const magnetic = { declination: today, annualChange: 0.18, model: "WMM2025", lines: true };

  it("says where it is, which way it moves, and what to do with a bearing", () => {
    expect(magneticNote({ ...magnetic, declination: -1.23 }, "18 November 2026")).toBe(
      "Magnetic north (MN) is 1.2° west of true north at the middle of the sheet on 18 November 2026 (WMM2025), moving 0.2° east a year. The blue lines across the map point to magnetic north. For a compass bearing from one taken off the map, add 1.2°.",
    );
    expect(magneticNote({ ...magnetic, declination: 14, annualChange: -0.1, lines: false }, "1 May 2027")).toBe(
      "Magnetic north (MN) is 14.0° east of true north at the middle of the sheet on 1 May 2027 (WMM2025), moving 0.1° west a year. For a compass bearing from one taken off the map, subtract 14.0°.",
    );
  });

  it("draws MN beside N, the lines when chosen, and keeps everything on the paper", () => {
    const withLines = sheetWith(magnetic);
    const words = sheetWords(withLines);
    expect(words).toContain("N");
    expect(words).toContain("MN");
    expect(words.join(" ")).toMatch(/Magnetic north \(MN\) is \d\.\d° (east|west) of true north/);
    expect(words.join(" ")).not.toMatch(/magnetic north is not shown/);
    expect(withLines.items.filter(BLUE).length).toBeGreaterThan(5);
    expect(sheetBottom(withLines)).toBeLessThanOrEqual(geometry.height);

    const without = sheetWith({ ...magnetic, lines: false });
    // Only the arrow beside true north is blue.
    expect(without.items.filter(BLUE)).toHaveLength(1);
    expect(sheetWords(without)).toContain("MN");

    // Where the model has nothing to say (outside its years), the sheet says as before that it is not shown.
    expect(sheetWords(sheetWith(null)).join(" ")).toMatch(/magnetic north is not shown/);
  });
});
