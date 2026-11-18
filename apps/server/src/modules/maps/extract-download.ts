/**
 * The maps module's side of the download manager: a fetcher that fills a download's
 * partial file by extracting a region from a remote PMTiles archive, and installers
 * that turn the finished archive into a `map` or `terrain` collection.
 */
import type { Bbox } from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import type { HttpClient } from "../../core/http.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import type { CollectionMeta } from "../../db/schema.ts";
import type { DownloadRow, FetchContext, Fetcher, Installer } from "../downloads/types.ts";
import type { Planner } from "./planner.ts";
import { extractArchive, removeExtractSidecars } from "./pmtiles/extract.ts";
import { PmtilesError, TileType } from "./pmtiles/header.ts";
import type { ExtractRequest } from "./pmtiles/plan.ts";
import { readLocalHeader } from "./pmtiles/reader.ts";
import { createRemoteArchive, SourceChangedError, SourceGoneError } from "./pmtiles/remote.ts";
import { attributionFor, buildOfUrl, hostOf, type SourceResolver } from "./source.ts";

export const EXTRACT_FETCHER = "pmtiles-extract";

const coordinate = z.number().finite();

/** What a `pmtiles-extract` download carries in its `meta`. */
export const extractMetaSchema = z.object({
  bbox: z.tuple([coordinate, coordinate, coordinate, coordinate]),
  minZoom: z.number().int().min(0).max(26),
  maxZoom: z.number().int().min(0).max(26),
  tileType: z.enum(["vector", "terrain"]),
  regionId: z.string().optional(),
  regionName: z.string().min(1),
  sourceBuild: z.string().nullish(),
  /** The address is the newest daily build; if it disappears, move on to the next one. */
  followsNewest: z.boolean().optional(),
  /** Set when the original build went away and the download moved to a newer one. */
  sourceUrl: z.string().optional(),
});
export type ExtractMeta = z.infer<typeof extractMetaSchema>;

function metaOf(download: DownloadRow): ExtractMeta {
  const parsed = extractMetaSchema.safeParse(download.meta);
  if (!parsed.success) throw new PermanentJobError("This map download is missing the details of its region. Remove it and start it again.");
  return parsed.data;
}

export interface ExtractFetcherDeps {
  client: HttpClient;
  planner: Planner;
  sources: SourceResolver;
  /** Tile-data requests in flight at once. */
  concurrency?: number;
}

/** How many times one run starts over because the source changed under it. */
const MAX_RESTARTS = 2;

