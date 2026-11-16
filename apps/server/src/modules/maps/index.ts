/**
 * Offline maps.
 *
 * Regions of the world are cut out of a remote planet archive (PMTiles) and kept as
 * collections; this module plans and runs those extracts, serves their tiles as one
 * seamless map, searches place names from GeoNames, and keeps people's own markers and
 * GPX tracks. The browser draws the map with MapLibre against the endpoints here and
 * never needs the network.
 */
import fastifyMultipart from "@fastify/multipart";
import { MARKER_COLORS, type MapOverview, type MarkerColor } from "@outpost/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { createHttpClient } from "../../core/http.ts";
import {
  type AnnotationsService,
  createAnnotationsService,
  markerCreateSchema,
  markerPatchSchema,
  routeCreateSchema,
  routePointsReplaceSchema,
  trackPatchSchema,
} from "./annotations.ts";
import { createElevationSampler } from "./elevation.ts";
import { createExtractFetcher, createTilesInstaller, EXTRACT_FETCHER } from "./extract-download.ts";
import { MAX_GPX_BYTES } from "./gpx.ts";
import { areaSizeQuery, createAreaMeter } from "./kept-area.ts";
import { createPlacesService, datasetSchema, type PlacesService } from "./places.ts";
import { createPlanner } from "./planner.ts";
import { removeExtractSidecars } from "./pmtiles/extract.ts";
import { createRegionsService, estimateSchema, importSchema, type RegionsService, startRegionSchema } from "./regions.ts";
import { createSourceResolver } from "./source.ts";
import { createTileServer, type TileServer } from "./tile-server.ts";

export interface MapsService {
  regions: RegionsService;
  tiles: TileServer;
  places: PlacesService;
  annotations: AnnotationsService;
  overview(): MapOverview;
}

declare module "../../core/context.ts" {
  interface Services {
    maps: MapsService;
  }
}

/** Tiles of an installed build never change; a browser may keep them for an hour. */
const TILE_CACHE_CONTROL = "private, max-age=3600";

const flag = z
  .enum(["1", "0", "true", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

const placesQuery = z.object({
  q: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "Give `near` as latitude,longitude, for example 54.46,-3.09.")
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const [lat, lon] = value.split(",").map(Number) as [number, number];
      return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
    }),
});

type IdParams = { Params: { id: string } };
type TileParams = { Params: { z: string; x: string; file: string } };

/** z, x and y from a tile address such as ".../12/2003/1332.mvt"; undefined if it is not one. */
function tileCoordinates(params: TileParams["Params"], extension: string): [number, number, number] | undefined {
  const match = new RegExp(`^(\\d{1,8})\\.${extension}$`).exec(params.file);
  if (!match || !/^\d{1,2}$/.test(params.z) || !/^\d{1,8}$/.test(params.x)) return undefined;
  return [Number(params.z), Number(params.x), Number(match[1])];
}

