/** Health, live events, background jobs, settings and a plain account of resource use. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { toJobDto } from "../../core/jobs.ts";
import { isBundled } from "../../core/paths.ts";
import { VERSION } from "../../core/version.ts";
import { jobs } from "../../db/schema.ts";
import type { Settings } from "../settings/service.ts";
import { detectHost } from "../storage/shares/host.ts";

export { VERSION };

export async function registerSystem(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { settings } = ctx.services;
  const startedAt = Date.now();

  // Which build of the web app this server is handing out: the name of its fingerprinted
  // entry script. A browser tab that has been open since before an update compares it with
  // its own and offers to reload. Read again only when index.html changes.
  const indexFile = path.join(ctx.config.webDir, "index.html");
  let webBuild: { mtimeMs: number; name: string | null } | undefined;
  function servedWebBuild(): string | null {
    try {
      const { mtimeMs } = fs.statSync(indexFile);
      if (webBuild?.mtimeMs !== mtimeMs) {
        const entry = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(fs.readFileSync(indexFile, "utf8"));
        webBuild = { mtimeMs, name: entry?.[1] ?? null };
      }
      return webBuild.name;
    } catch {
      return null;
    }
  }

  app.get("/api/health", async () => ({ status: "ok", version: VERSION, web: servedWebBuild() }));

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
    // The server is stopping: say so and end the stream, or the stop would wait on this
    // tab for as long as it stays open. A browser tries again by itself in a moment.
    const stopping = () => {
      if (!reply.raw.writableEnded) reply.raw.write("event: server.stopping\ndata: {}\n\n");
      close();
    };
    ctx.stopping.addEventListener("abort", stopping, { once: true });
    // Removed again when the browser goes away, so reconnecting tabs do not pile up.
    request.raw.on("close", () => ctx.stopping.removeEventListener("abort", stopping));
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
