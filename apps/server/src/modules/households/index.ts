/**
 * Households and people (Prepare → Households): several households, each with its own
 * people, home and things, one of them current for the whole Outpost. Per-household
 * modules read `ctx.services.households` (docs/development/households.md).
 */
import {
  AGE_BAND_IDS,
  HERE_SOURCES,
  HOUSEHOLD_KIND_IDS,
  HOUSEHOLD_LIMITS,
  type HouseholdPositionsResponse,
  type HouseholdResponse,
  type HouseholdsResponse,
  type PeopleResponse,
  type PersonResponse,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createHouseholdsService, type HouseholdsService } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    households: HouseholdsService;
  }
}

const idParams = z.object({ id: z.string().min(1).max(64) });
const placeId = z.string().min(1).max(64).nullable();
const name = z.string().trim().min(1, "Give the household a name.").max(HOUSEHOLD_LIMITS.name);
const confirmQuery = z.object({ confirm: z.enum(["true", "false"]).optional() });

const createSchema = z
  .object({
    name,
    kind: z.enum(HOUSEHOLD_KIND_IDS).optional(),
    homePlaceId: placeId.optional(),
    basePlaceId: placeId.optional(),
    copyPeopleFrom: z.string().min(1).max(64).nullable().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: name.optional(),
    kind: z.enum(HOUSEHOLD_KIND_IDS).optional(),
    homePlaceId: placeId.optional(),
    basePlaceId: placeId.optional(),
    countryOverride: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "Give the country as its two-letter code, such as GB.")
      .transform((code) => code.toUpperCase())
      .nullable()
      .optional(),
  })
  .strict();

const peopleSchema = z.object({ personIds: z.array(z.string().min(1).max(64)).max(HOUSEHOLD_LIMITS.peoplePerHousehold) }).strict();
const currentSchema = z.object({ id: z.string().min(1).max(64) }).strict();
const hereSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    name: z.string().trim().max(HOUSEHOLD_LIMITS.hereName).nullable().optional(),
    source: z.enum(HERE_SOURCES),
  })
  .strict();

const optionalAmount = (max: number) => z.number().finite().min(0).max(max).nullable();
const personSchema = z
  .object({
    kind: z.enum(["person", "pet"]),
    name: z.string().max(80).default(""),
    band: z.enum(AGE_BAND_IDS).nullable().default(null),
    sex: z.enum(["male", "female", "unstated"]).nullable().default(null),
    kcalPerDay: optionalAmount(10_000).default(null),
    drinkingLitres: optionalAmount(50).default(null),
    allUsesLitres: optionalAmount(200).default(null),
    note: z.string().max(400).default(""),
  })
  .strict();
const needsSomething = <T extends { kind: string; band: unknown; kcalPerDay: unknown }>(person: T) =>
  person.kind === "pet" || person.band !== null || person.kcalPerDay !== null;
const needsMessage = { message: "Give each person an age, or the energy they need a day." };
const personCreateSchema = personSchema
  .extend({ householdIds: z.array(z.string().min(1).max(64)).max(HOUSEHOLD_LIMITS.households).optional() })
  .refine(needsSomething, needsMessage);
const personUpdateSchema = personSchema.refine(needsSomething, needsMessage);

export async function registerHouseholds(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createHouseholdsService(ctx);
  ctx.services.households = service;

  const listed = (): HouseholdsResponse => ({ households: service.list(), currentId: service.currentId() });

  app.get("/api/households", async (): Promise<HouseholdsResponse> => listed());
  app.post(
    "/api/households",
    async (request): Promise<HouseholdResponse> => ({ household: service.create(createSchema.parse(request.body)) }),
  );
  // Registered before "/:id" so that "current" is never taken for an id.
  app.put("/api/households/current", async (request): Promise<HouseholdsResponse> => {
    service.setCurrent(currentSchema.parse(request.body).id);
    return listed();
  });
  app.get(
    "/api/households/:id",
    async (request): Promise<HouseholdResponse> => ({ household: service.get(idParams.parse(request.params).id) }),
  );
  app.put(
    "/api/households/:id",
    async (request): Promise<HouseholdResponse> => ({
      household: service.update(idParams.parse(request.params).id, updateSchema.parse(request.body)),
    }),
  );
  app.delete("/api/households/:id", async (request) => {
    service.remove(idParams.parse(request.params).id, { confirm: confirmQuery.parse(request.query).confirm === "true" });
    return listed();
  });
  app.put(
    "/api/households/:id/people",
    async (request): Promise<HouseholdResponse> => ({
      household: service.setPeople(idParams.parse(request.params).id, peopleSchema.parse(request.body).personIds),
    }),
  );
  app.put(
    "/api/households/:id/here",
    async (request): Promise<HouseholdResponse> => ({
      household: service.setHere(idParams.parse(request.params).id, hereSchema.parse(request.body)),
    }),
  );
  app.get(
    "/api/households/:id/positions",
    async (request): Promise<HouseholdPositionsResponse> => ({ positions: service.positions(idParams.parse(request.params).id) }),
  );

  app.get("/api/people", async (): Promise<PeopleResponse> => ({ people: service.people.list() }));
  app.post(
    "/api/people",
    async (request): Promise<PersonResponse> => ({ person: service.people.create(personCreateSchema.parse(request.body)) }),
  );
  app.get(
    "/api/people/:id",
    async (request): Promise<PersonResponse> => ({ person: service.people.get(idParams.parse(request.params).id) }),
  );
  app.put(
    "/api/people/:id",
    async (request): Promise<PersonResponse> => ({
      person: service.people.update(idParams.parse(request.params).id, personUpdateSchema.parse(request.body)),
    }),
  );
  app.delete("/api/people/:id", async (request) => {
    service.people.remove(idParams.parse(request.params).id, { confirm: confirmQuery.parse(request.query).confirm === "true" });
    return { ok: true };
  });
}
