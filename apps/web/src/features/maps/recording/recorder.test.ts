/**
 * The recorder, with the browser replaced by stand-ins: positions are handed to it by
 * the test, the clock is the test's, the device's storage is a map in memory, and
 * "Outpost" is a function that can be made to fail.
 */
import type { TrackDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { type PositionLike, RETRY_DELAYS_MS, Recorder, type RecorderEnv, SendFailure, type WakeSentinel } from "./recorder";
import { createMemoryStore, type RecordingStore } from "./store";

const T0 = Date.UTC(2026, 10, 16, 10, 0, 0);

interface Sent {
  id: string;
  name: string;
  color: string;
  gpx: string;
}

function world(
  options: { store?: ReturnType<typeof createMemoryStore>; secure?: boolean; wake?: "ok" | "refuse" | "none"; lockHeld?: boolean } = {},
) {
  const store = options.store ?? createMemoryStore();
  let now = T0;
  let visible = true;
  let onPosition: ((position: PositionLike) => void) | undefined;
  let onError: ((error: { code: number }) => void) | undefined;
  const visibilityListeners = new Set<() => void>();
  const onlineListeners = new Set<() => void>();
  const timers = new Map<number, { run: () => void; at: number }>();
  let nextTimer = 1;
  const sent: Sent[] = [];
  const sentinels: Array<{ released: boolean; fire: () => void }> = [];
  let wakeRequests = 0;
  let tabHeld = options.lockHeld ?? false;
  let failWith: SendFailure | null = null;
  let storeFails = false;
  let watching = 0;

  const failingStore: RecordingStore = {
    ...store,
    addPoint: async (id, point) => {
      if (storeFails) throw new Error("QuotaExceededError");
      await store.addPoint(id, point);
    },
  };

  const env: RecorderEnv = {
    openStore: async () => failingStore,
    geolocation: {
      watchPosition(success, failure) {
        onPosition = success;
        onError = failure;
        watching += 1;
        return watching;
      },
      clearWatch() {
        onPosition = undefined;
        onError = undefined;
      },
    },
    secure: () => options.secure ?? true,
    now: () => now,
    random: (count) => new Uint8Array(count).fill(7),
    visible: () => visible,
    onVisibility: (listener) => {
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
    onOnline: (listener) => {
      onlineListeners.add(listener);
      return () => onlineListeners.delete(listener);
    },
    requestWakeLock:
      options.wake === "none"
        ? null
        : async () => {
            wakeRequests += 1;
            if (options.wake === "refuse") throw new DOMException("Battery saver is on", "NotAllowedError");
            let listener: (() => void) | undefined;
            const entry = { released: false, fire: () => listener?.() };
            sentinels.push(entry);
            const sentinel: WakeSentinel = {
              release: async () => {
                entry.released = true;
              },
              addEventListener: (_type, added) => {
                listener = added;
              },
            };
            return sentinel;
          },
    tabLock: {
      hold: async () => {
        if (tabHeld) return null;
        tabHeld = true;
        return () => {
          tabHeld = false;
        };
      },
      heldElsewhere: async () => tabHeld,
    },
    send: async (recording) => {
      if (failWith) throw failWith;
      sent.push(recording);
      return { id: recording.id, name: recording.name, color: recording.color } as TrackDto;
    },
    setTimeout: (run, milliseconds) => {
      const id = nextTimer++;
      timers.set(id, { run, at: now + milliseconds });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  };

  const recorder = new Recorder(env);
  /** Lets everything that was started settle: storage writes, sends, state changes. */
  const settle = async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  return {
    recorder,
    store,
    sent,
    sentinels,
    settle,
    state: () => recorder.getSnapshot(),
    watching: () => onPosition !== undefined,
    wakeRequests: () => wakeRequests,
    tabHeld: () => tabHeld,
    /** Moves the clock on, in seconds, running any timer that falls due. */
    async wait(seconds: number) {
      now += seconds * 1000;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.run();
        }
      }
      await settle();
    },
    timers: () => timers.size,
    /** The device reports a position, `north` ten-thousandths of a degree north of the start (11.12 m each). */
    async at(north: number, extra: Partial<PositionLike["coords"]> = {}) {
      onPosition?.({
        coords: { latitude: 54.46 + north * 0.0001, longitude: -3.09, accuracy: 4, altitude: null, altitudeAccuracy: null, ...extra },
        timestamp: now,
      });
      await settle();
    },
    async geolocationError(code: number) {
      onError?.({ code });
      await settle();
    },
    async hide() {
      visible = false;
      for (const listener of visibilityListeners) listener();
      await settle();
    },
    async show() {
      visible = true;
      for (const listener of visibilityListeners) listener();
      await settle();
    },
    async online() {
      for (const listener of onlineListeners) listener();
      await settle();
    },
    outOfReach() {
      failWith = new SendFailure("The Outpost server is not responding. It may be restarting.", true);
    },
    refuses(message: string) {
      failWith = new SendFailure(message, false);
    },
    backInReach() {
      failWith = null;
    },
    storageFull(full: boolean) {
      storeFails = full;
    },
  };
}

/** Starts a recording and walks north: a position every ten seconds, 11.12 m apart. */
async function walk(w: ReturnType<typeof world>, steps: number, from = 0) {
  for (let step = 0; step < steps; step += 1) {
    await w.at(from + step);
    await w.wait(10);
  }
}

describe("recording", () => {
  it("keeps points on the device as they arrive, and adds them up", async () => {
    const w = world();
    expect(await w.recorder.start()).toBe("started");
    expect(w.state().phase).toBe("recording");
    expect(w.watching()).toBe(true);
    await walk(w, 4);
    const state = w.state();
    expect(state.totals.points).toBe(4);
    // Three legs of 11.1195 m, ten seconds each.
    expect(state.totals.distanceMeters).toBe(33.4);
    expect(state.totals.movingMs).toBe(30_000);
    expect(state.totals.ascentMeters).toBeNull();
    // Each point was written to the device the moment it was kept: nothing waits for a save.
    expect(w.store.rows.get(state.id!)).toHaveLength(4);
    expect(w.store.metas.get(state.id!)?.status).toBe("active");
    expect(w.recorder.displayLines()).toEqual([[54.46, 54.4601, 54.4602, 54.4603].map((lat) => [-3.09, lat])]);
    expect(w.sent).toEqual([]);
  });

  it("does not keep a poor fix or one that has not moved, and says which it was", async () => {
    const w = world();
    await w.recorder.start();
    await w.at(0);
    await w.wait(5);
    await w.at(0.3);
    expect(w.state().lastFix).toMatchObject({ refusal: "too-close", accuracy: 4 });
    await w.wait(5);
    await w.at(5, { accuracy: 80 });
    expect(w.state().lastFix).toMatchObject({ refusal: "inaccurate", accuracy: 80 });
    // Where the device says it is is still shown, even when it is not kept.
    expect(w.state().position).toMatchObject({ lat: 54.4605, accuracy: 80 });
    expect(w.state().totals.points).toBe(1);
    expect(w.store.rows.get(w.state().id!)).toHaveLength(1);
  });

  it("starts a new stretch after a pause, and counts nothing across it", async () => {
    const w = world();
    await w.recorder.start();
    await walk(w, 3);
    await w.recorder.pause();
    expect(w.state().phase).toBe("paused");
    expect(w.watching()).toBe(false);
    // Positions that arrive late from the browser while paused are not kept.
    await w.at(50);
    expect(w.state().totals.points).toBe(3);
    await w.wait(600);
    await w.recorder.resume();
    expect(w.watching()).toBe(true);
    await walk(w, 2, 100);
    const rows = w.store.rows.get(w.state().id!)!;
    expect(rows.map((row) => row.segment)).toEqual([0, 0, 0, 1, 1]);
    // Two legs before the pause and one after it; the kilometre in between was not recorded.
    expect(w.state().totals.distanceMeters).toBe(33.4);
    expect(w.recorder.displayLines()).toHaveLength(2);
  });

  it("stops, is named, is sent as GPX with times, and only then leaves the device", async () => {
    const w = world();
    const saved: TrackDto[] = [];
    w.recorder.onSaved((track) => saved.push(track));
    await w.recorder.start();
    await walk(w, 3);
    const id = w.state().id!;
    await w.recorder.stop();
    expect(w.state().phase).toBe("stopped");
    expect(w.watching()).toBe(false);
    expect(w.store.metas.get(id)?.status).toBe("stopped");

    const outcome = await w.recorder.save("Evening round", "violet");
    expect(outcome).toMatchObject({ state: "saved", track: { id, name: "Evening round" } });
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toMatchObject({ id, name: "Evening round", color: "violet" });
    expect(w.sent[0]!.gpx).toContain('<trkpt lat="54.460100" lon="-3.090000"><time>2026-11-16T10:00:10Z</time></trkpt>');
    expect(w.sent[0]!.gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(saved.map((track) => track.id)).toEqual([id]);
    // Outpost has it, so the device's copy is gone and nothing is left in hand.
    expect(w.store.metas.size).toBe(0);
    expect(w.store.rows.size).toBe(0);
    expect(w.state()).toMatchObject({ phase: "idle", id: null, pending: [] });
    expect(w.tabHeld()).toBe(false);
  });

  it("can carry on after a stop that was not meant, and be discarded", async () => {
    const w = world();
    await w.recorder.start();
    await walk(w, 2);
    await w.recorder.stop();
    await w.recorder.carryOn();
    expect(w.state().phase).toBe("recording");
    await walk(w, 2, 10);
    const id = w.state().id!;
    expect(w.store.rows.get(id)!.map((row) => row.segment)).toEqual([0, 0, 1, 1]);
    await w.recorder.discard();
    expect(w.state().phase).toBe("idle");
    expect(w.store.metas.has(id)).toBe(false);
    expect(w.store.rows.has(id)).toBe(false);
  });
});

describe("what the browser will and will not do", () => {
  it("does not start over plain HTTP, where a browser shares no location", async () => {
    const w = world({ secure: false });
    await w.recorder.init();
    expect(w.recorder.ability()).toBe("insecure");
    expect(await w.recorder.start()).toBe("insecure");
    expect(w.state().phase).toBe("idle");
    expect(w.store.metas.size).toBe(0);
  });

  it("asks for the screen to be kept on while recording, lets go on pause and stop, and asks again when the page comes back", async () => {
    const w = world();
    await w.recorder.start();
    await w.settle();
    expect(w.state().wake).toBe("held");
    expect(w.wakeRequests()).toBe(1);

    // The page goes out of sight: the browser lets go of the screen by itself.
    await w.hide();
    w.sentinels[0]!.fire();
    expect(w.state().wake).toBe("released");
    await w.show();
    expect(w.wakeRequests()).toBe(2);
    expect(w.state().wake).toBe("held");

    await w.recorder.pause();
    expect(w.sentinels[1]!.released).toBe(true);
    expect(w.state().wake).toBe("off");
    await w.recorder.resume();
    await w.settle();
    expect(w.state().wake).toBe("held");
    await w.recorder.stop();
    expect(w.sentinels[2]!.released).toBe(true);
    expect(w.state().wake).toBe("off");
    // Coming back into view with nothing being recorded asks for nothing.
    await w.hide();
    await w.show();
    expect(w.wakeRequests()).toBe(3);
  });

  it("says so when the browser will not keep the screen on, or cannot be asked", async () => {
    const refusing = world({ wake: "refuse" });
    await refusing.recorder.start();
    await refusing.settle();
    expect(refusing.state()).toMatchObject({ phase: "recording", wake: "refused" });

    const without = world({ wake: "none" });
    await without.recorder.start();
    await without.settle();
    expect(without.state()).toMatchObject({ phase: "recording", wake: "unsupported" });
  });

  it("writes down a stretch out of sight with no position, and does not join the line across it", async () => {
    const w = world();
    await w.recorder.start();
    await walk(w, 2);
    await w.hide();
    // Four minutes with the screen locked: the browser hands over nothing.
    await w.wait(240);
    await w.show();
    expect(w.state().interruptions).toEqual([{ from: T0 + 20_000, to: T0 + 260_000 }]);
    await walk(w, 2, 30);
    const id = w.state().id!;
    expect(w.store.rows.get(id)!.map((row) => row.segment)).toEqual([0, 0, 1, 1]);
    // One leg each side of the gap; the 300 m walked with the screen off is not claimed.
    expect(w.state().totals.distanceMeters).toBe(22.2);
    expect(w.store.metas.get(id)?.interruptions).toHaveLength(1);
  });

  it("leaves the line whole after a short time out of sight, or when positions kept arriving", async () => {
    const w = world();
    await w.recorder.start();
    await walk(w, 2);
    await w.hide();
    await w.wait(45);
    await w.show();
    expect(w.state().interruptions).toEqual([]);
    // A desktop browser with the window merely covered may go on handing over positions.
    await w.hide();
    await w.wait(90);
    await w.at(12);
    await w.wait(90);
    await w.show();
    expect(w.state().interruptions).toEqual([]);
    await w.at(14);
    expect(w.store.rows.get(w.state().id!)!.map((row) => row.segment)).toEqual([0, 0, 0, 0]);
  });

  it("stops and says why when the browser is told not to share the location", async () => {
    const w = world();
    await w.recorder.start();
    await w.geolocationError(1);
    expect(w.state()).toMatchObject({ phase: "paused", problem: "denied", wake: "off" });
    expect(w.watching()).toBe(false);
  });

  it("carries on looking when the device loses its position for a while", async () => {
    const w = world();
    await w.recorder.start();
    await w.at(0);
    await w.geolocationError(2);
    expect(w.state()).toMatchObject({ phase: "recording", problem: "unavailable" });
    expect(w.watching()).toBe(true);
    await w.wait(30);
    await w.at(3);
    expect(w.state().problem).toBeNull();
    expect(w.state().totals.points).toBe(2);
  });

  it("does not record in two tabs at once", async () => {
    const w = world({ lockHeld: true });
    expect(await w.recorder.start()).toBe("elsewhere");
    expect(w.state()).toMatchObject({ phase: "idle", elsewhere: true });
    expect(w.store.metas.size).toBe(0);
  });

  it("stops where the device will not keep a point, and counts only what it kept", async () => {
    const w = world();
    await w.recorder.start();
    await walk(w, 3);
    w.storageFull(true);
    await w.at(3);
    expect(w.state()).toMatchObject({ phase: "paused", problem: "storage" });
    expect(w.state().totals.points).toBe(3);
    expect(w.watching()).toBe(false);
  });
});

describe("coming back to a recording that was cut off", () => {
  async function cutOff() {
    const first = world();
    await first.recorder.start();
    await walk(first, 3);
    // The tab is closed here: no stop, no save. A new page opens on the same device, 25 minutes after the start.
    const w = world({ store: first.store });
    await w.wait(1500);
    await w.recorder.init();
    return { w, id: first.state().id! };
  }

  it("offers it back, counted from the points that are on the device", async () => {
    const { w, id } = await cutOff();
    expect(w.state().phase).toBe("idle");
    expect(w.state().unfinished).toMatchObject({ id, startedAt: T0, totals: { points: 3, distanceMeters: 22.2, lastTime: T0 + 20_000 } });
    // Nothing is sent, started or removed until the person says which.
    expect(w.sent).toEqual([]);
    expect(w.watching()).toBe(false);
    expect(w.store.rows.get(id)).toHaveLength(3);
    // Starting another is not possible until this one is settled.
    expect(await w.recorder.start()).toBe("busy");
  });

  it("continues it as a new stretch, and writes down the time that was not recorded", async () => {
    const { w, id } = await cutOff();
    expect(await w.recorder.continueUnfinished()).toBe("started");
    expect(w.state()).toMatchObject({ phase: "recording", id, unfinished: null });
    // From the last point that was kept (20 s in) to the moment it was taken up again.
    expect(w.state().interruptions).toEqual([{ from: T0 + 20_000, to: T0 + 1_500_000 }]);
    await walk(w, 2, 200);
    expect(w.store.rows.get(id)!.map((row) => row.segment)).toEqual([0, 0, 0, 1, 1]);
    expect(w.state().totals).toMatchObject({ points: 5, distanceMeters: 33.4 });
    // The line drawn is the whole recording, not only what came after the reload.
    expect(w.recorder.displayLines().map((line) => line.length)).toEqual([3, 2]);
  });

  it("saves what there is", async () => {
    const { w, id } = await cutOff();
    await w.recorder.finishUnfinished();
    expect(w.state()).toMatchObject({ phase: "stopped", id, unfinished: null });
    expect(await w.recorder.save("What there was", "teal")).toMatchObject({ state: "saved" });
    expect(w.sent[0]!.gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(w.store.metas.size).toBe(0);
  });

  it("discards it only when told to", async () => {
    const { w, id } = await cutOff();
    await w.recorder.discardUnfinished();
    expect(w.state().unfinished).toBeNull();
    expect(w.store.metas.has(id)).toBe(false);
    expect(w.store.rows.has(id)).toBe(false);
  });

  it("does not offer one that another tab is recording right now", async () => {
    const first = world();
    await first.recorder.start();
    await walk(first, 2);
    const other = world({ store: first.store, lockHeld: true });
    await other.recorder.init();
    expect(other.state()).toMatchObject({ unfinished: null, elsewhere: true });
  });

  it("quietly forgets one that never got a position", async () => {
    const first = world();
    await first.recorder.start();
    const w = world({ store: first.store });
    await w.recorder.init();
    expect(w.state().unfinished).toBeNull();
    expect(w.store.metas.size).toBe(0);
  });
});

describe("saving when Outpost is out of reach", () => {
  async function recorded(w: ReturnType<typeof world>, name = "Evening round") {
    await w.recorder.start();
    await walk(w, 3);
    const id = w.state().id!;
    await w.recorder.stop();
    return { id, outcome: await w.recorder.save(name, "teal") };
  }

  it("keeps the recording on the device, says it is waiting, and sends it when Outpost is back", async () => {
    const w = world();
    const saved: TrackDto[] = [];
    w.recorder.onSaved((track) => saved.push(track));
    w.outOfReach();
    const { id, outcome } = await recorded(w);
    expect(outcome).toEqual({ state: "waiting" });
    expect(w.state().phase).toBe("idle");
    expect(w.state().pending).toMatchObject([{ id, name: "Evening round", state: "waiting", totals: { points: 3 } }]);
    // Every point is still on the device, under the name it was given.
    expect(w.store.rows.get(id)).toHaveLength(3);
    expect(w.store.metas.get(id)).toMatchObject({ status: "queued", name: "Evening round" });

    // It is tried again after 5 s, then 15 s, then 30 s, then every minute, for as long as it takes.
    for (const delay of [...RETRY_DELAYS_MS, 60_000, 60_000]) {
      await w.wait(delay / 1000);
      expect(w.state().pending).toMatchObject([{ id, state: "waiting" }]);
      expect(w.store.rows.get(id)).toHaveLength(3);
    }
    expect(w.sent).toEqual([]);

    w.backInReach();
    await w.wait(60);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toMatchObject({ id, name: "Evening round" });
    expect(saved.map((track) => track.id)).toEqual([id]);
    expect(w.state().pending).toEqual([]);
    expect(w.store.metas.size).toBe(0);
    expect(w.store.rows.size).toBe(0);
    // Nothing is left ticking once there is nothing to send.
    expect(w.timers()).toBe(0);
  });

  it("sends at once when the network comes back or the page is looked at again, without waiting its turn", async () => {
    const w = world();
    w.outOfReach();
    const { id } = await recorded(w);
    w.backInReach();
    await w.online();
    expect(w.sent.map((item) => item.id)).toEqual([id]);

    const again = world();
    again.outOfReach();
    await recorded(again);
    again.backInReach();
    await again.hide();
    await again.show();
    expect(again.sent).toHaveLength(1);
  });

  it("is still waiting after the page is closed and opened again, and is sent then", async () => {
    const first = world();
    first.outOfReach();
    const { id } = await recorded(first);
    // A new page on the same device, with Outpost back.
    const w = world({ store: first.store });
    await w.recorder.init();
    await w.settle();
    expect(w.sent.map((item) => item.id)).toEqual([id]);
    expect(w.state().pending).toEqual([]);
    expect(w.store.metas.size).toBe(0);
  });

  it("lets another recording be made while one waits, and sends both", async () => {
    const w = world();
    w.outOfReach();
    const one = await recorded(w, "Morning");
    await w.wait(1);
    const two = await recorded(w, "Afternoon");
    expect(one.id).not.toBe(two.id);
    expect(w.state().pending.map((entry) => entry.name)).toEqual(["Morning", "Afternoon"]);
    w.backInReach();
    await w.recorder.retryNow();
    expect(w.sent.map((item) => item.name)).toEqual(["Morning", "Afternoon"]);
    expect(w.store.metas.size).toBe(0);
  });

  it("keeps a recording Outpost refuses, with what it said, until it is sent again or discarded", async () => {
    const w = world();
    w.refuses("That recording has 150,001 points, and one recording can hold at most 150,000.");
    const { id, outcome } = await recorded(w);
    expect(outcome).toEqual({
      state: "refused",
      message: "That recording has 150,001 points, and one recording can hold at most 150,000.",
    });
    expect(w.state().pending).toMatchObject([{ id, state: "refused", message: expect.stringContaining("150,001 points") }]);
    expect(w.store.metas.get(id)).toMatchObject({ status: "refused" });
    expect(w.store.rows.get(id)).toHaveLength(3);
    // A refusal is not tried again by itself: the same thing would be refused the same way.
    expect(w.timers()).toBe(0);
    await w.wait(600);
    expect(w.sent).toEqual([]);

    // It can still be got off the device as a file.
    const file = await w.recorder.gpxFile(id, "fallback");
    expect(file).toMatchObject({ filename: "Evening round.gpx", points: 3 });
    expect(file!.gpx).toContain("<name>Evening round</name>");

    w.backInReach();
    expect(await w.recorder.retryRefused(id)).toMatchObject({ state: "saved" });
    expect(w.store.metas.size).toBe(0);
  });

  it("discards a waiting recording only when told to", async () => {
    const w = world();
    w.outOfReach();
    const { id } = await recorded(w);
    await w.recorder.discardPending(id);
    expect(w.state().pending).toEqual([]);
    expect(w.store.metas.size).toBe(0);
    expect(w.store.rows.size).toBe(0);
    expect(w.timers()).toBe(0);
  });
});
