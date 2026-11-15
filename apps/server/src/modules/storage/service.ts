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

interface Marker {
  id: string;
  name: string;
  createdAt: number;
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
  /** Re-checks every location: availability, capacity, and whether it has moved. */
  refresh(): Promise<LocationRow[]>;
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

async function isWritable(dir: string): Promise<boolean> {
  try {
    await fs.promises.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function findMarker(root: string, id: string, depth: number): Promise<string | undefined> {
  const marker = await readMarker(root);
  if (marker?.id === id) return root;
  if (depth === 0) return undefined;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const found = await findMarker(path.join(root, entry.name), id, depth - 1);
    if (found) return found;
  }
  return undefined;
}

export function createStorageService(ctx: AppContext): StorageService {
  const { db, config } = ctx;
  const roots = config.storageRoots;

  function insideRoots(target: string): boolean {
    return roots.some((root) => isInside(root, target));
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

  async function check(row: LocationRow): Promise<boolean> {
    const before = `${row.status}|${row.path}|${row.freeBytes}|${row.totalBytes}`;
    let currentPath = row.path;
    let marker = await readMarker(currentPath);
    let detail: string | null = null;

    if (marker?.id !== row.id) {
      // Not where it was. Look for the marker under each root before giving up.
      marker = undefined;
      for (const root of roots) {
        const found = await findMarker(root, row.id, RECONNECT_SEARCH_DEPTH);
        if (found) {
          currentPath = found;
          marker = { id: row.id, name: row.name, createdAt: row.createdAt };
          ctx.log.info({ location: row.id, from: row.path, to: found }, "storage location found at a new path");
          break;
        }
      }
      if (!marker) {
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
      lastSeenAt: marker ? Date.now() : row.lastSeenAt,
    };
    const after = `${patch.status}|${patch.path}|${patch.freeBytes}|${patch.totalBytes}`;
    db.update(storageLocations).set(patch).where(eq(storageLocations.id, row.id)).run();
    return before !== after;
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

    async refresh() {
      let changed = false;
      for (const row of list()) changed = (await check(row)) || changed;
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
