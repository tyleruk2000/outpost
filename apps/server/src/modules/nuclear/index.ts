/**
 * Nuclear preparedness: the scenarios a person saves in the effects simulator.
 *
 * The effects themselves are worked out in the browser from `@outpost/shared`
 * (`computeEffects`); what is kept here is only what the person typed. The server
 * holds a scenario to the same limits the model does (`effectsProblems`), so a scenario
 * the model cannot answer is refused with the model's reason rather than stored.
 *
 * Later sittings add the data-source adapters, layers and dataset manager described in
 * docs/nuclear-preparedness.md beside this.
 */
import {
  type EffectsInput,
  effectsProblems,
  MAX_SCENARIOS_SHOWN,
  type NuclearScenario,
  type NuclearSet,
  type NuclearSetMember,
  SCENARIO_LETTERS,
  SCENARIO_NAME_MAX,
  SCENARIO_NOTES_MAX,
} from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { nuclearScenarioSets, nuclearScenarios } from "../../db/schema.ts";

export interface NuclearService {
  list(): NuclearScenario[];
  /** Saved scenarios and saved sets of them. */
  count(): number;
  /** Every saved scenario and set; for "erase everything". Returns how many there were. */
  eraseAll(): number;
}

declare module "../../core/context.ts" {
  interface Services {
    nuclear: NuclearService;
  }
}

const blastLevel = z.union([z.literal(20), z.literal(10), z.literal(5), z.literal(2), z.literal(1)]);

const effects = z.object({
  yieldKt: z.number(),
  burst: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("surface") }),
    z.object({ kind: z.literal("height"), metres: z.number() }),
    z.object({ kind: z.literal("optimum"), psi: blastLevel }),
  ]),
  wind: z.object({ fromDegrees: z.number(), kmh: z.number() }).nullable(),
});

const scenario = z.object({
  name: z.string().trim().min(1, "Give the scenario a name.").max(SCENARIO_NAME_MAX),
  notes: z.string().max(SCENARIO_NOTES_MAX).default(""),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  effects,
});

const setSchema = z
  .object({
    name: z.string().trim().min(1, "Give the set a name.").max(SCENARIO_NAME_MAX),
    members: z
      .array(scenario.extend({ letter: z.enum(SCENARIO_LETTERS), hidden: z.boolean().default(false) }))
      .min(1, "A set holds at least one scenario.")
      .max(MAX_SCENARIOS_SHOWN, `A set holds at most ${MAX_SCENARIOS_SHOWN} scenarios, as the map shows.`),
  })
  .strict();

