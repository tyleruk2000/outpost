/**
 * The propagation engine itself, with no server around it: that it gives what the
 * original program gives, that Outpost's antenna files mean what they are taken to
 * mean, and that damaged or missing data is refused rather than predicted from.
 *
 * Needs VOACAP's coefficients in engines/voacap/.cache (`voacap-data.ts`); without them
 * the tests that run the engine are reported as skipped, and those that check it refuses
 * to run still run.
 */
import fs from "node:fs";
import path from "node:path";
import { ANTENNA_PRESETS, type AntennaSpec } from "@outpost/shared";
import { afterAll, describe, expect, it } from "vitest";
import { type CircuitRequest, EngineUnavailable } from "../src/modules/propagation/engine.ts";
import { antennaFile } from "../src/modules/propagation/voacap/antenna-files.ts";
import {
  adoptCoefficients,
  coefficientsManifest,
  EngineDataMissing,
  workingCopyDir,
} from "../src/modules/propagation/voacap/coefficients.ts";
import { createVoacapEngine, FREQUENCIES_PER_RUN } from "../src/modules/propagation/voacap/engine.ts";
import { loadDataset, loadEngineFile, voacapPaths } from "../src/modules/propagation/voacap/files.ts";
import { VoacapInstance } from "../src/modules/propagation/voacap/instance.ts";
import { REFERENCE_CASES } from "./fixtures/propagation/cases.ts";
import { tempDir } from "./temp.ts";
import { describeWithVoacapData, seedVoacapData, VOACAP_CACHE, voacapDataAbsent } from "./voacap-data.ts";

const scratch = tempDir("outpost-hf-");
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

seedVoacapData(path.join(scratch, "data"));
const paths = voacapPaths(path.join(scratch, "data"));
const engine = voacapDataAbsent ? (null as never) : createVoacapEngine(paths);
const preset = (id: string): AntennaSpec => ANTENNA_PRESETS.find((item) => item.id === id)!.spec;
const acceptance = REFERENCE_CASES[0]!.request;

