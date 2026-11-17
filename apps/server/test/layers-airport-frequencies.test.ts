/**
 * Airports' radio frequencies from OurAirports, on a real test server, with a local
 * stand-in for the data repository serving both files: the frequencies joined to the
 * right airport and ordered, an airport with none, the size shown before the press, the
 * frequencies file missing, malformed or far too large leaving the airports installed
 * with a plain note, an update replacing them, a pack installed before frequencies were
 * fetched, search by name and code only, and removal taking them.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ReferenceEstimate, ReferenceFeatureDetail, ReferencePackDto } from "@outpost/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { splitFrequencies } from "../src/modules/layers/adapters/ourairports-frequencies.ts";
import { AIRPORTS_CSV, FREQUENCIES_CSV, serveOurAirportsStandIn } from "./fixtures/layers/ourairports-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
let standIn: http.Server;
let files: Record<string, string | undefined>;
const asked: string[] = [];

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    asked.push(`${request.method} ${request.url}`);
    serveOurAirportsStandIn(request, response, files);
  });
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  app = await createTestApp({ OUTPOST_OURAIRPORTS_URL: `http://127.0.0.1:${(standIn.address() as AddressInfo).port}/ourairports/` });
});

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => standIn.close(() => resolve()));
});

beforeEach(() => {
  files = { "airports.csv": AIRPORTS_CSV, "airport-frequencies.csv": FREQUENCIES_CSV };
  asked.length = 0;
});

const packs = async () => (await app.api("GET", "/api/reference/packs")).body.packs as ReferencePackDto[];

async function download(countries: string[]) {
  const estimate = await app.api("POST", "/api/reference/estimate", { provider: "ourairports", scope: { countries } });
  expect(estimate.status).toBe(200);
  const body = estimate.body as ReferenceEstimate;
  const started = await app.api("POST", "/api/reference/downloads", { estimateId: body.estimateId, keys: ["airports"] });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  await app.ctx.jobs.whenIdle();
  const pack = (await packs()).find((entry) => entry.provider === "ourairports");
  return { estimate: body, pack: pack! };
}

async function airport(code: string): Promise<ReferenceFeatureDetail> {
  const found = await app.api("GET", `/api/reference/search?q=${encodeURIComponent(code)}&layers=airports`);
  const hit = (found.body.hits as Array<{ id: number }>)[0];
  expect(hit, `no airport found for ${code}`).toBeTruthy();
  return (await app.api("GET", `/api/reference/features/${hit!.id}`)).body.feature as ReferenceFeatureDetail;
}

describe("airport frequencies from OurAirports", () => {
  it("states both files' sizes before the press, and joins each airport's rows to it, tower and information first", async () => {
    const { estimate, pack } = await download(["GB"]);
    const item = estimate.items[0]!;
    const both = Buffer.byteLength(AIRPORTS_CSV) + Buffer.byteLength(FREQUENCIES_CSV);
    expect(item.bytes).toBe(both);
    expect(item.exact).toBe(true);
    expect(item.basis).toContain("airport-frequencies.csv");
    expect(estimate.notes.join(" ")).toContain("radio frequencies come from a second file, airport-frequencies.csv");
    // Both files asked for their size, then the airports downloaded and the frequencies fetched once.
    expect(asked.filter((line) => line.startsWith("GET")).map((line) => line.split(" ")[1])).toEqual([
      "/ourairports/airports.csv",
      "/ourairports/airport-frequencies.csv",
    ]);

    expect(pack.records).toBe(4);
    expect(pack.notes).toEqual([
      "Radio frequencies included, from airport-frequencies.csv of 2026-11-17, for 3 of the 4 airports kept. 1 row of the file with no usable frequency was left out.",
    ]);

    const heathrow = await airport("EGLL");
    expect(heathrow.name).toBe("London Heathrow Airport");
    expect(heathrow.airportFrequencies?.held).toBe(true);
    expect(heathrow.airportFrequencies?.asOf).toBe("2026-11-17");
    const list = heathrow.airportFrequencies!.list;
    expect(list).toHaveLength(15);
    expect(list.slice(0, 7).map((entry) => `${entry.type} ${entry.mhz}`)).toEqual([
      "TWR 118.5",
      "TWR 118.7",
      "TWR 124.475",
      "ATIS 113.75",
      "ATIS 115.1",
      "ATIS 121.935",
      "ATIS 128.075",
    ]);
    expect(list[0]).toEqual({ type: "TWR", typeLabel: "Tower", description: "Heathrow Tower", mhz: "118.5" });
    // An abbreviation whose meaning is not certain is left as given.
    expect(list.find((entry) => entry.type === "CLD")).toEqual({
      type: "CLD",
      typeLabel: null,
      description: "Heathrow Delivery",
      mhz: "121.975",
    });
    // The rows stay out of "everything the source gives".
    expect(Object.keys(heathrow.props)).not.toContain("frequencies");
    expect(Object.keys(heathrow.props)).not.toContain("frequencies_as_of");

    // Another airport's rows are its own.
    const city = await airport("London City");
    expect(city.airportFrequencies!.list.map((entry) => entry.mhz)).toEqual(["118.075", "136.35", "132.7", "121.825"]);

    // An airport the file has no rows for: held, and an empty list.
    const madeUp = await airport("Made-up airfield");
    expect(madeUp.airportFrequencies).toEqual({ held: true, asOf: "2026-11-17", list: [] });

    // Luxembourg was not asked for, so its rows were not kept.
    const kept = app.ctx.sqlite
      .prepare("SELECT count(*) AS n FROM reference_features WHERE json_extract(props, '$.frequencies') LIKE '%Luxembourg%'")
      .get() as { n: number };
    expect(kept.n).toBe(0);
  });

  it("finds an airport by its name and codes, never by its frequencies", async () => {
    for (const query of ["Heathrow", "LHR", "EGLL"]) {
      const found = await app.api("GET", `/api/reference/search?q=${query}&layers=airports`);
      expect((found.body.hits as Array<{ name: string }>)[0]?.name, query).toBe("London Heathrow Airport");
    }
    for (const query of ["118.5", "Director", "ATIS"]) {
      const found = await app.api("GET", `/api/reference/search?q=${encodeURIComponent(query)}&layers=airports`);
      expect(found.body.hits, query).toEqual([]);
    }
    const everywhere = await app.api("GET", "/api/search?q=Director");
    expect(JSON.stringify(everywhere.body)).not.toContain("Heathrow");
  });

  it("replaces the frequencies with the airports when the pack is updated", async () => {
    const before = (await packs()).find((entry) => entry.provider === "ourairports")!;
    files["airport-frequencies.csv"] = `${FREQUENCIES_CSV.split("\n")[0]}\n1,2434,"EGLL","TWR","Heathrow Tower",118.7\n`;
    const { pack } = await download(["GB"]);
    expect(pack.id).not.toBe(before.id);
    expect((await packs()).filter((entry) => entry.provider === "ourairports")).toHaveLength(1);
    const heathrow = await airport("EGLL");
    expect(heathrow.airportFrequencies!.list).toEqual([{ type: "TWR", typeLabel: "Tower", description: "Heathrow Tower", mhz: "118.7" }]);
    expect((await airport("London City")).airportFrequencies).toMatchObject({ held: true, list: [] });
  });

  it.each([
    ["missing", undefined, "answered HTTP 404 for airport-frequencies.csv"],
    [
      "another shape",
      `"id","ident","freq"\n1,EGLL,118.5\n`,
      "not the shape Outpost knows: it has no airport_ident, type, description, frequency_mhz column",
    ],
    ["far too large", `${FREQUENCIES_CSV}${"x".repeat(17 * 1024 * 1024)}`, "far larger than it should be"],
  ])("installs the airports without frequencies when the file is %s, and says so", async (_case, body, reason) => {
    files["airport-frequencies.csv"] = body;
    const { pack } = await download(["GB"]);
    expect(pack.records).toBe(4);
    expect(pack.notes).toHaveLength(1);
    expect(pack.notes![0]).toContain("Radio frequencies were not included:");
    expect(pack.notes![0]).toContain(reason);
    expect(pack.notes![0]).toContain("update this pack to try again");
    const heathrow = await airport("EGLL");
    expect(heathrow.airportFrequencies).toEqual({ held: false, asOf: null, list: [] });
  });

  it("says a pack installed before frequencies were fetched does not hold them, until it is updated", async () => {
    // As an older pack's download was: no address for the frequencies in its meta.
    const id = (await packs()).find((entry) => entry.provider === "ourairports")!.id;
    const row = app.ctx.sqlite.prepare("SELECT meta FROM collections WHERE id = ?").get(id) as { meta: string };
    expect(JSON.parse(row.meta).reference.options.frequenciesUrl).toMatch(/airport-frequencies\.csv$/);
    app.ctx.sqlite
      .prepare("UPDATE reference_features SET props = json_remove(props, '$.frequencies', '$.frequencies_as_of') WHERE collection_id = ?")
      .run(id);
    expect((await airport("EGLL")).airportFrequencies).toEqual({ held: false, asOf: null, list: [] });
    await download(["GB"]);
    expect((await airport("EGLL")).airportFrequencies?.held).toBe(true);
  });

  it("takes the frequencies away with the pack", async () => {
    const pack = (await packs()).find((entry) => entry.provider === "ourairports")!;
    const heathrow = await airport("EGLL");
    expect(heathrow.airportFrequencies?.list.length).toBeGreaterThan(0);
    const removed = await app.api("DELETE", `/api/reference/packs/${pack.id}?deleteFiles=1`);
    expect(removed.status).toBe(200);
    expect((await app.api("GET", `/api/reference/features/${heathrow.id}`)).status).toBe(404);
    const left = app.ctx.sqlite
      .prepare("SELECT count(*) AS n FROM reference_features WHERE json_extract(props, '$.frequencies') IS NOT NULL")
      .get() as { n: number };
    expect(left.n).toBe(0);
  });

  it("gives no record but an OurAirports airport a frequencies field", () => {
    const props = { frequencies: "[]", name: "x" };
    expect(splitFrequencies("osm", "airports", props)).toEqual({ props });
    expect(splitFrequencies("ourairports", "military", props)).toEqual({ props });
    expect(splitFrequencies("ourairports", "airports", { name: "x" })).toEqual({
      props: { name: "x" },
      airportFrequencies: { held: false, asOf: null, list: [] },
    });
  });
});
