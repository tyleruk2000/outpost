import type { Bbox, InstalledRegion, MapSources, MarkerDto, TrackDto, TrackWithGeometryDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { FALLBACK_THEME } from "../lib/palette";
import { BASE_LAYER_IDS, SOURCE_IDS } from "../lib/style";
import { creditsFor } from "../map-footer";
import { printedAddress, printedCredits } from "./credits";
import { graticule } from "./graticule";
import { overlayOn, PRINT_OVERLAYS, type PrintContext, type PrintOverlay, type PrintSelection, partsOn, printStyle } from "./overlays";
import { pageGeometry } from "./paper";
import { boxAtScale, frameOfBox } from "./scale";

const a4 = pageGeometry("a4", "portrait");
const bbox = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, a4.mapPixels);
const WORLD: Bbox = [-180, -85, 180, 85];

const ATTRIBUTIONS = [
  {
    name: "Protomaps, OpenStreetMap",
    html: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    license: "ODbL 1.0",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "Mapterhorn",
    html: '© <a href="https://mapterhorn.com/attribution">Mapterhorn</a>',
    license: "Various",
    url: "https://mapterhorn.com/attribution",
  },
];

const sources: MapSources = {
  hasTiles: true,
  hasTerrain: true,
  sources: {
    basemap: { type: "vector", tiles: ["/api/maps/tiles/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 14, bounds: WORLD, attribution: "" },
    terrain: {
      type: "raster-dem",
      tiles: ["/api/maps/terrain/{z}/{x}/{y}.webp"],
      minzoom: 0,
      maxzoom: 12,
      bounds: WORLD,
      tileSize: 512,
      encoding: "terrarium",
      attribution: "",
    },
  },
  glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
  sprites: { light: "/map-assets/sprites/v4/light" },
  bounds: WORLD,
  minZoom: 0,
  maxZoom: 14,
  attribution: "",
  attributions: ATTRIBUTIONS,
};

const region = (tileType: "vector" | "terrain", maxZoom: number): InstalledRegion => ({
  id: tileType,
  regionId: null,
  name: tileType,
  tileType,
  bounds: WORLD,
  minZoom: 0,
  maxZoom,
  sizeBytes: 1,
  sourceBuild: null,
  installedAt: 1,
  locationId: "l",
  locationName: "Internal storage",
  available: true,
  status: "installed",
});

const marker = (id: string, lat: number, lon: number): MarkerDto => ({
  id,
  name: id,
  note: "",
  lat,
  lon,
  color: "teal",
  isFavorite: false,
  noteId: null,
  createdAt: 0,
  updatedAt: 0,
});

const track = (id: string, bounds: Bbox): TrackDto => ({
  id,
  name: `Route ${id}`,
  description: "",
  color: "red",
  sourceFilename: null,
  distanceMeters: 1,
  ascentMeters: null,
  pointCount: 2,
  bounds,
  createdAt: 0,
  updatedAt: 0,
});
const lines = (item: TrackDto): TrackWithGeometryDto => ({
  ...item,
  geojson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [item.bounds![0], item.bounds![1]],
            [item.bounds![2], item.bounds![3]],
          ],
        },
      },
    ],
  },
});

const here = track("a", [-3.11, 54.49, -3.09, 54.51]);
const hidden = track("b", [-3.12, 54.495, -3.1, 54.505]);
const elsewhere = track("c", [10, 10, 11, 11]);

function context(change: Partial<PrintContext> = {}): PrintContext {
  return {
    bbox,
    zoom: frameOfBox(bbox, a4.mapPixels).zoom,
    theme: FALLBACK_THEME.light,
    sources,
    regions: [region("vector", 14), region("terrain", 12)],
    markers: [marker("in", 54.5, -3.1), marker("out", 10, 10)],
    tracks: [here, hidden, elsewhere],
    geometries: [lines(here), lines(hidden)],
    graticule: graticule(bbox, a4.map, "dms"),
    live: { hillshade: true, contours: false, hiddenTracks: ["b"] },
    ...change,
  };
}

const nothing: PrintSelection = { overlays: {}, parts: {} };
const base = { origin: "http://outpost.test", cacheKey: "k" };
const overlay = (id: string) => PRINT_OVERLAYS.find((item) => item.id === id)!;
const layerIds = (style: { layers: Array<{ id: string }> }) => style.layers.map((layer) => layer.id);
const data = (style: ReturnType<typeof printStyle>["style"], source: string) =>
  (style.sources[source] as unknown as { data: { features: Array<{ properties: Record<string, unknown> }> } }).data.features;

