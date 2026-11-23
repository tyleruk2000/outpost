/**
 * Bringing map data up to date (`POST /api/maps/data/check` and `/api/maps/data/update`): a map
 * area downloaded again from a newer build, and GeoNames place names downloaded again. The one
 * kept stays, and is used, until the new one is in place and checked; a failed download leaves it
 * as it was. Local fixture servers stand in for the map source and GeoNames.
 */
import fs from "node:fs";
import type { MapDataCheckResponse, MapDataResponse, MapDataUpdateResponse, PlaceSearchResponse } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ByteServer, buildArchive, type Fixture, fakeTile, serveBytes, worldTiles } from "./fixtures/maps/archive.ts";
import { buildZip, geonamesLine } from "./fixtures/maps/zip.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const BBOX: [number, number, number, number] = [-20, 20, 60, 70];

function planet(label: string): Fixture {
  return buildArchive({
    tiles: worldTiles(5, () => false).map((tile) => ({ ...tile, data: fakeTile(`${label}:${tile.z}/${tile.x}/${tile.y}`) })),
    metadata: { name: "Planet", attribution: "© OpenStreetMap" },
    rootBudget: 300,
    minLeafSize: 64,
  });
}

let app: TestApp;
let server: ByteServer;

async function settled(id: string) {
  await app.ctx.jobs.whenIdle();
  const deadline = Date.now() + 15_000;
  for (;;) {
    const row = app.ctx.services.downloads.get(id);
    if (row && ["completed", "failed", "cancelled"].includes(row.state)) return row;
    if (Date.now() > deadline) throw new Error("Timed out waiting for the download.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("updating a map area", () => {
  const source = (build: string) => {
    app.ctx.services.settings.update({
      "maps.tileSource": server.url.replace("planet.pmtiles", `${build}.pmtiles`),
      "maps.terrainSource": "http://127.0.0.1:9/terrain-is-not-configured.pmtiles",
    });
  };

  beforeEach(async () => {
    app = await createTestApp();
    server = await serveBytes(planet("old").bytes);
    source("20251001");
  });
  afterEach(async () => {
    expect(app.ctx.services.settings.get("maps.tileSource")).toMatch(/^http:\/\/127\.0\.0\.1:/);
    await app.close();
    await server.close();
  });

  async function installed() {
    const started = await app.api("POST", "/api/maps/regions", { name: "Somewhere", regionId: "somewhere", bbox: BBOX, maxZoom: 5 });
    expect(started.status).toBe(200);
    const row = await settled(started.body.downloads[0].id);
    expect(row.state).toBe("completed");
    return app.ctx.services.collections.get(row.collectionId!)!;
  }

  it("says how large and how new the newest build is, asking only on a press, and says who is asked beforehand", async () => {
    const old = await installed();
    const listed = (await app.api<MapDataResponse>("GET", "/api/maps/data")).body;
    const item = [...listed.other, ...listed.countries.flatMap((country) => country.rows.flatMap((row) => row.items))].find(
      (each) => each.collectionId === old.id,
    )!;
    expect(item.dataDate).toBe("2025-10-01");
    expect(item.update).toEqual({ how: "download", hosts: ["127.0.0.1"], note: null });

    source("20261122");
    server.requests.length = 0;
    const check = await app.api<MapDataCheckResponse>("POST", "/api/maps/data/check", { collectionId: old.id });
    expect(check.status).toBe(200);
    expect(check.body).toMatchObject({ hosts: ["127.0.0.1"], dataDate: "2026-11-22", newer: true });
    expect(check.body.sizeBytes).toBeGreaterThan(0);
    // Nothing was downloaded: the plan reads the archive's directories, not its tiles.
    expect(app.ctx.services.downloads.list()).toHaveLength(1);
  });

  it("downloads the same area again and replaces the old one only once the new one is in", async () => {
    const old = await installed();
    const oldFile = app.ctx.services.collections.absolutePath(old.id);
    source("20261122");
    server.body = planet("new").bytes;

    const update = await app.api<MapDataUpdateResponse>("POST", "/api/maps/data/update", { collectionId: old.id });
    expect(update.status).toBe(200);
    const download = app.ctx.services.downloads.get(update.body.downloadIds[0]!)!;
    expect(download).toMatchObject({ kind: "map", relPath: "collections/maps/somewhere-20261122.pmtiles", locationId: old.locationId });
    expect(download.meta).toMatchObject({ replaces: old.id, regionId: "somewhere", bbox: BBOX, maxZoom: 5 });

    const finished = await settled(download.id);
    expect(finished.state).toBe("completed");
    const fresh = app.ctx.services.collections.get(finished.collectionId!)!;
    expect(fresh).toMatchObject({ kind: "map", title: "Somewhere", version: "20261122", meta: { regionId: "somewhere" } });
    expect(app.ctx.services.collections.get(old.id)).toBeUndefined();
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(app.ctx.services.collections.absolutePath(fresh.id))).toBe(true);
  });

  it("leaves the old map as it was when the download fails, and refuses an update to the build it is from", async () => {
    const old = await installed();
    const oldFile = app.ctx.services.collections.absolutePath(old.id);

    const same = await app.api("POST", "/api/maps/data/update", { collectionId: old.id });
    expect(same.status).toBe(409);
    expect(same.body.error.message).toMatch(/newest build already/);

    source("20261122");
    const update = await app.api<MapDataUpdateResponse>("POST", "/api/maps/data/update", { collectionId: old.id });
    expect(update.status).toBe(200);
    // The source goes away mid-download.
    server.failWith = 404;
    const finished = await settled(update.body.downloadIds[0]!);
    expect(finished.state).toBe("failed");
    expect(app.ctx.services.collections.get(old.id)).toMatchObject({ status: "installed", version: "20251001" });
    expect(fs.existsSync(oldFile)).toBe(true);
    expect(app.ctx.services.collections.list({ kind: "map" })).toHaveLength(1);
  });

  it("refuses what it cannot fetch again, before asking anyone", async () => {
    const missing = await app.api("POST", "/api/maps/data/update", { collectionId: "nope" });
    expect(missing.status).toBe(404);
    const bad = await app.api("POST", "/api/maps/data/check", { collectionId: "" });
    expect(bad.status).toBe(400);
  });
});

