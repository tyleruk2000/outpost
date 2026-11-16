/**
 * A wire of a stated length, put to the real engine: what VOACAP's antenna models do
 * with a length in metres, which is what decides how Outpost runs an end-fed wire, where
 * its figures are approximate and where it gives none.
 *
 * The engine does not hand out a pattern, only the gain at the angle a signal leaves at.
 * So a pattern is sampled here: one antenna file, one frequency, paths of twelve lengths
 * through the 24 hours, which between them leave at angles from a few degrees to about
 * 75. Gains are then compared at the same whole degree. Every expected figure below was
 * read off this engine on 16 November 2026 (hfcast 2.14.0, VOACAP 16.1207W); the
 * tolerances are stated with each.
 */
import fs from "node:fs";
import path from "node:path";
import { ANTENNA_PRESETS, type AntennaSpec, HF_BANDS, initialBearingDeg, type PredictionCell } from "@outpost/shared";
import { afterAll, expect, it } from "vitest";
import type { CircuitRequest } from "../src/modules/propagation/engine.ts";
import { antennaFile } from "../src/modules/propagation/voacap/antenna-files.ts";
import { createVoacapEngine, type WireCell, withOutsideGain } from "../src/modules/propagation/voacap/engine.ts";
import { loadDataset, loadEngineFile, voacapPaths } from "../src/modules/propagation/voacap/files.ts";
import { VoacapInstance } from "../src/modules/propagation/voacap/instance.ts";
import { REFERENCE_CASES } from "./fixtures/propagation/cases.ts";
import { tempDir } from "./temp.ts";
import { describeWithVoacapData, seedVoacapData, voacapDataAbsent } from "./voacap-data.ts";

const scratch = tempDir("outpost-hf-wire-");
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

// The real engine and its data (voacap-data.ts): without the coefficients every test here is reported as skipped.
seedVoacapData(path.join(scratch, "data"));
const paths = voacapPaths(path.join(scratch, "data"));
const engine = voacapDataAbsent ? (null as never) : createVoacapEngine(paths);
const instance = voacapDataAbsent ? (null as never) : new VoacapInstance(loadEngineFile(paths).wasm, loadDataset(paths).files);
const preset = (id: string): AntennaSpec => ANTENNA_PRESETS.find((item) => item.id === id)!.spec;
const acceptance = REFERENCE_CASES[0]!.request;

// ── Antenna files as VOACAP's samples write them, over average ground ────────

const num = (value: number, places: number) => value.toFixed(places).padStart(6);
const GROUND = "  15    [ 3] Dielectric....:\n.00500  [ 4] Conductivity..:\n10.000  [ 5] Operating Freq:\n";
/** Type 23, the horizontal dipole: length and height, each in metres or (negative) wavelengths. */
const dipole = (length: number, height: number) =>
  `Test\n 8     8 parameters\n  0.00  [ 1] Max Gain dBi..:\n  23    [ 2] Antenna Type..:\n${GROUND}${num(length, 2)}  [ 6] Antenna Length:\n${num(height, 2)}  [ 7] Antenna Height:\n   0.0  [ 8] Gain ab dipole:\n`;
/** Type 22, the vertical monopole: height in metres or (negative) wavelengths. */
const monopole = (height: number) =>
  `Test\n 7     7 parameters\n  0.00  [ 1] Max Gain dBi..:\n  22    [ 2] Antenna Type..:\n${GROUND}${num(height, 3)}  [ 6] Antenna Height:\n   0.0  [ 7] Gain ab dipole:\n`;
/** Type 41, the ITS-78 sloping long wire (`antennas/samples/sample.41`): slope from horizontal, wire length, feed height. */
const longWire = (slopeDeg: number, length: number, feedHeight: number) =>
  `Test\n 8     8 parameters\n  0.00  [ 1] Max Gain dBi..:\n  41    [ 2] Antenna Type..:\n${GROUND}${num(slopeDeg, 2)}  [ 6] Slope from Hor:\n${num(length, 2)}  [ 7] Wire Length   :\n${num(feedHeight, 2)}  [ 8] Feed Height   :\n`;

// ── Sampling a pattern ──────────────────────────────────────────────────────

const DISTANCES_KM = [150, 300, 500, 700, 900, 1200, 1500, 2000, 2500, 3000, 3800, 6000];
const encoder = new TextEncoder();
let files = 0;

/**
 * Gain by whole degree of take-off angle for one antenna file at one frequency, along
 * paths east from 45°N 0°E. `offDeg` turns the antenna's reference direction away from
 * the path: for a dipole that direction is its broadside, for the long wire the wire itself.
 */
