/**
 * Map data by place: each country one place whose Map, Routes, Nearby places and Walk/cycle say
 * where they stand in one word; drawn areas and the world's basics apart; a download that feeds
 * two bundles counted once; sets made once (ageless) never "over a year old". And "Where?" for
 * Add a place, answered offline: countries by name, parts once Geofabrik's list is read, the
 * country of a point, several countries from a link.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { MapDataCountry, MapDataItem, MapDataWhereResponse } from "@outpost/shared";
import { isMapItemStale, mapBundleOf, mapPlacesOf } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGeofabrikStandIn } from "./fixtures/layers/geofabrik-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const NOW = Date.parse("2026-11-23T12:00:00Z");

function item(over: Partial<MapDataItem> & Pick<MapDataItem, "key" | "kind">): MapDataItem {
  return {
    title: "France",
    state: "ready",
    sizeBytes: 100,
    locationId: "internal",
    locationName: "Internal storage",
    dataDate: "2026-11-01",
    progress: null,
    reason: null,
    ahead: null,
    count: null,
    layers: [],
    regionId: null,
    collectionId: over.key,
    networkId: null,
    packId: null,
    downloadId: null,
    taskId: null,
    ...over,
  };
}

function country(code: string, name: string, items: MapDataItem[], regionId: string | null = null): MapDataCountry {
  const kinds = ["map", "terrain", "names", "roads", "places", "extract", "streets"] as const;
  return {
    country: code,
    name,
    regionId,
    rows: kinds.map((kind) => ({ kind, items: items.filter((each) => each.kind === kind) })),
    lastRead: null,
  };
}

describe("places from the rows", () => {
  it("makes one place per country with a word for each bundle", () => {
    const download = { current: 43, total: 100, unit: "bytes", message: null, step: null };
    const places = mapPlacesOf(
      {
        countries: [
          country("FR", "France", [
            item({ key: "c:map", kind: "map" }),
            item({ key: "c:terrain", kind: "terrain", title: "France (terrain)" }),
            item({ key: "c:names", kind: "names" }),
            // One download read for routes and kept as the source file: on its way in both, counted once.
            item({ key: "download:d1:roads", kind: "roads", state: "downloading", downloadId: "d1", sizeBytes: 4_900, progress: download }),
            item({
              key: "download:d1:extract",
              kind: "extract",
              state: "downloading",
              downloadId: "d1",
              sizeBytes: 4_900,
              progress: download,
            }),
          ]),
        ],
        world: [item({ key: "w:map", kind: "map", title: "World overview" })],
        other: [
          item({ key: "a:map", kind: "map", title: "Chamonix valley" }),
          item({ key: "a:terrain", kind: "terrain", title: "Chamonix valley (terrain)" }),
          item({ key: "i:1", kind: "imagery", title: "Lake shore" }),
        ],
      },
      { streets: true, now: NOW },
    );
    expect(places.map((place) => [place.type, place.name])).toEqual([
      ["country", "France"],
      ["area", "Chamonix valley"],
      ["area", "Lake shore"],
      ["world", "World basics"],
    ]);
    const france = places[0]!;
    expect(france.bundles.map((bundle) => [bundle.kind, bundle.state])).toEqual([
      ["map", "ready"],
      ["routes", "downloading"],
      ["nearby", "none"],
      ["walk", "none"],
    ]);
    expect(france.bundles[1]!.fraction).toBeCloseTo(0.43);
    expect(france.sourceFile?.downloadId).toBe("d1");
    // On disk: the map, terrain and names; the download is not yet.
    expect(france.sizeBytes).toBe(300);
    expect(places[1]!.bundles.map((bundle) => bundle.kind)).toEqual(["map"]);
    expect(places[1]!.items).toHaveLength(2);
    expect(places[2]!.bundles.map((bundle) => bundle.kind)).toEqual(["imagery"]);
  });

  it("says what is under way before a failed copy of the same thing", () => {
    const bundle = mapBundleOf("routes", [
      item({ key: "download:old", kind: "roads", state: "failed", reason: "A block of the file could not be decompressed." }),
      item({ key: "download:new", kind: "roads", state: "downloading", downloadId: "new" }),
    ]);
    expect(bundle.state).toBe("downloading");
    const failed = mapBundleOf("routes", [item({ key: "x", kind: "roads", state: "failed", reason: "Its file is missing." })]);
    expect(failed).toMatchObject({ state: "failed", reason: "Its file is missing." });
  });

  it("hides a failed download that a later one for the same region made good, and counts its bytes nowhere", () => {
    // The owner's Pi: a first, damaged attempt at the United Kingdom beside the routes and kept file of a second.
    const region = "europe/united-kingdom";
    const failed = { state: "failed" as const, downloadId: "first", regionId: region, reason: "Checksum did not match." };
    const [uk] = mapPlacesOf(
      {
        countries: [
          country(
            "GB",
            "United Kingdom",
            [
              item({ key: "download:first:roads", kind: "roads", sizeBytes: null, ...failed }),
              item({ key: "download:first:extract", kind: "extract", sizeBytes: 2_291_161_370, ...failed }),
              item({ key: "road-network:n1", kind: "roads", sizeBytes: 31_418_680, regionId: region }),
              item({ key: "collection:file", kind: "extract", sizeBytes: 2_291_161_370, regionId: region }),
            ],
            region,
          ),
        ],
        world: [],
        other: [],
      },
      { streets: false, now: NOW },
    );
    const routes = uk!.bundles.find((bundle) => bundle.kind === "routes")!;
    expect(routes).toMatchObject({ state: "ready", sizeBytes: 31_418_680, reason: null });
    expect(uk!.items.map((each) => each.key)).not.toContain("download:first:roads");
    expect(uk!.sourceFile?.key).toBe("collection:file");
    // A failure with nothing to take its place is still said.
    const alone = mapBundleOf("routes", [item({ key: "download:x:roads", kind: "roads", sizeBytes: 900, ...failed })]);
    expect(alone).toMatchObject({ state: "failed", sizeBytes: 0 });
  });

  it("never counts a set made once as over a year old", () => {
    const old = item({ key: "ne", kind: "places", dataDate: "2022-05-13" });
    expect(isMapItemStale(old, NOW)).toBe(true);
    expect(isMapItemStale({ ...old, ageless: true }, NOW)).toBe(false);
    const [world] = mapPlacesOf({ countries: [], world: [{ ...old, ageless: true }], other: [] }, { streets: false, now: NOW });
    expect(world!.stale).toBe(0);
    expect(world!.bundles.find((bundle) => bundle.kind === "nearby")!.dataDate).toBeNull();
  });

  it("names the parts of a country added on their own", () => {
    const [de] = mapPlacesOf(
      {
        countries: [
          country(
            "DE",
            "Germany",
            [
              item({ key: "r:1", kind: "roads", title: "Bayern", regionId: "bayern" }),
              item({ key: "r:2", kind: "roads", title: "Germany", regionId: "germany" }),
            ],
            "germany",
          ),
        ],
        world: [],
        other: [],
      },
      { streets: false, now: NOW },
    );
    expect(de!.parts).toEqual(["Bayern"]);
  });
});

describe("where, offline", () => {
  let app: TestApp;
  let server: http.Server;
  const standIn = createGeofabrikStandIn();
  const where = async (query: string) => {
    const answer = await app.api("GET", `/api/maps/data/where?${query}`);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    return answer.body as MapDataWhereResponse;
  };

  beforeAll(async () => {
    server = http.createServer((request, response) => standIn.handle(request, response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    app = await createTestApp({ OUTPOST_GEOFABRIK_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  });
  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it("finds a country by name and several from a link, asking nothing of anyone", async () => {
    standIn.requests.length = 0;
    const found = await where("q=fran");
    expect(found.regionsListed).toBe(false);
    expect(found.results[0]).toMatchObject({ type: "country", country: "FR", name: "France", regionId: null });
    expect(found.results[0]!.bbox).toHaveLength(4);
    const both = await where("countries=FR,CH");
    expect(both.results.map((result) => result.country)).toEqual(["FR", "CH"]);
    expect(standIn.requests).toEqual([]);
  });

  it("finds a part by its English name before Geofabrik's list is read", async () => {
    standIn.requests.length = 0;
    const found = await where("q=Bavaria");
    expect(found.regionsListed).toBe(false);
    expect(found.results[0]).toMatchObject({
      type: "part",
      name: "Bayern (Bavaria)",
      country: "DE",
      part: { regionId: "bayern", name: "Bayern (Bavaria)" },
    });
    expect((await where("q=catal")).results[0]).toMatchObject({ part: { regionId: "cataluna" } });
    expect(standIn.requests).toEqual([]);
  });

  it("finds the country of a point tapped on the map", async () => {
    const found = await where("lat=48.86&lon=2.35");
    expect(found.results[0]).toMatchObject({ type: "country", country: "FR" });
  });

  it("finds parts once Geofabrik's list is read, with their country", async () => {
    expect((await app.api("POST", "/api/reference/regions")).status).toBe(200);
    const found = await where("q=bayern");
    expect(found.regionsListed).toBe(true);
    expect(found.results).toContainEqual(
      expect.objectContaining({
        type: "part",
        name: "Bayern",
        country: "DE",
        regionId: "germany",
        part: { regionId: "bayern", name: "Bayern" },
      }),
    );
    expect((await where("q=germany")).results[0]).toMatchObject({ type: "country", regionId: "germany" });
    // And by its English name, as Geofabrik's list has it.
    expect((await where("q=bavaria")).results[0]).toMatchObject({
      type: "part",
      name: "Bayern (Bavaria)",
      regionId: "germany",
      part: { regionId: "bayern" },
    });
  });

  it("refuses what is not a place to look for", async () => {
    expect((await app.api("GET", "/api/maps/data/where?countries=France")).status).toBe(400);
  });
});
