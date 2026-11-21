/**
 * Tide times (Tools → Tide times): high and low water for the stations nearest a place,
 * worked out on this computer from harmonic constants that ship with Outpost. Nothing is
 * fetched and nothing is kept: every answer is computed when asked.
 *
 * The constants are NOAA CO-OPS's (`data/noaa-harmonic.json`, made by
 * scripts/build-tide-stations.mjs; public domain). The arithmetic is in @outpost/shared
 * (tides.ts). The table is read the first time someone asks, not at start.
 */
import {
  type HarmonicStation,
  haversineMeters,
  TIDE_MAX_DAYS,
  type TidePredictionResponse,
  type TideSource,
  type TideStationDto,
  type TideStationsResponse,
  tideCurve,
  tideTurns,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";

interface TideTable {
  source: string;
  url: string;
  licence: string;
  read: string;
  constituents: string[];
  /** id, name, state, lat, lon, MSL above MLLW (mm, or null), amplitudes (mm), Greenwich phases (tenths of a degree). */
  stations: Array<[string, string, string, number, number, number | null, number[], number[]]>;
}

interface Loaded {
  table: TideTable;
  source: TideSource;
}

export interface TidesService {
  nearest(lat: number, lon: number, limit: number): Promise<TideStationsResponse>;
  predict(id: string, from: number, days: number, near?: { lat: number; lon: number }): Promise<TidePredictionResponse>;
}

declare module "../../core/context.ts" {
  interface Services {
    tides: TidesService;
  }
}

let loading: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loading ??= import("./data/noaa-harmonic.json", { with: { type: "json" } }).then((module) => {
    const table = module.default as unknown as TideTable;
    return {
      table,
      source: { name: table.source, url: table.url, licence: table.licence, read: table.read, count: table.stations.length },
    };
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

function toDto(row: TideTable["stations"][number], lat: number, lon: number): TideStationDto {
  return {
    id: row[0],
    name: row[1],
    state: row[2],
    lat: row[3],
    lon: row[4],
    distanceKm: haversineMeters(lat, lon, row[3], row[4]) / 1000,
    datum: row[5] === null ? "MSL" : "MLLW",
  };
}

function harmonic(table: TideTable, row: TideTable["stations"][number]): HarmonicStation {
  return {
    datumOffset: (row[5] ?? 0) / 1000,
    constituents: table.constituents.map((name, i) => ({ name, amplitude: (row[6][i] ?? 0) / 1000, phase: (row[7][i] ?? 0) / 10 })),
  };
}

export function createTidesService(): TidesService {
  return {
    async nearest(lat, lon, limit) {
      const { table, source } = await load();
      const stations = table.stations
        .map((row) => toDto(row, lat, lon))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit);
      return { stations, source };
    },
    async predict(id, from, days, near) {
      const { table, source } = await load();
      const row = table.stations.find((each) => each[0] === id);
      if (!row) throw new AppError("not_found", "No tide station has that number. Choose one from the list of stations near the place.");
      const to = from + days * 86_400_000;
      const station = harmonic(table, row);
      return {
        station: toDto(row, near?.lat ?? row[3], near?.lon ?? row[4]),
        from,
        to,
        turns: tideTurns(station, from, to),
        curve: tideCurve(station, from, to).map((point) => ({ t: point.t, h: Math.round(point.h * 1000) / 1000 })),
        constituents: station.constituents.filter((c) => c.amplitude > 0).length,
        source,
      };
    },
  };
}

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);

export async function registerTides(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createTidesService();
  ctx.services.tides = service;

  app.get("/api/tides/stations", async (request) => {
    const query = z
      .object({ lat: latitude, lon: longitude, limit: z.coerce.number().int().min(1).max(50).default(8) })
      .parse(request.query);
    return service.nearest(query.lat, query.lon, query.limit);
  });

  app.get("/api/tides/stations/:id/predictions", async (request) => {
    const { id } = z.object({ id: z.string().regex(/^[0-9A-Za-z]{1,16}$/) }).parse(request.params);
    const query = z
      .object({
        // Milliseconds since 1970: the screen sends the start of a day on its own clock.
        from: z.coerce
          .number()
          .int()
          .min(Date.UTC(1900, 0, 1))
          .max(Date.UTC(2100, 0, 1)),
        days: z.coerce.number().int().min(1).max(TIDE_MAX_DAYS).default(7),
        lat: latitude.optional(),
        lon: longitude.optional(),
      })
      .parse(request.query);
    const near = query.lat !== undefined && query.lon !== undefined ? { lat: query.lat, lon: query.lon } : undefined;
    return service.predict(id, query.from, query.days, near);
  });
}
