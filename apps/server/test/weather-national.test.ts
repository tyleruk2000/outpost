/**
 * National warnings for Canada, New Zealand and Japan, and a country chosen by hand, on a
 * real server with a local stand-in for each publisher. ECCC's and JMA's answers were
 * recorded on 22 November 2026. MetService's feed was empty that day, so its item list is
 * written to the feed's own shape around a real CAP document it published on 15 October
 * 2026 (an archived copy).
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { windPointOf } from "@outpost/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insideGeoJson, jmaLevel, parseCapDocument, parseJmaFeed } from "../src/modules/weather/alert-parsers.ts";
import { readReadingsCsv, writeReadingsCsv } from "../src/modules/weather/csv.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/weather", name), "utf8");

let standIn: http.Server;
let base = "";
const asked: string[] = [];

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    asked.push(`${url.pathname}${url.search}`);
    const send = (name: string, type: string) => {
      response.writeHead(200, { "content-type": type });
      response.end(fixture(name));
    };
    if (url.pathname === "/eccc-alerts/collections/weather-alerts/items") {
      const [west] = (url.searchParams.get("bbox") ?? "").split(",").map(Number);
      return send(west! < -82 ? "eccc-alerts-kapuskasing.json" : "eccc-alerts-caledon.json", "application/geo+json");
    }
    if (url.pathname === "/metservice-alerts/cap/rss") return send("metservice-rss.xml", "application/rss+xml");
    if (url.pathname === "/metservice-alerts/cap/alert" && url.searchParams.get("id")?.includes("arthurspass"))
      return send("metservice-cap-arthurs-pass.xml", "application/xml");
    if (url.pathname === "/jma-warnings/developer/xml/feed/extra_l.xml") return send("jma-extra-l.xml", "application/atom+xml");
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => standIn.close(() => resolve())));

let app: TestApp;
beforeEach(async () => {
  asked.length = 0;
  app = await createTestApp({ OUTPOST_WEATHER_STAND_IN: base }, undefined, { voacapData: false });
});
afterEach(() => app.close());

const home = (lat: number, lon: number) => app.api("POST", "/api/maps/markers", { name: "Home", lat, lon, icon: "home" });
const weather = async () => (await app.api("GET", "/api/weather")).body;
const kept = async (kind: string) =>
  ((await weather()).kept as Array<{ kind: string; data: never; sent: string }>).find((copy) => copy.kind === kind);
const update = async (kinds: string[]) =>
  (await app.api("POST", "/api/weather/update", { kinds })).body.outcomes as Array<{ kind: string; ok: boolean; message: string | null }>;

describe("Environment and Climate Change Canada", () => {
  it("asks for the alerts round Home's rounded position only, and says which hold Home", async () => {
    await home(49.4576, -82.6249);
    expect((await weather()).alerts).toMatchObject({ homeCountry: "CA", country: "CA", national: "eccc" });
    expect(asked).toEqual([]);
    expect(await update(["eccc"])).toEqual([expect.objectContaining({ kind: "eccc", ok: true })]);
    expect(asked).toEqual(["/eccc-alerts/collections/weather-alerts/items?f=json&lang=en&limit=200&bbox=-82.63,49.45,-82.61,49.47"]);
    const copy = (await kept("eccc"))!;
    expect(copy.sent).toBe("api.weather.gc.ca: the box -82.63,49.45,-82.61,49.47 (west, south, east, north)");
    const alerts = (copy.data as { alerts: Array<Record<string, unknown>> }).alerts;
    expect(alerts).toEqual([
      expect.objectContaining({
        name: "snowfall warning",
        type: "warning",
        colour: "yellow",
        status: "continued",
        area: "Kapuskasing - Hearst - Smooth Rock Falls",
        coversHome: true,
        text: expect.stringMatching(/^Heavy snowfall expected today\./),
      }),
    ]);
  });

  it("tells a point in a GeoJSON polygon from one in its hole", () => {
    const square = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ];
    expect(insideGeoJson({ type: "Polygon", coordinates: square }, { lat: 2, lon: 2 })).toBe(true);
    expect(insideGeoJson({ type: "Polygon", coordinates: square }, { lat: 5, lon: 5 })).toBe(false);
    expect(insideGeoJson({ type: "MultiPolygon", coordinates: [square] }, { lat: 2, lon: 2 })).toBe(true);
    expect(insideGeoJson({ type: "Point", coordinates: [1, 1] }, { lat: 1, lon: 1 })).toBeNull();
  });
});

describe("a country chosen by hand", () => {
  it("fetches the chosen country's service instead of Home's, and goes back to Home's when cleared", async () => {
    await home(37.96, -121.29);
    expect((await weather()).alerts).toMatchObject({ homeCountry: "US", national: "nws", chosenCountry: null });
    const chosen = await app.api("PUT", "/api/weather/options", { alertCountry: "CA" });
    expect(chosen.status).toBe(200);
    expect((await weather()).alerts).toMatchObject({
      homeCountry: "US",
      homeCountryName: "the United States",
      chosenCountry: "CA",
      country: "CA",
      countryName: "Canada",
      national: "eccc",
    });
    const outcomes = await update(["nws", "eccc"]);
    expect(outcomes.map((outcome) => [outcome.kind, outcome.ok])).toEqual([
      ["nws", false],
      ["eccc", true],
    ]);
    expect(outcomes[0]!.message).toMatch(/Warnings are fetched for Canada, which the US National Weather Service does not cover/);
    expect(asked).toHaveLength(1);
    await app.api("PUT", "/api/weather/options", { alertCountry: "" });
    expect((await weather()).alerts).toMatchObject({ chosenCountry: null, country: "US", national: "nws" });
  });

  it("refuses a country Outpost fetches no warnings for, and fetches a feed with no position without Home", async () => {
    const refused = await app.api("PUT", "/api/weather/options", { alertCountry: "BR" });
    expect(refused.status).toBe(400);
    await app.api("PUT", "/api/weather/options", { alertCountry: "JP" });
    expect((await weather()).alerts).toMatchObject({ home: null, country: "JP", national: "jma" });
    expect(await update(["jma"])).toEqual([expect.objectContaining({ kind: "jma", ok: true })]);
    await app.api("PUT", "/api/weather/options", { alertCountry: "CA" });
    expect((await update(["eccc"]))[0]).toMatchObject({ ok: false, message: expect.stringMatching(/No saved place has the home icon/) });
  });
});

describe("MetService", () => {
  it("fetches the feed and each alert's CAP document, says which hold Home, and keeps the feed's words where a document fails", async () => {
    await home(-42.93, 171.559);
    expect((await weather()).alerts).toMatchObject({ country: "NZ", national: "metservice" });
    expect(await update(["metservice"])).toEqual([expect.objectContaining({ kind: "metservice", ok: true })]);
    expect(asked).toEqual([
      "/metservice-alerts/cap/rss",
      "/metservice-alerts/cap/alert?id=2.49.0.0.554.0.roadsnow.arthurspass.20261014212322775.0",
      "/metservice-alerts/cap/alert?id=2.49.0.0.554.0.missing.0",
    ]);
    const copy = (await kept("metservice"))!;
    expect(copy.sent).toBe("alerts.metservice.com: the feed for New Zealand, then the one alert it lists; no position");
    const data = copy.data as { unread: number; alerts: Array<Record<string, unknown>> };
    expect(data.unread).toBe(1);
    expect(data.alerts[0]).toMatchObject({
      headline: "Road Snowfall Warning",
      event: "snow",
      colour: "Orange",
      area: "Arthur's Pass (SH73)",
      severity: "Moderate",
      coversHome: true,
      onset: Date.parse("2026-10-15T18:00:00+13:00"),
    });
    expect(data.alerts[1]).toMatchObject({
      headline: "Heavy Rain Watch - Westland",
      description: "Periods of heavy rain.",
      coversHome: null,
    });
  });

  it("reads the CAP document's first info, its area and its colour code", () => {
    const cap = parseCapDocument(fixture("metservice-cap-arthurs-pass.xml"), { lat: -40, lon: 175 });
    expect(cap).toMatchObject({ identifier: expect.stringMatching(/arthurspass/), status: "Actual", coversHome: false, colour: "Orange" });
    expect(cap.instruction).toMatch(/^Note: A Road Snowfall Warning means/);
  });
});

describe("the Japan Meteorological Agency", () => {
  it("keeps the latest warnings headline of each office, as written, highest level first", async () => {
    await home(35.68, 139.76);
    expect((await weather()).alerts).toMatchObject({ country: "JP", national: "jma" });
    expect(await update(["jma"])).toEqual([expect.objectContaining({ kind: "jma", ok: true })]);
    expect(asked).toEqual(["/jma-warnings/developer/xml/feed/extra_l.xml"]);
    const copy = (await kept("jma"))!;
    expect(copy.sent).toBe("www.data.jma.go.jp: no position");
    const entries = (copy.data as { entries: Array<{ office: string; headline: string; level: string; link: string }> }).entries;
    expect(entries).toHaveLength(7);
    const niigata = entries.find((entry) => entry.headline.startsWith("【新潟県"))!;
    expect(niigata.headline).toBe(
      "【新潟県気象警報・注意報】新潟県では、土砂災害に注意してください。下越、佐渡では、高波に注意してください。",
    );
    expect(niigata.level).toBe("注意報");
    expect(niigata.link).toMatch(/^https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\/.*_VPWW53_150000\.xml$/);
    const toyama = entries.find((entry) => entry.headline.startsWith("【富山県"))!;
    expect(toyama).toMatchObject({ office: "富山地方気象台", level: "解除" });
    expect(entries.at(-1)!.level).toBe("解除");
  });

  it("reads the level a headline names", () => {
    expect(jmaLevel("【新潟県気象警報・注意報】〈危険警報（土砂災害）〉中越では、土砂災害に厳重に警戒してください。")).toBe("危険警報");
    expect(jmaLevel("【東京都気象警報・注意報】大雨特別警報を発表します。")).toBe("特別警報");
    expect(jmaLevel("【東京都気象警報・注意報】大雨警報を発表します。")).toBe("警報");
    expect(jmaLevel("【富山県気象警報・注意報】注意報を解除します。")).toBe("解除");
    expect(jmaLevel("【京都府気象警報・注意報】南部では、空気の乾燥した状態が続くため、火の取り扱いに注意してください。")).toBe("注意報");
    expect(() => parseJmaFeed("<html></html>")).toThrow();
  });
});

describe("wind with a barometer reading", () => {
  it("keeps the wind direction given with a reading, and writes and reads it in the CSV file", async () => {
    const added = await app.api("POST", "/api/weather/readings", {
      takenAt: Date.now() - 60_000,
      value: 1012,
      unit: "hPa",
      heightM: 0,
      windFrom: "SW",
    });
    expect(added.body.reading).toMatchObject({ windFrom: "SW" });
    const plain = await app.api("POST", "/api/weather/readings", { takenAt: Date.now() - 120_000, value: 1011, unit: "hPa", heightM: 0 });
    expect(plain.body.reading.windFrom).toBeNull();
    expect(
      (await app.api("POST", "/api/weather/readings", { takenAt: Date.now(), value: 1011, unit: "hPa", heightM: 0, windFrom: "SOUTH" }))
        .status,
    ).toBe(400);
    const readings = (await app.api("GET", "/api/weather/readings")).body.readings;
    const csv = writeReadingsCsv(readings);
    expect(csv.split("\r\n")[0]).toBe("time,pressure,unit,height_m,wind_from,sea_level_hpa,note,origin");
    const back = readReadingsCsv(csv, { unit: "hPa", heightM: 0, zone: "UTC", existing: new Set(), now: Date.now() });
    expect(back.rows.map((row) => row.windFrom)).toEqual([null, "SW"]);
  });

  it("reads a point of the compass or degrees, and notes a cell it cannot read", () => {
    expect(windPointOf("sw")).toBe("SW");
    expect(windPointOf("225")).toBe("SW");
    expect(windPointOf("350")).toBe("N");
    expect(windPointOf("361")).toBeNull();
    expect(windPointOf("breezy")).toBeNull();
    const result = readReadingsCsv("time,pressure,wind\n2026-11-20T09:00Z,1012,breezy\n", {
      unit: "hPa",
      heightM: 0,
      zone: "UTC",
      existing: new Set(),
      now: Date.now(),
    });
    expect(result.rows[0]).toMatchObject({ windFrom: null, notes: ["“breezy” is not a wind direction; it was left out."] });
  });
});
