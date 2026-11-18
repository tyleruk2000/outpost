import type { PointHeight } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type GroundHeight, HeightReader, KEPT_ANSWERS, PACE_MS, STALE_MS } from "./ground-height";
import type { LatLon } from "./lib/geo";

/** A server that answers when told to, and remembers what it was asked and what was called off. */
function fakeServer() {
  const asked: Array<{ at: LatLon; signal: AbortSignal; answer: (height: number | null) => void }> = [];
  const ask = (at: LatLon, signal: AbortSignal) =>
    new Promise<PointHeight>((resolve) => {
      asked.push({ at, signal, answer: (height) => resolve({ at, heightMeters: height, cellMeters: height === null ? null : 38.2 }) });
    });
  return { ask, asked };
}

let shown: GroundHeight[];
const last = () => shown.at(-1);

beforeEach(() => {
  vi.useFakeTimers();
  shown = [];
});
afterEach(() => vi.useRealTimers());

describe("reading the height of the ground as the point moves", () => {
  it("asks at once, then at a steady pace while the point moves: one request out at a time, always for the newest point", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    reader.want({ lat: 54.5, lon: -3.5 });
    // No waiting for the pointer to rest.
    expect(server.asked).toHaveLength(1);
    expect(last()).toEqual({ state: "reading" });
    // Forty moves, 10 ms apart: a pointer swept across the map, the server answering in 5 ms.
    for (let index = 1; index <= 40; index += 1) {
      reader.want({ lat: 54.5, lon: -3.5 + index * 0.001 });
      await vi.advanceTimersByTimeAsync(5);
      server.asked.at(-1)!.answer(300 + server.asked.length);
      await vi.advanceTimersByTimeAsync(5);
    }
    // 400 ms of movement: a request every tenth of a second, not one per movement.
    expect(server.asked.length).toBeGreaterThanOrEqual(4);
    expect(server.asked.length).toBeLessThanOrEqual(5);
    expect(server.asked.some((request) => request.signal.aborted)).toBe(false);
    // A figure was on show throughout, once the first answer came.
    expect(shown.slice(1).every((reading) => reading.state === "known")).toBe(true);
    // Once the point stops, the last request is for where it stopped, to four places of a degree: about 11 m.
    await vi.advanceTimersByTimeAsync(PACE_MS);
    expect(server.asked.at(-1)!.at).toEqual({ lat: 54.5, lon: -3.46 });
    server.asked.at(-1)!.answer(312.4);
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toEqual({ state: "known", meters: 312.4, cellMeters: 38.2 });
    const asked = server.asked.length;
    await vi.advanceTimersByTimeAsync(PACE_MS * 10);
    expect(server.asked).toHaveLength(asked);
  });

  it("keeps the last figure while the next is read, and takes it away if no answer comes", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    reader.want({ lat: 54.5, lon: -3.5 });
    server.asked[0]!.answer(312);
    await vi.advanceTimersByTimeAsync(PACE_MS);
    reader.want({ lat: 54.6, lon: -3.5 });
    expect(server.asked).toHaveLength(2);
    // No blink between one figure and the next.
    expect(last()).toMatchObject({ state: "known", meters: 312 });
    await vi.advanceTimersByTimeAsync(STALE_MS - 1);
    expect(last()).toMatchObject({ state: "known", meters: 312 });
    // A slow answer: the figure for the last place does not go on standing beside this one.
    await vi.advanceTimersByTimeAsync(1);
    expect(last()).toEqual({ state: "reading" });
    server.asked[1]!.answer(80);
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ state: "known", meters: 80 });
  });

  it("asks nothing for the same ground again", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    reader.want({ lat: 54.5, lon: -3.5 });
    // A few metres off: the same to four places.
    reader.want({ lat: 54.50001, lon: -3.50002 });
    server.asked[0]!.answer(312);
    await vi.advanceTimersByTimeAsync(PACE_MS * 3);
    reader.want({ lat: 54.5, lon: -3.5 });
    await vi.advanceTimersByTimeAsync(PACE_MS * 3);
    expect(server.asked).toHaveLength(1);
    expect(shown).toEqual([{ state: "reading" }, { state: "known", meters: 312, cellMeters: 38.2 }]);
  });

  it("keeps the last answers, so going back over the same ground asks nothing", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    for (const lon of [-3.5, -3.4]) {
      reader.want({ lat: 54.5, lon });
      await vi.advanceTimersByTimeAsync(PACE_MS);
      server.asked.at(-1)!.answer(lon === -3.5 ? 312 : null);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(last()).toEqual({ state: "none" });
    // Back to the first place, a few metres off: the same to four places, and shown at once.
    reader.want({ lat: 54.50001, lon: -3.50002 });
    expect(last()).toMatchObject({ state: "known", meters: 312 });
    await vi.advanceTimersByTimeAsync(PACE_MS);
    expect(server.asked).toHaveLength(2);
    // "No terrain here" is kept too.
    reader.want({ lat: 54.5, lon: -3.4 });
    await vi.advanceTimersByTimeAsync(PACE_MS);
    expect(server.asked).toHaveLength(2);
    expect(last()).toEqual({ state: "none" });
  });

  it("calls off a request when the point comes back to ground already known", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    reader.want({ lat: 54.5, lon: -3.5 });
    server.asked[0]!.answer(312);
    await vi.advanceTimersByTimeAsync(PACE_MS);
    reader.want({ lat: 54.6, lon: -3.5 });
    reader.want({ lat: 54.5, lon: -3.5 });
    expect(server.asked[1]!.signal.aborted).toBe(true);
    server.asked[1]!.answer(80);
    await vi.advanceTimersByTimeAsync(STALE_MS * 2);
    expect(last()).toMatchObject({ state: "known", meters: 312 });
  });

  it("keeps only the last few answers", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    for (let index = 0; index <= KEPT_ANSWERS; index += 1) {
      reader.want({ lat: 50 + index * 0.01, lon: 0 });
      await vi.advanceTimersByTimeAsync(PACE_MS);
      server.asked.at(-1)!.answer(index);
      await vi.advanceTimersByTimeAsync(0);
    }
    // The first has gone; the second is still there.
    reader.want({ lat: 50.01, lon: 0 });
    await vi.advanceTimersByTimeAsync(PACE_MS);
    expect(server.asked).toHaveLength(KEPT_ANSWERS + 1);
    reader.want({ lat: 50, lon: 0 });
    await vi.advanceTimersByTimeAsync(PACE_MS);
    expect(server.asked).toHaveLength(KEPT_ANSWERS + 2);
  });

  it("stops waiting and calls off what is under way when told to stop", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    reader.want({ lat: 54.5, lon: -3.5 });
    // A second point, waiting out the pace.
    reader.want({ lat: 54.6, lon: -3.5 });
    reader.stop({ state: "none" });
    expect(server.asked[0]!.signal.aborted).toBe(true);
    expect(last()).toEqual({ state: "none" });
    await vi.advanceTimersByTimeAsync(PACE_MS * 4);
    expect(server.asked).toHaveLength(1);
    // Nothing wanted is the same as stopping.
    reader.want({ lat: 54.5, lon: -3.5 });
    reader.want(null);
    expect(server.asked[1]!.signal.aborted).toBe(true);
    expect(last()).toEqual({ state: "idle" });
  });

  it("says a request failed, without a figure", async () => {
    const reader = new HeightReader(
      () => Promise.reject(new Error("offline")),
      (reading) => shown.push(reading),
    );
    reader.want({ lat: 54.5, lon: -3.5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toEqual({ state: "failed" });
  });
});
