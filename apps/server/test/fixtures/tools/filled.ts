/**
 * A test server with something in every area the model tools read, made the way a person
 * makes it: through the HTTP routes and the services the screens use. Shared by the
 * tools' own tests and the read-only test over the whole registry.
 *
 * Nothing here reaches the internet. The weather is fetched from the recorded answers in
 * test/fixtures/weather through a local stand-in; place names are a miniature GeoNames
 * file run through the map's own installer; reference layers are GeoJSON files imported
 * through the layers' own import route.
 *
 * The reference layers have no layer of shops of their own in this tree, so the
 * supermarkets go in as an imported kind ("Supermarket") of an importable layer: the
 * tools find a kind by its name whatever layer holds it, which is the point.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { ANTENNA_PRESETS, emptyPlanBody, type PredictionRequest } from "@outpost/shared";
import { expect } from "vitest";
import type { DownloadRow, InstallContext } from "../../../src/modules/downloads/types.ts";
import { createTestApp, type TestApp } from "../../helpers.ts";
import { buildZip, geonamesLine } from "../maps/zip.ts";
import { serveWeatherStandIn } from "../weather/stand-in.ts";

export const NORTHAMPTON = { lat: 52.25, lon: -0.88333 };
export const BEDFORD = { lat: 52.13459, lon: -0.46632 };

/** Twelve supermarkets round Northampton and one in Bedford, about 30 km away. */
export const SUPERMARKETS: Array<{ name: string; lat: number; lon: number; street: string; city: string; postcode: string }> = [
  { name: "Tesco Extra Mereway", lat: 52.2132, lon: -0.8915, street: "Mere Way", city: "Northampton", postcode: "NN4 8BX" },
  {
    name: "Sainsbury's Weston Favell",
    lat: 52.2523,
    lon: -0.8264,
    street: "Weston Favell Centre",
    city: "Northampton",
    postcode: "NN3 8JZ",
  },
  { name: "Asda Riverside", lat: 52.2385, lon: -0.8478, street: "Riverside Way", city: "Northampton", postcode: "NN3 9HX" },
  { name: "Morrisons Kettering Road", lat: 52.2541, lon: -0.8789, street: "Kettering Road", city: "Northampton", postcode: "NN3 6AA" },
  { name: "Aldi Towcester Road", lat: 52.2251, lon: -0.8981, street: "Towcester Road", city: "Northampton", postcode: "NN4 8LE" },
  { name: "Lidl St James", lat: 52.2368, lon: -0.9142, street: "St James Road", city: "Northampton", postcode: "NN5 5LD" },
  { name: "Waitrose Kingsthorpe", lat: 52.2687, lon: -0.8955, street: "Harborough Road", city: "Northampton", postcode: "NN2 7AZ" },
  { name: "Co-op Abington", lat: 52.2443, lon: -0.8712, street: "Wellingborough Road", city: "Northampton", postcode: "NN1 4DY" },
  { name: "Co-op Kingsthorpe", lat: 52.2645, lon: -0.9001, street: "Welford Road", city: "Northampton", postcode: "NN2 8AA" },
  { name: "Iceland Gold Street", lat: 52.237, lon: -0.9007, street: "Gold Street", city: "Northampton", postcode: "NN1 1RA" },
  { name: "M&S Food Sixfields", lat: 52.2357, lon: -0.9343, street: "Upton Way", city: "Northampton", postcode: "NN5 4EG" },
  {
    name: "Tesco Express Wellingborough Road",
    lat: 52.243,
    lon: -0.88,
    street: "Wellingborough Road",
    city: "Northampton",
    postcode: "NN1 4EY",
  },
  {
    name: "Tesco Bedford Interchange",
    lat: 52.1405,
    lon: -0.487,
    street: "Interchange Retail Park",
    city: "Bedford",
    postcode: "MK42 0BS",
  },
];

export const HOSPITALS = [
  { name: "Northampton General Hospital", lat: 52.2353, lon: -0.8836 },
  { name: "Bedford Hospital", lat: 52.129, lon: -0.4697 },
];

export interface Filled {
  app: TestApp;
  homeId: string;
  close(): Promise<void>;
}

function point(lon: number, lat: number, properties: Record<string, string>) {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates: [lon, lat] } };
}

/** Writes a file into the default storage location and imports it as a reference layer, as a person does under Maps → Layers. */
async function importLayer(app: TestApp, relPath: string, features: unknown[], options: Record<string, string>, title: string) {
  const location = app.ctx.services.storage.getDefault();
  const file = path.join(app.ctx.services.storage.resolve(location.id, ""), relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ type: "FeatureCollection", features }));
  const started = await app.api("POST", "/api/reference/imports/from-storage", {
    format: "geojson",
    locationId: location.id,
    relPath,
    title,
    options: {
      provenance: "public-record",
      publisher: "OpenStreetMap contributors (test)",
      license: "ODbL 1.0",
      accuracy: "As mapped",
      ...options,
    },
  });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  await app.ctx.jobs.whenIdle();
  const job = (await app.api("GET", `/api/jobs/${started.body.jobId}`)).body;
  expect((job.job ?? job).state).toBe("succeeded");
}

