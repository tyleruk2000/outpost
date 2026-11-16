import type { Bbox } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { BOX_HANDLES } from "../lib/box-handles";
import { MAP_PX_PER_INCH, pageGeometry } from "./paper";
import {
  boxAtScale,
  formatPercent,
  formatScale,
  frameBox,
  frameOfBox,
  mercatorX,
  mercatorY,
  moveBox,
  paperPoints,
  scaleBars,
  scaleForZoom,
  scaleOfBox,
  scaleVariation,
  shapeBox,
  zoomForScale,
} from "./scale";

const a4 = pageGeometry("a4", "portrait");
/** Width over height of a box as the map draws it. */
const shape = (bbox: Bbox) => (mercatorX(bbox[2]) - mercatorX(bbox[0])) / (mercatorY(bbox[1]) - mercatorY(bbox[3]));
const pageShape = a4.mapPixels.width / a4.mapPixels.height;

describe("paper", () => {
  it("has the sizes the standards give, in points", () => {
    // A4 is 210 × 297 mm; a point is 1/72 inch: 210 / 25.4 × 72 = 595.28, 297 / 25.4 × 72 = 841.89.
    expect(a4.width).toBeCloseTo((210 / 25.4) * 72, 2);
    expect(a4.height).toBeCloseTo((297 / 25.4) * 72, 2);
    expect(pageGeometry("letter", "landscape")).toMatchObject({ width: 792, height: 612 });
    expect(pageGeometry("a3", "portrait").height).toBeCloseTo((420 / 25.4) * 72, 2);
  });

  it("keeps the map and the strip inside a 10 mm margin on every paper", () => {
    const margin = (10 / 25.4) * 72;
    for (const paper of ["a4", "a3", "letter"] as const) {
      for (const orientation of ["portrait", "landscape"] as const) {
        const page = pageGeometry(paper, orientation);
        expect(page.map.x).toBeGreaterThanOrEqual(margin - 1e-9);
        expect(page.map.y).toBeGreaterThanOrEqual(margin - 1e-9);
        expect(page.map.x + page.map.width).toBeLessThanOrEqual(page.width - margin + 1e-9);
        expect(page.strip.y).toBeGreaterThan(page.map.y + page.map.height);
        expect(page.strip.y + page.strip.height).toBeLessThanOrEqual(page.height - margin + 1e-9);
        // Whole device pixels at 300 and at 150 to the inch.
        expect((page.mapPixels.width * 2.5) % 1).toBe(0);
        expect((page.mapPixels.height * 1.25) % 1).toBe(0);
        // The map is its pixels at 120 to the inch, to the point.
        expect(page.map.width).toBeCloseTo((page.mapPixels.width / MAP_PX_PER_INCH) * 72, 9);
      }
    }
    // A4 upright: 190 mm of room across is 897.6 px at 120 to the inch, so 896.
    expect(a4.mapPixels).toEqual({ width: 896, height: 1188 });
  });
});

describe("scale and zoom", () => {
  it("gives the zoom for a scale, as worked out by hand", () => {
    // 1:50,000 at 60°N. A map pixel is 1/120 inch of paper = 0.0254 / 120 m, which stands for
    // 50,000 × 0.0254 / 120 = 10.58333 m of ground. The parallel at 60° is half the equator:
    // 40,075,016.686 × 0.5 = 20,037,508.343 m, or 39,135.758 m to each of zoom 0's 512 pixels.
    // 39,135.758 / 10.58333 = 3,697.87 = 2^11.8525.
    expect(zoomForScale(50_000, 60)).toBeCloseTo(11.8525, 3);
    // 1:25,000 is exactly one zoom closer.
    expect(zoomForScale(25_000, 60)).toBeCloseTo(12.8525, 3);
    // On the equator at zoom 0 a pixel is 40,075,016.686 / 512 = 78,271.517 m; over 0.0254 / 120 m of paper
    // that is 1:369,786,694.
    expect(scaleForZoom(0, 0)).toBeCloseTo(369_786_694, -1);
  });

  it("round-trips", () => {
    for (const scale of [10_000, 25_000, 50_000, 250_000]) {
      for (const lat of [-45, 0, 54.5, 70]) expect(scaleForZoom(zoomForScale(scale, lat), lat)).toBeCloseTo(scale, 6);
    }
  });

  it("puts 4 cm on the page for a kilometre at 1:25,000", () => {
    // 1,000 m / 25,000 = 40 mm = 40 / 25.4 × 72 points.
    expect(paperPoints(1000, 25_000)).toBeCloseTo((40 / 25.4) * 72, 9);
    expect(paperPoints(1000, 50_000)).toBeCloseTo(56.693, 3);
  });

  it("covers the ground the scale says a page should", () => {
    // A4 upright holds a map 896 px wide: 896 / 120 inches = 189.65 mm, which at 1:25,000 is 4,741.3 m.
    const box = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, a4.mapPixels);
    const middle = frameOfBox(box, a4.mapPixels).center.lat;
    const groundWidth = ((box[2] - box[0]) / 360) * 40_075_016.686 * Math.cos((middle * Math.PI) / 180);
    expect(groundWidth).toBeCloseTo(((896 / 120) * 0.0254 * 25_000) as number, 1);
    expect(groundWidth).toBeCloseTo(4741.3, 0);
    expect(middle).toBeCloseTo(54.5, 9);
    expect(scaleOfBox(box, a4.mapPixels)).toBeCloseTo(25_000, 4);
    expect(shape(box)).toBeCloseTo(pageShape, 9);
  });

  it("goes from a frame to its box and back", () => {
    const frame = { center: { lat: 46.02, lon: 7.75 }, zoom: 12.37 };
    const back = frameOfBox(frameBox(frame, a4.mapPixels), a4.mapPixels);
    expect(back.zoom).toBeCloseTo(frame.zoom, 9);
    expect(back.center.lat).toBeCloseTo(frame.center.lat, 9);
    expect(back.center.lon).toBeCloseTo(frame.center.lon, 9);
  });

  it("writes a scale to the figures it is good for", () => {
    expect(formatScale(25_000)).toBe("1:25,000");
    expect(formatScale(31_437.2)).toBe("1:31,400");
    expect(formatScale(1_234_567)).toBe("1:1,230,000");
    expect(formatScale(987)).toBe("1:987");
  });
});

