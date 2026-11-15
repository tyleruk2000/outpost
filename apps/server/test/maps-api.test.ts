import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { MapRegionsResponse, MapSources } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpClient } from "../src/core/http.ts";
import type { DownloadRow, FetchContext } from "../src/modules/downloads/types.ts";
import { createExtractFetcher } from "../src/modules/maps/extract-download.ts";
import { createPlanner } from "../src/modules/maps/planner.ts";
import { headPathOf, planPathOf } from "../src/modules/maps/pmtiles/extract.ts";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { LocalArchive } from "../src/modules/maps/pmtiles/reader.ts";
import { slugify } from "../src/modules/maps/regions.ts";
import { buildOfUrl, createSourceResolver, fetchNewestBuild } from "../src/modules/maps/source.ts";
import type { Settings } from "../src/modules/settings/service.ts";
import {
  type ByteServer,
  buildArchive,
  dropTileDataAfter,
  type Fixture,
  type FixtureTile,
  fakeTile,
  serveBytes,
  tileInBbox,
  worldTiles,
} from "./fixtures/maps/archive.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const REGION_BBOX: [number, number, number, number] = [-20, 20, 60, 70];
const WORLD: [number, number, number, number] = [-180, -85.0511, 180, 85.0511];

/** A planet whose every tile says which archive it came from. */
function labelledWorld(label: string, maxZoom: number): FixtureTile[] {
  return worldTiles(maxZoom, () => false).map((tile) => ({ ...tile, data: fakeTile(`${label}:${tile.z}/${tile.x}/${tile.y}`) }));
}

