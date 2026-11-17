/**
 * The reference layers on a real test server: each adapter's installer against a file in
 * its publisher's format, imports, the map's questions, duplicates, updates that fail
 * part-way, a storage location going away, wrong coordinate systems, and a few hundred
 * thousand features. Nothing here reaches the internet; the Overpass server is a local
 * stand-in declared in the person's own route source file.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { Writable } from "node:stream";
import type { ReferenceFeatureDetail, ReferenceOverlayResponse, ReferencePackDto } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DownloadRow } from "../src/modules/downloads/types.ts";
import { WORLDPOP_CITATION } from "../src/modules/layers/adapters/worldpop.ts";
import { createQueryFetcher } from "../src/modules/layers/query-fetcher.ts";
import type { ReferenceMeta } from "../src/modules/layers/types.ts";
import { buildPbf, buildTiff } from "./fixtures/layers/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
let storageRoot: string;
let locationId: string;

const write = (relPath: string, content: string | Buffer) => {
  const file = path.join(storageRoot, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return relPath;
};

/** Installs a file as if the download manager had fetched it for `meta`. */
async function install(
  relPath: string,
  meta: Partial<ReferenceMeta> & Pick<ReferenceMeta, "provider" | "key">,
  extra: Partial<DownloadRow> = {},
) {
  const reference: ReferenceMeta = {
    title: meta.title ?? `${meta.provider} test`,
    layers: [],
    request: null,
    countries: [],
    bbox: null,
    sourceUrl: null,
    origin: "download",
    ...meta,
  };
  const download = {
    id: `test-${Math.random().toString(36).slice(2)}`,
    kind: "dataset",
    locationId,
    relPath,
    meta: { reference },
    lastModified: "Mon, 16 Nov 2026 02:53:59 GMT",
    ...extra,
  } as unknown as DownloadRow;
  const filePath = path.join(storageRoot, relPath);
  const controller = new AbortController();
  return app.ctx.services.layers.installer({
    download,
    filePath,
    sizeBytes: fs.statSync(filePath).size,
    sha256: "0".repeat(64),
    signal: controller.signal,
    progress: () => {},
  });
}

async function importFile(format: string, relPath: string, options: Record<string, string>, title = `Import ${relPath}`) {
  const started = await app.api("POST", "/api/reference/imports/from-storage", { format, locationId, relPath, title, options });
  expect(started.status).toBe(200);
  await app.ctx.jobs.whenIdle();
  const job = await app.api("GET", `/api/jobs/${started.body.jobId}`);
  return job.body.job ?? job.body;
}

const overlay = async (query: string) => (await app.api("GET", `/api/reference/features?${query}`)).body as ReferenceOverlayResponse;
const packs = async () => (await app.api("GET", "/api/reference/packs")).body.packs as ReferencePackDto[];

beforeAll(async () => {
  app = await createTestApp();
  const location = app.ctx.services.storage.getDefault();
  locationId = location.id;
  storageRoot = app.ctx.services.storage.resolve(locationId, "");
});

afterAll(async () => {
  await app.close();
});

