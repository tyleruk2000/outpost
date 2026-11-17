import fs from "node:fs";
import path from "node:path";
import {
  analyseSight,
  destinationPoint,
  haversineMeters,
  initialBearingDeg,
  maxSightDistanceMeters,
  RANGE_BEARINGS,
  RANGE_MAX_METERS,
  RANGE_NEAR_STEP_METERS,
  RANGE_SHADOW_TOLERANCE_METERS,
  type ReachInput,
  rangeDistances,
  reachAlong,
  type SightRange,
  sightAlong,
  smoothRangeMeters,
} from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { buildArchive, type FixtureTile } from "./fixtures/maps/archive.ts";
import { type Ground, groundTiles, positionOf } from "./fixtures/maps/terrain.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// ── The sums, on ground worked by hand ──────────────────────────────────────

/** Samples every 100 m out to `meters`, all at one height unless `at` says otherwise. */
function ground(meters: number, base: number, at: (d: number) => number | null = () => base) {
  const distances: number[] = [];
  for (let d = RANGE_NEAR_STEP_METERS; d <= meters; d += RANGE_NEAR_STEP_METERS) distances.push(d);
  return { distances, heights: distances.map(at) };
}

describe("how far a station stays in sight", () => {
  it("over flat ground reaches the smooth-Earth radio horizon, 4.12 × (√h1 + √h2) km", () => {
    // 10 m and 1.5 m: 4.12 × (3.162 + 1.225) = 18.07 km.
    expect(smoothRangeMeters(10, 1.5) / 1000).toBeCloseTo(4.12 * (Math.sqrt(10) + Math.sqrt(1.5)), 1);
    for (const [aerial, station] of [
      [10, 1.5],
      [30, 2],
      [15, 8],
    ] as const) {
      const flat = reachAlong({ groundMeters: 50, ...ground(60_000, 50), aerialMeters: aerial, stationMeters: station });
      const horizon = maxSightDistanceMeters(aerial, station);
      // Within one sample of the formula: the walk reads the ground every 100 m.
      expect(Math.abs(flat.reachMeters - horizon)).toBeLessThanOrEqual(RANGE_NEAR_STEP_METERS);
      expect(flat).toMatchObject({ limit: "sight", furtherMeters: null, unknownFromMeters: null, hiddenShare: 0 });
    }
  });

  it("says in sight exactly where the check between two points finds nothing in the way", () => {
    // Rolling ground with a few hills, made from a fixed rule so the test is the same every time.
    const rolling = (d: number) => 120 + 60 * Math.sin(d / 1700) + 35 * Math.sin(d / 430 + 1) + (d > 9000 && d < 9800 ? 140 : 0);
    const input: ReachInput = { groundMeters: rolling(0), ...ground(20_000, 0, rolling), aerialMeters: 60, stationMeters: 1.5 };
    const seen = sightAlong(input);
    let inSight = 0;
    for (let index = 0; index < seen.length; index += 1) {
      const d = input.distances[index]!;
      const heights = [input.groundMeters, ...input.heights.slice(0, index + 1)];
      const check = analyseSight({ distanceMeters: d, heights, antennaFromMeters: 60, antennaToMeters: 1.5, frequencyMHz: 145 });
      expect(seen[index], `${d} m`).toBe(check.verdict !== "blocked");
      if (seen[index]) inSight += 1;
    }
    // Both answers turn up: the rule is not all in sight or all hidden.
    expect(inSight).toBeGreaterThan(10);
    expect(inSight).toBeLessThan(seen.length - 10);
  });

  it("is cut short by a ridge, and sees from a hill further than from a valley", () => {
    // A ridge 300 m high from 3 km to 3.4 km out: past it the plain is hidden for good.
    const ridge = reachAlong({
      groundMeters: 0,
      ...ground(40_000, 0, (d) => (d >= 3000 && d <= 3400 ? 300 : 0)),
      aerialMeters: 10,
      stationMeters: 1.5,
    });
    // The near edge of its flat top is the last place in sight: a station 1.5 m up further along is below the edge.
    expect(ridge.reachMeters).toBe(3000);
    expect(ridge.limit).toBe("sight");

    // The same aerial on a hill 200 m above the plain: 4.12 × (√210 + √1.5) = 64.7 km.
    const hill = reachAlong({ groundMeters: 200, ...ground(80_000, 0), aerialMeters: 10, stationMeters: 1.5 });
    const valley = reachAlong({ groundMeters: 0, ...ground(80_000, 0), aerialMeters: 10, stationMeters: 1.5 });
    expect(hill.reachMeters).toBeGreaterThan(valley.reachMeters * 3);
    expect(Math.abs(hill.reachMeters - maxSightDistanceMeters(210, 1.5))).toBeLessThanOrEqual(RANGE_NEAR_STEP_METERS);

    // A valley floor 80 m below the plain all round: the walls hide the plain beyond.
    const sunk = reachAlong({ groundMeters: 0, ...ground(40_000, 80, (d) => (d < 1500 ? 0 : 80)), aerialMeters: 10, stationMeters: 1.5 });
    expect(sunk.reachMeters).toBeLessThan(valley.reachMeters);
  });

  it("lets a short hollow pass, stops at a long shadow, and notes high ground in sight beyond", () => {
    const hollow = (d: number) => (d >= 4000 && d <= 4400 ? -40 : 0);
    const passed = reachAlong({ groundMeters: 0, ...ground(30_000, 0, hollow), aerialMeters: 10, stationMeters: 1.5 });
    expect(passed.reachMeters).toBeGreaterThan(17_000);
    expect(passed.hiddenShare).toBeGreaterThan(0);
    expect(passed.hiddenShare).toBeLessThan(0.05);

    // A hill 5 km out hides the plain behind it; a mountain at 30 km stands back up into sight.
    const mountain = (d: number) => (d >= 5000 && d <= 5200 ? 120 : d >= 29_000 && d <= 31_000 ? 900 : 0);
    const beyond = reachAlong({ groundMeters: 0, ...ground(40_000, 0, mountain), aerialMeters: 10, stationMeters: 1.5 });
    expect(beyond.reachMeters).toBeLessThanOrEqual(5200 + RANGE_SHADOW_TOLERANCE_METERS);
    expect(beyond.furtherMeters).toBeGreaterThanOrEqual(29_000);
    expect(beyond.furtherMeters).toBeLessThanOrEqual(31_000);
  });

  it("says where terrain runs out, and whether that leaves the reach unknown", () => {
    // Terrain ends at 8 km, well inside the horizon: the reach could go on.
    const cut = reachAlong({ groundMeters: 0, ...ground(30_000, 0, (d) => (d > 8000 ? null : 0)), aerialMeters: 10, stationMeters: 1.5 });
    expect(cut).toMatchObject({ reachMeters: 8000, limit: "terrain", unknownFromMeters: 8100 });
    // Terrain ends at 25 km, past the horizon: the reach is known, what is past it is not.
    const late = reachAlong({
      groundMeters: 0,
      ...ground(30_000, 0, (d) => (d > 25_000 ? null : 0)),
      aerialMeters: 10,
      stationMeters: 1.5,
    });
    expect(late.limit).toBe("sight");
    expect(late.unknownFromMeters).toBe(25_100);
    // In sight all the way to the end of the walk: the maximum distance is what stops it.
    const high = reachAlong({ groundMeters: 2000, ...ground(30_000, 0), aerialMeters: 10, stationMeters: 1.5 });
    expect(high.limit).toBe("max");
  });

  it("walks every 100 m to 25 km and every 250 m from there to 100 km, and finds points along a bearing", () => {
    const distances = rangeDistances();
    expect(distances[0]).toBe(100);
    expect(distances.at(-1)).toBe(RANGE_MAX_METERS);
    expect(distances.filter((d) => d <= 25_000)).toHaveLength(250);
    expect(distances).toHaveLength(250 + 300);
    const from = { lat: 53, lon: -4 };
    for (const bearing of [0, 45, 90, 200, 355]) {
      const to = destinationPoint(from, bearing, 40_000);
      expect(haversineMeters(from.lat, from.lon, to.lat, to.lon)).toBeCloseTo(40_000, 3);
      expect(initialBearingDeg(from, to)).toBeCloseTo(bearing, 6);
    }
  });
});

