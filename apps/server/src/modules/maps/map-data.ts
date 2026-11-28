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
  type MapDataWhereResponse,
  type MapDataWhereResult,
  mapPlacesOf,
  OS_NAMES_DATASET,
  type PlaceDto,
} from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import type { JobRow } from "../../core/jobs.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow } from "../downloads/types.ts";
import { resolveGeofabrikFile } from "../layers/adapters/geofabrik-file.ts";
import { createRegionIndex, GEOFABRIK_BASE, type GeofabrikRegion } from "../layers/adapters/geofabrik-regions.ts";
import { EXTRACT_LAYERS } from "../layers/adapters/osm-tags.ts";
import { countryOfPoint } from "../layers/borders.ts";
import { COUNTRIES, countryOf } from "../layers/countries.ts";
import { foldName } from "../layers/store.ts";
import { countryLookup } from "../roads/plan.ts";
import { DEFAULT_PLACE_LAYERS, isCountryFileDownload } from "./country-files.ts";

import type { OsNamesService } from "./os-names/index.ts";
import { OS_DOWNLOADS_API } from "./os-names/source.ts";
import { exonymsMatching, REGION_EXONYMS } from "./region-exonyms.ts";
import { bboxSchema, dayOfBuild } from "./regions.ts";
import { BUILD_BASE_URL, BUILDS_URL, hostOf } from "./source.ts";

/**
 * Sets made once and never revised: Natural Earth's outlines (2022), WorldPop's census grids and
 * the historical records behind the nuclear layers. They are never "over a year old".
 */
export const AGELESS_PROVIDERS = new Set([
  "natural-earth",
  "worldpop",
  "fas",
  "sipri",
  "nti",
  "iaea",
  "nsarchive",
  "napb-90",
  "tna",
  "ensi",
]);
/** Sets of the whole world, listed under World basics whatever country they were clipped to. */
export const WORLD_PROVIDERS = new Set(["natural-earth", "ourairports", "worldpop"]);

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
    streets: z
      .object({ workLocationId: z.string().min(1).max(100).optional() })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const fromFile = value.kinds.some((kind) => kind === "roads" || kind === "places" || kind === "extract");
    if (fromFile && !value.regionId) context.addIssue({ code: "custom", path: ["regionId"], message: "Choose the country or region." });
    // The person's own choice, every time: nothing is kept or deleted by default.
    if (fromFile && value.keep === undefined)
      context.addIssue({ code: "custom", path: ["keep"], message: "Say whether to keep the source file once it is read." });
    if (value.kinds.includes("extract") && value.keep === false)
      context.addIssue({ code: "custom", path: ["keep"], message: "Adding the source file on its own means keeping it." });
    if (value.streets && !(fromFile && value.keep === true))
      context.addIssue({
        code: "custom",
        path: ["streets"],
        message: "Walking and cycling are built from the source file: keep it to build them.",
      });
    if ((value.kinds.includes("map") || value.kinds.includes("terrain")) && !value.map)
      context.addIssue({ code: "custom", path: ["map"], message: "Give the area of the map: its name, box and zoom." });
    if (value.kinds.includes("terrain") && !value.kinds.includes("map"))
      context.addIssue({ code: "custom", path: ["kinds"], message: "Hills and heights are added with a map of the same area." });
    if (value.kinds.includes("names") && !value.country)
      context.addIssue({ code: "custom", path: ["country"], message: "Say which country's place names to add." });
  });

const isWorld = (box: readonly number[]) => box[2]! - box[0]! > 300;

/** Points a map's box is looked at on, each way: 17 by 17. */
const AREA_GRID = 16;
/** The share of a map's land one country needs for the map to be listed with it: half for a ready-made area, more for one of the person's. */
const READY_MADE_SHARE = 0.5;
const OWN_SHARE = 0.6;
const areaAnswers = new Map<string, string | null>();

/**
 * The country a map area is of, by the country outlines (layers/borders.ts), not by boxes:
 * its box is looked at on a grid of 17 by 17 points, and the country that holds the most of
 * the points on land is it, when it holds half of them for a ready-made area, or 0.6 for a
 * map brought in from a file or drawn by hand. So Bavaria is Germany's though Austria's box
 * holds its middle, and a map across the Alps is of no one country. A ready-made country
 * (`country-lu`) is that country's, however much of its box its neighbours hold.
 */
