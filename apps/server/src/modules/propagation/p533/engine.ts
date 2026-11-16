/**
 * The ITU's P.533 behind Outpost's engine interface (`../engine.ts`).
 *
 * It answers the same question as VOACAP (path, month, sunspot number, frequencies,
 * power, noise, the requirement) with the ITU's own program, built from the ITU's
 * source and run as it is: an input file in its own format in, its CSV report out
 * (`program.ts`, `input.ts`). Nothing here computes a propagation figure; every number
 * is a column of the program's report.
 *
 * What P.533 does not give, it does not pretend to:
 *
 * - Antennas are isotropic, 0 dBi, at both ends. A question with any other antenna is
 *   refused rather than quietly run isotropic.
 * - `reliability` in a cell is 0 and `describe().gives.reliability` is false. P.533's
 *   own measure, the basic circuit reliability, is a different quantity (it counts
 *   hour-to-hour as well as day-to-day variation) and is kept apart, in `p533`.
 * - `ionosphere()` is not available: the program does not report the ionosphere over
 *   the path in its report.
 *
 * Runs in its own worker thread (`p533.worker.ts`).
 */
import { type EngineDescription, HF_MAX_MHZ, HF_MIN_MHZ, NOISE_ENVIRONMENTS, type PredictionCell } from "@outpost/shared";
import { type CircuitHour, type CircuitRequest, type CircuitResult, EngineUnavailable, type PropagationEngine } from "../engine.ts";
import { loadEngine, MapsBundle, type MapsManifest, P533_MANIFEST } from "./files.ts";
import { checkQuestion, figure, inputFile, MAX_FREQUENCIES, type P533Question, parseReport, type ReportRow, refusal } from "./input.ts";
import { compileProgram, ProgramFailed, runProgram } from "./program.ts";

/** P.533's own figures for one frequency at one hour, under its own names. */
export interface P533Figures {
  /** Basic circuit reliability, %: P.533's measure, which is not VOACAP's reliability. Null with no requirement. */
  bcrPercent: number;
  /** Operational MUF, MHz: P.533's figure for the highest frequency usable in practice (above the basic MUF). */
  opMufMhz: number;
  /** Signal-to-noise ratio in 1 Hz exceeded on 90% of the time, dB. */
  snr90DbHz: number | null;
  /** The dominant mode's probability of being supported at this frequency, 0 to 1. */
  modeProbability: number | null;
}

export type P533Cell = PredictionCell & { p533: P533Figures };
export type P533Hour = CircuitHour & { cells: P533Cell[]; opMufMhz: number };
export type P533Circuit = CircuitResult & { hours: P533Hour[] };

export class EngineQuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineQuestionError";
  }
}

const ISOTROPIC_ONLY =
  "P.533 has no antenna models, so Outpost runs it with isotropic antennas of 0 dBi at both ends only, and does not compute a pattern of its own.";

/** VOACAP's noise level back to the place it stands for: P.533 is given the place by name. */
function noiseOf(dbwAt3Mhz: number): P533Question["noise"] {
  const found = NOISE_ENVIRONMENTS.find((item) => item.dbwAt3Mhz === dbwAt3Mhz);
  if (!found)
    throw new EngineQuestionError(
      "P.533 is given man-made noise as one of P.372's named kinds of place, and this level is not one of them.",
    );
  return found.id;
}

function isIsotropic(antenna: CircuitRequest["txAntenna"]): boolean {
  return antenna.kind === "isotropic" && antenna.gainDb === 0 && antenna.feedlineLossDb === 0;
}

export function questionOf(request: CircuitRequest): P533Question {
  if (!isIsotropic(request.txAntenna) || !isIsotropic(request.rxAntenna)) throw new EngineQuestionError(ISOTROPIC_ONLY);
  const { txAntenna: _tx, rxAntenna: _rx, noiseDbwAt3Mhz, ...rest } = request;
  return { ...rest, noise: noiseOf(noiseDbwAt3Mhz) };
}

/** "1F2" as hops and layer. */
function modeParts(mode: string | undefined): { path: string | null; hops: number; layer: string } {
  const match = /^(\d+)([A-Z0-9]+)$/.exec(mode ?? "");
  if (!match) return { path: null, hops: 0, layer: "" };
  return { path: `${match[1]}${match[2]}`, hops: Number(match[1]), layer: match[2]! };
}

const need = (row: ReportRow, column: string): number => {
  const value = figure(row, column);
  if (value === null) throw new Error(`The P.533 engine gave no ${column} at ${row.hour}:00 UTC on ${row.frequency} MHz.`);
  return value;
};

/** One report line as a cell. Field names are Outpost's; each is the named column of P.533's report. */
function cellOf(row: ReportRow, mhz: number): P533Cell {
  const mode = modeParts(row.DMidx);
  const snr = need(row, "SNR");
  return {
    mhz,
    ...mode,
    takeoffDeg: figure(row, "DMele") ?? 0,
    virtualHeightKm: figure(row, "DMhr") ?? 0,
    // Not VOACAP's MUFday: the dominant mode's probability of support, P.533's nearest figure.
    mufDays: figure(row, "DMFprob") ?? 0,
    fieldDbuV: need(row, "Ep"),
    signalDbw: need(row, "PR"),
    noiseDbwHz: Number((need(row, "FamT") - 204).toFixed(2)),
    snrDbHz: snr,
    snrLowDb: figure(row, "DlSN") ?? 0,
    snrUpDb: figure(row, "DuSN") ?? 0,
    reliability: 0,
    txGainDbi: 0,
    rxGainDbi: figure(row, "Grw") ?? 0,
    lossDb: figure(row, "DMLb") ?? 0,
    p533: {
      bcrPercent: need(row, "BCR"),
      opMufMhz: need(row, "OPMUF"),
      snr90DbHz: figure(row, "SNRXXp"),
      modeProbability: figure(row, "DMFprob"),
    },
  };
}

