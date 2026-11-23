/**
 * Map data in one answer (`GET /api/maps/data`): every map, terrain, place-names list,
 * road network, places pack and country file, grouped by country and by what it is for,
 * with where it is, how big, how old and where it stands; and the one press that adds a
 * country's roads, places and country file together (`POST /api/maps/data/add`).
 *
 * Nothing here asks anything of the outside world: the answer is read from what Outpost
 * holds. The add starts downloads (on a press) through the services that own them.
 */
import {
  type Bbox,
  MAP_DATA_COUNTRY_KINDS,
  type MapDataAddRequest,
  type MapDataAddResponse,
  type MapDataCheckResponse,
  type MapDataCountry,
  type MapDataItem,
  type MapDataKind,
  type MapDataProgress,
  type MapDataResponse,
  type MapDataState,
  type MapDataUpdateResponse,
  type MapDataUpdateWay,
  OS_NAMES_DATASET,
} from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import type { JobRow } from "../../core/jobs.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow } from "../downloads/types.ts";
import { resolveGeofabrikFile } from "../layers/adapters/geofabrik-file.ts";
import { createRegionIndex, GEOFABRIK_BASE } from "../layers/adapters/geofabrik-regions.ts";
import { EXTRACT_LAYERS } from "../layers/adapters/osm-tags.ts";
import { COUNTRIES, countryOf } from "../layers/countries.ts";
import { DEFAULT_PLACE_LAYERS, isCountryFileDownload } from "./country-files.ts";
import { bboxSchema, dayOfBuild } from "./regions.ts";
import { BUILD_BASE_URL, BUILDS_URL, hostOf } from "./source.ts";

export const mapDataCheckSchema = z.object({ collectionId: z.string().min(1).max(100) }).strict();
export const mapDataUpdateSchema = mapDataCheckSchema;

export const mapDataAddSchema = z
  .object({
    regionId: z
      .string()
      .regex(/^[a-z0-9/-]{1,80}$/)
      .optional(),
    kinds: z
      .array(z.enum(["map", "terrain", "names", "roads", "places", "extract"]))
      .min(1, "Choose what to add.")
      .max(6),
    locationId: z.string().min(1).max(100).optional(),
    keep: z.boolean().optional(),
    layers: z
      .array(z.enum(EXTRACT_LAYERS as [string, ...string[]]))
      .max(12)
      .optional(),
    newerThan: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the day as 2026-11-01.")
      .optional(),
    map: z
      .object({
        name: z.string().trim().min(1).max(120),
        regionId: z.string().trim().min(1).max(120).optional(),
        bbox: bboxSchema,
        maxZoom: z.number().int().min(0).max(15),
        minZoom: z.number().int().min(0).max(15).optional(),
      })
      .optional(),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .transform((code) => code.toUpperCase())
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const fromFile = value.kinds.some((kind) => kind === "roads" || kind === "places" || kind === "extract");
    if (fromFile && !value.regionId) context.addIssue({ code: "custom", path: ["regionId"], message: "Choose the country or region." });
    // The person's own choice, every time: nothing is kept or deleted by default.
    if (fromFile && value.keep === undefined)
      context.addIssue({ code: "custom", path: ["keep"], message: "Say whether to keep the country file once it is read." });
    if (value.kinds.includes("extract") && value.keep === false)
      context.addIssue({ code: "custom", path: ["keep"], message: "Adding the country file on its own means keeping it." });
    if ((value.kinds.includes("map") || value.kinds.includes("terrain")) && !value.map)
      context.addIssue({ code: "custom", path: ["map"], message: "Give the area of the map: its name, box and zoom." });
    if (value.kinds.includes("terrain") && !value.kinds.includes("map"))
      context.addIssue({ code: "custom", path: ["kinds"], message: "Hills and heights are added with a map of the same area." });
    if (value.kinds.includes("names") && !value.country)
      context.addIssue({ code: "custom", path: ["country"], message: "Say which country's place names to add." });
  });

const area = (box: readonly number[]) => Math.max(0, box[2]! - box[0]!) * Math.max(0, box[3]! - box[1]!);
const overlap = (a: readonly number[], b: readonly number[]) =>
  area([Math.max(a[0]!, b[0]!), Math.max(a[1]!, b[1]!), Math.min(a[2]!, b[2]!), Math.min(a[3]!, b[3]!)]);
const isWorld = (box: readonly number[]) => box[2]! - box[0]! > 300;

