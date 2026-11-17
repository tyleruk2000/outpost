/**
 * Measuring what is on disk.
 *
 * Outpost's records say how large each installed thing was when it arrived. They do not
 * know about part files, files nobody recorded, caches, or what the data directory has
 * grown to. Those are found by walking the folders, which on a network share with
 * thousands of documents takes a while. So the walk runs in the background, one at a
 * time, yielding as it goes, and everything that reads its result is told when it was
 * taken and whether a newer one is under way.
 *
 * The walk only ever looks: inside the data directory, and inside the two folders
 * Outpost itself makes in each storage location. It never follows a symbolic link.
 */

import fs from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { isInside } from "../../core/fs-safe.ts";
import { documents as documentsTable, downloads as downloadsTable, jobs as jobsTable } from "../../db/schema.ts";
import { OUTPOST_FOLDERS } from "./inventory.ts";

/** A file is only called a leftover once it has sat untouched for this long. */
export const SETTLE_MS = 10 * 60 * 1000;
/** Parts of uploads older than this belong to uploads that never finished. */
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;
/** How many leftover files are remembered one by one; the rest are only counted. */
const KEEP_FILES = 2000;
/**
 * Counting walks every folder. A screen asking is not a reason to count again: something
 * changing in Outpost is (see `touch`), and so is this long passing, for files changed by
 * hand. "Count again" counts at once.
 */
const FRESH_MS = 60 * 60 * 1000;
const RESCAN_GAP_MS = 20_000;
const INCOMING = "documents/.incoming";

export interface FoundFile {
  locationId: string;
  relPath: string;
  bytes: number;
  modifiedAt: number;
}

export interface LocationSurvey {
  /** Everything in the folders Outpost made here. */
  measuredBytes: number;
  untracked: FoundFile[];
  untrackedTotal: { count: number; bytes: number };
  uploads: FoundFile[];
  /** Bytes of partial files, by the download they belong to. */
  partial: Map<string, number>;
}

export interface Survey {
  measuredAt: number;
  /** Top-level folders and files of the data directory, by what they are. */
  data: {
    attachments: number;
    extracted: number;
    runtimes: number;
    models: number;
    /** Files sent on the household board. */
    board: number;
    previous: Array<{ name: string; bytes: number }>;
    snapshots: Array<{ name: string; bytes: number }>;
    other: number;
    total: number;
  };
  /** Extracted text kept for documents that are no longer in the library. */
  orphanText: { files: string[]; bytes: number };
  locations: Map<string, LocationSurvey>;
  /** Documents on a connected location whose file is not there. */
  missingDocuments: Set<string>;
  /** Bytes of passage text held for search, counted from the database. */
  passageBytes: number;
}

export interface Surveyor {
  latest(): Survey | undefined;
  measuring(): boolean;
  /** Starts a count unless one is running or the last is recent enough. */
  ensure(options?: { force?: boolean }): void;
  /** Resolves when no count is running. For tests and for jobs that need current figures. */
  settled(): Promise<void>;
  /** Says the figures may be out of date; the next reader starts a new count. */
  touch(): void;
  /** Corrects the last count in place after something it listed was cleared, until the next count. */
  amend(change: (survey: Survey) => void): void;
  /** Whether a path is one no record or work in progress lays claim to, as of now. */
  claims(): Claims;
}

export interface Claims {
  /** True when a record, a download or a move accounts for this file. */
  has(locationId: string, relPath: string): boolean;
  /** The download a partial file belongs to, if any. */
  downloadOf(locationId: string, relPath: string): string | undefined;
}

/** Total size of everything under `target`, not following links. */
async function measure(target: string, signal: AbortSignal): Promise<number> {
  let total = 0;
  let seen = 0;
  const pending = [target];
  while (pending.length > 0) {
    signal.throwIfAborted();
    const current = pending.pop()!;
    const stat = await fs.promises.lstat(current).catch(() => undefined);
    if (!stat) continue;
    if (stat.isDirectory()) {
      for (const name of await fs.promises.readdir(current).catch(() => [] as string[])) pending.push(path.join(current, name));
    } else if (stat.isFile()) {
      total += stat.size;
    }
    seen += 1;
    if (seen % 200 === 0) await yieldToEventLoop();
  }
  return total;
}

