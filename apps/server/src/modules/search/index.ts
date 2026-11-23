import type { ReferenceSearchEvent, SearchSuggestion as ReferenceSearchInstead } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createSearchService } from "./service.ts";

/** "Search only for what was typed": `exact=1`. */
const exact = z
  .enum(["0", "1", "true", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

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
  reference: z.enum(["include", "later"]).default("include"),
  exact,
});

export async function registerSearch(app: FastifyInstance, ctx: AppContext): Promise<void> {
  ctx.services.search = createSearchService(ctx);

  app.get("/api/search", async (request, reply) => {
    const params = query.parse(request.query);
    // The person typed again or left: nothing more of this search is wanted.
    const controller = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableFinished) controller.abort();
    });
    return ctx.services.search.search({ ...params, signal: controller.signal });
  });

  /**
   * The second part of a search asked with `reference=later`: what reference collections
   * hold, sent a line of JSON at a time (`ReferenceSearchEvent`), one line for each
   * collection as it answers. Closing the connection is how the server knows nobody is
   * waiting, and it stops asking collections that have not been asked yet.
   */
  app.get("/api/search/reference", async (request, reply) => {
    const {
      q,
      exact: asTyped,
      scope,
    } = z.object({ q: z.string().max(500).default(""), exact, scope: z.enum(["routed", "all"]).default("routed") }).parse(request.query);
    const started = performance.now();
    const raw = reply.raw;
    const controller = new AbortController();
    raw.on("close", () => {
      if (!raw.writableFinished) controller.abort();
    });
    reply.hijack();
    raw.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Tells a reverse proxy in front of Outpost not to hold the lines back until the answer is whole.
      "X-Accel-Buffering": "no",
    });
    const send = (event: ReferenceSearchEvent) => {
      if (!raw.destroyed && !raw.writableEnded) raw.write(`${JSON.stringify(event)}\n`);
    };
    try {
      let instead: ReferenceSearchInstead | undefined;
      const outcome = await ctx.services.search.searchReference({
        q,
        exact: asTyped,
        scope,
        signal: controller.signal,
        onInstead: (suggestion) => {
          instead = suggestion;
        },
        onStart: (collections, more) =>
          send({ type: "start", collections, more: more ?? 0, ranked: true, ...(instead ? { instead } : {}) }),
        onWiden: (collections) => send({ type: "widen", collections }),
        onPart: (part) => send({ type: "collection", ...part, done: part.done !== false }),
      });
      send({
        type: "end",
        searched: outcome.searched,
        missing: outcome.missing,
        message: outcome.message,
        more: outcome.more ?? 0,
        tookMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      request.log.error({ err: error }, "reference search failed");
      send({
        type: "end",
        searched: 0,
        missing: [],
        message: "Reference collections could not be searched just now, so their articles are missing from these results.",
        tookMs: Math.round(performance.now() - started),
      });
    }
    raw.end();
    return reply;
  });

  app.get("/api/search/stats", async () => ctx.services.search.stats());
}
