/**
 * Tasks: what each job records as it goes (its progress now and then, and the steps of
 * its history), how that stays bounded, what a waiting job is waiting for, and the API
 * the Downloads and tasks screen reads it all from.
 */
import { TASK_KINDS } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/core/events.ts";
import { JOB_HISTORY_KEPT_MS, JobQueue, MAX_JOB_EVENTS, MAX_JOB_SAMPLES, paceOf } from "../src/core/jobs.ts";
import { openDatabase } from "../src/db/client.ts";
import { jobSamples, jobs } from "../src/db/schema.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const quiet = () => {};
const log = { info: quiet, warn: quiet, error: quiet, debug: quiet, child: () => log } as unknown as FastifyBaseLogger;
const open: Array<{ close(): void }> = [];
const apps: TestApp[] = [];

function queueOn() {
  const db = openDatabase(":memory:");
  open.push(db.sqlite);
  return { queue: new JobQueue(db.db, new EventBus(), log), db };
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

afterEach(async () => {
  vi.useRealTimers();
  for (const sqlite of open.splice(0)) sqlite.close();
  for (const app of apps.splice(0)) await app.close();
});

describe("what a job records as it goes", () => {
  it("keeps samples of its progress, with the unit it reports, thinned so that a long job keeps a couple of hundred", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { queue } = queueOn();
    const steps = 1000;
    queue.register<Record<string, never>>("count", {
      queue: "work",
      async run({ progress }) {
        for (let done = 0; done <= steps; done += 1) {
          vi.advanceTimersByTime(3_000);
          progress({ current: done, total: steps, unit: "passages" });
          await turn();
        }
        return {};
      },
    });
    queue.start();
    const job = queue.enqueue("count", {}, { title: "Count" });
    const started = Date.now();
    await queue.whenIdle(20_000);

    const { samples, job: row } = queue.detail(job.id);
    expect(row.state).toBe("succeeded");
    expect(row.progressUnit).toBe("passages");
    expect(samples.length).toBeLessThanOrEqual(MAX_JOB_SAMPLES);
    expect(samples.length).toBeGreaterThan(MAX_JOB_SAMPLES / 4);
    // The whole run is still covered, from the start to the last step.
    expect(samples[0]!.at).toBeLessThanOrEqual(started + 3_000);
    expect(samples.at(-1)).toMatchObject({ current: steps, total: steps, unit: "passages" });
    for (let index = 1; index < samples.length; index += 1) expect(samples[index]!.at).toBeGreaterThanOrEqual(samples[index - 1]!.at);
    await queue.close();
  });

  it("records each change of state, each retry with its error, and each stage it names, oldest first", async () => {
    const { queue } = queueOn();
    let attempt = 0;
    queue.register<Record<string, never>>("staged", {
      queue: "work",
      async run({ progress }) {
        attempt += 1;
        if (attempt === 1) throw new Error("The disk was busy");
        progress({ stage: "Reading the roads", message: "Reading the roads", current: 1, total: 2 });
        await turn();
        // Said again: not a new stage.
        progress({ stage: "Reading the roads", current: 2 });
        await new Promise((resolve) => setTimeout(resolve, 600));
        progress({ stage: "Sorting the junctions", current: 0, total: 10, unit: "ways" });
        return {};
      },
    });
    queue.start();
    const job = queue.enqueue("staged", {}, { title: "Staged", maxAttempts: 2 });
    // The retry waits two seconds or so.
    await vi.waitFor(() => expect(queue.get(job.id)?.state).toBe("succeeded"), { timeout: 8_000 });

    const { events } = queue.detail(job.id);
    expect(events.map((event) => [event.kind, event.state, event.message])).toEqual([
      ["state", "queued", null],
      ["state", "running", null],
      ["retry", "queued", "The disk was busy"],
      ["state", "running", "Attempt 2 of 2"],
      ["stage", "running", "Reading the roads"],
      ["stage", "running", "Sorting the junctions"],
      ["state", "succeeded", null],
    ]);
    await queue.close();
  });

  it("says a later attempt is one, and gives a failure its error", async () => {
    const { queue } = queueOn();
    queue.register<Record<string, never>>("fails", {
      queue: "work",
      run: async () => {
        throw new Error("No room on the drive");
      },
    });
    queue.start();
    const job = queue.enqueue("fails", {}, { title: "Fails" });
    await queue.whenIdle(2_000);
    expect(queue.detail(job.id).events.at(-1)).toMatchObject({ kind: "state", state: "failed", message: "No room on the drive" });
    queue.resume(job.id);
    await queue.whenIdle(2_000);
    const kinds = queue.detail(job.id).events.map((event) => event.kind);
    expect(kinds).toEqual(["state", "state", "state", "resumed", "state", "state"]);
    await queue.close();
  });

  it("keeps at most a hundred steps of one job's history: the first and the newest", async () => {
    const { queue } = queueOn();
    queue.register<Record<string, never>>("chatty", {
      queue: "work",
      async run({ progress }) {
        for (let stage = 0; stage < MAX_JOB_EVENTS + 50; stage += 1) {
          progress({ stage: `Stage ${stage}` });
          await new Promise((resolve) => setTimeout(resolve, 2));
          progress({ current: stage });
          await new Promise((resolve) => setTimeout(resolve, 505));
        }
        return {};
      },
    });
    // Fake time would be simpler; the write throttle is half a second, so the stages are spaced by that.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    queue.start();
    const job = queue.enqueue("chatty", {}, { title: "Chatty" });
    for (let tick = 0; tick < (MAX_JOB_EVENTS + 50) * 2 + 10; tick += 1) {
      await vi.advanceTimersByTimeAsync(510);
    }
    await vi.waitFor(() => expect(queue.get(job.id)?.state).toBe("succeeded"));
    const { events } = queue.detail(job.id);
    expect(events.length).toBe(MAX_JOB_EVENTS);
    expect(events[0]).toMatchObject({ kind: "state", state: "queued" });
    expect(events.at(-1)).toMatchObject({ kind: "state", state: "succeeded" });
    await queue.close();
  });

  it("removes the samples and history of a job a week after it ended, and keeps a newer one's", async () => {
    const { queue, db } = queueOn();
    queue.register<Record<string, never>>("short", {
      queue: "work",
      run: async ({ progress }) => {
        progress({ current: 1, total: 1 });
        return {};
      },
    });
    queue.start();
    const old = queue.enqueue("short", {}, { title: "Old" });
    const recent = queue.enqueue("short", {}, { title: "Recent" });
    await queue.whenIdle(2_000);
    db.db
      .update(jobs)
      .set({ finishedAt: Date.now() - JOB_HISTORY_KEPT_MS - 60_000 })
      .where(eq(jobs.id, old.id))
      .run();
    await queue.close();

    // The next start looks; so does each job that ends, once an hour.
    const again = new JobQueue(db.db, new EventBus(), log);
    again.register<Record<string, never>>("short", { queue: "work", run: async () => ({}) });
    again.start();
    expect(again.detail(old.id)).toMatchObject({ samples: [], events: [] });
    expect(again.detail(recent.id).samples.length).toBeGreaterThan(0);
    expect(again.detail(recent.id).events.length).toBeGreaterThan(0);
    expect(db.db.select().from(jobSamples).where(eq(jobSamples.jobId, old.id)).all()).toEqual([]);
    await again.close();
  });
});

