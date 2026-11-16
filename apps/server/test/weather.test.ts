/**
 * Weather and hazards on a real server, with a local stand-in for every publisher
 * (`OUTPOST_WEATHER_STAND_IN`) serving the recorded answers in test/fixtures/weather.
 * The stand-in writes down every request, so that "nothing is fetched without a press"
 * is checked, not assumed.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/weather", name), "utf8");

let standIn: http.Server;
let base = "";
const asked: string[] = [];
/** Paths that answer with a failure until cleared. */
const failing = new Set<string>();
/** While set, a forecast is not answered until it is. */
let held: Promise<void> | null = null;

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    asked.push(`${url.pathname}${url.search}`);
    const send = (status: number, body: string, type = "application/json") => {
      response.writeHead(status, { "content-type": type });
      response.end(body);
    };
    if ([...failing].some((prefix) => url.pathname.startsWith(prefix))) return send(503, "busy", "text/plain");
    if (url.pathname === "/open-meteo/v1/forecast") {
      if (held) return void held.then(() => send(200, fixture("open-meteo-forecast.json")));
      return send(200, fixture("open-meteo-forecast.json"));
    }
    if (url.pathname === "/met-office-warnings/public/data/PWSCache/WarningsRSS/Region/UK")
      return send(200, fixture("met-office-uk.xml"), "application/rss+xml");
    if (url.pathname === "/ea-flood/flood-monitoring/id/floods") return send(200, fixture("ea-floods.json"));
    if (url.pathname === "/ea-flood/flood-monitoring/id/stations") return send(200, fixture("ea-stations.json"));
    if (url.pathname.startsWith("/ea-flood/flood-monitoring/id/stations/")) return send(200, fixture("ea-station-E21609.json"));
    if (url.pathname === "/nasa-power/api/temporal/climatology/point") return send(200, fixture("nasa-power-climatology.json"));
    if (url.pathname === "/pvgis/api/v5_3/MRcalc") return send(200, fixture("pvgis-mrcalc.json"));
    send(404, "{}");
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

async function homePlace(name = "Home", icon = "home", lat = 52.13, lon = -0.46) {
  const marker = await app.api("POST", "/api/maps/markers", { name, lat, lon, icon });
  expect(marker.status).toBe(200);
  const added = await app.api("POST", "/api/weather/places", { markerId: marker.body.marker?.id ?? marker.body.id, region: "ee" });
  expect(added.status).toBe(200);
  return added.body.place;
}

describe("a place removed while it is being updated", () => {
  it("keeps nothing for it: removal wins, and the answer that arrives after is dropped", async () => {
    const place = await homePlace();
    let release = () => {};
    held = new Promise<void>((resolve) => (release = resolve));
    try {
      const update = app.api("POST", "/api/weather/update", { kinds: ["forecast", "climate"] });
      for (let i = 0; i < 200 && !asked.some((line) => line.startsWith("/open-meteo/")); i += 1)
        await new Promise((r) => setTimeout(r, 10));
      expect(asked.some((line) => line.startsWith("/open-meteo/"))).toBe(true);
      expect((await app.api("DELETE", `/api/weather/places/${place.id}`)).status).toBe(200);
      release();
      const { body } = await update;
      expect(body.outcomes).toEqual([
        expect.objectContaining({
          kind: "forecast",
          placeId: place.id,
          ok: false,
          message: expect.stringMatching(/removed while/),
          bytes: 0,
        }),
        expect.objectContaining({
          kind: "climate",
          placeId: place.id,
          ok: false,
          message: expect.stringMatching(/removed while/),
          bytes: 0,
        }),
      ]);
      // Nothing more was asked about the place once it had gone.
      expect(asked.some((line) => line.startsWith("/nasa-power/"))).toBe(false);
    } finally {
      held = null;
      release();
    }
    const after = (await app.api("GET", "/api/weather")).body;
    expect(after.kept.filter((copy: { placeId: string | null }) => copy.placeId !== null)).toEqual([]);
  });

  it("clears copies left for a place that has gone when the server starts", async () => {
    const place = await homePlace();
    await app.api("POST", "/api/weather/update", { kinds: ["forecast"] });
    // As an older version could leave it: the place gone, its copy still kept.
    app.ctx.sqlite.prepare("DELETE FROM weather_places WHERE id = ?").run(place.id);
    expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM weather_cache WHERE place_id = ?").get(place.id)).toEqual({ n: 1 });
    const dir = app.dir;
    await app.app.close();
    const again = await createTestApp({ OUTPOST_WEATHER_STAND_IN: base }, dir, { voacapData: false });
    try {
      expect(again.ctx.sqlite.prepare("SELECT count(*) AS n FROM weather_cache WHERE place_id = ?").get(place.id)).toEqual({ n: 0 });
    } finally {
      await again.close();
    }
  });
});

