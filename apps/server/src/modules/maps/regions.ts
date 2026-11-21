/**
 * Map regions: the ready-made list people choose from, the size estimate shown before
 * a download, starting the download, and adopting an archive that is already on disk.
 */
import fs from "node:fs";
import path from "node:path";
import type { Bbox, MapEstimate, MapRegionPreset, MapRegionsResponse, MapTileType } from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";
import { defaultCatalogDir } from "../../core/paths.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow } from "../downloads/types.ts";
import { describeArchive, EXTRACT_FETCHER, type ExtractMeta, tileTypeMatches } from "./extract-download.ts";
import { assertDownloadable, assertPlannable, type Planner } from "./planner.ts";
import { PmtilesError, type PmtilesHeader } from "./pmtiles/header.ts";
import type { ExtractRequest } from "./pmtiles/plan.ts";
import { readLocalHeader } from "./pmtiles/reader.ts";
import { MAX_LATITUDE } from "./pmtiles/tiles.ts";
import { attributionFor, type SourceResolver, todayStamp } from "./source.ts";

/** The terrain source stops at zoom 12; asking for more only wastes a request. */
export const TERRAIN_MAX_ZOOM = 12;
const REGIONS_FILE = "map-regions.json";

const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: z.string().min(1),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  recommendedMaxZoom: z.number().int().min(0).max(15),
  note: z.string().optional(),
});

export const bboxSchema = z
  .tuple([
    z.number().finite().min(-180, "West must be between -180 and 180.").max(180, "West must be between -180 and 180."),
    z.number().finite().min(-90, "South must be between -90 and 90.").max(90, "South must be between -90 and 90."),
    z.number().finite().min(-180, "East must be between -180 and 180.").max(180, "East must be between -180 and 180."),
    z.number().finite().min(-90, "North must be between -90 and 90.").max(90, "North must be between -90 and 90."),
  ])
  .superRefine(([west, south, east, north], context) => {
    if (south >= north) context.addIssue({ code: "custom", message: "The box is upside down: south must be less than north." });
    if (west >= east) {
      context.addIssue({
        code: "custom",
        message:
          "West must be less than east. An area that crosses the 180° meridian has to be downloaded as two regions, one on each side.",
      });
    }
    if (south >= MAX_LATITUDE || north <= -MAX_LATITUDE) {
      context.addIssue({ code: "custom", message: "That box lies beyond the edge of the map (85° north or south)." });
    }
  });

const zoom = z
  .number()
  .int("Zoom levels are whole numbers.")
  .min(0, "Zoom levels run from 0 to 15.")
  .max(15, "Zoom levels run from 0 to 15.");

export const estimateSchema = z
  .object({
    bbox: bboxSchema,
    minZoom: zoom.optional(),
    maxZoom: zoom,
    tileType: z.enum(["vector", "terrain"]).optional(),
  })
  .refine((value) => (value.minZoom ?? 0) <= value.maxZoom, {
    message: "The minimum zoom cannot be greater than the maximum zoom.",
    path: ["minZoom"],
  });

export const startRegionSchema = z
  .object({
    name: z.string().trim().min(1, "Give the region a name.").max(120),
    regionId: z.string().trim().min(1).max(120).optional(),
    bbox: bboxSchema,
    minZoom: zoom.optional(),
    maxZoom: zoom,
    locationId: z.string().min(1).optional(),
    includeTerrain: z.boolean().optional(),
    /** Where the terrain goes when not with the map: where new terrain is set to go (Storage). */
    terrainLocationId: z.string().min(1).optional(),
  })
  .refine((value) => (value.minZoom ?? 0) <= value.maxZoom, {
    message: "The minimum zoom cannot be greater than the maximum zoom.",
    path: ["minZoom"],
  });

export const importSchema = z.object({
  locationId: z.string().min(1),
  relPath: z.string().min(1).max(1000),
  name: z.string().trim().min(1, "Give the map a name.").max(120),
  /** Image tiles are only accepted as terrain when the person says that is what they are. */
  tileType: z.enum(["vector", "terrain"]).optional(),
});

