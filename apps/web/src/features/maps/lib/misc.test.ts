import type { MarkerDto, PlaceDto, TrackDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { boxData, coverageData, markersData, measureData, tracksData } from "../map/overlays";
import { creditsFor } from "../map-footer";
import { parseAttribution } from "./attribution";
import { mixOklch, oklchToHex, parseOklch, tokenToHex } from "./color";
import { formatPosition, gridFiguresFor } from "./coords";
import { MARKER_HEX } from "./palette";
import { buildSearchResults, fold, placeDetail } from "./search";
import { coordinateDigits, isCameraView, parseView, withView } from "./view";

describe("token colours", () => {
  it("parses OKLCH as the browser reports it", () => {
    expect(parseOklch("oklch(0.45 0.074 200)")).toEqual({ l: 0.45, c: 0.074, h: 200 });
    expect(parseOklch(" oklch(45% 0.074 200 / 0.5) ")).toEqual({ l: 0.45, c: 0.074, h: 200 });
    expect(parseOklch("#fff")).toBeNull();
  });

  it("converts to sRGB", () => {
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe("#ffffff");
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe("#000000");
    // The verdigris primary: a deep teal.
    const primary = oklchToHex({ l: 0.45, c: 0.074, h: 200 });
    const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(primary.slice(start, start + 2), 16)) as [number, number, number];
    expect(green).toBeGreaterThan(red + 60);
    expect(blue).toBeGreaterThan(red + 60);
    expect(Math.abs(green - blue)).toBeLessThan(25);
  });

  it("mixes, taking hue the short way round", () => {
    expect(mixOklch({ l: 0, c: 0, h: 350 }, { l: 1, c: 0.2, h: 10 }, 0.5)).toEqual({ l: 0.5, c: 0.1, h: 0 });
  });

  it("falls back when a token cannot be read", () => {
    expect(tokenToHex("", "#123456")).toBe("#123456");
    expect(tokenToHex("#ABCDEF", "#123456")).toBe("#abcdef");
    expect(tokenToHex("oklch(1 0 0)", "#123456")).toBe("#ffffff");
  });
});

describe("camera in the address", () => {
  it("reads a whole view and nothing less", () => {
    expect(parseView(new URLSearchParams("lat=53.0685&lon=-4.0763&z=12"))).toEqual({ lat: 53.0685, lon: -4.0763, zoom: 12 });
    expect(parseView(new URLSearchParams("lat=53.0685&lon=-4.0763"))).toEqual({ lat: 53.0685, lon: -4.0763, zoom: 12 });
    expect(parseView(new URLSearchParams("lat=53.0685"))).toBeNull();
    expect(parseView(new URLSearchParams("lat=95&lon=0&z=3"))).toBeNull();
    expect(parseView(new URLSearchParams("lat=10&lon=10&z=99"))).toBeNull();
    expect(parseView(new URLSearchParams("lat=abc&lon=10&z=3"))).toBeNull();
    expect(parseView(new URLSearchParams("marker=abc"))).toBeNull();
  });

  it("writes the view at a precision that suits the zoom, keeping other parameters", () => {
    expect(withView(new URLSearchParams("tab=x"), { lat: 53.06851234, lon: -4.07631234, zoom: 12.3456 }).toString()).toBe(
      "tab=x&lat=53.06851&lon=-4.07631&z=12.35",
    );
    expect(withView(new URLSearchParams(), { lat: 54.6, lon: -3.6, zoom: 4 }).toString()).toBe("lat=54.60&lon=-3.60&z=4");
    expect(coordinateDigits(0)).toBe(2);
    expect(coordinateDigits(19)).toBe(6);
  });

  it("round-trips", () => {
    const view = { lat: 53.06851, lon: -4.07631, zoom: 12.35 };
    expect(parseView(withView(new URLSearchParams(), view))).toEqual(view);
  });

  it("checks what comes back from storage", () => {
    expect(isCameraView({ lat: 1, lon: 2, zoom: 3 })).toBe(true);
    expect(isCameraView({ lat: 1, lon: 2 })).toBe(false);
    expect(isCameraView({ lat: 100, lon: 2, zoom: 3 })).toBe(false);
    expect(isCameraView(null)).toBe(false);
  });
});

describe("coordinate readout", () => {
  it("formats in the chosen way", () => {
    expect(formatPosition(53.0685, -4.0763, "decimal").text).toBe("53.06850, -4.07630");
    expect(formatPosition(53.0685, -4.0763, "dms").text).toBe("53°04′06.6″N 4°04′34.7″W");
    expect(formatPosition(53.0685, -4.0763, "osgb")).toEqual({ text: "SH 6098 5437", format: "osgb" });
  });

  it("falls back to decimal degrees outside the British grid", () => {
    expect(formatPosition(46.5, 8.0, "osgb")).toEqual({ text: "46.50000, 8.00000", format: "decimal" });
  });

  it("claims no more precision than a pixel covers", () => {
    expect(formatPosition(53.0685, -4.0763, "osgb", 6).text).toBe("SH 60 54");
    expect(formatPosition(53.0685, -4.0763, "osgb", 9).text).toBe("SH 609 543");
    expect(formatPosition(53.0685, -4.0763, "osgb", 12).text).toBe("SH 6098 5437");
    expect(formatPosition(53.0685, -4.0763, "decimal", 6).text).toBe("53.069, -4.076");
    expect(formatPosition(53.0685, -4.0763, "dms", 6).text).toBe("53°04′07″N 4°04′35″W");
    expect(gridFiguresFor(1)).toBe(10);
  });
});

