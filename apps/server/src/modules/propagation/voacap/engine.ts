/**
 * VOACAP behind Outpost's engine interface.
 *
 * Turns a circuit into the requests the WebAssembly engine takes (eleven frequencies at
 * a time, an antenna file for each end) and its answers into Outpost's own shapes. No
 * figure is worked out here: values are copied across and rounded for sending.
 */
import {
  type AntennaSpec,
  antennaRunOn,
  type EngineDescription,
  greatCirclePoint,
  HF_MAX_MHZ,
  HF_MIN_MHZ,
  haversineMeters,
  type IonosphereHour,
  initialBearingDeg,
  isSlopingAntenna,
  type PredictionCell,
  type PropagationSite,
} from "@outpost/shared";
import type { CircuitHour, CircuitRequest, CircuitResult, IonosphereRequest, PropagationEngine } from "../engine.ts";
import { antennaFile, describeAntenna, hasAzimuthPattern, netGainDb, runsAsLongWire } from "./antenna-files.ts";
import { type LoadedDataset, type LoadedEngineFile, loadDataset, loadEngineFile, type VoacapPaths } from "./files.ts";
import { EngineError, VoacapInstance } from "./instance.ts";

/** How many frequencies one run of VOACAP takes. */
export const FREQUENCIES_PER_RUN = 11;

export interface WireCell {
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
 * describe: no figures, and a mark saying why. The engine was run with a file all the
 * same (the one that serves every other frequency); what it answered there is thrown
 * away, because it is the answer for a different antenna.
 */
const notModelledCell = (mhz: number): PredictionCell => ({ ...cell({ mhz, mode: null }), notModelled: true });

/**
 * A cell from a run in which one end was the sloping long wire, whose file cannot carry
 * the person's gain and feedline loss. The run was made with the requirement lowered by
 * that figure (so the reliability is the engine's own for the antenna with it), and here
 * the figure is added to what it moves: the ratio and the signal by both ends' figure,
 * the field strength by the transmitting end's (it is measured before the receiving
 * antenna), each end's gain by its own, and the system loss, which counts both gains, the
 * other way. This is what the "gain above dipole" line of the other files does; the
 * engine was run both ways to show it (`test/propagation-wire.test.ts`).
 */
export function withOutsideGain(wire: WireCell, txDb: number, rxDb: number): WireCell {
  if (wire.mode === null || (txDb === 0 && rxDb === 0)) return wire;
  const add = (value: number | undefined, db: number) => (value === undefined ? undefined : value + db);
  return {
    ...wire,
    snrDb: add(wire.snrDb, txDb + rxDb),
    signalDbw: add(wire.signalDbw, txDb + rxDb),
    fieldDbu: add(wire.fieldDbu, txDb),
    txGainDbi: add(wire.txGainDbi, txDb),
    rxGainDbi: add(wire.rxGainDbi, rxDb),
    lossDb: add(wire.lossDb, -(txDb + rxDb)),
  };
}

/** The lowest and highest requirement the engine's card takes, dB in 1 Hz. */
const REQUIRED_RANGE = [-30, 99.9] as const;

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

  /** The broadside bearing of an end's antenna, as the engine is given it for a dipole: the person's, or turned to the other station. */
  const broadsideOf = (spec: AntennaSpec, from: PropagationSite, to: PropagationSite) => {
    if (!hasAzimuthPattern(spec)) return 0;
    // A sloping wire's bearing is its high end's: the person's, or turned away from the other station.
    if (isSlopingAntenna(spec.kind)) return Math.round(((spec.highEndDeg ?? (initialBearingDeg(from, to) + 180) % 360) % 360) * 10) / 10;
    return Math.round((spec.broadsideDeg ?? initialBearingDeg(from, to)) * 10) / 10;
  };