export function createExtractFetcher(deps: ExtractFetcherDeps): Fetcher {
  return async function fetchExtract(context: FetchContext): Promise<void> {
    const { download, partPath, signal } = context;
    let meta = metaOf(download);
    let url = meta.sourceUrl ?? download.url;
    const request: ExtractRequest = { bbox: meta.bbox as Bbox, minZoom: meta.minZoom, maxZoom: meta.maxZoom };
    let notice: string | undefined;

    try {
      for (let restarts = 0; ; restarts += 1) {
        const archive = createRemoteArchive(deps.client, url, { allowedHosts: [hostOf(url)] });
        try {
          const result = await extractArchive({
            archive,
            request,
            partPath,
            signal,
            concurrency: deps.concurrency,
            throttle: (bytes) => context.throttle(bytes),
            // What is written is recorded as it is, for the download manager to hold the finished file against.
            written: context.written,
            plan: () => deps.planner.planFor(archive, request, signal),
            onProgress: ({ writtenBytes, totalBytes, message }) => {
              // Why the download began again matters more than "reading the index".
              context.progress(writtenBytes, totalBytes > 0 ? totalBytes : null, notice ?? message);
            },
          });
          context.remember({ etag: result.etag });
          return;
        } catch (error) {
          if (signal.aborted || restarts >= MAX_RESTARTS) throw error;
          if (error instanceof SourceChangedError) {
            // Bytes from two different archives must never be mixed: begin again.
            await removeExtractSidecars(partPath);
            notice = "The map source was updated while downloading, so the download started again.";
            continue;
          }
          if (error instanceof SourceGoneError && meta.followsNewest) {
            const newest = await deps.sources.resolve(meta.tileType, signal);
            if (newest.url === url) throw error;
            await removeExtractSidecars(partPath);
            url = newest.url;
            meta = { ...meta, sourceUrl: newest.url, sourceBuild: newest.build ?? buildOfUrl(newest.url) };
            context.remember({ meta: { sourceUrl: meta.sourceUrl, sourceBuild: meta.sourceBuild } });
            notice = "That day's map build is no longer published, so the download started again from the newest one.";
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof SourceGoneError) {
        throw new PermanentJobError(
          "The map source is no longer available at its address. Remove this download and start the region again.",
          "not_found",
        );
      }
      if (error instanceof SourceChangedError) {
        throw new Error("The map source kept changing while it was being downloaded. Outpost will try again.");
      }
      throw error;
    }
  };
}

/** `meta.map` for a collection, read from the archive itself rather than trusted from the request. */
export async function describeArchive(
  filePath: string,
  tileType: "vector" | "terrain",
  sourceBuild: string | null | undefined,
): Promise<NonNullable<CollectionMeta["map"]>> {
  const header = await readLocalHeader(filePath);
  return {
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
    tileType,
    ...(sourceBuild ? { sourceBuild } : {}),
    format: "pmtiles",
  };
}

/** True when the archive's tiles are what a collection of this kind is expected to hold. */
export function tileTypeMatches(header: { tileType: number }, tileType: "vector" | "terrain"): boolean {
  if (tileType === "vector") return header.tileType === TileType.Mvt;
  return header.tileType === TileType.Webp || header.tileType === TileType.Png;
}

/**
 * Installer for finished `map` and `terrain` downloads. Extracts carry their region in
 * `meta`; an archive fetched whole (from a catalogue entry, say) carries none, so
 * everything that matters is read from the archive itself.
 */
export function createTilesInstaller(ctx: AppContext, kind: "map" | "terrain"): Installer {
  const tileType = kind === "map" ? "vector" : "terrain";
  return async ({ download, filePath, sizeBytes, sha256 }) => {
    const extract = extractMetaSchema.safeParse(download.meta);
    const meta = extract.success ? extract.data : undefined;
    const given = (key: string) =>
      typeof download.meta[key] === "string" && download.meta[key] ? (download.meta[key] as string) : undefined;

    let map: NonNullable<CollectionMeta["map"]>;
    try {
      if (!tileTypeMatches(await readLocalHeader(filePath), tileType)) {
        throw new PmtilesError(
          kind === "map"
            ? "The downloaded archive does not hold vector map tiles."
            : "The downloaded archive does not hold terrain image tiles.",
        );
      }
      map = await describeArchive(filePath, tileType, meta?.sourceBuild ?? given("version"));
    } catch (error) {
      // A file that is not a usable archive will not become one by trying again.
      if (error instanceof PmtilesError) throw new PermanentJobError(`${error.message} Nothing was installed.`);
      throw error;
    }

    const attribution = attributionFor(tileType);
    const collection = await ctx.services.collections.create({
      kind,
      title: meta?.regionName ?? given("title") ?? download.title,
      description: given("description") ?? (kind === "map" ? "Offline map tiles" : "Offline terrain (elevation) tiles"),
      category: "Maps",
      publisher: given("publisher") ?? attribution.name,
      license: given("license") ?? attribution.license,
      attribution: given("attribution") ?? attribution.html,
      version: map.sourceBuild ?? null,
      catalogEntryId: download.catalogEntryId,
      locationId: download.locationId,
      relPath: download.relPath,
      sizeBytes,
      sha256,
      meta: { map, ...(meta?.regionId ? { regionId: meta.regionId } : {}) },
    });
    ctx.events.publish({ type: "maps.changed" });
    return { collectionId: collection.id };
  };
}
