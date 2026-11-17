import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isPageVisible, usePageVisible } from "./page-visible";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("usePageVisible", () => {
  afterEach(() => setVisibility("visible"));

  it("is true while the page can be seen and false while it is hidden", () => {
    const { result } = renderHook(() => usePageVisible());
    expect(result.current).toBe(true);
    act(() => setVisibility("hidden"));
    expect(result.current).toBe(false);
    expect(isPageVisible()).toBe(false);
    act(() => setVisibility("visible"));
    expect(result.current).toBe(true);
  });

  it("reads a page that is already hidden when it mounts", () => {
    setVisibility("hidden");
    const { result } = renderHook(() => usePageVisible());
    expect(result.current).toBe(false);
  });

  it("stops listening when the component goes", () => {
    const { result, unmount } = renderHook(() => usePageVisible());
    unmount();
    setVisibility("hidden");
    expect(result.current).toBe(true);
  });
});
