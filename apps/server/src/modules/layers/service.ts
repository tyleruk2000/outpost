/**
 * The reference layers' service: estimates and downloads through the adapters, installs
 * what arrives as packs (collections of kind "dataset"), imports files people bring, and
 * answers the map.
 *
 * A pack is installed in one way whatever its source: rows are written under a
 * temporary owner while the file is read; only when all of it was read is the pack
 * recorded, the rows handed to it and any pack it replaces removed, in one transaction.
 * An interrupted or failed install leaves the installed pack as it was.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  ReferenceCatalogueResponse,
  ReferenceEstimate,
  ReferenceEstimateRequest,
  ReferenceImportFormat,
  ReferenceImportResult,
  ReferenceLayerId,
  ReferenceLayersResponse,
  ReferencePackDto,
  ReferenceStartRequest,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, notFound } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import type { CollectionMeta } from "../../db/schema.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow, Installer } from "../downloads/types.ts";
import { createBabsAdapter } from "./adapters/babs.ts";
import { createGeofabrikAdapter } from "./adapters/geofabrik.ts";
import { provider as importProvider, readImport } from "./adapters/imports.ts";
import { createNaturalEarthAdapter } from "./adapters/natural-earth.ts";
import { createOurAirportsAdapter } from "./adapters/ourairports.ts";
import { createOverpassAdapter } from "./adapters/overpass.ts";
import { createWikidataAdapter } from "./adapters/wikidata.ts";
import { createWorldPopAdapter } from "./adapters/worldpop.ts";
import { COUNTRIES } from "./countries.ts";
import { createPopulationService, type PopulationMeta, type PopulationService } from "./population.ts";
import { LINKED, PROVIDERS } from "./providers.ts";
import { createReferenceStore, type ReferenceStore } from "./store.ts";
import type { EstimatedItem, ReadResult, ReferenceAdapter, ReferenceMeta } from "./types.ts";

const ESTIMATE_TTL_MS = 30 * 60_000;
/** A rough allowance for one record in the database, with its indexes. */
const DATABASE_BYTES_PER_RECORD = 700;

/** What is kept in a pack's collection meta. */
export interface PackMeta extends ReferenceMeta {
  version: string | null;
  publishedAt: string | null;
  retrievedAt: number;
  records: number;
  skipped: number;
  problems: string[];
  extra?: Record<string, unknown>;
  sidecar?: string;
  /** The countries and box asked for, as a key: a later pack of the same source and key replaces this one. */
  scope?: string;
}

const scopeOf = (meta: ReferenceMeta) => JSON.stringify({ countries: [...meta.countries].sort(), bbox: meta.bbox });

const packMetaOf = (row: CollectionRow): PackMeta | null => {
  const reference = (row.meta as CollectionMeta & { reference?: PackMeta }).reference;
  return reference && typeof reference.provider === "string" ? reference : null;
};

export const isReferenceDownload = (download: DownloadRow) => typeof (download.meta as { reference?: unknown }).reference === "object";

export interface ImportInput {
  format: ReferenceImportFormat;
  /** Where the file is: a storage location and a path in it. */
  locationId: string;
  relPath: string;
  title: string;
  options: Record<string, string>;
  /** A pack this import replaces once it is in. */
  replaces?: string;
}

export interface LayersService {
  store: ReferenceStore;
  population: PopulationService;
  catalogue(): ReferenceCatalogueResponse;
  estimate(request: ReferenceEstimateRequest, signal?: AbortSignal): Promise<ReferenceEstimate>;
  start(request: ReferenceStartRequest): Promise<DownloadRow[]>;
  packs(): ReferencePackDto[];
  pack(id: string): ReferencePackDto;
  remove(id: string, deleteFiles: boolean): Promise<void>;
  importFile(
    input: ImportInput,
    signal: AbortSignal,
    progress: (current: number, total: number | null, message: string) => void,
  ): Promise<ReferenceImportResult>;
  layers(): ReferenceLayersResponse;
  installer: Installer;
  packTitles(): Map<string, { title: string }>;
  close(): Promise<void>;
}

