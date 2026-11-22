/**
 * Communication plans: the plans a person keeps, and the matrix worked out for one.
 *
 * A plan is the person's own data (stations, hours, bands, notes, links). Its matrix is
 * an answer like any other: for every pair of stations the engine is asked for the day
 * each way, on every band of the plan, and what it returns is kept under a key made
 * from the question. Which band is recommended is decided by the rule in
 * `@outpost/shared` (`planRecommendation`) from those figures, wherever they are shown.
 */
import {
  type CommunicationPlan,
  HF_BANDS,
  noiseSetting,
  PLAN_MAX_STATIONS,
  PLAN_MIN_STATIONS,
  type PlanDirection,
  type PlanInput,
  type PlanLink,
  type PlanLinked,
  type PlanPair,
  type PlanResult,
  type PlanStation,
} from "@outpost/shared";
import { desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { communicationPlans, documents, notes } from "../../db/schema.ts";
import { planFileBody, readPlanFile } from "../export-all/plan-file.ts";
import type { CircuitResult } from "./engine.ts";
import { EngineRefused } from "./host.ts";
import { engineProblem, fix, modeLine, type PropagationService, wireRunsMark } from "./service.ts";
import { antenna, checkedMode, date, modes, noise, power } from "./shapes.ts";

const station = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Give every station a name.").max(60),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  powerWatts: power,
  antenna,
  antennaName: z.string().max(80).default(""),
  noise,
});

const hour = z.number().int().min(1).max(24);
const changeBase = z.object({ baseUpdatedAt: z.number().int().nonnegative().optional() });
const bandIds = HF_BANDS.map((band) => band.id) as [string, ...string[]];

const plan = z
  .object({
    name: z.string().trim().min(1, "Give the plan a name.").max(120),
    notes: z.string().max(8000).default(""),
    stations: z.array(station).max(PLAN_MAX_STATIONS, `A plan may have at most ${PLAN_MAX_STATIONS} stations.`),
    date,
    fromUtc: hour,
    toUtc: hour,
    bands: z.array(z.enum(bandIds)).min(1, "Choose at least one band.").max(bandIds.length),
    mode: modes,
    requiredSnrDb: z.number().min(-60).max(99).nullable().default(null),
    referenceBandwidthHz: z.number().min(1).max(100_000).nullable().default(null),
    solar: z.discriminatedUnion("source", [
      z.object({ source: z.literal("table") }),
      z.object({ source: z.literal("manual"), ssn: z.number().min(0).max(300) }),
    ]),
    links: z
      .array(z.object({ kind: z.enum(["note", "document"]), id: z.string().min(1).max(64) }))
      .max(40)
      .default([]),
  })
  .superRefine((value, issue) => {
    const ids = new Set(value.stations.map((item) => item.id));
    if (ids.size !== value.stations.length)
      issue.addIssue({ code: "custom", message: "Two stations have the same id.", path: ["stations"] });
  });

const LIMITS = [
  "Every figure is the engine's monthly median for that path: what a month like this one usually does, not what the ionosphere is doing on the day.",
  "Reliability is the share of days on which the signal-to-noise ratio is predicted to reach what the mode needs. A contact also depends on interference, the operators and the equipment.",
  "An antenna with no bearing is turned towards each other station in turn. A fixed wire cannot face them all; give the antenna a bearing in its profile to plan for it as it hangs.",
  "One frequency near the middle stands for each band.",
  "Nothing here says which frequencies you may transmit on. That is set by each operator's licence; the band sheets in the library give the limits.",
];

export interface PlansService {
  list(): CommunicationPlan[];
  get(id: string): CommunicationPlan;
  create(input: unknown): CommunicationPlan;
  update(id: string, input: unknown): CommunicationPlan;
  remove(id: string): void;
  matrix(id: string, signal?: AbortSignal): Promise<PlanResult>;
  kept(id: string): PlanResult | undefined;
  count(): number;
  eraseAll(): number;
}