describe("credits", () => {
  it("reads the server's credit strings into text and links", () => {
    expect(
      parseAttribution('<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>'),
    ).toEqual([
      { text: "Protomaps", href: "https://protomaps.com/" },
      { text: " © " },
      { text: "OpenStreetMap", href: "https://openstreetmap.org/" },
    ]);
    expect(parseAttribution('Place names: <a href="https://www.geonames.org">GeoNames</a> (CC BY 4.0)')).toEqual([
      { text: "Place names: " },
      { text: "GeoNames", href: "https://www.geonames.org/" },
      { text: " (CC BY 4.0)" },
    ]);
  });

  it("never passes markup or unsafe links through", () => {
    expect(parseAttribution('<a href="javascript:alert(1)">x</a><script>alert(2)</script><img src=x onerror=1> &amp; done')).toEqual([
      { text: "x" },
      { text: "alert(2) & done" },
    ]);
    expect(parseAttribution("")).toEqual([]);
  });

  it("credits the terrain only while something is drawn from it", () => {
    const attributions = [
      { name: "Protomaps", html: '<a href="https://protomaps.com">Protomaps</a>', license: "ODbL", url: "https://protomaps.com" },
      {
        name: "Mapterhorn",
        html: '© <a href="https://mapterhorn.com/attribution">Mapterhorn</a>',
        license: "Various",
        url: "https://mapterhorn.com",
      },
    ];
    // Hill shading, contour lines or both: the screen passes one answer for "is terrain on the map".
    expect(creditsFor(attributions, { hasTiles: true, terrain: true }).map((credit) => credit.key)).toEqual([
      "Protomaps",
      "Mapterhorn",
      "natural-earth",
    ]);
    expect(creditsFor(attributions, { hasTiles: true, terrain: false }).map((credit) => credit.key)).toEqual([
      "Protomaps",
      "natural-earth",
    ]);
  });
});