export function createLayersService(ctx: AppContext, client: HttpClient): LayersService {
  const { collections, storage } = ctx.services;
  const providerNames = new Map(PROVIDERS.map((provider) => [provider.id, provider.name]));
  const store = createReferenceStore(ctx, (id) => providerNames.get(id) ?? id);

  const installedPacks = () =>
    collections
      .list({ kind: "dataset" })
      .map((row) => ({ row, meta: packMetaOf(row) }))
      .filter((entry): entry is { row: CollectionRow; meta: PackMeta } => entry.meta !== null);

  const population = createPopulationService(ctx, () =>
    installedPacks()
      .filter(({ meta }) => meta.provider === "worldpop" && meta.sidecar && meta.extra?.population)
      .map(({ row, meta }) => {
        const available = storage.isAvailable(row.locationId) && row.status === "installed";
        let filePath: string | null = null;
        if (available) {
          try {
            filePath = storage.resolve(row.locationId, row.relPath);
          } catch {
            filePath = null;
          }
        }
        return { collectionId: row.id, filePath, available, sidecarKey: meta.sidecar!, meta: meta.extra!.population as PopulationMeta };
      }),
  );

  const deps = { ctx, client };
  const adapters = new Map<string, ReferenceAdapter>(
    [
      createNaturalEarthAdapter(deps),
      createOurAirportsAdapter(deps),
      createOverpassAdapter(deps),
      createGeofabrikAdapter(deps),
      createWikidataAdapter(deps),
      createWorldPopAdapter(deps, population),
      createBabsAdapter(deps),
    ].map((adapter) => [adapter.provider.id, adapter]),
  );

  const estimates = new Map<string, { request: ReferenceEstimateRequest; items: EstimatedItem[]; at: number }>();

  const changed = () => ctx.events.publish({ type: "layers.changed" });

  function toPack(row: CollectionRow, meta: PackMeta): ReferencePackDto {
    const counts = store.countsOf(row.id);
    const location = (() => {
      try {
        return storage.get(row.locationId);
      } catch {
        return null;
      }
    })();
    return {
      id: row.id,
      title: row.title,
      provider: meta.provider,
      providerName: providerNames.get(meta.provider) ?? meta.provider,
      layers: counts.layers.length > 0 ? counts.layers : meta.layers,
      countries: meta.countries,
      bbox: meta.bbox,
      version: meta.version,
      publishedAt: meta.publishedAt,
      retrievedAt: meta.retrievedAt,
      records: counts.records,
      figures: counts.figures,
      duplicates: counts.duplicates,
      sizeBytes: row.sizeBytes,
      publisher: row.publisher ?? "",
      license: row.license ?? "",
      licenseUrl: PROVIDERS.find((provider) => provider.id === meta.provider)?.licenseUrl ?? null,
      sourceUrl: meta.sourceUrl,
      locationId: row.locationId,
      locationName: location?.name ?? "",
      available: storage.isAvailable(row.locationId),
      status: row.status,
      origin: meta.origin,
      request: meta.request,
    };
  }

  /** Packs that a new one of the same source and scope takes the place of. */
  function replacedBy(meta: ReferenceMeta): string[] {
    if (meta.origin === "import") return meta.options?.replaces ? [meta.options.replaces] : [];
    return installedPacks()
      .filter(
        ({ meta: other }) =>
          other.origin === "download" && other.provider === meta.provider && other.key === meta.key && other.scope === scopeOf(meta),
      )
      .map(({ row }) => row.id);
  }

  /** Reads a file into a pack: the one way every pack is installed. */
  async function ingest(input: {
    adapter: ReferenceAdapter | "import";
    owner: string;
    meta: ReferenceMeta;
    title: string;
    filePath: string;
    locationId: string;
    relPath: string;
    sizeBytes: number;
    sha256: string | null;
    sourceDate: string | null;
    signal: AbortSignal;
    progress: (current: number, total: number | null, message: string) => void;
  }): Promise<{ collection: CollectionRow; meta: PackMeta; duplicates: number; skipped: number; problems: string[] }> {
    const retrievedAt = Date.now();
    const providerId =
      input.adapter === "import" ? (input.meta.format === "osm-pbf" ? "osm-extract" : "import") : input.adapter.provider.id;
    store.removeRowsNow(input.owner);
    const sink = store.sink(input.owner, providerId, retrievedAt);
    const meta: ReferenceMeta = { ...input.meta };
    if (providerId === "worldpop") {
      meta.options = { ...meta.options, sidecar: population.sidecarKey(input.locationId, input.relPath) };
    }
    const context = {
      filePath: input.filePath,
      meta,
      sink,
      signal: input.signal,
      progress: input.progress,
      retrievedAt,
      sourceDate: input.sourceDate,
    };
    let result: ReadResult;
    try {
      if (input.adapter === "import") {
        result = input.meta.format === "osm-pbf" ? await adapters.get("osm-extract")!.read(context) : await readImport(context, ctx, sink);
      } else {
        result = await input.adapter.read(context);
      }
      await sink.flush();
      if (sink.count === 0 && providerId !== "worldpop") {
        throw new PermanentJobError(
          `Nothing in the file could be used.${sink.problems.length > 0 ? ` The first reasons: ${sink.problems.slice(0, 3).join(" ")}` : ""}`,
        );
      }
    } catch (error) {
      await store.removeRows(input.owner);
      if (error instanceof PermanentJobError && sink.problems.length > 0 && !error.message.includes("first reasons")) {
        throw new PermanentJobError(`${error.message} ${sink.problems.slice(0, 3).join(" ")}`);
      }
      throw error;
    }

    const replaced = replacedBy(meta);
    const provider = PROVIDERS.find((entry) => entry.id === providerId) ?? importProvider;
    const packMeta: PackMeta = {
      ...meta,
      scope: scopeOf(meta),
      countries: result.countries ?? meta.countries,
      bbox: result.bbox ?? meta.bbox,
      version: result.version,
      publishedAt: result.publishedAt,
      retrievedAt,
      records: sink.count,
      skipped: sink.skipped,
      problems: sink.problems,
      ...(result.extra ? { extra: result.extra } : {}),
      ...(providerId === "worldpop" ? { sidecar: meta.options?.sidecar } : {}),
    };
    const firstPublisher = input.adapter === "import" ? (meta.options?.publisher ?? "As stated in the file") : provider.publisher;
    const collection = await collections.create({
      kind: "dataset",
      title: input.title,
      description:
        providerId === "worldpop"
          ? "Population grid for the map"
          : `${sink.count.toLocaleString("en-GB")} records for the map's reference layers`,
      category: "Maps",
      publisher: firstPublisher,
      license: input.adapter === "import" ? (meta.options?.license ?? "As stated in the file") : provider.license,
      attribution: provider.name,
      version: result.version ?? new Date(retrievedAt).toISOString().slice(0, 10),
      locationId: input.locationId,
      relPath: input.relPath,
      sizeBytes: input.sizeBytes,
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      meta: { dataset: "reference", reference: packMeta } as CollectionMeta,
    });
    store.adopt(input.owner, collection.id, replaced);
    const duplicates = await store.findDuplicates(collection.id);
    for (const old of replaced) {
      const row = collections.get(old);
      if (!row) continue;
      const oldMeta = packMetaOf(row);
      // A downloaded file is Outpost's to tidy; a file the person brought is theirs.
      await collections.remove(old, {
        deleteFiles: oldMeta?.origin === "download" && storage.isAvailable(row.locationId) && row.relPath !== input.relPath,
      });
    }
    changed();
    return { collection, meta: packMeta, duplicates, skipped: sink.skipped, problems: sink.problems };
  }

  const installer: Installer = async ({ download, filePath, sizeBytes, sha256, signal, progress }) => {
    const meta = (download.meta as { reference?: ReferenceMeta }).reference;
    const adapter = meta ? adapters.get(meta.provider) : undefined;
    if (!meta || !adapter) throw new PermanentJobError("Outpost does not know what kind of reference data this download is.");
    const sourceDate =
      download.lastModified && !Number.isNaN(Date.parse(download.lastModified))
        ? new Date(download.lastModified).toISOString().slice(0, 10)
        : null;
    const { collection } = await ingest({
      adapter,
      owner: `pending:${download.id}`,
      meta,
      title: meta.title,
      filePath,
      locationId: download.locationId,
      relPath: download.relPath,
      sizeBytes,
      sha256,
      sourceDate,
      signal,
      progress: (current, total, message) => progress(current, total, message),
    });
    return { collectionId: collection.id };
  };

  // A pack removed (from here, from Library, or by "Manage and clean up") takes its records with it.
  collections.onRemoved(async (row) => {
    const meta = packMetaOf(row);
    if (!meta) return;
    await store.removeRows(row.id);
    await store.releaseDuplicates();
    if (meta.sidecar && !installedPacks().some((other) => other.row.id !== row.id && other.meta.sidecar === meta.sidecar))
      population.forget(meta.sidecar);
    changed();
  });

  // Rows whose pack is gone (removed while the server was down, or an install cut off) are cleared at start.
  const known = new Set(installedPacks().map(({ row }) => row.id));
  for (const owner of store.owners()) if (!known.has(owner)) store.removeRowsNow(owner);

  return {
    store,
    population,
    installer,

    catalogue() {
      return { providers: PROVIDERS, linked: LINKED, countries: COUNTRIES.map(({ code, name, bbox }) => ({ code, name, bbox })) };
    },

    async estimate(request, signal) {
      const adapter = adapters.get(request.provider);
      if (!adapter?.estimate) throw badRequest("That source is not one Outpost downloads from.");
      const { items, notes } = await adapter.estimate(request, signal);
      const packs = installedPacks();
      for (const item of items) {
        const match = packs.find(({ meta }) => meta.provider === request.provider && meta.key === item.key && meta.origin === "download");
        item.replaces = match?.row.id ?? null;
      }
      for (const [id, entry] of estimates) if (Date.now() - entry.at > ESTIMATE_TTL_MS) estimates.delete(id);
      const estimateId = newId();
      estimates.set(estimateId, { request, items, at: Date.now() });
      const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
      const databaseBytes = items.reduce(
        (sum, item) => sum + (item.records ?? Math.round(item.bytes / 400)) * DATABASE_BYTES_PER_RECORD,
        0,
      );
      const caution = adapter.provider.caution;
      return {
        estimateId,
        provider: request.provider,
        items: items.map(({ extra: _extra, ...item }) => item),
        totalBytes,
        databaseBytes,
        notes: caution ? [caution, ...notes] : notes,
      };
    },

    async start({ estimateId, keys, locationId }) {
      const estimate = estimates.get(estimateId);
      if (!estimate) throw new AppError("conflict", "That estimate is more than half an hour old or was not made here. Estimate again.");
      const adapter = adapters.get(estimate.request.provider)!;
      const started: DownloadRow[] = [];
      for (const key of keys) {
        const item = estimate.items.find((entry) => entry.key === key);
        if (!item) throw badRequest("That item is not part of the estimate.");
        const spec = adapter.download!(estimate.request, item);
        const { query, ...partial } = (spec.meta ?? {}) as Partial<ReferenceMeta> & { query?: unknown };
        const reference: ReferenceMeta = {
          provider: adapter.provider.id,
          key,
          title: item.title,
          layers: partial.layers ?? item.layers,
          request: estimate.request,
          countries: partial.countries ?? estimate.request.scope.countries ?? [],
          bbox: partial.bbox !== undefined ? partial.bbox : (estimate.request.scope.bbox ?? null),
          sourceUrl: partial.sourceUrl ?? null,
          origin: "download",
          ...(partial.md5 ? { md5: partial.md5 } : {}),
          ...(partial.options ? { options: partial.options } : {}),
        };
        try {
          started.push(
            await ctx.services.downloads.start({
              kind: "dataset",
              title: item.title,
              url: spec.url,
              relPath: spec.relPath,
              ...(locationId ? { locationId } : {}),
              ...(spec.sizeBytes ? { sizeBytes: spec.sizeBytes } : {}),
              ...(spec.sha256 ? { sha256: spec.sha256 } : {}),
              ...(spec.fetcher ? { fetcher: spec.fetcher } : {}),
              allowedHosts: spec.allowedHosts,
              meta: { reference, ...(query ? { query } : {}) },
            }),
          );
        } catch (error) {
          if (error instanceof AppError && error.code === "conflict") throw conflict(`${item.title}: ${error.message}`);
          throw error;
        }
      }
      changed();
      return started;
    },

    packs() {
      return installedPacks()
        .map(({ row, meta }) => toPack(row, meta))
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    pack(id) {
      const row = collections.get(id);
      const meta = row ? packMetaOf(row) : null;
      if (!row || !meta) throw notFound("That reference pack is not installed.");
      return toPack(row, meta);
    },

    async remove(id, deleteFiles) {
      const row = collections.get(id);
      if (!row || !packMetaOf(row)) throw notFound("That reference pack is not installed.");
      if (collections.isBusy(id)) throw conflict("That pack is being moved or checked. Try again when that has finished.");
      await collections.remove(id, { deleteFiles: deleteFiles && storage.isAvailable(row.locationId) });
    },

    async importFile(input, signal, progress) {
      const filePath = storage.resolve(input.locationId, input.relPath);
      const stat = await fs.promises.stat(filePath).catch(() => undefined);
      if (!stat?.isFile()) throw badRequest("There is no file at that place in the storage location.");
      const extension = path.extname(input.relPath).toLowerCase();
      const expected: Record<ReferenceImportFormat, string[]> = {
        "features-csv": [".csv", ".txt"],
        "historical-csv": [".csv", ".txt"],
        "country-figures-csv": [".csv", ".txt"],
        geojson: [".geojson", ".json"],
        "osm-pbf": [".pbf"],
      };
      if (!expected[input.format].includes(extension))
        throw badRequest(`A ${input.format} import is a ${expected[input.format].join(" or ")} file.`);
      const layers: ReferenceLayerId[] =
        input.format === "historical-csv"
          ? ["historical"]
          : input.format === "osm-pbf"
            ? ["military", "nuclear", "hospitals", "emergency", "shelters"]
            : input.options.layer
              ? [input.options.layer as ReferenceLayerId]
              : [];
      const meta: ReferenceMeta = {
        provider: input.format === "osm-pbf" ? "osm-extract" : "import",
        key: `import:${input.locationId}:${input.relPath}`,
        title: input.title,
        layers,
        request: null,
        countries: input.options.country ? [input.options.country.toUpperCase()] : [],
        bbox: null,
        sourceUrl: input.options.sourceUrl || null,
        format: input.format,
        options: { ...input.options, ...(input.replaces ? { replaces: input.replaces } : {}) },
        origin: "import",
      };
      const {
        collection,
        meta: packMeta,
        duplicates,
        skipped,
        problems,
      } = await ingest({
        adapter: "import",
        owner: `pending:import-${newId()}`,
        meta,
        title: input.title,
        filePath,
        locationId: input.locationId,
        relPath: input.relPath,
        sizeBytes: stat.size,
        sha256: null,
        sourceDate: null,
        signal,
        progress,
      });
      return { pack: toPack(collection, packMeta), imported: packMeta.records, skipped, duplicates, problems };
    },

    layers() {
      const credits = new Map<string, { provider: string; text: string; url: string | null }>();
      for (const { meta, row } of installedPacks()) {
        const provider = PROVIDERS.find((entry) => entry.id === meta.provider);
        if (meta.provider === "osm" || meta.provider === "osm-extract") {
          credits.set("osm", {
            provider: "osm",
            text: "© OpenStreetMap contributors, ODbL",
            url: "https://www.openstreetmap.org/copyright",
          });
        } else if (meta.provider === "worldpop") {
          credits.set("worldpop", { provider: "worldpop", text: "Population: WorldPop, CC BY 4.0", url: "https://www.worldpop.org" });
        } else if (meta.provider === "import") {
          credits.set(`import:${row.id}`, {
            provider: "import",
            text: `${row.publisher ?? "Imported"}${row.license ? `, ${row.license}` : ""}`,
            url: meta.sourceUrl,
          });
        } else if (provider) {
          credits.set(provider.id, {
            provider: provider.id,
            text: `${provider.name}${provider.license.startsWith("Public domain") ? "" : `, ${provider.license}`}`,
            url: provider.url,
          });
        }
      }
      return { layers: store.summary(providerNames), population: population.sets(), credits: [...credits.values()] };
    },

    packTitles() {
      return new Map(installedPacks().map(({ row }) => [row.id, { title: row.title }]));
    },

    async close() {
      await population.close();
    },
  };
}
