/**
 * Keeping in touch: the household's communication plan. For each situation, the order
 * to try things in (primary, alternate, contingency, emergency), when to check in, and
 * who to contact. One plan per household, printed as a page for each person.
 *
 * It is built from what Outpost already holds, linked by id: contacts, saved places,
 * repeaters, mesh channels, and channels from the list of frequencies (which is part of
 * Outpost itself, so it is read by the screens and not resolved here). The answer says
 * what each link is now, and null for one that has gone.
 */
import {
  COMMS_LIMITS,
  type CommsInput,
  type CommsPlan,
  type CommsResolved,
  type CommsResponse,
  emptyCommsPlan,
  PACE_LEVEL_IDS,
  PACE_MEANS_IDS,
} from "@outpost/shared";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { commsPlans, markers } from "../../db/schema.ts";

const L = COMMS_LIMITS;
const ROW = "household";
const itemId = z.string().min(1).max(64);
const ref = z.string().min(1).max(120).nullable().default(null);
const text = (max: number) => z.string().max(max).default("");

const unique = (list: Array<{ id: string }>) => new Set(list.map((item) => item.id)).size === list.length;

export const commsSchema = z
  .object({
    situations: z
      .array(
        z
          .object({
            id: itemId,
            name: z.string().trim().min(1, "Name the situation: “Phones down”.").max(L.short),
            steps: z
              .array(
                z
                  .object({
                    id: itemId,
                    level: z.enum(PACE_LEVEL_IDS),
                    means: z.enum(PACE_MEANS_IDS),
                    contactId: ref,
                    frequency: z
                      .object({ entryId: z.string().min(1).max(120), channel: text(40) })
                      .strict()
                      .nullable()
                      .default(null),
                    repeaterId: ref,
                    meshChannel: ref,
                    markerId: ref,
                    when: text(L.short),
                    text: text(L.text),
                  })
                  .strict(),
              )
              .max(L.steps)
              .default([])
              .refine(unique, "Two steps have the same id."),
            checkIn: text(L.short),
            contactIds: z.array(z.string().min(1).max(64)).max(L.contacts).default([]),
          })
          .strict(),
      )
      .max(L.situations)
      .default([])
      .refine(unique, "Two situations have the same id."),
    checkIns: text(L.text),
    people: z
      .array(
        z
          .object({
            id: itemId,
            memberId: z.string().min(1).max(64).nullable().default(null),
            name: z.string().trim().min(1, "Give each person a name.").max(L.short),
            note: text(L.text),
          })
          .strict(),
      )
      .max(L.people)
      .default([])
      .refine(unique, "Two people have the same id."),
    notes: text(L.notes),
    baseUpdatedAt: z.number().nullable().optional(),
  })
  .strict();

export interface CommsService {
  get(): CommsResponse;
  save(input: CommsInput): CommsResponse;
  changedAt(): number | null;
  count(): number;
  eraseAll(): number;
}

export function createCommsService(ctx: AppContext, changed: () => void): CommsService {
  const { db } = ctx;

  const read = (): CommsPlan => {
    const row = db.select().from(commsPlans).where(eq(commsPlans.id, ROW)).get();
    if (!row) return emptyCommsPlan();
    return { ...(row.body as unknown as Omit<CommsPlan, "updatedAt">), updatedAt: row.updatedAt };
  };

  function resolve(plan: CommsPlan): CommsResolved {
    const steps = plan.situations.flatMap((situation) => situation.steps);
    const contactIds = new Set([
      ...plan.situations.flatMap((situation) => situation.contactIds),
      ...steps.map((step) => step.contactId).filter((id): id is string => !!id),
    ]);
    const contacts: CommsResolved["contacts"] = {};
    for (const id of contactIds) {
      try {
        const contact = ctx.services.contacts.get(id);
        contacts[id] = { displayName: contact.displayName, phones: contact.phones, callsign: contact.callsign };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "not_found") throw error;
        contacts[id] = null;
      }
    }
    const markerIds = [...new Set(steps.map((step) => step.markerId).filter((id): id is string => !!id))];
    const places: CommsResolved["places"] = Object.fromEntries(markerIds.map((id) => [id, null]));
    if (markerIds.length > 0)
      for (const row of db
        .select({ id: markers.id, name: markers.name, lat: markers.lat, lon: markers.lon })
        .from(markers)
        .where(inArray(markers.id, markerIds))
        .all())
        places[row.id] = { name: row.name, lat: row.lat, lon: row.lon };
    const repeaters: CommsResolved["repeaters"] = {};
    for (const id of new Set(steps.map((step) => step.repeaterId).filter((id): id is string => !!id))) {
      try {
        const { repeater } = ctx.services.repeaters.get(id);
        repeaters[id] = {
          callsign: repeater.callsign,
          outputHz: repeater.outputHz,
          inputHz: repeater.inputHz,
          ctcssHz: repeater.ctcssHz,
          place: repeater.place,
        };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "not_found") throw error;
        repeaters[id] = null;
      }
    }
    const channels = ctx.services.mesh ? ctx.services.mesh.response().channels : [];
    const mesh: CommsResolved["mesh"] = {};
    for (const id of new Set(steps.map((step) => step.meshChannel).filter((id): id is string => !!id)))
      mesh[id] = channels.find((channel) => channel.id === id)?.label ?? null;
    return { contacts, places, repeaters, mesh };
  }

  const service: CommsService = {
    get() {
      const plan = read();
      return { plan, resolved: resolve(plan) };
    },
    save(input) {
      const before = read();
      if (
        input.baseUpdatedAt !== undefined &&
        input.baseUpdatedAt !== null &&
        before.updatedAt !== null &&
        before.updatedAt > input.baseUpdatedAt
      )
        throw conflict(
          "The communication plan was changed somewhere else after you opened it. Your changes were not saved over it; reload to see the newer version.",
          { current: { updatedAt: before.updatedAt, name: "Keeping in touch" } },
        );
      const { baseUpdatedAt: _base, ...body } = input;
      const updatedAt = Math.max(Date.now(), (before.updatedAt ?? 0) + 1);
      db.insert(commsPlans)
        .values({ id: ROW, body: body as unknown as Record<string, unknown>, updatedAt })
        .onConflictDoUpdate({ target: commsPlans.id, set: { body: body as unknown as Record<string, unknown>, updatedAt } })
        .run();
      changed();
      return service.get();
    },
    changedAt: () => read().updatedAt,
    count: () => (db.select().from(commsPlans).all().length > 0 ? 1 : 0),
    eraseAll() {
      const had = service.count();
      db.delete(commsPlans).run();
      changed();
      return had;
    },
  };
  return service;
}
