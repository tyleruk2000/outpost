/**
 * Alerts beyond the UK and today's space weather, on a real server with a local
 * stand-in for every publisher, serving the answers recorded on 21 November 2026 in
 * test/fixtures/weather. Nothing is asked for without a press, and the national service
 * asked is the one for the country Home is in.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { hfConditionsWords, type SpaceWeatherData } from "@outpost/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insideCapPolygon, parseGdacs, parseMeteoalarm, parseSwpcWwv } from "../src/modules/weather/alert-parsers.ts";
import { SourceFormatError } from "../src/modules/weather/parsers.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/weather", name), "utf8");

const ANSWERS: Record<string, [string, string]> = {
  "/gdacs/xml/rss.xml": ["gdacs-rss.xml", "application/xml"],
  "/usgs-quakes/earthquakes/feed/v1.0/summary/4.5_week.geojson": ["usgs-4.5-week.geojson", "application/json"],
  "/meteoalarm/feeds/meteoalarm-legacy-atom-united-kingdom": ["meteoalarm-united-kingdom.xml", "application/atom+xml"],
  "/meteoalarm/feeds/meteoalarm-legacy-atom-germany": ["meteoalarm-germany.xml", "application/atom+xml"],
  "/swpc/products/noaa-scales.json": ["swpc-noaa-scales.json", "application/json"],
  "/swpc/products/summary/10cm-flux.json": ["swpc-10cm-flux.json", "application/json"],
  "/swpc/products/noaa-planetary-k-index.json": ["swpc-planetary-k-index.json", "application/json"],
  "/swpc/text/wwv.txt": ["swpc-wwv.txt", "text/plain"],
  "/swpc/text/daily-solar-indices.txt": ["swpc-daily-solar-indices.txt", "text/plain"],
};

let standIn: http.Server;
let base = "";
const asked: Array<{ path: string; agent: string }> = [];
const failing = new Set<string>();

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    asked.push({ path: `${url.pathname}${url.search}`, agent: String(request.headers["user-agent"] ?? "") });
    if (failing.has(url.pathname)) {
      response.writeHead(503, { "content-type": "text/plain" });
      return void response.end("busy");
    }
    if (url.pathname === "/nws-alerts/alerts/active") {
      // The service answers for points in the US and refuses others (recorded: a point in London).
      const [lat, lon] = (url.searchParams.get("point") ?? "").split(",").map(Number);
      const inUs = lat! > 18 && lat! < 72 && lon! < -60;
      response.writeHead(inUs ? 200 : 400, { "content-type": inUs ? "application/geo+json" : "application/problem+json" });
      return void response.end(fixture(inUs ? "nws-alerts.json" : "nws-out-of-bounds.json"));
    }
    const answer = ANSWERS[url.pathname];
    if (!answer) {
      response.writeHead(404);
      return void response.end();
    }
    response.writeHead(200, { "content-type": answer[1] });
    response.end(fixture(answer[0]));
  });
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => standIn.close(() => resolve())));

let app: TestApp;
beforeEach(async () => {
  asked.length = 0;
  failing.clear();
  app = await createTestApp({ OUTPOST_WEATHER_STAND_IN: base }, undefined, { voacapData: false });
});
afterEach(() => app.close());

const home = (lat: number, lon: number) => app.api("POST", "/api/maps/markers", { name: "Home", lat, lon, icon: "home" });
const kept = async (kind: string) =>
  ((await app.api("GET", "/api/weather")).body.kept as Array<{ kind: string; data: never; sent: string }>).find(
    (copy) => copy.kind === kind,
  );

describe("alerts worldwide", () => {
  it("says where Home is taken to be, and asks nobody anything until pressed", async () => {
    expect((await app.api("GET", "/api/weather")).body.alerts).toEqual({
      home: null,
      homeCountry: null,
      homeCountryName: null,
      chosenCountry: null,
      country: null,
      countryName: null,
      national: null,
    });
    await home(50.72, -3.53);
    expect((await app.api("GET", "/api/weather")).body.alerts).toMatchObject({
      home: { name: "Home", lat: 50.72, lon: -3.53 },
      country: "GB",
      national: "meteoalarm",
    });
    expect(asked).toEqual([]);
  });

  it("fetches GDACS and the USGS with no position, and keeps the publishers' words", async () => {
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["gdacs", "quakes"] });
    expect(body.outcomes.map((outcome: { kind: string; ok: boolean }) => [outcome.kind, outcome.ok])).toEqual([
      ["gdacs", true],
      ["quakes", true],
    ]);
    expect(asked.map((line) => line.path)).toEqual(["/gdacs/xml/rss.xml", "/usgs-quakes/earthquakes/feed/v1.0/summary/4.5_week.geojson"]);
    const gdacs = (await kept("gdacs"))!;
    expect(gdacs.sent).toBe("www.gdacs.org: no position");
    const events = (gdacs.data as { events: Array<{ type: string; level: string; title: string; link: string }> }).events;
    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({ type: "EQ", level: "Green", link: expect.stringMatching(/^https:\/\/www\.gdacs\.org\//) });
    expect(events[0]!.title).toMatch(/^Green earthquake \(Magnitude 5\.9M/);
    expect(events.some((event) => event.level === "Orange")).toBe(true);
    const quakes = (await kept("quakes"))!.data as { title: string; quakes: Array<{ mag: number; place: string; time: number }> };
    expect(quakes.title).toMatch(/USGS Magnitude 4\.5\+ Earthquakes/);
    expect(quakes.quakes.length).toBeGreaterThan(0);
    expect(quakes.quakes.map((quake) => quake.time)).toEqual([...quakes.quakes.map((quake) => quake.time)].sort((a, b) => b - a));
  });

  it("asks MeteoAlarm for the country Home is in, by name only, and says which warnings cover Home", async () => {
    await home(50.72, -3.53);
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["meteoalarm"] });
    expect(body.outcomes[0]).toMatchObject({ kind: "meteoalarm", ok: true });
    expect(asked.map((line) => line.path)).toEqual(["/meteoalarm/feeds/meteoalarm-legacy-atom-united-kingdom"]);
    const copy = (await kept("meteoalarm"))!;
    expect(copy.sent).toBe("feeds.meteoalarm.org: the feed for the United Kingdom; no position");
    const data = copy.data as { countryName: string; items: Array<{ area: string; level: string; coversHome: boolean; sent: number }> };
    expect(data.countryName).toBe("the United Kingdom");
    expect(data.items[0]).toMatchObject({ area: "South West England", level: "yellow", coversHome: true });
    expect(data.items[0]!.sent).toBeGreaterThan(0);
  });

  it("asks the National Weather Service for Home's position, rounded, with Outpost's name, only when Home is in the US", async () => {
    await home(37.96123, -121.29456);
    expect((await app.api("GET", "/api/weather")).body.alerts.national).toBe("nws");
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["nws", "meteoalarm"] });
    expect(body.outcomes.map((outcome: { kind: string; ok: boolean }) => [outcome.kind, outcome.ok])).toEqual([
      ["meteoalarm", false],
      ["nws", true],
    ]);
    expect(body.outcomes[0].message).toMatch(/the United States, which MeteoAlarm does not cover/);
    expect(asked).toEqual([{ path: "/nws-alerts/alerts/active?point=37.96,-121.29", agent: expect.stringMatching(/^Outpost/) }]);
    const alerts = ((await kept("nws"))!.data as { alerts: Array<{ event: string; sender: string; instruction: string }> }).alerts;
    expect(alerts).toEqual([expect.objectContaining({ event: "Dense Fog Advisory", sender: "NWS Sacramento CA" })]);
  });

  it("says why there is nothing national to fetch when no saved place is home", async () => {
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["nws"] });
    expect(body.outcomes[0]).toMatchObject({
      ok: false,
      message: expect.stringMatching(/No saved place has the home icon and no country is chosen/),
    });
    expect(asked).toEqual([]);
  });

  it("keeps what it had when a feed fails or answers with something else", async () => {
    await app.api("POST", "/api/weather/update", { kinds: ["gdacs"] });
    const before = await kept("gdacs");
    failing.add("/gdacs/xml/rss.xml");
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["gdacs"] });
    expect(body.outcomes[0]).toMatchObject({ ok: false, message: expect.stringMatching(/answered 503/) });
    expect(await kept("gdacs")).toEqual(before);
    expect(() => parseGdacs("<html><body>Service unavailable</body></html>")).toThrow(SourceFormatError);
  });
});

describe("the readers", () => {
  it("reads a German feed that names its areas by code: whether it covers Home is not known", () => {
    const { data } = parseMeteoalarm(fixture("meteoalarm-germany.xml"), { code: "DE", name: "Germany" }, { lat: 50.94, lon: 6.96 });
    expect(data.items.length).toBe(5);
    expect(data.items.every((item) => item.coversHome === null)).toBe(true);
    expect(data.items.find((item) => item.area === "Stadt Köln")).toMatchObject({ event: "frost", level: "yellow", severity: "Minor" });
  });

  it("tells a point inside a CAP polygon from one outside", () => {
    const square = "50,-4 50,-3 51,-3 51,-4 50,-4";
    expect(insideCapPolygon(square, { lat: 50.5, lon: -3.5 })).toBe(true);
    expect(insideCapPolygon(square, { lat: 52, lon: -3.5 })).toBe(false);
  });

  it("keeps the WWV message as written, without its header", () => {
    const wwv = parseSwpcWwv(fixture("swpc-wwv.txt"))!;
    expect(wwv.issuedAt).toBe(Date.UTC(2026, 10, 21, 9, 5));
    expect(wwv.text).toMatch(/^Solar-terrestrial indices for 20 November follow\.\nSolar flux 103 and estimated planetary A-index 4\./);
    expect(wwv.text).not.toMatch(/Prepared by/);
  });
});

describe("today's space weather", () => {
  it("fetches the five small files on a press and keeps today's figures", async () => {
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["space-weather"] });
    expect(body.outcomes).toEqual([expect.objectContaining({ kind: "space-weather", source: "swpc", ok: true })]);
    expect(asked.map((line) => line.path)).toEqual([
      "/swpc/products/noaa-scales.json",
      "/swpc/products/summary/10cm-flux.json",
      "/swpc/products/noaa-planetary-k-index.json",
      "/swpc/text/wwv.txt",
      "/swpc/text/daily-solar-indices.txt",
    ]);
    const data = (await kept("space-weather"))!.data as SpaceWeatherData;
    expect(data.scales).toEqual({
      at: Date.UTC(2026, 10, 21, 11, 45),
      r: { level: 0, text: "none" },
      s: { level: 0, text: "none" },
      g: { level: 0, text: "none" },
    });
    expect(data.flux).toEqual({ value: 103, at: Date.UTC(2026, 10, 20, 20) });
    expect(data.kp).toEqual({ value: 1.33, at: Date.UTC(2026, 10, 21, 6), a: 5 });
    expect(data.sunspots).toEqual({ value: 62, day: "2026-11-20" });
    expect(hfConditionsWords(data)).toEqual([
      expect.stringMatching(/^No radio blackout, radiation storm or geomagnetic storm is in force/),
    ]);
  });

  it("keeps the scales when a lesser file cannot be had, and fails whole when the scales cannot", async () => {
    failing.add("/swpc/text/wwv.txt");
    const partial = await app.api("POST", "/api/weather/update", { kinds: ["space-weather"] });
    expect(partial.body.outcomes[0].ok).toBe(true);
    expect(((await kept("space-weather"))!.data as SpaceWeatherData).wwv).toBeNull();
    failing.add("/swpc/products/noaa-scales.json");
    const failed = await app.api("POST", "/api/weather/update", { kinds: ["space-weather"] });
    expect(failed.body.outcomes[0]).toMatchObject({ ok: false, message: expect.stringMatching(/answered 503/) });
  });

  it("says in NOAA's words what a blackout or a storm does to HF, and nothing it cannot support", () => {
    const quiet: SpaceWeatherData = { scales: { at: 0, r: null, s: null, g: null }, flux: null, kp: null, wwv: null, sunspots: null };
    const stormy: SpaceWeatherData = {
      ...quiet,
      scales: { at: 0, r: { level: 2, text: "moderate" }, s: { level: 0, text: "none" }, g: { level: 3, text: "strong" } },
    };
    const lines = hfConditionsWords(stormy);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/R2.*"Limited blackout of HF radio communication on sunlit side/);
    expect(lines[1]).toMatch(/G3.*"HF radio may be intermittent"/);
    expect(hfConditionsWords({ ...quiet, kp: { value: 4, at: 0, a: 20 } })[0]).toMatch(/a index is 20, "active"/);
  });
});
