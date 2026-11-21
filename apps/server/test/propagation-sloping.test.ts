/**
 * A sloping wire, and the other shapes a portable wire is put up in, put to the real
 * engine: what VOACAP's sloping long wire (type 41) does at a slope, the checks that can
 * be made of its level, and why its inverted-L (types 28 and 38) and tilted-dipole
 * (type 44) models are not used. Every expected figure below was read off this engine on
 * 16 November 2026 (hfcast 2.14.0, VOACAP 16.1207W); see docs/hf-propagation.md, "A
 * sloping wire".
 *
 * The engine gives no pattern, only the gain at the angle a signal leaves at, so a
 * pattern is sampled as in propagation-wire.test.ts. One check is new here: the power in
 * a whole pattern. Paths from 8 to 6500 km leave at angles from about 1° to 89°; with the
 * antenna turned in steps of 10° that samples the sky above it, and the gain summed over
 * it (each degree of elevation weighted by its share of the sky) is the power the model
 * sends out for the power it is fed. Over a perfect ground a lossless antenna sends out
 * exactly what it is fed: 0 dB. The engine takes a ground of any conductivity, and one of
 * 10 000 S/m is perfect for this purpose.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ANTENNA_PRESETS, type AntennaSpec, HF_BANDS, initialBearingDeg, type PredictionCell, runWords } from "@outpost/shared";
import { afterAll, expect, it } from "vitest";
import type { CircuitRequest } from "../src/modules/propagation/engine.ts";
import { antennaFile } from "../src/modules/propagation/voacap/antenna-files.ts";
import { createVoacapEngine, type WireCell } from "../src/modules/propagation/voacap/engine.ts";
import { loadDataset, loadEngineFile, voacapPaths } from "../src/modules/propagation/voacap/files.ts";
import { VoacapInstance } from "../src/modules/propagation/voacap/instance.ts";
import { REFERENCE_CASES } from "./fixtures/propagation/cases.ts";
import { tempDir } from "./temp.ts";
import { describeWithVoacapData, seedVoacapData, voacapDataAbsent } from "./voacap-data.ts";

// Made only when there is data to test with: with every test skipped, Vitest runs no afterAll, so a folder made
// regardless was left behind and failed the run's check for leftovers.
const scratch = voacapDataAbsent ? path.join(os.tmpdir(), "outpost-hf-sloping-unused") : tempDir("outpost-hf-sloping-");
afterAll(() => {
  if (!voacapDataAbsent) fs.rmSync(scratch, { recursive: true, force: true });
});
seedVoacapData(path.join(scratch, "data"));
const paths = voacapPaths(path.join(scratch, "data"));
const engine = voacapDataAbsent ? (null as never) : createVoacapEngine(paths);
const instance = voacapDataAbsent ? (null as never) : new VoacapInstance(loadEngineFile(paths).wasm, loadDataset(paths).files);
const preset = (id: string): AntennaSpec => ANTENNA_PRESETS.find((item) => item.id === id)!.spec;
const acceptance = REFERENCE_CASES[0]!.request;

// ── Antenna files, over average ground unless a ground is given ─────────────

type Ground = [dielectric: number, conductivity: number];
const AVERAGE: Ground = [15, 0.005];
const SEA: Ground = [80, 5];
/** A ground that reflects everything: the engine takes any conductivity. */
const PERFECT: Ground = [80, 10_000];
const num = (value: number, places = 3) => value.toFixed(places).padStart(6);
function file(type: number, params: number[], labels: string[], ground: Ground = AVERAGE): string {
  const count = 5 + params.length;
  return [
    "Test",
    `${String(count).padStart(2)}     ${count} parameters`,
    "  0.00  [ 1] Max Gain dBi..:",
    `  ${type}    [ 2] Antenna Type..:`,
    `${ground[0].toFixed(0).padStart(4)}    [ 3] Dielectric....:`,
    `${ground[1].toFixed(5).padStart(6)}  [ 4] Conductivity..:`,
    "10.000  [ 5] Operating Freq:",
    ...params.map((value, at) => `${num(value)}  [${String(6 + at).padStart(2)}] ${labels[at]}`),
    "",
  ].join("\n");
}
const wavelengths = (metres: number, mhz: number) => (metres * mhz) / 299.792458;
/** Type 41, the ITS-78 sloping long wire: slope, length and feed height, the last two in wavelengths at `mhz`. */
const sloping = (slopeDeg: number, metres: number, feedM: number, mhz: number, ground?: Ground) =>
  file(
    41,
    [slopeDeg, -wavelengths(metres, mhz), -wavelengths(feedM, mhz)],
    ["Slope from Hor:", "Wire Length   :", "Feed Height   :"],
    ground,
  );
