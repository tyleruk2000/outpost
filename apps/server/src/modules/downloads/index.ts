import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { createDownloadsService } from "./service.ts";

export type * from "./types.ts";

export async function registerDownloads(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createDownloadsService(ctx);
  ctx.services.downloads = service;
  const { auth } = ctx.services;

  app.get("/api/downloads", async () => ({ downloads: service.list().map(service.toDto) }));

  // Registered before the routes with an :id so that "plan" is never taken for one.
  app.get("/api/downloads/plan", async () => service.plan());

  app.post("/api/downloads/pause-all", async (request) => {
    auth.requireAdmin(request);
    return { paused: service.pauseAll() };
  });

  app.post("/api/downloads/resume-all", async (request) => {
    auth.requireAdmin(request);
    return { resumed: service.resumeAll() };
  });

  type WithId = { Params: { id: string } };

  app.get<WithId>("/api/downloads/:id", async (request) => service.detail(request.params.id));

  app.post<WithId>("/api/downloads/:id/pause", async (request) => {
    auth.requireAdmin(request);
    return { download: service.toDto(service.pause(request.params.id)) };
  });

  app.post<WithId>("/api/downloads/:id/resume", async (request) => {
    auth.requireAdmin(request);
    return { download: service.toDto(service.resume(request.params.id)) };
  });

  app.post<WithId>("/api/downloads/:id/cancel", async (request) => {
    auth.requireAdmin(request);
    return { download: service.toDto(service.cancel(request.params.id)) };
  });

  app.post<WithId>("/api/downloads/:id/retry", async (request) => {
    auth.requireAdmin(request);
    return { download: service.toDto(await service.retry(request.params.id)) };
  });

  app.delete<WithId>("/api/downloads/:id", async (request) => {
    auth.requireAdmin(request);
    await service.remove(request.params.id);
    return { ok: true };
  });
}
