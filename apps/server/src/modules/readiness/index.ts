/**
 * Readiness, under Preparedness: the log of events (log.ts), routine checks with the
 * date each was last done (checks.ts), and the offline drill (drill.ts). The roll call
 * is the board's (modules/board), as check-ins are.
 *
 * All of it is the household's own: counted and erased with the rest by modules/manage,
 * and in every backup. Every change is announced as `readiness.changed`. See
 * docs/readiness.md.
 */
import { CHECK_LIMITS, CHECK_LINK_IDS, EVENT_LOG_LIMITS } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createRoutineChecksService, type RoutineChecksService } from "./checks.ts";
import { createOfflineDrillService, type OfflineDrillService } from "./drill.ts";
import { createEventLogService, type EventLogService } from "./log.ts";

export interface ReadinessService {
  log: EventLogService;
  checks: RoutineChecksService;
  drill: OfflineDrillService;
  kept: { count(): number; eraseAll(): number };
}

declare module "../../core/context.ts" {
  interface Services {
    readiness: ReadinessService;
  }
}

const idParams = z.object({ id: z.string().min(1).max(64) });
const name = z.string().max(160);
const time = z.number().int().min(0);
const flag = z
  .enum(["1", "0", "true", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

const logQuery = z.object({ from: z.coerce.number().int().min(0).optional(), others: flag });
const logBody = z
  .object({
    author: name,
    text: z.string().max(EVENT_LOG_LIMITS.text * 2),
    at: time.optional(),
    planId: z.string().max(64).nullable().optional(),
  })
  .strict();
const logEdit = z
  .object({
    by: name,
    text: z
      .string()
      .max(EVENT_LOG_LIMITS.text * 2)
      .optional(),
    at: time.optional(),
    baseUpdatedAt: z.number().int(),
  })
  .strict();
const toNotesBody = z.object({ from: time.optional(), others: z.boolean().default(false) }).strict();

const checkBody = z
  .object({
    name: z.string().max(CHECK_LIMITS.name * 2),
    everyDays: z.number().int(),
    note: z
      .string()
      .max(CHECK_LIMITS.note * 2)
      .default(""),
    link: z.enum(CHECK_LINK_IDS).nullable().default(null),
    baseUpdatedAt: z.number().int().optional(),
  })
  .strict();
const doneBody = z.object({ by: name.default(""), at: time.nullable().optional() }).strict();

const drillBody = z
  .object({
    by: name,
    startedAt: time,
    answers: z.record(z.string().max(40), z.enum(["worked", "failed"])),
    notes: z.string().max(8000).default(""),
  })
  .strict();

export async function registerReadiness(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const changed = () => ctx.events.publish({ type: "readiness.changed" });
  const log = createEventLogService(ctx, changed);
  const checks = createRoutineChecksService(ctx, changed);
  const drill = createOfflineDrillService(ctx, changed);
  ctx.services.readiness = {
    log,
    checks,
    drill,
    kept: {
      count: () => log.count() + checks.count() + drill.count(),
      eraseAll: () => log.eraseAll() + checks.eraseAll() + drill.eraseAll(),
    },
  };
  const id = (request: { params: unknown }) => idParams.parse(request.params).id;

  // ── The log of events ──
  app.get("/api/event-log", async (request) => log.list(logQuery.parse(request.query)));
  app.post("/api/event-log", async (request) => ({ line: log.add(logBody.parse(request.body)) }));
  app.patch("/api/event-log/:id", async (request) => ({ line: log.edit(id(request), logEdit.parse(request.body)) }));
  app.delete("/api/event-log/:id", async (request) => {
    log.remove(id(request));
    return { ok: true };
  });
  /** Writes the log as shown to a new page in Notes. */
  app.post("/api/event-log/to-notes", async (request) => log.toNotes(toNotesBody.parse(request.body ?? {})));

  // ── Routine checks ──
  app.get("/api/routine-checks", async () => checks.list());
  app.post("/api/routine-checks", async (request) => ({ check: checks.create(checkBody.parse(request.body)) }));
  app.post("/api/routine-checks/suggested", async () => ({ added: checks.addSuggested() }));
  app.put("/api/routine-checks/:id", async (request) => ({ check: checks.update(id(request), checkBody.parse(request.body)) }));
  app.delete("/api/routine-checks/:id", async (request) => {
    checks.remove(id(request));
    return { ok: true };
  });
  app.post("/api/routine-checks/:id/done", async (request) => ({ check: checks.done(id(request), doneBody.parse(request.body ?? {})) }));

  // ── The offline drill ──
  app.get("/api/offline-drill", async (request) => ({
    checkedAt: Date.now(),
    lines: await drill.lines(request),
    lastRun: drill.lastRun(),
  }));
  app.post("/api/offline-drill/runs", async (request) => ({ run: drill.record(drillBody.parse(request.body)) }));
}