/** Type 44, the ITS-78 arbitrary tilted dipole: tilt, length and the height of its centre. */
const tilted = (tiltDeg: number, metres: number, centreM: number, mhz: number, ground?: Ground) =>
  file(
    44,
    [tiltDeg, -wavelengths(metres, mhz), -wavelengths(centreM, mhz)],
    ["Tilt from Horz:", "Length        :", "Feed Height   :"],
    ground,
  );
/** Types 28 (ITSA-1) and 38 (ITS-78), the inverted L: the length along the top and the height of the upright, in metres. */
const invertedL = (type: 28 | 38, alongM: number, upM: number, ground?: Ground) =>
  file(type, [alongM, upM], ["Antenna Length:", "Antenna Height:"], ground);
/** Type 22, the vertical monopole, its height in metres or (negative) wavelengths. */
const monopole = (height: number, ground?: Ground) => file(22, [height, 0], ["Antenna Height:", "Gain ab dipole:"], ground);
const sin = (degrees: number) => Math.sin((degrees * Math.PI) / 180);

// ── Sampling ────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
let files = 0;
const write = (text: string) => {
  const name = `outpost/slope${files++}`;
  instance.writeFile(`antennas/${name}`, encoder.encode(text));
  return name;
};
const TX = { name: "A", lat: 45, lon: 0 };
const east = (km: number) => ({ name: "B", lat: 45, lon: km / 111.19 / Math.cos((45 * Math.PI) / 180) });
/** Take-off angle and gain for every hour of one path, the antenna's reference direction turned `offDeg` from the path. */
function samples(name: string, mhz: number, km: number, offDeg: number): Array<[number, number]> {
  const rx = east(km);
  const answer = instance.run<{ hours: Array<{ freqs: Array<{ mode: string | null; takeoffDeg: number; txGainDbi: number }> }> }>({
    task: "systems",
    tx: TX,
    rx,
    month: 6,
    year: 2026,
    ssn: 100,
    powerWatts: 100,
    freqs: [mhz],
    requiredSnrDb: 24,
    noiseDbw: 145,
    txAntennas: [{ file: name, beamDeg: (initialBearingDeg(TX, rx) + offDeg + 360) % 360 }],
    rxAntennas: [{ file: "default/isotrope" }],
  });
  return answer.hours.map((hour) => hour.freqs[0]!).flatMap((cell) => (cell.mode === null ? [] : [[cell.takeoffDeg, cell.txGainDbi]]));
}

const LOW_PATHS_KM = [150, 300, 500, 700, 900, 1200, 1500, 2000, 2500, 3000, 3800, 6000];
/** The mean gain at take-off angles from 5° to 30°, where HF paths of any length leave, in one direction. */
function lowAngles(text: string, mhz: number, offDeg: number): number {
  const name = write(text);
  const gains = LOW_PATHS_KM.flatMap((km) => samples(name, mhz, km, offDeg))
    .filter(([angle]) => angle >= 5 && angle <= 30)
    .map(([, gain]) => gain);
  return gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
}

const SKY_PATHS_KM = [
  8, 12, 16, 20, 25, 30, 40, 50, 60, 75, 90, 110, 130, 160, 200, 250, 300, 380, 460, 550, 650, 800, 1000, 1200, 1500, 1800, 2200, 2700,
  3200, 3900, 5000, 6500,
];
/**
 * The power a model sends out for the power it is fed, in dB: its gain summed over the sky.
 * The pattern of every antenna here is the same either side of the upright plane through
 * its reference direction, so half the sky is sampled, 0° to 180° in steps of 10°. Each
 * whole degree of elevation is the mean of the gains seen in it, read between the nearest
 * where none was, and from the lowest seen down to the engine's floor at the horizon.
 */
