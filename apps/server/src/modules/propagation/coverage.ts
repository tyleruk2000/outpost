/**
 * Coverage maps: one transmitter, and the engine asked about a receiver at the centre
 * of every cell of a grid.
 *
 * Nothing here estimates anything. A cell holds what the engine answered for that
 * place, for each of the 24 hours; a cell the engine could not answer holds nothing and
 * says why. No cell is filled in from its neighbours. The grid is a job: it reports
 * each cell as it goes, stops between cells when asked, and starts again from the first
 * cell if the server is restarted part of the way through (a grid is seconds of work,
 * so nothing is kept of a half-finished one).
 */
import {
  antennaRunOn,
  approximateOn,
  COVERAGE_MAX_CELLS,
  COVERAGE_MAX_LAT,
  COVERAGE_MIN_SPAN_DEG,
  type CoverageCell,
  type CoverageOverview,
  type CoverageRequest,
  type CoverageResult,
  coverageCellCentre,
  coverageGrid,
  isSlopingAntenna,
  noiseSetting,
  type SavedCoverage,
} from "@outpost/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { toJobDto } from "../../core/jobs.ts";
import { propagationSaved } from "../../db/schema.ts";
import { EngineRefused } from "./host.ts";
import { engineProblem, fix, type PropagationService, wireRunsMark } from "./service.ts";
import { antenna, checkedMode, checkedModelled, date, frequency, modes, noise, power, site } from "./shapes.ts";
import { turnedToOtherStation } from "./voacap/antenna-files.ts";

export const COVERAGE_JOB = "propagation.coverage";
/** How many coverage maps may be waiting or running at once. One runs at a time; the rest queue. */
export const COVERAGE_MAX_WAITING = 3;

const area = z
  .object({
    west: z.number().min(-180).max(180),
    south: z.number().min(-COVERAGE_MAX_LAT).max(COVERAGE_MAX_LAT),
    east: z.number().min(-180).max(540),
    north: z.number().min(-COVERAGE_MAX_LAT).max(COVERAGE_MAX_LAT),
  })
  .superRefine((value, issue) => {
    const problem = (message: string) => issue.addIssue({ code: "custom", message });
    if (value.north - value.south < COVERAGE_MIN_SPAN_DEG || value.east - value.west < COVERAGE_MIN_SPAN_DEG)
      problem(`The area is too small for a grid: make it at least ${COVERAGE_MIN_SPAN_DEG}° each way.`);
    else if (value.east - value.west > 360) problem("The area is wider than the whole Earth. Make it 360° of longitude or less.");
  });

const coverage = z.object({
  tx: site,
  date,
  powerWatts: power,
  txAntenna: antenna,
  rxAntenna: antenna,
  noise,
  frequencyMhz: frequency,
  mode: modes,
  requiredSnrDb: z.number().min(-60).max(99).optional(),
  referenceBandwidthHz: z.number().min(1).max(100_000).optional(),
  solar: z.discriminatedUnion("source", [
    z.object({ source: z.literal("table") }),
    z.object({ source: z.literal("manual"), ssn: z.number().min(0).max(300) }),
  ]),
  area,
  resolution: z.enum(["coarse", "medium", "fine"]),
});

/** The request as the engine will read it, so that the same question always has the same key. */
export function normaliseCoverage(request: CoverageRequest): CoverageRequest {
  return {
    ...request,
    tx: { name: request.tx.name.trim().slice(0, 60), lat: fix(request.tx.lat, 2), lon: fix(request.tx.lon, 2) },
    powerWatts: fix(request.powerWatts, 1),
    frequencyMhz: fix(request.frequencyMhz, 2),
    area: {
      west: fix(request.area.west, 2),
      south: fix(request.area.south, 2),
      east: fix(request.area.east, 2),
      north: fix(request.area.north, 2),
    },
  };
}

function checkedCoverage(body: unknown): CoverageRequest {
  const request = normaliseCoverage(coverage.parse(body) as CoverageRequest);
  checkedMode(request);
  checkedModelled(request);
  const grid = coverageGrid(request.area, request.resolution);
  // Cannot happen with the three grids offered; it guards the sum, not the person.
  if (grid.columns * grid.rows > COVERAGE_MAX_CELLS) throw badRequest(`A coverage map may have at most ${COVERAGE_MAX_CELLS} cells.`);
  return request;
}

const LIMITS = [
  "Each cell is the engine's answer for a receiver at the centre of that cell. Nothing between cell centres was worked out, so a cell says nothing certain about its edges, and a coarse grid can miss a skip zone narrower than its cells.",
  "Every cell assumes the same receiving antenna and the same man-made noise. A real map of who can hear you would differ station by station.",
  "This is a monthly median from maps of the ionosphere made from decades of soundings: what a month like this one usually does, not what the ionosphere is doing today.",
  "Reliability is the share of days in the month on which the signal-to-noise ratio is predicted to reach what the mode needs. It is not the chance that a particular contact succeeds.",
  "Nothing here says which frequencies you may transmit on. That is set by your licence.",
];

