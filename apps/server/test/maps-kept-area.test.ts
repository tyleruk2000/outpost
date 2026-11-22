import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { countRectTiles, deepestKeptZoom, MAX_KEPT_AREA_TILES, type MapAreaSize, tileRects } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tooLarge as keptTooLarge } from "../src/modules/maps/kept-area.ts";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { LocalArchive } from "../src/modules/maps/pmtiles/reader.ts";
import { buildArchive, type Fixture, fakeTile, tileInBbox, worldTiles } from "./fixtures/maps/archive.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const REGION: [number, number, number, number] = [-20, 20, 60, 70];
const WORLD: [number, number, number, number] = [-180, -85.0511, 180, 85.0511];
/** A box well inside the detailed region. */
const BOX: [number, number, number, number] = [0, 40, 20, 55];

let app: TestApp;
let overview: Fixture;
let detail: Fixture;

function place(relPath: string, bytes: Buffer): void {
  const file = path.join(app.ctx.services.storage.getDefault().path, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}

async function importArchive(relPath: string, name: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { status } = await app.api("POST", "/api/maps/import", {
    locationId: app.ctx.services.storage.getDefault().id,
    relPath,
    name,
    ...extra,
  });
  expect(status).toBe(200);
}

beforeEach(async () => {
  app = await createTestApp();
  const labelled = (label: string, maxZoom: number) =>
    worldTiles(maxZoom, () => false).map((tile) => ({ ...tile, data: fakeTile(`${label}:${tile.z}/${tile.x}/${tile.y}`) }));
  overview = buildArchive({ tiles: labelled("overview", 3), bounds: WORLD });
  detail = buildArchive({
    tiles: labelled("detail", 6).filter((tile) => tileInBbox(REGION, tile.z, tile.x, tile.y)),
    bounds: REGION,
    rootBudget: 200,
    minLeafSize: 32,
  });
  place("imports/overview.pmtiles", overview.bytes);
  place("imports/detail.pmtiles", detail.bytes);
  await importArchive("imports/overview.pmtiles", "World overview");
  await importArchive("imports/detail.pmtiles", "Detail");
});

afterEach(async () => {
  await app.close();
});

const sizeOf = (query: string) => app.api<MapAreaSize>("GET", `/api/maps/area-size?${query}`);

describe("measuring a box of the installed map", () => {
  it("adds up exactly the tiles a phone would then be given, from the directories alone", async () => {
    const { status, body } = await sizeOf(`bbox=${BOX.join(",")}&maxZoom=6`);
    expect(status).toBe(200);

    // The referee: ask for every tile of the box, as the phone will, and add up what comes back.
    let tiles = 0;
    let bytes = 0;
    for (const rect of tileRects(BOX, 0, 6)) {
      for (let x = rect.minX; x <= rect.maxX; x += 1) {
        for (let y = rect.minY; y <= rect.maxY; y += 1) {
          const response = await app.app.inject({
            method: "GET",
            url: `/api/maps/tiles/${rect.z}/${x}/${y}.mvt?raw=1`,
            headers: { host: "localhost" },
          });
          if (response.statusCode !== 200) continue;
          tiles += 1;
          bytes += response.rawPayload.length;
        }
      }
    }
    expect(tiles).toBeGreaterThan(10);
    expect(body.map).toEqual({ tiles, bytes, minZoom: 0, maxZoom: 6 });
    expect(body.terrain).toBeNull();
    expect(body.totalTiles).toBe(tiles);
    expect(body.totalBytes).toBe(bytes);
  });

  it("stops at the deepest zoom that is installed", async () => {
    const { body } = await sizeOf(`bbox=${BOX.join(",")}&maxZoom=14`);
    expect(body.map?.maxZoom).toBe(6);
  });

  it("measures terrain only when asked, and says when there is none", async () => {
    expect((await sizeOf(`bbox=${BOX.join(",")}&maxZoom=5&terrain=1`)).body.terrain).toBeNull();

    const dem = buildArchive({
      tiles: worldTiles(4, () => false).map((tile) => ({ ...tile, data: Buffer.from(`dem:${tile.z}/${tile.x}/${tile.y}`) })),
      tileType: TileType.Webp,
      tileCompression: Compression.None,
    });
    place("imports/dem.pmtiles", dem.bytes);
    await importArchive("imports/dem.pmtiles", "Terrain", { tileType: "terrain" });

    const without = await sizeOf(`bbox=${BOX.join(",")}&maxZoom=5`);
    expect(without.body.terrain).toBeNull();
    const withTerrain = await sizeOf(`bbox=${BOX.join(",")}&maxZoom=5&terrain=1`);
    expect(withTerrain.body.terrain).toMatchObject({ minZoom: 0, maxZoom: 4 });
    expect(withTerrain.body.terrain!.tiles).toBe(countRectTiles(tileRects(BOX, 0, 4)));
    expect(withTerrain.body.totalBytes).toBe(withTerrain.body.map!.bytes + withTerrain.body.terrain!.bytes);
  });

  it("refuses a box that is not one, and one too large for the detail asked for", async () => {
    expect((await sizeOf("bbox=10,50,0,40&maxZoom=5")).status).toBe(400);
    expect((await sizeOf("bbox=nonsense&maxZoom=5")).status).toBe(400);
    expect((await sizeOf(`bbox=${BOX.join(",")}`)).status).toBe(400);

    // A deep archive over a wide box: more tiles than one kept area may hold.
    const deep = buildArchive({ tiles: [{ z: 12, x: 2048, y: 1365, data: fakeTile("deep") }], bounds: REGION });
    place("imports/deep.pmtiles", deep.bytes);
    await importArchive("imports/deep.pmtiles", "Deep");
    expect(countRectTiles(tileRects(REGION, 0, 12))).toBeGreaterThan(MAX_KEPT_AREA_TILES);
    const tooLarge = await sizeOf(`bbox=${REGION.join(",")}&maxZoom=12`);
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toMatchObject({ error: { code: "too_large" } });

    // It says what would fit, and that is so: the same box at the deepest zoom that fits, and not one zoom more.
    const { error } = tooLarge.body as unknown as { error: { message: string; details: { fitsZoom: number; zoom: number } } };
    const fits = deepestKeptZoom(REGION, 0, 12)!;
    expect(error.details).toMatchObject({ layer: "map", zoom: 12, fitsZoom: fits });
    expect(error.message).toContain(`It fits to zoom ${fits}: choose that detail or less, or a smaller area.`);
    expect(error.message).not.toMatch(/zoom in/i);
    expect(countRectTiles(tileRects(REGION, 0, fits))).toBeLessThanOrEqual(MAX_KEPT_AREA_TILES);
    expect(countRectTiles(tileRects(REGION, 0, fits + 1))).toBeGreaterThan(MAX_KEPT_AREA_TILES);
    expect((await sizeOf(`bbox=${REGION.join(",")}&maxZoom=${fits}`)).status).toBe(200);
  });

  it("says only a smaller area will do when even the least detail is too much", () => {
    // The whole world from zoom 7: more than 12,000 tiles at its first zoom.
    const refusal = keptTooLarge("vector", [-180, -85, 180, 85], 7, 9);
    expect(refusal.details).toMatchObject({ fitsZoom: null });
    expect(refusal.message).toMatch(/even at the least detail.*Choose a smaller area\.$/);
  });

  it("answers with no map at all when nothing is installed", async () => {
    for (const row of app.ctx.services.collections.list({ kind: "map" }))
      await app.ctx.services.collections.remove(row.id, { deleteFiles: false });
    const { status, body } = await sizeOf(`bbox=${BOX.join(",")}&maxZoom=6`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ map: null, terrain: null, totalTiles: 0, totalBytes: 0 });
  });
});

