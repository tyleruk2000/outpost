/**
 * The question, written as an input file in ITURHFProp's own format, and the answer
 * read back from the CSV report it writes.
 *
 * Every mapping from Outpost's question to P.533's is made here and listed in
 * docs/hf-propagation.md, "The second model". In short:
 *
 * - Antennas: always "ISOTROPIC" at 0 dBi at both ends, with no gain offset. P.533 has
 *   no antenna models of its own and Outpost computes no patterns, so whatever antenna
 *   the person chose for VOACAP is not used here.
 * - Power: watts as dB relative to 1 kW, which is what the program reads. It accepts
 *   -30 to 60 dB(kW), 1 W to 1 GW.
 * - Noise: Outpost's four places are VOACAP's four man-made noise levels, and each is
 *   one of P.372's named curves, which the program is given by name (see NOISE_NAMES).
 * - Bandwidth: 1 Hz, with the requirement restated in 1 Hz, as Outpost states every
 *   ratio. P.533's reliability depends on the ratio less the requirement, so this is the
 *   same answer as asking in the mode's own bandwidth.
 * - Modulation "ANALOG": the reliability for a plain signal-to-noise requirement. Its
 *   "DIGITAL" method needs the time and frequency spread a modem tolerates, which no
 *   mode in Outpost states.
 * - Short path only, as with VOACAP.
 */
import type { NoiseEnvironment } from "@outpost/shared";
import type { CircuitRequest } from "../engine.ts";

/** At most this many frequencies in one run of the program (its NMBOFFREQS). */
export const MAX_FREQUENCIES = 32;

/**
 * Outpost's man-made noise settings as P.372's named curves. Each is the same line at
 * 3 MHz as VOACAP's setting: c − 27.7·log10(3) for city (76.8), residential (72.5) and
 * rural (67.2) gives −140.4, −144.7 and −150.0 dBW in 1 Hz; quiet rural (53.6 and a slope
 * of 28.6) gives −164.0, where VOACAP's remote setting is −164.1.
 */
export const NOISE_NAMES: Record<NoiseEnvironment, string> = {
  city: "CITY",
  residential: "RESIDENTIAL",
  rural: "RURAL",
  remote: "QUIETRURAL",
};

/** Transmitter power as the program reads it: dB relative to 1 kW. */
export const wattsToDbKw = (watts: number) => 10 * Math.log10(watts / 1000);

export interface P533Question extends Omit<CircuitRequest, "noiseDbwAt3Mhz" | "txAntenna" | "rxAntenna"> {
  noise: NoiseEnvironment;
}

const fixed = (value: number, places: number) => value.toFixed(places);

/** The input file for one run: every hour of the day at up to 32 frequencies. */
export function inputFile(question: P533Question, frequenciesMhz: number[]): string {
  if (frequenciesMhz.length === 0 || frequenciesMhz.length > MAX_FREQUENCIES)
    throw new Error(`One run takes 1 to ${MAX_FREQUENCIES} frequencies.`);
  const rx = { lat: fixed(question.rx.lat, 4), lng: fixed(question.rx.lon, 4) };
  // No text from the request goes into the file: the names are fixed.
  const lines = [
    'PathName "Outpost"',
    'PathTXName "Transmitter"',
    `Path.L_tx.lat ${fixed(question.tx.lat, 4)}`,
    `Path.L_tx.lng ${fixed(question.tx.lon, 4)}`,
    'TXAntFilePath "ISOTROPIC"',
    "TXGOS 0.0",
    'PathRXName "Receiver"',
    `Path.L_rx.lat ${rx.lat}`,
    `Path.L_rx.lng ${rx.lng}`,
    'RXAntFilePath "ISOTROPIC"',
    "RXGOS 0.0",
    'AntennaOrientation "TX2RX"',
    `Path.year ${question.year}`,
    `Path.month ${question.month}`,
    `Path.hour ${Array.from({ length: 24 }, (_, i) => i + 1).join(",")}`,
    `Path.SSN ${Math.round(question.ssn)}`,
    `Path.frequency ${frequenciesMhz.map((mhz) => fixed(mhz, 3)).join(",")}`,
    `Path.txpower ${fixed(wattsToDbKw(question.powerWatts), 3)}`,
    "Path.BW 1.0",
    `Path.SNRr ${fixed(question.requiredSnrDbHz, 2)}`,
    "Path.SNRXXp 90",
    `Path.ManMadeNoise "${NOISE_NAMES[question.noise]}"`,
    'Path.Modulation "ANALOG"',
    'Path.SorL "SHORTPATH"',
    'RptFileFormat "RPT_ALL"',
    ...["LL", "LR", "UL", "UR"].flatMap((corner) => [`${corner}.lat ${rx.lat}`, `${corner}.lng ${rx.lng}`]),
    "latinc 1.0",
    "lnginc 1.0",
    'DataFilePath "/Data/"',
  ];
  return `${lines.join("\n")}\n`;
}

/** The program's own codes for a question it refuses, in words a person can act on. */
const REFUSALS: Record<number, string> = {
  100: "P.533 works only for the years 1900 to 2100.",
  109: "P.533 takes a sunspot number from 1 to 311.",
  111: "P.533 works from 1 to 30 MHz.",
  113: "The ITU's P.533 program accepts transmitter powers from 1 W to 1 GW (−30 to 60 dB relative to 1 kW).",
  114: "P.533 takes a required signal-to-noise ratio from −30 to 200 dB.",
  121: "The transmitter's position is not one P.533 accepts.",
  122: "The receiver's position is not one P.533 accepts.",
};

export function refusal(code: number): string {
  return REFUSALS[code] ?? `The ITU's P.533 program stopped with its error ${code}.`;
}

/** Checks the program's limits before it is run, so a refusal can say exactly what to change. */
export function checkQuestion(question: P533Question): void {
  const dbKw = wattsToDbKw(question.powerWatts);
  if (!(dbKw >= -30 && dbKw <= 60)) throw new RangeError(REFUSALS[113]);
  if (question.ssn < 1 || question.ssn > 311) throw new RangeError(`${REFUSALS[109]} This month's is ${question.ssn}.`);
  if (question.requiredSnrDbHz < -30 || question.requiredSnrDbHz > 200) throw new RangeError(REFUSALS[114]);
}

/** One line of the report, by column name: every figure the program gives for one hour and frequency. */
export type ReportRow = Record<string, string>;

/**
 * Reads the CSV report written with RPT_ALL and the "-c" option: one header line naming
 * the columns, then one line per hour and frequency. Columns are found by name. Two are
 * named twice (Grw); the first is kept. The program writes −307 for "not computed".
 */
export function parseReport(text: string): ReportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) throw new Error("The P.533 engine wrote no figures.");
  const header = lines[0]!.split(",").map((name) => name.trim());
  for (const needed of ["hour", "frequency", "BMUF", "MUF50", "MUF90", "MUF10", "OPMUF", "Ep", "PR", "FamT", "SNR", "BCR"]) {
    if (!header.includes(needed)) throw new Error(`The P.533 engine's report has no ${needed} column.`);
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: ReportRow = {};
    header.forEach((name, i) => {
      if (!(name in row)) row[name] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

/** A figure from the report, or null where the program wrote its "not computed" value. */
export function figure(row: ReportRow, column: string): number | null {
  const value = Number(row[column]);
  if (!Number.isFinite(value) || value <= -306.5) return null;
  return value;
}
