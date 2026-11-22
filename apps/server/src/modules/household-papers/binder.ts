/**
 * The household binder: the printables a household chose, made into one PDF in the
 * browser. The server keeps only the record of the last one made (which parts, how many
 * pages, and when the newest thing in it had changed), so that Home can say when the
 * binder on the shelf is older than what is in it.
 *
 * A part's "changed" time is the newest change among the things it is made from. A
 * thing deleted leaves no time behind, so a binder also records what each part was made
 * from (`fingerprints.ts`) and is out of date when that has changed, a deletion included.
 * A binder recorded before fingerprints were kept is compared by its time alone.
 *
 * Each household has its own record, keyed by its id; every call is for the current one.
 */
import { BINDER_PART_IDS, type BinderMade, type BinderPart, type BinderStatus, staleParts } from "@outpost/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { householdBinder } from "../../db/schema.ts";
import type { Fingerprints } from "./fingerprints.ts";

export const madeSchema = z
  .object({
    parts: z.array(z.enum(BINDER_PART_IDS)).min(1, "Choose at least one thing to put in the binder.").max(BINDER_PART_IDS.length),
    contentAt: z.number().int().nonnegative(),
    pages: z.number().int().min(1).max(2000),
    /** The fingerprints of the status the binder was made from; left out, the server's own now are recorded. */
    fingerprints: z.partialRecord(z.enum(BINDER_PART_IDS), z.string().max(64)).optional(),
  })
  .strict();

export interface BinderService {
  status(): BinderStatus;
  made(input: Omit<BinderMade, "madeAt" | "fingerprints"> & { fingerprints?: Partial<Record<BinderPart, string>> }): BinderStatus;
  count(): number;
  eraseAll(): number;
}

export function createBinderService(
  ctx: AppContext,
  times: { medical(): number | null; comms(): number | null },
  fingerprints: Fingerprints,
  changed: () => void,
): BinderService {
  const { db, sqlite } = ctx;
  const rowId = () => ctx.services.households.currentId();
  const newest = (sql: string, ...params: unknown[]): number | null => {
    try {
      return (sqlite.prepare(sql).get(...params) as { at: number | null } | undefined)?.at ?? null;
    } catch {
      return null;
    }
  };
  const max = (...values: Array<number | null>) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length > 0 ? Math.max(...known) : null;
  };

  function changedAt(): Record<BinderPart, number | null> {
    const household = rowId();
    const plans = newest("SELECT max(updated_at) AS at FROM emergency_plans WHERE household_id = ?", household);
    const contacts = newest("SELECT max(updated_at) AS at FROM contacts WHERE is_emergency = 1");
    const places = newest("SELECT max(updated_at) AS at FROM markers");
    const medical = times.medical();
    const comms = times.comms();
    return {
      plans,
      contacts,
      comms: max(comms, comms === null ? null : newest("SELECT max(updated_at) AS at FROM contacts")),
      "grab-cards": max(medical, contacts, plans, places),
      medical,
      frequencies: comms,
      places,
      supplies: max(
        newest("SELECT max(stock_changed_at) AS at FROM supply_household WHERE id = ?", household),
        newest("SELECT max(updated_at) AS at FROM supply_household WHERE id = ?", household),
        newest("SELECT max(updated_at) AS at FROM supply_items WHERE household_id = ?", household),
      ),
    };
  }

  const read = (): BinderMade | null => {
    const row = db.select().from(householdBinder).where(eq(householdBinder.id, rowId())).get();
    if (!row) return null;
    return {
      parts: row.parts as BinderPart[],
      contentAt: row.contentAt,
      madeAt: row.madeAt,
      pages: row.pages,
      fingerprints: (row.fingerprints as Record<BinderPart, string> | null) ?? null,
    };
  };

  const service: BinderService = {
    status() {
      const made = read();
      const at = changedAt();
      const now = fingerprints.binder();
      return { made, changedAt: at, fingerprints: now, stale: staleParts(made, at, now) };
    },
    made(input) {
      const values = {
        parts: [...new Set(input.parts)],
        contentAt: input.contentAt,
        madeAt: Date.now(),
        pages: input.pages,
        fingerprints: { ...fingerprints.binder(), ...(input.fingerprints ?? {}) } as Record<string, string>,
      };
      ctx.services.households.ensure();
      db.insert(householdBinder)
        .values({ id: rowId(), ...values })
        .onConflictDoUpdate({ target: householdBinder.id, set: values })
        .run();
      changed();
      return service.status();
    },
    /** Records kept, in every household. */
    count: () => db.select({ id: householdBinder.id }).from(householdBinder).all().length,
    eraseAll() {
      const had = service.count();
      db.delete(householdBinder).run();
      changed();
      return had;
    },
  };
  return service;
}