describe("a tile asked for as stored", () => {
  it("comes still gzipped, named as such in a header of its own, and is not kept by the browser's cache", async () => {
    const stored = detail.tiles.get("6/34/20")!;
    const raw = await app.app.inject({ method: "GET", url: "/api/maps/tiles/6/34/20.mvt?raw=1", headers: { host: "localhost" } });
    expect(raw.statusCode).toBe(200);
    expect(raw.rawPayload.equals(stored)).toBe(true);
    expect(raw.headers["content-encoding"]).toBeUndefined();
    expect(raw.headers["x-outpost-tile-encoding"]).toBe("gzip");
    expect(raw.headers["cache-control"]).toBe("no-store");
    expect(zlib.gunzipSync(raw.rawPayload).toString()).toContain("tile:detail:6/34/20");

    // The ordinary address is unchanged: the browser unpacks it.
    const plain = await app.app.inject({ method: "GET", url: "/api/maps/tiles/6/34/20.mvt", headers: { host: "localhost" } });
    expect(plain.headers["content-encoding"]).toBe("gzip");
    expect(plain.headers["x-outpost-tile-encoding"]).toBeUndefined();
    expect(plain.headers["cache-control"]).toBe("private, max-age=3600");
  });

  it("is 204 where there is no tile, raw or not", async () => {
    const raw = await app.app.inject({ method: "GET", url: "/api/maps/tiles/9/0/0.mvt?raw=1", headers: { host: "localhost" } });
    expect(raw.statusCode).toBe(204);
  });
});

describe("the length of a tile, read without reading the tile", () => {
  it("matches the stored bytes, and is undefined where the archive has none", async () => {
    const file = path.join(app.ctx.services.storage.getDefault().path, "imports/detail.pmtiles");
    const archive = await LocalArchive.open(file);
    try {
      expect(await archive.tileLength(6, 34, 20)).toBe(detail.tiles.get("6/34/20")!.length);
      expect(await archive.tileLength(6, 0, 0)).toBeUndefined();
      expect(await archive.tileLength(9, 0, 0)).toBeUndefined();
    } finally {
      await archive.close();
    }
  });
});