describe("what can be put on a printed map", () => {
  it("starts from what the map on screen shows", () => {
    const on = (id: string) => overlayOn(overlay(id), context(), nothing);
    expect(on("names")).toBe(true);
    expect(on("hillshade")).toBe(true);
    expect(on("contours")).toBe(false);
    expect(on("routes")).toBe(true);
    expect(on("places")).toBe(true);
    expect(on("graticule")).toBe(false);
    // Only the route showing on screen starts ticked; the hidden one is offered, the distant one is not.
    expect(overlay("routes").parts!(context())).toEqual([
      { id: "a", label: "Route a", initially: true },
      { id: "b", label: "Route b", initially: false },
    ]);
    expect([...partsOn(overlay("routes"), context(), nothing)]).toEqual(["a"]);
  });

  it("says why something cannot be drawn, and leaves it off whatever is ticked", () => {
    const flat = context({ regions: [region("vector", 14)] });
    expect(overlay("contours").unavailable!(flat)).toBe("No terrain is downloaded, so there is nothing to draw this from.");
    expect(overlayOn(overlay("contours"), flat, { overlays: { contours: true }, parts: {} })).toBe(false);

    const far: PrintContext = { ...context(), zoom: 7.5 };
    // Contour lines start at zoom 9, which at 54.5°N is 40,075,016.686 × cos 54.5° / (512 × 2⁹) = 88.77 m to a map
    // pixel, and a map pixel is 0.0254 / 120 m of paper: 1:419,000.
    expect(overlay("contours").unavailable!(far)).toBe(
      "Not drawn at this scale: there would be too many to read. They appear from about 1:419,000.",
    );
    expect(overlay("hillshade").unavailable!(far)).toBeUndefined();

    expect(overlay("routes").unavailable!(context({ tracks: [elsewhere] }))).toBe("None of your routes crosses this area.");
    expect(overlay("routes").unavailable!(context({ tracks: [] }))).toBe("You have no routes yet.");
    expect(overlay("places").unavailable!(context({ markers: [marker("out", 10, 10)] }))).toBe(
      "None of your saved places is in this area.",
    );
    expect(overlay("places").hint!(context())).toBe("1 place in this area.");
    expect(overlay("contours").hint!(context())).toMatch(/^Every 20 m, heavier and with its height every 100 m\./);
  });

  it("builds a light style with only what is ticked switched on", () => {
    const { style, usesTerrain } = printStyle(context(), nothing, PRINT_OVERLAYS, base);
    expect(style.name).toBe("Outpost light");
    expect(usesTerrain).toBe(true);
    expect(layerIds(style)).toContain(BASE_LAYER_IDS.hillshade);
    expect(layerIds(style)).not.toContain(BASE_LAYER_IDS.contourLines);
    expect(layerIds(style)).not.toContain("print-graticule");
    // The saved place on the page and the route showing on screen; nothing else is given any data.
    expect(data(style, "o-markers").map((feature) => feature.properties.id)).toEqual(["in"]);
    expect(data(style, "o-tracks").map((feature) => feature.properties.id)).toEqual(["a"]);
    for (const empty of ["o-box", "o-measure", "o-draw", "o-location", "o-coverage", "o-profile"]) expect(data(style, empty)).toEqual([]);
    // No route is "selected" on paper.
    expect(data(style, "o-tracks")[0]!.properties.selected).toBe(false);
  });

  it("follows the ticks", () => {
    const selection: PrintSelection = {
      overlays: { names: false, hillshade: false, contours: true, places: false, graticule: true },
      parts: { routes: { a: false, b: true } },
    };
    const { style, usesTerrain } = printStyle(context(), selection, PRINT_OVERLAYS, base);
    expect(usesTerrain).toBe(true);
    expect(layerIds(style)).not.toContain(BASE_LAYER_IDS.hillshade);
    expect(layerIds(style)).toEqual(expect.arrayContaining([BASE_LAYER_IDS.contourLines, BASE_LAYER_IDS.contourLabels, "print-graticule"]));
    expect(data(style, "o-markers")).toEqual([]);
    expect(data(style, "o-tracks").map((feature) => feature.properties.id)).toEqual(["b"]);
    // No names from the basemap; the heights on contour lines are not place names and stay.
    const named = style.layers.filter((layer) => layer.type === "symbol" && layer.source === SOURCE_IDS.basemap);
    expect(named).toEqual([]);
    // One line across the map for every tick round its edge.
    const ticks = context().graticule;
    expect(data(style, "print-graticule")).toHaveLength(ticks.longitudes.length + ticks.latitudes.length);

    const plain = printStyle(context(), { overlays: { hillshade: false }, parts: {} }, PRINT_OVERLAYS, base);
    expect(plain.usesTerrain).toBe(false);
  });

  it("lines the edge of the page so that no name is cut by it, above every other layer", () => {
    const { style } = printStyle(context(), nothing, PRINT_OVERLAYS, base);
    const last = style.layers[style.layers.length - 1]!;
    expect(last).toMatchObject({ id: "print-edge", type: "symbol", paint: { "text-opacity": 0 } });
    const marks = (style.sources["print-edge"] as unknown as { data: { features: Array<{ geometry: { coordinates: [number, number] } }> } })
      .data.features;
    // Every mark is outside the map, and they go all the way round: 12 px apart along 2 × (896 + 1,188) px of edge.
    expect(marks.length).toBeGreaterThan(340);
    for (const mark of marks) {
      const [lon, lat] = mark.geometry.coordinates;
      expect(lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]).toBe(true);
    }
  });

  it("takes a new overlay as one more entry in the list", () => {
    const grid: PrintOverlay = {
      id: "grid",
      label: "Grid squares",
      initially: () => true,
      apply: (draft, { bbox: [west, south, east] }) => {
        draft.sources.grid = {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [west, south],
                [east, south],
              ],
            },
          } as never,
        };
        draft.layers.push({ id: "grid-lines", type: "line", source: "grid", paint: { "line-color": "#000000" } });
      },
    };
    const { style } = printStyle(context(), nothing, [...PRINT_OVERLAYS, grid], base);
    expect(style.sources.grid).toBeDefined();
    // Drawn above the map's own overlays, and under the invisible guard along the edge.
    expect(layerIds(style).indexOf("grid-lines")).toBeGreaterThan(layerIds(style).indexOf("o-markers-label"));
    expect(layerIds(style).indexOf("grid-lines")).toBe(style.layers.length - 2);
  });
});

