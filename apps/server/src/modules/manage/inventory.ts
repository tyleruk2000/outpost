/**
 * Everything installed, as one list.
 *
 * Collections and documents are two tables, and one thing a person installed can be a
 * row in each: a catalogue sheet or book is a collection (the catalogue's note that it is
 * installed) and one or more documents (what the library reads and searches), over the
 * same file or files. Here they are one entry, because that is how they are removed and
 * moved: together.
 */
import path from "node:path";
import type { ManagedItem, ManagedKind, ManagedOrigin } from "@outpost/shared";
import { inArray } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { bookChapters, documents as documentsTable, downloads as downloadsTable, jobs as jobsTable } from "../../db/schema.ts";
import type { CollectionRow } from "../collections/service.ts";

/** The folders Outpost itself makes inside a storage location. Nothing else in one is Outpost's. */
export const OUTPOST_FOLDERS = ["collections", "documents"] as const;

export const isInOutpostFolder = (relPath: string): boolean => OUTPOST_FOLDERS.some((folder) => relPath.startsWith(`${folder}/`));

export interface DocumentRef {
  id: string;
  title: string;
  sizeBytes: number;
  locationId: string;
  relPath: string;
  createdAt: number;
}

export interface Entry {
  item: ManagedItem;
  collection?: CollectionRow;
  /** The documents removed and moved with this entry: its own, or the one it is. */
  documents: DocumentRef[];
}

export interface Inventory {
  entries(): Entry[];
  /** The entries for these keys, and the keys that name nothing (already removed, say). */
  pick(keys: string[]): { entries: Entry[]; unknown: string[] };
  /** Why a document cannot be removed or moved just now, if it cannot. */
  documentBusy(id: string): string | null;
}

/**
 * The documents a catalogue sheet or paper is (`meta.documentId`). A book's chapters are
 * found through the `book_chapters` table instead; see `entries()`.
 */
export function documentIdsOf(meta: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  if (typeof meta.documentId === "string" && meta.documentId) ids.add(meta.documentId);
  if (Array.isArray(meta.documentIds)) for (const id of meta.documentIds) if (typeof id === "string" && id) ids.add(id);
  return [...ids];
}

const DOCUMENT_MOVE_JOB = "documents.move";
const BUSY_COLLECTION = "It is being moved or checked. Wait for that to finish, or cancel it under Downloads.";
const BUSY_DOCUMENT = "Documents are being moved. Wait for that to finish, or cancel it under Downloads.";

