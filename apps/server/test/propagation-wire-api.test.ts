/**
 * End-fed wires of a stated length through the API, with the real engine: what a
 * request may hold, profiles that keep a length, predictions saved before and after
 * lengths existed, and what each kind of answer does on a band where the wire is a
 * half-wave, where it is longer and its figures are approximate, and where it is shorter
 * and not modelled. No test reaches the internet.
 */
import {
  ANTENNA_PRESETS,
  type AntennaProfile,
  type AntennaSpec,
  type CompareResult,
  type ComparisonResult,
  HF_BANDS,
  type PlanResult,
  type PredictionRequest,
  type PredictionResult,
  planHours,
  planRecommendation,
  RUN_LABELS,
  type SavedPrediction,
  sameAntennaSpec,
  wireOn,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalise } from "../src/modules/propagation/service.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { describeWithVoacapData } from "./voacap-data.ts";

const preset = (id: string): AntennaSpec => ANTENNA_PRESETS.find((item) => item.id === id)!.spec;
const dipole = preset("low-dipole");
const flat10 = preset("efhw-10m-horizontal");
const upright10 = preset("efhw-10m-vertical");
const band = (id: string) => HF_BANDS.findIndex((item) => item.id === id);

/** London to Birmingham on 20 m, where 10 m of wire is a half-wave. */
const base: PredictionRequest = {
  tx: { name: "London", lat: 51.5074, lon: -0.1278 },
  rx: { name: "Birmingham", lat: 52.4862, lon: -1.8904 },
  date: "2026-11-16",
  powerWatts: 5,
  txAntenna: flat10,
  rxAntenna: dipole,
  noise: "city",
  frequencyMhz: 14.18,
  mode: "ssb",
  solar: { source: "table" },
};

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

const predict = (patch: Partial<PredictionRequest> = {}) =>
  app.api<PredictionResult>("POST", "/api/radio/propagation/predict", { ...base, ...patch });

describe("the four wires offered", () => {
  it("are a 10 m and a 5 m wire, each level and upright, and the antenna that was there before is still itself", () => {
    expect(
      ANTENNA_PRESETS.filter((item) => item.spec.lengthM !== undefined).map((item) => [
        item.name,
        item.spec.kind,
        item.spec.lengthM,
        item.spec.heightM,
      ]),
    ).toEqual([
      ["End-fed half-wave, 20 m wire, sloping 25° from 1.5 m to 10 m", "end-fed-sloping", 20, 1.5],
      ["End-fed half-wave, 20 m wire, horizontal", "end-fed-horizontal", 20, 6],
      ["SPOOLTENNA (PARKS or ULTRA), 65 ft wire, sloping as its manual shows", "end-fed-sloping", 19.8, 1.8],
      ["End-fed half-wave, 10 m wire, horizontal", "end-fed-horizontal", 10, 6],
      ["End-fed half-wave, 10 m wire, vertical", "end-fed-vertical", 10, 0],
      ["End-fed half-wave, 5 m wire, horizontal", "end-fed-horizontal", 5, 6],
      ["End-fed half-wave, 5 m wire, vertical", "end-fed-vertical", 5, 0],
    ]);
    // Renamed so that it does not read as one of the wires; the same id, the same antenna, no length.
    const before = ANTENNA_PRESETS.find((item) => item.id === "efhw")!;
    expect(before.name).toBe("End-fed half-wave recut for every band, horizontal at 6 m");
    expect(before.spec).toEqual({
      kind: "end-fed-half-wave",
      heightM: 6,
      ground: "average",
      broadsideDeg: null,
      gainDb: 0,
      feedlineLossDb: 0,
    });
    expect(new Set(ANTENNA_PRESETS.map((item) => item.name)).size).toBe(ANTENNA_PRESETS.length);
    for (const item of ANTENNA_PRESETS.filter((one) => one.spec.lengthM !== undefined))
      expect(item.modelledAs).toMatch(/matching unit's loss is not modelled|transformer's loss.* not modelled/);
  });

  it("are a half-wave where a person expects: 10 m of wire on 20 m, 5 m on 10 m", () => {
    const halfWaveOn = (spec: AntennaSpec) =>
      HF_BANDS.filter((item) => wireOn(spec, item.mhz)?.state === "half-wave").map((item) => item.id);
    expect(halfWaveOn(flat10)).toEqual(["20m"]);
    expect(halfWaveOn(upright10)).toEqual(["20m"]);
    expect(halfWaveOn(preset("efhw-5m-horizontal"))).toEqual(["10m"]);
    expect(halfWaveOn(preset("efhw-5m-vertical"))).toEqual(["10m"]);
    // Every frequency of the whole 20 m and 10 m bands, not only the one that stands for each.
    for (const mhz of [14.0, 14.35]) expect(wireOn(flat10, mhz)?.state).toBe("half-wave");
    for (const mhz of [28.0, 29.7]) expect(wireOn(preset("efhw-5m-horizontal"), mhz)?.state).toBe("half-wave");
    expect(wireOn(flat10, 7.1)).toMatchObject({ state: "not-modelled" });
    expect(wireOn(flat10, 7.1)!.wavelengths).toBeCloseTo(0.237, 3);
    expect(wireOn(flat10, 7.1)!.note).toContain("shorter than a half-wave");
    expect(wireOn(flat10, 7.1)!.note).toContain("about a half-wave from 13.5 to 16.5 MHz, and run as an approximation above 16.5 MHz");
    // Longer than a half-wave, a level wire is approximate: the sloping long wire laid level.
    expect(wireOn(flat10, 21.22)).toMatchObject({ state: "approximate" });
    expect(wireOn(flat10, 21.22)!.note).toContain("0.71 wavelengths at 21.22 MHz, longer than a half-wave");
    expect(wireOn(flat10, 21.22)!.note).toContain("sloping long wire (type 41) laid level");
    expect(wireOn(flat10, 21.22)!.note).toContain("reads about 1.3 dB below the dipole model at a half-wave");
    // The edges: 0.55 wavelengths is still a half-wave, a hair above is approximate.
    expect(wireOn(flat10, (0.55 * 299.792458) / 10)!.state).toBe("half-wave");
    expect(wireOn(flat10, (0.551 * 299.792458) / 10)!.state).toBe("approximate");
    expect(wireOn(flat10, (0.449 * 299.792458) / 10)!.state).toBe("not-modelled");
    // The 5 m wire is never longer than a half-wave below 30 MHz.
    expect(HF_BANDS.filter((item) => wireOn(preset("efhw-5m-horizontal"), item.mhz)!.state === "approximate")).toEqual([]);
    expect(wireOn(upright10, 7.1)).toMatchObject({ state: "other-length" });
    expect(wireOn(upright10, 7.1)!.note).toContain("0.24 wavelengths at 7.1 MHz, shorter than a half-wave");
    expect(wireOn(upright10, 7.1)!.note).toContain("no ground system");
    expect(wireOn(upright10, 28.85)!.note).toContain("0.96 wavelengths at 28.85 MHz, longer than a half-wave");
    // An antenna with no stated length is not a wire at all, whatever the frequency.
    expect(wireOn(preset("efhw"), 7.1)).toBeNull();
    expect(wireOn(dipole, 7.1)).toBeNull();
  });
});

