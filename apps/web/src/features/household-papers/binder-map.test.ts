import type { Bbox, InstalledRegion, MapSources } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import type { SheetItem } from "@/features/maps/print/sheet";
import type { DrawMap } from "@/features/nuclear/print-maps";
import { binderMap, placesBbox } from "./binder-map";
import type { BinderPlace } from "./binder-places";

const WORLD: Bbox = [-180, -85, 180, 85];
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
  attributions: [{ name: "OpenStreetMap", html: "© OpenStreetMap", license: "ODbL 1.0", url: "https://www.openstreetmap.org/copyright" }],
};
const region: InstalledRegion = {
  id: "r",
  regionId: null,
  name: "Britain",
  tileType: "vector",
  bounds: [-8, 49, 2, 61],
  minZoom: 0,
  maxZoom: 15,
  sizeBytes: 1,
  sourceBuild: "20261103",
  installedAt: 1,
  locationId: "l",
  locationName: "Internal storage",
  available: true,
  status: "installed",
};
const places: BinderPlace[] = [
  { number: 1, role: "Home", name: "Home", lat: 54.43, lon: -2.96, note: "" },
  { number: 2, role: "Meet near home", name: "Church", lat: 54.44, lon: -2.95, note: "" },
];
const input = { sources, regions: [region], cacheKey: "k", origin: "http://outpost.local" };
const drawnItems = (block: { kind: string }) =>
  (block as unknown as { draw: (x: number, y: number, width: number) => SheetItem[] }).draw(42, 100, 511);
const texts = (items: SheetItem[]) => items.flatMap((item) => (item.kind === "text" ? [item.text] : []));

describe("the binder's map of home and the meeting points", () => {
  it("frames every place with room round it, and never less than about two kilometres", () => {
    const [west, south, east, north] = placesBbox([places[0]!]);
    expect(north - south).toBeGreaterThan(0.0199);
    expect(east - west).toBeGreaterThan(0.02);
    const both = placesBbox(places);
    expect(both[0]).toBeLessThan(-2.96);
    expect(both[3]).toBeGreaterThan(54.44);
  });

  it("draws the installed map with the places numbered on it and the map's credit under it", async () => {
    let asked = 0;
    const draw: DrawMap = async (_style, _frame, pixels) => {
      asked += 1;
      return {
        pieces: [{ x: 0, y: 0, width: pixels.width, height: pixels.height, pixels, jpeg: new Uint8Array([1, 2, 3]) }],
        reduced: false,
      };
    };
    const map = await binderMap(places, input, "a4", { draw });
    expect(asked).toBe(1);
    expect(map?.missing).toBeNull();
    expect([...map!.pictures.keys()]).toEqual(["binder-map-1"]);
    const items = drawnItems(map!.block);
    expect(items.some((item) => item.kind === "image" && item.id === "binder-map-1")).toBe(true);
    expect(texts(items)).toEqual(expect.arrayContaining(["1", "2"]));
    expect(texts(items).join(" ")).toContain("OpenStreetMap");
    // The numbered marks lie inside the frame.
    const marks = items.filter((item) => item.kind === "text" && (item.text === "1" || item.text === "2"));
    for (const mark of marks) expect(mark.kind === "text" && mark.x > 42 && mark.x < 42 + 511).toBe(true);
  });

  it("puts the places to scale in an empty frame, and says why, where no offline map covers them", async () => {
    const map = await binderMap(places, { ...input, regions: [] }, "letter", {
      draw: () => Promise.reject(new Error("not asked")),
    });
    expect(map?.missing).toContain("no offline map region covers this area");
    expect(map?.pictures.size).toBe(0);
    const words = texts(drawnItems(map!.block)).join(" ");
    expect(words).toContain("drawn to scale without one");
    expect(await binderMap([], input, "a4")).toBeNull();
  });

  it("says so when this device cannot draw the map, and still makes the page", async () => {
    const map = await binderMap(places, input, "a4", { draw: () => Promise.reject(new Error("The page came out blank.")) });
    expect(map?.missing).toBe(
      "No map under the places: this device could not draw it (The page came out blank). Made on a computer, the binder may have it.",
    );
  });
});