export function createInventory(ctx: AppContext, missingDocuments: () => ReadonlySet<string>): Inventory {
  const { db } = ctx;
  const { collections, storage } = ctx.services;

  /** Documents a running or waiting "move documents" job is going to touch. */
  function documentsBeingMoved(): { all: boolean; exceptLocation?: string; ids: Set<string> } {
    const active = db
      .select()
      .from(jobsTable)
      .where(inArray(jobsTable.state, ["queued", "running", "paused"]))
      .all()
      .filter((job) => job.type === DOCUMENT_MOVE_JOB);
    const ids = new Set<string>();
    let all = false;
    let exceptLocation: string | undefined;
    for (const job of active) {
      const payload = job.payload as { locationId?: string; ids?: string[] };
      if (Array.isArray(payload.ids)) for (const id of payload.ids) ids.add(id);
      else {
        all = true;
        exceptLocation = payload.locationId;
      }
    }
    return { all, exceptLocation, ids };
  }

  function entries(): Entry[] {
    const locations = new Map(storage.list().map((location) => [location.id, location]));
    const documentRows: DocumentRef[] = db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        sizeBytes: documentsTable.sizeBytes,
        locationId: documentsTable.locationId,
        relPath: documentsTable.relPath,
        createdAt: documentsTable.createdAt,
      })
      .from(documentsTable)
      .all();
    const documentsById = new Map(documentRows.map((row) => [row.id, row]));
    // A book is a collection whose chapters are documents; they come and go with it.
    const chaptersByBook = new Map<string, string[]>();
    for (const chapter of db
      .select({ collectionId: bookChapters.collectionId, documentId: bookChapters.documentId })
      .from(bookChapters)
      .all()) {
      chaptersByBook.set(chapter.collectionId, [...(chaptersByBook.get(chapter.collectionId) ?? []), chapter.documentId]);
    }
    const downloaded = new Set(
      db
        .select({ collectionId: downloadsTable.collectionId })
        .from(downloadsTable)
        .all()
        .map((row) => row.collectionId)
        .filter((id): id is string => typeof id === "string"),
    );
    const moving = documentsBeingMoved();
    const documentIsBusy = (row: DocumentRef) => moving.ids.has(row.id) || (moving.all && row.locationId !== moving.exceptLocation);
    const missing = missingDocuments();
    const claimed = new Set<string>();
    const result: Entry[] = [];

    const describe = (locationId: string) => {
      const location = locations.get(locationId);
      return { locationName: location?.name ?? "Unknown location", locationAvailable: location?.status === "available" };
    };

    for (const row of collections.list()) {
      const meta = row.meta as Record<string, unknown>;
      // A catalogue file the library already held is a copy of its own: the document
      // was the person's before, and stays theirs.
      const linked = meta.alreadyInLibrary
        ? []
        : [...documentIdsOf(meta), ...(chaptersByBook.get(row.id) ?? [])]
            .map((id) => documentsById.get(id))
            .filter((document): document is DocumentRef => document !== undefined && !claimed.has(document.id));
      for (const document of linked) claimed.add(document.id);

      const kind: ManagedKind = row.kind === "file" && linked.length > 0 ? "sheet" : row.kind;
      // Maps, terrain and place names only ever arrive by download, unless a person
      // pointed Outpost at an archive of their own. Anything else needs a catalogue
      // entry or a download record to count as something that can be fetched again.
      const origin: ManagedOrigin =
        meta.imported === true
          ? "own"
          : row.catalogEntryId || downloaded.has(row.id) || row.kind === "map" || row.kind === "terrain" || row.kind === "places"
            ? "downloaded"
            : "own";

      // Documents that are the collection's own file (or inside its folder) add nothing to its size.
      const inside = (document: DocumentRef) =>
        document.locationId === row.locationId && (document.relPath === row.relPath || document.relPath.startsWith(`${row.relPath}/`));
      const sizeBytes =
        row.sizeBytes + linked.filter((document) => !inside(document)).reduce((sum, document) => sum + document.sizeBytes, 0);

      const { locationName, locationAvailable } = describe(row.locationId);
      const busy = collections.isBusy(row.id) ? BUSY_COLLECTION : linked.some(documentIsBusy) ? BUSY_DOCUMENT : null;
      const state: ManagedItem["state"] = busy
        ? "busy"
        : row.status === "damaged"
          ? "damaged"
          : locationAvailable && (row.status === "missing" || linked.some((document) => missing.has(document.id)))
            ? "missing"
            : "ok";
      result.push({
        collection: row,
        documents: linked,
        item: {
          key: `collection:${row.id}`,
          type: "collection",
          id: row.id,
          title: row.title,
          kind,
          origin,
          sizeBytes,
          addedAt: row.installedAt,
          locationId: row.locationId,
          locationName,
          locationAvailable,
          relPath: row.relPath,
          inOutpostFolder: isInOutpostFolder(row.relPath),
          state,
          busyReason: busy,
          documents: linked.map((document) => ({ id: document.id, title: document.title })),
          catalogEntryId: row.catalogEntryId,
          href: linked.length === 1 ? `/library/documents/${linked[0]!.id}` : `/library/collections/${row.id}`,
        },
      });
    }

    for (const row of documentRows) {
      if (claimed.has(row.id)) continue;
      const { locationName, locationAvailable } = describe(row.locationId);
      const busy = documentIsBusy(row) ? BUSY_DOCUMENT : null;
      result.push({
        documents: [row],
        item: {
          key: `document:${row.id}`,
          type: "document",
          id: row.id,
          title: row.title,
          kind: "document",
          origin: "own",
          sizeBytes: row.sizeBytes,
          addedAt: row.createdAt,
          locationId: row.locationId,
          locationName,
          locationAvailable,
          relPath: row.relPath,
          inOutpostFolder: isInOutpostFolder(row.relPath),
          state: busy ? "busy" : locationAvailable && missing.has(row.id) ? "missing" : "ok",
          busyReason: busy,
          documents: [],
          catalogEntryId: null,
          href: `/library/documents/${row.id}`,
        },
      });
    }
    return result;
  }

  return {
    entries,

    pick(keys) {
      const byKey = new Map(entries().map((entry) => [entry.item.key, entry]));
      const found: Entry[] = [];
      const unknown: string[] = [];
      for (const key of new Set(keys)) {
        const entry = byKey.get(key);
        if (entry) found.push(entry);
        else unknown.push(key);
      }
      return { entries: found, unknown };
    },

    documentBusy(id) {
      const moving = documentsBeingMoved();
      if (moving.ids.has(id)) return BUSY_DOCUMENT;
      if (!moving.all) return null;
      const row = db
        .select({ locationId: documentsTable.locationId })
        .from(documentsTable)
        .where(inArray(documentsTable.id, [id]))
        .get();
      return row && row.locationId !== moving.exceptLocation ? BUSY_DOCUMENT : null;
    },
  };
}

/** Where an entry's file is, as an absolute path for a person to read (as last known when disconnected). */
export function fileOf(ctx: AppContext, entry: Entry): { title: string; locationName: string; path: string; bytes: number } {
  const location = ctx.services.storage.list().find((candidate) => candidate.id === entry.item.locationId);
  return {
    title: entry.item.title,
    locationName: entry.item.locationName,
    path: location ? path.join(location.path, entry.item.relPath) : entry.item.relPath,
    bytes: entry.item.sizeBytes,
  };
}
