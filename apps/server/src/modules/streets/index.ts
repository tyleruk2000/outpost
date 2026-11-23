/**
 * Streets for routes: the optional streets service (Valhalla) for door-to-door drives,
 * walking and cycling routes and reachable areas, beside Outpost's own main-roads router.
 * See docs/development/street-routes.md for the API and shapes.
 *
 * Without the service (most installations) every route here says so plainly, except a
 * drive's reachable areas, which come from Outpost's own main roads instead.
 */
import type {
  MapDataItem,
  RoadDistanceUnit,
  RoadRoutePoint,
  StreetsReachRequest,
  StreetsReachResult,
  StreetsRouteRequest,
  StreetsRouteResult,
  StreetsStatusResponse,
  StreetsTileset,
} from "@outpost/shared";
import { STREETS_REACH_MINUTES } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { markers } from "../../db/schema.ts";
import { countryOf } from "../layers/countries.ts";
import { OSM_CREDIT } from "../maps/route-finder/sources.ts";
import { countryLookup, roadCredit } from "../roads/plan.ts";
import { createStreetsClient, NO_STREETS_NEAR, type StreetsClient, ValhallaRefusal } from "./client.ts";
import { createStreetsConnection, type StreetsConnection } from "./connection.ts";
import { doorToDoor, type Point } from "./door-to-door.ts";
import { mainRoadsReach } from "./main-roads-reach.ts";
import { streetDirections } from "./narrative.ts";
import { FREE_FLOWING, featuresFromMainRoads, MAIN_ROADS_NOTE, REACH_SETTINGS, streetsReach } from "./reach.ts";
import { createStreetsTiles, STREETS_BUILD_JOB, type StreetsBuildPayload, type StreetsTiles } from "./tiles.ts";

export interface StreetsService {
  connection: StreetsConnection;
  tiles: StreetsTiles;
  status(): Promise<StreetsStatusResponse>;
  route(request: StreetsRouteRequest, signal?: AbortSignal): Promise<StreetsRouteResult>;
  reach(request: StreetsReachRequest, signal?: AbortSignal): Promise<StreetsReachResult>;
  /** The "Streets for routes" rows of Map data, per country; none when the add-on is not installed. */
  mapDataItems(): Array<{ country: string | null; item: MapDataItem }>;
}

declare module "../../core/context.ts" {
  interface Services {
    streets: StreetsService;
  }
}

const lat = z.number().finite().min(-90).max(90);
const lon = z.number().finite().min(-180).max(180);
const pointName = z.string().trim().max(120).optional();
const pointSchema = z.union([z.object({ lat, lon, name: pointName }), z.object({ placeId: z.string().min(1).max(40), name: pointName })]);
const regionId = z.string().regex(/^[a-z0-9/-]{1,80}$/);

export const streetsRouteSchema = z.object({
  points: z.array(pointSchema).min(2, "Give a start and an end.").max(12, "Twelve points at most: a start, ten via points and an end."),
  mode: z.enum(["drive-door", "walk", "cycle"]),
  units: z.enum(["km", "miles"]).default("km"),
  crossing: z
    .union([z.literal("any"), z.literal("eurotunnel"), z.string().regex(/^way\/\d{1,15}$/, "Choose a crossing from the list.")])
    .default("any"),
});
export const streetsReachSchema = z.object({
  point: pointSchema,
  mode: z.enum(["drive", "walk", "cycle"]),
  minutes: z
    .array(
      z
        .number()
        .int()
        .refine((m) => (STREETS_REACH_MINUTES as readonly number[]).includes(m), "Choose 15, 30 or 60 minutes."),
    )
    .min(1, "Choose 15, 30 or 60 minutes.")
    .max(3)
    .transform((m) => [...new Set(m)].sort((a, b) => a - b)),
  source: z.enum(["auto", "main-roads"]).default("auto"),
});
const buildSchema = z.union([
  z
    .object({
      regions: z.array(regionId).min(1, "Choose at least one country file.").max(12),
      workLocationId: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      import: z.object({
        locationId: z.string().min(1).max(100),
        relPath: z.string().min(1).max(1000),
        name: z.string().trim().max(120).optional(),
      }),
    })
    .strict(),
]);
const estimateSchema = z.object({ regions: z.array(regionId).min(1, "Choose at least one country file.").max(12) });

