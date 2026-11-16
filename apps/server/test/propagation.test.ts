/**
 * HF propagation through the API: the acceptance path, where its sunspot number comes
 * from, what is kept, equipment profiles, the data it rests on, and what happens when
 * the engine or its data is not there. No test reaches the internet.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  ANTENNA_PRESETS,
  type CompareResult,
  HF_BANDS,
  haversineMeters,
  initialBearingDeg,
  type PredictionRequest,
  type PredictionResult,
  type PropagationDatasets,
  steepPathGeometry,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRoot } from "../src/core/paths.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const dipole = ANTENNA_PRESETS.find((preset) => preset.id === "low-dipole")!.spec;

/** The owner's acceptance scenario: London to Birmingham, 40 m, 5 W, low dipoles, urban noise, 16 November 2026. */
const acceptance: PredictionRequest = {
  tx: { name: "London", lat: 51.5074, lon: -0.1278 },
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

let app: TestApp;
let fixture: http.Server;
let served = "";
let hits = 0;

beforeAll(async () => {
  fixture = http.createServer((_request, response) => {
    hits += 1;
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(served) });
    response.end(served);
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  app = await createTestApp({
    OUTPOST_SOLAR_TABLE_URL: `http://127.0.0.1:${(fixture.address() as AddressInfo).port}/predicted-solar-cycle.json`,
  });
});

afterAll(async () => {
  await app.close();
  await new Promise((resolve) => fixture.close(resolve));
});

const predict = (patch: Partial<PredictionRequest> = {}) =>
  app.api<PredictionResult>("POST", "/api/radio/propagation/predict", { ...acceptance, ...patch });

describe("the acceptance path", () => {
  it("is worked out by the engine, with where every figure came from", async () => {
    const { status, body } = await predict();
    expect(status).toBe(200);
    expect(body.engine.name).toBe("VOACAP");
    expect(body.engine.model).toMatch(/^VOACAP Version 16/);
    expect(body.engine.implementation).toContain("hfcast");
    expect(body.datasets.map((dataset) => dataset.id)).toEqual(["voacap-coefficients", "solar-cycle"]);
    expect(body.hours).toHaveLength(24);
    expect(body.deck).toContain("CIRCUIT   51.51N     0.13W    52.49N     1.89W");
    expect(body.deck).toContain("SUNSPOT     83.");
    expect(body.antennas.tx).toContain("Horizontal half-wave dipole (VOACAP type 23), 5 m above average ground");
    expect(body.limits.join(" ")).toContain("monthly median");
  });

  it("measures the path as the map does", async () => {
    const { body } = await predict();
    // The engine works on a sphere of its own radius from positions rounded to a hundredth of a degree.
    const metres = haversineMeters(51.51, -0.13, 52.49, -1.89);
    expect(Math.abs(body.path.distanceKm - metres / 1000)).toBeLessThan(0.5);
    expect(Math.abs(body.path.bearingDeg - initialBearingDeg({ lat: 51.51, lon: -0.13 }, { lat: 52.49, lon: -1.89 }))).toBeLessThan(0.2);
    expect(body.path.txLocator).toBe("IO91WM");
    expect(body.path.rxLocator).toBe("IO92BL");
  });

  it("does not conclude that 40 m works because the path is short", async () => {
    const { body } = await predict();
    const at = (utc: number) => body.hours[utc - 1]!;
    // At 03:00 in November the ionosphere overhead returns nothing as high as 7.1 MHz.
    expect(at(3).mufMhz).toBeLessThan(7.1);
    expect(at(3).ionosphere.foF2).toBeLessThan(5);
    expect(at(3).asked.reliability).toBeLessThan(0.05);
    // At midday it does, steeply, and the figures say how well.
    expect(at(12).mufMhz).toBeGreaterThan(7.1);
    expect(at(12).asked.path).toBe("1F2");
    expect(at(12).asked.takeoffDeg).toBeGreaterThan(60);
    expect(at(12).asked.reliability).toBeGreaterThan(at(3).asked.reliability);
    // 80 m is the better band at night: the alternatives come from the same run.
    const eighty = HF_BANDS.findIndex((band) => band.id === "80m");
    const forty = HF_BANDS.findIndex((band) => band.id === "40m");
    expect(at(3).bands[eighty]!.reliability).toBeGreaterThan(at(3).bands[forty]!.reliability);
    expect(at(12).bands[forty]).toEqual(at(12).asked);
  });

  it("keeps geometry, signal-to-noise ratio and reliability apart", async () => {
    const { body } = await predict();
    const noon = body.hours[11]!;
    const geometry = steepPathGeometry(body.path.distanceKm, noon.asked.virtualHeightKm);
    // The triangle gives nearly the angle the engine launches at; it is a check on the geometry, not the prediction.
    expect(Math.abs(geometry.elevationDeg - noon.asked.takeoffDeg)).toBeLessThan(2);
    expect(noon.asked.snrDbHz).toBeCloseTo(noon.asked.signalDbw - noon.asked.noiseDbwHz, 0);
    expect(noon.asked.reliability).toBeGreaterThan(0);
    expect(noon.asked.reliability).toBeLessThan(1);
  });

  it("gives each mode its own answer", async () => {
    const { body } = await predict();
    const byMode = Object.fromEntries(
      body.modes.map((mode, index) => [mode.id, { mode, reliability: body.hours[11]!.modeReliability[index] }]),
    );
    expect(byMode.ssb!.mode.requiredSnrDbHz).toBe(45);
    expect(byMode.cw!.mode.requiredSnrDbHz).toBe(24);
    expect(byMode.ft8!.mode.requiredSnrDbHz).toBe(15.2);
    expect(byMode.js8!.mode.requiredSnrDbHz).toBe(10);
    expect(new Set([byMode.cw!.mode.requiredSnrDbHz, byMode.ft8!.mode.requiredSnrDbHz, byMode.js8!.mode.requiredSnrDbHz]).size).toBe(3);
    expect(byMode.cw!.reliability!).toBeGreaterThan(byMode.ssb!.reliability!);
    expect(byMode.ft8!.reliability!).toBeGreaterThanOrEqual(byMode.cw!.reliability!);
    // A mode with no published figure gets no reliability rather than an invented one.
    expect(byMode.digital!.mode.requiredSnrDb).toBeNull();
    expect(byMode.digital!.reliability).toBeNull();
    const own = await predict({ mode: "digital" });
    expect(own.body.hours[11]!.asked.reliability).toBe(0);
    expect(own.body.hours[11]!.lufMhz).toBeNull();
    expect(own.body.hours[11]!.asked.snrDbHz).toBe(body.hours[11]!.asked.snrDbHz);
    const given = await predict({ mode: "digital", requiredSnrDb: -10, referenceBandwidthHz: 500 });
    expect(given.body.mode.requiredSnrDbHz).toBe(17);
    expect(given.body.hours[11]!.asked.reliability).toBeGreaterThan(0);
  });

  it("takes a bandwidth given on its own with the mode's own figure", async () => {
    // CW is taken to need 24 dB in 1 Hz. Asked for in 500 Hz instead, with the figure left alone, the
    // requirement in 1 Hz is 24 + 10·log10(500) = 24 + 26.99 = 50.99 dB, which is 51.0 to the tenth the engine reads.
    const plain = (await predict({ mode: "cw" })).body;
    const narrow = (await predict({ mode: "cw", referenceBandwidthHz: 500 })).body;
    expect(plain.mode).toMatchObject({ requiredSnrDb: 24, referenceBandwidthHz: 1, requiredSnrDbHz: 24 });
    expect(narrow.mode).toMatchObject({ requiredSnrDb: 24, referenceBandwidthHz: 500, requiredSnrDbHz: 51 });
    expect(narrow.key).not.toBe(plain.key);
    // The engine was run at 51, not 24: the same signal, a higher bar, and the answer 51 dB in 1 Hz gets when asked for outright.
    const outright = (await predict({ mode: "cw", requiredSnrDb: 51, referenceBandwidthHz: 1 })).body;
    const reliability = (result: PredictionResult) => result.hours.map((hour) => hour.asked.reliability);
    expect(narrow.hours[11]!.asked.snrDbHz).toBe(plain.hours[11]!.asked.snrDbHz);
    expect(narrow.hours[11]!.asked.reliability).toBeLessThan(plain.hours[11]!.asked.reliability);
    expect(reliability(narrow)).toEqual(reliability(outright));
    expect(narrow.hours.map((hour) => hour.lufMhz)).toEqual(outright.hours.map((hour) => hour.lufMhz));
    const cw = narrow.modes.findIndex((mode) => mode.id === "cw");
    expect(narrow.modes[cw]).toEqual(narrow.mode);
    expect(narrow.hours.map((hour) => hour.modeReliability[cw])).toEqual(reliability(narrow));
    // 24 dB in 500 Hz is not what the guide published, and is not put down to it.
    expect(plain.mode.source).toContain("Setting up input values for VOACAP");
    expect(narrow.mode.source).toBe(`Your own bandwidth, with the figure published for 1 Hz (${plain.mode.source})`);
    // The mode's own bandwidth typed out is the published figure still.
    expect((await predict({ mode: "cw", referenceBandwidthHz: 1 })).body.mode).toEqual(plain.mode);
    // The comparisons and the printed page are run at the same requirement.
    const compared = await app.api<CompareResult>("POST", "/api/radio/propagation/compare", {
      base: { ...acceptance, mode: "cw", referenceBandwidthHz: 500 },
      what: "power",
    });
    expect(compared.body.mode.requiredSnrDbHz).toBe(51);
    expect(compared.body.series[1]!.reliability).toEqual(reliability(narrow));
  });

  it("answers for the reply as well when asked, and the two directions differ", async () => {
    const { body } = await predict({ reply: { powerWatts: 100, noise: "rural" } });
    const noon = body.hours[11]!;
    expect(noon.reply!.reliability).toBeGreaterThan(noon.asked.reliability);
    expect((await predict()).body.hours[11]!.reply).toBeNull();
  });

  it("responds to power, antenna and noise", async () => {
    const base = (await predict()).body.hours[11]!.asked;
    const more = (await predict({ powerWatts: 50 })).body.hours[11]!.asked;
    expect(more.snrDbHz - base.snrDbHz).toBeCloseTo(10, 0);
    const quiet = (await predict({ noise: "rural" })).body.hours[11]!.asked;
    expect(quiet.snrDbHz).toBeGreaterThan(base.snrDbHz);
    const vertical = (await predict({ txAntenna: ANTENNA_PRESETS.find((preset) => preset.id === "vertical")!.spec })).body.hours[11]!.asked;
    expect(vertical.snrDbHz).toBeLessThan(base.snrDbHz - 6);
  });

  it("prints the page VOACAP itself would", async () => {
    const { body } = await app.api<{ listing: string }>("POST", "/api/radio/propagation/listing", acceptance);
    expect(body.listing).toContain("IONOSPHERIC COMMUNICATIONS ANALYSIS AND PREDICTION PROGRAM");
    expect(body.listing).toContain("London              Birmingham");
  });
});

describe("where the sunspot number comes from", () => {
  it("is NOAA's forecast for the month, from the included table, and is never called live", async () => {
    const { body } = await predict();
    expect(body.basis.ssn).toBe(83);
    expect(body.basis.tableDate).toBe("2026-11-16");
    expect(body.basis.summary).toContain("the table that came with Outpost");
    expect(["recent-solar", "climatology"]).toContain(body.basis.kind);
    expect(body.basis.kind).toBe(body.basis.tableAgeDays! <= 45 ? "recent-solar" : "climatology");
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(/real[- ]time|current conditions/);
  });

  it("is the person's own figure when they give one", async () => {
    const { body } = await predict({ solar: { source: "manual", ssn: 20 } });
    expect(body.basis.kind).toBe("own-measurement");
    expect(body.basis.ssn).toBe(20);
    const usual = (await predict()).body;
    expect(body.hours[11]!.ionosphere.foF2).toBeLessThan(usual.hours[11]!.ionosphere.foF2);
    expect(body.hours[11]!.mufMhz).toBeLessThan(usual.hours[11]!.mufMhz);
  });

  it("is found from a measured foF2 by asking the engine's own map", async () => {
    const { status, body } = await predict({ solar: { source: "fof2", fof2Mhz: 9.5, utcHour: 12 } });
    expect(status).toBe(200);
    expect(body.basis.kind).toBe("own-measurement");
    expect(Math.abs(body.hours[11]!.ionosphere.foF2 - 9.5)).toBeLessThan(0.1);
    expect(body.basis.summary).toContain("the foF2 you measured (9.5 MHz at 12:00 UTC)");
    const impossible = await predict({ solar: { source: "fof2", fof2Mhz: 24, utcHour: 3 } });
    expect(impossible.status).toBe(400);
    expect(impossible.body).toMatchObject({ error: { message: expect.stringContaining("is outside that") } });
  });

  it("says so when the table does not reach the month", async () => {
    const { status, body } = await predict({ date: "2035-06-01" });
    expect(status).toBe(400);
    expect((body as unknown as { error: { message: string } }).error.message).toContain(
      "has no sunspot number for June 2035: it runs from May 2026 to December 2030",
    );
    expect((await predict({ date: "2035-06-01", solar: { source: "manual", ssn: 60 } })).status).toBe(200);
  });
});

describe("what is asked", () => {
  const refused = async (patch: Record<string, unknown>, words: RegExp) => {
    const { status, body } = await app.api("POST", "/api/radio/propagation/predict", { ...acceptance, ...patch });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(words);
  };

  it("is checked before the engine sees it", async () => {
    await refused({ frequencyMhz: 1.9 }, /covers 2 to 30 MHz/);
    await refused({ frequencyMhz: 50 }, /covers 2 to 30 MHz/);
    await refused({ powerWatts: 0 }, /at least 0\.1 W/);
    await refused({ tx: { name: "", lat: 91, lon: 0 } }, /lat/);
    await refused({ rx: { name: "", lat: 0, lon: 181 } }, /lon/);
    await refused({ date: "2026-02-30" }, /does not exist/);
    await refused({ date: "16/11/2026" }, /YYYY-MM-DD/);
    await refused({ solar: { source: "manual", ssn: 400 } }, /ssn/);
    await refused({ txAntenna: { ...dipole, heightM: 0 } }, /at least 0\.5 m/);
    await refused({ mode: "digital", requiredSnrDb: 80, referenceBandwidthHz: 2500 }, /outside what the engine takes/);
    await refused({ rx: acceptance.tx }, /same place/);
  });
});

describe("answers already worked out", () => {
  it("are kept under a key made from the question, the engine and the data", async () => {
    const first = (await predict({ powerWatts: 7 })).body;
    expect(first.cached).toBe(false);
    const again = (await predict({ powerWatts: 7 })).body;
    expect(again.cached).toBe(true);
    expect(again.key).toBe(first.key);
    expect(again.hours).toEqual(first.hours);
    // Inputs the engine cannot tell apart are one question.
    expect((await predict({ powerWatts: 7.04, tx: { name: "London", lat: 51.5112, lon: -0.1301 } })).body.key).toBe(first.key);
    // Anything the answer depends on changes the key.
    expect((await predict({ powerWatts: 8 })).body.key).not.toBe(first.key);
    expect((await predict({ powerWatts: 7, solar: { source: "manual", ssn: 84 } })).body.key).not.toBe(first.key);
    expect((await predict({ powerWatts: 7, date: "2026-12-16" })).body.key).not.toBe(first.key);
    // Another day of the same month has the same figures (the model works by month) and is kept under its own date.
    const otherDay = (await predict({ powerWatts: 7, date: "2026-11-02" })).body;
    expect(otherDay.key).not.toBe(first.key);
    expect(otherDay.hours).toEqual(first.hours);
    const fetched = await app.api<PredictionResult>("GET", `/api/radio/propagation/results/${first.key}`);
    expect(fetched.body.hours).toEqual(first.hours);
    expect((await app.api("GET", `/api/radio/propagation/results/${"0".repeat(40)}`)).status).toBe(404);
  });

  it("can be worked out as a background job", async () => {
    const { body } = await app.api<{ job: { id: string; type: string } }>("POST", "/api/radio/propagation/predict?background=true", {
      ...acceptance,
      powerWatts: 9,
    });
    expect(body.job.type).toBe("propagation.predict");
    await app.ctx.jobs.whenIdle();
    const job = app.ctx.jobs.get(body.job.id)!;
    expect(job.state).toBe("succeeded");
    const key = (job.result as { key: string }).key;
    expect((await app.api<PredictionResult>("GET", `/api/radio/propagation/results/${key}`)).body.request.powerWatts).toBe(9);
  });
});

describe("the same path with one thing changed", () => {
  const compare = (what: string) => app.api<CompareResult>("POST", "/api/radio/propagation/compare", { base: acceptance, what });

  it("shows the seasons at one sunspot number", async () => {
    const { status, body } = await compare("seasons");
    expect(status).toBe(200);
    expect(body.series.map((series) => series.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
    expect(new Set(body.series.map((series) => series.ssn))).toEqual(new Set([83]));
    // Midday foF2 over England is higher in winter than in summer (the winter anomaly), in the engine's maps as in the textbooks.
    expect(body.series[11]!.foF2[11]!).toBeGreaterThan(body.series[5]!.foF2[11]!);
    expect(body.series[10]!.reliability).toEqual((await predict()).body.hours.map((hour) => hour.asked.reliability));
  });

  it("shows what foF2, power, antennas and noise do", async () => {
    const sunspots = (await compare("sunspots")).body;
    expect(sunspots.series.map((series) => series.ssn)).toEqual([10, 50, 83, 100, 150]);
    const noonFoF2 = sunspots.series.map((series) => series.foF2[11]!);
    expect([...noonFoF2].sort((a, b) => a - b)).toEqual(noonFoF2);
    expect(sunspots.series[0]!.mufMhz[11]!).toBeLessThan(sunspots.series[4]!.mufMhz[11]!);
    const power = (await compare("power")).body;
    expect(power.series.map((series) => series.label)).toEqual(["1 W", "5 W", "25 W", "100 W"]);
    expect(power.series[3]!.snrDbHz[11]! - power.series[0]!.snrDbHz[11]!).toBeCloseTo(20, 0);
    expect((await compare("antennas")).body.series).toHaveLength(ANTENNA_PRESETS.length);
    const noise = (await compare("noise")).body;
    expect(noise.series[3]!.snrDbHz[11]!).toBeGreaterThan(noise.series[0]!.snrDbHz[11]!);
  });
});

describe("equipment profiles", () => {
  it("keeps radios", async () => {
    const radio = {
      name: "Xiegu G90",
      model: "G90",
      powerWatts: 20,
      minMhz: 1.8,
      maxMhz: 30,
      modes: ["ssb", "cw", "ft8"],
      receiver: "",
      notes: "Portable set",
    };
    const made = await app.api("POST", "/api/radio/profiles/radios", radio);
    expect(made.status).toBe(200);
    const id = made.body.radio.id as string;
    expect((await app.api("PATCH", `/api/radio/profiles/radios/${id}`, { ...radio, powerWatts: 5 })).body.radio.powerWatts).toBe(5);
    expect((await app.api("GET", "/api/radio/profiles")).body.radios).toMatchObject([
      { id, name: "Xiegu G90", powerWatts: 5, modes: ["ssb", "cw", "ft8"], notes: "Portable set" },
    ]);
    expect((await app.api("POST", "/api/radio/profiles/radios", { ...radio, name: " " })).status).toBe(400);
    expect((await app.api("POST", "/api/radio/profiles/radios", { ...radio, minMhz: 30, maxMhz: 2 })).status).toBe(400);
    expect((await app.api("DELETE", `/api/radio/profiles/radios/${id}`)).status).toBe(200);
    expect((await app.api("DELETE", `/api/radio/profiles/radios/${id}`)).status).toBe(404);
  });

  it("keeps antennas, and a prediction can be asked for with one", async () => {
    const antenna = {
      name: "Garden dipole",
      ...dipole,
      heightM: 7,
      ground: "poor",
      feedlineLossDb: 1.2,
      minMhz: 7,
      maxMhz: 7.2,
      notes: "",
    };
    const made = await app.api("POST", "/api/radio/profiles/antennas", antenna);
    expect(made.status).toBe(200);
    const stored = (await app.api("GET", "/api/radio/profiles")).body.antennas[0];
    expect(stored).toMatchObject({
      name: "Garden dipole",
      kind: "horizontal-dipole",
      heightM: 7,
      ground: "poor",
      feedlineLossDb: 1.2,
      broadsideDeg: null,
    });
    const { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb } = stored;
    const { body } = await predict({ txAntenna: { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb } });
    expect(body.antennas.tx).toContain("7 m above poor (dry, rocky, built-up) ground");
    expect(body.antennas.tx).toContain("less 1.2 dB");
    expect((await app.api("POST", "/api/radio/profiles/antennas", { ...antenna, heightM: 0.1 })).status).toBe(400);
    expect((await app.api("DELETE", `/api/radio/profiles/antennas/${made.body.antenna.id}`)).status).toBe(200);
  });

  it("keeps a prediction by name", async () => {
    const result = (await predict()).body;
    const made = await app.api("POST", "/api/radio/propagation/saved", {
      name: "Home to Birmingham, 40 m",
      request: acceptance,
      key: result.key,
    });
    expect(made.status).toBe(200);
    const list = (await app.api("GET", "/api/radio/propagation/saved")).body.saved;
    expect(list).toMatchObject([{ name: "Home to Birmingham, 40 m", key: result.key, request: { frequencyMhz: 7.1 } }]);
    expect((await app.api("DELETE", `/api/radio/propagation/saved/${made.body.saved.id}`)).status).toBe(200);
  });
});

describe("the data it rests on", () => {
  it("is listed with versions, sizes, dates and checksums", async () => {
    const { body } = await app.api<PropagationDatasets>("GET", "/api/radio/propagation/datasets");
    const [coefficients, solar] = body.datasets;
    expect(coefficients).toMatchObject({
      id: "voacap-coefficients",
      installed: true,
      verified: true,
      files: 44,
      where: "Included with Outpost",
      downloadable: false,
    });
    expect(coefficients!.bytes).toBeGreaterThan(500_000);
    expect(coefficients!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(coefficients!.licence).toContain("free from any copyright assertions");
    expect(solar).toMatchObject({
      id: "solar-cycle",
      installed: true,
      dataDate: "2026-11-16",
      bytes: 17508,
      downloadable: true,
      where: "Included with Outpost",
    });
    expect(body.solar.months).toHaveLength(56);
    expect(body.solar.months.find((month) => month.month === "2026-11")).toEqual({ month: "2026-11", ssn: 83.2, low: 61.3, high: 99.6 });
    expect(body.notOffered.map((item) => item.title).join(" ")).toContain("SILSO");
  });

  it("fetches a newer solar table when asked, checks it, and uses it", async () => {
    const included = JSON.parse(fs.readFileSync(path.join(appRoot, "engines/solar/predicted-solar-cycle.json"), "utf8")) as Array<
      Record<string, unknown>
    >;
    served = JSON.stringify(included.map((row) => (row["time-tag"] === "2026-11" ? { ...row, predicted_ssn: 120 } : row)));
    const before = hits;
    const started = await app.api("POST", "/api/radio/propagation/datasets/solar-cycle/download", {});
    expect(started.status).toBe(200);
    expect(started.body.download).toMatchObject({ kind: "dataset", title: "Solar cycle prediction (NOAA)" });
    await app.ctx.jobs.whenIdle();
    expect(hits).toBeGreaterThan(before);
    const { body } = await app.api<PropagationDatasets>("GET", "/api/radio/propagation/datasets");
    expect(body.solar.origin).toBe("downloaded");
    expect(body.datasets[1]!.where).toContain("Downloaded");
    const collections = app.ctx.services.collections.list({ kind: "dataset" });
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({
      publisher: "NOAA Space Weather Prediction Center",
      license: "Public domain (US Government work)",
    });
    const result = (await predict()).body;
    expect(result.basis.ssn).toBe(120);
    expect(result.basis.kind).toBe("recent-solar");
    expect(result.basis.summary).toContain("the table you downloaded");
    expect(result.cached).toBe(false);
    // A second copy on the same day is refused, not silently duplicated.
    expect((await app.api("POST", "/api/radio/propagation/datasets/solar-cycle/download", {})).status).toBe(409);
    // Removing the collection goes back to the included table.
    await app.ctx.services.collections.remove(collections[0]!.id, { deleteFiles: true });
    expect((await predict()).body.basis.ssn).toBe(83);
  });

  it("refuses a table that is not one, and goes on with the table it had", async () => {
    served = JSON.stringify([{ "time-tag": "2026-11", predicted_ssn: "many" }]);
    const started = await app.api("POST", "/api/radio/propagation/datasets/solar-cycle/download", {});
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const download = app.ctx.services.downloads.get(started.body.download.id)!;
    expect(download.state).toBe("failed");
    expect(download.error).toContain("no usable sunspot number for 2026-11");
    expect((await predict()).body.basis.ssn).toBe(83);
    expect(app.ctx.services.collections.list({ kind: "dataset" })).toHaveLength(0);
  });
});

describe("when the engine cannot run", () => {
  it("says why, and predicts nothing", async () => {
    const broken = await createTestApp();
    try {
      // A copy of the data in the data directory takes precedence; damage one file of it.
      const copy = path.join(broken.ctx.config.dataDir, "propagation/voacap-data");
      fs.cpSync(path.join(appRoot, "engines/voacap/data"), copy, { recursive: true });
      fs.writeFileSync(path.join(copy, "itshfbc/coeffs/coeff11w.bin"), "not the coefficients");
      const engines = (await broken.api("GET", "/api/radio/propagation/engines")).body.engines;
      expect(engines).toMatchObject([{ id: "voacap", name: "VOACAP", ready: false }]);
      expect(engines[0].problem).toContain("coeffs/coeff11w.bin");
      const { status, body } = await broken.api("POST", "/api/radio/propagation/predict", acceptance);
      expect(status).toBe(415);
      expect(body.error.message).toContain("A propagation data file is damaged: coeffs/coeff11w.bin");
      expect(body.hours).toBeUndefined();
      const datasets = (await broken.api<PropagationDatasets>("GET", "/api/radio/propagation/datasets")).body.datasets;
      expect(datasets[0]).toMatchObject({ installed: true, verified: false });
      // Put right, it works again without a restart.
      fs.rmSync(copy, { recursive: true });
      expect((await broken.api("POST", "/api/radio/propagation/predict", acceptance)).status).toBe(200);
    } finally {
      await broken.close();
    }
  });

  it("reports a healthy engine as ready", async () => {
    const { body } = await app.api("GET", "/api/radio/propagation/engines");
    expect(body.engines).toMatchObject([{ id: "voacap", ready: true, problem: null, selected: true, minMhz: 2, maxMhz: 30 }]);
    expect(body.engines[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
