import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounced } from "./use-debounced";

describe("useDebounced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with the first value, so words already typed are asked for at once", () => {
    const { result } = renderHook(() => useDebounced("knots", 200));
    expect(result.current).toBe("knots");
  });

  it("follows only once the value has stopped changing for the delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 200), { initialProps: { value: "" } });
    rerender({ value: "k" });
    act(() => vi.advanceTimersByTime(150));
    rerender({ value: "kn" });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe("kn");
  });

  it("leaves no timer behind when the component goes", () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebounced(value, 200), { initialProps: { value: 1 } });
    rerender({ value: 2 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
