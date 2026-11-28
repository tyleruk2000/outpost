/**
 * Map data: one country file (a Geofabrik extract) downloaded once and read for both road
 * routes and places to find, then kept or deleted as the person chose; a kept file read
 * again with no download; everything listed in one answer and in Storage. A local stand-in
 * plays Geofabrik (fixtures/layers/geofabrik-stand-in.ts); nothing reaches the internet.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { DownloadDetail, ManagedItemsResponse, MapDataItem, MapDataResponse, UsageResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { datedFilesIn, dateOfName } from "../src/modules/layers/adapters/geofabrik-file.ts";
import { countryOfArea } from "../src/modules/maps/map-data.ts";
import { buildPbf } from "./fixtures/layers/builders.ts";
import { createGeofabrikStandIn } from "./fixtures/layers/geofabrik-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

/** A made-up Monaco: one main road through it, a hospital and a pharmacy beside it. */
function monaco(): Buffer {
  return buildPbf({
    nodes: [
      { id: 1, lat: 43.725, lon: 7.41 },
      { id: 2, lat: 43.733, lon: 7.42 },
      { id: 3, lat: 43.741, lon: 7.43 },
      { id: 10, lat: 43.734, lon: 7.421, tags: { amenity: "hospital", name: "Made-up Hospital (test)" } },
      { id: 11, lat: 43.732, lon: 7.419, tags: { amenity: "pharmacy", name: "Made-up Pharmacy (test)" } },
    ],
    ways: [{ id: 100, refs: [1, 2, 3], tags: { highway: "primary", ref: "M6", name: "Boulevard (test)" } }],
    relations: [],
    timestamp: Date.UTC(2026, 10, 21) / 1000,
  });
}

describe("which dated file to fetch", () => {
  it("reads the dated files a region's page links to, newest first, on its own host only", () => {
    const html = `<a href="monaco-261120.osm.pbf">a</a><a href="../monaco-261121.osm.pbf">b</a>
      <a href="monaco-latest.osm.pbf">c</a><a href="https://elsewhere.example/monaco-261122.osm.pbf">d</a>
      <a href="notmonaco-261123.osm.pbf">e</a><a href="monaco-261121.osm.pbf.md5">md5</a>`;
    expect(datedFilesIn(html, "https://download.geofabrik.de/europe/monaco/", "monaco")).toEqual([
      "https://download.geofabrik.de/europe/monaco-261121.osm.pbf",
      "https://download.geofabrik.de/europe/monaco/monaco-261120.osm.pbf",
    ]);
    expect(dateOfName("united-kingdom-261121.osm.pbf")).toBe("2026-11-21");
    expect(dateOfName("united-kingdom-latest.osm.pbf")).toBeNull();
  });

  it("finds the country of a ready-made map area by the country outlines, not by boxes", () => {
    expect(countryOfArea([-8.65, 49.85, 1.77, 60.86], "united-kingdom")).toBe("GB");
    expect(countryOfArea([5.7, 49.4, 6.6, 50.2], "country-lu")).toBe("LU");
    // Bavaria: Austria's box holds its middle (Munich is in Austria's box), but its land is Germany's.
    expect(countryOfArea([8.97, 47.27, 13.84, 50.56], "bavaria")).toBe("DE");
    // The Lake District, and New England (inside Canada's box, and the United States' own).
    expect(countryOfArea([-3.55, 54.17, -2.6, 54.78], "lake-district")).toBe("GB");
    expect(countryOfArea([-73.7, 41.0, -69.9, 45.0], "new-england")).toBe("US");
  });

  it("finds the country of a map brought in from a file, or drawn, by its land, and none for one across several", () => {
    // A map of Great Britain imported from a file, with no ready-made region; a box of Bavaria; Strasbourg and Kehl, either side of the Rhine.
    expect(countryOfArea([-8.7, 49.8, 1.8, 60.9], null)).toBe("GB");
    expect(countryOfArea([10.5, 47.6, 12.5, 48.6], null)).toBe("DE");
    expect(countryOfArea([7.65, 48.5, 7.95, 48.65], null)).toBeNull();
    // The Alps, from Grenoble to Innsbruck: four countries, none most of it.
    expect(countryOfArea([5.7, 45.0, 11.4, 47.3], null)).toBeNull();
    // Open sea.
    expect(countryOfArea([-30, 40, -29, 41], null)).toBeNull();
  });
});

