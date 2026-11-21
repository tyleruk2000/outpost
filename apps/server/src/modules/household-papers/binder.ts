/**
 * The household binder: the printables a household chose, made into one PDF in the
 * browser. The server keeps only the record of the last one made (which parts, how many
 * pages, and when the newest thing in it had changed), so that Home can say when the
 * binder on the shelf is older than what is in it.
 *
 * A part's "changed" time is the newest change among the things it is made from. A
 * thing deleted leaves no time behind, so a binder is not called out of date by a
 * deletion alone; the screen says so.
 */
import { BINDER_PART_IDS, type BinderMade, type BinderPart, type BinderStatus, staleParts } from "@outpost/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { householdBinder } from "../../db/schema.ts";

const ROW = "household";

export const madeSchema = z
  .object({
    parts: z.array(z.enum(BINDER_PART_IDS)).min(1, "Choose at least one thing to put in the binder.").max(BINDER_PART_IDS.length),
    contentAt: z.number().int().nonnegative(),
    pages: z.number().int().min(1).max(2000),
  })
  .strict();

export interface BinderService {
  status(): BinderStatus;
  made(input: Omit<BinderMade, "madeAt">): BinderStatus;
  count(): number;
  eraseAll(): number;
}

export function createBinderService(
  ctx: AppContext,
  times: { medical(): number | null; comms(): number | null },
  changed: () => void,
): BinderService {
  const { db, sqlite } = ctx;
  const newest = (sql: string): number | null => {
    try {
      return (sqlite.prepare(sql).get() as { at: number | null } | undefined)?.at ?? null;
    } catch {
      return null;
    }
  };
  const max = (...values: Array<number | null>) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length > 0 ? Math.max(...known) : null;
  };

  function changedAt(): Record<BinderPart, number | null> {
    const plans = newest("SELECT max(updated_at) AS at FROM emergency_plans");
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
        newest("SELECT max(stock_changed_at) AS at FROM supply_household"),
        newest("SELECT max(updated_at) AS at FROM supply_household"),
        newest("SELECT max(updated_at) AS at FROM supply_items"),
      ),
    };
  }

  const read = (): BinderMade | null => {
    const row = db.select().from(householdBinder).where(eq(householdBinder.id, ROW)).get();
    if (!row) return null;
    return { parts: row.parts as BinderPart[], contentAt: row.contentAt, madeAt: row.madeAt, pages: row.pages };
  };

  const service: BinderService = {
    status() {
      const made = read();
      const at = changedAt();
      return { made, changedAt: at, stale: staleParts(made, at) };
    },
    made(input) {
      const values = { parts: [...new Set(input.parts)], contentAt: input.contentAt, madeAt: Date.now(), pages: input.pages };
      db.insert(householdBinder)
        .values({ id: ROW, ...values })
        .onConflictDoUpdate({ target: householdBinder.id, set: values })
        .run();
      changed();
      return service.status();
    },
    count: () => (read() ? 1 : 0),
    eraseAll() {
      const had = service.count();
      db.delete(householdBinder).run();
      changed();
      return had;
    },
  };
  return service;
}
