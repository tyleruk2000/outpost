/**
 * The maps of the book's repeaters: the offline map under them where a region covers the
 * place, the ground in sight of each repeater drawn from the terrain installed, the full
 * width of the text, and every label inside the frame.
 */
import type { InstalledRegion, MapSources, RepeaterDto, SightRange } from "@outpost/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DrawMap } from "@/features/nuclear/print-maps";
import { rangeFixture } from "@/features/repeaters/map/range-fixture";
import { chooseRepeaters, horizonRange, type RepeaterLocation, repeaterMapFrame } from "./book-repeaters";
import { coverageOutlines, placeLabels, repeaterMapSvg } from "./repeater-figure";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

afterEach(() => get.mockReset());

/** South-west London, and points `east` and `north` kilometres from it. */
const HOME = { lat: 51.42, lon: -0.2 };
const KM_LON = 111.32 * Math.cos((HOME.lat * Math.PI) / 180);
const off = (east: number, north: number) => ({ lat: HOME.lat + north / 111.32, lon: HOME.lon + east / KM_LON });

let next = 0;
const repeater = (callsign: string, east: number, north: number, over: Partial<RepeaterDto> = {}): RepeaterDto =>
  ({
    id: `r${++next}`,
    listId: "l",
    callsign,
    outputHz: 145_725_000,
    inputHz: 145_125_000,
    band: "2m",
    modes: ["fm"],
    ctcssHz: 82.5,
    dcsCode: null,
    place: callsign,
    status: "operational",
    antennaMeters: null,
    ...off(east, north),
    ...over,
  }) as RepeaterDto;

const home: RepeaterLocation = { key: "p1", kind: "home", role: "Home", name: "Home", ...HOME };
const pool = [
  repeater("GB3KX", 6, 3),
  repeater("GB3XP", -9, -4),
  repeater("GB3BK", 14, -8, { antennaMeters: 25 }),
  // Far to the east, with a long name: its label must stay inside the frame.
  repeater("GB3LONGNAME", 24, 1),
];
const [group] = chooseRepeaters([home], pool);
const first = { lat: pool[0]!.lat!, lon: pool[0]!.lon! };
const MEASURE = 499;

/** Whether a point is inside outlines filled even-odd. */
function inside(loops: Array<Array<[number, number]>>, [x, y]: [number, number]): boolean {
  let crossings = 0;
  for (const loop of loops)
    for (let index = 0, last = loop.length - 1; index < loop.length; last = index++) {
      const [xi, yi] = loop[index]!;
      const [xj, yj] = loop[last]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) crossings += 1;
    }
  return crossings % 2 === 1;
}

