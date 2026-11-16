/**
 * Predictions: turning what a person asked into questions for the engine, and the
 * engine's answers into one result.
 *
 * Every figure in a result is the engine's. What is done here is bookkeeping: which
 * sunspot number to run with and where it came from, which frequencies and modes to ask
 * about, and keeping an answer so that the same question is not worked out twice. The
 * one piece of arithmetic is finding the sunspot number at which the engine's own map
 * gives a critical frequency a person measured, and that is a search over the engine's
 * answers, not a formula.
 */
import { createHash } from "node:crypto";
import {
  ANTENNA_PRESETS,
  type CompareRequest,
  type CompareResult,
  type CompareSeries,
  type EngineDescription,
  greatCirclePoint,
  HF_BANDS,
  HF_MAX_MHZ,
  HF_MIN_MHZ,
  type ModeLine,
  modeById,
  NOISE_ENVIRONMENTS,
  noiseSetting,
  OPERATING_MODES,
  type PredictionBasis,
  type PredictionHour,
  type PredictionRequest,
  type PredictionResult,
  type SolarInput,
  snrInOneHertz,
  toMaidenhead,
  utcLabel,
} from "@outpost/shared";
import { eq, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { propagationResults } from "../../db/schema.ts";
import { type CircuitRequest, EngineUnavailable } from "./engine.ts";
import { type EngineHost, EngineRefused } from "./host.ts";
import { currentSolarTable, daysBetween, monthOf, type SolarTable } from "./solar.ts";

/** The frequencies of the heat map: every whole megahertz the engine covers. */
export const SWEEP_MHZ: number[] = Array.from({ length: HF_MAX_MHZ - HF_MIN_MHZ + 1 }, (_, index) => HF_MIN_MHZ + index);

/** The reliability the engine's own definition of the LUF asks for. */
const LUF_RELIABILITY = 0.9;
/** A solar table no older than this is called recent. NOAA republishes its table every month. */
export const RECENT_TABLE_DAYS = 45;
/** How many worked-out answers for single paths are kept. Each is about 60 kB. */
const MAX_KEPT_RESULTS = 300;
/**
 * How many coverage maps and plans are kept beyond the ones a person saved by name or
 * that belong to a plan. A fine coverage map is about a megabyte.
 */
const MAX_KEPT_LARGE = 8;
/** How many sunspot numbers found from a measured foF2 are remembered while the server runs. */
const MAX_FOUND_SSN = 500;
/** Bump when the shape of a stored result changes, so that old rows are not read as new ones. */
const RESULT_VERSION = 1;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export interface PropagationService {
  predict(request: PredictionRequest, signal?: AbortSignal): Promise<PredictionResult>;
  compare(request: CompareRequest, signal?: AbortSignal): Promise<CompareResult>;
  /** An answer already worked out, by its key. */
  result(key: string): PredictionResult | CompareResult | undefined;
  /** The text the reference program prints for the frequency asked about and each band. */
  listing(request: PredictionRequest): Promise<string>;
  /** What coverage maps and communication plans share with a single prediction: the engine, the Sun, and kept answers. */
  internals: PropagationInternals;
}

export type KeptKind = "point" | "compare" | "coverage" | "plan";

export interface PropagationInternals {
  host: EngineHost;
  /** The engine and data answering, and the sunspot number for a month with where it came from. */
  basis(
    date: string,
    solar: Exclude<SolarInput, { source: "fof2" }>,
  ): Promise<{
    basis: PredictionBasis;
    tableSha: string | null;
    description: EngineDescription;
    datasets: Array<{ id: string; version: string }>;
  }>;
  keyOf(kind: KeptKind, body: unknown): string;
  /** The answer kept under a key, for someone who asked for it: reading it counts as a use. */
  kept<T>(key: string): T | undefined;
  /** Whether an answer is kept under a key. For lists: nothing is read, and it is not a use. */
  has(key: string): boolean;
  keep(key: string, kind: KeptKind, engine: EngineDescription, request: unknown, result: unknown): void;
}

/** Turns an engine failure into something the HTTP layer reports properly. */
export function engineProblem(error: unknown): never {
  if (error instanceof EngineUnavailable) throw new AppError("unsupported", error.message, { reason: "engine-unavailable" });
  if (error instanceof EngineRefused) throw badRequest(`The propagation engine could not work this out: ${error.message}`);
  throw error;
}

/** A number to so many decimal places, as a number: what the engine is given, and so what an answer is kept under. */
export const fix = (value: number, places: number): number => Number(value.toFixed(places));

/** Inputs as the engine will read them: positions to a hundredth of a degree, frequency to 10 kHz, power to a tenth of a watt. */
export function normalise(request: PredictionRequest): PredictionRequest {
  const grid = (value: number, step: number) => Math.round(value / step) * step;
  const site = (s: PredictionRequest["tx"]) => ({
    name: s.name.trim().slice(0, 60),
    lat: fix(grid(s.lat, 0.01), 2),
    lon: fix(grid(s.lon, 0.01), 2),
  });
  return {
    ...request,
    tx: site(request.tx),
    rx: site(request.rx),
    powerWatts: fix(grid(request.powerWatts, 0.1), 1),
    frequencyMhz: fix(grid(request.frequencyMhz, 0.01), 2),
    reply: request.reply ? { powerWatts: fix(grid(request.reply.powerWatts, 0.1), 1), noise: request.reply.noise } : undefined,
  };
}

export function modeLine(id: PredictionRequest["mode"], requiredSnrDb?: number, referenceBandwidthHz?: number): ModeLine {
  const mode = modeById(id);
  const snr = requiredSnrDb ?? mode.requiredSnrDb;
  const bandwidth = referenceBandwidthHz ?? mode.referenceBandwidthHz;
  // A bandwidth given on its own is applied to the mode's figure. That is no longer what
  // the figure's publisher stated, so it is not put down to the publisher alone.
  let source = mode.source;
  if (requiredSnrDb !== undefined) source = "Your own figure";
  else if (snr !== null && bandwidth !== mode.referenceBandwidthHz)
    source = `Your own bandwidth, with the figure published for ${mode.referenceBandwidthHz} Hz (${mode.source})`;
  return {
    id: mode.id,
    label: mode.label,
    requiredSnrDb: snr,
    referenceBandwidthHz: bandwidth,
    requiredSnrDbHz: snr === null ? null : Number(snrInOneHertz(snr, bandwidth).toFixed(1)),
    source,
  };
}

const LIMITS = [
  "This is a monthly median from maps of the ionosphere made from decades of soundings. It says what a month like this one usually does, not what the ionosphere is doing today. A geomagnetic storm, a solar flare or sporadic E can make any one day quite different.",
  "Reliability is the share of days in the month on which the signal-to-noise ratio is predicted to reach what the mode needs. It is not the chance that a particular contact succeeds: that also depends on interference from other stations, on the operators and on the equipment.",
  "Noise is the engine's estimate for the kind of place chosen. Noise at a real receiver, especially in a town, is often well above it, and that lowers every figure here.",
  "Antenna gain comes from the engine's model of an ideal antenna of the kind chosen over flat, even ground. Nearby buildings, sloping wires and poor ground connections are not in it.",
  "Nothing here says which frequencies you may transmit on. That is set by your licence; the band sheets in the library give the limits.",
];

export function createPropagationService(ctx: AppContext, host: EngineHost): PropagationService {
  const { db } = ctx;

  // ── Kept answers ──────────────────────────────────────────────────────────

  function keyOf(kind: KeptKind, body: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify({ v: RESULT_VERSION, kind, body }))
      .digest("hex")
      .slice(0, 40);
  }

  function kept<T>(key: string): T | undefined {
    const row = db.select().from(propagationResults).where(eq(propagationResults.key, key)).get();
    if (!row) return undefined;
    db.update(propagationResults).set({ lastUsedAt: Date.now() }).where(eq(propagationResults.key, key)).run();
    return row.result as T;
  }

  const hasKey = ctx.sqlite.prepare("SELECT 1 FROM propagation_results WHERE key = ?").pluck();
  const has = (key: string): boolean => hasKey.get(key) !== undefined;

  function keep(key: string, kind: KeptKind, engine: EngineDescription, request: unknown, result: unknown): void {
    const now = Date.now();
    db.insert(propagationResults)
      .values({
        key,
        kind,
        engine: `${engine.id} ${engine.sha256.slice(0, 12)}`,
        request: request as Record<string, unknown>,
        result: result as Record<string, unknown>,
        createdAt: now,
        lastUsedAt: now,
      })
      .onConflictDoNothing()
      .run();
    // The least recently used go when there are too many. Single paths are small and many;
    // maps and plans are large and few, and one a person saved or a plan shows is never dropped.
    db.run(
      sql`DELETE FROM propagation_results WHERE kind IN ('point', 'compare') AND key NOT IN (SELECT key FROM propagation_results WHERE kind IN ('point', 'compare') ORDER BY last_used_at DESC LIMIT ${MAX_KEPT_RESULTS})`,
    );
    // The eight are counted among the ones nobody has pinned. Counted among them all, eight
    // saved maps and plans would fill every place and a new map would go as soon as it was made.
    db.run(
      sql`WITH loose AS (
            SELECT key, last_used_at FROM propagation_results WHERE kind IN ('coverage', 'plan')
              AND key NOT IN (SELECT result_key FROM propagation_saved WHERE result_key IS NOT NULL)
              AND key NOT IN (SELECT result_key FROM communication_plans WHERE result_key IS NOT NULL)
          )
          DELETE FROM propagation_results WHERE key IN (SELECT key FROM loose)
            AND key NOT IN (SELECT key FROM loose ORDER BY last_used_at DESC LIMIT ${MAX_KEPT_LARGE})`,
    );
  }

  // ── The Sun ───────────────────────────────────────────────────────────────

  const today = () => new Date().toISOString().slice(0, 10);

  function tableBasis(table: SolarTable, month: string): PredictionBasis {
    const row = monthOf(table, month);
    if (!row) {
      const first = table.months[0]!.month;
      const last = table.months[table.months.length - 1]!.month;
      throw badRequest(
        `The solar cycle table has no sunspot number for ${monthName(month)}: it runs from ${monthName(first)} to ${monthName(last)}. Give a sunspot number yourself, or download a newer table.`,
        { reason: "no-solar-month" },
      );
    }
    const age = Math.max(0, daysBetween(table.dataDate, today()));
    const where = table.origin === "included" ? "the table that came with Outpost" : "the table you downloaded";
    return {
      kind: age <= RECENT_TABLE_DAYS ? "recent-solar" : "climatology",
      ssn: Math.round(row.ssn),
      summary: `Monthly median for ${monthName(month)} at smoothed sunspot number ${Math.round(row.ssn)}, which is NOAA's forecast for the month in ${where}, dated ${table.dataDate} (${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}).`,
      tableDate: table.dataDate,
      tableAgeDays: age,
      ssnLow: row.low === null ? null : Math.round(row.low),
      ssnHigh: row.high === null ? null : Math.round(row.high),
    };
  }

  /**
   * Sunspot numbers already found from a measured foF2, by everything the search depends
   * on. The number is part of the key an answer is kept under, so without this the
   * search would be made again before a kept answer could even be looked up.
   */
  const foundSsn = new Map<string, number>();

  /**
   * The sunspot number at which the engine's map gives the measured foF2 over the middle
   * of the path, by bisection over the engine's own answers. `engine` says which engine
   * and data are answering.
   */
  async function searchForSsn(request: PredictionRequest, engine: string, signal?: AbortSignal): Promise<number> {
    if (request.solar.source !== "fof2") throw new Error("not a foF2 request");
    const { fof2Mhz, utcHour } = request.solar;
    const month = request.date.slice(0, 7);
    const question = JSON.stringify([engine, request.tx.lat, request.tx.lon, request.rx.lat, request.rx.lon, month, fof2Mhz, utcHour]);
    const found = foundSsn.get(question);
    if (found !== undefined) return found;
    // Each sunspot number is put to the engine once: the two the search ends between were asked on the way.
    const answers = new Map<number, number>();
    const at = async (ssn: number) => {
      let foF2 = answers.get(ssn);
      if (foF2 === undefined) {
        const hours = await host.ionosphere(
          { tx: request.tx, rx: request.rx, year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)), ssn },
          signal,
        );
        foF2 = hours[utcHour - 1]!.foF2;
        answers.set(ssn, foF2);
      }
      return foF2;
    };
    let low = 0;
    let high = 300;
    const [atLow, atHigh] = [await at(low), await at(high)];
    if (fof2Mhz < atLow || fof2Mhz > atHigh) {
      throw badRequest(
        `For ${monthName(month)} at ${utcLabel(utcHour)} UTC the engine's map gives an foF2 between ${atLow.toFixed(1)} MHz (sunspot number 0) and ${atHigh.toFixed(1)} MHz (sunspot number 300) over the middle of this path. ${fof2Mhz} MHz is outside that, so no sunspot number matches it. Check the figure and the hour, or give a sunspot number instead.`,
        { reason: "fof2-out-of-range" },
      );
    }
    while (high - low > 1) {
      const middle = Math.round((low + high) / 2);
      if ((await at(middle)) < fof2Mhz) low = middle;
      else high = middle;
    }
    const ssn = Math.abs((await at(low)) - fof2Mhz) <= Math.abs((await at(high)) - fof2Mhz) ? low : high;
    if (foundSsn.size >= MAX_FOUND_SSN) foundSsn.delete(foundSsn.keys().next().value!);
    foundSsn.set(question, ssn);
    return ssn;
  }

  async function ssnForFoF2(request: PredictionRequest, engine: string, signal?: AbortSignal): Promise<PredictionBasis> {
    if (request.solar.source !== "fof2") throw new Error("not a foF2 request");
    const { fof2Mhz, utcHour } = request.solar;
    const ssn = await searchForSsn(request, engine, signal);
    return {
      kind: "own-measurement",
      ssn,
      summary: `Run at sunspot number ${ssn}, the number at which the engine's own map gives the foF2 you measured (${fof2Mhz} MHz at ${utcLabel(utcHour)} UTC) over the middle of the path. The whole day is run at that number: one measurement stands for the day, and the shape of the day is still the monthly median's.`,
      tableDate: null,
      tableAgeDays: null,
      ssnLow: null,
      ssnHigh: null,
    };
  }

  /** Which engine and data are answering, for anything remembered about their answers. */
  const engineOf = (described: Awaited<ReturnType<EngineHost["describe"]>>) =>
    JSON.stringify([described.description.sha256, described.datasets]);

  async function basisOf(
    request: PredictionRequest,
    engine: string,
    signal?: AbortSignal,
  ): Promise<{ basis: PredictionBasis; tableSha: string | null }> {
    const month = request.date.slice(0, 7);
    if (request.solar.source === "manual") {
      return {
        basis: {
          kind: "own-measurement",
          ssn: Math.round(request.solar.ssn),
          summary: `Monthly median for ${monthName(month)} at the smoothed sunspot number you gave, ${Math.round(request.solar.ssn)}.`,
          tableDate: null,
          tableAgeDays: null,
          ssnLow: null,
          ssnHigh: null,
        },
        tableSha: null,
      };
    }
    if (request.solar.source === "fof2") return { basis: await ssnForFoF2(request, engine, signal), tableSha: null };
    const table = currentSolarTable(ctx.config.dataDir);
    return { basis: tableBasis(table, month), tableSha: table.sha256 };
  }

  // ── One path ──────────────────────────────────────────────────────────────

  function circuitOf(request: PredictionRequest, ssn: number, frequenciesMhz: number[], requiredSnrDbHz: number): CircuitRequest {
    return {
      tx: request.tx,
      rx: request.rx,
      year: Number(request.date.slice(0, 4)),
      month: Number(request.date.slice(5, 7)),
      ssn,
      powerWatts: request.powerWatts,
      frequenciesMhz,
      requiredSnrDbHz,
      noiseDbwAt3Mhz: noiseSetting(request.noise).dbwAt3Mhz,
      txAntenna: request.txAntenna,
      rxAntenna: request.rxAntenna,
    };
  }

  /** The same circuit the other way round: the receiver transmitting, the transmitter listening. */
  function replyOf(request: PredictionRequest, ssn: number, requiredSnrDbHz: number): CircuitRequest {
    return {
      ...circuitOf(request, ssn, [request.frequencyMhz], requiredSnrDbHz),
      tx: request.rx,
      rx: request.tx,
      powerWatts: request.reply!.powerWatts,
      noiseDbwAt3Mhz: noiseSetting(request.reply!.noise).dbwAt3Mhz,
      txAntenna: request.rxAntenna,
      rxAntenna: request.txAntenna,
    };
  }

  async function predict(asked: PredictionRequest, signal?: AbortSignal): Promise<PredictionResult> {
    const request = normalise(asked);
    if (request.tx.lat === request.rx.lat && request.tx.lon === request.rx.lon) {
      throw badRequest("The transmitter and the receiver are in the same place. Choose two different places.");
    }
    const mode = modeLine(request.mode, request.requiredSnrDb, request.referenceBandwidthHz);
    try {
      const described = await host.describe();
      const { description, datasets } = described;
      const { basis, tableSha } = await basisOf(request, engineOf(described), signal);
      const key = keyOf("point", { request, ssn: basis.ssn, tableSha, engine: description.sha256, datasets });
      const found = kept<PredictionResult>(key);
      if (found) return { ...found, basis, cached: true };

      // A mode with no figure is still run, at a requirement of 0 dB in 1 Hz that every
      // signal meets; its reliability is then thrown away and only the ratios are kept.
      const required = mode.requiredSnrDbHz ?? 0;
      const bandMhz = HF_BANDS.map((band) => band.mhz);
      const main = await host.circuit(circuitOf(request, basis.ssn, [request.frequencyMhz, ...bandMhz, ...SWEEP_MHZ], required), signal);
      const ionosphere = await host.ionosphere(
        { tx: request.tx, rx: request.rx, year: Number(request.date.slice(0, 4)), month: Number(request.date.slice(5, 7)), ssn: basis.ssn },
        signal,
      );

      const modes = OPERATING_MODES.map((item) => (item.id === mode.id ? mode : modeLine(item.id)));
      const perMode: Array<number[] | null> = [];
      for (const line of modes) {
        if (line.requiredSnrDbHz === null) perMode.push(null);
        else if (line.id === mode.id) perMode.push(main.hours.map((hour) => hour.cells[0]!.reliability));
        else {
          const run = await host.circuit(circuitOf(request, basis.ssn, [request.frequencyMhz], line.requiredSnrDbHz), signal);
          perMode.push(run.hours.map((hour) => hour.cells[0]!.reliability));
        }
      }
      const reply = request.reply ? await host.circuit(replyOf(request, basis.ssn, required), signal) : null;

      const sweepStart = 1 + bandMhz.length;
      const hours: PredictionHour[] = main.hours.map((hour, index) => {
        const sweep = hour.cells.slice(sweepStart);
        const luf = mode.requiredSnrDbHz === null ? undefined : sweep.find((cell) => cell.reliability >= LUF_RELIABILITY);
        const blank = mode.requiredSnrDbHz === null;
        const cells = blank ? hour.cells.map((cell) => ({ ...cell, reliability: 0 })) : hour.cells;
        return {
          utc: hour.utc,
          localTime: hour.localTime,
          mufMhz: hour.mufMhz,
          fotMhz: hour.fotMhz,
          hpfMhz: hour.hpfMhz,
          lufMhz: luf ? luf.mhz : null,
          ionosphere: ionosphere[index]!,
          asked: cells[0]!,
          bands: cells.slice(1, sweepStart),
          sweepReliability: cells.slice(sweepStart).map((cell) => cell.reliability),
          sweepSnrDbHz: sweep.map((cell) => cell.snrDbHz),
          modeReliability: perMode.map((list) => (list ? list[index]! : null)),
          reply: reply
            ? { reliability: blank ? 0 : reply.hours[index]!.cells[0]!.reliability, snrDbHz: reply.hours[index]!.cells[0]!.snrDbHz }
            : null,
        };
      });

      const middle = greatCirclePoint(request.tx, request.rx, 0.5);
      const result: PredictionResult = {
        key,
        request,
        computedAt: Date.now(),
        cached: false,
        engine: description,
        datasets: [...datasets, ...(tableSha ? [{ id: "solar-cycle", version: `${basis.tableDate} ${tableSha.slice(0, 12)}` }] : [])],
        basis,
        path: {
          distanceKm: main.distanceKm,
          bearingDeg: main.bearingDeg,
          backBearingDeg: main.backBearingDeg,
          midpoint: { lat: Number(middle.lat.toFixed(4)), lon: Number(middle.lon.toFixed(4)) },
          txLocator: toMaidenhead(request.tx.lat, request.tx.lon, 6) ?? "",
          rxLocator: toMaidenhead(request.rx.lat, request.rx.lon, 6) ?? "",
        },
        mode,
        modes,
        sweepMhz: SWEEP_MHZ,
        hours,
        antennas: main.antennas,
        deck: main.deck,
        limits: LIMITS,
      };
      keep(key, "point", description, request, result);
      return result;
    } catch (error) {
      engineProblem(error);
    }
  }

  // ── The same path with one thing changed ──────────────────────────────────

  async function compare(input: CompareRequest, signal?: AbortSignal): Promise<CompareResult> {
    const base = normalise(input.base);
    const mode = modeLine(base.mode, base.requiredSnrDb, base.referenceBandwidthHz);
    if (mode.requiredSnrDbHz === null)
      throw badRequest("Give the signal-to-noise ratio your mode needs before comparing: without it there is no reliability to compare.");
    try {
      const described = await host.describe();
      const { description, datasets } = described;
      const { basis, tableSha } = await basisOf(base, engineOf(described), signal);
      const key = keyOf("compare", { base, what: input.what, ssn: basis.ssn, tableSha, engine: description.sha256, datasets });
      const found = kept<CompareResult>(key);
      if (found) return { ...found, basis };

      const variants: Array<{ label: string; detail: string; request: PredictionRequest; ssn: number }> = [];
      const add = (label: string, detail: string, patch: Partial<PredictionRequest>, ssn = basis.ssn) =>
        variants.push({ label, detail, request: { ...base, ...patch }, ssn });
      switch (input.what) {
        case "seasons":
          for (let month = 1; month <= 12; month++) {
            add(MONTHS[month - 1]!.slice(0, 3), `${MONTHS[month - 1]} at sunspot number ${basis.ssn}`, {
              date: `${base.date.slice(0, 4)}-${String(month).padStart(2, "0")}-15`,
            });
          }
          break;
        case "sunspots":
          for (const ssn of [...new Set([10, 50, basis.ssn, 100, 150])].sort((a, b) => a - b)) {
            add(`SSN ${ssn}`, ssn === basis.ssn ? `Sunspot number ${ssn}, as predicted` : `Sunspot number ${ssn}`, {}, ssn);
          }
          break;
        case "power":
          for (const watts of [...new Set([1, 5, 25, 100, base.powerWatts])].sort((a, b) => a - b)) {
            add(`${watts} W`, watts === base.powerWatts ? `${watts} W, as asked` : `${watts} W`, { powerWatts: watts });
          }
          break;
        case "antennas":
          for (const preset of ANTENNA_PRESETS) add(preset.name, preset.modelledAs, { txAntenna: preset.spec });
          break;
        case "noise":
          for (const noise of NOISE_ENVIRONMENTS) add(noise.label, `${noise.dbwAt3Mhz} dBW in 1 Hz at 3 MHz`, { noise: noise.id });
          break;
      }

      const series: CompareSeries[] = [];
      for (const variant of variants) {
        const run = await host.circuit(circuitOf(variant.request, variant.ssn, [base.frequencyMhz], mode.requiredSnrDbHz), signal);
        const iono = await host.ionosphere(
          {
            tx: base.tx,
            rx: base.rx,
            year: Number(variant.request.date.slice(0, 4)),
            month: Number(variant.request.date.slice(5, 7)),
            ssn: variant.ssn,
          },
          signal,
        );
        series.push({
          label: variant.label,
          detail: variant.detail,
          ssn: variant.ssn,
          reliability: run.hours.map((hour) => hour.cells[0]!.reliability),
          snrDbHz: run.hours.map((hour) => hour.cells[0]!.snrDbHz),
          mufMhz: run.hours.map((hour) => hour.mufMhz),
          foF2: iono.map((hour) => hour.foF2),
        });
      }
      const result: CompareResult = { what: input.what, frequencyMhz: base.frequencyMhz, mode, series, engine: description, basis };
      keep(key, "compare", description, { base, what: input.what }, { ...result, key });
      return result;
    } catch (error) {
      engineProblem(error);
    }
  }

  return {
    predict,
    compare,
    internals: {
      host,
      keyOf,
      kept,
      has,
      keep,
      async basis(date, solar) {
        const described = await host.describe();
        const { basis, tableSha } = await basisOf({ date, solar } as PredictionRequest, engineOf(described));
        return { basis, tableSha, description: described.description, datasets: described.datasets };
      },
    },
    result: (key) => kept(key),
    async listing(asked) {
      const request = normalise(asked);
      const mode = modeLine(request.mode, request.requiredSnrDb, request.referenceBandwidthHz);
      try {
        const { basis } = await basisOf(request, engineOf(await host.describe()));
        return await host.listing(
          circuitOf(request, basis.ssn, [request.frequencyMhz, ...HF_BANDS.map((band) => band.mhz)], mode.requiredSnrDbHz ?? 0),
        );
      } catch (error) {
        engineProblem(error);
      }
    },
  };
}