export interface P533EngineOptions {
  dataDir: string;
  /** The downloaded bundle of maps, and the list of what is in it. */
  mapsFile: string;
  maps: MapsManifest;
}

export interface P533Engine extends PropagationEngine {
  circuit(request: CircuitRequest): P533Circuit;
}

export function createP533Engine(options: P533EngineOptions): P533Engine {
  const engine = loadEngine(options.dataDir);
  const module = compileProgram(engine.bytes);
  const maps = new MapsBundle(options.mapsFile, options.maps);
  const commit = P533_MANIFEST.source.commit.slice(0, 12);

  function filesFor(month: number): Map<string, Uint8Array> {
    const mm = String(month).padStart(2, "0");
    return new Map(
      [`ionos${mm}.bin`, `COEFF${mm}W.txt`, "P1239-3 Decile Factors.txt"].map((name) => [`Data/${name}`, maps.read(name)] as const),
    );
  }

  function run(question: P533Question, frequenciesMhz: number[], flags: string[]): string {
    const result = runProgram(module, inputFile(question, frequenciesMhz), filesFor(question.month), flags);
    if (result.code !== 0) throw new EngineQuestionError(refusal(result.code));
    return result.report;
  }

  const description: EngineDescription = {
    id: "p533",
    name: "ITU-R P.533",
    model: `Recommendation ITU-R P.533-14 with P.372 noise (the ITU's software, P533 ${P533_MANIFEST.model.p533}, P372 ${P533_MANIFEST.model.p372})`,
    implementation: `${P533_MANIFEST.model.program} at ${commit}, built here to WebAssembly`,
    licence:
      'Not an open-source licence. The ITU states the software "may be used by implementers in their implementation of the Recommendation ... free from any copyright assertions"; its headers also say "All rights reserved". See engines/p533/NOTICE.txt.',
    sha256: P533_MANIFEST.wasm.sha256,
    gives: { reliability: false, luf: false, ionosphere: false, measuredFoF2: false, coverage: false },
    minMhz: HF_MIN_MHZ,
    maxMhz: HF_MAX_MHZ,
  };

  return {
    describe: () => description,
    datasets: () => [{ id: "p533-maps", version: `${commit} ${options.maps.sha256.slice(0, 12)}` }],
    circuit(request) {
      const question = questionOf(request);
      try {
        checkQuestion(question);
      } catch (error) {
        throw new EngineQuestionError((error as Error).message);
      }
      const hours = new Map<number, P533Hour>();
      let distanceKm = Number.NaN;
      for (let start = 0; start < request.frequenciesMhz.length; start += MAX_FREQUENCIES) {
        const chunk = request.frequenciesMhz.slice(start, start + MAX_FREQUENCIES);
        const rows = parseReport(run(question, chunk, ["-s", "-c"]));
        if (rows.length !== chunk.length * 24)
          throw new Error(`The P.533 engine gave ${rows.length} lines for ${chunk.length * 24} questions.`);
        for (const row of rows) {
          if (Number.isNaN(distanceKm)) distanceKm = need(row, "distance");
          const utc = Number(row.hour);
          let hour = hours.get(utc);
          if (!hour) {
            hour = {
              utc,
              // P.533 reports times in UTC only; local mean time at the middle of the path is the caller's to state.
              localTime: Number.NaN,
              mufMhz: need(row, "MUF50"),
              fotMhz: need(row, "MUF90"),
              hpfMhz: need(row, "MUF10"),
              opMufMhz: need(row, "OPMUF"),
              cells: [],
            };
            hours.set(utc, hour);
          }
          // Lines come hour by hour, frequency by frequency, in the order asked.
          const mhz = chunk[hour.cells.length - start];
          if (mhz === undefined || Math.abs(Number(row.frequency) - mhz) > 0.001)
            throw new Error(`The P.533 engine's report is not in the order asked (${row.frequency} MHz at ${utc}:00 UTC).`);
          hour.cells.push(cellOf(row, mhz));
        }
      }
      const ordered = [...hours.values()].sort((a, b) => a.utc - b.utc);
      if (ordered.length !== 24) throw new Error(`The P.533 engine gave ${ordered.length} hours, not 24.`);
      return {
        distanceKm,
        // The report gives no bearing; the caller has VOACAP's for the same two points.
        bearingDeg: Number.NaN,
        backBearingDeg: Number.NaN,
        hours: ordered,
        antennas: { tx: "Isotropic, 0 dBi (P.533 has no antenna models)", rx: "Isotropic, 0 dBi (P.533 has no antenna models)" },
        deck: inputFile(question, request.frequenciesMhz.slice(0, MAX_FREQUENCIES)),
      };
    },
    ionosphere() {
      throw new EngineUnavailable(
        "The ITU's P.533 program does not report the ionosphere over the path, so this is not available from it.",
      );
    },
    listing(request) {
      const question = questionOf(request);
      checkQuestion(question);
      return run(question, request.frequenciesMhz.slice(0, MAX_FREQUENCIES), ["-s"]);
    },
  };
}

export { ProgramFailed };
