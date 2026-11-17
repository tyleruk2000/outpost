/**
 * Place names for Great Britain from OS Open Names: the coordinate transformation
 * against Ordnance Survey's own worked example, the converter on a real sample, postcode
 * spellings, ranking, and the download as a job against a stand-in for OS's Downloads API.
 */
import fs from "node:fs";
import path from "node:path";
import { fromOsGrid, type OsNamesCheck, type PlaceSearchResponse, type PlacesDataset, parsePostcode, toOsGrid } from "@outpost/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DownloadRow } from "../src/modules/downloads/types.ts";
import {
  columnIndex,
  englishArea,
  OS_NAMES_HEADER,
  OsNamesConverter,
  opensQuote,
  parseCsvLine,
  statementFromLicence,
} from "../src/modules/maps/os-names/convert.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { createOsNamesStandIn, OS_NAMES_LICENCE_FILE, OS_NAMES_SAMPLE, type OsNamesStandIn } from "./fixtures/maps/os-names-sample.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const DEG = Math.PI / 180;
const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;

/** ETRS89/WGS 84 latitude and longitude of a Cartesian position on GRS80 (the guide's annexe B.2). */
function geodetic(x: number, y: number, z: number): { lat: number; lon: number } {
  const a = 6378137;
  const b = 6356752.314140347;
  const e2 = 1 - (b * b) / (a * a);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 20; i += 1) {
    const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + e2 * nu * Math.sin(lat), p);
  }
  return { lat: lat / DEG, lon: Math.atan2(y, x) / DEG };
}

describe("National Grid to latitude and longitude (OS, A guide to coordinate systems in Great Britain, v3.6)", () => {
  // Annexe D: ETRS89 X 3790644.900, Y -110149.210, Z 5111482.970 is, after the Helmert
  // transformation of section 6.6, OSGB36 53°36′42.2972″N 1°39′46.5416″W, which is
  // E 422297.792, N 412878.741 on the National Grid.
  const etrs89 = geodetic(3790644.9, -110149.21, 5111482.97);

  it("puts OS's worked example on the National Grid where OS does, to within a centimetre", () => {
    const grid = toOsGrid(etrs89.lat, etrs89.lon)!;
    expect(Math.abs(grid.easting - 422297.792)).toBeLessThan(0.01);
    expect(Math.abs(grid.northing - 412878.741)).toBeLessThan(0.01);
  });

  it("brings the grid reference back to the same latitude and longitude, well inside the transformation's 3.5 m", () => {
    const back = fromOsGrid(422297.792, 412878.741)!;
    // The reverse uses the same seven parameters with their signs changed, as OS's
    // guide does; that is an approximation of a few millimetres here.
    expect(Math.abs(back.lat - etrs89.lat) * 111_320).toBeLessThan(0.01);
    expect(Math.abs(back.lon - etrs89.lon) * 111_320 * Math.cos(etrs89.lat * DEG)).toBeLessThan(0.01);
  });

  it("differs from the OSGB36 latitude and longitude by the datum shift, about 100 m, as it should", () => {
    const osgb36 = { lat: dms(53, 36, 42.2972), lon: -dms(1, 39, 46.5416) };
    const shift = Math.hypot((etrs89.lat - osgb36.lat) * 111_320, (etrs89.lon - osgb36.lon) * 111_320 * Math.cos(osgb36.lat * DEG));
    expect(shift).toBeGreaterThan(80);
    expect(shift).toBeLessThan(130);
  });
});

