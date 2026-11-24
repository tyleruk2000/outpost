import { describe, expect, it } from "vitest";
import { detailChoices, detailLabel } from "./detail";

describe("the detail levels offered for a map", () => {
  it("offers each name once, keeping the area's recommended level where two zooms share a name", () => {
    // Zoom 10 and 11 are both "Roads and towns": with 11 recommended (as for the United Kingdom), 10 goes.
    expect(detailChoices(11)).toEqual([11, 12, 14, 15]);
    const names = detailChoices(11).map(detailLabel);
    expect(new Set(names).size).toBe(names.length);
  });

  it("offers the standard four when nothing is recommended, or the recommended level is one of them", () => {
    expect(detailChoices(undefined)).toEqual([10, 12, 14, 15]);
    expect(detailChoices(12)).toEqual([10, 12, 14, 15]);
  });

  it("adds a recommended level with a name of its own", () => {
    expect(detailChoices(8)).toEqual([8, 10, 12, 14, 15]);
    expect(detailChoices(8).map(detailLabel)).toEqual([
      "Main roads and large towns",
      "Roads and towns",
      "Villages and tracks",
      "Footpaths and buildings",
      "Everything",
    ]);
  });
});
