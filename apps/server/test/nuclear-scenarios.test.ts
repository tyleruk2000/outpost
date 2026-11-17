/**
 * Scenarios saved in the nuclear effects simulator: stored as typed, refused with the
 * model's own reason when the model cannot answer them, counted where Outpost says
 * what is stored, in the database a backup copies, and erased with everything else.
 */
import fs from "node:fs";
import path from "node:path";
import type { CleanupPlan, CleanupResult, NuclearScenario } from "@outpost/shared";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { measureContents } from "../src/modules/database/inspect.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app?.close();
});

const surface = {
  name: "1 kiloton at the old quarry",
  notes: "For the reading group.",
  lat: 54.46,
  lon: -3.09,
  effects: { yieldKt: 1, burst: { kind: "surface" }, wind: { fromDegrees: 250, kmh: 24 } },
};

describe("saved scenarios", () => {
  let saved: NuclearScenario;

  it("are kept as typed and read back", async () => {
    const created = await app.api<NuclearScenario>("POST", "/api/nuclear/scenarios", surface);
    expect(created.status).toBe(201);
    saved = created.body;
    expect(saved).toMatchObject(surface);
    const list = (await app.api<{ scenarios: NuclearScenario[] }>("GET", "/api/nuclear/scenarios")).body.scenarios;
    expect(list.map((item) => item.id)).toEqual([saved.id]);
    expect((await app.api("GET", `/api/nuclear/scenarios/${saved.id}`)).body).toEqual(saved);
  });

  it("are changed in place", async () => {
    const changed = await app.api<NuclearScenario>("PATCH", `/api/nuclear/scenarios/${saved.id}`, {
      ...surface,
      name: "Airburst over the quarry",
      effects: { yieldKt: 20, burst: { kind: "optimum", psi: 5 }, wind: null },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.name).toBe("Airburst over the quarry");
    expect(changed.body.effects.burst).toEqual({ kind: "optimum", psi: 5 });
    expect(changed.body.createdAt).toBe(saved.createdAt);
  });

  it("refuse a change made from an older copy, so an edit on another device is not lost", async () => {
    const opened = (await app.api<NuclearScenario>("GET", `/api/nuclear/scenarios/${saved.id}`)).body;
    const base = opened.updatedAt;
    const a = await app.api<NuclearScenario>("PATCH", `/api/nuclear/scenarios/${saved.id}`, { ...surface, name: "A", baseUpdatedAt: base });
    expect(a.status).toBe(200);
    expect(a.body.updatedAt).toBeGreaterThan(base);

    const b = await app.api("PATCH", `/api/nuclear/scenarios/${saved.id}`, { ...surface, name: "B", baseUpdatedAt: base });
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe("conflict");
    expect(b.body.error.details).toEqual({ current: { updatedAt: a.body.updatedAt, name: "A" } });
    expect(b.body.error.message).toMatch(/changed somewhere else/);
    expect((await app.api("GET", `/api/nuclear/scenarios/${saved.id}`)).body).toEqual(a.body);

    let current = a.body.updatedAt;
    for (const name of ["B", "C"]) {
      const next = await app.api<NuclearScenario>("PATCH", `/api/nuclear/scenarios/${saved.id}`, {
        ...surface,
        name,
        baseUpdatedAt: current,
      });
      expect(next.status).toBe(200);
      expect(next.body.updatedAt).toBeGreaterThan(current);
      current = next.body.updatedAt;
    }
    // Without a base the change is made as before.
    const forced = {
      ...surface,
      name: "Airburst over the quarry",
      effects: { yieldKt: 20, burst: { kind: "optimum", psi: 5 }, wind: null },
    };
    expect((await app.api("PATCH", `/api/nuclear/scenarios/${saved.id}`, forced)).status).toBe(200);
  });

  it("are refused with the model's reason when the model cannot answer them", async () => {
    const tooBig = await app.api("POST", "/api/nuclear/scenarios", { ...surface, effects: { ...surface.effects, yieldKt: 50_000 } });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.message).toMatch(/1 kiloton to 10 megatons/);
    const calm = await app.api("POST", "/api/nuclear/scenarios", {
      ...surface,
      effects: { ...surface.effects, wind: { fromDegrees: 90, kmh: 3 } },
    });
    expect(calm.status).toBe(400);
    expect(calm.body.error.message).toMatch(/8 to 45 miles per hour/);
    const unnamed = await app.api("POST", "/api/nuclear/scenarios", { ...surface, name: " " });
    expect(unnamed.status).toBe(400);
    const nowhere = await app.api("POST", "/api/nuclear/scenarios", { ...surface, lat: 95 });
    expect(nowhere.status).toBe(400);
    expect((await app.api<{ scenarios: unknown[] }>("GET", "/api/nuclear/scenarios")).body.scenarios).toHaveLength(1);
  });

  it("are counted in Storage → Database and are in the snapshot a backup copies", async () => {
    const file = path.join(app.dir, "snapshot.db");
    await app.ctx.sqlite.backup(file);
    try {
      const contents = measureContents(file);
      expect(contents.counts.find((count) => count.id === "scenarios")?.count).toBe(1);
      const copy = new Database(file, { readonly: true });
      try {
        expect((copy.prepare("SELECT name FROM nuclear_scenarios").get() as { name: string }).name).toBe("Airburst over the quarry");
      } finally {
        copy.close();
      }
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("are counted and erased by erase everything", async () => {
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.nuclearScenarios).toBe(1);
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.nuclearScenarios).toBe(1);
    expect((await app.api<{ scenarios: unknown[] }>("GET", "/api/nuclear/scenarios")).body.scenarios).toEqual([]);
  });

  it("say so when one is not there", async () => {
    expect((await app.api("GET", "/api/nuclear/scenarios/nope")).status).toBe(404);
    expect((await app.api("DELETE", "/api/nuclear/scenarios/nope")).status).toBe(404);
  });
});
