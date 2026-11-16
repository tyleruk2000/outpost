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
    expect((await app.api("POST", "/api/emergency-plans", { ...blank("x"), emergencyNumber: "" })).status).toBe(400);
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
