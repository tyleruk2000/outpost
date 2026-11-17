import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { download } from "./test-support";
import { downloadsKey } from "./use-downloads";
import { detailKey, planKey, useDownloadDetail, useNow, usePlan, useThroughput } from "./use-plan";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Intervals set and not yet cleared: the query cache's own timers are left out of the count. */
let intervals: Set<number>;
const ticking = () => intervals.size;

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  vi.useFakeTimers();
  intervals = new Set();
  const set = window.setInterval.bind(window);
  const clear = window.clearInterval.bind(window);
  vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, ms?: number) => {
    const id = set(handler, ms);
    intervals.add(id);
    return id;
  }) as typeof window.setInterval);
  vi.spyOn(window, "clearInterval").mockImplementation(((id?: number) => {
    if (id !== undefined) intervals.delete(id);
    clear(id);
  }) as typeof window.clearInterval);
  client = new QueryClient();
  client.setQueryData(downloadsKey, { downloads: [download({ state: "running", bytesPerSecond: 1000 })] });
  setVisibility("visible");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("the speed readings", () => {
  it("are taken once a second while something is transferring", () => {
    const { result } = renderHook(() => useThroughput(true), { wrapper });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toHaveLength(4);
  });

  it("take one reading and stop when nothing is transferring", () => {
    const { result } = renderHook(() => useThroughput(false), { wrapper });
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toHaveLength(1);
    expect(ticking()).toBe(0);
  });

  it("stop while the page is hidden and start again when it is shown", () => {
    const { result } = renderHook(() => useThroughput(true), { wrapper });
    act(() => setVisibility("hidden"));
    const before = result.current.length;
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toHaveLength(before);
    expect(ticking()).toBe(0);
    act(() => setVisibility("visible"));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.length).toBe(before + 3);
  });
});

describe("the clock for countdowns", () => {
  it("does not tick while the page is hidden", () => {
    renderHook(() => useNow(1000), { wrapper });
    expect(ticking()).toBe(1);
    act(() => setVisibility("hidden"));
    expect(ticking()).toBe(0);
  });
});

describe("asking the server again while something is transferring", () => {
  beforeEach(() => {
    // Every request waits for ever: only the timers that would make them are looked at.
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
  });

  it("stops for one download's details while the page is hidden, and starts again when it is shown", () => {
    client.setQueryData(detailKey("d1"), { download: download({ id: "d1", state: "running" }) });
    renderHook(() => useDownloadDetail("d1"), { wrapper });
    expect(ticking()).toBe(1);
    act(() => setVisibility("hidden"));
    expect(ticking()).toBe(0);
    act(() => setVisibility("visible"));
    expect(ticking()).toBe(1);
  });

  it("stops for the plan while the page is hidden", () => {
    client.setQueryData(planKey, { counts: { active: 1, waiting: 0, paused: 0 } });
    renderHook(() => usePlan(), { wrapper });
    expect(ticking()).toBe(1);
    act(() => setVisibility("hidden"));
    expect(ticking()).toBe(0);
  });
});
