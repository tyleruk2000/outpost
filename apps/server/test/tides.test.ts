/**
 * Tide times: the arithmetic (packages/shared/src/tides.ts) against Schureman's table 6 and
 * against NOAA's own published predictions, and the routes over the bundled constants.
 *
 * The published predictions (test/fixtures/tides/noaa-predictions-2027-01.json) were read
 * from NOAA CO-OPS's data API on 21 November 2026: high and low waters for 15 to 21 January
 * 2027 at The Battery (New York, 8518750), San Francisco (9414290), Honolulu (1612340) and
 * Galveston Pier 21 (8771450), and hourly heights for all of January 2027 at the first two,
 * above mean lower low water, in metres, times in UTC. NOAA gives times to the minute and
 * heights to the millimetre.
 *
 * Agreement found when this was written: every high and low within 1 minute and 1 mm at
 * the first three, within 2 minutes and 1 mm at Galveston (where the tide is small and the
 * turns are flat), and every hourly height within 2 mm. The bounds below allow for the
 * rounding of NOAA's own figures and a little more.
 */
import fs from "node:fs";
import path from "node:path";
import {
  type HarmonicStation,
  nodeAngles,
  type TidePredictionResponse,
  type TideStationsResponse,
  tideCurve,
  tideTurns,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import tableJson from "../src/modules/tides/data/noaa-harmonic.json" with { type: "json" };
import ticonJson from "../src/modules/tides/data/ticon4-harmonic.json" with { type: "json" };
import { createTestApp, type TestApp } from "./helpers.ts";

interface Fixture {
  stations: Record<string, { hilo: Array<[string, "H" | "L", number]>; hourly?: { from: string; values: number[] } }>;
}
const fixture: Fixture = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "fixtures/tides/noaa-predictions-2027-01.json"), "utf8"),
);
const table = tableJson as unknown as {
  constituents: string[];
  stations: Array<[string, string, string, number, number, number | null, number[], number[]]>;
};

function station(id: string): HarmonicStation {
  const row = table.stations.find((each) => each[0] === id);
  if (!row) throw new Error(`no station ${id}`);
  return {
    datumOffset: (row[5] ?? 0) / 1000,
    constituents: table.constituents.map((name, i) => ({ name, amplitude: (row[6][i] ?? 0) / 1000, phase: (row[7][i] ?? 0) / 10 })),
  };
}

const ticon = ticonJson as unknown as typeof table;
/** The TICON-4 station nearest a point. */
function ticonStation(lat: number, lon: number): HarmonicStation {
  const near = (row: (typeof ticon.stations)[number]) => Math.hypot(row[3] - lat, (row[4] - lon) * Math.cos((lat * Math.PI) / 180));
  const row = [...ticon.stations].sort((a, b) => near(a) - near(b))[0];
  if (!row || near(row) > 0.05) throw new Error(`no TICON station at ${lat}, ${lon}`);
  return {
    datumOffset: 0,
    constituents: ticon.constituents.map((name, i) => ({ name, amplitude: (row[6][i] ?? 0) / 1000, phase: (row[7][i] ?? 0) / 10 })),
  };
}

const utc = (text: string) => Date.parse(`${text.replace(" ", "T")}:00Z`);

describe("the moon's node (Schureman, table 6)", () => {
  // Rows of table 6 as printed: N, then I, ν, ξ, ν′ and 2ν″ to a hundredth of a degree.
  const rows: Array<[number, number, number, number, number, number]> = [
    [0, 28.6, 0, 0, 0, 0],
    [10, 28.53, 1.87, 1.68, 1.34, 2.83],
    [30, 28.02, 5.48, 4.94, 3.9, 8.25],
    [45, 27.32, 7.94, 7.18, 5.63, 11.82],
  ];
  it.each(rows)("N = %s°", (N, I, nu, xi, nuPrime, twoNu) => {
    const got = nodeAngles(N);
    expect(got.I).toBeCloseTo(I, 1);
    expect(Math.abs(got.nu - nu)).toBeLessThan(0.015);
    expect(Math.abs(got.xi - xi)).toBeLessThan(0.015);
    expect(Math.abs(got.nuPrime - nuPrime)).toBeLessThan(0.015);
    expect(Math.abs(got.twoNuDoublePrime - twoNu)).toBeLessThan(0.015);
  });
  it("is negative when the node is between 180° and 360°", () => {
    const got = nodeAngles(330);
    expect(got.nu).toBeCloseTo(-5.48, 1);
    expect(got.xi).toBeCloseTo(-4.94, 1);
  });
});

