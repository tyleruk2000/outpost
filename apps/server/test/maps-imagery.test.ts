/**
 * Satellite imagery: the world from a stand-in for NASA's GeoTIFF, a small area from a
 * stand-in for the Sentinel-2 search service and its Cloud-Optimised GeoTIFFs, the
 * tiles served from both, the figures shown before anything is fetched, and removal.
 * Everything is served from this computer; nothing in here reaches the internet.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { ImageryEstimate, ImageryOverview, MapSources, SceneSearchResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpClient } from "../src/core/http.ts";
import { Cog } from "../src/modules/maps/imagery/cog.ts";
import { areaKm2, areaWarning } from "../src/modules/maps/imagery/index.ts";
import { ImageArchiveWriter } from "../src/modules/maps/imagery/pmtiles-writer.ts";
import {
  groundResolution,
  honestMaxZoom,
  lonLatToUtm,
  lonLatToWorldPixel,
  worldPixelToLonLat,
} from "../src/modules/maps/imagery/projection.ts";
import { createRangeFetcher } from "../src/modules/maps/imagery/ranges.ts";
import { passesOf, sceneOf } from "../src/modules/maps/imagery/stac.ts";
import { TileType } from "../src/modules/maps/pmtiles/header.ts";
import { LocalArchive } from "../src/modules/maps/pmtiles/reader.ts";
import { buildGeoTiff } from "./fixtures/maps/geotiff.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

// ── The stand-in publishers ──

/** A Sentinel-2 scene of 4 km by 4 km near Keswick, in UTM zone 30N, as Collection 1 lays it out. */
const SCENE_ORIGIN = { x: 490_000, y: 6_052_000 };
const AREA: [number, number, number, number] = [-3.145, 54.585, -3.105, 54.61];
const band = (base: number) =>
  buildGeoTiff({
    width: 400,
    height: 400,
    samples: 1,
    bits: 16,
    tile: 128,
    predictor: 2,
    epsg: 32630,
    originX: SCENE_ORIGIN.x,
    originY: SCENE_ORIGIN.y,
    pixelSize: 10,
    nodata: 0,
    // Stripes, and a corner beyond the edge of the swath with no data.
    values: (x, y) => (x + y < 30 ? 0 : 1000 + base + (Math.floor(x / 20) % 2) * 800),
  });
const SCL = buildGeoTiff({
  width: 200,
  height: 200,
  samples: 1,
  bits: 8,
  tile: 64,
  epsg: 32630,
  originX: SCENE_ORIGIN.x,
  originY: SCENE_ORIGIN.y,
  pixelSize: 20,
  // Cloud (9) over the eastern half, vegetation (4) elsewhere.
  values: (x) => (x >= 100 ? 9 : 4),
});
/** The whole world in 72 by 36 pixels of 5°, in strips of one row, as NASA lays out Blue Marble. */
const WORLD_TIFF = buildGeoTiff({
  width: 72,
  height: 36,
  samples: 3,
  bits: 8,
  epsg: 4326,
  originX: -180,
  originY: 90,
  pixelSize: 5,
  values: (x, y, s) => (s === 0 ? x * 3 : s === 1 ? y * 7 : 200),
});

const files: Record<string, Buffer> = {
  "/scene/B04.tif": band(300),
  "/scene/B03.tif": band(200),
  "/scene/B02.tif": band(100),
  "/scene/SCL.tif": SCL,
  "/world.tif": WORLD_TIFF,
};

const requests: Array<{ method: string; url: string; range?: string }> = [];
let server: http.Server;
let base = "";
let busyOnce = false;

function item(id: string, date: string, cloud: number) {
  const href = (name: string) => `${base}/scene/${name}.tif`;
  const [w, s, e, n] = [-3.154, 54.58, -3.093, 54.615];
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
    properties: { datetime: `${date}T11:26:09Z`, platform: "sentinel-2b", "eo:cloud_cover": cloud, "proj:epsg": 32630 },
    assets: {
      red: { href: href("B04"), "raster:bands": [{ scale: 0.0001, offset: -0.1, nodata: 0 }] },
      green: { href: href("B03"), "raster:bands": [{ scale: 0.0001, offset: -0.1, nodata: 0 }] },
      blue: { href: href("B02"), "raster:bands": [{ scale: 0.0001, offset: -0.1, nodata: 0 }] },
      scl: { href: href("SCL") },
      // An asset somewhere else must never be followed.
      thumbnail: { href: "https://example.com/elsewhere.jpg" },
    },
  };
}

