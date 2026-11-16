import fs from "node:fs";
import path from "node:path";
import {
  analyseSight,
  EARTH_RADIUS_METERS,
  earthBulgeMeters,
  fresnelRadiusMeters,
  greatCirclePoint,
  haversineMeters,
  LOCATOR_CELLS,
  MAX_SIGHT_PATH_METERS,
  maxSightDistanceMeters,
  type PlaceSearchResponse,
  parseCoordinateReadings,
  parseCoordinates,
  parseMaidenhead,
  type SightInput,
  sightSamples,
  type TerrainProfile,
  toMaidenhead,
  wavelengthMeters,
} from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { MAX_PROFILE_SAMPLES } from "../src/modules/maps/terrain-profile.ts";
import { buildArchive, type FixtureTile, tileInBbox } from "./fixtures/maps/archive.ts";
import { type Ground, groundTiles, positionOf, worldOf } from "./fixtures/maps/terrain.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// ── Maidenhead locators ─────────────────────────────────────────────────────

/**
 * Positions with their published locators.
 *
 * - W1AW, the ARRL's station at Newington, Connecticut: "FN31pr" on Wikipedia's
 *   "Maidenhead Locator System" page, which links the locator to 41.71463° N,
 *   72.72713° W; the ARRL's own "Grid Squares" page (arrl.org/grid-squares) gives its
 *   square as FN31.
 * - The seven rows of the test table in the go-maidenhead library
 *   (github.com/pd0mz/go-maidenhead, maidenhead_test.go), each with its six-character
 *   and eight-character locator. The first four (Munich, Montevideo, Washington and
 *   Wellington) are the examples most write-ups of the system repeat.
 *
 * All three were read on 16 November 2026.
 */
const PUBLISHED: Array<[lat: number, lon: number, six: string, eight: string | null]> = [
  [41.71463, -72.72713, "FN31PR", null],
  [48.14666, 11.60833, "JN58TD", "JN58TD25"],
  [-34.91, -56.21166, "GF15VC", "GF15VC41"],
  [38.92, -77.065, "FM18LW", "FM18LW20"],
  [-41.28333, 174.745, "RE78IR", "RE78IR92"],
  [41.714775, -72.72726, "FN31PR", "FN31PR21"],
  [37.413708, -122.1073236, "CM87WJ", "CM87WJ79"],
  [35.0542, -85.1142, "EM75KB", "EM75KB63"],
];

