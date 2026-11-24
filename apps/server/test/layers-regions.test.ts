/**
 * Food and supplies (and the other OpenStreetMap layers) for a region chosen by name: a US
 * state, a German Land, an English county, from Geofabrik's own list of extracts. A local
 * stand-in serves the list and small extracts in Geofabrik's format
 * (fixtures/layers/geofabrik-stand-in.ts); nothing reaches the internet.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type {
  DownloadDetail,
  NearestResponse,
  ReferenceEstimate,
  ReferenceOverlayResponse,
  ReferencePackDto,
  ReferenceRegionsResponse,
} from "@outpost/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nameFromId, readRegions } from "../src/modules/layers/adapters/geofabrik-regions.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { COLUMBUS, createGeofabrikStandIn, INDIANAPOLIS } from "./fixtures/layers/geofabrik-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("Geofabrik's list as regions", () => {
  const standIn = createGeofabrikStandIn();
  const base = "https://download.geofabrik.de";
  const regions = readRegions(standIn.index(base), base);
  const named = (id: string) => regions.find((region) => region.id === id);

  it("lists each country with its parts under it, and their parts under them", () => {
    expect(regions.filter((region) => region.depth === 0).map((region) => region.name)).toEqual([
      "Germany",
      "Monaco",
      "United Kingdom",
      "United States of America",
    ]);
    expect(regions.map((region) => region.id).slice(0, 4)).toEqual(["germany", "bayern", "oberbayern", "berlin"]);
    expect(named("oberbayern")).toMatchObject({ country: "DE", parent: "bayern", depth: 2 });
    expect(named("cumbria")).toMatchObject({ country: "GB", parent: "england", depth: 2 });
    // Continents, groups of states and Great Britain (the United Kingdom's entry covers it) belong to no country.
    for (const id of ["europe", "north-america", "us-midwest", "great-britain"]) expect(named(id)).toBeUndefined();
  });

  it("finds the United States' states by their codes, and names them from their ids", () => {
    const states = regions.filter((region) => region.parent === "us");
    expect(states.map((region) => region.name)).toEqual(["Indiana", "Kentucky", "New York", "Ohio", "Puerto Rico", "Texas"]);
    expect(named("us/ohio")).toMatchObject({ country: "US", depth: 1 });
    expect(named("us/ohio")!.pbf).toBe(`${base}/north-america/us/ohio-latest.osm.pbf`);
    expect(nameFromId("us/district-of-columbia")).toBe("District of Columbia");
    expect(nameFromId("us/us-virgin-islands")).toBe("US Virgin Islands");
  });

  it("reads the country codes whether Geofabrik gives them as a list or as text (its index of November 2026)", () => {
    const entry = (id: string, parent: string | null, extra: Record<string, unknown>) => ({
      type: "Feature",
      properties: { id, name: id, ...(parent ? { parent } : {}), urls: { pbf: `${base}/x/${id}-latest.osm.pbf` }, ...extra },
    });
    const text = JSON.stringify({
      type: "FeatureCollection",
      features: [
        entry("europe", null, {}),
        entry("united-kingdom", "europe", { "iso3166-1:alpha2": "GB" }),
        entry("england", "united-kingdom", {}),
        entry("israel-and-palestine", "asia", { "iso3166-1:alpha2": "PS,IL" }),
        entry("us", "north-america", { "iso3166-1:alpha2": "US" }),
        entry("us/ohio", "us", { "iso3166-2": "US-OH" }),
      ],
    });
    const read = readRegions(text, base);
    expect(read.find((region) => region.id === "united-kingdom")).toMatchObject({ country: "GB", depth: 0 });
    expect(read.find((region) => region.id === "england")).toMatchObject({ country: "GB", parent: "united-kingdom" });
    expect(read.find((region) => region.id === "israel-and-palestine")).toMatchObject({ country: "PS", depth: 0 });
    expect(read.find((region) => region.id === "us/ohio")).toMatchObject({ country: "US", parent: "us" });
  });

  it("refuses files on any other host", () => {
    const elsewhere = readRegions(standIn.index("https://example.org"), base);
    expect(elsewhere).toEqual([]);
  });
});

describe("a region on a real test server", () => {
  let app: TestApp;
  let server: http.Server;
  const standIn = createGeofabrikStandIn();

  beforeAll(async () => {
    server = http.createServer((request, response) => standIn.handle(request, response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    app = await createTestApp({ OUTPOST_GEOFABRIK_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const packs = async () => (await app.api("GET", "/api/reference/packs")).body.packs as ReferencePackDto[];
  beforeEach(async () => {
    standIn.slow = null;
    for (const pack of await packs()) await app.api("DELETE", `/api/reference/packs/${pack.id}?deleteFiles=1`);
    for (const download of app.ctx.services.downloads.list()) await app.ctx.services.downloads.remove(download.id).catch(() => undefined);
    for (const row of app.ctx.services.collections.list({ kind: "extract" }))
      await app.ctx.services.collections.remove(row.id, { deleteFiles: true });
  });

  const readList = async () => {
    const read = await app.api("POST", "/api/reference/regions", {});
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    return read.body as ReferenceRegionsResponse;
  };

  async function estimate(regions: string[], layers: string[] = ["food"]) {
    const answer = await app.api("POST", "/api/reference/estimate", { provider: "osm-extract", scope: { regions }, layers });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    return answer.body as ReferenceEstimate;
  }

  async function fetchRegions(regions: string[], layers: string[] = ["food"], keepFile?: boolean) {
    const found = await estimate(regions, layers);
    const started = await app.api("POST", "/api/reference/downloads", {
      estimateId: found.estimateId,
      keys: found.items.map((item) => item.key),
      ...(keepFile === undefined ? {} : { keepFile }),
    });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    await app.ctx.jobs.whenIdle();
    return { found, downloads: started.body.downloads as Array<{ id: string }> };
  }

  const view = async (bbox: string, extra = "") =>
    (await app.api("GET", `/api/reference/features?bbox=${bbox}&zoom=12&layers=food,hospitals${extra}`)).body as ReferenceOverlayResponse;
  const OHIO_VIEW = "-83.1,39.9,-82.9,40.05";

  it("asks nothing until the list is read on a press, then keeps it", async () => {
    standIn.requests.length = 0;
    const before = (await app.api("GET", "/api/reference/regions")).body as ReferenceRegionsResponse;
    expect(before).toMatchObject({ held: false, regions: [] });
    const refused = await app.api("POST", "/api/reference/estimate", {
      provider: "osm-extract",
      scope: { regions: ["us/ohio"] },
      layers: ["food"],
    });
    expect(JSON.stringify(refused.body)).toMatch(/Read Geofabrik's list of regions first/);
    expect(standIn.requests).toEqual([]);

    const list = await readList();
    expect(standIn.requests).toEqual(["GET /index-v1-nogeom.json"]);
    expect(list.held).toBe(true);
    expect(list.regions.find((region) => region.id === "us/ohio")).toEqual({
      id: "us/ohio",
      name: "Ohio",
      country: "US",
      parent: "us",
      depth: 1,
    });
    expect(JSON.stringify(list)).not.toMatch(/osm\.pbf/);
    // Kept: asking again (and from another start of the server's list) reads nothing more.
    const again = (await app.api("GET", `/api/reference/regions?lat=${COLUMBUS.lat}&lon=${COLUMBUS.lon}`)).body as ReferenceRegionsResponse;
    expect(again.regions).toHaveLength(list.regions.length);
    expect(again.suggested).toEqual([{ id: "us", why: "The home place's country" }]);
    expect(standIn.requests).toHaveLength(1);
  });

  it("shows the size and what is kept before anything is downloaded", async () => {
    await readList();
    standIn.requests.length = 0;
    const found = await estimate(["us/ohio"], ["food", "hospitals"]);
    const ohio = standIn.files.get("north-america/us/ohio")!;
    expect(found.items).toEqual([
      expect.objectContaining({
        key: "geofabrik:us/ohio:US",
        title: "Ohio, United States of America: nearby places",
        bytes: ohio.body.length,
        exact: true,
        layers: ["food", "hospitals"],
        fileKeptByDefault: false,
      }),
    ]);
    expect(found.items[0]!.basis).toMatch(
      /Read from it: food and supplies and hospitals\. OpenStreetMap only: likely to be fuller in towns/,
    );
    expect(found.databaseBytes).toBeGreaterThan(0);
    expect(found.notes.join(" ")).toMatch(/downloaded responsibly/);
    // A HEAD for the size and the MD5 file: the extract itself is not fetched.
    expect(standIn.requests.filter((line) => line.startsWith("GET") && line.endsWith(".osm.pbf"))).toEqual([]);
    expect(standIn.requests).toContain("GET /north-america/us/ohio-261116.osm.pbf.md5");
  });

  it("reads food from nodes, ways and relations, keeps only the places, and finds the nearest pharmacy", async () => {
    await readList();
    const { downloads } = await fetchRegions(["us/ohio"], ["food", "hospitals"]);
    expect(app.ctx.services.downloads.get(downloads[0]!.id)!.state).toBe("completed");
    const [pack] = await packs();
    expect(pack).toMatchObject({ provider: "osm-extract", countries: ["US"], layers: expect.arrayContaining(["food", "hospitals"]) });
    expect(pack!.notes).toEqual([
      "OpenStreetMap only: likely to be fuller in towns than in the country.",
      expect.stringMatching(/^Only the places were kept: the .+ extract was deleted once read\./),
    ]);
    // The extract is gone; a short record of what it was stands in its place.
    const folder = app.ctx.services.storage.resolve(pack!.locationId, "collections/reference/osm-extract");
    const left = fs.readdirSync(folder);
    expect(left.filter((name) => name.endsWith(".osm.pbf"))).toEqual([]);
    expect(left.filter((name) => name.endsWith(".read.json"))).toHaveLength(1);
    // Its size is the short record and its places in the database, not the extract read and deleted.
    expect(app.ctx.services.collections.get(pack!.id)!.sizeBytes).toBeLessThan(2_000);
    expect(pack!.sizeBytes).toBeGreaterThan(pack!.records * 160);
    expect(pack!.sizeBytes).toBeLessThan(100_000);
    // Its box is the file's own.
    expect(pack!.bbox).not.toBeNull();

    const shown = await view(OHIO_VIEW);
    const byName = (name: string) => shown.points.find((point) => point.name === name);
    // A supermarket mapped only as its building, at the building's middle.
    expect(byName("Made-up Supermarket (test)")).toMatchObject({
      kind: "food:supermarket",
      lat: expect.closeTo(39.965, 4),
      lon: expect.closeTo(-83.005, 4),
    });
    // A market made of two ways in a relation, at its middle.
    expect(byName("Made-up Market (test)")).toMatchObject({
      kind: "food:market",
      lat: expect.closeTo(39.955, 4),
      lon: expect.closeTo(-82.99, 4),
    });
    expect(byName("Made-up Fuel (test)")?.kind).toBe("food:fuel");
    expect(byName("Made-up Hospital (test)")?.layer).toBe("hospitals");
    expect(shown.points.map((point) => point.name)).not.toContain("A restaurant (left out)");
    expect(shown.points.filter((point) => point.kind === "food:water")).toHaveLength(1);

    const nearest = (await app.api("GET", `/api/reference/nearest?lat=${COLUMBUS.lat}&lon=${COLUMBUS.lon}&kind=food:pharmacy&limit=5`))
      .body as NearestResponse;
    expect(nearest.hits[0]).toMatchObject({ name: "High Street Pharmacy (test)", distanceMeters: 111, bearingDegrees: 0 });
    // A layer other than food with no kind gives its nearest few, whatever each is tagged as (Maps' Nearest hospital).
    const hospitals = (await app.api("GET", `/api/reference/nearest?lat=${COLUMBUS.lat}&lon=${COLUMBUS.lon}&layer=hospitals&limit=5&any=1`))
      .body as NearestResponse;
    expect(hospitals.hits.map((hit) => hit.name)).toEqual(["Made-up Hospital (test)"]);
    expect(hospitals.hits[0]!.kind).not.toBe("*");
    const card = (await app.api("GET", `/api/reference/features/${nearest.hits[0]!.id}`)).body.feature;
    expect(card.food).toMatchObject({ openingHours: "Mo-Fr 09:00-19:00" });
    expect(card.source).toMatchObject({
      provider: "osm-extract",
      license: "ODbL 1.0",
      sourceUrl: "https://www.openstreetmap.org/node/1001",
    });

    // The home place's region is offered first now that it is held.
    const offered = (await app.api("GET", `/api/reference/regions?lat=${COLUMBUS.lat}&lon=${COLUMBUS.lon}`))
      .body as ReferenceRegionsResponse;
    expect(offered.suggested[0]).toEqual({ id: "us/ohio", why: "Held already, and holds the home place" });
  });

  it("keeps the extract too when asked, as a country file read again with no download", async () => {
    await readList();
    await fetchRegions(["us/ohio"], ["food"], true);
    const [pack] = await packs();
    expect(pack!.notes).toEqual([
      "OpenStreetMap only: likely to be fuller in towns than in the country.",
      "Read from the country file, which is kept: updating this pack reads it again with no download.",
    ]);
    // The file is a country file of its own; the pack holds only its places.
    const [kept] = app.ctx.services.collections.list({ kind: "extract" });
    expect(kept).toMatchObject({ title: "Ohio: source file", sizeBytes: standIn.files.get("north-america/us/ohio")!.body.length });
    expect(kept!.relPath).toMatch(/^collections\/country-files\/us-ohio-.+\.osm\.pbf$/);
    expect(fs.existsSync(app.ctx.services.storage.resolve(kept!.locationId, kept!.relPath))).toBe(true);

    // Asked again, it is read from the kept file: nothing is asked of Geofabrik.
    standIn.requests.length = 0;
    const again = await estimate(["us/ohio"], ["food", "hospitals"]);
    expect(again.items[0]).toMatchObject({ bytes: 0, host: "" });
    expect(again.items[0]!.basis).toMatch(/^Read from the country file kept on .+: nothing is downloaded\./);
    const started = await app.api("POST", "/api/reference/downloads", { estimateId: again.estimateId, keys: [again.items[0]!.key] });
    expect(started.body).toMatchObject({ downloads: [], tasks: [expect.any(String)] });
    await app.ctx.jobs.whenIdle();
    expect(standIn.requests).toEqual([]);
    const after = await packs();
    expect(after).toHaveLength(1);
    expect(after[0]!.layers).toEqual(expect.arrayContaining(["food", "hospitals"]));
  });

  it("holds two regions at once, each its own pack, a place on the line between them once, and removes one alone", async () => {
    await readList();
    const { found } = await fetchRegions(["us/ohio", "us/indiana"]);
    expect(found.items.map((item) => item.key)).toEqual(["geofabrik:us/ohio:US", "geofabrik:us/indiana:US"]);
    const held = await packs();
    expect(held.map((pack) => pack.title).sort()).toEqual([
      "Indiana, United States of America: nearby places",
      "Ohio, United States of America: nearby places",
    ]);
    // Each updates on its own: its request names only its own region.
    expect(held.map((pack) => pack.request?.scope.regions)).toEqual(expect.arrayContaining([["us/ohio"], ["us/indiana"]]));
    const line = async () => (await view("-85,39.8,-84.6,40")).points.filter((point) => point.name === "State Line Pharmacy (test)");
    expect(await line()).toHaveLength(1);
    expect(held.reduce((sum, pack) => sum + pack.duplicates, 0)).toBe(1);

    const indiana = held.find((pack) => pack.title.includes("Indiana"))!;
    const removed = await app.api("DELETE", `/api/reference/packs/${indiana.id}?deleteFiles=1`);
    expect(removed.status).toBe(200);
    expect((await packs()).map((pack) => pack.title)).toEqual(["Ohio, United States of America: nearby places"]);
    expect(await line()).toHaveLength(1);
    const near = (await app.api("GET", `/api/reference/nearest?lat=${INDIANAPOLIS.lat}&lon=${INDIANAPOLIS.lon}&kind=food:pharmacy`))
      .body as NearestResponse;
    expect(near.hits.map((hit) => hit.name)).not.toContain("Monument Pharmacy (test)");

    // Fetching Ohio again replaces its pack rather than adding a second.
    await fetchRegions(["us/ohio"]);
    expect(await packs()).toHaveLength(1);
  });

  it("refuses a file whose MD5 is not Geofabrik's, and installs nothing", async () => {
    await readList();
    const { downloads } = await fetchRegions(["us/kentucky"]);
    const row = app.ctx.services.downloads.get(downloads[0]!.id)!;
    expect(row.state).toBe("failed");
    // The downloader holds it to the MD5 read with the estimate, shows that, and deletes what fails it.
    expect(row.errorKind).toBe("checksum_mismatch");
    expect(row.error).toMatch(/did not match (its published checksum|the MD5 its publisher gives), twice/);
    const { integrity } = (await app.api("GET", `/api/downloads/${row.id}`)).body as DownloadDetail;
    expect(integrity.md5Expected).toMatch(/^[0-9a-f]{32}$/);
    expect(integrity.md5Actual).toMatch(/^[0-9a-f]{32}$/);
    expect(integrity.verified).toBe(false);
    const folder = app.ctx.services.storage.resolve(row.locationId, "collections/country-files");
    expect(fs.readdirSync(folder).filter((name) => name.startsWith("us-kentucky"))).toEqual([]);
    expect(await packs()).toEqual([]);
  });

  it("refuses a file larger than the free space before fetching it", async () => {
    await readList();
    standIn.requests.length = 0;
    const found = await estimate(["us/texas"]);
    expect(found.items[0]!.bytes).toBe(4e15);
    const started = await app.api("POST", "/api/reference/downloads", { estimateId: found.estimateId, keys: [found.items[0]!.key] });
    expect(started.status).toBe(507);
    expect(JSON.stringify(started.body)).toMatch(/does not have enough free space/);
    expect(standIn.requests.filter((line) => line === "GET /north-america/us/texas-261116.osm.pbf")).toEqual([]);
  });

  it("says plainly when Geofabrik sends a file from a mirror, which is not followed", async () => {
    await readList();
    const answer = await app.api("POST", "/api/reference/estimate", {
      provider: "osm-extract",
      scope: { regions: ["germany"] },
      layers: ["food"],
    });
    expect(answer.status).toBe(400);
    expect(answer.body.error.message).toMatch(/sends Germany's file from another server \(a mirror\).*Choose its parts instead/);
  });

  it("is a download that can be stopped half-way and resumed from where it stopped", async () => {
    await readList();
    standIn.slow = { chunkBytes: 4_096, delayMs: 25 };
    const found = await estimate(["us/ohio"]);
    const started = await app.api("POST", "/api/reference/downloads", { estimateId: found.estimateId, keys: [found.items[0]!.key] });
    const id = started.body.downloads[0].id as string;
    const downloads = app.ctx.services.downloads;
    await waitFor(() => (downloads.toDto(downloads.get(id)!).receivedBytes ?? 0) > 20_000, "a good part of the file");
    const paused = await app.api("POST", `/api/downloads/${id}/pause`);
    expect(paused.body.download.state).toBe("paused");
    await waitFor(() => app.ctx.jobs.get(downloads.get(id)!.jobId!)?.state === "paused", "the job to pause");
    expect(await packs()).toEqual([]);
    standIn.requests.length = 0;
    standIn.slow = null;
    await app.api("POST", `/api/downloads/${id}/resume`);
    await app.ctx.jobs.whenIdle();
    expect(downloads.get(id)!.state).toBe("completed");
    expect(standIn.requests.filter((line) => line.startsWith("GET /north-america/us/ohio"))).toHaveLength(1);
    expect((await packs())[0]!.records).toBeGreaterThan(5);
  });
});
