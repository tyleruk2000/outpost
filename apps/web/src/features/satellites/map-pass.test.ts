import type { SatelliteElements } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { predictPasses } from "./engine";
import { chosenBounds, passFromParams, satelliteFeatures, satelliteMapLink } from "./map";
import { passSpanHours, spanWords } from "./satellites-page";
import { ESHAIL, FUNCUBE, ISS_ORBIT } from "./test-orbits";
import { satelliteMatches } from "./words";

const asKept = (orbit: typeof ISS_ORBIT, name: string, groups: SatelliteElements["groups"]): SatelliteElements =>
  ({ ...orbit, name, designator: null, groups }) as unknown as SatelliteElements;
const ISS_KEPT = asKept(ISS_ORBIT, "ISS (ZARYA)", ["stations"]);
const QO100 = asKept(ESHAIL, "ES'HAIL 2", ["amateur"]);
const AO73 = asKept(FUNCUBE, "FUNCUBE-1 (AO-73)", ["amateur"]);
const KESWICK = { lat: 54.6, lon: -3.13 };
const AT = new Date(Date.parse("2026-11-22T12:00:00Z"));

describe("finding a satellite by name", () => {
  it("matches words of the name from their start, not letters inside them", () => {
    expect(satelliteMatches("ISS (ZARYA)", 25544, "ISS")).toBe(true);
    expect(satelliteMatches("SWISSCUBE", 35932, "ISS")).toBe(false);
    expect(satelliteMatches("FUNCUBE-1 (AO-73)", 39444, "ao-73")).toBe(true);
    expect(satelliteMatches("AO-07", 7530, "AO7")).toBe(true);
    expect(satelliteMatches("AO-07", 7530, "ao 7")).toBe(true);
    expect(satelliteMatches("ISS (ZARYA)", 25544, "255")).toBe(true);
    expect(satelliteMatches("ISS (ZARYA)", 25544, "")).toBe(true);
  });
});

describe("the One satellite tab's reach", () => {
  it("is a day, or long enough to hold a pass opened from a longer list", () => {
    const from = AT.getTime();
    expect(passSpanHours(from, null)).toBe(24);
    expect(passSpanHours(from, from + 3 * 3_600_000)).toBe(24);
    const later = passSpanHours(from, from + 50 * 3_600_000);
    expect(later).toBeGreaterThanOrEqual(51);
    expect(spanWords(later)).toBe("3 days");
    expect(passSpanHours(from, from + 30 * 24 * 3_600_000)).toBe(7 * 24 + 2);
  });

  it("finds the pass pressed two days ahead when the list reaches that far", () => {
    const passes = predictPasses(ISS_KEPT, KESWICK, AT, 72, 40);
    const far = passes.find((pass) => pass.aos.getTime() - AT.getTime() > 48 * 3_600_000);
    expect(far).toBeDefined();
    const within = predictPasses(ISS_KEPT, KESWICK, AT, passSpanHours(AT.getTime(), far!.aos.getTime()), 60);
    expect(within.some((pass) => Math.abs(pass.aos.getTime() - far!.aos.getTime()) < 60_000)).toBe(true);
  });
});

describe("Show on the map", () => {
  it("carries the pass and its place in the address, and reads them back", () => {
    const link = satelliteMapLink(25544, { aos: 1_800_000_000_000, from: KESWICK, place: "Keswick" });
    const params = new URL(link, "http://outpost.local").searchParams;
    expect(params.get("satellite")).toBe("25544");
    expect(passFromParams(params)).toEqual({ aos: 1_800_000_000_000, from: { lat: 54.6, lon: -3.13 }, place: "Keswick" });
    expect(passFromParams(new URLSearchParams("satellite=25544"))).toBeNull();
    expect(passFromParams(new URLSearchParams("satellite=1&aos=5&from=200,0"))).toBeNull();
  });

  it("shades only the chosen satellite's footprint, so overlapping footprints never darken the map", () => {
    const collection = satelliteFeatures([ISS_KEPT, QO100, AO73], AT, KESWICK, 39444, true);
    const footprints = collection.features.filter((feature) => feature.properties?.kind === "footprint");
    expect(footprints.length).toBeGreaterThan(0);
    const shaded = footprints.filter((feature) => feature.properties?.chosen === true);
    expect(shaded).toHaveLength(1);
  });

  it("draws and fits the pass handed over, from its place, not the next one over Home", () => {
    const pass = predictPasses(AO73, KESWICK, new Date(AT.getTime() + 30 * 3_600_000), 24, 1)[0]!;
    const handed = { aos: pass.aos.getTime(), from: KESWICK, place: "Keswick" };
    const collection = satelliteFeatures([AO73], AT, { lat: 51.5, lon: -0.12 }, 39444, true, handed);
    const labels = collection.features.map((feature) => feature.properties?.label).filter(Boolean);
    expect(labels.some((label) => String(label).startsWith("Rises over Keswick"))).toBe(true);
    const box = chosenBounds(AO73, AT, { lat: 51.5, lon: -0.12 }, handed)!;
    // The box holds Keswick and is no wider than the pass: not the world at zoom 1.8.
    expect(box[0]).toBeLessThan(KESWICK.lon);
    expect(box[2]).toBeGreaterThan(KESWICK.lon);
    expect(box[2] - box[0]).toBeLessThan(80);
  });
});