  /**
   * One end at one frequency: the file, the bearing the engine is given, and the gain the
   * file cannot carry. A level wire longer than a half-wave gets a file of its own for the
   * frequency, and since its model's reference direction is along the wire, its bearing
   * is the broadside's turned 90°: the same wire, hung the same way, as on every band.
   */
  function endAt(spec: AntennaSpec, from: PropagationSite, to: PropagationSite, mhz: number) {
    const broadside = broadsideOf(spec, from, to);
    if (isSlopingAntenna(spec.kind))
      return { text: antennaFile(spec, mhz), beamDeg: broadside, outsideDb: runsAsLongWire(spec, mhz) ? netGainDb(spec) : 0 };
    if (runsAsLongWire(spec, mhz))
      return { text: antennaFile(spec, mhz), beamDeg: Math.round(((broadside + 90) % 360) * 10) / 10, outsideDb: netGainDb(spec) };
    return { text: antennaFile(spec), beamDeg: broadside, outsideDb: 0 };
  }

  /**
   * The frequencies of a request in runs that share both antenna files, in the order each
   * first appears, so that the first run holds the first frequency asked for. Every
   * frequency on which neither end is the long wire shares one file per end.
   */
  function runsOf(request: CircuitRequest, frequencies: number[]) {
    const groups = new Map<string, { tx: ReturnType<typeof endAt>; rx: ReturnType<typeof endAt>; at: number[] }>();
    frequencies.forEach((mhz, at) => {
      const tx = endAt(request.txAntenna, request.tx, request.rx, mhz);
      const rx = endAt(request.rxAntenna, request.rx, request.tx, mhz);
      const key = JSON.stringify([tx.text, tx.beamDeg, rx.text, rx.beamDeg]);
      const group = groups.get(key) ?? groups.set(key, { tx, rx, at: [] }).get(key)!;
      group.at.push(at);
    });
    const runs: Array<{ tx: ReturnType<typeof endAt>; rx: ReturnType<typeof endAt>; at: number[] }> = [];
    for (const group of groups.values())
      for (let start = 0; start < group.at.length; start += FREQUENCIES_PER_RUN)
        runs.push({ ...group, at: group.at.slice(start, start + FREQUENCIES_PER_RUN) });
    return runs;
  }

  /** Writes one run's two antenna files and returns the cards that name them. */
  function cardsFor(run: { tx: { text: string; beamDeg: number }; rx: { text: string; beamDeg: number } }) {
    const engine = live();
    engine.writeFile("antennas/outpost/tx", encoder.encode(run.tx.text));
    engine.writeFile("antennas/outpost/rx", encoder.encode(run.rx.text));
    return { txAntennas: [{ file: "outpost/tx", beamDeg: run.tx.beamDeg }], rxAntennas: [{ file: "outpost/rx", beamDeg: run.rx.beamDeg }] };
  }

  /** The requirement a run is made at: lowered by the gain its files cannot carry. */
  function requirementFor(request: CircuitRequest, outsideDb: number): number {
    const required = Math.round((request.requiredSnrDbHz - outsideDb) * 10) / 10;
    if (required < REQUIRED_RANGE[0] || required > REQUIRED_RANGE[1])
      throw new EngineError(
        `with the gain added and feedline loss of the long-wire antenna (${outsideDb.toFixed(1)} dB) the requirement is ${required} dB in 1 Hz, outside what the engine takes (${REQUIRED_RANGE[0]} to ${REQUIRED_RANGE[1]}). Check the gain and loss given for the antenna.`,
      );
    return required;
  }

