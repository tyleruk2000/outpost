import type { CatalogAddResponse, CatalogPackInstallResponse } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { type DocumentBridge, registerDocumentBridge } from "./documents-bridge.ts";
import { createCatalogService } from "./service.ts";

export type { CatalogAddResult, CatalogService, CatalogServiceOptions, DownloadResolution } from "./service.ts";

export async function registerCatalog(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // The bridge is registered further down so that its listeners keep running after the
  // one that removes a replaced version; the service only needs it once a person adds something.
  let bridge: DocumentBridge | undefined;
  const service = createCatalogService(ctx, { documents: { adopt: async (collectionId) => bridge?.adopt(collectionId) } });
  ctx.services.catalog = service;
  const { collections, downloads } = ctx.services;

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

  bridge = registerDocumentBridge(ctx);

  app.get("/api/catalog", async () => service.list());

  app.post("/api/catalog/refresh", async () => {
    return service.refresh();
  });

  app.post<{ Params: { id: string } }>("/api/catalog/entries/:id/download", async (request) => {
    const body = z.object({ locationId: z.string().min(1).max(100).optional() }).parse(request.body ?? {});
    const result = await service.download(request.params.id, body);
    return { download: downloads.toDto(result.download), replacesCollectionId: result.replacesCollectionId };
  });

  // Everything in a pack that is not here yet, or the part of it that was chosen.
  app.post<{ Params: { id: string } }>("/api/catalog/packs/:id/install", async (request): Promise<CatalogPackInstallResponse> => {
    const body = z
      .object({
        locationId: z.string().min(1).max(100).optional(),
        entryIds: z.array(z.string().min(1).max(120)).min(1).max(100).optional(),
      })
      .parse(request.body ?? {});
    return service.installPack(request.params.id, body);
  });

  // An entry that ships with Outpost: copied into the library there and then, with no network.
  app.post<{ Params: { id: string } }>("/api/catalog/entries/:id/add", async (request): Promise<CatalogAddResponse> => {
    const body = z.object({ locationId: z.string().min(1).max(100).optional() }).parse(request.body ?? {});
    const result = await service.add(request.params.id, body);
    return { collectionId: result.collection.id, documentId: result.documentId, replacedCollectionId: result.replacedCollectionId };
  });
}
