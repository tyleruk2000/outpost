import { afterEach, describe, expect, it, vi } from "vitest";
import { pressWord, touchScreen } from "./press";

afterEach(() => vi.unstubAllGlobals());

const pointer = (coarse: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: coarse && query === "(pointer: coarse)", media: query }) as MediaQueryList);

describe("the word for pressing the map", () => {
  it("says tap, never click, on a touch screen", () => {
    pointer(true);
    expect(touchScreen()).toBe(true);
    expect(pressWord()).toBe("Tap");
    expect(pressWord(true)).toBe("tap");
  });
  it("says click or tap with a mouse", () => {
    pointer(false);
    expect(pressWord()).toBe("Click or tap");
    expect(pressWord(true)).toBe("click or tap");
  });
});
