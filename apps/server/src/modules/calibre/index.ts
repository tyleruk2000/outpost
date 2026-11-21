/**
 * Bringing in a Calibre library from a folder on a storage location.
 *
 *   POST   /api/calibre                   read the library in { locationId, relPath }
 *   GET    /api/calibre                   recent imports
 *   GET    /api/calibre/:id               one import: its plan, and later its report
 *   POST   /api/calibre/:id/commit        bring the books in { mode, locationId? }
 *   POST   /api/calibre/:id/cancel        stop reading or importing
 *   DELETE /api/calibre/:id               give up a plan that was not carried out
 *   GET    /api/documents/:id/book        authors, series and cover of a book from Calibre
 *   GET    /api/documents/:id/cover       the kept cover picture
 *
 * The steps are in `service.ts`, the walk of the folder in `scan.ts`, the package file
 * in `opf.ts`.
 */
import fs from "node:fs";
import type { BookDetailsResponse, CalibreImportListResponse, CalibreImportResponse } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { createCalibreService } from "./service.ts";

export type { CalibreService } from "./service.ts";

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function registerCalibre(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createCalibreService(ctx);
  ctx.services.calibre = service;

  app.post("/api/calibre", async (request): Promise<CalibreImportResponse> => {
    const body = z.object({ locationId: z.string().min(1).max(64), relPath: z.string().max(1000).default("") }).parse(request.body ?? {});
    return { import: await service.start(body) };
  });

  app.get("/api/calibre", async (request): Promise<CalibreImportListResponse> => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    return { imports: service.list(query.limit) };
  });

  app.get("/api/calibre/:id", async (request): Promise<CalibreImportResponse> => {
    return { import: service.get(idParams.parse(request.params).id) };
  });

  app.post("/api/calibre/:id/commit", async (request): Promise<CalibreImportResponse> => {
    const body = z
      .object({ mode: z.enum(["copy", "in-place"]), locationId: z.string().min(1).max(64).optional() })
      .parse(request.body ?? {});
    return { import: await service.commit(idParams.parse(request.params).id, body) };
  });

  app.post("/api/calibre/:id/cancel", async (request): Promise<CalibreImportResponse> => {
    return { import: service.cancel(idParams.parse(request.params).id) };
  });

  app.delete("/api/calibre/:id", async (request): Promise<CalibreImportResponse> => {
    return { import: service.discard(idParams.parse(request.params).id) };
  });

  app.get("/api/documents/:id/book", async (request): Promise<BookDetailsResponse> => {
    return { details: service.details(idParams.parse(request.params).id) };
  });

  app.get("/api/documents/:id/cover", async (request, reply) => {
    const cover = service.cover(idParams.parse(request.params).id);
    if (!cover) throw notFound("Cover");
    return reply
      .header("Content-Type", cover.mime)
      .header("Cache-Control", "private, max-age=86400")
      .header("X-Content-Type-Options", "nosniff")
      .send(fs.createReadStream(cover.path));
  });
}
