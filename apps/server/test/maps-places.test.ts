import fs from "node:fs";
import path from "node:path";
import type { PlaceSearchResponse } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DownloadRow, InstallContext } from "../src/modules/downloads/types.ts";
import { createPlacesService, keepsFeature, kindLabelOf, searchTokens } from "../src/modules/maps/places.ts";
import { type ByteServer, serveBytes } from "./fixtures/maps/archive.ts";
import { buildZip, geonamesLine } from "./fixtures/maps/zip.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

/** A miniature GeoNames dump: real places, real coordinates, a few rows that must be skipped. */
const PLACES = [
  {
    id: 2643743,
    name: "London",
    alternates: "Londres,Londra,Лондон,LON",
    lat: 51.50853,
    lon: -0.12574,
    featureClass: "P",
    featureCode: "PPLC",
    country: "GB",
    admin1: "ENG",
    population: 8961989,
    dem: 25,
  },
  {
    id: 6058560,
    name: "London",
    alternates: "London Ontario",
    lat: 42.98339,
    lon: -81.23304,
    featureClass: "P",
    featureCode: "PPL",
    country: "CA",
    admin1: "08",
    population: 346765,
    dem: 252,
  },
  {
    id: 2641598,
    name: "Newport",
    alternates: "Casnewydd",
    lat: 51.58774,
    lon: -2.99835,
    featureClass: "P",
    featureCode: "PPLA2",
    country: "GB",
    admin1: "WLS",
    population: 145700,
  },
  {
    id: 2641599,
    name: "Newport",
    alternates: "",
    lat: 50.70117,
    lon: -1.29138,
    featureClass: "P",
    featureCode: "PPL",
    country: "GB",
    admin1: "ENG",
    population: 25496,
  },
  {
    id: 2641589,
    name: "Newport Pagnell",
    lat: 52.08731,
    lon: -0.72218,
    featureClass: "P",
    featureCode: "PPL",
    country: "GB",
    admin1: "ENG",
    population: 15118,
  },
  {
    id: 2657215,
    name: "Ambleside",
    lat: 54.42869,
    lon: -2.9613,
    featureClass: "P",
    featureCode: "PPL",
    country: "GB",
    admin1: "ENG",
    population: 2600,
  },
  {
    id: 2657216,
    name: "Amble",
    lat: 55.33333,
    lon: -1.58333,
    featureClass: "P",
    featureCode: "PPL",
    country: "GB",
    admin1: "ENG",
    population: 6025,
  },
  {
    id: 2657896,
    name: "Zürich",
    ascii: "Zurich",
    alternates: "Zurigo,Zuerich,Zurych",
    lat: 47.36667,
    lon: 8.55,
    featureClass: "P",
    featureCode: "PPLA",
    country: "CH",
    admin1: "ZH",
    population: 341730,
    elevation: 408,
  },
  {
    id: 2514256,
    name: "Málaga",
    ascii: "Malaga",
    alternates: "Malaga,Màlaga",
    lat: 36.72016,
    lon: -4.42034,
    featureClass: "P",
    featureCode: "PPLA2",
    country: "ES",
    admin1: "51",
    population: 568305,
  },
  {
    id: 3093133,
    name: "Łódź",
    ascii: "Lodz",
    alternates: "Lodsch,Łódź",
    lat: 51.77058,
    lon: 19.47395,
    featureClass: "P",
    featureCode: "PPLA",
    country: "PL",
    admin1: "74",
    population: 768755,
  },
  {
    id: 2653822,
    name: "Cardiff",
    alternates: "Caerdydd,Kardif",
    lat: 51.48,
    lon: -3.18,
    featureClass: "P",
    featureCode: "PPLC2",
    country: "GB",
    admin1: "WLS",
    population: 447287,
  },
  {
    id: 2638360,
    name: "Scafell Pike",
    lat: 54.45424,
    lon: -3.21154,
    featureClass: "T",
    featureCode: "MT",
    country: "GB",
    admin1: "ENG",
    elevation: 978,
  },
  {
    id: 2633765,
    name: "Windermere",
    lat: 54.35,
    lon: -2.93333,
    featureClass: "H",
    featureCode: "LK",
    country: "GB",
    admin1: "ENG",
    dem: 39,
  },
  {
    id: 2633766,
    name: "Windermere",
    lat: 54.38086,
    lon: -2.90679,
    featureClass: "P",
    featureCode: "PPL",
    country: "GB",
    admin1: "ENG",
    population: 8245,
  },
  { id: 9000001, name: "Black Sail Hut", lat: 54.4973, lon: -3.2466, featureClass: "S", featureCode: "HUT", country: "GB", admin1: "ENG" },
  {
    id: 9000002,
    name: "Lake District National Park",
    lat: 54.5,
    lon: -3.1,
    featureClass: "L",
    featureCode: "PRK",
    country: "GB",
    admin1: "ENG",
  },
  {
    id: 2634895,
    name: "Wales",
    alternates: "Cymru,Pays de Galles",
    lat: 52.5,
    lon: -3.5,
    featureClass: "A",
    featureCode: "ADM1",
    country: "GB",
    admin1: "WLS",
    population: 3152879,
  },
  // Rows the importer must leave out:
  { id: 9000003, name: "Low Farm", lat: 54.4, lon: -3.0, featureClass: "S", featureCode: "FRM", country: "GB" },
  { id: 9000004, name: "Section of Stream", lat: 54.4, lon: -3.0, featureClass: "H", featureCode: "STMX", country: "GB" },
  { id: 9000005, name: "Lost Village", lat: 54.4, lon: -3.0, featureClass: "P", featureCode: "PPLQ", country: "GB" },
  { id: 9000006, name: "Parish Council Area", lat: 54.4, lon: -3.0, featureClass: "A", featureCode: "ADM4", country: "GB" },
  { id: 9000007, name: "Undersea Ridge", lat: 54.4, lon: -3.0, featureClass: "U", featureCode: "RDGU", country: "" },
  { id: 9000008, name: "Nowhere", lat: 154.4, lon: -3.0, featureClass: "P", featureCode: "PPL", country: "GB" },
];
const KEPT = 17;

