import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createSearchService } from "./service.ts";

const query = z.object({
  q: z.string().max(500).default(""),
  kinds: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(",")
        .map((kind) => kind.trim())
        .filter(Boolean),
    ),
  tag: z.string().max(100).optional(),
  mode: z.enum(["keyword", "semantic", "hybrid"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerSearch(app: FastifyInstance, ctx: AppContext): Promise<void> {
  ctx.services.search = createSearchService(ctx);

  app.get("/api/search", async (request) => {
    const params = query.parse(request.query);
    const controller = new AbortController();
    request.raw.on("close", () => controller.abort());
    return ctx.services.search.search({ ...params, signal: controller.signal });
  });

  app.get("/api/search/stats", async () => ctx.services.search.stats());
}
