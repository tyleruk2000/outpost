import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  analyseSight,
  computeViewshed,
  createTileSampler,
  decodeBits,
  destinationPoint,
  encodeBits,
  haversineMeters,
  initialBearingDeg,
  maxSightDistanceMeters,
  RANGE_BANDS,
  RANGE_BEARINGS,
  RANGE_FAR_READ_METERS,
  RANGE_MAX_METERS,
  RANGE_NEAR_STEP_METERS,
  RANGE_SHADOW_TOLERANCE_METERS,
  RELAY_MOST,
  type ReachInput,
  type RelayPlan,
  rangeDistances,
  rangeGrid,
  rangeSampleIndex,
  reachAlong,
  type SightRange,
  seenRunsOf,
  sightAlong,
  sightRunsAlong,
  smoothRangeMeters,
  typicalRangeMeters,
} from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { createSightRanger, viewshedOf } from "../src/modules/maps/sight-range.ts";
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
    expect(cut).toMatchObject({ reachMeters: 8000, limit: "terrain", unknownFromMeters: 8050 });
    // Terrain ends at 25 km, past the horizon: the reach is known, what is past it is not.
    const late = reachAlong({
      groundMeters: 0,
      ...ground(30_000, 0, (d) => (d > 25_000 ? null : 0)),
      aerialMeters: 10,
      stationMeters: 1.5,
    });
    expect(late.limit).toBe("sight");
    expect(late.unknownFromMeters).toBe(25_050);
    // In sight all the way to the end of the walk: the maximum distance is what stops it.
    const high = reachAlong({ groundMeters: 2000, ...ground(30_000, 0), aerialMeters: 10, stationMeters: 1.5 });
    expect(high.limit).toBe("max");
  });

  it("from a summit: the slopes below are hidden at once, but the far valley and the hill beyond are in sight", () => {
    // A 900 m summit falling away on a convex slope to a valley at 100 m from 5 km out, then a 600 m hill at 30 to 32 km.
    const shape = (d: number) => (d < 5000 ? 900 - 800 * (d / 5000) ** 2 : d >= 30_000 && d <= 32_000 ? 600 : 100);
    const input = { groundMeters: 900, ...ground(40_000, 0, shape), aerialMeters: 1.5, stationMeters: 1.5 };
    const reach = reachAlong(input);
    const sight = sightRunsAlong(input);
    // The first unbroken stretch is the top of the slope: what the outline was drawn from, wrongly, from a hilltop.
    expect(reach.reachMeters).toBeLessThan(1500);
    // In sight: the summit's own top, nothing of the convex slope below it, and the hill far out; the outline is that hill.
    expect(sight.runs[0]![0]).toBe(0);
    expect(sight.runs.at(-1)![1]).toBeGreaterThanOrEqual(32_000);
    expect(sight.furthestMeters).toBeGreaterThanOrEqual(32_000);
    expect(sight.limit).toBe("sight");
    // Each stretch in sight matches the one-sample test, sample by sample.
    const seen = sightAlong(input);
    for (const [from, to] of sight.runs) {
      for (let index = 0; index < input.distances.length; index += 1) {
        const d = input.distances[index]!;
        if (d > from + 50 && d < to - 50) expect(seen[index], `${d} m`).toBe(true);
      }
    }
    // Most of the ground out to the hill is hidden.
    expect(sight.hiddenWeight / sight.totalWeight).toBeGreaterThan(0.3);
  });

  it("says where the outline ends: still in sight at the end of the walk, or where terrain runs out in sight", () => {
    const flat = (meters: number, at: (d: number) => number | null = () => 0) => ({
      groundMeters: 2000,
      ...ground(meters, 0, at),
      aerialMeters: 10,
      stationMeters: 1.5,
    });
    expect(sightRunsAlong(flat(5000)).limit).toBe("max");
    expect(sightRunsAlong(flat(5000, (d) => (d > 3000 ? null : 0))).limit).toBe("terrain");
    // Hemmed in by a wall 100 m off: the wall is in sight and nothing beyond it.
    const walled = sightRunsAlong({
      ...flat(5000),
      groundMeters: 0,
      aerialMeters: 0,
      stationMeters: 0,
      heights: flat(5000).heights.map((_, i) => (i === 0 ? 50 : 0)),
    });
    expect(walled).toMatchObject({ runs: [[0, 75]], furthestMeters: 50, limit: "sight" });
  });

  it("walks every 10 m to 2 km, every 50 m to 25 km, every 100 m to 50 km and every 250 m to 100 km, and finds points along a bearing", () => {
    const distances = rangeDistances();
    expect(distances[0]).toBe(10);
    expect(distances.at(-1)).toBe(RANGE_MAX_METERS);
    expect(distances.filter((d) => d <= 2_000)).toHaveLength(200);
    expect(distances.filter((d) => d > 2_000 && d <= 25_000)).toHaveLength(460);
    expect(distances.filter((d) => d > 25_000 && d <= 50_000)).toHaveLength(250);
    expect(distances).toHaveLength(200 + 460 + 250 + 200);
    // The index of a sample is worked out from the bands, without looking: at or just beyond the distance.
    for (const meters of [1, 10, 11, 1_999, 2_000, 2_001, 2_050, 50, 51, 24_999, 25_000, 25_001, 49_950, 50_000, 50_100, 99_999, 100_000]) {
      const index = rangeSampleIndex(meters, RANGE_BANDS);
      expect(distances[index], `${meters} m`).toBeGreaterThanOrEqual(meters);
      if (index > 0) expect(distances[index - 1], `${meters} m`).toBeLessThan(meters);
    }
    expect(rangeSampleIndex(0, RANGE_BANDS)).toBe(-1);
    const from = { lat: 53, lon: -4 };
    for (const bearing of [0, 45, 90, 200, 355]) {
      const to = destinationPoint(from, bearing, 40_000);
      expect(haversineMeters(from.lat, from.lon, to.lat, to.lon)).toBeCloseTo(40_000, 3);
      expect(initialBearingDeg(from, to)).toBeCloseTo(bearing, 6);
    }
  });

  it("reads the ground beyond 50 km from tiles as fine as the band before it, where the terrain has them", async () => {
    const asked: number[] = [];
    const zooms = new Set<number>();
    const flat = { size: 512, heights: new Float32Array(512 * 512).fill(100) };
    const sampler = createTileSampler({
      terrain: () => ({ minzoom: 0, maxzoom: 12, bounds: [-180, -85, 180, 85] }),
      getTile: async (z) => {
        zooms.add(z);
        return flat;
      },
    });
    const watched = {
      ...sampler,
      sampleGrid: (lons: Float64Array, lats: Float64Array, spacing: number) => {
        asked.push(spacing);
        return sampler.sampleGrid(lons, lats, spacing);
      },
    };
    const shed = await computeViewshed(watched, { maxzoom: 12 }, { lat: 55, lon: -4 }, 10, 1.5);
    // Twice the step for each band, but never more than twice RANGE_FAR_READ_METERS.
    expect(asked).toEqual([20, 100, 200, 200]);
    expect(RANGE_FAR_READ_METERS).toBe(100);
    // At 55° N cells of 100 m and finer are zoom 9; the far band used to read zoom 8.
    expect([...zooms].sort((a, b) => a - b)).toEqual([9, 10, 12]);
    expect(shed.range.terrain?.coarsestCellMeters).toBeLessThan(100);
  });

  it("works out every bearing at once with the same answers as one bearing at a time, and sends them as bits", () => {
    const distances = rangeDistances(20_000);
    const bearings = 8;
    const heights = new Float32Array(bearings * distances.length);
    const rolling = (b: number, d: number) => 120 + 60 * Math.sin(d / (900 + 200 * b)) + 35 * Math.sin(d / 430 + b);
    for (let b = 0; b < bearings; b += 1)
      for (let i = 0; i < distances.length; i += 1) heights[b * distances.length + i] = rolling(b, distances[i]!);
    // Terrain runs out half way along one bearing.
    for (let i = 200; i < distances.length; i += 1) heights[3 * distances.length + i] = Number.NaN;
    const shed = viewshedOf({
      groundMeters: 150,
      aerialMeters: 20,
      stationMeters: 1.5,
      bearings,
      distances: Float64Array.from(distances),
      heights,
    });
    const bits = decodeBits(encodeBits(shed.bits));
    expect(Array.from(bits)).toEqual(Array.from(shed.bits));
    for (let b = 0; b < bearings; b += 1) {
      const one = Array.from(heights.subarray(b * distances.length, (b + 1) * distances.length), (h) => (Number.isNaN(h) ? null : h));
      const seen = sightAlong({ groundMeters: 150, distances, heights: one, aerialMeters: 20, stationMeters: 1.5 });
      seen.forEach((value, i) => {
        const bit = b * distances.length + i;
        expect(((bits[bit >> 3]! >> (bit & 7)) & 1) === 1, `bearing ${b}, ${distances[i]} m`).toBe(value === true);
      });
      const runs = sightRunsAlong({ groundMeters: 150, distances, heights: one, aerialMeters: 20, stationMeters: 1.5 });
      expect(shed.bearings[b]!.furthestMeters).toBe(runs.furthestMeters);
      expect(shed.bearings[b]!.limit).toBe(runs.limit);
    }
    expect(shed.bearings[3]!.unknownFromMeters).toBe(distances[200]);
    // Some of it in sight, not all of it.
    const near = shed.shares.find((share) => share.withinMeters === 10_000)!.share!;
    expect(near).toBeGreaterThan(0.02);
    expect(near).toBeLessThan(0.98);
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
const towards = (range: SightRange, bearing: number) => range.bearings.find((entry) => entry.bearingDeg === bearing)!;

describe("the typical range", () => {
  const of = (...furthest: number[]) => typicalRangeMeters(furthest.map((furthestMeters) => ({ furthestMeters })));

  it("is the median of the furthest ground in sight on each bearing, so one long glen does not pull it out", () => {
    expect(of(3000, 5000, 4000)).toBe(4000);
    expect(of(3000, 5000, 4000, 90_000)).toBe(4500);
    // 719 bearings to 12 km and one to 95 km: the mean would be 12.1 km and grows with every far glen; the median stays.
    expect(of(...Array.from({ length: 719 }, () => 12_000), 95_000)).toBe(12_000);
  });

  it("counts a bearing with nothing in sight as 0 m", () => {
    expect(of(0, 0, 0, 20_000)).toBe(0);
    expect(of(0, 0, 20_000, 30_000)).toBe(10_000);
    expect(of(0, 10_000, 20_000)).toBe(10_000);
  });

  it("is null with no bearings, and rounded to the metre", () => {
    expect(of()).toBeNull();
    expect(of(1000.4, 2000.3)).toBe(1500);
  });
});

describe("a repeater's estimated range", () => {
  it("with no terrain installed gives the smooth-Earth horizon and says it has nothing else", async () => {
    const { status, body } = await rangeOf(AT, 10, 1.5);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      coverage: "none",
      groundMeters: null,
      bearings: [],
      bearingCount: 0,
      seen: "",
      hiddenShare: null,
      terrain: null,
      typicalMeters: null,
      maxMeters: 100_000,
    });
    expect(body.shares.every((share) => share.share === null)).toBe(true);
    expect(body.horizonMeters).toBe(Math.round(maxSightDistanceMeters(10, 1.5)));
  });

  it("over a ridge: the plain behind it is hidden, the others are in sight to the horizon, and the terrain is said to be partial", async () => {
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
    expect(body.bearingCount).toBe(RANGE_BEARINGS);
    expect(body.terrain).not.toBeNull();

    // East, across the ridge 4 km away: in sight up the near face to about the crest, and nothing beyond.
    const east = towards(body, 90);
    expect(east.furthestMeters).toBeGreaterThan(3000);
    expect(east.furthestMeters).toBeLessThan(5000);
    expect(east.limit).toBe("sight");
    // West, north and south over the plain: the horizon for 10 m and 1.5 m over flat ground, 18.1 km.
    for (const bearing of [270, 0, 180]) {
      const plain = towards(body, bearing);
      expect(Math.abs(plain.furthestMeters - maxSightDistanceMeters(10, 1.5)), `bearing ${bearing}`).toBeLessThan(400);
      expect(plain.limit).toBe("sight");
      // Terrain runs out past it, which is why the whole is partial.
      expect(plain.unknownFromMeters).not.toBeNull();
    }

    // The bits say the same: in sight up to the furthest ground on each bearing, and nothing past it.
    const grid = rangeGrid(body);
    for (const bearing of [0, 180, 360, 540]) {
      const runs = seenRunsOf(grid, bearing);
      expect(runs.at(-1)![1]).toBeGreaterThanOrEqual(body.bearings[bearing]!.furthestMeters);
      expect(runs.at(-1)![1]).toBeLessThan(body.bearings[bearing]!.furthestMeters + 100);
    }
    // Within 10 km the plain is in sight all round but behind the ridge: most of it.
    const near = body.shares.find((share) => share.withinMeters === 10_000)!.share!;
    expect(near).toBeGreaterThan(0.6);
    expect(near).toBeLessThan(1);

    // Typical: most bearings look over the plain to the horizon, the few across the ridge stop at its crest.
    expect(body.typicalMeters).toBe(typicalRangeMeters(body.bearings));
    expect(Math.abs(body.typicalMeters! - maxSightDistanceMeters(10, 1.5))).toBeLessThan(400);

    // Asked again, the answer is the same.
    expect((await rangeOf(AT, 10, 1.5)).body).toEqual(body);
  });

  it("where terrain ends while the ground is in sight, says more may be beyond", async () => {
    // A box only 6 km across round the repeater.
    await installTerrain(
      "small",
      groundTiles(() => 100, { minZoom: 11, maxZoom: 11, bbox: [-4.1, 52.98, -4.02, 53.02] }),
      [-4.1, 52.98, -4.02, 53.02],
    );
    const { body } = await rangeOf(AT, 10, 1.5);
    expect(body.coverage).toBe("partial");
    expect(body.bearings.every((bearing) => bearing.limit === "terrain")).toBe(true);
    expect(towards(body, 0).furthestMeters).toBeLessThan(5000);
  });

  it("with terrain all round is in sight to the horizon on every bearing and calls it complete", async () => {
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
      expect(Math.abs(bearing.furthestMeters - horizon)).toBeLessThan(400);
      expect(bearing).toMatchObject({ limit: "sight", unknownFromMeters: null });
    }
    expect(body.hiddenShare).toBe(0);
    // All the ground within 10 km is in sight; little of it within 100 km, which is past the horizon.
    expect(body.shares.find((share) => share.withinMeters === 10_000)!.share).toBe(1);
    expect(body.shares.find((share) => share.withinMeters === 100_000)!.share).toBeLessThan(0.2);
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

describe("the relay planner", () => {
  const relayOf = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, query = "aHeight=1.5&bHeight=1.5&relay=1.5") =>
    app.api<RelayPlan & Failure>("GET", `/api/maps/relay?a=${a.lat},${a.lon}&b=${b.lat},${b.lon}&${query}`);

  it("finds the ridge between two places on either side of it, highest first, in sight of both", async () => {
    await installTerrain(
      "ridge",
      groundTiles(ridgeGround, { minZoom: 11, maxZoom: 11, bbox: [-4.4, 52.8, -3.7, 53.2] }),
      [-4.4, 52.8, -3.7, 53.2],
    );
    // Each 8 km from the crest, low on the plain: neither in sight of the other.
    const a = { lat: 53, lon: -4.12 };
    const b = { lat: 53.01, lon: -3.88 };
    const { status, body } = await relayOf(a, b, "aHeight=1.5&bHeight=1.5&relay=2");
    expect(status).toBe(200);
    expect(body.distanceMeters).toBeGreaterThan(8000);
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates.length).toBeLessThanOrEqual(2 * RELAY_MOST);
    // The highest is on the ridge's crest along 4° W, about 500 m up, and between the two.
    const best = body.candidates[0]!;
    expect(Math.abs(best.at.lon + 4)).toBeLessThan(0.01);
    expect(best.groundMeters).toBeGreaterThan(450);
    expect(best.fromAMeters).toBeLessThan(12_000);
    expect(best.fromBMeters).toBeLessThan(12_000);
    // Those named are in height order, then the nearest; each well apart from the others.
    const highest = body.candidates.slice(0, RELAY_MOST);
    for (let index = 1; index < highest.length; index += 1)
      expect(Math.round(highest[index]!.groundMeters / 10)).toBeLessThanOrEqual(Math.round(highest[index - 1]!.groundMeters / 10));
    // The ground in sight of both is shaded from A's bearings: the crest where the best place is, not the plain beyond.
    const grid = rangeGrid(body.both!);
    const towardsBest = Math.round((initialBearingDeg(a, best.at) * RANGE_BEARINGS) / 360) % RANGE_BEARINGS;
    const runs = [towardsBest - 1, towardsBest, towardsBest + 1].flatMap((bearing) => seenRunsOf(grid, bearing));
    expect(runs.some(([from, to]) => from <= best.fromAMeters + 100 && to >= best.fromAMeters - 100)).toBe(true);
    expect(body.both!.bearings.every((bearing) => bearing.furthestMeters < 25_000)).toBe(true);
  });

  it("with no terrain says so, and refuses ends too far apart", async () => {
    const { body } = await relayOf({ lat: 53, lon: -4.06 }, { lat: 53.1, lon: -3.9 });
    expect(body).toMatchObject({ coverage: "none", both: null, candidates: [] });
    const far = await relayOf({ lat: 53, lon: -4 }, { lat: 56, lon: -4 });
    expect(far.status).toBe(400);
    expect(far.body.error.message).toMatch(/200 km apart/);
  });
});

// ── Worked out a band at a time, kept, and stopped ──────────────────────────

describe("the ground read once for a place, near first", () => {
  /** Flat ground at 100 m with a hill to the north, from tiles of one zoom, counting the tiles read. */
  function countingSampler(options: { wait?: () => Promise<void> } = {}) {
    const read = { tiles: 0 };
    const hill = { size: 256, heights: new Float32Array(256 * 256) };
    for (let row = 0; row < 256; row += 1) hill.heights.fill(row < 40 ? 400 : 100, row * 256, (row + 1) * 256);
    const sampler = createTileSampler({
      terrain: () => ({ minzoom: 9, maxzoom: 9, bounds: [-180, -85, 180, 85] }),
      getTile: async () => {
        read.tiles += 1;
        await options.wait?.();
        return hill;
      },
    });
    const terrain = { maxzoom: 9 };
    const tiles = { sources: () => ({ sources: { terrain } }), regions: () => [] } as unknown as Parameters<typeof createSightRanger>[1];
    return { read, sampler, ranger: createSightRanger(sampler, tiles), terrain };
  }
  const HERE = { lat: 53, lon: -4.06 };

  it("gives the same answer as reading it whole, and other heights there read no terrain again", async () => {
    const { read, sampler, ranger, terrain } = countingSampler();
    const first = await ranger(HERE, 10, 1.5);
    const tilesRead = read.tiles;
    expect(tilesRead).toBeGreaterThan(0);
    expect(first).toEqual((await computeViewshed(sampler, terrain, HERE, 10, 1.5)).range);
    for (const [aerial, station] of [
      [1, 2],
      [1.5, 2],
      [5, 2],
      [10, 8],
    ] as const) {
      const before = read.tiles;
      const other = await ranger(HERE, aerial, station);
      // Worked out over the ground already read.
      expect(read.tiles).toBe(before);
      expect(other).toEqual((await computeViewshed(sampler, terrain, HERE, aerial, station)).range);
    }
  });

  it("tells of each band as it is read, the near ground first, each part the same as the whole out to there", async () => {
    const { ranger } = countingSampler();
    const parts: Array<{ done: number; range?: SightRange }> = [];
    const whole = await ranger(HERE, 10, 1.5, { onPart: (part) => parts.push(part) });
    expect(parts.map((part) => part.done)).toEqual([...parts.map((part) => part.done)].sort((a, b) => a - b));
    expect(parts.every((part) => part.done > 0 && part.done < 1)).toBe(true);
    const drawn = parts.flatMap((part) => (part.range ? [part.range] : []));
    expect(drawn.map((range) => range.maxMeters)).toEqual([25_000, 50_000]);
    const full = rangeGrid(whole);
    for (const range of drawn) {
      expect(range.bands.at(-1)!.toMeters).toBe(range.maxMeters);
      const grid = rangeGrid(range);
      expect(grid.distances).toEqual(full.distances.slice(0, grid.distances.length));
      for (const bearing of [0, 90, 180, 359, 540]) {
        for (let index = 0; index < grid.distances.length; index += 7)
          expect(grid.seen(bearing, index), `${bearing}, ${grid.distances[index]} m`).toBe(full.seen(bearing, index));
      }
    }
    // An answer already known is sent at once, with nothing to tell along the way.
    const again: unknown[] = [];
    expect(await ranger(HERE, 10, 1.5, { onPart: (part) => again.push(part) })).toBe(whole);
    expect(again).toEqual([]);
  });

  it("stops reading once nobody waits for it, keeps nothing, and reads it afresh when asked again", async () => {
    const { read, ranger } = countingSampler({ wait: () => new Promise<void>((resolve) => setTimeout(resolve, 2)) });
    const controller = new AbortController();
    const asked = ranger(HERE, 10, 1.5, {
      signal: controller.signal,
      onPart: () => controller.abort(),
    });
    await expect(asked).rejects.toThrow(/abort/i);
    const atStop = read.tiles;
    await new Promise((resolve) => setTimeout(resolve, 60));
    // At most the tile being read when it stopped.
    expect(read.tiles - atStop).toBeLessThanOrEqual(1);
    // Not kept: asked again, the whole ground is read.
    const before = read.tiles;
    const range = await ranger(HERE, 10, 1.5);
    expect(range.bearingCount).toBe(RANGE_BEARINGS);
    expect(read.tiles - before).toBeGreaterThan(atStop);
  });

  it("goes on for the others waiting when one of them stops waiting", async () => {
    const { ranger } = countingSampler({ wait: () => new Promise<void>((resolve) => setTimeout(resolve, 1)) });
    const leaving = new AbortController();
    const one = ranger(HERE, 10, 1.5, { signal: leaving.signal });
    const other = ranger(HERE, 5, 2);
    leaving.abort();
    await expect(one).rejects.toThrow(/abort/i);
    expect((await other).bearingCount).toBe(RANGE_BEARINGS);
  });
});

describe("a range sent a line at a time", () => {
  type Line = { type: string; done?: number; expectMs?: number | null; range?: SightRange };
  const linesOf = (text: string) =>
    text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Line);

  it("says how long the last took, the share done, the range to 25 km and 50 km, then the whole answer", async () => {
    await installTerrain(
      "ridge",
      groundTiles(ridgeGround, { minZoom: 11, maxZoom: 11, bbox: [-4.4, 52.8, -3.7, 53.2] }),
      [-4.4, 52.8, -3.7, 53.2],
    );
    const url = `/api/maps/sight-range?at=${AT.lat},${AT.lon}&aerial=10&station=1.5`;
    const response = await app.app.inject({
      method: "GET",
      url,
      headers: { host: "localhost", "x-outpost-request": "1", accept: "application/x-ndjson, application/json" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    const lines = linesOf(response.body);
    expect(lines[0]).toEqual({ type: "start", done: 0, expectMs: null });
    expect(lines.map((line) => line.type)).toEqual(["start", "progress", "part", "part", "end"]);
    const done = lines.map((line) => line.done!);
    expect(done).toEqual([...done].sort((a, b) => a - b));
    expect(done.at(-1)).toBe(1);
    expect(lines.filter((line) => line.type === "part").map((line) => line.range!.maxMeters)).toEqual([25_000, 50_000]);
    // The last line is the plain answer.
    const plain = await rangeOf(AT, 10, 1.5);
    expect(lines.at(-1)!.range).toEqual(plain.body);

    // Elsewhere, the time the first took is given as what to expect.
    const elsewhere = await app.app.inject({
      method: "GET",
      url: `/api/maps/sight-range?at=53.01,-4.1&aerial=10&station=1.5`,
      headers: { host: "localhost", "x-outpost-request": "1", accept: "application/x-ndjson" },
    });
    expect(linesOf(elsewhere.body)[0]!.expectMs).toBeGreaterThan(0);
  });

  it("is compressed when the browser takes it, a tenth of the size or less", async () => {
    await installTerrain(
      "ridge",
      groundTiles(ridgeGround, { minZoom: 11, maxZoom: 11, bbox: [-4.4, 52.8, -3.7, 53.2] }),
      [-4.4, 52.8, -3.7, 53.2],
    );
    const response = await app.app.inject({
      method: "GET",
      url: `/api/maps/sight-range?at=${AT.lat},${AT.lon}&aerial=10&station=1.5`,
      headers: { host: "localhost", "x-outpost-request": "1", accept: "application/x-ndjson", "accept-encoding": "br, gzip" },
    });
    expect(response.headers["content-encoding"]).toBe("br");
    const text = zlib.brotliDecompressSync(response.rawPayload).toString("utf8");
    const lines = linesOf(text);
    expect(lines.at(-1)!.type).toBe("end");
    expect(response.rawPayload.length).toBeLessThan(text.length / 10);
  });
});
