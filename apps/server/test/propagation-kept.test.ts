/**
 * What the HF planner keeps for a person is their own data: it is counted where
 * Outpost says what is stored, it is in the database snapshot a backup is made of, and
 * "erase everything" takes all of it.
 */
import fs from "node:fs";
import path from "node:path";
import { ANTENNA_PRESETS, type CleanupPlan, type CleanupResult } from "@outpost/shared";
import Database from "better-sqlite3";
import { afterAll, beforeAll, expect, it } from "vitest";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { describeWithVoacapData, voacapDataAbsent } from "./voacap-data.ts";

const dipole = ANTENNA_PRESETS[0]!.spec;
const station = (id: string, lat: number, lon: number) => ({
  id,
  name: id,
  lat,
  lon,
  powerWatts: 5,
  antenna: dipole,
  antennaName: "Low horizontal dipole, 5 m",
  noise: "residential",
});
const TABLES = [
  "communication_plans",
  "radio_observations",
  "observation_imports",
  "radio_profiles",
  "antenna_profiles",
  "propagation_saved",
  "propagation_results",
];

let app: TestApp;
beforeAll(async () => {
  // Everything below asks the engine (a plan's matrix): without its data there is nothing to count.
  if (voacapDataAbsent) return;
  app = await createTestApp();
  const ok = async (method: string, url: string, body?: unknown, extra?: Record<string, unknown>) => {
    const response = await app.api(method, url, body, extra);
    expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
    return response.body;
  };
  const { plan } = await ok("POST", "/api/radio/communication-plans", {
    name: "Family net",
    notes: "",
    stations: [station("home", 51.51, -0.13), station("shelter", 54.46, -3.09)],
    date: "2026-11-16",
    fromUtc: 8,
    toUtc: 17,
    bands: ["40m"],
    mode: "ssb",
    requiredSnrDb: null,
    referenceBandwidthHz: null,
    solar: { source: "table" },
    links: [],
  });
  await ok("POST", `/api/radio/communication-plans/${plan.id}/matrix`);
  const adif =
    "<ADIF_VER:5>3.1.8<EOH><CALL:5>G4BBB<QSO_DATE:8>20261116<TIME_ON:4>1204<BAND:3>40m<MODE:3>SSB<EOR><CALL:5>G4CCC<QSO_DATE:8>20261116<TIME_ON:4>1210<BAND:3>40m<MODE:2>CW<EOR>";
  const upload = multipart({}, [{ name: "log.adi", content: adif, type: "text/plain" }]);
  await ok("POST", "/api/radio/observations/import", upload.payload, { headers: upload.headers });
  await ok("POST", "/api/radio/profiles/radios", {
    name: "Hand-held",
    model: "",
    powerWatts: 5,
    minMhz: 3.5,
    maxMhz: 30,
    modes: ["ssb"],
    receiver: "",
    notes: "",
  });
  await ok("POST", "/api/radio/profiles/antennas", { name: "Garden dipole", minMhz: 7, maxMhz: 7.2, notes: "", ...dipole });
  const request = {
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
  await ok("POST", "/api/radio/propagation/saved", { name: "London to Birmingham", request });
});
afterAll(async () => {
  await app?.close();
});

describeWithVoacapData("what the HF planner keeps", () => {
  it("is counted where Outpost says what erasing everything would take", async () => {
    expect(app.ctx.services.propagation.kept.count()).toEqual({ plans: 1, observations: 2, equipment: 2, saved: 1 });
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.radio).toEqual({ plans: 1, observations: 2, equipment: 2, saved: 1 });
  });

  it("is in the snapshot of the database that a backup is made of", async () => {
    const snapshot = path.join(app.dir, "snapshot.db");
    await app.ctx.sqlite.backup(snapshot);
    const copy = new Database(snapshot, { readonly: true });
    try {
      const count = (table: string) => (copy.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
      expect(count("communication_plans")).toBe(1);
      expect(count("radio_observations")).toBe(2);
      expect(count("observation_imports")).toBe(1);
      expect(count("radio_profiles") + count("antenna_profiles")).toBe(2);
      expect((copy.prepare("SELECT name FROM communication_plans").get() as { name: string }).name).toBe("Family net");
    } finally {
      copy.close();
      fs.rmSync(snapshot, { force: true });
    }
  });

  it("is all erased with everything else", async () => {
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    const result = job!.result as CleanupResult;
    expect(result.failed).toEqual([]);
    expect(result.personal?.radio).toEqual({ plans: 1, observations: 2, equipment: 2, saved: 1 });
    const count = (table: string) => (app.ctx.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    for (const table of TABLES) expect(count(table), table).toBe(0);
    expect((await app.api("GET", "/api/radio/communication-plans")).body.plans).toEqual([]);
    expect((await app.api("GET", "/api/radio/observations")).body).toMatchObject({ observations: [], total: 0, imports: [] });
    expect((await app.api("GET", "/api/radio/profiles")).body).toEqual({ radios: [], antennas: [] });
  });
});