function powerOut(text: string, mhz: number): number {
  const name = write(text);
  let sum = 0;
  let weight = 0;
  for (let off = 0; off <= 180; off += 10) {
    const byDegree = new Map<number, number[]>();
    for (const km of SKY_PATHS_KM)
      for (const [angle, gain] of samples(name, mhz, km, off)) {
        const degree = Math.floor(angle);
        byDegree.set(degree, [...(byDegree.get(degree) ?? []), gain]);
      }
    const known = [...byDegree.entries()]
      .map(([degree, gains]) => [degree + 0.5, gains.reduce((a, b) => a + b, 0) / gains.length] as const)
      .sort((a, b) => a[0] - b[0]);
    const at = (angle: number) => {
      const first = known[0]!;
      if (angle <= first[0]) return -30 + ((first[1] + 30) * angle) / first[0];
      const after = known.findIndex(([degree]) => degree >= angle);
      if (after < 0) return known[known.length - 1]![1];
      const [a0, g0] = known[after - 1]!;
      const [a1, g1] = known[after]!;
      return g0 + ((g1 - g0) * (angle - a0)) / (a1 - a0);
    };
    const side = off === 0 || off === 180 ? 0.5 : 1;
    for (let angle = 0.5; angle < 90; angle++) {
      const share = Math.cos((angle * Math.PI) / 180) * side;
      sum += 10 ** (at(angle) / 10) * share;
      weight += share;
    }
  }
  // The mean gain over the half of the sphere above the ground is 2 (3 dB) for an antenna that sends out all it is fed.
  return 10 * Math.log10(sum / weight / 2);
}

// ── VOACAP's sloping long wire at a slope ───────────────────────────────────