describe("predictions against NOAA's published tables", () => {
  const limits: Record<string, number> = { "8518750": 1.5, "9414290": 1.5, "1612340": 1.5, "8771450": 3 };
  for (const [id, minutes] of Object.entries(limits)) {
    it(`high and low water at ${id}: same count, within ${minutes} min and 3 mm`, () => {
      const published = fixture.stations[id]?.hilo ?? [];
      const from = Date.UTC(2027, 0, 15);
      const turns = tideTurns(station(id), from, Date.UTC(2027, 0, 22));
      expect(turns).toHaveLength(published.length);
      published.forEach(([time, type, height], i) => {
        const turn = turns[i];
        expect(turn?.kind).toBe(type === "H" ? "high" : "low");
        expect(Math.abs((turn?.t ?? 0) - utc(time)) / 60_000).toBeLessThanOrEqual(minutes);
        expect(Math.abs((turn?.h ?? 0) - height)).toBeLessThanOrEqual(0.003);
      });
    });
  }

  for (const id of ["8518750", "9414290"]) {
    it(`hourly heights for January 2027 at ${id}, within 3 mm`, () => {
      const hourly = fixture.stations[id]?.hourly;
      if (!hourly) throw new Error("no hourly fixture");
      const from = utc(hourly.from);
      const curve = tideCurve(station(id), from, from + (hourly.values.length - 1) * 3_600_000, 3_600_000);
      let worst = 0;
      hourly.values.forEach((value, i) => {
        worst = Math.max(worst, Math.abs((curve[i]?.h ?? 0) - value));
      });
      expect(worst).toBeLessThanOrEqual(0.003);
    });
  }

  it("carries across the turn of a year without a jump", () => {
    const s = station("8518750");
    const from = Date.UTC(2026, 11, 31, 20);
    const curve = tideCurve(s, from, from + 8 * 3_600_000, 600_000);
    for (let i = 1; i < curve.length; i++) expect(Math.abs((curve[i]?.h ?? 0) - (curve[i - 1]?.h ?? 0))).toBeLessThan(0.1);
  });
});

/**
 * TICON-4's constants for Norwegian ports against the Norwegian Mapping Authority's own
 * published predictions (test/fixtures/tides/kartverket-predictions-2027-01.json: high and
 * low waters for 15 to 21 January 2027 above mean sea level, times in UTC, from
 * Kartverket's water level API, CC BY 4.0, read 21 November 2026).
 *
 * Agreement found when this was written: Bergen within 14 minutes and 2.5 cm, Narvik within
 * 11 minutes and 3.3 cm, Oslo within 15 minutes and 7 cm, the heights taken about a constant
 * difference between the two mean sea levels (at most 2.5 cm). Stavanger, where the tide is
 * about 30 cm and its turns are flat, was out by up to 65 minutes, and is not held here.
 * Bounds are a little looser than found.
 */
