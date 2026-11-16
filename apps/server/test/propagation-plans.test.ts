/**
 * Communication plans through the API, with the real engine: a plan is kept as the
 * person wrote it, its matrix is the engine's own answer for every pair each way, the
 * recommendation follows the stated rule, and links to notes and documents are kept.
 */
import {
  ANTENNA_PRESETS,
  type CommunicationPlan,
  hourRanges,
  type PlanInput,
  type PlanPair,
  type PlanResult,
  type PredictionResult,
  planHours,
  planRecommendation,
  planRule,
  planTwoWay,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";
import { describeWithVoacapData } from "./voacap-data.ts";

const dipole = ANTENNA_PRESETS.find((preset) => preset.id === "low-dipole")!.spec;
const vertical = ANTENNA_PRESETS.find((preset) => preset.id === "vertical")!.spec;

const station = (id: string, name: string, lat: number, lon: number, patch: Record<string, unknown> = {}) => ({
  id,
  name,
  lat,
  lon,
  powerWatts: 5,
  antenna: dipole,
  antennaName: "Low horizontal dipole, 5 m",
  noise: "residential" as const,
  ...patch,
});

const family: PlanInput = {
  name: "Family net",
  notes: "Call on the hour. Listen for five minutes.",
  stations: [
    station("home", "Home base", 51.5074, -0.1278, { noise: "city" }),
    station("shelter", "Remote shelter", 54.4609, -3.0886, { noise: "remote" }),
    station("gran", "Gran's house", 52.4862, -1.8904, { powerWatts: 50, antenna: vertical, antennaName: "Quarter-wave vertical" }),
  ],
  date: "2026-11-16",
  fromUtc: 8,
  toUtc: 17,
  bands: ["40m", "80m", "20m"],
  mode: "ssb",
  requiredSnrDb: null,
  referenceBandwidthHz: null,
  solar: { source: "table" },
  links: [],
};

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

const day = (value: number | null) => Array.from({ length: 24 }, () => value);
/** A pair with made-up figures, to hold the rule to its words. The figures are the test's, not the engine's. */
function pairOf(bands: Array<{ id: string; forward: Array<number | null>; back?: Array<number | null>; snr?: number }>): PlanPair {
  return {
    a: "a",
    b: "b",
    distanceKm: 100,
    bearingDeg: 0,
    backBearingDeg: 180,
    problem: null,
    bands: bands.map((band) => ({
      bandId: band.id,
      mhz: 7.1,
      forward: { reliability: band.forward, snrDbHz: day(band.snr ?? 40) },
      back: { reliability: band.back ?? band.forward, snrDbHz: day(band.snr ?? 40) },
    })),
  };
}

describe("the rule for choosing bands", () => {
  it("reads a window in order, past midnight too", () => {
    expect(planHours(8, 11)).toEqual([8, 9, 10, 11]);
    expect(planHours(22, 3)).toEqual([22, 23, 24, 1, 2, 3]);
    expect(planHours(5, 5)).toEqual([5]);
    expect(planHours(1, 24)).toHaveLength(24);
    expect(hourRanges([7, 8, 9, 14])).toBe("07:00 to 09:00, 14:00");
    expect(hourRanges([23, 24, 1, 2])).toBe("23:00 to 02:00");
    expect(hourRanges([])).toBe("");
  });

  it("takes the weaker direction, and the band with the highest average over the window as primary", () => {
    const up = day(0.2).map((value, index) => (index >= 8 && index <= 11 ? 0.8 : value));
    const pair = pairOf([
      { id: "80m", forward: day(0.6), back: day(0.3) },
      { id: "40m", forward: up, back: day(0.9) },
      { id: "20m", forward: day(0.05) },
    ]);
    expect(planTwoWay(pair.bands[0]!, 9, false)).toBe(0.3);
    const chosen = planRecommendation(pair, planHours(8, 12), false);
    // 40 m: 0.2 at 08:00 and 0.8 from 09:00 to 12:00, mean 0.68. 80 m: 0.3 throughout.
    expect(chosen.primary).toMatchObject({ bandId: "40m", hours: [9, 10, 11, 12], best: 0.8, belowHalf: false });
    expect(chosen.primary!.mean).toBeCloseTo(0.68, 6);
    // 80 m never reaches half the days: its best hours are given, and marked.
    expect(chosen.alternate).toMatchObject({ bandId: "80m", hours: [8, 9, 10, 11, 12], belowHalf: true });
    // 20 m never reaches a tenth of days and is not offered.
    expect(planRecommendation(pairOf([{ id: "20m", forward: day(0.05) }]), planHours(8, 12), false)).toMatchObject({
      primary: null,
      alternate: null,
      none: "No band of the plan reaches 10% of days both ways in this window.",
    });
  });

  it("breaks a tie on the signal-to-noise ratio, and counts an hour with no path as no days", () => {
    const tied = pairOf([
      { id: "80m", forward: day(0.6), snr: 40 },
      { id: "40m", forward: day(0.6), snr: 47 },
    ]);
    expect(planRecommendation(tied, planHours(8, 12), false).primary?.bandId).toBe("40m");
    const gap = day(0.9).map((value, index) => (index === 8 ? null : value));
    const withGap = planRecommendation(pairOf([{ id: "40m", forward: gap }]), planHours(8, 10), false);
    expect(withGap.primary).toMatchObject({ hours: [8, 10] });
    expect(withGap.primary!.mean).toBeCloseTo(0.6, 6);
  });

  it("compares by ratio when the mode has no requirement, and says so", () => {
    const pair = pairOf([
      { id: "80m", forward: day(null), snr: 30 },
      { id: "40m", forward: day(null), snr: 41 },
    ]);
    const chosen = planRecommendation(pair, planHours(8, 12), true);
    expect(chosen).toMatchObject({ byRatio: true, primary: { bandId: "40m", best: 41 }, alternate: { bandId: "80m" } });
    expect(planRule(true)[0]).toContain("no stated requirement");
    expect(planRule(false).join(" ")).toContain(
      "The primary band is the one whose two-way figure, averaged over the hours of the window, is highest",
    );
  });

  it("recommends nothing for a pair the engine could not answer", () => {
    const pair = { ...pairOf([]), problem: "The engine could not work this pair out." };
    expect(planRecommendation(pair, planHours(8, 12), false)).toMatchObject({
      primary: null,
      none: "The engine could not work this pair out.",
    });
  });
});

describeWithVoacapData("a plan", () => {
  let plan: CommunicationPlan;
  let matrix: PlanResult;

  it("is kept as it was written, with positions as the engine reads them", async () => {
    const created = await app.api("POST", "/api/radio/communication-plans", family);
    expect(created.status).toBe(200);
    plan = created.body.plan;
    expect(plan).toMatchObject({ name: "Family net", fromUtc: 8, toUtc: 17, workedOut: false, linked: [] });
    // Bands in the order they are always listed in, whatever order they were sent in.
    expect(plan.bands).toEqual(["80m", "40m", "20m"]);
    expect(plan.stations[0]).toMatchObject({ id: "home", lat: 51.51, lon: -0.13, noise: "city" });
    expect((await app.api("GET", "/api/radio/communication-plans")).body.plans.map((item: CommunicationPlan) => item.id)).toEqual([
      plan.id,
    ]);
    expect((await app.api("GET", `/api/radio/communication-plans/${plan.id}/matrix`)).status).toBe(404);
  });

  it("has a matrix that is the engine's own answer for every pair, each way", async () => {
    const worked = await app.api("POST", `/api/radio/communication-plans/${plan.id}/matrix`);
    expect(worked.status).toBe(200);
    matrix = worked.body.matrix;
    expect(matrix.cached).toBe(false);
    expect(matrix.pairs.map((pair) => `${pair.a}-${pair.b}`)).toEqual(["home-shelter", "home-gran", "shelter-gran"]);
    expect(matrix.basis.summary).toContain("Monthly median for November 2026 at smoothed sunspot number 83");
    expect(matrix.mode).toMatchObject({ id: "ssb", requiredSnrDbHz: 45 });
    expect(matrix.engine.name).toBe("VOACAP");

    // Home to Gran's on 40 m, and back, against the planner's answer for the same two paths.
    const pair = matrix.pairs[1]!;
    const band = pair.bands.find((item) => item.bandId === "40m")!;
    const [home, , gran] = plan.stations;
    const ask = async (from: typeof home, to: typeof home) =>
      (
        await app.api<PredictionResult>("POST", "/api/radio/propagation/predict", {
          tx: { name: from!.name, lat: from!.lat, lon: from!.lon },
          rx: { name: to!.name, lat: to!.lat, lon: to!.lon },
          date: "2026-11-16",
          powerWatts: from!.powerWatts,
          txAntenna: from!.antenna,
          rxAntenna: to!.antenna,
          noise: to!.noise,
          frequencyMhz: 7.1,
          mode: "ssb",
          solar: { source: "table" },
        })
      ).body;
    const forward = await ask(home, gran);
    const back = await ask(gran, home);
    expect(pair.distanceKm).toBe(forward.path.distanceKm);
    expect(band.forward.reliability).toEqual(forward.hours.map((hour) => hour.asked.reliability));
    expect(band.forward.snrDbHz).toEqual(forward.hours.map((hour) => hour.asked.snrDbHz));
    expect(band.back.reliability).toEqual(back.hours.map((hour) => hour.asked.reliability));
    // The two directions are not the same: different power, antennas and noise at each end.
    expect(band.forward.reliability).not.toEqual(band.back.reliability);

    // The rule, applied to the engine's figures, gives a primary that is no worse than the alternate.
    const chosen = planRecommendation(pair, planHours(plan.fromUtc, plan.toUtc), false);
    expect(chosen.primary).not.toBeNull();
    if (chosen.alternate) expect(chosen.primary!.mean).toBeGreaterThanOrEqual(chosen.alternate.mean);
  });

  it("keeps the matrix, and finds it again unless what the engine was asked has changed", async () => {
    expect((await app.api("GET", `/api/radio/communication-plans/${plan.id}`)).body.plan.workedOut).toBe(true);
    const kept = await app.api("GET", `/api/radio/communication-plans/${plan.id}/matrix`);
    expect(kept.body.matrix).toMatchObject({ key: matrix.key, cached: true });
    expect(kept.body.matrix.pairs).toEqual(matrix.pairs);

    // The window, the name and the notes are not put to the engine.
    const renamed = await app.api("PATCH", `/api/radio/communication-plans/${plan.id}`, {
      ...family,
      name: "Family net, winter",
      fromUtc: 18,
      toUtc: 2,
    });
    expect(renamed.body.plan).toMatchObject({ name: "Family net, winter", fromUtc: 18, toUtc: 2, workedOut: true });

    // More power at one station is a different question.
    const stronger = { ...family, stations: family.stations.map((item, index) => (index === 0 ? { ...item, powerWatts: 100 } : item)) };
    const changed = await app.api("PATCH", `/api/radio/communication-plans/${plan.id}`, stronger);
    expect(changed.body.plan.workedOut).toBe(false);
    expect((await app.api("GET", `/api/radio/communication-plans/${plan.id}/matrix`)).status).toBe(404);
    const again = (await app.api("POST", `/api/radio/communication-plans/${plan.id}/matrix`)).body.matrix as PlanResult;
    expect(again.key).not.toBe(matrix.key);
    expect(again.pairs[0]!.bands[0]!.forward.snrDbHz).not.toEqual(matrix.pairs[0]!.bands[0]!.forward.snrDbHz);
    // The way back to a station whose power did not change is as it was.
    expect(again.pairs[0]!.bands[0]!.back.snrDbHz).toEqual(matrix.pairs[0]!.bands[0]!.back.snrDbHz);

    // Put back, the first answer is found already worked out.
    await app.api("PATCH", `/api/radio/communication-plans/${plan.id}`, family);
    const back = (await app.api("POST", `/api/radio/communication-plans/${plan.id}/matrix`)).body.matrix as PlanResult;
    expect(back).toMatchObject({ key: matrix.key, cached: true });
  });

  it("gives ratios and no reliability for a mode with no figure", async () => {
    const digital = (await app.api("POST", "/api/radio/communication-plans", { ...family, name: "Digital", mode: "digital" })).body.plan;
    const worked = (await app.api("POST", `/api/radio/communication-plans/${digital.id}/matrix`)).body.matrix as PlanResult;
    expect(worked.mode.requiredSnrDbHz).toBeNull();
    const band = worked.pairs[0]!.bands[0]!;
    expect(band.forward.reliability.every((value) => value === null)).toBe(true);
    expect(band.forward.snrDbHz.some((value) => value !== null)).toBe(true);
    expect(planRecommendation(worked.pairs[0]!, planHours(8, 17), true).primary).not.toBeNull();
    await app.api("DELETE", `/api/radio/communication-plans/${digital.id}`);
  });

  it("says which pair cannot be worked out when two stations are in one place", async () => {
    const twins = {
      ...family,
      name: "Twins",
      stations: [family.stations[0]!, { ...family.stations[0]!, id: "also", name: "Also home" }, family.stations[2]!],
    };
    const made = (await app.api("POST", "/api/radio/communication-plans", twins)).body.plan;
    const worked = (await app.api("POST", `/api/radio/communication-plans/${made.id}/matrix`)).body.matrix as PlanResult;
    expect(worked.pairs[0]).toMatchObject({
      a: "home",
      b: "also",
      bands: [],
      problem: "Home base and Also home are in the same place, and a path needs two different places.",
    });
    expect(worked.pairs[1]!.problem).toBeNull();
    await app.api("DELETE", `/api/radio/communication-plans/${made.id}`);
  });

  it("links to notes and documents, and says when one has gone", async () => {
    const note = (await app.api("POST", "/api/notes", { title: "Net procedure" })).body.note;
    const linked = await app.api("PATCH", `/api/radio/communication-plans/${plan.id}`, {
      ...family,
      links: [
        { kind: "note", id: note.id },
        { kind: "document", id: "no-such-document" },
      ],
    });
    expect(linked.body.plan.linked).toEqual([
      { kind: "note", id: note.id, title: "Net procedure" },
      { kind: "document", id: "no-such-document", title: null },
    ]);
    // A link does not change what the engine was asked.
    expect(linked.body.plan.workedOut).toBe(true);
    await app.api("DELETE", `/api/notes/${note.id}`);
    expect((await app.api("GET", `/api/radio/communication-plans/${plan.id}`)).body.plan.linked[0]).toMatchObject({ title: null });
  });

  it("checks what it is given", async () => {
    const refused = async (patch: Record<string, unknown>) => {
      const { status, body } = await app.api("POST", "/api/radio/communication-plans", { ...family, ...patch });
      expect(status).toBe(400);
      return JSON.stringify(body.error);
    };
    expect(await refused({ name: " " })).toContain("Give the plan a name.");
    expect(await refused({ bands: [] })).toContain("Choose at least one band.");
    expect(await refused({ bands: ["160m"] })).toContain("bands");
    expect(await refused({ fromUtc: 0 })).toContain("fromUtc");
    expect(await refused({ stations: [family.stations[0], family.stations[0]] })).toContain("Two stations have the same id.");
    expect(await refused({ stations: Array.from({ length: 9 }, (_, n) => station(`s${n}`, `S${n}`, 50 + n, 0)) })).toContain(
      "A plan may have at most 8 stations.",
    );
    expect(await refused({ solar: { source: "fof2", fof2Mhz: 6, utcHour: 12 } })).toContain("solar");
    expect(await refused({ mode: "digital", requiredSnrDb: -60, referenceBandwidthHz: 1 })).toContain("outside what the engine takes");
    // A plan may be started with one station, but has no pair to work out yet.
    const single = (await app.api("POST", "/api/radio/communication-plans", { ...family, name: "One", stations: [family.stations[0]] }))
      .body.plan;
    const none = await app.api("POST", `/api/radio/communication-plans/${single.id}/matrix`);
    expect(none.status).toBe(400);
    expect(none.body.error.message).toContain("at least two stations");
    await app.api("DELETE", `/api/radio/communication-plans/${single.id}`);
  });

  it("works a full plan of eight stations out directly, and is deleted when asked", async () => {
    const eight = {
      ...family,
      name: "Eight",
      stations: Array.from({ length: 8 }, (_, n) => station(`s${n}`, `Station ${n + 1}`, 50 + n * 0.7, -5 + n * 0.9)),
    };
    const made = (await app.api("POST", "/api/radio/communication-plans", eight)).body.plan;
    const worked = (await app.api("POST", `/api/radio/communication-plans/${made.id}/matrix`)).body.matrix as PlanResult;
    expect(worked.pairs).toHaveLength(28);
    expect(worked.pairs.every((pair) => pair.problem === null && pair.bands.length === 3)).toBe(true);
    expect(worked.tookMs).toBeLessThan(10_000);
    expect((await app.api("DELETE", `/api/radio/communication-plans/${made.id}`)).status).toBe(200);
    expect((await app.api("GET", `/api/radio/communication-plans/${made.id}`)).status).toBe(404);
    expect((await app.api("DELETE", `/api/radio/communication-plans/${made.id}`)).status).toBe(404);
  });
});
