/**
 * Power plans are a person's own data: kept as typed, copied and removed on request,
 * counted where Outpost says what is stored, in the database a backup copies, and
 * erased with everything else.
 */
import fs from "node:fs";
import path from "node:path";
import { type CleanupResult, newPowerPlan, POWER_PLANS_MAX, type PowerPlan, type PowerPlanInput } from "@outpost/shared";
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
    { id: "pi", kind: "device", name: "Raspberry Pi", supply: "dc", quantity: 1, startHour: 0, watts: 15, hoursPerDay: 24 },
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

  it("keeps where its sun hours came from, and takes a plan from before that was recorded", async () => {
    const base = shack();
    const source = {
      kind: "pvgis" as const,
      attribution: "PVGIS © European Communities, 2001-2026",
      place: "Home",
      lat: 52.13,
      lon: -0.46,
      tilt: "optimal" as const,
      slope: 38,
      firstYear: 2005,
      lastYear: 2023,
      databases: "PVGIS-SARAH3",
      fetchedAt: 1_763_300_000_000,
      filledAt: 1_763_310_000_000,
      edited: false,
    };
    const filled = await app.api("POST", "/api/power/plans", {
      ...base,
      solar: { ...base.solar, sunHours: [1, 2, 3, 4, 5, 5, 5, 4, 3, 2, 1, 1], sunHoursSource: source },
    });
    expect(filled.status).toBe(200);
    expect(filled.body.plan.solar.sunHoursSource).toEqual(source);
    const { sunHoursSource: _none, ...older } = base.solar;
    const old = await app.api("POST", "/api/power/plans", { ...base, solar: older });
    expect(old.status).toBe(200);
    expect(old.body.plan.solar.sunHoursSource).toBeNull();
    expect(
      (await app.api("POST", "/api/power/plans", { ...base, solar: { ...base.solar, sunHoursSource: { ...source, url: "x" } } })).status,
    ).toBe(400);
    await app.api("DELETE", `/api/power/plans/${filled.body.plan.id}`);
    await app.api("DELETE", `/api/power/plans/${old.body.plan.id}`);
  });

  it("changes a plan", async () => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = plan;
    const changed = await app.api("PUT", `/api/power/plans/${plan.id}`, { ...input, name: "Shack, winter", cableRatingA: 40 });
    expect(changed.status).toBe(200);
    expect(changed.body.plan).toMatchObject({ name: "Shack, winter", cableRatingA: 40 });
  });

  it("refuses a change made from a version that another device has since saved over, and keeps the newer one", async () => {
    const opened: PowerPlan = (await app.api("GET", `/api/power/plans/${plan.id}`)).body.plan;
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = opened;
    // Two devices open the same plan; the first saves.
    const first = await app.api("PUT", `/api/power/plans/${plan.id}`, { ...input, cableRatingA: 50, baseUpdatedAt: opened.updatedAt });
    expect(first.status).toBe(200);
    expect(first.body.plan.updatedAt).toBeGreaterThan(opened.updatedAt);
    // The second saves from what it opened: refused, saying so, with the newer version's time.
    const second = await app.api("PUT", `/api/power/plans/${plan.id}`, { ...input, cableRatingA: 60, baseUpdatedAt: opened.updatedAt });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: "conflict", details: { updatedAt: first.body.plan.updatedAt } });
    expect(second.body.error.message).toMatch(/changed somewhere else/);
    expect((await app.api("GET", `/api/power/plans/${plan.id}`)).body.plan.cableRatingA).toBe(50);
    // Choosing to keep its own: it saves from the newer version's time.
    const kept = await app.api("PUT", `/api/power/plans/${plan.id}`, {
      ...input,
      cableRatingA: 60,
      baseUpdatedAt: first.body.plan.updatedAt,
    });
    expect(kept.status).toBe(200);
    expect(kept.body.plan.cableRatingA).toBe(60);
    // Without a base (an older client), a save is taken as before.
    expect((await app.api("PUT", `/api/power/plans/${plan.id}`, { ...input, cableRatingA: 40 })).status).toBe(200);
  });

  it("gives every save a later time than the one before, so that two saves in one millisecond still differ", async () => {
    const opened: PowerPlan = (await app.api("GET", `/api/power/plans/${plan.id}`)).body.plan;
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = opened;
    let base = opened.updatedAt;
    for (let i = 0; i < 5; i++) {
      const saved = await app.api("PUT", `/api/power/plans/${plan.id}`, { ...input, baseUpdatedAt: base });
      expect(saved.status).toBe(200);
      expect(saved.body.plan.updatedAt).toBeGreaterThan(base);
      base = saved.body.plan.updatedAt;
    }
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

  it("keeps no more than POWER_PLANS_MAX plans, so that the list stays a list, and says so on a new one or a copy", async () => {
    const input = shack();
    for (let made = 0; made < POWER_PLANS_MAX; made += 1) app.ctx.services.power.create({ ...input, name: `Plan ${made}` });
    const refused = await app.api("POST", "/api/power/plans", input);
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(new RegExp(`already ${POWER_PLANS_MAX} power plans`));
    const first = app.ctx.services.power.list()[0]!;
    expect((await app.api("POST", `/api/power/plans/${first.id}/copy`)).status).toBe(400);
    expect(app.ctx.services.power.kept.count()).toBe(POWER_PLANS_MAX);
    app.ctx.services.power.kept.eraseAll();
  });
});