  const words = (request: CircuitRequest) => ({
    tx: describeAntenna(request.txAntenna, broadsideOf(request.txAntenna, request.tx, request.rx)),
    rx: describeAntenna(request.rxAntenna, broadsideOf(request.rxAntenna, request.rx, request.tx)),
  });

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
      const engine = live();
      const states = request.frequenciesMhz.map((mhz) => [antennaRunOn(request.txAntenna, mhz), antennaRunOn(request.rxAntenna, mhz)]);
      const cells: PredictionCell[][] = [];
      let first: WireSystems | undefined;
      for (const run of runsOf(request, request.frequenciesMhz)) {
        const freqs = run.at.map((at) => request.frequenciesMhz[at]!);
        const outside = run.tx.outsideDb + run.rx.outsideDb;
        const answer = engine.run<WireSystems>({
          task: "systems",
          ...base(request, freqs),
          requiredSnrDb: requirementFor(request, outside),
          ...cardsFor(run),
        });
        first ??= answer;
        for (const [hour, answered] of answer.hours.entries()) {
          if (!cells[hour]) cells[hour] = [];
          const row = cells[hour];
          answered.freqs.forEach((wire, index) => {
            const at = run.at[index]!;
            const [tx, rx] = states[at]!;
            if (tx === "not-modelled" || rx === "not-modelled") row[at] = notModelledCell(wire.mhz);
            else if (tx === "approximate" || rx === "approximate")
              row[at] = { ...cell(withOutsideGain(wire, run.tx.outsideDb, run.rx.outsideDb)), approximate: true };
            else row[at] = cell(wire);
          });
        }
      }
      const hours: CircuitHour[] = first!.hours.map((hour, index) => ({
        utc: Math.round(hour.utc),
        localTime: round(hour.localMeanTime, 2),
        mufMhz: round(hour.mufMhz, 2),
        fotMhz: round(hour.fotMhz, 2),
        hpfMhz: round(hour.hpfMhz, 2),
        cells: cells[index]!,
      }));
      return {
        distanceKm: round(first!.distanceKm, 1),
        bearingDeg: round(first!.bearingTxDeg, 1),
        backBearingDeg: round(first!.bearingRxDeg, 1),
        hours,
        antennas: words(request),
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
      const modelled = request.frequenciesMhz
        .filter((mhz) => antennaRunOn(request.txAntenna, mhz) !== "not-modelled" && antennaRunOn(request.rxAntenna, mhz) !== "not-modelled")
        .slice(0, FREQUENCIES_PER_RUN);
      if (modelled.length === 0)
        throw new Error(
          "There is no page to print: on every frequency asked about, one of the antennas is a wire the engine's model does not describe.",
        );
      // A frequency on which a level wire is run as the long wire has a file of its own, so
      // it is a run, and a page, of its own: each page is what the engine prints for it,
      // headed with what Outpost changed.
      const pages: string[] = [];
      for (const run of runsOf(request, modelled)) {
        const freqs = run.at.map((at) => modelled[at]!);
        const outside = run.tx.outsideDb + run.rx.outsideDb;
        const page = live().run<{ listing: string }>({
          task: "systems",
          listing: true,
          ...base(request, freqs),
          requiredSnrDb: requirementFor(request, outside),
          ...cardsFor(run),
        }).listing;
        const long = [runsAsLongWire(request.txAntenna, freqs[0]!), runsAsLongWire(request.rxAntenna, freqs[0]!)];
        if (!long[0] && !long[1]) {
          pages.push(page);
          continue;
        }
        const which = long[0] && long[1] ? "Both antennas are" : long[0] ? "The transmitting antenna is" : "The receiving antenna is";
        const sloping = [request.txAntenna, request.rxAntenna].filter((spec, at) => long[at] && isSlopingAntenna(spec.kind)).length;
        const what =
          sloping === 0
            ? "a level wire longer than a half-wave, run as VOACAP's sloping long wire (type 41) laid level"
            : sloping === long.filter(Boolean).length
              ? "a sloping wire, run as VOACAP's sloping long wire (type 41) at its slope"
              : "an end-fed wire run as VOACAP's sloping long wire (type 41): the level one laid level, the sloping one at its slope";
        const lowered =
          outside === 0
            ? ""
            : ` Its file cannot carry the gain added and feedline loss (${outside.toFixed(1)} dB), so the requirement on this page is lowered by that much and the signal, ratio and gains printed do not include it.`;
        pages.push(`Outpost: ${freqs[0]} MHz, approximate. ${which} ${what}.${lowered}\n\n${page}`);
      }
      return pages.join("\n\f\n");
    },
  };
}
