import { parseCelestrakCsv } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { namesDisagree } from "./about";
import { LOW_PASS_BELOW_DEG, passSchedule, predictPasses, satelliteState, WORKABLE_ELEVATION_DEG } from "./engine";
import { alwaysUpWords, frequencyWords, geometryWords, pathWords } from "./words";

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
// CelesTrak's published elements for ES'HAIL 2 (QO-100), geostationary at about 25.8° E, 22 November 2026.
const ESHAIL = parseCelestrakCsv(
  `${HEADER}\n"ES'HAIL 2",2018-090A,2026-11-22T07:29:56.831712,1.00271489,.0001953,0.0131,6.2008,270.5599,282.8372,0,U,43700,999,2926,0,.00000168,0`,
  "amateur",
)[0]!;
const LONDON = { lat: 51.5074, lon: -0.1278 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };
const AT = new Date(Date.parse("2026-11-22T12:00:00Z"));

describe("a geostationary satellite", () => {
  it("is one pass that is always up, not 'no pass', where it is above the horizon", () => {
    const state = satelliteState(ESHAIL, LONDON, AT);
    expect(state.elevationDeg).toBeGreaterThan(20);
    const passes = predictPasses(ESHAIL, LONDON, AT, 24, 18);
    expect(passes).toHaveLength(1);
    const [pass] = passes;
    expect(pass!.alwaysUp).toBe(true);
    expect(pass!.aos.getTime()).toBe(AT.getTime());
    expect(pass!.los.getTime()).toBe(AT.getTime() + 24 * 3_600_000);
    expect(pass!.maxElevationDeg).toBeCloseTo(state.elevationDeg, 0);
    expect(pass!.tcaAzimuthDeg).toBeCloseTo(state.azimuthDeg, 0);
    expect(alwaysUpWords(pass!)).toMatch(/^Always up here: point 2\d° up, to the S[SE]* \(1[4-9]\d°\)$/);
    expect(pathWords(pass!)).toBe(alwaysUpWords(pass!));
    expect(passSchedule([ESHAIL], LONDON, AT)).toHaveLength(1);
  });

  it("has no pass at all where it is below the horizon", () => {
    expect(satelliteState(ESHAIL, SYDNEY, AT).elevationDeg).toBeLessThan(0);
    expect(predictPasses(ESHAIL, SYDNEY, AT, 24, 18)).toEqual([]);
  });
});

describe("words", () => {
  it("gives a frequency above 1 GHz to the kHz", () => {
    expect(frequencyWords(10_489_550_000)).toBe("10.489550 GHz");
    expect(frequencyWords(10_489_800_000)).toBe("10.489800 GHz");
    expect(frequencyWords(2_400_050_000)).toBe("2.400050 GHz");
    expect(frequencyWords(145_800_000)).toBe("145.800 MHz");
    expect(frequencyWords(145_812_500)).toBe("145.8125 MHz");
  });

  it("draws one line for a low pass", () => {
    expect(LOW_PASS_BELOW_DEG).toBe(10);
    expect(WORKABLE_ELEVATION_DEG).toBe(LOW_PASS_BELOW_DEG);
    expect(geometryWords(9.6)).toBe("Low pass");
    expect(geometryWords(10)).toBe("Fair pass");
    expect(geometryWords(19.9)).toBe("Fair pass");
    expect(geometryWords(20)).toBe("Good pass");
    expect(geometryWords(45)).toBe("High pass");
  });

  it("flags a number CelesTrak and SatNOGS DB name differently, and only then", () => {
    expect(namesDisagree("GREENCUBE (IO-117)", { name: "MTCube 2", otherNames: ["ROBUSTA-1F", "FX6FRA"] })).toBe(true);
    const agree: Array<[string, string, string[]]> = [
      ["GREENCUBE (IO-117)", "GREENCUBE", ["IO-117"]],
      ["ISS (ZARYA)", "ISS", ["ZARYA", "RS0ISS", "NA1SS"]],
      ["RS-44 & BREEZE-KM R/B", "DOSAAF-85", ["RS-44"]],
      ["DIWATA-2B", "DIWATA-2", ["PO-101"]],
      ["FOX-1CLIFF (AO-95)", "FOX-1C", ["AO-95Fox-1Cliff"]],
      ["METEOR-M2 3", "METEOR M2-3", ["METEOR 2 2-3", "METEOR-M N2-3"]],
      ["CSS (TIANHE)", "CSS (Tianhe)", ["Tiangong", "天和"]],
      ["EYESAT A (AO-27)", "EYESAT-1", ["AO-27"]],
      ["PHASE 3B (AO-10)", "Phase 3-B", ["AO-10 OSCAR-10"]],
      ["GOES 16", "GOES-16", []],
    ];
    for (const [celestrak, name, otherNames] of agree) expect(namesDisagree(celestrak, { name, otherNames }), celestrak).toBe(false);
    expect(namesDisagree("GREENCUBE (IO-117)", null)).toBe(false);
  });
});
