/**
 * The household's papers: medical sheets kept as typed (or only as an encrypted message),
 * out of search and the model's tools until switched on; the communication plan linked
 * to contacts, places and repeaters as they are now; and the binder's record, which says
 * when what is in it has changed since it was made.
 */
import type { BinderStatus, CommsResponse, MedicalSheet, MedicalSheetsResponse, SearchResult } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

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

const ARMOR = `-----BEGIN PGP MESSAGE-----

wy4ECQMIYm9ndXMgYnV0IHdlbGwtZm9ybWVkIGFybW91cg==
=abcd
-----END PGP MESSAGE-----`;

const found = async (q: string) =>
  (await ok<{ results: SearchResult[] }>("GET", `/api/search?q=${encodeURIComponent(q)}`)).results.filter(
    (result) => result.kind === "medical",
  );

describe("medical sheets", () => {
  let sheet: MedicalSheet;

  it("keeps a sheet as typed, with defaults for what was not given", async () => {
    sheet = (
      await ok<{ sheet: MedicalSheet }>("POST", "/api/medical-sheets", {
        memberId: "member-1",
        name: "Sam",
        record: {
          bloodGroup: "A+",
          allergies: [{ id: "a1", what: "Penicillin", reaction: "Hives" }],
          medicines: [
            {
              id: "m1",
              name: "Levothyroxine",
              dose: "50 micrograms",
              when: "Morning",
              held: 28,
              unit: "tablets",
              perDay: 1,
              countedOn: "2026-11-01",
            },
          ],
        },
      })
    ).sheet;
    expect(sheet.encrypted).toBe(false);
    expect(sheet.record?.gp).toEqual({ contactId: null, name: "", phone: "" });
    expect(sheet.record?.medicines[0]?.keptWhere).toBe("");
    const list = await ok<MedicalSheetsResponse>("GET", "/api/medical-sheets");
    expect(list.sheets).toHaveLength(1);
    expect(list.inSearch).toBe(false);
    expect(list.inTools).toBe(false);
  });

  it("is left out of search until switched on, and taken out again when switched off", async () => {
    expect(await found("Levothyroxine")).toHaveLength(0);
    await ok("PATCH", "/api/settings", { "medical.inSearch": true });
    expect((await found("Levothyroxine"))[0]?.url).toBe(`/prepare/medical/${sheet.id}`);
    await ok("PATCH", "/api/settings", { "medical.inSearch": false });
    expect(await found("Levothyroxine")).toHaveLength(0);
  });

  it("is not offered to a model until its area is switched on", async () => {
    expect(app.ctx.services.tools.offered().map((tool) => tool.name)).not.toContain("medical_sheets");
    await ok("PATCH", "/api/settings", { "tools.medical": true });
    expect(app.ctx.services.tools.offered().map((tool) => tool.name)).toContain("medical_sheets");
    const answer = await app.ctx.services.tools.call("medical_sheets", { person: "sam" }, { signal: new AbortController().signal });
    expect(answer.ok).toBe(true);
    expect(answer.text).toContain("Penicillin (Hives)");
    expect(answer.text).toContain("gives no medical advice");
  });

  it("refuses a sheet with both a record and a message, and a message that is not armour", async () => {
    expect((await app.api("POST", "/api/medical-sheets", { name: "X", record: {}, armor: ARMOR })).status).toBe(400);
    expect((await app.api("POST", "/api/medical-sheets", { name: "X", armor: "not a message" })).status).toBe(400);
    expect((await app.api("POST", "/api/medical-sheets", { name: "X" })).status).toBe(400);
  });

  it("keeps an encrypted sheet as its message only, never in search or a tool, and will not quietly decrypt it", async () => {
    await ok("PATCH", "/api/settings", { "medical.inSearch": true });
    const locked = (
      await ok<{ sheet: MedicalSheet }>("PUT", `/api/medical-sheets/${sheet.id}`, { memberId: "member-1", name: "Sam", armor: ARMOR })
    ).sheet;
    expect(locked.encrypted).toBe(true);
    expect(locked.record).toBeNull();
    expect(await found("Levothyroxine")).toHaveLength(0);
    const row = app.ctx.sqlite.prepare("SELECT record FROM medical_sheets WHERE id = ?").get(sheet.id) as { record: string | null };
    expect(row.record).toBeNull();
    const answer = await app.ctx.services.tools.call("medical_sheets", { person: "Sam" }, { signal: new AbortController().signal });
    expect(answer.text).toContain("encrypted and cannot be read");

    const plain = { memberId: "member-1", name: "Sam", record: { bloodGroup: "B+" } };
    expect((await app.api("PUT", `/api/medical-sheets/${sheet.id}`, plain)).status).toBe(400);
    const back = (await ok<{ sheet: MedicalSheet }>("PUT", `/api/medical-sheets/${sheet.id}`, { ...plain, removeEncryption: true })).sheet;
    expect(back.encrypted).toBe(false);
    expect(back.record?.bloodGroup).toBe("B+");
  });

  it("refuses a change made from an older version", async () => {
    const current = (await ok<MedicalSheetsResponse>("GET", "/api/medical-sheets")).sheets[0]!;
    const response = await app.api("PUT", `/api/medical-sheets/${current.id}`, {
      memberId: null,
      name: "Sam",
      record: {},
      baseUpdatedAt: current.updatedAt - 1,
    });
    expect(response.status).toBe(409);
  });
});

