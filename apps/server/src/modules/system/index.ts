/** Health, live events, background jobs, settings and a plain account of resource use. */
import fs from "node:fs";
import type { ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { toJobDetail, toJobDto } from "../../core/jobs.ts";
import { isBundled } from "../../core/paths.ts";
import { VERSION } from "../../core/version.ts";
import { jobs } from "../../db/schema.ts";
import type { Settings } from "../settings/service.ts";
import { detectHost } from "../storage/shares/host.ts";

export { VERSION };

const JOB_STATES = ["queued", "running", "paused", "succeeded", "failed", "cancelled"] as const;
/** "a,b,c" as a list, each checked; an empty value is no filter. */
const commaList = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .max(2000)
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(item).max(50))
    .optional()
    .transform((list) => (list?.length ? list : undefined));
const jobType = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/);
const jobsQuery = z.object({
  active: z.enum(["true", "false"]).optional(),
  states: commaList(z.enum(JOB_STATES)),
  types: commaList(jobType),
  notTypes: commaList(jobType),
  // A limit that is not a number, or out of range, is the default or the nearest allowed: older callers send what they like.
  limit: z.coerce
    .number()
    .transform((value) => Math.min(Math.max(Math.floor(value) || 50, 1), 200))
    .catch(50),
});
const jobParams = z.object({ id: z.string().min(1).max(64) });

/** How often an open live-events stream is sent a comment line, so a quiet one is not cut. */
export const EVENTS_HEARTBEAT_MS = 50_000;

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

  // Server-sent events: one long-lived response per open tab. A comment line now and then
  // keeps a reverse proxy from cutting a stream that has been quiet (nginx's default limit
  // is a minute) and lets the server notice a tab that went away without saying so. One
  // timer serves every open stream, and none runs while no tab is open.
  const streams = new Set<ServerResponse>();
  let heartbeat: NodeJS.Timeout | undefined;
  const beat = () => {
    for (const stream of streams) stream.write(": keep-alive\n\n");
  };
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
    streams.add(reply.raw);
    if (!heartbeat) {
      heartbeat = setInterval(beat, EVENTS_HEARTBEAT_MS);
      heartbeat.unref();
    }
    const close = () => {
      streams.delete(reply.raw);
      if (streams.size === 0 && heartbeat) {
        clearInterval(heartbeat);
        heartbeat = undefined;
      }
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

  app.get("/api/jobs", async (request) => {
    const query = jobsQuery.parse(request.query);
    const states = query.active === "true" ? (["queued", "running", "paused"] as const) : query.states;
    return {
      jobs: ctx.jobs
        .list({ states: states ? [...states] : undefined, types: query.types, excludeTypes: query.notTypes, limit: query.limit })
        .map((job) => ctx.jobs.toDto(job)),
    };
  });

  app.get("/api/jobs/:id", async (request) => {
    const { id } = jobParams.parse(request.params);
    const job = ctx.jobs.get(id);
    if (!job) throw notFound("Job");
    return { job: ctx.jobs.toDto(job) };
  });

  // One job with its progress now and then, its history and what it is waiting for: the task's page.
  app.get("/api/jobs/:id/detail", async (request) => {
    const { id } = jobParams.parse(request.params);
    if (!ctx.jobs.get(id)) throw notFound("Job");
    return toJobDetail(ctx.jobs, ctx.jobs.detail(id));
  });

  app.post("/api/jobs/:id/:action", async (request) => {
    const { id, action } = jobParams.extend({ action: z.enum(["pause", "resume", "cancel"]) }).parse(request.params);
    return { job: toJobDto(ctx.jobs[action](id)) };
  });

  app.get("/api/settings", async () => ({ settings: settings.all() }));

  app.patch("/api/settings", async (request) => {
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    return { settings: settings.update(body as Partial<Settings>) };
  });
}
