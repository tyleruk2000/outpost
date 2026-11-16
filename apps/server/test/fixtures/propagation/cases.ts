/**
 * The reference circuits: questions put both to Outpost's engine and to the original
 * Fortran VOACAP (voacapl), whose printed answers are kept beside this file as
 * `<id>.voacapl.out`. `make-decks.ts` writes what the Fortran needs to answer the same
 * questions; docs/hf-propagation.md says how they were run and on what.
 */
import { ANTENNA_PRESETS, type AntennaSpec, HF_BANDS } from "@outpost/shared";
import type { CircuitRequest } from "../../../src/modules/propagation/engine.ts";

const preset = (id: string): AntennaSpec => ANTENNA_PRESETS.find((item) => item.id === id)!.spec;

export const REFERENCE_CASES: Array<{ id: string; what: string; request: CircuitRequest }> = [
  {
    id: "london-birmingham",
    what: "The acceptance circuit: London to Birmingham, November 2026, 5 W, a horizontal dipole 5 m up at each end, urban noise, SSB.",
    request: {
      tx: { name: "London", lat: 51.51, lon: -0.13 },
      rx: { name: "Birmingham", lat: 52.49, lon: -1.89 },
      year: 2026,
      month: 11,
      ssn: 83,
      powerWatts: 5,
      frequenciesMhz: [7.1, ...HF_BANDS.map((band) => band.mhz)],
      requiredSnrDbHz: 45,
      noiseDbwAt3Mhz: -140.4,
      txAntenna: preset("low-dipole"),
      rxAntenna: preset("low-dipole"),
    },
  },
  {
    id: "london-new-york",
    what: "A long path with other antennas: London to New York, June 2027, 100 W, a quarter-wave vertical to a dipole 10 m up over good ground, rural noise, CW.",
    request: {
      tx: { name: "London", lat: 51.51, lon: -0.13 },
      rx: { name: "New York", lat: 40.71, lon: -74.01 },
      year: 2027,
      month: 6,
      ssn: 76,
      powerWatts: 100,
      frequenciesMhz: [3.65, 5.33, 7.1, 10.12, 14.18, 18.12, 21.22, 24.94, 28.85],
      requiredSnrDbHz: 24,
      noiseDbwAt3Mhz: -150,
      txAntenna: { ...preset("vertical"), ground: "poor" },
      rxAntenna: { ...preset("dipole-10m"), ground: "good", broadsideDeg: 45 },
    },
  },
  {
    id: "tangier-belgrade",
    what: "Isotropic antennas with gain and loss: Tangier to Belgrade, March 2028, 25 W, 2 dBi less 1.5 dB of feedline to 0 dBi, remote noise, FT8.",
    request: {
      tx: { name: "Tangier", lat: 35.8, lon: -5.9 },
      rx: { name: "Belgrade", lat: 44.9, lon: 20.5 },
      year: 2028,
      month: 3,
      ssn: 40,
      powerWatts: 25,
      frequenciesMhz: [2, 4, 6, 8, 10, 12, 15, 18, 22, 26, 30],
      requiredSnrDbHz: 15.2,
      noiseDbwAt3Mhz: -164.1,
      txAntenna: { ...preset("isotropic"), gainDb: 2, feedlineLossDb: 1.5 },
      rxAntenna: preset("isotropic"),
    },
  },
];