export interface CoverageService {
  /** The map for a request if it has been worked out, without working anything out. */
  find(request: CoverageRequest): Promise<{ key: string; result: CoverageResult | undefined }>;
  /** Works the grid out, cell by cell. */
  work(request: CoverageRequest, signal?: AbortSignal, progress?: (done: number, total: number) => void): Promise<CoverageResult>;
  eraseSaved(): number;
}

export function registerCoverage(app: FastifyInstance, ctx: AppContext, service: PropagationService): CoverageService {
  const { internals } = service;

  async function keyed(request: CoverageRequest) {
    const mode = checkedMode(request);
    const { basis, tableSha, description, datasets } = await internals.basis(request.date, request.solar);
    const key = internals.keyOf("coverage", {
      request,
      ssn: basis.ssn,
      tableSha,
      engine: description.sha256,
      datasets,
      ...wireRunsMark([request.txAntenna, request.rxAntenna], [request.frequencyMhz]),
    });
    return { mode, basis, tableSha, description, datasets, key };
  }

  async function find(request: CoverageRequest) {
    try {
      const { key, basis } = await keyed(request);
      const result = internals.kept<CoverageResult>(key);
      return { key, result: result ? { ...result, basis, cached: true } : undefined };
    } catch (error) {
      engineProblem(error);
    }
  }

  async function work(request: CoverageRequest, signal?: AbortSignal, progress?: (done: number, total: number) => void) {
    try {
      const { mode, basis, tableSha, description, datasets, key } = await keyed(request);
      const found = internals.kept<CoverageResult>(key);
      if (found) return { ...found, basis, cached: true };

      const started = Date.now();
      const grid = coverageGrid(request.area, request.resolution);
      const total = grid.columns * grid.rows;
      const cells: Array<CoverageCell | null> = [];
      const unanswered: CoverageResult["unanswered"] = [];
      let antennas: CoverageResult["antennas"] | undefined;
      for (let index = 0; index < total; index++) {
        // Stopping is asked between cells, each a few milliseconds: the engine's thread is
        // left running, so a prediction someone else is waiting for is not lost with it.
        if (signal?.aborted) throw new Error("The coverage map was stopped.");
        const centre = coverageCellCentre(grid, index);
        const rx = { name: "", lat: fix(centre.lat, 2), lon: fix(centre.lon, 2) };
        if (rx.lat === request.tx.lat && rx.lon === request.tx.lon) {
          cells.push(null);
          unanswered.push({ index, reason: "The transmitter is at the centre of this cell, and a path needs two different places." });
          continue;
        }
        try {
          const circuit = await internals.host.circuit({
            tx: request.tx,
            rx,
            year: Number(request.date.slice(0, 4)),
            month: Number(request.date.slice(5, 7)),
            ssn: basis.ssn,
            powerWatts: request.powerWatts,
            frequenciesMhz: [request.frequencyMhz],
            // A mode with no figure is run at a requirement every signal meets, and its reliability is thrown away.
            requiredSnrDbHz: mode.requiredSnrDbHz ?? 0,
            noiseDbwAt3Mhz: noiseSetting(request.noise).dbwAt3Mhz,
            txAntenna: request.txAntenna,
            rxAntenna: request.rxAntenna,
          });
          antennas ??= circuit.antennas;
          const hours = circuit.hours.map((hour) => hour.cells[0]!);
          // An hour with no path has no figures: the engine's blanks must not be read as 0 dB.
          const read = (pick: (cell: (typeof hours)[number]) => number) => hours.map((cell) => (cell.path === null ? null : pick(cell)));
          cells.push({
            distanceKm: circuit.distanceKm,
            bearingDeg: circuit.bearingDeg,
            reliability: mode.requiredSnrDbHz === null ? null : read((cell) => cell.reliability),
            snrDbHz: read((cell) => cell.snrDbHz),
            signalDbw: read((cell) => cell.signalDbw),
          });
        } catch (error) {
          if (!(error instanceof EngineRefused)) throw error;
          cells.push(null);
          unanswered.push({ index, reason: `The engine could not work this place out: ${error.message}` });
        }
        progress?.(index + 1, total);
      }
      if (!antennas) throw badRequest("The engine answered for none of the cells, so there is no map to show.");

      const turned = (spec: CoverageRequest["txAntenna"]) => turnedToOtherStation(spec);
      const approximate = approximateOn(request.txAntenna, request.rxAntenna, request.frequencyMhz);
      const limits = [
        ...(approximate ? [`Every figure on this map is approximate. ${approximate}`] : []),
        ...(turned(request.txAntenna)
          ? [
              isSlopingAntenna(request.txAntenna.kind)
                ? "The transmitting antenna has no bearing, so it was turned with its low end towards each cell in turn and its high end away: the picture is of the wire turned to every direction, not of one fixed wire. Give the antenna the bearing of its high end to see its pattern."
                : antennaRunOn(request.txAntenna, request.frequencyMhz) === "approximate"
                  ? "The transmitting antenna has no bearing, so it was turned broadside to each cell in turn: the picture is of the wire broadside to every direction, not of one fixed wire, and a wire longer than a half-wave is not strongest broadside. Give the antenna a bearing to see its pattern."
                  : "The transmitting antenna has no bearing, so it was turned broadside to each cell in turn: the picture is of the best the antenna can do in every direction, not of one fixed wire. Give the antenna a bearing to see its pattern.",
            ]
          : []),
        ...LIMITS,
      ];
      // The words for the antennas are the first answered cell's, less the bearing that belongs to that one cell.
      const plain = (words: string, spec: CoverageRequest["txAntenna"], whom: string) =>
        turned(spec)
          ? words
              .replace(/, broadside towards \d+° \(the other station\)/, `, broadside turned towards ${whom}`)
              .replace(/, the wire running \d+° to \d+°/, "")
              .replace(/, its high end towards \d+° \(away from the other station\)/, `, its low end turned towards ${whom}`)
          : words;
      const result: CoverageResult = {
        key,
        request,
        computedAt: Date.now(),
        cached: false,
        tookMs: Date.now() - started,
        engine: description,
        datasets: [...datasets, ...(tableSha ? [{ id: "solar-cycle", version: `${basis.tableDate} ${tableSha.slice(0, 12)}` }] : [])],
        basis,
        mode,
        grid,
        cells,
        unanswered,
        antennas: {
          tx: plain(antennas.tx, request.txAntenna, "each cell"),
          rx: plain(antennas.rx, request.rxAntenna, "the transmitter"),
        },
        approximate,
        limits,
      };
      internals.keep(key, "coverage", description, request, result);
      return result;
    } catch (error) {
      engineProblem(error);
    }
  }

  ctx.jobs.register<{ request: Record<string, unknown> }>(COVERAGE_JOB, {
    queue: "propagation",
    async run({ payload, signal, progress }) {
      const request = checkedCoverage(payload.request);
      const grid = coverageGrid(request.area, request.resolution);
      progress({ current: 0, total: grid.columns * grid.rows, message: "Asking the engine about each cell" });
      const result = await work(request, signal, (current, total) => progress({ current, total }));
      return { kind: "coverage", key: result.key, cells: result.cells.length, unanswered: result.unanswered.length, tookMs: result.tookMs };
    },
  });

  // ── Routes ────────────────────────────────────────────────────────────────

  // Asked for by type: among the newest jobs of every kind, a few hundred of another kind would hide these.
  const waiting = () => ctx.jobs.list({ states: ["queued", "running", "paused"], types: [COVERAGE_JOB], limit: 200 });

  app.post("/api/radio/propagation/coverage", async (request) => {
    const body = checkedCoverage(request.body);
    const { key, result } = await find(body);
    if (result) return { coverage: result };
    // The same map asked for twice is one job, not two.
    const jobs = waiting();
    const same = jobs.find((job) => job.subject === key);
    if (same) return { job: toJobDto(same) };
    if (jobs.length >= COVERAGE_MAX_WAITING) {
      throw new AppError(
        "conflict",
        `${COVERAGE_MAX_WAITING} coverage maps are already being worked out or waiting their turn. Wait for one to finish, or stop one, then ask again.`,
        { reason: "coverage-busy" },
      );
    }
    const grid = coverageGrid(body.area, body.resolution);
    return {
      job: toJobDto(
        ctx.jobs.enqueue(
          COVERAGE_JOB,
          { request: body as unknown as Record<string, unknown> },
          {
            title: `HF coverage from ${body.tx.name || "the transmitter"}, ${body.frequencyMhz} MHz, ${grid.columns * grid.rows} cells`,
            subject: key,
            maxAttempts: 1,
          },
        ),
      ),
    };
  });

  const keyParams = z.object({ key: z.string().regex(/^[0-9a-f]{40}$/) });

  /**
   * The saved maps, or one of them, without their stored results. A fine map is most of a
   * megabyte: a list does not bring ten of them into the server to be parsed and counted,
   * and listing a map is not a use of it. A saved map without its figures cannot be shown,
   * and the join leaves it out.
   */
  const savedRows = (only: string) =>
    ctx.sqlite.prepare(
      `SELECT s.id, s.name, s.created_at AS createdAt, r.key, r.request, r.created_at AS keptAt
         FROM propagation_saved s JOIN propagation_results r ON r.key = s.result_key
        WHERE s.kind = 'coverage'${only} ORDER BY s.created_at DESC, s.id`,
    );
  const everySaved = savedRows("");
  const oneSaved = savedRows(" AND s.id = ?");
  interface SavedRow extends Pick<SavedCoverage, "id" | "name" | "key" | "createdAt"> {
    request: string;
    keptAt: number;
  }

  /**
   * The three figures a list shows of a result, read out of it by the database (one pass
   * over the text, about 4 ms for a fine map) the first time they are wanted and then
   * remembered. A result never changes under its key; `keptAt` tells a result that was
   * cleared and worked out again from the one remembered.
   */
  type Figures = Pick<SavedCoverage, "computedAt" | "ssn" | "cells"> & { keptAt: number };
  let figures = new Map<string, Figures>();
  const readFigures = ctx.sqlite.prepare(
    `SELECT json_extract(result, '$.computedAt') AS computedAt, json_extract(result, '$.basis.ssn') AS ssn,
            json_array_length(result, '$.cells') AS cells
       FROM propagation_results WHERE key = ?`,
  );
  const figuresOf = (key: string, keptAt: number): Figures => {
    let found = figures.get(key);
    if (found?.keptAt !== keptAt) {
      found = { ...(readFigures.get(key) as Omit<Figures, "keptAt">), keptAt };
      figures.set(key, found);
    }
    return found;
  };
  const savedOf = (row: SavedRow): SavedCoverage => {
    const { computedAt, ssn, cells } = figuresOf(row.key, row.keptAt);
    return { id: row.id, name: row.name, key: row.key, request: JSON.parse(row.request), computedAt, ssn, cells, createdAt: row.createdAt };
  };
  const listSaved = (): SavedCoverage[] => {
    const saved = (everySaved.all() as SavedRow[]).map(savedOf);
    // Only the figures of maps still saved are remembered.
    figures = new Map(saved.map((item) => [item.key, figures.get(item.key)!]));
    return saved;
  };

  app.get(
    "/api/radio/propagation/coverage",
    async (): Promise<CoverageOverview> => ({
      saved: listSaved(),
      limits: { maxCells: COVERAGE_MAX_CELLS, maxWaiting: COVERAGE_MAX_WAITING },
    }),
  );

  app.get<{ Params: { key: string } }>("/api/radio/propagation/coverage/:key", async (request) => {
    const { key } = keyParams.parse(request.params);
    const result = internals.kept<CoverageResult>(key);
    if (!result?.grid) throw notFound("That coverage map (it may have been cleared to make room; work it out again)");
    return { coverage: { ...result, cached: true } };
  });

  app.post("/api/radio/propagation/coverage/saved", async (request) => {
    const body = z
      .object({ name: z.string().trim().min(1, "Give the map a name.").max(120), key: keyParams.shape.key })
      .parse(request.body);
    const result = internals.kept<CoverageResult>(body.key);
    if (!result?.grid) throw notFound("That coverage map (it may have been cleared to make room; work it out again)");
    const existing = ctx.db
      .select()
      .from(propagationSaved)
      .where(and(eq(propagationSaved.kind, "coverage"), eq(propagationSaved.resultKey, body.key)))
      .get();
    const now = Date.now();
    const id = existing?.id ?? newId();
    if (existing) ctx.db.update(propagationSaved).set({ name: body.name, updatedAt: now }).where(eq(propagationSaved.id, id)).run();
    else {
      ctx.db
        .insert(propagationSaved)
        .values({
          id,
          name: body.name,
          kind: "coverage",
          request: result.request as unknown as Record<string, unknown>,
          resultKey: body.key,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    ctx.events.publish({ type: "propagation.changed" });
    return { saved: savedOf(oneSaved.get(id) as SavedRow) };
  });

  app.delete<{ Params: { id: string } }>("/api/radio/propagation/coverage/saved/:id", async (request) => {
    const row = ctx.db
      .select()
      .from(propagationSaved)
      .where(and(eq(propagationSaved.kind, "coverage"), eq(propagationSaved.id, request.params.id)))
      .get();
    if (!row) throw notFound("The saved coverage map");
    ctx.db.delete(propagationSaved).where(eq(propagationSaved.id, row.id)).run();
    ctx.events.publish({ type: "propagation.changed" });
    return { ok: true };
  });

  return {
    find,
    work,
    eraseSaved() {
      const rows = ctx.db.select({ id: propagationSaved.id }).from(propagationSaved).where(eq(propagationSaved.kind, "coverage")).all();
      ctx.db.delete(propagationSaved).where(eq(propagationSaved.kind, "coverage")).run();
      return rows.length;
    },
  };
}
