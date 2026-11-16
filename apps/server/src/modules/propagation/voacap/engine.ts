/**
 * VOACAP behind Outpost's engine interface.
 *
 * Turns a circuit into the requests the WebAssembly engine takes (eleven frequencies at
 * a time, an antenna file for each end) and its answers into Outpost's own shapes. No
 * figure is worked out here: values are copied across and rounded for sending.
 */
import {
  type AntennaSpec,
  antennaModelledOn,
  type EngineDescription,
  greatCirclePoint,
  HF_MAX_MHZ,
  HF_MIN_MHZ,
  haversineMeters,
  type IonosphereHour,
  initialBearingDeg,
  type PredictionCell,
  type PropagationSite,
} from "@outpost/shared";
import type { CircuitHour, CircuitRequest, CircuitResult, IonosphereRequest, PropagationEngine } from "../engine.ts";
import { antennaFile, describeAntenna, hasAzimuthPattern } from "./antenna-files.ts";
import { type LoadedDataset, type LoadedEngineFile, loadDataset, loadEngineFile, type VoacapPaths } from "./files.ts";
import { VoacapInstance } from "./instance.ts";

/** How many frequencies one run of VOACAP takes. */
export const FREQUENCIES_PER_RUN = 11;

interface WireCell {
  mhz: number;
  mode: string | null;
  hops?: number;
  layer?: string;
  takeoffDeg?: number;
  virtualHeightKm?: number;
  mufDay?: number;
  lossDb?: number;
  fieldDbu?: number;
  signalDbw?: number;
  noiseDbw?: number;
  snrDb?: number;
  reliability?: number;
  snrLowDb?: number;
  snrUpDb?: number;
  txGainDbi?: number;
  rxGainDbi?: number;
}

interface WireSystems {
  distanceKm: number;
  bearingTxDeg: number;
  bearingRxDeg: number;
  deck: string;
  hours: Array<{ utc: number; localMeanTime: number; mufMhz: number; fotMhz: number; hpfMhz: number; freqs: WireCell[] }>;
}

interface WireParameters {
  rows: Array<{
    lat: number;
    lon: number;
    utc: number;
    foE: number;
    foF1: number;
    foF2: number;
    hmF2: number;
    virtualHeightF2Km: number;
    m3000: number;
    sunZenithDeg: number;
  }>;
}

