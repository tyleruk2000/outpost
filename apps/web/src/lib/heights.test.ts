import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatHeight as formatMapHeight } from "@/features/maps/lib/geo";
import { formatMeters } from "@/features/maps/radio/sight";
import { formatHeight as formatAerial } from "@/features/repeaters/map/range";
import { FEET_PER_METRE, formatHeight, heightText, heightUnit, setHeightUnit, useHeightUnit } from "./heights";

afterEach(() => setHeightUnit("m"));

describe("a height, written", () => {
  it("in metres, the ground to the nearest metre", () => {
    expect(heightText(312.4, "m")).toBe("312 m");
    expect(heightText(312.5, "m")).toBe("313 m");
    expect(heightText(1046, "m")).toBe("1,046 m");
    expect(heightText(0, "m")).toBe("0 m");
    expect(heightText(-0.3, "m")).toBe("0 m");
    expect(heightText(-12, "m")).toBe("-12 m");
  });

  it("in feet, the ground to the nearest 5 feet", () => {
    // 312 m is 1,023.6 ft: 1,025 to the nearest 5.
    expect(heightText(312, "ft")).toBe("1,025 ft");
    // Ben Nevis, 1,345 m: 4,412.7 ft, so 4,415.
    expect(heightText(1345, "ft")).toBe("4,415 ft");
    expect(heightText(100, "ft")).toBe("330 ft");
    expect(heightText(0.5, "ft")).toBe("0 ft");
    expect(heightText(-12, "ft")).toBe("-40 ft");
    expect(FEET_PER_METRE).toBeCloseTo(3.28084, 5);
  });

  it("a height above the ground to the decimetre under 10 m, or to the foot", () => {
    expect(heightText(4.5, "m", "fine")).toBe("4.5 m");
    expect(heightText(4, "m", "fine")).toBe("4 m");
    expect(heightText(9.96, "m", "fine")).toBe("10 m");
    expect(heightText(15.4, "m", "fine")).toBe("15 m");
    expect(heightText(4.5, "ft", "fine")).toBe("15 ft");
    expect(heightText(10, "ft", "fine")).toBe("33 ft");
  });

  it("in the unit chosen on this device, kept in this browser, metres to begin with", () => {
    expect(heightUnit()).toBe("m");
    expect(formatHeight(312)).toBe("312 m");
    setHeightUnit("ft");
    expect(localStorage.getItem("outpost.heights")).toBe("ft");
    expect(formatHeight(312)).toBe("1,025 ft");
    setHeightUnit("m");
    expect(localStorage.getItem("outpost.heights")).toBe("m");
  });

  it("is the one formatter the map screens use: the readout and profiles, the line of sight and the repeater card", () => {
    setHeightUnit("ft");
    expect(formatMapHeight(312)).toBe("1,025 ft");
    expect(formatMeters(-4.5)).toBe("15 ft");
    expect(formatAerial(10)).toBe("33 ft");
    setHeightUnit("m");
    expect(formatMapHeight(312)).toBe("312 m");
    expect(formatMeters(-4.5)).toBe("4.5 m");
    expect(formatAerial(10)).toBe("10 m");
  });

  it("draws a component again when the choice changes", () => {
    const { result } = renderHook(() => useHeightUnit());
    expect(result.current).toBe("m");
    act(() => setHeightUnit("ft"));
    expect(result.current).toBe("ft");
  });
});