async function waitFor<T>(probe: () => T | undefined | Promise<T | undefined>, what: string, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

let app: TestApp;
let planet: Fixture;
let server: ByteServer;
const extraServers: ByteServer[] = [];

beforeEach(async () => {
  app = await createTestApp();
  planet = buildArchive({
    tiles: labelledWorld("planet", 6),
    metadata: { name: "Planet", attribution: "© OpenStreetMap" },
    rootBudget: 300,
    minLeafSize: 64,
  });
  server = await serveBytes(planet.bytes);
  configure();
});

/**
 * Points the map source at the local fixture server, as the address of a daily build.
 * Every settings change in this file goes through here and restates the source: a
 * test must never be left looking at the real one on the internet.
 */
function configure(extra: Partial<Settings> = {}): void {
  app.ctx.services.settings.update({
    "maps.tileSource": server.url.replace("planet.pmtiles", "20261115.pmtiles"),
    "maps.terrainSource": "http://127.0.0.1:9/terrain-is-not-configured.pmtiles",
    ...extra,
  });
}

afterEach(async () => {
  // Proof that no test wandered off to the real map source.
  expect(app.ctx.services.settings.get("maps.tileSource")).toMatch(/^(http:\/\/127\.0\.0\.1:|ftp:)/);
  expect(app.ctx.services.settings.get("maps.terrainSource")).toMatch(/^http:\/\/127\.0\.0\.1:/);
  await app.close();
  await server.close();
  for (const extra of extraServers.splice(0)) await extra.close();
});

const settled = (id: string) =>
  waitFor(() => {
    const row = app.ctx.services.downloads.get(id);
    return row && ["completed", "failed", "cancelled"].includes(row.state) ? row : undefined;
  }, "the download to finish");

/** Raw bytes and headers of a GET, which `app.api` would decode as text. */
async function getRaw(url: string, headers: Record<string, string> = {}) {
  const response = await app.app.inject({ method: "GET", url, headers: { host: "localhost", ...headers } });
  return { status: response.statusCode, body: response.rawPayload, headers: response.headers };
}

/** Puts an archive on the default storage location, as if someone had copied it there. */
function placeFile(relPath: string, bytes: Buffer): string {
  const file = path.join(app.ctx.services.storage.getDefault().path, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

describe("region presets", () => {
  it("lists the curated regions and every country, grouped", async () => {
    const { status, body } = await app.api<MapRegionsResponse>("GET", "/api/maps/regions");
    expect(status).toBe(200);
    const groups = Object.fromEntries(body.groups.map((group) => [group.name, group.regions]));
    expect(Object.keys(groups).slice(0, 4)).toEqual(["World", "Britain and Ireland", "Mountain ranges", "Europe"]);
    expect(groups.World![0]).toMatchObject({ id: "world", recommendedMaxZoom: 6, installed: false, collectionIds: [], downloadId: null });
    expect(groups["Britain and Ireland"]!.map((region) => region.name)).toEqual(
      expect.arrayContaining([
        "United Kingdom",
        "England",
        "Scotland",
        "Wales",
        "Northern Ireland",
        "Ireland",
        "Lake District",
        "Snowdonia (Eryri)",
        "Scottish Highlands",
        "Peak District",
      ]),
    );
    expect(groups["Mountain ranges"]!.map((region) => region.name)).toEqual(["European Alps", "Pyrenees"]);
    expect(groups.Europe!.map((region) => region.name)).toEqual(
      expect.arrayContaining(["France", "Switzerland", "Austria", "Italy", "Spain", "Germany", "Norway", "Iceland", "Poland"]),
    );

    const all = body.groups.flatMap((group) => group.regions);
    expect(all.length).toBeGreaterThan(180);
    expect(new Set(all.map((region) => region.id)).size).toBe(all.length);
    for (const region of all) {
      const [west, south, east, north] = region.bbox;
      expect(west < east && south < north, region.id).toBe(true);
      expect(west >= -180 && east <= 180 && south >= -85.06 && north <= 85.06, region.id).toBe(true);
      expect(region.recommendedMaxZoom).toBeGreaterThanOrEqual(6);
      expect(region.recommendedMaxZoom).toBeLessThanOrEqual(14);
    }
    // Spot checks of the hand-drawn boxes: each must contain a place everyone agrees is inside.
    const contains = (id: string, lat: number, lon: number) => {
      const [west, south, east, north] = all.find((region) => region.id === id)!.bbox;
      return lon > west && lon < east && lat > south && lat < north;
    };
    expect(contains("lake-district", 54.4542, -3.2116)).toBe(true); // Scafell Pike
    expect(contains("snowdonia", 53.0685, -4.0763)).toBe(true); // Yr Wyddfa
    expect(contains("scottish-highlands", 56.7969, -5.0036)).toBe(true); // Ben Nevis
    expect(contains("peak-district", 53.3848, -1.8733)).toBe(true); // Kinder Scout
    expect(contains("european-alps", 45.8326, 6.8652)).toBe(true); // Mont Blanc
    expect(contains("pyrenees", 42.6311, 0.6569)).toBe(true); // Aneto
    expect(contains("lake-district", 53.48, -2.24)).toBe(false); // Manchester
    // Countries that cross the antimeridian say what their box leaves out.
    expect(all.find((region) => region.id === "country-ru")).toMatchObject({
      name: "Russia",
      note: expect.stringMatching(/180° meridian/),
    });
    expect(all.find((region) => region.id === "country-ru")!.bbox[2]).toBe(180);
  });
});

describe("estimating a region", () => {
  it("returns the exact size, from the source's directories alone", async () => {
    const { status, body } = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 6 });
    expect(status).toBe(200);
    let expectedTiles = 0;
    for (const key of planet.tiles.keys()) {
      const [z, x, y] = key.split("/").map(Number) as [number, number, number];
      if (tileInBbox(REGION_BBOX, z, x, y)) expectedTiles += 1;
    }
    expect(body).toMatchObject({ tileCount: expectedTiles, sourceBuild: "20261115", minZoom: 0, maxZoom: 6 });
    expect(body.sizeBytes).toBeGreaterThan(10_000);
    expect(body.requests).toBeGreaterThan(0);
    expect(body.attribution).toContain("OpenStreetMap");
    expect(server.requests.every((range) => range !== null && (range[0] === 0 || range[1] < planet.header.tileDataOffset))).toBe(true);

    // Asked again within a few minutes, the answer comes from memory.
    const before = server.requests.length;
    const again = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 6 });
    expect(again.body).toEqual(body);
    expect(server.requests.length).toBe(before);

    // Zooms the source does not have are narrowed, and the answer says so.
    const deep = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 14 });
    expect(deep.body).toMatchObject({ maxZoom: 6, sizeBytes: body.sizeBytes });
  });

  it("explains what is wrong with a bad request", async () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ bbox: [10, 20, 5, 30], maxZoom: 5 }, /West must be less than east.*two regions/],
      [{ bbox: [0, 40, 10, 30], maxZoom: 5 }, /south must be less than north/],
      [{ bbox: [0, 0, 10, 95], maxZoom: 5 }, /North must be between -90 and 90/],
      [{ bbox: [-200, 0, 10, 10], maxZoom: 5 }, /West must be between -180 and 180/],
      [{ bbox: [0, 0, 10], maxZoom: 5 }, /bbox/],
      [{ bbox: [0, 0, 10, 10], maxZoom: 16 }, /Zoom levels run from 0 to 15/],
      [{ bbox: [0, 0, 10, 10], maxZoom: 4.5 }, /whole numbers/],
      [{ bbox: [0, 0, 10, 10], minZoom: 8, maxZoom: 5 }, /minimum zoom cannot be greater/],
      [{ bbox: [0, 0, 10, 10] }, /maxZoom/],
      [{ bbox: [0, 86, 10, 89], maxZoom: 5 }, /beyond the edge of the map/],
    ];
    for (const [payload, message] of cases) {
      const { status, body } = await app.api("POST", "/api/maps/estimate", payload);
      expect(status, JSON.stringify(payload)).toBe(400);
      expect(body.error.message, JSON.stringify(payload)).toMatch(message);
    }
    expect(server.requests.length).toBe(0);
  });

  it("refuses the whole world at full detail before asking the source anything", async () => {
    const { status, body } = await app.api("POST", "/api/maps/estimate", { bbox: WORLD, maxZoom: 15 });
    expect(status).toBe(413);
    expect(body.error.message).toMatch(/too large to download at zoom 15.*Lower the maximum zoom/);
    expect(server.requests.length).toBe(0);
  });

  it("says so when the source cannot be used", async () => {
    server.ranges = false;
    const noRanges = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 6 });
    expect(noRanges.status).toBe(415);
    expect(noRanges.body.error.message).toMatch(/does not support partial downloads/);

    server.ranges = true;
    server.failWith = 404;
    const gone = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 5 });
    expect(gone.status).toBe(502);
    expect(gone.body.error.message).toMatch(/no longer available/);

    configure({ "maps.tileSource": "ftp://example.org/planet.pmtiles" });
    const bad = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 5 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/must start with http/);
  });
});

