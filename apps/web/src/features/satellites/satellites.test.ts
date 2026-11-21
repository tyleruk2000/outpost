import { elementsAge, hasValidTleChecksum, parseCelestrakCsv } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { passBlocks } from "./document";
import {
  dopplerShiftHz,
  dopplerTuning,
  footprintRadiusKm,
  footprintRing,
  groundTrack,
  passSchedule,
  passSkyPath,
  predictPasses,
  satelliteState,
} from "./engine";
import { parseManualElements } from "./manual";
import { skyXY } from "./sky-plot";

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
// CelesTrak's published elements for the ISS, 21 November 2026.
const ISS_ROW =
  "ISS (ZARYA),1998-067A,2026-11-21T04:54:08.875296,15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0";
const [ISS] = parseCelestrakCsv(`${HEADER}\n${ISS_ROW}`, "stations");
const LONDON = { lat: 51.5074, lon: -0.1278 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };
const EPOCH = new Date(Date.parse("2026-11-21T04:54:08.875Z"));

/** A TLE line with its checksum put right, from the first 68 characters. */
function withChecksum(line: string): string {
  let sum = 0;
  for (const char of line.slice(0, 68)) sum += char >= "0" && char <= "9" ? Number(char) : char === "-" ? 1 : 0;
  return `${line.slice(0, 68)}${sum % 10}`;
}

describe("the SGP4 engine", () => {
  it("puts the ISS at about 420 km, moving at about 7.66 km/s, inside its inclination", () => {
    const state = satelliteState(ISS!, LONDON, EPOCH);
    expect(state.altitudeKm).toBeGreaterThan(380);
    expect(state.altitudeKm).toBeLessThan(450);
    expect(state.velocityKmS).toBeCloseTo(7.66, 1);
    expect(Math.abs(state.lat)).toBeLessThanOrEqual(51.7);
  });

  for (const [name, place] of [
    ["London", LONDON],
    ["Sydney", SYDNEY],
  ] as const) {
    it(`finds passes over ${name} that rise and set on the horizon and peak in between`, () => {
      const passes = predictPasses(ISS!, place, EPOCH, 24, 20);
      expect(passes.length).toBeGreaterThan(2);
      for (const pass of passes) {
        expect(pass.aos < pass.tca && pass.tca < pass.los).toBe(true);
        expect(Math.abs(satelliteState(ISS!, place, pass.aos).elevationDeg)).toBeLessThan(0.1);
        expect(Math.abs(satelliteState(ISS!, place, pass.los).elevationDeg)).toBeLessThan(0.1);
        expect(pass.maxElevationDeg).toBeGreaterThan(0);
        expect(pass.durationSeconds).toBeLessThan(15 * 60);
        // Heard high as it comes, low as it goes.
        expect(dopplerShiftHz(437e6, satelliteState(ISS!, place, pass.aos).rangeRateKmS)).toBeGreaterThan(0);
        expect(dopplerShiftHz(437e6, satelliteState(ISS!, place, pass.los).rangeRateKmS)).toBeLessThan(0);
      }
    });
  }

  it("walks a pass already under way back to its real start", () => {
    const [first] = predictPasses(ISS!, LONDON, EPOCH, 24, 1);
    const midway = new Date((first!.aos.getTime() + first!.los.getTime()) / 2);
    const [again] = predictPasses(ISS!, LONDON, midway, 1, 1);
    expect(Math.abs(again!.aos.getTime() - first!.aos.getTime())).toBeLessThan(2000);
  });

  it("schedules many satellites in time order and flags the workable ones", () => {
    const entries = passSchedule([ISS!], LONDON, EPOCH, { hours: 24 });
    for (let i = 1; i < entries.length; i += 1) expect(entries[i]!.pass.aos >= entries[i - 1]!.pass.aos).toBe(true);
    expect(entries.every((entry) => entry.workable === entry.pass.maxElevationDeg >= 10)).toBe(true);
  });

  it("splits the ground track at the date line and samples a pass's sky path", () => {
    for (const segment of groundTrack(ISS!, EPOCH)) {
      for (let i = 1; i < segment.length; i += 1) expect(Math.abs(segment[i]!.lon - segment[i - 1]!.lon)).toBeLessThan(180);
    }
    const [pass] = predictPasses(ISS!, LONDON, EPOCH, 24, 1);
    const path = passSkyPath(ISS!, LONDON, pass!, 10);
    expect(path).toHaveLength(11);
  });

  it("corrects an uplink the other way from a downlink", () => {
    const tuned = dopplerTuning(-5, 437_800_000, 145_990_000);
    expect(tuned.downlinkHz!).toBeGreaterThan(437_800_000);
    expect(tuned.uplinkHz!).toBeLessThan(145_990_000);
  });

  it("gives the footprint of a 420 km orbit as about 2,250 km, closed round a pole when it covers one", () => {
    expect(footprintRadiusKm(420)).toBeCloseTo(2253, -1);
    const polar = footprintRing({ lat: 80, lon: 10 }, 2500);
    expect(polar.at(-1)).toEqual(polar[0]);
  });
});

