import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { registerDocumentBridge } from "./documents-bridge.ts";
import { createCatalogService } from "./service.ts";

export type { CatalogService, CatalogServiceOptions, DownloadResolution } from "./service.ts";

export async function registerCatalog(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createCatalogService(ctx);
  ctx.services.catalog = service;
  const { auth, collections, downloads } = ctx.services;

  // Collections report "update available" without knowing how the catalogue works.
  collections.addUpdateCheck(service.hasUpdate);

  /**
   * Updating an installed entry downloads the new version as a new collection. Once
   * that is verified and installed, the version it replaces is removed together with
   * its file. This is the one place Outpost deletes a file without being asked for that
   * file by name: the person asked for the update, the download response said which
   * collection it replaces (`replacesCollectionId`), and keeping both would silently
   * double the space used by, say, a 100 GB encyclopedia.
   */
  downloads.onCompleted(async (download) => {
    const replaces = download.meta.replacesCollectionId;
    if (typeof replaces !== "string" || !download.catalogEntryId || !download.collectionId) return;
    const old = collections.get(replaces);
    if (!old || old.id === download.collectionId || old.catalogEntryId !== download.catalogEntryId) return;
    try {
      await collections.remove(old.id, { deleteFiles: true });
    } catch (error) {
      // For instance its drive is unplugged. Both versions stay; the person can remove the old one.
      ctx.log.warn({ err: error, collection: old.id }, "the replaced version could not be removed");
    }
  });

  registerDocumentBridge(ctx);

  app.get("/api/catalog", async () => service.list());

  app.post("/api/catalog/refresh", async (request) => {
    auth.requireAdmin(request);
    return service.refresh();
  });

  app.post<{ Params: { id: string } }>("/api/catalog/entries/:id/download", async (request) => {
    auth.requireAdmin(request);
    const body = z.object({ locationId: z.string().min(1).max(100).optional() }).parse(request.body ?? {});
    const result = await service.download(request.params.id, body);
    return { download: downloads.toDto(result.download), replacesCollectionId: result.replacesCollectionId };
  });
}