describe("the frame", () => {
  it("is the full width of the text and 300 points high, with more ground east and west", () => {
    const { size, bbox } = repeaterMapFrame(group!, MEASURE);
    expect(size.width).toBeGreaterThan(MEASURE - 12);
    expect(size.width).toBeLessThanOrEqual(MEASURE);
    expect(size.height).toBeCloseTo(300, 0);
    const across = (bbox[2] - bbox[0]) * KM_LON;
    const down = (bbox[3] - bbox[1]) * 111.32;
    expect(across).toBeGreaterThan(down * 1.4);
  });

  it("keeps every label inside the frame and clear of the others", () => {
    const { frame, labels } = repeaterMapSvg({ group: group!, locations: [home], ranges: {}, map: null, missing: null, measure: MEASURE });
    expect(labels.map((label) => label.words)).toEqual(expect.arrayContaining(["Home", "GB3KX", "GB3XP", "GB3BK", "GB3LONGNAME"]));
    for (const { box } of labels) {
      expect(box.x).toBeGreaterThanOrEqual(frame.x);
      expect(box.y).toBeGreaterThanOrEqual(frame.y);
      expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
    for (const [index, a] of labels.entries())
      for (const b of labels.slice(index + 1)) {
        const apart =
          a.box.x + a.box.width <= b.box.x ||
          b.box.x + b.box.width <= a.box.x ||
          a.box.y + a.box.height <= b.box.y ||
          b.box.y + b.box.height <= a.box.y;
        expect(apart, `${a.words} and ${b.words}`).toBe(true);
      }
  });

  it("moves a label at the frame's right edge back inside", () => {
    const frame = { x: 0, y: 0, width: 200, height: 100 };
    const [label] = placeLabels([{ x: 198, y: 50, radius: 4, words: "GB3LG", size: 6.5, bold: true }], frame);
    expect(label!.box.x + label!.box.width).toBeLessThanOrEqual(200);
    // To the left of the mark, not over it.
    expect(label!.box.x + label!.box.width).toBeLessThanOrEqual(194);
  });
});

describe("the ground in sight", () => {
  // In sight to 8 km on the eastern half of the compass, to 3 km on the western.
  const sight: SightRange = rangeFixture("terrain", { seen: (bearing, meters) => meters <= (bearing < 180 ? 8_000 : 3_000) }, first);
  const ranges = { [pool[0]!.id]: { ...horizonRange(pool[0]!), meters: sight.typicalMeters!, basis: "terrain" as const, sight } };

  it("is traced from the terrain's answer, bearing by bearing, not a circle", () => {
    const { size, frame } = repeaterMapFrame(group!, MEASURE);
    const left = (MEASURE - size.width) / 2;
    const world = 512 * 2 ** frame.zoom * 0.6;
    const mx = (lon: number) => (lon + 180) / 360;
    const my = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
    const toPage = (point: { lat: number; lon: number }): [number, number] => [
      left + size.width / 2 + (mx(point.lon) - mx(frame.center.lon)) * world,
      size.height / 2 + (my(point.lat) - my(frame.center.lat)) * world,
    ];
    const fromPage = (x: number, y: number) => ({
      lon: (mx(frame.center.lon) + (x - left - size.width / 2) / world) * 360 - 180,
      lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * (my(frame.center.lat) + (y - size.height / 2) / world)))) * 180) / Math.PI,
    });
    const loops = coverageOutlines(sight, { x: left, y: 0, width: size.width, height: size.height }, fromPage);
    expect(loops.length).toBeGreaterThan(0);
    const at = (east: number, north: number) => toPage({ lat: first.lat + north / 111.32, lon: first.lon + east / KM_LON });
    expect(inside(loops, at(6, 0))).toBe(true);
    expect(inside(loops, at(-6, 0))).toBe(false);
    expect(inside(loops, at(-2, 0))).toBe(true);
    expect(inside(loops, at(10, 0))).toBe(false);
  });

  it("is drawn tinted, hatched and outlined for that repeater, captioned as from the terrain", () => {
    const { svg, caption } = repeaterMapSvg({ group: group!, locations: [home], ranges, map: null, missing: null, measure: MEASURE });
    expect(svg).toContain('data-coverage="GB3KX"');
    expect(svg).toMatch(/<pattern id="rh-p1-0"[^>]*patternTransform="rotate\(45\)"/);
    expect(svg).toContain('fill="url(#rh-p1-0)"');
    expect(svg).toContain('fill-rule="evenodd"');
    // The others have no terrain under them here: circles, and the caption says so.
    expect(svg).toContain('data-circle="GB3XP"');
    expect(caption).toContain("Hatched: ground in sight of each repeater for a handheld at head height, from the terrain installed");
    expect(caption).toContain("10 m up (assumed: the list gives no height)");
    expect(caption).toMatch(/GB3XP, GB3BK, GB3LONGNAME: no terrain installed there/);
    // GB3BK's height is listed (25 m); the others' 10 m is assumed, and said to be.
    expect(caption).toContain("with its aerial at the height listed (10 m assumed for GB3XP, GB3LONGNAME)");
  });

  it("is asked of this Outpost for each repeater at its aerial's height and a handheld's, saying how far it has got", async () => {
    get.mockImplementation(async (_path: string, query: { at: string }) =>
      query.at.startsWith(String(pool[0]!.lat)) ? sight : rangeFixture("none"),
    );
    const { gatherRanges } = await import("./repeater-gather");
    const progress: string[] = [];
    const got = await gatherRanges([group!], (done, total) => progress.push(`${done} of ${total}`));
    expect(get).toHaveBeenCalledWith("/api/maps/sight-range", expect.objectContaining({ aerial: "10", station: "1.5" }));
    expect(get).toHaveBeenCalledWith("/api/maps/sight-range", expect.objectContaining({ aerial: "25" }));
    expect(progress).toEqual(["0 of 4", "1 of 4", "2 of 4", "3 of 4", "4 of 4"]);
    expect(got[pool[0]!.id]?.sight).toBe(sight);
    expect(Object.keys(got)).toEqual([pool[0]!.id]);
  });
});

describe("the offline map under it", () => {
  const region = (bounds: [number, number, number, number]): InstalledRegion =>
    ({ id: "uk", tileType: "vector", bounds, minZoom: 0, maxZoom: 15, available: true, status: "installed" }) as InstalledRegion;
  const sources = {
    hasTiles: true,
    hasTerrain: false,
    sources: {
      basemap: {
        type: "vector",
        tiles: ["/api/maps/tiles/{z}/{x}/{y}.mvt"],
        minzoom: 0,
        maxzoom: 14,
        bounds: [-180, -85, 180, 85],
        attribution: "",
      },
    },
    glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
    sprites: { light: "/map-assets/sprites/v4/light" },
    attributions: [
      { name: "OpenStreetMap", html: "© OpenStreetMap contributors", license: "ODbL", url: "https://www.openstreetmap.org/copyright" },
    ],
  } as unknown as MapSources;
  const draw: DrawMap = async (_style, _frame, pixels) => ({
    pieces: [{ x: 0, y: 0, width: pixels.width, height: pixels.height, pixels, jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }],
    reduced: false,
  });

  it("is drawn where an installed region covers the place, and is in the picture", async () => {
    const { gatherMaps } = await import("./repeater-gather");
    const drawn = await gatherMaps(
      [group!],
      { sources, regions: [region([-8, 49.8, 2, 61])], cacheKey: "k", origin: "http://outpost" },
      MEASURE,
      draw,
    );
    expect(drawn.missing).toBeNull();
    const map = drawn.maps.p1!;
    expect(map.pieces).toHaveLength(1);
    expect(map.pieces[0]!.width).toBeGreaterThan(MEASURE - 12);
    const { svg, caption } = repeaterMapSvg({ group: group!, locations: [home], ranges: {}, map, missing: null, measure: MEASURE });
    expect(svg).toContain("data:image/jpeg;base64,");
    expect(svg).not.toContain("Grid lines");
    expect(caption).toContain("Map: ");
  });

  it("is left out, and said, where no region covers the place", async () => {
    const { gatherMaps } = await import("./repeater-gather");
    const drawn = await gatherMaps(
      [group!],
      { sources, regions: [region([10, 40, 12, 42])], cacheKey: "k", origin: "http://outpost" },
      MEASURE,
      draw,
    );
    expect(drawn.maps.p1).toBeUndefined();
    expect(drawn.missing).toContain("No offline map region covers some of these places");
  });
});
