/**
 * The two models' answers for the same question, set side by side.
 *
 * Nothing is averaged, blended or ranked: each side is that model's own figures, and
 * the only arithmetic is the difference between them, P.533's less VOACAP's, and
 * counting the hours on which they agree about whether the path is open.
 */
import {
  type EngineDescription,
  HF_BANDS,
  type PredictionCell,
  type PredictionResult,
  SECOND_MODEL_NOTES,
  type SecondModelCell,
  type SecondModelComparison,
  type SecondModelRow,
} from "@outpost/shared";
import type { P533Cell, P533Circuit } from "./engine.ts";

/**
 * What a comparison is kept under: the VOACAP prediction's own key (which already holds
 * the question as the engine reads it, the sunspot number, the solar table, VOACAP's
 * checksum and its data), with P.533's engine checksum and the version of its maps.
 */
export function comparisonKeyBody(
  voacapKey: string,
  p533: { sha256: string },
  datasets: Array<{ id: string; version: string }>,
): Record<string, unknown> {
  return { second: "p533", voacap: voacapKey, p533: p533.sha256, datasets };
}

const round = (value: number, places = 2) => Number(value.toFixed(places));

export interface ComparisonInput {
  key: string;
  voacap: PredictionResult;
  p533: P533Circuit;
  p533Engine: EngineDescription;
  p533Datasets: Array<{ id: string; version: string }>;
  noise: { label: string; p533: string };
}

/** The frequencies asked of both, in order: the one asked about, then each band. */
export function comparedFrequencies(asked: number): Array<{ label: string; mhz: number }> {
  return [{ label: `${asked.toFixed(2)} MHz (asked)`, mhz: asked }, ...HF_BANDS.map((band) => ({ label: band.label, mhz: band.mhz }))];
}

export function buildComparison(input: ComparisonInput): Omit<SecondModelComparison, "cached"> {
  const { voacap, p533 } = input;
  const required = voacap.mode.requiredSnrDbHz;
  const frequencies = comparedFrequencies(voacap.request.frequencyMhz);
  if (p533.hours.length !== 24 || voacap.hours.length !== 24) throw new Error("Both models must give 24 hours.");

  const hours = voacap.hours.map((vHour, index) => {
    const pHour = p533.hours[index]!;
    if (pHour.utc !== vHour.utc) throw new Error("The two models' hours do not line up.");
    const vCells: PredictionCell[] = [vHour.asked, ...vHour.bands];
    const cells = frequencies.map((frequency, i): SecondModelCell => {
      const v = vCells[i]!;
      const p: P533Cell = pHour.cells[i]!;
      if (Math.abs(v.mhz - frequency.mhz) > 0.001 || Math.abs(p.mhz - frequency.mhz) > 0.001)
        throw new Error("The two models were not asked the same frequencies.");
      const vOpen = frequency.mhz <= vHour.mufMhz;
      const pOpen = frequency.mhz <= pHour.mufMhz;
      return {
        mhz: frequency.mhz,
        voacap: {
          open: vOpen,
          mufMhz: vHour.mufMhz,
          fieldDbuV: v.fieldDbuV,
          signalDbw: v.signalDbw,
          snrDbHz: v.snrDbHz,
          noiseDbwHz: v.noiseDbwHz,
          reliability: required === null ? null : v.reliability,
        },
        p533: {
          open: pOpen,
          mufMhz: pHour.mufMhz,
          fieldDbuV: p.fieldDbuV,
          signalDbw: p.signalDbw,
          snrDbHz: p.snrDbHz,
          noiseDbwHz: p.noiseDbwHz,
          basicCircuitReliabilityPercent: required === null ? null : p.p533.bcrPercent,
          operationalMufMhz: p.p533.opMufMhz,
        },
        difference: {
          mufMhz: round(pHour.mufMhz - vHour.mufMhz),
          fieldDb: round(p.fieldDbuV - v.fieldDbuV, 1),
          signalDb: round(p.signalDbw - v.signalDbw, 1),
          snrDb: round(p.snrDbHz - v.snrDbHz, 1),
        },
        agreeOnOpen: vOpen === pOpen,
      };
    });
    return { utc: vHour.utc, cells };
  });

  const rows: SecondModelRow[] = frequencies.map((frequency, i) => {
    const column = hours.map((hour) => hour.cells[i]!);
    const both = column.filter((cell) => cell.voacap.open && cell.p533.open).map((cell) => cell.difference.signalDb);
    return {
      label: frequency.label,
      mhz: frequency.mhz,
      hoursAgreeOnOpen: column.filter((cell) => cell.agreeOnOpen).length,
      hoursOpenInBoth: both.length,
      signalDifferenceDb: both.length ? { min: Math.min(...both), max: Math.max(...both) } : null,
    };
  });

  return {
    key: input.key,
    computedAt: Date.now(),
    basis: voacap.basis,
    distanceKm: voacap.path.distanceKm,
    antennas: "Isotropic, 0 dBi, at both ends, for both models",
    requiredSnrDbHz: required,
    noise: input.noise,
    rows,
    hours,
    engines: { voacap: voacap.engine, p533: input.p533Engine },
    datasets: [...voacap.datasets, ...input.p533Datasets],
    notes: [...SECOND_MODEL_NOTES],
  };
}