export interface RegionsService {
  presets(): MapRegionPreset[];
  list(): MapRegionsResponse;
  estimate(input: z.infer<typeof estimateSchema>, signal?: AbortSignal): Promise<MapEstimate>;
  start(input: z.infer<typeof startRegionSchema>, signal?: AbortSignal): Promise<DownloadRow[]>;
  importArchive(input: z.infer<typeof importSchema>): Promise<CollectionRow>;
}

/** A name reduced to something safe and readable in a file name. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "region";
}

function loadPresets(ctx: AppContext): MapRegionPreset[] {
  // A deployment's own catalogue folder wins; the list shipped with Outpost is the fallback.
  const candidates = [path.join(ctx.config.catalogDir, REGIONS_FILE), path.join(defaultCatalogDir, REGIONS_FILE)];
  for (const file of candidates) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = z.object({ regions: z.array(presetSchema) }).parse(JSON.parse(text));
      return parsed.regions as MapRegionPreset[];
    } catch (error) {
      ctx.log.error({ err: error, file }, "map region list could not be read");
    }
  }
  return [];
}

export function createRegionsService(ctx: AppContext, deps: { planner: Planner; sources: SourceResolver }): RegionsService {
  const { storage, collections, downloads, settings } = ctx.services;
  let presets: MapRegionPreset[] | undefined;

  const requestOf = (input: { bbox: Bbox; minZoom?: number; maxZoom: number }, tileType: MapTileType): ExtractRequest => ({
    bbox: input.bbox,
    minZoom: input.minZoom ?? 0,
    maxZoom: tileType === "terrain" ? Math.min(input.maxZoom, TERRAIN_MAX_ZOOM) : input.maxZoom,
  });

  async function plan(tileType: MapTileType, request: ExtractRequest, signal?: AbortSignal) {
    assertPlannable(request);
    const source = await deps.sources.resolve(tileType, signal);
    const summary = await deps.planner.summary(source.url, request, signal);
    assertDownloadable(summary);
    return { source, summary };
  }

  const service: RegionsService = {
    presets() {
      presets ??= loadPresets(ctx);
      return presets;
    },

    list() {
      const installed = new Map<string, string[]>();
      for (const row of collections.list({ kind: "map" })) {
        const regionId = row.meta.regionId;
        if (typeof regionId === "string") installed.set(regionId, [...(installed.get(regionId) ?? []), row.id]);
      }
      const downloading = new Map<string, string>();
      for (const row of downloads.list()) {
        const regionId = row.meta.regionId;
        const active = row.state === "queued" || row.state === "running" || row.state === "paused" || row.state === "verifying";
        if (row.kind === "map" && active && typeof regionId === "string") downloading.set(regionId, row.id);
      }
      const groups = new Map<string, MapRegionsResponse["groups"][number]>();
      for (const preset of service.presets()) {
        const group = groups.get(preset.group) ?? { name: preset.group, regions: [] };
        const collectionIds = installed.get(preset.id) ?? [];
        group.regions.push({
          ...preset,
          installed: collectionIds.length > 0,
          collectionIds,
          downloadId: downloading.get(preset.id) ?? null,
        });
        groups.set(preset.group, group);
      }
      return { groups: [...groups.values()] };
    },

    async estimate(input, signal) {
      const tileType = input.tileType ?? "vector";
      const { source, summary } = await plan(tileType, requestOf(input, tileType), signal);
      return { ...summary, sourceBuild: source.build, sourceUrl: source.url, attribution: attributionFor(tileType).html };
    },

    async start(input, signal) {
      // Chosen in the download's own picker, or where each kind is set to go (Storage).
      const locationOf = (tileType: MapTileType) => {
        const chosen = tileType === "terrain" ? (input.terrainLocationId ?? input.locationId) : input.locationId;
        return chosen ? storage.get(chosen) : storage.defaultFor(tileType === "terrain" ? "terrain" : "maps");
      };
      const kinds: MapTileType[] = input.includeTerrain ? ["vector", "terrain"] : ["vector"];
      for (const tileType of kinds) {
        const location = locationOf(tileType);
        if (!storage.isAvailable(location.id)) {
          throw new AppError(
            "storage_unavailable",
            `"${location.name}" is not connected. Reconnect it, or choose another storage location.`,
            { locationId: location.id },
          );
        }
      }
      const planned = [];
      for (const tileType of kinds)
        planned.push({ tileType, request: requestOf(input, tileType), ...(await plan(tileType, requestOf(input, tileType), signal)) });

      // Both parts must fit before either starts, so a region is never left half there.
      const needed = new Map<string, number>();
      for (const part of planned) {
        const id = locationOf(part.tileType).id;
        needed.set(id, (needed.get(id) ?? 0) + part.summary.sizeBytes);
      }
      for (const [id, bytes] of needed) await storage.assertSpace(id, bytes);

      const slug = slugify(input.name);
      const started: DownloadRow[] = [];
      for (const part of planned) {
        const terrain = part.tileType === "terrain";
        const build = part.source.build ?? todayStamp();
        const meta: ExtractMeta = {
          bbox: part.request.bbox,
          // As asked for, not as narrowed to the source: the fetcher plans with the same
          // request, and so finds the plan just made instead of fetching it again.
          minZoom: part.request.minZoom,
          maxZoom: part.request.maxZoom,
          tileType: part.tileType,
          regionId: input.regionId,
          regionName: terrain ? `${input.name} (terrain)` : input.name,
          sourceBuild: part.source.build,
          followsNewest: part.source.followsNewest,
        };
        try {
          started.push(
            await downloads.start({
              kind: terrain ? "terrain" : "map",
              title: terrain ? `Terrain: ${input.name}` : `Map: ${input.name}`,
              url: part.source.url,
              locationId: locationOf(part.tileType).id,
              relPath: `collections/${terrain ? "terrain" : "maps"}/${slug}-${build}.pmtiles`,
              sizeBytes: part.summary.sizeBytes,
              fetcher: EXTRACT_FETCHER,
              allowedHosts: [part.source.host],
              meta,
            }),
          );
        } catch (error) {
          // The map itself is on its way; say so rather than fail the whole request.
          if (started.length > 0 && error instanceof AppError && error.code === "conflict") continue;
          if (error instanceof AppError && error.code === "conflict") {
            throw conflict(`“${input.name}” from this map build is already installed or downloading. ${error.message}`);
          }
          throw error;
        }
      }
      ctx.events.publish({ type: "maps.changed" });
      return started;
    },

    async importArchive(input) {
      if (!/\.pmtiles$/i.test(input.relPath)) throw badRequest("Choose a file that ends in .pmtiles.");
      const filePath = await storage.resolveFollowingLinks(input.locationId, input.relPath);
      const stat = await fs.promises.stat(filePath).catch(() => undefined);
      if (!stat?.isFile()) throw badRequest("There is no file at that place in the storage location.");

      let header: PmtilesHeader;
      try {
        header = await readLocalHeader(filePath);
      } catch (error) {
        if (error instanceof PmtilesError) throw badRequest(error.message);
        throw error;
      }
      const tileType: MapTileType = input.tileType ?? "vector";
      if (!tileTypeMatches(header, tileType)) {
        throw badRequest(
          tileType === "vector"
            ? "This archive holds image tiles, not vector map tiles. If it is elevation data in Terrarium encoding, import it as terrain instead."
            : "This archive does not hold WebP or PNG image tiles, so it cannot be used as terrain.",
        );
      }
      const attribution = attributionFor(tileType);
      const collection = await collections.create({
        kind: tileType === "vector" ? "map" : "terrain",
        title: input.name,
        description: "Imported map archive",
        category: "Maps",
        // Outpost cannot know who made an imported archive; the map still credits the usual source.
        attribution: attribution.html,
        locationId: input.locationId,
        relPath: input.relPath,
        sizeBytes: stat.size,
        meta: { map: await describeArchive(filePath, tileType, undefined), imported: true },
      });
      ctx.events.publish({ type: "maps.changed" });
      return collection;
    },
  };

  // Changing the source changes every estimate.
  settings.onChange(() => deps.planner.clear());
  return service;
}