describe("how the scale changes across the sheet", () => {
  it("follows the cosine of the latitude", () => {
    // A sheet centred on the equator reaching 10° north and south: the scale along both edges is
    // 25,000 × cos 10° = 25,000 × 0.9848078 = 24,620.2, which is 1.52% off.
    const variation = scaleVariation([-1, -10, 1, 10], 25_000);
    expect(variation.latitude).toBeCloseTo(0, 9);
    expect(variation.top).toBeCloseTo(24_620.2, 1);
    expect(variation.bottom).toBeCloseTo(24_620.2, 1);
    expect(variation.percent).toBeCloseTo(1.519, 3);
    expect(formatPercent(variation.percent)).toBe("1.5%");
  });

  it("is a few parts in ten thousand on a walking map", () => {
    // A4 at 1:25,000 centred on 54.5°N. The map is 1,188 px high: 1,188 / 120 in × 0.0254 × 25,000 = 6,286.5 m,
    // so the top edge is 3,143.25 m north of the middle. A degree of latitude on this sphere is
    // 40,075,016.686 / 360 = 111,319.49 m, so that is 0.028236° (the stretching over so short a way changes
    // the fifth figure only). The scale changes by −tan(54.5°) × 0.028236° × π/180 = −1.40195 × 0.00049281
    // = −0.000691 of itself: 25,000 × (1 − 0.000691) = 24,982.7 along the top, and as much the other way
    // along the bottom.
    const box = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, a4.mapPixels);
    const variation = scaleVariation(box, 25_000);
    expect(variation.top).toBeGreaterThan(24_982);
    expect(variation.top).toBeLessThan(24_983.5);
    expect(variation.bottom).toBeGreaterThan(25_016.5);
    expect(variation.bottom).toBeLessThan(25_018);
    expect(variation.percent).toBeCloseTo(0.069, 2);
    expect(formatPercent(variation.percent)).toBe("0.07%");
  });

  it("is large on a sheet that spans a country", () => {
    // 50°N to 60°N: the middle as drawn is where the Mercator ordinate is half-way, about 55.3°N.
    // cos 60° / cos 55.31° = 0.5 / 0.5692 = 0.878, so the top edge is about 12% off.
    const variation = scaleVariation([-8, 50, 2, 60], 4_000_000);
    expect(variation.latitude).toBeGreaterThan(55.2);
    expect(variation.latitude).toBeLessThan(55.4);
    expect(variation.top / 4_000_000).toBeCloseTo(0.878, 2);
    expect(variation.percent).toBeGreaterThan(12);
    expect(variation.percent).toBeLessThan(13);
  });
});

