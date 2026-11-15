/**
 * HTTP routes for books. A book is a collection, so its contents are read under the
 * collection's address; everything else about it (removing, moving, checking) is the
 * collection's own.
 */
import type { BookContentsResponse } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { createBooksService } from "./service.ts";

export type { BooksService, CreateBook, NewChapter } from "./service.ts";

export async function registerBooks(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createBooksService(ctx);
  ctx.services.books = service;

  app.get<{ Params: { id: string } }>("/api/collections/:id/chapters", async (request): Promise<BookContentsResponse> => {
    return service.contents(request.params.id);
  });
}
