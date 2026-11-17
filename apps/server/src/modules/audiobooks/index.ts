/**
 * HTTP routes for audiobooks. The files themselves are served by the document library
 * (`GET /api/documents/:id/file`, with byte ranges); these routes add the book around
 * them, take new ones in, and list the LibriVox shelf for Explore.
 */
import type { AudiobookAddResponse, AudiobookListResponse, AudiobookResponse, LibrivoxShelfResponse } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { toJobDto } from "../../core/jobs.ts";
import { registerMultipart } from "../../core/multipart.ts";
import { receiveAudiobook } from "./receive.ts";
import { createAudiobooksService } from "./service.ts";

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(["added", "title"]).default("added"),
});

export async function registerAudiobooks(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createAudiobooksService(ctx);
  ctx.services.audiobooks = service;
  await registerMultipart(app);

  app.get("/api/audiobooks", async (request): Promise<AudiobookListResponse> => {
    return { audiobooks: service.list(listQuery.parse(request.query)) };
  });

  /** What Explore offers from LibriVox: links to follow in the browser, never fetched by Outpost. */
  app.get("/api/audiobooks/librivox", async (): Promise<LibrivoxShelfResponse> => service.shelf());

  app.get<{ Params: { id: string } }>("/api/audiobooks/:id", async (request): Promise<AudiobookResponse> => {
    return { audiobook: await service.get(request.params.id) };
  });

  /**
   * Adds an audiobook: one zip of its chapters, or its audio files. Optional fields
   * `title`, `librivoxId` (when it is a book from the LibriVox shelf) and `locationId`.
   * The files are received here; unpacking and filing them is a job, named in the answer.
   */
  app.post("/api/audiobooks", async (request, reply): Promise<AudiobookAddResponse> => {
    const received = await receiveAudiobook(request, ctx);
    const job = service.add(received);
    reply.status(202);
    return { job: toJobDto(job) };
  });
}