describe("TICON-4 predictions against Kartverket's published tables", () => {
  const kartverket = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "fixtures/tides/kartverket-predictions-2027-01.json"), "utf8"),
  ) as { stations: Record<string, { lat: number; lon: number; hilo: Array<[string, "H" | "L", number]> }> };
  const limits: Array<[string, number, number]> = [
    ["Bergen", 15, 0.03],
    ["Narvik", 15, 0.04],
    ["Oslo", 20, 0.08],
  ];
  it.each(limits)("high and low water at %s: same count, within %s min and %s m", (name, minutes, metres) => {
    const published = kartverket.stations[name];
    if (!published) throw new Error(`no fixture for ${name}`);
    const turns = tideTurns(ticonStation(published.lat, published.lon), Date.UTC(2027, 0, 15), Date.UTC(2027, 0, 22));
    expect(turns).toHaveLength(published.hilo.length);
    const offsets = published.hilo.map(([, , height], i) => (turns[i]?.h ?? 0) - height);
    const offset = offsets.reduce((sum, each) => sum + each, 0) / offsets.length;
    expect(Math.abs(offset)).toBeLessThan(0.05);
    published.hilo.forEach(([time, type], i) => {
      const turn = turns[i];
      expect(turn?.kind).toBe(type === "H" ? "high" : "low");
      expect(Math.abs((turn?.t ?? 0) - utc(time)) / 60_000).toBeLessThanOrEqual(minutes);
      expect(Math.abs((offsets[i] ?? 0) - offset)).toBeLessThanOrEqual(metres);
    });
  });
});

describe("tide routes", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("lists the stations nearest a place, nearest first, with the source", async () => {
    // Liberty Island, in New York harbour.
    const { status, body } = await app.api<TideStationsResponse>("GET", "/api/tides/stations?lat=40.6892&lon=-74.0445&limit=3");
    expect(status).toBe(200);
    expect(body.stations).toHaveLength(3);
    expect(body.stations[0]?.id).toBe("8518750");
    expect(body.stations[0]?.distanceKm).toBeLessThan(5);
    expect(body.stations[0]?.datum).toBe("MLLW");
    expect(body.stations[0]?.source).toBe("noaa");
    expect(body.sources.map((each) => each.id)).toEqual(["noaa", "ticon"]);
    expect(body.sources[0]?.licence).toMatch(/public domain/i);
    expect(body.sources[1]?.licence).toMatch(/CC BY 4\.0/);
    expect(body.sources[1]?.count).toBeGreaterThan(2000);
  });

  it("offers gauges on British coasts for a home in London, none more than 100 km away", async () => {
    const { body } = await app.api<TideStationsResponse>("GET", "/api/tides/stations?lat=51.5074&lon=-0.1278&limit=8");
    expect(body.stations.length).toBeGreaterThan(0);
    expect(body.stations.every((each) => each.distanceKm <= body.reachKm)).toBe(true);
    expect(body.stations[0]?.source).toBe("ticon");
    expect(body.stations[0]?.state).toBe("United Kingdom");
    expect(body.stations[0]?.datum).toBe("MSL");
  });

  it("offers nothing far away: no stations, and the nearest of all named with its distance", async () => {
    // The middle of the Sahara.
    const { body } = await app.api<TideStationsResponse>("GET", "/api/tides/stations?lat=23&lon=12");
    expect(body.stations).toEqual([]);
    expect(body.reachKm).toBe(100);
    expect(body.nearest?.distanceKm).toBeGreaterThan(500);
  });

  it("predicts a week at a station", async () => {
    const from = Date.UTC(2027, 0, 15);
    const { status, body } = await app.api<TidePredictionResponse>("GET", `/api/tides/stations/8518750/predictions?from=${from}&days=7`);
    expect(status).toBe(200);
    expect(body.turns.length).toBeGreaterThanOrEqual(26);
    expect(body.curve.length).toBe(7 * 24 * 6 + 1);
    expect(body.station.name).toBe("The Battery");
  });

  it("refuses an unknown station and a span that is too long", async () => {
    const from = Date.UTC(2027, 0, 15);
    expect((await app.api("GET", `/api/tides/stations/0000000/predictions?from=${from}`)).status).toBe(404);
    expect((await app.api("GET", `/api/tides/stations/8518750/predictions?from=${from}&days=400`)).status).toBe(400);
    expect((await app.api("GET", "/api/tides/stations?lat=95&lon=0")).status).toBe(400);
  });
});