const countryName = (code: string) => countryOf(code)?.name ?? code;
const VALHALLA_CREDIT = "routed by Valhalla (MIT licence)";

function streetsCredit(tileset: StreetsTileset | null): string {
  const when = tileset?.dataDate ? ` as of ${tileset.dataDate}` : "";
  return `Streets ${OSM_CREDIT.attribution}, ${OSM_CREDIT.license}${when}, from Geofabrik's extracts; ${VALHALLA_CREDIT}.`;
}

export function createStreetsService(ctx: AppContext): StreetsService {
  const connection = createStreetsConnection({ url: ctx.config.valhalla.url, dir: ctx.config.valhalla.dir });
  const client: StreetsClient = createStreetsClient(() => connection.baseUrl);
  const tiles = createStreetsTiles(ctx, connection);

  function resolvePoints(points: RoadRoutePoint[]): Point[] {
    return points.map((point, index) => {
      if ("placeId" in point) {
        const marker = ctx.db.select().from(markers).where(eq(markers.id, point.placeId)).get();
        if (!marker) throw badRequest(`Point ${index + 1} is a saved place that is no longer there.`);
        return { lat: marker.lat, lon: marker.lon, name: point.name ?? marker.name };
      }
      return { lat: point.lat, lon: point.lon, name: point.name?.trim() || null };
    });
  }

  /** Streets must be ready to answer; otherwise what to do, in plain words. */
  async function assertReady(what: string): Promise<StreetsTileset> {
    const { state, message } = await connection.describe();
    if (state === "ready") return tiles.tileset()!;
    if (state === "not-installed")
      throw new AppError(
        "unsupported",
        `${what} needs streets for routes, an optional add-on this installation does not have. ${message ?? ""}`.trim(),
      );
    throw new AppError(state === "not-answering" ? "offline" : "bad_request", message ?? "Streets for routes are not ready.");
  }

  /** "Streets are not installed for France": a point in a country the streets do not cover. */
  function assertCovered(points: Point[], tileset: StreetsTileset) {
    if (tileset.countries.length === 0) return;
    for (const point of points) {
      const code = countryLookup(point.lat, point.lon, null);
      if (code && !tileset.countries.includes(code))
        throw badRequest(`Streets are not installed for ${countryName(code)}. Build streets with its country file from Map data.`);
    }
  }

  function outsideWords(point: Point, tileset: StreetsTileset): string {
    const code = countryLookup(point.lat, point.lon, null);
    if (code && tileset.countries.length > 0 && !tileset.countries.includes(code))
      return `Streets are not installed for ${countryName(code)}.`;
    return `There are no streets near ${point.name ? `“${point.name}”` : "that point"} in the streets built (${tileset.name}).`;
  }

  /** Valhalla's refusals in words. */
  function refusal(error: unknown, points: Point[], tileset: StreetsTileset): never {
    if (error instanceof ValhallaRefusal) {
      if (error.code !== null && NO_STREETS_NEAR.has(error.code)) {
        const outside = points.find(
          (p) => countryLookup(p.lat, p.lon, null) && !tileset.countries.includes(countryLookup(p.lat, p.lon, null)!),
        );
        throw badRequest(
          outside || tileset.countries.length === 0
            ? outsideWords(outside ?? points[0]!, tileset)
            : `One of the points is away from every street in the streets built (${tileset.name}). Move it onto a street or path.`,
        );
      }
      if (error.code === 442 || error.code === 443)
        throw badRequest("No way joins these points on the streets built (a river, a motorway on foot, or a one-way street between them).");
      if (error.code === 154 || error.code === 155)
        throw badRequest("That is too far for this way of travelling. Choose points nearer together, or drive.");
      throw new AppError("upstream", `The streets service could not plan this: ${error.message}`);
    }
    throw error;
  }

  async function status(): Promise<StreetsStatusResponse> {
    const { state, message } = await connection.describe();
    const installed = state !== "not-installed";
    const ready = state === "ready";
    const roadsInstalled = (ctx.services.roads?.list().networks.length ?? 0) > 0;
    return {
      state,
      installed,
      message,
      tileset: installed ? tiles.tileset() : null,
      build: installed ? tiles.buildState() : null,
      modes: {
        driveDoor: ready,
        walk: ready,
        cycle: ready,
        reach: { drive: ready ? "streets" : roadsInstalled ? "main-roads" : null, walk: ready, cycle: ready },
      },
      countryFiles: installed ? tiles.countryFiles() : [],
      reachMinutes: STREETS_REACH_MINUTES,
    };
  }

  async function route(request: StreetsRouteRequest, signal?: AbortSignal): Promise<StreetsRouteResult> {
    const words = request.mode === "walk" ? "A walking route" : request.mode === "cycle" ? "A cycling route" : "A door-to-door route";
    const tileset = await assertReady(words);
    const points = resolvePoints(request.points);
    const units: RoadDistanceUnit = request.units ?? "km";
    const plannedAt = Date.now();
    const lines = (coordinates: Array<[number, number]>) => (coordinates.length >= 2 ? [coordinates] : []);

    if (request.mode === "walk" || request.mode === "cycle") {
      assertCovered(points, tileset);
      const costing = request.mode === "walk" ? "pedestrian" : "bicycle";
      let reply: Awaited<ReturnType<StreetsClient["route"]>>;
      try {
        reply = await client.route({ points, costing, ...(signal ? { signal } : {}) });
      } catch (error) {
        refusal(error, points, tileset);
      }
      const streets = streetDirections(reply, { units, costing, viaNames: points.slice(1, -1).map((p) => p.name) });
      return {
        mode: request.mode,
        spine: null,
        road: null,
        start: null,
        end: null,
        streets,
        summary: { distanceM: streets.distanceM, durationS: streets.durationS },
        geometry: { type: "MultiLineString", coordinates: lines(streets.geometry.coordinates) },
        warnings: [
          request.mode === "walk"
            ? "The time is at a steady walking pace with no allowance for hills or stops."
            : "The time is at a steady cycling pace with no allowance for hills or stops.",
        ],
        credit: streetsCredit(tileset),
        request,
        plannedAt,
      };
    }

    // Door to door: the start and the end must be in the streets; via points are the road route's.
    assertCovered([points[0]!], tileset);
    const parts = await doorToDoor({
      points,
      units,
      crossing: request.crossing ?? "any",
      client,
      plan: () => ctx.services.roads.plan({ points: request.points, crossing: request.crossing ?? "any", units }),
      endProblem: (error, point) => {
        if (error instanceof ValhallaRefusal && error.code !== null && NO_STREETS_NEAR.has(error.code)) return outsideWords(point, tileset);
        if (error instanceof ValhallaRefusal) return `The streets service could not plan this end: ${error.message}.`;
        throw error;
      },
      ...(signal ? { signal } : {}),
    }).catch((error) => refusal(error, points, tileset));
    const geometry: Array<Array<[number, number]>> = [
      ...lines(parts.start?.geometry.coordinates ?? []),
      ...(parts.road?.geometry.coordinates ?? []),
      ...lines(parts.end?.geometry.coordinates ?? []),
      ...lines(parts.streets?.geometry.coordinates ?? []),
    ];
    const distanceM =
      (parts.road?.summary.distanceM ?? 0) + (parts.start?.distanceM ?? 0) + (parts.end?.distanceM ?? 0) + (parts.streets?.distanceM ?? 0);
    const durationS =
      (parts.road?.summary.durationS ?? 0) + (parts.start?.durationS ?? 0) + (parts.end?.durationS ?? 0) + (parts.streets?.durationS ?? 0);
    return {
      mode: "drive-door",
      spine: parts.spine,
      road: parts.road,
      start: parts.start,
      end: parts.end,
      streets: parts.streets,
      summary: { distanceM, durationS },
      geometry: { type: "MultiLineString", coordinates: geometry },
      warnings: parts.warnings,
      credit: parts.road ? `${parts.road.credit.line} ${streetsCredit(tileset)}` : streetsCredit(tileset),
      request,
      plannedAt,
    };
  }

  async function reach(request: StreetsReachRequest, signal?: AbortSignal): Promise<StreetsReachResult> {
    const [point] = resolvePoints([request.point]);
    const minutes = [...new Set(request.minutes)].sort((a, b) => a - b);
    const ready = (await connection.describe()).state === "ready";
    const where = { lat: point!.lat, lon: point!.lon, name: point!.name };
    if (request.source !== "main-roads" && ready) {
      const tileset = tiles.tileset()!;
      assertCovered([point!], tileset);
      let features: Awaited<ReturnType<typeof streetsReach>>;
      try {
        features = await streetsReach(client, { point: point!, mode: request.mode, minutes, ...(signal ? { signal } : {}) });
      } catch (error) {
        refusal(error, [point!], tileset);
      }
      const settings = REACH_SETTINGS[request.mode];
      return {
        mode: request.mode,
        source: "streets",
        label: "Streets",
        note: FREE_FLOWING,
        point: where,
        areas: { type: "FeatureCollection", features },
        settings: { denoise: settings.denoise, generalizeM: settings.generalizeM, gridM: null },
        credit: streetsCredit(tileset),
        madeAt: Date.now(),
      };
    }
    if (request.mode !== "drive")
      throw new AppError(
        ready ? "bad_request" : "unsupported",
        `Areas reachable ${request.mode === "walk" ? "on foot" : "by bicycle"} need streets for routes${connection.installed() ? ": build them from a kept country file in Map data." : ", an optional add-on this installation does not have."} The walking reach on the map works over open ground without them.`,
      );
    const graph = await ctx.services.roads.loadGraph();
    if (graph.networks.length === 0)
      throw badRequest("No road network is installed. Install the country you are in from Road networks to see how far a drive reaches.");
    const found = mainRoadsReach(graph, point!, minutes);
    if (!found) {
      const code = countryLookup(point!.lat, point!.lon, null);
      const installed = new Set(graph.networks.map((n) => n.country));
      throw badRequest(
        code && !installed.has(code)
          ? `No road network is installed for ${countryName(code)}. Install it from Road networks.`
          : "There is no main road within 40 km of that point in the networks installed.",
      );
    }
    const note =
      found.join.distanceM > 5_000
        ? `${MAIN_ROADS_NOTE} The nearest main road is ${Math.round(found.join.distanceM / 1000)} km away.`
        : MAIN_ROADS_NOTE;
    return {
      mode: "drive",
      source: "main-roads",
      label: "Main roads only",
      note,
      point: where,
      areas: { type: "FeatureCollection", features: featuresFromMainRoads(found) },
      settings: { denoise: null, generalizeM: null, gridM: found.gridM },
      credit: roadCredit(graph.networks).line,
      madeAt: Date.now(),
    };
  }

  function mapDataItems(): Array<{ country: string | null; item: MapDataItem }> {
    if (!connection.installed()) return [];
    const base = (key: string, title: string): MapDataItem => ({
      key,
      kind: "streets",
      title,
      state: "ready",
      sizeBytes: null,
      locationId: null,
      locationName: null,
      dataDate: null,
      progress: null,
      reason: null,
      ahead: null,
      count: null,
      layers: [],
      regionId: null,
      collectionId: null,
      networkId: null,
      packId: null,
      downloadId: null,
      taskId: null,
    });
    const out: Array<{ country: string | null; item: MapDataItem }> = [];
    const tileset = tiles.tileset();
    if (tileset) {
      const said = connection.status();
      const countries = tileset.countries.length > 0 ? tileset.countries : [null];
      for (const country of countries) {
        const regions = tileset.regions.filter((r) => (r.country ?? null) === country);
        out.push({
          country,
          item: {
            ...base("streets:current", `Streets for routes: ${tileset.name}`),
            state: said?.state === "building" ? "processing" : "ready",
            sizeBytes: tileset.sizeBytes,
            locationName: "Streets for routes",
            dataDate:
              regions
                .map((r) => r.dataDate)
                .filter(Boolean)
                .sort()
                .at(-1) ?? tileset.dataDate,
            regionId: regions[0]?.regionId ?? null,
          },
        });
      }
    }
    const build = tiles.buildState();
    if (build && build.state !== "failed" && build.jobId) {
      const job = ctx.jobs.get(build.jobId);
      const payload = (job?.payload ?? {}) as StreetsBuildPayload;
      const countries = [...new Set((payload.regions ?? []).map((r) => r.country))];
      for (const country of countries.length > 0 ? countries : [null]) {
        out.push({
          country,
          item: {
            ...base(`task:${build.jobId}:streets`, `Streets for routes: ${payload.name ?? "building"}`),
            state: build.state === "waiting" ? "waiting" : "processing",
            progress: {
              current: job?.progressCurrent ?? 0,
              total: job?.progressTotal ?? null,
              unit: null,
              message: build.message ?? build.stageLabel,
              step: build.step,
            },
            regionId: payload.regions?.find((r) => r.country === country)?.regionId ?? null,
            taskId: build.jobId,
          },
        });
      }
    } else if (build?.state === "failed") {
      const said = connection.status();
      out.push({
        country: null,
        item: {
          ...base(`streets:failed:${said?.id ?? "last"}`, `Streets for routes: ${said?.name ?? "the last build"}`),
          state: "failed",
          reason: build.message ?? "The streets could not be built. The streets in use are as they were.",
          taskId: build.jobId,
        },
      });
    }
    return out;
  }

  return { connection, tiles, status, route, reach, mapDataItems };
}

