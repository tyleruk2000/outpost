/**
 * The small sums of the HF planner: bands, units, the geometry of a steep path, and the
 * distance and bearing of a path. The expected values are worked by hand or read from
 * VOACAP's own printed listing, and say which.
 */
import fs from "node:fs";
import path from "node:path";
import {
  bandOf,
  dbwToDbm,
  dbwToWatts,
  HF_BANDS,
  haversineMeters,
  initialBearingDeg,
  modeById,
  NOISE_ENVIRONMENTS,
  OPERATING_MODES,
  type PredictionHour,
  rankBands,
  secantLawMhz,
  sMeter,
  snrInBandwidth,
  snrInOneHertz,
  steepPathGeometry,
  utcLabel,
  wattsToDbw,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

describe("distance and bearing", () => {
  // VOACAP's listing for the acceptance circuit prints, in its header line,
  // "51.51 N 0.13 W - 52.49 N 1.89 W   312.82  131.43   87.7   162.4": bearings each way, nautical miles, kilometres.
  const header = fs
    .readFileSync(path.join(import.meta.dirname, "fixtures/propagation/london-birmingham.voacapl.out"), "utf8")
    .split("\n")
    .find((line) => line.includes("51.51 N") && line.includes("52.49 N"))!
    .trim()
    .split(/\s+/);
  const [bearing, back, , km] = header.slice(-4).map(Number);
  const london = { lat: 51.51, lon: -0.13 };
  const birmingham = { lat: 52.49, lon: -1.89 };

  it("agree with what VOACAP prints for the same two points", () => {
    expect(bearing).toBe(312.82);
    expect(km).toBe(162.4);
    // Outpost and VOACAP use spheres of slightly different radius: within half a kilometre.
    expect(Math.abs(haversineMeters(london.lat, london.lon, birmingham.lat, birmingham.lon) / 1000 - km!)).toBeLessThan(0.5);
    expect(Math.abs(initialBearingDeg(london, birmingham) - bearing!)).toBeLessThan(0.1);
    expect(Math.abs(initialBearingDeg(birmingham, london) - back!)).toBeLessThan(0.1);
  });

  it("gives the cardinal bearings", () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 6);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 6);
    expect(initialBearingDeg({ lat: 10, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(180, 6);
    expect(initialBearingDeg({ lat: 0, lon: 10 }, { lat: 0, lon: 0 })).toBeCloseTo(270, 6);
  });
});

describe("power and ratios", () => {
  it("turns watts into decibels and back", () => {
    expect(wattsToDbw(1)).toBe(0);
    expect(wattsToDbw(5)).toBeCloseTo(6.99, 2);
    expect(wattsToDbw(1000)).toBeCloseTo(30, 10);
    expect(dbwToWatts(20)).toBeCloseTo(100, 10);
    expect(dbwToWatts(wattsToDbw(37.5))).toBeCloseTo(37.5, 10);
    expect(dbwToDbm(-103)).toBe(-73);
  });

  it("restates a ratio for another bandwidth", () => {
    // 10·log10(2500) = 33.98 dB.
    expect(snrInOneHertz(-21, 2500)).toBeCloseTo(12.98, 2);
    expect(snrInOneHertz(45, 1)).toBe(45);
    expect(snrInBandwidth(52, 2500)).toBeCloseTo(18.02, 2);
    expect(snrInBandwidth(snrInOneHertz(-7.3, 500), 500)).toBeCloseTo(-7.3, 10);
  });

  it("reads an S-meter by the HF convention: S9 at -73 dBm, 6 dB a unit", () => {
    expect(sMeter(-103)).toBe("S9");
    expect(sMeter(-93)).toBe("S9 + 10 dB");
    expect(sMeter(-109)).toBe("S8");
    expect(sMeter(-151)).toBe("S1");
    expect(sMeter(-170)).toBe("below S1");
  });
});

describe("bands, modes and noise", () => {
  it("has each amateur band from 80 m to 10 m once, with its own frequency inside it and inside the engine's range", () => {
    expect(HF_BANDS.map((band) => band.id)).toEqual(["80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"]);
    for (const band of HF_BANDS) {
      expect(band.mhz).toBeGreaterThanOrEqual(band.fromMhz);
      expect(band.mhz).toBeLessThanOrEqual(band.toMhz);
      expect(band.mhz).toBeGreaterThanOrEqual(2);
      expect(band.mhz).toBeLessThanOrEqual(30);
      expect(bandOf(band.mhz)).toBe(band);
    }
    expect(bandOf(7.1)?.label).toBe("40 m");
    expect(bandOf(9)).toBeNull();
  });

  it("does not give FT8, JS8Call and CW one threshold, and gives a mode with no figure none", () => {
    const inOneHertz = (id: "cw" | "ft8" | "js8" | "ssb") => snrInOneHertz(modeById(id).requiredSnrDb!, modeById(id).referenceBandwidthHz);
    expect(inOneHertz("ssb")).toBe(45);
    expect(inOneHertz("cw")).toBe(24);
    expect(inOneHertz("ft8")).toBeCloseTo(15.18, 2);
    expect(inOneHertz("js8")).toBeCloseTo(9.98, 2);
    expect(modeById("digital").requiredSnrDb).toBeNull();
    for (const mode of OPERATING_MODES) expect(mode.source.length).toBeGreaterThan(10);
  });

  it("orders the noise settings from loud to quiet", () => {
    const levels = NOISE_ENVIRONMENTS.map((item) => item.dbwAt3Mhz);
    expect(levels).toEqual([-140.4, -144.7, -150, -164.1]);
  });

  it("ranks the bands of an hour by reliability, then by ratio", () => {
    const cells = [0.1, 0.6, 0.6, 0.3, 0, 0, 0, 0, 0].map((reliability, index) => ({ reliability, snrDbHz: index === 2 ? 50 : 40 }));
    const ranked = rankBands({ bands: cells } as unknown as PredictionHour);
    expect(ranked.slice(0, 4).map((item) => item.band.id)).toEqual(["40m", "60m", "30m", "80m"]);
  });

  it("writes an hour of the day", () => {
    expect(utcLabel(3)).toBe("03:00");
    expect(utcLabel(24)).toBe("24:00");
  });
});

describe("the geometry of a steep path", () => {
  it("is straight up over no distance at all", () => {
    const overhead = steepPathGeometry(0, 300);
    expect(overhead.elevationDeg).toBeCloseTo(90, 1);
    expect(overhead.incidenceDeg).toBeCloseTo(0, 1);
    expect(overhead.secant).toBeCloseTo(1, 3);
  });

  it("is close to the flat triangle on a short path, and a little lower over the curve", () => {
    // Flat ground: 100 km out and 300 km up is atan(3) = 71.57 degrees.
    const short = steepPathGeometry(200, 300);
    expect(short.elevationDeg).toBeLessThan(71.57);
    expect(short.elevationDeg).toBeGreaterThan(70.5);
    // The ray meets the layer nearer the vertical than it left the ground's horizontal complement, because the layer curves too.
    expect(short.incidenceDeg).toBeLessThan(90 - short.elevationDeg);
    expect(short.secant).toBeCloseTo(1 / Math.cos((short.incidenceDeg * Math.PI) / 180), 10);
  });

  it("flattens as the path lengthens", () => {
    const angles = [100, 500, 1000, 2000, 3000].map((km) => steepPathGeometry(km, 300).elevationDeg);
    expect([...angles].sort((a, b) => b - a)).toEqual(angles);
    // 3000 km off 300 km is a grazing ray: under ten degrees.
    expect(angles[4]).toBeLessThan(10);
    expect(angles[4]).toBeGreaterThan(0);
  });

  it("applies the secant law", () => {
    expect(secantLawMhz(5, 0)).toBe(5);
    expect(secantLawMhz(5, 60)).toBeCloseTo(10, 10);
    // London to Birmingham off 257 km: a layer returning 9 MHz straight down returns only a little more on this path.
    const path162 = steepPathGeometry(162.4, 257);
    expect(secantLawMhz(9, path162.incidenceDeg)).toBeGreaterThan(9);
    expect(secantLawMhz(9, path162.incidenceDeg)).toBeLessThan(9.6);
  });
});
