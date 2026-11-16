/**
 * Satellite imagery on the offline map.
 *
 * A set of imagery is an ordinary map collection (`kind: "map"`) whose archive holds
 * WebP image tiles and whose `meta.map.tileType` is "imagery". Being a map collection,
 * it is listed, sized, moved, checked, removed, backed up (or not) and carried on a
 * portable drive exactly as a map region is. It is made by a download through the
 * download manager, whose fetcher here fetches the publisher's files and builds the
 * archive on this computer: it shows under Downloads, can be paused, resumed and
 * cancelled, survives a restart without fetching anything twice, and checks free space.
 *
 * Two sources: NASA's Blue Marble for the whole world, and one pass of Sentinel-2 for a
 * small area chosen on the map. Both are free and need no account. Nothing reaches out
 * except as the direct result of a press: finding pictures, working out a size, and
 * starting a download each make their requests then and only then.
 */
import fs from "node:fs";
import type {
  AreaWarningLevel,
  Bbox,
  ImageryEstimate,
  ImageryOverview,
  ImagerySet,
  ImagerySourceId,
  ImageryStyleSource,
  SceneOption,
  SceneSearchResponse,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../../core/context.ts";
import { AppError, badRequest } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import type { CollectionRow } from "../../collections/service.ts";
import type { DownloadRow, FetchContext, Installer } from "../../downloads/types.ts";
import { TileType } from "../pmtiles/header.ts";
import { LocalArchive, readLocalHeader } from "../pmtiles/reader.ts";
import { bboxSchema, slugify } from "../regions.ts";
import { hostOf } from "../source.ts";
import { buildWorld, fetchWorldFiles, worldTileCount } from "./blue-marble.ts";
import {
  AREA_LIMITS,
  BLUE_MARBLE,
  BLUE_MARBLE_ATTRIBUTION,
  NASA_HOST,
  SENTINEL_2,
  SENTINEL_HOST,
  SOURCES,
  sentinelAttribution,
  WORLD_ENTRIES,
  type WorldEntry,
} from "./catalogue.ts";
import { ImageArchiveWriter } from "./pmtiles-writer.ts";
import { createRangeFetcher } from "./ranges.ts";
import { areaCloud, buildSentinel, countOutputTiles, planSentinel, SENTINEL_MIN_ZOOM, sentinelMaxZoom } from "./sentinel.ts";
import { dayText, passesOf, type Scene, sceneSchema, searchScenes } from "./stac.ts";

export const IMAGERY_FETCHER = "imagery-build";

/** Bytes per Sentinel-2 tile, measured on real builds (docs/maps.md, "How big an area"). */
const SENTINEL_BYTES_PER_TILE = 6_000;
/** Milliseconds to make one tile on the computer this was measured on; four times it for a small computer. */
const MS_PER_TILE = 15;
/** How long a search's results can be chosen from before searching again. */
const SEARCH_TTL_MS = 60 * 60_000;

const worldMetaSchema = z.object({ kind: z.literal("world"), entryId: z.string() });
const sentinelMetaSchema = z.object({
  kind: z.literal("sentinel"),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  scenes: z.array(sceneSchema).min(1).max(8),
  date: z.string(),
  areaCloudPercent: z.number().nullable(),
  /** Bytes the plan said would be fetched; the build stops if it would need more. */
  plannedBytes: z.number().int().nonnegative(),
});
const imageryMetaSchema = z.discriminatedUnion("kind", [worldMetaSchema, sentinelMetaSchema]);
type ImageryMeta = z.infer<typeof imageryMetaSchema>;

/** What an imagery collection carries in `meta.imagery`. */
const setMetaSchema = z.object({
  source: z.enum(["blue-marble", "sentinel-2"]),
  imageDate: z.string(),
  imageDateText: z.string(),
  sceneCloudPercent: z.number().nullable(),
  areaCloudPercent: z.number().nullable(),
  scenes: z.array(z.string()),
  resolutionMeters: z.number(),
  transferredBytes: z.number().nullable(),
});

export const sceneSearchSchema = z.object({
  bbox: bboxSchema,
  /** "YYYY-MM-DD"; the default is a year back from today. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const areaEstimateSchema = z.object({
  bbox: bboxSchema,
  sceneKey: z.string().min(1).max(2000),
  locationId: z.string().min(1).optional(),
});
export const areaStartSchema = areaEstimateSchema.extend({
  name: z.string().trim().min(1, "Give the area a name.").max(120),
  /** The person has read the warning for a large area and goes ahead on purpose. */
  acceptLarge: z.boolean().optional(),
});
export const worldStartSchema = z.object({ entryId: z.string().min(1), locationId: z.string().min(1).optional() });

/** Square kilometres of a box on the sphere. */
export function areaKm2(bbox: Bbox): number {
  const radius = 6371.0088;
  const [west, south, east, north] = bbox;
  const rad = Math.PI / 180;
  return radius * radius * (east - west) * rad * Math.abs(Math.sin(north * rad) - Math.sin(south * rad));
}

const megabytes = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
const minutes = (seconds: number) => (seconds < 90 ? `${Math.max(1, Math.round(seconds))} seconds` : `${Math.round(seconds / 60)} minutes`);
const km2 = (value: number) => `${Math.round(value).toLocaleString("en-GB")} km²`;

/** The warning shown before an area is fetched, from its size and what it will take. */
export function areaWarning(input: {
  areaKm2: number;
  transferBytes: number;
  sizeBytes: number;
  seconds: { low: number; high: number };
  scenes: number;
  coveragePercent: number;
}): { level: AreaWarningLevel; message: string | null } {
  const { areaKm2: area } = input;
  const what = `about ${megabytes(input.transferBytes)} to fetch and ${megabytes(input.sizeBytes)} on disk, and ${minutes(input.seconds.low)} to ${minutes(input.seconds.high)}`;
  const seams =
    input.scenes > 1
      ? ` It is made from ${input.scenes} scenes of the same day, so there may be ${input.scenes - 1 === 1 ? "a seam" : `${input.scenes - 1} seams`} where they meet.`
      : "";
  const gap = input.coveragePercent < 99 ? ` This pass covers only ${input.coveragePercent}% of the area; the rest stays as it is.` : "";
  if (area > AREA_LIMITS.maxKm2) {
    return {
      level: "refuse",
      message: `${km2(area)} is more than one area can be (${km2(AREA_LIMITS.maxKm2)}). An area that size would be one long job asking a free public service for hundreds of megabytes, and would mix many scenes. Choose the places that matter as several smaller areas.`,
    };
  }
  if (area > AREA_LIMITS.warnKm2) {
    return {
      level: "warn",
      message: `This is a large area: ${km2(area)}, ${what}.${seams}${gap} Several smaller areas of the places that matter are usually better: quicker, smaller, and each can have its own clear day. You can still go ahead.`,
    };
  }
  if (area > AREA_LIMITS.noticeKm2) return { level: "notice", message: `${km2(area)}: ${what}.${seams}${gap}` };
  return { level: "none", message: seams || gap ? `${seams}${gap}`.trim() : null };
}

export interface ImageryService {
  overview(): ImageryOverview;
  styleSources(): ImageryStyleSource[];
  search(input: z.infer<typeof sceneSearchSchema>, signal?: AbortSignal): Promise<SceneSearchResponse>;
  estimate(input: z.infer<typeof areaEstimateSchema>, signal?: AbortSignal): Promise<ImageryEstimate>;
  startArea(input: z.infer<typeof areaStartSchema>): Promise<DownloadRow>;
  startWorld(input: z.infer<typeof worldStartSchema>): Promise<DownloadRow>;
}

export interface ImageryDeps {
  client: HttpClient;
  /** Addresses of the publishers, replaced in tests by a local stand-in. */
  endpoints?: { stacSearchUrl?: string; sentinelHost?: string; nasaHost?: string };
  /** The world entries; replaced in tests by a small fixture. */
  worldEntries?: WorldEntry[];
}

const isImagery = (row: CollectionRow) => row.kind === "map" && (row.meta.map as { tileType?: string } | undefined)?.tileType === "imagery";

/** Whether a collection is a set of satellite imagery rather than a vector map region. */
export function isImageryCollection(row: CollectionRow): boolean {
  return isImagery(row);
}

/** Whether a download builds imagery. */
export function isImageryDownload(row: DownloadRow): boolean {
  return imageryMetaSchema.safeParse(row.meta.imagery).success;
}

export function createImageryService(ctx: AppContext, deps: ImageryDeps): ImageryService {
  const { collections, downloads, storage } = ctx.services;
  const worldEntries = deps.worldEntries ?? WORLD_ENTRIES;
  const sentinelHost = deps.endpoints?.sentinelHost ?? SENTINEL_HOST;
  const nasaHost = deps.endpoints?.nasaHost ?? NASA_HOST;
  /** Scenes found by recent searches, by the key of their pass: what an estimate or a start may name. */
  const found = new Map<string, { scenes: Scene[]; at: number }>();

  function setOf(row: CollectionRow): ImagerySet | undefined {
    const map = row.meta.map;
    const parsed = setMetaSchema.safeParse(row.meta.imagery);
    if (!map || !parsed.success) return undefined;
    const meta = parsed.data;
    const location = storage.list().find((entry) => entry.id === row.locationId);
    return {
      id: row.id,
      name: row.title,
      source: meta.source,
      bounds: map.bounds,
      minZoom: map.minZoom,
      maxZoom: map.maxZoom,
      imageDate: meta.imageDate,
      imageDateText: meta.imageDateText,
      sceneCloudPercent: meta.sceneCloudPercent,
      areaCloudPercent: meta.areaCloudPercent,
      scenes: meta.scenes,
      resolutionMeters: meta.resolutionMeters,
      sizeBytes: row.sizeBytes,
      transferredBytes: meta.transferredBytes,
      installedAt: row.installedAt,
      locationId: row.locationId,
      locationName: location?.name ?? "Unknown location",
      available: location?.status === "available",
      status: row.status,
      attribution: row.attribution ?? "",
    };
  }

  function sets(): ImagerySet[] {
    return collections
      .list({ kind: "map" })
      .filter(isImagery)
      .map(setOf)
      .filter((set): set is ImagerySet => Boolean(set));
  }

  async function freeBytesOf(locationId: string): Promise<number | null> {
    const location = storage.get(locationId);
    try {
      const stats = await fs.promises.statfs(location.path);
      return stats.bavail * stats.bsize;
    } catch {
      return null;
    }
  }

  function scenesFor(key: string): Scene[] {
    const entry = found.get(key);
    if (!entry || Date.now() - entry.at > SEARCH_TTL_MS) {
      throw new AppError("not_found", "That choice of picture has expired. Find pictures for the area again.");
    }
    return entry.scenes;
  }

  function locationFor(locationId: string | undefined) {
    const location = locationId ? storage.get(locationId) : storage.getDefault();
    if (!storage.isAvailable(location.id)) {
      throw new AppError("storage_unavailable", `"${location.name}" is not connected. Reconnect it, or choose another storage location.`, {
        locationId: location.id,
      });
    }
    return location;
  }

  const service: ImageryService = {
    overview() {
      const active = downloads.list().filter((row) => ["queued", "running", "paused", "verifying"].includes(row.state));
      const installedWorld = new Set(
        sets()
          .filter((set) => set.source === "blue-marble")
          .map((set) => {
            const row = collections.get(set.id);
            return typeof row?.meta.worldEntryId === "string" ? row.meta.worldEntryId : "";
          }),
      );
      return {
        sets: sets(),
        world: worldEntries.map((entry) => {
          const transferBytes = entry.files.reduce((sum, file) => sum + file.bytes, 0);
          const estimatedSizeBytes = worldTileCount(entry.maxZoom) * entry.bytesPerTile;
          const downloading = active.find((row) => {
            const meta = worldMetaSchema.safeParse(row.meta.imagery);
            return meta.success && meta.data.entryId === entry.id;
          });
          return {
            id: entry.id,
            name: entry.name,
            description: entry.description,
            resolutionMeters: entry.resolutionMeters,
            maxZoom: entry.maxZoom,
            transferBytes,
            estimatedSizeBytes,
            workingBytes: transferBytes + estimatedSizeBytes,
            installed: installedWorld.has(entry.id),
            downloadId: downloading?.id ?? null,
          };
        }),
        sources: SOURCES,
        limits: AREA_LIMITS,
      };
    },

    styleSources() {
      return (
        sets()
          .filter((set) => set.available && (set.status === "installed" || set.status === "moving"))
          // Coarsest first, so the most detailed is drawn on top; among equals the larger first.
          .sort(
            (a, b) =>
              a.maxZoom - b.maxZoom ||
              (b.bounds[2] - b.bounds[0]) * (b.bounds[3] - b.bounds[1]) - (a.bounds[2] - a.bounds[0]) * (a.bounds[3] - a.bounds[1]) ||
              a.installedAt - b.installedAt,
          )
          .map((set) => ({
            id: set.id,
            tiles: [`/api/maps/imagery/${set.id}/{z}/{x}/{y}.webp`],
            minzoom: set.minZoom,
            maxzoom: set.maxZoom,
            bounds: set.bounds,
            attribution: set.attribution,
            imageDateText: set.imageDateText,
          }))
      );
    },

    async search(input, signal) {
      const today = new Date();
      const to = input.to ?? today.toISOString().slice(0, 10);
      const yearBack = new Date(today.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
      const from = input.from ?? yearBack;
      if (from > to) throw badRequest("The first date is after the last.");
      const scenes = await searchScenes(
        deps.client,
        { bbox: input.bbox, from, to, maxCloud: 80, limit: 100 },
        { url: deps.endpoints?.stacSearchUrl, host: sentinelHost, signal },
      );
      // Only scenes whose files are on the public bucket are ever offered.
      const usable = scenes.filter((scene) =>
        [scene.bands.red, scene.bands.green, scene.bands.blue].every((href) => hostOf(href) === sentinelHost),
      );
      const passes = passesOf(usable, input.bbox).slice(0, 20);
      const now = Date.now();
      for (const [key, entry] of found) if (now - entry.at > SEARCH_TTL_MS) found.delete(key);
      for (const pass of passes) found.set(pass.key, { scenes: pass.scenes, at: now });
      return {
        bbox: input.bbox,
        areaKm2: Math.round(areaKm2(input.bbox) * 10) / 10,
        options: passes.map(({ scenes: _scenes, ...option }) => option),
        from,
        to,
        searchedAt: now,
      };
    },

    async estimate(input, signal) {
      const area = areaKm2(input.bbox);
      if (area > AREA_LIMITS.maxKm2) {
        const warning = areaWarning({
          areaKm2: area,
          transferBytes: 0,
          sizeBytes: 0,
          seconds: { low: 0, high: 0 },
          scenes: 1,
          coveragePercent: 100,
        });
        throw badRequest(warning.message ?? "That area is too large.");
      }
      const scenes = scenesFor(input.sceneKey);
      const location = locationFor(input.locationId);
      const fetcher = createRangeFetcher({ client: deps.client, allowedHosts: [sentinelHost], signal });
      const plan = await planSentinel(fetcher, input.bbox, scenes);
      const cloud = await areaCloud(fetcher, input.bbox, scenes).catch(() => null);
      const option = passesOf(scenes, input.bbox)[0]!;
      const { scenes: _scenes, ...scene } = option;
      const transferBytes = plan.tileBytes + plan.headerBytes;
      const estimatedSizeBytes = plan.outputTiles * SENTINEL_BYTES_PER_TILE;
      const build = (plan.outputTiles * MS_PER_TILE) / 1000;
      const seconds = {
        low: Math.round(transferBytes / (50e6 / 8) + build),
        high: Math.round(transferBytes / (10e6 / 8) + build * 4),
      };
      return {
        bbox: input.bbox,
        areaKm2: Math.round(area * 10) / 10,
        source: SENTINEL_2,
        scene: scene as SceneOption,
        minZoom: plan.minZoom,
        maxZoom: plan.maxZoom,
        transferBytes,
        requests: plan.tileRequests + plan.scenes.length * 3,
        estimatedSizeBytes,
        tileCount: plan.outputTiles,
        estimatedSeconds: seconds,
        areaCloudPercent: cloud,
        warning: areaWarning({
          areaKm2: area,
          transferBytes,
          sizeBytes: estimatedSizeBytes,
          seconds,
          scenes: scenes.length,
          coveragePercent: option.coveragePercent,
        }),
        freeBytes: await freeBytesOf(location.id),
        locationId: location.id,
        locationName: location.name,
      };
    },

    async startArea(input) {
      const area = areaKm2(input.bbox);
      const scenes = scenesFor(input.sceneKey);
      const option = passesOf(scenes, input.bbox)[0]!;
      const tiles = countOutputTiles(input.bbox, SENTINEL_MIN_ZOOM, Math.max(SENTINEL_MIN_ZOOM, sentinelMaxZoom(input.bbox)));
      const warning = areaWarning({
        areaKm2: area,
        transferBytes: 0,
        sizeBytes: 0,
        seconds: { low: 0, high: 0 },
        scenes: scenes.length,
        coveragePercent: option.coveragePercent,
      });
      if (warning.level === "refuse") throw badRequest(warning.message ?? "That area is too large.");
      if (warning.level === "warn" && !input.acceptLarge) {
        throw new AppError("bad_request", "This is a large area. Read the warning and confirm that you want it all.", {
          needsConfirmation: true,
        });
      }
      const location = locationFor(input.locationId);
      // The plan is made again by the job; here only what it may fetch is fixed, from a fresh look at the headers.
      const fetcher = createRangeFetcher({ client: deps.client, allowedHosts: [sentinelHost] });
      const plan = await planSentinel(fetcher, input.bbox, scenes);
      const sizeBytes = tiles * SENTINEL_BYTES_PER_TILE;
      const meta: ImageryMeta = {
        kind: "sentinel",
        bbox: input.bbox,
        scenes,
        date: option.date,
        areaCloudPercent: null,
        plannedBytes: plan.tileBytes + plan.headerBytes,
      };
      const row = await downloads.start({
        kind: "map",
        title: `Satellite: ${input.name}`,
        url: scenes[0]!.bands.red,
        locationId: location.id,
        relPath: `collections/maps/imagery-${slugify(input.name)}-${option.date.replaceAll("-", "")}.pmtiles`,
        // Room for the fetched parts of the scenes, kept until it is installed, and the archive.
        sizeBytes: meta.plannedBytes + sizeBytes,
        fetcher: IMAGERY_FETCHER,
        allowedHosts: [sentinelHost],
        meta: { imagery: meta, regionName: input.name },
      });
      ctx.events.publish({ type: "maps.changed" });
      return row;
    },

    async startWorld(input) {
      const entry = worldEntries.find((item) => item.id === input.entryId);
      if (!entry) throw new AppError("not_found", "There is no such world imagery.");
      const location = locationFor(input.locationId);
      const transferBytes = entry.files.reduce((sum, file) => sum + file.bytes, 0);
      const row = await downloads.start({
        kind: "map",
        title: `Satellite: ${entry.name}`,
        url: entry.files[0]!.url,
        locationId: location.id,
        relPath: `collections/maps/imagery-${entry.id}-200407.pmtiles`,
        sizeBytes: transferBytes + worldTileCount(entry.maxZoom) * entry.bytesPerTile,
        fetcher: IMAGERY_FETCHER,
        allowedHosts: [nasaHost],
        meta: { imagery: { kind: "world", entryId: entry.id } satisfies ImageryMeta, regionName: entry.name },
      });
      ctx.events.publish({ type: "maps.changed" });
      return row;
    },
  };

  // ── The job: fetch and build ──

  const sourceDirOf = (partPath: string) => `${partPath}.src`;

  async function fetchAndBuild(context: FetchContext): Promise<void> {
    const parsed = imageryMetaSchema.safeParse(context.download.meta.imagery);
    if (!parsed.success) throw new PermanentJobError("This imagery download is missing its details. Remove it and start it again.");
    const meta = parsed.data;
    const { partPath, signal } = context;
    const dir = sourceDirOf(partPath);
    const previous = typeof context.download.meta.transferredBytes === "number" ? context.download.meta.transferredBytes : 0;
    const total = context.download.totalBytes ?? 0;

    if (meta.kind === "world") {
      const entry = worldEntries.find((item) => item.id === meta.entryId);
      if (!entry) throw new PermanentJobError("This version of Outpost no longer knows that world imagery.");
      const fetcher = createRangeFetcher({ client: deps.client, allowedHosts: [nasaHost], signal, throttle: context.throttle });
      const transferTotal = entry.files.reduce((sum, file) => sum + file.bytes, 0);
      try {
        await fetchWorldFiles(entry, fetcher, dir, {
          signal,
          onProgress: (have, all) =>
            context.progress(have, total || null, `Fetching NASA's picture: ${megabytes(have)} of ${megabytes(all)}`),
        });
      } finally {
        context.remember({ meta: { transferredBytes: previous + fetcher.transfer.bytes } });
      }
      const writer = await ImageArchiveWriter.create(partPath);
      try {
        await buildWorld(entry, dir, writer, {
          signal,
          onProgress: ({ tilesWritten, tilesTotal }) =>
            context.progress(
              transferTotal + Math.round((tilesWritten / tilesTotal) * (total - transferTotal)),
              total || null,
              `Making map tiles: ${tilesWritten.toLocaleString("en-GB")} of ${tilesTotal.toLocaleString("en-GB")}`,
            ),
        });
        await writer.finish({
          bounds: [-180, -85.0511287798066, 180, 85.0511287798066],
          minZoom: 0,
          maxZoom: entry.maxZoom,
          metadata: { name: entry.name, attribution: BLUE_MARBLE_ATTRIBUTION, source: "blue-marble", date: "2004-07" },
        });
      } catch (error) {
        await writer.abandon();
        throw error;
      }
      return;
    }

    const fetcher = createRangeFetcher({
      client: deps.client,
      allowedHosts: [sentinelHost],
      cacheDir: dir,
      signal,
      throttle: context.throttle,
    });
    try {
      const plan = await planSentinel(fetcher, meta.bbox as Bbox, meta.scenes);
      // The publisher's files are not expected to change; if they now need more than was shown, stop and say so.
      if (plan.tileBytes + plan.headerBytes > meta.plannedBytes * 1.1 + 1_000_000) {
        throw new PermanentJobError(
          `The scene's files now need ${megabytes(plan.tileBytes)} where ${megabytes(meta.plannedBytes)} was shown before starting. Outpost stopped rather than fetch more than you agreed to. Remove this download and choose the area again.`,
        );
      }
      const cloud = await areaCloud(fetcher, meta.bbox as Bbox, meta.scenes).catch(() => null);
      context.remember({ meta: { imagery: { ...meta, areaCloudPercent: cloud } } });
      const writer = await ImageArchiveWriter.create(partPath);
      try {
        await buildSentinel(plan, fetcher, writer, {
          signal,
          onProgress: ({ tilesWritten, tilesTotal, message }) =>
            context.progress(
              Math.min(total, fetcher.transfer.bytes + Math.round((tilesWritten / Math.max(1, tilesTotal)) * (total - meta.plannedBytes))),
              total || null,
              `${message} (${megabytes(previous + fetcher.transfer.bytes)} fetched)`,
            ),
        });
        await writer.finish({
          bounds: meta.bbox as Bbox,
          minZoom: plan.minZoom,
          maxZoom: plan.maxZoom,
          metadata: { source: "sentinel-2", date: meta.date, scenes: meta.scenes.map((scene) => scene.id) },
        });
      } catch (error) {
        await writer.abandon();
        throw error;
      }
    } finally {
      context.remember({ meta: { transferredBytes: previous + fetcher.transfer.bytes } });
    }
  }

  downloads.registerFetcher(IMAGERY_FETCHER, fetchAndBuild);

  // A removed download takes the parts it fetched with it.
  const partials = new Map<string, { locationId: string; relPath: string }>();
  for (const row of downloads.list())
    if (isImageryDownload(row) && row.state !== "completed") partials.set(row.id, { locationId: row.locationId, relPath: row.relPath });
  const unsubscribe = ctx.events.subscribe((event) => {
    if (event.type === "download.updated" && event.data) {
      const row = event.data as DownloadRow;
      if (row.meta && isImageryDownload(row) && row.state !== "completed")
        partials.set(row.id, { locationId: row.locationId, relPath: row.relPath });
    }
    if (event.type !== "download.removed" || !event.id) return;
    const partial = partials.get(event.id);
    partials.delete(event.id);
    if (!partial || !storage.isAvailable(partial.locationId)) return;
    const dir = sourceDirOf(`${storage.resolve(partial.locationId, partial.relPath)}.part`);
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });
  ctx.onClose.push(async () => unsubscribe());

  return service;
}

/** Turns a finished imagery download into a map collection marked as imagery. */
export function createImageryInstaller(ctx: AppContext, worldEntries: WorldEntry[] = WORLD_ENTRIES): Installer {
  return async ({ download, filePath, sizeBytes, sha256 }) => {
    const meta = imageryMetaSchema.parse(download.meta.imagery);
    const header = await readLocalHeader(filePath);
    if (header.tileType !== TileType.Webp)
      throw new PermanentJobError("The imagery archive was not made as expected. Nothing was installed.");
    const transferredBytes = typeof download.meta.transferredBytes === "number" ? download.meta.transferredBytes : null;
    const map = {
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat] as [number, number, number, number],
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      tileType: "imagery" as const,
      format: "pmtiles" as const,
    };
    let imagery: z.infer<typeof setMetaSchema>;
    let attribution: string;
    let title: string;
    let source: ImagerySourceId;
    if (meta.kind === "world") {
      const entry = worldEntries.find((item) => item.id === meta.entryId);
      source = "blue-marble";
      title = entry?.name ?? "The world";
      attribution = BLUE_MARBLE_ATTRIBUTION;
      imagery = {
        source,
        imageDate: "2004-07",
        imageDateText: "July 2004",
        sceneCloudPercent: null,
        areaCloudPercent: null,
        scenes: ["world.topo.bathy.200407"],
        resolutionMeters: entry?.resolutionMeters ?? BLUE_MARBLE.resolutionMeters,
        transferredBytes,
      };
    } else {
      source = "sentinel-2";
      const [year] = meta.date.split("-");
      const dateText = dayText(meta.date);
      title = typeof download.meta.regionName === "string" ? download.meta.regionName : download.title;
      attribution = sentinelAttribution(dateText, year!);
      imagery = {
        source,
        imageDate: meta.date,
        imageDateText: dateText,
        sceneCloudPercent: Math.max(...meta.scenes.map((scene) => scene.cloudCover)),
        areaCloudPercent: meta.areaCloudPercent,
        scenes: meta.scenes.map((scene) => scene.id),
        resolutionMeters: SENTINEL_2.resolutionMeters,
        transferredBytes,
      };
    }
    const info = source === "blue-marble" ? BLUE_MARBLE : SENTINEL_2;
    const collection = await ctx.services.collections.create({
      kind: "map",
      title,
      description: `Satellite imagery, ${imagery.imageDateText}`,
      category: "Maps",
      publisher: info.publisher,
      license: info.licence,
      attribution,
      version: imagery.imageDate,
      locationId: download.locationId,
      relPath: download.relPath,
      sizeBytes,
      sha256,
      meta: { map, imagery, ...(meta.kind === "world" ? { worldEntryId: meta.entryId } : {}) },
    });
    // The fetched parts of the publisher's files are no longer needed.
    await fs.promises.rm(`${filePath}.part.src`, { recursive: true, force: true }).catch(() => undefined);
    ctx.events.publish({ type: "maps.changed" });
    return { collectionId: collection.id };
  };
}

type TileParams = { Params: { id: string; z: string; x: string; file: string } };

export function registerImagery(app: FastifyInstance, ctx: AppContext, deps: ImageryDeps): ImageryService {
  const service = createImageryService(ctx, deps);
  const { collections } = ctx.services;

  // Archives open at once for imagery; each holds a file handle.
  const open = new Map<string, Promise<LocalArchive | null>>();
  const release = async (id: string) => {
    const pending = open.get(id);
    open.delete(id);
    const archive = await pending?.catch(() => null);
    await archive?.close().catch(() => undefined);
  };
  collections.onRemoved(async (row) => {
    if (open.has(row.id)) await release(row.id);
  });
  collections.onMoved(async (row) => {
    if (open.has(row.id)) await release(row.id);
  });
  ctx.onClose.push(async () => {
    await Promise.all([...open.keys()].map(release));
  });

  async function archiveFor(row: CollectionRow): Promise<LocalArchive | null> {
    let pending = open.get(row.id);
    if (!pending) {
      pending = LocalArchive.open(collections.absolutePath(row.id)).catch((error: unknown) => {
        ctx.log.warn({ err: error, collection: row.id }, "imagery archive could not be opened");
        setTimeout(() => open.delete(row.id), 5_000).unref();
        return null;
      });
      open.set(row.id, pending);
      while (open.size > 16) {
        const oldest = open.keys().next().value;
        if (oldest === undefined || oldest === row.id) break;
        void release(oldest);
      }
    }
    return pending;
  }

  app.get("/api/maps/imagery", async () => service.overview());

  app.post("/api/maps/imagery/scenes", async (request) => service.search(sceneSearchSchema.parse(request.body)));

  app.post("/api/maps/imagery/estimate", async (request) => service.estimate(areaEstimateSchema.parse(request.body)));

  app.post("/api/maps/imagery/areas", async (request) => {
    const row = await service.startArea(areaStartSchema.parse(request.body));
    return { download: ctx.services.downloads.toDto(row) };
  });

  app.post("/api/maps/imagery/world", async (request) => {
    const row = await service.startWorld(worldStartSchema.parse(request.body));
    return { download: ctx.services.downloads.toDto(row) };
  });

  app.get<TileParams>("/api/maps/imagery/:id/:z/:x/:file", async (request, reply) => {
    const { id, z, x, file } = request.params;
    const match = /^(\d{1,8})\.webp$/.exec(file);
    if (!match || !/^\d{1,2}$/.test(z) || !/^\d{1,8}$/.test(x) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new AppError("not_found", "That is not an imagery tile address.");
    }
    const row = collections.get(id);
    if (
      !row ||
      !isImagery(row) ||
      (row.status !== "installed" && row.status !== "moving") ||
      !ctx.services.storage.isAvailable(row.locationId)
    ) {
      throw new AppError("not_found", "That imagery is not installed.");
    }
    const raw = (request.query as { raw?: unknown }).raw === "1";
    reply.header("Cache-Control", raw ? "no-store" : "private, max-age=3600");
    const archive = await archiveFor(row);
    const data = await archive?.getTile(Number(z), Number(x), Number(match[1])).catch((error: unknown) => {
      ctx.log.warn({ err: error, collection: id }, "imagery tile could not be read");
      void release(id);
      return undefined;
    });
    // As for map tiles: 204 is "nothing here", and the map draws the imagery beneath instead.
    if (!data) return reply.status(204).send();
    return reply.header("Content-Type", "image/webp").send(data);
  });

  return service;
}