/** The country a ready-made map area is of: the smallest whose box holds its middle and most of it. */
export function countryOfBox(box: Bbox): string | null {
  const [west, south, east, north] = box;
  const lon = (west + east) / 2;
  const lat = (south + north) / 2;
  // The country whose box is most like the area's (shared over joined), of those that hold its middle and half of it.
  const likeness = (bbox: Bbox) => overlap(box, bbox) / (area(box) + area(bbox) - overlap(box, bbox));
  const candidates = COUNTRIES.filter(
    ({ bbox }) => lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3] && overlap(box, bbox) >= 0.5 * area(box),
  ).sort((a, b) => likeness(b.bbox) - likeness(a.bbox));
  return candidates[0]?.code ?? null;
}

const dayOf = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

/** The day a collection's data is from: its version where that is a day ("2026-11-21" or a map build's "20261121"). */
const dayOfVersion = (version: string | null) =>
  version && /^\d{4}-\d{2}-\d{2}/.test(version) ? version.slice(0, 10) : dayOfBuild(version);

const hostsOf = (url: string) => {
  try {
    return [hostOf(url)];
  } catch {
    return [];
  }
};

/** Who is asked, and who a download comes from, for each source: what the screen says before anything is pressed. */
export function updateHosts(ctx: AppContext) {
  const { settings } = ctx.services;
  const geofabrik = hostsOf(ctx.config.geofabrikUrl ?? GEOFABRIK_BASE);
  return {
    map: () => {
      const override = settings.get("maps.tileSource").trim();
      return override ? hostsOf(override) : [...hostsOf(BUILDS_URL), ...hostsOf(BUILD_BASE_URL)];
    },
    terrain: () => hostsOf(settings.get("maps.terrainSource").trim()),
    names: () => hostsOf(ctx.services.maps.places.sourceUrl("cities500")),
    geofabrik: () => geofabrik,
  };
}