describe("reading OS Open Names", () => {
  const index = columnIndex(OS_NAMES_HEADER)!;
  const convertAll = () => {
    const converter = new OsNamesConverter(index);
    const rows = OS_NAMES_SAMPLE.map((line) => converter.convert(parseCsvLine(line)));
    return { converter, rows: rows.filter((row) => row !== null), all: rows };
  };

  it("reads quoted fields and knows when a record runs on", () => {
    expect(parseCsvLine('a,"Further Education,Secondary Education",,"say ""hi"""')).toEqual([
      "a",
      "Further Education,Secondary Education",
      "",
      'say "hi"',
    ]);
    expect(opensQuote('a,"open')).toBe(true);
    expect(opensQuote('a,"closed ""x"""')).toBe(false);
    expect(columnIndex("NAME1,ID")).toBeNull();
  });

  it("keeps the name, the kind in plain words, the area and the position", () => {
    const { rows, converter } = convertAll();
    expect(converter.counts).toMatchObject({ skipped: 1, postcodes: 19 });
    const find = (name: string, code?: string) => rows.find((row) => row[1] === name && (!code || row[7] === code))!;
    const town = find("Aberystwyth", "os:Town");
    // E 258382, N 281709: OS's position for the centre of the town.
    expect(town).toMatchObject([
      2657782,
      "Aberystwyth",
      "Aberystwyth",
      "",
      expect.any(Number),
      expect.any(Number),
      "P",
      "os:Town",
      "GB",
      "Ceredigion, Wales",
      0,
      null,
    ]);
    const expected = fromOsGrid(258382, 281709)!;
    expect(town[4]).toBe(Math.round(expected.lat * 1e6) / 1e6);
    expect(town[5]).toBe(Math.round(expected.lon * 1e6) / 1e6);
    // Within a few hundred metres of where GeoNames puts the town (52.41548, -4.08292): a
    // different idea of its centre, not an error of a datum.
    expect(Math.hypot((town[4] - 52.41548) * 111_320, (town[5] + 4.08292) * 67_900)).toBeLessThan(300);
    // Welsh first with the English as the other name; the road is placed in its town.
    expect(find("Ffordd Caradog")).toMatchObject({ 3: "Caradog Road", 6: "R", 7: "os:Named Road", 9: "Aberystwyth, Ceredigion, Wales" });
    expect(find("SY23 3BY")).toMatchObject({ 3: "SY233BY", 6: "Z", 7: "os:Postcode" });
    expect(find("Ben Nevis")).toMatchObject({ 3: "Beinn Nibheis", 6: "T", 7: "os:Hill Or Mountain", 9: "Highland, Scotland" });
    expect(find("Myddelton College")).toMatchObject({
      6: "S",
      7: "os:Further Education,Non State Primary Education,Non State Secondary Education",
    });
    // A section of a road, repeated for the settlement it passes through, is left out.
    expect(rows.some((row) => row[1] === "Cefnllan")).toBe(false);
  });

  it("makes one row for each postcode district and sector, at the middle of its postcodes", () => {
    const { converter, rows } = convertAll();
    const areas = converter.areaRows();
    expect(areas.map((row) => row[1]).sort()).toEqual(["LA22", "LA22 9", "PO30", "PO30 4", "SY23", "SY23 1", "SY23 3"]);
    const district = areas.find((row) => row[1] === "SY23")!;
    const units = rows.filter((row) => row[1].startsWith("SY23 "));
    const middle = units.reduce((sum, row) => sum + row[4], 0) / units.length;
    expect(district[4]).toBeCloseTo(middle, 4);
    expect(district).toMatchObject({ 6: "Z", 7: "os:Postcode district", 9: "Aberystwyth, Ceredigion, Wales" });
    expect(areas.find((row) => row[1] === "SY23 3")).toMatchObject({ 3: "SY233", 7: "os:Postcode sector" });
  });

  it("keeps the English of a Welsh and English pair, and reads OS's own attribution statement", () => {
    expect(englishArea("Sir Ceredigion - Ceredigion")).toBe("Ceredigion");
    expect(englishArea("Gwynedd - Gwynedd")).toBe("Gwynedd");
    expect(englishArea("Highland")).toBe("Highland");
    expect(statementFromLicence(OS_NAMES_LICENCE_FILE.toString("latin1"))).toBe(
      "Contains OS data © Crown Copyright and database rights 2026",
    );
    expect(statementFromLicence("Contains OS data © someone else 2026")).toBeNull();
  });
});