describe("scale bars", () => {
  it("are round lengths, drawn to scale", () => {
    const { metric, miles } = scaleBars(25_000, 160);
    // 160 points is 56.4 mm, which is 1.41 km at 1:25,000: the bar is 1 km, 40 mm = 113.39 points long.
    expect(metric.meters).toBe(1000);
    expect(metric.unit).toBe("km");
    expect(metric.length).toBeCloseTo(113.386, 3);
    expect(metric.ticks.map((tick) => tick.label)).toEqual(["0", "", "0.5", "", "1"]);
    expect(metric.ticks.map((tick) => Number(tick.at.toFixed(2)))).toEqual([0, 28.35, 56.69, 85.04, 113.39]);
    // 1.41 km is 0.877 mi: the bar is half a mile, 804.672 m, 32.19 mm = 91.24 points.
    expect(miles.meters).toBeCloseTo(804.672, 6);
    expect(miles.length).toBeCloseTo(91.239, 2);
    expect(miles.ticks[miles.ticks.length - 1]!.label).toBe("0.5");
  });

  it("are in metres on a large-scale sheet and tens of kilometres on a small-scale one", () => {
    const town = scaleBars(2_000, 160);
    expect(town.metric.unit).toBe("m");
    expect(town.metric.meters).toBe(100);
    const country = scaleBars(1_000_000, 160);
    expect(country.metric.meters).toBe(50_000);
    expect(country.metric.ticks).toHaveLength(6);
    expect(country.metric.length).toBeCloseTo(paperPoints(50_000, 1_000_000), 9);
  });
});

describe("keeping the box the shape of the page", () => {
  const free: Bbox = [-3.4, 54.3, -2.8, 54.7];

  it("gives every handle a box of the page's shape", () => {
    for (const handle of [...BOX_HANDLES, "around", "inside"] as const)
      expect(shape(shapeBox(free, pageShape, handle))).toBeCloseTo(pageShape, 9);
  });

  it("keeps the opposite corner where it is when a corner is dragged", () => {
    const shaped = shapeBox(free, pageShape, "se");
    expect(shaped[0]).toBeCloseTo(free[0], 9);
    expect(shaped[3]).toBeCloseTo(free[3], 9);
    const other = shapeBox(free, pageShape, "nw");
    expect(other[2]).toBeCloseTo(free[2], 9);
    expect(other[1]).toBeCloseTo(free[1], 9);
  });

  it("keeps the opposite edge where it is when an edge is dragged, and moves the other two together", () => {
    const shaped = shapeBox(free, pageShape, "e");
    expect(shaped[0]).toBeCloseTo(free[0], 9);
    expect(shaped[2]).toBeCloseTo(free[2], 9);
    expect(mercatorY(shaped[1]) + mercatorY(shaped[3])).toBeCloseTo(mercatorY(free[1]) + mercatorY(free[3]), 12);
    const tall = shapeBox(free, pageShape, "n");
    expect(tall[1]).toBeCloseTo(free[1], 9);
    expect(tall[3]).toBeCloseTo(free[3], 9);
    expect(tall[0] + tall[2]).toBeCloseTo(free[0] + free[2], 9);
  });

  it("holds everything it held when grown, and nothing new when shrunk", () => {
    const around = shapeBox(free, pageShape, "around");
    expect(around[0]).toBeLessThanOrEqual(free[0] + 1e-9);
    expect(around[1]).toBeLessThanOrEqual(free[1] + 1e-9);
    expect(around[2]).toBeGreaterThanOrEqual(free[2] - 1e-9);
    expect(around[3]).toBeGreaterThanOrEqual(free[3] - 1e-9);
    const within = shapeBox(free, pageShape, "inside");
    expect(within[0]).toBeGreaterThanOrEqual(free[0] - 1e-9);
    expect(within[1]).toBeGreaterThanOrEqual(free[1] - 1e-9);
    expect(within[2]).toBeLessThanOrEqual(free[2] + 1e-9);
    expect(within[3]).toBeLessThanOrEqual(free[3] + 1e-9);
  });

  it("slides a box back off the 180° meridian and the top of the map without changing its shape", () => {
    const east = boxAtScale({ lat: 0, lon: 179.99 }, 250_000, a4.mapPixels);
    expect(east[2]).toBeCloseTo(180, 9);
    expect(east[0]).toBeLessThan(180);
    expect(shape(east)).toBeCloseTo(pageShape, 9);
    const north = boxAtScale({ lat: 85, lon: 0 }, 1_000_000, a4.mapPixels);
    expect(north[3]).toBeLessThanOrEqual(85.0511 + 1e-6);
    expect(shape(north)).toBeCloseTo(pageShape, 6);
  });

  it("moves a box without changing its size on the page", () => {
    const box = boxAtScale({ lat: 54.5, lon: -3.1 }, 50_000, a4.mapPixels);
    const moved = moveBox(box, { lat: 54.6, lon: -2.9 }, a4.mapPixels);
    expect(frameOfBox(moved, a4.mapPixels).zoom).toBeCloseTo(frameOfBox(box, a4.mapPixels).zoom, 9);
    expect(frameOfBox(moved, a4.mapPixels).center.lon).toBeCloseTo(-2.9, 9);
    expect(frameOfBox(moved, a4.mapPixels).center.lat).toBeCloseTo(54.6, 9);
  });
});
