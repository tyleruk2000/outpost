import type { PointHeight } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type GroundHeight, HeightReader, KEPT_ANSWERS, REST_MS } from "./ground-height";
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

describe("reading the height of the ground once the point has rested", () => {
  it("asks nothing while the point moves, and once a quarter of a second after it stops", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    // Forty moves, 10 ms apart: a pointer swept across the map.
    for (let index = 0; index < 40; index += 1) {
      reader.want({ lat: 54.5, lon: -3.5 + index * 0.001 });
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(server.asked).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(REST_MS - 11);
    expect(server.asked).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.asked).toHaveLength(1);
    // Asked for to four places of a degree: about 11 m.
    expect(server.asked[0]!.at).toEqual({ lat: 54.5, lon: -3.461 });
    expect(last()).toEqual({ state: "reading" });
    server.asked[0]!.answer(312.4);
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toEqual({ state: "known", meters: 312.4, cellMeters: 38.2 });
  });

  it("calls off a request that a newer point has made pointless, and never shows its answer", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    reader.want({ lat: 54.5, lon: -3.5 });
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(server.asked).toHaveLength(1);
    reader.want({ lat: 54.6, lon: -3.5 });
    expect(server.asked[0]!.signal.aborted).toBe(true);
    // Moving clears the figure at once: the readout never shows the height of the last place for this one.
    expect(last()).toEqual({ state: "idle" });
    server.asked[0]!.answer(312);
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(server.asked).toHaveLength(2);
    expect(shown.some((reading) => reading.state === "known")).toBe(false);
    server.asked[1]!.answer(80);
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ state: "known", meters: 80 });
  });

  it("keeps the last answers, so going back over the same ground asks nothing", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    for (const lon of [-3.5, -3.4]) {
      reader.want({ lat: 54.5, lon });
      await vi.advanceTimersByTimeAsync(REST_MS);
      server.asked.at(-1)!.answer(lon === -3.5 ? 312 : null);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(last()).toEqual({ state: "none" });
    // Back to the first place, a few metres off: the same to four places.
    reader.want({ lat: 54.50001, lon: -3.50002 });
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(server.asked).toHaveLength(2);
    expect(last()).toMatchObject({ state: "known", meters: 312 });
    // "No terrain here" is kept too.
    reader.want({ lat: 54.5, lon: -3.4 });
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(server.asked).toHaveLength(2);
    expect(last()).toEqual({ state: "none" });
  });

  it("keeps only the last few answers", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    for (let index = 0; index <= KEPT_ANSWERS; index += 1) {
      reader.want({ lat: 50 + index * 0.01, lon: 0 });
      await vi.advanceTimersByTimeAsync(REST_MS);
      server.asked.at(-1)!.answer(index);
      await vi.advanceTimersByTimeAsync(0);
    }
    // The first has gone; the second is still there.
    reader.want({ lat: 50.01, lon: 0 });
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(server.asked).toHaveLength(KEPT_ANSWERS + 1);
    reader.want({ lat: 50, lon: 0 });
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(server.asked).toHaveLength(KEPT_ANSWERS + 2);
  });

  it("stops waiting and calls off what is under way when told to stop", async () => {
    const server = fakeServer();
    const reader = new HeightReader(server.ask, (reading) => shown.push(reading));
    reader.want({ lat: 54.5, lon: -3.5 });
    reader.stop();
    await vi.advanceTimersByTimeAsync(REST_MS * 4);
    expect(server.asked).toHaveLength(0);
    reader.want({ lat: 54.5, lon: -3.5 });
    await vi.advanceTimersByTimeAsync(REST_MS);
    reader.stop({ state: "none" });
    expect(server.asked[0]!.signal.aborted).toBe(true);
    expect(last()).toEqual({ state: "none" });
  });

  it("says a request failed, without a figure", async () => {
    const reader = new HeightReader(
      () => Promise.reject(new Error("offline")),
      (reading) => shown.push(reading),
    );
    reader.want({ lat: 54.5, lon: -3.5 });
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(last()).toEqual({ state: "failed" });
  });
});