describe("postcodes as people type them", () => {
  it.each([
    ["SY23 3BY", "SY23 3BY", "unit"],
    ["sy233by", "SY23 3BY", "unit"],
    ["  Sy23   3by ", "SY23 3BY", "unit"],
    ["SW1A1AA", "SW1A 1AA", "unit"],
    ["e1 6an", "E1 6AN", "unit"],
    ["SY23 3B", "SY23 3B", "partial-unit"],
    ["sy233b", "SY23 3B", "partial-unit"],
    ["SY23 3", "SY23 3", "sector"],
    ["sy233", "SY23 3", "sector"],
    ["sy23", "SY23", "district"],
    ["BT1", "BT1", "district"],
  ])("reads %j as %s", (typed, canonical, part) => {
    expect(parsePostcode(typed)).toMatchObject({ canonical, part });
  });

  it.each(["A487", "Aberystwyth", "SY", "SY23 3BYX", "QQ1 1AA", "12345", "NY 215 072"])("does not read %j as a postcode", (typed) => {
    expect(parsePostcode(typed)).toBeNull();
  });
});

let app: TestApp | undefined;
let standIn: OsNamesStandIn | undefined;
async function stop() {
  await app?.close();
  await standIn?.close();
  app = undefined;
  standIn = undefined;
}

async function start(options: { edition?: string } = {}) {
  standIn = createOsNamesStandIn(undefined, options);
  await standIn.listen();
  app = await createTestApp({ OUTPOST_OS_DOWNLOADS_URL: standIn.base });
  return app;
}

async function settled(id: string): Promise<DownloadRow> {
  return waitFor(
    () => {
      const row = app!.ctx.services.downloads.get(id);
      return row && ["completed", "failed", "cancelled"].includes(row.state) ? row : undefined;
    },
    "the download to finish",
    20_000,
  );
}

async function installSample(): Promise<DownloadRow> {
  const check = await app!.api<OsNamesCheck>("POST", "/api/maps/places/os-names/check");
  expect(check.status).toBe(200);
  const started = await app!.api("POST", "/api/maps/places/os-names", {});
  expect(started.status).toBe(200);
  return settled(started.body.download.id);
}

const search = async (q: string, near?: string) =>
  (await app!.api<PlaceSearchResponse>("GET", `/api/maps/places?q=${encodeURIComponent(q)}${near ? `&near=${near}` : ""}`)).body;

