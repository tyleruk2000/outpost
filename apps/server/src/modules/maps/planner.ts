/**
 * Plans for regional extracts, remembered for a few minutes.
 *
 * The same plan is needed three times in quick succession: for the size shown before a
 * download, for the free-space check when the download is started, and by the download
 * itself. Planning means fetching directories from the remote archive, so the result is
 * kept briefly rather than fetched three times over.
 */
import { createHash } from "node:crypto";
import type { MapEstimate } from "@outpost/shared";
import { AppError, networkSentence } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { HEADER_BYTES } from "./pmtiles/header.ts";
import { type ExtractPlan, type ExtractRequest, type PlanOptions, planExtract } from "./pmtiles/plan.ts";
import { createRemoteArchive, type RemoteArchive, SourceGoneError } from "./pmtiles/remote.ts";
import { countTilesInBbox } from "./pmtiles/tiles.ts";
import { hostOf } from "./source.ts";

/** Largest extract Outpost will make in one go. */
export const MAX_EXTRACT_BYTES = 60 * 1024 ** 3;
/**
 * Largest box, in tile positions, that is planned at all. Planning holds the index of
 * every tile in the box in memory, at roughly 64 bytes a tile while it works. Over
 * dense land this limit is therefore a little over a gigabyte; over sea, where long
 * runs of tiles share one entry, far less. A country at full detail is a few million.
 */
export const MAX_PLAN_TILES = 20_000_000;
/** Full plans are kept only while they are small; larger ones are planned again when needed. */
const MAX_CACHED_PLAN_BYTES = 48 * 1024 * 1024;
const DEFAULT_TTL_MS = 5 * 60_000;

export type PlanSummary = Pick<MapEstimate, "sizeBytes" | "tileCount" | "requests" | "minZoom" | "maxZoom">;

interface CacheEntry {
  expires: number;
  etag: string | null;
  fingerprint: string;
  summary: PlanSummary;
  /** Rough memory the full plan takes, in bytes. */
  weight: number;
  plan?: ExtractPlan;
}

export interface Planner {
  /** The size and shape of an extract, from the cache when it is fresh. */
  summary(sourceUrl: string, request: ExtractRequest, signal?: AbortSignal): Promise<PlanSummary>;
  /**
   * The full plan for a download that is about to run. A remembered plan is used only
   * if the archive still is the one it was made from.
   */
  planFor(archive: RemoteArchive, request: ExtractRequest, signal?: AbortSignal): Promise<ExtractPlan>;
  clear(): void;
}

function summarise(plan: ExtractPlan): PlanSummary {
  return {
    sizeBytes: plan.outputSize,
    tileCount: plan.tileCount,
    requests: plan.requests.length,
    minZoom: plan.header.minZoom,
    maxZoom: plan.header.maxZoom,
  };
}

function gigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(bytes < 10 * 1024 ** 3 ? 1 : 0)} GB`;
}

/** Refuses boxes so large that even planning them would be unreasonable. */
export function assertPlannable(request: ExtractRequest): void {
  const tiles = countTilesInBbox(request.bbox, request.minZoom, request.maxZoom);
  if (tiles > MAX_PLAN_TILES) {
    throw new AppError(
      "too_large",
      `That area is too large to download at this detail in one go (about ${Math.round(tiles / 1e6)} million map tiles). Choose less detail under More choices, or split it into smaller areas.`,
      { tiles, maxTiles: MAX_PLAN_TILES },
    );
  }
}

export function assertDownloadable(summary: PlanSummary): void {
  if (summary.sizeBytes > MAX_EXTRACT_BYTES) {
    throw new AppError(
      "too_large",
      `That region would be about ${gigabytes(summary.sizeBytes)} at zoom ${summary.maxZoom}. Outpost downloads regions of up to ${gigabytes(MAX_EXTRACT_BYTES)}; lower the maximum zoom or choose a smaller area.`,
      { sizeBytes: summary.sizeBytes, maxBytes: MAX_EXTRACT_BYTES },
    );
  }
}

export function createPlanner(client: HttpClient, options: { ttlMs?: number; planOptions?: PlanOptions } = {}): Planner {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<CacheEntry>>();
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;

  const keyOf = (url: string, request: ExtractRequest) => `${url}|${request.bbox.join(",")}|${request.minZoom}|${request.maxZoom}`;

  function remember(key: string, plan: ExtractPlan, etag: string | null): CacheEntry {
    const now = Date.now();
    for (const [other, entry] of cache) if (entry.expires <= now) cache.delete(other);
    const weight = plan.entries.count * 24 + plan.head.length + plan.copies.length * 48 + plan.requests.length * 64;
    const entry: CacheEntry = {
      expires: now + ttl,
      etag,
      fingerprint: plan.sourceFingerprint,
      summary: summarise(plan),
      weight,
      plan: weight <= MAX_CACHED_PLAN_BYTES ? plan : undefined,
    };
    // Keep the remembered plans within the budget: oldest bodies go first, summaries stay.
    cache.delete(key);
    let held = entry.plan ? weight : 0;
    for (const other of [...cache.values()].reverse()) {
      if (!other.plan) continue;
      held += other.weight;
      if (held > MAX_CACHED_PLAN_BYTES) other.plan = undefined;
    }
    cache.set(key, entry);
    return entry;
  }

  async function make(
    key: string,
    archive: RemoteArchive,
    request: ExtractRequest,
    signal?: AbortSignal,
  ): Promise<{ entry: CacheEntry; plan: ExtractPlan }> {
    assertPlannable(request);
    const plan = await planExtract(archive.read, request, { ...options.planOptions, signal });
    return { entry: remember(key, plan, archive.etag()), plan };
  }

  return {
    async summary(sourceUrl, request, signal) {
      const key = keyOf(sourceUrl, request);
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return cached.summary;
      // Two people asking about the same region share one round of requests.
      let inFlight = pending.get(key);
      if (!inFlight) {
        const archive = createRemoteArchive(client, sourceUrl, { allowedHosts: [hostOf(sourceUrl)] });
        inFlight = make(key, archive, request, signal)
          .then(({ entry }) => entry)
          .finally(() => pending.delete(key));
        pending.set(key, inFlight);
      }
      try {
        return (await inFlight).summary;
      } catch (error) {
        if (error instanceof SourceGoneError) {
          throw new AppError(
            "upstream",
            "The map source is no longer available at its address. If you set a custom map source in Settings, check it; otherwise try again in a few minutes.",
          );
        }
        if (!(error instanceof AppError) && networkSentence(error, "The map source")) {
          throw new AppError("offline", "Outpost could not reach the map source. Downloading a map region needs an internet connection.");
        }
        throw error;
      }
    },

    async planFor(archive, request, signal) {
      const key = keyOf(archive.url, request);
      const cached = cache.get(key);
      if (cached?.plan && cached.expires > Date.now()) {
        // The header is tiny, and reading it tells us the ETag the archive has now.
        const header = await archive.read(0, HEADER_BYTES, signal);
        const fingerprint = createHash("sha256").update(header).digest("hex");
        if (fingerprint === cached.fingerprint && archive.etag() === cached.etag) return cached.plan;
      }
      return (await make(key, archive, request, signal)).plan;
    },

    clear() {
      cache.clear();
    },
  };
}
