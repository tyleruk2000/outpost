import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AutosaveStatus, createAutosaver, type SaveFailure } from "./autosave";

interface Fields {
  title: string;
  content: string;
}

interface Call {
  patch: Partial<Fields>;
  base: number | undefined;
  unloading: boolean;
  resolve(updatedAt: number): void;
  reject(failure: SaveFailure): void;
}

function setup(initial: Fields = { title: "Hut log", content: "" }) {
  const page = { ...initial };
  const calls: Call[] = [];
  const statuses: AutosaveStatus[] = [];
  const drafts: Array<Partial<Fields> | null> = [];
  const saver = createAutosaver<Fields>({
    baseUpdatedAt: 100,
    collect: (keys) => Object.fromEntries([...keys].map((key) => [key, page[key]])) as Partial<Fields>,
    send: (patch, base, { unloading }) =>
      new Promise<number>((resolve, reject) => {
        calls.push({ patch, base, unloading, resolve, reject });
      }),
    classify: (error) => error as SaveFailure,
    onStatus: (status) => statuses.push(status),
    onDraft: (draft) => drafts.push(draft),
    debounceMs: 800,
    retryDelaysMs: [1000, 2000],
  });
  const type = (text: string) => {
    page.content += text;
    saver.touch("content");
  };
  /** Lets the promise callbacks of a settled save run. */
  const settle = () => vi.advanceTimersByTimeAsync(0);
  return { page, calls, statuses, drafts, saver, type, settle };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("debounce", () => {
  it("waits for a pause in typing, then sends the latest text once", async () => {
    const { calls, saver, type } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(500);
    type("b");
    await vi.advanceTimersByTimeAsync(799);
    expect(calls).toHaveLength(0);
    expect(saver.status()).toEqual({ kind: "saving" });

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ patch: { content: "ab" }, base: 100, unloading: false });
  });

  it("sends only the fields that changed, and builds on the answer", async () => {
    const { page, calls, saver, settle } = setup();
    page.title = "Hut log 2026";
    saver.touch("title");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls[0]?.patch).toEqual({ title: "Hut log 2026" });

    calls[0]?.resolve(140);
    await settle();
    expect(saver.status()).toEqual({ kind: "saved" });
    expect(saver.baseUpdatedAt()).toBe(140);
    expect(saver.isClean()).toBe(true);
  });

  it("saves at once when flushed", () => {
    const { calls, saver, type } = setup();
    type("a");
    saver.flush();
    expect(calls).toHaveLength(1);
  });

  it("keeps a draft from the moment a save starts until everything is saved", async () => {
    const { calls, drafts, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    expect(drafts).toEqual([{ content: "a" }]);
    calls[0]?.resolve(101);
    await settle();
    expect(drafts.at(-1)).toBeNull();
  });
});

describe("typing while a save is in flight", () => {
  it("queues one follow-up save with the newer text and the new base", async () => {
    const { calls, saver, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(1);

    type("b");
    type("c");
    await vi.advanceTimersByTimeAsync(2000);
    // Still one request: the second waits for the first to come back.
    expect(calls).toHaveLength(1);
    expect(saver.isClean()).toBe(false);

    calls[0]?.resolve(150);
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ patch: { content: "abc" }, base: 150 });
    expect(saver.status()).toEqual({ kind: "saving" });

    calls[1]?.resolve(160);
    await settle();
    expect(saver.status()).toEqual({ kind: "saved" });
    expect(calls).toHaveLength(2);
  });

  it("lets the follow-up wait out the rest of the pause", async () => {
    const { calls, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    type("b");
    await vi.advanceTimersByTimeAsync(300);
    calls[0]?.resolve(150);
    await settle();
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(2);
  });
});

describe("a conflict", () => {
  async function conflicted() {
    const context = setup();
    context.type("mine");
    await vi.advanceTimersByTimeAsync(800);
    context.calls[0]?.reject({ kind: "conflict", current: { updatedAt: 300, title: "Hut log (phone)" } });
    await context.settle();
    return context;
  }

  it("stops saving and reports the other version", async () => {
    const { calls, saver, type } = await conflicted();
    expect(saver.status()).toEqual({ kind: "conflict", current: { updatedAt: 300, title: "Hut log (phone)" } });

    type(" and more");
    await vi.advanceTimersByTimeAsync(5000);
    // Nothing is sent over the other version until the person chooses.
    expect(calls).toHaveLength(1);
    expect(saver.isClean()).toBe(false);
  });

  it("keeps drafting what is typed while the choice is open", async () => {
    const { drafts, type } = await conflicted();
    type(" and more");
    await vi.advanceTimersByTimeAsync(800);
    expect(drafts.at(-1)).toEqual({ content: "mine and more" });
  });

  it("keep my version: sends every field again without a base", async () => {
    const { calls, saver, settle } = await conflicted();
    saver.keepMine(["title", "content"]);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.patch).toEqual({ title: "Hut log", content: "mine" });
    expect(calls[1]?.base).toBeUndefined();

    calls[1]?.resolve(400);
    await settle();
    expect(saver.status()).toEqual({ kind: "saved" });
    expect(saver.baseUpdatedAt()).toBe(400);
  });

  it("goes back to sending a base once the overwrite is done", async () => {
    const { calls, saver, type, settle } = await conflicted();
    saver.keepMine(["title", "content"]);
    calls[1]?.resolve(400);
    await settle();
    type("!");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls[2]?.base).toBe(400);
  });

  it("load the other version: forgets local changes and builds on the newer page", async () => {
    const { calls, drafts, saver, type } = await conflicted();
    saver.reset(300);
    expect(saver.status()).toEqual({ kind: "saved" });
    expect(saver.isClean()).toBe(true);
    expect(drafts.at(-1)).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);

    type("x");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls[1]?.base).toBe(300);
  });
});