export function registerPlans(app: FastifyInstance, ctx: AppContext, service: PropagationService): PlansService {
  const { db } = ctx;
  const { internals } = service;

  function linkedOf(links: PlanLink[]): PlanLinked[] {
    const ids = (kind: PlanLink["kind"]) => links.filter((link) => link.kind === kind).map((link) => link.id);
    const titles = new Map<string, string>();
    const noteIds = ids("note");
    if (noteIds.length > 0) {
      for (const row of db
        .select({ id: notes.id, title: notes.title, trashedAt: notes.trashedAt })
        .from(notes)
        .where(inArray(notes.id, noteIds))
        .all())
        if (row.trashedAt === null) titles.set(`note:${row.id}`, row.title || "Untitled");
    }
    const documentIds = ids("document");
    if (documentIds.length > 0) {
      for (const row of db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(inArray(documents.id, documentIds))
        .all())
        titles.set(`document:${row.id}`, row.title);
    }
    return links.map((link) => ({ ...link, title: titles.get(`${link.kind}:${link.id}`) ?? null }));
  }

  const dto = (row: typeof communicationPlans.$inferSelect): CommunicationPlan => {
    const links = row.links as unknown as PlanLink[];
    return {
      id: row.id,
      name: row.name,
      notes: row.notes,
      stations: row.stations as unknown as PlanStation[],
      date: row.date,
      fromUtc: row.fromUtc,
      toUtc: row.toUtc,
      bands: row.bands,
      mode: row.mode as PlanInput["mode"],
      requiredSnrDb: row.requiredSnrDb,
      referenceBandwidthHz: row.referenceBandwidthHz,
      solar: row.solar as unknown as PlanInput["solar"],
      links,
      linked: linkedOf(links),
      // Asked without reading the matrix: a list of plans is not a use of any of them.
      workedOut: row.resultKey !== null && internals.has(row.resultKey),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };

  const rowOf = (id: string) => {
    const row = db.select().from(communicationPlans).where(eq(communicationPlans.id, id)).get();
    if (!row) throw notFound("The communication plan");
    return row;
  };

  function checked(body: unknown): PlanInput {
    const input = plan.parse(body) as PlanInput;
    checkedMode({
      mode: input.mode,
      requiredSnrDb: input.requiredSnrDb ?? undefined,
      referenceBandwidthHz: input.referenceBandwidthHz ?? undefined,
    });
    return {
      ...input,
      // As the engine reads them, so that what is kept is what is asked.
      stations: input.stations.map((item) => ({
        ...item,
        lat: fix(item.lat, 2),
        lon: fix(item.lon, 2),
        powerWatts: fix(item.powerWatts, 1),
      })),
      // In the order the bands are always listed in.
      bands: HF_BANDS.filter((band) => input.bands.includes(band.id)).map((band) => band.id),
    };
  }

  const values = (input: PlanInput) => ({
    name: input.name,
    notes: input.notes,
    stations: input.stations as unknown as Array<Record<string, unknown>>,
    date: input.date,
    fromUtc: input.fromUtc,
    toUtc: input.toUtc,
    bands: input.bands,
    mode: input.mode,
    requiredSnrDb: input.requiredSnrDb,
    referenceBandwidthHz: input.referenceBandwidthHz,
    solar: input.solar as unknown as Record<string, unknown>,
    links: input.links as unknown as Array<Record<string, unknown>>,
  });

  /** Everything the matrix depends on. The name, the notes, the links and the window are not in it. */
  async function keyed(row: typeof communicationPlans.$inferSelect) {
    const current = dto(row);
    const mode = modeLine(current.mode, current.requiredSnrDb ?? undefined, current.referenceBandwidthHz ?? undefined);
    const { basis, tableSha, description, datasets } = await internals.basis(current.date, current.solar);
    const key = internals.keyOf("plan", {
      stations: current.stations.map(({ id, lat, lon, powerWatts, antenna: spec, noise: where }) => ({
        id,
        lat,
        lon,
        powerWatts,
        spec,
        where,
      })),
      month: current.date.slice(0, 7),
      bands: current.bands,
      required: mode.requiredSnrDbHz,
      ssn: basis.ssn,
      tableSha,
      engine: description.sha256,
      datasets,
      ...wireRunsMark(
        current.stations.map((station) => station.antenna),
        HF_BANDS.filter((band) => current.bands.includes(band.id)).map((band) => band.mhz),
      ),
    });
    return { current, mode, basis, tableSha, description, datasets, key };
  }

  async function matrix(id: string, signal?: AbortSignal): Promise<PlanResult> {
    const row = rowOf(id);
    if ((row.stations as unknown[]).length < PLAN_MIN_STATIONS)
      throw badRequest("A plan needs at least two stations before there is a pair to work out.", { reason: "too-few-stations" });
    try {
      const { current, mode, basis, tableSha, description, datasets, key } = await keyed(row);
      const pin = () => {
        if (row.resultKey !== key) db.update(communicationPlans).set({ resultKey: key }).where(eq(communicationPlans.id, id)).run();
      };
      const found = internals.kept<PlanResult>(key);
      if (found) {
        pin();
        return { ...found, planId: id, basis, cached: true };
      }
      const started = Date.now();
      const bands = HF_BANDS.filter((band) => current.bands.includes(band.id));
      const frequenciesMhz = bands.map((band) => band.mhz);
      const run = (from: PlanStation, to: PlanStation) =>
        internals.host.circuit(
          {
            tx: { name: from.name, lat: from.lat, lon: from.lon },
            rx: { name: to.name, lat: to.lat, lon: to.lon },
            year: Number(current.date.slice(0, 4)),
            month: Number(current.date.slice(5, 7)),
            ssn: basis.ssn,
            powerWatts: from.powerWatts,
            frequenciesMhz,
            // A mode with no figure is run at a requirement every signal meets, and its reliability is thrown away.
            requiredSnrDbHz: mode.requiredSnrDbHz ?? 0,
            noiseDbwAt3Mhz: noiseSetting(to.noise).dbwAt3Mhz,
            txAntenna: from.antenna,
            rxAntenna: to.antenna,
          },
          signal,
        );
      const direction = (circuit: CircuitResult, band: number): PlanDirection => {
        const cells = circuit.hours.map((item) => item.cells[band]!);
        return {
          reliability: cells.map((cell) => (mode.requiredSnrDbHz === null || cell.path === null ? null : cell.reliability)),
          snrDbHz: cells.map((cell) => (cell.path === null ? null : cell.snrDbHz)),
        };
      };
      const pairs: PlanPair[] = [];
      for (let first = 0; first < current.stations.length; first++) {
        for (let second = first + 1; second < current.stations.length; second++) {
          const [a, b] = [current.stations[first]!, current.stations[second]!];
          const blank = { a: a.id, b: b.id, distanceKm: 0, bearingDeg: 0, backBearingDeg: 0, bands: [] };
          if (a.lat === b.lat && a.lon === b.lon) {
            pairs.push({ ...blank, problem: `${a.name} and ${b.name} are in the same place, and a path needs two different places.` });
            continue;
          }
          try {
            const forward = await run(a, b);
            const back = await run(b, a);
            pairs.push({
              a: a.id,
              b: b.id,
              distanceKm: forward.distanceKm,
              bearingDeg: forward.bearingDeg,
              backBearingDeg: forward.backBearingDeg,
              bands: bands.map((band, index) => ({
                bandId: band.id,
                mhz: band.mhz,
                forward: direction(forward, index),
                back: direction(back, index),
                // Either way round, an antenna of the pair is a level wire longer than a half-wave here.
                ...(forward.hours[0]?.cells[index]?.approximate || back.hours[0]?.cells[index]?.approximate
                  ? { approximate: true as const }
                  : {}),
              })),
              problem: null,
            });
          } catch (error) {
            if (!(error instanceof EngineRefused)) throw error;
            pairs.push({ ...blank, problem: `The engine could not work this pair out: ${error.message}` });
          }
        }
      }
      const result: PlanResult = {
        key,
        planId: id,
        computedAt: Date.now(),
        cached: false,
        tookMs: Date.now() - started,
        engine: description,
        datasets: [...datasets, ...(tableSha ? [{ id: "solar-cycle", version: `${basis.tableDate} ${tableSha.slice(0, 12)}` }] : [])],
        basis,
        mode,
        pairs,
        limits: LIMITS,
      };
      // The plan is pinned to the answer first, so that keeping it cannot trim it away.
      pin();
      internals.keep(key, "plan", description, { planId: id }, result);
      return result;
    } catch (error) {
      engineProblem(error);
    }
  }

  const plans: PlansService = {
    list: () => db.select().from(communicationPlans).orderBy(desc(communicationPlans.updatedAt)).all().map(dto),
    get: (id) => dto(rowOf(id)),
    create(body) {
      const input = checked(body);
      const now = Date.now();
      const id = newId();
      db.insert(communicationPlans)
        .values({ id, ...values(input), createdAt: now, updatedAt: now })
        .run();
      ctx.events.publish({ type: "propagation.changed" });
      return dto(rowOf(id));
    },
    update(id, body) {
      const before = dto(rowOf(id));
      // Sent by the screen: the plan's updatedAt as it was read. A plan saved somewhere else since is not overwritten.
      const { baseUpdatedAt } = changeBase.parse(body);
      if (baseUpdatedAt !== undefined && baseUpdatedAt !== before.updatedAt) {
        throw conflict("This plan was changed somewhere else after you opened it. Nothing was saved.", {
          reason: "changed-elsewhere",
          plan: before,
        });
      }
      const input = checked(body);
      // A change to the name, the notes, the links or the window leaves the matrix as it
      // was; a change to anything the engine is asked about means it must be worked out again.
      const asked = (value: PlanInput) =>
        JSON.stringify([
          value.stations,
          value.date.slice(0, 7),
          value.bands,
          value.mode,
          value.requiredSnrDb,
          value.referenceBandwidthHz,
          value.solar,
        ]);
      db.update(communicationPlans)
        .set({
          ...values(input),
          ...(asked(before) === asked(input) ? {} : { resultKey: null }),
          // Always later than the time the change was made from, so that two saves in one millisecond are told apart.
          updatedAt: Math.max(Date.now(), before.updatedAt + 1),
        })
        .where(eq(communicationPlans.id, id))
        .run();
      ctx.events.publish({ type: "propagation.changed" });
      return dto(rowOf(id));
    },
    remove(id) {
      rowOf(id);
      db.delete(communicationPlans).where(eq(communicationPlans.id, id)).run();
      ctx.events.publish({ type: "propagation.changed" });
    },
    matrix,
    kept(id) {
      const row = rowOf(id);
      const result = row.resultKey ? internals.kept<PlanResult>(row.resultKey) : undefined;
      return result ? { ...result, planId: id, cached: true } : undefined;
    },
    count: () => db.select({ id: communicationPlans.id }).from(communicationPlans).all().length,
    eraseAll() {
      const count = plans.count();
      db.delete(communicationPlans).run();
      return count;
    },
  };

  type IdParams = { Params: { id: string } };
  app.get("/api/radio/communication-plans", async () => ({ plans: plans.list() }));
  app.post("/api/radio/communication-plans", async (request) => ({ plan: plans.create(request.body) }));
  /**
   * A plan file from "Take everything out" (or a bare plan), added as a new plan. Links to
   * pages and documents this Outpost does not have are left off.
   */
  app.post("/api/radio/communication-plans/import", async (request) => {
    const { text } = planFileBody.parse(request.body);
    const read = readPlanFile("radio", text);
    if (!read || typeof read !== "object" || Array.isArray(read)) throw badRequest("That file does not hold a communication plan.");
    const {
      id: _id,
      createdAt: _created,
      updatedAt: _updated,
      linked: _linked,
      workedOut: _worked,
      ...body
    } = read as Record<string, unknown>;
    const links = Array.isArray(body.links) ? (body.links as unknown[]) : [];
    const known = linkedOf(
      links.filter(
        (link): link is PlanLink =>
          !!link &&
          typeof link === "object" &&
          ((link as PlanLink).kind === "note" || (link as PlanLink).kind === "document") &&
          typeof (link as PlanLink).id === "string",
      ),
    ).filter((link) => link.title !== null);
    return { plan: plans.create({ ...body, links: known.map(({ kind, id }) => ({ kind, id })) }) };
  });
  app.get<IdParams>("/api/radio/communication-plans/:id", async (request) => ({ plan: plans.get(request.params.id) }));
  app.patch<IdParams>("/api/radio/communication-plans/:id", async (request) => ({ plan: plans.update(request.params.id, request.body) }));
  app.delete<IdParams>("/api/radio/communication-plans/:id", async (request) => {
    plans.remove(request.params.id);
    return { ok: true };
  });
  /** Works the matrix out, or finds it already worked out. At most 56 runs of the engine, so it is answered directly. */
  app.post<IdParams>("/api/radio/communication-plans/:id/matrix", async (request) => ({ matrix: await plans.matrix(request.params.id) }));
  /** The matrix as it was last worked out for the plan as it stands; 404 when the plan has changed since or was never worked out. */
  app.get<IdParams>("/api/radio/communication-plans/:id/matrix", async (request) => {
    const result = plans.kept(request.params.id);
    if (!result) throw notFound("A matrix for this plan as it stands (work it out)");
    return { matrix: result };
  });

  return plans;
}