const round = (value: number | undefined, places: number): number => {
  if (value === undefined || !Number.isFinite(value)) return 0;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

function cell(wire: WireCell): PredictionCell {
  return {
    mhz: round(wire.mhz, 2),
    path: wire.mode,
    hops: wire.hops ?? 0,
    layer: wire.layer ?? "",
    takeoffDeg: round(wire.takeoffDeg, 1),
    virtualHeightKm: round(wire.virtualHeightKm, 0),
    mufDays: round(wire.mufDay, 3),
    fieldDbuV: round(wire.fieldDbu, 1),
    signalDbw: round(wire.signalDbw, 1),
    noiseDbwHz: round(wire.noiseDbw, 1),
    snrDbHz: round(wire.snrDb, 1),
    snrLowDb: round(wire.snrLowDb, 1),
    snrUpDb: round(wire.snrUpDb, 1),
    reliability: round(wire.reliability, 3),
    txGainDbi: round(wire.txGainDbi, 1),
    rxGainDbi: round(wire.rxGainDbi, 1),
    lossDb: round(wire.lossDb, 1),
  };
}

/**
 * What stands at a frequency on which an antenna is a wire the engine's model does not
 * describe: no figures, and a mark saying why. The engine was run with the file all the
 * same (one file serves every frequency); what it answered there is thrown away, because
 * it is the answer for a different antenna.
 */
const notModelledCell = (mhz: number): PredictionCell => ({ ...cell({ mhz, mode: null }), notModelled: true });

const wireSite = (site: PropagationSite) => ({ name: site.name.slice(0, 20), lat: site.lat, lon: site.lon });

export function createVoacapEngine(paths: VoacapPaths): PropagationEngine {
  const engineFile: LoadedEngineFile = loadEngineFile(paths);
  const dataset: LoadedDataset = loadDataset(paths);
  let instance = new VoacapInstance(engineFile.wasm, dataset.files);
  const encoder = new TextEncoder();
  const { manifest } = engineFile;

  /** A copy that has trapped cannot be trusted again; the next question gets a fresh one. */
  const live = () => {
    if (!instance.usable) instance = new VoacapInstance(engineFile.wasm, dataset.files);
    return instance;
  };

  const description: EngineDescription = {
    id: manifest.id,
    name: manifest.name,
    model: manifest.model,
    implementation: `${manifest.implementation.name} ${manifest.implementation.version} (${manifest.implementation.commit.slice(0, 12)}), WebAssembly`,
    licence: manifest.implementation.licence,
    sha256: manifest.wasm.sha256,
    gives: { reliability: true, luf: true, ionosphere: true, measuredFoF2: false, coverage: true },
    minMhz: HF_MIN_MHZ,
    maxMhz: HF_MAX_MHZ,
  };

  /** Writes the two antenna files and returns the cards that name them. */
  function antennas(request: { tx: PropagationSite; rx: PropagationSite; txAntenna: AntennaSpec; rxAntenna: AntennaSpec }) {
    const engine = live();
    const beam = (spec: AntennaSpec, from: PropagationSite, to: PropagationSite) =>
      hasAzimuthPattern(spec) ? Math.round((spec.broadsideDeg ?? initialBearingDeg(from, to)) * 10) / 10 : 0;
    const txBeam = beam(request.txAntenna, request.tx, request.rx);
    const rxBeam = beam(request.rxAntenna, request.rx, request.tx);
    engine.writeFile("antennas/outpost/tx", encoder.encode(antennaFile(request.txAntenna)));
    engine.writeFile("antennas/outpost/rx", encoder.encode(antennaFile(request.rxAntenna)));
    return {
      cards: { txAntennas: [{ file: "outpost/tx", beamDeg: txBeam }], rxAntennas: [{ file: "outpost/rx", beamDeg: rxBeam }] },
      words: { tx: describeAntenna(request.txAntenna, txBeam), rx: describeAntenna(request.rxAntenna, rxBeam) },
    };
  }

  const base = (request: CircuitRequest, freqs: number[]) => ({
    tx: wireSite(request.tx),
    rx: wireSite(request.rx),
    month: request.month,
    year: request.year,
    ssn: request.ssn,
    powerWatts: request.powerWatts,
    freqs,
    requiredSnrDb: request.requiredSnrDbHz,
    // The engine takes the level as a positive number of decibels below a watt.
    noiseDbw: Math.abs(request.noiseDbwAt3Mhz),
  });

  return {
    describe: () => description,
    datasets: () => [{ id: dataset.coefficients.id, version: dataset.coefficients.version }],

    circuit(request: CircuitRequest): CircuitResult {
      if (request.frequenciesMhz.length === 0) throw new Error("No frequency was asked for.");
      const { cards, words } = antennas(request);
      const engine = live();
      let first: WireSystems | undefined;
      const hours: CircuitHour[] = [];
      for (let start = 0; start < request.frequenciesMhz.length; start += FREQUENCIES_PER_RUN) {
        const freqs = request.frequenciesMhz.slice(start, start + FREQUENCIES_PER_RUN);
        const answer = engine.run<WireSystems>({ task: "systems", ...base(request, freqs), ...cards });
        if (!first) {
          first = answer;
          for (const hour of answer.hours) {
            hours.push({
              utc: Math.round(hour.utc),
              localTime: round(hour.localMeanTime, 2),
              mufMhz: round(hour.mufMhz, 2),
              fotMhz: round(hour.fotMhz, 2),
              hpfMhz: round(hour.hpfMhz, 2),
              cells: [],
            });
          }
        }
        const modelled = freqs.map((mhz) => antennaModelledOn(request.txAntenna, mhz) && antennaModelledOn(request.rxAntenna, mhz));
        for (const [index, hour] of answer.hours.entries())
          hours[index]!.cells.push(...hour.freqs.map((wire, at) => (modelled[at] ? cell(wire) : notModelledCell(wire.mhz))));
      }
      return {
        distanceKm: round(first!.distanceKm, 1),
        bearingDeg: round(first!.bearingTxDeg, 1),
        backBearingDeg: round(first!.bearingRxDeg, 1),
        hours,
        antennas: words,
        deck: first!.deck,
      };
    },

    ionosphere(request: IonosphereRequest): IonosphereHour[] {
      const answer = live().run<WireParameters>({
        task: "parameters",
        tx: wireSite(request.tx),
        rx: wireSite(request.rx),
        month: request.month,
        year: request.year,
        ssn: request.ssn,
        powerWatts: 100,
        freqs: [10],
        requiredSnrDb: 0,
        noiseDbw: 145,
      });
      // The engine gives the layers at each of its control points (one on a short path,
      // up to five on a long one). The one nearest the middle of the path is kept.
      const middle = greatCirclePoint(request.tx, request.rx, 0.5);
      const byHour = new Map<number, WireParameters["rows"][number]>();
      for (const row of answer.rows) {
        const hour = Math.round(row.utc);
        const kept = byHour.get(hour);
        const far = (r: { lat: number; lon: number }) => haversineMeters(r.lat, r.lon, middle.lat, middle.lon);
        if (!kept || far(row) < far(kept)) byHour.set(hour, row);
      }
      return [...byHour.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, row]) => ({
          foF2: round(row.foF2, 2),
          foE: round(row.foE, 2),
          foF1: round(row.foF1, 2),
          hmF2: round(row.hmF2, 0),
          virtualHeightF2Km: round(row.virtualHeightF2Km, 0),
          m3000: round(row.m3000, 2),
          sunZenithDeg: round(row.sunZenithDeg, 1),
        }));
    },

    listing(request: CircuitRequest): string {
      // The printed page has no way to mark a column as not this antenna, so a frequency
      // on which an antenna is not modelled is left off the page.
      const modelled = request.frequenciesMhz.filter(
        (mhz) => antennaModelledOn(request.txAntenna, mhz) && antennaModelledOn(request.rxAntenna, mhz),
      );
      if (modelled.length === 0)
        throw new Error(
          "There is no page to print: on every frequency asked about, one of the antennas is a wire the engine's model does not describe.",
        );
      const { cards } = antennas(request);
      return live().run<{ listing: string }>({
        task: "systems",
        listing: true,
        ...base(request, modelled.slice(0, FREQUENCIES_PER_RUN)),
        ...cards,
      }).listing;
    },
  };
}
