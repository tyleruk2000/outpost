/**
 * Emergency plans, under Preparedness: a household's own plan for a power cut, a flood,
 * a storm or anything else, with its steps, people, places, supplies and links.
 *
 * The server keeps plans and answers each one with what its links point at now
 * (`resolved`): a linked contact's name and numbers, a saved place's position, the
 * titles of linked notes and documents. A contact or place deleted since is answered as
 * null and kept in the plan, so that the screen can say it is missing instead of
 * dropping it. Nothing is copied from Contacts or the map into the plan except the name
 * a linked thing had, which names it if it goes.
 *
 * A plan in use (`use`: when it was started, when each step was ticked) is changed by
 * routes of its own, so that ticking a step on one phone never undoes an edit made on
 * another, nor the other way round.
 *
 * Other modules use `ctx.services.emergencyPlans` (the nuclear workspace, later); see
 * docs/emergency-plans.md. A plan is a person's own data: counted and erased with the
 * rest by modules/manage, counted in the database's figures, and in every backup.
 */
import {
  type EmergencyPlan,
  type EmergencyPlanInput,
  type EmergencyPlanResponse,
  type EmergencyPlanSummary,
  emergencyNumberFor,
  PLAN_KIND_IDS,
  PLAN_LIMITS,
  type PlanBody,
  type PlanHousehold,
  type PlanResolved,
  type PlanTickMerge,
  type PlanTickMergeResponse,
  type PlanUse,
  SUPPLY_CATEGORY_IDS,
} from "@outpost/shared";
import { asc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { communicationPlans, documents, emergencyPlans, markers, notes, nuclearScenarios, powerPlans } from "../../db/schema.ts";
import { indexPlans } from "./search.ts";

export interface EmergencyPlansService {
  /** The current household's plans. A plan of another household is still answered by `get`, by its id. */
  list(): EmergencyPlanSummary[];
  get(id: string): EmergencyPlanResponse;
  create(input: EmergencyPlanInput): EmergencyPlanResponse;
  /** Replaces the plan. Throws 409 `conflict` when `baseUpdatedAt` is older than the stored plan. */
  update(id: string, input: EmergencyPlanInput, baseUpdatedAt?: number): EmergencyPlanResponse;
  copy(id: string): EmergencyPlanResponse;
  remove(id: string): void;
  /** Marks a step done now, or not done. Starts the plan if it was not started. */
  tick(id: string, stepId: string, done: boolean): EmergencyPlanResponse;
  start(id: string): EmergencyPlanResponse;
  /** Ticks made on a phone out of reach, by the rule set out at `PlanTickMerge`. */
  mergeTicks(id: string, merge: PlanTickMerge, now?: number): PlanTickMergeResponse;
  /** Clears the ticks and the start, for next time. */
  reset(id: string): EmergencyPlanResponse;
  reviewed(id: string): EmergencyPlanResponse;
  opened(id: string): EmergencyPlanResponse;
  /** The person's own: counted for "what is stored", and erased with everything else. */
  kept: { count(): number; eraseAll(): number };
}

declare module "../../core/context.ts" {
  interface Services {
    emergencyPlans: EmergencyPlansService;
  }
}

const L = PLAN_LIMITS;
const itemId = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max).default("");
const origin = z.string().max(120).nullable().default(null);