describe("Maidenhead locators", () => {
  it("gives the published locator of a position, at every length", () => {
    for (const [lat, lon, six, eight] of PUBLISHED) {
      expect(toMaidenhead(lat, lon, 2), six).toBe(six.slice(0, 2));
      expect(toMaidenhead(lat, lon, 4), six).toBe(six.slice(0, 4));
      expect(toMaidenhead(lat, lon, 6), six).toBe(six);
      expect(toMaidenhead(lat, lon), six).toBe(six);
      if (eight) expect(toMaidenhead(lat, lon, 8), eight).toBe(eight);
    }
  });

  it("reads a published locator back to a cell that holds the position, and to the middle of it", () => {
    for (const [lat, lon, six, eight] of PUBLISHED) {
      for (const locator of [six.slice(0, 4), six, eight].filter((text) => text !== null)) {
        const square = parseMaidenhead(locator)!;
        expect(square.locator).toBe(locator);
        expect(lat, locator).toBeGreaterThanOrEqual(square.south);
        expect(lat, locator).toBeLessThan(square.north);
        expect(lon, locator).toBeGreaterThanOrEqual(square.west);
        expect(lon, locator).toBeLessThan(square.east);
        // The cell is the size the system says, and the position returned is its middle.
        const cell = LOCATOR_CELLS[locator.length as 4 | 6 | 8];
        expect(square.east - square.west).toBeCloseTo(cell.lon, 9);
        expect(square.north - square.south).toBeCloseTo(cell.lat, 9);
        expect(square.lon).toBeCloseTo(square.west + cell.lon / 2, 9);
        expect(square.lat).toBeCloseTo(square.south + cell.lat / 2, 9);
        // And the middle is in the same cell: there and back again.
        expect(toMaidenhead(square.lat, square.lon, locator.length as 4 | 6 | 8)).toBe(locator);
      }
    }
  });

  it("puts the corners of the system where it says they are", () => {
    // A field is 20° by 10°, counted from 180° W and the South Pole; a square 2° by 1°.
    expect(parseMaidenhead("AA")).toMatchObject({ west: -180, south: -90, east: -160, north: -80 });
    expect(parseMaidenhead("RR")).toMatchObject({ west: 160, south: 80, east: 180, north: 90 });
    expect(parseMaidenhead("JJ00")).toMatchObject({ west: 0, south: 0, east: 2, north: 1 });
    // Greenwich and the equator: the first cell east and north of both.
    expect(toMaidenhead(0, 0, 8)).toBe("JJ00AA00");
    // Just short of them: the last cell of the field to the west and south.
    expect(toMaidenhead(-0.000001, -0.000001, 8)).toBe("II99XX99");
    // A subsquare is 5′ by 2.5′; an extended square 30″ by 15″.
    const subsquare = parseMaidenhead("IO83QM")!;
    expect((subsquare.east - subsquare.west) * 60).toBeCloseTo(5, 9);
    expect((subsquare.north - subsquare.south) * 60).toBeCloseTo(2.5, 9);
    const extended = parseMaidenhead("IO83QM27")!;
    expect((extended.east - extended.west) * 3600).toBeCloseTo(30, 7);
    expect((extended.north - extended.south) * 3600).toBeCloseTo(15, 7);
    // The poles and the 180° meridian have a locator too.
    expect(toMaidenhead(90, 0, 6)).toBe("JR09AX");
    expect(toMaidenhead(-90, -180, 6)).toBe("AA00AA");
    expect(toMaidenhead(10, 180, 4)).toBe(toMaidenhead(10, -180, 4));
    expect(toMaidenhead(91, 0)).toBeNull();
    expect(toMaidenhead(Number.NaN, 0)).toBeNull();
  });

  it("reads either case and spaces between the pairs, and nothing that is not a locator", () => {
    expect(parseMaidenhead("io83qm")!.locator).toBe("IO83QM");
    expect(parseMaidenhead(" IO83 qm 27 ")!.locator).toBe("IO83QM27");
    for (const text of ["", "I", "IO8", "IO83Q", "IO83QM2", "IO83QM277", "SO83", "IS83", "IO83YM", "IO83QY", "I083QM", "IO83-QM", "83IO"]) {
      expect(parseMaidenhead(text), text).toBeNull();
    }
  });

  it("is found by the map's search as a position: the middle of the square, with the square named", () => {
    expect(parseCoordinates("IO83")).toEqual({ lat: 53.5, lon: -3, format: "maidenhead", locator: "IO83" });
    const six = parseCoordinates("io83qm")!;
    expect(six).toMatchObject({ format: "maidenhead", locator: "IO83QM" });
    expect(six.lon).toBeCloseTo(-4 + 16 / 12 + 1 / 24, 9);
    expect(six.lat).toBeCloseTo(53 + 12 / 24 + 1 / 48, 9);
    expect(parseCoordinates("FN31PR21")).toMatchObject({ format: "maidenhead", locator: "FN31PR21" });
    // A field alone is two letters and 20° wide: left to the place names.
    expect(parseCoordinates("IO")).toBeNull();
    // The forms that were read before are read as before.
    expect(parseCoordinates("SH 609 543")).toMatchObject({ format: "osgb", precisionMeters: 100 });
    expect(parseCoordinates("54.4609, -3.0886")).toMatchObject({ format: "decimal" });
    expect(parseCoordinateReadings("Snowdon")).toEqual([]);
  });

  it("gives both readings of four characters that are a British grid reference and a locator", () => {
    const readings = parseCoordinateReadings("NN16");
    expect(readings.map((reading) => reading.format)).toEqual(["osgb", "maidenhead"]);
    // Near Ben Nevis as a grid reference; in central Asia as a locator.
    expect(readings[0]!.lat).toBeGreaterThan(56);
    expect(readings[0]!.lon).toBeLessThan(-4);
    expect(readings[1]).toEqual({ lat: 46.5, lon: 83, format: "maidenhead", locator: "NN16" });
    // Longer locators end in letters, which no grid reference does.
    expect(parseCoordinateReadings("NN16AB").map((reading) => reading.format)).toEqual(["maidenhead"]);
    expect(parseCoordinateReadings("IO83").map((reading) => reading.format)).toEqual(["maidenhead"]);
  });
});

// ── The sums ────────────────────────────────────────────────────────────────

