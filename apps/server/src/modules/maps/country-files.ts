/**
 * Country files: one Geofabrik extract (`.osm.pbf`) per region, downloaded once and read
 * for everything made from it (road networks in modules/roads, places to find in
 * modules/layers), then kept or deleted as the person chose.
 *
 * A kept file is a collection of kind "extract" on the storage location the person chose,
 * so Storage moves, checks and removes it like any other file, and it is marked missing or
 * damaged as any other is. Roads and places are read from a kept file instead of a new
 * download whenever one is there for the region and is not older than asked. A kept file is
 * deleted only when a person removes it; one not kept is deleted once read, which is what
 * the person chose. Nothing here reaches out except on a press: the download, and finding
 * which dated file to download.
 *
 * Every file read is written down (`country_files`): kept or not, its size and date, so
 * the Map data screen can say "read and deleted 17 Nov 2026 (2.29 GB)".
 */
import crypto from "node:crypto";
import fs from "node:fs";
import type { MapDataAddResponse } from "@outpost/shared";
import { desc } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { countryFiles as countryFilesTable } from "../../db/schema.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow, Installer } from "../downloads/types.ts";
import { dateOfName, fileNameOf, type GeofabrikFile, resolveGeofabrikFile } from "../layers/adapters/geofabrik-file.ts";
import { createRegionIndex, type GeofabrikRegion } from "../layers/adapters/geofabrik-regions.ts";
import { OSM_LAYERS } from "../layers/adapters/osm-tags.ts";
import { blobs, readHeader } from "../layers/adapters/pbf.ts";
import type { ReferenceMeta } from "../layers/types.ts";

export const COUNTRY_FILE_READ_JOB = "maps.country-file.read";
export const COUNTRY_FILE_FOLDER = "collections/country-files";
/** Places to find, when the person does not say which: the five safety layers, and food and supplies. */
export const DEFAULT_PLACE_LAYERS = [...OSM_LAYERS, "food"];

/** What a country file's collection carries in `meta.countryFile`. */
export interface CountryFileMeta {
  regionId: string;
  name: string;
  country: string | null;
  dataDate: string | null;
  fileName: string;
  sourceUrl: string;
  md5: string | null;
}

/** What is to be done with a country file once it is here: on the download's `meta.countryFile`, or a read task's payload. */
export interface CountryFileWork {
  regionId: string;
  name: string;
  country: string | null;
  sourceUrl: string;
  md5: string | null;
  fileName: string;
  keep: boolean;
  roads: boolean;
  /** The places pack to read, or null for none. */
  reference: ReferenceMeta | null;
  /** Walking and cycling to build from the file once it is kept (Add a place's tick), and where the build works. */
  streets?: { workLocationId: string | null } | null;
}

interface ReadPayload extends CountryFileWork {
  collectionId: string;
  [key: string]: unknown;
}

export interface KeptCountryFile {
  collectionId: string;
  regionId: string;
  dataDate: string | null;
  fileName: string;
  bytes: number;
  locationId: string;
  locationName: string;
  sourceUrl: string;
  md5: string | null;
}

/** A country file on its way: downloading, waiting, being read, or stopped with a reason. */
export interface PendingCountryFile {
  regionId: string;
  name: string;
  country: string | null;
  roads: boolean;
  layers: string[];
  keep: boolean;
  state: string;
  message: string | null;
  error: string | null;
  downloadId: string | null;
  taskId: string | null;
  /** Which of the reads after arrival is under way. */
  step: { at: number; of: number } | null;
}

export interface AddCountryFile {
  regionId: string;
  /** Already found (the places screen's estimate found it); otherwise found in Geofabrik's list as kept. */
  region?: { id: string; name: string; country: string | null; pbf: string };
  /** The dated file already found, with its MD5 (from an estimate). */
  file?: { url: string; md5: string; bytes: number | null; fileName: string; fallback: string | null };
  roads: boolean;
  /** Places to read; empty for none. */
  layers: string[];
  /** The places pack as the places screen made it; otherwise made here. */
  reference?: ReferenceMeta;
  keep: boolean;
  locationId?: string;
  /** Use a kept file only if its data is from this day or later. */
  newerThan?: string;
  /** Remember `keep` as the choice to preselect next time (the Map data screen's own add). */
  remember?: boolean;
  /** Build walking and cycling from the file once it is kept: needs `keep`. */
  streets?: { workLocationId?: string };
}

