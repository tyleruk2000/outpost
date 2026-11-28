/**
 * Road routes: planned, high-level road directions from main-roads networks kept per
 * country or region. See docs/development/road-routes.md for the API and shapes.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { countriesInBoxes } from "./countries.ts";
import { BUILD_JOB, type BuildFromFileInput, createRoadsService, isRoadsDownload, type RoadsService } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    roads: RoadsService;
  }
}

const lat = z.number().finite().min(-90).max(90);
const lon = z.number().finite().min(-180).max(180);
const pointName = z.string().trim().max(120).optional();
const pointSchema = z.union([z.object({ lat, lon, name: pointName }), z.object({ placeId: z.string().min(1).max(40), name: pointName })]);
const crossingSchema = z.union([
  z.literal("any"),
  z.literal("eurotunnel"),
  z.string().regex(/^way\/\d{1,15}$/, "Choose a crossing from the list."),
]);
export const routeRequestSchema = z.object({
  points: z.array(pointSchema).min(2, "Give a start and an end.").max(12, "Twelve points at most: a start, ten via points and an end."),
  crossing: crossingSchema.default("any"),
  units: z.enum(["km", "miles"]).default("km"),
});
const installSchema = z.union([
  z.object({
    regionId: z.string().regex(/^[a-z0-9/-]{1,80}$/),
    keepExtract: z.boolean().optional(),
    locationId: z.string().min(1).optional(),
  }),
  z.object({
    locationId: z.string().min(1),
    relPath: z.string().min(1).max(1000),
    name: z.string().trim().min(1, "Give the network a name.").max(120),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .transform((code) => code.toUpperCase())
      .nullish(),
    keepExtract: z.literal(true).optional(),
  }),
]);
const countriesSchema = z.object({
  boxes: z.array(z.tuple([lon, lat, lon, lat])).max(200),
});
const coverageSchema = z.object({
  points: z.array(z.object({ lat, lon })).min(1, "Give at least one point.").max(12, "Twelve points at most."),
});
const idParams = z.object({ id: z.string().min(1).max(40) });
const routeName = z.string().trim().min(1, "Give the route a name.").max(160);
/** A saved route is kept as it was planned: checked for its shape, not planned again. */
const summary = z.object({ distanceM: z.number().finite(), durationS: z.number().finite() }).passthrough();
const roadRouteShape = z
  .object({
    legs: z.array(z.record(z.string(), z.unknown())).max(400),
    summary,
    geometry: z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(z.tuple([lon, lat]))).max(64) }),
    snapped: z.array(z.record(z.string(), z.unknown())).max(12),
    warnings: z.array(z.string().max(1000)).max(50),
    credit: z.object({ line: z.string().max(1000) }).passthrough(),
    request: z.record(z.string(), z.unknown()),
    plannedAt: z.number().int(),
    networks: z.array(z.record(z.string(), z.unknown())).max(200),
  })
  .passthrough();
const streetLine = z
  .object({
    kind: z.string().max(20),
    text: z.string().max(2000),
    distanceM: z.number().finite(),
    durationS: z.number().finite(),
    distanceText: z.string().max(40),
    at: z.tuple([lon, lat]),
  })
  .passthrough();
const streetDirections = z
  .object({
    lines: z.array(streetLine).max(5000),
    distanceM: z.number().finite(),
    durationS: z.number().finite(),
    geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([lon, lat])).max(200_000) }),
    ferries: z
      .array(z.object({ coordinates: z.array(z.tuple([lon, lat])).max(200_000) }).passthrough())
      .max(50)
      .optional(),
  })
  .passthrough();
/** A route planned on streets: door to door, a walk or a ride. */
const streetsRouteShape = z
  .object({
    mode: z.enum(["drive-door", "walk", "cycle"]),
    spine: z.enum(["main-roads", "streets"]).nullable(),
    road: roadRouteShape.nullable(),
    start: streetDirections.nullable(),
    end: streetDirections.nullable(),
    streets: streetDirections.nullable(),
    summary,
    geometry: z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(z.tuple([lon, lat]))).max(80) }),
    warnings: z.array(z.string().max(1000)).max(50),
    credit: z.string().max(2000),
    request: z.object({ points: z.array(z.record(z.string(), z.unknown())).min(2).max(12) }).passthrough(),
    plannedAt: z.number().int(),
  })
  .passthrough();
/** A saved route is kept as it was planned: checked for its shape, not planned again. */
const savedRouteSchema = z.object({
  name: routeName,
  route: z.union([streetsRouteShape, roadRouteShape]),
});

export async function registerRoads(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createRoadsService(ctx);
  ctx.services.roads = service;
  ctx.services.downloads.registerInstaller("dataset", service.installer, isRoadsDownload);
  ctx.jobs.register<BuildFromFileInput>(BUILD_JOB, {
    queue: "import",
    run: ({ payload, signal, progress }) =>
      // Each pass is a stage of its own in the task's history, and says what it counts.
      service.runBuildJob(payload, signal, (current, total, message, unit) =>
        progress({ current, total, message, stage: message, ...(unit === undefined ? {} : { unit }) }),
      ),
  });
  ctx.onClose.push(async () => {
    service.close();
  });

  app.get("/api/roads/networks", async () => service.list());
  /** Install from Geofabrik (a download, then a build) or build from a file already in storage (a job). */
  app.post("/api/roads/networks", async (request) => {
    const body = installSchema.parse(request.body);
    if ("regionId" in body) return service.installRegion(body);
    return {
      downloadId: null,
      ...(await service.installFile({
        locationId: body.locationId,
        relPath: body.relPath,
        name: body.name,
        country: body.country ?? null,
      })),
    };
  });
  app.post("/api/roads/networks/:id/update", async (request) => service.update(idParams.parse(request.params).id));
  app.delete("/api/roads/networks/:id", async (request) => {
    await service.remove(idParams.parse(request.params).id);
    return { ok: true };
  });

  /** The countries the given boxes (the installed map regions') cover: offered first when a network is added. */
  app.post("/api/roads/countries", async (request) => ({ countries: countriesInBoxes(countriesSchema.parse(request.body).boxes) }));
  /** Which countries a route's points and the lines between them touch, and whether each has roads kept: local only. */
  app.post("/api/roads/coverage", async (request) => service.coverage(coverageSchema.parse(request.body).points));
  app.get("/api/roads/crossings", async () => ({ crossings: await service.crossings() }));
  app.post("/api/roads/route", async (request) => service.plan(routeRequestSchema.parse(request.body)));

  app.get("/api/roads/routes", async () => ({ routes: service.savedRoutes() }));
  app.post("/api/roads/routes", async (request) => {
    const body = savedRouteSchema.parse(request.body);
    return service.saveRoute(body as never);
  });
  app.get("/api/roads/routes/:id", async (request) => service.savedRoute(idParams.parse(request.params).id));
  app.patch("/api/roads/routes/:id", async (request) =>
    service.renameRoute(idParams.parse(request.params).id, z.object({ name: routeName }).parse(request.body).name),
  );
  app.delete("/api/roads/routes/:id", async (request) => {
    service.deleteRoute(idParams.parse(request.params).id);
    return { ok: true };
  });
}
