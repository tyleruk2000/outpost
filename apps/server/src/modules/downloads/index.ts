import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { createDownloadsService } from "./service.ts";

export type * from "./types.ts";

export async function registerDownloads(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createDownloadsService(ctx);
  ctx.services.downloads = service;
  const { auth } = ctx.services;

  app.get("/api/downloads", async () => ({ downloads: service.list().map(service.toDto) }));

  type WithId = { Params: { id: string } };

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
