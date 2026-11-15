import type { MapSources } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { overlayLayers, overlaySources } from "../map/overlays";
import { CONTOUR_PROTOCOL, parseContourRequest } from "./contours";
import { FALLBACK_THEME } from "./palette";
import { BASE_LAYER_IDS, buildStyle, countryLabelPoints, SOURCE_IDS, type StyleInput, tunedFlavor } from "./style";

const origin = "http://outpost.local:8080";

const nothingInstalled: MapSources = {
  hasTiles: false,
  hasTerrain: false,
  sources: {},
  glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
  sprites: { light: "/map-assets/sprites/v4/light", dark: "/map-assets/sprites/v4/dark" },
  bounds: null,
  minZoom: 0,
  maxZoom: 0,
  attribution: "",
  attributions: [],
};

const installed: MapSources = {
  ...nothingInstalled,
  hasTiles: true,
  hasTerrain: true,
  sources: {
    basemap: {
      type: "vector",
      tiles: ["/api/maps/tiles/{z}/{x}/{y}.mvt"],
      minzoom: 0,
      maxzoom: 12,
      bounds: [-4.3, 52.52, -3.43, 53.29],
      attribution: "x",
    },
    terrain: {
      type: "raster-dem",
      tiles: ["/api/maps/terrain/{z}/{x}/{y}.webp"],
      minzoom: 0,
      maxzoom: 12,
      bounds: [-4.3, 52.52, -3.43, 53.29],
      tileSize: 512,
      encoding: "terrarium",
      attribution: "y",
    },
  },
  bounds: [-4.3, 52.52, -3.43, 53.29],
  maxZoom: 12,
};

const input = (overrides: Partial<StyleInput> = {}): StyleInput => ({
  sources: installed,
  flavour: "light",
  theme: FALLBACK_THEME.light,
  hillshade: false,
  origin,
  cacheKey: "k1",
  ...overrides,
});
const ids = (style: ReturnType<typeof buildStyle>) => style.layers.map((layer) => layer.id);

describe("buildStyle with nothing installed", () => {
  const style = buildStyle(input({ sources: nothingInstalled }));

  it("draws the outline map from the files shipped with the app, and nothing else", () => {
    expect(Object.keys(style.sources)).toEqual([SOURCE_IDS.land, SOURCE_IDS.countries, SOURCE_IDS.countryLabels]);
    expect(style.sources[SOURCE_IDS.land]).toMatchObject({ type: "geojson", data: `${origin}/world/land.json` });
    expect(style.sources[SOURCE_IDS.countries]).toMatchObject({ type: "geojson", data: `${origin}/world/countries.json` });
    expect(ids(style)).toEqual([BASE_LAYER_IDS.background, BASE_LAYER_IDS.land, BASE_LAYER_IDS.borders, BASE_LAYER_IDS.countryLabels]);
  });

  it("takes its colours from the theme", () => {
    expect(style.layers[0]).toMatchObject({ type: "background", paint: { "background-color": FALLBACK_THEME.light.water } });
    expect(style.layers[1]).toMatchObject({ paint: { "fill-color": FALLBACK_THEME.light.land } });
  });

  it("still draws while the list of sources has not arrived, or failed", () => {
    const waiting = buildStyle(input({ sources: undefined }));
    expect(ids(waiting)).toEqual(ids(style));
    expect(waiting.glyphs).toBe(`${origin}/map-assets/fonts/{fontstack}/{range}.pbf`);
    expect(waiting.sprite).toBe(`${origin}/map-assets/sprites/v4/light`);
  });
});