describe("imports a person brings", () => {
  /** A form with its parts in the order given: a field before or after the file. */
  function form(parts: Array<[string, string] | { file: string; content: string }>) {
    const boundary = "----outpost-layers-test";
    const body = parts
      .map((part) =>
        Array.isArray(part)
          ? `--${boundary}\r\nContent-Disposition: form-data; name="${part[0]}"\r\n\r\n${part[1]}\r\n`
          : `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${part.file}"\r\nContent-Type: text/csv\r\n\r\n${part.content}\r\n`,
      )
      .join("");
    return { payload: `${body}--${boundary}--\r\n`, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
  }
  const importsFolder = () => path.join(storageRoot, "collections", "reference", "imports");
  const leftInImports = () => (fs.existsSync(importsFolder()) ? fs.readdirSync(importsFolder()) : []);

  it("leaves nothing on the drive when an uploaded import is refused", async () => {
    const before = leftInImports();
    const csv = { file: "figures.csv", content: "country,indicator,value,source_title,publisher\nIE,x,1,t,p\n" };
    const cases = [
      // Fields first, as the web app sends them: refused before anything is written.
      [["format", "country-figures-csv"], ["title", " "], csv],
      [["format", "no-such-format"], ["title", "Figures"], csv],
      [["format", "country-figures-csv"], ["title", "Figures"], ["options", "{not json"], csv],
      [["format", "country-figures-csv"], ["title", "Figures"], ["options", JSON.stringify({ crs: ["not", "text"] })], csv],
      // Fields after the file: written under a temporary name, and removed.
      [csv, ["format", "no-such-format"], ["title", "Figures"]],
      [csv, ["format", "country-figures-csv"]],
    ] as Array<Array<[string, string] | { file: string; content: string }>>;
    for (const parts of cases) {
      const { payload, headers } = form(parts);
      const response = await app.api("POST", "/api/reference/imports", payload, { headers });
      expect(response.status, JSON.stringify(parts.filter(Array.isArray))).toBe(400);
      expect(leftInImports()).toEqual(before);
    }
    // A good one still goes through, whichever order its parts came in.
    const { payload, headers } = form([csv, ["format", "country-figures-csv"], ["title", "Figures after the file"]]);
    const accepted = await app.api("POST", "/api/reference/imports", payload, { headers });
    expect(accepted.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(leftInImports().filter((name) => !before.includes(name))).toEqual([expect.stringMatching(/-figures\.csv$/)]);
  });

  it("imports places from a CSV in British National Grid coordinates, converting them, and finds them by name on the map and in search", async () => {
    write(
      "imports/shelters.csv",
      [
        "name,x,y,layer,kind,country,provenance,publisher,license,source_url,published,accuracy",
        "Rest centre: Town Hall,530268,179640,shelters,Rest centre,GB,public-record,Example Borough Council,Open Government Licence v3.0,https://example.org/rest-centres,2026-01-10,To the building",
        "Assembly point: Park,531000,180000,shelters,Assembly point,GB,public-record,Example Borough Council,Open Government Licence v3.0,,,To the gate",
        "No licence given,531000,180000,shelters,,GB,public-record,Example Borough Council,,,,To the gate",
        "Not a layer,531000,180000,schools,,GB,public-record,Example Borough Council,OGL,,,To the gate",
      ].join("\n"),
    );
    const job = await importFile("features-csv", "imports/shelters.csv", { crs: "EPSG:27700" }, "Rest centres");
    expect(job.state).toBe("succeeded");
    expect(job.result).toMatchObject({ imported: 2, skipped: 2 });
    expect(job.result.problems.join(" ")).toMatch(/no license/);
    expect(job.result.problems.join(" ")).toMatch(/not a layer/);

    const found = await app.api("GET", "/api/reference/search?q=town%20hall");
    expect(found.body.hits).toHaveLength(1);
    const hit = found.body.hits[0];
    // 530268, 179640 is in Westminster.
    expect(hit.lat).toBeCloseTo(51.5, 1);
    expect(hit.lon).toBeCloseTo(-0.12, 1);
    const detail = (await app.api("GET", `/api/reference/features/${hit.id}`)).body.feature as ReferenceFeatureDetail;
    expect(detail.provenance).toBe("public-infrastructure");
    expect(detail.source).toMatchObject({
      publisher: "Example Borough Council",
      license: "Open Government Licence v3.0",
      publishedAt: "2026-01-10",
    });
    expect(detail.source.accuracy).toMatch(/converted from British National Grid/);

    // The search across everything finds it too, and opens it on the map.
    const everything = await app.api("GET", "/api/search?q=Town%20Hall&mode=keyword");
    const result = (everything.body.results as Array<{ kind: string; url: string }>).find((entry) => entry.kind === "map-feature");
    expect(result?.url).toBe(`/maps?feature=${hit.id}`);

    // With no publisher or licence given for the whole file, the map's credit names the import, not "As stated in the file" twice.
    const layers = await app.api("GET", "/api/reference/layers");
    expect(layers.body.credits).toContainEqual(
      expect.objectContaining({ provider: "import", text: "Rest centres: publisher and licence as stated in the file" }),
    );
  });

  it("imports historical records only with what section 6 requires, keeps the three kinds apart, and links the source document", async () => {
    write(
      "imports/historical.csv",
      [
        "record_id,name,latitude,longitude,location_text,country,period,record_type,document_title,document_publisher,document_date,archive_ref,classification,target_category,evidence_quality,geographic_precision,citations,document_url,library_document_id,publisher,license,notes",
        'T-1,Test city,51.0,0.1,,GB,1959,target-list,"A declassified list (test)",Test archive,1956-06,EBB test,Top Secret (declassified),Urban-industrial,Listed in the document,To the city centre,"p. 12 | p. 13",https://example.org/doc.pdf,,A person transcribing,Public domain (US Government work),',
        'T-2,Test airfield,51.2,0.2,,GB,1959,assessment,"An assessment (test)",Test archive,1960,,,Airfield,Inferred from a map,About 5 km,"p. 3",,missing-document-id,A person transcribing,Public domain (US Government work),',
        'T-3,Speculated site,51.3,0.3,,GB,1980s,speculation,"A book (test)",Test publisher,1985,,,Unknown,The author says so,Unknown,"p. 200",,,A person transcribing,Quoted for reference,',
        "T-4,No kind,51.4,0.4,,GB,1959,,A title,,,,,,Listed,Exact,p. 1,,,A person,PD,",
        'T-5,Unplaced,,,"Somewhere in Kent",GB,1962,assessment,"An assessment (test)",,,,,,Listed,Not located,"p. 9",,,A person,PD,',
      ].join("\n"),
    );
    const job = await importFile("historical-csv", "imports/historical.csv", {}, "Historical test records");
    expect(job.state).toBe("succeeded");
    expect(job.result.imported).toBe(4);
    expect(job.result.problems.join(" ")).toMatch(/Line 5: no record_type/);
    expect(job.result.problems.join(" ")).toMatch(/missing-document-id is not in the library/);

    const view = await overlay("bbox=-1,50,1,52&zoom=8&layers=historical");
    // The unplaced record is not on the map; the speculation is, as unverified.
    expect(view.points.map((point) => [point.name, point.provenance]).sort()).toEqual([
      ["Speculated site", "unverified"],
      ["Test airfield", "historical"],
      ["Test city", "historical"],
    ]);
    const hit = (await app.api("GET", "/api/reference/search?q=Unplaced&layers=historical")).body.hits[0];
    expect(hit.lat).toBeNull();
    const city = (await app.api("GET", `/api/reference/features/${view.points.find((point) => point.name === "Test city")!.id}`)).body
      .feature;
    expect(city.historical).toMatchObject({
      recordType: "target-list",
      period: "1959",
      citations: ["p. 12", "p. 13"],
      documentUrl: "https://example.org/doc.pdf",
    });

    // The database itself refuses a record without its kind.
    expect(() =>
      app.ctx.sqlite
        .prepare(
          "INSERT INTO historical_records (feature_id, record_type, period, document_title, evidence_quality, geographic_precision, citations) VALUES (?, 'guess', '1960', 't', 'q', 'p', '[]')",
        )
        .run(city.id),
    ).toThrow(/CHECK constraint failed/);
  });

  it("imports country figures with their citations, and refuses rows without a source", async () => {
    write(
      "imports/figures.csv",
      [
        "country,indicator,value,unit,year,source_title,publisher,published,url,page,license,notes",
        "GB,Test indicator,225,count,2026,A yearbook (test),A publisher,2026-06,https://example.org/yb,p. 4,Quoted with citation,",
        "FR,Test indicator,290,count,2026,,A publisher,,,,,",
      ].join("\n"),
    );
    const job = await importFile("country-figures-csv", "imports/figures.csv", {}, "Figures");
    expect(job.result).toMatchObject({ imported: 1, skipped: 1 });
    const figures = (await app.api("GET", "/api/reference/figures?country=GB")).body.figures;
    expect(figures).toEqual([expect.objectContaining({ country: "GB", value: 225, sourceTitle: "A yearbook (test)", page: "p. 4" })]);
  });

  it("reads a quoted decimal comma in a country figure as a decimal, and keeps thousands separators", async () => {
    write(
      "imports/figures-decimal.csv",
      [
        "country,indicator,value,unit,year,source_title,publisher",
        'DE,Decimal comma,"1,5",per cent,2026,A yearbook (test),A publisher',
        'DE,Thousands,"1,234,567",people,2026,A yearbook (test),A publisher',
        'DE,Both,"1.234,5",km,2026,A yearbook (test),A publisher',
      ].join("\n"),
    );
    await importFile("country-figures-csv", "imports/figures-decimal.csv", {}, "Decimal figures");
    const figures = (await app.api("GET", "/api/reference/figures?country=DE")).body.figures as Array<{ indicator: string; value: number }>;
    expect(Object.fromEntries(figures.map((figure) => [figure.indicator, figure.value]))).toEqual({
      "Decimal comma": 1.5,
      Thousands: 1234567,
      Both: 1234.5,
    });
  });

  it("imports a planning zone drawn in British National Grid, and finds it from a press inside it", async () => {
    const square = [
      [440000, 160000],
      [450000, 160000],
      [450000, 170000],
      [440000, 170000],
      [440000, 160000],
    ];
    write(
      "imports/zone.geojson",
      JSON.stringify({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::27700" } },
        features: [{ type: "Feature", properties: { name: "Test zone" }, geometry: { type: "Polygon", coordinates: [square] } }],
      }),
    );
    const job = await importFile(
      "geojson",
      "imports/zone.geojson",
      {
        layer: "planning-zones",
        provenance: "public-record",
        publisher: "A council (test)",
        license: "OGL",
        accuracy: "As drawn by the council",
      },
      "Zone",
    );
    expect(job.state).toBe("succeeded");
    const at = await app.api("GET", "/api/reference/at?lat=51.41&lon=-1.3&layers=planning-zones");
    expect(at.body.hits.map((hit: { name: string }) => hit.name)).toEqual(["Test zone"]);
    const view = await overlay("bbox=-2,51,-1,52&zoom=6&layers=planning-zones");
    expect(view.shapes).toHaveLength(1);
  });

  it("refuses files in a coordinate system it cannot convert, or not in degrees at all, rather than misplacing them", async () => {
    write(
      "imports/utm.geojson",
      JSON.stringify({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "EPSG:32633" } },
        features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [500000, 5500000] } }],
      }),
    );
    const options = { layer: "shelters", provenance: "unverified", publisher: "Test", license: "Test", accuracy: "Test" };
    const utm = await importFile("geojson", "imports/utm.geojson", options);
    expect(utm.state).toBe("failed");
    expect(utm.error).toMatch(/EPSG:32633, which Outpost does not convert/);

    write(
      "imports/unsaid.geojson",
      JSON.stringify({
        type: "FeatureCollection",
        features: Array.from({ length: 6 }, (_, i) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [500000 + i, 5500000] },
        })),
      }),
    );
    const unsaid = await importFile("geojson", "imports/unsaid.geojson", options);
    expect(unsaid.state).toBe("failed");
    expect(unsaid.error).toMatch(/not latitude and longitude in degrees/);
  });

  it("gives a template for each CSV form", async () => {
    const response = await app.api("GET", "/api/reference/templates/historical-csv.csv");
    expect(response.status).toBe(200);
    expect(String(response.body)).toMatch(/^record_id,name,latitude,longitude,location_text,country,period,record_type,/);
  });

  it("has no template named after what every object has", async () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty", "constructor.csv"]) {
      const response = await app.api("GET", `/api/reference/templates/${name}`);
      expect(response.status, name).toBe(404);
      expect(response.body.error.message).toMatch(/no template of that name/);
    }
  });
});

