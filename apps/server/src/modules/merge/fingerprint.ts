/**
 * Reading a library's own things (pages, documents, saved places, tracks) out of a
 * database as small, comparable states, each with a fingerprint of what a person made.
 *
 * The same code reads the home database, the copy of a drive's database, and writes
 * the record a drive carries of what everything was when it was written (the
 * baseline). Two states with the same fingerprint are the same to a person: the same
 * title, text, tags and so on. Dates, positions and "last opened" are not part of it.
 *
 * Nothing here trusts what it reads. A drive's database is whatever was on the drive:
 * every value is checked for its type and size, and a row that does not hold up is
 * left out and counted, never passed on.
 */
import type Database from "better-sqlite3";
import { sha256Hex } from "../../core/ids.ts";

type Sqlite = InstanceType<typeof Database>;

/** Changes when the fingerprints below change meaning; a drive with another version is read by dates instead. */
export const BASELINE_VERSION = "1";

/** Most of each kind that will be read from one database. A drive with more is refused, not half read. */
export const LIMITS = {
  pages: 100_000,
  documents: 100_000,
  places: 100_000,
  tracks: 20_000,
  attachments: 200_000,
  collections: 5_000,
  /** A page's stored content; the same limit a page has at home. */
  pageBytes: 5 * 1024 * 1024,
  /** A track's geometry; the same limit a GPX file has. */
  trackBytes: 20 * 1024 * 1024,
  title: 300,
  text: 20_000,
  /** The symbol a place had in a GPX file; the same limit the GPX reader has. */
  symbol: 2000,
} as const;

const ID_ONLY = /^[A-Za-z0-9_-]{1,64}$/;
const CHUNK = 400;

export interface PageState {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  coverAttachmentId: string | null;
  isTemplate: boolean;
  isFavorite: boolean;
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  contentBytes: number;
  /** Null when the content was too large to read; such a page is never brought home. */
  hash: string | null;
}

export interface DocumentState {
  id: string;
  title: string;
  originalName: string;
  ext: string;
  sizeBytes: number;
  sha256: string;
  relPath: string;
  category: string | null;
  description: string | null;
  author: string | null;
  source: string | null;
  language: string | null;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  hash: string;
}

export interface PlaceState {
  id: string;
  name: string;
  note: string;
  lat: number;
  lon: number;
  color: string;
  /** Null when the database has no icons at all: a drive written before places had them. */
  icon: string | null;
  /** The symbol the place had in the GPX file it came from, if it came from one. */
  gpxSym: string | null;
  isFavorite: boolean;
  noteId: string | null;
  createdAt: number;
  updatedAt: number;
  hash: string;
}

export interface TrackState {
  id: string;
  name: string;
  description: string;
  color: string;
  sourceFilename: string | null;
  distanceMeters: number;
  pointCount: number;
  geojsonBytes: number;
  createdAt: number;
  updatedAt: number;
  /** Null when the geometry was too large to read. */
  hash: string | null;
}

export interface AttachmentState {
  id: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  relPath: string;
}

export interface CollectionState {
  id: string;
  kind: string;
  title: string;
  catalogEntryId: string | null;
  version: string | null;
  relPath: string;
  sizeBytes: number;
  sha256: string | null;
  isBook: boolean;
}

export interface Snapshot {
  pages: Map<string, PageState>;
  documents: Map<string, DocumentState>;
  places: Map<string, PlaceState>;
  tracks: Map<string, TrackState>;
  attachments: Map<string, AttachmentState>;
  collections: CollectionState[];
  /** Documents that are chapters of a book: they belong to their collection, not to the library list. */
  chapterDocumentIds: Set<string>;
  /** Rows that could not be read and were left out, by table. */
  unreadable: Record<string, number>;
}

export class TooManyRows extends Error {
  readonly what: string;
  readonly limit: number;
  constructor(what: string, limit: number) {
    super(`Too many ${what}`);
    this.what = what;
    this.limit = limit;
  }
}

// ── Checking values ─────────────────────────────────────────────────────────

class BadRow extends Error {}

const isId = (value: unknown): value is string => typeof value === "string" && ID_ONLY.test(value);