describeWithVoacapData("what a request may hold", () => {
  const refused = async (txAntenna: Record<string, unknown>, words: RegExp) => {
    const { status, body } = await app.api("POST", "/api/radio/propagation/predict", { ...base, txAntenna });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(words);
  };

  it("is a wire with its length, within the lengths that are a half-wave somewhere from 2 to 30 MHz", async () => {
    expect((await predict({ txAntenna: { ...flat10, lengthM: 4.5 } })).status).toBe(200);
    expect((await predict({ txAntenna: { ...upright10, lengthM: 82 } })).status).toBe(200);
    await refused({ ...flat10, lengthM: 4.4 }, /between 4\.5 and 82/);
    await refused({ ...upright10, lengthM: 82.5 }, /between 4\.5 and 82/);
    const { lengthM: _none, ...noLength } = flat10;
    await refused(noLength, /Give the length of the wire in metres/);
    await refused({ ...upright10, lengthM: undefined }, /Give the length of the wire in metres/);
    // A level wire still needs its height; an upright one stands on the ground and has none.
    await refused({ ...flat10, heightM: 0 }, /at least 0\.5 m/);
    expect((await predict({ txAntenna: { ...upright10, heightM: 0 } })).status).toBe(200);
    // A length on an antenna that has none is a mistake, and is said to be one.
    await refused({ ...dipole, lengthM: 10 }, /Only an end-fed wire of a stated length has a wire length/);
    await refused({ ...preset("efhw"), lengthM: 10 }, /Only an end-fed wire of a stated length has a wire length/);
  });
});