describe("the Maidenhead grid on a printed page", () => {
  it("is offered, starts as the map on screen has it, and draws the cells of the page with the map's own grid layers", () => {
    const grid = overlay("locator-grid");
    expect(grid.label).toBe("Maidenhead grid squares");
    localStorage.removeItem("outpost.maps.locatorGrid");
    expect(grid.initially(context())).toBe(false);
    localStorage.setItem("outpost.maps.locatorGrid", "true");
    expect(grid.initially(context())).toBe(true);
    localStorage.removeItem("outpost.maps.locatorGrid");
    expect(grid.hint?.(context())).toMatch(/^(Fields|Squares|Subsquares|Extended squares) at this scale/);

    const off = printStyle(context(), nothing, PRINT_OVERLAYS, base);
    const on = printStyle(context(), { overlays: { "locator-grid": true }, parts: {} }, PRINT_OVERLAYS, base);
    const cells = (style: typeof on.style) => (style.sources["o-grid"] as { data: { features: unknown[] } }).data.features.length;
    expect(cells(off.style)).toBe(0);
    expect(cells(on.style)).toBeGreaterThan(0);
    expect(layerIds(on.style)).toContain("o-grid-label");
    // It is drawn from arithmetic, not from terrain, so it adds no credit of its own.
    expect(on.usesTerrain).toBe(off.usesTerrain);
  });
});

describe("the credits as printed", () => {
  it("are the ones the map on screen shows, each with the address to look it up at", () => {
    const withTerrain = printedCredits(creditsFor(ATTRIBUTIONS, { hasTiles: true, terrain: true }), ATTRIBUTIONS);
    expect(withTerrain).toBe(
      "Protomaps © OpenStreetMap, openstreetmap.org/copyright · © Mapterhorn, mapterhorn.com/attribution · Outlines: Natural Earth, naturalearthdata.com",
    );
    // Terrain is credited only while something is drawn from it.
    const without = printedCredits(creditsFor(ATTRIBUTIONS, { hasTiles: true, terrain: false }), ATTRIBUTIONS);
    expect(without).toBe("Protomaps © OpenStreetMap, openstreetmap.org/copyright · Outlines: Natural Earth, naturalearthdata.com");
    // With nothing installed the outline map is still credited.
    expect(printedCredits(creditsFor([], { hasTiles: false, terrain: false }), [])).toBe("Natural Earth, naturalearthdata.com");
  });

  it("writes an address the way it is read on paper", () => {
    expect(printedAddress("https://www.openstreetmap.org/copyright")).toBe("openstreetmap.org/copyright");
    expect(printedAddress("http://example.org/")).toBe("example.org");
  });
});
