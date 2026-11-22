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
/** Paths that answer 200 with something that is not the publisher's format, until cleared. */
const garbled = new Set<string>();
/** While set, a forecast is not answered until it is. */
let held: Promise<void> | null = null;
/** What the stand-in does with one level measure's readings, by measure id: as recorded unless named here. */
const readingsAs = new Map<string, "stopped" | "scrambled" | "fail" | "garbled">();

/**
 * The recorded readings (one station's, 17 November 2026) as the Agency would answer for
 * any measure: the newest `_limit` of them, newest first. A measure named in `readingsAs`
 * answers as a station that stopped reporting ten days ago, in no order, not at all, or
 * with something that is not the Agency's format.
 */
function levelReadings(measure: string, limit: number): { status: number; body: string } {
  const recorded = JSON.parse(fixture("ea-level-readings.json"));
  let items = (recorded.items as Array<{ dateTime: string; value?: number; measure: string }>).slice(0, limit);
  const as = readingsAs.get(measure);
  if (as === "fail") return { status: 503, body: "busy" };
  if (as === "garbled") return { status: 200, body: "<html>Service unavailable</html>" };
  if (as === "stopped")
    items = items.map((item) => ({
      ...item,
      dateTime: new Date(Date.parse(item.dateTime) - 10 * 86_400_000).toISOString().replace(".000Z", "Z"),
    }));
  if (as === "scrambled") items = [...items.filter((_, i) => i % 2 === 1), ...items.filter((_, i) => i % 2 === 0).reverse()];
  return { status: 200, body: JSON.stringify({ ...recorded, items: items.map((item) => ({ ...item, measure })) }) };
}

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    asked.push(`${url.pathname}${url.search}`);
    const send = (status: number, body: string, type = "application/json") => {
      response.writeHead(status, { "content-type": type });
      response.end(body);
    };
    if ([...failing].some((prefix) => url.pathname.startsWith(prefix))) return send(503, "busy", "text/plain");
    if ([...garbled].some((prefix) => url.pathname.startsWith(prefix))) return send(200, "<html>Service unavailable</html>", "text/html");
    if (url.pathname === "/open-meteo/v1/forecast") {
      if (held) return void held.then(() => send(200, fixture("open-meteo-forecast.json")));
      return send(200, fixture("open-meteo-forecast.json"));
    }
    if (url.pathname === "/met-office-warnings/public/data/PWSCache/WarningsRSS/Region/UK")
      return send(200, fixture("met-office-uk.xml"), "application/rss+xml");
    if (url.pathname === "/ea-flood/flood-monitoring/id/floods") return send(200, fixture("ea-floods.json"));
    if (url.pathname === "/ea-levels/flood-monitoring/id/stations") return send(200, fixture("ea-level-stations.json"));
    const measure = /^\/ea-levels\/flood-monitoring\/id\/measures\/([^/]+)\/readings$/.exec(url.pathname)?.[1];
    if (measure) {
      const answer = levelReadings(decodeURIComponent(measure), Number(url.searchParams.get("_limit") ?? 500));
      return send(answer.status, answer.body, answer.status === 200 ? "application/json" : "text/plain");
    }
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
  readingsAs.clear();
  garbled.clear();
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
    expect(body).toMatchObject({ places: [], kept: [], updateOnOpen: false, riversKm: 8 });
    expect(body.sources.map((source: { host: string }) => source.host)).toEqual([
      "api.open-meteo.com",
      "www.metoffice.gov.uk",
      "environment.data.gov.uk",
      "environment.data.gov.uk",
      "power.larc.nasa.gov",
      "re.jrc.ec.europa.eu",
      "www.gdacs.org",
      "earthquake.usgs.gov",
      "feeds.meteoalarm.org",
      "api.weather.gov",
      "api.weather.gc.ca",
      "alerts.metservice.com",
      "www.data.jma.go.jp",
      "services.swpc.noaa.gov",
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
    // Flood warnings are one request; river levels are fetched as their own kind.
    expect(asked.filter((line) => line.startsWith("/ea-flood/"))).toEqual([
      "/ea-flood/flood-monitoring/id/floods?lat=52.13&long=-0.46&dist=15",
    ]);
    expect(asked.some((line) => line.startsWith("/ea-levels/"))).toBe(false);

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

interface HeldStation {
  id: string;
  distanceKm: number;
  tidal: boolean;
  unit: string;
  typicalLow: number | null;
  recent: Array<{ t: number; v: number }>;
  readingsNote: string | null;
}

describe("river and sea levels", () => {
  /** A place near King's Lynn, where the recorded stations are. */
  async function lynn() {
    const added = await app.api("POST", "/api/weather/places", { name: "Lynn", lat: 52.75, lon: 0.4 });
    expect(added.status).toBe(200);
    return added.body.place as { id: string };
  }
  const rivers = async (placeId: string) => {
    const kept = (await app.api("GET", "/api/weather")).body.kept as Array<{
      kind: string;
      placeId: string;
      fetchedAt: number;
      sent: string;
      bytes: number;
      data: { withinKm: number; listed: number; stations: HeldStation[] };
    }>;
    return kept.find((copy) => copy.kind === "rivers" && copy.placeId === placeId) ?? null;
  };

  it("fetches the stations within the chosen distance on a press, nearest first, each with its latest readings", async () => {
    const place = await lynn();
    expect(asked).toEqual([]);
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["rivers"], placeIds: [place.id] });
    expect(body.outcomes).toEqual([expect.objectContaining({ kind: "rivers", source: "ea-levels", ok: true })]);
    // One request for the list, with every station's scale; one for each station's readings.
    expect(asked[0]).toBe("/ea-levels/flood-monitoring/id/stations?parameter=level&lat=52.75&long=0.40&dist=8&_view=full");
    expect(asked.slice(1)).toEqual([
      "/ea-levels/flood-monitoring/id/measures/E47901-level-tidal_level-i-15_min-mAOD/readings?_sorted&_limit=16",
      "/ea-levels/flood-monitoring/id/measures/E41071-level-stage-i-15_min-m/readings?_sorted&_limit=16",
      "/ea-levels/flood-monitoring/id/measures/E21183-level-stage-i-15_min-mAOD/readings?_sorted&_limit=16",
      "/ea-levels/flood-monitoring/id/measures/E23740-level-stage-i-15_min-mASD/readings?_sorted&_limit=16",
    ]);
    const copy = (await rivers(place.id))!;
    expect(copy.data).toMatchObject({ withinKm: 8, listed: 4 });
    expect(copy.data.stations.map((station) => [station.id, station.distanceKm])).toEqual([
      ["E47901", 0.5],
      ["E41071", 1.4],
      ["E21183", 5.3],
      ["E23740", 6.3],
    ]);
    const kilhams = copy.data.stations[2]!;
    expect(kilhams.recent).toHaveLength(16);
    expect(kilhams.recent.at(-1)).toEqual({ t: Date.UTC(2026, 10, 17, 11, 15), v: 1.091 });
    expect(copy.data.stations[0]).toMatchObject({ tidal: true, typicalLow: null, unit: "mAOD" });
    expect(copy.sent).toBe(
      "environment.data.gov.uk: latitude 52.75, longitude 0.40, within 8 km; then the level measure of each of 4 stations",
    );
    expect(copy.bytes).toBeGreaterThan(Buffer.byteLength(fixture("ea-level-stations.json")));
  });

  it("asks within the distance a person chooses, and refuses one not offered", async () => {
    const place = await lynn();
    expect((await app.api("PUT", "/api/weather/options", { riversKm: 7 })).status).toBe(400);
    expect((await app.api("PUT", "/api/weather/options", { riversKm: 15 })).body).toEqual({
      updateOnOpen: false,
      riversKm: 15,
      alertCountry: null,
    });
    expect((await app.api("GET", "/api/weather")).body.riversKm).toBe(15);
    expect(asked).toEqual([]);
    await app.api("POST", "/api/weather/update", { kinds: ["rivers"] });
    expect(asked[0]).toContain("dist=15&_view=full");
    expect((await rivers(place.id))!.data.stations).toHaveLength(6);
  });

  it("keeps a station that has stopped reporting with its old readings, and reads readings out of order", async () => {
    const place = await lynn();
    await app.api("PUT", "/api/weather/options", { riversKm: 15 });
    readingsAs.set("E21050-level-stage-i-15_min-m", "stopped");
    readingsAs.set("E23740-level-stage-i-15_min-mASD", "scrambled");
    await app.api("POST", "/api/weather/update", { kinds: ["rivers"] });
    const copy = (await rivers(place.id))!;
    const stopped = copy.data.stations.find((station) => station.id === "E21050")!;
    expect(stopped.recent.at(-1)!.t).toBe(Date.UTC(2026, 10, 7, 11, 15));
    const scrambled = copy.data.stations.find((station) => station.id === "E23740")!;
    const times = scrambled.recent.map((reading) => reading.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times).toHaveLength(16);
  });

  it("keeps the other stations when one station's readings cannot be had, and says why", async () => {
    const place = await lynn();
    readingsAs.set("E41071-level-stage-i-15_min-m", "fail");
    readingsAs.set("E21183-level-stage-i-15_min-mAOD", "garbled");
    const { body } = await app.api("POST", "/api/weather/update", { kinds: ["rivers"] });
    expect(body.outcomes[0].ok).toBe(true);
    const stations = (await rivers(place.id))!.data.stations;
    expect(stations.find((station) => station.id === "E41071")).toMatchObject({
      recent: [],
      readingsNote: expect.stringMatching(/answered 503/),
    });
    expect(stations.find((station) => station.id === "E21183")).toMatchObject({
      recent: [],
      readingsNote: expect.stringMatching(/could not be read/),
    });
    expect(stations.find((station) => station.id === "E23740")!.recent).toHaveLength(16);
  });

  it("keeps the last copy when the Agency is down or answers with something else, and says why", async () => {
    const place = await lynn();
    await app.api("POST", "/api/weather/update", { kinds: ["rivers"] });
    const before = (await rivers(place.id))!;
    failing.add("/ea-levels/");
    let outcome = (await app.api("POST", "/api/weather/update", { kinds: ["rivers"] })).body.outcomes[0];
    expect(outcome).toMatchObject({ ok: false, message: "Environment Agency answered 503." });
    failing.clear();
    garbled.add("/ea-levels/flood-monitoring/id/stations");
    outcome = (await app.api("POST", "/api/weather/update", { kinds: ["rivers"] })).body.outcomes[0];
    expect(outcome).toMatchObject({ ok: false, message: "The Environment Agency did not answer with JSON. Nothing was changed." });
    expect(await rivers(place.id)).toEqual(before);
  });

  it("says there is no station near a place outside the Agency's stations", async () => {
    const place = await homePlace();
    await app.api("POST", "/api/weather/update", { kinds: ["rivers"] });
    expect((await rivers(place.id))!.data).toEqual({ withinKm: 8, listed: 0, stations: [] });
    expect(asked.filter((line) => line.startsWith("/ea-levels/"))).toHaveLength(1);
  });

  it("fetches a station's last three days on its own press, keeps them with the place, and clears them with it", async () => {
    const place = await lynn();
    const early = await app.api("POST", "/api/weather/river-readings", { placeId: place.id, stationId: "E21183" });
    expect(early.status).toBe(404);
    await app.api("POST", "/api/weather/update", { kinds: ["rivers"] });
    asked.length = 0;
    const before = Date.now();
    const { status, body } = await app.api("POST", "/api/weather/river-readings", { placeId: place.id, stationId: "E21183" });
    expect(status).toBe(200);
    expect(body.readings).toMatchObject({ stationId: "E21183", measureId: "E21183-level-stage-i-15_min-mAOD", unit: "mAOD" });
    expect(body.readings.readings).toHaveLength(96);
    expect(body.readings.since).toBeGreaterThanOrEqual(before - 3 * 86_400_000 - 1000);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(
      /^\/ea-levels\/flood-monitoring\/id\/measures\/E21183-level-stage-i-15_min-mAOD\/readings\?since=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z&_limit=10000$/,
    );
    await app.api("POST", "/api/weather/river-readings", { placeId: place.id, stationId: "E47901" });
    let kept = (await app.api("GET", "/api/weather")).body.kept;
    const history = kept.find((copy: { kind: string }) => copy.kind === "river-readings");
    expect(history.data.stations.map((entry: { stationId: string }) => entry.stationId)).toEqual(["E47901", "E21183"]);
    expect(history.sent).toBe("environment.data.gov.uk: the level measure of station E47901; no position");

    // The Agency down: refused with its reason, and what was held stays.
    failing.add("/ea-levels/");
    const down = await app.api("POST", "/api/weather/river-readings", { placeId: place.id, stationId: "E21183" });
    expect(down.status).toBe(502);
    expect(down.body.error.message).toBe("Environment Agency answered 503.");
    kept = (await app.api("GET", "/api/weather")).body.kept;
    expect(kept.find((copy: { kind: string }) => copy.kind === "river-readings").data).toEqual(history.data);

    // Counted and cleared with the other copies under Manage and clean up.
    expect(app.ctx.services.weather.count().copies).toBe(2);
    expect((await app.api("DELETE", `/api/weather/places/${place.id}`)).status).toBe(200);
    expect((await app.api("GET", "/api/weather")).body.kept).toEqual([]);
  });

  it("refuses a station's readings through Update now, and a station reference that is not one", async () => {
    const place = await lynn();
    expect((await app.api("POST", "/api/weather/update", { kinds: ["river-readings"] })).status).toBe(400);
    expect((await app.api("POST", "/api/weather/river-readings", { placeId: place.id, stationId: "../x" })).status).toBe(400);
    expect(asked).toEqual([]);
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

  it("says how each pressure or height that was not a plain number was read", async () => {
    const text = ["time;pressure;height", "2026-11-16 06:00;1.013,2;12,5", "2026-11-16 09:00;1012;10"].join("\n");
    const { status, body } = await app.api("POST", "/api/weather/readings/import", {
      text,
      unit: "hPa",
      heightM: 0,
      zone: "Europe/London",
    });
    expect(status).toBe(200);
    expect(body.rows[0]).toMatchObject({ value: 1013.2, heightM: 12.5, notes: ["“1.013,2” read as 1013.2.", "“12,5” read as 12.5."] });
    expect(body.rows[1]).toMatchObject({ value: 1012, heightM: 10, notes: [] });
  });

  it("clears readings all at once or by range, saves them as CSV first, and leaves places and copies alone", async () => {
    await homePlace();
    await app.api("POST", "/api/weather/update", { kinds: ["forecast"] });
    const day = (d: number, h = 9) => Date.UTC(2026, 10, d, h);
    for (const d of [10, 11, 12, 13, 14]) {
      const note = d === 12 ? "=1+1, bad run" : "";
      expect(
        (await app.api("POST", "/api/weather/readings", { takenAt: day(d), value: 1010 + d, unit: "hPa", heightM: 0, note })).status,
      ).toBe(200);
    }
    asked.length = 0;

    // The CSV of a range reads back as the same readings, and no note can start a formula.
    const csv = await app.api("GET", `/api/weather/readings/export?from=${day(11, 0)}&to=${day(13, 0)}`);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.headers["content-disposition"]).toBe('attachment; filename="barometer-readings-2026-11-11-to-2026-11-12.csv"');
    expect(String(csv.body).split("\r\n")).toEqual([
      "time,pressure,unit,height_m,wind_from,sea_level_hpa,note,origin",
      "2026-11-11T09:00:00Z,1021,hPa,0,,1021.0,,typed",
      '2026-11-12T09:00:00Z,1022,hPa,0,,1022.0,"\'=1+1, bad run",typed',
      "",
    ]);
    const back = await app.api("POST", "/api/weather/readings/import", { text: csv.body, unit: "inHg", heightM: 300, zone: "Asia/Tokyo" });
    expect(back.body.rows.map((row: { takenAt: number; duplicate: boolean }) => [row.takenAt, row.duplicate])).toEqual([
      [day(11), true],
      [day(12), true],
    ]);
    expect((await app.api("GET", "/api/weather/readings/export?before=5&from=1")).status).toBe(400);

    // A count that is no longer true removes nothing.
    const stale = await app.api("POST", "/api/weather/readings/clear", { range: { range: "before", before: day(12, 0) }, expected: 3 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toMatch(/2 readings are in that range now. Nothing was removed/);
    expect((await app.api("GET", "/api/weather/readings")).body.readings).toHaveLength(5);

    const before = await app.api("POST", "/api/weather/readings/clear", { range: { range: "before", before: day(12, 0) }, expected: 2 });
    expect(before.body).toEqual({ removed: 2 });
    const between = await app.api("POST", "/api/weather/readings/clear", { range: { range: "between", from: day(13, 0), to: day(14, 0) } });
    expect(between.body).toEqual({ removed: 1 });
    expect((await app.api("GET", "/api/weather/readings")).body.readings.map((r: { takenAt: number }) => r.takenAt)).toEqual([
      day(12),
      day(14),
    ]);
    expect(
      (await app.api("POST", "/api/weather/readings/clear", { range: { range: "between", from: day(14, 0), to: day(13, 0) } })).status,
    ).toBe(400);
    expect((await app.api("POST", "/api/weather/readings/clear", { range: { range: "some" } })).status).toBe(400);

    const all = await app.api("POST", "/api/weather/readings/clear", { range: { range: "all" }, expected: 2 });
    expect(all.body).toEqual({ removed: 2 });
    expect((await app.api("GET", "/api/weather/readings")).body.readings).toEqual([]);
    const after = (await app.api("GET", "/api/weather")).body;
    expect(after.places).toHaveLength(1);
    expect(after.kept).toHaveLength(1);
    expect(asked).toEqual([]);
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