describe("downloading a region", () => {
  it("extracts it through the download manager and installs it as a collection", async () => {
    const estimate = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 6 });
    server.requests.length = 0;

    const started = await app.api("POST", "/api/maps/regions", {
      name: "Lake District",
      regionId: "lake-district",
      bbox: REGION_BBOX,
      maxZoom: 6,
    });
    expect(started.status).toBe(200);
    expect(started.body.downloads).toHaveLength(1);
    expect(started.body.downloads[0]).toMatchObject({
      kind: "map",
      title: "Map: Lake District",
      relPath: "collections/maps/lake-district-20261115.pmtiles",
      totalBytes: estimate.body.sizeBytes,
    });

    // While it runs, the preset shows as on its way.
    const during = await app.api<MapRegionsResponse>("GET", "/api/maps/regions");
    const presetDuring = during.body.groups.flatMap((group) => group.regions).find((region) => region.id === "lake-district")!;
    expect(presetDuring.installed || presetDuring.downloadId === started.body.downloads[0].id).toBe(true);

    const row = await settled(started.body.downloads[0].id);
    expect(row).toMatchObject({ state: "completed", error: null });
    expect(row.receivedBytes).toBe(estimate.body.sizeBytes);
    expect(row.etag).toBe('"v1"');

    // The plan made for the estimate was reused: one look at the header, then tile data only.
    expect(server.requests[0]).toEqual([0, 126]);
    expect(server.requests.slice(1).every((range) => range !== null && range[0] >= planet.header.tileDataOffset)).toBe(true);
    expect(server.requests.length).toBe(1 + estimate.body.requests);

    const collection = app.ctx.services.collections.get(row.collectionId!)!;
    expect(collection).toMatchObject({
      kind: "map",
      title: "Lake District",
      relPath: "collections/maps/lake-district-20261115.pmtiles",
      sizeBytes: estimate.body.sizeBytes,
      version: "20261115",
      status: "installed",
    });
    expect(collection.attribution).toContain("OpenStreetMap");
    expect(collection.meta).toEqual({
      map: { bounds: REGION_BBOX, minZoom: 0, maxZoom: 6, tileType: "vector", sourceBuild: "20261115", format: "pmtiles" },
      regionId: "lake-district",
    });
    const file = app.ctx.services.collections.absolutePath(collection.id);
    expect(fs.statSync(file).size).toBe(estimate.body.sizeBytes);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["lake-district-20261115.pmtiles"]);

    const after = await app.api<MapRegionsResponse>("GET", "/api/maps/regions");
    expect(after.body.groups.flatMap((group) => group.regions).find((region) => region.id === "lake-district")).toMatchObject({
      installed: true,
      collectionIds: [collection.id],
      downloadId: null,
    });

    const overview = await app.api("GET", "/api/maps/overview");
    expect(overview.body.regions).toEqual([
      expect.objectContaining({
        id: collection.id,
        regionId: "lake-district",
        name: "Lake District",
        tileType: "vector",
        bounds: REGION_BBOX,
        minZoom: 0,
        maxZoom: 6,
        sizeBytes: estimate.body.sizeBytes,
        sourceBuild: "20261115",
        available: true,
        status: "installed",
        locationName: "Internal storage",
      }),
    ]);
    expect(overview.body.counts).toEqual({ markers: 0, tracks: 0, places: 0 });

    // The same region from the same build cannot be started twice.
    const again = await app.api("POST", "/api/maps/regions", { name: "Lake District", bbox: REGION_BBOX, maxZoom: 6 });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already installed or downloading/);
  });

  it("downloads terrain alongside when asked, capped at the terrain source's zoom", async () => {
    const terrainTiles = labelledWorld("dem", 5).map((tile) => ({
      ...tile,
      data: Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBPVP8 "), tile.data]),
    }));
    const terrain = buildArchive({
      tiles: terrainTiles,
      tileType: TileType.Webp,
      tileCompression: Compression.None,
      rootBudget: 300,
      minLeafSize: 64,
    });
    const terrainServer = await serveBytes(terrain.bytes, { etag: '"dem-1"' });
    extraServers.push(terrainServer);
    configure({ "maps.terrainSource": terrainServer.url });

    const started = await app.api("POST", "/api/maps/regions", {
      name: "Ålps & Friends",
      bbox: REGION_BBOX,
      maxZoom: 6,
      includeTerrain: true,
    });
    expect(started.status).toBe(200);
    expect(started.body.downloads.map((download: { kind: string }) => download.kind)).toEqual(["map", "terrain"]);
    expect(started.body.downloads[0].relPath).toBe("collections/maps/alps-friends-20261115.pmtiles");
    expect(started.body.downloads[1].relPath).toMatch(/^collections\/terrain\/alps-friends-\d{8}\.pmtiles$/);
    const rows = await Promise.all(started.body.downloads.map((download: { id: string }) => settled(download.id)));
    expect(rows.map((row) => row.state)).toEqual(["completed", "completed"]);

    const terrainCollection = app.ctx.services.collections.get(rows[1]!.collectionId!)!;
    expect(terrainCollection).toMatchObject({ kind: "terrain", title: "Ålps & Friends (terrain)" });
    expect(terrainCollection.meta.map).toMatchObject({ tileType: "terrain", minZoom: 0, maxZoom: 5, bounds: REGION_BBOX });
    expect(terrainCollection.attribution).toContain("Mapterhorn");

    // Terrain tiles are images: served as they are, with no Content-Encoding.
    const tile = await getRaw("/api/maps/terrain/5/17/9.webp");
    expect(tile.status).toBe(200);
    expect(tile.headers["content-type"]).toBe("image/webp");
    expect(tile.headers["content-encoding"]).toBeUndefined();
    expect(tile.body.equals(terrain.tiles.get("5/17/9")!)).toBe(true);
    expect((await getRaw("/api/maps/terrain/5/2/9.webp")).status).toBe(204);

    const sources = (await app.api<MapSources>("GET", "/api/maps/sources")).body;
    expect(sources).toMatchObject({ hasTiles: true, hasTerrain: true });
    expect(sources.sources.terrain).toEqual({
      type: "raster-dem",
      tiles: ["/api/maps/terrain/{z}/{x}/{y}.webp"],
      minzoom: 0,
      maxzoom: 5,
      bounds: REGION_BBOX,
      tileSize: 512,
      encoding: "terrarium",
      attribution: expect.stringContaining("mapterhorn.com/attribution"),
    });
    expect(sources.attribution).toMatch(/OpenStreetMap.*Mapterhorn/);
  });

  it("installs a whole archive fetched as an ordinary download, and refuses a file that is not one", async () => {
    // A ready-made archive from some catalogue entry: no region details, just a file.
    const whole = buildArchive({ tiles: labelledWorld("whole", 3), bounds: [-10, 35, 30, 60] });
    const fileServer = await serveBytes(whole.bytes);
    const junkServer = await serveBytes(Buffer.from("<html>Sorry, that file has moved.</html>".repeat(50)));
    extraServers.push(fileServer, junkServer);
    configure({ "downloads.maxAttempts": 1 });

    const good = await app.ctx.services.downloads.start({
      kind: "map",
      title: "Europe, ready-made",
      url: fileServer.url,
      relPath: "collections/maps/europe.pmtiles",
      allowedHosts: ["127.0.0.1"],
      meta: { version: "2026-10", attribution: "© Somebody Else" },
    });
    const row = await settled(good.id);
    expect(row.state).toBe("completed");
    const collection = app.ctx.services.collections.get(row.collectionId!)!;
    expect(collection).toMatchObject({ kind: "map", title: "Europe, ready-made", attribution: "© Somebody Else", version: "2026-10" });
    expect(collection.meta.map).toEqual({
      bounds: [-10, 35, 30, 60],
      minZoom: 0,
      maxZoom: 3,
      tileType: "vector",
      sourceBuild: "2026-10",
      format: "pmtiles",
    });
    expect((await getRaw("/api/maps/tiles/3/4/2.mvt")).body.equals(whole.tiles.get("3/4/2")!)).toBe(true);

    const bad = await app.ctx.services.downloads.start({
      kind: "map",
      title: "Not a map",
      url: junkServer.url,
      relPath: "collections/maps/junk.pmtiles",
      allowedHosts: ["127.0.0.1"],
    });
    const failed = await settled(bad.id);
    expect(failed.state).toBe("failed");
    expect(failed.error).toMatch(/not a PMTiles archive\. Nothing was installed/);
    expect(app.ctx.services.collections.list({ kind: "map" })).toHaveLength(1);
  });

  it("checks free space and the storage location before starting", async () => {
    const missing = await app.api("POST", "/api/maps/regions", {
      name: "Nowhere",
      bbox: REGION_BBOX,
      maxZoom: 6,
      locationId: "no-such-location",
    });
    expect(missing.status).toBe(404);
    const unnamed = await app.api("POST", "/api/maps/regions", { name: "  ", bbox: REGION_BBOX, maxZoom: 6 });
    expect(unnamed.status).toBe(400);
    expect(unnamed.body.error.message).toMatch(/Give the region a name/);
    expect(app.ctx.services.downloads.list()).toEqual([]);
  });

  it("tidies its working files away when a failed download is removed", async () => {
    configure({ "downloads.maxAttempts": 1 });
    // The fixture is small, so its tile data comes in a handful of requests; the
    // connection is cut from the second one on.
    const estimate = await app.api("POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 6 });
    expect(estimate.body.requests).toBeGreaterThanOrEqual(3);
    server.intercept = dropTileDataAfter(planet.header.tileDataOffset, 1);
    const started = await app.api("POST", "/api/maps/regions", { name: "Flaky", bbox: REGION_BBOX, maxZoom: 6 });
    const row = await settled(started.body.downloads[0].id);
    expect(row.state).toBe("failed");
    const part = `${app.ctx.services.storage.resolve(row.locationId, row.relPath)}.part`;
    expect(fs.existsSync(part)).toBe(true);
    expect(fs.existsSync(planPathOf(part))).toBe(true);
    expect(fs.existsSync(headPathOf(part))).toBe(true);
    // Nothing half-finished is ever offered as a map.
    expect((await app.api("GET", "/api/maps/overview")).body.regions).toEqual([]);

    // Retried once the connection is back, it continues rather than starting over.
    server.intercept = null;
    server.requests.length = 0;
    await app.ctx.services.downloads.retry(row.id);
    const second = await settled(row.id);
    expect(second.state).toBe("completed");
    expect(server.requests.filter((range) => range && range[0] >= planet.header.tileDataOffset).length).toBe(estimate.body.requests - 1);
    expect(fs.readdirSync(path.dirname(part))).toEqual(["flaky-20261115.pmtiles"]);

    // And a download that is given up on leaves nothing behind.
    server.intercept = dropTileDataAfter(planet.header.tileDataOffset, 1);
    const other = await app.api("POST", "/api/maps/regions", { name: "Abandoned", bbox: [0, 0, 40, 40], maxZoom: 6 });
    const failed = await settled(other.body.downloads[0].id);
    expect(failed.state).toBe("failed");
    const otherPart = `${app.ctx.services.storage.resolve(failed.locationId, failed.relPath)}.part`;
    expect(fs.existsSync(planPathOf(otherPart))).toBe(true);
    expect((await app.api("DELETE", `/api/downloads/${failed.id}`)).status).toBe(200);
    await waitFor(
      () => (fs.existsSync(planPathOf(otherPart)) || fs.existsSync(headPathOf(otherPart)) ? undefined : true),
      "the working files to be removed",
    );
    expect(fs.readdirSync(path.dirname(otherPart))).toEqual(["flaky-20261115.pmtiles"]);
  });
});

