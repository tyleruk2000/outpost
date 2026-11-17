/**
 * Storage locations: the folders, drives and network shares that hold content.
 *
 * A location is identified by a small marker file written at its root, not by its
 * path. If a USB drive comes back mounted somewhere else, or a share is remounted
 * under a new name, Outpost finds the marker inside one of the configured roots and
 * carries on with the same library. Nothing is ever moved or deleted here; this module
 * only observes.
 */
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, notFound } from "../../core/errors.ts";
import { isInside, resolveInside } from "../../core/fs-safe.ts";
import { newId } from "../../core/ids.ts";
import { collections, documents, storageLocations } from "../../db/schema.ts";

export type LocationRow = typeof storageLocations.$inferSelect;
export type LocationKind = LocationRow["kind"];

const MARKER = ".outpost-location.json";
/** How deep below a root to look for a location that has moved. */
const RECONNECT_SEARCH_DEPTH = 3;
/** The most folders one search for a moved location will look at, across all roots. */
const RECONNECT_SEARCH_FOLDERS = 3000;

interface Marker {
  id: string;
  name: string;
  createdAt: number;
}

/** The path with every symbolic link in the part of it that exists followed. */
function realPathOf(target: string): string {
  let existing = path.resolve(target);
  const tail: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    tail.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    return path.join(fs.realpathSync(existing), ...tail);
  } catch {
    return path.resolve(target);
  }
}

/**
 * Whether `target` is inside one of the storage roots, both as written and once symbolic
 * links are followed. A link inside a root can lead anywhere: macOS keeps one in the
 * default root itself (`/Volumes/Macintosh HD` is a link to `/`), so a path through it
 * is "inside /Volumes" as written and is really the whole computer.
 */
export function isInsideRoots(roots: readonly string[], target: string): boolean {
  const resolved = path.resolve(target);
  if (!roots.some((root) => isInside(root, resolved))) return false;
  const real = realPathOf(resolved);
  return roots.some((root) => isInside(realPathOf(root), real));
}

export interface BrowseEntry {
  name: string;
  path: string;
  /** Already an Outpost storage location (has a marker file). */
  locationId?: string;
}

export interface BrowseResult {
  /** Absolute path being listed, or null for the list of roots. */
  path: string | null;
  parent: string | null;
  entries: BrowseEntry[];
  writable: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
}

export interface UsageBreakdown {
  locationId: string;
  byKind: Record<string, { bytes: number; count: number }>;
  totalBytes: number;
}

export interface StorageService {
  list(): LocationRow[];
  get(id: string): LocationRow;
  getDefault(): LocationRow;
  add(input: { name: string; path: string; kind: LocationKind; makeDefault?: boolean }): Promise<LocationRow>;
  update(id: string, patch: { name?: string; kind?: LocationKind; isDefault?: boolean }): LocationRow;
  remove(id: string): void;
  /**
   * Re-checks every location: availability, capacity, and whether it has moved. With
   * `search: false` a location that is away is looked for only where it was, not under
   * every root (the regular check does that at most every few minutes).
   */
  refresh(options?: { search?: boolean }): Promise<LocationRow[]>;
  browse(target?: string): Promise<BrowseResult>;
  /** Absolute path for a file in a location. Throws if the location is not connected. */
  resolve(locationId: string, relPath: string): string;
  isAvailable(locationId: string): boolean;
  /** Throws `insufficient_space` unless the location has room for `bytes` plus a reserve. */
  assertSpace(locationId: string, bytes: number): Promise<void>;
  usage(): UsageBreakdown[];
}

declare module "../../core/context.ts" {
  interface Services {
    storage: StorageService;
  }
}

/** Space always left free on a location, so a full disk never corrupts a transfer. */
export const SPACE_RESERVE_BYTES = 256 * 1024 * 1024;

/**
 * Free space moves all the time on a disk in use. A move smaller than this is not
 * recorded or announced by a check. Not a share of the disk: on a large one that would
 * leave the figure a download's choice of location reads gigabytes out.
 */
const FREE_SPACE_STEP_BYTES = 256 * 1024 * 1024;

function freeSpaceMoved(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return before !== after;
  return Math.abs(after - before) >= FREE_SPACE_STEP_BYTES;
}

async function capacity(dir: string): Promise<{ totalBytes: number; freeBytes: number } | undefined> {
  try {
    const stats = await fs.promises.statfs(dir);
    return { totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize };
  } catch {
    return undefined;
  }
}