describe("weather and hazards", () => {
  it("starts empty, says nothing is kept, and asks nobody for anything", async () => {
    const { status, body } = await app.api("GET", "/api/weather");
    expect(status).toBe(200);
    expect(body).toMatchObject({ places: [], kept: [], updateOnOpen: false });
    expect(body.sources.map((source: { host: string }) => source.host)).toEqual([
      "api.open-meteo.com",
      "www.metoffice.gov.uk",
      "environment.data.gov.uk",
      "power.larc.nasa.gov",
      "re.jrc.ec.europa.eu",
    ]);
    await app.api("GET", "/api/weather/home-warnings");
    await app.api("GET", "/api/weather/readings");
    expect(asked).toEqual([]);
  });

  it("adds a saved place, knows it is home, and fetches only when asked", async () => {
    const place = await homePlace();
    expect(place).toMatchObject({ name: "Home", isHome: true, region: "ee", lat: 52.13, lon: -0.46 });
    await app.api("GET", "/api/weather");
    expect(asked).toEqual([]);

    const { status, body } = await app.api("POST", "/api/weather/update", { kinds: ["forecast", "warnings", "flood"] });
    expect(status).toBe(200);
    expect(body.outcomes.map((outcome: { kind: string; ok: boolean }) => [outcome.kind, outcome.ok])).toEqual([
      ["warnings", true],
      ["forecast", true],
      ["flood", true],
    ]);
    // The position is sent rounded to two places, and the UK's warnings with none at all.
    expect(asked.find((line) => line.startsWith("/open-meteo/"))).toContain("latitude=52.13&longitude=-0.46");
    expect(asked.find((line) => line.startsWith("/met-office-warnings/"))).toBe(
      "/met-office-warnings/public/data/PWSCache/WarningsRSS/Region/UK",
    );
    expect(asked.filter((line) => line.startsWith("/ea-flood/flood-monitoring/id/stations/"))).toHaveLength(3);

    const kept = (await app.api("GET", "/api/weather")).body.kept as Array<{
      kind: string;
      bytes: number;
      sent: string;
      placeId: string | null;
    }>;
    expect(kept.map((copy) => copy.kind).sort()).toEqual(["flood", "forecast", "warnings"]);
    const forecast = kept.find((copy) => copy.kind === "forecast")!;
    expect(forecast.bytes).toBe(Buffer.byteLength(fixture("open-meteo-forecast.json")));
    expect(forecast.sent).toBe("api.open-meteo.com: latitude 52.13, longitude -0.46");
    expect(kept.find((copy) => copy.kind === "warnings")!.placeId).toBeNull();
  });

  it("keeps the last copy when an update fails, and says why", async () => {
    await homePlace();
    await app.api("POST", "/api/weather/update", { kinds: ["forecast"] });
    const before = (await app.api("GET", "/api/weather")).body.kept[0];
    failing.add("/open-meteo/");
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["forecast"] });
    expect(body.outcomes[0]).toMatchObject({ ok: false, message: "Open-Meteo answered 503." });
    const after = (await app.api("GET", "/api/weather")).body.kept[0];
    expect(after.fetchedAt).toBe(before.fetchedAt);
  });

  it("fetches climate averages and sunshine on their own press", async () => {
    const place = await homePlace();
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["climate", "solar"], placeIds: [place.id] });
    expect(body.outcomes.every((outcome: { ok: boolean }) => outcome.ok)).toBe(true);
    expect(asked.some((line) => line.startsWith("/nasa-power/") && line.includes("latitude=52.13"))).toBe(true);
    expect(asked.some((line) => line.startsWith("/pvgis/") && line.includes("lat=52.13&lon=-0.46"))).toBe(true);
    const solar = (await app.api("GET", "/api/weather")).body.kept.find((copy: { kind: string }) => copy.kind === "solar");
    expect(solar.data.optimal).toHaveLength(12);
  });

  it("asks for a place before fetching a forecast", async () => {
    const { status, body } = await app.api("POST", "/api/weather/update", { kinds: ["forecast"] });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/Choose a place first/);
    expect(asked).toEqual([]);
  });

  it("refuses a request that is not from Outpost's own pages", async () => {
    await homePlace();
    const response = await app.app.inject({
      method: "POST",
      url: "/api/weather/update",
      payload: { kinds: ["forecast"] },
      headers: { host: "localhost" },
    });
    expect(response.statusCode).toBe(403);
    expect(asked).toEqual([]);
  });

  it("tells the scenario planner what was in force for the home place", async () => {
    const empty = (await app.api("GET", "/api/weather/home-warnings")).body;
    expect(empty).toMatchObject({ place: null, fetchedAt: null, weather: [], flood: [] });

    const place = await homePlace();
    await app.api("PATCH", `/api/weather/places/${place.id}`, { region: "em" });
    await app.api("POST", "/api/weather/update", { kinds: ["warnings", "flood"] });
    const { body } = await app.api("GET", "/api/weather/home-warnings");
    expect(body.place).toEqual({ id: place.id, name: "Home", region: "East Midlands" });
    // The recorded feed's East Midlands warning runs to 11:00 on 17 November 2026.
    const inForce = Date.now() < Date.UTC(2026, 10, 17, 11);
    expect(body.weather.map((item: { title: string }) => item.title)).toEqual(
      inForce ? ["Yellow warning of snow affecting East Midlands"] : [],
    );
    expect(body.flood.map((warning: { severity: string }) => warning.severity)).toEqual(["Flood alert"]);
    expect(body.note).toMatch(/Outpost's copy may be out of date; the live warnings are at https:\/\/www\.metoffice\.gov\.uk/);
    expect(body.stale).toBe(false);
  });

  it("takes home to be the saved place with the home icon, the first saved if several, and says so when there is none or it is not listed", async () => {
    const none = (await app.api("GET", "/api/weather/home-warnings")).body;
    expect(none).toMatchObject({ place: null, homeMarker: null });
    expect(none.note).toMatch(/^No saved place has the home icon/);

    const first = await app.api("POST", "/api/maps/markers", { name: "Cottage", lat: 52.1, lon: -0.4, icon: "home" });
    const firstId = first.body.marker?.id ?? first.body.id;
    const unlisted = (await app.api("GET", "/api/weather/home-warnings")).body;
    expect(unlisted).toMatchObject({ place: null, homeMarker: { id: firstId, name: "Cottage" } });
    expect(unlisted.note).toMatch(/^Cottage is home, but it is not in the weather list/);

    // A second place with the home icon, saved later and starred (which puts it first on the map's list), is not home.
    const second = await homePlace("Flat");
    const secondMarker = second.markerId as string;
    await app.api("PATCH", `/api/maps/markers/${secondMarker}`, { isFavorite: true });
    expect((await app.api("GET", "/api/weather")).body.places.map((place: { isHome: boolean }) => place.isHome)).toEqual([false]);
    const added = await app.api("POST", "/api/weather/places", { markerId: firstId });
    expect(added.body.place.isHome).toBe(true);
    expect((await app.api("GET", "/api/weather/home-warnings")).body.place).toMatchObject({ id: added.body.place.id, name: "Cottage" });
    expect(asked).toEqual([]);
  });

  it("keeps the 'update when I open' choice, off until ticked", async () => {
    expect((await app.api("PUT", "/api/weather/options", { updateOnOpen: true })).status).toBe(200);
    expect((await app.api("GET", "/api/weather")).body.updateOnOpen).toBe(true);
    expect(asked).toEqual([]);
  });

  it("removes a place with its copies, and one copy on its own", async () => {
    const place = await homePlace();
    await app.api("POST", "/api/weather/update", { kinds: ["forecast", "warnings"] });
    let kept = (await app.api("GET", "/api/weather")).body.kept;
    const warnings = kept.find((copy: { kind: string }) => copy.kind === "warnings");
    expect((await app.api("DELETE", `/api/weather/kept/${warnings.id}`)).status).toBe(200);
    expect((await app.api("DELETE", `/api/weather/places/${place.id}`)).status).toBe(200);
    kept = (await app.api("GET", "/api/weather")).body.kept;
    expect(kept).toEqual([]);
  });
});

