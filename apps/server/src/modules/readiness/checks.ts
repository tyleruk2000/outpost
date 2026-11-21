/**
 * Routine checks: the few things a household does every so often so that it is ready
 * (rotate the stored water, run the generator, test a restore), each with an interval
 * and the date it was last done. Started from a suggested list the household edits.
 * Nothing here wakes anyone: Outpost cannot reach a phone that is not looking, so Home
 * shows what is overdue, and that is all.
 */
import {
  CHECK_LIMITS,
  type CheckLink,
  daysBetween,
  localDay,
  ROUTINE_CHECK_TEMPLATE,
  type RoutineCheck,
  type RoutineCheckInput,
  type RoutineChecksResponse,
} from "@outpost/shared";
import { asc, count, eq, max } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { routineChecks } from "../../db/schema.ts";
import { cleanLine, cleanName } from "../board/service.ts";

type Row = typeof routineChecks.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A supply dated within this many days counts towards "replace what expires". */
const EXPIRING_DAYS = 30;

export interface RoutineChecksService {
  list(now?: number): RoutineChecksResponse;
  create(input: RoutineCheckInput): RoutineCheck;
  update(id: string, input: RoutineCheckInput): RoutineCheck;
  remove(id: string): void;
  /** Adds the suggested checks the household does not have yet. */
  addSuggested(): RoutineCheck[];
  done(id: string, input: { by: string; at?: number | null }): RoutineCheck;
  count(): number;
  eraseAll(): number;
}

export function checkDto(row: Row, now = Date.now()): RoutineCheck {
  const dueAt = row.lastDoneAt === null ? null : row.lastDoneAt + row.everyDays * DAY_MS;
  return {
    id: row.id,
    name: row.name,
    everyDays: row.everyDays,
    note: row.note,
    link: (row.link as CheckLink | null) ?? null,
    templateId: row.templateId,
    lastDoneAt: row.lastDoneAt,
    lastDoneBy: row.lastDoneBy,
    dueAt,
    overdue: dueAt === null || dueAt <= now,
    position: row.position,
    updatedAt: row.updatedAt,
  };
}

export function createRoutineChecksService(ctx: AppContext, changed: () => void): RoutineChecksService {
  const { db } = ctx;
  const get = (id: string): Row => {
    const row = db.select().from(routineChecks).where(eq(routineChecks.id, id)).get();
    if (!row) throw notFound("That check");
    return row;
  };
  const total = () => db.select({ n: count() }).from(routineChecks).get()?.n ?? 0;
  const nextPosition = () =>
    (db
      .select({ n: max(routineChecks.position) })
      .from(routineChecks)
      .get()?.n ?? -1) + 1;

  function clean(input: RoutineCheckInput) {
    const name = cleanLine(input.name, CHECK_LIMITS.name);
    if (!name) throw badRequest("Say what the check is.");
    if (!Number.isInteger(input.everyDays) || input.everyDays < 1 || input.everyDays > CHECK_LIMITS.everyDaysMax)
      throw badRequest(`Give how often in whole days, from 1 to ${CHECK_LIMITS.everyDaysMax}.`);
    return { name, everyDays: input.everyDays, note: cleanLine(input.note ?? "", CHECK_LIMITS.note), link: input.link ?? null };
  }

  function expiringSupplies(): number {
    const today = localDay();
    try {
      return ctx.services.supplies
        .items()
        .filter((item) => item.date !== null && item.quantity > 0 && daysBetween(today, item.date) <= EXPIRING_DAYS).length;
    } catch {
      return 0;
    }
  }

  return {
    list(now = Date.now()) {
      const rows = db.select().from(routineChecks).orderBy(asc(routineChecks.position), asc(routineChecks.createdAt)).all();
      return { checks: rows.map((row) => checkDto(row, now)), expiringSupplies: expiringSupplies() };
    },

    create(input) {
      if (total() >= CHECK_LIMITS.checks) throw badRequest(`A household can keep up to ${CHECK_LIMITS.checks} checks.`);
      const now = Date.now();
      const row: Row = {
        id: newId(),
        ...clean(input),
        templateId: null,
        lastDoneAt: null,
        lastDoneBy: null,
        position: nextPosition(),
        createdAt: now,
        updatedAt: now,
      };
      db.insert(routineChecks).values(row).run();
      changed();
      return checkDto(row);
    },

    update(id, input) {
      get(id);
      db.update(routineChecks)
        .set({ ...clean(input), updatedAt: Date.now() })
        .where(eq(routineChecks.id, id))
        .run();
      changed();
      return checkDto(get(id));
    },

    remove(id) {
      get(id);
      db.delete(routineChecks).where(eq(routineChecks.id, id)).run();
      changed();
    },

    addSuggested() {
      const have = new Set(
        db
          .select({ templateId: routineChecks.templateId })
          .from(routineChecks)
          .all()
          .map((row) => row.templateId),
      );
      const now = Date.now();
      let position = nextPosition();
      const added: Row[] = [];
      for (const template of ROUTINE_CHECK_TEMPLATE) {
        if (have.has(template.id)) continue;
        added.push({
          id: newId(),
          name: template.name,
          everyDays: template.everyDays,
          note: template.note,
          link: template.link,
          templateId: template.id,
          lastDoneAt: null,
          lastDoneBy: null,
          position: position++,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (added.length > 0) {
        db.insert(routineChecks).values(added).run();
        changed();
      }
      return added.map((row) => checkDto(row, now));
    },

    done(id, input) {
      get(id);
      const now = Date.now();
      if (input.at === null) {
        db.update(routineChecks).set({ lastDoneAt: null, lastDoneBy: null, updatedAt: now }).where(eq(routineChecks.id, id)).run();
      } else {
        const by = cleanName(input.by);
        const at = input.at ?? now;
        if (at > now + 5 * 60_000) throw badRequest("That day has not come yet. Give the day it was done.");
        db.update(routineChecks)
          .set({ lastDoneAt: Math.min(at, now), lastDoneBy: by || null, updatedAt: now })
          .where(eq(routineChecks.id, id))
          .run();
      }
      changed();
      return checkDto(get(id));
    },

    count: total,
    eraseAll() {
      const n = total();
      db.delete(routineChecks).run();
      if (n > 0) changed();
      return n;
    },
  };
}
