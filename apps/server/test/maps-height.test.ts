import fs from "node:fs";
import path from "node:path";
import type { MapSources, PointHeight } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElevationSampler } from "../src/modules/maps/elevation.ts";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import type { ServedTile, TileServer } from "../src/modules/maps/tile-server.ts";
import { buildArchive, type FixtureTile } from "./fixtures/maps/archive.ts";
import { type Ground, groundTiles, positionOf, worldOf } from "./fixtures/maps/terrain.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

type Failure = { error: { code: string; message: string } };
const heightAt = (lat: number, lon: number) => app.api<PointHeight & Failure>("GET", `/api/maps/height?at=${lat},${lon}`);

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
 * A coast running north to south: west of 4.1° W a sea floor 12 m below sea level, then
 * a strip of sea at 0 m out to 4° W, then land: a plain at 100 m with a hill on 3.9° W,
 * 300 m above the plain at its top.
 */
const coast: Ground = (worldX, worldY) => {
  const { lon } = positionOf(worldX, worldY);
  if (lon < -4.1) return -12;
  if (lon < -4) return 0;
  return 100 + 300 * Math.exp(-(((lon + 3.9) / 0.02) ** 2));
};
const BOX: [number, number, number, number] = [-4.3, 52.9, -3.7, 53.1];
/** 64 cells to a tile at zoom 12: cells about 92 m wide at 53° N. */
const CELL = (40_075_016.686 * Math.cos((53 * Math.PI) / 180)) / (64 * 2 ** 12);

describe("the height of the ground at a point", () => {
  it("reads it from installed terrain, with the width of the cell it came from", async () => {
    await installTerrain("coast", groundTiles(coast, { minZoom: 12, maxZoom: 12, bbox: BOX }), BOX);

    const plain = await heightAt(53, -3.8);
    expect(plain.status).toBe(200);
    expect(plain.body.at).toEqual({ lat: 53, lon: -3.8 });
    expect(plain.body.heightMeters).toBeCloseTo(100, 0);
    expect(plain.body.cellMeters).toBeCloseTo(CELL, 0);
    // A short while in the browser's cache: terrain changes only when a pack does.
    expect(plain.headers["cache-control"]).toBe("private, max-age=60");

    const top = await heightAt(53, -3.9);
    expect(Math.abs(top.body.heightMeters! - coast(...worldOf(53, -3.9)))).toBeLessThan(3);
    expect(top.body.heightMeters).toBeGreaterThan(395);
  });

  it("gives the terrain's own figure over the sea, a depth included, never a stand-in", async () => {
    await installTerrain("coast", groundTiles(coast, { minZoom: 12, maxZoom: 12, bbox: BOX }), BOX);
    expect((await heightAt(53, -4.05)).body).toMatchObject({ heightMeters: 0 });
    expect((await heightAt(53, -4.2)).body).toMatchObject({ heightMeters: -12 });
  });

  it("says no terrain covers a point outside what is installed, or when none is", async () => {
    const none = await heightAt(53, -3.8);
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ at: { lat: 53, lon: -3.8 }, heightMeters: null, cellMeters: null });

    await installTerrain("coast", groundTiles(coast, { minZoom: 12, maxZoom: 12, bbox: BOX }), BOX);
    expect((await heightAt(51.5, -0.12)).body).toMatchObject({ heightMeters: null, cellMeters: null });
    expect((await heightAt(-33.9, 151.2)).body).toMatchObject({ heightMeters: null, cellMeters: null });
  });

  it("refuses what is not a place", async () => {
    const refused = async (query: string) => {
      const { status, body } = await app.api<Failure>("GET", `/api/maps/height${query}`);
      expect(status, query).toBe(400);
      return body.error.message;
    };
    expect(await refused("")).toMatch(/Give `at` as latitude,longitude/);
    expect(await refused("?at=north")).toMatch(/Give `at` as latitude,longitude/);
    expect(await refused("?at=53")).toMatch(/Give `at` as latitude,longitude/);
    expect(await refused("?at=53,-4,7")).toMatch(/Give `at` as latitude,longitude/);
    expect(await refused("?at=91,0")).toMatch(/`at` is not a place on Earth/);
    expect(await refused("?at=53,-181")).toMatch(/`at` is not a place on Earth/);
    expect(await refused("?at=1e3,0")).toMatch(/Give `at` as latitude,longitude/);
  });

  it("reads a tile once as the pointer rests here and there on it, and again once the terrain is replaced", async () => {
    const [tile] = groundTiles(coast, { minZoom: 12, maxZoom: 12, bbox: [-3.81, 52.99, -3.8, 53] });
    const sources = { sources: { terrain: { minzoom: 12, maxzoom: 12, bounds: BOX } } } as unknown as MapSources;
    let reads = 0;
    let etag = '"first"';
    const served = () => {
      const answer = { contentType: "image/png", contentEncoding: undefined, etag } as ServedTile;
      // Counts each time the tile's bytes are looked at, which is each time it is decoded.
      Object.defineProperty(answer, "data", {
        get: () => {
          reads += 1;
          return tile!.data;
        },
      });
      return answer;
    };
    const tiles = { sources: () => sources, getTile: async () => served() } as unknown as TileServer;
    const sampler = createElevationSampler(app.ctx, tiles);
    const at = positionOf((tile!.x + 0.5) / 2 ** 12, (tile!.y + 0.5) / 2 ** 12);
    for (let index = 0; index < 10; index += 1) {
      const { heights } = await sampler.sampleWithCells([[at.lon + index * 0.0001, at.lat]], 1);
      expect(heights[0]).toBeCloseTo(100, 0);
    }
    expect(reads).toBe(1);
    // Another archive answers for the same tile: it is read afresh.
    etag = '"second"';
    await sampler.sampleWithCells([[at.lon, at.lat]], 1);
    expect(reads).toBe(2);
  });
});
