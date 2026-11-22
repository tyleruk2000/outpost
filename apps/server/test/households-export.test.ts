/**
 * Export everything with households: one household keeps the folders as they always were;
 * several get a folder each for their supplies and papers, and the people and book answers
 * come out too.
 */
import {
  type CleanupPlan,
  type CleanupResult,
  type ExportEstimate,
  emptyPlanBody,
  type HouseholdResponse,
  type HouseholdsResponse,
  type JobDto,
  type PersonResponse,
} from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
const plan = (name: string) => ({ name, kind: "other", kindText: "", templateId: null, reviewEveryDays: 180, body: emptyPlanBody() });

beforeEach(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterEach(async () => {
  await app.close();
});

function readZip(file: Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const found = new Map<string, string>();
    yauzl.fromBuffer(file, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            found.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(found));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

async function exportAll(include: string[]): Promise<Map<string, string>> {
  const started = await app.api<{ job: JobDto }>("POST", "/api/export-all", { destination: { kind: "download" }, include });
  expect(started.status).toBe(200);
  await app.ctx.jobs.whenIdle();
  const zip = await app.app.inject({ method: "GET", url: `/api/export-all/${started.body.job.id}/download` });
  expect(zip.statusCode).toBe(200);
  return readZip(zip.rawPayload);
}

const sheet = (name: string, memberId: string | null) => ({ memberId, name, record: { notes: `${name}'s notes` } });

describe("export everything with households", () => {
  it("with one household, keeps the folders as they were, and exports the people", async () => {
    await app.api("POST", "/api/supplies/items", { name: "Rice", category: "food", quantity: 2 });
    const ann = (await app.api<PersonResponse>("POST", "/api/people", { kind: "person", name: "Ann", band: "19-64" })).body.person;
    expect((await app.api("POST", "/api/medical-sheets", sheet("Ann", ann.id))).status).toBe(200);

    await app.api("POST", "/api/emergency-plans", plan("Power cut"));
    const entries = await exportAll(["supplies", "papers", "households", "plans"]);
    expect(entries.has("plans/Power cut.json")).toBe(true);
    expect(entries.get("supplies/supplies.csv")).toContain("Rice");
    expect([...entries.keys()].filter((name) => name.startsWith("papers/"))).toEqual(["papers/Medical sheet - Ann.json"]);
    const people = JSON.parse(entries.get("households/people.json")!);
    expect(people).toEqual([expect.objectContaining({ name: "Ann", ageBand: "19-64", households: ["Home"] })]);
    expect(JSON.parse(entries.get("households/households.json")!)).toEqual([
      expect.objectContaining({ name: "Home", kind: "fixed", people: ["Ann"] }),
    ]);
  });

  it("with several, gives each household a folder of its supplies and papers", async () => {
    const caravan = (await app.api<HouseholdResponse>("POST", "/api/households", { name: "Caravan", kind: "portable" })).body.household;
    await app.api("PUT", `/api/households/${caravan.id}/here`, { lat: 54.6, lon: -3.1, name: "Keswick campsite", source: "map" });
    const ann = (
      await app.api<PersonResponse>("POST", "/api/people", {
        kind: "person",
        name: "Ann",
        band: "19-64",
        householdIds: ["household", caravan.id],
      })
    ).body.person;
    const rex = (
      await app.api<PersonResponse>("POST", "/api/people", { kind: "pet", name: "Rex", kcalPerDay: 900, householdIds: [caravan.id] })
    ).body.person;
    await app.api("POST", "/api/medical-sheets", sheet("Ann", ann.id));
    await app.api("POST", "/api/medical-sheets", sheet("Rex", rex.id));
    await app.api("POST", "/api/supplies/items", { name: "Rice", category: "food", quantity: 2 });
    await app.api("POST", "/api/emergency-plans", plan("Power cut"));
    // Kept for the caravan: added while it is current, as a person would.
    await app.api("PUT", "/api/households/current", { id: caravan.id });
    await app.api("POST", "/api/supplies/items", { name: "Gas canister", category: "equipment", quantity: 1 });
    await app.api("POST", "/api/emergency-plans", plan("Flood"));
    await app.api("PUT", "/api/households/current", { id: "household" });

    const estimate = (await app.api<ExportEstimate>("GET", "/api/export-all/estimate")).body;
    expect(estimate.sections.find((section) => section.id === "households")?.label).toBe("Households and people");

    const entries = await exportAll(["supplies", "papers", "households", "plans"]);
    expect(entries.has("plans/Home/Power cut.json")).toBe(true);
    expect(entries.has("plans/Caravan/Flood.json")).toBe(true);
    expect(entries.has("plans/Home/Flood.json")).toBe(false);
    expect(entries.get("supplies/Home/supplies.csv")).toContain("Rice");
    expect(entries.get("supplies/Home/supplies.csv")).not.toContain("Gas canister");
    expect(entries.get("supplies/Caravan/supplies.csv")).toContain("Gas canister");
    // Ann is in both, so her sheet is in both; Rex only in the caravan's.
    expect(entries.has("papers/Home/Medical sheet - Ann.json")).toBe(true);
    expect(entries.has("papers/Caravan/Medical sheet - Ann.json")).toBe(true);
    expect(entries.has("papers/Caravan/Medical sheet - Rex.json")).toBe(true);
    expect(entries.has("papers/Home/Medical sheet - Rex.json")).toBe(false);
    const households = JSON.parse(entries.get("households/households.json")!);
    expect(households).toEqual([
      expect.objectContaining({ name: "Home", people: ["Ann"] }),
      expect.objectContaining({
        name: "Caravan",
        kind: "portable",
        people: ["Ann", "Rex"],
        home: expect.objectContaining({ name: "Keswick campsite" }),
      }),
    ]);
    expect(JSON.parse(entries.get("households/people.json")!).find((person: { name: string }) => person.name === "Ann").households).toEqual(
      ["Home", "Caravan"],
    );
  });
});

describe("erase everything with households", () => {
  it("counts the households and positions, and leaves one household afterwards", async () => {
    const caravan = (await app.api<HouseholdResponse>("POST", "/api/households", { name: "Caravan", kind: "portable" })).body.household;
    await app.api("PUT", `/api/households/${caravan.id}/here`, { lat: 54.6, lon: -3.1, source: "device" });
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.households).toEqual({ households: 2, positions: 1 });

    const started = await app.api<{ job: JobDto }>("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.households).toEqual({ households: 2, positions: 1 });
    const after = (await app.api<HouseholdsResponse>("GET", "/api/households")).body;
    expect(after.households.map((household) => household.name)).toEqual(["Home"]);
  });
});