describe("pasted elements", () => {
  const line1 = withChecksum("1 25544U 98067A   26325.20427865  .00011207  00000+0  20733-3 0  9990");
  const line2 = withChecksum("2 25544  51.6319 243.0636 0007384  49.3258 310.8372 15.49527370596090");

  it("reads a three-line TLE and checks it", () => {
    expect(hasValidTleChecksum(line1)).toBe(true);
    const parsed = parseManualElements(`ISS (ZARYA)\n${line1}\n${line2}`, EPOCH.getTime());
    expect(parsed).toMatchObject({ noradId: 25544, name: "ISS (ZARYA)", format: "TLE" });
    expect(satelliteState(parsed.orbit, LONDON, EPOCH).altitudeKm).toBeGreaterThan(380);
  });

  it("says why a TLE is refused", () => {
    expect(() => parseManualElements(`${line1.slice(0, 68)}${(Number(line1[68]) + 1) % 10}\n${line2}`, EPOCH.getTime())).toThrow(
      /checksum/,
    );
    expect(() => parseManualElements("", EPOCH.getTime())).toThrow(/Paste/);
  });

  it("reads one OMM object as JSON, and warns when it is old", () => {
    const omm = { ...ISS!.elements };
    const parsed = parseManualElements(JSON.stringify(omm), EPOCH.getTime() + 40 * 86_400_000);
    expect(parsed.format).toBe("OMM JSON");
    expect(parsed.warnings[0]).toMatch(/40 days old/);
  });
});

describe("element age", () => {
  it("is fresh for a week, old after it and very old after a month", () => {
    const day = 86_400_000;
    expect(elementsAge(0, 3 * day)).toBe("fresh");
    expect(elementsAge(0, 8 * day)).toBe("old");
    expect(elementsAge(0, 31 * day)).toBe("very-old");
    expect(elementsAge(day, 0)).toBe("ahead");
  });
});

describe("the sky track", () => {
  it("puts north at the top, east to the right, and straight up in the centre", () => {
    const [nx, ny] = skyXY(0, 0);
    const [ex] = skyXY(90, 0);
    const [cx, cy] = skyXY(123, 90);
    expect(nx).toBeCloseTo(120);
    expect(ny).toBeLessThan(120);
    expect(ex).toBeGreaterThan(120);
    expect([cx, cy]).toEqual([120, 120]);
  });
});

describe("the pass on paper", () => {
  it("draws the sky track above the table, inside the box it is given", () => {
    const [pass] = predictPasses(ISS!, LONDON, EPOCH, 24, 1);
    const path = passSkyPath(ISS!, LONDON, pass!, 10);
    const blocks = passBlocks({
      name: "ISS",
      noradId: 25544,
      epoch: EPOCH.getTime(),
      place: "London",
      pass: pass!,
      path,
      transmitters: [],
      written: EPOCH,
      licensed: false,
    });
    const at = blocks.findIndex((block) => block.kind === "drawing");
    expect(at).toBeGreaterThan(0);
    expect(blocks[at + 1]?.kind).toBe("table");
    const drawing = blocks[at]!;
    if (drawing.kind !== "drawing") throw new Error("not a drawing");
    expect(drawing.words).toMatch(/^Sky track.*Rises in the .* UTC, highest \d+°/);
    const items = drawing.draw(50, 100, 495);
    const words = items.flatMap((item) => (item.kind === "text" ? [item.text] : []));
    expect(words).toEqual(expect.arrayContaining(["N", "E", "S", "W", "30°", "60°"]));
    expect(items.some((item) => item.kind === "polygon")).toBe(true);
    for (const item of items) {
      if (item.kind !== "line") continue;
      for (const x of [item.x1, item.x2]) expect(x).toBeGreaterThanOrEqual(49);
      for (const y of [item.y1, item.y2]) {
        expect(y).toBeGreaterThanOrEqual(100);
        expect(y).toBeLessThanOrEqual(100 + drawing.height);
      }
    }
  });
});