/** Northampton and Bedford in a miniature GeoNames file, installed by the map's own installer. */
async function installPlaceNames(app: TestApp) {
  const location = app.ctx.services.storage.getDefault();
  const relPath = "collections/places/cities500.zip";
  const filePath = path.join(location.path, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    {
      id: 2641430,
      name: "Northampton",
      ...NORTHAMPTON,
      featureClass: "P",
      featureCode: "PPLA2",
      country: "GB",
      admin1: "ENG",
      population: 189474,
    },
    { id: 2656046, name: "Bedford", ...BEDFORD, featureClass: "P", featureCode: "PPLA2", country: "GB", admin1: "ENG", population: 79190 },
  ].map(geonamesLine);
  const zip = buildZip([{ name: "cities500.txt", content: `${lines.join("\n")}\n` }]);
  fs.writeFileSync(filePath, zip);
  const context: InstallContext = {
    download: {
      id: "download-cities500",
      kind: "places",
      title: "Place names: cities500",
      locationId: location.id,
      relPath,
      catalogEntryId: null,
      meta: { dataset: "cities500" },
    } as unknown as DownloadRow,
    filePath,
    sizeBytes: zip.length,
    sha256: "a".repeat(64),
    signal: new AbortController().signal,
    progress: () => {},
  };
  await app.ctx.services.maps.places.installer(context);
}