function idOf(value: unknown): string {
  if (!isId(value)) throw new BadRow();
  return value;
}
const optionalId = (value: unknown): string | null => (value === null || value === undefined ? null : isId(value) ? value : null);

function text(value: unknown, max: number): string {
  if (typeof value !== "string") throw new BadRow();
  return value.length > max ? value.slice(0, max) : value;
}
const optionalText = (value: unknown, max: number): string | null => (typeof value === "string" ? value.slice(0, max) : null);

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BadRow();
  return Math.trunc(value);
}
const optionalInteger = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null);

function real(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BadRow();
  return value;
}

const flag = (value: unknown): boolean => value === 1 || value === true;

const yieldToOthers = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Tags are the same tag whatever their capitalisation; the notes and documents modules agree. */
export const tagKey = (name: string) => name.normalize("NFC").toLowerCase();
const sortedTagKeys = (tags: string[]) => tags.map(tagKey).sort();

const fingerprint = (parts: unknown[]): string => sha256Hex(JSON.stringify(parts));

export const pageHash = (page: Pick<PageState, "title" | "icon" | "coverAttachmentId" | "isTemplate" | "tags">, content: string): string =>
  fingerprint(["page", page.title, page.icon, content, sortedTagKeys(page.tags), page.coverAttachmentId, page.isTemplate ? 1 : 0]);

export const documentHash = (
  document: Pick<DocumentState, "title" | "category" | "description" | "author" | "source" | "language" | "tags">,
): string =>
  fingerprint([
    "document",
    document.title,
    document.category,
    document.description,
    document.author,
    document.source,
    document.language,
    sortedTagKeys(document.tags),
  ]);

/**
 * A place's icon, and the symbol it had in a GPX file, are part of its fingerprint only
 * when there is something to say: a plain pin with no symbol has the fingerprint it had
 * before places had icons. So a drive written by an Outpost from before then still
 * compares equal, place for place, with a home that has since been updated, and
 * `BASELINE_VERSION` did not have to change.
 */
export const placeHash = (
  place: Pick<PlaceState, "name" | "note" | "lat" | "lon" | "color" | "isFavorite" | "noteId"> & Partial<Pick<PlaceState, "icon" | "gpxSym">>,
): string => {
  const icon = place.icon && place.icon !== "pin" ? place.icon : null;
  const sym = place.gpxSym || null;
  const parts: unknown[] = ["place", place.name, place.note, place.lat, place.lon, place.color, place.isFavorite ? 1 : 0, place.noteId];
  if (icon || sym) parts.push(icon, sym);
  return fingerprint(parts);
};

/** Whether a table has a plain stored column of this name. A generated column is an expression the database chose, and is not read. */
export const hasColumn = (db: Sqlite, table: "markers", column: string): boolean =>
  (db.prepare(`SELECT name, hidden FROM pragma_table_xinfo('${table}')`).all() as Array<{ name: unknown; hidden: unknown }>).some(
    (entry) => entry.name === column && entry.hidden === 0,
  );

/**
 * The columns of a place that came after the first drives were written, as SQL: the
 * column where the database has it, and a null in its place where it does not.
 */
const placeExtras = (db: Sqlite): string =>
  `${hasColumn(db, "markers", "icon") ? "icon" : "NULL AS icon"}, ${hasColumn(db, "markers", "gpx_sym") ? "gpx_sym" : "NULL AS gpx_sym"}`;

export const trackHash = (track: Pick<TrackState, "name" | "description" | "color">, geojson: string): string =>
  fingerprint(["track", track.name, track.description, track.color, sha256Hex(geojson)]);

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * Walks a table in primary-key order, a few hundred rows at a time, and gives other
 * work a turn between batches: the home database is the live one, and a statement must
 * never be left open across a pause.
 */
