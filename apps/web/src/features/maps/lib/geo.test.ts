import { describe, expect, it } from "vitest";
import {
  boxFromCorners,
  circleRing,
  countTiles,
  formatBbox,
  formatBboxSize,
  formatBearing,
  formatDistance,
  formatDistanceWithMiles,
  formatHeight,
  initialBearing,
  isValidBbox,
  metersPerPixel,
  scaleBar,
  wrapLongitude,
} from "./geo";

describe("boxFromCorners", () => {
  it("orders the corners whichever way the box was dragged", () => {
    const expected = { ok: true, bbox: [-4.3, 52.52, -3.43, 53.29] };
    expect(boxFromCorners({ lat: 53.29, lon: -3.43 }, { lat: 52.52, lon: -4.3 })).toEqual(expected);
    expect(boxFromCorners({ lat: 52.52, lon: -4.3 }, { lat: 53.29, lon: -3.43 })).toEqual(expected);
    expect(boxFromCorners({ lat: 52.52, lon: -3.43 }, { lat: 53.29, lon: -4.3 })).toEqual(expected);
  });

  it("clamps latitudes to the edge of the map", () => {
    const result = boxFromCorners({ lat: 89, lon: 10 }, { lat: -89, lon: 20 });
    expect(result).toEqual({ ok: true, bbox: [10, -85.0511, 20, 85.0511] });
  });

  it("refuses a box that crosses the 180° meridian", () => {
    expect(boxFromCorners({ lat: -20, lon: 170 }, { lat: -10, lon: 190 })).toEqual({ ok: false, reason: "antimeridian" });
    expect(boxFromCorners({ lat: -20, lon: -185 }, { lat: -10, lon: -170 })).toEqual({ ok: false, reason: "antimeridian" });
  });

  it("brings a box drawn on a repeated world back into range", () => {
    expect(boxFromCorners({ lat: 10, lon: 370 }, { lat: 20, lon: 380 })).toEqual({ ok: true, bbox: [10, 10, 20, 20] });
  });

  it("treats a drag across the whole width as the whole world", () => {
    expect(boxFromCorners({ lat: -10, lon: -200 }, { lat: 10, lon: 200 })).toEqual({ ok: true, bbox: [-180, -10, 180, 10] });
  });

  it("refuses a click without a drag", () => {
    expect(boxFromCorners({ lat: 53, lon: -4 }, { lat: 53, lon: -4 })).toEqual({ ok: false, reason: "too-small" });
  });

  it("rounds to five decimal places, about a metre", () => {
    const result = boxFromCorners({ lat: 53.123456789, lon: -4.987654321 }, { lat: 53.2, lon: -4.9 });
    expect(result).toEqual({ ok: true, bbox: [-4.98765, 53.12346, -4.9, 53.2] });
  });
});

describe("boxes", () => {
  it("wraps longitudes", () => {
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-190)).toBe(170);
    expect(wrapLongitude(180)).toBe(180);
    expect(wrapLongitude(-3.5)).toBe(-3.5);
  });

  it("validates", () => {
    expect(isValidBbox([-4.3, 52.52, -3.43, 53.29])).toBe(true);
    expect(isValidBbox([-3.43, 52.52, -4.3, 53.29])).toBe(false);
    expect(isValidBbox([-200, 52.52, -4.3, 53.29])).toBe(false);
    expect(isValidBbox([0, 10, 5, Number.NaN])).toBe(false);
  });

  it("describes a box in words", () => {
    expect(formatBbox([-4.3, 52.52, -3.43, 53.29])).toBe("52.52°N to 53.29°N, 4.30°W to 3.43°W");
    expect(formatBboxSize([-4.3, 52.52, -3.43, 53.29])).toBe("58 × 86 km");
    expect(formatBboxSize([-180, -85.0511, 180, 85.0511])).toBe("The whole world");
  });

  it("counts tiles the way the server does", () => {
    expect(countTiles([-180, -85.0511, 180, 85.0511], 0, 0)).toBe(1);
    expect(countTiles([-180, -85.0511, 180, 85.0511], 0, 2)).toBe(1 + 4 + 16);
    // A small box touches one tile per zoom until it is deep enough to span several.
    expect(countTiles([-4.1, 53.05, -4.05, 53.08], 0, 6)).toBe(7);
    expect(countTiles([-180, -85.0511, 180, 85.0511], 0, 12)).toBeGreaterThan(20_000_000);
  });
});

describe("bearings and distances", () => {
  it("gives compass bearings", () => {
    expect(initialBearing({ lat: 53, lon: -4 }, { lat: 54, lon: -4 })).toBeCloseTo(0, 5);
    expect(initialBearing({ lat: 53, lon: -4 }, { lat: 52, lon: -4 })).toBeCloseTo(180, 5);
    expect(initialBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 5);
    expect(initialBearing({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 5);
  });

  it("names bearings", () => {
    expect(formatBearing(0)).toBe("0° N");
    expect(formatBearing(359.7)).toBe("0° N");
    expect(formatBearing(284)).toBe("284° WNW");
    expect(formatBearing(45)).toBe("45° NE");
  });

  it("formats distances in metric, with miles on request", () => {
    expect(formatDistance(420)).toBe("420 m");
    expect(formatDistance(999.4)).toBe("999 m");
    expect(formatDistance(999.6)).toBe("1.00 km");
    expect(formatDistance(3420)).toBe("3.42 km");
    expect(formatDistance(17_432)).toBe("17.4 km");
    expect(formatDistance(214_000)).toBe("214 km");
    expect(formatDistance(2_140_000)).toBe("2,140 km");
    expect(formatDistanceWithMiles(3420)).toBe("3.42 km (2.13 mi)");
    expect(formatDistanceWithMiles(1609.344)).toBe("1.61 km (1.00 mi)");
    expect(formatHeight(1045.6)).toBe("1,046 m");
  });
});

describe("scale bar", () => {
  it("picks a round distance that fits", () => {
    expect(scaleBar(10, 100)).toEqual({ meters: 1000, width: 100, label: "1 km" });
    expect(scaleBar(7.3, 96)).toMatchObject({ meters: 500, label: "500 m" });
    expect(scaleBar(250, 96)).toMatchObject({ meters: 20_000, label: "20 km" });
    expect(scaleBar(0, 96).width).toBe(0);
  });

  it("knows the ground size of a pixel", () => {
    // MapLibre's zoom 0 is one 512 px tile for the whole equator.
    expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.5, 0);
    expect(metersPerPixel(60, 10)).toBeCloseTo(78_271.5 / 1024 / 2, 1);
  });
});

describe("circleRing", () => {
  it("closes, and stays the radius away from the centre", () => {
    const ring = circleRing({ lat: 53, lon: -4 }, 1000, 12);
    expect(ring).toHaveLength(13);
    expect(ring[0]).toEqual(ring[12]);
    // North point: about 0.009° of latitude per kilometre.
    expect(ring[0]![1] - 53).toBeCloseTo(0.009, 3);
  });
});