describe("downloaded packs", () => {
  it("reads Natural Earth's countries, keeping only those asked for", async () => {
    const country = (name: string, a2: string, a3: string, ring: number[][]) => ({
      type: "Feature",
      properties: {
        NAME: name,
        NAME_EN: name,
        ISO_A2: a2,
        ISO_A2_EH: a2,
        ADM0_A3: a3,
        ISO_A3: a3,
        FORMAL_EN: `${name} (formal)`,
        SOVEREIGNT: name,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    const relPath = write(
      "collections/reference/natural-earth/ne_50m_admin_0_countries-v5.1.2.geojson",
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          country("Luxembourg", "LU", "LUX", [
            [5.73, 49.45],
            [6.5, 49.45],
            [6.5, 50.18],
            [5.73, 50.18],
            [5.73, 49.45],
          ]),
          country("Belgium", "BE", "BEL", [
            [2.5, 49.5],
            [6.4, 49.5],
            [6.4, 51.5],
            [2.5, 51.5],
            [2.5, 49.5],
          ]),
        ],
      }),
    );
    const result = await install(relPath, { provider: "natural-earth", key: "ne-countries", countries: ["LU"], layers: ["boundaries"] });
    expect(result?.collectionId).toBeTruthy();
    const pack = (await packs()).find((entry) => entry.id === result!.collectionId)!;
    expect(pack).toMatchObject({ provider: "natural-earth", records: 1, version: "v5.1.2", license: "Public domain", origin: "download" });
    const at = await app.api("GET", "/api/reference/at?lat=49.8&lon=6.1&layers=boundaries");
    expect(at.body.hits[0].name).toBe("Luxembourg");
  });

  it("reads OurAirports' airports.csv for one country with its own types, and skips rows it cannot place", async () => {
    const header =
      "id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords";
    const relPath = write(
      "collections/reference/ourairports/airports-a.csv",
      [
        header,
        "2443,ELLX,large_airport,Luxembourg-Findel International Airport,49.6233333,6.2044444,1234,EU,LU,LU-L,Luxembourg,yes,ELLX,LUX,ELLX,,,https://en.wikipedia.org/wiki/Luxembourg_Airport,",
        "330432,LU-0001,heliport,Test heliport,49.61,6.13,,EU,LU,LU-L,Luxembourg,no,,,,,,,",
        "330433,LU-0002,small_airport,Bad position,149.61,6.13,,EU,LU,LU-L,,no,,,,,,,",
        "4,EGLL,large_airport,London Heathrow Airport,51.4706,-0.461941,83,EU,GB,GB-ENG,London,yes,EGLL,LHR,EGLL,,,,",
      ].join("\n"),
    );
    const result = await install(relPath, { provider: "ourairports", key: "airports", countries: ["LU"], layers: ["airports"] });
    const pack = (await packs()).find((entry) => entry.id === result!.collectionId)!;
    expect(pack.records).toBe(2);
    expect(pack.publishedAt).toBe("2026-11-16");
    const view = await overlay("bbox=5.7,49.4,6.6,50.2&zoom=9&layers=airports");
    expect(view.points.map((point) => point.kind).sort()).toEqual(["heliport", "large_airport"]);
  });

  it("refuses a file that is not the publisher's format, and an update that fails leaves the installed pack as it was", async () => {
    const good = await packs();
    const before = good.find((entry) => entry.provider === "ourairports")!;
    const relPath = write("collections/reference/ourairports/airports-b.csv", "this,is,not\nan,airports,file\n");
    await expect(install(relPath, { provider: "ourairports", key: "airports", countries: ["LU"], layers: ["airports"] })).rejects.toThrow(
      /not OurAirports' airports.csv/,
    );
    const after = await packs();
    expect(after.find((entry) => entry.id === before.id)).toMatchObject({ records: 2 });
    expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM reference_features WHERE collection_id LIKE 'pending:%'").get()).toEqual({
      n: 0,
    });
  });

  it("replaces a pack whole when its update is in, deleting the old downloaded file", async () => {
    const before = (await packs()).find((entry) => entry.provider === "ourairports")!;
    const oldFile = path.join(storageRoot, "collections/reference/ourairports/airports-a.csv");
    const relPath = write(
      "collections/reference/ourairports/airports-c.csv",
      [
        "id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords",
        "2443,ELLX,large_airport,Luxembourg Airport,49.6233333,6.2044444,1234,EU,LU,LU-L,Luxembourg,yes,ELLX,LUX,ELLX,,,,",
      ].join("\n"),
    );
    const result = await install(relPath, { provider: "ourairports", key: "airports", countries: ["LU"], layers: ["airports"] });
    const now = (await packs()).filter((entry) => entry.provider === "ourairports");
    expect(now.map((entry) => entry.id)).toEqual([result!.collectionId]);
    expect(now[0]!.records).toBe(1);
    expect(before.id).not.toBe(result!.collectionId);
    expect(fs.existsSync(oldFile)).toBe(false);
  });

  it("reads an Overpass answer and a Wikidata answer, and draws a power station described by both once, keeping both sources", async () => {
    const overpass = write(
      "collections/reference/osm/nuclear-fr.json",
      JSON.stringify({
        version: 0.6,
        osm3s: { timestamp_osm_base: "2026-11-16T10:00:00Z" },
        elements: [
          {
            type: "way",
            id: 4242,
            bounds: { minlat: 49.4, minlon: 6.21, maxlat: 49.42, maxlon: 6.23 },
            geometry: [
              { lat: 49.4, lon: 6.21 },
              { lat: 49.4, lon: 6.23 },
              { lat: 49.42, lon: 6.23 },
              { lat: 49.42, lon: 6.21 },
              { lat: 49.4, lon: 6.21 },
            ],
            tags: {
              power: "plant",
              "plant:source": "nuclear",
              name: "Centrale nucléaire de Cattenom",
              wikidata: "Q1053060",
              operator: "EDF",
            },
          },
          { type: "node", id: 7, lat: 49.5, lon: 6.3, tags: { amenity: "hospital", name: "Not asked for" } },
        ],
      }),
    );
    const osm = await install(overpass, { provider: "osm", key: "osm:nuclear:FR", countries: ["FR"], layers: ["nuclear"] });
    const sparql = write(
      "collections/reference/wikidata/nuclear-fr.json",
      JSON.stringify({
        head: { vars: [] },
        results: {
          bindings: [
            {
              item: { type: "uri", value: "http://www.wikidata.org/entity/Q1053060" },
              itemLabel: { type: "literal", value: "Cattenom Nuclear Power Plant" },
              kind: { type: "literal", value: "wikidata:nuclear-power-plant" },
              coord: { type: "literal", value: "Point(6.218 49.41)" },
              precision: { type: "literal", value: "0.0001" },
              iso: { type: "literal", value: "FR" },
              operatorLabel: { type: "literal", value: "Électricité de France" },
            },
            {
              item: { type: "uri", value: "http://www.wikidata.org/entity/Q999999999" },
              itemLabel: { type: "literal", value: "A research reactor (test)" },
              kind: { type: "literal", value: "wikidata:research-reactor" },
              coord: { type: "literal", value: "Point(2.1 48.7)" },
              iso: { type: "literal", value: "FR" },
            },
          ],
        },
      }),
    );
    const wikidata = await install(sparql, { provider: "wikidata", key: "wikidata-nuclear", countries: ["FR"], layers: ["nuclear"] });
    const view = await overlay("bbox=1,48,7,50&zoom=9&layers=nuclear");
    expect(view.points.map((point) => point.name).sort()).toEqual(["A research reactor (test)", "Centrale nucléaire de Cattenom"]);
    const station = view.points.find((point) => point.name.startsWith("Centrale"))!;
    const detail = (await app.api("GET", `/api/reference/features/${station.id}`)).body.feature as ReferenceFeatureDetail;
    expect(detail.source).toMatchObject({
      provider: "osm",
      license: "ODbL 1.0",
      sourceUrl: "https://www.openstreetmap.org/way/4242",
      publishedAt: "Map data as of 2026-11-16",
    });
    expect(detail.alsoFrom).toEqual([expect.objectContaining({ provider: "wikidata", sourceId: "Q1053060", license: "CC0 1.0" })]);
    expect(detail.hasGeometry).toBe(true);
    const wikidataPack = (await packs()).find((entry) => entry.id === wikidata!.collectionId)!;
    expect(wikidataPack).toMatchObject({ records: 2, duplicates: 1 });

    // With the OpenStreetMap pack gone, the Wikidata record of the station is drawn again.
    await app.api("DELETE", `/api/reference/packs/${osm!.collectionId}?deleteFiles=1`);
    const after = await overlay("bbox=1,48,7,50&zoom=9&layers=nuclear");
    expect(after.points.map((point) => point.name).sort()).toEqual(["A research reactor (test)", "Cattenom Nuclear Power Plant"]);
    expect(fs.existsSync(path.join(storageRoot, overpass))).toBe(false);
  });

  it("reads Switzerland's emergency meeting points from the Swiss grid", async () => {
    const relPath = write(
      "collections/reference/babs/ntp.geojson",
      JSON.stringify({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2056" } },
        features: [
          {
            type: "Feature",
            properties: {
              "ntp-id": "AG-0001",
              gebbezeichnung: "Busgarage BBA",
              strasse: "Neumattstrasse",
              nummer: "20",
              plz: 5000,
              ort: "Aarau",
              gemeinde: "Aarau",
              kanton: "AG",
              linkkanton: "https://www.ag.ch/notfalltreffpunkt",
              linkbabs: "https://www.babs.admin.ch/de/ntp",
            },
            geometry: { type: "Point", coordinates: [2647352.0, 1250156.0] },
          },
        ],
      }),
    );
    await install(relPath, { provider: "babs", key: "babs-meeting-points", countries: ["CH"], layers: ["shelters"] });
    const hit = (await app.api("GET", "/api/reference/search?q=Busgarage")).body.hits[0];
    // Aarau is at about 47.39°N 8.05°E.
    expect(hit.lat).toBeCloseTo(47.39, 1);
    expect(hit.lon).toBeCloseTo(8.05, 1);
  });

  it("reads an .osm.pbf extract imported from a storage location", async () => {
    write(
      "imports/liechtenstein.osm.pbf",
      buildPbf({
        timestamp: Date.UTC(2026, 10, 15) / 1000,
        nodes: [
          { id: 1, lat: 47.14, lon: 9.52, tags: { amenity: "hospital", name: "Landesspital (test)" } },
          { id: 2, lat: 47.15, lon: 9.53, tags: { amenity: "police", name: "Landespolizei (test)" } },
        ],
        ways: [],
        relations: [],
      }),
    );
    const job = await importFile("osm-pbf", "imports/liechtenstein.osm.pbf", { country: "LI" }, "Liechtenstein extract");
    expect(job.state).toBe("succeeded");
    expect(job.result.imported).toBe(2);
    const view = await overlay("bbox=9.4,47,9.7,47.3&zoom=10&layers=hospitals,emergency&countries=LI");
    expect(view.points.map((point) => point.layer).sort()).toEqual(["emergency", "hospitals"]);
  });

  it("reads a WorldPop grid, draws its density and sums the people within a circle", async () => {
    const width = 60;
    const height = 60;
    const values = new Float32Array(width * height).fill(10);
    values[0] = -99999;
    const relPath = write(
      "collections/reference/worldpop/tst_ppp_2020_1km_Aggregated_UNadj.tif",
      buildTiff({ width, height, values, originLon: 6, originLat: 50, pixel: 1 / 120, nodata: -99999 }),
    );
    const result = await install(relPath, {
      provider: "worldpop",
      key: "worldpop:LU",
      countries: ["LU"],
      options: { iso3: "LUX", country: "Luxembourg" },
    });
    const pack = (await packs()).find((entry) => entry.id === result!.collectionId)!;
    expect(pack.records).toBe(0);
    const layers = (await app.api("GET", "/api/reference/layers")).body;
    expect(layers.population).toEqual([
      expect.objectContaining({ country: "Luxembourg", year: 2020, available: true, citation: WORLDPOP_CITATION }),
    ]);
    const grid = (await app.api("GET", "/api/reference/population/grid?bbox=5.9,49.4,6.6,50.1&zoom=10")).body;
    expect(grid.cells.length).toBeGreaterThan(100);
    // Ten people in a cell of about 0.55 km² at 50°N: about 18 a square kilometre.
    expect(grid.cells[10].density).toBeGreaterThan(15);
    expect(grid.cells[10].density).toBeLessThan(21);
    const sum = (await app.api("GET", "/api/reference/population/sum?lat=49.75&lon=6.25&radiusKm=5")).body;
    // About 145 cells of 10 people inside a 5 km circle there.
    expect(sum.people).toBeGreaterThan(1200);
    expect(sum.people).toBeLessThan(1700);
    expect(sum.covered).toBe(1);
    expect(sum.note).toMatch(/modelled estimate, not a count/);
  });
});