export function createSurveyor(ctx: AppContext): Surveyor {
  const { db, sqlite, config } = ctx;
  const { storage } = ctx.services;
  let latest: Survey | undefined;
  let running: Promise<void> | undefined;
  let startedAt = 0;
  let dirty = false;
  let again = false;
  const controller = new AbortController();
  ctx.onClose.push(() => controller.abort());

  function claims(): Claims {
    const tracked = new Map<string, Set<string>>();
    const folders = new Map<string, string[]>();
    const partial = new Map<string, Array<{ prefix: string; downloadId: string }>>();
    const add = (locationId: string, relPath: string) => {
      const set = tracked.get(locationId) ?? new Set<string>();
      set.add(relPath);
      tracked.set(locationId, set);
    };
    for (const row of ctx.services.collections.list()) {
      add(row.locationId, row.relPath);
      // A collection may be a folder; everything beneath it is its own.
      folders.set(row.locationId, [...(folders.get(row.locationId) ?? []), `${row.relPath}/`]);
    }
    for (const row of db.select({ locationId: documentsTable.locationId, relPath: documentsTable.relPath }).from(documentsTable).all()) {
      add(row.locationId, row.relPath);
    }
    for (const row of db.select().from(downloadsTable).all()) {
      if (row.state === "completed") continue;
      // The file itself between arriving and being installed, and the partial file with
      // whatever a fetcher keeps beside it (a map extract's plan and progress).
      add(row.locationId, row.relPath);
      partial.set(row.locationId, [...(partial.get(row.locationId) ?? []), { prefix: `${row.relPath}.part`, downloadId: row.id }]);
    }
    const activeJobs = db
      .select({ type: jobsTable.type })
      .from(jobsTable)
      .where(inArray(jobsTable.state, ["queued", "running", "paused"]))
      .all();
    // A move writes "<name>.part" on the target before switching over.
    const moving = activeJobs.some((job) => job.type === "collection.move" || job.type === "documents.move");

    const downloadOf = (locationId: string, relPath: string) =>
      partial.get(locationId)?.find((entry) => relPath === entry.prefix || relPath.startsWith(`${entry.prefix}.`))?.downloadId;

    return {
      downloadOf,
      has(locationId, relPath) {
        if (tracked.get(locationId)?.has(relPath)) return true;
        if (folders.get(locationId)?.some((prefix) => relPath.startsWith(prefix))) return true;
        if (downloadOf(locationId, relPath)) return true;
        if (moving && relPath.endsWith(".part")) return true;
        return false;
      },
    };
  }

  async function surveyLocation(
    location: { id: string; path: string },
    claimed: Claims,
    documentPaths: Map<string, string>,
    seenDocuments: Set<string>,
    signal: AbortSignal,
  ): Promise<LocationSurvey> {
    const result: LocationSurvey = {
      measuredBytes: 0,
      untracked: [],
      untrackedTotal: { count: 0, bytes: 0 },
      uploads: [],
      partial: new Map(),
    };
    const now = Date.now();
    let seen = 0;
    const pending: string[] = OUTPOST_FOLDERS.map((folder) => folder);
    while (pending.length > 0) {
      signal.throwIfAborted();
      const relPath = pending.pop()!;
      const absolute = path.join(location.path, relPath);
      const stat = await fs.promises.lstat(absolute).catch(() => undefined);
      seen += 1;
      if (seen % 200 === 0) await yieldToEventLoop();
      if (!stat) continue;
      if (stat.isDirectory()) {
        for (const name of await fs.promises.readdir(absolute).catch(() => [] as string[])) pending.push(`${relPath}/${name}`);
        continue;
      }
      // Links and special files are not Outpost's and are not followed, measured or offered.
      if (!stat.isFile()) continue;
      result.measuredBytes += stat.size;
      const documentId = documentPaths.get(`${location.id}\n${relPath}`);
      if (documentId) seenDocuments.add(documentId);

      const file: FoundFile = { locationId: location.id, relPath, bytes: stat.size, modifiedAt: stat.mtimeMs };
      const downloadId = claimed.downloadOf(location.id, relPath);
      if (downloadId) {
        result.partial.set(downloadId, (result.partial.get(downloadId) ?? 0) + stat.size);
      } else if (relPath.startsWith(`${INCOMING}/`)) {
        if (now - stat.mtimeMs > STALE_UPLOAD_MS) result.uploads.push(file);
      } else if (!claimed.has(location.id, relPath) && now - stat.mtimeMs > SETTLE_MS) {
        result.untrackedTotal.count += 1;
        result.untrackedTotal.bytes += stat.size;
        if (result.untracked.length < KEEP_FILES) result.untracked.push(file);
      }
    }
    result.untracked.sort((a, b) => b.bytes - a.bytes);
    return result;
  }

  async function surveyData(signal: AbortSignal): Promise<Pick<Survey, "data" | "orphanText">> {
    const data: Survey["data"] = {
      attachments: 0,
      extracted: 0,
      runtimes: 0,
      models: 0,
      board: 0,
      previous: [],
      snapshots: [],
      other: 0,
      total: 0,
    };
    // Storage that lives inside the data directory (the default "library" folder) is
    // content, counted with its location, not part of Outpost's own data.
    const content = [...config.storageRoots, ...storage.list().map((location) => location.path)];
    const now = Date.now();
    for (const name of await fs.promises.readdir(config.dataDir).catch(() => [] as string[])) {
      const full = path.join(config.dataDir, name);
      if (content.some((folder) => isInside(full, folder) || isInside(folder, full))) continue;
      // The database is measured where it is asked for: it changes too fast for a cache.
      if (/^outpost\.db(-wal|-shm)?$/.test(name)) continue;
      const bytes = await measure(full, signal);
      data.total += bytes;
      if (name === "attachments") data.attachments = bytes;
      else if (name === "extracted") data.extracted = bytes;
      else if (name === "runtimes") data.runtimes = bytes;
      else if (name === "models") data.models = bytes;
      // Files sent on the household board (modules/board).
      else if (name === "board") data.board = bytes;
      else if (/^before-restore-[0-9A-Za-z-]+$/.test(name)) data.previous.push({ name, bytes });
      else if (/^backup-snapshot-\d+\.db(-journal|-wal|-shm)?$/.test(name)) {
        const stat = await fs.promises.stat(full).catch(() => undefined);
        // One being written right now belongs to a backup under way.
        if (stat && now - stat.mtimeMs > 60 * 60 * 1000) data.snapshots.push({ name, bytes });
        else data.other += bytes;
      } else data.other += bytes;
    }

    const orphanText = { files: [] as string[], bytes: 0 };
    const extractedDir = path.join(config.dataDir, "extracted");
    const names = await fs.promises.readdir(extractedDir).catch(() => [] as string[]);
    if (names.length > 0) {
      const known = new Set(
        db
          .select({ id: documentsTable.id })
          .from(documentsTable)
          .all()
          .map((row) => row.id),
      );
      let seen = 0;
      for (const name of names) {
        const id = /^([^.]+)(\.ocr)?\.json$/.exec(name)?.[1];
        if (!id || known.has(id)) continue;
        const stat = await fs.promises.lstat(path.join(extractedDir, name)).catch(() => undefined);
        if (!stat?.isFile() || now - stat.mtimeMs < SETTLE_MS) continue;
        orphanText.files.push(name);
        orphanText.bytes += stat.size;
        seen += 1;
        if (seen % 200 === 0) await yieldToEventLoop();
      }
    }
    return { data, orphanText };
  }

  /** Bytes of passage text, read a slice of the table at a time so requests keep being answered. */
  async function passageBytes(signal: AbortSignal): Promise<number> {
    const range = sqlite.prepare("SELECT min(id) AS low, max(id) AS high FROM chunks").get() as { low: number | null; high: number | null };
    if (range.low === null || range.high === null) return 0;
    const slice = sqlite.prepare(
      "SELECT coalesce(sum(length(CAST(text AS BLOB)) + length(CAST(title AS BLOB)) + length(CAST(heading AS BLOB)) + length(CAST(tags AS BLOB))), 0) AS bytes FROM chunks WHERE id BETWEEN ? AND ?",
    );
    let total = 0;
    for (let from = range.low; from <= range.high; from += 5000) {
      signal.throwIfAborted();
      total += (slice.get(from, from + 4999) as { bytes: number }).bytes;
      await yieldToEventLoop();
    }
    return total;
  }

  async function run(signal: AbortSignal): Promise<Survey> {
    const measuredAt = Date.now();
    const { data, orphanText } = await surveyData(signal);
    const claimed = claims();
    const documentRows = db
      .select({ id: documentsTable.id, locationId: documentsTable.locationId, relPath: documentsTable.relPath })
      .from(documentsTable)
      .all();
    const documentPaths = new Map(documentRows.map((row) => [`${row.locationId}\n${row.relPath}`, row.id]));
    const seenDocuments = new Set<string>();
    const locations = new Map<string, LocationSurvey>();
    const walked = new Set<string>();
    for (const location of storage.list()) {
      if (location.status !== "available") continue;
      try {
        locations.set(location.id, await surveyLocation(location, claimed, documentPaths, seenDocuments, signal));
        walked.add(location.id);
      } catch (error) {
        if (signal.aborted) throw error;
        ctx.log.warn({ err: error, location: location.id }, "could not measure a storage location");
      }
    }
    const missingDocuments = new Set<string>();
    for (const row of documentRows) {
      if (!walked.has(row.locationId) || seenDocuments.has(row.id)) continue;
      // Not met on the walk: either it has gone, or it lives outside Outpost's folders.
      if (OUTPOST_FOLDERS.some((folder) => row.relPath.startsWith(`${folder}/`))) {
        missingDocuments.add(row.id);
        continue;
      }
      const location = storage.list().find((candidate) => candidate.id === row.locationId);
      const stat = location ? await fs.promises.stat(path.join(location.path, row.relPath)).catch(() => undefined) : undefined;
      if (location && !stat?.isFile()) missingDocuments.add(row.id);
    }
    return { measuredAt, data, orphanText, locations, missingDocuments, passageBytes: await passageBytes(signal) };
  }

  function ensure(options: { force?: boolean } = {}): void {
    if (controller.signal.aborted) return;
    if (running) {
      // What is being counted may already be out of date; count once more afterwards.
      if (options.force) again = true;
      return;
    }
    const now = Date.now();
    const stale = !latest || now - latest.measuredAt > FRESH_MS || (dirty && now - startedAt > RESCAN_GAP_MS);
    if (!stale && !options.force) return;
    startedAt = now;
    dirty = false;
    running = run(controller.signal)
      .then((survey) => {
        latest = survey;
      })
      .catch((error) => {
        if (!controller.signal.aborted) ctx.log.warn({ err: error }, "measuring what is stored failed");
      })
      .finally(() => {
        running = undefined;
        if (controller.signal.aborted) return;
        ctx.events.publish({ type: "manage.changed" });
        if (again) {
          again = false;
          ensure({ force: true });
        }
      });
  }

  return {
    latest: () => latest,
    measuring: () => running !== undefined,
    ensure,
    async settled() {
      while (running) await running;
    },
    touch() {
      dirty = true;
    },
    amend(change) {
      if (latest) change(latest);
    },
    claims,
  };
}
