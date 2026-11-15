/**
 * Installed collections: the reference archives, map extracts and other large files
 * that live on a storage location. One row per installed thing, whatever module
 * installed it.
 *
 * This module owns the rows and the files' whereabouts (verify, move, remove). What a
 * collection *is* belongs to other modules: Kiwix serves ZIM files, maps serves tiles.
 * They follow along through the `onInstalled`, `onRemoved` and `onMoved` hooks rather
 * than this module knowing about them.
 */
import fs from "node:fs";
import path from "node:path";
import type { CollectionDto } from "@outpost/shared";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, notFound } from "../../core/errors.ts";
import { pathExists, sizeOnDisk } from "../../core/fs-safe.ts";
import { newId } from "../../core/ids.ts";
import type { JobRow } from "../../core/jobs.ts";
import { type CollectionMeta, collections } from "../../db/schema.ts";
import { createCollectionJobs } from "./jobs.ts";

export type CollectionRow = typeof collections.$inferSelect;
export type CollectionKind = CollectionRow["kind"];
export type CollectionStatus = CollectionRow["status"];

export interface CreateCollection {
  kind: CollectionKind;
  title: string;
  locationId: string;
  /** File or folder inside the location. It must already be there. */
  relPath: string;
  catalogEntryId?: string | null;
  description?: string | null;
  category?: string | null;
  language?: string | null;
  publisher?: string | null;
  license?: string | null;
  attribution?: string | null;
  version?: string | null;
  /** Measured from disk when omitted. */
  sizeBytes?: number;
  sha256?: string | null;
  meta?: CollectionMeta;
}

/** Everything about a collection except where it is; only a move changes that. */
export type CollectionPatch = Partial<
  Pick<
    CollectionRow,
    | "title"
    | "description"
    | "category"
    | "language"
    | "publisher"
    | "license"
    | "attribution"
    | "version"
    | "catalogEntryId"
    | "sizeBytes"
    | "sha256"
    | "status"
    | "verifiedAt"
    | "meta"
  >
>;

export interface CollectionFilter {
  kind?: CollectionKind;
  catalogEntryId?: string;
  locationId?: string;
}

/** Where a collection was before a move. */
export interface MovedFrom {
  locationId: string;
  relPath: string;
  /** Absolute path of the original, which still exists while listeners run. */
  path: string;
}

type Listener<A extends unknown[]> = (...args: A) => void | Promise<void>;

export interface CollectionsService {
  /** Records a file or folder that is already in place, and tells `onInstalled` listeners. */
  create(input: CreateCollection): Promise<CollectionRow>;
  get(id: string): CollectionRow | undefined;
  list(filter?: CollectionFilter): CollectionRow[];
  update(id: string, patch: CollectionPatch): CollectionRow;
  /**
   * Removes Outpost's record and, only when `deleteFiles` is true, the file itself.
   * `onRemoved` listeners run first so that anything serving the file can let go of it.
   */
  remove(id: string, options: { deleteFiles: boolean }): Promise<void>;
  /** True while the collection is being moved or checked, when it must not be removed. */
  isBusy(id: string): boolean;
  /** Absolute path of the collection's file or folder. Throws if its location is not connected. */
  absolutePath(id: string): string;
  /** Queues a job that re-hashes the file and compares it with the recorded checksum. */
  verify(id: string): JobRow;
  /** Queues a job that moves the collection to another storage location. */
  move(id: string, targetLocationId: string): Promise<JobRow>;
  onInstalled(listener: Listener<[collection: CollectionRow]>): void;
  onRemoved(listener: Listener<[collection: CollectionRow, options: { deleteFiles: boolean }]>): void;
  /** Called after the row points at the new place and before the original is deleted. */
  onMoved(listener: Listener<[collection: CollectionRow, from: MovedFrom]>): void;
  /**
   * Lets a module that knows where collections come from (the catalogue, maps) say
   * whether a newer version exists, without this module knowing how it finds out.
   * A collection has an update when any registered check says so.
   */
  addUpdateCheck(check: (collection: CollectionRow) => boolean): void;
  /** Marks collections whose file has gone from a connected location, and back again. */
  reconcile(): Promise<void>;
  /** Describes every collection to the search index again. Cheap when nothing changed. */
  reindex(): void;
  toDto(row: CollectionRow): CollectionDto;
}

