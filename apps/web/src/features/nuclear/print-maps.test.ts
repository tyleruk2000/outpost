import { type Bbox, computeEffects, type EffectsInput, type InstalledRegion, type MapSources, type MarkerDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "@/features/maps/lib/style-types";
import { writeSample } from "@/features/print-kit/samples";
import type { Block } from "@/features/propagation/plans/document";
import type { Written } from "./document";
import { type DrawMap, makeScenarioPdf, mapDataDate } from "./print-maps";

const WORLD: Bbox = [-180, -85, 180, 85];
const ATTRIBUTIONS = [
  {
    name: "Protomaps, OpenStreetMap",
    html: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    license: "ODbL 1.0",
    url: "https://www.openstreetmap.org/copyright",
  },
];
const sources: MapSources = {
  hasTiles: true,
  hasTerrain: false,
  sources: {
    basemap: { type: "vector", tiles: ["/api/maps/tiles/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 14, bounds: WORLD, attribution: "" },
  },
  glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
  sprites: { light: "/map-assets/sprites/v4/light" },
  bounds: WORLD,
  minZoom: 0,
  maxZoom: 14,
  attribution: "",
  attributions: ATTRIBUTIONS,
};
const region = (bounds: Bbox, sourceBuild: string | null = "20261103"): InstalledRegion => ({
  id: "r",
  regionId: null,
  name: "Region",
  tileType: "vector",
  bounds,
  minZoom: 0,
  maxZoom: 14,
  sizeBytes: 1,
  sourceBuild,
  installedAt: 1,
  locationId: "l",
  locationName: "Internal storage",
  available: true,
  status: "installed",
});
const home: MarkerDto = {
  id: "home",
  name: "Home",
  note: "",
  lat: 51.51,
  lon: -0.1,
  color: "teal",
  icon: "home",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
} as MarkerDto;

const scenario = (letter: Written["letter"], lat: number, lon: number, effects: EffectsInput): Written => {
  const answer = computeEffects(effects);
  if (!answer.ok) throw new Error(answer.problems.join(" "));
  return { letter, scenario: { name: `Scenario ${letter}`, notes: "", lat, lon, effects }, result: answer.result };
};
const plume = scenario("A", 51.5, -0.12, { yieldKt: 300, burst: { kind: "surface" }, wind: { fromDegrees: 250, kmh: 30 } });
const rings = scenario("B", 51.45, -0.3, { yieldKt: 15, burst: { kind: "optimum", psi: 5 }, wind: null });
const far = scenario("C", 53.48, -2.24, { yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: null });

/** A real JPEG of 2 by 2 pixels, for the PDF to hold. */
const TINY_JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAARgBGAAD/4QCARXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAABGAAAAAQAAAEYAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAAAKgAwAEAAAAAQAAAAIAAAAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/AABEIAAIAAgMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2wBDAA8PDw8PDxoPDxokGhoaJDEkJCQkMT4xMTExMT5LPj4+Pj4+S0tLS0tLS0taWlpaWlppaWlpaXZ2dnZ2dnZ2dnb/2wBDARITEx4cHjQcHDR7VEVUe3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3v/3QAEAAH/2gAMAwEAAhEDEQA/APQ6KKKAP//Z",
  ),
  (char) => char.charCodeAt(0),
);
/** The tiny JPEG with a comment of its own after its start, so that each map's picture is a picture of its own in the PDF. */
const jpegNumbered = (number: number) => {
  const words = new TextEncoder().encode(`map ${number}`);
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xfe, 0, words.length + 2, ...words, ...TINY_JPEG.subarray(2)]);
};

/** A stand-in for the off-screen map: each map one piece, and every style it was asked to draw kept for looking at. */
function standIn() {
  const styles: StyleSpecification[] = [];
  const draw: DrawMap = async (style, _frame, pixels) => {
    styles.push(style);
    return { pieces: [{ x: 0, y: 0, ...pixels, pixels, jpeg: jpegNumbered(styles.length) }], reduced: false };
  };
  return { styles, draw };
}

const base = { dated: Date.UTC(2026, 10, 16), paper: "a4" as const, sources, cacheKey: "k", origin: "http://outpost.test", places: null };
const images = (blocks: Block[]) =>
  blocks.flatMap((block) => (block.kind === "drawing" ? block.draw(42, 0, 511).filter((item) => item.kind === "image") : []));
const words = (blocks: Block[]) =>
  blocks.map((block) => (block.kind === "drawing" ? (block.words ?? "") : block.kind === "para" ? block.text : "")).join(" ");
