import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { toJobDto } from "../../core/jobs.ts";
import { createCollectionsService } from "./service.ts";

export type {
  CollectionFilter,
  CollectionPatch,
  CollectionRow,
  CollectionsService,
  CreateCollection,
  MovedFrom,
} from "./service.ts";

const kindSchema = z.enum(["zim", "map", "terrain", "places", "file", "model"]);

const deleteMessage =
  "Say whether the file should be deleted too: deleteFiles=true deletes it, deleteFiles=false removes only Outpost's record and keeps the file.";

/**
 * Deleting must state what happens to the file; there is no default, so that a
 * forgotten parameter can never delete a multi-gigabyte archive (or silently keep one).
 */
function readDeleteFiles(body: unknown, query: unknown): boolean {
  const fromBody = z.object({ deleteFiles: z.boolean() }).safeParse(body);
  if (fromBody.success) return fromBody.data.deleteFiles;
  const fromQuery = z.object({ deleteFiles: z.enum(["true", "false"]) }).safeParse(query);
  if (fromQuery.success) return fromQuery.data.deleteFiles === "true";
  throw badRequest(deleteMessage);
}

export async function registerCollections(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createCollectionsService(ctx);
  ctx.services.collections = service;

  // Keep the search index in step with the table, e.g. after a database restore.
  service.reindex();

  let closed = false;
  const reconcile = () => {
    if (closed) return;
    service.reconcile().catch((error) => {
      if (!closed) ctx.log.error({ err: error }, "checking collections against storage failed");
    });
  };
  await service.reconcile();
  const unsubscribe = ctx.events.subscribe((event) => {
    if (event.type === "storage.changed") reconcile();
  });
  ctx.onClose.push(() => {
    closed = true;
    unsubscribe();
  });

  app.get<{ Querystring: { kind?: string } }>("/api/collections", async (request) => {
    const kind = request.query.kind ? kindSchema.parse(request.query.kind) : undefined;
    return { collections: service.list({ kind }).map(service.toDto) };
  });

  app.get<{ Params: { id: string } }>("/api/collections/:id", async (request) => {
    const row = service.get(request.params.id);
    if (!row) throw notFound("Collection");
    return { collection: service.toDto(row) };
  });

  app.delete<{ Params: { id: string } }>("/api/collections/:id", async (request) => {
    const deleteFiles = readDeleteFiles(request.body, request.query);
    await service.remove(request.params.id, { deleteFiles });
    return { ok: true, deletedFiles: deleteFiles };
  });

  app.post<{ Params: { id: string } }>("/api/collections/:id/verify", async (request) => {
    return { job: toJobDto(service.verify(request.params.id)) };
  });

  app.post<{ Params: { id: string } }>("/api/collections/:id/move", async (request) => {
    const body = z.object({ locationId: z.string().min(1).max(100) }).parse(request.body);
    return { job: toJobDto(await service.move(request.params.id, body.locationId)) };
  });
}