describeWithVoacapData("a prediction with a level wire", () => {
  let result: PredictionResult;

  it("has figures on the band where the wire is a half-wave, and says how it was run", async () => {
    const answer = await predict();
    expect(answer.status).toBe(200);
    result = answer.body;
    const noon = result.hours[11]!;
    expect(noon.asked.notModelled).toBeUndefined();
    expect(noon.asked.path).not.toBeNull();
    expect(result.antennas.tx).toContain("End-fed wire 10 m long, horizontal, 6 m above average ground");
    expect(result.antennas.tx).toContain("from 13.5 to 16.5 MHz");
    // The same wire as a half-wave dipole at its height: the figures agree to the engine's rounding.
    const half = (await predict({ txAntenna: { ...dipole, heightM: 6 } })).body.hours[11]!;
    expect(Math.abs(noon.asked.txGainDbi - half.asked.txGainDbi)).toBeLessThan(0.3);
    expect(Math.abs(noon.asked.snrDbHz - half.asked.snrDbHz)).toBeLessThan(0.5);
  });

  it("has approximate figures on the bands above, none on the bands below, at every hour, and a blank is not a poor prediction", () => {
    for (const hour of result.hours) {
      for (const [index, item] of HF_BANDS.entries()) {
        const cell = hour.bands[index]!;
        if (item.id === "20m") expect(cell.notModelled ?? cell.approximate).toBeUndefined();
        else if (item.mhz > 16.5) {
          expect(cell.approximate).toBe(true);
          expect(cell.notModelled).toBeUndefined();
        } else expect(cell).toMatchObject({ notModelled: true, path: null, reliability: 0, snrDbHz: 0, signalDbw: 0 });
      }
    }
    // Above, the engine found paths and gave figures.
    expect(result.hours.some((hour) => hour.bands[band("15m")]!.path !== null && hour.bands[band("15m")]!.snrDbHz !== 0)).toBe(true);
    // The whole megahertz of the heat map: 14, 15 and 16 a half-wave, 17 to 30 approximate, below 14 none.
    expect(result.sweepMhz.filter((mhz) => wireOn(flat10, mhz)!.state === "half-wave")).toEqual([14, 15, 16]);
    expect(result.sweepMhz.filter((mhz) => wireOn(flat10, mhz)!.state === "approximate")).toEqual(
      Array.from({ length: 14 }, (_, at) => 17 + at),
    );
  });

  it("carries, for the frequency asked about and each band, how it was run", () => {
    expect(result.runs!.map((line) => [line.mhz, line.state])).toEqual([
      [14.18, "modelled"],
      [3.65, "not-modelled"],
      [5.33, "not-modelled"],
      [7.1, "not-modelled"],
      [10.12, "not-modelled"],
      [14.18, "modelled"],
      [18.12, "approximate"],
      [21.22, "approximate"],
      [24.94, "approximate"],
      [28.85, "approximate"],
    ]);
    expect(result.runs![0]!.tx).toBe(RUN_LABELS.halfWave);
    expect(result.runs![7]!.tx).toBe(RUN_LABELS.approximate);
    expect(result.runs![1]!.tx).toBe(RUN_LABELS.notModelled);
    expect(result.runs![0]!.rx).toBe("Horizontal half-wave dipole (VOACAP type 23)");
    expect(result.antennas.tx).toContain("Above 16.5 MHz, where it is longer, approximate");
  });

  it("marks the frequency asked about as approximate where the wire is longer, and gives the reply the same mark", async () => {
    const { status, body } = await predict({ frequencyMhz: 21.22, reply: { powerWatts: 5, noise: "city" } });
    expect(status).toBe(200);
    expect(body.hours.every((hour) => hour.asked.approximate === true)).toBe(true);
    expect(body.runs![0]).toMatchObject({ mhz: 21.22, state: "approximate" });
    expect(body.hours.some((hour) => hour.reply !== null && hour.reply.snrDbHz !== 0)).toBe(true);
  });

  it("says so when the frequency asked about is one of them, and still answers for the band it can", async () => {
    const { status, body } = await predict({ frequencyMhz: 7.1 });
    expect(status).toBe(200);
    expect(body.hours.every((hour) => hour.asked.notModelled === true && hour.asked.reliability === 0)).toBe(true);
    expect(body.hours[11]!.bands[band("20m")]!.notModelled).toBeUndefined();
    // What does not depend on the antenna is still the engine's.
    expect(body.hours[11]!.mufMhz).toBeGreaterThan(2);
    expect(body.hours[11]!.ionosphere.foF2).toBeGreaterThan(2);
  });

  it("does not give the reply figures either, since the same wire receives it", async () => {
    const { body } = await predict({ frequencyMhz: 7.1, reply: { powerWatts: 5, noise: "city" } });
    expect(body.hours[11]!.asked.notModelled).toBe(true);
    expect(body.hours[11]!.reply).toEqual({ reliability: 0, snrDbHz: 0 });
  });

  it("prints VOACAP's page without the frequencies it is not modelled on, or says there is no page", async () => {
    const page = await app.api("POST", "/api/radio/propagation/listing", base);
    expect(page.status).toBe(200);
    const frequencies = (page.body.listing as string).split("\n").find((line) => /^\s+1\.0 .* FREQ$/.test(line))!;
    // The frequency asked about and the 20 m band are both 14.18 MHz; the page's other columns are empty.
    expect(
      frequencies
        .trim()
        .split(/\s+/)
        .slice(2, -1)
        .filter((column) => column !== "0.0"),
    ).toEqual(["14.2", "14.2"]);
    // Each band where the wire is longer is a page of its own, headed as approximate.
    for (const mhz of [18.12, 21.22, 24.94, 28.85]) expect(page.body.listing).toContain(`Outpost: ${mhz} MHz, approximate.`);
    // 4.5 m of wire is shorter than a half-wave on every band and at 7.1 MHz.
    const none = await app.api("POST", "/api/radio/propagation/listing", {
      ...base,
      frequencyMhz: 7.1,
      txAntenna: { ...flat10, lengthM: 4.5 },
    });
    expect(none.status).toBe(400);
    expect(none.body.error.message).toContain("There is no page to print");
  });
});

describeWithVoacapData("a prediction with an upright wire", () => {
  it("has figures on every band, each for the wire of that length", async () => {
    const { status, body } = await predict({ txAntenna: upright10, frequencyMhz: 7.1 });
    expect(status).toBe(200);
    for (const hour of body.hours) expect(hour.bands.every((cell) => cell.notModelled === undefined)).toBe(true);
    expect(body.hours[11]!.asked.notModelled).toBeUndefined();
    expect(body.antennas.tx).toContain("End-fed wire 10 m long, vertical with its bottom end at the ground");
    expect(body.antennas.tx).toContain("on every frequency");
  });
});