describe("a running job's rate", () => {
  it("is what it did a second over the last few minutes, and nothing until there is enough to go on", () => {
    expect(paceOf([])).toBeNull();
    expect(
      paceOf([
        { at: 0, current: 0, unit: "passages" },
        { at: 4_000, current: 40, unit: "passages" },
      ]),
    ).toBeNull();
    expect(
      paceOf([
        { at: 0, current: 0, unit: "passages" },
        { at: 10_000, current: 50, unit: "passages" },
      ]),
    ).toBe(5);
  });

  it("comes with each update while the job runs, starts afresh when it counts something else, and goes when it ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { queue } = queueOn();
    const rates: Array<number | null | undefined> = [];
    let release: () => void = () => {};
    queue.register<Record<string, never>>("steady", {
      queue: "work",
      async run({ progress }) {
        for (let second = 0; second <= 20; second += 1) {
          progress({ current: second * 10, total: 1000, unit: "passages" });
          vi.advanceTimersByTime(1_000);
          await turn();
        }
        rates.push(queue.rateOf(queue.list({ states: ["running"] })[0]!.id));
        progress({ current: 0, total: 50, unit: "ways" });
        vi.advanceTimersByTime(1_000);
        await turn();
        progress({ current: 1, total: 50, unit: "ways" });
        rates.push(queue.rateOf(queue.list({ states: ["running"] })[0]!.id));
        await new Promise<void>((resolve) => (release = resolve));
        return {};
      },
    });
    queue.start();
    const job = queue.enqueue("steady", {}, { title: "Steady" });
    await vi.waitFor(() => expect(rates).toHaveLength(2));
    // Ten passages a second; once it counts ways, too little is known yet.
    expect(rates[0]).toBeCloseTo(10, 0);
    expect(rates[1]).toBeNull();
    expect(queue.toDto(queue.get(job.id)!).progress.unit).toBe("ways");
    release();
    await queue.whenIdle(2_000);
    expect(queue.rateOf(job.id)).toBeNull();
    expect(queue.toDto(queue.get(job.id)!).progress.ratePerSecond).toBeNull();
    await queue.close();
  });
});