const pdfText = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("the maps of a scenario's PDF", () => {
  it("gives one scenario with a fallout pattern a map of its rings and one of its pattern, with the caveats and credits under each, and no overview", async () => {
    const { draw, styles } = standIn();
    const file = await makeScenarioPdf({ ...base, written: [plume], regions: [region(WORLD)], draw });
    expect(file.figures.overview).toEqual([]);
    const own = file.figures.maps.A!;
    expect(own).toHaveLength(2);
    expect(images(own)).toHaveLength(2);
    expect(styles).toHaveLength(2);
    expect(file.maps).toBe(2);
    expect(file.missing).toEqual([]);
    const said = words(own);
    expect(said).toMatch(/An educational estimate from a published model for an idealised case.*not a forecast and not instructions/);
    expect(said).toMatch(/idealised shape for a steady wind/);
    expect(said).toMatch(
      /framed to reach the contour of 100 rads per hour at one hour.*The contours of 10 and 1 rads per hour run on past the edge/,
    );
    expect(said).toMatch(/openstreetmap\.org\/copyright/);
    expect(said).toMatch(/Map data of 3 November 2026/);
    // The file holds the two pictures, and the caveat as text.
    const text = pdfText(file.bytes);
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2);
    expect(text).toMatch(/Nuclear effects scenario: Scenario A/);
    writeSample("nuclear-maps", file.bytes);
    expect(file.pages).toBeGreaterThanOrEqual(2);
  });

  it("puts an overview of all the scenarios first only when there are several, with the sentence that nothing is added up", async () => {
    const { draw } = standIn();
    const file = await makeScenarioPdf({ ...base, written: [plume, rings, far], regions: [region(WORLD)], draw });
    expect(images(file.figures.overview)).toHaveLength(1);
    expect(words(file.figures.overview)).toMatch(/The 3 scenarios shown, A, B and C.*nothing is added up across them/);
    expect(images(file.figures.maps.A!)).toHaveLength(2);
    expect(images(file.figures.maps.B!)).toHaveLength(1);
    expect(images(file.figures.maps.C!)).toHaveLength(1);
    expect(file.maps).toBe(5);
    // No figure of any kind across the scenarios: no people, no total, no area together.
    expect(words(file.figures.overview)).not.toMatch(/total|combined|altogether|people|casualt/i);
    expect(pdfText(file.bytes).match(/\/Subtype \/Image/g)).toHaveLength(5);
  });

  it("draws in the overview every scenario it is given at full strength with its letter, and none of their rings filled", async () => {
    const { draw, styles } = standIn();
    await makeScenarioPdf({ ...base, written: [plume, far], regions: [region(WORLD)], draw });
    const overview = styles[0]!.sources["o-nuclear"] as { data: { features: Array<{ properties: Record<string, unknown> }> } };
    const kinds = overview.data.features.map((feature) => feature.properties.kind);
    expect(kinds).not.toContain("zone");
    expect(
      overview.data.features.filter((feature) => feature.properties.kind === "zero").map((feature) => feature.properties.label),
    ).toEqual(["A", "C"]);
    expect(overview.data.features.every((feature) => feature.properties.quiet !== true)).toBe(true);
  });

  it("leaves the saved places off the maps unless they were chosen, and draws them on every map when they were", async () => {
    const without = standIn();
    await makeScenarioPdf({ ...base, written: [plume, rings], regions: [region(WORLD)], draw: without.draw });
    for (const style of without.styles) {
      expect(Object.keys(style.sources)).not.toContain("o-markers");
      expect(style.layers.some((layer) => "source" in layer && layer.source === "o-markers")).toBe(false);
    }
    const chosen = standIn();
    const file = await makeScenarioPdf({ ...base, written: [plume, rings], regions: [region(WORLD)], places: [home], draw: chosen.draw });
    for (const style of chosen.styles) {
      const markers = style.sources["o-markers"] as unknown as { data: { features: Array<{ properties: { name: string } }> } };
      expect(markers.data.features.map((feature) => feature.properties.name)).toEqual(["Home"]);
      expect(style.layers.some((layer) => "source" in layer && layer.source === "o-markers")).toBe(true);
    }
    expect(words(file.figures.maps.A!)).toMatch(/Your saved places are shown, as you chose/);
  });

  it("never puts the reference layers, or anything but the scenario and the places, over the basemap", async () => {
    const { draw, styles } = standIn();
    await makeScenarioPdf({ ...base, written: [plume, rings], regions: [region(WORLD)], places: [home], draw });
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) {
      // The overlays are the map's sources whose names start "o-": only the scenario's and the places'.
      const overlays = Object.keys(style.sources).filter((id) => id.startsWith("o-"));
      expect(overlays.sort()).toEqual(["o-markers", "o-nuclear"]);
      for (const layer of style.layers) {
        if (!("source" in layer) || typeof layer.source !== "string" || !layer.source.startsWith("o-")) continue;
        expect(["o-nuclear", "o-markers"]).toContain(layer.source);
      }
      expect(JSON.stringify(style)).not.toMatch(/o-reference|o-population|reference|flood/i);
      // Light, since paper is light, and no satellite imagery.
      expect(Object.keys(style.sources).some((id) => /imagery|satellite/i.test(id))).toBe(false);
    }
  });

  it("with no map region installed for the area, draws the rings to scale in the map's place and says how to get a map", async () => {
    const { draw, styles } = standIn();
    const file = await makeScenarioPdf({
      ...base,
      written: [plume, far],
      // A region somewhere else entirely.
      regions: [region([100, 10, 101, 11])],
      draw,
    });
    expect(styles).toHaveLength(0);
    expect(file.maps).toBe(0);
    for (const letter of ["A", "C"] as const) {
      const blocks = file.figures.maps[letter]!;
      expect(images(blocks)).toHaveLength(0);
      expect(words(blocks)).toMatch(
        new RegExp(`No map of ${letter}: no offline map region covers this area\\. Add a region for this area under Maps, Offline maps`),
      );
      // The diagram: real lines on the page, not a blank box.
      const drawing = blocks.find((block) => block.kind === "drawing")!;
      expect(drawing.kind === "drawing" && drawing.draw(42, 0, 511).filter((item) => item.kind === "line").length).toBeGreaterThan(50);
    }
    expect(words(file.figures.overview)).toMatch(/No map of all the scenarios together: no offline map region covers this area/);
    expect(pdfText(file.bytes)).not.toMatch(/\/Subtype \/Image/);
    expect(file.pages).toBeGreaterThanOrEqual(2);
  });

  it("with no map installed at all, says the same and still makes the PDF", async () => {
    const { draw } = standIn();
    const file = await makeScenarioPdf({ ...base, sources: { ...sources, hasTiles: false }, written: [rings], regions: [], draw });
    expect(file.missing).toEqual([expect.stringMatching(/^No map of B: no offline map region covers this area/)]);
    expect(file.bytes.length).toBeGreaterThan(1000);
  });

  it("when the device cannot draw a map, says so in the map's place and makes the PDF all the same", async () => {
    const draw: DrawMap = async () => {
      throw new Error("This device cannot draw a page of this size.");
    };
    const file = await makeScenarioPdf({ ...base, written: [plume], regions: [region(WORLD)], draw });
    expect(file.maps).toBe(0);
    expect(words(file.figures.maps.A!)).toMatch(
      /No map of A: this device could not draw it \(This device cannot draw a page of this size\)/,
    );
    expect(file.figures.maps.A!.some((block) => block.kind === "drawing")).toBe(true);
  });

  it("stops when asked, and makes nothing", async () => {
    const stop = new AbortController();
    const draw: DrawMap = async () => {
      stop.abort();
      throw new Error("Stopped.");
    };
    await expect(makeScenarioPdf({ ...base, written: [plume], regions: [region(WORLD)], draw, signal: stop.signal })).rejects.toThrow();
  });

  it("says which map it is drawing, in words, one after another", async () => {
    const { draw } = standIn();
    const said: string[] = [];
    await makeScenarioPdf({
      ...base,
      written: [plume, rings],
      regions: [region(WORLD)],
      draw,
      onProgress: (words, step, of) => said.push(`${words} ${step}/${of}`),
    });
    expect(said).toEqual([
      "Drawing the map of all the scenarios 1/4",
      "Drawing the map for A 2/4",
      "Drawing the map of A's fallout pattern 3/4",
      "Drawing the map for B 4/4",
      "Putting the PDF together 4/4",
    ]);
  });

  it("dates the map's data by the regions that reach the area, where they say", () => {
    expect(mapDataDate([0, 50, 1, 51], [region(WORLD, "20260301")])).toBe("1 March 2026");
    expect(mapDataDate([0, 50, 1, 51], [region(WORLD, null)])).toBeNull();
    expect(mapDataDate([0, 50, 1, 51], [region([10, 10, 11, 11], "20260301")])).toBeNull();
  });
});