export function countryOfArea(box: Bbox, presetId: string | null): string | null {
  const named = /^country-([a-z]{2})$/.exec(presetId ?? "")?.[1]?.toUpperCase();
  if (named && countryOf(named)) return named;
  const readyMade = presetId !== null;
  const key = `${box.join(",")}:${readyMade}`;
  const known = areaAnswers.get(key);
  if (known !== undefined) return known;
  const [west, south, east, north] = box;
  const hits = new Map<string, number>();
  let land = 0;
  if (east >= west && north >= south) {
    for (let i = 0; i <= AREA_GRID; i += 1) {
      for (let j = 0; j <= AREA_GRID; j += 1) {
        const code = countryOfPoint(south + ((north - south) * i) / AREA_GRID, west + ((east - west) * j) / AREA_GRID);
        if (!code) continue;
        land += 1;
        hits.set(code, (hits.get(code) ?? 0) + 1);
      }
    }
  }
  const [best] = [...hits.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const answer = best && best[1] >= land * (readyMade ? READY_MADE_SHARE : OWN_SHARE) ? best[0] : null;
  if (areaAnswers.size > 500) areaAnswers.clear();
  areaAnswers.set(key, answer);
  return answer;
}

const dayOf = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

/** The day a collection's data is from: its version where that is a day ("2026-11-21" or a map build's "20261121"). */
/** The day a version says: a date, a build day (20261115), or an edition of a month (OS Open Names' "2026-10", its first day). */
const dayOfVersion = (version: string | null) =>
  version && /^\d{4}-\d{2}-\d{2}/.test(version)
    ? version.slice(0, 10)
    : version && /^\d{4}-\d{2}$/.test(version)
      ? `${version}-01`
      : dayOfBuild(version);

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
  /** Why hills and heights have no date: their source, by name where it is Mapterhorn's, gives none. */
  const terrainUndated = () => {
    const host = hosts.terrain()[0] ?? "";
    const source = /(^|\.)mapterhorn\.com$/.test(host) ? "Mapterhorn" : host || "Its source";
    return `${source} gives no date for its heights`;
  };
  /** How a collection of this kind is brought up to date. */
  function updateWay(row: CollectionRow, kind: MapDataKind): MapDataUpdateWay | null {
    const way = (how: MapDataUpdateWay["how"], list: string[], note: string | null = null): MapDataUpdateWay => ({
      how,
      hosts: list,
      note,
    });
    if (kind === "imagery") return way("elsewhere", [], "Not updated: add the area again under Add a place and choose a newer picture.");
    if (kind === "map" || kind === "terrain")
      return row.meta.imported ? null : way("download", kind === "map" ? hosts.map() : hosts.terrain());
    if (kind === "names")
      return row.meta.dataset === OS_NAMES_DATASET
        ? way("download", hostsOf(ctx.config.osDownloadsUrl ?? OS_DOWNLOADS_API))
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
        // Hills and heights from a source that gives no date (Mapterhorn) have none: the day they were
        // downloaded is not the day of their data, and would make them "over a year old" by the calendar alone.
        dataDate: dayOfVersion(row.version) ?? (kind === "terrain" ? null : dayOf(row.installedAt)),
        ...(kind === "terrain" && !dayOfVersion(row.version) ? { undated: terrainUndated() } : {}),
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
      else if (
        code &&
        countryOf(code) &&
        (item.kind === "streets" || MAP_DATA_COUNTRY_KINDS.includes(item.kind as (typeof MAP_DATA_COUNTRY_KINDS)[number]))
      ) {
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
      // By the country outlines: a ready-made area, a map brought in from a file and one drawn by hand alike.
      else if (!imagery && bounds) put(countryOfArea(bounds as Bbox, preset), item);
      else other.push({ ...item, bbox: (bounds as Bbox | undefined) ?? null });
    }
    for (const row of active.filter((d) => d.kind === "map" || d.kind === "terrain")) {
      const meta = row.meta as { bbox?: Bbox; regionId?: string; imagery?: unknown };
      const kind: MapDataKind = meta.imagery ? "imagery" : row.kind === "terrain" ? "terrain" : "map";
      const item = fromDownload(row, kind);
      if (meta.bbox && isWorld(meta.bbox)) put(null, item, true);
      else if (!meta.imagery && meta.bbox) put(countryOfArea(meta.bbox, meta.regionId ?? null), item);
      else other.push({ ...item, bbox: meta.bbox ?? null });
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
    /**
     * What each set of nearby places takes in Outpost's database, apart from its file: its records are
     * in the database on Outpost's own disk, not on the storage location its file is on, which Storage's
     * bar for that location counts. Said under Outpost's own data, so the two agree.
     */
    const inDatabase = new Map<string, number>();
    for (const pack of ctx.services.layers?.packs() ?? []) {
      const row = collections.get(pack.id);
      if (!row) continue;
      inDatabase.set(`collection:${row.id}`, Math.max(0, pack.sizeBytes - (row.sizeBytes ?? 0)));
      const item = {
        ...fromCollection(row, "places"),
        count: pack.records,
        // Its records in the database, not the few bytes left of a file read and deleted.
        sizeBytes: pack.sizeBytes,
        layers: pack.layers,
        packId: pack.id,
        ageless: AGELESS_PROVIDERS.has(pack.provider),
        dataDate: pack.publishedAt?.slice(0, 10) ?? dayOf(pack.retrievedAt),
        regionId: pack.request?.scope.regions?.[0] ?? null,
        update:
          pack.request?.provider === "osm-extract" && pack.request.scope.regions?.[0]
            ? { how: "country-file" as const, hosts: hosts.geofabrik(), note: null }
            : pack.origin === "download"
              ? { how: "elsewhere" as const, hosts: [], note: "Asked of its own source on a press of Check." }
              : null,
      };
      // Borders, airports and other world sets are World basics, even clipped to one country.
      if (pack.countries.length === 1 && !WORLD_PROVIDERS.has(pack.provider)) put(pack.countries[0], item);
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

    // ── Streets for routes (the optional add-on): only where it is installed ──
    const streets = ctx.services.streets?.mapDataItems() ?? [];
    for (const { country, item } of streets) put(country, item);
    const streetsInstalled = ctx.services.streets?.connection.installed() ?? false;

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
            // The download is the source file: its bytes are the source file's line, not the routes' or the places'.
            sizeBytes: kind === "extract" ? item.sizeBytes : null,
            regionId: entry.regionId,
            layers: kind === "places" ? entry.layers : [],
          };
        }
        return {
          ...base(kind, `task:${job?.id}:${kind}`, entry.name),
          state:
            job?.state === "queued" ? "waiting" : job?.state === "failed" ? "failed" : job?.state === "paused" ? "paused" : "processing",
          progress: progressOf(job, entry.step),
          reason: job?.state === "failed" ? (job.error ?? "The source file could not be read.") : null,
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
          rows: [
            ...MAP_DATA_COUNTRY_KINDS.map((kind) => ({ kind, items: rows.get(kind) ?? [] })),
            // Streets for routes, a seventh row, only where the add-on is installed.
            ...(streetsInstalled ? [{ kind: "streets" as const, items: rows.get("streets") ?? [] }] : []),
          ],
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
    // One set of streets can cover several countries: count it once.
    const mapItemOnDisk = everything.filter(
      (item, index) => !item.downloadId && item.sizeBytes && everything.findIndex((other) => other.key === item.key) === index,
    );
    const byLocation = new Map<string | null, number>();
    for (const item of mapItemOnDisk) {
      const database = Math.min(item.sizeBytes ?? 0, inDatabase.get(item.key) ?? 0);
      byLocation.set(item.locationId, (byLocation.get(item.locationId) ?? 0) + (item.sizeBytes ?? 0) - database);
      if (database > 0) byLocation.set(null, (byLocation.get(null) ?? 0) + database);
    }
    const choice = settings.get("maps.countryFileKeep");
    const lastKept = countryFiles.at(0);
    return {
      summary: {
        totalBytes: mapItemOnDisk.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
        locations: [...byLocation.entries()]
          .map(([locationId, bytes]) => ({
            locationId,
            name: locationId === null ? "Outpost's own data" : (locations.get(locationId)?.name ?? "Unknown location"),
            bytes,
            available: locationId === null || locations.get(locationId)?.status === "available",
          }))
          .filter((entry) => entry.bytes > 0)
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
      places: mapPlacesOf({ countries, world, other }, { streets: streetsInstalled }),
      streetsInstalled,
    };
  };
}

/** The combined add: the country file's reads in one download (or none, where it is kept), and the map, terrain and names beside it. */
export function createMapDataAdd(ctx: AppContext, osNames: () => OsNamesService | undefined = () => undefined) {
  /**
   * Place names for Great Britain come from Ordnance Survey (every road, village and postcode)
   * rather than GeoNames, with nothing more to choose: OS is asked for its current edition on the
   * same press. Held already: nothing. OS out of reach: GeoNames' list for the country instead.
   */
  async function osNamesFor(country: string, locationId: string | undefined): Promise<string | "held" | null> {
    const os = osNames();
    if (country !== "GB" || !os) return null;
    try {
      await os.check();
      return (await os.start({ roads: true, ...(locationId ? { locationId } : {}) })).id;
    } catch (error) {
      if (error instanceof AppError && error.code === "conflict") return "held";
      return null;
    }
  }

  /**
   * The kinds of nearby places to read from a region's source file. A new read replaces the
   * region's places whole, so the kinds held already are read again with those asked for: adding
   * shelters never takes hospitals away. Asked for none (an update): the kinds held, or the usual six.
   */
  function placeLayers(regionId: string, asked: string[] | undefined): string[] {
    const held = (ctx.services.layers?.packs() ?? [])
      .filter((pack) => pack.provider === "osm-extract" && pack.request?.scope.regions?.[0] === regionId)
      .flatMap((pack) => pack.request?.layers ?? pack.layers);
    const base = asked ?? (held.length > 0 ? held : DEFAULT_PLACE_LAYERS);
    return [...new Set([...base, ...held])];
  }

  return async function add(body: MapDataAddRequest): Promise<MapDataAddResponse> {
    const downloadIds: string[] = [];
    const taskIds: string[] = [];
    let countryFile: MapDataAddResponse["countryFile"] = null;
    const kinds = new Set(body.kinds);
    if (kinds.has("roads") || kinds.has("places") || kinds.has("extract")) {
      if (!body.regionId || body.keep === undefined) throw badRequest("Choose the place, and whether to keep its source file.");
      const added = await ctx.services.countryFiles.add({
        regionId: body.regionId,
        roads: kinds.has("roads"),
        layers: kinds.has("places") ? placeLayers(body.regionId, body.layers) : [],
        keep: body.keep,
        ...(body.locationId ? { locationId: body.locationId } : {}),
        ...(body.newerThan ? { newerThan: body.newerThan } : {}),
        remember: true,
        ...(body.streets ? { streets: body.streets } : {}),
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
      const os = await osNamesFor(body.country, body.locationId);
      if (os === null) {
        const row = await ctx.services.maps.places.startDownload({
          dataset: "country",
          country: body.country,
          ...(body.locationId ? { locationId: body.locationId } : {}),
        } as never);
        downloadIds.push(row.id);
      } else if (os !== "held") downloadIds.push(os);
    }
    return { countryFile, downloadIds, taskIds };
  };
}

/**
 * Bringing one kept thing up to date, on a press: first asking its source how large and how new
 * the newest copy is (nothing downloaded), then downloading it. The one kept stays, and is used,
 * until the new one is in place and checked; a failed download leaves it as it was.
 */
export function createMapDataUpdates(ctx: AppContext, client: HttpClient, osNames: () => OsNamesService | undefined = () => undefined) {
  const { collections } = ctx.services;
  const hosts = updateHosts(ctx);

  function rowOf(collectionId: string): CollectionRow {
    const row = collections.get(collectionId);
    if (!row) throw new AppError("not_found", "That map data was not found. It may have been removed.");
    return row;
  }

  const countryFileOf = (row: CollectionRow) => {
    const meta = (row.meta as { countryFile?: { regionId?: string; name?: string; dataDate?: string | null } }).countryFile;
    if (!meta?.regionId) throw badRequest("Outpost does not know which place this source file is of.");
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
        if (row.meta.dataset === OS_NAMES_DATASET) {
          const os = osNames();
          if (!os) throw badRequest("Ordnance Survey's place names cannot be checked on this installation.");
          const found = await os.check(signal);
          return {
            hosts: [found.host],
            sizeBytes: found.sizeBytes,
            dataDate: /^\d{4}-\d{2}$/.test(found.edition) ? `${found.edition}-01` : null,
            newer: found.installed ? found.updateAvailable : true,
          };
        }
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
      if (row.kind === "places" && row.meta.dataset === OS_NAMES_DATASET) {
        const os = osNames();
        if (!os) throw badRequest("Ordnance Survey's place names cannot be updated on this installation.");
        await os.check(signal);
        return { downloadIds: [(await os.start({ roads: row.meta.roads !== false, locationId: row.locationId })).id] };
      }
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

export const mapDataWhereSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    countries: z
      .string()
      .regex(/^[A-Za-z]{2}(,[A-Za-z]{2}){0,19}$/, "Give countries as two letters each, such as FR,CH.")
      .optional(),
  })
  .strict();

const MAX_WHERE = 12;

/** GeoNames' first-level divisions where Geofabrik's parts are the same divisions by name. */
const GEONAMES_DIVISIONS: Record<string, Record<string, string>> = {
  GB: { ENG: "England", SCT: "Scotland", WLS: "Wales", NIR: "Northern Ireland" },
};

/**
 * The part of Geofabrik's list a town is in, by the division its place names give, without
 * the regions layer: GeoNames' code as ISO 3166-2 ("OH" is US-OH) or by name (GB's "ENG" is
 * England), or OS Open Names' words ("Aberystwyth, Ceredigion, Wales").
 */
export function partOfDivision(
  listed: ReadonlyArray<GeofabrikRegion>,
  code: string,
  town: Pick<PlaceDto, "source" | "admin1">,
): GeofabrikRegion | null {
  const admin1 = town.admin1?.trim();
  if (!admin1) return null;
  const parts = listed.filter((region) => region.country === code && region.depth > 0);
  if (town.source === "os") {
    // The smallest part any of its words names: Cumbria before England.
    const words = new Set(
      admin1
        .split(",")
        .map((word) => foldName(word))
        .filter(Boolean),
    );
    const named = parts.filter((region) => words.has(foldName(region.name))).sort((a, b) => b.depth - a.depth);
    return named[0] ?? null;
  }
  const iso = `${code}-${admin1.toUpperCase()}`;
  const byCode = parts.find((region) => region.sub?.includes(iso));
  if (byCode) return byCode;
  const name = GEONAMES_DIVISIONS[code]?.[admin1.toUpperCase()];
  return name ? (parts.find((region) => foldName(region.name) === foldName(name)) ?? null) : null;
}

/**
 * "Where?" for Add a place, answered from what Outpost holds and nothing else: a country by its
 * name, a part of one from Geofabrik's list (once read), a town from the place names held, which
 * is said with its country and the part it is in ("Chamonix is in France: Rhône-Alpes"), and the
 * country of a point tapped on the small world map.
 */
export function createMapDataWhere(
  ctx: AppContext,
  client: HttpClient,
  presets: () => ReadonlyArray<{ id: string; name: string; bbox: Bbox }> = () => [],
) {
  return function where(query: z.infer<typeof mapDataWhereSchema>): MapDataWhereResponse {
    const listed = createRegionIndex(ctx, client).kept()?.regions ?? null;
    const wholeOf = (code: string) => listed?.find((region) => region.depth === 0 && region.country === code) ?? null;
    const results: MapDataWhereResult[] = [];
    const push = (result: MapDataWhereResult) => {
      const same = results.some((each) => each.type === result.type && each.country === result.country && each.name === result.name);
      if (!same && results.length < MAX_WHERE) results.push(result);
    };
    const countryResult = (code: string, part: MapDataWhereResult["part"] = null): MapDataWhereResult | null => {
      const country = countryOf(code);
      if (!country) return null;
      return {
        type: "country",
        name: country.name,
        country: country.code,
        countryName: country.name,
        regionId: wholeOf(country.code)?.id ?? null,
        part,
        bbox: country.bbox,
        lat: null,
        lon: null,
      };
    };
    /**
     * The part of its country a point is in: by the regions layer where it is held; else, for a
     * town, by the division its place names give (GeoNames' "ENG", "OH"; OS Open Names' "…, Wales").
     */
    const partAt = (lat: number, lon: number, code: string, town?: Pick<PlaceDto, "source" | "admin1">): MapDataWhereResult["part"] => {
      if (!listed) return null;
      const suggested = ctx.services.layers?.regions({ lat, lon }).suggested ?? [];
      const whole = wholeOf(code)?.id;
      for (const entry of suggested) {
        const region = listed.find((each) => each.id === entry.id);
        if (region && region.id !== whole && region.country === code) return { regionId: region.id, name: region.name };
      }
      const division = town ? partOfDivision(listed, code, town) : null;
      return division ? { regionId: division.id, name: division.name } : null;
    };
    /** A part's own box: a ready-made area of its name in the same country, else its record in the regions layer where held. */
    const partBoxOf = (part: MapDataWhereResult["part"], code: string): Bbox | null => {
      if (!part) return null;
      const names = new Set(
        [
          part.name,
          part.name.replace(/\s*\(.*\)$/, ""),
          ...REGION_EXONYMS.filter((e) => e.id === part.regionId).flatMap((e) => e.english),
        ].map(foldName),
      );
      const preset = presets().find((each) => names.has(foldName(each.name)) && countryOfArea(each.bbox, each.id) === code);
      if (preset) return preset.bbox;
      const store = ctx.services.layers?.store;
      if (!store) return null;
      for (const name of names) {
        let hits: ReturnType<typeof store.search> = [];
        try {
          hits = store.search(name, { layers: ["regions"], countries: [code] }, 5);
        } catch {
          hits = [];
        }
        const hit = hits.find((each) => foldName(each.name) === name && (!each.country || each.country.toUpperCase() === code));
        const box = hit ? store.detail(hit.id, new Map())?.bbox : null;
        if (box) return box;
      }
      return null;
    };

    for (const code of (query.countries ?? "").split(",").filter(Boolean)) {
      const found = countryResult(code.toUpperCase());
      if (found) push(found);
    }

    if (query.lat !== undefined && query.lon !== undefined) {
      const code = countryLookup(query.lat, query.lon, null);
      const part = code ? partAt(query.lat, query.lon, code) : null;
      const found = code ? countryResult(code, part) : null;
      if (found) push({ ...found, partBbox: code ? partBoxOf(part, code) : null });
    }

    const typed = foldName(query.q ?? "");
    if (typed.length > 0) {
      const rank = (name: string) => (foldName(name).startsWith(typed) ? 0 : 1);
      const countries = COUNTRIES.filter((country) => foldName(country.name).includes(typed)).sort(
        (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "en"),
      );
      for (const country of countries.slice(0, 6)) {
        const found = countryResult(country.code);
        if (found) push(found);
      }
      // "Bavaria": a part Geofabrik names in its own language, found by its English name, before and after its list is read.
      for (const { exonym, english } of exonymsMatching(typed, foldName)) {
        const country = countryOf(exonym.country);
        const region = listed ? listed.find((each) => each.id === exonym.id) : null;
        if (!country || region === undefined) continue;
        push({
          type: "part",
          name: `${region?.name ?? exonym.name} (${english})`,
          country: country.code,
          countryName: country.name,
          regionId: wholeOf(country.code)?.id ?? null,
          part: { regionId: exonym.id, name: `${region?.name ?? exonym.name} (${english})` },
          bbox: country.bbox,
          partBbox: partBoxOf({ regionId: exonym.id, name: region?.name ?? exonym.name }, country.code),
          lat: null,
          lon: null,
        });
      }
      if (listed) {
        const parts = listed
          .filter((region) => region.depth > 0 && foldName(region.name).includes(typed))
          .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "en"));
        for (const region of parts.slice(0, 6)) {
          const country = countryOf(region.country ?? "");
          if (!country) continue;
          push({
            type: "part",
            name: region.name,
            country: country.code,
            countryName: country.name,
            regionId: wholeOf(country.code)?.id ?? null,
            part: { regionId: region.id, name: region.name },
            bbox: country.bbox,
            partBbox: partBoxOf({ regionId: region.id, name: region.name }, country.code),
            lat: null,
            lon: null,
          });
        }
      }
      if (typed.length >= 3) {
        let towns: PlaceDto[] = [];
        try {
          towns = ctx.services.maps.places.search(query.q ?? "", { limit: 8 }).places;
        } catch {
          towns = [];
        }
        for (const town of towns) {
          const code = (town.country ?? countryLookup(town.lat, town.lon, null))?.toUpperCase();
          const country = code ? countryOf(code) : undefined;
          if (!country) continue;
          const part = partAt(town.lat, town.lon, country.code, town);
          push({
            type: "town",
            name: town.name,
            country: country.code,
            countryName: country.name,
            regionId: wholeOf(country.code)?.id ?? null,
            part,
            bbox: country.bbox,
            partBbox: partBoxOf(part, country.code),
            lat: town.lat,
            lon: town.lon,
          });
        }
      }
    }
    return { results, regionsListed: listed !== null };
  };
}
