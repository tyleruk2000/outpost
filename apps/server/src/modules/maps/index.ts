/**
 * Offline maps.
 *
 * Regions of the world are cut out of a remote planet archive (PMTiles) and kept as
 * collections; this module plans and runs those extracts, serves their tiles as one
 * seamless map, searches place names from GeoNames, and keeps people's own markers and
 * GPX tracks. The browser draws the map with MapLibre against the endpoints here and
 * never needs the network.
 */
import { MARKER_COLORS, type MapOverview, type MarkerColor, RECORDING_ID_PATTERN } from "@outpost/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { createHttpClient } from "../../core/http.ts";
import { registerMultipart } from "../../core/multipart.ts";
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
import { createImageryInstaller, type ImageryService, isImageryDownload, registerImagery } from "./imagery/index.ts";
import { areaSizeQuery, createAreaMeter } from "./kept-area.ts";
import { registerOsNames } from "./os-names/index.ts";
import { createPlacesService, datasetSchema, type PlacesService } from "./places.ts";
import { createPlanner } from "./planner.ts";
import { removeExtractSidecars } from "./pmtiles/extract.ts";
import { createPointHeight, pointHeightQuery } from "./point-height.ts";
import { createRegionsService, estimateSchema, importSchema, type RegionsService, startRegionSchema } from "./regions.ts";
import { createRelayPlanner, relayQuery } from "./relay.ts";
import { registerRouteFinder } from "./route-finder/index.ts";
import { createSightRanger, sightRangeQuery } from "./sight-range.ts";
import { createSourceResolver } from "./source.ts";
import { createTerrainProfiler, terrainProfileQuery } from "./terrain-profile.ts";
import { createTileServer, type TileServer } from "./tile-server.ts";
import { createWalkReacher, walkReachQuery } from "./walk-reach.ts";

export interface MapsService {
  regions: RegionsService;
  tiles: TileServer;
  places: PlacesService;
  annotations: AnnotationsService;
  imagery: ImageryService;
  overview(): MapOverview;
}

declare module "../../core/context.ts" {
  interface Services {
    maps: MapsService;
  }
}