describe("the Earth's curve and the Fresnel zone", () => {
  it("lifts the ground between two points by d1·d2 / (2·k·R)", () => {
    // 25 km from each end, k = 4/3: 25,000 × 25,000 ÷ (2 × 4/3 × 6,371,008.8) = 625,000,000 ÷ 16,989,356.8.
    expect(EARTH_RADIUS_METERS).toBe(6_371_008.8);
    expect(earthBulgeMeters(25_000, 25_000)).toBeCloseTo(36.788, 3);
    // With no bending of the ray (k = 1) the same point is 625,000,000 ÷ 12,742,017.6 up.
    expect(earthBulgeMeters(25_000, 25_000, 1)).toBeCloseTo(49.05, 3);
    // 10 km and 30 km from the ends: 300,000,000 ÷ 16,989,356.8.
    expect(earthBulgeMeters(10_000, 30_000)).toBeCloseTo(17.658, 3);
    expect(earthBulgeMeters(30_000, 10_000)).toBeCloseTo(17.658, 3);
    // Nothing at either end.
    expect(earthBulgeMeters(0, 40_000)).toBe(0);
    // The form in the handbooks, with distances in kilometres: h = d1·d2 / (12.74·k) metres.
    for (const [d1, d2] of [
      [3, 8],
      [25, 25],
      [40, 110],
    ] as const) {
      expect(earthBulgeMeters(d1 * 1000, d2 * 1000) / ((d1 * d2) / (12.74 * (4 / 3)))).toBeCloseTo(1, 3);
    }
  });

  it("gives the first Fresnel zone the radius √(λ·d1·d2 / (d1 + d2))", () => {
    // 145 MHz is a wavelength of 299,792,458 ÷ 145,000,000 = 2.06753 m.
    expect(wavelengthMeters(145)).toBeCloseTo(2.06753, 5);
    // The middle of 50 km at 145 MHz: √(2.06753 × 25,000 × 25,000 ÷ 50,000) = √25,844.2.
    expect(fresnelRadiusMeters(25_000, 25_000, 145)).toBeCloseTo(160.761, 3);
    // The middle of 10 km at 2.4 GHz: √(0.124914 × 5,000 × 5,000 ÷ 10,000) = √312.284.
    expect(fresnelRadiusMeters(5_000, 5_000, 2400)).toBeCloseTo(17.672, 3);
    // 2 km from one end of 10 km at 433 MHz: √(0.692361 × 2,000 × 8,000 ÷ 10,000) = √1,107.78.
    expect(fresnelRadiusMeters(2_000, 8_000, 433)).toBeCloseTo(33.283, 3);
    expect(fresnelRadiusMeters(8_000, 2_000, 433)).toBeCloseTo(33.283, 3);
    // No width at the antennas themselves.
    expect(fresnelRadiusMeters(0, 10_000, 433)).toBe(0);
    // The handbook form, kilometres and gigahertz: r = 17.32 × √(d1·d2 / (f·D)) metres.
    for (const [d1, d2, mhz] of [
      [5, 5, 2400],
      [25, 25, 145],
      [2, 8, 433],
      [1, 119, 51],
    ] as const) {
      expect(fresnelRadiusMeters(d1 * 1000, d2 * 1000, mhz) / (17.32 * Math.sqrt((d1 * d2) / ((mhz / 1000) * (d1 + d2))))).toBeCloseTo(
        1,
        3,
      );
    }
  });

  it("puts the radio horizon where the handbooks do, and nothing on the ground further than the limit", () => {
    // The usual rule for a 4/3 Earth: an antenna h metres up sees 4.12 × √h kilometres.
    expect(maxSightDistanceMeters(10, 0) / 1000 / (4.12 * Math.sqrt(10))).toBeCloseTo(1, 2);
    expect(maxSightDistanceMeters(100, 25) / 1000 / (4.12 * (Math.sqrt(100) + Math.sqrt(25)))).toBeCloseTo(1, 2);
    // From one summit as high as Everest to another, with the sea between.
    expect(maxSightDistanceMeters(8849, 8849)).toBeLessThan(MAX_SIGHT_PATH_METERS);
  });

  it("finds the point part of the way along a great circle", () => {
    // A quarter of the way round the equator, and half-way up a meridian.
    expect(greatCirclePoint({ lat: 0, lon: 10 }, { lat: 0, lon: 50 }, 0.25)).toMatchObject({ lon: expect.closeTo(20, 9) });
    expect(greatCirclePoint({ lat: 10, lon: 5 }, { lat: 50, lon: 5 }, 0.5).lat).toBeCloseTo(30, 9);
    // Between two places on the same parallel the great circle bows towards the pole: half-way
    // between 10° W and 10° E at 50° N it reaches the latitude whose tangent is tan 50° ÷ cos 10°.
    const middle = greatCirclePoint({ lat: 50, lon: -10 }, { lat: 50, lon: 10 }, 0.5);
    expect(middle.lon).toBeCloseTo(0, 9);
    expect(middle.lat).toBeCloseTo(50.4313, 4);
    expect(Math.tan((middle.lat * Math.PI) / 180)).toBeCloseTo(Math.tan((50 * Math.PI) / 180) / Math.cos((10 * Math.PI) / 180), 9);
    // Equal shares are equal distances.
    const from = { lat: 53.1, lon: -4.2 };
    const to = { lat: 51.2, lon: 0.4 };
    const total = haversineMeters(from.lat, from.lon, to.lat, to.lon);
    for (const share of [0, 0.1, 0.5, 0.9, 1]) {
      const point = greatCirclePoint(from, to, share);
      expect(haversineMeters(from.lat, from.lon, point.lat, point.lon)).toBeCloseTo(total * share, 3);
    }
    expect(greatCirclePoint(from, from, 0.5)).toEqual(from);
  });
});