async function readMarker(dir: string): Promise<Marker | undefined> {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(path.join(dir, MARKER), "utf8")) as Marker;
    return typeof parsed.id === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Something that is the same for one marker file however it is reached, and different
 * for a copy of it. A network share connected twice (once from the Finder, once by
 * Outpost, under two names for the same server) shows one folder at two paths: the
 * file has the same number on the server, the same size and the same times through
 * both. A copied folder gets a new file number and a new creation time.
 */
async function markerIdentity(dir: string): Promise<string> {
  try {
    const stat = await fs.promises.stat(path.join(dir, MARKER), { bigint: true });
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.birthtimeNs}`;
  } catch {
    return dir;
  }
}

async function isWritable(dir: string): Promise<boolean> {
  try {
    await fs.promises.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Collects the folders under `root` that carry the marker of location `id`, looking no
 * deeper than `depth` and stopping once `limit` have been found. A folder that carries
 * the marker is not looked inside: a location never contains another one. `budget` caps
 * the folders looked at, so a root that holds a large network share cannot turn every
 * check into a long crawl of it.
 */
async function findMarkers(
  root: string,
  id: string,
  depth: number,
  found: Set<string>,
  limit: number,
  budget: { folders: number },
): Promise<void> {
  if (found.size >= limit || budget.folders <= 0) return;
  budget.folders -= 1;
  const marker = await readMarker(root);
  if (marker?.id === id) {
    found.add(root);
    return;
  }
  if (depth === 0) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    await findMarkers(path.join(root, entry.name), id, depth - 1, found, limit, budget);
    if (found.size >= limit || budget.folders <= 0) return;
  }
}

export function createStorageService(ctx: AppContext): StorageService {
  const { db, config } = ctx;
  const roots = config.storageRoots;

  function insideRoots(target: string): boolean {
    return isInsideRoots(roots, target);
  }

  function get(id: string): LocationRow {
    const row = db.select().from(storageLocations).where(eq(storageLocations.id, id)).get();
    if (!row) throw notFound("Storage location");
    return row;
  }

  function list(): LocationRow[] {
    return db.select().from(storageLocations).orderBy(storageLocations.createdAt).all();
  }

  function setDefault(id: string): void {
    db.update(storageLocations).set({ isDefault: false }).run();
    db.update(storageLocations).set({ isDefault: true, updatedAt: Date.now() }).where(eq(storageLocations.id, id)).run();
  }

  /** When each location was last found where it should be, between writes of it. */
  const seenAt = new Map<string, number>();

  async function check(row: LocationRow, search: boolean): Promise<boolean> {
    let currentPath = row.path;
    // The storage roots are the boundary set by whoever started the server, and they can
    // change between starts. A folder outside them is not used, even if it is still
    // there with the right marker in it.
    const allowed = insideRoots(row.path);
    let marker = allowed ? await readMarker(currentPath) : undefined;
    let detail: string | null = null;

    if (marker?.id !== row.id && !search && row.status === "unavailable") {
      // Already away, and the roots were searched for it lately: only where it was is looked at.
      marker = undefined;
      detail = row.statusDetail;
    } else if (marker?.id !== row.id) {
      // Not where it was, or no longer somewhere Outpost may use. Look for the marker
      // under each root before giving up.
      marker = undefined;
      const found = new Set<string>();
      const budget = { folders: RECONNECT_SEARCH_FOLDERS };
      for (const root of roots) await findMarkers(root, row.id, RECONNECT_SEARCH_DEPTH, found, 6, budget);
      // One folder seen through several mounts of the same share is one folder, not a choice.
      const distinct = new Map<string, string>();
      for (const folder of found) {
        const identity = await markerIdentity(folder);
        if (!distinct.has(identity)) distinct.set(identity, folder);
      }
      const [first, second] = [...distinct.values()];
      if (first && second) {
        // Never chosen silently: the two may have drifted apart since one was copied.
        detail = `Two folders carry this location's marker: ${first} and ${second}. Outpost will not choose between them. Remove the copy you do not want, or the file ${MARKER} inside it, then choose Check drives.`;
      } else if (first) {
        currentPath = first;
        marker = { id: row.id, name: row.name, createdAt: row.createdAt };
        ctx.log.info({ location: row.id, from: row.path, to: first }, "storage location found at a new path");
      } else if (!allowed) {
        detail =
          "This folder is outside the folders Outpost is allowed to use. Those are the storage roots, set with OUTPOST_STORAGE_ROOTS when the server starts. Add the folder to that setting, or copy it (with its marker file) to a place inside the roots, then start Outpost again.";
      } else {
        detail = (await fs.promises.stat(row.path).catch(() => undefined))
          ? "The folder is there but is not this Outpost location. The drive mounted at this path may be a different one."
          : "The folder is not reachable. The drive may be unplugged or the share not mounted.";
      }
    }

    const space = marker ? await capacity(currentPath) : undefined;
    const patch = {
      path: currentPath,
      status: marker ? ("available" as const) : ("unavailable" as const),
      statusDetail: detail,
      totalBytes: space?.totalBytes ?? row.totalBytes,
      freeBytes: marker ? (space?.freeBytes ?? null) : row.freeBytes,
      lastSeenAt: marker ? Date.now() : Math.max(row.lastSeenAt ?? 0, seenAt.get(row.id) ?? 0) || row.lastSeenAt,
    };
    // What a person would call a change: a location going away or coming back, moving, or
    // a different disk. Only that is announced (as `storage.changed`, which every open
    // screen acts on). Free space is recorded when it has moved noticeably, for the next
    // screen that reads the list, but never announced.
    const changed =
      patch.status !== row.status ||
      patch.path !== row.path ||
      patch.statusDetail !== row.statusDetail ||
      patch.totalBytes !== row.totalBytes;
    const spaceMoved = freeSpaceMoved(row.freeBytes, patch.freeBytes);
    // When it was last seen is held here and written when it goes away (or hourly, for a restart).
    if (marker) seenAt.set(row.id, patch.lastSeenAt ?? Date.now());
    const stale = marker !== undefined && Date.now() - (row.lastSeenAt ?? 0) >= 3_600_000;
    if (changed || spaceMoved || stale) db.update(storageLocations).set(patch).where(eq(storageLocations.id, row.id)).run();
    return changed;
  }

  const service: StorageService = {
    list,
    get,

    getDefault() {
      const row = db.select().from(storageLocations).where(eq(storageLocations.isDefault, true)).get() ?? list()[0];
      if (!row) throw new AppError("storage_unavailable", "No storage location has been set up yet.");
      return row;
    },

    async add(input) {
      const target = path.resolve(input.path);
      if (!insideRoots(target)) {
        throw new AppError(
          "forbidden",
          "That folder is outside the storage roots this server allows. Ask whoever runs the server to mount it under one of them.",
        );
      }
      await fs.promises.mkdir(target, { recursive: true }).catch((error: NodeJS.ErrnoException) => {
        throw new AppError("storage_unavailable", `That folder could not be created: ${error.message}`);
      });
      if (!(await isWritable(target))) {
        throw new AppError("storage_unavailable", "Outpost cannot write to that folder. Check its permissions.");
      }

      const existing = await readMarker(target);
      const now = Date.now();
      let id = newId();
      if (existing) {
        if (db.select().from(storageLocations).where(eq(storageLocations.id, existing.id)).get()) {
          throw conflict("That folder is already one of your storage locations.");
        }
        // A location created by another Outpost (or before a database restore): adopt its
        // identity so collections that reference it line up again.
        id = existing.id;
      } else {
        const overlapping = list().find((row) => isInside(row.path, target) || isInside(target, row.path));
        if (overlapping) {
          throw conflict(`That folder overlaps "${overlapping.name}". Choose a separate folder.`);
        }
        const marker: Marker = { id, name: input.name, createdAt: now };
        await fs.promises.writeFile(path.join(target, MARKER), `${JSON.stringify(marker, null, 2)}\n`);
      }

      const space = await capacity(target);
      const first = list().length === 0;
      db.insert(storageLocations)
        .values({
          id,
          name: input.name,
          path: target,
          kind: input.kind,
          isDefault: false,
          status: "available",
          totalBytes: space?.totalBytes,
          freeBytes: space?.freeBytes,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (input.makeDefault || first) setDefault(id);
      ctx.events.publish({ type: "storage.changed" });
      return get(id);
    },

    update(id, patch) {
      get(id);
      const set: Partial<LocationRow> = { updatedAt: Date.now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.kind !== undefined) set.kind = patch.kind;
      db.update(storageLocations).set(set).where(eq(storageLocations.id, id)).run();
      if (patch.isDefault) setDefault(id);
      ctx.events.publish({ type: "storage.changed" });
      return get(id);
    },

    remove(id) {
      const row = get(id);
      const inUse =
        (db.select({ n: sql<number>`count(*)` }).from(collections).where(eq(collections.locationId, id)).get()?.n ?? 0) +
        (db.select({ n: sql<number>`count(*)` }).from(documents).where(eq(documents.locationId, id)).get()?.n ?? 0);
      if (inUse > 0) {
        throw conflict(
          `"${row.name}" still holds ${inUse} item${inUse === 1 ? "" : "s"}. Move or remove them first. Outpost will not delete them for you.`,
        );
      }
      if (list().length === 1) throw conflict("Keep at least one storage location.");
      db.delete(storageLocations).where(eq(storageLocations.id, id)).run();
      if (row.isDefault) {
        const next = list()[0];
        if (next) setDefault(next.id);
      }
      // The folder and its marker stay on disk; only Outpost's record of it goes.
      ctx.events.publish({ type: "storage.changed" });
    },

    async refresh(options) {
      let changed = false;
      for (const row of list()) changed = (await check(row, options?.search ?? true)) || changed;
      if (changed) ctx.events.publish({ type: "storage.changed" });
      return list();
    },

    async browse(target) {
      if (!target) {
        const entries: BrowseEntry[] = [];
        for (const root of roots) {
          if (await fs.promises.stat(root).catch(() => undefined)) {
            entries.push({ name: root, path: root, locationId: (await readMarker(root))?.id });
          }
        }
        return { path: null, parent: null, entries, writable: false, totalBytes: null, freeBytes: null };
      }
      const dir = path.resolve(target);
      if (!insideRoots(dir)) throw new AppError("forbidden", "That folder is outside the allowed storage roots.");
      let dirents: fs.Dirent[];
      try {
        dirents = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (error) {
        throw new AppError("storage_unavailable", `That folder cannot be read: ${(error as Error).message}`);
      }
      const entries: BrowseEntry[] = [];
      for (const dirent of dirents) {
        if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
        const full = path.join(dir, dirent.name);
        entries.push({ name: dirent.name, path: full, locationId: (await readMarker(full))?.id });
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      const space = await capacity(dir);
      const isRoot = roots.includes(dir);
      return {
        path: dir,
        parent: isRoot ? null : path.dirname(dir),
        entries,
        writable: await isWritable(dir),
        totalBytes: space?.totalBytes ?? null,
        freeBytes: space?.freeBytes ?? null,
      };
    },

    resolve(locationId, relPath) {
      const row = get(locationId);
      if (row.status !== "available") {
        throw new AppError("storage_unavailable", `"${row.name}" is not connected. Reconnect it and try again.`, {
          locationId,
        });
      }
      return resolveInside(row.path, relPath);
    },

    isAvailable(locationId) {
      return db.select().from(storageLocations).where(eq(storageLocations.id, locationId)).get()?.status === "available";
    },

    async assertSpace(locationId, bytes) {
      const row = get(locationId);
      if (row.status !== "available") {
        throw new AppError("storage_unavailable", `"${row.name}" is not connected.`, { locationId });
      }
      const space = await capacity(row.path);
      if (!space) return;
      const needed = bytes + SPACE_RESERVE_BYTES;
      if (space.freeBytes < needed) {
        throw new AppError("insufficient_space", `"${row.name}" does not have enough free space for this.`, {
          locationId,
          requiredBytes: bytes,
          freeBytes: space.freeBytes,
          reserveBytes: SPACE_RESERVE_BYTES,
        });
      }
    },

    usage() {
      const byLocation = new Map<string, UsageBreakdown>();
      const add = (locationId: string, kind: string, bytes: number, count: number) => {
        const entry = byLocation.get(locationId) ?? { locationId, byKind: {}, totalBytes: 0 };
        const bucket = entry.byKind[kind] ?? { bytes: 0, count: 0 };
        bucket.bytes += bytes;
        bucket.count += count;
        entry.byKind[kind] = bucket;
        entry.totalBytes += bytes;
        byLocation.set(locationId, entry);
      };
      for (const row of db
        .select({
          locationId: collections.locationId,
          kind: collections.kind,
          bytes: sql<number>`coalesce(sum(${collections.sizeBytes}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(collections)
        .groupBy(collections.locationId, collections.kind)
        .all()) {
        add(row.locationId, row.kind, row.bytes, row.count);
      }
      for (const row of db
        .select({
          locationId: documents.locationId,
          bytes: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(documents)
        .groupBy(documents.locationId)
        .all()) {
        add(row.locationId, "document", row.bytes, row.count);
      }
      return [...byLocation.values()];
    },
  };

  return service;
}

/** Folder inside the first root used for the location created on first start. */
export function defaultLocationPath(ctx: AppContext): string {
  const first = ctx.config.storageRoots[0]!;
  // When the first root is the data directory's own library folder, use it directly.
  return isInside(ctx.config.dataDir, first) ? first : path.join(first, "internal");
}