describeWithVoacapData("reference circuits", () => {
  // Expected values: the text printed by voacapl (the Fortran VOACAP, commit c12a98b,
  // version 16.1207W) built with gfortran 12.2 -O2 -ffp-contract=off on Linux arm64, run
  // on 16 November 2026 from the decks and antenna files `make-decks.ts` writes.
  // Tolerance: none. The listing is compared as text, every character of 683 lines.
  for (const item of REFERENCE_CASES) {
    it(`prints what the Fortran original prints: ${item.id}`, () => {
      const expected = fs.readFileSync(path.join(import.meta.dirname, "fixtures/propagation", `${item.id}.voacapl.out`), "utf8");
      const listing = engine.listing(item.request);
      expect(listing.split("\n").length).toBe(expected.split("\n").length);
      expect(listing).toBe(expected);
    });
  }

  it("gives as data the figures the listing prints", () => {
    const result = engine.circuit(acceptance);
    const listing = engine.listing(acceptance).split("\n");
    // Hour 12's block: the row after "12.0 ... FREQ" is MODE, then TANGLE; SNR is nine rows on, REL eleven.
    const start = listing.findIndex((line) => /^\s+12\.0 .* FREQ$/.test(line));
    const row = (label: string) =>
      listing
        .slice(start, start + 23)
        .find((line) => line.trimEnd().endsWith(label))!
        .trim()
        .split(/\s+/);
    const noon = result.hours[11]!;
    expect(noon.utc).toBe(12);
    expect(Number(listing[start]!.trim().split(/\s+/)[1])).toBeCloseTo(noon.mufMhz, 1);
    // The listing's first column is the MUF itself; the first frequency asked for is the second.
    expect(Number(row("SNR")[1])).toBe(Math.round(noon.cells[0]!.snrDbHz));
    expect(Number(row("REL")[1])).toBeCloseTo(noon.cells[0]!.reliability, 2);
    expect(Number(row("TANGLE")[1])).toBeCloseTo(noon.cells[0]!.takeoffDeg, 1);
    expect(row("MODE")[1] + row("MODE")[2]!).toContain(noon.cells[0]!.layer);
  });

  it("measures the path as the rest of Outpost does", () => {
    const result = engine.circuit(acceptance);
    // 162.4 km and 312.8 degrees are what VOACAP prints in the listing's header.
    expect(result.distanceKm).toBeCloseTo(162.4, 1);
    expect(result.bearingDeg).toBeCloseTo(312.8, 1);
    expect(result.backBearingDeg).toBeCloseTo(131.4, 1);
    expect(result.hours).toHaveLength(24);
    expect(result.hours.map((hour) => hour.utc)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });

  it("takes any number of frequencies, eleven to a run, and answers each the same as alone", () => {
    const many = Array.from({ length: 2 * FREQUENCIES_PER_RUN + 3 }, (_, index) => 3 + index);
    const together = engine.circuit({ ...acceptance, frequenciesMhz: many });
    expect(together.hours[11]!.cells.map((cell) => cell.mhz)).toEqual(many);
    const alone = engine.circuit({ ...acceptance, frequenciesMhz: [many[15]!] });
    expect(together.hours[11]!.cells[15]).toEqual(alone.hours[11]!.cells[0]);
  });

  it("does not call a short path open at night because it is short", () => {
    const result = engine.circuit({ ...acceptance, frequenciesMhz: [7.1] });
    const night = result.hours[2]!; // 03:00 UTC
    const day = result.hours[11]!; // 12:00 UTC
    expect(night.mufMhz).toBeLessThan(7.1);
    expect(night.cells[0]!.mufDays).toBeLessThan(0.05);
    expect(night.cells[0]!.reliability).toBeLessThan(0.05);
    expect(day.mufMhz).toBeGreaterThan(7.1);
    expect(day.cells[0]!.reliability).toBeGreaterThan(night.cells[0]!.reliability);
  });

  it("gives the ionosphere over the middle of the path, and more sunspots raise foF2", () => {
    const low = engine.ionosphere({ ...acceptance, ssn: 20 });
    const high = engine.ionosphere({ ...acceptance, ssn: 150 });
    expect(low).toHaveLength(24);
    expect(high[11]!.foF2).toBeGreaterThan(low[11]!.foF2);
    expect(low[11]!.foF2).toBeGreaterThan(low[2]!.foF2);
    expect(low[11]!.hmF2).toBeGreaterThan(150);
    expect(low[11]!.sunZenithDeg).toBeLessThan(low[2]!.sunZenithDeg);
  });
});

describeWithVoacapData("antenna files", () => {
  const noon = (request: CircuitRequest) => engine.circuit({ ...request, frequenciesMhz: [3.65, 7.1, 14.18] }).hours[11]!.cells;
  const dipole = preset("low-dipole");

  it("adds a person's gain and takes off their feedline loss, decibel for decibel", () => {
    const plain = noon(acceptance);
    const changed = noon({ ...acceptance, txAntenna: { ...dipole, gainDb: 4, feedlineLossDb: 1 } });
    for (const [index, cell] of changed.entries()) {
      expect(cell.txGainDbi - plain[index]!.txGainDbi).toBeCloseTo(3, 1);
      expect(cell.snrDbHz - plain[index]!.snrDbHz).toBeCloseTo(3, 0);
    }
  });

  it("reads a height in metres: a higher dipole is a different antenna", () => {
    const low = noon(acceptance);
    const high = noon({ ...acceptance, txAntenna: preset("dipole-10m") });
    expect(high[1]!.txGainDbi).not.toBeCloseTo(low[1]!.txGainDbi, 1);
  });

  it("gives an isotropic antenna the gain asked for at every angle", () => {
    const cells = noon({ ...acceptance, txAntenna: { ...preset("isotropic"), gainDb: -3.5 } });
    for (const cell of cells) expect(cell.txGainDbi).toBeCloseTo(-3.5, 1);
  });

  it("runs a vertical as a poor antenna for a steep path", () => {
    const vertical = noon({ ...acceptance, txAntenna: preset("vertical") });
    const flat = noon(acceptance);
    expect(vertical[1]!.takeoffDeg).toBeGreaterThan(60);
    expect(vertical[1]!.txGainDbi).toBeLessThan(flat[1]!.txGainDbi - 6);
  });

  it("turns a dipole broadside to the other station unless told where it faces", () => {
    expect(engine.circuit(acceptance).antennas.tx).toContain("broadside towards 313° (the other station)");
    const turned = engine.circuit({ ...acceptance, txAntenna: { ...dipole, broadsideDeg: 40 } });
    expect(turned.antennas.tx).toContain("broadside towards 40°");
    expect(turned.deck).toMatch(/ANTENNA {7}1 .*\[outpost\/tx {11}\] 40\.0/);
  });

  it("says when an antenna is an approximation", () => {
    expect(engine.circuit({ ...acceptance, txAntenna: preset("inverted-v") }).antennas.tx).toContain("approximation");
    expect(antennaFile(preset("efhw"))).toContain("  23    [ 2] Antenna Type");
  });
});

describe("the engine's files, without the coefficients", () => {
  const manifest = coefficientsManifest();

  it("refuses to load, says what is missing, and makes nothing up", () => {
    const empty = voacapPaths(path.join(scratch, "nothing-here"));
    expect(() => createVoacapEngine(empty)).toThrow(EngineDataMissing);
    expect(() => createVoacapEngine(empty)).toThrow(
      /VOACAP's ionospheric and noise maps are not on this computer yet \(15 files, 559 kB\)/,
    );
  });

  it("refuses a set that is not whole", () => {
    const dir = workingCopyDir(path.join(scratch, "partial"));
    fs.mkdirSync(path.join(dir, "coeffs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "coeffs/coeff01w.bin"), "a beginning");
    expect(() => createVoacapEngine(voacapPaths(path.join(scratch, "partial")))).toThrow(
      /coeffs\/coeff01w\.bin does not match its checksum/,
    );
  });

  it("lists, for each file, a size, an offset and a checksum, and the bundle adds up", () => {
    expect(manifest.files).toHaveLength(15);
    expect(manifest.bytes).toBe(559_336);
    let offset = 0;
    for (const file of manifest.files) {
      expect(file.offset).toBe(offset);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      offset += file.bytes;
    }
    expect(offset).toBe(manifest.bytes);
    // The pinned address is the engine's own repository at the commit the engine was built from.
    expect(manifest.source.baseUrl).toBe(
      "https://raw.githubusercontent.com/jonathanmcsweet/hfcast-engine/bf34e8f9f375e190ed43fcac19f25d800992e0e6/embedded/",
    );
  });

  it("ships none of them", () => {
    for (const file of manifest.files) expect(fs.existsSync(path.join(paths.shippedDir, "itshfbc", file.path))).toBe(false);
  });
});

describeWithVoacapData("the engine's files", () => {
  /** A data directory with its own copy, as a download or a set-up leaves it. */
  const copyData = (name: string) => {
    const dir = path.join(scratch, name);
    seedVoacapData(dir);
    return dir;
  };

  it("matches what was recorded when it was built", () => {
    const { manifest, wasm } = loadEngineFile(paths);
    expect(wasm.length).toBe(manifest.wasm.bytes);
    expect(manifest.model).toMatch(/^VOACAP Version/);
    const dataset = loadDataset(paths);
    // 29 shipped (antennas and the version file) and 15 fetched: the 44 the engine has always read.
    expect(dataset.files).toHaveLength(44);
    expect(dataset.bytes).toBe(14_548 + 559_336);
  });

  it("refuses a damaged coefficient file and names it", () => {
    const dir = copyData("damaged");
    const file = path.join(workingCopyDir(dir), "coeffs/coeff11w.bin");
    const bytes = fs.readFileSync(file);
    bytes[1000] = bytes[1000]! ^ 0xff;
    fs.writeFileSync(file, bytes);
    expect(() => createVoacapEngine(voacapPaths(dir))).toThrow(EngineUnavailable);
    expect(() => createVoacapEngine(voacapPaths(dir))).toThrow(/coeffs\/coeff11w\.bin does not match its checksum/);
  });

  it("refuses a missing file and says which", () => {
    const dir = copyData("missing");
    fs.rmSync(path.join(workingCopyDir(dir), "coeffs/fof2CCIR.daw"));
    expect(() => createVoacapEngine(voacapPaths(dir))).toThrow(/coeffs\/fof2CCIR\.daw is missing/);
  });

  it("takes over an earlier installation's copy, checked, and leaves that copy as it was", () => {
    const manifest = coefficientsManifest();
    // An app folder from before: engines/voacap/data/itshfbc with the coefficients in it.
    const oldApp = path.join(scratch, "old-app/engines/voacap/data/itshfbc");
    fs.cpSync(VOACAP_CACHE, oldApp, { recursive: true });
    const dataDir = path.join(scratch, "adopting");
    const adopted = adoptCoefficients(dataDir, manifest, [path.join(scratch, "nowhere"), oldApp]);
    expect(adopted).toMatchObject({ how: "adopted", from: oldApp, sha256: manifest.sha256 });
    expect(fs.existsSync(path.join(oldApp, "coeffs/coeff01w.bin"))).toBe(true);
    expect(createVoacapEngine(voacapPaths(dataDir)).circuit(acceptance).hours[11]).toEqual(engine.circuit(acceptance).hours[11]);
    // Once there, it is not taken again.
    expect(adoptCoefficients(dataDir, manifest, [oldApp])).toBeNull();
  });

  it("takes over nothing that does not match", () => {
    const manifest = coefficientsManifest();
    const oldApp = path.join(scratch, "altered-app/itshfbc");
    fs.cpSync(VOACAP_CACHE, oldApp, { recursive: true });
    fs.writeFileSync(path.join(oldApp, "coeffs/coeff03w.bin"), "altered");
    const dataDir = path.join(scratch, "not-adopting");
    expect(adoptCoefficients(dataDir, manifest, [oldApp])).toBeNull();
    expect(fs.existsSync(workingCopyDir(dataDir))).toBe(false);
  });

  it("gives the engine no way to read or write the computer's files", () => {
    const { wasm } = loadEngineFile(paths);
    const instance = new VoacapInstance(wasm, loadDataset(paths).files);
    // A file outside the data it was handed does not exist for it, even one that is really on the computer.
    const ask = (file: string) => () =>
      instance.run({
        task: "systems",
        tx: { lat: 51.5, lon: 0 },
        rx: { lat: 52.5, lon: -2 },
        month: 6,
        year: 2026,
        ssn: 50,
        powerWatts: 5,
        freqs: [7.1],
        requiredSnrDb: 24,
        noiseDbw: 145,
        txAntennas: [{ file }],
      });
    expect(fs.existsSync("/etc/hosts")).toBe(true);
    expect(ask("../../../etc/hosts")).toThrow(/No such file/);
    expect(ask("/etc/hosts")).toThrow(/No such file/);
    expect(instance.usable).toBe(true);
  });
});
