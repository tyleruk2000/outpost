/**
 * A map of a part of a country (Kent, England) is of the part: its own box and name, and never
 * the country's ready-made map, whose box is the whole country.
 */
import type { MapRegionPresetStatus } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { mapAreaOf, presetFor } from "./add-map-data";

const preset = (id: string, name: string, bbox: [number, number, number, number]): MapRegionPresetStatus => ({
  id,
  name,
  group: "Britain and Ireland",
  bbox,
  recommendedMaxZoom: 12,
  installed: false,
  collectionIds: [],
  downloadId: null,
});
const PRESETS = [
  preset("united-kingdom", "United Kingdom", [-8.65, 49.85, 1.77, 60.86]),
  preset("england", "England", [-6.45, 49.85, 1.77, 55.82]),
  preset("country-fr", "France", [-5, 41, 10, 51]),
];
const KENT_BOX: [number, number, number, number] = [0.03, 50.9, 1.45, 51.5];
const part = (name: string, regionId: string, bbox: [number, number, number, number]) => ({
  type: "country" as const,
  code: "GB",
  name,
  countryName: "United Kingdom",
  regionId: "united-kingdom",
  part: { regionId, name },
  bbox,
});

describe("a map of a part of a country", () => {
  it("takes the ready-made area of the part's own name, and never the country's", () => {
    expect(presetFor(part("England", "england", [-8.65, 49.85, 1.77, 60.86]), PRESETS)?.id).toBe("england");
    expect(presetFor(part("Kent", "kent", KENT_BOX), PRESETS)).toBeNull();
    // The whole country still has its own.
    expect(presetFor({ ...part("United Kingdom", "", KENT_BOX), part: null, countryName: null }, PRESETS)?.id).toBe("united-kingdom");
  });

  it("is named for the part, and is not said to be the country's ready-made map", () => {
    const kent = part("Kent", "kent", KENT_BOX);
    expect(mapAreaOf(kent, presetFor(kent, PRESETS))).toEqual({ name: "Kent", regionId: undefined });
    const england = part("England", "england", KENT_BOX);
    expect(mapAreaOf(england, presetFor(england, PRESETS))).toEqual({ name: "England", regionId: "england" });
    const france = { type: "country" as const, code: "FR", name: "France", countryName: null, regionId: "france", part: null, bbox: null };
    expect(mapAreaOf(france, presetFor(france, PRESETS))).toEqual({ name: "France", regionId: "country-fr" });
  });
});
