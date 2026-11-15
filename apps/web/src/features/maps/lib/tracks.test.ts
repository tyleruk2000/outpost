import { describe, expect, it } from "vitest";
import { formatBuild, trackFacts, trackSummary } from "./tracks";

describe("track figures", () => {
  it("summarises a track for a list row", () => {
    expect(trackSummary({ distanceMeters: 17_432, ascentMeters: 1045.6 })).toBe("17.4 km, 1,046 m of ascent");
    expect(trackSummary({ distanceMeters: 850, ascentMeters: null })).toBe("850 m");
  });

  it("lists distance with miles, ascent and points", () => {
    expect(trackFacts({ distanceMeters: 20_921, ascentMeters: 838, pointCount: 13 })).toEqual([
      { label: "Distance", value: "20.9 km (13.0 mi)" },
      { label: "Ascent", value: "838 m" },
      { label: "Points", value: "13 points" },
    ]);
  });

  it("says plainly when a file has no heights", () => {
    expect(trackFacts({ distanceMeters: 640, ascentMeters: null, pointCount: 1 })).toEqual([
      { label: "Distance", value: "640 m (0.40 mi)" },
      { label: "Ascent", value: "No heights in this file" },
      { label: "Points", value: "1 point" },
    ]);
  });

  it("reads a build stamp as a date", () => {
    expect(formatBuild("20261115")).toBe("15 Nov 2026");
    expect(formatBuild(null)).toBeNull();
    expect(formatBuild("nightly")).toBe("nightly");
  });
});
