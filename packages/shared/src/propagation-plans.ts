/**
 * Communication plans: several stations, and for each pair of them which band serves
 * at which hour.
 *
 * The figures are the engine's: each pair is two ordinary predictions, one each way.
 * What is added here is a rule for choosing a primary and an alternate band from those
 * figures. The rule is arithmetic on the engine's answers, it is written out in
 * `PLAN_RULE` and shown wherever a recommendation is, and it predicts nothing itself.
 */
import {
  type AntennaSpec,
  type EngineDescription,
  HF_BANDS,
  type ModeId,
  type ModeLine,
  type NoiseEnvironment,
  type PredictionBasis,
  type SolarInput,
  utcLabel,
} from "./propagation.ts";

/** A place with the equipment that is there. */
export interface PlanStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Transmitter power, watts. */
  powerWatts: number;
  antenna: AntennaSpec;
  /** What the antenna is called in the plan: a profile's name, or a generic antenna's. */
  antennaName: string;
  /** Man-made noise where this station listens. */
  noise: NoiseEnvironment;
  /**
   * The station's call sign, in capitals, or "" for none. A plan saved before stations had
   * one reads with "". The household book prints it, and without one looks for a contact
   * named like the station.
   */
  callsign: string;
}

/** Letters, figures and strokes, as call signs are written (M0ABC, G4XYZ/P, EI2ABC/MM). */
export const PLAN_CALLSIGN = /^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/;
export const PLAN_CALLSIGN_MAX = 16;

export interface PlanLink {
  kind: "note" | "document";
  id: string;
}

/** A link with what it points at, as far as that still exists. */
export interface PlanLinked extends PlanLink {
  /** Null when the note or document has been deleted since. */
  title: string | null;
}

export interface PlanInput {
  name: string;
  notes: string;
  stations: PlanStation[];
  /** The day planned for, YYYY-MM-DD (UTC). The model works by month. */
  date: string;
  /** The hours of interest, UTC, 1 to 24, both included. `toUtc` before `fromUtc` is a window that runs past midnight. */
  fromUtc: number;
  toUtc: number;
  /** Ids of `HF_BANDS`. */
  bands: string[];
  mode: ModeId;
  requiredSnrDb: number | null;
  referenceBandwidthHz: number | null;
  solar: Exclude<SolarInput, { source: "fof2" }>;
  links: PlanLink[];
}

/** A change to a plan, as the screen sends it. */
export interface PlanPatch extends PlanInput {
  /** `updatedAt` of the plan as it was read. A plan saved somewhere else since is not overwritten: the answer is a conflict. */
  baseUpdatedAt?: number;
}

/** The details of that conflict: the plan as it is now. */
export interface PlanConflictDetails {
  reason: "changed-elsewhere";
  plan: CommunicationPlan;
}

export interface CommunicationPlan extends PlanInput {
  id: string;
  linked: PlanLinked[];
  /** True when a matrix has been worked out for the plan exactly as it stands. */
  workedOut: boolean;
  createdAt: number;
  updatedAt: number;
}

export const PLAN_MIN_STATIONS = 2;
/** Eight stations are 28 pairs and 56 runs of the engine: under a second on a laptop. */
export const PLAN_MAX_STATIONS = 8;

/** The hours of a window in order, 1 to 24. A window from 22 to 3 is 22, 23, 24, 1, 2, 3. */
export function planHours(fromUtc: number, toUtc: number): number[] {
  const hours: number[] = [];
  for (let hour = fromUtc; ; hour = hour === 24 ? 1 : hour + 1) {
    hours.push(hour);
    if (hour === toUtc || hours.length === 24) break;
  }
  return hours;
}

/** One direction on one band: the engine's figures for each of the 24 hours (index 0 is 01:00 UTC). */
export interface PlanDirection {
  /** Share of days the mode's requirement is met, 0 to 1; null for a mode with no figure, and at an hour with no path. */
  reliability: Array<number | null>;
  /** Median signal-to-noise ratio in 1 Hz, dB; null at an hour with no path. */
  snrDbHz: Array<number | null>;
}

