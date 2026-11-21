import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { decodeBits, toblerKmh, WALK_OFF_PATH_FACTOR, type WalkReach } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { readVectorTile } from "../src/modules/maps/vector-tile.ts";
import { buildArchive, type FixtureTile } from "./fixtures/maps/archive.ts";
import { type Ground, groundTiles } from "./fixtures/maps/terrain.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// ── A map tile, written by hand ─────────────────────────────────────────────

function varint(value: number): number[] {
  const bytes: number[] = [];
  while (value > 127) {
    bytes.push((value & 127) | 128);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return bytes;
}
const field = (number: number, wire: number) => varint(number * 8 + wire);
const bytesField = (number: number, payload: number[]) => [...field(number, 2), ...varint(payload.length), ...payload];
const text = (value: string) => [...new TextEncoder().encode(value)];
const zigzag = (value: number) => (value < 0 ? -2 * value - 1 : 2 * value);

interface Drawn {
  type: 2 | 3;
  properties: Record<string, string | boolean>;
  /** Points in tile units; a polygon's ring is closed by the format. */
  points: Array<[number, number]>;
}

/** A tile of the vector format with the layers given: just what the walk reads. */
function encodeTile(layers: Record<string, Drawn[]>): Buffer {
  const out: number[] = [];
  for (const [name, features] of Object.entries(layers)) {
    const keys: string[] = [];
    const values: Array<string | boolean> = [];
    const index = <T>(list: T[], value: T) => {
      const found = list.indexOf(value);
      if (found !== -1) return found;
      list.push(value);
      return list.length - 1;
    };
    const encoded = features.map((feature) => {
      const tags = Object.entries(feature.properties).flatMap(([key, value]) => [index(keys, key), index(values, value)]);
      const geometry: number[] = [];
      let [x, y] = [0, 0];
      feature.points.forEach(([px, py], at) => {
        if (at === 0) geometry.push(1 | (1 << 3));
        else if (at === 1) geometry.push(2 | ((feature.points.length - 1) << 3));
        geometry.push(zigzag(px - x), zigzag(py - y));
        [x, y] = [px, py];
      });
      if (feature.type === 3) geometry.push(7 | (1 << 3));
      return [...bytesField(2, tags.flatMap(varint)), ...field(3, 0), ...varint(feature.type), ...bytesField(4, geometry.flatMap(varint))];
    });
    const layer = [
      ...field(15, 0),
      ...varint(2),
      ...bytesField(1, text(name)),
      ...encoded.flatMap((feature) => bytesField(2, feature)),
      ...keys.flatMap((key) => bytesField(3, text(key))),
      ...values.flatMap((value) => bytesField(4, typeof value === "string" ? bytesField(1, text(value)) : [...field(7, 0), value ? 1 : 0])),
      ...field(5, 0),
      ...varint(4096),
    ];
    out.push(...bytesField(3, layer));
  }
  return Buffer.from(out);
}

describe("reading a map tile", () => {
  it("gives the lines and polygons of the layers asked for, with their properties, in tile units", () => {
    const tile = encodeTile({
      roads: [
        {
          type: 2,
          properties: { kind: "path", is_bridge: true },
          points: [
            [10, 20],
            [400, 20],
            [400, 900],
          ],
        },
      ],
      water: [
        {
          type: 3,
          properties: { kind: "water" },
          points: [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ],
        },
      ],
      places: [
        {
          type: 2,
          properties: { kind: "x" },
          points: [
            [1, 1],
            [2, 2],
          ],
        },
      ],
    });
    const layers = readVectorTile(tile, new Set(["roads", "water"]));
    expect([...layers.keys()]).toEqual(["roads", "water"]);
    expect(layers.get("roads")!.extent).toBe(4096);
    expect(layers.get("roads")!.features[0]).toEqual({
      type: 2,
      properties: { kind: "path", is_bridge: true },
      parts: [[10, 20, 400, 20, 400, 900]],
    });
    // A ring is closed back to its first point.
    expect(layers.get("water")!.features[0]!.parts[0]!.slice(-2)).toEqual([0, 0]);
  });
});

// ── The walk, over installed terrain and a map ──────────────────────────────

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

type Failure = { error: { code: string; message: string } };
const walkOf = (at: { lat: number; lon: number }, minutes: number, pace = "standard") =>
  app.api<WalkReach & Failure>("GET", `/api/maps/walk-reach?at=${at.lat},${at.lon}&minutes=${minutes}&pace=${pace}`);

async function install(name: string, tiles: FixtureTile[], bounds: [number, number, number, number], kind: "terrain" | "vector") {
  const archive = buildArchive({
    tiles,
    bounds,
    tileType: kind === "terrain" ? TileType.Png : TileType.Mvt,
    tileCompression: kind === "terrain" ? Compression.None : Compression.Gzip,
  });
  const location = app.ctx.services.storage.getDefault();
  const relPath = `imports/${name}.pmtiles`;
  fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), archive.bytes);
  const imported = await app.api("POST", "/api/maps/import", { locationId: location.id, relPath, name, tileType: kind });
  expect(imported.status).toBe(200);
}

