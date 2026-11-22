/** The colour the shading pictures are painted in follows the night style (outpost-oyny). */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setNightShading, useShadeColour } from "./hooks";
import { FALLBACK_NIGHT, FALLBACK_THEME } from "./lib/palette";

describe("the shading's colour", () => {
  afterEach(() => setNightShading(false));

  it("is the theme's range and walk, and the night reds while the map is in the night style", () => {
    const range = renderHook(() => useShadeColour("range"));
    const walk = renderHook(() => useShadeColour("walk"));
    expect(range.result.current).toBe(FALLBACK_THEME.light.range);
    act(() => setNightShading(true));
    expect(range.result.current).toBe(FALLBACK_NIGHT.range);
    expect(walk.result.current).toBe(FALLBACK_NIGHT.walk);
    act(() => setNightShading(false));
    expect(range.result.current).toBe(FALLBACK_THEME.light.range);
  });
});