/** Fires when the browser that asked has gone away, so the question to the streets service is dropped too. */
function goneSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}

export async function registerStreets(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createStreetsService(ctx);
  ctx.services.streets = service;
  ctx.jobs.register<StreetsBuildPayload>(STREETS_BUILD_JOB, {
    // A queue of its own: a build holds it for up to an hour, and nothing else waits behind it.
    queue: "streets",
    run: ({ job, payload, signal, progress }) => service.tiles.runJob({ jobId: job.id, payload, signal, progress }),
  });

  app.get("/api/streets/status", async () => service.status());
  app.post("/api/streets/route", async (request, reply) => service.route(streetsRouteSchema.parse(request.body), goneSignal(reply)));
  app.post("/api/streets/reach", async (request, reply) => service.reach(streetsReachSchema.parse(request.body), goneSignal(reply)));
  app.post("/api/streets/tiles/estimate", async (request) => service.tiles.estimate(estimateSchema.parse(request.body).regions));
  /** Build streets from kept country files, or bring in a set built elsewhere: a task either way. */
  app.post("/api/streets/tiles", async (request) => {
    const body = buildSchema.parse(request.body);
    if ("import" in body) return { ...service.tiles.importFile(body.import), estimate: null };
    return service.tiles.build({ regions: body.regions, ...(body.workLocationId ? { workLocationId: body.workLocationId } : {}) });
  });
  app.delete("/api/streets/tiles", async () => {
    await service.tiles.remove();
    return { ok: true };
  });
}