beforeAll(async () => {
  server = http.createServer((request, response) => {
    requests.push({ method: request.method ?? "", url: request.url ?? "", range: request.headers.range });
    if (request.method === "POST" && request.url === "/v1/search") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const asked = JSON.parse(body);
        expect(asked.collections).toEqual(["sentinel-2-c1-l2a"]);
        response.setHeader("content-type", "application/geo+json");
        response.end(
          JSON.stringify({
            type: "FeatureCollection",
            features: [item("S2B_T30UVF_20260712T112112_L2A", "2026-07-12", 0.4), item("S2A_T30UVF_20261017T112459_L2A", "2026-10-17", 12)],
          }),
        );
      });
      return;
    }
    const bytes = files[request.url ?? ""];
    if (!bytes) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (busyOnce && request.url === "/scene/B03.tif") {
      busyOnce = false;
      response.statusCode = 429;
      response.setHeader("retry-after", "0");
      response.end();
      return;
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    if (!match) {
      response.statusCode = 200;
      response.end(bytes);
      return;
    }
    const start = Number(match[1]);
    const end = Math.min(bytes.length - 1, Number(match[2]));
    response.statusCode = 206;
    response.setHeader("content-range", `bytes ${start}-${end}/${bytes.length}`);
    response.end(bytes.subarray(start, end + 1));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function waitFor<T>(probe: () => T | undefined, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function withApp(run: (app: TestApp) => Promise<void>): Promise<void> {
  const app = await createTestApp({
    OUTPOST_IMAGERY_STAC_URL: `${base}/v1/search`,
    OUTPOST_IMAGERY_SENTINEL_HOST: "127.0.0.1",
    OUTPOST_IMAGERY_WORLD_URL: `${base}/world.tif`,
    OUTPOST_IMAGERY_WORLD_BYTES: String(WORLD_TIFF.length),
  });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

const settled = (app: TestApp, id: string) =>
  waitFor(() => {
    const row = app.ctx.services.downloads.get(id);
    return row && ["completed", "failed", "cancelled"].includes(row.state) ? row : undefined;
  }, "the download to finish");

async function raw(app: TestApp, url: string) {
  const response = await app.app.inject({ method: "GET", url, headers: { host: "localhost" } });
  return { status: response.statusCode, body: response.rawPayload, headers: response.headers };
}

// ── Pieces ──

describe("projection", () => {
  it("puts ESA's own corners of a Sentinel-2 tile on its UTM grid to the millimetre", () => {
    // Tile 30UVF: its footprint corners as the Copernicus catalogue gives them, and its grid origin (399960, 6100020).
    const [e1, n1] = lonLatToUtm(-4.565398360986785, 55.03692054207882, 30, false);
    expect(e1).toBeCloseTo(399_960, 2);
    expect(n1).toBeCloseTo(6_100_020, 2);
    const [e2, n2] = lonLatToUtm(-2.850890036308066, 54.06011138907911, 30, false);
    expect(e2).toBeCloseTo(509_760, 2);
    expect(n2).toBeCloseTo(5_990_220, 2);
  });

  it("goes to Web Mercator pixels and back", () => {
    const [x, y] = lonLatToWorldPixel(-3.13, 54.6, 14);
    const [lon, lat] = worldPixelToLonLat(x, y, 14);
    expect(lon).toBeCloseTo(-3.13, 9);
    expect(lat).toBeCloseTo(54.6, 9);
  });

  it("stops at the zoom the data supports", () => {
    expect(honestMaxZoom(10, 0)).toBe(14);
    expect(honestMaxZoom(10, 54.6)).toBe(14);
    expect(honestMaxZoom(10, 62)).toBe(13);
    expect(honestMaxZoom(500, 0)).toBe(9);
    expect(groundResolution(14, 0)).toBeCloseTo(9.55, 2);
  });
});

describe("reading a Cloud-Optimised GeoTIFF", () => {
  it("reads the georeferencing and only the tiles a window needs", async () => {
    const bytes = files["/scene/B04.tif"]!;
    let reads = 0;
    const cog = await Cog.open({
      read: async (offset, length) => {
        reads += 1;
        return bytes.subarray(offset, offset + length);
      },
    });
    expect(cog.geo).toMatchObject({ originX: 490_000, originY: 6_052_000, pixelWidth: 10, epsg: 32630, nodata: 0 });
    expect(cog.images[0]).toMatchObject({ width: 400, height: 400, tileWidth: 128, bitsPerSample: 16, predictor: 2 });
    const refs = cog.tilesFor(0, 130, 130, 140, 140);
    expect(refs).toHaveLength(1);
    const tiles = new Map(refs.map((ref) => [ref.index, bytes.subarray(ref.offset, ref.offset + ref.length)]));
    const window = cog.assemble(0, 130, 130, 140, 140, tiles);
    // x = 130 is in an odd stripe of 20 (130 / 20 = 6.5, so stripe 6, even): 1000 + 300 + 0.
    expect(window.data[0]).toBe(1300);
    expect(window.data[10 * 9 + 9]).toBe(1300);
    expect(reads).toBeLessThan(4);
  });

  it("reads a strip-based picture a row at a time", async () => {
    const cog = await Cog.open({ read: async (offset, length) => WORLD_TIFF.subarray(offset, offset + length) });
    expect(cog.images[0]).toMatchObject({ width: 72, height: 36, tileWidth: 72, tileHeight: 1, samplesPerPixel: 3 });
    const [ref] = cog.tilesFor(0, 0, 5, 72, 6);
    const row = cog.assemble(0, 0, 5, 72, 6, new Map([[ref!.index, WORLD_TIFF.subarray(ref!.offset, ref!.offset + ref!.length)]]));
    expect([...row.data.subarray(30, 33)]).toEqual([30, 35, 200]);
  });

  it("refuses what it cannot read rather than guessing", async () => {
    await expect(Cog.open({ read: async () => new Uint8Array(64) })).rejects.toThrow(/not a GeoTIFF/);
  });
});

describe("the image archive writer", () => {
  it("writes tiles in any order into an archive the map's reader serves", async () => {
    const dir = tempDir("outpost-imagery-");
    try {
      const file = path.join(dir, "t.pmtiles");
      const writer = await ImageArchiveWriter.create(file);
      await writer.addTile(2, 3, 1, new Uint8Array([1, 2, 3]));
      await writer.addTile(0, 0, 0, new Uint8Array([9]));
      await writer.addTile(2, 0, 0, new Uint8Array([1, 2, 3]));
      await writer.finish({ bounds: [-180, -85, 180, 85], minZoom: 0, maxZoom: 2, metadata: { name: "t" } });
      const archive = await LocalArchive.open(file);
      expect(archive.header.tileType).toBe(TileType.Webp);
      expect(archive.header.clustered).toBe(false);
      expect([...(await archive.getTile(2, 3, 1))!]).toEqual([1, 2, 3]);
      expect([...(await archive.getTile(0, 0, 0))!]).toEqual([9]);
      expect([...(await archive.getTile(2, 0, 0))!]).toEqual([1, 2, 3]);
      expect(await archive.getTile(2, 1, 1)).toBeUndefined();
      // The repeated tile is stored once.
      expect(archive.header.tileContents).toBe(2);
      await archive.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("fetching parts of files politely", () => {
  it("waits and tries again when told it is busy, and refuses a whole file sent for a part", async () => {
    const client = createHttpClient({ allowPrivate: true });
    const waits: number[] = [];
    try {
      busyOnce = true;
      const fetcher = createRangeFetcher({
        client,
        allowedHosts: ["127.0.0.1"],
        sleep: async (ms) => {
          waits.push(ms);
        },
      });
      const bytes = await fetcher.read(`${base}/scene/B03.tif`, 0, 100);
      expect(bytes.length).toBe(100);
      expect(waits).toHaveLength(1);
      expect(fetcher.transfer.requests).toBe(2);
      await expect(fetcher.read("https://example.com/x.tif", 0, 10)).rejects.toThrow(/not a source/);
    } finally {
      await client.close();
    }
  });
});

describe("area figures", () => {
  it("measures an area on the sphere", () => {
    // One degree square at the equator is about 12,364 km².
    expect(areaKm2([0, 0, 1, 1])).toBeCloseTo(12_364, -1);
  });

  it("says nothing for a small area, spells it out above the first threshold, names the better way above the second, and refuses past the ceiling", () => {
    const common = { transferBytes: 400e6, sizeBytes: 60e6, seconds: { low: 80, high: 400 }, scenes: 1, coveragePercent: 100 };
    expect(areaWarning({ ...common, areaKm2: 100 }).level).toBe("none");
    const notice = areaWarning({ ...common, areaKm2: 900 });
    expect(notice.level).toBe("notice");
    expect(notice.message).toContain("about 400 MB to fetch");
    const warn = areaWarning({ ...common, areaKm2: 3_000, scenes: 3 });
    expect(warn.level).toBe("warn");
    expect(warn.message).toMatch(/Several smaller areas/);
    expect(warn.message).toMatch(/2 seams/);
    expect(areaWarning({ ...common, areaKm2: 20_000 }).level).toBe("refuse");
  });

  it("groups scenes of one day into a pass and puts the least cloudy that covers the area first", () => {
    const scenes = [item("a", "2026-07-12", 30), item("b", "2026-08-01", 2)].map((raw) => sceneOf(raw, "127.0.0.1")!);
    const passes = passesOf(scenes, AREA);
    expect(passes.map((pass) => pass.date)).toEqual(["2026-08-01", "2026-07-12"]);
    expect(passes[0]!.coveragePercent).toBe(100);
    expect(passes[0]!.dateText).toBe("1 August 2026");
  });
});

// ── Through the API ──

describe("satellite imagery through the API", () => {
  it("before anything is installed, lists what can be got with its size, and the map has no imagery", async () => {
    await withApp(async (app) => {
      const { status, body } = await app.api<ImageryOverview>("GET", "/api/maps/imagery");
      expect(status).toBe(200);
      expect(body.sets).toEqual([]);
      expect(body.world[0]).toMatchObject({ id: "blue-marble-2km", transferBytes: WORLD_TIFF.length, installed: false });
      expect(body.sources.map((source) => source.credit)).toEqual([
        "NASA Earth Observatory",
        "Contains modified Copernicus Sentinel data [Year]",
      ]);
      const sources = await app.api<MapSources>("GET", "/api/maps/sources");
      expect(sources.body.imagery).toEqual([]);
    });
  });

  it("builds the world, serves its tiles, falls back to it beneath a small area, and removes both", async () => {
    await withApp(async (app) => {
      requests.length = 0;
      const world = await app.api("POST", "/api/maps/imagery/world", { entryId: "blue-marble-2km" });
      expect(world.status).toBe(200);
      const done = await settled(app, world.body.download.id);
      expect(done.state, done.error ?? "").toBe("completed");
      expect(done.meta.transferredBytes).toBe(WORLD_TIFF.length);
      // Only range requests, and only to the stand-in.
      expect(requests.every((entry) => entry.range)).toBe(true);

      let overview = (await app.api<ImageryOverview>("GET", "/api/maps/imagery")).body;
      expect(overview.sets).toHaveLength(1);
      const worldSet = overview.sets[0]!;
      expect(worldSet).toMatchObject({ source: "blue-marble", imageDateText: "July 2004", minZoom: 0, maxZoom: 2 });
      expect(worldSet.attribution).toContain("NASA Earth Observatory");
      // A set of imagery is not a region of the vector map.
      const mapOverview = await app.api("GET", "/api/maps/overview");
      expect(mapOverview.body.regions).toEqual([]);

      const tile = await raw(app, `/api/maps/imagery/${worldSet.id}/1/0/0.webp`);
      expect(tile.status).toBe(200);
      expect(tile.headers["content-type"]).toBe("image/webp");
      expect(tile.body.subarray(0, 4).toString("latin1")).toBe("RIFF");
      expect((await raw(app, `/api/maps/imagery/${worldSet.id}/5/0/0.webp`)).status).toBe(204);
      expect((await raw(app, "/api/maps/imagery/not-a-set/1/0/0.webp")).status).toBe(404);
      expect((await raw(app, `/api/maps/imagery/${worldSet.id}/1/0/..%2F..%2Fx`)).status).toBe(404);

      // A small area: find pictures, see the figures, fetch it.
      const search = await app.api<SceneSearchResponse>("POST", "/api/maps/imagery/scenes", { bbox: AREA });
      expect(search.status).toBe(200);
      expect(search.body.options[0]).toMatchObject({ date: "2026-07-12", sceneCloudPercent: 0.4, coveragePercent: 100 });
      const sceneKey = search.body.options[0]!.key;
      requests.length = 0;
      const estimate = await app.api<ImageryEstimate>("POST", "/api/maps/imagery/estimate", { bbox: AREA, sceneKey });
      expect(estimate.status, JSON.stringify(estimate.body)).toBe(200);
      expect(estimate.body).toMatchObject({ maxZoom: 14, minZoom: 6, warning: { level: "none" } });
      expect(estimate.body.source.cost).toMatch(/Free/);
      expect(estimate.body.areaKm2).toBeGreaterThan(5);
      expect(estimate.body.areaCloudPercent).toBeGreaterThan(0);
      expect(estimate.body.areaCloudPercent).toBeLessThan(100);
      expect(estimate.body.freeBytes).toBeGreaterThan(0);
      // Working out the figures reads headers and the cloud layer only, never a picture tile of the bands.
      expect(requests.every((entry) => entry.url.endsWith("SCL.tif") || entry.range === "bytes=0-65535")).toBe(true);

      requests.length = 0;
      const area = await app.api("POST", "/api/maps/imagery/areas", { bbox: AREA, sceneKey, name: "Keswick" });
      expect(area.status, JSON.stringify(area.body)).toBe(200);
      const built = await settled(app, area.body.download.id);
      expect(built.state, built.error ?? "").toBe("completed");
      const fetched = requests.filter((entry) => !entry.url.endsWith("SCL.tif")).length;
      expect(fetched).toBeGreaterThan(0);

      overview = (await app.api<ImageryOverview>("GET", "/api/maps/imagery")).body;
      const areaSet = overview.sets.find((set) => set.source === "sentinel-2")!;
      expect(areaSet).toMatchObject({
        name: "Keswick",
        imageDate: "2026-07-12",
        imageDateText: "12 July 2026",
        maxZoom: 14,
        sceneCloudPercent: 0.4,
      });
      expect(areaSet.attribution).toContain("Contains modified Copernicus Sentinel data 2026");
      expect(areaSet.transferredBytes).toBeGreaterThan(0);

      // The map draws the coarsest first, so the area lies on top of the world.
      const sources = (await app.api<MapSources>("GET", "/api/maps/sources")).body;
      expect(sources.imagery!.map((source) => source.id)).toEqual([worldSet.id, areaSet.id]);
      expect(sources.imagery![1]!.bounds[0]).toBeCloseTo(AREA[0], 3);

      // A deep tile in the area is a picture; outside the area it is "nothing here", and the world shows beneath.
      const [px, py] = lonLatToWorldPixel(-3.125, 54.6, 14);
      const inside = await raw(app, `/api/maps/imagery/${areaSet.id}/14/${Math.floor(px / 256)}/${Math.floor(py / 256)}.webp`);
      expect(inside.status).toBe(200);
      const [ox, oy] = lonLatToWorldPixel(-2.9, 54.6, 14);
      expect((await raw(app, `/api/maps/imagery/${areaSet.id}/14/${Math.floor(ox / 256)}/${Math.floor(oy / 256)}.webp`)).status).toBe(204);

      // The fetched parts are gone once it is installed.
      const storageDir = app.ctx.services.storage.getDefault().path;
      const leftovers = fs.readdirSync(path.join(storageDir, "collections/maps")).filter((name) => name.endsWith(".src"));
      expect(leftovers).toEqual([]);

      // Removing is removing a map collection.
      for (const set of overview.sets) {
        const removed = await app.api("DELETE", `/api/collections/${set.id}?deleteFiles=true`);
        expect(removed.status).toBe(200);
      }
      expect((await app.api<ImageryOverview>("GET", "/api/maps/imagery")).body.sets).toEqual([]);
      expect((await raw(app, `/api/maps/imagery/${worldSet.id}/1/0/0.webp`)).status).toBe(404);
    });
  });

  it("asks for confirmation of a large area and refuses one past the ceiling", async () => {
    await withApp(async (app) => {
      const big: [number, number, number, number] = [-4, 54, -3, 55];
      const search = await app.api<SceneSearchResponse>("POST", "/api/maps/imagery/scenes", { bbox: big });
      const sceneKey = search.body.options[0]!.key;
      const refused = await app.api("POST", "/api/maps/imagery/areas", { bbox: big, sceneKey, name: "Big" });
      expect(refused.status).toBe(400);
      expect(refused.body.error.message).toMatch(/confirm/);
      const huge = await app.api("POST", "/api/maps/imagery/estimate", { bbox: [-6, 52, -2, 56], sceneKey });
      expect(huge.status).toBe(400);
      expect(huge.body.error.message).toMatch(/more than one area can be/);
      const expired = await app.api("POST", "/api/maps/imagery/estimate", { bbox: AREA, sceneKey: "nothing-searched" });
      expect(expired.status).toBe(404);
    });
  });
});
