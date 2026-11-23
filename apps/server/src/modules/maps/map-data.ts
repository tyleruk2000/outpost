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
  type MapDataCountry,
  type MapDataItem,
  type MapDataKind,
  type MapDataProgress,
  type MapDataResponse,
  type MapDataState,
  OS_NAMES_DATASET,
} from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import type { JobRow } from "../../core/jobs.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow } from "../downloads/types.ts";
import { createRegionIndex } from "../layers/adapters/geofabrik-regions.ts";
import { EXTRACT_LAYERS } from "../layers/adapters/osm-tags.ts";
import { COUNTRIES, countryOf } from "../layers/countries.ts";
import { DEFAULT_PLACE_LAYERS, isCountryFileDownload } from "./country-files.ts";
import { bboxSchema } from "./regions.ts";

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

export function createMapData(ctx: AppContext, client: HttpClient) {
  const { collections, storage, downloads, settings } = ctx.services;

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
        dataDate: row.version && /^\d{4}-\d{2}-\d{2}/.test(row.version) ? row.version.slice(0, 10) : dayOf(row.installedAt),
        progress: moving ? progressOf(moving) : null,
        collectionId: row.id,
        regionId: typeof row.meta.regionId === "string" ? row.meta.regionId : null,
        taskId: jobs[0]?.id ?? null,
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