describe("a storage location going away", () => {
  it("keeps the records on the map, says the pack's drive is not connected, and draws population from its coarse grids", async () => {
    app.ctx.sqlite.prepare("UPDATE storage_locations SET status = 'unavailable' WHERE id = ?").run(locationId);
    try {
      const all = await packs();
      expect(all.every((pack) => pack.available === false)).toBe(true);
      const view = await overlay("bbox=5.7,49.4,6.6,50.2&zoom=9&layers=airports");
      expect(view.points.length).toBe(1);
      const grid = (await app.api("GET", "/api/reference/population/grid?bbox=5.9,49.4,6.6,50.1&zoom=10")).body;
      expect(grid.cells.length).toBeGreaterThan(0);
      const sum = (await app.api("GET", "/api/reference/population/sum?lat=49.75&lon=6.25&radiusKm=5")).body;
      expect(sum.people).toBeNull();
      expect(sum.note).toMatch(/not connected/);
    } finally {
      app.ctx.sqlite.prepare("UPDATE storage_locations SET status = 'available' WHERE id = ?").run(locationId);
    }
  });
});

describe("downloading through the download manager from an Overpass server", () => {
  let server: http.Server;
  let questions: string[] = [];
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const query = decodeURIComponent(body.replace(/^data=/, "").replace(/\+/g, " "));
        questions.push(query);
        response.setHeader("content-type", "application/json");
        if (query.includes("out count")) {
          response.end(
            JSON.stringify({ elements: [{ type: "count", id: 0, tags: { nodes: "3", ways: "2", relations: "0", total: "5" } }] }),
          );
        } else {
          response.end(
            JSON.stringify({
              osm3s: { timestamp_osm_base: "2026-11-16T09:00:00Z" },
              elements: [
                { type: "node", id: 99, lat: 50.86, lon: 4.35, tags: { landuse: "military", military: "barracks", name: "Test barracks" } },
              ],
            }),
          );
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const declare = (id: string) => {
    const file = path.join(app.ctx.config.dataDir, "catalog", "routes", "route-sources.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        replaceShipped: true,
        sources: [
          {
            id,
            name: "Local test server",
            type: "overpass",
            endpoint: `http://127.0.0.1:${port}/api/interpreter`,
            operator: "The tests",
            coverage: "Anywhere",
            termsUrl: "https://example.org/",
            lastVerified: "2026-11-16",
          },
        ],
      }),
    );
  };

  it("estimates by counting, then downloads one layer of one country on a press and installs it", async () => {
    declare("local-test");
    questions = [];
    const estimate = await app.api("POST", "/api/reference/estimate", {
      provider: "osm",
      clientNameAgreed: true,
      scope: { countries: ["BE"] },
      layers: ["military"],
    });
    expect(estimate.status).toBe(200);
    expect(estimate.body.items).toEqual([expect.objectContaining({ key: "osm:military:BE", records: 5, exact: false })]);
    expect(estimate.body.notes[0]).toMatch(/illegal to create maps of military facilities/);
    expect(questions[0]).toMatch(/area\["ISO3166-1"="BE"\]\[admin_level=2\]/);

    const started = await app.api("POST", "/api/reference/downloads", { estimateId: estimate.body.estimateId, keys: ["osm:military:BE"] });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const download = app.ctx.services.downloads.get(started.body.downloads[0].id)!;
    expect(download.state).toBe("completed");
    expect(questions[1]).toMatch(/way\.r; out geom;/);
    const view = await overlay("bbox=4,50.5,4.7,51&zoom=10&layers=military");
    expect(view.points.map((point) => point.name)).toEqual(["Test barracks"]);
  });

  it("asks a source that is told how to reach the project only once the person has agreed to that", async () => {
    declare("local-test");
    questions = [];
    for (const provider of ["osm", "wikidata"]) {
      for (const agreed of [undefined, false]) {
        const refused = await app.api("POST", "/api/reference/estimate", {
          provider,
          scope: { countries: ["BE"] },
          layers: ["nuclear"],
          ...(agreed === undefined ? {} : { clientNameAgreed: agreed }),
        });
        expect(refused.status, provider).toBe(400);
        // The refusal quotes the name that would be sent, so nobody agrees to something unseen.
        expect(JSON.stringify(refused.body), provider).toMatch(
          /sends the name .Outpost\/\d+\.\d+\.\d+ \(self-hosted offline library; \+https:/,
        );
        expect(JSON.stringify(refused.body), provider).toMatch(/nothing has been asked/);
      }
    }
    expect(questions).toEqual([]);
    // The catalogue tells the screen which sources these are, and the name itself; the others carry none.
    const catalogue = await app.api<{ providers: Array<{ id: string; clientName?: string | null }> }>("GET", "/api/reference/catalogue");
    expect(catalogue.body.providers.filter((entry) => entry.clientName).map((entry) => entry.id)).toEqual(["osm", "wikidata"]);
  });

  it("does not ask a server whose terms rule out military applications", async () => {
    declare("private-coffee");
    const estimate = await app.api("POST", "/api/reference/estimate", {
      provider: "osm",
      clientNameAgreed: true,
      scope: { countries: ["BE"] },
      layers: ["military"],
    });
    expect(estimate.status).toBe(400);
    expect(JSON.stringify(estimate.body)).toMatch(/No public Overpass server whose terms allow this/);
  });

  /** A file that takes the first piece and then finds the drive full. */
  const fullDrive = () =>
    new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }));
      },
    });

  it("fails the download with words a person can act on, and the server keeps answering", async () => {
    const real = fs.createWriteStream;
    const spy = vi
      .spyOn(fs, "createWriteStream")
      .mockImplementation(((target: fs.PathLike, options?: never) =>
        String(target).endsWith(".part") && String(target).includes("osm")
          ? fullDrive()
          : real(target, options)) as typeof fs.createWriteStream);
    try {
      declare("local-test");
      const estimate = await app.api("POST", "/api/reference/estimate", {
        provider: "osm",
        clientNameAgreed: true,
        scope: { countries: ["LU"] },
        layers: ["military"],
      });
      expect(estimate.status).toBe(200);
      const started = await app.api("POST", "/api/reference/downloads", {
        estimateId: estimate.body.estimateId,
        keys: ["osm:military:LU"],
      });
      await app.ctx.jobs.whenIdle();
      const download = app.ctx.services.downloads.get(started.body.downloads[0].id)!;
      expect(download.state).toBe("failed");
      expect(download.error).toMatch(/is full\. Free some space on it/);
    } finally {
      spy.mockRestore();
    }
    expect((await app.api("GET", "/api/health")).status).toBe(200);
  });

  it("refuses an estimate with no countries and no box, unless the source covers the world by nature", async () => {
    declare("local-test");
    for (const provider of ["osm", "worldpop", "babs"]) {
      for (const scope of [{}, { countries: [] }]) {
        const refused = await app.api("POST", "/api/reference/estimate", { provider, scope, layers: ["military"] });
        expect(refused.status, provider).toBe(400);
        expect(refused.body.error.message).toMatch(/Choose at least one country, or draw a box on the map/);
      }
    }
    // Asked for nothing in particular, a source of the whole world gives the whole world.
    const world = await app.api("POST", "/api/reference/estimate", { provider: "natural-earth", scope: {}, layers: ["boundaries"] });
    expect(world.status).not.toBe(400);
  });

  it("will not start from an estimate it did not make", async () => {
    const started = await app.api("POST", "/api/reference/downloads", { estimateId: "nothing", keys: ["x"] });
    expect(started.status).toBe(409);
  });

  it("will not start from an estimate more than half an hour old, even when no other has been made since", async () => {
    declare("local-test");
    const estimate = await app.api("POST", "/api/reference/estimate", {
      provider: "osm",
      clientNameAgreed: true,
      scope: { countries: ["LU"] },
      layers: ["military"],
    });
    expect(estimate.status).toBe(200);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31 * 60_000);
    try {
      const started = await app.api("POST", "/api/reference/downloads", {
        estimateId: estimate.body.estimateId,
        keys: ["osm:military:LU"],
      });
      expect(started.status).toBe(409);
      expect(started.body.error.message).toMatch(/more than half an hour old/);
    } finally {
      clock.mockRestore();
    }
  });
});