function pattern(text: string, mhz: number, offDeg = 0, distancesKm = DISTANCES_KM): Map<number, number> {
  const file = `outpost/wire${files++}`;
  instance.writeFile(`antennas/${file}`, encoder.encode(text));
  const sums = new Map<number, { sum: number; count: number }>();
  const tx = { name: "A", lat: 45, lon: 0 };
  for (const km of distancesKm) {
    const rx = { name: "B", lat: 45, lon: km / 111.19 / Math.cos((45 * Math.PI) / 180) };
    const answer = instance.run<{ hours: Array<{ freqs: Array<{ mode: string | null; takeoffDeg: number; txGainDbi: number }> }> }>({
      task: "systems",
      tx,
      rx,
      month: 6,
      year: 2026,
      ssn: 100,
      powerWatts: 100,
      freqs: [mhz],
      requiredSnrDb: 24,
      noiseDbw: 145,
      txAntennas: [{ file, beamDeg: (initialBearingDeg(tx, rx) + offDeg + 360) % 360 }],
      rxAntennas: [{ file: "default/isotrope" }],
    });
    for (const hour of answer.hours) {
      const cell = hour.freqs[0]!;
      if (cell.mode === null) continue;
      const degree = Math.round(cell.takeoffDeg);
      const kept = sums.get(degree) ?? { sum: 0, count: 0 };
      sums.set(degree, { sum: kept.sum + cell.txGainDbi, count: kept.count + 1 });
    }
  }
  return new Map([...sums.entries()].sort((a, b) => a[0] - b[0]).map(([degree, { sum, count }]) => [degree, sum / count]));
}

/** The largest difference between two patterns over the angles both were sampled at, from 5° up, and how many angles that was. */
function apart(a: Map<number, number>, b: Map<number, number>): { most: number; mean: number; angles: number } {
  const differences = [...a.entries()].filter(([degree]) => degree >= 5 && b.has(degree)).map(([degree, gain]) => gain - b.get(degree)!);
  return {
    most: Math.max(...differences.map(Math.abs)),
    mean: differences.reduce((sum, value) => sum + value, 0) / differences.length,
    angles: differences.length,
  };
}

/** The angle the pattern is strongest at, and the gain there. */
function peak(samples: Map<number, number>): { degree: number; gain: number } {
  const [degree, gain] = [...samples.entries()].reduce((best, item) => (item[1] > best[1] ? item : best));
  return { degree, gain };
}

const wavelengths = (metres: number, mhz: number) => (metres * mhz) / 299.792458;

describeWithVoacapData("VOACAP's horizontal dipole (type 23) given a length in metres", () => {
  it("takes it: on the band where 10 m is about a half-wave it gives what a half-wave gives", () => {
    // 10 m at 14.18 MHz is 0.473 wavelengths. Seen: 0.1 dB below the half-wave at every angle.
    const metres = pattern(dipole(10, 6), 14.18);
    const half = pattern(dipole(-0.5, 6), 14.18);
    const { most, angles } = apart(metres, half);
    expect(angles).toBeGreaterThan(15);
    expect(most).toBeLessThan(0.25);
  });

  it("changes with frequency, and away from a half-wave is far below one", () => {
    // The model refers its gain to the current at the centre feed point, which falls to
    // nothing as the wire nears a whole wavelength. Seen, against a half-wave at the same
    // height and angles: 3.7 dB lower at 7.1 MHz (0.24 wavelengths), 17.5 dB lower at
    // 28.85 MHz (0.96). Neither is what a real wire of that length loses.
    const at = (mhz: number) => apart(pattern(dipole(10, 6), mhz), pattern(dipole(-0.5, 6), mhz)).mean;
    expect(at(7.1)).toBeLessThan(-3);
    expect(at(7.1)).toBeGreaterThan(-5);
    expect(at(28.85)).toBeLessThan(-12);
  });

  it("is fed at its centre: a whole wavelength of wire is strongest broadside, where an end-fed wire has a null", () => {
    // One path of 2500 km at 28.85 MHz, leaving at 13.8°, the antenna turned. Seen for
    // type 23: -12.1 dBi broadside, -19.3 dBi 40° off it. Seen for the wire fed at its end
    // (type 41 laid level): -29.2 dBi broadside (its floor is -30) and +4.0 dBi 40° off.
    const at = (text: string, off: number) => peak(pattern(text, 28.85, off, [2500])).gain;
    expect(wavelengths(10, 28.85)).toBeCloseTo(0.96, 2);
    const centreFed = { broadside: at(dipole(10, 6), 0), off: at(dipole(10, 6), 40) };
    expect(centreFed.broadside).toBeGreaterThan(centreFed.off + 5);
    // Type 41's reference direction is along the wire, so its broadside is 90° from it.
    const endFed = { broadside: at(longWire(0, 10, 6), 90), off: at(longWire(0, 10, 6), 50) };
    expect(endFed.broadside).toBeLessThan(-25);
    expect(endFed.off).toBeGreaterThan(endFed.broadside + 25);
  });
});