export interface PlanPairBand {
  bandId: string;
  mhz: number;
  /** From the first station of the pair to the second, and back. */
  forward: PlanDirection;
  back: PlanDirection;
  /**
   * Set when an antenna of the pair is a level wire longer than a half-wave on this band,
   * run as VOACAP's sloping long wire: the figures are approximate, and the matrix, the
   * recommendation and both exports say so.
   */
  approximate?: true;
}

export interface PlanPair {
  /** Ids of the two stations, in the plan's order. */
  a: string;
  b: string;
  distanceKm: number;
  /** Bearing from the first to the second and back, degrees from true north. */
  bearingDeg: number;
  backBearingDeg: number;
  bands: PlanPairBand[];
  /** Set when the engine could not answer for this pair; `bands` is then empty. */
  problem: string | null;
}

/** `POST /api/radio/communication-plans/:id/matrix` */
export interface PlanResult {
  key: string;
  planId: string;
  computedAt: number;
  cached: boolean;
  tookMs: number;
  engine: EngineDescription;
  datasets: Array<{ id: string; version: string }>;
  basis: PredictionBasis;
  mode: ModeLine;
  pairs: PlanPair[];
  limits: string[];
}

// ── The rule ────────────────────────────────────────────────────────────────

/** A band counts as serving an hour when its two-way figure reaches this share of days. */
export const PLAN_SERVES = 0.5;
/** A band whose two-way figure never reaches this in the window is not recommended at all. */
export const PLAN_FLOOR = 0.1;
/** Without reliability, an hour counts as among a band's best when its ratio is within this many decibels of the band's best. */
export const PLAN_SNR_NEAR_DB = 3;

/**
 * The rule, in the words shown on the screen and in every export. `byRatio` is for a
 * mode with no stated requirement, where the engine gives no reliability.
 */
export function planRule(byRatio: boolean): string[] {
  if (byRatio)
    return [
      "This mode has no stated requirement, so the engine gives no reliability. Bands are compared by the median signal-to-noise ratio in a 1 Hz bandwidth instead.",
      "For each band and hour, the two-way figure is the lower of the two directions' ratios, because a contact needs the path to work both ways.",
      "The primary band is the one whose two-way figure, averaged over the hours of the window, is highest. The alternate is the next highest.",
      `The hours given for a band are those at which its two-way figure is within ${PLAN_SNR_NEAR_DB} dB of its best in the window.`,
    ];
  return [
    "For each band and hour, the two-way figure is the lower of the two directions' reliabilities, because a contact needs the path to work both ways. It is an upper bound on how often a contact can be expected, not a prediction of it.",
    "The primary band is the one whose two-way figure, averaged over the hours of the window, is highest. The alternate is the next highest. A tie goes to the band with the higher median signal-to-noise ratio.",
    `The hours given for a band are those at which its two-way figure is ${Math.round(PLAN_SERVES * 100)}% of days or more. If it reaches that at no hour, the hours given are those within 5 points of its best, and it is marked as below half the days.`,
    `A band whose two-way figure never reaches ${Math.round(PLAN_FLOOR * 100)}% of days in the window is not recommended at all.`,
  ];
}

export interface PlanChoice {
  bandId: string;
  mhz: number;
  /** The hours of the window recommended for this band, in the window's order. */
  hours: number[];
  /** The two-way figure averaged over the window, and its best: reliability 0 to 1, or a ratio in dB when `byRatio`. */
  mean: number;
  best: number;
  bestHour: number;
  /** True when the band reaches `PLAN_SERVES` at no hour of the window. */
  belowHalf: boolean;
  /** True when the band's figures are approximate (`PlanPairBand.approximate`): it may be recommended, and says so. */
  approximate: boolean;
}