describe("the extract fetcher on its own", () => {
  it("moves to the newest build when the one it started from is no longer published", async () => {
    const gone = await serveBytes(planet.bytes);
    gone.failWith = 404;
    extraServers.push(gone);
    const client = createHttpClient({ allowPrivate: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-fetcher-"));
    const newestUrl = server.url.replace("planet.pmtiles", "20261116.pmtiles");
    const fetcher = createExtractFetcher({
      client,
      planner: createPlanner(client, { planOptions: { maxRequestBytes: 4096 } }),
      sources: { resolve: async () => ({ url: newestUrl, build: "20261116", followsNewest: true, host: "127.0.0.1" }) },
    });
    const remembered: Array<Record<string, unknown>> = [];
    const messages: string[] = [];
    const meta = {
      bbox: REGION_BBOX,
      minZoom: 0,
      maxZoom: 6,
      tileType: "vector",
      regionName: "Test",
      sourceBuild: "20261109",
      followsNewest: true,
    };
    const context: FetchContext = {
      download: { id: "d1", url: gone.url.replace("planet.pmtiles", "20261109.pmtiles"), meta } as unknown as DownloadRow,
      partPath: path.join(dir, "test.pmtiles.part"),
      signal: new AbortController().signal,
      progress: (_received, _total, message) => message && messages.push(message),
      remember: (patch) => remembered.push(patch as Record<string, unknown>),
    };
    await fetcher(context);

    expect(remembered[0]).toEqual({ meta: { sourceUrl: newestUrl, sourceBuild: "20261116" } });
    expect(remembered.at(-1)).toEqual({ etag: '"v1"' });
    expect(messages.join(" ")).toMatch(/no longer published.*newest one/);
    const archive = await LocalArchive.open(context.partPath);
    expect(archive.header.addressedTiles).toBeGreaterThan(100);
    await archive.close();

    // A custom source that disappears is not silently swapped for something else.
    const fixed: FetchContext = {
      ...context,
      download: { ...context.download, meta: { ...meta, followsNewest: false } } as unknown as DownloadRow,
      partPath: path.join(dir, "fixed.part"),
    };
    await expect(fetcher(fixed)).rejects.toThrow(/no longer available at its address/);
    // And a download without its details fails for good rather than being retried.
    await expect(fetcher({ ...context, download: { ...context.download, meta: {} } as unknown as DownloadRow })).rejects.toThrow(
      /missing the details of its region/,
    );

    await client.close();
    fs.rmSync(dir, { recursive: true });
  });
});

describe("serving tiles", () => {
  let overview: Fixture;
  let detail: Fixture;

  beforeEach(async () => {
    // A coarse map of the world, and a detailed one of a region within it.
    overview = buildArchive({ tiles: labelledWorld("overview", 3), bounds: WORLD });
    detail = buildArchive({
      tiles: labelledWorld("detail", 6).filter((tile) => tileInBbox(REGION_BBOX, tile.z, tile.x, tile.y)),
      bounds: REGION_BBOX,
      rootBudget: 200,
      minLeafSize: 32,
    });
    placeFile("imports/world-overview.pmtiles", overview.bytes);
    placeFile("imports/detail.pmtiles", detail.bytes);
    const location = app.ctx.services.storage.getDefault();
    expect(
      (
        await app.api("POST", "/api/maps/import", {
          locationId: location.id,
          relPath: "imports/world-overview.pmtiles",
          name: "World overview",
        })
      ).status,
    ).toBe(200);
    const imported = await app.api("POST", "/api/maps/import", {
      locationId: location.id,
      relPath: "imports/detail.pmtiles",
      name: "Detail",
    });
    expect(imported.status).toBe(200);
    expect(imported.body.collection).toMatchObject({
      kind: "map",
      title: "Detail",
      relPath: "imports/detail.pmtiles",
      sizeBytes: detail.bytes.length,
    });
    expect(imported.body.collection.meta.map).toEqual({
      bounds: REGION_BBOX,
      minZoom: 0,
      maxZoom: 6,
      tileType: "vector",
      format: "pmtiles",
    });
  });

  it("answers from the most detailed archive and falls back to the overview", async () => {
    // Deep inside the region: only the detailed archive has it.
    const deep = await getRaw("/api/maps/tiles/6/34/20.mvt");
    expect(deep.status).toBe(200);
    expect(deep.body.equals(detail.tiles.get("6/34/20")!)).toBe(true);
    expect(deep.headers["content-type"]).toBe("application/x-protobuf");
    expect(deep.headers["content-encoding"]).toBe("gzip");
    expect(deep.headers["cache-control"]).toBe("private, max-age=3600");

    // Where both have the tile, the more detailed archive wins.
    expect(tileInBbox(REGION_BBOX, 3, 4, 2)).toBe(true);
    expect((await getRaw("/api/maps/tiles/3/4/2.mvt")).body.equals(detail.tiles.get("3/4/2")!)).toBe(true);
    expect((await getRaw("/api/maps/tiles/0/0/0.mvt")).body.equals(detail.tiles.get("0/0/0")!)).toBe(true);

    // Outside the region at a zoom the overview covers: the overview answers.
    expect(tileInBbox(REGION_BBOX, 3, 1, 5)).toBe(false);
    expect((await getRaw("/api/maps/tiles/3/1/5.mvt")).body.equals(overview.tiles.get("3/1/5")!)).toBe(true);

    // Outside the region and beyond the overview's zooms: nothing, quietly.
    const empty = await getRaw("/api/maps/tiles/5/2/20.mvt");
    expect(empty.status).toBe(204);
    expect(empty.body.length).toBe(0);
    expect(empty.headers["cache-control"]).toBe("private, max-age=3600");
    // Beyond every archive's zooms.
    expect((await getRaw("/api/maps/tiles/9/260/170.mvt")).status).toBe(204);
  });

  it("rejects addresses that are not tiles", async () => {
    expect((await getRaw("/api/maps/tiles/3/4/2.png")).status).toBe(404);
    expect((await getRaw("/api/maps/tiles/3/4/two.mvt")).status).toBe(404);
    expect((await getRaw("/api/maps/tiles/x/4/2.mvt")).status).toBe(404);
    // A column that does not exist at that zoom is simply empty.
    expect((await getRaw("/api/maps/tiles/3/9/2.mvt")).status).toBe(204);
    expect((await getRaw("/api/maps/tiles/99/1/1.mvt")).status).toBe(204);
  });

  it("describes the sources for the map style", async () => {
    const { body } = await app.api<MapSources>("GET", "/api/maps/sources");
    expect(body.hasTiles).toBe(true);
    expect(body.hasTerrain).toBe(false);
    expect(body.sources.basemap).toEqual({
      type: "vector",
      tiles: ["/api/maps/tiles/{z}/{x}/{y}.mvt"],
      minzoom: 0,
      maxzoom: 6,
      bounds: WORLD,
      attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    });
    expect(body.sources.terrain).toBeUndefined();
    expect(body.glyphs).toBe("/map-assets/fonts/{fontstack}/{range}.pbf");
    expect(body.sprites).toMatchObject({ light: "/map-assets/sprites/v4/light", dark: "/map-assets/sprites/v4/dark" });
    expect(body.maxZoom).toBe(6);
    expect(body.attribution).toContain('© <a href="https://openstreetmap.org">OpenStreetMap</a>');
    expect(body.attributions.map((entry) => entry.name)).toEqual(["Protomaps, OpenStreetMap"]);
  });

  it("stops serving a region, and lets go of its file, when the collection is removed", async () => {
    await getRaw("/api/maps/tiles/6/34/20.mvt");
    const collection = app.ctx.services.collections.list({ kind: "map" }).find((row) => row.title === "Detail")!;
    const file = app.ctx.services.collections.absolutePath(collection.id);
    const removed = await app.api("DELETE", `/api/collections/${collection.id}`, { deleteFiles: true });
    expect(removed.status).toBe(200);
    expect(fs.existsSync(file)).toBe(false);

    expect((await getRaw("/api/maps/tiles/6/34/20.mvt")).status).toBe(204);
    // The overview now answers where the detailed map used to.
    expect((await getRaw("/api/maps/tiles/3/4/2.mvt")).body.equals(overview.tiles.get("3/4/2")!)).toBe(true);
    const sources = (await app.api<MapSources>("GET", "/api/maps/sources")).body;
    expect(sources.sources.basemap).toMatchObject({ maxzoom: 3 });
    expect((await app.api("GET", "/api/maps/overview")).body.regions.map((region: { name: string }) => region.name)).toEqual([
      "World overview",
    ]);
  });

  it("carries on with the other regions when one file has gone missing", async () => {
    const collection = app.ctx.services.collections.list({ kind: "map" }).find((row) => row.title === "Detail")!;
    fs.rmSync(app.ctx.services.collections.absolutePath(collection.id));
    expect((await getRaw("/api/maps/tiles/3/4/2.mvt")).body.equals(overview.tiles.get("3/4/2")!)).toBe(true);
    expect((await getRaw("/api/maps/tiles/6/34/20.mvt")).status).toBe(204);
  });
});

describe("importing an archive that is already on disk", () => {
  it("checks the file before registering it, and never copies it", async () => {
    const location = app.ctx.services.storage.getDefault();
    const body = (relPath: string, extra: Record<string, unknown> = {}) => ({ locationId: location.id, relPath, name: "Mine", ...extra });

    const notPmtiles = await app.api("POST", "/api/maps/import", body("imports/readme.txt"));
    expect(notPmtiles.status).toBe(400);
    expect(notPmtiles.body.error.message).toMatch(/ends in \.pmtiles/);

    const missing = await app.api("POST", "/api/maps/import", body("imports/nothing.pmtiles"));
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toMatch(/no file at that place/);

    const outside = await app.api("POST", "/api/maps/import", body("../../outside.pmtiles"));
    expect(outside.status).toBe(400);
    expect(outside.body.error.message).toMatch(/outside the allowed folder/);

    placeFile("imports/fake.pmtiles", Buffer.from("this is not a tile archive, whatever its name says".repeat(10)));
    const fake = await app.api("POST", "/api/maps/import", body("imports/fake.pmtiles"));
    expect(fake.status).toBe(400);
    expect(fake.body.error.message).toMatch(/not a PMTiles archive/);

    const good = buildArchive({ tiles: labelledWorld("mine", 2) });
    placeFile("imports/cut-short.pmtiles", good.bytes.subarray(0, good.bytes.length - 50));
    const cut = await app.api("POST", "/api/maps/import", body("imports/cut-short.pmtiles"));
    expect(cut.status).toBe(400);
    expect(cut.body.error.message).toMatch(/incomplete/);

    const raster = buildArchive({ tiles: labelledWorld("dem", 2), tileType: TileType.Png, tileCompression: Compression.None });
    placeFile("imports/dem.pmtiles", raster.bytes);
    const asVector = await app.api("POST", "/api/maps/import", body("imports/dem.pmtiles"));
    expect(asVector.status).toBe(400);
    expect(asVector.body.error.message).toMatch(/image tiles.*import it as terrain/);
    const asTerrain = await app.api("POST", "/api/maps/import", body("imports/dem.pmtiles", { tileType: "terrain" }));
    expect(asTerrain.status).toBe(200);
    expect(asTerrain.body.collection).toMatchObject({ kind: "terrain" });

    const file = placeFile("imports/mine.pmtiles", good.bytes);
    const first = await app.api("POST", "/api/maps/import", body("imports/mine.pmtiles"));
    expect(first.status).toBe(200);
    expect(app.ctx.services.collections.absolutePath(first.body.collection.id)).toBe(file);
    const twice = await app.api("POST", "/api/maps/import", body("imports/mine.pmtiles"));
    expect(twice.status).toBe(409);
    expect(app.ctx.services.collections.list({ kind: "map" })).toHaveLength(1);
  });
});

describe("permissions", () => {
  it("lets members look and keep markers, and only administrators change what is installed", async () => {
    await app.close();
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    configure();
    const cookieOf = (headers: Record<string, unknown>) => String([headers["set-cookie"]].flat()[0]).split(";")[0]!;
    const setup = await app.api("POST", "/api/auth/setup", { username: "admin", password: "correct horse battery" });
    const admin = { headers: { cookie: cookieOf(setup.headers) } };
    await app.api("POST", "/api/users", { username: "member", password: "another long password", role: "member" }, admin);
    const login = await app.api("POST", "/api/auth/login", { username: "member", password: "another long password" });
    const member = { headers: { cookie: cookieOf(login.headers) } };

    for (const url of [
      "/api/maps/regions",
      "/api/maps/overview",
      "/api/maps/sources",
      "/api/maps/markers",
      "/api/maps/tracks",
      "/api/maps/places?q=x",
      "/api/maps/tiles/0/0/0.mvt",
    ]) {
      expect((await app.api("GET", url)).status, url).toBe(401);
      expect((await app.api("GET", url, undefined, member)).status, url).toBeLessThan(300);
    }
    const location = app.ctx.services.storage.getDefault();
    const adminOnly: Array<[string, string, unknown]> = [
      ["POST", "/api/maps/estimate", { bbox: REGION_BBOX, maxZoom: 3 }],
      ["POST", "/api/maps/regions", { name: "X", bbox: REGION_BBOX, maxZoom: 3 }],
      ["POST", "/api/maps/import", { locationId: location.id, relPath: "x.pmtiles", name: "X" }],
      ["POST", "/api/maps/places/datasets", { dataset: "cities500" }],
      ["DELETE", "/api/maps/places/datasets/anything", undefined],
    ];
    for (const [method, url, payload] of adminOnly) {
      const refused = await app.api(method, url, payload, member);
      expect(refused.status, url).toBe(403);
      expect(refused.body.error.message).toMatch(/Only an administrator/);
    }
    const marker = await app.api("POST", "/api/maps/markers", { name: "Camp", lat: 54.5, lon: -3.1 }, member);
    expect(marker.status).toBe(200);
    expect((await app.api("DELETE", `/api/maps/markers/${marker.body.marker.id}`, undefined, member)).status).toBe(200);
  });
});

describe("finding the newest build", () => {
  async function serveJson(body: unknown, status = 200): Promise<{ url: string; hits: () => number; close(): Promise<void> }> {
    let hits = 0;
    const listener = http.createServer((_request, response) => {
      hits += 1;
      response.writeHead(status, { "content-type": "application/json" }).end(typeof body === "string" ? body : JSON.stringify(body));
    });
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    return {
      url: `http://127.0.0.1:${(listener.address() as AddressInfo).port}/builds.json`,
      hits: () => hits,
      close: () => new Promise<void>((resolve) => listener.close(() => resolve())),
    };
  }

  it("picks the latest day from the list, and never a hard-coded one", async () => {
    const client = createHttpClient({ allowPrivate: true });
    const builds = await serveJson([
      { key: "20261113.pmtiles", size: 1, uploaded: "2026-11-13T09:03:32Z" },
      { key: "20261115.pmtiles", size: 3, uploaded: "2026-11-15T09:09:48Z" },
      { key: "20261114.pmtiles", size: 2, uploaded: "2026-11-14T09:04:04Z" },
      { key: "notes.txt", size: 9 },
    ]);
    expect(await fetchNewestBuild(client, { buildsUrl: builds.url })).toEqual({
      url: "https://build.protomaps.com/20261115.pmtiles",
      build: "20261115",
      followsNewest: true,
      host: "build.protomaps.com",
    });

    // The resolver remembers the answer for a while, and settings override it.
    let override = "";
    const resolver = createSourceResolver({
      client,
      buildsUrl: builds.url,
      setting: (key) => (key === "maps.tileSource" ? override : "https://terrain.example/planet.pmtiles"),
    });
    const hitsBefore = builds.hits();
    expect((await resolver.resolve("vector")).build).toBe("20261115");
    expect((await resolver.resolve("vector")).build).toBe("20261115");
    expect(builds.hits()).toBe(hitsBefore + 1);
    override = "https://mirror.example/maps/planet.pmtiles";
    expect(await resolver.resolve("vector")).toEqual({ url: override, build: null, followsNewest: false, host: "mirror.example" });
    expect(await resolver.resolve("terrain")).toMatchObject({ url: "https://terrain.example/planet.pmtiles", followsNewest: false });
    await builds.close();

    for (const [body, status] of [
      [[], 200],
      ["<html>", 200],
      [{ builds: [] }, 200],
      [[], 503],
    ] as const) {
      const broken = await serveJson(body, status);
      await expect(fetchNewestBuild(client, { buildsUrl: broken.url })).rejects.toMatchObject({ code: "upstream" });
      await broken.close();
    }
    await expect(fetchNewestBuild(client, { buildsUrl: builds.url })).rejects.toMatchObject({ code: "offline" });
    await client.close();
  });

  it("reads the build day out of an address", () => {
    expect(buildOfUrl("https://build.protomaps.com/20261115.pmtiles")).toBe("20261115");
    expect(buildOfUrl("https://mirror.example/planet-20261115.pmtiles")).toBe("20261115");
    expect(buildOfUrl("https://download.mapterhorn.com/planet.pmtiles")).toBeNull();
    expect(buildOfUrl("not a url")).toBeNull();
  });

  it("makes file-safe names for regions", () => {
    expect(slugify("Snowdonia (Eryri)")).toBe("snowdonia-eryri");
    expect(slugify("Ålps & Friends")).toBe("alps-friends");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("日本")).toBe("region");
  });
});