export interface CountryFilesService {
  add(input: AddCountryFile): Promise<{ downloadId: string | null; taskId: string | null; countryFile: MapDataAddResponse["countryFile"] }>;
  /** The newest kept, usable country file for a region, if there is one. */
  kept(regionId: string): KeptCountryFile | null;
  /** Every kept country file's collection. */
  keptFiles(): Array<{ row: CollectionRow; meta: CountryFileMeta }>;
  pending(): PendingCountryFile[];
  /** Country files read, newest first. */
  history(): Array<typeof countryFilesTable.$inferSelect>;
  installer: Installer;
}

declare module "../../core/context.ts" {
  interface Services {
    countryFiles: CountryFilesService;
  }
}

export const countryFileMetaOf = (row: CollectionRow): CountryFileMeta | null => {
  const meta = (row.meta as { countryFile?: CountryFileMeta }).countryFile;
  return meta && typeof meta.regionId === "string" ? meta : null;
};

/**
 * What a download or read of a source file is for, in the words of Offline maps: "routes and nearby
 * places", "routes", "nearby places", or "source file" where it is only kept.
 */
export function sourceFileWork(work: { roads: boolean; layers: number }): string {
  const what = [work.roads ? "routes" : null, work.layers > 0 ? "nearby places" : null].filter(Boolean);
  return what.length > 0 ? what.join(" and ") : "source file";
}

export const isCountryFileDownload = (download: DownloadRow) =>
  download.kind === "extract" && typeof (download.meta as { countryFile?: unknown }).countryFile === "object";

const workOf = (download: DownloadRow) => (download.meta as { countryFile: CountryFileWork }).countryFile;

/** The day the data is from, from the file's own header; null when it gives none. */
export async function headerDate(filePath: string, signal?: AbortSignal): Promise<string | null> {
  for await (const blob of blobs(filePath, signal)) {
    if (blob.type === "OSMHeader") return readHeader(blob.data).timestamp?.slice(0, 10) ?? null;
    break;
  }
  return null;
}

/** The places pack read from a region's file, as the places screen's Geofabrik download would have made it. */
export function referenceFor(region: GeofabrikRegion, parents: string[], layers: string[], sourceUrl: string): ReferenceMeta {
  return {
    provider: "osm-extract",
    key: `geofabrik:${region.id}:${region.country ?? ""}`,
    title: `${[region.name, ...parents].join(", ")}: nearby places`,
    layers: layers as ReferenceMeta["layers"],
    request: { provider: "osm-extract", scope: { regions: [region.id] }, layers: layers as ReferenceMeta["layers"] },
    countries: region.country ? [region.country] : [],
    bbox: null,
    sourceUrl,
    origin: "download",
    options: { region: region.id, regionName: region.name, keep: "places" },
  };
}

/** When the file came, to the second, and a short random tail: two downloads in the same second must not share a name. */
const stamp = () => `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${crypto.randomBytes(2).toString("hex")}`;