describe("a query answer that cannot be written", () => {
  it("fails, and does not hang, when the folder for the answer is missing", async () => {
    const fetcher = createQueryFetcher({ fetch: async () => ({ response: new Response("{}".repeat(50_000)) }) } as never, { gapMs: 0 });
    const missing = path.join(app.dir, "not-there", "answer.json.part");
    await expect(
      fetcher({
        download: { meta: { query: { method: "GET", url: "http://127.0.0.1:1/q", accept: "application/json", maxBytes: 10_000_000 } } },
        partPath: missing,
        signal: new AbortController().signal,
        throttle: async () => {},
        progress: () => {},
      } as never),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("a few hundred thousand features", () => {
  it("answers views of the world, a country and a town quickly, counting by patch where there are too many to send", async () => {
    const sink = app.ctx.services.layers.store.sink("perf-pack", "import", Date.now());
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const centres = Array.from({ length: 300 }, () => [36 + random() * 34, -10 + random() * 40] as const);
    const count = 300_000;
    const started = performance.now();
    for (let i = 0; i < count; i += 1) {
      const centre = centres[i % 300]!;
      await sink.add({
        sourceId: `perf-${i}`,
        layer: (["military", "hospitals", "emergency", "shelters"] as const)[i % 4]!,
        kind: "import:Test",
        name: `Feature ${i}`,
        altNames: "",
        country: "GB",
        lat: centre[0] + (random() - 0.5) * 2,
        lon: centre[1] + (random() - 0.5) * 3,
        bbox: null,
        geometry: null,
        props: {},
        provenance: "unverified",
        accuracy: "Test",
        accuracyMeters: null,
        publisher: "Test",
        license: "Test",
        sourceUrl: null,
        publishedAt: null,
      });
    }
    await sink.flush();
    const inserted = performance.now() - started;
    // The rows count as a pack's once they are not pending; this test owns them directly.
    const time = async (query: string) => {
      const t = performance.now();
      const body = await overlay(query);
      return { ms: Math.round(performance.now() - t), body };
    };
    const layers = "layers=military,hospitals,emergency,shelters";
    const world = await time(`bbox=-180,-85,180,85&zoom=2&${layers}`);
    const country = await time(`bbox=-8,50,2,59&zoom=6&${layers}`);
    const town = await time(
      `bbox=${centres[0]![1] - 0.05},${centres[0]![0] - 0.03},${centres[0]![1] + 0.05},${centres[0]![0] + 0.03}&zoom=13&${layers}`,
    );
    const search = performance.now();
    await app.api("GET", "/api/reference/search?q=Feature%2012345");
    const searchMs = Math.round(performance.now() - search);
    console.log(
      `reference layers, ${count} features: insert ${Math.round(inserted)} ms; world view ${world.ms} ms (${world.body.cells.length} patches); country view ${country.ms} ms (${country.body.cells.length} patches); town view ${town.ms} ms (${town.body.points.length} points); search ${searchMs} ms`,
    );
    expect(world.body.total).toBeGreaterThanOrEqual(count);
    expect(world.body.points).toHaveLength(0);
    expect(world.body.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(world.body.total);
    expect(town.body.points.length).toBeGreaterThan(0);
    // Generous bounds: this runs beside other suites.
    expect(world.ms).toBeLessThan(5_000);
    expect(town.ms).toBeLessThan(1_000);
    await app.ctx.services.layers.store.removeRows("perf-pack");
  }, 120_000);
});