describe("what a waiting job is waiting for", () => {
  it("names the job running in its place and those queued before it", async () => {
    const { queue } = queueOn();
    let release: () => void = () => {};
    queue.register<Record<string, never>>("long", {
      queue: "work",
      run: () => new Promise((resolve) => (release = () => resolve({}))),
    });
    queue.start();
    const first = queue.enqueue("long", {}, { title: "First" });
    await vi.waitFor(() => expect(queue.get(first.id)?.state).toBe("running"));
    const second = queue.enqueue("long", {}, { title: "Second" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const third = queue.enqueue("long", {}, { title: "Third" });

    expect(queue.detail(first.id).waiting.reason).toBeNull();
    expect(queue.detail(second.id).waiting).toMatchObject({
      reason: "turn",
      slots: 1,
      running: [{ id: first.id, title: "First" }],
      aheadCount: 0,
    });
    expect(queue.detail(third.id).waiting).toMatchObject({ reason: "turn", aheadCount: 1, ahead: [{ id: second.id, title: "Second" }] });

    queue.pause(third.id);
    expect(queue.detail(third.id).waiting.reason).toBe("paused");
    queue.holdFor("other", "Space is being reclaimed in the database.");
    expect(queue.detail(second.id).waiting).toMatchObject({ reason: "held", held: "Space is being reclaimed in the database." });
    queue.release();

    queue.cancel(third.id);
    release();
    await vi.waitFor(() => expect(queue.get(second.id)?.state).toBe("running"));
    release();
    await queue.whenIdle(2_000);
    await queue.close();
  });

  it("says when a job that failed will try again", async () => {
    const { queue } = queueOn();
    queue.register<Record<string, never>>("flaky", {
      queue: "work",
      run: async () => {
        throw new Error("Busy");
      },
    });
    queue.start();
    const job = queue.enqueue("flaky", {}, { title: "Flaky", maxAttempts: 3 });
    await vi.waitFor(() => expect(queue.get(job.id)?.runAfter).toBeGreaterThan(Date.now()));
    const { waiting } = queue.detail(job.id);
    expect(waiting.reason).toBe("retry");
    expect(waiting.retryAt).toBeGreaterThan(Date.now());
    queue.cancel(job.id);
    await queue.close();
  });
});

describe("the jobs API", () => {
  it("has a name in words for every kind of job the server runs", async () => {
    const app = await createTestApp();
    apps.push(app);
    const types = app.ctx.jobs.registeredTypes();
    expect(types.length).toBeGreaterThan(30);
    expect(types.filter((type) => !TASK_KINDS[type])).toEqual([]);
    // And nothing named that the server no longer runs.
    expect(Object.keys(TASK_KINDS).filter((type) => !types.includes(type))).toEqual([]);
    for (const kind of Object.values(TASK_KINDS)) {
      expect(kind.about).toMatch(/^[A-Z].*\.$/);
      expect(kind.name).toMatch(/^[A-Z].*[^.]$/);
    }
  });

  it("gives one job's details, lists by state and type, and checks what it is asked", async () => {
    const app = await createTestApp();
    apps.push(app);
    app.ctx.jobs.register<Record<string, never>>("test.count", {
      queue: "test",
      async run({ progress }) {
        for (let done = 0; done <= 5; done += 1) {
          progress({ current: done, total: 5, unit: "pages" });
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        return { counted: 5 };
      },
    });
    const job = app.ctx.jobs.enqueue("test.count", {}, { title: "Count five pages" });
    await vi.waitFor(() => expect(app.ctx.jobs.get(job.id)?.state).toBe("succeeded"), { timeout: 5_000 });

    const detail = await app.api("GET", `/api/jobs/${job.id}/detail`);
    expect(detail.status).toBe(200);
    expect(detail.body.job).toMatchObject({ id: job.id, state: "succeeded", progress: { current: 5, total: 5, unit: "pages" } });
    expect(detail.body.samples.length).toBeGreaterThanOrEqual(2);
    expect(detail.body.samples.at(-1)).toMatchObject({ current: 5, total: 5, unit: "pages" });
    expect(detail.body.events.map((event: { state: string }) => event.state)).toEqual(["queued", "running", "succeeded"]);
    expect(detail.body.waiting).toMatchObject({ reason: null });

    const finished = await app.api("GET", "/api/jobs?states=succeeded,failed&notTypes=download.run&limit=10");
    expect(finished.status).toBe(200);
    expect(finished.body.jobs.map((item: { id: string }) => item.id)).toContain(job.id);
    const others = await app.api("GET", "/api/jobs?states=succeeded&notTypes=test.count");
    expect(others.body.jobs.map((item: { id: string }) => item.id)).not.toContain(job.id);
    const byType = await app.api("GET", "/api/jobs?types=test.count");
    expect(byType.body.jobs).toHaveLength(1);
    // An old caller's limit, whatever it is, still lists.
    expect((await app.api("GET", "/api/jobs?limit=nonsense")).status).toBe(200);

    expect((await app.api("GET", "/api/jobs?states=finished")).status).toBe(400);
    expect((await app.api("GET", "/api/jobs?types=DROP%20TABLE")).status).toBe(400);
    expect((await app.api("GET", "/api/jobs/no-such-job/detail")).status).toBe(404);
    expect((await app.api("POST", `/api/jobs/${job.id}/explode`)).status).toBe(400);
    expect((await app.api("POST", `/api/jobs/${job.id}/pause`)).status).toBe(409);
  });
});