describe("barometer readings", () => {
  it("keeps a reading with its height, reduced to sea level", async () => {
    const takenAt = Date.UTC(2026, 10, 16, 9, 0);
    const { status, body } = await app.api("POST", "/api/weather/readings", {
      takenAt,
      value: 29.53,
      unit: "inHg",
      heightM: 100,
      note: "Hall",
    });
    expect(status).toBe(200);
    expect(body.reading.stationHpa).toBeCloseTo(29.53 * 33.8639, 6);
    expect(body.reading.seaLevelHpa).toBeCloseTo(1011.94, 1);
    const listed = (await app.api("GET", "/api/weather/readings")).body.readings;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ unit: "inHg", heightM: 100, origin: "typed", note: "Hall" });
  });

  it("refuses a reading that cannot be right at that height", async () => {
    const { status, body } = await app.api("POST", "/api/weather/readings", { takenAt: Date.now(), value: 1013, unit: "inHg", heightM: 0 });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/Check the unit and the height/);
  });

  it("reads a file, says what it would add, and adds only what is new", async () => {
    const text = [
      "time,pressure,unit",
      "2026-11-16 06:00,1009.2,hPa",
      "2026-11-16 09:00,1006.1,hPa",
      "2026-11-16 12:00,bad,hPa",
      "16/11/2026 15:00,29.62,inHg",
    ].join("\n");
    const preview = await app.api("POST", "/api/weather/readings/import", { text, unit: "hPa", heightM: 50, zone: "Europe/London" });
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(3);
    expect(preview.body.problems).toEqual([{ line: 4, message: '"bad" is not a pressure.' }]);
    expect(preview.body.added).toBe(0);
    expect((await app.api("GET", "/api/weather/readings")).body.readings).toHaveLength(0);

    const applied = await app.api("POST", "/api/weather/readings/import", {
      text,
      unit: "hPa",
      heightM: 50,
      zone: "Europe/London",
      apply: true,
    });
    expect(applied.body.added).toBe(3);
    const again = await app.api("POST", "/api/weather/readings/import", {
      text,
      unit: "hPa",
      heightM: 50,
      zone: "Europe/London",
      apply: true,
    });
    expect(again.body.added).toBe(0);
    expect(again.body.rows.every((row: { duplicate: boolean }) => row.duplicate)).toBe(true);
    const readings = (await app.api("GET", "/api/weather/readings")).body.readings;
    expect(readings.map((reading: { takenAt: number }) => reading.takenAt)).toEqual([
      Date.UTC(2026, 10, 16, 6),
      Date.UTC(2026, 10, 16, 9),
      Date.UTC(2026, 10, 16, 15),
    ]);
    expect(readings[2]).toMatchObject({ unit: "inHg", origin: "file" });
  });

  it("reads a time with no zone in the device's zone", async () => {
    const text = "date,time,hPa\n2026-07-01,12:00,1015\n";
    const { body } = await app.api("POST", "/api/weather/readings/import", { text, unit: "hPa", heightM: 0, zone: "Europe/London" });
    expect(body.rows[0].takenAt).toBe(Date.UTC(2026, 6, 1, 11, 0));
    const tokyo = await app.api("POST", "/api/weather/readings/import", { text, unit: "hPa", heightM: 0, zone: "Asia/Tokyo" });
    expect(tokyo.body.rows[0].takenAt).toBe(Date.UTC(2026, 6, 1, 3, 0));
  });
});