/** The version a change was made from (`NuclearScenarioUpdate`, `NuclearSetUpdate`); the rest of the body is the scenario or set. */
const baseSchema = z.object({ baseUpdatedAt: z.number().optional() }).passthrough();

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function registerNuclear(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;

  const dto = (row: typeof nuclearScenarios.$inferSelect): NuclearScenario => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    lat: row.lat,
    lon: row.lon,
    effects: row.effects as unknown as EffectsInput,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  function checked(body: unknown) {
    const input = scenario.parse(body);
    const problems = effectsProblems(input.effects as EffectsInput);
    if (problems.length > 0) throw badRequest(problems.join(" "), { problems });
    return input;
  }

  function get(id: string): NuclearScenario {
    const row = db.select().from(nuclearScenarios).where(eq(nuclearScenarios.id, id)).get();
    if (!row) throw notFound("That scenario");
    return dto(row);
  }

  const changed = () => ctx.events.publish({ type: "nuclear.changed" });

  const setDto = (row: typeof nuclearScenarioSets.$inferSelect): NuclearSet => ({
    id: row.id,
    name: row.name,
    members: row.members as unknown as NuclearSetMember[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  function checkedSet(body: unknown) {
    const input = setSchema.parse(body);
    const letters = input.members.map((member) => member.letter);
    if (new Set(letters).size !== letters.length) throw badRequest("Each scenario in a set has a letter of its own.");
    for (const member of input.members) {
      const problems = effectsProblems(member.effects as EffectsInput);
      if (problems.length > 0) throw badRequest(`${member.letter}, ${member.name}: ${problems.join(" ")}`, { problems });
    }
    return input;
  }

  function getSet(id: string): NuclearSet {
    const row = db.select().from(nuclearScenarioSets).where(eq(nuclearScenarioSets.id, id)).get();
    if (!row) throw notFound("That set of scenarios");
    return setDto(row);
  }

  const service: NuclearService = {
    list: () => db.select().from(nuclearScenarios).orderBy(desc(nuclearScenarios.updatedAt)).all().map(dto),
    count: () =>
      (
        ctx.sqlite.prepare("SELECT (SELECT count(*) FROM nuclear_scenarios) + (SELECT count(*) FROM nuclear_scenario_sets) AS n").get() as {
          n: number;
        }
      ).n,
    eraseAll() {
      const had = service.count();
      db.delete(nuclearScenarios).run();
      db.delete(nuclearScenarioSets).run();
      changed();
      return had;
    },
  };
  ctx.services.nuclear = service;

  app.get("/api/nuclear/scenarios", async () => ({ scenarios: service.list() }));

  app.get("/api/nuclear/scenarios/:id", async (request) => get(idParams.parse(request.params).id));

  app.post("/api/nuclear/scenarios", async (request, reply) => {
    const input = checked(request.body);
    const now = Date.now();
    const id = newId();
    db.insert(nuclearScenarios)
      .values({ id, ...input, effects: input.effects as unknown as Record<string, unknown>, createdAt: now, updatedAt: now })
      .run();
    changed();
    reply.code(201);
    return get(id);
  });

  app.patch("/api/nuclear/scenarios/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const current = get(id);
    const { baseUpdatedAt, ...body } = baseSchema.parse(request.body);
    const input = checked(body);
    if (baseUpdatedAt !== undefined && current.updatedAt > baseUpdatedAt) {
      throw conflict(
        "This scenario was changed somewhere else after you opened it, in another tab or on another device. Your changes were not saved over it; reload to see the newer version.",
        { current: { updatedAt: current.updatedAt, name: current.name } },
      );
    }
    db.update(nuclearScenarios)
      // Always later than the version it replaces, so a base taken from it is never mistaken for it.
      .set({
        ...input,
        effects: input.effects as unknown as Record<string, unknown>,
        updatedAt: Math.max(Date.now(), current.updatedAt + 1),
      })
      .where(eq(nuclearScenarios.id, id))
      .run();
    changed();
    return get(id);
  });

  app.delete("/api/nuclear/scenarios/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    get(id);
    db.delete(nuclearScenarios).where(eq(nuclearScenarios.id, id)).run();
    changed();
    reply.code(204);
  });

  // Sets: scenarios kept together as they were on the map. Only their members are kept; nothing is added up across them.
  app.get("/api/nuclear/sets", async () => ({
    sets: db.select().from(nuclearScenarioSets).orderBy(desc(nuclearScenarioSets.updatedAt)).all().map(setDto),
  }));

  app.get("/api/nuclear/sets/:id", async (request) => getSet(idParams.parse(request.params).id));

  app.post("/api/nuclear/sets", async (request, reply) => {
    const input = checkedSet(request.body);
    const now = Date.now();
    const id = newId();
    db.insert(nuclearScenarioSets)
      .values({ id, name: input.name, members: input.members as unknown as Array<Record<string, unknown>>, createdAt: now, updatedAt: now })
      .run();
    changed();
    reply.code(201);
    return getSet(id);
  });

  app.patch("/api/nuclear/sets/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const current = getSet(id);
    const { baseUpdatedAt, ...body } = baseSchema.parse(request.body);
    const input = checkedSet(body);
    if (baseUpdatedAt !== undefined && current.updatedAt > baseUpdatedAt) {
      throw conflict(
        "This set was changed somewhere else after you opened it, in another tab or on another device. Your changes were not saved over it; reload to see the newer version.",
        { current: { updatedAt: current.updatedAt, name: current.name } },
      );
    }
    db.update(nuclearScenarioSets)
      .set({
        name: input.name,
        members: input.members as unknown as Array<Record<string, unknown>>,
        updatedAt: Math.max(Date.now(), current.updatedAt + 1),
      })
      .where(eq(nuclearScenarioSets.id, id))
      .run();
    changed();
    return getSet(id);
  });

  app.delete("/api/nuclear/sets/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    getSet(id);
    db.delete(nuclearScenarioSets).where(eq(nuclearScenarioSets.id, id)).run();
    changed();
    reply.code(204);
  });
}