export async function registerMaps(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { settings, collections, downloads, storage } = ctx.services;
  const client = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
  const sources = createSourceResolver({ client, setting: (key) => settings.get(key) });
  const planner = createPlanner(client);
  const tiles = createTileServer(ctx);
  const places = createPlacesService(ctx);
  const annotations = createAnnotationsService(ctx, { elevation: createElevationSampler(ctx, tiles) });
  const regions = createRegionsService(ctx, { planner, sources });

  const service: MapsService = {
    regions,
    tiles,
    places,
    annotations,
    overview() {
      return {
        regions: tiles.regions(),
        places: places.datasets(),
        counts: { ...annotations.counts(), places: places.count() },
      };
    },
  };
  ctx.services.maps = service;

  // ── Downloads ──
  downloads.registerFetcher(EXTRACT_FETCHER, createExtractFetcher({ client, planner, sources }));
  downloads.registerInstaller("map", createTilesInstaller(ctx, "map"));
  downloads.registerInstaller("terrain", createTilesInstaller(ctx, "terrain"));
  downloads.registerInstaller("places", places.installer);

  // An extract keeps its plan and progress in files beside the partial archive. The
  // download manager removes the partial archive with the download; these go with it.
  const partials = new Map<string, { locationId: string; relPath: string }>();
  const track = (row: { id: string; kind: string; state: string; locationId: string; relPath: string }) => {
    if (row.kind !== "map" && row.kind !== "terrain") return;
    if (row.state === "completed") partials.delete(row.id);
    else partials.set(row.id, { locationId: row.locationId, relPath: row.relPath });
  };
  for (const row of downloads.list()) track(row);
  const unsubscribe = ctx.events.subscribe((event) => {
    if (event.type === "download.updated" && event.data) track(event.data as Parameters<typeof track>[0]);
    if (event.type !== "download.removed" || !event.id) return;
    const partial = partials.get(event.id);
    partials.delete(event.id);
    if (!partial || !storage.isAvailable(partial.locationId)) return;
    removeExtractSidecars(`${storage.resolve(partial.locationId, partial.relPath)}.part`).catch((error) =>
      ctx.log.warn({ err: error, download: event.id }, "could not tidy up after a removed map download"),
    );
  });

  // ── Collections ──
  // Removal and moving belong to the collections module; this module lets go of files
  // it has open and drops what it derived from them.
  collections.onRemoved(async (collection) => {
    if (collection.kind === "map" || collection.kind === "terrain") {
      await tiles.release(collection.id);
      tiles.invalidate();
    } else if (collection.kind === "places") {
      await places.removeRows(collection.id);
    } else {
      return;
    }
    ctx.events.publish({ type: "maps.changed" });
  });
  collections.onMoved(async (collection) => {
    if (collection.kind !== "map" && collection.kind !== "terrain") return;
    // The open handle points at the original, which is about to be deleted.
    await tiles.release(collection.id);
    tiles.invalidate();
  });

  ctx.onClose.push(async () => {
    unsubscribe();
    await tiles.close();
    await client.close();
  });

  // ── Regions ──

  app.get("/api/maps/regions", async () => {
    return regions.list();
  });

  app.post("/api/maps/estimate", async (request) => {
    return regions.estimate(estimateSchema.parse(request.body));
  });

  app.post("/api/maps/regions", async (request) => {
    const started = await regions.start(startRegionSchema.parse(request.body));
    return { downloads: started.map((row) => downloads.toDto(row)) };
  });

  app.post("/api/maps/import", async (request) => {
    const collection = await regions.importArchive(importSchema.parse(request.body));
    return { collection: collections.toDto(collection) };
  });

  app.get("/api/maps/overview", async () => {
    return service.overview();
  });

  app.get("/api/maps/sources", async () => {
    return tiles.sources();
  });

  // ── Tiles ──

  async function sendTile(
    reply: FastifyReply,
    tileType: "vector" | "terrain",
    coordinates: [number, number, number] | undefined,
    raw = false,
  ) {
    if (!coordinates) throw new AppError("not_found", "That is not a map tile address.");
    const tile = await tiles.getTile(tileType, ...coordinates);
    reply.header("Cache-Control", raw ? "no-store" : TILE_CACHE_CONTROL);
    // MapLibre treats 204 as "nothing here" and draws the tile empty, without an error.
    if (!tile) return reply.status(204).send();
    // A phone keeping this tile for later asks for it as stored: still gzipped, and said to be
    // so in a header of our own, because a browser would unpack anything marked Content-Encoding
    // before the page could store it. Kept that way it takes a half to a third of the room.
    if (raw && tile.contentEncoding === "gzip") reply.header("X-Outpost-Tile-Encoding", "gzip");
    else if (tile.contentEncoding) reply.header("Content-Encoding", tile.contentEncoding);
    return reply.header("Content-Type", tile.contentType).send(tile.data);
  }

  const isRaw = (request: FastifyRequest) => (request.query as { raw?: unknown }).raw === "1";

  app.get<TileParams>("/api/maps/tiles/:z/:x/:file", async (request, reply) => {
    return sendTile(reply, "vector", tileCoordinates(request.params, "mvt"), isRaw(request));
  });

  app.get<TileParams>("/api/maps/terrain/:z/:x/:file", async (request, reply) => {
    return sendTile(reply, "terrain", tileCoordinates(request.params, "(?:webp|png)"), isRaw(request));
  });

  // What keeping a box of the map on a phone would fetch. Read-only: the phone does the fetching.
  const areaMeter = createAreaMeter(tiles);
  app.get("/api/maps/area-size", async (request) => {
    return areaMeter.size(areaSizeQuery.parse(request.query));
  });

  // ── Places ──

  app.post("/api/maps/places/datasets", async (request) => {
    const download = await places.startDownload(datasetSchema.parse(request.body));
    return { download: downloads.toDto(download) };
  });

  app.get("/api/maps/places/datasets", async () => {
    return { datasets: places.datasets() };
  });

  app.delete<IdParams>("/api/maps/places/datasets/:id", async (request) => {
    const collection = collections.get(request.params.id);
    if (collection?.kind !== "places") throw new AppError("not_found", "Those place names were not found.");
    // The zip is only the source of the rows; there is nothing in it a person would keep.
    await collections.remove(collection.id, { deleteFiles: storage.isAvailable(collection.locationId) });
    return { ok: true };
  });

  app.get("/api/maps/places", async (request) => {
    const query = placesQuery.parse(request.query);
    return places.search(query.q, { limit: query.limit, near: query.near });
  });

  // ── Markers ──

  app.get("/api/maps/markers", async () => {
    return { markers: annotations.listMarkers() };
  });

  app.post("/api/maps/markers", async (request) => {
    return { marker: annotations.createMarker(markerCreateSchema.parse(request.body)) };
  });

  app.patch<IdParams>("/api/maps/markers/:id", async (request) => {
    return { marker: annotations.updateMarker(request.params.id, markerPatchSchema.parse(request.body)) };
  });

  app.delete<IdParams>("/api/maps/markers/:id", async (request) => {
    annotations.removeMarker(request.params.id);
    return { ok: true };
  });

  // ── Tracks ──

  // Another module may have registered the multipart parser already; twice is an error.
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(fastifyMultipart, { limits: { fileSize: ctx.config.maxUploadBytes } });
  }

  /** Reads one GPX file and the optional form fields that may come with it. */
  async function receiveGpx(
    request: FastifyRequest,
  ): Promise<{ source: string; filename: string | undefined; fields: Record<string, string> }> {
    if (!request.isMultipart()) throw badRequest("Send the GPX file as a multipart/form-data upload.");
    const fields: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.query as Record<string, unknown>)) {
      if (typeof value === "string") fields[name] = value;
    }
    let source: string | undefined;
    let filename: string | undefined;
    try {
      for await (const part of request.parts({ limits: { fileSize: MAX_GPX_BYTES, files: 1, fields: 10, fieldSize: 2000 } })) {
        if (part.type === "field") {
          if (typeof part.value === "string") fields[part.fieldname] = part.value;
          continue;
        }
        // Bounded by the size limit above, so reading it whole is safe.
        source = (await part.toBuffer()).toString("utf8");
        filename = part.filename || undefined;
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE")
        throw new AppError("too_large", "That GPX file is larger than 20 MB. Split it into smaller files.");
      if (code === "FST_FILES_LIMIT") throw badRequest("Upload one GPX file at a time.");
      throw error;
    }
    if (source === undefined) throw badRequest("No file was sent. Choose a GPX file to import.");
    return { source, filename, fields };
  }

  app.post("/api/maps/tracks/import", async (request) => {
    const { source, filename, fields } = await receiveGpx(request);
    const options = z
      .object({ name: z.string().trim().max(200).optional(), color: z.enum(MARKER_COLORS).optional(), importWaypointsAsMarkers: flag })
      .parse({
        name: fields.name,
        color: fields.color as MarkerColor | undefined,
        importWaypointsAsMarkers: fields.importWaypointsAsMarkers,
      });
    return annotations.importTrack({ source, filename, ...options });
  });

  app.get("/api/maps/tracks", async () => {
    return { tracks: annotations.listTracks() };
  });

  // A route drawn on the map: straight lines between the points sent.
  app.post("/api/maps/tracks", async (request) => {
    return annotations.createRoute(routeCreateSchema.parse(request.body));
  });

  app.put<IdParams>("/api/maps/tracks/:id/points", async (request) => {
    return annotations.replaceRoutePoints(request.params.id, routePointsReplaceSchema.parse(request.body));
  });

  function sendGpx(reply: FastifyReply, file: { filename: string; gpx: string }) {
    const ascii = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return (
      reply
        .header("Content-Type", "application/gpx+xml; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
        // GPX is XML, which a browser would render: it must never run in Outpost's origin.
        .header("Content-Security-Policy", "sandbox; default-src 'none'")
        .header("X-Content-Type-Options", "nosniff")
        .send(file.gpx)
    );
  }

  app.get<IdParams>("/api/maps/tracks/:id/export.gpx", async (request, reply) => {
    return sendGpx(reply, annotations.exportTrack(request.params.id));
  });

  app.get("/api/maps/export.gpx", async (request, reply) => {
    const query = z.object({ markers: flag, tracks: z.string().max(4000).optional() }).parse(request.query);
    const trackIds = (query.tracks ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return sendGpx(reply, annotations.exportSelection({ markers: query.markers, trackIds }));
  });

  app.get<IdParams>("/api/maps/tracks/:id", async (request) => {
    return { track: annotations.getTrack(request.params.id) };
  });

  app.patch<IdParams>("/api/maps/tracks/:id", async (request) => {
    return { track: annotations.updateTrack(request.params.id, trackPatchSchema.parse(request.body)) };
  });

  app.delete<IdParams>("/api/maps/tracks/:id", async (request) => {
    annotations.removeTrack(request.params.id);
    return { ok: true };
  });
}