async function walk(
  db: Sqlite,
  table: string,
  columns: string,
  limit: number,
  what: string,
  each: (row: Record<string, unknown>) => void,
  signal: AbortSignal | undefined,
  unreadable: Record<string, number>,
  chunk = CHUNK,
): Promise<void> {
  const total = (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  if (total > limit) throw new TooManyRows(what, limit);
  const statement = db.prepare(`SELECT rowid AS _rowid, ${columns} FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ${chunk}`);
  let last = Number.MIN_SAFE_INTEGER;
  for (;;) {
    signal?.throwIfAborted();
    const rows = statement.all(last) as Array<Record<string, unknown>>;
    if (rows.length === 0) return;
    for (const row of rows) {
      last = row._rowid as number;
      try {
        each(row);
      } catch (error) {
        if (!(error instanceof BadRow)) throw error;
        unreadable[table] = (unreadable[table] ?? 0) + 1;
      }
    }
    await yieldToOthers();
  }
}

const tableExists = (db: Sqlite, name: string): boolean =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;

function tagsBy(db: Sqlite, table: "note_tags" | "document_tags", column: "note_id" | "document_id"): Map<string, string[]> {
  const byOwner = new Map<string, string[]>();
  const rows = db.prepare(`SELECT j.${column} AS owner, t.name AS name FROM ${table} j JOIN tags t ON t.id = j.tag_id`).all() as Array<{
    owner: unknown;
    name: unknown;
  }>;
  for (const row of rows) {
    if (!isId(row.owner) || typeof row.name !== "string" || row.name.length === 0 || row.name.length > 200) continue;
    const list = byOwner.get(row.owner) ?? [];
    // No page or document has more than 50 tags; anything beyond that is not a tag list.
    if (list.length < 50) list.push(row.name);
    byOwner.set(row.owner, list);
  }
  for (const list of byOwner.values()) list.sort((a, b) => tagKey(a).localeCompare(tagKey(b)));
  return byOwner;
}

/** Everything a merge compares, read from one database. */
export async function readSnapshot(db: Sqlite, signal?: AbortSignal): Promise<Snapshot> {
  const snapshot: Snapshot = {
    pages: new Map(),
    documents: new Map(),
    places: new Map(),
    tracks: new Map(),
    attachments: new Map(),
    collections: [],
    chapterDocumentIds: new Set(),
    unreadable: {},
  };
  const { unreadable } = snapshot;

  const noteTags = tagsBy(db, "note_tags", "note_id");
  await walk(
    db,
    "notes",
    `id, parent_id, title, icon, cover_attachment_id, is_template, is_favorite, trashed_at, created_at, updated_at,
     length(content) AS content_bytes,
     CASE WHEN typeof(content) = 'text' AND length(content) <= ${LIMITS.pageBytes} THEN content ELSE NULL END AS content`,
    LIMITS.pages,
    "pages",
    (row) => {
      const page: PageState = {
        id: idOf(row.id),
        parentId: optionalId(row.parent_id),
        title: text(row.title, LIMITS.title),
        icon: optionalText(row.icon, 64),
        coverAttachmentId: optionalId(row.cover_attachment_id),
        isTemplate: flag(row.is_template),
        isFavorite: flag(row.is_favorite),
        trashedAt: optionalInteger(row.trashed_at),
        createdAt: integer(row.created_at),
        updatedAt: integer(row.updated_at),
        tags: noteTags.get(row.id as string) ?? [],
        contentBytes: optionalInteger(row.content_bytes) ?? 0,
        hash: null,
      };
      if (typeof row.content === "string") page.hash = pageHash(page, row.content);
      snapshot.pages.set(page.id, page);
    },
    signal,
    unreadable,
    100,
  );

  const documentTags = tagsBy(db, "document_tags", "document_id");
  await walk(
    db,
    "documents",
    "id, title, original_name, ext, size_bytes, sha256, rel_path, category, description, author, source, language, created_at, updated_at",
    LIMITS.documents,
    "documents",
    (row) => {
      const document: DocumentState = {
        id: idOf(row.id),
        title: text(row.title, LIMITS.title),
        originalName: text(row.original_name, 1000),
        ext: text(row.ext, 16),
        sizeBytes: integer(row.size_bytes),
        sha256: text(row.sha256, 128),
        relPath: text(row.rel_path, 2000),
        category: optionalText(row.category, 200),
        description: optionalText(row.description, LIMITS.text),
        author: optionalText(row.author, 500),
        source: optionalText(row.source, 2000),
        language: optionalText(row.language, 64),
        createdAt: integer(row.created_at),
        updatedAt: integer(row.updated_at),
        tags: documentTags.get(row.id as string) ?? [],
        hash: "",
      };
      if (document.sizeBytes < 0) throw new BadRow();
      document.hash = documentHash(document);
      snapshot.documents.set(document.id, document);
    },
    signal,
    unreadable,
  );

  await walk(
    db,
    "markers",
    `id, name, note, lat, lon, color, is_favorite, note_id, created_at, updated_at, ${placeExtras(db)}`,
    LIMITS.places,
    "saved places",
    (row) => {
      const place: PlaceState = {
        id: idOf(row.id),
        name: text(row.name, 200),
        note: text(row.note, LIMITS.text),
        lat: real(row.lat),
        lon: real(row.lon),
        color: text(row.color, 32),
        icon: optionalText(row.icon, 32),
        gpxSym: optionalText(row.gpx_sym, LIMITS.symbol),
        isFavorite: flag(row.is_favorite),
        noteId: optionalId(row.note_id),
        createdAt: integer(row.created_at),
        updatedAt: integer(row.updated_at),
        hash: "",
      };
      place.hash = placeHash(place);
      snapshot.places.set(place.id, place);
    },
    signal,
    unreadable,
  );

  await walk(
    db,
    "tracks",
    `id, name, description, color, source_filename, distance_meters, point_count, created_at, updated_at,
     length(geojson) AS geojson_bytes,
     CASE WHEN typeof(geojson) = 'text' AND length(geojson) <= ${LIMITS.trackBytes} THEN geojson ELSE NULL END AS geojson`,
    LIMITS.tracks,
    "tracks",
    (row) => {
      const track: TrackState = {
        id: idOf(row.id),
        name: text(row.name, 200),
        description: text(row.description, LIMITS.text),
        color: text(row.color, 32),
        sourceFilename: optionalText(row.source_filename, 255),
        distanceMeters: typeof row.distance_meters === "number" && Number.isFinite(row.distance_meters) ? row.distance_meters : 0,
        pointCount: optionalInteger(row.point_count) ?? 0,
        geojsonBytes: optionalInteger(row.geojson_bytes) ?? 0,
        createdAt: integer(row.created_at),
        updatedAt: integer(row.updated_at),
        hash: null,
      };
      if (typeof row.geojson === "string") track.hash = trackHash(track, row.geojson);
      snapshot.tracks.set(track.id, track);
    },
    signal,
    unreadable,
    // Geometry can run to megabytes per track.
    20,
  );

  await walk(
    db,
    "attachments",
    "id, filename, size_bytes, sha256, rel_path",
    LIMITS.attachments,
    "attachments",
    (row) => {
      const attachment: AttachmentState = {
        id: idOf(row.id),
        filename: text(row.filename, 300),
        sizeBytes: integer(row.size_bytes),
        sha256: text(row.sha256, 128),
        relPath: text(row.rel_path, 1000),
      };
      snapshot.attachments.set(attachment.id, attachment);
    },
    signal,
    unreadable,
  );

  await walk(
    db,
    "collections",
    "id, kind, title, catalog_entry_id, version, rel_path, size_bytes, sha256, meta",
    LIMITS.collections,
    "collections",
    (row) => {
      let isBook = false;
      if (typeof row.meta === "string" && row.meta.length < 100_000) {
        try {
          isBook = Boolean((JSON.parse(row.meta) as { book?: unknown } | null)?.book);
        } catch {
          // Not JSON: not a book.
        }
      }
      snapshot.collections.push({
        id: idOf(row.id),
        kind: text(row.kind, 32),
        title: text(row.title, LIMITS.title),
        catalogEntryId: optionalText(row.catalog_entry_id, 300),
        version: optionalText(row.version, 100),
        relPath: text(row.rel_path, 2000),
        sizeBytes: Math.max(0, integer(row.size_bytes)),
        sha256: optionalText(row.sha256, 128),
        isBook,
      });
    },
    signal,
    unreadable,
  );

  if (tableExists(db, "book_chapters")) {
    for (const row of db.prepare("SELECT document_id AS id FROM book_chapters LIMIT 500000").all() as Array<{ id: unknown }>) {
      if (isId(row.id)) snapshot.chapterDocumentIds.add(row.id);
    }
  }
  return snapshot;
}

/** One page's fingerprint as it is now, or null when there is no such page. */
export function currentPageHash(db: Sqlite, id: string): string | null {
  const row = db
    .prepare("SELECT title, icon, cover_attachment_id AS cover, is_template AS template, content FROM notes WHERE id = ?")
    .get(id) as { title: string; icon: string | null; cover: string | null; template: number; content: string } | undefined;
  if (!row) return null;
  const tags = (
    db.prepare("SELECT t.name AS name FROM note_tags j JOIN tags t ON t.id = j.tag_id WHERE j.note_id = ?").all(id) as Array<{
      name: string;
    }>
  ).map((tag) => tag.name);
  return pageHash({ title: row.title, icon: row.icon, coverAttachmentId: row.cover, isTemplate: flag(row.template), tags }, row.content);
}

export function currentDocumentHash(db: Sqlite, id: string): string | null {
  const row = db.prepare("SELECT title, category, description, author, source, language FROM documents WHERE id = ?").get(id) as
    | Pick<DocumentState, "title" | "category" | "description" | "author" | "source" | "language">
    | undefined;
  if (!row) return null;
  const tags = (
    db.prepare("SELECT t.name AS name FROM document_tags j JOIN tags t ON t.id = j.tag_id WHERE j.document_id = ?").all(id) as Array<{
      name: string;
    }>
  ).map((tag) => tag.name);
  return documentHash({ ...row, tags });
}

export function currentPlaceHash(db: Sqlite, id: string): string | null {
  const row = db
    .prepare(`SELECT name, note, lat, lon, color, is_favorite AS favorite, note_id AS noteId, ${placeExtras(db)} FROM markers WHERE id = ?`)
    .get(id) as
    | {
        name: string;
        note: string;
        lat: number;
        lon: number;
        color: string;
        favorite: number;
        noteId: string | null;
        icon: string | null;
        gpx_sym: string | null;
      }
    | undefined;
  return row ? placeHash({ ...row, gpxSym: row.gpx_sym, isFavorite: flag(row.favorite) }) : null;
}

export function currentTrackHash(db: Sqlite, id: string): string | null {
  const row = db.prepare("SELECT name, description, color, geojson FROM tracks WHERE id = ?").get(id) as
    | { name: string; description: string; color: string; geojson: string }
    | undefined;
  return row ? trackHash(row, row.geojson) : null;
}

// ── The record a drive carries ──────────────────────────────────────────────

export interface BaselineEntry {
  hash: string;
  parentId: string | null;
  trashed: boolean;
}

export interface Baseline {
  /** The library that wrote the drive. */
  madeFrom: string | null;
  writtenAt: number | null;
  pages: Map<string, BaselineEntry>;
  documents: Map<string, BaselineEntry>;
  places: Map<string, BaselineEntry>;
  tracks: Map<string, BaselineEntry>;
}

/**
 * Records in a drive's database what everything is at this moment. Called while the
 * drive is being written, on the narrowed copy, inside its transaction: the database is
 * a snapshot of home, so this is also what home was.
 */
export function writeBaseline(db: Sqlite, header: { madeFrom: string; writtenAt: number }): void {
  db.exec("DELETE FROM drive_baseline");
  const insert = db.prepare("INSERT OR REPLACE INTO drive_baseline (kind, item_id, hash, parent_id, trashed) VALUES (?, ?, ?, ?, ?)");

  /** A few hundred rows at a time: a statement cannot stay open while another one writes. */
  const each = (table: string, columns: string, row: (values: Record<string, unknown>) => void, chunk = 200): void => {
    const statement = db.prepare(`SELECT rowid AS _rowid, ${columns} FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ${chunk}`);
    let last = Number.MIN_SAFE_INTEGER;
    for (;;) {
      const rows = statement.all(last) as Array<Record<string, unknown>>;
      if (rows.length === 0) return;
      for (const values of rows) {
        last = values._rowid as number;
        row(values);
      }
    }
  };

  const noteTags = tagsBy(db, "note_tags", "note_id");
  each(
    "notes",
    "id, parent_id, title, icon, cover_attachment_id, is_template, trashed_at, content",
    (row) => {
      const hash = pageHash(
        {
          title: String(row.title).slice(0, LIMITS.title),
          icon: optionalText(row.icon, 64),
          coverAttachmentId: optionalId(row.cover_attachment_id),
          isTemplate: flag(row.is_template),
          tags: noteTags.get(row.id as string) ?? [],
        },
        row.content as string,
      );
      insert.run("page", row.id, hash, optionalId(row.parent_id), row.trashed_at === null ? 0 : 1);
    },
    50,
  );

  const documentTags = tagsBy(db, "document_tags", "document_id");
  each("documents", "id, title, category, description, author, source, language", (row) => {
    const hash = documentHash({
      title: String(row.title).slice(0, LIMITS.title),
      category: optionalText(row.category, 200),
      description: optionalText(row.description, LIMITS.text),
      author: optionalText(row.author, 500),
      source: optionalText(row.source, 2000),
      language: optionalText(row.language, 64),
      tags: documentTags.get(row.id as string) ?? [],
    });
    insert.run("document", row.id, hash, null, 0);
  });

  each("markers", `id, name, note, lat, lon, color, is_favorite, note_id, ${placeExtras(db)}`, (row) => {
    const hash = placeHash({
      name: String(row.name).slice(0, 200),
      note: String(row.note).slice(0, LIMITS.text),
      lat: row.lat as number,
      lon: row.lon as number,
      color: String(row.color).slice(0, 32),
      icon: optionalText(row.icon, 32),
      gpxSym: optionalText(row.gpx_sym, LIMITS.symbol),
      isFavorite: flag(row.is_favorite),
      noteId: optionalId(row.note_id),
    });
    insert.run("place", row.id, hash, null, 0);
  });

  each(
    "tracks",
    "id, name, description, color, geojson",
    (row) => {
      const hash = trackHash(
        {
          name: String(row.name).slice(0, 200),
          description: String(row.description).slice(0, LIMITS.text),
          color: String(row.color).slice(0, 32),
        },
        row.geojson as string,
      );
      insert.run("track", row.id, hash, null, 0);
    },
    10,
  );

  const set = db.prepare("INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  set.run("drive.madeFrom", header.madeFrom);
  set.run("drive.writtenAt", String(header.writtenAt));
  set.run("drive.baseline", BASELINE_VERSION);
  // The drive is a library of its own from here on; it makes its own identity if it ever needs one.
  db.prepare("DELETE FROM library_meta WHERE key = 'library.id'").run();
}

/** Reads the record a drive carries, or null when it has none this version understands. */
export function readBaseline(db: Sqlite): Baseline | null {
  if (!tableExists(db, "drive_baseline") || !tableExists(db, "library_meta")) return null;
  const meta = new Map<string, string>();
  for (const row of db.prepare("SELECT key, value FROM library_meta LIMIT 100").all() as Array<{ key: unknown; value: unknown }>) {
    if (typeof row.key === "string" && typeof row.value === "string" && row.value.length <= 200) meta.set(row.key, row.value);
  }
  if (meta.get("drive.baseline") !== BASELINE_VERSION) return null;
  const writtenAt = Number(meta.get("drive.writtenAt"));
  const baseline: Baseline = {
    madeFrom: meta.get("drive.madeFrom") ?? null,
    writtenAt: Number.isFinite(writtenAt) && writtenAt > 0 ? writtenAt : null,
    pages: new Map(),
    documents: new Map(),
    places: new Map(),
    tracks: new Map(),
  };
  const total = (db.prepare("SELECT count(*) AS n FROM drive_baseline").get() as { n: number }).n;
  if (total > LIMITS.pages + LIMITS.documents + LIMITS.places + LIMITS.tracks) throw new TooManyRows("recorded items", total);
  const byKind = new Map<unknown, Map<string, BaselineEntry>>([
    ["page", baseline.pages],
    ["document", baseline.documents],
    ["place", baseline.places],
    ["track", baseline.tracks],
  ]);
  const rows = db.prepare("SELECT kind, item_id, hash, parent_id, trashed FROM drive_baseline").iterate() as IterableIterator<
    Record<string, unknown>
  >;
  for (const row of rows) {
    const target = byKind.get(row.kind);
    if (!target || !isId(row.item_id) || typeof row.hash !== "string" || row.hash.length > 128) continue;
    target.set(row.item_id, { hash: row.hash, parentId: optionalId(row.parent_id), trashed: flag(row.trashed) });
  }
  return baseline;
}
