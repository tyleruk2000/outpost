/**
 * A wire of a stated length, put to the real engine: what VOACAP's antenna models do
 * with a length in metres, which is what decides how Outpost runs an end-fed wire and
 * where it gives no figure.
 *
 * The engine does not hand out a pattern, only the gain at the angle a signal leaves at.
 * So a pattern is sampled here: one antenna file, one frequency, paths of twelve lengths
 * through the 24 hours, which between them leave at angles from a few degrees to about
 * 75. Gains are then compared at the same whole degree. Every expected figure below was
 * read off this engine on 16 November 2026 (hfcast 2.14.0, VOACAP 16.1207W); the
 * tolerances are stated with each.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ANTENNA_PRESETS, type AntennaSpec, HF_BANDS, initialBearingDeg } from "@outpost/shared";
import { afterAll, describe, expect, it } from "vitest";
import type { CircuitRequest } from "../src/modules/propagation/engine.ts";
import { antennaFile } from "../src/modules/propagation/voacap/antenna-files.ts";
import { createVoacapEngine } from "../src/modules/propagation/voacap/engine.ts";
import { loadDataset, loadEngineFile, voacapPaths } from "../src/modules/propagation/voacap/files.ts";
import { VoacapInstance } from "../src/modules/propagation/voacap/instance.ts";
import { REFERENCE_CASES } from "./fixtures/propagation/cases.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-hf-wire-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

const paths = voacapPaths(path.join(scratch, "data"));
const engine = createVoacapEngine(paths);
const instance = new VoacapInstance(loadEngineFile(paths).wasm, loadDataset(paths).files);
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

describe("VOACAP's horizontal dipole (type 23) given a length in metres", () => {
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

describe("VOACAP's vertical monopole (type 22) given a height", () => {
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

describe("VOACAP's sloping long wire (type 41), which Outpost does not use for the horizontal wire", () => {
  it("laid level as a half-wave reads more than a decibel below the dipole model of the same wire", () => {
    // Its pattern is a wire fed at one end, but it works its gain out against the wire as
    // a monopole over perfect ground. Seen broadside at 14.18 MHz, 6 m up: 1.2 to 1.4 dB
    // below type 23 at every angle. Which of the two is right for a whole wavelength
    // cannot be checked against anything else in the engine.
    const { mean, most } = apart(pattern(longWire(0, -0.5, 6), 14.18, 90), pattern(dipole(-0.5, 6), 14.18));
    expect(mean).toBeLessThan(-1);
    expect(mean).toBeGreaterThan(-1.7);
    expect(most).toBeLessThan(1.8);
  });
});

describe("an end-fed wire of a stated length, as Outpost runs it", () => {
  const bands = HF_BANDS.map((band) => band.mhz);
  const noon = (request: CircuitRequest) => engine.circuit({ ...request, frequenciesMhz: bands }).hours[11]!.cells;
  const index = (id: string) => HF_BANDS.findIndex((band) => band.id === id);

  it("writes the wire's length in metres into the engine's own two models", () => {
    expect(antennaFile(preset("efhw-10m-horizontal"))).toContain("  23    [ 2] Antenna Type");
    expect(antennaFile(preset("efhw-10m-horizontal"))).toContain(" 10.00  [ 6] Antenna Length:");
    expect(antennaFile(preset("efhw-10m-horizontal"))).toContain("  6.00  [ 7] Antenna Height:");
    expect(antennaFile(preset("efhw-5m-vertical"))).toContain("  22    [ 2] Antenna Type");
    expect(antennaFile(preset("efhw-5m-vertical"))).toContain("  5.00  [ 6] Antenna Height:");
    expect(() => antennaFile({ ...preset("efhw-5m-vertical"), lengthM: undefined })).toThrow(/without its length/);
  });

  it("leaves the antenna that follows the frequency exactly as it was", () => {
    // What was "End-fed half-wave, horizontal at 6 m": still the half-wave dipole at 6 m.
    expect(antennaFile(preset("efhw"))).toBe(antennaFile({ ...preset("low-dipole"), heightM: 6 }));
    expect(antennaFile(preset("efhw"))).toContain("  -.50  [ 6] Antenna Length:");
  });

  it("gives the horizontal 10 m wire figures on 20 m only, and those of a half-wave dipole at its height", () => {
    const wire = noon({ ...acceptance, txAntenna: preset("efhw-10m-horizontal") });
    const half = noon({ ...acceptance, txAntenna: { ...preset("low-dipole"), heightM: 6 } });
    for (const [at, band] of HF_BANDS.entries()) {
      if (band.id === "20m") {
        expect(wire[at]!.notModelled).toBeUndefined();
        expect(wire[at]!.txGainDbi).toBeCloseTo(half[at]!.txGainDbi, 0);
        expect(Math.abs(wire[at]!.txGainDbi - half[at]!.txGainDbi)).toBeLessThan(0.3);
        expect(wire[at]!.path).toBe(half[at]!.path);
      } else {
        // No figure at all: not the centre-fed model's, and not a nought that could be read as a poor band.
        expect(wire[at]).toMatchObject({ mhz: band.mhz, notModelled: true, path: null, reliability: 0, snrDbHz: 0, txGainDbi: 0 });
      }
    }
  });

  it("gives the horizontal 5 m wire figures on 10 m only", () => {
    const wire = noon({ ...acceptance, txAntenna: preset("efhw-5m-horizontal") });
    expect(wire.map((cell, at) => (cell.notModelled ? null : HF_BANDS[at]!.id)).filter((id) => id !== null)).toEqual(["10m"]);
  });

  it("blanks a frequency when it is the receiving antenna that is not modelled", () => {
    const cells = noon({ ...acceptance, rxAntenna: preset("efhw-10m-horizontal") });
    expect(cells[index("40m")]!.notModelled).toBe(true);
    expect(cells[index("20m")]!.notModelled).toBeUndefined();
  });

  it("gives the vertical wire figures on every band, as the monopole of its height", () => {
    const cells = noon({ ...acceptance, txAntenna: preset("efhw-10m-vertical") });
    expect(cells.every((cell) => cell.notModelled === undefined)).toBe(true);
    // London to Birmingham leaves steeply, where a half-wave vertical sends less than a
    // quarter-wave one (seen in the patterns above: 5.7 dB less at 60°).
    const wire = cells[index("20m")]!;
    const quarter = noon({ ...acceptance, txAntenna: preset("vertical") })[index("20m")]!;
    expect(wire.takeoffDeg).toBeGreaterThan(50);
    expect(wire.txGainDbi).toBeLessThan(quarter.txGainDbi - 2);
    // And on 80 m, where 10 m of wire is an eighth of a wavelength, it is weaker again.
    expect(cells[index("80m")]!.txGainDbi).toBeLessThan(noon({ ...acceptance, txAntenna: preset("vertical") })[index("80m")]!.txGainDbi - 3);
  });

  it("adds a person's gain and takes off feedline loss on both wires, decibel for decibel", () => {
    for (const id of ["efhw-10m-horizontal", "efhw-10m-vertical"]) {
      const plain = noon({ ...acceptance, txAntenna: preset(id) })[index("20m")]!;
      const lossy = noon({ ...acceptance, txAntenna: { ...preset(id), feedlineLossDb: 1.5 } })[index("20m")]!;
      expect(plain.txGainDbi - lossy.txGainDbi).toBeCloseTo(1.5, 1);
    }
  });

  it("says how each was run", () => {
    const flat = engine.circuit({ ...acceptance, txAntenna: preset("efhw-10m-horizontal") }).antennas.tx;
    expect(flat).toContain("End-fed wire 10 m long, horizontal, 6 m above average ground, broadside towards 313° (the other station)");
    expect(flat).toContain("type 23");
    expect(flat).toContain("from 13.5 to 16.5 MHz");
    expect(flat).toContain("no figure is given on other frequencies");
    expect(flat).toContain("matching unit's loss is not modelled");
    const upright = engine.circuit({ ...acceptance, txAntenna: preset("efhw-5m-vertical") }).antennas.tx;
    expect(upright).toContain("End-fed wire 5 m long, vertical with its bottom end at the ground");
    expect(upright).toContain("type 22");
    expect(upright).toContain("matching unit's loss is not modelled");
  });

  it("prints the engine's page for the frequencies it is modelled on, and no page when there are none", () => {
    const request = { ...acceptance, txAntenna: preset("efhw-10m-horizontal"), frequenciesMhz: [7.1, 14.18, 21.22] };
    const page = engine.listing(request);
    const frequencies = page.split("\n").find((line) => /^\s+1\.0 .* FREQ$/.test(line))!;
    expect(frequencies).toContain("14.2");
    expect(frequencies).not.toContain("7.1");
    expect(frequencies).not.toContain("21.2");
    expect(() => engine.listing({ ...request, frequenciesMhz: [7.1, 21.22] })).toThrow(/no page to print/);
  });
});
