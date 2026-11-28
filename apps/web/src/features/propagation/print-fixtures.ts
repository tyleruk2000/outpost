/**
 * Answers for tests of the radio papers: a communication plan and its matrix, a
 * comparison and a coverage map, shaped as the engine gives them. The figures are the
 * tests' own, chosen so that each can be found again in what is printed.
 */
import {
  ANTENNA_PRESETS,
  type CommunicationPlan,
  type CompareResult,
  type CoverageCell,
  type CoverageResult,
  coverageGrid,
  type PlanResult,
  type PredictionResult,
} from "@outpost/shared";
import { EXAMPLE_AREA } from "./coverage-map/data";
import { prediction } from "./prediction-fixture";

const dipole = ANTENNA_PRESETS[0]!.spec;
const day = <T>(value: T) => Array.from({ length: 24 }, () => value);

/**
 * A prediction whose MUF rises through the morning and falls after dark, as a winter's
 * day on a mid-latitude path does, with the one-in-ten and nine-in-ten frequencies about
 * it and a lowest usable frequency by day. For the look of the printed chart.
 */
export function dayOfPrediction(change: Partial<PredictionResult> = {}): PredictionResult {
  const base = prediction(change);
  const muf = [
    6.1, 5.8, 5.6, 5.5, 5.6, 6.0, 7.4, 9.6, 11.8, 13.2, 14.1, 14.6, 14.7, 14.4, 13.7, 12.6, 10.9, 9.1, 8.0, 7.3, 6.9, 6.6, 6.4, 6.2,
  ];
  return {
    ...base,
    hours: base.hours.map((hour, index) => {
      const mufMhz = muf[index]!;
      return {
        ...hour,
        mufMhz,
        fotMhz: Math.round(mufMhz * 0.85 * 10) / 10,
        hpfMhz: Math.round(mufMhz * 1.2 * 10) / 10,
        lufMhz: hour.utc >= 9 && hour.utc <= 15 ? 4.2 : null,
      };
    }),
  };
}

const station = (id: string, name: string, lat: number, lon: number) => ({
  id,
  name,
  lat,
  lon,
  powerWatts: 5,
  antenna: dipole,
  antennaName: "Low horizontal dipole, 5 m",
  noise: "residential" as const,
  callsign: "",
});

export function planOf(patch: Partial<CommunicationPlan> = {}): CommunicationPlan {
  return {
    id: "p1",
    name: "Family net",
    notes: "Call on the hour.\n\nListen for five minutes.",
    stations: [station("home", "Home base", 51.51, -0.13), station("shelter", "Remote shelter", 54.46, -3.09)],
    date: "2026-11-16",
    fromUtc: 8,
    toUtc: 12,
    bands: ["80m", "40m"],
    mode: "ssb",
    requiredSnrDb: null,
    referenceBandwidthHz: null,
    solar: { source: "table" },
    links: [],
    linked: [],
    workedOut: true,
    createdAt: 1,
    updatedAt: 2,
    ...patch,
  };
}

/** 40 m at 70% out and 60% back; 80 m at 20% both ways. */
export function matrixOf(patch: Partial<PlanResult> = {}): PlanResult {
  return {
    key: "k".repeat(40),
    planId: "p1",
    computedAt: Date.UTC(2026, 10, 16, 10, 27),
    cached: false,
    tookMs: 40,
    engine: { id: "voacap", name: "VOACAP", model: "VOACAP Version 16.1207W", implementation: "hfcast 2.14.0" } as PlanResult["engine"],
    datasets: [{ id: "voacap-coefficients", version: "hfcast-1" }],
    basis: {
      kind: "recent-solar",
      ssn: 83,
      summary: "Monthly median for November 2026 at smoothed sunspot number 83.",
      tableDate: "2026-11-16",
      tableAgeDays: 0,
      ssnLow: null,
      ssnHigh: null,
    },
    mode: { id: "ssb", label: "SSB voice", requiredSnrDb: 45, referenceBandwidthHz: 1, requiredSnrDbHz: 45, source: "" },
    pairs: [
      {
        a: "home",
        b: "shelter",
        distanceKm: 383.2,
        bearingDeg: 330.4,
        backBearingDeg: 148.1,
        problem: null,
        bands: [
          {
            bandId: "80m",
            mhz: 3.65,
            forward: { reliability: day(0.2), snrDbHz: day(38) },
            back: { reliability: day(0.2), snrDbHz: day(38) },
          },
          {
            bandId: "40m",
            mhz: 7.1,
            forward: { reliability: day(0.7), snrDbHz: day(48) },
            back: { reliability: day(0.6), snrDbHz: day(46) },
          },
        ],
      },
    ],
    limits: ["Every figure is the engine's monthly median for that path."],
    ...patch,
  };
}