describeWithVoacapData("VOACAP's sloping long wire (type 41) at a slope", () => {
  // The 20 m wire as the preset puts it up: fed 1.5 m up, rising at 25° to about 10 m.
  const twenty = (mhz: number, ground?: Ground) => sloping(25, 20, 1.5, mhz, ground);

  it("is weak towards its high end at low angles, on its half-wave band and above", () => {
    // Seen at 5 to 30°, "up" towards the high end, "down" the other way: 7.1 MHz (0.47
    // wavelengths) up -14.3, broadside -4.1, down -4.5 dBi; 14.18 MHz (0.95) up -12.3,
    // broadside -6.6, down -1.0; 21.22 (1.42) up -9.6, down 0.5; 28.85 (1.92) up -8.8, down 0.4.
    for (const mhz of [7.1, 14.18, 21.22, 28.85]) {
      const up = lowAngles(twenty(mhz), mhz, 0);
      const down = lowAngles(twenty(mhz), mhz, 180);
      expect(down - up).toBeGreaterThan(8);
    }
    // On the half-wave band broadside is about as strong as down the slope; a whole wavelength long, broadside is weak.
    expect(Math.abs(lowAngles(twenty(7.1), 7.1, 90) - lowAngles(twenty(7.1), 7.1, 180))).toBeLessThan(1.5);
    expect(lowAngles(twenty(14.18), 14.18, 180) - lowAngles(twenty(14.18), 14.18, 90)).toBeGreaterThan(4);
  });

  it("is the same towards either end over a perfect ground: the difference comes from the ground's reflection", () => {
    // A half-wave sloping wire carries a current the same about its middle, so over a
    // ground that reflects everything its pattern is the same either way along it. Seen:
    // equal to 0.05 dB at 20° and 45°. Over real ground the reflection of the upright part
    // of the field is weak at low angles, and the wire's own field is not the same both ways.
    for (const slope of [20, 45]) {
      const text = sloping(slope, 20, 1, 7.1, PERFECT);
      expect(Math.abs(lowAngles(text, 7.1, 0) - lowAngles(text, 7.1, 180))).toBeLessThan(0.1);
    }
  });

  it("turns over as it steepens: at 45° and more the high end's side is no longer the weaker one on 12 m", () => {
    // Seen on 24.94 MHz, 20 m of wire fed 1 m up: at 20° up -8.3, down 3.9 dBi; at 45° up
    // 3.0, down -2.1; at 60° up 4.0, down -3.1. On 40 m down stays the stronger at every slope tried.
    const at = (slope: number, mhz: number) => {
      const text = sloping(slope, 20, 1, mhz);
      return lowAngles(text, mhz, 180) - lowAngles(text, mhz, 0);
    };
    expect(at(20, 24.94)).toBeGreaterThan(8);
    expect(at(45, 24.94)).toBeLessThan(-3);
    for (const slope of [10, 30, 60]) expect(at(slope, 7.1)).toBeGreaterThan(3);
  });

  it("does not send out the power it is fed: from about 3 dB less to 2 dB more over a perfect ground, as the 20 m wire is put up", () => {
    // The check itself, on models whose level was checked otherwise: VOACAP's vertical
    // monopole a half-wave high reads -0.12 dB; a quarter-wave -0.65, which is its own
    // "antenna efficiency" of -0.57 dB and 0.08 dB of sampling. So the sum is good to a
    // tenth or two of a decibel.
    expect(powerOut(monopole(-0.5, PERFECT), 14.18)).toBeCloseTo(-0.1, 0);
    // The 20 m wire, sloping 25° from 1.5 m. Seen: 7.1 MHz -3.23, 10.12 +1.84, 14.18
    // -2.53, 18.12 +1.18, 21.22 -2.50, 24.94 +1.22, 28.85 -2.38. Low near whole numbers
    // of half-waves, high between them: the model divides by the resistance of a monopole
    // of the wire's length, which is not what a sloping wire near the ground radiates.
    const half = powerOut(twenty(7.1, PERFECT), 7.1);
    expect(half).toBeLessThan(-2.5);
    expect(half).toBeGreaterThan(-4);
    const between = powerOut(twenty(10.12, PERFECT), 10.12);
    expect(between).toBeGreaterThan(1.2);
    expect(between).toBeLessThan(2.5);
  }, 120_000);

  it("is further from it at a shallow slope on its half-wave band, and nearer stood steeper", () => {
    // 20 m of wire fed 1 m up at 7.1 MHz. Seen: 10° -9.10 dB, 20° -4.85, 30° -2.62,
    // 45° -1.06, 60° -0.55, and stood upright (90°) -0.46, where it is VOACAP's monopole.
    const at = (slope: number) => powerOut(sloping(slope, 20, 1, 7.1, PERFECT), 7.1);
    expect(at(10)).toBeLessThan(-7);
    expect(at(45)).toBeGreaterThan(-1.6);
    expect(at(45)).toBeLessThan(-0.5);
  }, 120_000);
});

// ── The models not used ─────────────────────────────────────────────────────

describeWithVoacapData("the engine's other models of a sloping or bent wire, run and not used", () => {
  it("the tilted dipole (type 44) shows no difference between its ends over real ground, where the long wire with the same current does", () => {
    // On its half-wave band a wire carries much the same current fed at its end or its
    // middle, so the two should agree. Seen, 20 m of wire at 7.1 MHz, 20° from 1 m (centre
    // 4.4 m): type 44 -4.1 dBi towards either end, type 41 -17.3 up and -5.6 down.
    const text = tilted(20, 20, 1 + 10 * sin(20), 7.1);
    expect(Math.abs(lowAngles(text, 7.1, 0) - lowAngles(text, 7.1, 180))).toBeLessThan(0.2);
    const long = sloping(20, 20, 1, 7.1);
    expect(lowAngles(long, 7.1, 180) - lowAngles(long, 7.1, 0)).toBeGreaterThan(8);
  });

  it("the tilted dipole sends out more than it is fed at 60°", () => {
    // Seen over a perfect ground at 7.1 MHz: 0° -0.04 dB (it allows for the ground under
    // a level dipole), 20° -2.73, 45° -0.97, 60° +1.25. More out than in is impossible over any ground.
    expect(powerOut(tilted(0, 20, 1, 7.1, PERFECT), 7.1)).toBeCloseTo(0, 0);
    expect(powerOut(tilted(60, 20, 1 + 10 * sin(60), 7.1, PERFECT), 7.1)).toBeGreaterThan(0.8);
  }, 120_000);

  it("the inverted L (types 28 and 38) divides by its upright part alone, and so sends out several decibels more than it is fed as an end-fed wire", () => {
    // 20 m of wire, 9 m up and 11 m along. Seen for type 28 over a perfect ground: 7.1 MHz
    // +2.64 dB, 14.18 +3.54, 21.22 +8.37, 28.85 +4.50; type 38 over sea water +4.80 at 7.1 MHz.
    expect(powerOut(invertedL(28, 11, 9, PERFECT), 21.22)).toBeGreaterThan(6);
    expect(powerOut(invertedL(38, 11, 9, SEA), 7.1)).toBeGreaterThan(3);
  }, 120_000);

  it("type 38 takes off a loss for the ground of its own, several decibels over average ground even with no top", () => {
    // With the top 1 mm long it is a vertical 9 m high; seen against type 22 of that
    // height at 5 to 30°: type 28 +1.19 dB at 7.1 MHz and the same at 14.18; type 38 -4.31 and -5.49.
    const vertical = lowAngles(monopole(9), 14.18, 0);
    expect(lowAngles(invertedL(38, 0.001, 9), 14.18, 0) - vertical).toBeLessThan(-4);
    expect(Math.abs(lowAngles(invertedL(28, 0.001, 9), 14.18, 0) - vertical)).toBeLessThan(0.2);
  });
});