// ── A path whose answer is known ────────────────────────────────────────────

/** 20 km of ground sampled every 10 m: level at `base`, with whatever `shape` adds at each distance. */
function levelPath(base: number, shape: (meters: number) => number = () => 0): { distanceMeters: number; heights: number[] } {
  const heights = Array.from({ length: 2001 }, (_, index) => base + shape(index * 10));
  return { distanceMeters: 20_000, heights };
}
/** A ridge `height` high whose crest is 10 km along, falling away evenly to nothing 500 m either side. */
const ridge = (height: number) => (meters: number) => Math.max(0, height * (1 - Math.abs(meters - 10_000) / 500));
const masts = (from: number, to: number, frequencyMHz: number) => ({ antennaFromMeters: from, antennaToMeters: to, frequencyMHz });

describe("line of sight over known ground", () => {
  it("is blocked by a ridge midway, by the height of the ridge above the ray and the curve under it", () => {
    // Ground at 100 m, a 50 m ridge at 10 km, 10 m masts: the ray is level at 110 m. At the crest
    // the ground is 150 m and the curve adds 10,000 × 10,000 ÷ 16,989,356.8 = 5.886 m, so the
    // ground stands 150 + 5.886 − 110 = 45.886 m above the ray.
    const result = analyseSight({ ...levelPath(100, ridge(50)), ...masts(10, 10, 145) });
    expect(result.verdict).toBe("blocked");
    expect(result.obstruction!.distanceMeters).toBe(10_000);
    expect(result.obstruction!.depthMeters).toBeCloseTo(45.886, 3);
    // The ridge is above the ray wherever it rises more than 10 − 5.87 = 4.13 m: within 458.7 m of
    // the crest, which is the samples from 9,550 m to 10,450 m.
    expect(result.obstruction!.firstMeters).toBe(9_550);
    expect(result.obstruction!.lastMeters).toBe(10_450);
    expect(result.obstruction!.blockedMeters).toBe(910);
    expect(result.midBulgeMeters).toBeCloseTo(5.886, 3);
    expect(result.knownShare).toBe(1);

    // Masts tall enough to see over it are not blocked: 60 m puts the ray 4.114 m above the crest.
    const taller = analyseSight({ ...levelPath(100, ridge(50)), ...masts(60, 60, 145) });
    expect(taller.verdict).toBe("fresnel");
    expect(taller.obstruction).toBeNull();
    expect(taller.tightest!.distanceMeters).toBe(10_000);
    expect(taller.tightest!.clearanceMeters).toBeCloseTo(4.114, 3);

    // A mast at one end only: the ray slopes from 110 m to 310 m and passes the crest at 210 m.
    const oneEnd = sightSamples({ ...levelPath(100, ridge(50)), ...masts(10, 210, 145) })!;
    expect(oneEnd[1000]).toMatchObject({ distanceMeters: 10_000, groundMeters: 150, rayMeters: 210 });
    expect(oneEnd[1000]!.clearanceMeters).toBeCloseTo(210 - 150 - 5.886, 3);
    expect(oneEnd[500]!.rayMeters).toBeCloseTo(160, 9);
  });

  it("says how much of the first Fresnel zone is clear at the tightest point", () => {
    // Level ground and 10 m masts at 145 MHz: the ray clears the middle by 10 − 5.886 = 4.114 m,
    // where the zone's radius is √(2.06753 × 10,000 × 10,000 ÷ 20,000) = 101.674 m. That is 4.0% of it.
    const low = analyseSight({ ...levelPath(100), ...masts(10, 10, 145) });
    expect(low.verdict).toBe("fresnel");
    expect(low.obstruction).toBeNull();
    expect(low.midFresnelRadiusMeters).toBeCloseTo(101.674, 3);
    expect(low.tightest).toMatchObject({ distanceMeters: 10_000 });
    expect(low.tightest!.clearanceMeters).toBeCloseTo(4.114, 3);
    expect(low.tightest!.fresnelRadiusMeters).toBeCloseTo(101.674, 3);
    expect(low.tightest!.share).toBeCloseTo(4.114 / 101.674, 4);

    // Two summits at 500 m with a valley at 100 m between, 433 MHz: 510 − 100 − 5.886 = 404.114 m
    // clear at the middle, where the radius is √(0.692361 × 5,000) = 58.837 m.
    const valley = levelPath(100);
    valley.heights[0] = 500;
    valley.heights[2000] = 500;
    const high = analyseSight({ ...valley, ...masts(10, 10, 433) });
    expect(high.verdict).toBe("clear");
    expect(high.tightest!.distanceMeters).toBe(10_000);
    expect(high.tightest!.share).toBeCloseTo(404.114 / 58.837, 2);

    // The 60% guide, either side of it: at 433 MHz the middle needs 0.6 × 58.837 = 35.302 m clear,
    // which over level ground is masts of 35.302 + 5.886 = 41.188 m.
    expect(analyseSight({ ...levelPath(100), ...masts(41.3, 41.3, 433) }).verdict).toBe("clear");
    expect(analyseSight({ ...levelPath(100), ...masts(41.1, 41.1, 433) }).verdict).toBe("fresnel");
    expect(analyseSight({ ...levelPath(100), ...masts(41.1, 41.1, 433) }).tightest!.share).toBeCloseTo((41.1 - 5.886) / 58.837, 3);
  });

  it("is blocked over the sea by the Earth's curve alone, with the 4/3 radius and not the true one", () => {
    // 50 km of sea. The curve stands 36.788 m high at the middle on a 4/3 Earth and 49.050 m on the real one.
    const sea = { distanceMeters: 50_000, heights: Array.from({ length: 1001 }, () => 0) };
    const short = analyseSight({ ...sea, ...masts(30, 30, 145) });
    expect(short.verdict).toBe("blocked");
    expect(short.obstruction!.distanceMeters).toBe(25_000);
    expect(short.obstruction!.depthMeters).toBeCloseTo(36.788 - 30, 3);
    // 40 m masts clear it on a 4/3 Earth; without the bending of the ray they would not.
    expect(analyseSight({ ...sea, ...masts(40, 40, 145) }).verdict).toBe("fresnel");
    const straight = analyseSight({ ...sea, ...masts(40, 40, 145), earthFactor: 1 });
    expect(straight.verdict).toBe("blocked");
    expect(straight.obstruction!.depthMeters).toBeCloseTo(49.05 - 40, 3);
  });

  it("gives no verdict it cannot stand behind when terrain is missing", () => {
    const input = (heights: Array<number | null>): SightInput => ({ distanceMeters: 20_000, heights, ...masts(10, 10, 433) });
    const valley: Array<number | null> = levelPath(100).heights;
    valley[0] = 500;
    valley[2000] = 500;

    // A stretch with no terrain and nothing in the way elsewhere: not known, and not called clear.
    const holed = [...valley];
    for (let index = 800; index < 1200; index += 1) holed[index] = null;
    const unknown = analyseSight(input(holed));
    expect(unknown.verdict).toBe("incomplete");
    expect(unknown.knownShare).toBeCloseTo(1601 / 2001, 6);
    expect(unknown.obstruction).toBeNull();
    // The tightest point is the tightest of what is known: the edge of the hole, not the unseen middle.
    expect([7_990, 12_000]).toContain(unknown.tightest!.distanceMeters);

    // Ground in the way where terrain is known is in the way whatever the hole hides.
    const ridged: Array<number | null> = levelPath(100, ridge(50)).heights;
    for (let index = 200; index < 400; index += 1) ridged[index] = null;
    const blocked = analyseSight({ ...input(ridged), frequencyMHz: 145 });
    expect(blocked.verdict).toBe("blocked");
    expect(blocked.obstruction!.depthMeters).toBeCloseTo(45.886, 3);

    // No terrain under an end: nothing to stand the antenna on.
    expect(analyseSight(input([null, ...valley.slice(1)]))).toMatchObject({ verdict: "end-unknown", missingEnd: "from", tightest: null });
    expect(analyseSight(input([...valley.slice(0, -1), null]))).toMatchObject({ verdict: "end-unknown", missingEnd: "to" });
    expect(analyseSight(input([null, ...valley.slice(1, -1), null]))).toMatchObject({ verdict: "end-unknown", missingEnd: "both" });
    expect(sightSamples(input([null, ...valley.slice(1)]))).toBeNull();
    // None at all.
    expect(analyseSight(input([null, null]))).toMatchObject({ verdict: "no-terrain", knownShare: 0, tightest: null, obstruction: null });
  });
});