describe("one country file for roads and places", () => {
  let app: TestApp;
  let server: http.Server;
  const standIn = createGeofabrikStandIn();
  const body = monaco();
  // Geofabrik's "latest" leads to a file not there yet; the day before's is.
  standIn.files.set("europe/monaco", {
    path: "europe/monaco",
    body,
    md5: crypto.createHash("md5").update(body).digest("hex"),
    latest: "261122",
    dated: ["261120", "261121"],
  });

  beforeAll(async () => {
    server = http.createServer((request, response) => standIn.handle(request, response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    app = await createTestApp({ OUTPOST_GEOFABRIK_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    expect((await app.api("POST", "/api/reference/regions")).status).toBe(200);
  });
  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const data = async () => {
    const answer = await app.api("GET", "/api/maps/data");
    expect(answer.status).toBe(200);
    return answer.body as MapDataResponse;
  };
  const rowOf = (answer: MapDataResponse, kind: string) =>
    answer.countries.find((c) => c.country === "MC")?.rows.find((r) => r.kind === kind)?.items ?? [];
  const pbfFetches = () => standIn.requests.filter((line) => line.startsWith("GET") && line.endsWith(".osm.pbf"));

  it("asks the person whether to keep the file, and chooses nothing for them", async () => {
    const refused = await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["roads"] });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toMatch(/whether to keep the source file/);
    const before = await data();
    expect(before.countryFileChoice).toEqual({ keep: null, locationId: null });
    expect(before.regionsListed).toBe(true);
  });

  it("builds walking and cycling only from a kept source file, and only where the add-on is installed", async () => {
    const unkept = await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["roads"], keep: false, streets: {} });
    expect(unkept.status).toBe(400);
    expect(JSON.stringify(unkept.body)).toMatch(/keep it to build them/);
    const missing = await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["extract"], keep: true, streets: {} });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toMatch(/optional add-on that is not part of this installation/);
    expect(pbfFetches()).toEqual([]);
  });

  it("downloads once, falling back to the newest dated file when the latest is not there, reads roads and places, then deletes it", async () => {
    standIn.requests.length = 0;
    const added = await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["roads", "places"], keep: false });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(added.body.countryFile).toMatchObject({ source: "download", fileName: "monaco-261121.osm.pbf", dataDate: "2026-11-21" });
    expect(added.body.countryFile.fallback).toMatch(/monaco-261122\.osm\.pbf, was not there yet \(HTTP 404\), so monaco-261121\.osm\.pbf/);
    const downloadId = added.body.downloadIds[0] as string;
    await app.ctx.jobs.whenIdle();

    const download = app.ctx.services.downloads.get(downloadId)!;
    expect(download.state, download.error ?? "").toBe("completed");
    // The download's history says which file was used, and it was checked against that file's own MD5.
    const detail = (await app.api("GET", `/api/downloads/${downloadId}`)).body as DownloadDetail;
    expect(detail.events[0]!.detail).toMatch(/monaco-261121\.osm\.pbf, the newest its page lists/);
    expect(detail.integrity.md5Expected).toBe(standIn.files.get("europe/monaco")!.md5);
    expect(standIn.requests).toContain("GET /europe/monaco-261121.osm.pbf.md5");
    // One download served both.
    expect(pbfFetches()).toEqual(["GET /europe/monaco-261121.osm.pbf"]);
    const networks = (await app.api("GET", "/api/roads/networks")).body.networks;
    expect(networks).toMatchObject([{ regionId: "monaco", country: "MC", dataDate: "2026-11-21", extract: { kept: false } }]);
    const packs = (await app.api("GET", "/api/reference/packs")).body.packs;
    expect(packs).toHaveLength(1);
    expect(packs[0].layers).toEqual(expect.arrayContaining(["hospitals", "food"]));
    // Not kept, as the person chose: the file is gone, and so said.
    expect(fs.existsSync(app.ctx.services.storage.resolve(download.locationId, download.relPath))).toBe(false);
    expect(app.ctx.services.collections.list({ kind: "extract" })).toEqual([]);

    const answer = await data();
    const mc = answer.countries.find((c) => c.country === "MC")!;
    expect(mc.name).toBe("Monaco");
    expect(mc.regionId).toBe("monaco");
    expect(mc.rows.map((r) => r.kind)).toEqual(["map", "terrain", "names", "roads", "places", "extract"]);
    expect(rowOf(answer, "roads")).toMatchObject([{ state: "ready", dataDate: "2026-11-21", locationId: null, networkId: networks[0].id }]);
    expect(rowOf(answer, "places")).toMatchObject([{ state: "ready", packId: packs[0].id }]);
    // Its size is what its records take in the database, not the short record left of the deleted file.
    const collection = app.ctx.services.collections.get(packs[0].id)!;
    expect(packs[0].sizeBytes).toBeGreaterThan(collection.sizeBytes + packs[0].records * 100);
    expect(rowOf(answer, "places")[0]!.sizeBytes).toBe(packs[0].sizeBytes);
    expect(rowOf(answer, "extract")).toEqual([]);
    expect(mc.lastRead).toMatchObject({ fileName: "monaco-261121.osm.pbf", bytes: body.length, kept: false, dataDate: "2026-11-21" });
    expect(answer.countryFileChoice.keep).toBe(false);
    expect(app.ctx.services.settings.get("maps.countryFileKeep")).toBe("delete");
  });

  it("keeps the file when asked, as a country file in Storage, and reads it again with no download", async () => {
    const location = app.ctx.services.storage.getDefault();
    const added = await app.api("POST", "/api/maps/data/add", {
      regionId: "monaco",
      kinds: ["roads", "places"],
      keep: true,
      locationId: location.id,
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    await app.ctx.jobs.whenIdle();
    const [kept] = app.ctx.services.collections.list({ kind: "extract" });
    expect(kept).toMatchObject({ kind: "extract", title: "Monaco: source file", locationId: location.id, sizeBytes: body.length });
    expect(fs.existsSync(app.ctx.services.storage.resolve(kept!.locationId, kept!.relPath))).toBe(true);
    // Replaced, not added beside: still one network and one pack.
    expect((await app.api("GET", "/api/roads/networks")).body.networks).toHaveLength(1);
    expect((await app.api("GET", "/api/reference/packs")).body.packs).toHaveLength(1);

    let answer = await data();
    expect(answer.countryFiles).toMatchObject([{ kind: "extract", state: "ready", dataDate: "2026-11-21", collectionId: kept!.id }]);
    expect(rowOf(answer, "extract")).toHaveLength(1);
    expect(answer.countryFileChoice).toEqual({ keep: true, locationId: location.id });

    // Roads again, and through the road routes API too: read from the kept file, nothing asked of Geofabrik.
    standIn.requests.length = 0;
    const before = (await app.api("GET", "/api/roads/networks")).body.networks[0].id;
    const again = await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["roads"], keep: true });
    expect(again.body).toMatchObject({ countryFile: { source: "kept", collectionId: kept!.id, dataDate: "2026-11-21" }, downloadIds: [] });
    expect(again.body.taskIds).toHaveLength(1);
    // While it is read, it cannot be moved or removed.
    expect(app.ctx.services.collections.isBusy(kept!.id)).toBe(true);
    await app.ctx.jobs.whenIdle();
    const viaRoads = await app.api("POST", "/api/roads/networks", { regionId: "monaco" });
    expect(viaRoads.body).toMatchObject({ downloadId: null, jobId: expect.any(String) });
    await app.ctx.jobs.whenIdle();
    expect(standIn.requests).toEqual([]);
    const after = (await app.api("GET", "/api/roads/networks")).body.networks;
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(before);

    // Newer than the kept file was asked for: a download.
    const fresher = await app.api("POST", "/api/maps/data/add", {
      regionId: "monaco",
      kinds: ["roads"],
      keep: true,
      newerThan: "2030-01-01",
    });
    expect(fresher.body.countryFile.source).toBe("download");
    answer = await data();
    // Shown as on its way in the rows it is for, with its download to open.
    const coming = rowOf(answer, "roads").find((item: MapDataItem) => item.downloadId === fresher.body.downloadIds[0]);
    expect(coming?.state).toMatch(/waiting|downloading|processing/);
    expect(rowOf(answer, "extract").some((item: MapDataItem) => item.downloadId === fresher.body.downloadIds[0])).toBe(true);
    // By place: Monaco's routes say they are on their way, the one download behind them and the source file.
    const monacoPlace = answer.places?.find((place) => place.key === "country:MC");
    expect(monacoPlace?.bundles.find((bundle) => bundle.kind === "routes")?.state).toMatch(/waiting|downloading|building/);
    expect(monacoPlace?.sourceFile?.state).toBe("ready");
    expect(new Set(monacoPlace?.items.filter((each) => each.downloadId).map((each) => each.downloadId))).toEqual(
      new Set([fresher.body.downloadIds[0]]),
    );
    // A second press for the same region while it comes is refused, not a second download.
    expect(
      (await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["places"], keep: true, newerThan: "2030-01-01" })).status,
    ).toBe(409);
    app.ctx.services.downloads.cancel(fresher.body.downloadIds[0]);
    await app.ctx.jobs.whenIdle();
    await app.ctx.services.downloads.remove(fresher.body.downloadIds[0]);
  });

  it("adds a kind of nearby place without taking away those held: the kinds held are read again with it", async () => {
    const layersOf = async () =>
      ((await app.api("GET", "/api/reference/packs")).body.packs as Array<{ provider: string; request: { layers: string[] } | null }>)
        .filter((pack) => pack.provider === "osm-extract")
        .map((pack) => [...(pack.request?.layers ?? [])].sort());
    const held = (await layersOf())[0]!;
    expect(held).toEqual(expect.arrayContaining(["hospitals", "food"]));
    // Waymarked routes, from Add a place › Nearby places › Which kinds: read from the kept file, nothing downloaded.
    const added = await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["places"], keep: true, layers: ["routes"] });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(added.body.downloadIds).toEqual([]);
    await app.ctx.jobs.whenIdle();
    expect(await layersOf()).toEqual([[...new Set([...held, "routes"])].sort()]);
    // An update names no kinds: the kinds held, not the usual six again.
    await app.api("POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["places"], keep: true });
    await app.ctx.jobs.whenIdle();
    expect(await layersOf()).toEqual([[...new Set([...held, "routes"])].sort()]);
  });

  it("lists road networks and country files in Storage, with sizes and where they are", async () => {
    const items = ((await app.api("GET", "/api/manage/items")).body as ManagedItemsResponse).items;
    const network = items.find((item) => item.kind === "roads")!;
    expect(network).toMatchObject({
      type: "road-network",
      title: "Roads: Monaco",
      locationName: "Outpost's own data",
      origin: "downloaded",
    });
    expect(network.sizeBytes).toBeGreaterThan(0);
    const file = items.find((item) => item.kind === "extract")!;
    expect(file).toMatchObject({ type: "collection", title: "Monaco: source file", sizeBytes: body.length, state: "ok" });
    expect(file.warning).toMatch(/keep working/);
    const usage = (await app.api("GET", "/api/manage/usage")).body as UsageResponse;
    expect(usage.rows.find((row) => row.id === "roads")).toMatchObject({ count: 1, bytes: network.sizeBytes });
    expect(usage.rows.find((row) => row.id === "extract")).toMatchObject({ count: 1, bytes: body.length });
    // A road network is not on a storage location: it is not moved.
    const moved = await app.api("POST", "/api/manage/move", { keys: [network.key], locationId: app.ctx.services.storage.getDefault().id });
    expect(moved.body.refused[0].reason).toMatch(/kept with Outpost's own data/);
  });

  it("repairs a damaged kept file by fetching only the damaged stretch, on a press", async () => {
    const [kept] = app.ctx.services.collections.list({ kind: "extract" });
    const file = app.ctx.services.storage.resolve(kept!.locationId, kept!.relPath);
    // Only a damaged file is repaired.
    expect((await app.api("POST", "/api/maps/data/repair", { collectionId: kept!.id })).status).toBe(400);
    const bytes = fs.readFileSync(file);
    const at = Math.floor(bytes.length * 0.6);
    bytes[at] = bytes[at]! ^ 0xff;
    fs.writeFileSync(file, bytes);
    app.ctx.services.collections.verify(kept!.id);
    await app.ctx.jobs.whenIdle();
    expect(rowOf(await data(), "extract")).toMatchObject([{ state: "damaged" }]);

    standIn.ranges.length = 0;
    standIn.requests.length = 0;
    const started = await app.api("POST", "/api/maps/data/repair", { collectionId: kept!.id });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect(started.body.taskId).toEqual(expect.any(String));
    await app.ctx.jobs.whenIdle();
    const task = app.ctx.jobs.get(started.body.taskId);
    expect(task?.state, task?.error ?? "").toBe("succeeded");
    // One bounded stretch, not the whole file.
    expect(standIn.ranges).toHaveLength(1);
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(standIn.ranges[0]!)!.map(Number);
    expect(start).toBeLessThanOrEqual(at);
    expect(end).toBeGreaterThanOrEqual(at);
    expect(fs.readFileSync(file).equals(body)).toBe(true);
    expect(rowOf(await data(), "extract")).toMatchObject([{ state: "ready" }]);
  });

  it("says when a kept file has gone missing, and removes it only when asked", async () => {
    const [kept] = app.ctx.services.collections.list({ kind: "extract" });
    const file = app.ctx.services.storage.resolve(kept!.locationId, kept!.relPath);
    const saved = fs.readFileSync(file);
    fs.rmSync(file);
    await app.ctx.services.collections.reconcile();
    expect(rowOf(await data(), "extract")).toMatchObject([{ state: "missing", reason: expect.stringMatching(/missing/) }]);
    // A missing kept file is not read: a new download is made instead.
    expect(app.ctx.services.countryFiles.kept("monaco")).toBeNull();
    fs.writeFileSync(file, saved);
    await app.ctx.services.collections.reconcile();

    const removed = await app.api("DELETE", `/api/collections/${kept!.id}?deleteFiles=true`);
    expect(removed.status, JSON.stringify(removed.body)).toBeLessThan(300);
    expect(fs.existsSync(file)).toBe(false);
    // What was made from it keeps working.
    const answer = await data();
    expect(rowOf(answer, "roads")).toMatchObject([{ state: "ready" }]);
    expect(rowOf(answer, "extract")).toEqual([]);
    expect(answer.countries.find((c) => c.country === "MC")!.lastRead).toMatchObject({ kept: false });
  });
});
