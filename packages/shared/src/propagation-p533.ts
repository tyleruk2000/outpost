/**
 * A second model beside VOACAP: the ITU's P.533, run for the same question so that the
 * two answers can be read side by side.
 *
 * Neither is taken to be the right one. They are different models; on the one path
 * compared by hand they agreed on when it was open and differed by 4 to 8 dB on signal.
 * Every figure here is one model's own, under its own name: P.533's "basic circuit
 * reliability" is not VOACAP's reliability and is never shown under that word.
 *
 * P.533 has no antenna models, so it is run with isotropic antennas of 0 dBi at both
 * ends, and the VOACAP side of the comparison is run isotropic too. The person's own
 * antennas are in the ordinary (VOACAP) prediction and nowhere here.
 */
import type { EngineDescription, PredictionBasis } from "./propagation.ts";

/** `GET /api/radio/propagation/second-model`: whether the comparison can be offered, and if not, why. */
export interface SecondModelStatus {
  /** True when the engine is built here and the maps are downloaded and match their checksums. */
  offered: boolean;
  /** When it is not offered: one line saying what is missing and how big it is. */
  line: string | null;
  engine: {
    built: boolean;
    /** Where the built file was found. */
    file: string | null;
    problem: string | null;
    /** What a build must give: the checksum recorded with Outpost. */
    sha256: string;
    /** The ITU's repository and the commit it is built from. */
    repository: string;
    commit: string;
    /** How to build it, in one sentence. */
    howToBuild: string;
    /** Outpost building it itself, when "Build the P.533 engine" is pressed. */
    build: {
      /** Whether Outpost can build it on this computer. */
      possible: boolean;
      /** When it cannot: why, in a sentence. */
      reason: string | null;
      /** What a build downloads (the ITU's source and the compiler), bytes. */
      downloadBytes: number;
      /** Room it needs where Outpost keeps its data while it runs, bytes. */
      neededBytes: number;
      /** A build is queued or under way. */
      running: boolean;
      /** What it is doing, while it runs. */
      progress: { current: number | null; total: number | null; message: string | null } | null;
      /** Why the last build failed, while the engine is still missing. */
      failed: string | null;
    };
  };
  maps: {
    installed: boolean;
    /** Size of the download, bytes. */
    bytes: number;
    files: number;
    /** The collection that holds them, once downloaded. */
    collectionId: string | null;
    where: string | null;
    /** A download of them is queued or under way. */
    downloading: boolean;
    problem: string | null;
    source: string;
  };
  /** The terms, in a sentence: not an open-source licence. */
  terms: string;
}

/** One model's answer for one frequency at one hour. */
export interface SecondModelSide {
  /** The frequency is at or below this model's median MUF for the hour. */
  open: boolean;
  /** The median (basic) MUF for the hour, MHz. */
  mufMhz: number;
  /** Median field strength at the receiver, dB above 1 µV/m. */
  fieldDbuV: number;
  /** Median signal power at the receiver, dBW. */
  signalDbw: number;
  /** Median signal-to-noise ratio in 1 Hz, dB. */
  snrDbHz: number;
  /** Median noise in 1 Hz, dBW. */
  noiseDbwHz: number;
}

export interface SecondModelCell {
  mhz: number;
  voacap: SecondModelSide & {
    /** VOACAP's reliability: the share of days on which the ratio reaches the requirement, 0 to 1. Null with no requirement. */
    reliability: number | null;
  };
  p533: SecondModelSide & {
    /**
     * P.533's basic circuit reliability, %: the probability that the ratio reaches the
     * requirement, counting hour-to-hour as well as day-to-day variation. Not the same
     * quantity as VOACAP's reliability. Null with no requirement.
     */
    basicCircuitReliabilityPercent: number | null;
    /** P.533's operational MUF, MHz: its estimate of the highest frequency usable in practice, above the basic MUF. */
    operationalMufMhz: number;
  };
  /** P.533's figure less VOACAP's. */
  difference: { mufMhz: number; fieldDb: number; signalDb: number; snrDb: number };
  /** Both say open, or both say shut. */
  agreeOnOpen: boolean;
}

export interface SecondModelHour {
  /** 1 to 24 UTC. */
  utc: number;
  /** The frequency asked about first, then each amateur band in the order of `HF_BANDS`. */
  cells: SecondModelCell[];
}

export interface SecondModelRow {
  /** "7.10 MHz (asked)" or "40 m". */
  label: string;
  mhz: number;
  /** Hours (of 24) on which the two say the same about open or shut. */
  hoursAgreeOnOpen: number;
  hoursOpenInBoth: number;
  /** Over the hours open in both: the smallest and largest of P.533's signal less VOACAP's, dB. Null when there are none. */
  signalDifferenceDb: { min: number; max: number } | null;
}

/** `POST /api/radio/propagation/second-model/compare` */
export interface SecondModelComparison {
  /** The cache key of this comparison. */
  key: string;
  cached: boolean;
  computedAt: number;
  /** The sunspot number both were run at, and where it came from. */
  basis: PredictionBasis;
  distanceKm: number;
  /** What both were run with, in words: "Isotropic, 0 dBi, at both ends". */
  antennas: string;
  /** The requirement both were given, in 1 Hz, dB. Null for a mode with none. */
  requiredSnrDbHz: number | null;
  /** The noise setting, and the P.372 curve P.533 was given for it. */
  noise: { label: string; p533: string };
  rows: SecondModelRow[];
  hours: SecondModelHour[];
  engines: { voacap: EngineDescription; p533: EngineDescription };
  datasets: Array<{ id: string; version: string }>;
  /** What must be known before reading the two side by side. */
  notes: string[];
}

/** Said wherever the comparison is shown. */
export const SECOND_MODEL_NOTES: readonly string[] = [
  "Both models are run with isotropic antennas of 0 dBi at both ends, because P.533 has no antenna models. Your own antennas are in the prediction above, which is VOACAP's alone.",
  "These are two different models. Neither is the right answer: where they differ, the truth may be on either side or outside both. Nothing here was compared with signals measured on the air.",
  "Open means the frequency is at or below that model's median MUF for the hour (the frequency the path is open at on half the days of the month).",
  "P.533's basic circuit reliability counts variation from hour to hour as well as from day to day, so it is not the same quantity as VOACAP's reliability, and the two are not set against each other.",
  "Above the MUF the two treat the signal quite differently. P.533 adds an above-the-MUF loss that grows with how far the frequency is above each mode's basic MUF, up to 58 to 80 dB; VOACAP has its own treatment. Signal figures for a shut path are each model's own, and the range of differences counts only hours open in both.",
];