const bodySchema = z
  .object({
    steps: z
      .array(
        z.object({
          id: itemId,
          phase: z.enum(["before", "during", "after"]),
          text: z.string().trim().min(1, "A step needs some words.").max(L.text),
          origin,
        }),
      )
      .max(L.steps)
      .default([]),
    people: z
      .array(
        z.object({
          id: itemId,
          name: z.string().max(L.short),
          remember: text(L.text),
          medical: text(L.text),
          contactId: z.string().max(64).nullable().default(null),
        }),
      )
      .max(L.people)
      .default([]),
    contacts: z
      .array(
        z.object({
          id: itemId,
          contactId: z.string().max(64).nullable().default(null),
          name: z.string().max(L.short),
          phone: text(L.short),
          note: text(L.text),
          outOfArea: z.boolean().default(false),
        }),
      )
      .max(L.contacts)
      .default([]),
    places: z
      .array(
        z.object({
          id: itemId,
          role: z.enum(["near", "away", "other"]),
          markerId: z.string().max(64).nullable().default(null),
          name: z.string().max(L.short),
          note: text(L.text),
        }),
      )
      .max(L.places)
      .default([]),
    comms: z
      .object({
        text: text(L.text * 4),
        commPlanId: z.string().max(64).nullable().default(null),
        frequency: text(L.short),
        schedule: text(L.short),
      })
      .default({ text: "", commPlanId: null, frequency: "", schedule: "" }),
    days: z.number().int().min(1, "Plan for at least one day.").max(3650).nullable().default(null),
    supplies: z
      .array(
        z.object({
          id: itemId,
          name: z.string().trim().min(1, "Say what the supply is.").max(L.short),
          quantity: z.number().finite().min(0).max(L.quantity).nullable().default(null),
          unit: text(40),
          perPerson: z.boolean().default(false),
          perDay: z.boolean().default(false),
          category: z.enum(SUPPLY_CATEGORY_IDS).nullable().default(null),
          origin,
        }),
      )
      .max(L.supplies)
      .default([]),
    powerPlanId: z.string().max(64).nullable().default(null),
    where: z
      .array(z.object({ id: itemId, what: z.string().max(L.short), where: text(L.text), origin }))
      .max(L.where)
      .default([]),
    notes: text(L.notes),
    links: z
      .array(z.object({ kind: z.enum(["note", "document", "place", "scenario"]), id: z.string().min(1).max(64) }))
      .max(L.links)
      .default([]),
  })
  .strict();

/** The version a change was made from (`EmergencyPlanUpdate`); the rest of the body is the plan. */
const baseSchema = z.object({ baseUpdatedAt: z.number().optional() }).passthrough();

const planSchema = z
  .object({
    name: z.string().trim().min(1, "Give the plan a name.").max(L.name),
    kind: z.enum(PLAN_KIND_IDS),
    kindText: text(L.kindText),
    templateId: z.string().max(64).nullable().default(null),
    emergencyNumber: z
      .string()
      .trim()
      .max(20)
      // Empty where it is not known: the plan asks for the household's own, never a guess.
      // Left out: Home's country's number on a new plan (`numberHere`), the plan's own on a change.
      .optional(),
    reviewEveryDays: z.number().int().min(7, "Ask for a review no more often than once a week.").max(3650).nullable().default(180),
    body: bodySchema,
  })
  .strict()
  .superRefine((plan, check) => {
    // Ids within a list identify a step for its tick: two the same would tick together.
    const lists: Array<[string, Array<{ id: string }>]> = [
      ["steps", plan.body.steps],
      ["people", plan.body.people],
      ["contacts", plan.body.contacts],
      ["places", plan.body.places],
      ["supplies", plan.body.supplies],
      ["where", plan.body.where],
    ];
    for (const [name, list] of lists) {
      if (new Set(list.map((item) => item.id)).size !== list.length)
        check.addIssue({ code: "custom", message: `Two entries in the plan's ${name} have the same id.`, path: ["body", name] });
    }
  });

type Row = typeof emergencyPlans.$inferSelect;
const idParams = z.object({ id: z.string().min(1).max(64) });