describeWithVoacapData("VOACAP's vertical monopole (type 22) given a height", () => {
  it("lowers its lobe as it lengthens to 5/8 of a wavelength, and splits it beyond", () => {
    // Seen at 14.18 MHz over average ground, strongest angle and gain there:
    // 0.25 wavelengths 25 to 30° at -0.7 dBi; 0.5 at 20°, +0.2 dBi; 0.625 at 15°, +1.2 dBi;
    // 0.75 at 50°, +4.3 dBi with -1.5 dBi left at 10°.
    const quarter = peak(pattern(monopole(-0.25), 14.18));
    const half = peak(pattern(monopole(-0.5), 14.18));
    const fiveEighths = peak(pattern(monopole(-0.625), 14.18));
    const threeQuarters = peak(pattern(monopole(-0.75), 14.18));
    expect(quarter.degree).toBeGreaterThanOrEqual(22);
    expect(half.degree).toBeLessThan(quarter.degree);
    expect(fiveEighths.degree).toBeLessThan(half.degree);
    expect(fiveEighths.degree).toBeLessThanOrEqual(17);
    expect(half.gain).toBeGreaterThan(quarter.gain + 0.5);
    expect(fiveEighths.gain).toBeGreaterThan(half.gain + 0.5);
    expect(threeQuarters.degree).toBeGreaterThanOrEqual(40);
  });

  it("reads metres as the same height in wavelengths, on every band", () => {
    // Largest difference seen: 0.3 dB, on 80 m. The engine keeps a pattern for each whole
    // megahertz and reads between them, and a height in metres is a different height in
    // wavelengths at 3 and at 4 MHz.
    for (const mhz of [3.65, 7.1, 14.18, 21.22, 28.85]) {
      const { most, angles } = apart(pattern(monopole(10), mhz), pattern(monopole(-wavelengths(10, mhz)), mhz));
      expect(angles).toBeGreaterThan(10);
      expect(most).toBeLessThan(0.5);
    }
  });

  it("takes off a loss for a wire much shorter than a quarter-wave", () => {
    // 10 m at 3.65 MHz is 0.12 wavelengths: seen strongest at -6.8 dBi, where a
    // quarter-wave is strongest at -0.7 dBi. 5 m there (0.06): -18.5 dBi.
    expect(peak(pattern(monopole(10), 3.65)).gain).toBeLessThan(-5);
    expect(peak(pattern(monopole(5), 3.65)).gain).toBeLessThan(-15);
  });

  it("is the wire fed at its bottom end: the engine's end-fed wire stood upright gives the same", () => {
    // Type 41 with a slope of 90° and its feed on the ground is a different piece of the
    // engine (the ITS-78 models) working out the same antenna. Seen: the same to 0.1 dB at
    // 14.18, 18.12 and 28.85 MHz, where the 10 m wire is longer than 0.35 wavelengths.
    for (const mhz of [14.18, 28.85]) {
      const { most, angles } = apart(pattern(monopole(10), mhz), pattern(longWire(90, 10, 0), mhz));
      expect(angles).toBeGreaterThan(10);
      expect(most).toBeLessThan(0.2);
    }
  });
});

// ── Type 41 laid level: what Outpost runs a level wire longer than a half-wave as ──

/** Type 41 as Outpost writes it for one frequency: length and height in wavelengths there. */
const longWireAt = (metres: number, heightM: number, mhz: number) => longWire(0, -wavelengths(metres, mhz), -wavelengths(heightM, mhz));

/** Gain at one path's noon take-off angle, for each turn of the antenna's reference direction away from the path. */
function turning(text: string, mhz: number, km: number, offsDeg: number[]): number[] {
  const file = `outpost/wire${files++}`;
  instance.writeFile(`antennas/${file}`, encoder.encode(text));
  const tx = { name: "A", lat: 45, lon: 0 };
  const rx = { name: "B", lat: 45, lon: km / 111.19 / Math.cos((45 * Math.PI) / 180) };
  return offsDeg.map((off) => {
    const answer = instance.run<{ hours: Array<{ freqs: Array<{ txGainDbi: number }> }> }>({
      task: "systems",
      tx,
      rx,
      month: 6,
      year: 2026,
      ssn: 100,
      powerWatts: 100,
      freqs: [mhz],
      requiredSnrDb: 24,
      noiseDbw: 145,
      txAntennas: [{ file, beamDeg: (initialBearingDeg(tx, rx) + off + 360) % 360 }],
      rxAntennas: [{ file: "default/isotrope" }],
    });
    return answer.hours[11]!.freqs[0]!.txGainDbi;
  });
}

