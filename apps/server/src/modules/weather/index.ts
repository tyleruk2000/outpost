/**
 * Weather and hazards, under Preparedness: forecasts, severe-weather warnings, flood
 * warnings and river levels, and climate and sunshine averages, fetched when a person
 * presses a button and kept on this server so that every device on the network sees the
 * same copy, with its age; and the person's own barometer readings.
 *
 * Two routes make outbound requests, and both are `POST`, so only Outpost's own pages
 * can cause them (`core/guard.ts`): `POST /api/weather/update` (the "Update now" button,
 * and the page itself when a person has ticked "also update when I open this screen"),
 * and `POST /api/weather/river-readings` (a station's own view, on a press). The hosts are in `sources.ts`; what is sent is in docs/security.md.
 *
 * `GET /api/weather/home-warnings` is for other screens (the scenario planner): the
 * warnings in force for the home place when they were last fetched. It fetches nothing.
 */
import {
  DEFAULT_RIVER_KM,
  HEIGHT_RANGE,
  type HomeWarningsResponse,
  MET_OFFICE_REGION_IDS,
  PRESSURE_UNITS,
  type ReadingsResponse,
  RIVER_DISTANCES_KM,
  type StationReadings,
  UPDATE_KINDS,
  type UpdateResponse,
  WEATHER_LIMITS,
  type WeatherResponse,
} from "@outpost/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createHttpClient } from "../../core/http.ts";
import { isTimeZone } from "./csv.ts";
import { createWeatherService, type WeatherService } from "./service.ts";
import { createSourceFetcher, WEATHER_SOURCES } from "./sources.ts";

declare module "../../core/context.ts" {
  interface Services {
    weather: WeatherService;
  }
}

/** Fires when the browser that asked has gone away, so the requests to the publishers are dropped too. */
function goneSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}

const idParams = z.object({ id: z.string().min(1).max(64) });
const region = z.enum(MET_OFFICE_REGION_IDS).nullable();
const placeSchema = z
  .object({
    markerId: z.string().min(1).max(64).optional(),
    name: z.string().max(WEATHER_LIMITS.name).optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lon: z.number().finite().min(-180).max(180).optional(),
    region: region.optional(),
  })
  .strict()
  .refine((input) => input.markerId !== undefined || (input.lat !== undefined && input.lon !== undefined), {
    message: "Choose a saved place, or give a latitude and longitude.",
  });
const placePatch = z.object({ name: z.string().max(WEATHER_LIMITS.name).optional(), region: region.optional() }).strict();
const updateSchema = z
  .object({
    kinds: z.array(z.enum(UPDATE_KINDS)).min(1).max(UPDATE_KINDS.length),
    placeIds: z.array(z.string().min(1).max(64)).max(WEATHER_LIMITS.places).optional(),
  })
  .strict();
const height = z
  .number()
  .finite()
  .min(HEIGHT_RANGE.min, `The height must be at least ${HEIGHT_RANGE.min} m.`)
  .max(HEIGHT_RANGE.max, `The height must be at most ${HEIGHT_RANGE.max} m.`);
const readingSchema = z
  .object({
    takenAt: z
      .number()
      .int()
      .min(Date.UTC(1900, 0, 1))
      .refine((value) => value <= Date.now() + 10 * 60_000, "The time is in the future."),
    value: z.number().finite().gt(0, "Give the pressure the barometer shows.").max(2000),
    unit: z.enum(PRESSURE_UNITS),
    heightM: height,
    note: z.string().max(WEATHER_LIMITS.note).default(""),
  })
  .strict();
const importSchema = z
  .object({
    text: z.string().max(WEATHER_LIMITS.csvBytes),
    unit: z.enum(PRESSURE_UNITS),
    heightM: height,
    zone: z.string().max(80).refine(isTimeZone, "That is not a time zone."),
    apply: z.boolean().default(false),
  })
  .strict();

export async function registerWeather(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const http = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
  ctx.onClose.push(() => http.close());
  const riversKm = (): number => {
    const chosen = ctx.services.settings.get("weather.riversKm");
    return (RIVER_DISTANCES_KM as readonly number[]).includes(chosen) ? chosen : DEFAULT_RIVER_KM;
  };
  const service = createWeatherService(ctx, createSourceFetcher(http, { standIn: ctx.config.weatherStandIn }), { riversKm });
  ctx.services.weather = service;

  app.get(
    "/api/weather",
    async (): Promise<WeatherResponse> => ({
      places: service.places(),
      kept: service.kept(),
      sources: Object.values(WEATHER_SOURCES),
      updateOnOpen: ctx.services.settings.get("weather.updateOnOpen"),
      riversKm: riversKm(),
      now: Date.now(),
    }),
  );

  app.post("/api/weather/places", async (request) => ({ place: service.addPlace(placeSchema.parse(request.body)) }));
  app.patch("/api/weather/places/:id", async (request) => ({
    place: service.updatePlace(idParams.parse(request.params).id, placePatch.parse(request.body)),
  }));
  app.delete("/api/weather/places/:id", async (request) => {
    service.removePlace(idParams.parse(request.params).id);
    return { ok: true };
  });

  /** The one route that contacts the publishers. */
  app.post("/api/weather/update", async (request, reply): Promise<UpdateResponse> => {
    return { outcomes: await service.update(updateSchema.parse(request.body), goneSignal(reply)) };
  });

  /** A station's last few days of readings, from its own view: the other route that contacts a publisher. */
  app.post("/api/weather/river-readings", async (request, reply): Promise<{ readings: StationReadings }> => {
    const input = z
      .object({ placeId: z.string().min(1).max(64), stationId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/) })
      .strict()
      .parse(request.body);
    return { readings: await service.stationReadings(input, goneSignal(reply)) };
  });

  app.delete("/api/weather/kept/:id", async (request) => {
    service.removeCopy(idParams.parse(request.params).id);
    return { ok: true };
  });

  app.put("/api/weather/options", async (request) => {
    const input = z
      .object({
        updateOnOpen: z.boolean().optional(),
        riversKm: z
          .number()
          .refine((km) => (RIVER_DISTANCES_KM as readonly number[]).includes(km), `Choose ${RIVER_DISTANCES_KM.join(", ")} km.`)
          .optional(),
      })
      .strict()
      .parse(request.body);
    if (input.updateOnOpen !== undefined) ctx.services.settings.update({ "weather.updateOnOpen": input.updateOnOpen });
    if (input.riversKm !== undefined) ctx.services.settings.update({ "weather.riversKm": input.riversKm });
    ctx.events.publish({ type: "weather.changed" });
    return { updateOnOpen: ctx.services.settings.get("weather.updateOnOpen"), riversKm: riversKm() };
  });

  /** For the scenario planner: what was in force for the home place when last fetched. Fetches nothing. */
  app.get("/api/weather/home-warnings", async (): Promise<HomeWarningsResponse> => service.homeWarnings());

  // ── The barometer ──

  app.get("/api/weather/readings", async (): Promise<ReadingsResponse> => ({ readings: service.readings() }));
  app.post("/api/weather/readings", async (request) => ({ reading: service.addReading(readingSchema.parse(request.body)) }));
  app.delete("/api/weather/readings/:id", async (request) => {
    service.removeReading(idParams.parse(request.params).id);
    return { ok: true };
  });
  /** Reads a file of readings; with `apply`, keeps the ones not already kept. */
  app.post("/api/weather/readings/import", async (request) => {
    const input = importSchema.parse(request.body);
    return service.importReadings(input.text, input);
  });
}