export function createMapData(ctx: AppContext, client: HttpClient) {
  const { collections, storage, downloads, settings } = ctx.services;

  const hosts = updateHosts(ctx);
  /** How a collection of this kind is brought up to date. */
  function updateWay(row: CollectionRow, kind: MapDataKind): MapDataUpdateWay | null {
    const way = (how: MapDataUpdateWay["how"], list: string[], note: string | null = null): MapDataUpdateWay => ({
      how,
      hosts: list,
      note,
    });
    if (kind === "imagery") return way("elsewhere", [], "Fetched again under Maps, Offline, Satellite pictures.");
    if (kind === "map" || kind === "terrain")
      return row.meta.imported ? null : way("download", kind === "map" ? hosts.map() : hosts.terrain());
    if (kind === "names")
      return row.meta.dataset === OS_NAMES_DATASET
        ? way("elsewhere", [], "Brought up to date with “Check for a newer edition”, under Place names.")
        : way("download", hosts.names());
    if (kind === "extract") return way("download", hosts.geofabrik());
    return null;
  }

  return function mapData(): MapDataResponse {
    const locations = new Map(storage.list().map((location) => [location.id, location]));
    const active = downloads.unfinished().filter((row) => row.state !== "failed");
    const waitingAhead = (row: DownloadRow) =>
      active.filter((other) => other.id !== row.id && other.createdAt < row.createdAt && other.state !== "paused").length;

    const base = (kind: MapDataKind, key: string, title: string): MapDataItem => ({
      key,
      kind,
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

    const progressOf = (job: JobRow | undefined, step: MapDataProgress["step"] = null): MapDataProgress | null =>
      job ? { current: job.progressCurrent, total: job.progressTotal, unit: job.progressUnit, message: job.progressMessage, step } : null;

    /** A collection as a row: where it is and whether it can be used now. */
    function fromCollection(row: CollectionRow, kind: MapDataKind, title = row.title): MapDataItem {
      const location = locations.get(row.locationId);
      const jobs = ctx.jobs.findBySubject(`collection:${row.id}`).filter((job) => ["queued", "running", "paused"].includes(job.state));
      const moving = jobs.find((job) => job.type === "collection.move");
      let state: MapDataState = "ready";
      let reason: string | null = null;
      if (row.status === "moving" || moving) state = "moving";
      else if (location?.status !== "available") {
        state = "location-offline";
        reason = `“${location?.name ?? "Its storage location"}” is not connected.`;
      } else if (row.status === "missing") {
        state = "missing";
        reason = "Its file is missing. Download it again.";
      } else if (row.status === "damaged") {
        state = "damaged";
        reason = "Its file no longer matches its checksum. Download it again.";
      }
      return {
        ...base(kind, `collection:${row.id}`, title),
        state,
        reason,
        sizeBytes: row.sizeBytes,
        locationId: row.locationId,
        locationName: location?.name ?? "Unknown location",
        dataDate: dayOfVersion(row.version) ?? dayOf(row.installedAt),
        progress: moving ? progressOf(moving) : null,
        collectionId: row.id,
        regionId: typeof row.meta.regionId === "string" ? row.meta.regionId : null,
        taskId: jobs[0]?.id ?? null,
        update: updateWay(row, kind),
      };
    }

    /** A download not finished yet, as a row of the kind it will become. */
    function fromDownload(row: DownloadRow, kind: MapDataKind, title = row.title, step: MapDataProgress["step"] = null): MapDataItem {
      const dto = downloads.toDto(row);
      const job = row.jobId ? ctx.jobs.get(row.jobId) : undefined;
      const state: MapDataState =
        row.state === "queued"
          ? "waiting"
          : row.state === "running"
            ? "downloading"
            : row.state === "paused"
              ? "paused"
              : row.state === "verifying"
                ? "processing"
                : "failed";
      const location = locations.get(row.locationId);
      return {
        ...base(kind, `download:${row.id}`, title),
        state,
        sizeBytes: row.totalBytes,
        locationId: row.locationId,
        locationName: location?.name ?? "Unknown location",
        progress:
          state === "processing"
            ? progressOf(job, step)
            : state === "downloading" || state === "paused"
              ? { current: row.receivedBytes, total: row.totalBytes, unit: "bytes", message: dto.message, step: null }
              : null,
        reason: state === "failed" ? (row.error ?? "The download stopped.") : null,
        ahead: state === "waiting" ? waitingAhead(row) : null,
        downloadId: row.id,
        taskId: row.jobId,
      };
    }

    const countryRows = new Map<string, Map<MapDataKind, MapDataItem[]>>();
    const world: MapDataItem[] = [];
    const other: MapDataItem[] = [];
    const put = (country: string | null | undefined, item: MapDataItem, globalItem = false) => {
      const code = country?.toUpperCase();
      if (globalItem) world.push(item);
      else if (code && countryOf(code) && MAP_DATA_COUNTRY_KINDS.includes(item.kind as (typeof MAP_DATA_COUNTRY_KINDS)[number])) {
        const rows = countryRows.get(code) ?? new Map<MapDataKind, MapDataItem[]>();
        rows.set(item.kind, [...(rows.get(item.kind) ?? []), item]);
        countryRows.set(code, rows);
      } else other.push(item);
    };

    // ── Maps, terrain and satellite pictures ──
    for (const row of [...collections.list({ kind: "map" }), ...collections.list({ kind: "terrain" })]) {
      const tiles = row.meta.map;
      const imagery = tiles?.tileType === "imagery";
      const kind: MapDataKind = imagery ? "imagery" : row.kind === "terrain" ? "terrain" : "map";
      const item = fromCollection(row, kind);
      const bounds = tiles?.bounds;
      const preset = typeof row.meta.regionId === "string" ? row.meta.regionId : null;
      if (bounds && isWorld(bounds)) put(null, item, true);
      else if (!imagery && preset && bounds) put(countryOfBox(bounds as Bbox), item);
      else other.push(item);
    }
    for (const row of active.filter((d) => d.kind === "map" || d.kind === "terrain")) {
      const meta = row.meta as { bbox?: Bbox; regionId?: string; imagery?: unknown };
      const kind: MapDataKind = meta.imagery ? "imagery" : row.kind === "terrain" ? "terrain" : "map";
      const item = fromDownload(row, kind);
      if (meta.bbox && isWorld(meta.bbox)) put(null, item, true);
      else if (!meta.imagery && meta.regionId && meta.bbox) put(countryOfBox(meta.bbox), item);
      else other.push(item);
    }
    // A failed download stays shown until it is retried or removed; so does every unfinished one above.
    for (const row of downloads.unfinished().filter((d) => d.state === "failed" && (d.kind === "map" || d.kind === "terrain")))
      other.push(fromDownload(row, row.kind === "terrain" ? "terrain" : "map"));

    // ── Place names ──
    for (const row of collections.list({ kind: "places" })) {
      const meta = row.meta as { places?: { countries: string[]; count: number }; dataset?: string };
      const item = { ...fromCollection(row, "names"), count: meta.places?.count ?? null };
      const countries = meta.dataset === OS_NAMES_DATASET ? ["GB"] : (meta.places?.countries ?? []);
      if (countries.length === 1) put(countries[0], item);
      else put(null, item, true);
    }
    for (const row of downloads.unfinished().filter((d) => d.kind === "places")) {
      const meta = row.meta as { dataset?: string; country?: string };
      const item = fromDownload(row, "names");
      if (meta.dataset === OS_NAMES_DATASET) put("GB", item);
      else if (meta.country) put(meta.country, item);
      else put(null, item, true);
    }

    // ── Places to find ──
    for (const pack of ctx.services.layers?.packs() ?? []) {
      const row = collections.get(pack.id);
      if (!row) continue;
      const item = {
        ...fromCollection(row, "places"),
        count: pack.records,
        layers: pack.layers,
        packId: pack.id,
        dataDate: pack.publishedAt?.slice(0, 10) ?? dayOf(pack.retrievedAt),
        regionId: pack.request?.scope.regions?.[0] ?? null,
        update:
          pack.request?.provider === "osm-extract" && pack.request.scope.regions?.[0]
            ? { how: "country-file" as const, hosts: hosts.geofabrik(), note: null }
            : pack.origin === "download"
              ? { how: "elsewhere" as const, hosts: [], note: "Checked for an update from its own source, in its menu." }
              : null,
      };
      if (pack.countries.length === 1) put(pack.countries[0], item);
      else put(null, item, true);
    }
    for (const row of downloads.unfinished().filter((d) => d.kind === "dataset" && (d.meta as { reference?: unknown }).reference)) {
      const reference = (row.meta as { reference: { countries: string[]; layers: string[] } }).reference;
      const item = { ...fromDownload(row, "places"), layers: reference.layers };
      if (reference.countries.length === 1) put(reference.countries[0], item);
      else put(null, item, true);
    }

    // ── Roads for routes ──
    const roads = ctx.services.roads?.list();
    for (const network of roads?.networks ?? []) {
      put(network.country, {
        ...base("roads", `road-network:${network.id}`, network.name),
        state: network.available ? "ready" : "missing",
        reason: network.available ? null : "Its file is missing. Add it again.",
        sizeBytes: network.sizeBytes,
        dataDate: network.dataDate,
        count: network.nodes,
        regionId: network.regionId,
        networkId: network.id,
        update: network.regionId ? { how: "country-file", hosts: hosts.geofabrik(), note: null } : null,
      });
    }
    for (const job of ctx.jobs.list({ states: ["queued", "running", "paused"], types: ["roads.build"] })) {
      const payload = job.payload as { name?: string; country?: string | null };
      put(payload.country ?? null, {
        ...base("roads", `task:${job.id}`, payload.name ?? job.title),
        state: job.state === "queued" ? "waiting" : job.state === "paused" ? "paused" : "processing",
        progress: progressOf(job),
        taskId: job.id,
      });
    }

    // ── Country files: kept, on their way, and what was read ──
    const countryFiles: MapDataItem[] = [];
    for (const { row, meta } of ctx.services.countryFiles.keptFiles()) {
      const item = { ...fromCollection(row, "extract", meta.name), dataDate: meta.dataDate, regionId: meta.regionId };
      countryFiles.push(item);
      put(meta.country, item);
    }
    for (const entry of ctx.services.countryFiles.pending()) {
      const download = entry.downloadId ? downloads.get(entry.downloadId) : undefined;
      const job = entry.taskId ? ctx.jobs.get(entry.taskId) : undefined;
      const make = (kind: MapDataKind): MapDataItem => {
        if (download && isCountryFileDownload(download)) {
          const item = fromDownload(download, kind, entry.name, entry.step);
          return {
            ...item,
            key: `download:${download.id}:${kind}`,
            regionId: entry.regionId,
            layers: kind === "places" ? entry.layers : [],
          };
        }
        return {
          ...base(kind, `task:${job?.id}:${kind}`, entry.name),
          state:
            job?.state === "queued" ? "waiting" : job?.state === "failed" ? "failed" : job?.state === "paused" ? "paused" : "processing",
          progress: progressOf(job, entry.step),
          reason: job?.state === "failed" ? (job.error ?? "The country file could not be read.") : null,
          regionId: entry.regionId,
          layers: kind === "places" ? entry.layers : [],
          taskId: job?.id ?? null,
        };
      };
      // Shown in each row it is for: the roads, the places, and the country file itself where it is to be kept.
      if (entry.roads) put(entry.country, make("roads"));
      if (entry.layers.length > 0) put(entry.country, make("places"));
      if (entry.keep && entry.downloadId) put(entry.country, make("extract"));
    }
    const reads = ctx.services.countryFiles.history();

    // ── Countries ──
    const regions = createRegionIndex(ctx, client).kept();
    const countries: MapDataCountry[] = [...countryRows.entries()]
      .map(([code, rows]) => {
        const latest = reads.find((read) => read.country === code);
        return {
          country: code,
          name: countryOf(code)?.name ?? code,
          regionId: regions?.regions.find((region) => region.depth === 0 && region.country === code)?.id ?? null,
          rows: MAP_DATA_COUNTRY_KINDS.map((kind) => ({ kind, items: rows.get(kind) ?? [] })),
          lastRead: latest
            ? {
                regionId: latest.regionId,
                name: latest.name,
                fileName: latest.fileName,
                bytes: latest.bytes,
                dataDate: latest.dataDate,
                readAt: latest.readAt,
                kept: latest.collectionId !== null && collections.get(latest.collectionId) !== undefined,
              }
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));

    // ── The status line ──
    const everything = [...countryRows.values()].flatMap((rows) => [...rows.values()].flat()).concat(world, other);
    const onDisk = everything.filter((item) => !item.downloadId && item.sizeBytes);
    const byLocation = new Map<string | null, number>();
    for (const item of onDisk) byLocation.set(item.locationId, (byLocation.get(item.locationId) ?? 0) + (item.sizeBytes ?? 0));
    const choice = settings.get("maps.countryFileKeep");
    const lastKept = countryFiles.at(0);
    return {
      summary: {
        totalBytes: onDisk.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
        locations: [...byLocation.entries()]
          .map(([locationId, bytes]) => ({
            locationId,
            name: locationId === null ? "Outpost's own data" : (locations.get(locationId)?.name ?? "Unknown location"),
            bytes,
            available: locationId === null || locations.get(locationId)?.status === "available",
          }))
          .sort((a, b) => b.bytes - a.bytes),
        active: new Set(
          everything
            .filter((item) => ["waiting", "downloading", "paused", "processing", "moving"].includes(item.state))
            .map((item) => item.downloadId ?? item.taskId ?? item.key),
        ).size,
      },
      countries,
      world,
      other,
      countryFiles,
      onThisPhone: null,
      countryFileChoice: { keep: choice === "ask" ? null : choice === "keep", locationId: lastKept?.locationId ?? null },
      regionsListed: regions !== null,
    };
  };
}

/** The combined add: the country file's reads in one download (or none, where it is kept), and the map, terrain and names beside it. */
export function createMapDataAdd(ctx: AppContext) {
  return async function add(body: MapDataAddRequest): Promise<MapDataAddResponse> {
    const downloadIds: string[] = [];
    const taskIds: string[] = [];
    let countryFile: MapDataAddResponse["countryFile"] = null;
    const kinds = new Set(body.kinds);
    if (kinds.has("roads") || kinds.has("places") || kinds.has("extract")) {
      if (!body.regionId || body.keep === undefined) throw badRequest("Choose the region, and whether to keep its country file.");
      const added = await ctx.services.countryFiles.add({
        regionId: body.regionId,
        roads: kinds.has("roads"),
        layers: kinds.has("places") ? (body.layers ?? DEFAULT_PLACE_LAYERS) : [],
        keep: body.keep,
        ...(body.locationId ? { locationId: body.locationId } : {}),
        ...(body.newerThan ? { newerThan: body.newerThan } : {}),
        remember: true,
      });
      countryFile = added.countryFile;
      if (added.downloadId) downloadIds.push(added.downloadId);
      if (added.taskId) taskIds.push(added.taskId);
    }
    if ((kinds.has("map") || kinds.has("terrain")) && body.map) {
      const started = await ctx.services.maps.regions.start({
        name: body.map.name,
        ...(body.map.regionId ? { regionId: body.map.regionId } : {}),
        bbox: body.map.bbox,
        maxZoom: body.map.maxZoom,
        ...(body.map.minZoom !== undefined ? { minZoom: body.map.minZoom } : {}),
        ...(body.locationId ? { locationId: body.locationId } : {}),
        includeTerrain: kinds.has("terrain"),
      });
      // Terrain alone is not offered by the regions service: it comes with its map.
      downloadIds.push(...started.map((row) => row.id));
    }
    if (kinds.has("names") && body.country) {
      const row = await ctx.services.maps.places.startDownload({ dataset: "country", country: body.country } as never);
      downloadIds.push(row.id);
    }
    return { countryFile, downloadIds, taskIds };
  };
}

/**
 * Bringing one kept thing up to date, on a press: first asking its source how large and how new
 * the newest copy is (nothing downloaded), then downloading it. The one kept stays, and is used,
 * until the new one is in place and checked; a failed download leaves it as it was.
 */
export function createMapDataUpdates(ctx: AppContext, client: HttpClient) {
  const { collections } = ctx.services;
  const hosts = updateHosts(ctx);

  function rowOf(collectionId: string): CollectionRow {
    const row = collections.get(collectionId);
    if (!row) throw new AppError("not_found", "That map data was not found. It may have been removed.");
    return row;
  }

  const countryFileOf = (row: CollectionRow) => {
    const meta = (row.meta as { countryFile?: { regionId?: string; name?: string; dataDate?: string | null } }).countryFile;
    if (!meta?.regionId) throw badRequest("Outpost does not know which region this country file is of.");
    return { regionId: meta.regionId, name: meta.name ?? row.title, dataDate: meta.dataDate ?? null };
  };

  return {
    async check(collectionId: string, signal?: AbortSignal): Promise<MapDataCheckResponse> {
      const row = rowOf(collectionId);
      if (row.kind === "map" || row.kind === "terrain") {
        const found = await ctx.services.maps.regions.check(row.id, signal);
        const asked = row.kind === "map" ? hosts.map() : [found.host];
        return { hosts: asked, sizeBytes: found.sizeBytes, dataDate: dayOfBuild(found.build), newer: found.newer };
      }
      if (row.kind === "places") {
        if (row.meta.dataset === OS_NAMES_DATASET)
          throw badRequest("OS Open Names is checked with “Check for a newer edition”, under Place names.");
        const url = ctx.services.maps.places.sourceUrl(String(row.meta.dataset ?? ""));
        const { response } = await client.fetch(url, { method: "HEAD", allowedHosts: hostsOf(url), signal });
        await response.body?.cancel().catch(() => undefined);
        if (!response.ok) throw new AppError("upstream", `GeoNames answered ${response.status} for this list. Try again later.`);
        const length = Number(response.headers.get("content-length"));
        const modified = Date.parse(response.headers.get("last-modified") ?? "");
        const dataDate = Number.isFinite(modified) ? new Date(modified).toISOString().slice(0, 10) : null;
        const held = dayOfVersion(row.version);
        return {
          hosts: hostsOf(url),
          sizeBytes: Number.isFinite(length) && length > 0 ? length : null,
          dataDate,
          newer: dataDate && held ? dataDate > held : null,
        };
      }
      if (row.kind === "extract") {
        const meta = countryFileOf(row);
        const region = createRegionIndex(ctx, client).find(meta.regionId);
        if (!region) throw badRequest("Read Geofabrik's list of regions first: Add map data reads it.");
        const file = await resolveGeofabrikFile(client, region.pbf, region.name, signal);
        return {
          hosts: hostsOf(file.url),
          sizeBytes: file.bytes,
          dataDate: file.nameDate,
          newer: file.nameDate && meta.dataDate ? file.nameDate > meta.dataDate : null,
        };
      }
      throw badRequest("This kind of map data is not checked from here.");
    },

    async update(collectionId: string, signal?: AbortSignal): Promise<MapDataUpdateResponse> {
      const row = rowOf(collectionId);
      if (row.kind === "map" || row.kind === "terrain")
        return { downloadIds: [(await ctx.services.maps.regions.update(row.id, signal)).id] };
      if (row.kind === "places") return { downloadIds: [(await ctx.services.maps.places.update(row.id)).id] };
      if (row.kind === "extract") {
        const meta = countryFileOf(row);
        // Newer than the one kept: otherwise the kept one would be found and nothing fetched.
        const after = new Date(Date.parse(`${meta.dataDate ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`) + 86_400_000);
        const added = await ctx.services.countryFiles.add({
          regionId: meta.regionId,
          roads: false,
          layers: [],
          keep: true,
          locationId: row.locationId,
          newerThan: after.toISOString().slice(0, 10),
        });
        return { downloadIds: added.downloadId ? [added.downloadId] : [] };
      }
      throw badRequest("This kind of map data is not updated from here.");
    },
  };
}