describe("downloading OS Open Names", () => {
  afterEach(stop);

  it("asks for the size first, downloads it as a job from the host named, and installs it", async () => {
    await start();
    // Nothing is asked of OS until the check is pressed, and a download needs one.
    const early = await app!.api("POST", "/api/maps/places/os-names", {});
    expect(early.status).toBe(409);
    expect(standIn!.requests).toEqual([]);

    const check = await app!.api<OsNamesCheck>("POST", "/api/maps/places/os-names/check");
    expect(check.body).toMatchObject({
      edition: "2026-10",
      editionLabel: "October 2026",
      sizeBytes: standIn!.zip.length,
      fileName: "opname_csv_gb.zip",
      host: "127.0.0.1",
      installed: null,
      updateAvailable: false,
    });
    const started = await app!.api("POST", "/api/maps/places/os-names", {});
    expect(started.body.download).toMatchObject({ kind: "places", title: "Place names for Great Britain (OS Open Names, October 2026)" });
    const row = await settled(started.body.download.id);
    expect(row).toMatchObject({ state: "completed", error: null, relPath: "collections/places/os-open-names-2026-10.zip" });
    // The download went through the API's redirect to the file.
    expect(standIn!.requests.some((line) => line.startsWith("GET /os-files/OpenNames/2026-10/opname_csv_gb.zip"))).toBe(true);

    const collection = app!.ctx.services.collections.get(row.collectionId!)!;
    expect(collection).toMatchObject({
      kind: "places",
      publisher: "Ordnance Survey",
      license: "Open Government Licence v3.0",
      attribution: "Contains OS data © Crown Copyright and database rights 2026",
      version: "2026-10",
    });
    expect(fs.existsSync(path.join(app!.ctx.services.storage.getDefault().path, row.relPath))).toBe(true);

    const { places } = (await app!.api<{ places: PlacesDataset[] }>("GET", "/api/maps/overview")).body;
    // 43 records kept of 44, and seven postcode districts and sectors.
    expect(places).toEqual([
      expect.objectContaining({ source: "os", dataset: "os-open-names", edition: "2026-10", roads: true, count: 50, available: true }),
    ]);

    // The map credits OS exactly as the edition's own licence file says, with the licence.
    const sources = (await app!.api("GET", "/api/maps/sources")).body;
    expect(sources.attribution).toContain("Contains OS data © Crown Copyright and database rights 2026");
    expect(sources.attribution).toContain("open-government-licence");
    expect(sources.attribution).not.toContain("GeoNames");

    // Checking again says what is held.
    const again = await app!.api<OsNamesCheck>("POST", "/api/maps/places/os-names/check");
    expect(again.body).toMatchObject({ installed: { edition: "2026-10", editionLabel: "October 2026" }, updateAvailable: false });
    expect((await app!.api("POST", "/api/maps/places/os-names", {})).status).toBe(409);
  });

  it("can leave streets out", async () => {
    await start();
    await app!.api("POST", "/api/maps/places/os-names/check");
    const started = await app!.api("POST", "/api/maps/places/os-names", { roads: false });
    const row = await settled(started.body.download.id);
    expect(row.state).toBe("completed");
    expect((await search("Ffordd Caradog")).places).toEqual([]);
    expect((await search("Aberystwyth")).places[0]).toMatchObject({ kindLabel: "Town" });
  });

  it("continues a download that was cut off from where it stopped", async () => {
    await start();
    standIn!.cutAfter = 2_000;
    const row = await installSample();
    expect(row.state).toBe("completed");
    expect(row.attempts).toBe(2);
    // The second attempt asked the API again (a fresh redirect) and asked for the rest.
    const fileRequests = standIn!.requests.filter((line) => line.includes("/os-files/"));
    expect(fileRequests).toHaveLength(2);
    expect(fileRequests[1]).toMatch(/bytes=2000-$/);
    expect((await search("sy233by")).places[0]).toMatchObject({ name: "SY23 3BY" });
  });

  it("fails plainly when the file cannot be had, or does not match OS's checksum, and installs nothing", async () => {
    await start();
    standIn!.failFileWith = 404;
    const missing = await installSample();
    expect(missing.state).toBe("failed");
    expect(missing.error).toMatch(/no longer at this address/);

    standIn!.failFileWith = null;
    standIn!.wrongMd5 = true;
    await app!.api("DELETE", `/api/downloads/${missing.id}`);
    const tampered = await installSample();
    expect(tampered.state).toBe("failed");
    expect(tampered.error).toMatch(/does not match the checksum Ordnance Survey publishes/);
    expect(app!.ctx.services.collections.list({ kind: "places" })).toEqual([]);
    expect((app!.ctx.sqlite.prepare("SELECT count(*) AS n FROM places").get() as { n: number }).n).toBe(0);
  });

  it("replaces the edition held with a newer one, whole, and removes it with one press", async () => {
    await start();
    const first = await installSample();
    standIn!.edition = "2027-01";
    const check = await app!.api<OsNamesCheck>("POST", "/api/maps/places/os-names/check");
    expect(check.body).toMatchObject({ edition: "2027-01", installed: { edition: "2026-10" }, updateAvailable: true });
    const second = await installSample();
    expect(second.state).toBe("completed");
    const held = app!.ctx.services.collections.list({ kind: "places" });
    expect(held.map((row) => row.version)).toEqual(["2027-01"]);
    // The older edition's file and rows went with it.
    expect(fs.existsSync(path.join(app!.ctx.services.storage.getDefault().path, first.relPath))).toBe(false);
    const rows = app!.ctx.sqlite.prepare("SELECT DISTINCT collection_id AS id FROM places").all() as Array<{ id: string }>;
    expect(rows).toEqual([{ id: held[0]!.id }]);

    expect((await app!.api("DELETE", `/api/maps/places/datasets/${held[0]!.id}`)).status).toBe(200);
    expect((app!.ctx.sqlite.prepare("SELECT count(*) AS n FROM places").get() as { n: number }).n).toBe(0);
    expect(fs.existsSync(path.join(app!.ctx.services.storage.getDefault().path, second.relPath))).toBe(false);
  });
});