function datasetZip(name = "cities500"): Buffer {
  const lines = [...PLACES.map(geonamesLine), "this line\tis not\ta place", ""];
  return buildZip([
    { name: "readme.txt", content: "Readme for GeoNames Gazetteer extract files\n".repeat(400) },
    { name: `${name}.txt`, content: lines.join("\n") },
  ]);
}

let app: TestApp;
let server: ByteServer | undefined;

beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
  await server?.close();
  server = undefined;
});

const maps = () => app.ctx.services.maps;
const countRows = (collectionId?: string) =>
  (
    app.ctx.sqlite
      .prepare(`SELECT count(*) AS n FROM places ${collectionId ? "WHERE collection_id = ?" : ""}`)
      .get(...(collectionId ? [collectionId] : [])) as { n: number }
  ).n;

/** Runs the installer directly on a zip placed in the storage location, as the download manager would. */
async function install(dataset = "cities500", signal: AbortSignal = new AbortController().signal) {
  const location = app.ctx.services.storage.getDefault();
  const relPath = `collections/places/${dataset}.zip`;
  const filePath = path.join(location.path, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const zip = datasetZip(dataset);
  fs.writeFileSync(filePath, zip);
  const progress: Array<[number, number | null | undefined, string | undefined]> = [];
  const context: InstallContext = {
    download: {
      id: `download-${dataset}`,
      kind: "places",
      title: `Place names: ${dataset}`,
      locationId: location.id,
      relPath,
      catalogEntryId: null,
      meta: { dataset },
    } as unknown as DownloadRow,
    filePath,
    sizeBytes: zip.length,
    sha256: "a".repeat(64),
    signal,
    progress: (current, total, message) => progress.push([current, total, message]),
  };
  const result = await maps().places.installer(context);
  return { collectionId: result!.collectionId!, progress, filePath };
}

const search = async (q: string, extra = "") =>
  (await app.api<PlaceSearchResponse>("GET", `/api/maps/places?q=${encodeURIComponent(q)}${extra}`)).body;

describe("choosing which GeoNames features to keep", () => {
  it("keeps what a map search wants and drops the clutter", () => {
    const kept: Array<[string, string]> = [
      ["P", "PPL"],
      ["P", "PPLC"],
      ["P", "PPLX"],
      ["T", "MT"],
      ["T", "PK"],
      ["T", "PASS"],
      ["T", "ISL"],
      ["H", "LK"],
      ["H", "STM"],
      ["H", "BAY"],
      ["L", "PRK"],
      ["S", "HUT"],
      ["S", "RSTN"],
      ["S", "AIRP"],
      ["S", "CSTL"],
      ["A", "PCLI"],
      ["A", "ADM1"],
      ["V", "FRST"],
    ];
    const dropped: Array<[string, string]> = [
      ["P", "PPLQ"],
      ["P", "PPLW"],
      ["P", "PPLH"],
      ["H", "STMX"],
      ["H", "WLL"],
      ["S", "FRM"],
      ["S", "HTL"],
      ["S", "SCH"],
      ["A", "ADM4"],
      ["U", "RDGU"],
      ["R", "RD"],
      ["", ""],
    ];
    for (const [featureClass, code] of kept) expect(keepsFeature(featureClass, code), `${featureClass}.${code}`).toBe(true);
    for (const [featureClass, code] of dropped) expect(keepsFeature(featureClass, code), `${featureClass}.${code}`).toBe(false);
  });

  it("describes features in plain words", () => {
    expect(kindLabelOf("P", "PPLC", 8_000_000)).toBe("Capital city");
    expect(kindLabelOf("P", "PPL", 300_000)).toBe("City");
    expect(kindLabelOf("P", "PPL", 20_000)).toBe("Town");
    expect(kindLabelOf("P", "PPL", 900)).toBe("Village");
    expect(kindLabelOf("P", "PPL", 0)).toBe("Place");
    expect(kindLabelOf("T", "MT", 0)).toBe("Mountain");
    // Codes a damaged file could hold are not looked up in what every object inherits.
    expect(kindLabelOf("T", "constructor", 0)).toBe("Landform");
    expect(kindLabelOf("constructor", null, 0)).toBe("Place");
    expect(kindLabelOf("H", "LK", 0)).toBe("Lake");
    expect(kindLabelOf("S", "HUT", 0)).toBe("Hut");
    expect(kindLabelOf("T", "XYZ", 0)).toBe("Landform");
    expect(kindLabelOf(null, null, 0)).toBe("Place");
  });

  it("splits a query into words the index understands", () => {
    expect(searchTokens(`St. John's-in-the-Vale "quoted" (x) *`)).toEqual(["St", "John", "s", "in", "the", "Vale", "quoted", "x"]);
    expect(searchTokens("  ")).toEqual([]);
  });
});

describe("installing a places dataset", () => {
  it("imports the kept rows and records the dataset as a collection", async () => {
    const { collectionId, progress, filePath } = await install();
    const collection = app.ctx.services.collections.get(collectionId)!;
    expect(collection).toMatchObject({
      kind: "places",
      title: "Place names: cities500",
      relPath: "collections/places/cities500.zip",
      license: "CC BY 4.0",
      publisher: "GeoNames",
    });
    expect(collection.attribution).toContain("geonames.org");
    expect(collection.meta).toEqual({ places: { countries: ["CA", "CH", "ES", "GB", "PL"], count: KEPT }, dataset: "cities500" });
    expect(countRows(collectionId)).toBe(KEPT);
    expect(countRows()).toBe(KEPT);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(progress.at(-1)![2]).toBe(`Indexing place names (${KEPT})`);
    expect(progress.at(-1)![0]).toBeGreaterThan(1000);

    const names = (app.ctx.sqlite.prepare("SELECT name FROM places").all() as Array<{ name: string }>).map((row) => row.name);
    for (const skipped of ["Low Farm", "Section of Stream", "Lost Village", "Parish Council Area", "Undersea Ridge", "Nowhere"])
      expect(names).not.toContain(skipped);
    const pike = app.ctx.sqlite.prepare("SELECT * FROM places WHERE name = 'Scafell Pike'").get() as Record<string, unknown>;
    expect(pike).toMatchObject({
      geoname_id: 2638360,
      feature_class: "T",
      feature_code: "MT",
      country: "GB",
      admin1: "ENG",
      elevation: 978,
      population: 0,
      lat: 54.45424,
      lon: -3.21154,
    });
    // The plain spelling is added to the alternates, and the model elevation stands in when there is no surveyed one.
    expect(app.ctx.sqlite.prepare("SELECT alt_names AS alt, elevation FROM places WHERE name = 'Łódź'").get()).toEqual({
      alt: "Lodz,Lodsch,Łódź",
      elevation: null,
    });
    expect(
      (app.ctx.sqlite.prepare("SELECT elevation FROM places WHERE name = 'London' AND country = 'GB'").get() as { elevation: number })
        .elevation,
    ).toBe(25);

    const overview = (await app.api("GET", "/api/maps/overview")).body;
    expect(overview.places).toEqual([
      expect.objectContaining({ id: collectionId, dataset: "cities500", count: KEPT, countries: ["CA", "CH", "ES", "GB", "PL"] }),
    ]);
    expect(overview.counts.places).toBe(KEPT);
    expect((await app.api("GET", "/api/maps/places/datasets")).body.datasets).toHaveLength(1);
    const sources = (await app.api("GET", "/api/maps/sources")).body;
    expect(sources.attributions).toEqual([
      expect.objectContaining({ name: "GeoNames", license: "CC BY 4.0", url: "https://www.geonames.org" }),
    ]);
    expect(sources.attribution).toContain("GeoNames");
  });

  it("downloads through the download manager and installs the result", async () => {
    server = await serveBytes(datasetZip("GB"), { etag: '"geonames"' });
    // The app's own service points at geonames.org; this one, at the local fixture.
    const local = createPlacesService(app.ctx, { baseUrl: server.url.replace("planet.pmtiles", "") });
    const download = await local.startDownload({ dataset: "country", country: "gb" });
    expect(download).toMatchObject({
      kind: "places",
      title: "Place names: GB in detail",
      relPath: "collections/places/GB.zip",
      meta: { dataset: "GB", country: "GB" },
    });
    expect(download.url).toMatch(/\/GB\.zip$/);
    await app.ctx.jobs.whenIdle();
    const finished = app.ctx.services.downloads.get(download.id)!;
    expect(finished).toMatchObject({ state: "completed", error: null });
    expect(app.ctx.services.collections.get(finished.collectionId!)).toMatchObject({ kind: "places", title: "Place names: GB in detail" });
    expect(countRows(finished.collectionId!)).toBe(KEPT);
    expect((await search("ambleside")).places[0]).toMatchObject({ name: "Ambleside" });

    await expect(local.startDownload({ dataset: "country", country: "GB" })).rejects.toThrow(/already installed/);
  });

  it("keeps the download on the storage location that was chosen, and refuses one that is not there", async () => {
    server = await serveBytes(datasetZip("GB"), { etag: '"geonames"' });
    const local = createPlacesService(app.ctx, { baseUrl: server.url.replace("planet.pmtiles", "") });
    const added = await app.api("POST", "/api/storage/locations", {
      name: "Field SSD",
      path: path.join(app.dir, "storage", "ssd"),
      kind: "external",
    });
    expect(added.status).toBe(200);
    const ssd = added.body.location as { id: string; path: string };
    expect(ssd.id).not.toBe(app.ctx.services.storage.getDefault().id);

    const download = await local.startDownload({ dataset: "country", country: "GB", locationId: ssd.id });
    expect(download.locationId).toBe(ssd.id);
    await app.ctx.jobs.whenIdle();
    const finished = app.ctx.services.downloads.get(download.id)!;
    expect(finished).toMatchObject({ state: "completed", error: null });
    // The file is on the chosen drive and nowhere else.
    expect(app.ctx.services.collections.get(finished.collectionId!)).toMatchObject({ kind: "places", locationId: ssd.id });
    expect(fs.existsSync(path.join(ssd.path, "collections/places/GB.zip"))).toBe(true);
    expect(fs.existsSync(path.join(app.ctx.services.storage.getDefault().path, "collections/places/GB.zip"))).toBe(false);

    // Through the API the choice is checked before anything is asked of the internet.
    const nowhere = await app.api("POST", "/api/maps/places/datasets", { dataset: "cities15000", locationId: "no-such-location" });
    expect(nowhere.status).toBe(404);
    const empty = await app.api("POST", "/api/maps/places/datasets", { dataset: "cities15000", locationId: "" });
    expect(empty.status).toBe(400);
    expect(app.ctx.services.downloads.list().filter((row) => row.state !== "completed")).toEqual([]);
  });

  it("validates what is asked for before anything is fetched", async () => {
    for (const [payload, message] of [
      [{ dataset: "everything" }, /dataset/],
      [{ dataset: "country" }, /Say which country/],
      [{ dataset: "country", country: "GBR" }, /two-letter code/],
      [{ dataset: "country", country: "../x" }, /two-letter code/],
      [{}, /dataset/],
    ] as const) {
      const { status, body } = await app.api("POST", "/api/maps/places/datasets", payload);
      expect(status, JSON.stringify(payload)).toBe(400);
      expect(body.error.message).toMatch(message);
    }
    await install("cities500");
    const again = await app.api("POST", "/api/maps/places/datasets", { dataset: "cities500" });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already installed/);
    expect(app.ctx.services.downloads.list()).toEqual([]);
  });

  it("leaves nothing behind when an import is stopped or the file is bad", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    await expect(install("cities15000", controller.signal)).rejects.toThrow("stopped");
    expect(countRows()).toBe(0);
    expect(app.ctx.services.collections.list({ kind: "places" })).toEqual([]);

    const location = app.ctx.services.storage.getDefault();
    const broken = path.join(location.path, "collections/places/broken.zip");
    fs.writeFileSync(broken, "not a zip at all");
    const context = (filePath: string, relPath: string): InstallContext => ({
      download: {
        id: "bad",
        kind: "places",
        title: "Bad",
        locationId: location.id,
        relPath,
        catalogEntryId: null,
        meta: { dataset: "broken" },
      } as unknown as DownloadRow,
      filePath,
      sizeBytes: 1,
      sha256: "b".repeat(64),
      signal: new AbortController().signal,
      progress: () => undefined,
    });
    await expect(maps().places.installer(context(broken, "collections/places/broken.zip"))).rejects.toThrow(/not a readable zip/);

    const empty = path.join(location.path, "collections/places/empty.zip");
    fs.writeFileSync(empty, buildZip([{ name: "empty.txt", content: "nothing\there\n" }]));
    await expect(maps().places.installer(context(empty, "collections/places/empty.zip"))).rejects.toThrow(/no places Outpost could use/);
    const noData = path.join(location.path, "collections/places/nodata.zip");
    fs.writeFileSync(noData, buildZip([{ name: "readme.txt", content: "hello" }]));
    await expect(maps().places.installer(context(noData, "collections/places/nodata.zip"))).rejects.toThrow(/no data file/);
    await expect(
      maps().places.installer({ ...context(empty, "x"), download: { id: "m", meta: {} } as unknown as DownloadRow }),
    ).rejects.toThrow(/missing its details/);
    expect(countRows()).toBe(0);
  });

  it("removes a dataset's rows when its collection is removed, by either route", async () => {
    const first = await install("cities500");
    const second = await install("GB");
    expect(countRows()).toBe(KEPT * 2);

    // Through the collections API, keeping the file.
    const viaCollections = await app.api("DELETE", `/api/collections/${first.collectionId}`, { deleteFiles: false });
    expect(viaCollections.status).toBe(200);
    expect(countRows(first.collectionId)).toBe(0);
    expect(countRows()).toBe(KEPT);
    expect(fs.existsSync(first.filePath)).toBe(true);
    // The full-text index followed: nothing is found twice, nothing is lost.
    expect((await search("london", "&limit=50")).places.map((place) => place.country).sort()).toEqual(["CA", "GB"]);

    // Through the maps API, which removes the zip as well.
    expect((await app.api("DELETE", `/api/maps/places/datasets/${second.collectionId}`)).body).toEqual({ ok: true });
    expect(countRows()).toBe(0);
    expect(fs.existsSync(second.filePath)).toBe(false);
    expect((await search("london")).places).toEqual([]);
    expect((await app.api("DELETE", `/api/maps/places/datasets/${second.collectionId}`)).status).toBe(404);
  });

  it("clears out rows that no dataset owns when the server starts", async () => {
    const { collectionId } = await install();
    app.ctx.sqlite.prepare("UPDATE places SET collection_id = 'pending:crashed' WHERE name = 'Amble'").run();
    const dir = app.dir;
    await app.app.close();
    app = await createTestApp({}, dir);
    expect(countRows()).toBe(KEPT - 1);
    expect(countRows(collectionId)).toBe(KEPT - 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("searching places", () => {
  beforeEach(async () => {
    await install();
  });

  it("ranks by how well the name matches and how big the place is", async () => {
    const london = await search("london");
    expect(london.coordinate).toBeNull();
    expect(london.places.map((place) => `${place.name} ${place.country}`)).toEqual(["London GB", "London CA"]);
    expect(london.places[0]).toEqual({
      id: expect.any(Number),
      source: "geonames",
      name: "London",
      country: "GB",
      admin1: "ENG",
      featureCode: "PPLC",
      kindLabel: "Capital city",
      lat: 51.50853,
      lon: -0.12574,
      population: 8961989,
      elevation: 25,
    });

    // The bigger Newport first; the exact name before the longer one.
    expect((await search("newport")).places.map((place) => [place.name, place.population])).toEqual([
      ["Newport", 145700],
      ["Newport", 25496],
      ["Newport Pagnell", 15118],
    ]);
    // A town and a lake of the same name: the town first, the lake still offered.
    expect((await search("windermere")).places.map((place) => place.kindLabel)).toEqual(["Village", "Lake"]);
  });

  it("matches as you type", async () => {
    expect((await search("ambl")).places.map((place) => place.name)).toEqual(["Amble", "Ambleside"]);
    expect((await search("ambles")).places.map((place) => place.name)).toEqual(["Ambleside"]);
    expect((await search("newport pag")).places.map((place) => place.name)).toEqual(["Newport Pagnell"]);
    expect((await search("scaf pik")).places[0]).toMatchObject({ name: "Scafell Pike", kindLabel: "Mountain", elevation: 978 });
    expect((await search("black sail")).places[0]).toMatchObject({ name: "Black Sail Hut", kindLabel: "Hut" });
    expect((await search("lake district")).places[0]).toMatchObject({ kindLabel: "Park" });
    expect((await search("l")).places.length).toBeGreaterThan(1);
  });

  it("finds places by their other names and without their accents", async () => {
    expect((await search("Londres")).places[0]).toMatchObject({ name: "London", country: "GB" });
    expect((await search("лондон")).places[0]).toMatchObject({ name: "London", country: "GB" });
    expect((await search("Caerdydd")).places[0]).toMatchObject({ name: "Cardiff" });
    expect((await search("cymru")).places[0]).toMatchObject({ name: "Wales", kindLabel: "Region" });
    expect((await search("zurich")).places[0]).toMatchObject({ name: "Zürich" });
    expect((await search("ZÜRICH")).places[0]).toMatchObject({ name: "Zürich" });
    expect((await search("Zuerich")).places[0]).toMatchObject({ name: "Zürich" });
    expect((await search("malaga")).places[0]).toMatchObject({ name: "Málaga" });
    expect((await search("lodz")).places[0]).toMatchObject({ name: "Łódź" });
    expect((await search("Łódź")).places[0]).toMatchObject({ name: "Łódź" });
  });

  it("prefers what is nearby when told where you are", async () => {
    // Standing on the Isle of Wight, "Newport" means the one down the road.
    const near = await search("newport", "&near=50.70,-1.29");
    expect(near.places[0]).toMatchObject({ name: "Newport", population: 25496 });
    // From Ontario, London is the Canadian one.
    expect((await search("london", "&near=43.0,-81.2")).places[0]).toMatchObject({ country: "CA" });
    expect((await search("london", "&near=51.5,-0.1")).places[0]).toMatchObject({ country: "GB" });
    expect((await app.api("GET", "/api/maps/places?q=london&near=here")).status).toBe(400);
  });

  it("limits results, shows a place once, and survives odd input", async () => {
    expect((await search("n", "&limit=2")).places).toHaveLength(2);
    expect((await app.api("GET", "/api/maps/places?q=london&limit=500")).status).toBe(400);

    // The same GeoNames place from two datasets is one result.
    await install("GB");
    expect(countRows()).toBe(KEPT * 2);
    expect((await search("london", "&limit=50")).places).toHaveLength(2);

    for (const query of ['"', "''", "*", "AND OR NOT", "a* OR b", "(", "name:london", "-", "^london", "london NEAR/2 x", "🙂", "%"]) {
      const response = await app.api("GET", `/api/maps/places?q=${encodeURIComponent(query)}`);
      expect(response.status, query).toBe(200);
    }
    expect((await search("")).places).toEqual([]);
    expect((await search("zzzzqqq")).places).toEqual([]);
    expect((await app.api("GET", "/api/maps/places")).body).toEqual({ query: "", coordinate: null, places: [] });
  });

  it("recognises a position typed into the same box", async () => {
    expect(await search("54.4609, -3.0886")).toEqual({
      query: "54.4609, -3.0886",
      coordinate: { lat: 54.4609, lon: -3.0886, format: "decimal" },
      places: [],
    });
    const grid = await search("NY 2154 0721");
    expect(grid.coordinate).toMatchObject({ format: "osgb", precisionMeters: 10 });
    expect(grid.coordinate!.lat).toBeCloseTo(54.4542, 3);
    expect(grid.coordinate!.lon).toBeCloseTo(-3.2116, 3);
    expect((await search(`54°27'39"N 3°05'19"W`)).coordinate).toMatchObject({ format: "dms" });
    expect((await search("geo:47.3667,8.55")).coordinate).toMatchObject({ lat: 47.3667, lon: 8.55, format: "geo" });
    // A name is still a name.
    expect((await search("Wales")).coordinate).toBeNull();
    // A postcode is not a locator: nothing is offered as a position, and its words go to the name search.
    expect(await search("CB1 2AB")).toEqual({ query: "CB1 2AB", coordinate: null, places: [] });
    expect((await search("SW1A 1AA")).coordinate).toBeNull();
    // Written with no space it has the shape of one, so the locator is offered and names are looked for as well.
    expect((await search("CB12AB")).coordinate).toMatchObject({ format: "maidenhead", locator: "CB12AB" });
    expect((await search("IO83 QM")).coordinate).toMatchObject({ format: "maidenhead", locator: "IO83QM" });
  });
});