describe("an unreachable server", () => {
  it("keeps the changes and retries with growing waits", async () => {
    const { calls, saver, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    calls[0]?.reject({ kind: "offline" });
    await settle();
    expect(saver.status()).toEqual({ kind: "offline" });

    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.patch).toEqual({ content: "a" });

    calls[1]?.reject({ kind: "offline" });
    await settle();
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
    // Still described as offline while it tries again.
    expect(saver.status()).toEqual({ kind: "offline" });

    calls[2]?.resolve(120);
    await settle();
    expect(saver.status()).toEqual({ kind: "saved" });
  });

  it("includes what was typed while offline in the retry", async () => {
    const { page, calls, saver, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    calls[0]?.reject({ kind: "offline" });
    await settle();
    type("b");
    page.title = "New title";
    saver.touch("title");
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls[1]?.patch).toEqual({ content: "ab", title: "New title" });
  });

  it("retries at once when asked", async () => {
    const { calls, saver, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    calls[0]?.reject({ kind: "offline" });
    await settle();
    saver.retry();
    expect(calls).toHaveLength(2);
  });
});

describe("another failure", () => {
  it("shows the message, keeps the change, and tries again on the next edit", async () => {
    const { calls, saver, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    calls[0]?.reject({ kind: "error", message: "This page is too large to save." });
    await settle();
    expect(saver.status()).toEqual({ kind: "error", message: "This page is too large to save." });
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(1);

    type("b");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls[1]?.patch).toEqual({ content: "ab" });
  });
});

describe("closing the page", () => {
  it("sends what is unsaved straight away", () => {
    const { calls, saver, type } = setup();
    type("a");
    saver.close();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ patch: { content: "a" }, base: 100 });
  });

  it("reads the values before the page is gone and sends them after the save in flight", async () => {
    const { page, calls, saver, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    type("b");
    saver.close();
    // The editor no longer exists; whatever it held at closing time is what counts.
    page.content = "";
    expect(calls).toHaveLength(1);

    calls[0]?.resolve(150);
    await settle();
    expect(calls[1]).toMatchObject({ patch: { content: "ab" }, base: 150 });
  });

  it("ignores edits after closing", async () => {
    const { calls, saver, type } = setup();
    saver.close();
    type("late");
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(0);
  });
});

describe("the tab closing", () => {
  it("sends what is unsaved in a request that outlives the tab", () => {
    const { calls, saver, type } = setup();
    type("a");
    saver.flush({ unloading: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ patch: { content: "a" }, base: 100, unloading: true });
  });

  it("with a save in flight, drafts the newer text rather than racing it", async () => {
    const { calls, drafts, saver, type } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    type("b");
    expect(saver.isStuck()).toBe(true);
    saver.flush({ unloading: true });
    // A second request with the same base could land first and turn the first into a conflict.
    expect(calls).toHaveLength(1);
    expect(drafts.at(-1)).toEqual({ content: "ab" });
  });

  it("is not stuck when a flush can send everything", async () => {
    const { calls, saver, type, settle } = setup();
    type("a");
    expect(saver.isStuck()).toBe(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.isStuck()).toBe(false);
    calls[0]?.resolve(110);
    await settle();
    expect(saver.isStuck()).toBe(false);
  });

  it("carries on as usual if the tab survives", async () => {
    const { calls, saver, type, settle } = setup();
    type("a");
    saver.flush({ unloading: true });
    calls[0]?.resolve(130);
    await settle();
    type("b");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls[1]).toMatchObject({ patch: { content: "ab" }, base: 130, unloading: false });
  });
});

describe("closing a page in conflict", () => {
  it("does not overwrite the other version of a page in conflict, but keeps the draft", async () => {
    const { calls, drafts, saver, type, settle } = setup();
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    calls[0]?.reject({ kind: "conflict", current: { updatedAt: 300, title: "" } });
    await settle();
    type("b");
    saver.close();
    expect(calls).toHaveLength(1);
    expect(drafts.at(-1)).toEqual({ content: "ab" });
  });
});

describe("rebase", () => {
  it("builds later saves on a change made outside the queue", async () => {
    const { calls, saver, type } = setup();
    saver.rebase(250);
    type("a");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls[0]?.base).toBe(250);
  });
});