describe("weather under Manage and clean up", () => {
  it("lists the fetched copies with their size, and clears them, leaving places and readings", async () => {
    await homePlace();
    await app.api("POST", "/api/weather/update", { kinds: ["forecast", "warnings"] });
    await app.api("POST", "/api/weather/readings", { takenAt: Date.now() - 60_000, value: 1012, unit: "hPa", heightM: 0 });
    const leftovers = (await app.api("GET", "/api/manage/leftovers")).body.items;
    const weather = leftovers.find((item: { id: string }) => item.id === "cache:weather");
    expect(weather).toMatchObject({ kind: "cache", count: 2, href: "/prepare/weather" });
    expect(weather.bytes).toBeGreaterThan(1000);
    const cleared = await app.api("POST", "/api/manage/leftovers/clear", { ids: ["cache:weather"] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.cleared.count).toBe(2);
    const after = (await app.api("GET", "/api/weather")).body;
    expect(after.kept).toEqual([]);
    expect(after.places).toHaveLength(1);
    expect((await app.api("GET", "/api/weather/readings")).body.readings).toHaveLength(1);
  });

  it("counts readings in the database, and erase everything takes all of it", async () => {
    await homePlace();
    await app.api("POST", "/api/weather/update", { kinds: ["forecast"] });
    await app.api("POST", "/api/weather/readings", { takenAt: Date.now() - 60_000, value: 1012, unit: "hPa", heightM: 0 });
    const plan = await app.api("POST", "/api/manage/plan", { scope: "everything" });
    expect(plan.body.personal.weather).toMatchObject({ places: 1, readings: 1, copies: 1 });
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const after = (await app.api("GET", "/api/weather")).body;
    expect(after.places).toEqual([]);
    expect(after.kept).toEqual([]);
    expect((await app.api("GET", "/api/weather/readings")).body.readings).toEqual([]);
  });
});