describe("buildStyle with a region installed", () => {
  const style = buildStyle(input());

  it("points the basemap at Outpost's own tile endpoint, through the tile protocol", () => {
    expect(style.sources[SOURCE_IDS.basemap]).toEqual({
      type: "vector",
      tiles: ["outpost-tiles://local/api/maps/tiles/{z}/{x}/{y}.mvt?v=k1"],
      minzoom: 0,
      maxzoom: 12,
      bounds: [-4.3, 52.52, -3.43, 53.29],
      sparse: true,
    });
  });

  it("serves glyphs and sprites from the same origin", () => {
    expect(style.glyphs).toBe(`${origin}/map-assets/fonts/{fontstack}/{range}.pbf`);
    expect(style.sprite).toBe(`${origin}/map-assets/sprites/v4/light`);
    expect(buildStyle(input({ flavour: "dark", theme: FALLBACK_THEME.dark })).sprite).toBe(`${origin}/map-assets/sprites/v4/dark`);
  });

  it("names nothing outside Outpost's origin", () => {
    const text = JSON.stringify(buildStyle(input({ hillshade: true })));
    const addresses = text.match(/[a-z][a-z0-9+.-]*:\/\/[^"\\]+/gi) ?? [];
    expect(addresses.length).toBeGreaterThan(4);
    for (const address of addresses) expect(address.startsWith(origin) || address.startsWith("outpost-tiles://local/api/maps/")).toBe(true);
  });

  it("keeps the outline map underneath and drops the Protomaps background that would hide it", () => {
    const layers = ids(style);
    expect(layers.slice(0, 4)).toEqual([BASE_LAYER_IDS.background, BASE_LAYER_IDS.land, BASE_LAYER_IDS.borders, "earth"]);
    expect(style.layers.filter((layer) => layer.type === "background")).toHaveLength(1);
    expect(layers).toContain("roads_highway");
    expect(layers).toContain("places_locality");
    expect(layers).toContain("pois");
    // With real place labels there is no need for the fallback country names.
    expect(layers).not.toContain(BASE_LAYER_IDS.countryLabels);
  });

  it("uses only the fonts that are shipped", () => {
    const fonts = new Set(JSON.stringify(style.layers).match(/Noto Sans[^"\]]*/g));
    expect([...fonts].sort()).toEqual(["Noto Sans Devanagari Regular v1", "Noto Sans Italic", "Noto Sans Medium", "Noto Sans Regular"]);
  });

  it("has unique layer ids, each with a source that exists", () => {
    const withOverlays = buildStyle(
      input({ hillshade: true, overlays: { sources: overlaySources({}), layers: overlayLayers(FALLBACK_THEME.light) } }),
    );
    const layers = ids(withOverlays);
    expect(new Set(layers).size).toBe(layers.length);
    for (const layer of withOverlays.layers) {
      if ("source" in layer && layer.source) expect(Object.keys(withOverlays.sources)).toContain(layer.source);
    }
    // Overlays sit on top of everything from the basemap.
    expect(layers.indexOf("o-markers")).toBeGreaterThan(layers.indexOf("places_country"));
    // The route being drawn is topmost, so its points can be taken hold of over anything else.
    expect(layers.indexOf("o-draw-points")).toBeGreaterThan(layers.indexOf("o-profile-point"));
    expect(layers.at(-1)).toBe("o-draw-label");
  });
});

describe("light and dark", () => {
  it("changes colours and sprite but not the shape of the style", () => {
    const light = buildStyle(input());
    const dark = buildStyle(input({ flavour: "dark", theme: FALLBACK_THEME.dark }));
    expect(ids(dark)).toEqual(ids(light));
    expect(Object.keys(dark.sources)).toEqual(Object.keys(light.sources));
    expect(dark.sources[SOURCE_IDS.basemap]).toEqual(light.sources[SOURCE_IDS.basemap]);
    expect(dark.layers[0]).toMatchObject({ paint: { "background-color": FALLBACK_THEME.dark.water } });
    expect(dark.layers.find((layer) => layer.id === "earth")).toMatchObject({ paint: { "fill-color": FALLBACK_THEME.dark.land } });
    expect(light.layers.find((layer) => layer.id === "earth")).toMatchObject({ paint: { "fill-color": FALLBACK_THEME.light.land } });
  });

  it("gives the detailed map the same land and water as the outline map", () => {
    const flavor = tunedFlavor("light", FALLBACK_THEME.light);
    expect(flavor.earth).toBe(FALLBACK_THEME.light.land);
    expect(flavor.water).toBe(FALLBACK_THEME.light.water);
    expect(flavor.city_label_halo).toBe(FALLBACK_THEME.light.land);
  });
});

describe("hill shading", () => {
  it("is added under the water, only when asked for and installed", () => {
    const shaded = buildStyle(input({ hillshade: true }));
    expect(shaded.sources[SOURCE_IDS.terrain]).toEqual({
      type: "raster-dem",
      tiles: [`${origin}/api/maps/terrain/{z}/{x}/{y}.webp?v=k1`],
      minzoom: 0,
      maxzoom: 12,
      bounds: [-4.3, 52.52, -3.43, 53.29],
      tileSize: 512,
      encoding: "terrarium",
    });
    const layers = ids(shaded);
    expect(layers.indexOf(BASE_LAYER_IDS.hillshade)).toBe(layers.indexOf("water") - 1);
    expect(shaded.layers.find((layer) => layer.id === BASE_LAYER_IDS.hillshade)).toMatchObject({
      type: "hillshade",
      source: SOURCE_IDS.terrain,
    });

    expect(ids(buildStyle(input({ hillshade: false })))).not.toContain(BASE_LAYER_IDS.hillshade);
    expect(buildStyle(input({ hillshade: false })).sources[SOURCE_IDS.terrain]).toBeUndefined();
    const noTerrain = buildStyle(
      input({ hillshade: true, sources: { ...installed, hasTerrain: false, sources: { basemap: installed.sources.basemap } } }),
    );
    expect(ids(noTerrain)).not.toContain(BASE_LAYER_IDS.hillshade);
  });
});

describe("contour lines", () => {
  const contoured = buildStyle(input({ contours: true }));
  const address = () => (contoured.sources[SOURCE_IDS.contours] as { tiles: string[] }).tiles[0]!;

  it("are a source of their own, traced from the installed terrain and nowhere else", () => {
    expect(contoured.sources[SOURCE_IDS.contours]).toMatchObject({
      type: "vector",
      minzoom: 9,
      maxzoom: 15,
      // No tile is asked for beyond the terrain there is.
      bounds: [-4.3, 52.52, -3.43, 53.29],
    });
    expect(address().startsWith(`${CONTOUR_PROTOCOL}://local/{z}/{x}/{y}?`)).toBe(true);
    const request = parseContourRequest(address().replace("{z}", "12").replace("{x}", "2000").replace("{y}", "1300"));
    expect(request).toEqual({
      z: 12,
      x: 2000,
      y: 1300,
      // The same tiles the hill shading reads, with the same key, so a new region shows up at once.
      dem: "/api/maps/terrain/{z}/{x}/{y}.webp?v=k1",
      encoding: "terrarium",
      maxZoom: 12,
    });
  });

  it("name nothing outside Outpost's origin", () => {
    const text = JSON.stringify(buildStyle(input({ hillshade: true, contours: true })));
    const addresses = text.match(/[a-z][a-z0-9+.-]*:\/\/[^"\\]+/gi) ?? [];
    expect(addresses.some((item) => item.startsWith(`${CONTOUR_PROTOCOL}://local/`))).toBe(true);
    for (const item of addresses)
      expect(
        item.startsWith(origin) ||
          item.startsWith("outpost-tiles://local/api/maps/") ||
          item.startsWith(`${CONTOUR_PROTOCOL}://local/{z}/{x}/{y}?dem=%2Fapi%2Fmaps%2F`),
      ).toBe(true);
  });

  it("do not need hill shading, and hill shading does not bring them", () => {
    expect(ids(contoured)).not.toContain(BASE_LAYER_IDS.hillshade);
    expect(contoured.sources[SOURCE_IDS.terrain]).toBeUndefined();
    const shaded = buildStyle(input({ hillshade: true }));
    expect(shaded.sources[SOURCE_IDS.contours]).toBeUndefined();
    expect(ids(shaded)).not.toContain(BASE_LAYER_IDS.contourLines);
  });

  it("are left out when no terrain is installed, however they are asked for", () => {
    const noTerrain = buildStyle(
      input({ contours: true, sources: { ...installed, hasTerrain: false, sources: { basemap: installed.sources.basemap } } }),
    );
    expect(noTerrain.sources[SOURCE_IDS.contours]).toBeUndefined();
    expect(ids(noTerrain).filter((id) => id.startsWith("contour"))).toEqual([]);
    expect(ids(buildStyle(input({ contours: true, sources: undefined }))).filter((id) => id.startsWith("contour"))).toEqual([]);
  });

  it("lie over the shaded land and under water and roads, with their heights under every other name", () => {
    const both = buildStyle(input({ hillshade: true, contours: true }));
    const layers = ids(both);
    const at = (id: string) => layers.indexOf(id);
    expect(at(BASE_LAYER_IDS.contourLines)).toBe(at(BASE_LAYER_IDS.hillshade) + 1);
    expect(at(BASE_LAYER_IDS.contourIndexLines)).toBe(at(BASE_LAYER_IDS.contourLines) + 1);
    expect(at("water")).toBe(at(BASE_LAYER_IDS.contourIndexLines) + 1);
    expect(at(BASE_LAYER_IDS.contourLabels)).toBeGreaterThan(at("roads_highway"));
    // The first thing written on the map, so every name placed after it takes the room first.
    expect(both.layers.findIndex((layer) => layer.type === "symbol")).toBe(at(BASE_LAYER_IDS.contourLabels));
    expect(both.layers[at(BASE_LAYER_IDS.contourLabels) + 1]?.type).toBe("symbol");
    expect(new Set(layers).size).toBe(layers.length);
  });

  it("draw index lines heavier and write the height in metres on them, in the theme's colour", () => {
    const layer = (id: string) =>
      contoured.layers.find((item) => item.id === id) as {
        filter: unknown;
        paint: Record<string, unknown>;
        layout: Record<string, unknown>;
      };
    const lines = layer(BASE_LAYER_IDS.contourLines);
    const index = layer(BASE_LAYER_IDS.contourIndexLines);
    const labels = layer(BASE_LAYER_IDS.contourLabels);
    expect(lines.paint["line-color"]).toBe(FALLBACK_THEME.light.contour);
    expect(index.paint["line-color"]).toBe(FALLBACK_THEME.light.contour);
    const widthAt13 = (paint: Record<string, unknown>) => (paint["line-width"] as unknown[])[6] as number;
    expect(widthAt13(index.paint)).toBeGreaterThan(widthAt13(lines.paint) * 1.5);
    expect(index.paint["line-opacity"]).toBeGreaterThan(lines.paint["line-opacity"] as number);
    // Index lines and only index lines carry a label, and sea level carries no line at all.
    expect(JSON.stringify(index.filter)).toBe('["all",["==",["get","level"],1],["!=",["get","ele"],0]]');
    expect(labels.filter).toEqual(index.filter);
    expect(JSON.stringify(lines.filter)).toBe('["all",["!",["==",["get","level"],1]],["!=",["get","ele"],0]]');
    expect(labels.layout["text-field"]).toEqual(["concat", ["to-string", ["get", "ele"]], " m"]);
    expect(labels.layout["symbol-placement"]).toBe("line");
    expect(labels.paint).toMatchObject({ "text-color": FALLBACK_THEME.light.contour, "text-halo-color": FALLBACK_THEME.light.land });

    const dark = buildStyle(input({ contours: true, flavour: "dark", theme: FALLBACK_THEME.dark }));
    expect(dark.layers.find((item) => item.id === BASE_LAYER_IDS.contourLines)).toMatchObject({
      paint: { "line-color": FALLBACK_THEME.dark.contour },
    });
  });

  it("still draw over the outline map when terrain is installed without a detailed map", () => {
    const terrainOnly = buildStyle(
      input({ contours: true, sources: { ...installed, hasTiles: false, sources: { terrain: installed.sources.terrain } } }),
    );
    const layers = ids(terrainOnly);
    expect(layers.indexOf(BASE_LAYER_IDS.contourLines)).toBeGreaterThan(layers.indexOf(BASE_LAYER_IDS.borders));
    expect(layers.indexOf(BASE_LAYER_IDS.contourLabels)).toBeGreaterThan(layers.indexOf(BASE_LAYER_IDS.contourIndexLines));
  });
});

describe("cache key", () => {
  it("changes the tile address when the installed regions change", () => {
    const before = buildStyle(input({ cacheKey: "a" })).sources[SOURCE_IDS.basemap];
    const after = buildStyle(input({ cacheKey: "b" })).sources[SOURCE_IDS.basemap];
    expect(before).not.toEqual(after);
  });
});

describe("countryLabelPoints", () => {
  it("gives one point per country, in its largest piece", () => {
    const square = (x: number, y: number, size: number) => [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ];
    const labels = countryLabelPoints({
      features: [
        {
          type: "Feature",
          properties: { name: "Mainland and island" },
          geometry: { type: "MultiPolygon", coordinates: [square(100, 0, 1), square(0, 0, 10)] },
        },
        { type: "Feature", properties: { name: "Square" }, geometry: { type: "Polygon", coordinates: square(20, 40, 2) } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: square(0, 0, 1) } },
      ],
    });
    expect(labels.features.map((feature) => [feature.properties.name, feature.geometry.coordinates])).toEqual([
      ["Mainland and island", [5, 5]],
      ["Square", [21, 41]],
    ]);
    expect(labels.features[0]!.properties.rank).toBeGreaterThan(labels.features[1]!.properties.rank);
  });
});
