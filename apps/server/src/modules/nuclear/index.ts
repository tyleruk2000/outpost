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
import { type EffectsInput, effectsProblems, type NuclearScenario, SCENARIO_NAME_MAX, SCENARIO_NOTES_MAX } from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { nuclearScenarios } from "../../db/schema.ts";

export interface NuclearService {
  list(): NuclearScenario[];
  count(): number;
  /** Every saved scenario; for "erase everything". Returns how many there were. */
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

  const service: NuclearService = {
    list: () => db.select().from(nuclearScenarios).orderBy(desc(nuclearScenarios.updatedAt)).all().map(dto),
    count: () => (ctx.sqlite.prepare("SELECT count(*) AS n FROM nuclear_scenarios").get() as { n: number }).n,
    eraseAll() {
      const had = service.count();
      db.delete(nuclearScenarios).run();
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
    get(id);
    const input = checked(request.body);
    db.update(nuclearScenarios)
      .set({ ...input, effects: input.effects as unknown as Record<string, unknown>, updatedAt: Date.now() })
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
}