export interface PlanRecommendation {
  byRatio: boolean;
  primary: PlanChoice | null;
  alternate: PlanChoice | null;
  /** Why there is no primary, when there is none. */
  none: string | null;
}

const lower = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a === null || a === undefined || b === null || b === undefined ? null : Math.min(a, b);

/** The two-way figure of a band at an hour (1 to 24): the weaker direction's reliability, or its ratio when `byRatio`. */
export function planTwoWay(band: PlanPairBand, utcHour: number, byRatio: boolean): number | null {
  const at = utcHour - 1;
  return byRatio ? lower(band.forward.snrDbHz[at], band.back.snrDbHz[at]) : lower(band.forward.reliability[at], band.back.reliability[at]);
}

/** Applies the rule to one pair over a window. */
export function planRecommendation(pair: PlanPair, hours: number[], byRatio: boolean): PlanRecommendation {
  if (pair.problem) return { byRatio, primary: null, alternate: null, none: pair.problem };
  const scored: Array<PlanChoice & { ratio: number }> = [];
  for (const band of pair.bands) {
    const values = hours.map((hour) => ({ hour, value: planTwoWay(band, hour, byRatio) }));
    const known = values.filter((item): item is { hour: number; value: number } => item.value !== null);
    if (known.length === 0) continue;
    // An hour with no path is not left out of the average: it counts as no days at all, or as the band's lowest ratio in the window.
    const floor = byRatio ? Math.min(...known.map((item) => item.value)) : 0;
    const mean = values.reduce((sum, item) => sum + (item.value ?? floor), 0) / values.length;
    const top = known.reduce((a, b) => (b.value > a.value ? b : a));
    if (!byRatio && top.value < PLAN_FLOOR) continue;
    const serving = byRatio
      ? known.filter((item) => item.value >= top.value - PLAN_SNR_NEAR_DB)
      : known.filter((item) => item.value >= PLAN_SERVES);
    const belowHalf = !byRatio && serving.length === 0;
    const chosen = belowHalf ? known.filter((item) => item.value >= top.value - 0.05) : serving;
    const ratios = hours
      .map((hour) => lower(band.forward.snrDbHz[hour - 1], band.back.snrDbHz[hour - 1]))
      .filter((value): value is number => value !== null);
    scored.push({
      bandId: band.bandId,
      mhz: band.mhz,
      hours: chosen.map((item) => item.hour),
      mean,
      best: top.value,
      bestHour: top.hour,
      belowHalf,
      approximate: band.approximate === true,
      ratio: ratios.length > 0 ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : Number.NEGATIVE_INFINITY,
    });
  }
  scored.sort((a, b) => b.mean - a.mean || b.ratio - a.ratio);
  const strip = (choice: (PlanChoice & { ratio: number }) | undefined): PlanChoice | null => {
    if (!choice) return null;
    const { ratio: _ratio, ...rest } = choice;
    return rest;
  };
  return {
    byRatio,
    primary: strip(scored[0]),
    alternate: strip(scored[1]),
    none:
      scored.length > 0
        ? null
        : byRatio
          ? "The engine found no path on any band of the plan in this window."
          : `No band of the plan reaches ${Math.round(PLAN_FLOOR * 100)}% of days both ways in this window.`,
  };
}

/** Hours as ranges: [7, 8, 9, 14] is "07:00 to 09:00, 14:00". Runs follow the order given, so a window past midnight reads straight through. */
export function hourRanges(hours: number[]): string {
  const runs: Array<[number, number]> = [];
  for (const hour of hours) {
    const last = runs[runs.length - 1];
    if (last && (hour === last[1] + 1 || (last[1] === 24 && hour === 1))) last[1] = hour;
    else runs.push([hour, hour]);
  }
  return runs.map(([from, to]) => (from === to ? utcLabel(from) : `${utcLabel(from)} to ${utcLabel(to)}`)).join(", ");
}

export const planBandLabel = (bandId: string): string => HF_BANDS.find((band) => band.id === bandId)?.label ?? bandId;
