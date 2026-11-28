import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/core/events.ts";
import { JobQueue, MAX_INTERRUPTIONS } from "../src/core/jobs.ts";
import { openDatabase } from "../src/db/client.ts";
import { jobs } from "../src/db/schema.ts";

const quiet = () => {};
const log = { info: quiet, warn: quiet, error: quiet, debug: quiet, child: () => log } as unknown as FastifyBaseLogger;
const open: Array<{ close(): void }> = [];

function queueOn(db = openDatabase(":memory:")) {
  open.push(db.sqlite);
  return { queue: new JobQueue(db.db, new EventBus(), log), db };
}

afterEach(() => {
  vi.useRealTimers();
  for (const sqlite of open.splice(0)) sqlite.close();
});

describe("the job runner", () => {
  it("sets no timer while there is nothing to do", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
    const { queue } = queueOn();
    queue.register("noop", { queue: "work", run: async () => ({}) });
    queue.start();
    expect(vi.getTimerCount()).toBe(0);
    queue.enqueue("noop", {}, { title: "Nothing much" });
    await queue.whenIdle(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await queue.close();
  });

  it("starts a job left waiting for later when it comes due, with no poll in between", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] });
    const { queue, db } = queueOn();
    const ran = vi.fn(async () => ({}));
    queue.register("later", { queue: "work", run: ran });
    const job = queue.enqueue("later", {}, { title: "Later", paused: true });
    // As a previous process would have left it: queued, to run in ten seconds.
    db.db
      .update(jobs)
      .set({ state: "queued", runAfter: Date.now() + 10_000 })
      .where(eq(jobs.id, job.id))
      .run();
    queue.start();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(ran).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(queue.get(job.id)?.state).toBe("succeeded");
    expect(vi.getTimerCount()).toBe(0);
    await queue.close();
  });

  it("survives a job that throws, whatever it throws, and goes on to the next", async () => {
    const { queue } = queueOn();
    queue.register("bad", {
      queue: "work",
      run: () => {
        throw "not even an Error";
      },
    });
    queue.register("good", { queue: "work", run: async () => ({ ok: true }) });
    queue.start();
    const bad = queue.enqueue("bad", {}, { title: "Bad" });
    const good = queue.enqueue("good", {}, { title: "Good" });
    await queue.whenIdle(2000);
    expect(queue.get(bad.id)).toMatchObject({ state: "failed", error: "not even an Error" });
    expect(queue.get(good.id)).toMatchObject({ state: "succeeded", result: { ok: true } });
    await queue.close();
  });

  it("logs a job whose end could not be written, and goes on to the next, with nothing left unhandled", async () => {
    const errors: Array<[unknown, string]> = [];
    const watched = {
      ...log,
      error: (details: unknown, message: string) => errors.push([details, message]),
    } as unknown as FastifyBaseLogger;
    const db = openDatabase(":memory:");
    open.push(db.sqlite);
    const queue = new JobQueue(db.db, new EventBus(), watched);
    queue.register("work", { queue: "work", run: async () => ({ ok: true }) });
    // The database refuses to write how the first job ended, and then how its failure ended
    // (as a full disk would), and then works again.
    const writes = queue as unknown as { update(id: string, patch: { state?: string }): void };
    const update = writes.update.bind(queue);
    let refused = 0;
    vi.spyOn(writes, "update").mockImplementation((id, patch) => {
      if (id === first.id && patch.state !== undefined && patch.state !== "running" && refused < 2) {
        refused += 1;
        throw new Error("database or disk is full");
      }
      update(id, patch);
    });
    const first = queue.enqueue("work", {}, { title: "First" });
    queue.start();
    const second = queue.enqueue("work", {}, { title: "Second" });
    await queue.whenIdle(2000);
    expect(refused).toBe(2);
    expect(errors).toContainEqual([
      { job: first.id, err: expect.objectContaining({ message: "database or disk is full" }) },
      "the job runner could not record a job's end",
    ]);
    expect(queue.get(second.id)).toMatchObject({ state: "succeeded", result: { ok: true } });
    await queue.close();
  });

  it("ignores progress a job reports after it has ended, even once the database is closed", async () => {
    // Text reading runs in a worker whose last progress message can arrive after the job has
    // ended and the server has closed the database (seen in links.test.ts under load).
    const { queue, db } = queueOn();
    let late: ((update: { current: number }) => void) | undefined;
    queue.register("quick", {
      queue: "work",
      run: async (run) => {
        late = run.progress;
        return {};
      },
    });
    queue.start();
    const job = queue.enqueue("quick", {}, { title: "Quick" });
    await queue.whenIdle(1000);
    expect(queue.get(job.id)?.state).toBe("succeeded");
    await queue.close();
    db.sqlite.close();
    expect(() => late?.({ current: 5 })).not.toThrow();
  });

  it("runs two of the same job one after the other on a queue of one", async () => {
    const { queue } = queueOn();
    let running = 0;
    let most = 0;
    queue.register("same", {
      queue: "work",
      run: async () => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 20));
        running -= 1;
        return {};
      },
    });
    queue.start();
    const first = queue.enqueue("same", {}, { title: "Same", subject: "x" });
    const second = queue.enqueue("same", {}, { title: "Same", subject: "x" });
    await queue.whenIdle(2000);
    expect(most).toBe(1);
    expect(queue.get(first.id)?.state).toBe("succeeded");
    expect(queue.get(second.id)?.state).toBe("succeeded");
    await queue.close();
  });

  it("picks a job up again after the process stopped part of the way through it", async () => {
    const shared = openDatabase(":memory:");
    const before = queueOn(shared).queue;
    let started!: () => void;
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    before.register("long", {
      queue: "work",
      run: ({ signal }) =>
        new Promise((_resolve, reject) => {
          started();
          signal.addEventListener("abort", () => reject(new Error("stopped")));
        }),
    });
    before.start();
    const job = before.enqueue("long", {}, { title: "Long" });
    await begun;
    await before.close();
    // Stopped in good order: queued for the next start, having used no attempt.
    expect(before.get(job.id)).toMatchObject({ state: "queued", attempts: 0, interruptions: 0 });

    const after = new JobQueue(shared.db, new EventBus(), log);
    after.register("long", { queue: "work", run: async ({ job: row }) => ({ resumedFrom: row.progressMessage }) });
    after.start();
    await after.whenIdle(2000);
    // Being stopped by a restart is not a failed attempt: the job is still on its first.
    expect(after.get(job.id)).toMatchObject({ state: "succeeded", attempts: 1, result: { resumedFrom: "Resuming after restart" } });
    await after.close();
  });

  it("does not count restarts as attempts, so a job resumed many times keeps its retries and never shows more than its maximum", async () => {
    const shared = openDatabase(":memory:");
    open.push(shared.sqlite);
    let id = "";
    // Five restarts part of the way through a job allowed three attempts.
    for (let restart = 0; restart < 5; restart++) {
      const runner = new JobQueue(shared.db, new EventBus(), log);
      let started!: () => void;
      const begun = new Promise<void>((resolve) => {
        started = resolve;
      });
      runner.register("build", {
        queue: "work",
        run: ({ signal }) =>
          new Promise((_resolve, reject) => {
            started();
            signal.addEventListener("abort", () => reject(new Error("stopped")));
          }),
      });
      if (restart === 0) id = runner.enqueue("build", {}, { title: "Build", maxAttempts: 3 }).id;
      runner.start();
      await begun;
      expect(runner.get(id)?.attempts).toBeLessThanOrEqual(3);
      await runner.close();
      expect(runner.get(id)).toMatchObject({ attempts: 0, interruptions: 0 });
    }

    // Then it fails twice and succeeds on its third attempt: all three are still there to use.
    const last = new JobQueue(shared.db, new EventBus(), log);
    let runs = 0;
    last.register("build", {
      queue: "work",
      run: async () => {
        runs += 1;
        if (runs < 3) throw new Error("not yet");
        return { ok: true };
      },
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    last.start();
    for (let i = 0; i < 4 && last.get(id)?.state !== "succeeded"; i++) await vi.advanceTimersByTimeAsync(10_000);
    expect(last.get(id)).toMatchObject({ state: "succeeded", attempts: 3, maxAttempts: 3 });
    const messages = last.detail(id).events.map((event) => event.message);
    expect(messages).not.toContainEqual(expect.stringMatching(/Attempt [4-9] of 3/));
    await last.close();
  });

  describe("a server that dies while a job runs (a power cut), with no orderly stop", () => {
    /** One process: it starts, its job begins, and it dies there (close() is never called). */
    async function dieDuring(shared: ReturnType<typeof openDatabase>, enqueue?: { maxAttempts: number }): Promise<string | undefined> {
      const runner = new JobQueue(shared.db, new EventBus(), log);
      let started!: () => void;
      const begun = new Promise<void>((resolve) => {
        started = resolve;
      });
      runner.register("long", {
        queue: "work",
        run: () =>
          new Promise(() => {
            started();
          }),
      });
      const id = enqueue ? runner.enqueue("long", {}, { title: "Long", ...enqueue }).id : undefined;
      runner.start();
      await begun;
      return id;
    }
    function fresh() {
      const shared = openDatabase(":memory:");
      open.push(shared.sqlite);
      return shared;
    }

    it("does not use a one-attempt job's attempt: it survives two power cuts and finishes on the third start", async () => {
      const shared = fresh();
      const id = (await dieDuring(shared, { maxAttempts: 1 }))!;
      await dieDuring(shared);
      const after = new JobQueue(shared.db, new EventBus(), log);
      after.register("long", { queue: "work", run: async ({ job }) => ({ attempts: job.attempts, interruptions: job.interruptions }) });
      after.start();
      await after.whenIdle(2000);
      // Shown as its first attempt of one, with the two power cuts counted apart; finishing clears them.
      expect(after.get(id)).toMatchObject({
        state: "succeeded",
        attempts: 1,
        maxAttempts: 1,
        interruptions: 0,
        result: { attempts: 1, interruptions: 2 },
      });
      await after.close();
    });

    it(`is not started again after ${MAX_INTERRUPTIONS} in a row, and says so; Resume starts it afresh`, async () => {
      const shared = fresh();
      const id = (await dieDuring(shared, { maxAttempts: 1 }))!;
      for (let cut = 1; cut < MAX_INTERRUPTIONS; cut++) await dieDuring(shared);
      const settled: string[] = [];
      const after = new JobQueue(shared.db, new EventBus(), log);
      const ran = vi.fn(async () => ({}));
      after.register("long", { queue: "work", run: ran, onSettled: (job) => void settled.push(job.state) });
      after.start();
      await after.whenIdle(2000);
      expect(ran).not.toHaveBeenCalled();
      const job = after.get(id)!;
      expect(job).toMatchObject({ state: "failed", attempts: 0, interruptions: 3, errorKind: "interrupted" });
      expect(job.error).toBe("Outpost stopped while this was running, 3 times, so it was not started again. Resume it to try again.");
      expect(job.finishedAt).not.toBeNull();
      expect(settled).toEqual(["failed"]);
      after.resume(id);
      await after.whenIdle(2000);
      expect(after.get(id)).toMatchObject({ state: "succeeded", attempts: 1, interruptions: 0 });
      await after.close();
    });

    it("leaves ordinary failures counting against the job's attempts, and never shows more attempts than it has", async () => {
      const shared = fresh();
      const id = (await dieDuring(shared, { maxAttempts: 2 }))!;
      const after = new JobQueue(shared.db, new EventBus(), log);
      after.register("long", {
        queue: "work",
        run: async () => {
          throw new Error("not this time");
        },
      });
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      after.start();
      for (let i = 0; i < 4 && after.get(id)?.state !== "failed"; i++) await vi.advanceTimersByTimeAsync(10_000);
      expect(after.get(id)).toMatchObject({ state: "failed", attempts: 2, maxAttempts: 2, error: "not this time", interruptions: 0 });
      const said = after.detail(id).events.map((event) => event.message ?? "");
      expect(said.filter((message) => /^Attempt \d+ of 2$/.test(message))).toEqual(["Attempt 2 of 2"]);
      await after.close();
    });
  });
});