const AT = { lat: 53, lon: -4.06 };
const BOX: [number, number, number, number] = [-4.2, 52.9, -3.9, 53.1];
const plain: Ground = () => 100;

/** How far the walk reaches east and west of the start, along its row. */
function reachEastWest(body: WalkReach) {
  const grid = decodeBits(body.minutesGrid);
  const half = (body.size - 1) / 2;
  const row = half * body.size;
  let east = 0;
  let west = 0;
  for (let step = 0; step <= half; step += 1) {
    if (grid[row + half + step] !== 255) east = step * body.cellMeters;
    if (grid[row + half - step] !== 255) west = step * body.cellMeters;
  }
  return { east, west };
}

describe("how far on foot", () => {
  it("over flat ground with no map goes as far as Tobler's off-path pace allows, every way alike", async () => {
    await install("plain", groundTiles(plain, { minZoom: 11, maxZoom: 11, bbox: BOX }), BOX, "terrain");
    const { status, body } = await walkOf(AT, 30);
    expect(status).toBe(200);
    expect(body).toMatchObject({ coverage: "terrain", groundMeters: 100, paths: false, minutes: 30, pace: "standard" });
    // 30 minutes at three fifths of 5.04 km/h: about 1.51 km.
    const expected = ((toblerKmh(0) * WALK_OFF_PATH_FACTOR * 1000) / 60) * 30;
    const { east, west } = reachEastWest(body);
    for (const reach of [east, west]) expect(Math.abs(reach - expected)).toBeLessThanOrEqual(2 * body.cellMeters);
    expect(Math.abs(body.furthestMeters - expected)).toBeLessThan(0.05 * expected);
    // The grid's minutes grow outward from 0 at the start.
    const grid = decodeBits(body.minutesGrid);
    const half = (body.size - 1) / 2;
    expect(grid[half * body.size + half]).toBe(0);

    // At half the pace, half as far.
    const slow = (await walkOf(AT, 30, "slowest")).body;
    expect(Math.abs(reachEastWest(slow).east - expected / 2)).toBeLessThanOrEqual(2 * slow.cellMeters);
  });

  it("goes faster along a path from the map, and is stopped by a lake", async () => {
    await install("plain", groundTiles(plain, { minZoom: 11, maxZoom: 11, bbox: BOX }), BOX, "terrain");
    // At zoom 13: a path running east from the start across the tiles, and a lake filling the tiles to the west.
    const scale = 2 ** 13;
    const worldX = (AT.lon + 180) / 360;
    const worldY = (1 - Math.log(Math.tan((AT.lat * Math.PI) / 180) + 1 / Math.cos((AT.lat * Math.PI) / 180)) / Math.PI) / 2;
    const [tileX, tileY] = [Math.floor(worldX * scale), Math.floor(worldY * scale)];
    const u = Math.round((worldX * scale - tileX) * 4096);
    const v = Math.round((worldY * scale - tileY) * 4096);
    const tiles: FixtureTile[] = [];
    for (let x = tileX - 2; x <= tileX + 2; x += 1)
      for (let y = tileY - 2; y <= tileY + 2; y += 1) {
        const layers: Record<string, Drawn[]> = {};
        if (y === tileY && x >= tileX)
          layers.roads = [
            {
              type: 2,
              properties: { kind: "path" },
              points: [
                [x === tileX ? u : 0, v],
                [4096, v],
              ],
            },
          ];
        // West of a line 600 m west of the start (about 0.009° of longitude): water.
        const edge = ((((AT.lon - 0.009 + 180) / 360) * scale - x) * 4096) | 0;
        if (edge > 0)
          layers.water = [
            {
              type: 3,
              properties: { kind: "water" },
              points: [
                [0, -64],
                [Math.min(edge, 4160), -64],
                [Math.min(edge, 4160), 4160],
                [0, 4160],
              ],
            },
          ];
        tiles.push({ z: 13, x, y, data: zlib.gzipSync(encodeTile(layers)) });
      }
    await install("paths", tiles, BOX, "vector");
    const { body } = await walkOf(AT, 30);
    expect(body.paths).toBe(true);
    const { east, west } = reachEastWest(body);
    // East along the path at the full 5.04 km/h, about 2.5 km; west only to the water's edge, 600 m.
    expect(east).toBeGreaterThan(2300);
    expect(west).toBeLessThan(650);
    expect(west).toBeGreaterThan(450);
  });

  it("with no terrain says so, and refuses a time it does not offer", async () => {
    const { body } = await walkOf(AT, 60);
    expect(body).toMatchObject({ coverage: "none", minutesGrid: "", groundMeters: null });
    for (const query of ["minutes=45", "minutes=60&pace=sprint", "minutes=sixty"]) {
      const { status } = await app.api<Failure>("GET", `/api/maps/walk-reach?at=53,-4&${query}`);
      expect(status, query).toBe(400);
    }
  });
});
