/**
 * Bringing changes back from a portable drive.
 *
 *   GET    /api/merge/inspect?path=    is this folder an Outpost drive, and what does it hold
 *   POST   /api/merge                  copy the drive's database and work out what changed
 *   GET    /api/merge                  earlier merges, newest first
 *   GET    /api/merge/:id              one merge: its preview, and later its record
 *   GET    /api/merge/:id/compare?key= both versions of one thing, as text
 *   POST   /api/merge/:id/commit       carry it out with the person's choices
 *   POST   /api/merge/:id/cancel       stop reading or merging
 *   POST   /api/merge/:id/undo         put back what the merge changed
 *   DELETE /api/merge/:id              give up a preview that was not carried out
 *
 * Nothing is ever written to the drive. The rules are in `service.ts` (the steps),
 * `drive.ts` (reading a drive safely), `diff.ts` (what changed where) and `apply.ts`
 * (carrying it out, and undoing it).
 */
import type { MergeListResponse, MergeResponse } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createMergeService } from "./service.ts";

export type { MergeService } from "./service.ts";

const idParams = z.object({ id: z.string().min(1).max(64) });
const choice = z.enum(["apply", "skip", "both", "home", "drive"]);

export async function registerMerge(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createMergeService(ctx);
  ctx.services.merge = service;

  app.get("/api/merge/inspect", async (request) => {
    const query = z.object({ path: z.string().min(1).max(1000) }).parse(request.query);
    return service.inspect(query.path);
  });

  app.post("/api/merge", async (request): Promise<MergeResponse> => {
    const body = z
      .object({
        path: z.string().min(1).max(1000),
        source: z
          .string()
          .regex(/^data(-before-update-[0-9-]{19})?$/)
          .optional(),
      })
      .parse(request.body);
    return { merge: await service.start(body) };
  });

  app.get("/api/merge", async (request): Promise<MergeListResponse> => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
    return { merges: service.list(query.limit) };
  });

  app.get("/api/merge/:id", async (request): Promise<MergeResponse> => {
    return { merge: service.get(idParams.parse(request.params).id) };
  });

  app.get("/api/merge/:id/compare", async (request) => {
    const query = z.object({ key: z.string().min(1).max(100) }).parse(request.query);
    return service.compare(idParams.parse(request.params).id, query.key);
  });

  app.post("/api/merge/:id/commit", async (request): Promise<MergeResponse> => {
    const body = z
      .object({ choices: z.record(z.string().max(100), choice).default({}), deletionsConfirmed: z.boolean().optional() })
      .parse(request.body ?? {});
    return { merge: service.commit(idParams.parse(request.params).id, body) };
  });

  app.post("/api/merge/:id/cancel", async (request): Promise<MergeResponse> => {
    return { merge: service.cancel(idParams.parse(request.params).id) };
  });

  app.post("/api/merge/:id/undo", async (request): Promise<MergeResponse> => {
    const body = z.object({ removeDocuments: z.boolean().default(false) }).parse(request.body ?? {});
    return { merge: await service.undo(idParams.parse(request.params).id, body) };
  });

  app.delete("/api/merge/:id", async (request): Promise<MergeResponse> => {
    return { merge: await service.discard(idParams.parse(request.params).id) };
  });
}
