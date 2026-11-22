/** The range's shading on paper is painted again in the page's colours (outpost-1her). */
import type { SightRange } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShadePicture } from "../map/shades";

vi.mock("../map/shades", async (original) => ({ ...(await original<typeof import("../map/shades")>()), canShade: () => true }));

const { paperShades } = await import("./range-paper");

const picture = (colour: string): ShadePicture => ({
  width: 2,
  height: 2,
  pixels: new Uint8ClampedArray(16),
  coordinates: [
    [-3, 55],
    [-2, 55],
    [-2, 54],
    [-3, 54],
  ],
  // Which colour it was painted in, for the test to see.
  ...({ colour } as object),
});

describe("the range on paper", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ImageData",
      class {
        data: Uint8ClampedArray;
        constructor(data: Uint8ClampedArray) {
          this.data = data;
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ putImageData: () => {} } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,iVBORw0K");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("paints each range in the colour asked for, once for each colour", () => {
    const range = { at: { lat: 54.5, lon: -2.5 } } as SightRange;
    const paint = vi.fn((_range: SightRange, colour: string) => picture(colour));
    const first = paperShades([{ range }], "#13905a", paint);
    expect(first).toHaveLength(1);
    expect(first[0]!.url).toMatch(/^outpost-shade:\/\//);
    expect(first[0]!.opacity).toBe(0.55);
    expect(paint).toHaveBeenCalledWith(range, "#13905a", 1536);
    // Ticking another box asks again: the same picture, not painted again.
    expect(paperShades([{ range }], "#13905a", paint)[0]!.url).toBe(first[0]!.url);
    expect(paint).toHaveBeenCalledTimes(1);
    // Another colour is painted afresh.
    const other = paperShades([{ range }], "#0b7a49", paint);
    expect(other[0]!.url).not.toBe(first[0]!.url);
    expect(paint).toHaveBeenCalledTimes(2);
  });

  it("leaves out a range with nothing in sight", () => {
    expect(paperShades([{ range: {} as SightRange }], "#13905a", () => null)).toEqual([]);
  });
});
