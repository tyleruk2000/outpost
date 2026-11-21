/**
 * Two devices saving the same record: each reads it, the first saves, and the second
 * saves what it read. The second is refused with 409 and the first one's change stands;
 * a save made from the record as it is now goes through.
 */
import type { CommsResponse, EventLogLine, GardenSowing, MedicalSheet, NoteDetail, RoutineCheck } from "@outpost/shared";
import type { SteadingResponse } from "@outpost/shared/games/steading";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

async function ok<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await app.api<T>(method, url, body);
  if (response.status !== 200) throw new Error(`${method} ${url}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body;
}

describe("a medical sheet saved on two devices", () => {
  it("refuses the stale save and keeps the first", async () => {
    const { sheet } = await ok<{ sheet: MedicalSheet }>("POST", "/api/medical-sheets", {
      memberId: "m1",
      name: "Sam",
      record: { bloodGroup: "A+" },
    });
    const a = (await ok<{ sheet: MedicalSheet }>("GET", `/api/medical-sheets/${sheet.id}`)).sheet;
    const b = (await ok<{ sheet: MedicalSheet }>("GET", `/api/medical-sheets/${sheet.id}`)).sheet;
    const saved = await ok<{ sheet: MedicalSheet }>("PUT", `/api/medical-sheets/${sheet.id}`, {
      memberId: "m1",
      name: "Sam",
      record: { bloodGroup: "B+" },
      baseUpdatedAt: a.updatedAt,
    });
    expect(saved.sheet.updatedAt).toBeGreaterThan(a.updatedAt);
    const stale = await app.api("PUT", `/api/medical-sheets/${sheet.id}`, {
      memberId: "m1",
      name: "Sam",
      record: { bloodGroup: "O-" },
      baseUpdatedAt: b.updatedAt,
    });
    expect(stale.status).toBe(409);
    expect((await ok<{ sheet: MedicalSheet }>("GET", `/api/medical-sheets/${sheet.id}`)).sheet.record?.bloodGroup).toBe("B+");
    const fresh = await app.api("PUT", `/api/medical-sheets/${sheet.id}`, {
      memberId: "m1",
      name: "Sam",
      record: { bloodGroup: "O-" },
      baseUpdatedAt: saved.sheet.updatedAt,
    });
    expect(fresh.status).toBe(200);
  });
});

describe("the communication plan saved on two devices", () => {
  it("refuses the second first save: both opened it before it was ever saved", async () => {
    const a = await ok<CommsResponse>("GET", "/api/keeping-in-touch");
    const b = await ok<CommsResponse>("GET", "/api/keeping-in-touch");
    expect(a.plan.updatedAt).toBeNull();
    const { updatedAt: _a, ...planA } = a.plan;
    const { updatedAt: _b, ...planB } = b.plan;
    await ok("PUT", "/api/keeping-in-touch", { ...planA, situations: [], baseUpdatedAt: a.plan.updatedAt, checkIns: "Noon" });
    const stale = await app.api("PUT", "/api/keeping-in-touch", { ...planB, baseUpdatedAt: b.plan.updatedAt, checkIns: "Six" });
    expect(stale.status).toBe(409);
    const now = await ok<CommsResponse>("GET", "/api/keeping-in-touch");
    expect(now.plan.checkIns).toBe("Noon");
  });

  it("refuses a stale save once the plan is kept, and takes a fresh one", async () => {
    const a = await ok<CommsResponse>("GET", "/api/keeping-in-touch");
    const { updatedAt, ...plan } = a.plan;
    const saved = await ok<CommsResponse>("PUT", "/api/keeping-in-touch", { ...plan, baseUpdatedAt: updatedAt });
    expect((await app.api("PUT", "/api/keeping-in-touch", { ...plan, baseUpdatedAt: updatedAt })).status).toBe(409);
    expect((await app.api("PUT", "/api/keeping-in-touch", { ...plan, baseUpdatedAt: saved.plan.updatedAt })).status).toBe(200);
  });
});

describe("an event log entry edited on two devices", () => {
  it("refuses the stale edit and keeps the first", async () => {
    const { line } = await ok<{ line: EventLogLine }>("POST", "/api/event-log", { author: "Ana", text: "Water off" });
    const a = await ok<{ line: EventLogLine }>("PATCH", `/api/event-log/${line.id}`, {
      by: "Ana",
      text: "Water off at the main",
      baseUpdatedAt: line.updatedAt,
    });
    const stale = await app.api("PATCH", `/api/event-log/${line.id}`, { by: "Jo", text: "Water back", baseUpdatedAt: line.updatedAt });
    expect(stale.status).toBe(409);
    const fresh = await ok<{ line: EventLogLine }>("PATCH", `/api/event-log/${line.id}`, {
      by: "Jo",
      text: "Water back",
      baseUpdatedAt: a.line.updatedAt,
    });
    expect(fresh.line.text).toBe("Water back");
  });
});

describe("a routine check changed on two devices", () => {
  it("refuses the stale change and keeps the first", async () => {
    const { check } = await ok<{ check: RoutineCheck }>("POST", "/api/routine-checks", { name: "Test the torch", everyDays: 30 });
    const saved = await ok<{ check: RoutineCheck }>("PUT", `/api/routine-checks/${check.id}`, {
      name: "Test the torches",
      everyDays: 30,
      baseUpdatedAt: check.updatedAt,
    });
    const stale = await app.api("PUT", `/api/routine-checks/${check.id}`, { name: "Torch", everyDays: 7, baseUpdatedAt: check.updatedAt });
    expect(stale.status).toBe(409);
    const list = (await ok<{ checks: RoutineCheck[] }>("GET", "/api/routine-checks")).checks;
    expect(list.find((entry) => entry.id === check.id)?.name).toBe("Test the torches");
    expect(
      (await app.api("PUT", `/api/routine-checks/${check.id}`, { name: "Torch", everyDays: 7, baseUpdatedAt: saved.check.updatedAt }))
        .status,
    ).toBe(200);
  });
});

describe("a garden sowing changed on two devices", () => {
  it("takes the sowing as the screen holds it, refuses the stale change and keeps the first", async () => {
    const { sowing } = await ok<{ sowing: GardenSowing }>("POST", "/api/garden/sowings", { cropId: "carrots", sownOn: "2026-04-12" });
    const { id: _id, createdAt: _c, updatedAt, ...fields } = sowing;
    const saved = await ok<{ sowing: GardenSowing }>("PUT", `/api/garden/sowings/${sowing.id}`, {
      ...fields,
      place: "Bed 3",
      baseUpdatedAt: updatedAt,
    });
    const stale = await app.api("PUT", `/api/garden/sowings/${sowing.id}`, { ...fields, notes: "Thin them", baseUpdatedAt: updatedAt });
    expect(stale.status).toBe(409);
    const now = (await ok<{ sowings: GardenSowing[] }>("GET", "/api/garden")).sowings.find((entry) => entry.id === sowing.id);
    expect(now).toMatchObject({ place: "Bed 3", notes: "" });
    const fresh = await app.api("PUT", `/api/garden/sowings/${sowing.id}`, {
      ...fields,
      place: "Bed 3",
      notes: "Thin them",
      baseUpdatedAt: saved.sowing.updatedAt,
    });
    expect(fresh.status).toBe(200);
  });
});

describe("a highlight's note changed on two devices", () => {
  it("refuses the stale note and keeps the first", async () => {
    const { payload, headers } = multipart({}, [{ name: "water.md", content: "# Water\n\nBoil water for one minute.\n" }]);
    const added = await app.api("POST", "/api/documents", payload, { headers });
    expect(added.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const document = added.body.results[0].document as Json;
    const { highlight } = await ok<Json>("POST", `/api/documents/${document.id}/highlights`, { exact: "Boil water" });
    const a = await ok<Json>("PATCH", `/api/highlights/${highlight.id}`, { note: "One minute", baseUpdatedAt: highlight.updatedAt });
    const stale = await app.api("PATCH", `/api/highlights/${highlight.id}`, { note: "Three minutes", baseUpdatedAt: highlight.updatedAt });
    expect(stale.status).toBe(409);
    const listed = (await ok<Json>("GET", `/api/documents/${document.id}/highlights`)).highlights;
    expect(listed[0].note).toBe("One minute");
    const fresh = await app.api("PATCH", `/api/highlights/${highlight.id}`, {
      note: "Three minutes",
      baseUpdatedAt: a.highlight.updatedAt,
    });
    expect(fresh.status).toBe(200);
  });
});

describe("Steading played on two devices", () => {
  it("applies each action to the settlement as it is now, and refuses one the other device made impossible", async () => {
    const a = await app.api<SteadingResponse>("POST", "/api/games/steading/actions", { type: "build", kind: "woodcutter", x: 1, y: 8 });
    expect(a.status).toBe(200);
    const b = await app.api("POST", "/api/games/steading/actions", { type: "build", kind: "woodcutter", x: 1, y: 8 });
    expect(b.status).toBe(409);
    const now = await ok<SteadingResponse>("GET", "/api/games/steading");
    expect(now.settlement.buildings.filter((building) => building.kind === "woodcutter")).toHaveLength(1);
  });
});

describe("a page restored from an earlier version on two devices", () => {
  it("refuses the restore once the page was saved elsewhere", async () => {
    const { note } = await ok<{ note: NoteDetail }>("POST", "/api/notes", { title: "Plan" });
    const one = (await ok<Json>("PATCH", `/api/notes/${note.id}`, { title: "Plan one", baseUpdatedAt: note.updatedAt })).note;
    const versions = (await ok<Json>("GET", `/api/notes/${note.id}/versions`)).versions;
    expect(versions.length).toBeGreaterThan(0);
    // Device A saves again; device B, still on "Plan one", restores the first version.
    const two = (await ok<Json>("PATCH", `/api/notes/${note.id}`, { title: "Plan two", baseUpdatedAt: one.updatedAt })).note;
    const stale = await app.api("POST", `/api/notes/${note.id}/versions/${versions[0].id}/restore`, { baseUpdatedAt: one.updatedAt });
    expect(stale.status).toBe(409);
    expect((await ok<{ note: NoteDetail }>("GET", `/api/notes/${note.id}`)).note.title).toBe("Plan two");
    expect(
      (await app.api("POST", `/api/notes/${note.id}/versions/${versions[0].id}/restore`, { baseUpdatedAt: two.updatedAt })).status,
    ).toBe(200);
  });
});