/** The mean and spread of the difference between two patterns at take-off angles from 5° to 30°, where HF paths of any length leave. */
function lowAngles(a: Map<number, number>, b: Map<number, number>) {
  return apart(new Map([...a].filter(([degree]) => degree <= 30)), b);
}

describeWithVoacapData(
  "VOACAP's sloping long wire (type 41) laid level, which Outpost runs a level wire longer than a half-wave as",
  () => {
    it("is fed at one end and runs from the feed towards its reference direction; laid level, either way along it is the same", () => {
      // Sloping 20° up from a feed 1 m above the ground, 10 m of wire at 21.22 MHz: seen
      // -16.3 dBi along the reference direction (up the wire) and -0.2 dBi the other way.
      const sloping = turning(longWire(20, 10, 1), 21.22, 2500, [0, 180]);
      expect(sloping[1]! - sloping[0]!).toBeGreaterThan(10);
      // Laid level the pattern is the same whichever end is fed: the field of a standing
      // wave on a wire has the same size towards either end.
      for (const mhz of [18.12, 21.22, 28.85]) {
        const [ahead, behind, left, right] = turning(longWire(0, 10, 6), mhz, 2500, [30, 210, 60, 300]);
        expect(Math.abs(ahead! - behind!)).toBeLessThan(0.05);
        expect(Math.abs(left! - right!)).toBeLessThan(0.05);
      }
    });

    it("moves its lobes from broadside towards the wire as the wire lengthens, with a null broadside at whole wavelengths", () => {
      // 2500 km at noon leaves at 31° at 14.18 MHz; the wire 0.3 wavelengths up. Turned in
      // whole degrees from along the wire (0) to broadside (90). Seen: 0.6 wavelengths
      // strongest broadside (+5.5 dBi); 0.75 at 49° from the wire (+5.2), 1.1 dBi broadside;
      // one wavelength at 48° (+4.5), -30 dBi broadside (the engine's floor); 1.5 at 33°;
      // two wavelengths at 24° with -30 dBi broadside.
      const offs = Array.from({ length: 91 }, (_, index) => index);
      const strongest = (wavelengthsLong: number) => {
        const gains = turning(longWire(0, -wavelengthsLong, -0.3), 14.18, 2500, offs);
        const best = Math.max(...gains);
        return { at: gains.indexOf(best), best, broadside: gains[90]! };
      };
      const [w06, w075, w1, w15, w2] = [0.6, 0.75, 1, 1.5, 2].map(strongest);
      expect(w06!.at).toBeGreaterThanOrEqual(85);
      expect(w075!.at).toBeGreaterThan(40);
      expect(w075!.at).toBeLessThan(60);
      expect(w1!.broadside).toBeLessThan(-25);
      expect(w1!.at).toBeGreaterThan(40);
      expect(w15!.at).toBeLessThan(w1!.at);
      expect(w2!.at).toBeLessThan(w15!.at);
      expect(w2!.broadside).toBeLessThan(-25);
    });

    it("reads 1.2 to 1.6 dB below the dipole model at a half-wave and at every odd number of half-waves, where both have the same current", () => {
      // A wire an odd number of half-waves long carries the same standing wave fed at its
      // end or at its centre, so there type 23 is a check on type 41's level. Seen at
      // 14.18 MHz, 0.3 wavelengths up, angles 5 to 30°: 1.36 dB below at 0.5 wavelengths,
      // 1.49 at 1.5, 1.52 at 2.5, 1.54 at 3.5 and 1.58 at 7.5. The two also differ at steep
      // angles, by an amount that depends on height and not on length (seen at a half-wave
      // too), and in where the nulls fall off broadside.
      for (const n of [0.5, 1.5, 2.5, 3.5, 7.5]) {
        const { mean, most } = lowAngles(pattern(longWire(0, -n, -0.3), 14.18, 90), pattern(dipole(-n, -0.3), 14.18));
        expect(mean).toBeLessThan(-1.2);
        expect(mean).toBeGreaterThan(-1.7);
        expect(most).toBeLessThan(1.8);
      }
    });

    it("at the top of the half-wave range, where Outpost changes from one model to the other, reads 0.7 to 1.0 dB below the dipole", () => {
      // The join, as Outpost writes each file. Seen at 5 to 30°: 10 m of wire 6 m up at
      // 16.49 MHz (0.55 wavelengths) 0.72 dB below; 20 m at 8.24 MHz 0.99 below at 6 m and
      // 0.85 below at 10 m. At a half-wave (14.99 MHz) the 10 m wire reads 1.36 dB below.
      const join = (metres: number, height: number, mhz: number) =>
        lowAngles(pattern(longWireAt(metres, height, mhz), mhz, 90), pattern(dipole(metres, height), mhz)).mean;
      for (const [metres, height] of [
        [10, 6],
        [20, 6],
        [20, 10],
      ] as const) {
        const mhz = Number(((0.55 * 299.792458) / metres).toFixed(2));
        expect(join(metres, height, mhz)).toBeLessThan(-0.5);
        expect(join(metres, height, mhz)).toBeGreaterThan(-1.2);
      }
      expect(join(10, 6, 14.99)).toBeLessThan(-1.2);
      expect(join(10, 6, 14.99)).toBeGreaterThan(-1.5);
    });

    it("reads between whole-megahertz patterns, so a long wire's length in metres is not that wire's pattern; in wavelengths at the frequency it is", () => {
      // The engine keeps a pattern for each whole megahertz. For 10 m of wire at 21.22 MHz
      // the patterns at 21 and 22 MHz are near enough: seen 0.1 dB at most. For 82 m at
      // 5.33 MHz (1.46 wavelengths, but 1.37 at 5 MHz and 1.64 at 6) they are not: seen up to
      // 11.7 dB apart 60° from broadside. So Outpost writes each frequency's own file.
      const most = (metres: number, mhz: number, off: number) =>
        apart(pattern(longWire(0, metres, 6), mhz, off), pattern(longWire(0, -wavelengths(metres, mhz), 6), mhz, off)).most;
      expect(most(10, 21.22, 60)).toBeLessThan(0.3);
      expect(most(82, 5.33, 30)).toBeGreaterThan(5);
    });

    it("has no line for added gain, and lowering the requirement by the gain gives what that line gives", () => {
      // Type 23 with -3.5 dB at the transmitter and +2 dB at the receiver in its files,
      // against the same files with no gain and the requirement 1.5 dB higher, the figures
      // then moved as engine.ts moves them. Seen: the same to 0.001 in every figure, at
      // every hour, except the transmitting gain printed at take-off angles below 2°.
      const withGain = (db: number) =>
        dipole(-0.5, 6).replace("   0.0  [ 8] Gain ab dipole:", `${db.toFixed(1).padStart(6)}  [ 8] Gain ab dipole:`);
      // Its first line ("Max Gain dBi") does not move it either: seen, the same pattern at 0 and at 3.
      const flat = pattern(longWire(0, -1, 6), 14.18, 60);
      const raised = pattern(longWire(0, -1, 6).replace("  0.00  [ 1] Max Gain dBi..:", "  3.00  [ 1] Max Gain dBi..:"), 14.18, 60);
      expect(apart(raised, flat).most).toBeLessThan(0.01);
      expect(antennaFile({ ...preset("efhw-10m-horizontal"), gainDb: 3 }, 28.85)).not.toContain("Gain ab dipole");
      const write = (text: string) => {
        const file = `outpost/wire${files++}`;
        instance.writeFile(`antennas/${file}`, encoder.encode(text));
        return file;
      };
      const [lossy, gainy, plain] = [write(withGain(-3.5)), write(withGain(2)), write(withGain(0))];
      const run = (txFile: string, rxFile: string, required: number) =>
        instance.run<{ hours: Array<{ freqs: WireCell[] }> }>({
          task: "systems",
          tx: { name: "A", lat: 51.5, lon: -0.12 },
          rx: { name: "B", lat: 40.7, lon: -74 },
          month: 11,
          year: 2026,
          ssn: 100,
          powerWatts: 0.5,
          freqs: [7.1, 14.18, 21.22],
          requiredSnrDb: required,
          noiseDbw: 145,
          txAntennas: [{ file: txFile, beamDeg: 290 }],
          rxAntennas: [{ file: rxFile, beamDeg: 50 }],
        });
      const inFile = run(lossy, gainy, 45);
      const outside = run(plain, plain, 45 - (-3.5 + 2));
      let compared = 0;
      for (const [hour, answered] of inFile.hours.entries())
        for (const [at, expected] of answered.freqs.entries()) {
          if (expected.mode === null) continue;
          const moved = withOutsideGain(outside.hours[hour]!.freqs[at]!, -3.5, 2);
          for (const key of ["reliability", "snrDb", "signalDbw", "fieldDbu", "lossDb", "rxGainDbi", "snrLowDb", "snrUpDb"] as const)
            expect(Math.abs(moved[key]! - expected[key]!)).toBeLessThan(0.01);
          // The gain the engine prints at a take-off angle below 2°, near its -30 dBi floor, is not quite the
          // gain line's (seen: 0.15 to 0.21 dB apart at 1.6 to 1.7°, with every other figure the same).
          if (expected.takeoffDeg! >= 2) expect(Math.abs(moved.txGainDbi! - expected.txGainDbi!)).toBeLessThan(0.01);
          compared++;
        }
      expect(compared).toBeGreaterThan(30);
    });

    it("gives figures for a level wire shorter than a half-wave too, which Outpost does not use", () => {
      // Seen, 10 m of wire 6 m up against a half-wave dipole at the same height: 3.3 dB
      // below at 7.1 MHz (0.24 wavelengths) and 3.6 below at 3.65 MHz (0.12). The model's
      // current is that of a wire fed against something at its end; an end-fed half-wave has
      // nothing there to feed against, so Outpost gives no figure (wireOn: not modelled).
      for (const mhz of [3.65, 7.1]) {
        const { mean } = apart(pattern(longWire(0, 10, 6), mhz, 90), pattern(dipole(-0.5, 6), mhz));
        expect(mean).toBeLessThan(-2.5);
        expect(mean).toBeGreaterThan(-4.5);
      }
    });
  },
);