// ── Read from installed terrain ─────────────────────────────────────────────

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

type Failure = { error: { code: string; message: string } };
const profileOf = (from: { lat: number; lon: number }, to: { lat: number; lon: number }) =>
  app.api<TerrainProfile & Failure>("GET", `/api/maps/terrain-profile?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`);

/** Installs a terrain archive the way a person would: a file on a storage location, registered. */
async function installTerrain(name: string, tiles: FixtureTile[], bounds: [number, number, number, number]) {
  const archive = buildArchive({ tiles, bounds, tileType: TileType.Png, tileCompression: Compression.None });
  const location = app.ctx.services.storage.getDefault();
  const relPath = `imports/${name}.pmtiles`;
  fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), archive.bytes);
  const imported = await app.api("POST", "/api/maps/import", { locationId: location.id, relPath, name, tileType: "terrain" });
  expect(imported.status).toBe(200);
}

/**
 * A plain at 100 m with one ridge running north to south along 4° W, 400 m high at its
 * crest and about 1.3 km wide: ground whose height at any longitude is known exactly.
 */
const RIDGE_LON = -4;
const ridgeGround: Ground = (worldX, worldY) => {
  const { lon } = positionOf(worldX, worldY);
  return 100 + 400 * Math.exp(-(((lon - RIDGE_LON) / 0.02) ** 2));
};
const ridgeHeight = (lat: number, lon: number) => ridgeGround(...worldOf(lat, lon));
const RIDGE_BOX: [number, number, number, number] = [-4.3, 52.9, -3.7, 53.1];
/** The deepest zoom only, 64 cells to a tile: cells of 92 m at this latitude. */
const ridgeTiles = () => groundTiles(ridgeGround, { minZoom: 12, maxZoom: 12, keep: (z, x, y) => tileInBbox(RIDGE_BOX, z, x, y) });

