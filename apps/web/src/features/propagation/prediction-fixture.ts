/**
 * A prediction for tests: an answer shaped as the engine gives it, with figures chosen
 * so that each can be found again in what is made from it.
 */
import { HF_BANDS, type PredictionCell, type PredictionHour, type PredictionResult } from "@outpost/shared";

export const cell = (mhz: number, reliability: number, change: Partial<PredictionCell> = {}): PredictionCell => ({
  mhz,
  path: "1F2",
  hops: 1,
  layer: "F2",
  takeoffDeg: 22,
  virtualHeightKm: 300,
  mufDays: 0.9,
  fieldDbuV: 10,
  signalDbw: -110,
  noiseDbwHz: -150,
  snrDbHz: 20 + Math.round(reliability * 30),
  snrLowDb: 9,
  snrUpDb: 7,
  reliability,
  txGainDbi: 3,
  rxGainDbi: 3,
  lossDb: 110,
  ...change,
});

/** A cell as the engine gives it when it finds no way through: figures that mean nothing, and no path. */
export const noPath = (mhz: number): PredictionCell =>
  cell(mhz, 0, { path: null, hops: 0, layer: "", snrDbHz: -999, signalDbw: -999, takeoffDeg: 0 });

/**
 * A day on 20 m: nothing before 07:00, rising to 91% at 13:00 and gone again by 19:00.
 * 10 m has no path at any hour. Every figure can be found again in the pages.
 */
export function prediction(change: Partial<PredictionResult> = {}): PredictionResult {
  const shareAt = (utc: number) => (utc < 7 || utc > 18 ? null : Math.max(0.05, 0.91 - Math.abs(13 - utc) * 0.14));
  const hours: PredictionHour[] = Array.from({ length: 24 }, (_, index) => {
    const utc = index + 1;
    const open = shareAt(utc);
    return {
      utc,
      localTime: utc,
      mufMhz: 14 + utc / 10,
      fotMhz: 11 + utc / 10,
      hpfMhz: 18,
      lufMhz: null,
      ionosphere: { foF2: 7, foE: 2, foF1: 0, hmF2: 280, virtualHeightF2Km: 320, m3000: 3, sunZenithDeg: 60 },
      asked: open === null ? noPath(14.18) : cell(14.18, open),
      bands: HF_BANDS.map((band) =>
        band.id === "10m"
          ? noPath(band.mhz)
          : band.id === "20m"
            ? open === null
              ? noPath(band.mhz)
              : cell(band.mhz, open)
            : cell(band.mhz, 0.37),
      ),
      sweepReliability: [],
      sweepSnrDbHz: [],
      modeReliability: [],
      reply: { reliability: open === null ? 0 : open / 2, snrDbHz: 30 },
    };
  });
  return {
    key: "abc123def456",
    request: {
      tx: { name: "London", lat: 51.5074, lon: -0.1278 },
      rx: { name: "Edinburgh", lat: 55.9533, lon: -3.1883 },
      date: "2026-11-16",
      powerWatts: 100,
      txAntenna: { kind: "horizontal-dipole", heightM: 10, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
      rxAntenna: { kind: "end-fed-half-wave", heightM: 6, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
      noise: "residential",
      frequencyMhz: 14.18,
      mode: "ssb",
      solar: { source: "table" },
      reply: { powerWatts: 50, noise: "rural" },
    },
    computedAt: Date.UTC(2026, 10, 16, 14, 32, 5),
    cached: false,
    engine: {
      id: "voacap",
      name: "VOACAP",
      model: "VOACAP 16.1207W",
      implementation: "voacapl 0.7.6 as WebAssembly",
      licence: "Public domain",
      sha256: "0123456789abcdef0123456789abcdef",
      gives: { reliability: true, luf: true, ionosphere: true, measuredFoF2: true, coverage: true },
      minMhz: 2,
      maxMhz: 30,
    },
    datasets: [
      { id: "ionospheric-coefficients", version: "CCIR 1966" },
      { id: "solar-cycle", version: "2026-11-01 0a1b2c3d4e5f" },
    ],
    basis: {
      kind: "recent-solar",
      ssn: 87,
      summary: "The smoothed sunspot number for November 2026 is NOAA's forecast of 87, from the solar cycle table of 1 November 2026.",
      tableDate: "2026-11-01",
      tableAgeDays: 15,
      ssnLow: 70,
      ssnHigh: 104,
    },
    path: {
      distanceKm: 534.2,
      bearingDeg: 338.4,
      backBearingDeg: 155.9,
      midpoint: { lat: 53.7, lon: -1.6 },
      txLocator: "IO91wm",
      rxLocator: "IO85jw",
    },
    mode: { id: "ssb", label: "SSB voice", requiredSnrDb: 45, referenceBandwidthHz: 1, requiredSnrDbHz: 45, source: "VOACAP's guide" },
    modes: [],
    sweepMhz: [],
    hours,
    antennas: {
      tx: "A horizontal half-wave dipole 10 m above average ground, broadside to the path (VOACAP type 23).",
      rx: "An end-fed half-wave at 6 m, run as a horizontal half-wave dipole: an approximation.",
    },
    deck: "",
    limits: [
      "Every figure is a monthly median: what a month like this one usually does.",
      "Noise at a real receiver is often well above the engine's estimate.",
    ],
    ...change,
  };
}