describeWithVoacapData("an end-fed wire of a stated length, as Outpost runs it", () => {
  const bands = HF_BANDS.map((band) => band.mhz);
  const noon = (request: CircuitRequest) => engine.circuit({ ...request, frequenciesMhz: bands }).hours[11]!.cells;
  const index = (id: string) => HF_BANDS.findIndex((band) => band.id === id);
  const states = (cells: PredictionCell[]) =>
    Object.fromEntries(
      HF_BANDS.map((band, at) => [band.id, cells[at]!.notModelled ? "n/m" : cells[at]!.approximate ? "approximate" : "modelled"]),
    );

  it("writes the wire's length in metres into the engine's own two models, and in wavelengths into the long wire", () => {
    expect(antennaFile(preset("efhw-10m-horizontal"))).toContain("  23    [ 2] Antenna Type");
    expect(antennaFile(preset("efhw-10m-horizontal"))).toContain(" 10.00  [ 6] Antenna Length:");
    expect(antennaFile(preset("efhw-10m-horizontal"))).toContain("  6.00  [ 7] Antenna Height:");
    // On a frequency where it is a half-wave, the same file.
    expect(antennaFile(preset("efhw-10m-horizontal"), 14.18)).toBe(antennaFile(preset("efhw-10m-horizontal")));
    // Longer than a half-wave: type 41, level, its length and height in wavelengths at that frequency.
    const long = antennaFile(preset("efhw-10m-horizontal"), 28.85);
    expect(long).toContain("  41    [ 2] Antenna Type");
    expect(long).toContain("  0.00  [ 6] Slope from Hor:");
    expect(long).toContain("-0.962  [ 7] Wire Length   :");
    expect(long).toContain("-0.577  [ 8] Feed Height   :");
    expect(long).not.toContain("Gain ab dipole");
    expect(antennaFile(preset("efhw-5m-vertical"))).toContain("  22    [ 2] Antenna Type");
    expect(antennaFile(preset("efhw-5m-vertical"))).toContain("  5.00  [ 6] Antenna Height:");
    expect(() => antennaFile({ ...preset("efhw-5m-vertical"), lengthM: undefined })).toThrow(/without its length/);
  });

  it("leaves the antenna that follows the frequency exactly as it was", () => {
    // What was "End-fed half-wave, horizontal at 6 m": still the half-wave dipole at 6 m.
    expect(antennaFile(preset("efhw"))).toBe(antennaFile({ ...preset("low-dipole"), heightM: 6 }));
    expect(antennaFile(preset("efhw"), 28.85)).toBe(antennaFile(preset("efhw")));
    expect(antennaFile(preset("efhw"))).toContain("  -.50  [ 6] Antenna Length:");
  });

  it("gives the horizontal 10 m wire the dipole's figures on 20 m, approximate figures above, and none below", () => {
    const wire = noon({ ...acceptance, txAntenna: preset("efhw-10m-horizontal") });
    const half = noon({ ...acceptance, txAntenna: { ...preset("low-dipole"), heightM: 6 } });
    expect(states(wire)).toEqual({
      "80m": "n/m",
      "60m": "n/m",
      "40m": "n/m",
      "30m": "n/m",
      "20m": "modelled",
      "17m": "approximate",
      "15m": "approximate",
      "12m": "approximate",
      "10m": "approximate",
    });
    expect(Math.abs(wire[index("20m")]!.txGainDbi - half[index("20m")]!.txGainDbi)).toBeLessThan(0.3);
    // No figure at all below: not the centre-fed model's, and not a nought that could be read as a poor band.
    expect(wire[index("40m")]).toMatchObject({ notModelled: true, path: null, reliability: 0, snrDbHz: 0, txGainDbi: 0 });
    // Above, the engine's figures, from a path it found.
    expect(wire[index("15m")]!.path).not.toBeNull();
    expect(wire[index("15m")]!.notModelled).toBeUndefined();
  });

  it("runs the long wire turned 90° from its broadside, so that it is the same wire hung the same way as on its half-wave band", () => {
    // The 10 m band asked of the circuit against the long wire written by hand and turned
    // to the bearing the circuit says it used: its broadside towards the other station.
    const request = { ...acceptance, txAntenna: preset("efhw-10m-horizontal"), frequenciesMhz: [28.85] };
    const circuit = engine.circuit(request);
    const bearing = initialBearingDeg(acceptance.tx, acceptance.rx);
    const file = "outpost/hand";
    instance.writeFile(`antennas/${file}`, encoder.encode(antennaFile(preset("efhw-10m-horizontal"), 28.85)));
    instance.writeFile("antennas/outpost/hand-rx", encoder.encode(antennaFile(acceptance.rxAntenna)));
    const back = Math.round(initialBearingDeg(acceptance.rx, acceptance.tx) * 10) / 10;
    const answer = instance.run<{ hours: Array<{ freqs: WireCell[] }> }>({
      task: "systems",
      tx: acceptance.tx,
      rx: acceptance.rx,
      month: acceptance.month,
      year: acceptance.year,
      ssn: acceptance.ssn,
      powerWatts: acceptance.powerWatts,
      freqs: [28.85],
      requiredSnrDb: acceptance.requiredSnrDbHz,
      noiseDbw: Math.abs(acceptance.noiseDbwAt3Mhz),
      txAntennas: [{ file, beamDeg: (Math.round(bearing * 10) / 10 + 90) % 360 }],
      rxAntennas: [{ file: "outpost/hand-rx", beamDeg: back }],
    });
    let compared = 0;
    for (const [hour, expected] of answer.hours.entries()) {
      const got = circuit.hours[hour]!.cells[0]!;
      if (expected.freqs[0]!.mode === null) continue;
      expect(got.approximate).toBe(true);
      expect(got.txGainDbi).toBeCloseTo(expected.freqs[0]!.txGainDbi!, 1);
      expect(got.reliability).toBeCloseTo(expected.freqs[0]!.reliability!, 2);
      compared++;
    }
    expect(compared).toBeGreaterThan(5);
    expect(circuit.antennas.tx).toContain("the wire running");
  });

  it("gives the horizontal 5 m wire figures on 10 m only, and is never approximate: it is never longer than a half-wave below 30 MHz", () => {
    const wire = noon({ ...acceptance, txAntenna: preset("efhw-5m-horizontal") });
    expect(wire.map((cell, at) => (cell.notModelled ? null : HF_BANDS[at]!.id)).filter((id) => id !== null)).toEqual(["10m"]);
    expect(wire.some((cell) => cell.approximate)).toBe(false);
  });

  it("gives a 20 m wire the dipole on 40 m, approximate figures from 30 m up, and none on 80 m and 60 m", () => {
    const twenty = { ...preset("efhw-10m-horizontal"), lengthM: 20 };
    expect(states(noon({ ...acceptance, txAntenna: twenty }))).toEqual({
      "80m": "n/m",
      "60m": "n/m",
      "40m": "modelled",
      "30m": "approximate",
      "20m": "approximate",
      "17m": "approximate",
      "15m": "approximate",
      "12m": "approximate",
      "10m": "approximate",
    });
  });

  it("marks a frequency by the less certain of the two ends", () => {
    const cells = noon({ ...acceptance, rxAntenna: preset("efhw-10m-horizontal") });
    expect(cells[index("40m")]!.notModelled).toBe(true);
    expect(cells[index("20m")]!.notModelled).toBeUndefined();
    expect(cells[index("15m")]!.approximate).toBe(true);
    // A 20 m wire sending to a 10 m wire on 40 m: modelled at one end, not at the other.
    const both = noon({
      ...acceptance,
      txAntenna: { ...preset("efhw-10m-horizontal"), lengthM: 20 },
      rxAntenna: preset("efhw-10m-horizontal"),
    });
    expect(both[index("40m")]!.notModelled).toBe(true);
    expect(both[index("20m")]!.approximate).toBe(true);
  });

  it("gives the vertical wire figures on every band, as the monopole of its height", () => {
    const cells = noon({ ...acceptance, txAntenna: preset("efhw-10m-vertical") });
    expect(cells.every((cell) => cell.notModelled === undefined && cell.approximate === undefined)).toBe(true);
    // London to Birmingham leaves steeply, where a half-wave vertical sends less than a
    // quarter-wave one (seen in the patterns above: 5.7 dB less at 60°).
    const wire = cells[index("20m")]!;
    const quarter = noon({ ...acceptance, txAntenna: preset("vertical") })[index("20m")]!;
    expect(wire.takeoffDeg).toBeGreaterThan(50);
    expect(wire.txGainDbi).toBeLessThan(quarter.txGainDbi - 2);
    // And on 80 m, where 10 m of wire is an eighth of a wavelength, it is weaker again.
    expect(cells[index("80m")]!.txGainDbi).toBeLessThan(
      noon({ ...acceptance, txAntenna: preset("vertical") })[index("80m")]!.txGainDbi - 3,
    );
  });

  it("adds a person's gain and takes off feedline loss on both wires, decibel for decibel, the long wire included", () => {
    for (const [id, band] of [
      ["efhw-10m-horizontal", "20m"],
      ["efhw-10m-vertical", "20m"],
      ["efhw-10m-horizontal", "15m"],
    ] as const) {
      const plain = noon({ ...acceptance, txAntenna: preset(id) })[index(band)]!;
      const lossy = noon({ ...acceptance, txAntenna: { ...preset(id), feedlineLossDb: 1.5 } })[index(band)]!;
      expect(plain.path).not.toBeNull();
      expect(plain.txGainDbi - lossy.txGainDbi).toBeCloseTo(1.5, 1);
      expect(plain.snrDbHz - lossy.snrDbHz).toBeCloseTo(1.5, 1);
      expect(plain.signalDbw - lossy.signalDbw).toBeCloseTo(1.5, 1);
      expect(lossy.reliability).toBeLessThanOrEqual(plain.reliability);
    }
  });

  it("says how each was run", () => {
    const flat = engine.circuit({ ...acceptance, txAntenna: preset("efhw-10m-horizontal") }).antennas.tx;
    expect(flat).toContain("End-fed wire 10 m long, horizontal, 6 m above average ground, broadside towards 313° (the other station)");
    expect(flat).toContain("type 23");
    expect(flat).toContain("from 13.5 to 16.5 MHz");
    expect(flat).toContain(
      "Above 16.5 MHz, where it is longer, approximate: run as VOACAP's sloping long wire (type 41) laid level, the wire running 43° to 223°",
    );
    expect(flat).toContain("Below 13.5 MHz, where it is shorter, not modelled");
    expect(flat).toContain("matching unit's loss is not modelled");
    const five = engine.circuit({ ...acceptance, txAntenna: preset("efhw-5m-horizontal") }).antennas.tx;
    expect(five).not.toContain("type 41");
    const upright = engine.circuit({ ...acceptance, txAntenna: preset("efhw-5m-vertical") }).antennas.tx;
    expect(upright).toContain("End-fed wire 5 m long, vertical with its bottom end at the ground");
    expect(upright).toContain("type 22");
    expect(upright).toContain("matching unit's loss is not modelled");
  });

  it("prints the engine's page for the frequencies it gives figures on, a page of its own for each approximate one, and no page when there are none", () => {
    const request = { ...acceptance, txAntenna: preset("efhw-10m-horizontal"), frequenciesMhz: [7.1, 14.18, 21.22] };
    const page = engine.listing(request);
    const frequencyLines = page.split("\n").filter((line) => /^\s+1\.0 .* FREQ$/.test(line));
    expect(frequencyLines.length).toBe(2);
    expect(frequencyLines[0]).toContain("14.2");
    expect(page).not.toMatch(/^\s+1\.0 .*\b7\.1\b.* FREQ$/m);
    expect(page).toContain("Outpost: 21.22 MHz, approximate. The transmitting antenna is a level wire longer than a half-wave");
    expect(() => engine.listing({ ...request, frequenciesMhz: [7.1, 3.65] })).toThrow(/no page to print/);
  });
});
