/**
 * What Outpost asks of a propagation engine, and what it gets back.
 *
 * Everything outside this folder's `voacap/` knows only this interface, so another
 * engine (the ITU's P.533 software, say) could be put behind it without the routes or
 * the screens changing. An engine runs in the propagation worker thread; its methods
 * are plain calls there.
 *
 * An engine never guesses. If it cannot answer it throws, and the message says why.
 */
import type { AntennaSpec, EngineDescription, IonosphereHour, PredictionCell, PropagationSite } from "@outpost/shared";

export interface CircuitRequest {
  tx: PropagationSite;
  rx: PropagationSite;
  year: number;
  /** 1 to 12. */
  month: number;
  /** Smoothed sunspot number. */
  ssn: number;
  powerWatts: number;
  /** Any number of frequencies; the engine splits them into runs of its own size. */
  frequenciesMhz: number[];
  /** What the mode needs, as a signal-to-noise ratio in a 1 Hz bandwidth, dB. */
  requiredSnrDbHz: number;
  /** Man-made noise at 3 MHz in 1 Hz at the receiver, dBW (a negative number). */
  noiseDbwAt3Mhz: number;
  txAntenna: AntennaSpec;
  rxAntenna: AntennaSpec;
}

export interface CircuitHour {
  /** 1 to 24. */
  utc: number;
  localTime: number;
  mufMhz: number;
  fotMhz: number;
  hpfMhz: number;
  /** One per frequency asked for, in the order asked. */
  cells: PredictionCell[];
}

export interface CircuitResult {
  distanceKm: number;
  bearingDeg: number;
  backBearingDeg: number;
  hours: CircuitHour[];
  /** How each antenna was run, in words. */
  antennas: { tx: string; rx: string };
  /** The engine's own statement of the question, for anyone who wants to ask another copy of it. */
  deck: string;
}

export interface IonosphereRequest {
  tx: PropagationSite;
  rx: PropagationSite;
  year: number;
  month: number;
  ssn: number;
}

export interface PropagationEngine {
  describe(): EngineDescription;
  /** The data the engine is reading, by name and version, for the cache key and for provenance. */
  datasets(): Array<{ id: string; version: string }>;
  /** Twenty-four hours of one circuit at the frequencies given. */
  circuit(request: CircuitRequest): CircuitResult;
  /** The ionosphere over the middle of the path, hour by hour (01:00 to 24:00 UTC). */
  ionosphere(request: IonosphereRequest): IonosphereHour[];
  /**
   * The text the reference program prints for a circuit: what the engine is checked
   * against. At most eleven frequencies.
   */
  listing(request: CircuitRequest): string;
}

/** A message from the engine that is fit to show a person. */
export class EngineUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnavailable";
  }
}