describeWithVoacapData("the same path with one thing changed", () => {
  const compare = (request: PredictionRequest, what: string) =>
    app.api<CompareResult>("POST", "/api/radio/propagation/compare", { base: request, what });

  it("marks the antennas that are not modelled on the frequency compared, and gives them no figures", async () => {
    const { status, body } = await compare({ ...base, txAntenna: dipole, frequencyMhz: 7.1 }, "antennas");
    expect(status).toBe(200);
    expect(body.series.map((series) => series.label)).toEqual(ANTENNA_PRESETS.map((item) => item.name));
    const marked = body.series.filter((series) => series.notModelled).map((series) => series.label);
    expect(marked).toEqual(["End-fed half-wave, 10 m wire, horizontal", "End-fed half-wave, 5 m wire, horizontal"]);
    for (const series of body.series.filter((item) => item.notModelled)) expect(new Set(series.reliability)).toEqual(new Set([0]));
    // The upright wires are run as wires of their length, and the old antenna as it always was.
    const upright = body.series.find((series) => series.label === "End-fed half-wave, 10 m wire, vertical")!;
    expect(upright.notModelled).toBeUndefined();
    expect(Math.max(...upright.snrDbHz)).toBeGreaterThan(0);
    // On 20 m the 10 m wire is drawn and the 5 m one is not.
    const twenty = (await compare({ ...base, txAntenna: dipole }, "antennas")).body;
    expect(twenty.series.filter((series) => series.notModelled).map((series) => series.label)).toEqual([
      "End-fed half-wave, 5 m wire, horizontal",
    ]);
  });

  it("is not answered from a comparison kept when the list of generic antennas was another list", async () => {
    // As the comparison was kept before the wires were added: under a key that does not say which antennas were compared.
    const { internals } = app.ctx.services.propagation;
    const asked = normalise({ ...base, txAntenna: dipole, frequencyMhz: 10.12 });
    const { basis, tableSha, description, datasets } = await internals.basis(asked.date, { source: "table" });
    const before = internals.keyOf("compare", {
      base: asked,
      what: "antennas",
      ssn: basis.ssn,
      tableSha,
      engine: description.sha256,
      datasets,
    });
    internals.keep(before, "compare", description, {}, { what: "antennas", series: [], kept: "before" });
    const { body } = await compare(asked, "antennas");
    expect(body.series.map((series) => series.label)).toEqual(ANTENNA_PRESETS.map((item) => item.name));
    // A comparison of anything else is kept under the key it always was.
    const power = internals.keyOf("compare", {
      base: asked,
      what: "power",
      ssn: basis.ssn,
      tableSha,
      engine: description.sha256,
      datasets,
    });
    internals.keep(power, "compare", description, {}, { what: "power", series: [], kept: "before" });
    expect((await compare(asked, "power")).body.series).toEqual([]);
  });

  it("marks every series when it is the antenna of the question itself", async () => {
    const { body } = await compare({ ...base, frequencyMhz: 7.1 }, "power");
    expect(body.series.every((series) => series.notModelled === true)).toBe(true);
    const above = (await compare({ ...base, frequencyMhz: 21.22 }, "power")).body;
    expect(above.series.every((series) => series.approximate === true && series.notModelled === undefined)).toBe(true);
  });

  it("marks the level 10 m wire approximate on a band where it is longer, with figures", async () => {
    const { body } = await compare({ ...base, txAntenna: dipole, frequencyMhz: 28.85 }, "antennas");
    expect(body.series.filter((series) => series.approximate).map((series) => series.label)).toEqual([
      "End-fed half-wave, 20 m wire, sloping 25° from 1.5 m to 10 m",
      "End-fed half-wave, 20 m wire, horizontal",
      "SPOOLTENNA (PARKS or ULTRA), 65 ft wire, sloping as its manual shows",
      "End-fed half-wave, 10 m wire, horizontal",
    ]);
    expect(body.series.filter((series) => series.notModelled)).toEqual([]);
    const wire = body.series.find((series) => series.approximate)!;
    expect(wire.snrDbHz.some((value) => value !== 0)).toBe(true);
  });
});