describe("searching OS Open Names", () => {
  beforeAll(async () => {
    await start();
    await installSample();
  });
  afterAll(stop);

  // Places in the sample, as latitude,longitude, to search from.
  const LEWISHAM = "51.45,-0.02";
  const ABERYSTWYTH = "52.414,-4.084";
  const TELFORD = "52.77,-2.38";
  const COWES = "50.76,-1.30";
  const AMBLESIDE = "54.43,-2.96";

  it.each([
    // Exact before partial: the town of Ambleside before anything that only starts with it.
    ["Ambleside", AMBLESIDE, "Ambleside", "Town"],
    // A settlement before a street of the same name, even one a mile away.
    ["Ambleside", LEWISHAM, "Ambleside", "Town"],
    // A hill before a road named after it, two hundred miles nearer.
    ["Scafell Pike", "51.6,-1.24", "Scafell Pike", "Hill or mountain"],
    // Nearer the middle of the map before further, among settlements of the same name.
    ["Newport", TELFORD, "Newport", "Town"],
    ["Newport", COWES, "Newport", "Town"],
    // The village before the lake of the same name, and both before the road in Spennymoor.
    ["Grasmere", AMBLESIDE, "Grasmere", "Village"],
    // Postcodes, as they are typed.
    ["SY23 3BY", ABERYSTWYTH, "SY23 3BY", "Postcode"],
    ["sy233by", undefined, "SY23 3BY", "Postcode"],
    ["Sy23 3by", undefined, "SY23 3BY", "Postcode"],
    // A partial postcode offers the area.
    ["SY23", undefined, "SY23", "Postcode district"],
    ["sy23 3", undefined, "SY23 3", "Postcode sector"],
    // The other name of a place finds it.
    ["Beinn Nibheis", undefined, "Ben Nevis", "Hill or mountain"],
    ["Caradog Road", ABERYSTWYTH, "Ffordd Caradog", "Street or road"],
  ])("%s near %s: %s (%s) first", async (query, near, name, kind) => {
    const response = await search(query, near);
    expect(response.places[0], JSON.stringify(response.places.slice(0, 3))).toMatchObject({ name, kindLabel: kind, source: "os" });
    expect(response.credits).toEqual(["Contains OS data © Crown Copyright and database rights 2026"]);
  });

  it("says where each one is and what it is", async () => {
    const newport = (await search("Newport", COWES)).places;
    expect(newport[0]).toMatchObject({ admin1: "Isle of Wight, England" });
    expect(newport.map((place) => place.kindLabel)).toEqual(["Town", "Town", "Village", "Village"]);
    // A grid reference that is also a postcode district is offered as both.
    const sy23 = await search("SY23");
    expect(sy23.coordinate).toMatchObject({ format: "osgb" });
    expect(sy23.places[0]).toMatchObject({ name: "SY23", admin1: "Aberystwyth, Ceredigion, Wales" });
    // A unit postcode lists after its district and sector.
    expect((await search("SY23 3")).places.map((place) => place.name)).toEqual(expect.arrayContaining(["SY23 3", "SY23 3BY"]));
  });

  it("says that Northern Ireland is not covered", async () => {
    const belfast = await search("BT1 1AA");
    expect(belfast.places).toEqual([]);
    expect(belfast.notice).toMatch(/Northern Ireland/);
    expect((await search("Aberystwyth")).notice).toBeUndefined();
  });

  it("does not take a road number for a postcode", async () => {
    expect((await search("A487")).notice).toBeUndefined();
  });
});