/** A browser may keep a tile for an hour, then asks with its ETag whether the same region still answers. */
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
  const elevation = createElevationSampler(ctx, tiles);
  const annotations = createAnnotationsService(ctx, { elevation });
  const terrainProfile = createTerrainProfiler(elevation, tiles);
  const sightRange = createSightRanger(elevation, tiles);
  const relayPlanner = createRelayPlanner(sightRange);
  const walkReach = createWalkReacher(ctx, elevation, tiles);
  const pointHeight = createPointHeight(elevation);
  const regions = createRegionsService(ctx, { planner, sources });
  const imagery = registerImagery(app, ctx, { client, ...ctx.config.imagery });
  tiles.setImagery(() => imagery.styleSources());

  const service: MapsService = {
    regions,
    tiles,
    places,
    annotations,
    imagery,
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
  // A satellite imagery set is a map collection too; its downloads say so in their meta.
  const installMap = createTilesInstaller(ctx, "map");
  const installImagery = createImageryInstaller(ctx, ctx.config.imagery?.worldEntries);
  downloads.registerInstaller("map", (context) => (isImageryDownload(context.download) ? installImagery(context) : installMap(context)));
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
    request: FastifyRequest,
    reply: FastifyReply,
    tileType: "vector" | "terrain",
    coordinates: [number, number, number] | undefined,
  ) {
    if (!coordinates) throw new AppError("not_found", "That is not a map tile address.");
    const raw = (request.query as { raw?: unknown }).raw === "1";
    const tile = await tiles.getTile(tileType, ...coordinates);
    // MapLibre treats 204 as "nothing here" and draws the tile empty, without an error. It may
    // be a drive gone for a moment, so the browser asks again rather than keep the hole.
    if (!tile) {
      reply.header("Cache-Control", raw ? "no-store" : "no-cache");
      return reply.status(204).send();
    }
    reply.header("Cache-Control", raw ? "no-store" : TILE_CACHE_CONTROL);
    if (!raw) {
      reply.header("ETag", tile.etag);
      if (request.headers["if-none-match"] === tile.etag) return reply.status(304).send();
    }
    // A phone keeping this tile for later asks for it as stored: still gzipped, and said to be
    // so in a header of our own, because a browser would unpack anything marked Content-Encoding
    // before the page could store it. Kept that way it takes a half to a third of the room.
    if (raw && tile.contentEncoding === "gzip") reply.header("X-Outpost-Tile-Encoding", "gzip");
    else if (tile.contentEncoding) reply.header("Content-Encoding", tile.contentEncoding);
    return reply.header("Content-Type", tile.contentType).send(tile.data);
  }

  app.get<TileParams>("/api/maps/tiles/:z/:x/:file", async (request, reply) => {
    return sendTile(request, reply, "vector", tileCoordinates(request.params, "mvt"));
  });

  app.get<TileParams>("/api/maps/terrain/:z/:x/:file", async (request, reply) => {
    return sendTile(request, reply, "terrain", tileCoordinates(request.params, "(?:webp|png)"));
  });

  // What keeping a box of the map on a phone would fetch. Read-only: the phone does the fetching.
  const areaMeter = createAreaMeter(tiles);
  app.get("/api/maps/area-size", async (request) => {
    return areaMeter.size(areaSizeQuery.parse(request.query));
  });

  // The ground between two points, read from installed terrain: what a line-of-sight check is made from.
  app.get("/api/maps/terrain-profile", async (request) => {
    const query = terrainProfileQuery.parse(request.query);
    return terrainProfile(query.from, query.to);
  });

  // The height of the ground at one point, for the readout at the foot of the map. Terrain changes only when a
  // pack is installed or removed, so a browser may keep an answer for a minute.
  app.get("/api/maps/height", async (request, reply) => {
    const query = pointHeightQuery.parse(request.query);
    reply.header("Cache-Control", "private, max-age=60");
    return pointHeight(query.at);
  });

  // How far out a station stays in sight of an aerial, bearing by bearing, from installed terrain: a repeater's estimated range.
  app.get("/api/maps/sight-range", async (request) => {
    const query = sightRangeQuery.parse(request.query);
    return sightRange(query.at, query.aerial, query.station);
  });

  // High ground in sight of two places, for a relay between them: the two places' viewsheds read together.
  app.get("/api/maps/relay", async (request) => {
    return relayPlanner(relayQuery.parse(request.query));
  });

  // The ground reachable on foot from a point in a set time, over installed terrain and along the map's paths.
  app.get("/api/maps/walk-reach", async (request) => {
    return walkReach(walkReachQuery.parse(request.query));
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

  // The limits are the routes' own, given with each request (see core/multipart.ts).
  await registerMultipart(app);

  /** Reads one uploaded map file and the optional form fields that may come with it. */
  async function receiveUpload(
    request: FastifyRequest,
    kind: "GPX" | "map",
  ): Promise<{ bytes: Buffer; filename: string | undefined; fields: Record<string, string> }> {
    const what = kind === "GPX" ? "GPX file" : "file";
    if (!request.isMultipart()) throw badRequest(`Send the ${what} as a multipart/form-data upload.`);
    const fields: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.query as Record<string, unknown>)) {
      if (typeof value === "string") fields[name] = value;
    }
    let bytes: Buffer | undefined;
    let filename: string | undefined;
    try {
      for await (const part of request.parts({ limits: { fileSize: MAX_GPX_BYTES, files: 1, fields: 10, fieldSize: 2000 } })) {
        if (part.type === "field") {
          if (typeof part.value === "string") fields[part.fieldname] = part.value;
          continue;
        }
        // Bounded by the size limit above, so reading it whole is safe.
        bytes = await part.toBuffer();
        filename = part.filename || undefined;
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE")
        throw new AppError("too_large", `That ${what} is larger than 20 MB. Split it into smaller files.`);
      if (code === "FST_FILES_LIMIT") throw badRequest(`Upload one ${what} at a time.`);
      throw error;
    }
    if (bytes === undefined)
      throw badRequest(`No file was sent. Choose a ${kind === "GPX" ? "GPX" : "GPX, KML, KMZ or GeoJSON"} file to import.`);
    return { bytes, filename, fields };
  }

  /** Reads one GPX file and the optional form fields that may come with it. */
  async function receiveGpx(
    request: FastifyRequest,
  ): Promise<{ source: string; filename: string | undefined; fields: Record<string, string> }> {
    const { bytes, filename, fields } = await receiveUpload(request, "GPX");
    return { source: bytes.toString("utf8"), filename, fields };
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

  // Any map file: GPX, KML, KMZ or GeoJSON. Its lines become one new route, its points
  // new places (a GPX file's waypoints only when asked). Nothing saved is changed.
  app.post("/api/maps/files/import", async (request) => {
    const { bytes, filename, fields } = await receiveUpload(request, "map");
    const options = z
      .object({ name: z.string().trim().max(200).optional(), color: z.enum(MARKER_COLORS).optional(), importWaypointsAsMarkers: flag })
      .parse({
        name: fields.name,
        color: fields.color as MarkerColor | undefined,
        importWaypointsAsMarkers: fields.importWaypointsAsMarkers,
      });
    return annotations.importMapFile({ bytes, filename, ...options });
  });

  // What importing a map file would make, read without saving anything.
  app.post("/api/maps/files/preview", async (request) => {
    const { bytes, filename } = await receiveUpload(request, "map");
    return annotations.previewMapFile({ bytes, filename });
  });

  // A track recorded on the map as its maker walked. The device builds the GPX and names
  // the recording; it is read with the same reader, and the same limits, as an import.
  app.put<IdParams>("/api/maps/recordings/:id", async (request) => {
    const id = z.string().regex(RECORDING_ID_PATTERN, "That is not the id of a recording.").parse(request.params.id);
    const { source, fields } = await receiveGpx(request);
    const options = z
      .object({ name: z.string().trim().min(1, "Give the recording a name.").max(200), color: z.enum(MARKER_COLORS).optional() })
      .parse({ name: fields.name ?? "", color: fields.color as MarkerColor | undefined });
    return annotations.saveRecording({ id, source, ...options });
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

  // Place names for Great Britain from Ordnance Survey (os-names/).
  registerOsNames(app, ctx, client);

  // ── Finding a known route in a route source ──
  registerRouteFinder(app, ctx, { client, annotations, elevation });
}
