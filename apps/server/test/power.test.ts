/**
 * Power plans are a person's own data: kept as typed, copied and removed on request,
 * counted where Outpost says what is stored, in the database a backup copies, and
 * erased with everything else.
 */
import fs from "node:fs";
import path from "node:path";
import { type CleanupResult, newPowerPlan, type PowerPlan, type PowerPlanInput } from "@outpost/shared";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

const shack = (): PowerPlanInput => ({
  ...newPowerPlan("Shack"),
  loads: [
    { id: "pi", kind: "device", name: "Raspberry Pi", supply: "dc", quantity: 1, startHour: 0, watts: 15.3, hoursPerDay: 24 },
    {
      id: "hf",
      kind: "radio",
      name: "HF radio",
      supply: "dc",
      quantity: 1,
      startHour: 18,
      transmitW: 20,
      receiveW: 4,
      standbyW: 1,
      onAirHours: 2,
      standbyHours: 4,
      transmitShare: 0.5,
      modeFactor: 0.2,
      mode: "ssb",
    },
  ],
});

describe("power plans", () => {
  let plan: PowerPlan;

  it("keeps a plan as it was typed and gives it back", async () => {
    const created = await app.api("POST", "/api/power/plans", shack());
    expect(created.status).toBe(200);
    plan = created.body.plan;
    expect(plan).toMatchObject({ name: "Shack", loads: [{ id: "pi" }, { id: "hf", modeFactor: 0.2 }] });
    expect((await app.api("GET", `/api/power/plans/${plan.id}`)).body.plan).toEqual(plan);
    expect((await app.api("GET", "/api/power/plans")).body.plans).toHaveLength(1);
  });

  it("changes a plan", async () => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = plan;
    const changed = await app.api("PUT", `/api/power/plans/${plan.id}`, { ...input, name: "Shack, winter", cableRatingA: 40 });
    expect(changed.status).toBe(200);
    expect(changed.body.plan).toMatchObject({ name: "Shack, winter", cableRatingA: 40 });
  });

  it("refuses what is not a plan, saying why", async () => {
    const bad = shack();
    bad.loads[1] = { ...(bad.loads[1] as Extract<PowerPlanInput["loads"][number], { kind: "radio" }>), onAirHours: 20, standbyHours: 10 };
    const refused = await app.api("POST", "/api/power/plans", bad);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("more than a day");
    const noSun = { ...shack(), solar: { ...shack().solar, sunHours: [1, 2] } };
    expect((await app.api("POST", "/api/power/plans", noSun)).status).toBe(400);
    expect((await app.api("GET", "/api/power/plans/nothing-here")).status).toBe(404);
  });

  it("copies a plan under a new name, leaving the first as it was", async () => {
    const copy = await app.api("POST", `/api/power/plans/${plan.id}/copy`);
    expect(copy.status).toBe(200);
    expect(copy.body.plan.name).toBe("Shack, winter (copy)");
    expect(copy.body.plan.id).not.toBe(plan.id);
    expect(copy.body.plan.loads).toEqual(plan.loads);
    expect((await app.api("GET", "/api/power/plans")).body.plans).toHaveLength(2);
    expect((await app.api("DELETE", `/api/power/plans/${copy.body.plan.id}`)).status).toBe(200);
    expect((await app.api("GET", "/api/power/plans")).body.plans).toHaveLength(1);
  });

  it("is counted on the Storage screen and where erasing everything is planned", async () => {
    await app.api("POST", "/api/power/plans", { ...shack(), name: "Car" });
    expect(app.ctx.services.power.kept.count()).toBe(2);
    const planned = await app.api("POST", "/api/manage/plan", { scope: "everything" });
    expect(planned.body.personal.powerPlans).toBe(2);
  });

  it("is in the snapshot of the database that a backup is made of", async () => {
    const snapshot = path.join(app.dir, "snapshot.db");
    await app.ctx.sqlite.backup(snapshot);
    const copy = new Database(snapshot, { readonly: true });
    try {
      expect((copy.prepare("SELECT count(*) AS n FROM power_plans").get() as { n: number }).n).toBe(2);
    } finally {
      copy.close();
      fs.rmSync(snapshot, { force: true });
    }
  });

  it("is erased with everything else", async () => {
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.powerPlans).toBe(2);
    expect((await app.api("GET", "/api/power/plans")).body.plans).toEqual([]);
  });
});