const marker = (id: string, name: string, extra: Partial<MarkerDto> = {}): MarkerDto => ({
  id,
  name,
  note: "",
  lat: 53.07,
  lon: -4.08,
  color: "teal",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const track = (id: string, name: string, extra: Partial<TrackDto> = {}): TrackDto => ({
  id,
  name,
  description: "",
  color: "red",
  sourceFilename: null,
  distanceMeters: 6690,
  ascentMeters: 970,
  pointCount: 81,
  bounds: [-4.12, 53.06, -4.07, 53.12],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const place = (id: number, name: string, extra: Partial<PlaceDto> = {}): PlaceDto => ({
  id,
  name,
  country: "GB",
  admin1: "WLS",
  featureCode: "MT",
  kindLabel: "Mountain",
  lat: 53.0685,
  lon: -4.0763,
  population: 0,
  elevation: 1085,
  ...extra,
});

describe("search results", () => {
  it("lists a typed position first, then the person's own things, then place names", () => {
    const results = buildSearchResults({
      query: "Snow",
      coordinate: null,
      places: [
        place(1, "Snowdon"),
        place(2, "Snowshill", { country: "GB", admin1: "ENG", kindLabel: "Village", elevation: null, lat: 52, lon: -1.86 }),
      ],
      markers: [marker("m1", "Snowdon summit cafe", { isFavorite: true }), marker("m2", "Car park")],
      tracks: [track("t1", "Snowdon by the Llanberis path"), track("t2", "Fairfield")],
      center: { lat: 53.0685, lon: -4.0763 },
    });
    expect(results.map((result) => [result.kind, result.title])).toEqual([
      ["marker", "Snowdon summit cafe"],
      ["track", "Snowdon by the Llanberis path"],
      ["place", "Snowdon"],
      ["place", "Snowshill"],
    ]);
    expect(results[0]!.detail).toBe("Saved place · favourite");
    expect(results[1]!.detail).toBe("Route · 6.69 km, 970 m of ascent");
    expect(results[2]!.detail).toBe("Mountain · 1,085 m · Wales, United Kingdom");
    expect(results[3]!.detail).toBe("Village · England, United Kingdom");
    expect(results[2]!.distance).toBeCloseTo(0, 5);
    expect(results[3]!.distance).toBeGreaterThan(150_000);
  });

  it("shows coordinates and grid references as results of their own", () => {
    const grid = buildSearchResults({
      query: "sh 609 543",
      coordinate: { lat: 53.0685, lon: -4.0765, format: "osgb", precisionMeters: 100 },
      places: [],
      markers: [],
      tracks: [],
      center: null,
    });
    expect(grid).toHaveLength(1);
    expect(grid[0]).toMatchObject({ kind: "coordinate", title: "SH 609 543", distance: null });
    expect(grid[0]!.detail).toBe("Grid reference, the middle of a 100 m square · 53.06850, -4.07650");

    const decimal = buildSearchResults({
      query: "53.0685, -4.0763",
      coordinate: { lat: 53.0685, lon: -4.0763, format: "decimal" },
      places: [],
      markers: [],
      tracks: [],
      center: null,
    });
    expect(decimal[0]).toMatchObject({ title: "53.06850, -4.07630", detail: "Coordinates · grid reference SH 6098 5437" });
  });

  it("matches names without regard to case or accents", () => {
    expect(fold("  Zürich ")).toBe("zurich");
    const results = buildSearchResults({
      query: "CAFE",
      coordinate: null,
      places: [],
      markers: [marker("m1", "Café at the col")],
      tracks: [],
      center: null,
    });
    expect(results.map((result) => result.title)).toEqual(["Café at the col"]);
  });

  it("is empty for empty text, and limits the person's own matches", () => {
    expect(
      buildSearchResults({ query: "  ", coordinate: null, places: [], markers: [marker("m1", "a")], tracks: [], center: null }),
    ).toEqual([]);
    const many = Array.from({ length: 9 }, (_, index) => marker(`m${index}`, `Bothy ${index}`));
    expect(buildSearchResults({ query: "bothy", coordinate: null, places: [], markers: many, tracks: [], center: null })).toHaveLength(4);
  });

  it("names a place's kind, height and country", () => {
    expect(placeDetail(place(3, "Reykjavík", { country: "IS", admin1: "39", kindLabel: "City", elevation: null }))).toBe("City · Iceland");
  });
});

describe("overlay data", () => {
  it("leaves the place being edited to its pin", () => {
    const data = markersData([marker("m1", "A"), marker("m2", "B", { color: "amber", isFavorite: true })], "m1");
    expect(data.features).toEqual([
      {
        type: "Feature",
        properties: { id: "m2", name: "B", color: MARKER_HEX.amber, favourite: true },
        geometry: { type: "Point", coordinates: [-4.08, 53.07] },
      },
    ]);
  });

  it("draws each track as lines with a start and an end", () => {
    const geojson = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [-4.12, 53.12, 115],
              [-4.08, 53.07, 1085],
            ],
          },
        },
      ],
    };
    const { lines, ends } = tracksData(
      [
        { ...track("t1", "Up"), geojson },
        { ...track("t2", "Empty"), geojson: { type: "FeatureCollection", features: [] } },
      ],
      "t1",
    );
    expect(lines.features).toHaveLength(1);
    expect(lines.features[0]).toMatchObject({
      properties: { id: "t1", color: MARKER_HEX.red, selected: true },
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [-4.12, 53.12],
            [-4.08, 53.07],
          ],
        ],
      },
    });
    expect(ends.features.map((feature) => [feature.properties.end, feature.geometry.coordinates])).toEqual([
      ["start", [-4.12, 53.12]],
      ["end", [-4.08, 53.07]],
    ]);
  });

  it("labels each measured point after the first with the running total", () => {
    expect(measureData([]).features).toEqual([]);
    const data = measureData([
      { lat: 53, lon: -4 },
      { lat: 53.01, lon: -4 },
      { lat: 53.02, lon: -4 },
    ]);
    expect(data.features.map((feature) => [feature.geometry.type, feature.properties.label])).toEqual([
      ["LineString", undefined],
      ["Point", undefined],
      ["Point", "1.11 km"],
      ["Point", "2.22 km"],
    ]);
  });

  it("outlines installed map regions, but not terrain or the whole world", () => {
    const region = {
      id: "r1",
      regionId: null,
      name: "Snowdonia",
      tileType: "vector" as const,
      bounds: [-4.3, 52.52, -3.43, 53.29] as [number, number, number, number],
      minZoom: 0,
      maxZoom: 12,
      sizeBytes: 1,
      sourceBuild: null,
      installedAt: 1,
      locationId: "l",
      locationName: "L",
      available: true,
      status: "installed" as const,
    };
    const data = coverageData([
      region,
      { ...region, id: "r2", tileType: "terrain" },
      { ...region, id: "r3", bounds: [-180, -85, 180, 85] },
    ]);
    expect(data.features.map((feature) => [feature.properties.id, feature.geometry.type])).toEqual([
      ["r1", "Polygon"],
      ["r1", "Point"],
    ]);
    expect(boxData(null).features).toEqual([]);
    expect(boxData([0, 0, 1, 1]).features[0]!.geometry.coordinates).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);
  });
});
