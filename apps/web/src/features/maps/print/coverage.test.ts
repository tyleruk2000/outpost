import type { Bbox, InstalledRegion } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { coverageWarning, mapCoverage, tileZoomFor } from "./coverage";

type Region = Pick<InstalledRegion, "bounds" | "maxZoom" | "tileType" | "available" | "status">;
const region = (bounds: Bbox, maxZoom: number, extra: Partial<Region> = {}): Region => ({
  bounds,
  maxZoom,
  tileType: "vector",
  available: true,
  status: "installed",
  ...extra,
});

/** A page on the equator, where a degree is the same on the map in both directions to within a hair. */
const page: Bbox = [0, 0, 1, 1];

describe("what the installed maps cover of a page", () => {
  it("asks for the whole zoom below the camera's, and never past 15", () => {
    expect(tileZoomFor(13.09)).toBe(13);
    expect(tileZoomFor(12.999)).toBe(12);
    expect(tileZoomFor(17.2)).toBe(15);
  });

  it("is everything when a deep enough region holds the page", () => {
    const coverage = mapCoverage(page, [region([-1, -1, 2, 2], 14)], 13.1);
    expect(coverage).toMatchObject({ neededZoom: 13, full: 1, coarser: 0, none: 0, coarserZoom: null });
    expect(coverageWarning(coverage, true)).toBeNull();
  });

  it("is nothing with no region there, and says only the outline would print", () => {
    const coverage = mapCoverage(page, [region([10, 10, 11, 11], 14)], 13.1);
    expect(coverage.none).toBe(1);
    expect(coverageWarning(coverage, true)?.title).toBe("No detailed map is installed for this area");
    expect(coverageWarning(mapCoverage(page, [], 13.1), false)?.detail).toMatch(/only the outline of the world/);
  });

  it("measures the part covered, counting overlapping regions once", () => {
    // The west half to zoom 14, twice over, and the world overview to zoom 6 under everything.
    const coverage = mapCoverage(page, [region([-180, -85, 180, 85], 6), region([0, -1, 0.5, 2], 14), region([0.25, 0, 0.5, 1], 15)], 13.1);
    expect(coverage.full).toBeCloseTo(0.5, 6);
    expect(coverage.coarser).toBeCloseTo(0.5, 6);
    expect(coverage.none).toBeCloseTo(0, 6);
    expect(coverage.coarserZoom).toBe(6);
    const warning = coverageWarning(coverage, true)!;
    expect(warning.title).toBe("Part of this page will lack detail");
    expect(warning.detail).toMatch(/About 50% of this area is kept in less detail than this scale needs/);
  });

  it("tells apart the part with a coarser map and the part with none", () => {
    const coverage = mapCoverage(page, [region([0, 0, 0.25, 1], 10), region([0.25, 0, 0.75, 1], 13)], 13.4);
    expect(coverage.full).toBeCloseTo(0.5, 6);
    expect(coverage.coarser).toBeCloseTo(0.25, 6);
    expect(coverage.none).toBeCloseTo(0.25, 6);
    expect(coverageWarning(coverage, true)?.detail).toMatch(
      /^About 25% of this area has no detailed map installed and will show only an outline; about 25% of it is kept in less detail than this scale needs/,
    );
  });

  it("leaves out regions that cannot be read, and terrain when asked about the map", () => {
    const regions = [
      region([-1, -1, 2, 2], 14, { available: false }),
      region([-1, -1, 2, 2], 14, { status: "missing" }),
      region([-1, -1, 2, 2], 12, { tileType: "terrain" }),
    ];
    expect(mapCoverage(page, regions, 13.1).none).toBe(1);
    expect(mapCoverage(page, regions, 12.5, "terrain").full).toBe(1);
  });

  it("does not warn about a sliver along an edge", () => {
    const coverage = mapCoverage(page, [region([0.01, 0, 1, 1], 14)], 13.1);
    expect(coverage.none).toBeCloseTo(0.01, 6);
    expect(coverageWarning(coverage, true)).toBeNull();
  });
});
