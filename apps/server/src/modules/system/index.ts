/** Health, live events, background jobs, settings and a plain account of resource use. */
import os from "node:os";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { toJobDto } from "../../core/jobs.ts";
import { isBundled } from "../../core/paths.ts";
import { jobs } from "../../db/schema.ts";
import type { Settings } from "../settings/service.ts";
import { detectHost } from "../storage/shares/host.ts";

export const VERSION = "0.1.0";

export async function registerSystem(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { settings } = ctx.services;
  const startedAt = Date.now();

  app.get("/api/health", async () => ({ status: "ok", version: VERSION }));

  app.get("/api/system", async () => {
    const memory = process.memoryUsage();
    const queueRows = ctx.db
      .select({ queue: jobs.queue, state: jobs.state, n: sql<number>`count(*)` })
      .from(jobs)
      .where(sql`${jobs.state} in ('queued', 'running', 'paused')`)
      .groupBy(jobs.queue, jobs.state)
      .all();
    const queues: Record<string, { queued: number; running: number; paused: number }> = {};
    for (const row of queueRows) {
      const entry = queues[row.queue] ?? { queued: 0, running: 0, paused: 0 };
      entry[row.state as "queued" | "running" | "paused"] = row.n;
      queues[row.queue] = entry;
    }
    const dbPages = ctx.sqlite.pragma("page_count", { simple: true }) as number;
    const dbPageSize = ctx.sqlite.pragma("page_size", { simple: true }) as number;
    return {
      version: VERSION,
      packaged: isBundled,
      portable: ctx.config.portable,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      host: detectHost(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      lanAccess: ctx.config.lanAccess,
      resources: {
        processRssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        systemTotalBytes: os.totalmem(),
        systemFreeBytes: os.freemem(),
        loadAverage: os.loadavg(),
        cpuCount: os.availableParallelism(),
        databaseBytes: dbPages * dbPageSize,
      },
      queues,
    };
  });

  // Server-sent events: one long-lived response per open tab.
  app.get("/api/events", (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 3000\n\n");
    const unsubscribe = ctx.events.subscribe((event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify({ id: event.id, data: event.data })}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(": keep-alive\n\n"), 25_000);
    heartbeat.unref();
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!reply.raw.writableEnded) reply.raw.end();
    };
    request.raw.on("close", close);
    // Removed again when the browser goes away, so reconnecting tabs do not pile up.
    ctx.onClose.push(close);
    request.raw.on("close", () => {
      const index = ctx.onClose.indexOf(close);
      if (index !== -1) ctx.onClose.splice(index, 1);
    });
  });

  app.get<{ Querystring: { active?: string; limit?: string } }>("/api/jobs", async (request) => {
    const limit = Math.min(Math.max(Math.floor(Number(request.query.limit)) || 50, 1), 200);
    const states = request.query.active === "true" ? (["queued", "running", "paused"] as const) : undefined;
    return { jobs: ctx.jobs.list({ states: states ? [...states] : undefined, limit }).map(toJobDto) };
  });

  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (request) => {
    const job = ctx.jobs.get(request.params.id);
    if (!job) throw notFound("Job");
    return { job: toJobDto(job) };
  });

  app.post<{ Params: { id: string; action: string } }>("/api/jobs/:id/:action", async (request) => {
    const action = z.enum(["pause", "resume", "cancel"]).parse(request.params.action);
    return { job: toJobDto(ctx.jobs[action](request.params.id)) };
  });

  app.get("/api/settings", async () => ({ settings: settings.all() }));

  app.patch("/api/settings", async (request) => {
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    return { settings: settings.update(body as Partial<Settings>) };
  });
}