/** 5 W against 100 W on 20 m: open from 08:00 to 15:00 at 21% and 67%. */
export function comparisonOf(): CompareResult {
  const base = prediction();
  const series = (label: string, detail: string, ssn: number, top: number) => ({
    label,
    detail,
    ssn,
    reliability: Array.from({ length: 24 }, (_, index) => (index >= 8 && index <= 15 ? top : 0)),
    snrDbHz: Array.from({ length: 24 }, (_, index) => (index >= 8 && index <= 15 ? 50 : 3)),
    mufMhz: Array.from({ length: 24 }, () => 12.4),
    foF2: Array.from({ length: 24 }, (_, index) => (index === 11 ? 7.9 : 5)),
  });
  return {
    what: "power",
    frequencyMhz: 14.18,
    mode: base.mode,
    series: [series("5 W", "5 W at the transmitter", 83, 0.21), series("100 W", "100 W at the transmitter", 83, 0.67)],
    engine: base.engine,
    basis: base.basis,
  };
}

const cellOf = (reliability: number, snr: number, signal: number): CoverageCell => ({
  distanceKm: 504,
  bearingDeg: 321,
  reliability: day(reliability),
  snrDbHz: day(snr),
  signalDbw: day(signal),
});

/** Two cells by two, rows from the south: 55% and 5%; then a cell the engine did not answer and one with no path at any hour. */
export function mapOf(): CoverageResult {
  const grid = { ...coverageGrid(EXAMPLE_AREA, "coarse"), columns: 2, rows: 2, lonStep: 7, latStep: 5 };
  return {
    key: "a".repeat(40),
    request: {
      tx: { name: "London", lat: 51.51, lon: -0.13 },
      date: "2026-11-16",
      powerWatts: 5,
      txAntenna: dipole,
      rxAntenna: dipole,
      noise: "city",
      frequencyMhz: 7.1,
      mode: "ssb",
      solar: { source: "table" },
      area: EXAMPLE_AREA,
      resolution: "coarse",
    },
    computedAt: Date.UTC(2026, 10, 16, 10, 12),
    cached: false,
    tookMs: 700,
    engine: { id: "voacap", name: "VOACAP", model: "Version 16.1207W", implementation: "hfcast 2.14.0" } as CoverageResult["engine"],
    datasets: [{ id: "voacap-coefficients", version: "hfcast-1" }],
    basis: {
      kind: "recent-solar",
      ssn: 83,
      summary: "Monthly median for November 2026 at smoothed sunspot number 83.",
      tableDate: "2026-11-16",
      tableAgeDays: 0,
      ssnLow: null,
      ssnHigh: null,
    },
    mode: { id: "ssb", label: "SSB voice", requiredSnrDb: 45, referenceBandwidthHz: 1, requiredSnrDbHz: 45, source: "" },
    grid,
    cells: [
      cellOf(0.55, 46.7, -103.6),
      cellOf(0.05, 30, -120),
      null,
      { ...cellOf(0, 0, 0), reliability: day(null), snrDbHz: day(null), signalDbw: day(null) },
    ],
    unanswered: [{ index: 2, reason: "The engine could not work this place out: no such path." }],
    antennas: { tx: "Dipole, broadside turned towards each cell", rx: "Dipole, broadside turned towards the transmitter" },
    limits: ["Each cell is the engine's answer for a receiver at the centre of that cell."],
  };
}