describe("keeping in touch", () => {
  it("starts empty, and answers each link as it is now", async () => {
    const empty = await ok<CommsResponse>("GET", "/api/keeping-in-touch");
    expect(empty.plan.situations).toEqual([]);
    expect(empty.plan.updatedAt).toBeNull();

    const contactId = (
      await ok<{ contact: { id: string } }>("POST", "/api/contacts", {
        kind: "person",
        name: { prefix: "", given: "Ana", additional: "", family: "Silva", suffix: "" },
        phones: [{ value: "+44 7700 900123", label: "mobile" }],
      })
    ).contact.id;
    const markerId = (await ok<{ marker: { id: string } }>("POST", "/api/maps/markers", { name: "Church", lat: 54.3, lon: -2.2 })).marker
      .id;
    const saved = await ok<CommsResponse>("PUT", "/api/keeping-in-touch", {
      baseUpdatedAt: null,
      situations: [
        {
          id: "s1",
          name: "Phones down",
          checkIn: "12:00",
          contactIds: [contactId, "gone"],
          steps: [
            { id: "p", level: "primary", means: "phone", contactId },
            { id: "a", level: "alternate", means: "mesh", meshChannel: "meshtastic:longfast" },
            { id: "c", level: "contingency", means: "radio", frequency: { entryId: "pmr446-analogue", channel: "3" }, when: "On the hour" },
            { id: "e", level: "emergency", means: "meet", markerId, when: "Noon" },
          ],
        },
      ],
      checkIns: "Every day at 12:00",
      people: [{ id: "x", memberId: null, name: "Sam", note: "Wait at the school office" }],
    });
    expect(saved.plan.updatedAt).not.toBeNull();
    expect(saved.resolved.contacts[contactId]?.displayName).toBe("Ana Silva");
    expect(saved.resolved.contacts.gone).toBeNull();
    expect(saved.resolved.places[markerId]?.name).toBe("Church");
    expect(saved.resolved.mesh["meshtastic:longfast"]).toBeNull();

    const stale = await app.api("PUT", "/api/keeping-in-touch", { baseUpdatedAt: saved.plan.updatedAt! - 1, situations: [] });
    expect(stale.status).toBe(409);
  });

  it("refuses a step of a kind it does not know", async () => {
    const response = await app.api("PUT", "/api/keeping-in-touch", {
      situations: [{ id: "s", name: "x", steps: [{ id: "1", level: "primary", means: "pigeon" }] }],
    });
    expect(response.status).toBe(400);
  });
});

describe("the household binder", () => {
  it("says nothing is stale before one is made, and which parts changed after", async () => {
    const before = await ok<BinderStatus>("GET", "/api/household-binder");
    expect(before.made).toBeNull();
    expect(before.stale).toEqual([]);
    expect(before.changedAt.comms).not.toBeNull();

    const contentAt = Math.max(...Object.values(before.changedAt).filter((at): at is number => at !== null));
    const made = await ok<BinderStatus>("POST", "/api/household-binder/made", {
      parts: ["comms", "medical", "supplies"],
      contentAt,
      pages: 6,
    });
    expect(made.made?.pages).toBe(6);
    expect(made.stale).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const current = await ok<CommsResponse>("GET", "/api/keeping-in-touch");
    await ok("PUT", "/api/keeping-in-touch", { ...current.plan, baseUpdatedAt: current.plan.updatedAt, updatedAt: undefined });
    const after = await ok<BinderStatus>("GET", "/api/household-binder");
    expect(after.stale).toEqual(["comms"]);
  });

  it("is out of date when something in it is deleted", async () => {
    const sheet = await ok<{ sheet: MedicalSheet }>("POST", "/api/medical-sheets", { name: "Kit", record: {} });
    const status = await ok<BinderStatus>("GET", "/api/household-binder");
    const made = await ok<BinderStatus>("POST", "/api/household-binder/made", {
      parts: ["medical", "supplies"],
      contentAt: Date.now(),
      pages: 3,
      fingerprints: status.fingerprints,
    });
    expect(made.stale).toEqual([]);
    await ok("DELETE", `/api/medical-sheets/${sheet.sheet.id}`);
    expect((await ok<BinderStatus>("GET", "/api/household-binder")).stale).toEqual(["medical"]);
  });

  it("is counted and erased with everything else", async () => {
    expect(app.ctx.services.householdPapers.kept.count()).toBe(3);
    expect(app.ctx.services.householdPapers.kept.eraseAll()).toBe(3);
    expect((await ok<MedicalSheetsResponse>("GET", "/api/medical-sheets")).sheets).toEqual([]);
    expect((await ok<BinderStatus>("GET", "/api/household-binder")).made).toBeNull();
  });
});