// ── Read from installed terrain ─────────────────────────────────────────────

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

type Failure = { error: { code: string; message: string } };
const rangeOf = (at: { lat: number; lon: number }, aerial: number, station: number) =>
  app.api<SightRange & Failure>("GET", `/api/maps/sight-range?at=${at.lat},${at.lon}&aerial=${aerial}&station=${station}`);

async function installTerrain(name: string, tiles: FixtureTile[], bounds: [number, number, number, number]) {
  const archive = buildArchive({ tiles, bounds, tileType: TileType.Png, tileCompression: Compression.None });
  const location = app.ctx.services.storage.getDefault();
  const relPath = `imports/${name}.pmtiles`;
  fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), archive.bytes);
  const imported = await app.api<{ collection: { id: string } }>("POST", "/api/maps/import", {
    locationId: location.id,
    relPath,
    name,
    tileType: "terrain",
  });
  expect(imported.status).toBe(200);
  return imported.body.collection.id;
}

/** A plain at 100 m with one ridge along 4° W, 400 m high and about 1.3 km wide, as in maps-sight.test.ts. */
const ridgeGround: Ground = (worldX, worldY) => 100 + 400 * Math.exp(-(((positionOf(worldX, worldY).lon + 4) / 0.02) ** 2));
const AT = { lat: 53, lon: -4.06 };
const reachTowards = (range: SightRange, bearing: number) => range.bearings.find((entry) => entry.bearingDeg === bearing)!;