declare module "../../core/context.ts" {
  interface Services {
    collections: CollectionsService;
  }
}

const SEARCH_KIND = "collection";

export function createCollectionsService(ctx: AppContext): CollectionsService {
  const { db } = ctx;
  const { storage, search } = ctx.services;
  const installedListeners: Array<Listener<[CollectionRow]>> = [];
  const removedListeners: Array<Listener<[CollectionRow, { deleteFiles: boolean }]>> = [];
  const movedListeners: Array<Listener<[CollectionRow, MovedFrom]>> = [];
  const updateChecks: Array<(collection: CollectionRow) => boolean> = [];

  /** A failing listener must not undo an install or strand a move half-way: log and go on. */
  async function notify<A extends unknown[]>(hook: string, listeners: Array<Listener<A>>, ...args: A): Promise<void> {
    for (const listener of listeners) {
      try {
        await listener(...args);
      } catch (error) {
        ctx.log.error({ err: error, hook }, "collection listener failed");
      }
    }
  }

  function get(id: string): CollectionRow | undefined {
    return db.select().from(collections).where(eq(collections.id, id)).get();
  }

  function requireRow(id: string): CollectionRow {
    const row = get(id);
    if (!row) throw notFound("Collection");
    return row;
  }

  function index(row: CollectionRow): void {
    search.upsert({
      kind: SEARCH_KIND,
      entityId: row.id,
      title: row.title,
      subtitle: row.publisher,
      collection: row.category,
      url: `/library/collections/${row.id}`,
      sections: row.description ? [{ text: row.description }] : [],
    });
  }

  function announce(id: string): void {
    ctx.events.publish({ type: "collections.changed", id });
  }

  function write(id: string, patch: Partial<typeof collections.$inferInsert>): CollectionRow {
    db.update(collections)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(collections.id, id))
      .run();
    announce(id);
    return requireRow(id);
  }

  /** Absolute path for a relPath, refusing the location's own root: that is never one collection. */
  function resolveTarget(locationId: string, relPath: string): { absolute: string; relPath: string } {
    const root = storage.resolve(locationId, "");
    const absolute = storage.resolve(locationId, relPath);
    if (absolute === root) throw badRequest("A collection needs its own file or folder inside the storage location.");
    return { absolute, relPath: path.relative(root, absolute).split(path.sep).join("/") };
  }

  function hasActiveJob(id: string): boolean {
    return ctx.jobs
      .findBySubject(`collection:${id}`)
      .some((job) => job.state === "queued" || job.state === "running" || job.state === "paused");
  }

  const jobs = createCollectionJobs(ctx, {
    requireRow,
    get,
    write,
    resolveTarget,
    hasActiveJob,
    notifyMoved: (collection, from) => notify("moved", movedListeners, collection, from),
  });

  const service: CollectionsService = {
    get,

    async create(input) {
      const title = input.title.trim();
      if (!title) throw badRequest("A collection needs a title.");
      const target = resolveTarget(input.locationId, input.relPath);
      if (!(await pathExists(target.absolute))) {
        throw badRequest("There is no file at that place in the storage location, so there is nothing to add.");
      }
      const taken = db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.locationId, input.locationId), eq(collections.relPath, target.relPath)))
        .get();
      if (taken) throw conflict("That file already belongs to an installed collection.");

      const now = Date.now();
      const id = newId();
      db.insert(collections)
        .values({
          id,
          kind: input.kind,
          catalogEntryId: input.catalogEntryId ?? null,
          title,
          description: input.description ?? null,
          category: input.category ?? null,
          language: input.language ?? null,
          publisher: input.publisher ?? null,
          license: input.license ?? null,
          attribution: input.attribution ?? null,
          version: input.version ?? null,
          locationId: input.locationId,
          relPath: target.relPath,
          sizeBytes: input.sizeBytes ?? (await sizeOnDisk(target.absolute)),
          sha256: input.sha256?.toLowerCase() ?? null,
          status: "installed",
          meta: input.meta ?? {},
          installedAt: now,
          // A checksum handed over at install time was just checked by whoever installed it.
          verifiedAt: input.sha256 ? now : null,
          updatedAt: now,
        })
        .run();
      const row = requireRow(id);
      index(row);
      announce(id);
      await notify("installed", installedListeners, row);
      // A listener may have enriched the row (Kiwix adds what it read from the archive).
      return requireRow(id);
    },

    list(filter = {}) {
      const conditions = [];
      if (filter.kind) conditions.push(eq(collections.kind, filter.kind));
      if (filter.catalogEntryId) conditions.push(eq(collections.catalogEntryId, filter.catalogEntryId));
      if (filter.locationId) conditions.push(eq(collections.locationId, filter.locationId));
      const query = db.select().from(collections);
      return (conditions.length ? query.where(and(...conditions)) : query).orderBy(desc(collections.installedAt)).all();
    },

    update(id, patch) {
      requireRow(id);
      if (patch.title !== undefined && !patch.title.trim()) throw badRequest("A collection needs a title.");
      const row = write(id, patch);
      index(row);
      return row;
    },

    async remove(id, options) {
      const row = requireRow(id);
      if (row.status === "moving" || hasActiveJob(id)) {
        throw conflict(`"${row.title}" is being moved or checked. Wait for that to finish, or cancel it, then try again.`);
      }
      let absolute: string | undefined;
      if (options.deleteFiles) {
        if (!storage.isAvailable(row.locationId)) {
          throw new AppError(
            "storage_unavailable",
            `The storage location holding "${row.title}" is not connected, so its file cannot be deleted. Reconnect it, or remove only Outpost's record and keep the file.`,
            { locationId: row.locationId },
          );
        }
        absolute = resolveTarget(row.locationId, row.relPath).absolute;
      }
      await notify("removed", removedListeners, row, options);
      // The one place a collection's file is deleted: the person asked for exactly this.
      if (absolute) await fs.promises.rm(absolute, { recursive: true, force: true });
      db.delete(collections).where(eq(collections.id, id)).run();
      search.remove(SEARCH_KIND, id);
      announce(id);
    },

    isBusy(id) {
      return get(id)?.status === "moving" || hasActiveJob(id);
    },

    absolutePath(id) {
      const row = requireRow(id);
      return storage.resolve(row.locationId, row.relPath);
    },

    verify: jobs.verify,
    move: jobs.move,

    onInstalled(listener) {
      installedListeners.push(listener);
    },
    onRemoved(listener) {
      removedListeners.push(listener);
    },
    onMoved(listener) {
      movedListeners.push(listener);
    },
    addUpdateCheck(check) {
      updateChecks.push(check);
    },

    async reconcile() {
      for (const row of service.list()) {
        // An unplugged drive says nothing about the file: leave the row as it is.
        if (!storage.isAvailable(row.locationId)) continue;
        if (row.status === "moving") {
          // A move that was cut short by a crash leaves the original in place and in use.
          if (!hasActiveJob(row.id)) write(row.id, { status: "installed" });
          continue;
        }
        const present = await pathExists(storage.resolve(row.locationId, row.relPath));
        if (!present && row.status !== "missing") write(row.id, { status: "missing" });
        else if (present && row.status === "missing") write(row.id, { status: "installed" });
      }
    },

    reindex() {
      for (const row of service.list()) index(row);
    },

    toDto(row) {
      const location = storage.list().find((candidate) => candidate.id === row.locationId);
      let updateAvailable = false;
      try {
        updateAvailable = updateChecks.some((check) => check(row));
      } catch (error) {
        ctx.log.warn({ err: error, collection: row.id }, "update check failed");
      }
      return {
        id: row.id,
        kind: row.kind,
        catalogEntryId: row.catalogEntryId,
        title: row.title,
        description: row.description,
        category: row.category,
        language: row.language,
        publisher: row.publisher,
        license: row.license,
        attribution: row.attribution,
        version: row.version,
        locationId: row.locationId,
        locationName: location?.name ?? "Unknown location",
        locationAvailable: location?.status === "available",
        relPath: row.relPath,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        status: row.status,
        updateAvailable,
        meta: row.meta,
        installedAt: row.installedAt,
        verifiedAt: row.verifiedAt,
        updatedAt: row.updatedAt,
      };
    },
  };

  return service;
}
