/**
 * What reading a source file is allowed in the database, as an upper bound: the server reserves
 * room by it (an estimate's databaseBytes) and Add a place shows each kind's "up to". Checked
 * against Monaco's real extract of 16 November 2026, which the figures were worked out from
 * (708,123 bytes: 84 places of food and supplies, 23 of the five point layers between them).
 * The made-up extracts of the stand-ins are a few hundred bytes with a place or two: no measure
 * of a real file's density, so not used here.
 */
import { databaseAllowance, layerAllowance } from "@outpost/shared";
import { describe, expect, it } from "vitest";

const BYTES_PER_RECORD = 700;
const MONACO = { bytes: 708_123, food: 84, points: 23 };
const POINT_LAYERS = ["hospitals", "emergency", "shelters", "military", "nuclear"];

describe("the database allowance for a source file", () => {
  it("is never less than Monaco's real places took, for any one kind or all of them", () => {
    expect(layerAllowance(MONACO.bytes, "food")).toBeGreaterThanOrEqual(MONACO.food * BYTES_PER_RECORD);
    // Any one point layer could hold all 23: each kind's "up to" covers them all.
    for (const layer of POINT_LAYERS) expect(layerAllowance(MONACO.bytes, layer)).toBeGreaterThanOrEqual(MONACO.points * BYTES_PER_RECORD);
    expect(databaseAllowance(MONACO.bytes, [...POINT_LAYERS, "food"])).toBeGreaterThanOrEqual(
      (MONACO.food + MONACO.points) * BYTES_PER_RECORD,
    );
  });

  it("reserves as much for one point layer as for the five together, as before", () => {
    const france = 4_900_000_000;
    expect(databaseAllowance(france, ["hospitals"])).toBe(databaseAllowance(france, POINT_LAYERS));
    // France's hospitals: about 120 MB, not a fifth of it.
    expect(layerAllowance(france, "hospitals")).toBeGreaterThan(100_000_000);
    expect(databaseAllowance(france, ["hospitals", "food"])).toBe(layerAllowance(france, "hospitals") + layerAllowance(france, "food"));
  });
});