export function createCountryFiles(ctx: AppContext, client: HttpClient): CountryFilesService {
  const { collections, storage, downloads, settings } = ctx.services;
  /** Which read is under way for a download or task, for the screen. */
  const steps = new Map<string, { at: number; of: number }>();

  function keptFiles() {
    return collections
      .list({ kind: "extract" })
      .map((row) => ({ row, meta: countryFileMetaOf(row) }))
      .filter((entry): entry is { row: CollectionRow; meta: CountryFileMeta } => entry.meta !== null);
  }

  function kept(regionId: string, newerThan?: string): KeptCountryFile | null {
    const usable = keptFiles()
      .filter(({ row, meta }) => meta.regionId === regionId && row.status === "installed" && storage.isAvailable(row.locationId))
      .filter(({ meta }) => !newerThan || (meta.dataDate !== null && meta.dataDate >= newerThan))
      .sort((a, b) => (b.meta.dataDate ?? "").localeCompare(a.meta.dataDate ?? "") || b.row.installedAt - a.row.installedAt);
    const found = usable[0];
    if (!found) return null;
    const location = storage.list().find((candidate) => candidate.id === found.row.locationId);
    return {
      collectionId: found.row.id,
      regionId,
      dataDate: found.meta.dataDate,
      fileName: found.meta.fileName,
      bytes: found.row.sizeBytes,
      locationId: found.row.locationId,
      locationName: location?.name ?? "Unknown location",
      sourceUrl: found.meta.sourceUrl,
      md5: found.meta.md5,
    };
  }

  /**
   * What is made from a country file once it is here, one read after another: the roads, then the places.
   * The file stays where it is: keeping or deleting it is for whoever called.
   */
  async function readAll(input: {
    work: CountryFileWork;
    filePath: string;
    locationId: string;
    relPath: string;
    bytes: number;
    collectionId: string | null;
    id: string;
    signal: AbortSignal;
    progress: (current: number, total: number | null, message: string, unit?: string | null) => void;
  }) {
    const { work } = input;
    const dataDate = (await headerDate(input.filePath, input.signal).catch(() => null)) ?? dateOfName(work.fileName);
    const of = (work.roads ? 1 : 0) + (work.reference ? 1 : 0);
    let at = 0;
    let roadNetworkId: string | null = null;
    let packId: string | null = null;
    const step = (words: string) => {
      at += 1;
      steps.set(input.id, { at, of });
      return (current: number, total: number | null, message: string, unit?: string | null) =>
        input.progress(current, total, of > 1 ? `${words} (step ${at} of ${of}): ${message}` : `${words}: ${message}`, unit);
    };
    try {
      if (work.roads) {
        const built = await ctx.services.roads.buildFromCountryFile({
          filePath: input.filePath,
          regionId: work.regionId,
          name: work.name,
          country: work.country,
          sourceUrl: work.sourceUrl,
          bytes: input.bytes,
          kept:
            work.keep || input.collectionId
              ? { locationId: input.locationId, relPath: input.relPath, collectionId: input.collectionId }
              : null,
          signal: input.signal,
          progress: step("Reading the main roads"),
        });
        roadNetworkId = built.id;
      }
      if (work.reference) {
        const progress = step("Reading the places to find");
        const read = await ctx.services.layers.readCountryFile({
          reference: work.reference,
          filePath: input.filePath,
          locationId: input.locationId,
          fileRelPath: input.relPath,
          sizeBytes: input.bytes,
          kept: work.keep || input.collectionId !== null,
          signal: input.signal,
          progress: (current, total, message) => progress(current, total, message),
        });
        packId = read.packId;
      }
    } finally {
      steps.delete(input.id);
    }
    return { dataDate, roadNetworkId, packId };
  }

  function record(entry: {
    work: CountryFileWork;
    dataDate: string | null;
    bytes: number;
    collectionId: string | null;
    roadNetworkId: string | null;
    packId: string | null;
  }) {
    const now = Date.now();
    ctx.db
      .insert(countryFilesTable)
      .values({
        id: newId(),
        regionId: entry.work.regionId,
        name: entry.work.name,
        country: entry.work.country,
        dataDate: entry.dataDate,
        fileName: entry.work.fileName,
        sourceUrl: entry.work.sourceUrl,
        bytes: entry.bytes,
        collectionId: entry.collectionId,
        roadNetworkId: entry.roadNetworkId,
        packId: entry.packId,
        readAt: now,
        createdAt: now,
      })
      .run();
    ctx.events.publish({ type: "maps.changed" });
  }

  const installer: Installer = async ({ download, filePath, sizeBytes, sha256, signal, progress }) => {
    if (!isCountryFileDownload(download)) throw new PermanentJobError("Outpost does not know what this source file is for.");
    const work = workOf(download);
    const made = await readAll({
      work,
      filePath,
      locationId: download.locationId,
      relPath: download.relPath,
      bytes: sizeBytes,
      collectionId: null,
      id: download.id,
      signal,
      progress: (current, total, message) => progress(current, total, message),
    });
    let collectionId: string | null = null;
    if (work.keep) {
      const collection = await collections.create({
        kind: "extract",
        title: `${work.name}: source file`,
        description: `All of OpenStreetMap for ${work.name}, from Geofabrik, kept to read roads and places from again with no download.`,
        category: "Maps",
        publisher: "Geofabrik GmbH",
        license: "ODbL 1.0",
        attribution: "© OpenStreetMap contributors; extract by Geofabrik GmbH",
        version: made.dataDate,
        locationId: download.locationId,
        relPath: download.relPath,
        sizeBytes,
        sha256,
        meta: {
          countryFile: {
            regionId: work.regionId,
            name: work.name,
            country: work.country,
            dataDate: made.dataDate,
            fileName: work.fileName,
            sourceUrl: work.sourceUrl,
            md5: work.md5,
          } satisfies CountryFileMeta,
          removalWarning:
            "Roads for routes and places to find made from it keep working. Rebuilding or updating them downloads the source file again.",
        },
      });
      collectionId = collection.id;
    } else {
      // The person chose not to keep it: it goes once read.
      await fs.promises.rm(filePath, { force: true });
    }
    record({ work, dataDate: made.dataDate, bytes: sizeBytes, collectionId, roadNetworkId: made.roadNetworkId, packId: made.packId });
    // Once the download is in place as a kept file: the walking and cycling asked for with it.
    if (work.keep && work.streets) setTimeout(() => startStreets(work), 0);
    return {
      ...(collectionId ? { collectionId } : {}),
      meta: { roadNetworkId: made.roadNetworkId, packId: made.packId, dataDate: made.dataDate, kept: work.keep },
    };
  };

  ctx.jobs.register<ReadPayload>(COUNTRY_FILE_READ_JOB, {
    queue: "import",
    async run({ payload, signal, progress, job }) {
      const row = collections.get(payload.collectionId);
      if (!row) throw new PermanentJobError("The kept source file has been removed, so there is nothing to read. Add it again.");
      if (!storage.isAvailable(row.locationId)) {
        const name = storage.list().find((candidate) => candidate.id === row.locationId)?.name ?? "Its storage location";
        throw new PermanentJobError(`“${name}”, where the source file is kept, is not connected. Connect it and try again.`);
      }
      const filePath = storage.resolve(row.locationId, row.relPath);
      if (!fs.existsSync(filePath))
        throw new PermanentJobError("The kept source file is missing from its storage location. Download it again.");
      const made = await readAll({
        work: payload,
        filePath,
        locationId: row.locationId,
        relPath: row.relPath,
        bytes: row.sizeBytes,
        collectionId: row.id,
        id: job.id,
        signal,
        progress: (current, total, message, unit) =>
          progress({ current, total, message, stage: message.split(":")[0], ...(unit === undefined ? {} : { unit }) }),
      });
      record({
        work: payload,
        dataDate: made.dataDate,
        bytes: row.sizeBytes,
        collectionId: row.id,
        roadNetworkId: made.roadNetworkId,
        packId: made.packId,
      });
      startStreets(payload);
      return { roadNetworkId: made.roadNetworkId, packId: made.packId, dataDate: made.dataDate };
    },
  });

  /**
   * Walking and cycling asked for in Add a place, built from the file now kept. While another build is
   * under way it waits for it, and Offline maps says so; one that cannot start at all is said in the log,
   * and its row on Offline maps still offers it.
   */
  function startStreets(work: CountryFileWork) {
    if (!work.streets) return;
    try {
      ctx.services.streets?.tiles.buildOrWait({
        regions: [work.regionId],
        ...(work.streets.workLocationId ? { workLocationId: work.streets.workLocationId } : {}),
      });
    } catch (error) {
      ctx.log.warn({ err: error, region: work.regionId }, "walking and cycling could not start after the source file was kept");
    }
  }

  function readTasks() {
    return ctx.jobs.list({ states: ["queued", "running", "paused", "failed"], types: [COUNTRY_FILE_READ_JOB] });
  }

  function pending(): PendingCountryFile[] {
    const files = downloads.unfinished().filter(isCountryFileDownload);
    const reads = ctx.db.select().from(countryFilesTable).all();
    // A failed download is shown until a newer download or read of the same region starts or succeeds.
    const superseded = (row: DownloadRow) =>
      row.state === "failed" &&
      (files.some((other) => other.id !== row.id && other.createdAt > row.createdAt && workOf(other).regionId === workOf(row).regionId) ||
        reads.some((read) => read.regionId === workOf(row).regionId && read.readAt > row.createdAt));
    const fromDownloads = files
      .filter((row) => !superseded(row))
      .map((row) => {
        const work = workOf(row);
        return {
          regionId: work.regionId,
          name: work.name,
          country: work.country,
          roads: work.roads,
          layers: work.reference?.layers ?? [],
          keep: work.keep,
          state: row.state,
          message: downloads.toDto(row).message,
          error: row.error,
          downloadId: row.id,
          taskId: null,
          step: steps.get(row.id) ?? null,
        };
      });
    // A failed read is shown until a newer one for the same file starts or succeeds.
    const tasks = readTasks();
    const fromTasks = tasks
      .filter(
        (job) =>
          job.state !== "failed" ||
          !tasks.some(
            (other) =>
              other !== job &&
              other.createdAt > job.createdAt &&
              (other.payload as ReadPayload).regionId === (job.payload as ReadPayload).regionId,
          ),
      )
      .filter((job) => job.state !== "failed" || Date.now() - (job.finishedAt ?? job.updatedAt) < 7 * 86_400_000)
      .map((job) => {
        const work = job.payload as ReadPayload;
        return {
          regionId: work.regionId,
          name: work.name,
          country: work.country,
          roads: work.roads,
          layers: work.reference?.layers ?? [],
          keep: true,
          state: job.state,
          message: job.progressMessage,
          error: job.error,
          downloadId: null,
          taskId: job.id,
          step: steps.get(job.id) ?? null,
        };
      });
    return [...fromDownloads, ...fromTasks];
  }

  async function add(input: AddCountryFile) {
    const roads = input.roads;
    const layers = input.layers;
    const readsSomething = roads || layers.length > 0;
    if (!readsSomething && !input.keep)
      throw badRequest("Nothing would be read from the source file and it would not be kept: choose routes, nearby places or to keep it.");

    if (input.streets && !input.keep) throw badRequest("Walking and cycling are built from the source file: keep it to build them.");
    if (input.streets && !ctx.services.streets?.connection.installed())
      throw badRequest("Walking and cycling come with an optional add-on that is not part of this installation.");

    let region = input.region;
    let parents: string[] = [];
    if (!region || !input.reference) {
      // Read afresh each press: the list is read (and kept) from another screen, after this service started.
      const regions = createRegionIndex(ctx, client);
      if (!regions.kept()) throw badRequest("Read Geofabrik's list of regions first (Places to find: “Read the list of regions”).");
      const found = regions.find(input.regionId);
      if (!found) throw badRequest(`“${input.regionId}” is not in Geofabrik's list as read on this device. Read the list again.`);
      region ??= found;
      for (let at = found.parent ? regions.find(found.parent) : undefined; at; at = at.parent ? regions.find(at.parent) : undefined)
        parents.push(at.name);
      parents = parents.filter((name) => name !== found.name);
    }
    if (input.remember) settings.update({ "maps.countryFileKeep": input.keep ? "keep" : "delete" });

    const busy = pending().find((entry) => entry.regionId === region.id && entry.state !== "failed");
    if (busy)
      throw conflict(
        busy.downloadId
          ? `${region.name}'s source file is already being downloaded. What it is read for is set when it starts: add the rest once it is done.`
          : `${region.name}'s source file is already being read. Try again once it is done.`,
      );

    const referenceOf = (sourceUrl: string) =>
      layers.length === 0
        ? null
        : (input.reference ?? referenceFor({ ...(region as GeofabrikRegion), depth: 0, parent: null }, parents, layers, sourceUrl));

    // A kept file for the region, as new as asked: read again, nothing downloaded.
    const here = kept(region.id, input.newerThan);
    const streets = input.streets ? { workLocationId: input.streets.workLocationId ?? null } : null;
    if (here) {
      if (!readsSomething) {
        // Kept already, and only walking and cycling asked for: built from it now.
        // While another build is under way it waits for it, and says so (Offline maps, and the answer here).
        const built = streets
          ? ctx.services.streets?.tiles.buildOrWait({
              regions: [region.id],
              ...(streets.workLocationId ? { workLocationId: streets.workLocationId } : {}),
            })
          : undefined;
        return {
          downloadId: null,
          taskId: built?.jobId ?? null,
          countryFile: { source: "kept" as const, collectionId: here.collectionId, dataDate: here.dataDate, fileName: here.fileName },
        };
      }
      const payload: ReadPayload = {
        collectionId: here.collectionId,
        regionId: region.id,
        name: region.name,
        country: region.country,
        sourceUrl: here.sourceUrl,
        md5: here.md5,
        fileName: here.fileName,
        keep: true,
        roads,
        reference: referenceOf(here.sourceUrl),
        streets,
      };
      const job = ctx.jobs.enqueue(COUNTRY_FILE_READ_JOB, payload, {
        title: `${region.name}: ${sourceFileWork({ roads, layers: layers.length })}`,
        // While it is read, the file cannot be moved or removed.
        subject: `collection:${here.collectionId}`,
        maxAttempts: 1,
      });
      ctx.events.publish({ type: "maps.changed" });
      return {
        downloadId: null,
        taskId: job.id,
        countryFile: { source: "kept" as const, collectionId: here.collectionId, dataDate: here.dataDate, fileName: here.fileName },
      };
    }

    let file: GeofabrikFile;
    if (input.file) {
      file = { ...input.file, fileName: input.file.fileName || fileNameOf(input.file.url), nameDate: dateOfName(input.file.fileName) };
    } else {
      try {
        file = await resolveGeofabrikFile(client, region.pbf, region.name);
      } catch (error) {
        if (error instanceof AppError && error.code === "forbidden")
          throw badRequest(
            `Geofabrik sends ${region.name}'s file from another server (a mirror), which Outpost does not download from. Choose its parts instead: each is its own, smaller file, and neighbouring parts join.`,
          );
        throw error;
      }
    }
    const work: CountryFileWork = {
      regionId: region.id,
      name: region.name,
      country: region.country,
      sourceUrl: file.url,
      md5: file.md5,
      fileName: file.fileName,
      keep: input.keep,
      roads,
      reference: referenceOf(file.url),
      streets: input.keep ? streets : null,
    };
    const row = await downloads.start({
      kind: "extract",
      title: `${region.name}: ${input.keep && !readsSomething ? "source file" : sourceFileWork({ roads, layers: layers.length })}`,
      url: file.url,
      relPath: `${COUNTRY_FILE_FOLDER}/${region.id.replace(/[^a-z0-9-]/gi, "-")}-${stamp()}.osm.pbf`,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(file.bytes ? { sizeBytes: file.bytes } : {}),
      md5: file.md5,
      allowedHosts: [new URL(file.url).hostname],
      meta: { countryFile: work },
      note: file.fallback ?? `The file is ${file.fileName}, checked against Geofabrik's MD5 for it.`,
    });
    ctx.events.publish({ type: "maps.changed" });
    return {
      downloadId: row.id,
      taskId: null,
      countryFile: {
        source: "download" as const,
        downloadId: row.id,
        fileName: file.fileName,
        dataDate: file.nameDate,
        fallback: file.fallback,
      },
    };
  }

  return {
    add,
    kept: (regionId) => kept(regionId),
    keptFiles,
    pending,
    history: () => ctx.db.select().from(countryFilesTable).orderBy(desc(countryFilesTable.readAt)).all(),
    installer,
  };
}
