/** The contour worker's lifetime: started for the first tile, ended once nothing has been asked of it for a while. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  ended = false;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(message: { type: string; id: number }) {
    if (message.type === "tile")
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, data: new ArrayBuffer(1) } } as MessageEvent));
  }
  terminate() {
    this.ended = true;
  }
}

describe("the contour worker", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.made = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is ended a minute after its last tile, and a new one is started for the next", async () => {
    const { loadContourTile } = await import("./contours");
    await loadContourTile({ url: "outpost-contours://a" }, new AbortController());
    await loadContourTile({ url: "outpost-contours://b" }, new AbortController());
    expect(FakeWorker.made).toHaveLength(1);
    vi.advanceTimersByTime(59_000);
    expect(FakeWorker.made[0]?.ended).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(FakeWorker.made[0]?.ended).toBe(true);
    await loadContourTile({ url: "outpost-contours://c" }, new AbortController());
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[1]?.ended).toBe(false);
  });
});
