/**
 * What the Morse trainer keeps is the household's own data: one record of progress and
 * one list of practice sessions for the whole copy, merged and bounded as it is sent,
 * counted where Outpost says what is stored, in the database a backup copies, cleared
 * on request, and erased with everything else.
 */
import fs from "node:fs";
import path from "node:path";
import type { CleanupPlan, CleanupResult, MorseResponse, MorseSession } from "@outpost/shared";
import Database from "better-sqlite3";
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

const get = async () => (await app.api<MorseResponse>("GET", "/api/morse")).body;

async function waitForJob(id: string) {
  let job = app.ctx.jobs.get(id);
  for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    job = app.ctx.jobs.get(id);
  }
  return job;
}

describe("the Morse trainer's progress", () => {
  it("starts at lesson 1 with nothing kept", async () => {
    const empty = await get();
    expect(empty.progress).toEqual({ kochLesson: 1, bestCharWpm: null, bestEffWpm: null, settings: {}, updatedAt: 0 });
    expect(empty.sessions).toEqual([]);
    expect(empty.sessionCount).toBe(0);
    expect(empty.weakChars).toEqual({});
    expect(empty.suggestedCallsign).toBeNull();
    expect(app.ctx.services.morse.kept.count()).toEqual({ sessions: 0, progress: 0 });
  });

  it("merges a change into what is kept, and never lowers a best speed", async () => {
    const first = await app.api("PUT", "/api/morse/progress", { kochLesson: 4, settings: { charWpm: 20, keyType: "straight" } });
    expect(first.status).toBe(200);
    expect(first.body.progress).toMatchObject({ kochLesson: 4, settings: { charWpm: 20, keyType: "straight" } });
    await app.api("PUT", "/api/morse/progress", { settings: { callsign: "Q7XYZ" }, bestCharWpm: 18 });
    await app.api("PUT", "/api/morse/progress", { bestCharWpm: 12 });
    const kept = (await get()).progress;
    expect(kept.settings).toEqual({ charWpm: 20, keyType: "straight", callsign: "Q7XYZ" });
    expect(kept.kochLesson).toBe(4);
    expect(kept.bestCharWpm).toBe(18);
    expect(kept.updatedAt).toBeGreaterThan(0);
  });

  it("refuses what is not a setting or out of range, saying why", async () => {
    expect((await app.api("PUT", "/api/morse/progress", { kochLesson: 41 })).status).toBe(400);
    expect((await app.api("PUT", "/api/morse/progress", { settings: { colour: "red" } })).status).toBe(400);
    expect((await app.api("PUT", "/api/morse/progress", { settings: { keyType: "telegraph" } })).status).toBe(400);
    const call = await app.api("PUT", "/api/morse/progress", { settings: { callsign: "Q7 <b>" } });
    expect(call.status).toBe(400);
    expect(JSON.stringify(call.body)).toContain("letters, digits and /");
  });
});

describe("practice sessions", () => {
  it("keeps a session as sent, newest first, and adds its misses to the weak characters", async () => {
    const one = await app.api("POST", "/api/morse/sessions", {
      kind: "receive",
      accuracy: 0.8,
      charWpm: 20,
      effWpm: 10,
      lesson: 4,
      misses: { K: 2, R: 1 },
      tries: { K: 10, M: 10, U: 10, R: 10 },
    });
    expect(one.status).toBe(200);
    const two = await app.api("POST", "/api/morse/sessions", { kind: "echo", accuracy: 1, rhythm: 0.9, misses: { K: 1 }, tries: { K: 3 } });
    const kept = await get();
    expect(kept.sessions.map((session: MorseSession) => session.id)).toEqual([two.body.session.id, one.body.session.id]);
    expect(kept.sessions[1]).toMatchObject({ kind: "receive", accuracy: 0.8, charWpm: 20, effWpm: 10, lesson: 4, rhythm: null });
    expect(kept.sessions[0]!.tries).toEqual({ K: 3 });
    expect(kept.weakChars).toEqual({ K: 3, R: 1 });
    expect(kept.sessionCount).toBe(2);
  });

  it("raises the best speeds when a receive drill is passed", async () => {
    await app.api("POST", "/api/morse/sessions", { kind: "receive", accuracy: 0.95, charWpm: 25, effWpm: 15, tries: { K: 5 } });
    const progress = (await get()).progress;
    expect(progress.bestCharWpm).toBe(25);
    expect(progress.bestEffWpm).toBe(15);
  });

  it("refuses a session that is not one", async () => {
    expect((await app.api("POST", "/api/morse/sessions", { kind: "nap", accuracy: 1 })).status).toBe(400);
    expect((await app.api("POST", "/api/morse/sessions", { kind: "send", accuracy: 1.5 })).status).toBe(400);
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`c${i}`, 1]));
    expect((await app.api("POST", "/api/morse/sessions", { kind: "send", accuracy: 1, misses: many })).status).toBe(400);
    expect((await app.api("POST", "/api/morse/sessions", { kind: "send", accuracy: 1, extra: true })).status).toBe(400);
  });
});