describeWithVoacapData("a coverage map", () => {
  const map = {
    tx: base.tx,
    date: base.date,
    powerWatts: 5,
    txAntenna: flat10,
    rxAntenna: dipole,
    noise: "city",
    frequencyMhz: 7.1,
    mode: "ssb",
    solar: { source: "table" },
    area: { west: -8, south: 51, east: 8, north: 51.5 },
    resolution: "coarse",
  };

  it("is refused on a frequency the wire is not modelled on, with the reason, and worked out on one it is", async () => {
    const refused = await app.api("POST", "/api/radio/propagation/coverage", map);
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain(
      "No figure can be given on 7.1 MHz. The transmitting antenna: 10 m of wire is 0.24 wavelengths",
    );
    expect(refused.body.error.details).toMatchObject({ reason: "antenna-not-modelled" });
    const assumed = await app.api("POST", "/api/radio/propagation/coverage", { ...map, txAntenna: dipole, rxAntenna: flat10 });
    expect(assumed.body.error.message).toContain("The receiving antenna:");
    expect(app.ctx.jobs.list({ states: ["queued", "running"] })).toEqual([]);

    const asked = await app.api("POST", "/api/radio/propagation/coverage", { ...map, frequencyMhz: 14.18 });
    expect(asked.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const job = (await app.api("GET", `/api/jobs/${asked.body.job.id}`)).body.job;
    expect(job.state).toBe("succeeded");
    const coverage = (await app.api("GET", `/api/radio/propagation/coverage/${job.result.key}`)).body.coverage;
    expect(coverage.antennas.tx).toContain(
      "End-fed wire 10 m long, horizontal, 6 m above average ground, broadside turned towards each cell",
    );
    expect(coverage.cells.filter((cell: unknown) => cell !== null).length).toBeGreaterThan(10);
  });

  it("is worked out on a frequency where the level wire is approximate, and says so", async () => {
    const asked = await app.api("POST", "/api/radio/propagation/coverage", { ...map, frequencyMhz: 21.22 });
    expect(asked.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const job = (await app.api("GET", `/api/jobs/${asked.body.job.id}`)).body.job;
    expect(job.state).toBe("succeeded");
    const coverage = (await app.api("GET", `/api/radio/propagation/coverage/${job.result.key}`)).body.coverage;
    expect(coverage.approximate).toContain(
      "The transmitting antenna: 10 m of wire is 0.71 wavelengths at 21.22 MHz, longer than a half-wave",
    );
    expect(coverage.limits[0]).toMatch(/^Every figure on this map is approximate\./);
    expect(coverage.limits.join(" ")).toContain("a wire longer than a half-wave is not strongest broadside");
    // The bearing of the wire belongs to one cell, and is not left in the words for the whole map.
    expect(coverage.antennas.tx).not.toMatch(/the wire running \d+°/);
    expect(coverage.cells.filter((cell: unknown) => cell !== null).length).toBeGreaterThan(10);
    // On the half-wave band nothing is approximate.
    const half = await app.api("POST", "/api/radio/propagation/coverage", { ...map, frequencyMhz: 14.18 });
    expect(half.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    if (half.body.job) {
      const done = (await app.api("GET", `/api/jobs/${half.body.job.id}`)).body.job;
      expect((await app.api("GET", `/api/radio/propagation/coverage/${done.result.key}`)).body.coverage.approximate).toBeNull();
    } else expect(half.body.coverage.approximate).toBeNull();
  });

  it("is worked out on any frequency for an upright wire", async () => {
    const asked = await app.api("POST", "/api/radio/propagation/coverage", { ...map, txAntenna: upright10 });
    expect(asked.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", `/api/jobs/${asked.body.job.id}`)).body.job.state).toBe("succeeded");
  });
});

describeWithVoacapData("a communication plan", () => {
  const station = (id: string, name: string, lat: number, lon: number, antenna: AntennaSpec, antennaName: string) => ({
    id,
    name,
    lat,
    lon,
    powerWatts: 20,
    antenna,
    antennaName,
    noise: "rural",
  });

  it("has no figures for a pair on a band where either station's wire is not modelled, and never recommends that band", async () => {
    const created = await app.api("POST", "/api/radio/communication-plans", {
      name: "Wires",
      notes: "",
      stations: [
        station("a", "Home", 51.5074, -0.1278, flat10, "End-fed half-wave, 10 m wire, horizontal"),
        station("b", "Hill", 54.4609, -3.0886, dipole, "Low horizontal dipole, 5 m"),
        station("c", "Coast", 50.1, -5.5, upright10, "End-fed half-wave, 10 m wire, vertical"),
      ],
      date: "2026-11-16",
      fromUtc: 9,
      toUtc: 15,
      bands: ["40m", "20m"],
      mode: "cw",
      requiredSnrDb: null,
      referenceBandwidthHz: null,
      solar: { source: "table" },
      links: [],
    });
    expect(created.status).toBe(200);
    // The stations keep their wires as they were given, length and all.
    expect(created.body.plan.stations[0].antenna).toEqual(flat10);
    const worked = await app.api("POST", `/api/radio/communication-plans/${created.body.plan.id}/matrix`);
    expect(worked.status).toBe(200);
    const matrix = worked.body.matrix as PlanResult;
    const pair = (a: string, b: string) => matrix.pairs.find((item) => item.a === a && item.b === b)!;
    const figures = (a: string, b: string, id: string) => pair(a, b).bands.find((item) => item.bandId === id)!;
    // Home's level wire is in both of its pairs: nothing on 40 m either way, figures on 20 m.
    for (const other of ["b", "c"]) {
      expect(new Set(figures("a", other, "40m").forward.reliability)).toEqual(new Set([null]));
      expect(new Set(figures("a", other, "40m").back.snrDbHz)).toEqual(new Set([null]));
      expect(figures("a", other, "20m").forward.snrDbHz.some((value) => value !== null)).toBe(true);
      const pick = planRecommendation(pair("a", other), planHours(9, 15), false);
      expect([pick.primary?.bandId, pick.alternate?.bandId]).not.toContain("40m");
    }
    // The pair without the level wire has figures on both bands: the upright wire is run on 40 m as a wire of its length.
    expect(figures("b", "c", "40m").forward.snrDbHz.some((value) => value !== null)).toBe(true);
    expect(figures("b", "c", "20m").forward.snrDbHz.some((value) => value !== null)).toBe(true);
    expect(matrix.pairs.every((item) => item.bands.every((entry) => entry.approximate === undefined))).toBe(true);
  });

  it("gives approximate figures on a band where a station's level wire is longer, may recommend it, and says so", async () => {
    const created = await app.api("POST", "/api/radio/communication-plans", {
      name: "Wires up high",
      notes: "",
      stations: [
        station("a", "Home", 51.5074, -0.1278, flat10, "End-fed half-wave, 10 m wire, horizontal"),
        station("b", "Rome", 41.9, 12.5, dipole, "Low horizontal dipole, 5 m"),
      ],
      date: "2026-06-16",
      fromUtc: 9,
      toUtc: 15,
      bands: ["40m", "20m", "15m"],
      mode: "cw",
      requiredSnrDb: null,
      referenceBandwidthHz: null,
      solar: { source: "manual", ssn: 150 },
      links: [],
    });
    const matrix = (await app.api("POST", `/api/radio/communication-plans/${created.body.plan.id}/matrix`)).body.matrix as PlanResult;
    const pair = matrix.pairs[0]!;
    const byBand = Object.fromEntries(pair.bands.map((entry) => [entry.bandId, entry]));
    expect(byBand["15m"]!.approximate).toBe(true);
    expect(byBand["15m"]!.forward.snrDbHz.some((value) => value !== null)).toBe(true);
    expect(byBand["20m"]!.approximate).toBeUndefined();
    expect(byBand["40m"]!.approximate).toBeUndefined();
    expect(new Set(byBand["40m"]!.forward.snrDbHz)).toEqual(new Set([null]));
    const pick = planRecommendation(pair, planHours(9, 15), false);
    const chosen = [pick.primary, pick.alternate].filter((choice) => choice !== null);
    expect(chosen.map((choice) => choice!.bandId)).not.toContain("40m");
    for (const choice of chosen) expect(choice!.approximate).toBe(choice!.bandId === "15m");
  });
});

describeWithVoacapData("the contact log compared with predictions", () => {
  it("leaves out an entry on a frequency the chosen wire is not modelled on, and says that is why", async () => {
    const made = await app.api("POST", "/api/radio/observations", {
      at: "2026-11-16T12:00:00Z",
      frequencyMhz: 7.1,
      band: "",
      mode: "ssb",
      outcome: "contact",
      tx: { call: "G4AAA", lat: 51.5074, lon: -0.1278 },
      rx: { call: "G4BBB", lat: 52.4862, lon: -1.8904 },
      powerWatts: 5,
      antenna: "",
      reportSent: "",
      reportReceived: "",
      notes: "",
    });
    expect(made.status).toBe(200);
    const assumptions = { myAntenna: flat10, theirAntenna: dipole, noise: "city", defaultPowerWatts: null, ssnByMonth: {} };
    const wire = (await app.api("POST", "/api/radio/observations/compare", assumptions)).body.comparison as ComparisonResult;
    expect(wire.compared).toBe(0);
    expect(wire.excluded).toEqual([
      { reason: "One of the antennas chosen is a wire the engine's model does not describe on that frequency", count: 1 },
    ]);
    const plain = (await app.api("POST", "/api/radio/observations/compare", { ...assumptions, myAntenna: dipole })).body
      .comparison as ComparisonResult;
    expect(plain.compared).toBe(1);
    expect(plain.comparedApproximate).toBe(0);
  });

  it("counts an entry on a band where the wire is longer apart from the rest, since its figure is approximate", async () => {
    const made = await app.api("POST", "/api/radio/observations", {
      at: "2026-11-16T12:00:00Z",
      frequencyMhz: 21.074,
      band: "",
      mode: "ft8",
      outcome: "contact",
      tx: { call: "G4AAA", lat: 51.5074, lon: -0.1278 },
      rx: { call: "I0CCC", lat: 41.9, lon: 12.5 },
      powerWatts: 5,
      antenna: "",
      reportSent: "",
      reportReceived: "",
      notes: "",
    });
    expect(made.status).toBe(200);
    const assumptions = { myAntenna: flat10, theirAntenna: dipole, noise: "city", defaultPowerWatts: null, ssnByMonth: {} };
    const wire = (await app.api("POST", "/api/radio/observations/compare", assumptions)).body.comparison as ComparisonResult;
    expect(wire.compared).toBe(1);
    expect(wire.comparedApproximate).toBe(1);
    expect(wire.rows[0]!.approximate).toBe(true);
    const count = (levels: ComparisonResult["levels"] | undefined) =>
      (levels ?? []).reduce((sum, level) => sum + level.contact + level.heard + level.failed, 0);
    expect(count(wire.levels)).toBe(0);
    expect(count(wire.approximateLevels)).toBe(1);
  });
});

describeWithVoacapData("equipment profiles", () => {
  const wire = { name: "Kite wire", ...upright10, lengthM: 20.5, feedlineLossDb: 1, minMhz: 7, maxMhz: 7.2, notes: "49:1 unit" };
  const profiles = async () => (await app.api("GET", "/api/radio/profiles")).body.antennas as AntennaProfile[];

  it("keep a wire's length, and a prediction can be asked for with one", async () => {
    const made = await app.api("POST", "/api/radio/profiles/antennas", wire);
    expect(made.status).toBe(200);
    expect(made.body.antenna).toMatchObject({ name: "Kite wire", kind: "end-fed-vertical", lengthM: 20.5, feedlineLossDb: 1 });
    const stored = (await profiles()).find((item) => item.name === "Kite wire")!;
    expect(stored.lengthM).toBe(20.5);
    const { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb, lengthM } = stored;
    const { status, body } = await predict({
      txAntenna: { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb, lengthM },
      frequencyMhz: 7.1,
    });
    expect(status).toBe(200);
    expect(body.antennas.tx).toContain("End-fed wire 20.5 m long, vertical");
    expect(body.antennas.tx).toContain("less 1.0 dB");
  });

  it("refuse a wire without a length or with one out of bounds", async () => {
    const { lengthM: _none, ...noLength } = wire;
    const missing = await app.api("POST", "/api/radio/profiles/antennas", { ...noLength, name: "No length" });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain("Give the length of the wire in metres, between 4.5 and 82");
    expect((await app.api("POST", "/api/radio/profiles/antennas", { ...wire, name: "Too long", lengthM: 100 })).status).toBe(400);
    expect((await app.api("POST", "/api/radio/profiles/antennas", { ...wire, name: "Too low", ...flat10, heightM: 0.2 })).status).toBe(400);
  });

  it("drop the length when a profile becomes an antenna that has none, and take one when it becomes a wire", async () => {
    const id = (await profiles()).find((item) => item.name === "Kite wire")!.id;
    const { lengthM: _none, ...asDipole } = { ...wire, ...dipole };
    const changed = await app.api("PATCH", `/api/radio/profiles/antennas/${id}`, asDipole);
    expect(changed.status).toBe(200);
    expect(changed.body.antenna.kind).toBe("horizontal-dipole");
    expect("lengthM" in changed.body.antenna).toBe(false);
    // Nothing is left behind in the table to come back later.
    expect(app.ctx.sqlite.prepare("SELECT length_m FROM antenna_profiles WHERE id = ?").get(id)).toEqual({ length_m: null });
    const back = await app.api("PATCH", `/api/radio/profiles/antennas/${id}`, { ...wire, ...flat10, lengthM: 20 });
    expect(back.body.antenna).toMatchObject({ kind: "end-fed-horizontal", lengthM: 20, heightM: 6 });
  });

  it("read a profile made before lengths were kept as the antenna it was", async () => {
    // A row as migration 0014 left it: the new column is empty.
    app.ctx.sqlite
      .prepare(
        "INSERT INTO antenna_profiles (id, name, kind, height_m, ground, gain_db, feedline_loss_db, min_mhz, max_mhz, notes, created_at, updated_at) VALUES ('old', 'Old end-fed', 'end-fed-half-wave', 6, 'average', 0, 0, 3.5, 30, '', 1, 1)",
      )
      .run();
    const old = (await profiles()).find((item) => item.id === "old")!;
    expect("lengthM" in old).toBe(false);
    expect(sameAntennaSpec(old, preset("efhw"))).toBe(true);
    const { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb } = old;
    const { status, body } = await predict({
      txAntenna: { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb },
      frequencyMhz: 7.1,
    });
    expect(status).toBe(200);
    // Its length still follows the frequency: figures on every band, as before.
    expect(body.hours[11]!.bands.every((cell) => cell.notModelled === undefined)).toBe(true);
    expect(body.antennas.tx).toContain("run as a horizontal half-wave dipole (approximation), 6 m above average ground");
  });
});

describeWithVoacapData("answers kept while the bands above a level wire's half-wave were not modelled", () => {
  /** The key a question had before: the same body with nothing about how a level wire is run. */
  const keyBefore = async (asked: PredictionRequest) => {
    const { internals } = app.ctx.services.propagation;
    const request = normalise(asked);
    const { basis, tableSha, description, datasets } = await internals.basis(request.date, { source: "table" });
    return {
      key: internals.keyOf("point", { request, ssn: basis.ssn, tableSha, engine: description.sha256, datasets }),
      description,
    };
  };

  it("are not served for a question with a level wire that is now approximate somewhere; every other question keeps its key", async () => {
    const { internals } = app.ctx.services.propagation;
    // As kept then: every band above 20 m blank.
    const asked = { ...base, date: "2026-12-16" };
    const before = await keyBefore(asked);
    internals.keep(before.key, "point", before.description, asked, { kept: "before", hours: [] });
    const now = (await predict({ date: "2026-12-16" })).body;
    expect(now.key).not.toBe(before.key);
    expect(now.cached).toBe(false);
    expect(now.hours[11]!.bands[band("15m")]!.approximate).toBe(true);
    // A dipole's answer, and the 5 m level wire's (never longer than a half-wave below 30 MHz), keep the key they had.
    for (const txAntenna of [dipole, preset("efhw-5m-horizontal"), upright10]) {
      const same = await keyBefore({ ...asked, txAntenna });
      expect((await predict({ date: "2026-12-16", txAntenna })).body.key).toBe(same.key);
    }
  });

  it("leave a saved prediction to be asked again as it was saved, and answered as the wire is run now", async () => {
    const asked: PredictionRequest = { ...base, date: "2026-10-16", frequencyMhz: 21.22 };
    const before = await keyBefore(asked);
    const { internals } = app.ctx.services.propagation;
    internals.keep(before.key, "point", before.description, asked, { kept: "before", hours: [] });
    const made = await app.api("POST", "/api/radio/propagation/saved", { name: "15 m before", request: asked, key: before.key });
    expect(made.status).toBe(200);
    const kept = (await app.api("GET", "/api/radio/propagation/saved")).body.saved.find(
      (item: SavedPrediction) => item.name === "15 m before",
    ) as SavedPrediction;
    expect(kept.request).toEqual(made.body.saved.request);
    expect(kept.request.txAntenna).toEqual(flat10);
    const again = (await app.api<PredictionResult>("POST", "/api/radio/propagation/predict", kept.request)).body;
    expect(again.key).not.toBe(before.key);
    expect(again.hours[11]!.asked.approximate).toBe(true);
  });

  it("are not served for a coverage map, a comparison or a plan that now has an approximate band; others keep their keys", async () => {
    const { wireRunsMark } = await import("../src/modules/propagation/service.ts");
    expect(wireRunsMark([flat10, dipole], [21.22])).toEqual({ wireRuns: "level-long-wire-type-41" });
    expect(wireRunsMark([flat10, dipole], [14.18, 7.1])).toEqual({});
    expect(wireRunsMark([preset("efhw-5m-horizontal"), upright10, dipole], [3.65, 28.85])).toEqual({});
    // A comparison of the generic antennas is marked wherever the 10 m level wire is longer.
    const { internals } = app.ctx.services.propagation;
    const asked = normalise({ ...base, txAntenna: dipole, frequencyMhz: 24.94 });
    const { basis, tableSha, description, datasets } = await internals.basis(asked.date, { source: "table" });
    const old = internals.keyOf("compare", {
      base: asked,
      what: "antennas",
      ssn: basis.ssn,
      tableSha,
      engine: description.sha256,
      datasets,
      antennas: ANTENNA_PRESETS.map((item) => [item.name, item.spec]),
    });
    internals.keep(old, "compare", description, {}, { what: "antennas", series: [], kept: "before" });
    const { body } = await app.api<CompareResult>("POST", "/api/radio/propagation/compare", { base: asked, what: "antennas" });
    expect(body.series.length).toBe(ANTENNA_PRESETS.length);
  });
});

describeWithVoacapData("saved predictions", () => {
  const saved = async () => (await app.api("GET", "/api/radio/propagation/saved")).body.saved as SavedPrediction[];

  it("keep a wire with its length exactly, and give the same answer when asked again", async () => {
    const first = (await predict()).body;
    const made = await app.api("POST", "/api/radio/propagation/saved", { name: "Wire on 20 m", request: base, key: first.key });
    expect(made.status).toBe(200);
    const kept = (await saved()).find((item) => item.name === "Wire on 20 m")!;
    expect(kept.request.txAntenna).toEqual(flat10);
    const again = (await app.api<PredictionResult>("POST", "/api/radio/propagation/predict", kept.request)).body;
    expect(again.key).toBe(first.key);
    expect(again.cached).toBe(true);
  });

  it("keep one saved before lengths existed as it was: no length, and the antenna it always meant", async () => {
    // As the planner saved it with what was then "End-fed half-wave, horizontal at 6 m".
    const before: PredictionRequest = { ...base, frequencyMhz: 7.1, txAntenna: preset("efhw") };
    const made = await app.api("POST", "/api/radio/propagation/saved", { name: "From before", request: before });
    expect(made.status).toBe(200);
    const kept = (await saved()).find((item) => item.name === "From before")!;
    expect(kept.request.txAntenna).toEqual({
      kind: "end-fed-half-wave",
      heightM: 6,
      ground: "average",
      broadsideDeg: null,
      gainDb: 0,
      feedlineLossDb: 0,
    });
    expect("lengthM" in kept.request.txAntenna).toBe(false);
    const answer = (await app.api<PredictionResult>("POST", "/api/radio/propagation/predict", kept.request)).body;
    // The half-wave dipole at 6 m, on every band.
    const half = (await predict({ frequencyMhz: 7.1, txAntenna: { ...dipole, heightM: 6 } })).body;
    expect(answer.hours[11]!.asked.txGainDbi).toBe(half.hours[11]!.asked.txGainDbi);
    expect(answer.hours[11]!.bands.every((cell) => cell.notModelled === undefined)).toBe(true);
  });
});
