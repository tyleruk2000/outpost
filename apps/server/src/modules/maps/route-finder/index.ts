/**
 * Routes for finding a known route and adding it to the map. See `service.ts` for what
 * happens and `sources.ts` for where a search may be sent.
 *
 * Searching and previewing are `POST`: each makes Outpost ask a server on the internet,
 * and only a request from Outpost's own pages may cause that (see `core/guard.ts`).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppContext } from "../../../core/context.ts";
import type { HttpClient } from "../../../core/http.ts";
import { VERSION } from "../../system/index.ts";
import type { AnnotationsService } from "../annotations.ts";
import type { ElevationSampler } from "../elevation.ts";
import { createOverpassClient } from "./overpass.ts";
import { createRouteFinder, type RouteFinderService, routeAddSchema, routePreviewSchema, routeSearchSchema } from "./service.ts";
import { loadRouteSources } from "./sources.ts";

/**
 * How Outpost names itself to a route source. The operators of the public Overpass
 * servers ask for a client name that identifies the application and a way to find the
 * project. Nothing about the person, their library or this installation is sent.
 */
export const ROUTE_FINDER_USER_AGENT = `Outpost/${VERSION} (self-hosted offline library; +https://github.com/tyleruk2000/outpost)`;

/** Fires when the browser that asked has gone away, so the question to the source is dropped too. */
function goneSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}

export function registerRouteFinder(
  app: FastifyInstance,
  ctx: AppContext,
  deps: { client: HttpClient; annotations: AnnotationsService; elevation: ElevationSampler },
): RouteFinderService {
  const loaded = loadRouteSources(ctx.config);
  for (const problem of loaded.problems) ctx.log.warn({ problem }, "route sources");
  const finder = createRouteFinder({
    loaded,
    overpass: createOverpassClient(deps.client),
    annotations: deps.annotations,
    elevation: deps.elevation,
    userAgent: ROUTE_FINDER_USER_AGENT,
  });

  app.get("/api/maps/route-sources", async () => finder.sources());

  app.post("/api/maps/route-search", async (request, reply) => {
    return finder.search(routeSearchSchema.parse(request.body), goneSignal(reply));
  });

  app.post("/api/maps/route-search/preview", async (request, reply) => {
    return finder.preview(routePreviewSchema.parse(request.body), goneSignal(reply));
  });

  app.post("/api/maps/route-search/add", async (request) => {
    return finder.add(routeAddSchema.parse(request.body));
  });

  app.post<{ Params: { id: string } }>("/api/maps/tracks/:id/heights", async (request) => {
    return finder.fillHeights(request.params.id);
  });

  return finder;
}