describe("the ground between two points", () => {
  it("reads the ground along the path from installed terrain, sample by sample", async () => {
    await installTerrain("ridge", ridgeTiles(), RIDGE_BOX);
    const from = { lat: 53, lon: -4.1 };
    const to = { lat: 53, lon: -3.9 };
    const { status, body } = await profileOf(from, to);
    expect(status).toBe(200);
    const distance = haversineMeters(from.lat, from.lon, to.lat, to.lon);
    expect(body).toMatchObject({ from, to, coverage: "terrain", gaps: [] });
    expect(body.distanceMeters).toBeCloseTo(distance, 1);
    // One sample for every cell of the finest terrain a download holds (512 to a tile at zoom 12:
    // 11.5 m here), ends included.
    const cell = (40_075_016.686 * Math.cos((53 * Math.PI) / 180)) / (512 * 2 ** 12);
    expect(body.heights).toHaveLength(Math.ceil(distance / cell) + 1);
    expect(body.stepMeters).toBeCloseTo(distance / (body.heights.length - 1), 2);
    expect(body.stepMeters).toBeLessThanOrEqual(cell);
    // What was read was this archive's own cells: 64 to a tile, so eight times as wide.
    expect(body.terrain).toMatchObject({ installedMaxZoom: 12 });
    expect(body.terrain!.finestCellMeters).toBeCloseTo(cell * 8, 0);
    expect(body.terrain!.coarsestCellMeters).toBeCloseTo(cell * 8, 0);

    // Every sample is the height of the ground at its place on the great circle.
    body.heights.forEach((height, index) => {
      const point = greatCirclePoint(from, to, index / (body.heights.length - 1));
      expect(Math.abs(height! - ridgeHeight(point.lat, point.lon)), `sample ${index}`).toBeLessThan(1.5);
    });
    expect(body.heights[0]).toBeCloseTo(100, 0);
    expect(Math.max(...(body.heights as number[]))).toBeCloseTo(500, 0);
  });

  it("gives a line-of-sight check its known answer across the ridge, and along the plain beside it", async () => {
    await installTerrain("ridge", ridgeTiles(), RIDGE_BOX);
    // Across: 10 m masts on the plain either side of a 400 m ridge that is midway.
    const across = (await profileOf({ lat: 53, lon: -4.1 }, { lat: 53, lon: -3.9 })).body;
    const blocked = analyseSight({ ...across, ...masts(10, 10, 145) });
    expect(blocked.verdict).toBe("blocked");
    // The crest is at 500 m, the ray at 110 m, and the curve adds D² ÷ (8·k·R) at the middle.
    const bulge = across.distanceMeters ** 2 / (8 * (4 / 3) * EARTH_RADIUS_METERS);
    expect(bulge).toBeGreaterThan(2);
    expect(Math.abs(blocked.obstruction!.depthMeters - (500 + bulge - 110))).toBeLessThan(1.5);
    expect(Math.abs(blocked.obstruction!.distanceMeters - across.distanceMeters / 2)).toBeLessThan(across.stepMeters * 2);
    // Masts that would have to be 400 m tall: with them the ray passes over.
    expect(analyseSight({ ...across, ...masts(420, 420, 145) }).obstruction).toBeNull();

    // Along the plain, well clear of the ridge: level ground at 100 m, so only the curve and the
    // Fresnel zone matter, exactly as for the made-up level path above.
    const along = (await profileOf({ lat: 52.95, lon: -4.2 }, { lat: 53.05, lon: -4.2 })).body;
    expect(along.coverage).toBe("terrain");
    for (const height of along.heights) expect(height).toBeCloseTo(100, 0);
    const level = analyseSight({ ...along, ...masts(30, 30, 433) });
    const middle = along.distanceMeters / 2;
    expect(level.verdict).toBe("clear");
    expect(level.tightest!.share).toBeCloseTo(
      (30 - middle ** 2 / (2 * (4 / 3) * EARTH_RADIUS_METERS)) / Math.sqrt((wavelengthMeters(433) * middle) / 2),
      1,
    );
    expect(analyseSight({ ...along, ...masts(2, 2, 145) }).verdict).toBe("fresnel");
  });

  it("says which part of a path has no terrain, and when none of it has", async () => {
    await installTerrain("ridge", ridgeTiles(), RIDGE_BOX);
    // Starts inside the terrain and runs out of its eastern edge at 3.7° W.
    const from = { lat: 53, lon: -3.9 };
    const to = { lat: 53, lon: -3.5 };
    const { body } = await profileOf(from, to);
    expect(body.coverage).toBe("partial");
    expect(body.gaps).toHaveLength(1);
    const edge = haversineMeters(from.lat, from.lon, 53, -3.7);
    // The archive holds whole tiles, so its heights run a little past the box it declares; the
    // gap starts at the box's edge all the same, because that is all the archive vouches for.
    expect(Math.abs(body.gaps[0]!.startMeters - edge)).toBeLessThan(body.stepMeters * 2);
    expect(body.gaps[0]!.endMeters).toBeCloseTo(body.distanceMeters, 0);
    expect(body.heights[0]).not.toBeNull();
    expect(body.heights.at(-1)).toBeNull();
    expect(analyseSight({ ...body, ...masts(10, 10, 145) })).toMatchObject({ verdict: "end-unknown", missingEnd: "to" });

    // Nowhere near any of it.
    const outside = await profileOf({ lat: 51, lon: 0 }, { lat: 51.1, lon: 0.2 });
    expect(outside.body).toMatchObject({ coverage: "none", terrain: null });
    expect(outside.body.gaps).toEqual([{ startMeters: 0, endMeters: outside.body.distanceMeters }]);
    expect(outside.body.heights.every((height) => height === null)).toBe(true);
    expect(analyseSight({ ...outside.body, ...masts(10, 10, 145) }).verdict).toBe("no-terrain");
  });

  it("does not call a path clear when the terrain between its ends is missing", async () => {
    // Two archives with a tile's width between them, and the ridge in the hole.
    const west: [number, number, number, number] = [-4.3, 52.9, -4.05, 53.1];
    const east: [number, number, number, number] = [-3.95, 52.9, -3.7, 53.1];
    for (const [name, box] of [
      ["west", west],
      ["east", east],
    ] as const) {
      await installTerrain(name, groundTiles(ridgeGround, { minZoom: 12, maxZoom: 12, keep: (z, x, y) => tileInBbox(box, z, x, y) }), box);
    }
    const from = { lat: 53, lon: -4.1 };
    const { body } = await profileOf(from, { lat: 53, lon: -3.9 });
    expect(body.coverage).toBe("partial");
    expect(body.heights[0]).toBeCloseTo(100, 0);
    expect(body.heights.at(-1)).toBeCloseTo(100, 0);
    // The hole is the one tile neither archive holds: from 4.0430° W to 3.9551° W.
    expect(body.gaps).toHaveLength(1);
    expect(Math.abs(body.gaps[0]!.startMeters - haversineMeters(53, -4.1, 53, -180 + (2002 * 360) / 4096))).toBeLessThan(
      body.stepMeters * 2,
    );
    expect(Math.abs(body.gaps[0]!.endMeters - haversineMeters(53, -4.1, 53, -180 + (2003 * 360) / 4096))).toBeLessThan(body.stepMeters * 2);
    // What can be seen of the ground is below the ray, and the ridge is in the part that cannot.
    const result = analyseSight({ ...body, ...masts(10, 10, 145) });
    expect(result.verdict).toBe("incomplete");
    expect(result.obstruction).toBeNull();
    expect(result.knownShare).toBeGreaterThan(0.5);
    expect(result.knownShare).toBeLessThan(0.6);
  });

  it("answers without any terrain installed, and refuses what is not a path", async () => {
    const none = await profileOf({ lat: 53, lon: -4.1 }, { lat: 53, lon: -3.9 });
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ coverage: "none", heights: [null, null], terrain: null });
    expect(none.body.gaps).toEqual([{ startMeters: 0, endMeters: none.body.distanceMeters }]);

    const refused = async (query: string) => {
      const { status, body } = await app.api<Failure>("GET", `/api/maps/terrain-profile${query}`);
      expect(status, query).toBe(400);
      return body.error.message;
    };
    expect(await refused("")).toMatch(/Give `from` as latitude,longitude/);
    expect(await refused("?from=53,-4")).toMatch(/Give `to` as latitude,longitude/);
    expect(await refused("?from=north&to=53,-4")).toMatch(/Give `from` as latitude,longitude/);
    expect(await refused("?from=91,0&to=53,-4")).toMatch(/`from` is not a place on Earth/);
    expect(await refused("?from=53,-4&to=53,-181")).toMatch(/`to` is not a place on Earth/);
    expect(await refused("?from=53,-4&to=53,-4")).toMatch(/same place/);
    // London to Rome, about 1,430 km.
    expect(await refused("?from=51.5,-0.12&to=41.9,12.5")).toMatch(/1,43\d km apart\. Line of sight is checked up to 1,000 km/);
  });

  it("reads a path of hundreds of kilometres from a handful of coarser tiles", async () => {
    // Terrain from zoom 8 to 12 in a strip along 53° N, three degrees and more wide.
    const strip: [number, number, number, number] = [-5.2, 52.9, -0.3, 53.4];
    const tiles = groundTiles(ridgeGround, { minZoom: 8, maxZoom: 12, keep: (z, x, y) => tileInBbox(strip, z, x, y) });
    await installTerrain("strip", tiles, strip);
    const read = vi.spyOn(app.ctx.services.maps.tiles, "getTile");

    const from = { lat: 53, lon: -5 };
    const to = { lat: 53, lon: -0.5 };
    const started = performance.now();
    const { body } = await profileOf(from, to);
    const took = performance.now() - started;
    expect(body.distanceMeters).toBeGreaterThan(300_000);
    expect(body.coverage).toBe("terrain");
    // As many samples as a profile may hold and no more, so the step is wider than a cell of the finest terrain.
    expect(body.heights).toHaveLength(MAX_PROFILE_SAMPLES);
    expect(body.stepMeters).toBeCloseTo(body.distanceMeters / (MAX_PROFILE_SAMPLES - 1), 2);
    expect(body.stepMeters).toBeGreaterThan(70);
    // Read two zooms up from the finest, where a download's cells (512 to a tile) are between half
    // a step and a step wide. This archive has 64 to a tile, so its cells there are eight times that.
    const cell = (40_075_016.686 * Math.cos((53 * Math.PI) / 180)) / (512 * 2 ** 10);
    expect(cell).toBeGreaterThan(body.stepMeters / 2);
    expect(cell).toBeLessThanOrEqual(body.stepMeters);
    expect(body.terrain!.coarsestCellMeters / 8 / cell).toBeCloseTo(1, 1);
    // A dozen or so tiles for the whole path, each asked for once.
    const asked = read.mock.calls.map(([, z, x, y]) => `${z}/${x}/${y}`);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.every((key) => key.startsWith("10/"))).toBe(true);
    expect(asked.length).toBeGreaterThan(8);
    expect(asked.length).toBeLessThanOrEqual(24);
    // The ridge is still there, lower than it stands: each cell is 368 m of a ridge 1.3 km wide.
    const crest = Math.max(...(body.heights as number[]));
    expect(crest).toBeGreaterThan(440);
    expect(crest).toBeLessThanOrEqual(500);
    // Generous, for a machine doing other things.
    expect(took).toBeLessThan(5_000);

    // A short path over the same terrain is read at the finest zoom there is.
    read.mockClear();
    const short = (await profileOf({ lat: 53, lon: -4.05 }, { lat: 53, lon: -3.95 })).body;
    expect(read.mock.calls.every(([, z]) => z === 12)).toBe(true);
    expect(Math.max(...(short.heights as number[]))).toBeCloseTo(500, 0);
  });
});

describe("searching the map for a locator", () => {
  it("answers with the middle of the square and the locator as it is written", async () => {
    const found = await app.api<PlaceSearchResponse>("GET", "/api/maps/places?q=io83qm");
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ query: "io83qm", places: [], coordinate: { format: "maidenhead", locator: "IO83QM" } });
    expect(found.body.coordinate!.lat).toBeCloseTo(53.520833, 5);
    expect(found.body.coordinate!.lon).toBeCloseTo(-2.625, 5);
    expect(found.body.otherReadings).toBeUndefined();

    const both = await app.api<PlaceSearchResponse>("GET", "/api/maps/places?q=NN16");
    expect(both.body.coordinate).toMatchObject({ format: "osgb" });
    expect(both.body.otherReadings).toEqual([{ lat: 46.5, lon: 83, format: "maidenhead", locator: "NN16" }]);
  });
});
