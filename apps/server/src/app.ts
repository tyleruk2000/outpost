/**
 * Builds the HTTP application. `buildApp` is used by the real entry point and by tests,
 * which pass a temporary data directory and get a fully working server back.
 */
import { setMaxListeners } from "node:events";
import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Config } from "./config.ts";
import type { AppContext, Services } from "./core/context.ts";
import { AppError } from "./core/errors.ts";
import { EventBus } from "./core/events.ts";
import { registerRequestGuard } from "./core/guard.ts";
import { JobQueue } from "./core/jobs.ts";
import { isBundled } from "./core/paths.ts";
import { openDatabase } from "./db/client.ts";
import { applyPendingRestore } from "./modules/backup/index.ts";
import { modules } from "./modules/index.ts";
import { createSettingsService } from "./modules/settings/service.ts";
import { registerStorage } from "./modules/storage/index.ts";
import { registerSystem } from "./modules/system/index.ts";

/**
 * Policy for the app's own pages. Everything is same-origin: there is no CDN, no
 * analytics and no remote font, and `connect-src 'self'` makes the browser enforce it.
 */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/**
 * How long requests in flight get to finish once the server has been asked to stop.
 * Whatever is still open after that is cut: a stop must not wait on a browser tab, and
 * `docker stop` kills the process ten seconds after asking.
 */
export const DRAIN_LIMIT_MS = 3_000;

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

export async function buildApp(config: Config): Promise<BuiltApp> {
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const root of config.storageRoots.slice(0, 1)) fs.mkdirSync(root, { recursive: true });

  const app = Fastify({
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            // Pretty logs are a development convenience; the packaged app does not carry the formatter.
            ...(config.env === "development" && !config.portable && !isBundled
              ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
              : {}),
          },
    bodyLimit: 20 * 1024 * 1024,
    // Behind a reverse proxy, client addresses come from X-Forwarded-For only when asked.
    trustProxy: false,
    routerOptions: { maxParamLength: 2000 },
  });

  applyPendingRestore(config.dataDir, (message) => app.log.warn(message));
  const { sqlite, db } = openDatabase(path.join(config.dataDir, "outpost.db"));
  const events = new EventBus();
  const stopping = new AbortController();
  // One listener for each open live-events stream; a house full of open tabs is not a leak.
  setMaxListeners(0, stopping.signal);
  const ctx: AppContext = {
    config,
    db,
    sqlite,
    events,
    jobs: new JobQueue(db, events, app.log),
    log: app.log,
    services: {} as Services,
    stopping: stopping.signal,
    onClose: [],
  };

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      return reply.status(400).send({
        error: { code: "bad_request", message: `${where}${first?.message ?? "Invalid request."}`, details: { issues: error.issues } },
      });
    }
    // A write that met the database's lock (space being reclaimed, or another program
    // holding it) is refused with the reason, not reported as a fault.
    if (/^SQLITE_(BUSY|LOCKED)/.test(String((error as { code?: unknown }).code ?? ""))) {
      const message =
        ctx.services.database?.busy() ?? "Outpost's database is busy with other work, and nothing could be changed. Try again in a moment.";
      return reply.status(409).send({ error: { code: "conflict", message } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      const code = status === 413 ? "too_large" : status === 404 ? "not_found" : "bad_request";
      return reply.status(status).send({ error: { code, message: (error as Error).message } });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({ error: { code: "internal", message: "Something went wrong on the server. The log has the details." } });
  });

  ctx.services.settings = createSettingsService(ctx);
  await registerRequestGuard(app, ctx);
  await registerStorage(app, ctx);
  await registerSystem(app, ctx);
  for (const register of modules) await register(app, ctx);

  // ── The web app ──
  const indexFile = path.join(config.webDir, "index.html");
  if (fs.existsSync(indexFile)) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      setHeaders(reply, file) {
        if (file.endsWith(".html")) {
          reply.header("Content-Security-Policy", APP_CSP);
          reply.header("Cache-Control", "no-cache");
        } else if (path.basename(file) === "sw.js" || file.endsWith(".webmanifest")) {
          // The service worker is how a phone learns of a new build: it must never be answered from a cache.
          // The policy on the script is the one its own requests are held to.
          reply.header("Cache-Control", "no-cache");
          if (file.endsWith(".js")) reply.header("Content-Security-Policy", "default-src 'self'; connect-src 'self'");
        } else if (file.includes(`${path.sep}assets${path.sep}`)) {
          // Vite fingerprints everything under assets/.
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split("?")[0] ?? "";
    const wantsPage = request.method === "GET" && !pathname.startsWith("/api/") && !path.extname(pathname);
    if (wantsPage && fs.existsSync(indexFile)) {
      return reply
        .header("Content-Security-Policy", APP_CSP)
        .header("Cache-Control", "no-cache")
        .type("text/html")
        .send(fs.createReadStream(indexFile));
    }
    if (wantsPage) {
      return reply
        .status(503)
        .type("text/plain")
        .send("The Outpost server is running, but the web app has not been built. Run `pnpm build`, or use `pnpm dev`.");
    }
    return reply.status(404).send({ error: { code: "not_found", message: "There is nothing at that address." } });
  });

  ctx.services.settings.onChange((settings) => {
    ctx.jobs.setConcurrency("download", settings["downloads.concurrency"]);
    ctx.jobs.setConcurrency("index", settings["indexing.concurrency"]);
  });
  ctx.jobs.setConcurrency("download", ctx.services.settings.get("downloads.concurrency"));
  ctx.jobs.setConcurrency("index", ctx.services.settings.get("indexing.concurrency"));

  app.addHook("onReady", async () => ctx.jobs.start());
  // Stopping, in order. Fastify stops accepting connections and answers anything new with
  // 503; then this hook runs, before it waits for the requests in flight. Streams that
  // would never end by themselves are told to (`ctx.stopping`), jobs are stopped the way
  // they expect (a download keeps its partial file and resumes on the next start), and
  // what is still open after the limit is cut. `onClose` below runs once no request is left.
  let jobsStopped: Promise<void> | undefined;
  let cut: NodeJS.Timeout | undefined;
  app.addHook("preClose", async () => {
    stopping.abort();
    jobsStopped = ctx.jobs.close();
    cut = setTimeout(() => {
      app.log.warn("requests were still in flight when the time to stop ran out; their connections are being closed");
      app.server.closeAllConnections();
    }, DRAIN_LIMIT_MS);
  });
  app.addHook("onClose", async () => {
    clearTimeout(cut);
    await (jobsStopped ?? ctx.jobs.close());
    for (const close of ctx.onClose.reverse()) await close();
    sqlite.close();
  });

  return { app, ctx };
}