describe("updating place names", () => {
  const zip = (names: string[]) =>
    buildZip([
      {
        name: "GB.txt",
        content: names
          .map((name, index) =>
            geonamesLine({ id: 100 + index, name, lat: 54 + index / 100, lon: -3, featureClass: "P", featureCode: "PPL", country: "GB" }),
          )
          .join("\n"),
      },
    ]);
  const search = async (q: string) =>
    (await app.api<PlaceSearchResponse>("GET", `/api/maps/places?q=${encodeURIComponent(q)}`)).body.places.map((place) => place.name);

  beforeEach(async () => {
    server = await serveBytes(zip(["Ambleside", "Grasmere"]), { etag: '"geonames"' });
    app = await createTestApp({ OUTPOST_GEONAMES_URL: server.url.replace("planet.pmtiles", "") });
  });
  afterEach(async () => {
    await app.close();
    await server.close();
  });

  async function installed() {
    const started = await app.api("POST", "/api/maps/places/datasets", { dataset: "country", country: "GB" });
    expect(started.status).toBe(200);
    const row = await settled(started.body.download.id);
    expect(row.state).toBe("completed");
    return app.ctx.services.collections.get(row.collectionId!)!;
  }

  it("checks the list's size with GeoNames on a press, downloads it again and swaps it in once read", async () => {
    const old = await installed();
    expect(await search("Grasmere")).toEqual(["Grasmere"]);

    const check = await app.api<MapDataCheckResponse>("POST", "/api/maps/data/check", { collectionId: old.id });
    expect(check.status).toBe(200);
    expect(check.body).toMatchObject({ hosts: ["127.0.0.1"], sizeBytes: server.body.length });

    server.body = zip(["Ambleside", "Rydal"]);
    const update = await app.api<MapDataUpdateResponse>("POST", "/api/maps/data/update", { collectionId: old.id });
    expect(update.status).toBe(200);
    const download = app.ctx.services.downloads.get(update.body.downloadIds[0]!)!;
    expect(download.meta).toMatchObject({ dataset: "GB", replaces: old.id });
    expect(download.relPath).toMatch(/^collections\/places\/GB-\d{4}-\d{2}-\d{2}\.zip$/);

    const finished = await settled(download.id);
    expect(finished.state).toBe("completed");
    expect(app.ctx.services.collections.get(old.id)).toBeUndefined();
    expect(app.ctx.services.collections.list({ kind: "places" })).toHaveLength(1);
    expect(await search("Rydal")).toEqual(["Rydal"]);
    expect(await search("Grasmere")).toEqual([]);
  });

  it("keeps the old list, still searched, when the download fails", async () => {
    const old = await installed();
    server.failWith = 404;
    const update = await app.api<MapDataUpdateResponse>("POST", "/api/maps/data/update", { collectionId: old.id });
    expect(update.status).toBe(200);
    const finished = await settled(update.body.downloadIds[0]!);
    expect(finished.state).toBe("failed");
    expect(app.ctx.services.collections.get(old.id)).toMatchObject({ status: "installed" });
    expect(await search("Grasmere")).toEqual(["Grasmere"]);
  });
});
