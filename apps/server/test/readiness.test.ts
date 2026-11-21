/**
 * Readiness: the roll call (everyone's latest check-in, who has checked in since an ask),
 * check-ins written on a phone and sent later, the log of events with check-ins and
 * ticked steps beside it, routine checks, and the offline drill's lines.
 */
import {
  type BoardMessageResponse,
  type EmergencyPlanResponse,
  type EventLogLine,
  type EventLogResponse,
  emptyPlanBody,
  type OfflineDrillResponse,
  ROUTINE_CHECK_TEMPLATE,
  type RollCallAskResponse,
  type RollCallResponse,
  type RoutineCheck,
  type RoutineChecksResponse,
} from "@outpost/shared";
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

const DAY = 24 * 60 * 60 * 1000;

describe("roll call", () => {
  it("counts who has checked in since the latest ask", async () => {
    await ok("POST", "/api/board/check-ins", { author: "Sam", status: "safe" });
    const before = await ok<RollCallResponse>("GET", "/api/board/roll-call");
    expect(before.lines.find((line) => line.name === "Sam")?.answered).toBe(true);

    const asked = await ok<RollCallAskResponse>("POST", "/api/board/roll-calls", { by: "Ana", note: "Power is off." });
    expect(asked.ask.askedBy).toBe("Ana");
    const board = await ok<{ messages: Array<{ body: string }> }>("GET", "/api/board/messages");
    expect(board.messages.at(-1)?.body).toBe("Roll call: please check in. Power is off.");

    const after = await ok<RollCallResponse>("GET", "/api/board/roll-call");
    expect(after.since).toBe(asked.ask.at);
    expect(after.asks[0]?.id).toBe(asked.ask.id);
    // Sam's check-in was before the ask: not answered yet, but still shown with its time.
    const sam = after.lines.find((line) => line.name === "Sam")!;
    expect(sam.answered).toBe(false);
    expect(sam.latest?.status).toBe("safe");

    await new Promise((resolve) => setTimeout(resolve, 5));
    await ok("POST", "/api/board/check-ins", { author: "sam", status: "help", body: "Car stuck" });
    const answered = await ok<RollCallResponse>("GET", "/api/board/roll-call");
    expect(answered.lines.find((line) => line.name.toLowerCase() === "sam")?.answered).toBe(true);
    expect(answered.answered).toBeGreaterThanOrEqual(1);

    // A time chosen by the person instead.
    const lastWeek = await ok<RollCallResponse>("GET", `/api/board/roll-call?since=${Date.now() - 7 * DAY}`);
    expect(lastWeek.lines.every((line) => line.latest === null || line.answered)).toBe(true);
  });

  it("asks on a radio channel named as well as on the board", async () => {
    const asked = await ok<RollCallAskResponse>("POST", "/api/board/roll-calls", { by: "Ana", alsoOn: ["meshtastic:longfast"] });
    expect(asked.refused).toEqual([]);
    const radio = await ok<{ messages: Array<{ body: string }> }>("GET", "/api/board/messages?channel=meshtastic:longfast");
    expect(radio.messages.at(-1)?.body).toBe("Roll call: please check in.");
  });

  it("keeps a check-in written on a phone with the time it was written, once however often it is sent", async () => {
    const writtenAt = Date.now() - 2 * 60 * 60 * 1000;
    const input = { author: "Jo", status: "safe", writtenAt, clientId: "phone-check-in-0001" };
    const first = await ok<BoardMessageResponse>("POST", "/api/board/check-ins", input);
    expect(first.message.createdAt).toBe(writtenAt);
    expect(first.message.sentAt).toBeGreaterThan(writtenAt);
    const again = await ok<BoardMessageResponse>("POST", "/api/board/check-ins", input);
    expect(again.message.id).toBe(first.message.id);
    // Never more than a week back.
    const old = await ok<BoardMessageResponse>("POST", "/api/board/check-ins", {
      author: "Jo",
      status: "safe",
      writtenAt: Date.now() - 30 * DAY,
      clientId: "phone-check-in-0002",
    });
    expect(old.message.createdAt).toBeGreaterThan(Date.now() - 8 * DAY);
  });
});