async function ok(app: TestApp, method: string, url: string, body?: unknown, from = "192.168.1.20") {
  const response = await app.api(method, url, body, { remoteAddress: from });
  expect(response.status, `${method} ${url}: ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
}

const dipole = ANTENNA_PRESETS.find((preset) => preset.id === "low-dipole")!.spec;
export const PREDICTION: PredictionRequest = {
  tx: { name: "Home", lat: 52.2405, lon: -0.8936 },
  rx: { name: "Birmingham", lat: 52.4862, lon: -1.8904 },
  date: "2026-11-16",
  powerWatts: 5,
  txAntenna: dipole,
  rxAntenna: dipole,
  noise: "city",
  frequencyMhz: 7.1,
  mode: "ssb",
  solar: { source: "table" },
};

/** A server with something in every area. Board tools are switched on. */
export async function filledServer(): Promise<Filled> {
  const standIn = http.createServer(serveWeatherStandIn);
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}/weather`;
  const app = await createTestApp({ OUTPOST_WEATHER_STAND_IN: base }, undefined, { voacapData: false });
  await ok(app, "PATCH", "/api/settings", { "tools.board": true });

  // Saved places.
  const home = (await ok(app, "POST", "/api/maps/markers", { name: "Home", lat: 52.2405, lon: -0.8936, icon: "home" })).marker;
  await ok(app, "POST", "/api/maps/markers", {
    name: "Spring at the allotment",
    lat: 52.2475,
    lon: -0.9052,
    icon: "water",
    note: "Clear all year",
  });

  // Place names and reference layers.
  await installPlaceNames(app);
  await importLayer(
    app,
    "imports/supermarkets.geojson",
    SUPERMARKETS.map((shop, index) =>
      point(shop.lon, shop.lat, {
        id: `shop-${index}`,
        name: shop.name,
        "addr:street": shop.street,
        "addr:city": shop.city,
        "addr:postcode": shop.postcode,
      }),
    ),
    { layer: "emergency", kind: "Supermarket" },
    "Supermarkets (test)",
  );
  await importLayer(
    app,
    "imports/hospitals.geojson",
    HOSPITALS.map((hospital, index) => point(hospital.lon, hospital.lat, { id: `hospital-${index}`, name: hospital.name })),
    { layer: "hospitals", kind: "Hospital" },
    "Hospitals (test)",
  );

  // The library: a document and a note, put in the search index as the library does.
  app.ctx.services.search.upsert({
    kind: "document",
    entityId: "dwater",
    title: "Water treatment in the field",
    url: "/library/documents/dwater",
    collection: "Medicine and first aid",
    tags: [],
    sections: [
      { page: 1, heading: "Boiling", text: "Bring the water to a rolling boil for one minute. At altitude, boil for three minutes." },
    ],
  });

  // Supplies.
  await ok(app, "PUT", "/api/supplies/household", {
    daysWanted: 7,
    drinkingLitres: 3,
    allUsesLitres: 7.5,
    waterBasis: "drinking",
    members: [{ kind: "person", name: "Sam", band: "19-64", sex: "male" }],
  });
  for (const item of [
    { name: "Baked beans", category: "food", quantity: 10, unit: "tin", kcalPer100g: 84, gramsPerUnit: 400 },
    { name: "Pasta", category: "food", quantity: 5, unit: "pack", kcalPer100g: 359, gramsPerUnit: 500 },
    { name: "Bottled water", category: "water", quantity: 3, unit: "bottle", litresPerUnit: 2 },
    { name: "Plasters", category: "medical", quantity: 40, unit: "plaster" },
    { name: "AA batteries", category: "batteries", quantity: 12, unit: "battery" },
  ])
    await ok(app, "POST", "/api/supplies/items", item);

  // An emergency plan with more steps than one page, a meeting place, and how to keep in touch.
  const body = emptyPlanBody();
  body.steps = Array.from({ length: 18 }, (_, index) => ({
    id: `step-${index + 1}`,
    phase: index < 6 ? ("before" as const) : index < 12 ? ("during" as const) : ("after" as const),
    text: `Step ${index + 1}: ${index === 0 ? "Put the torches where everyone can find them." : "Check on the neighbours."}`,
    origin: null,
  }));
  body.places = [{ id: "place-1", role: "near", markerId: null, name: "Number 12's porch", note: "Knock twice" }];
  body.comms = { text: "Meet at the church at noon each day", commPlanId: null, frequency: "PMR446 channel 3", schedule: "" };
  await ok(app, "POST", "/api/emergency-plans", {
    name: "Power cut",
    kind: "power-cut",
    kindText: "",
    templateId: null,
    emergencyNumber: "999",
    reviewEveryDays: 180,
    body,
  });

  // The weather for home, fetched from the stand-in.
  await ok(app, "POST", "/api/weather/places", { markerId: home.id, region: "em" });
  const update = await ok(app, "POST", "/api/weather/update", { kinds: ["forecast", "warnings", "flood", "rivers"] });
  expect(
    update.outcomes.every((outcome: { ok: boolean }) => outcome.ok),
    JSON.stringify(update.outcomes),
  ).toBe(true);

  // Repeaters, typed in by hand.
  await ok(app, "POST", "/api/repeaters", {
    callsign: "GB3NH",
    outputHz: 145_712_500,
    inputHz: 145_112_500,
    modes: ["fm"],
    ctcssHz: 77,
    place: "Northampton",
    lat: 52.2601,
    lon: -0.8701,
  });
  await ok(app, "POST", "/api/repeaters", {
    callsign: "GB3BF",
    outputHz: 433_150_000,
    inputHz: 434_750_000,
    modes: ["fm"],
    ctcssHz: 77,
    place: "Bedford",
    lat: 52.1352,
    lon: -0.4683,
  });

  // A saved propagation prediction (its figures were never worked out here).
  await ok(app, "POST", "/api/radio/propagation/saved", { name: "Home to Birmingham, 40 m", request: PREDICTION });

  // The catalogue: two entries to download, as a manifest would list them.
  const manifests = path.join(app.dir, "catalog", "manifests");
  fs.mkdirSync(manifests, { recursive: true });
  const entry = (id: string, name: string, description: string, tags: string[], sizeBytes: number) => ({
    id,
    name,
    description,
    category: "reference",
    publisher: "Test Press",
    language: "en",
    format: "pdf",
    license: "CC BY-SA 4.0",
    attribution: "Test Press contributors",
    lastVerified: "2026-11-15",
    tags,
    sizeBytes,
    source: { type: "http", url: `http://127.0.0.1:9/${id}.pdf` },
  });
  fs.writeFileSync(
    path.join(manifests, "tools-test.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "tools-test",
      name: "Manifest for the tools' tests",
      description: "Two entries",
      maintainers: ["Tests"],
      downloadHosts: ["127.0.0.1"],
      entries: [
        entry("test.first-aid", "First aid manual", "A field guide to first aid and casualty care.", ["first aid", "medicine"], 14_000_000),
        entry("test.knots", "Knots by example", "Knots for camping and rescue.", ["knots", "rope"], 2_500_000),
      ],
    }),
  );
  app.ctx.services.catalog.reload();

  // The board: more messages than one page, and two check-ins.
  for (let index = 1; index <= 11; index += 1)
    await ok(app, "POST", "/api/board/messages", { author: "Sam", body: `Message ${index}` }, `192.168.1.${30 + index}`);
  await ok(app, "POST", "/api/board/check-ins", { author: "Alex", status: "safe", place: "Mum's" }, "192.168.1.60");

  await app.ctx.jobs.whenIdle();
  return {
    app,
    homeId: home.id,
    async close() {
      await app.close();
      await new Promise<void>((resolve) => standIn.close(() => resolve()));
    },
  };
}