export async function registerEmergencyPlans(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, sqlite } = ctx;
  const changed = (id?: string) => ctx.events.publish({ type: "emergency-plans.changed", id });

  const toPlan = (row: Row): EmergencyPlan => ({
    id: row.id,
    name: row.name,
    kind: row.kind as EmergencyPlan["kind"],
    kindText: row.kindText,
    templateId: row.templateId,
    emergencyNumber: row.emergencyNumber,
    reviewEveryDays: row.reviewEveryDays,
    body: row.body as unknown as PlanBody,
    use: row.use as unknown as PlanUse,
    reviewedAt: row.reviewedAt,
    openedAt: row.openedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const rowOf = (id: string): Row => {
    const row = db.select().from(emergencyPlans).where(eq(emergencyPlans.id, id)).get();
    if (!row) throw notFound("The emergency plan");
    return row;
  };

  const existing = (table: string, ids: string[], extra = ""): Set<string> => {
    if (ids.length === 0) return new Set();
    const rows = sqlite.prepare(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})${extra}`).all(...ids) as Array<{
      id: string;
    }>;
    return new Set(rows.map((row) => row.id));
  };

  const contactIdsOf = (body: PlanBody) => [
    ...new Set([...body.contacts, ...body.people].map((item) => item.contactId).filter((id): id is string => !!id)),
  ];
  const markerIdsOf = (body: PlanBody) => [
    ...new Set([
      ...body.places.map((place) => place.markerId).filter((id): id is string => !!id),
      ...body.links.filter((link) => link.kind === "place").map((link) => link.id),
    ]),
  ];

  function resolve(body: PlanBody): PlanResolved {
    const contacts: PlanResolved["contacts"] = {};
    for (const id of contactIdsOf(body)) {
      try {
        const contact = ctx.services.contacts.get(id);
        contacts[id] = { displayName: contact.displayName, phones: contact.phones, callsign: contact.callsign };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "not_found") throw error;
        contacts[id] = null;
      }
    }
    const places: PlanResolved["places"] = {};
    const markerIds = markerIdsOf(body);
    for (const id of markerIds) places[id] = null;
    if (markerIds.length > 0) {
      for (const row of db
        .select({ id: markers.id, name: markers.name, lat: markers.lat, lon: markers.lon })
        .from(markers)
        .where(inArray(markers.id, markerIds))
        .all())
        places[row.id] = { name: row.name, lat: row.lat, lon: row.lon };
    }
    const one = (table: typeof communicationPlans | typeof powerPlans, id: string | null) => {
      if (!id) return undefined;
      const row = db.select({ id: table.id, name: table.name }).from(table).where(eq(table.id, id)).get();
      return row ?? null;
    };
    const titles = new Map<string, string>();
    const noteIds = body.links.filter((link) => link.kind === "note").map((link) => link.id);
    if (noteIds.length > 0)
      for (const row of db
        .select({ id: notes.id, title: notes.title, trashedAt: notes.trashedAt })
        .from(notes)
        .where(inArray(notes.id, noteIds))
        .all())
        if (row.trashedAt === null) titles.set(`note:${row.id}`, row.title || "Untitled");
    const documentIds = body.links.filter((link) => link.kind === "document").map((link) => link.id);
    if (documentIds.length > 0)
      for (const row of db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(inArray(documents.id, documentIds))
        .all())
        titles.set(`document:${row.id}`, row.title);
    const scenarioIds = body.links.filter((link) => link.kind === "scenario").map((link) => link.id);
    if (scenarioIds.length > 0)
      for (const row of db
        .select({ id: nuclearScenarios.id, name: nuclearScenarios.name })
        .from(nuclearScenarios)
        .where(inArray(nuclearScenarios.id, scenarioIds))
        .all())
        titles.set(`scenario:${row.id}`, row.name);
    const links = body.links.map((link) => {
      if (link.kind === "place") {
        const place = places[link.id];
        return place ? { ...link, title: place.name, lat: place.lat, lon: place.lon } : { ...link, title: null };
      }
      return { ...link, title: titles.get(`${link.kind}:${link.id}`) ?? null };
    });
    return {
      contacts,
      places,
      commPlan: one(communicationPlans, body.comms.commPlanId),
      powerPlan: one(powerPlans, body.powerPlanId),
      links,
    };
  }

  /** The household a plan is for, by name, so that a copy on a phone says so. */
  const householdOf = (row: Row): PlanHousehold | undefined => {
    try {
      const { households } = ctx.services;
      return { id: row.householdId, name: households.get(row.householdId).name, several: households.list().length > 1 };
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "not_found") throw error;
      return undefined;
    }
  };

  const answer = (row: Row): EmergencyPlanResponse => {
    const plan = toPlan(row);
    const household = householdOf(row);
    return { plan, resolved: resolve(plan.body), ...(household ? { household } : {}) };
  };

  /** A tick for a step no longer in the plan is let go. */
  const keptTicks = (use: PlanUse, body: PlanBody): PlanUse => {
    const ids = new Set(body.steps.map((step) => step.id));
    return { startedAt: use.startedAt, ticks: Object.fromEntries(Object.entries(use.ticks).filter(([id]) => ids.has(id))) };
  };

  const setUse = (id: string, use: PlanUse) => {
    // Ticking is not an edit of the plan: `updatedAt` stays as it was.
    db.update(emergencyPlans)
      .set({ use: use as unknown as Record<string, unknown> })
      .where(eq(emergencyPlans.id, id))
      .run();
    changed(id);
    return answer(rowOf(id));
  };

  const columns = (input: EmergencyPlanInput) => ({
    name: input.name,
    kind: input.kind,
    kindText: input.kindText,
    templateId: input.templateId,
    emergencyNumber: input.emergencyNumber,
    reviewEveryDays: input.reviewEveryDays,
    body: input.body as unknown as Record<string, unknown>,
  });

  const service: EmergencyPlansService = {
    list() {
      const rows = db
        .select()
        .from(emergencyPlans)
        .where(eq(emergencyPlans.householdId, ctx.services.households.currentId()))
        .orderBy(asc(emergencyPlans.name))
        .all()
        .map(toPlan);
      const contactIds = existing("contacts", [...new Set(rows.flatMap((plan) => contactIdsOf(plan.body)))]);
      const markerIds = existing("markers", [...new Set(rows.flatMap((plan) => markerIdsOf(plan.body)))]);
      return rows.map((plan) => ({
        id: plan.id,
        name: plan.name,
        kind: plan.kind,
        kindText: plan.kindText,
        templateId: plan.templateId,
        scenarios: plan.body.links.filter((link) => link.kind === "scenario").map((link) => link.id),
        steps: plan.body.steps.length,
        ticked: Object.keys(plan.use.ticks).length,
        startedAt: plan.use.startedAt,
        reviewedAt: plan.reviewedAt,
        reviewEveryDays: plan.reviewEveryDays,
        openedAt: plan.openedAt,
        missing:
          contactIdsOf(plan.body).filter((id) => !contactIds.has(id)).length +
          markerIdsOf(plan.body).filter((id) => !markerIds.has(id)).length,
        updatedAt: plan.updatedAt,
      }));
    },
    get: (id) => answer(rowOf(id)),
    create(input) {
      const count = service.kept.count();
      if (count >= L.plans) throw conflict(`Outpost keeps up to ${L.plans} emergency plans. Delete one to make another.`);
      const now = Date.now();
      const id = newId();
      ctx.services.households.ensure();
      db.insert(emergencyPlans)
        .values({
          id,
          householdId: ctx.services.households.currentId(),
          ...columns(input),
          use: { startedAt: null, ticks: {} },
          reviewedAt: now,
          openedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      changed(id);
      return service.get(id);
    },
    update(id, input, baseUpdatedAt) {
      const row = rowOf(id);
      if (baseUpdatedAt !== undefined && row.updatedAt > baseUpdatedAt) {
        throw conflict(
          "This plan was changed somewhere else after you opened it, in another tab or on another device. Your changes were not saved over it; reload to see the newer version.",
          { current: { updatedAt: row.updatedAt, name: row.name } },
        );
      }
      db.update(emergencyPlans)
        .set({
          ...columns(input),
          use: keptTicks(toPlan(row).use, input.body) as unknown as Record<string, unknown>,
          // Always later than the version it replaces, so a base taken from it is never mistaken for it.
          updatedAt: Math.max(Date.now(), row.updatedAt + 1),
        })
        .where(eq(emergencyPlans.id, id))
        .run();
      changed(id);
      return service.get(id);
    },
    copy(id) {
      const { plan } = service.get(id);
      return service.create({
        name: `${plan.name} (copy)`.slice(0, L.name),
        kind: plan.kind,
        kindText: plan.kindText,
        templateId: plan.templateId,
        emergencyNumber: plan.emergencyNumber,
        reviewEveryDays: plan.reviewEveryDays,
        body: plan.body,
      });
    },
    remove(id) {
      rowOf(id);
      db.delete(emergencyPlans).where(eq(emergencyPlans.id, id)).run();
      changed(id);
    },
    tick(id, stepId, done) {
      const plan = toPlan(rowOf(id));
      if (!plan.body.steps.some((step) => step.id === stepId)) throw notFound("That step");
      const ticks = { ...plan.use.ticks };
      if (done) ticks[stepId] = ticks[stepId] ?? Date.now();
      else delete ticks[stepId];
      return setUse(id, { startedAt: plan.use.startedAt ?? Date.now(), ticks });
    },
    mergeTicks(id, merge, now = Date.now()) {
      const plan = toPlan(rowOf(id));
      const steps = new Set(plan.body.steps.map((step) => step.id));
      // A phone's clock may run ahead; nothing is taken to have happened later than now.
      const at = (time: number) => Math.min(time, now);
      const reset = merge.knownStartedAt !== plan.use.startedAt && merge.knownStartedAt !== null;
      // After a reset, only what the phone did after the plan was started again counts (nothing, if it was not).
      const counts = (time: number) => !reset || (plan.use.startedAt !== null && at(time) >= plan.use.startedAt);
      const ticks = { ...plan.use.ticks };
      let applied = 0;
      let dropped = 0;
      for (const [stepId, time] of Object.entries(merge.unticks)) {
        if (steps.has(stepId) && counts(time) && ticks[stepId] === time) {
          delete ticks[stepId];
          applied += 1;
        } else dropped += 1;
      }
      let earliest: number | null = null;
      for (const [stepId, time] of Object.entries(merge.ticks)) {
        if (!steps.has(stepId) || !counts(time)) {
          dropped += 1;
          continue;
        }
        const when = at(time);
        ticks[stepId] = Math.min(ticks[stepId] ?? when, when);
        earliest = Math.min(earliest ?? when, when);
        applied += 1;
      }
      const startedAt =
        earliest === null ? plan.use.startedAt : plan.use.startedAt === null ? earliest : Math.min(plan.use.startedAt, earliest);
      return { ...setUse(id, { startedAt, ticks }), applied, dropped };
    },
    start(id) {
      const plan = toPlan(rowOf(id));
      if (plan.use.startedAt !== null) return answer(rowOf(id));
      return setUse(id, { startedAt: Date.now(), ticks: plan.use.ticks });
    },
    reset(id) {
      rowOf(id);
      return setUse(id, { startedAt: null, ticks: {} });
    },
    reviewed(id) {
      rowOf(id);
      db.update(emergencyPlans).set({ reviewedAt: Date.now() }).where(eq(emergencyPlans.id, id)).run();
      changed(id);
      return service.get(id);
    },
    opened(id) {
      rowOf(id);
      db.update(emergencyPlans).set({ openedAt: Date.now() }).where(eq(emergencyPlans.id, id)).run();
      return service.get(id);
    },
    kept: {
      count: () => (sqlite.prepare("SELECT count(*) AS n FROM emergency_plans").get() as { n: number }).n,
      eraseAll() {
        const had = service.kept.count();
        sqlite.prepare("DELETE FROM emergency_plans").run();
        changed();
        return had;
      },
    },
  };
  ctx.services.emergencyPlans = service;
  // Found by search, the current household's only (search.ts).
  ctx.onClose.push(indexPlans(ctx, () => service.list()));

  const id = (request: { params: unknown }) => idParams.parse(request.params).id;
  app.get("/api/emergency-plans", async () => ({ plans: service.list() }));
  /**
   * The number for a new plan that names none: the one listed for the current
   * household's country (its override, else the country its home is in), else none. The
   * screen offers its own first choice too; this is for anything that asks without one.
   */
  const numberHere = () => emergencyNumberFor(ctx.services.households.country()) ?? "";
  app.post("/api/emergency-plans", async (request) => {
    const plan = planSchema.parse(request.body);
    return service.create({ ...plan, emergencyNumber: plan.emergencyNumber ?? numberHere() });
  });
  app.get("/api/emergency-plans/:id", async (request) => service.get(id(request)));
  app.put("/api/emergency-plans/:id", async (request) => {
    const { baseUpdatedAt, ...given } = baseSchema.parse(request.body);
    const plan = planSchema.parse(given);
    const emergencyNumber = plan.emergencyNumber ?? service.get(id(request)).plan.emergencyNumber;
    return service.update(id(request), { ...plan, emergencyNumber }, baseUpdatedAt);
  });
  app.delete("/api/emergency-plans/:id", async (request) => {
    service.remove(id(request));
    return { ok: true };
  });
  app.post("/api/emergency-plans/:id/copy", async (request) => service.copy(id(request)));
  app.post("/api/emergency-plans/:id/ticks", async (request) => {
    const { stepId, done } = z.object({ stepId: itemId, done: z.boolean() }).strict().parse(request.body);
    return service.tick(id(request), stepId, done);
  });
  const tickTimes = z.record(itemId, z.number().int().nonnegative()).refine((value) => Object.keys(value).length <= PLAN_LIMITS.steps, {
    message: "Too many ticks.",
  });
  app.post("/api/emergency-plans/:id/ticks/merge", async (request) =>
    service.mergeTicks(
      id(request),
      z
        .object({ knownStartedAt: z.number().int().nonnegative().nullable(), ticks: tickTimes, unticks: tickTimes })
        .strict()
        .parse(request.body),
    ),
  );
  app.post("/api/emergency-plans/:id/start", async (request) => service.start(id(request)));
  app.post("/api/emergency-plans/:id/reset", async (request) => service.reset(id(request)));
  app.post("/api/emergency-plans/:id/reviewed", async (request) => service.reviewed(id(request)));
  /** Recorded by a press (opening the plan), never by a GET: a GET changes nothing. */
  app.post("/api/emergency-plans/:id/opened", async (request) => service.opened(id(request)));
}