describe("the log of events", () => {
  let plan: EmergencyPlanResponse;
  let entry: EventLogLine;

  it("writes a line with who and when, linked to the plan in use", async () => {
    plan = await ok("POST", "/api/emergency-plans", {
      name: "Power cut",
      kind: "power-cut",
      kindText: "",
      templateId: null,
      emergencyNumber: "999",
      reviewEveryDays: null,
      body: { ...emptyPlanBody(), steps: [{ id: "s1", phase: "during", text: "Switch off the oven", origin: null }] },
    });
    await ok("POST", `/api/emergency-plans/${plan.plan.id}/ticks`, { stepId: "s1", done: true });
    const empty = await ok<EventLogResponse>("GET", "/api/event-log");
    expect(empty.planInUse?.id).toBe(plan.plan.id);

    const at = Date.now() - 20 * 60_000;
    entry = (await ok<{ line: EventLogLine }>("POST", "/api/event-log", { author: "Ana", text: "Power went off", at, planId: plan.plan.id }))
      .line;
    expect(entry).toMatchObject({ kind: "entry", at, author: "Ana", text: "Power went off", planName: "Power cut" });
    await ok("POST", "/api/event-log", { author: "Ana", text: "Called the network operator\nno answer" });

    const log = await ok<EventLogResponse>("GET", "/api/event-log");
    expect(log.lines.map((line) => line.text)).toEqual(["Power went off", "Called the network operator no answer"]);
    const withOthers = await ok<EventLogResponse>("GET", "/api/event-log?others=1");
    expect(withOthers.lines.some((line) => line.kind === "tick" && line.text === "Done: Switch off the oven")).toBe(true);
  });

  it("refuses a time in the future, and an edit made on a copy that is out of date", async () => {
    const future = await app.api("POST", "/api/event-log", { author: "Ana", text: "x", at: Date.now() + DAY });
    expect(future.status).toBe(400);
    const edited = await ok<{ line: EventLogLine }>("PATCH", `/api/event-log/${entry.id}`, {
      by: "Sam",
      text: "Power went off at the fuse box",
      baseUpdatedAt: entry.updatedAt,
    });
    expect(edited.line.edited?.by).toBe("Sam");
    const stale = await app.api("PATCH", `/api/event-log/${entry.id}`, { by: "Jo", text: "y", baseUpdatedAt: entry.updatedAt });
    expect(stale.status).toBe(409);
  });

  it("writes the log to a page of Notes", async () => {
    const made = await ok<{ note: { id: string; title: string }; lines: number }>("POST", "/api/event-log/to-notes", {});
    expect(made.note.title).toMatch(/^Log of events, /);
    expect(made.lines).toBe(2);
    const page = await ok<{ note: { content: unknown } }>("GET", `/api/notes/${made.note.id}`);
    expect(JSON.stringify(page.note.content)).toContain("Power went off at the fuse box");
  });
});

describe("routine checks", () => {
  let check: RoutineCheck;

  it("starts from the suggested list, all of it overdue until done", async () => {
    const added = await ok<{ added: RoutineCheck[] }>("POST", "/api/routine-checks/suggested");
    expect(added.added).toHaveLength(ROUTINE_CHECK_TEMPLATE.length);
    expect((await ok<{ added: RoutineCheck[] }>("POST", "/api/routine-checks/suggested")).added).toHaveLength(0);
    const list = await ok<RoutineChecksResponse>("GET", "/api/routine-checks");
    expect(list.checks.every((each) => each.overdue)).toBe(true);
    check = list.checks[0]!;
  });

  it("is due again its interval after it was done", async () => {
    const done = await ok<{ check: RoutineCheck }>("POST", `/api/routine-checks/${check.id}/done`, { by: "Sam" });
    expect(done.check.overdue).toBe(false);
    expect(done.check.lastDoneBy).toBe("Sam");
    expect(done.check.dueAt).toBe(done.check.lastDoneAt! + check.everyDays * DAY);
    const longAgo = await ok<{ check: RoutineCheck }>("POST", `/api/routine-checks/${check.id}/done`, {
      by: "Sam",
      at: Date.now() - (check.everyDays + 1) * DAY,
    });
    expect(longAgo.check.overdue).toBe(true);
  });

  it("keeps the household's own, and refuses an interval that is not whole days", async () => {
    const own = await ok<{ check: RoutineCheck }>("POST", "/api/routine-checks", { name: "Bleed the radiators", everyDays: 365 });
    expect(own.check.templateId).toBeNull();
    expect((await app.api("POST", "/api/routine-checks", { name: "x", everyDays: 0 })).status).toBe(400);
    await ok("DELETE", `/api/routine-checks/${own.check.id}`);
  });
});

describe("the offline drill", () => {
  it("says what is held and what is missing, from what Outpost holds", async () => {
    const drill = await ok<OfflineDrillResponse>("GET", "/api/offline-drill");
    const state = (id: string) => drill.lines.find((line) => line.id === id)?.state;
    expect(state("home")).toBe("missing");
    expect(state("map")).toBe("missing");
    expect(state("plan")).toBe("held");
    expect(state("backup")).toBe("missing");
    expect(state("radio-mains")).toBe("untried");
    expect(drill.lastRun).toBeNull();
  });

  it("keeps the result of a drill followed on a phone", async () => {
    const run = await ok<{ run: { answers: Record<string, string> } }>("POST", "/api/offline-drill/runs", {
      by: "Sam",
      startedAt: Date.now() - 60_000,
      answers: { map: "worked", radio: "failed", unknown: "worked" },
      notes: "The radio needs batteries.",
    });
    expect(run.run.answers).toEqual({ map: "worked", radio: "failed" });
    expect((await ok<OfflineDrillResponse>("GET", "/api/offline-drill")).lastRun?.notes).toBe("The radio needs batteries.");
  });
});