describe("a repeater's estimated range", () => {
  it("with no terrain installed gives the smooth-Earth horizon and says it has nothing else", async () => {
    const { status, body } = await rangeOf(AT, 10, 1.5);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      coverage: "none",
      groundMeters: null,
      bearings: [],
      hiddenShare: null,
      terrain: null,
      maxMeters: 100_000,
    });
    expect(body.horizonMeters).toBe(Math.round(maxSightDistanceMeters(10, 1.5)));
  });

  it("over a ridge: the bearing across it is cut short, the others reach the horizon, and the terrain is said to be partial", async () => {
    // Terrain 22 km each side north to south, 24 km to the west: far less than 100 km, so partial.
    await installTerrain(
      "ridge",
      groundTiles(ridgeGround, { minZoom: 11, maxZoom: 11, bbox: [-4.4, 52.8, -3.7, 53.2] }),
      [-4.4, 52.8, -3.7, 53.2],
    );
    const { status, body } = await rangeOf(AT, 10, 1.5);
    expect(status).toBe(200);
    expect(body.coverage).toBe("partial");
    expect(body.groundMeters).toBeCloseTo(100, 0);
    expect(body.bearings).toHaveLength(RANGE_BEARINGS);
    expect(body.terrain).not.toBeNull();

    // East, across the ridge 4 km away: in sight up the near face to about the crest, then hidden.
    const east = reachTowards(body, 90);
    expect(east.reachMeters).toBeGreaterThan(3000);
    expect(east.reachMeters).toBeLessThan(5000);
    expect(east.limit).toBe("sight");
    // West, north and south over the plain: the horizon for 10 m and 1.5 m over flat ground, 18.1 km.
    for (const bearing of [270, 0, 180]) {
      const plain = reachTowards(body, bearing);
      expect(Math.abs(plain.reachMeters - maxSightDistanceMeters(10, 1.5)), `bearing ${bearing}`).toBeLessThan(400);
      expect(plain.limit).toBe("sight");
      // Terrain runs out past it, which is why the whole is partial.
      expect(plain.unknownFromMeters).not.toBeNull();
    }
    expect(body.hiddenShare).toBeGreaterThanOrEqual(0);

    // Asked again, the answer is the same.
    expect((await rangeOf(AT, 10, 1.5)).body).toEqual(body);
  });

  it("where terrain ends inside the reach, says the bearing may go further", async () => {
    // A box only 6 km across round the repeater.
    await installTerrain(
      "small",
      groundTiles(() => 100, { minZoom: 11, maxZoom: 11, bbox: [-4.1, 52.98, -4.02, 53.02] }),
      [-4.1, 52.98, -4.02, 53.02],
    );
    const { body } = await rangeOf(AT, 10, 1.5);
    expect(body.coverage).toBe("partial");
    expect(body.bearings.every((bearing) => bearing.limit === "terrain")).toBe(true);
    expect(reachTowards(body, 0).reachMeters).toBeLessThan(5000);
  });

  it("with terrain all round reaches the horizon on every bearing and calls it complete", async () => {
    // Flat ground at 100 m over a box wider than 100 km each way, coarse enough to be quick.
    const box: [number, number, number, number] = [-6, 51.9, -2, 54.1];
    await installTerrain(
      "plain",
      groundTiles(() => 100, { minZoom: 8, maxZoom: 8, bbox: box }),
      box,
    );
    const { body } = await rangeOf(AT, 15, 8);
    expect(body.coverage).toBe("terrain");
    const horizon = maxSightDistanceMeters(15, 8);
    for (const bearing of body.bearings) {
      expect(Math.abs(bearing.reachMeters - horizon)).toBeLessThan(400);
      expect(bearing).toMatchObject({ limit: "sight", unknownFromMeters: null, furtherMeters: null });
    }
    expect(body.hiddenShare).toBe(0);
  });

  it("refuses a place or a height that is not one", async () => {
    for (const query of [
      "at=91,0&aerial=10&station=1.5",
      "at=north&aerial=10&station=1.5",
      "at=53,-4&aerial=-1&station=1.5",
      "at=53,-4&aerial=10&station=1001",
      "at=53,-4&aerial=ten&station=1.5",
      "at=53,-4",
    ]) {
      const { status, body } = await app.api<Failure>("GET", `/api/maps/sight-range?${query}`);
      expect(status, query).toBe(400);
      expect(body.error.message, query).toBeTruthy();
    }
  });
});
