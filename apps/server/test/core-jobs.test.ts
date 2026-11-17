import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/core/events.ts";
import { JobQueue } from "../src/core/jobs.ts";
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
    expect(before.get(job.id)?.state).toBe("running");

    const after = new JobQueue(shared.db, new EventBus(), log);
    after.register("long", { queue: "work", run: async ({ job: row }) => ({ resumedFrom: row.progressMessage }) });
    after.start();
    await after.whenIdle(2000);
    expect(after.get(job.id)).toMatchObject({ state: "succeeded", attempts: 2, result: { resumedFrom: "Resuming after restart" } });
    await after.close();
  });
});
