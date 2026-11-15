import type { Bbox } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  CONTOUR_INTERVALS,
  CONTOUR_MAX_ZOOM,
  CONTOUR_MIN_ZOOM,
  CONTOUR_PROTOCOL,
  contourInterval,
  contourReach,
  contourTemplate,
  parseContourRequest,
} from "./contours";

describe("the height between contour lines", () => {
  it("is none at all while the map is too far out", () => {
    expect(contourInterval(0)).toBeNull();
    expect(contourInterval(CONTOUR_MIN_ZOOM - 1)).toBeNull();
  });

  it("gets finer as the map zooms in, and a zoom between two steps uses the one below", () => {
    expect(contourInterval(9)).toEqual({ interval: 200, index: 1000 });
    expect(contourInterval(10)).toEqual({ interval: 100, index: 500 });
    expect(contourInterval(11)).toEqual({ interval: 50, index: 250 });
    expect(contourInterval(12)).toEqual({ interval: 50, index: 250 });
    expect(contourInterval(13)).toEqual({ interval: 20, index: 100 });
    expect(contourInterval(14)).toEqual({ interval: 20, index: 100 });
    expect(contourInterval(15)).toEqual({ interval: 10, index: 50 });
    // Past the deepest tiles that are made, the last interval still stands.
    expect(contourInterval(19)).toEqual({ interval: 10, index: 50 });
  });

  it("puts an index line on every fifth line, at every zoom", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const [zoom, interval, index] of CONTOUR_INTERVALS) {
      expect(index / interval).toBe(5);
      expect(interval).toBeLessThan(previous);
      expect(zoom).toBeLessThanOrEqual(CONTOUR_MAX_ZOOM);
      previous = interval;
    }
  });
});

describe("contour tile addresses", () => {
  const source = { dem: "/api/maps/terrain/{z}/{x}/{y}.webp?v=k1", encoding: "terrarium" as const, maxZoom: 12 };

  it("carry where the terrain is, leaving only the tile's own numbers for the map to fill in", () => {
    const template = contourTemplate(source);
    expect(template.startsWith(`${CONTOUR_PROTOCOL}://local/{z}/{x}/{y}?`)).toBe(true);
    // The terrain template's braces are escaped, or the map would fill them in too.
    expect(template.match(/\{[zxy]\}/g)).toEqual(["{z}", "{x}", "{y}"]);
  });

  it("read back to the same terrain and the tile asked for", () => {
    const url = contourTemplate(source).replace("{z}", "13").replace("{x}", "4023").replace("{y}", "2619");
    expect(parseContourRequest(url)).toEqual({ z: 13, x: 4023, y: 2619, ...source });
  });

  it("refuse anything that is not terrain from Outpost's own maps API", () => {
    const address = (dem: string, rest = "encoding=terrarium&maxzoom=12") =>
      `${CONTOUR_PROTOCOL}://local/10/500/300?dem=${encodeURIComponent(dem)}&${rest}`;
    expect(parseContourRequest(address("/api/maps/terrain/{z}/{x}/{y}.webp"))).not.toBeNull();
    expect(parseContourRequest(address("https://example.com/{z}/{x}/{y}.png"))).toBeNull();
    expect(parseContourRequest(address("//example.com/api/maps/{z}/{x}/{y}.png"))).toBeNull();
    expect(parseContourRequest(address("/api/maps//example.com/{z}/{x}/{y}.png"))).toBeNull();
    expect(parseContourRequest(address("/api/maps/../settings/{z}/{x}/{y}"))).toBeNull();
    expect(parseContourRequest(address("/api/documents/{z}/{x}/{y}"))).toBeNull();
    expect(parseContourRequest(address("/api/maps/terrain/1/2/3.webp"))).toBeNull();
    expect(parseContourRequest(address("/api/maps/terrain/{z}/{x}/{y}.webp", "encoding=other&maxzoom=12"))).toBeNull();
    expect(parseContourRequest(address("/api/maps/terrain/{z}/{x}/{y}.webp", "encoding=terrarium&maxzoom=99"))).toBeNull();
    expect(parseContourRequest(address("/api/maps/terrain/{z}/{x}/{y}.webp", "encoding=terrarium"))).not.toBeNull();
    expect(parseContourRequest("outpost-tiles://local/api/maps/tiles/1/0/0.mvt")).toBeNull();
    // A tile that cannot exist at its zoom.
    expect(parseContourRequest(contourTemplate(source).replace("{z}", "2").replace("{x}", "4").replace("{y}", "0"))).toBeNull();
  });
});

describe("whether contour lines can be drawn where the map is looking", () => {
  const lakes: Bbox = [-3.6, 54.2, -2.7, 54.8];
  const britain: Bbox = [-8.65, 49.85, 1.77, 60.86];

  it("says so when no terrain is installed at all", () => {
    expect(contourReach({ bounds: lakes, zoom: 13 }, [])).toBe("no-terrain");
  });

  it("says so when terrain is installed, but somewhere else", () => {
    const paris: Bbox = [2.2, 48.8, 2.5, 48.95];
    expect(contourReach({ bounds: paris, zoom: 13 }, [britain])).toBe("no-terrain-here");
    // Touching at an edge is not covering.
    expect(contourReach({ bounds: [1.77, 50, 2, 51], zoom: 13 }, [britain])).toBe("no-terrain-here");
  });

  it("says to zoom in when terrain is there but the map is too far out", () => {
    expect(contourReach({ bounds: [-12, 48, 4, 62], zoom: 5.2 }, [britain])).toBe("too-far-out");
    expect(contourReach({ bounds: lakes, zoom: CONTOUR_MIN_ZOOM - 0.01 }, [britain])).toBe("too-far-out");
  });

  it("is satisfied when any installed terrain reaches into the view at a close enough zoom", () => {
    expect(contourReach({ bounds: lakes, zoom: CONTOUR_MIN_ZOOM }, [britain])).toBe("drawn");
    expect(contourReach({ bounds: [1.5, 50.8, 2.4, 51.2], zoom: 11 }, [[10, 40, 11, 41], britain])).toBe("drawn");
  });
});