describe("a callsign to start from", () => {
  it("is the station's own call in the latest entry of the contact log", async () => {
    const entry = (at: string, outcome: string, tx: string, rx: string) => ({
      at,
      frequencyMhz: 7.02,
      band: "",
      mode: "CW",
      outcome,
      tx: { call: tx, lat: null, lon: null },
      rx: { call: rx, lat: null, lon: null },
      powerWatts: null,
      antenna: "",
      reportSent: "",
      reportReceived: "",
      notes: "",
    });
    expect((await app.api("POST", "/api/radio/observations", entry("2026-11-01T10:00:00Z", "contact", "q7own", "Q4RTF"))).status).toBe(200);
    expect((await get()).suggestedCallsign).toBe("Q7OWN");
    // Heard: the station whose log it is was the second end.
    await app.api("POST", "/api/radio/observations", entry("2026-11-02T10:00:00Z", "heard", "Q4RTF", "Q7OWN/P"));
    expect((await get()).suggestedCallsign).toBe("Q7OWN/P");
  });
});

describe("a person's own data", () => {
  it("is counted on the Storage screen and in the plan for erasing everything, and in the backup's snapshot", async () => {
    const snapshot = path.join(app.dir, "snapshot-morse.db");
    await app.ctx.sqlite.backup(snapshot);
    try {
      const contents = measureContents(snapshot);
      expect(contents.counts.find((entry) => entry.id === "morseSessions")?.count).toBe(3);
      const copy = new Database(snapshot, { readonly: true });
      try {
        expect((copy.prepare("SELECT count(*) AS n FROM morse_progress").get() as { n: number }).n).toBe(1);
      } finally {
        copy.close();
      }
    } finally {
      fs.rmSync(snapshot, { force: true });
    }
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.morse).toEqual({ sessions: 3, progress: 1 });
  });

  it("is cleared on request: progress, settings and every session", async () => {
    const cleared = await app.api("DELETE", "/api/morse");
    expect(cleared.status).toBe(200);
    expect(cleared.body.removed).toEqual({ sessions: 3, progress: 1 });
    const after = await get();
    expect(after.sessions).toEqual([]);
    expect(after.progress.kochLesson).toBe(1);
    expect(after.progress.settings).toEqual({});
  });

  it("is erased with everything else", async () => {
    await app.api("PUT", "/api/morse/progress", { kochLesson: 7 });
    await app.api("POST", "/api/morse/sessions", { kind: "send", accuracy: 0.5 });
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    const job = await waitForJob(started.body.job.id);
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.morse).toEqual({ sessions: 1, progress: 1 });
    const after = await get();
    expect(after.sessionCount).toBe(0);
    expect(after.progress.kochLesson).toBe(1);
  });
});

describe("the list of sessions", () => {
  it("keeps at most the newest 5,000", async () => {
    const insert = app.ctx.sqlite.prepare(
      "INSERT INTO morse_sessions (id, kind, at, accuracy, misses, tries) VALUES (?, 'send', ?, 1, '{}', '{}')",
    );
    app.ctx.sqlite.transaction(() => {
      for (let i = 0; i < 5000; i++) insert.run(`old-${String(i).padStart(5, "0")}`, i + 1);
    })();
    await app.api("POST", "/api/morse/sessions", { kind: "send", accuracy: 1 });
    const kept = await get();
    expect(kept.sessionCount).toBe(5000);
    expect(kept.sessions).toHaveLength(200);
    expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM morse_sessions WHERE id = 'old-00000'").get()).toEqual({ n: 0 });
  });
});
