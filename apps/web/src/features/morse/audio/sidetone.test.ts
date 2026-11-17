import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidetone } from "./sidetone";

/** Just enough of Web Audio to see what the sidetone asks of it: the context's state and its calls. */
class FakeParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = "";
  buffer: unknown = null;
  loop = false;
  connect<T>(next: T): T {
    return next;
  }
  disconnect() {}
  start() {}
  stop() {}
}
const contexts: FakeContext[] = [];
class FakeContext {
  state: "running" | "suspended" | "closed" = "suspended";
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  suspends = 0;
  resumes = 0;
  constructor() {
    contexts.push(this);
  }
  addEventListener() {}
  createOscillator = () => new FakeNode();
  createGain = () => new FakeNode();
  createBiquadFilter = () => new FakeNode();
  createBufferSource = () => new FakeNode();
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  resume() {
    this.resumes += 1;
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.suspends += 1;
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("the sidetone's audio context", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    contexts.length = 0;
    vi.stubGlobal("AudioContext", FakeContext);
  });
  afterEach(() => {
    setHidden(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is suspended a moment after the last sound ends, and woken by the next", async () => {
    const tone = new Sidetone();
    await tone.ensure();
    const ctx = contexts[0]!;
    expect(ctx.state).toBe("running");
    const handle = tone.playTimeline([{ on: true, ms: 300, tokenIndex: 0 }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await handle.done).toBe(true);
    expect(ctx.state).toBe("running");
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctx.state).toBe("suspended");
    // Asleep by choice is not "the browser has not let this page play".
    expect(tone.soundState()).toBe("running");

    tone.keyDown();
    expect(ctx.state).toBe("running");
    // Held down: never put to sleep under a sounding key.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctx.state).toBe("running");
    tone.keyUp();
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctx.suspends).toBe(2);
    tone.dispose();
  });

  it("keeps running while band noise is meant to be heard, and sleeps when the page is hidden", async () => {
    const tone = new Sidetone();
    await tone.ensure();
    const ctx = contexts[0]!;
    tone.setImpairments({ noise: 0.5, qsb: 0 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctx.state).toBe("running");
    setHidden(true);
    expect(ctx.state).toBe("suspended");
    setHidden(false);
    expect(ctx.state).toBe("running");
    tone.setImpairments({ noise: 0, qsb: 0 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctx.state).toBe("suspended");
    tone.dispose();
  });

  it("leaves no timer behind once asleep", async () => {
    const tone = new Sidetone();
    await tone.ensure();
    await vi.advanceTimersByTimeAsync(3000);
    expect(contexts[0]!.state).toBe("suspended");
    expect(vi.getTimerCount()).toBe(0);
    tone.dispose();
  });
});
