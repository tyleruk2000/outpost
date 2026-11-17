import { DOWNLOAD_HISTORY_PAGE, type DownloadHistoryResponse, type DownloadsResponse } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createDownloadsService } from "./service.ts";

export type * from "./types.ts";

const historyQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(DOWNLOAD_HISTORY_PAGE),
});

export async function registerDownloads(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createDownloadsService(ctx);
  ctx.services.downloads = service;

  // Everything not finished, and the newest page of history: the list grows by a row with
  // every download ever made, so older history is asked for a page at a time.
  app.get("/api/downloads", async (): Promise<DownloadsResponse> => {
    const history = service.history(0, DOWNLOAD_HISTORY_PAGE);
    return {
      downloads: [...service.unfinished(), ...history.rows].sort((a, b) => b.createdAt - a.createdAt).map(service.toDto),
      historyTotal: history.total,
    };
  });

  app.get("/api/downloads/history", async (request): Promise<DownloadHistoryResponse> => {
    const { offset, limit } = historyQuery.parse(request.query);
    const history = service.history(offset, limit);
    return { downloads: history.rows.map(service.toDto), total: history.total, offset };
  });

  // Registered before the routes with an :id so that "plan" is never taken for one.
  app.get("/api/downloads/plan", async () => service.plan());

  app.post("/api/downloads/pause-all", async () => {
    return { paused: service.pauseAll() };
  });

  app.post("/api/downloads/resume-all", async () => {
    return { resumed: service.resumeAll() };
  });

  type WithId = { Params: { id: string } };

  app.get<WithId>("/api/downloads/:id", async (request) => service.detail(request.params.id));

  app.post<WithId>("/api/downloads/:id/pause", async (request) => {
    return { download: service.toDto(service.pause(request.params.id)) };
  });

  app.post<WithId>("/api/downloads/:id/resume", async (request) => {
    return { download: service.toDto(service.resume(request.params.id)) };
  });

  app.post<WithId>("/api/downloads/:id/cancel", async (request) => {
    return { download: service.toDto(service.cancel(request.params.id)) };
  });

  app.post<WithId>("/api/downloads/:id/retry", async (request) => {
    return { download: service.toDto(await service.retry(request.params.id)) };
  });

  app.delete<WithId>("/api/downloads/:id", async (request) => {
    await service.remove(request.params.id);
    return { ok: true };
  });
}
