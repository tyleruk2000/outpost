/**
 * Emergency plans are a person's own data: kept as typed, linked to contacts and saved
 * places without copying them, honest about a link whose contact or place has since
 * gone, ticked and reset without touching what was written, counted where Outpost says
 * what is stored, in the database a backup copies, and erased with everything else.
 */
import fs from "node:fs";
import path from "node:path";
import {
  type CleanupPlan,
  type CleanupResult,
  type EmergencyPlanInput,
  type EmergencyPlanResponse,
  emptyPlanBody,
  PLAN_TEMPLATES,
  planFromTemplate,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { measureContents } from "../src/modules/database/inspect.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

async function ok<T = EmergencyPlanResponse>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await app.api<T>(method, url, body);
  if (response.status !== 200) throw new Error(`${method} ${url}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body;
}

const blank = (name: string): EmergencyPlanInput => ({
  name,
  kind: "other",
  kindText: "",
  templateId: null,
  emergencyNumber: "999",
  reviewEveryDays: 180,
  body: emptyPlanBody(),
});

const inputOf = ({ plan }: EmergencyPlanResponse): EmergencyPlanInput => ({
  name: plan.name,
  kind: plan.kind,
  kindText: plan.kindText,
  templateId: plan.templateId,
  emergencyNumber: plan.emergencyNumber,
  reviewEveryDays: plan.reviewEveryDays,
  body: plan.body,
});

let counter = 0;
const makeId = () => `t${++counter}`;

describe("emergency plans", () => {
  let contactId: string;
  let markerId: string;
  let saved: EmergencyPlanResponse;

  it("starts a plan from the power cut template, with every step traced to its template", async () => {
    const template = PLAN_TEMPLATES.find((each) => each.kind === "power-cut")!;
    const input = planFromTemplate(template, makeId);
    saved = await ok("POST", "/api/emergency-plans", input);
    expect(saved.plan.templateId).toBe(template.id);
    expect(saved.plan.body.steps.length).toBe(template.steps.length);
    expect(saved.plan.body.steps.every((step) => step.origin !== null)).toBe(true);
    expect(saved.plan.use).toEqual({ startedAt: null, ticks: {} });
    expect((await ok<{ plans: unknown[] }>("GET", "/api/emergency-plans")).plans).toHaveLength(1);
  });

  it("links a contact and a saved place and answers with them as they are now", async () => {
    contactId = (
      await ok<{ contact: { id: string } }>("POST", "/api/contacts", {
        kind: "person",
        name: { prefix: "", given: "Ana", additional: "", family: "Silva", suffix: "" },
        phones: [{ value: "+44 7700 900123", label: "mobile" }],
      })
    ).contact.id;
    markerId = (await ok<{ marker: { id: string } }>("POST", "/api/maps/markers", { name: "Village hall", lat: 54.3, lon: -2.2 })).marker
      .id;
    const input = inputOf(saved);
    input.body.contacts = [{ id: "c1", contactId, name: "Ana Silva", phone: "", note: "Has a key", outOfArea: true }];
    input.body.places = [{ id: "p1", role: "near", markerId, name: "Village hall", note: "" }];
    saved = await ok("PUT", `/api/emergency-plans/${saved.plan.id}`, input);
    expect(saved.resolved.contacts[contactId]).toEqual({
      displayName: "Ana Silva",
      phones: [{ value: "+44 7700 900123", label: "mobile" }],
      callsign: "",
    });
    expect(saved.resolved.places[markerId]).toEqual({ name: "Village hall", lat: 54.3, lon: -2.2 });

    // A change in Contacts shows in the plan: the number is not a copy.
    await ok("PATCH", `/api/contacts/${contactId}`, { phones: [{ value: "+44 7700 900999", label: "mobile" }] });
    const again = await ok("GET", `/api/emergency-plans/${saved.plan.id}`);
    expect(again.resolved.contacts[contactId]?.phones[0]?.value).toBe("+44 7700 900999");
  });

  it("ticks steps with the time, and keeps ticking apart from editing", async () => {
    const [first, second] = saved.plan.body.steps;
    const before = Date.now();
    const ticked = await ok("POST", `/api/emergency-plans/${saved.plan.id}/ticks`, { stepId: first!.id, done: true });
    expect(ticked.plan.use.startedAt).toBeGreaterThanOrEqual(before);
    expect(ticked.plan.use.ticks[first!.id]).toBeGreaterThanOrEqual(before);
    // Ticking is not an edit.
    expect(ticked.plan.updatedAt).toBe(saved.plan.updatedAt);
    const time = ticked.plan.use.ticks[first!.id];
    // Ticking again keeps the first time; a second step adds its own.
    const twice = await ok("POST", `/api/emergency-plans/${saved.plan.id}/ticks`, { stepId: first!.id, done: true });
    expect(twice.plan.use.ticks[first!.id]).toBe(time);
    await ok("POST", `/api/emergency-plans/${saved.plan.id}/ticks`, { stepId: second!.id, done: true });
    const unticked = await ok("POST", `/api/emergency-plans/${saved.plan.id}/ticks`, { stepId: second!.id, done: false });
    expect(Object.keys(unticked.plan.use.ticks)).toEqual([first!.id]);

    // An edit made from what was read before the ticks does not undo them.
    const edited = await ok("PUT", `/api/emergency-plans/${saved.plan.id}`, { ...inputOf(saved), name: "Power cut at home" });
    expect(edited.plan.use.ticks[first!.id]).toBe(time);
    // A step taken out of the plan takes its tick with it.
    const fewer = inputOf(edited);
    fewer.body.steps = fewer.body.steps.filter((step) => step.id !== first!.id);
    const trimmed = await ok("PUT", `/api/emergency-plans/${saved.plan.id}`, fewer);
    expect(trimmed.plan.use.ticks).toEqual({});
    expect(trimmed.plan.use.startedAt).not.toBeNull();
    saved = await ok("PUT", `/api/emergency-plans/${saved.plan.id}`, inputOf(edited));

    expect((await app.api("POST", `/api/emergency-plans/${saved.plan.id}/ticks`, { stepId: "no-such-step", done: true })).status).toBe(404);
  });

  it("takes ticks made on a phone out of reach: the union, the earliest time, and a reset wins", async () => {
    const plan = await ok("POST", "/api/emergency-plans", { ...inputOf(saved), name: "Kept on a phone" });
    const id = plan.plan.id;
    const [a, b, c, d] = plan.plan.body.steps.map((step) => step.id);
    // Meanwhile on another phone in reach: a and c ticked.
    await ok("POST", `/api/emergency-plans/${id}/ticks`, { stepId: a!, done: true });
    const there = await ok("POST", `/api/emergency-plans/${id}/ticks`, { stepId: c!, done: true });
    const aAt = there.plan.use.ticks[a!]!;
    const cAt = there.plan.use.ticks[c!]!;

    // The phone ticked a earlier and b, and unticked c as it had seen it ticked at a time the server no longer has.
    const merged = await ok<{ plan: EmergencyPlanResponse["plan"]; applied: number; dropped: number }>(
      "POST",
      `/api/emergency-plans/${id}/ticks/merge`,
      { knownStartedAt: null, ticks: { [a!]: aAt - 60_000, [b!]: aAt - 30_000, "gone-step": aAt }, unticks: { [c!]: cAt - 1 } },
    );
    expect(merged.plan.use.ticks).toEqual({ [a!]: aAt - 60_000, [b!]: aAt - 30_000, [c!]: cAt });
    expect(merged.plan.use.startedAt).toBe(aAt - 60_000);
    expect({ applied: merged.applied, dropped: merged.dropped }).toEqual({ applied: 2, dropped: 2 });

    // An untick of the very tick the server has takes it away; a tick dated in the future is taken as now.
    const before = Date.now();
    const again = await ok<{ plan: EmergencyPlanResponse["plan"] }>("POST", `/api/emergency-plans/${id}/ticks/merge`, {
      knownStartedAt: merged.plan.use.startedAt,
      ticks: { [d!]: before + 86_400_000 },
      unticks: { [c!]: cAt },
    });
    expect(again.plan.use.ticks[c!]).toBeUndefined();
    expect(again.plan.use.ticks[d!]).toBeLessThanOrEqual(Date.now());

    // Reset on the server since the phone's copy: what the phone did before the new start is dropped.
    const known = again.plan.use.startedAt;
    await ok("POST", `/api/emergency-plans/${id}/reset`);
    const afterReset = await ok<{ plan: EmergencyPlanResponse["plan"]; dropped: number }>(
      "POST",
      `/api/emergency-plans/${id}/ticks/merge`,
      {
        knownStartedAt: known,
        ticks: { [b!]: Date.now() - 1000 },
        unticks: {},
      },
    );
    expect(afterReset.plan.use).toEqual({ startedAt: null, ticks: {} });
    expect(afterReset.dropped).toBe(1);
    expect((await app.api("POST", `/api/emergency-plans/${id}/ticks/merge`, { knownStartedAt: null, ticks: {} })).status).toBe(400);
    await ok("DELETE", `/api/emergency-plans/${id}`);
  });

  it("resets for next time", async () => {
    const step = saved.plan.body.steps[0]!;
    await ok("POST", `/api/emergency-plans/${saved.plan.id}/ticks`, { stepId: step.id, done: true });
    const reset = await ok("POST", `/api/emergency-plans/${saved.plan.id}/reset`);
    expect(reset.plan.use).toEqual({ startedAt: null, ticks: {} });
    const started = await ok("POST", `/api/emergency-plans/${saved.plan.id}/start`);
    expect(started.plan.use.startedAt).not.toBeNull();
    expect(started.plan.use.ticks).toEqual({});
    await ok("POST", `/api/emergency-plans/${saved.plan.id}/reset`);
  });

  it("records a review and an opening only when asked by a press, never by reading", async () => {
    const read = await ok("GET", `/api/emergency-plans/${saved.plan.id}`);
    expect(read.plan.openedAt).toBeNull();
    const opened = await ok("POST", `/api/emergency-plans/${saved.plan.id}/opened`);
    expect(opened.plan.openedAt).not.toBeNull();
    const reviewed = await ok("POST", `/api/emergency-plans/${saved.plan.id}/reviewed`);
    expect(reviewed.plan.reviewedAt).toBeGreaterThanOrEqual(read.plan.reviewedAt);
  });

  it("shows a deleted contact or place as missing, keeping its line and its name", async () => {
    await ok("DELETE", `/api/contacts/${contactId}`);
    await ok("DELETE", `/api/maps/markers/${markerId}`);
    const after = await ok("GET", `/api/emergency-plans/${saved.plan.id}`);
    expect(after.plan.body.contacts).toEqual([{ id: "c1", contactId, name: "Ana Silva", phone: "", note: "Has a key", outOfArea: true }]);
    expect(after.resolved.contacts[contactId]).toBeNull();
    expect(after.plan.body.places[0]).toMatchObject({ markerId, name: "Village hall" });
    expect(after.resolved.places[markerId]).toBeNull();
    const list = await ok<{ plans: Array<{ id: string; missing: number }> }>("GET", "/api/emergency-plans");
    expect(list.plans.find((plan) => plan.id === saved.plan.id)?.missing).toBe(2);
  });

  it("names a linked note, document or power plan, and says when one is gone", async () => {
    const power = await ok<{ plan: { id: string } }>("POST", "/api/power/plans", (await import("@outpost/shared")).newPowerPlan("House"));
    const input = inputOf(saved);
    input.body.powerPlanId = power.plan.id;
    input.body.links = [{ kind: "note", id: "gone-note" }];
    const linked = await ok("PUT", `/api/emergency-plans/${saved.plan.id}`, input);
    expect(linked.resolved.powerPlan).toEqual({ id: power.plan.id, name: "House" });
    expect(linked.resolved.links).toEqual([{ kind: "note", id: "gone-note", title: null }]);
    await ok("DELETE", `/api/power/plans/${power.plan.id}`);
    expect((await ok("GET", `/api/emergency-plans/${saved.plan.id}`)).resolved.powerPlan).toBeNull();
    saved = await ok("PUT", `/api/emergency-plans/${saved.plan.id}`, { ...input, body: { ...input.body, powerPlanId: null, links: [] } });
    expect(saved.resolved.powerPlan).toBeUndefined();
  });

  it("refuses what is not a plan, saying why", async () => {
    expect((await app.api("POST", "/api/emergency-plans", { ...blank(""), name: " " })).status).toBe(400);
    const twin = blank("Twins");
    twin.body.steps = [
      { id: "a", phase: "before", text: "One", origin: null },
      { id: "a", phase: "during", text: "Two", origin: null },
    ];
    const refused = await app.api("POST", "/api/emergency-plans", twin);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("same id");
    expect((await app.api("POST", "/api/emergency-plans", { ...blank("x"), kind: "zombies" })).status).toBe(400);
    expect((await app.api("POST", "/api/emergency-plans", { ...blank("x"), emergencyNumber: "1".repeat(21) })).status).toBe(400);
    expect((await app.api("GET", "/api/emergency-plans/nothing-here")).status).toBe(404);
  });

  it("keeps free text for a kind of its own, for other screens to file plans under", async () => {
    const own = await ok("POST", "/api/emergency-plans", { ...blank("Radiation"), kindText: "Nuclear incident", emergencyNumber: "112" });
    expect(own.plan).toMatchObject({ kind: "other", kindText: "Nuclear incident", emergencyNumber: "112" });
    const copy = await ok("POST", `/api/emergency-plans/${own.plan.id}/copy`);
    expect(copy.plan.name).toBe("Radiation (copy)");
    expect(copy.plan.use).toEqual({ startedAt: null, ticks: {} });
    await ok("DELETE", `/api/emergency-plans/${copy.plan.id}`);
    expect(app.ctx.services.emergencyPlans.kept.count()).toBe(2);
  });

  it("refuses a change made from an older copy, so an edit on another device is not lost", async () => {
    const opened = await ok("POST", "/api/emergency-plans", blank("Flood"));
    const base = opened.plan.updatedAt;
    // Device A saves first, from the copy both devices opened.
    const a = await ok("PUT", `/api/emergency-plans/${opened.plan.id}`, { ...inputOf(opened), name: "Flood (A)", baseUpdatedAt: base });
    expect(a.plan.updatedAt).toBeGreaterThan(base);

    // Device B still has that copy.
    const b = await app.api("PUT", `/api/emergency-plans/${opened.plan.id}`, {
      ...inputOf(opened),
      name: "Flood (B)",
      baseUpdatedAt: base,
    });
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe("conflict");
    expect(b.body.error.details).toEqual({ current: { updatedAt: a.plan.updatedAt, name: "Flood (A)" } });
    expect(b.body.error.message).toMatch(/changed somewhere else/);
    expect((await ok("GET", `/api/emergency-plans/${opened.plan.id}`)).plan).toEqual(a.plan);

    // From the newer copy B can save, and each save builds on the time the last one gave back.
    let current = a.plan.updatedAt;
    for (const name of ["Flood (B)", "Flood at home"]) {
      const next = await ok("PUT", `/api/emergency-plans/${opened.plan.id}`, { ...inputOf(a), name, baseUpdatedAt: current });
      expect(next.plan.name).toBe(name);
      expect(next.plan.updatedAt).toBeGreaterThan(current);
      current = next.plan.updatedAt;
    }
    // Without a base the change is made as before.
    expect((await ok("PUT", `/api/emergency-plans/${opened.plan.id}`, { ...inputOf(a), name: "Forced" })).plan.name).toBe("Forced");
    expect((await app.api("PUT", `/api/emergency-plans/${opened.plan.id}`, { ...inputOf(a), baseUpdatedAt: "soon" })).status).toBe(400);
    await ok("DELETE", `/api/emergency-plans/${opened.plan.id}`);
  });
});

describe("a person's own data", () => {
  it("is counted in the database and in the clean-up plan, and erased with everything else", async () => {
    const snapshot = path.join(app.dir, "snapshot.db");
    await app.ctx.sqlite.backup(snapshot);
    try {
      const contents = measureContents(snapshot);
      expect(contents.counts.find((entry) => entry.id === "emergencyPlans")?.count).toBe(2);
    } finally {
      fs.rmSync(snapshot, { force: true });
    }
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.emergencyPlans).toBe(2);

    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.emergencyPlans).toBe(2);
    expect((await ok<{ plans: unknown[] }>("GET", "/api/emergency-plans")).plans).toEqual([]);
  });
});
