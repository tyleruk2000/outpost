/**
 * A sloping end-fed wire through the API, with the real engine: what a request may hold,
 * profiles that keep a slope, and what a prediction, a coverage map, a plan, a comparison
 * and the contact log's comparison do with it on a band where it is shorter than a
 * half-wave (no figure) and where it is a half-wave or longer (approximate figures). And
 * the keys of answers made with the antennas there were before: unchanged, except where
 * the answer changes. No test reaches the internet.
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
  RUN_LABELS,
} from "@outpost/shared";
import { afterAll, beforeAll, expect, it } from "vitest";
import { normalise, SWEEP_MHZ, wireRunsMark } from "../src/modules/propagation/service.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { describeWithVoacapData } from "./voacap-data.ts";

const preset = (id: string): AntennaSpec => ANTENNA_PRESETS.find((item) => item.id === id)!.spec;
const dipole = preset("low-dipole");
const sloper = preset("efhw-20m-sloping");
const band = (id: string) => HF_BANDS.findIndex((item) => item.id === id);

/** London to Rome on 20 m. */
const base: PredictionRequest = {
  tx: { name: "London", lat: 51.5074, lon: -0.1278 },
  rx: { name: "Rome", lat: 41.9, lon: 12.5 },
  date: "2026-11-16",
  powerWatts: 5,
  txAntenna: sloper,
  rxAntenna: dipole,
  noise: "rural",
  frequencyMhz: 14.18,
  mode: "cw",
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

describeWithVoacapData("a sloping wire in a request", () => {
  const refused = async (txAntenna: Record<string, unknown>, words: RegExp) => {
    const { status, body } = await app.api("POST", "/api/radio/propagation/predict", { ...base, txAntenna });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(words);
  };

  it("has a length and a slope between 10° and 60°, and only it has a slope", async () => {
    expect((await predict({ txAntenna: { ...sloper, slopeDeg: 10 } })).status).toBe(200);
    expect((await predict({ txAntenna: { ...sloper, slopeDeg: 60, highEndDeg: 90 } })).status).toBe(200);
    await refused({ ...sloper, slopeDeg: 5 }, /between 10 and 60/);
    await refused({ ...sloper, slopeDeg: 75 }, /between 10 and 60/);
    const { slopeDeg: _none, ...noSlope } = sloper;
    await refused(noSlope, /Give the wire's slope in degrees/);
    await refused({ ...sloper, lengthM: undefined }, /Give the length of the wire in metres/);
    await refused({ ...dipole, slopeDeg: 20 }, /Only a sloping wire has a slope/);
    await refused({ ...preset("efhw-10m-horizontal"), highEndDeg: 90 }, /Only a sloping wire has a slope/);
    await refused({ ...sloper, highEndDeg: 400 }, /highEndDeg/);
    // Its low end may be on the ground.
    expect((await predict({ txAntenna: { ...sloper, heightM: 0 } })).status).toBe(200);
  });

  it("is one question with its bearing sent as null or left out", async () => {
    const { highEndDeg: _none, ...unsaid } = sloper;
    const a = (await predict({ txAntenna: unsaid as AntennaSpec })).body.key;
    expect((await predict()).body.key).toBe(a);
  });
});

describeWithVoacapData("a prediction with a sloping wire", () => {
  let result: PredictionResult;

  it("has no figures on 80 m and 60 m and approximate figures on every band from 40 m up, at every hour", async () => {
    const answer = await predict();
    expect(answer.status).toBe(200);
    result = answer.body;
    for (const hour of result.hours) {
      for (const id of ["80m", "60m"]) expect(hour.bands[band(id)]).toMatchObject({ notModelled: true, path: null });
      for (const id of ["40m", "30m", "20m", "17m", "15m", "12m", "10m"]) {
        expect(hour.bands[band(id)]!.approximate).toBe(true);
        expect(hour.bands[band(id)]!.notModelled).toBeUndefined();
      }
      expect(hour.asked.approximate).toBe(true);
    }
    expect(result.hours.some((hour) => hour.bands[band("20m")]!.path !== null)).toBe(true);
  });

  it("says how it was run on each band, in the sloping wire's own words", () => {
    const runs = result.runs!;
    expect(runs[0]).toMatchObject({ mhz: 14.18, state: "approximate", tx: RUN_LABELS.sloping });
    expect(runs[1 + band("80m")]).toMatchObject({ state: "not-modelled", tx: RUN_LABELS.notModelled });
    expect(runs[1 + band("40m")]).toMatchObject({ state: "approximate", tx: RUN_LABELS.sloping });
    expect(result.antennas.tx).toContain("sloping 25° from 1.5 m to 10 m");
    expect(result.antennas.tx).toContain("its high end towards");
    expect(result.antennas.tx).toContain("(away from the other station)");
  });

  it("prints a page of its own for each approximate frequency, and none for 80 m", async () => {
    const page = await app.api("POST", "/api/radio/propagation/listing", { ...base, frequencyMhz: 7.1 });
    expect(page.status).toBe(200);
    expect(page.body.listing as string).toContain("a sloping wire, run as VOACAP's sloping long wire (type 41) at its slope");
  });
});

describeWithVoacapData("a coverage map with a sloping wire", () => {
  const map = {
    tx: base.tx,
    date: base.date,
    powerWatts: 5,
    txAntenna: sloper,
    rxAntenna: dipole,
    noise: "rural",
    frequencyMhz: 3.65,
    mode: "cw",
    solar: { source: "table" },
    area: { west: -8, south: 51, east: 8, north: 51.5 },
    resolution: "coarse",
  };

  it("is refused where the wire is shorter than a half-wave, and approximate where it is not, its low end turned to each cell", async () => {
    const refused = await app.api("POST", "/api/radio/propagation/coverage", map);
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain("20 m of wire is 0.24 wavelengths at 3.65 MHz, shorter than a half-wave");
    const asked = await app.api("POST", "/api/radio/propagation/coverage", { ...map, frequencyMhz: 7.1 });
    expect(asked.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const key = asked.body.job ? (await app.api("GET", `/api/jobs/${asked.body.job.id}`)).body.job.result.key : asked.body.coverage.key;
    const coverage = (await app.api("GET", `/api/radio/propagation/coverage/${key}`)).body.coverage;
    expect(coverage.approximate).toContain("about a half-wave. Run as VOACAP's sloping long wire (type 41) at its slope");
    expect(coverage.limits.join(" ")).toContain("turned with its low end towards each cell in turn");
    expect(coverage.antennas.tx).toContain("its low end turned towards each cell");
    expect(coverage.antennas.tx).not.toMatch(/high end towards \d+°/);
  });
});

describeWithVoacapData("a communication plan with a sloping wire", () => {
  it("has no figures on 80 m, approximate ones on 40 m and 20 m, and may recommend them, saying so", async () => {
    const created = await app.api("POST", "/api/radio/communication-plans", {
      name: "Sloper",
      notes: "",
      stations: [
        { id: "a", name: "Park", lat: 51.5074, lon: -0.1278, powerWatts: 5, antenna: sloper, antennaName: "20 m sloper", noise: "remote" },
        { id: "b", name: "Home", lat: 53.48, lon: -2.24, powerWatts: 50, antenna: dipole, antennaName: "Dipole", noise: "residential" },
      ],
      date: "2026-11-16",
      fromUtc: 9,
      toUtc: 15,
      bands: ["80m", "40m", "20m"],
      mode: "cw",
      requiredSnrDb: null,
      referenceBandwidthHz: null,
      solar: { source: "table" },
      links: [],
    });
    expect(created.status).toBe(200);
    expect(created.body.plan.stations[0].antenna).toEqual(sloper);
    const matrix = (await app.api("POST", `/api/radio/communication-plans/${created.body.plan.id}/matrix`)).body.matrix as PlanResult;
    const byBand = Object.fromEntries(matrix.pairs[0]!.bands.map((entry) => [entry.bandId, entry]));
    expect(new Set(byBand["80m"]!.forward.reliability)).toEqual(new Set([null]));
    expect(byBand["40m"]!.approximate).toBe(true);
    expect(byBand["20m"]!.approximate).toBe(true);
    expect(byBand["40m"]!.forward.snrDbHz.some((value) => value !== null)).toBe(true);
  });
});

describeWithVoacapData("the comparison and the contact log", () => {
  it("compares the generic antennas with the sloping wires among them, approximate where they are", async () => {
    const { body } = await app.api<CompareResult>("POST", "/api/radio/propagation/compare", {
      base: { ...base, txAntenna: dipole, frequencyMhz: 7.1 },
      what: "antennas",
    });
    const marked = (label: string) => body.series.find((series) => series.label === label)!;
    expect(marked("End-fed half-wave, 20 m wire, sloping 25° from 1.5 m to 10 m").approximate).toBe(true);
    expect(marked("SPOOLTENNA (PARKS or ULTRA), 65 ft wire, sloping as its manual shows").approximate).toBe(true);
    // The 20 m level wire is a half-wave on 40 m: VOACAP's dipole, not approximate.
    expect(marked("End-fed half-wave, 20 m wire, horizontal").approximate).toBeUndefined();
    expect(marked("End-fed half-wave, 20 m wire, horizontal").notModelled).toBeUndefined();
  });

  it("counts a log entry made with the sloping wire apart, as approximate", async () => {
    const made = await app.api("POST", "/api/radio/observations", {
      at: "2026-11-16T12:00:00Z",
      frequencyMhz: 14.06,
      band: "",
      mode: "cw",
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
    const assumptions = { myAntenna: sloper, theirAntenna: dipole, noise: "rural", defaultPowerWatts: null, ssnByMonth: {} };
    const compared = (await app.api("POST", "/api/radio/observations/compare", assumptions)).body.comparison as ComparisonResult;
    expect(compared.comparedApproximate).toBe(1);
    expect(compared.rows[0]!.approximate).toBe(true);
  });
});

describeWithVoacapData("equipment profiles of a sloping wire", () => {
  const wire = { name: "Pole sloper", ...sloper, slopeDeg: 30, highEndDeg: 45, feedlineLossDb: 0.5, minMhz: 7, maxMhz: 29.7, notes: "" };
  const profiles = async () => (await app.api("GET", "/api/radio/profiles")).body.antennas as AntennaProfile[];

  it("keep its slope and the bearing of its high end, and a prediction can be asked for with it", async () => {
    const made = await app.api("POST", "/api/radio/profiles/antennas", wire);
    expect(made.status).toBe(200);
    expect(made.body.antenna).toMatchObject({ kind: "end-fed-sloping", lengthM: 20, heightM: 1.5, slopeDeg: 30, highEndDeg: 45 });
    const stored = (await profiles()).find((item) => item.name === "Pole sloper")!;
    const { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb, lengthM, slopeDeg, highEndDeg } = stored;
    const { status, body } = await predict({
      txAntenna: { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb, lengthM, slopeDeg, highEndDeg },
    });
    expect(status).toBe(200);
    expect(body.antennas.tx).toContain("its high end towards 45°");
    expect(body.antennas.tx).not.toContain("away from the other station");
  });

  it("drop the slope when a profile becomes another kind, and nothing is left behind", async () => {
    const id = (await profiles()).find((item) => item.name === "Pole sloper")!.id;
    const { slopeDeg: _s, highEndDeg: _h, ...level } = { ...wire, ...preset("efhw-20m-horizontal") };
    const changed = await app.api("PATCH", `/api/radio/profiles/antennas/${id}`, level);
    expect(changed.status).toBe(200);
    expect("slopeDeg" in changed.body.antenna).toBe(false);
    expect("highEndDeg" in changed.body.antenna).toBe(false);
    expect(app.ctx.sqlite.prepare("SELECT slope_deg, high_end_deg FROM antenna_profiles WHERE id = ?").get(id)).toEqual({
      slope_deg: null,
      high_end_deg: null,
    });
  });

  it("leave every other kind of profile as it was: no slope and no bearing of a high end", async () => {
    const made = await app.api("POST", "/api/radio/profiles/antennas", { name: "Plain", ...dipole, minMhz: 3.5, maxMhz: 30, notes: "" });
    expect(Object.keys(made.body.antenna).sort()).toEqual(
      [
        "broadsideDeg",
        "createdAt",
        "feedlineLossDb",
        "gainDb",
        "ground",
        "heightM",
        "id",
        "kind",
        "maxMhz",
        "minMhz",
        "name",
        "notes",
        "updatedAt",
      ].sort(),
    );
  });
});

describeWithVoacapData("answers kept with the antennas there were before", () => {
  /** The key a question had before the sloping wire: the same body, marked as it was marked then. */
  const keyBefore = async (asked: PredictionRequest) => {
    const { internals } = app.ctx.services.propagation;
    const request = normalise(asked);
    const { basis, tableSha, description, datasets } = await internals.basis(request.date, { source: "table" });
    const bands = HF_BANDS.map((item) => item.mhz);
    return internals.keyOf("point", {
      request,
      ssn: basis.ssn,
      tableSha,
      engine: description.sha256,
      datasets,
      ...wireRunsMark([request.txAntenna, request.rxAntenna], [request.frequencyMhz, ...bands, ...SWEEP_MHZ]),
    });
  };

  it("keep their keys and their answers for every antenna that was offered before", async () => {
    const before = [
      "low-dipole",
      "dipole-10m",
      "inverted-v",
      "efhw-10m-horizontal",
      "efhw-10m-vertical",
      "efhw-5m-horizontal",
      "efhw-5m-vertical",
      "efhw",
      "vertical",
      "isotropic",
    ];
    for (const id of before) {
      const asked = { ...base, txAntenna: preset(id), date: "2026-12-16" };
      const first = (await predict({ txAntenna: preset(id), date: "2026-12-16" })).body;
      expect(first.key).toBe(await keyBefore(asked));
      expect(first.request.txAntenna).toEqual(preset(id));
      expect("slopeDeg" in first.request.txAntenna).toBe(false);
    }
  });

  it("give a comparison of the generic antennas a new key, since its answer has more antennas in it", async () => {
    const { internals } = app.ctx.services.propagation;
    const asked = normalise({ ...base, txAntenna: dipole, frequencyMhz: 10.12, date: "2026-12-16" });
    const { basis, tableSha, description, datasets } = await internals.basis(asked.date, { source: "table" });
    const offeredBefore = ANTENNA_PRESETS.filter(
      (item) => !["efhw-20m-sloping", "efhw-20m-horizontal", "spooltenna-sloping"].includes(item.id),
    );
    const old = internals.keyOf("compare", {
      base: asked,
      what: "antennas",
      ssn: basis.ssn,
      tableSha,
      engine: description.sha256,
      datasets,
      antennas: offeredBefore.map((item) => [item.name, item.spec]),
      ...wireRunsMark([asked.txAntenna, asked.rxAntenna, ...offeredBefore.map((item) => item.spec)], [asked.frequencyMhz]),
    });
    internals.keep(old, "compare", description, {}, { what: "antennas", series: [], kept: "before" });
    const { body } = await app.api<CompareResult>("POST", "/api/radio/propagation/compare", { base: asked, what: "antennas" });
    expect(body.series.length).toBe(ANTENNA_PRESETS.length);
  });
});