// ── As Outpost runs a sloping wire ──────────────────────────────────────────

describeWithVoacapData("a sloping end-fed wire, as Outpost runs it", () => {
  const bands = HF_BANDS.map((band) => band.mhz);
  const noon = (request: CircuitRequest) => engine.circuit({ ...request, frequenciesMhz: bands }).hours[11]!.cells;
  const states = (cells: PredictionCell[]) =>
    Object.fromEntries(
      HF_BANDS.map((band, at) => [band.id, cells[at]!.notModelled ? "n/m" : cells[at]!.approximate ? "approximate" : "modelled"]),
    );
  const twentyStates = {
    "80m": "n/m",
    "60m": "n/m",
    "40m": "approximate",
    "30m": "approximate",
    "20m": "approximate",
    "17m": "approximate",
    "15m": "approximate",
    "12m": "approximate",
    "10m": "approximate",
  };

  it("writes type 41 at the wire's slope, its length and low end in wavelengths at the frequency", () => {
    const text = antennaFile(preset("efhw-20m-sloping"), 14.18);
    expect(text).toContain("  41    [ 2] Antenna Type");
    expect(text).toContain(" 25.00  [ 6] Slope from Hor:");
    expect(text).toContain("-0.946  [ 7] Wire Length   :");
    expect(text).toContain("-0.071  [ 8] Feed Height   :");
    expect(text).not.toContain("Gain ab dipole");
    // Where it is not modelled, the same model in metres, whose answer is not used.
    expect(antennaFile(preset("efhw-20m-sloping"), 3.65)).toContain(" 20.00  [ 7] Wire Length   :");
  });

  it("gives the 20 m sloping wire approximate figures from 40 m up and none on 80 m and 60 m, and so the SPOOLTENNA", () => {
    expect(states(noon({ ...acceptance, txAntenna: preset("efhw-20m-sloping") }))).toEqual(twentyStates);
    expect(states(noon({ ...acceptance, rxAntenna: preset("spooltenna-sloping") }))).toEqual(twentyStates);
    const cells = noon({ ...acceptance, txAntenna: preset("efhw-20m-sloping") });
    expect(cells[2]!.path).not.toBeNull();
    expect(cells[0]).toMatchObject({ notModelled: true, path: null, reliability: 0 });
  });

  it("turns its high end away from the other station, and to the bearing given when there is one", () => {
    const transatlantic = REFERENCE_CASES.find((item) => item.id === "london-new-york")!.request;
    const spec = preset("efhw-20m-sloping");
    const run = (highEndDeg: number | null) =>
      engine.circuit({ ...transatlantic, txAntenna: { ...spec, highEndDeg }, frequenciesMhz: [14.18] }).hours.map((hour) => hour.cells[0]!);
    const bearing = initialBearingDeg(transatlantic.tx, transatlantic.rx);
    const turned = run(null);
    const away = run(Math.round(((bearing + 180) % 360) * 10) / 10);
    const towards = run(Math.round(bearing * 10) / 10);
    let compared = 0;
    for (const [hour, cell] of turned.entries()) {
      if (cell.path === null) continue;
      expect(cell.txGainDbi).toBeCloseTo(away[hour]!.txGainDbi, 1);
      // High end towards New York, leaving at a low angle: weaker by several decibels.
      expect(towards[hour]!.txGainDbi).toBeLessThan(cell.txGainDbi - 5);
      compared++;
    }
    expect(compared).toBeGreaterThan(5);
    expect(engine.circuit({ ...transatlantic, txAntenna: spec, frequenciesMhz: [14.18] }).antennas.tx).toContain(
      "(away from the other station)",
    );
  });

  it("gives what the engine gives for the file written by hand", () => {
    const request = { ...acceptance, txAntenna: preset("efhw-20m-sloping"), frequenciesMhz: [21.22] };
    const circuit = engine.circuit(request);
    const back = Math.round(((initialBearingDeg(acceptance.tx, acceptance.rx) + 180) % 360) * 10) / 10;
    instance.writeFile("antennas/outpost/hand-slope", encoder.encode(antennaFile(preset("efhw-20m-sloping"), 21.22)));
    instance.writeFile("antennas/outpost/hand-slope-rx", encoder.encode(antennaFile(acceptance.rxAntenna)));
    const answer = instance.run<{ hours: Array<{ freqs: WireCell[] }> }>({
      task: "systems",
      tx: acceptance.tx,
      rx: acceptance.rx,
      month: acceptance.month,
      year: acceptance.year,
      ssn: acceptance.ssn,
      powerWatts: acceptance.powerWatts,
      freqs: [21.22],
      requiredSnrDb: acceptance.requiredSnrDbHz,
      noiseDbw: Math.abs(acceptance.noiseDbwAt3Mhz),
      txAntennas: [{ file: "outpost/hand-slope", beamDeg: back }],
      rxAntennas: [{ file: "outpost/hand-slope-rx", beamDeg: Math.round(initialBearingDeg(acceptance.rx, acceptance.tx) * 10) / 10 }],
    });
    let compared = 0;
    for (const [hour, expected] of answer.hours.entries()) {
      if (expected.freqs[0]!.mode === null) continue;
      expect(circuit.hours[hour]!.cells[0]!.approximate).toBe(true);
      expect(circuit.hours[hour]!.cells[0]!.txGainDbi).toBeCloseTo(expected.freqs[0]!.txGainDbi!, 1);
      compared++;
    }
    expect(compared).toBeGreaterThan(5);
  });

  it("adds a person's gain and takes off feedline loss, decibel for decibel", () => {
    const plain = noon({ ...acceptance, txAntenna: preset("efhw-20m-sloping") })[4]!;
    const lossy = noon({ ...acceptance, txAntenna: { ...preset("efhw-20m-sloping"), feedlineLossDb: 1.5 } })[4]!;
    expect(plain.path).not.toBeNull();
    expect(plain.txGainDbi - lossy.txGainDbi).toBeCloseTo(1.5, 1);
    expect(plain.snrDbHz - lossy.snrDbHz).toBeCloseTo(1.5, 1);
  });

  it("says how it was run, and prints a page of its own for each frequency", () => {
    const words = engine.circuit({ ...acceptance, txAntenna: preset("efhw-20m-sloping") }).antennas.tx;
    expect(words).toContain("End-fed wire 20 m long, sloping 25° from 1.5 m to 10 m over average ground, fed at its low end");
    expect(words).toContain("type 41");
    expect(words).toContain("Below 6.7 MHz, where it is shorter than a half-wave, not modelled");
    expect(runWords(preset("efhw-20m-sloping"), 7.1)).toContain("at the wire's slope");
    const page = engine.listing({ ...acceptance, txAntenna: preset("efhw-20m-sloping"), frequenciesMhz: [3.65, 7.1] });
    expect(page).toContain(
      "Outpost: 7.1 MHz, approximate. The transmitting antenna is a sloping wire, run as VOACAP's sloping long wire (type 41) at its slope.",
    );
  });
});
