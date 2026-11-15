import { haversineMeters } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { measure } from "./measure";

const a = { lat: 53.0685, lon: -4.0763 };
const b = { lat: 53.0785, lon: -4.0763 };
const c = { lat: 53.0785, lon: -4.05 };

describe("measure", () => {
  it("is empty until there are two points", () => {
    expect(measure([])).toEqual({ legs: [], totalMeters: 0, lastBearing: null });
    expect(measure([a])).toEqual({ legs: [], totalMeters: 0, lastBearing: null });
  });

  it("measures each leg and keeps a running total", () => {
    const result = measure([a, b, c]);
    expect(result.legs).toHaveLength(2);
    expect(result.legs[0]!.meters).toBeCloseTo(haversineMeters(a.lat, a.lon, b.lat, b.lon), 6);
    // 0.01° of latitude is about 1.11 km anywhere.
    expect(result.legs[0]!.meters).toBeCloseTo(1112, 0);
    expect(result.legs[0]!.totalMeters).toBe(result.legs[0]!.meters);
    expect(result.legs[1]!.totalMeters).toBeCloseTo(result.legs[0]!.meters + result.legs[1]!.meters, 6);
    expect(result.totalMeters).toBe(result.legs[1]!.totalMeters);
  });

  it("gives the bearing of each leg and of the last one", () => {
    const result = measure([a, b, c]);
    expect(result.legs[0]!.bearing).toBeCloseTo(0, 3);
    expect(result.legs[1]!.bearing).toBeCloseTo(90, 0);
    expect(result.lastBearing).toBe(result.legs[1]!.bearing);
  });

  it("counts a point clicked twice as a leg of no length", () => {
    const result = measure([a, a]);
    expect(result.totalMeters).toBe(0);
    expect(result.legs).toHaveLength(1);
  });
});
