/**
 * Relational schema. The SQL in ./migrations is generated from this file with
 * `pnpm --filter @outpost/server db:generate`; full-text tables and their triggers are
 * added by hand-written migrations because Drizzle does not model virtual tables.
 *
 * Conventions: text ULID primary keys, integer millisecond timestamps, JSON stored as
 * text. Paths are always stored relative to a storage location so that a location can
 * be remounted somewhere else without rewriting rows.
 */
import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () => integer("created_at").notNull();
const updatedAt = () => integer("updated_at").notNull();
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: json<unknown>("value").notNull(),
  updatedAt: updatedAt(),
});

// ── Storage ─────────────────────────────────────────────────────────────────

export const storageLocations = sqliteTable("storage_locations", {
  id: id(),
  name: text("name").notNull(),
  /** Absolute path as last seen. The marker file is the identity, not this path. */
  path: text("path").notNull(),
  kind: text("kind", { enum: ["internal", "external", "network", "volume"] }).notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["available", "unavailable"] }).notNull(),
  statusDetail: text("status_detail"),
  totalBytes: integer("total_bytes"),
  freeBytes: integer("free_bytes"),
  lastSeenAt: integer("last_seen_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Network shares a person connected from the Storage screen. This is what is needed to
 * connect again, and nothing else: there is deliberately no column for a password. If
 * the person chose to keep it, it is in the operating system's keychain, not here.
 */
export const networkShares = sqliteTable(
  "network_shares",
  {
    id: id(),
    /** Host name or address as typed, lower case. */
    server: text("server").notNull(),
    port: integer("port").notNull().default(445),
    share: text("share").notNull(),
    userName: text("user_name").notNull(),
    /** A keychain item exists for this share. */
    passwordInKeychain: integer("password_in_keychain", { mode: "boolean" }).notNull().default(false),
    /** Connect it again when Outpost starts. Turned off by "Disconnect". */
    autoConnect: integer("auto_connect", { mode: "boolean" }).notNull().default(true),
    /** Where it was last mounted, and the address that was used, to recognise it again. */
    mountPath: text("mount_path"),
    lastAddress: text("last_address"),
    /** Why the last attempt to connect failed; null after a success. */
    lastError: text("last_error", {
      enum: ["wrong_password", "server_not_found", "share_not_found", "needs_password", "failed"],
    }),
    lastConnectedAt: integer("last_connected_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("network_shares_address_idx").on(table.server, table.port, table.share)],
);

// ── Background work ─────────────────────────────────────────────────────────

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    queue: text("queue").notNull(),
    state: text("state", {
      enum: ["queued", "running", "paused", "succeeded", "failed", "cancelled"],
    }).notNull(),
    title: text("title").notNull(),
    payload: json<Record<string, unknown>>("payload").notNull(),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total"),
    progressMessage: text("progress_message"),
    /** What `progressCurrent` and `progressTotal` count ("bytes", "passages", "pages"); null when the job does not say. */
    progressUnit: text("progress_unit"),
    result: json<Record<string, unknown>>("result"),
    error: text("error"),
    errorKind: text("error_kind"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(1),
    runAfter: integer("run_after").notNull().default(0),
    /** What the job is about, e.g. "download:01H…", for lookups from the owning module. */
    subject: text("subject"),
    createdAt: createdAt(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    updatedAt: updatedAt(),
  },
  (table) => [index("jobs_state_idx").on(table.queue, table.state, table.runAfter), index("jobs_subject_idx").on(table.subject)],
);

/**
 * Where a job's progress stood, now and then while it ran: what its rate over time and
 * the time it has left are worked out from. Bounded: at most a couple of hundred a job
 * (thinned to every other one as it goes on), and removed a week after the job ends.
 */
export const jobSamples = sqliteTable(
  "job_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    at: integer("at").notNull(),
    current: integer("current").notNull(),
    total: integer("total"),
    unit: text("unit"),
  },
  (table) => [index("job_samples_job_idx").on(table.jobId, table.at)],
);

/**
 * What happened to a job, oldest first: each change of state, each retry and each stage
 * it said it had reached. At most a hundred a job; removed a week after the job ends.
 */
export const jobEvents = sqliteTable(
  "job_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    at: integer("at").notNull(),
    /** "state": its state changed; "retry": it failed and will try again; "stage": it said what it had moved on to. */
    kind: text("kind", { enum: ["state", "retry", "stage", "resumed", "restarted"] }).notNull(),
    state: text("state").notNull(),
    message: text("message"),
  },
  (table) => [index("job_events_job_idx").on(table.jobId, table.id)],
);

// ── Installed content ───────────────────────────────────────────────────────

export interface CollectionMeta {
  /** Kiwix: book name used in content URLs, ZIM UUID, article count. */
  zim?: { bookName: string; uuid: string; articleCount?: number; flavour?: string };
  /** Maps: tile bounds and zooms of an extract. */
  map?: {
    bounds: [number, number, number, number];
    minZoom: number;
    maxZoom: number;
    /** "imagery": satellite pictures as WebP tiles (modules/maps/imagery), not a region of the map. */
    tileType: "vector" | "terrain" | "imagery";
    sourceBuild?: string;
    format: "pmtiles" | "mbtiles";
  };
  places?: { countries: string[]; count: number };
  [key: string]: unknown;
}

export const collections = sqliteTable(
  "collections",
  {
    id: id(),
    kind: text("kind", { enum: ["zim", "map", "terrain", "places", "file", "model", "dataset", "extract"] }).notNull(),
    catalogEntryId: text("catalog_entry_id"),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    language: text("language"),
    publisher: text("publisher"),
    license: text("license"),
    attribution: text("attribution"),
    version: text("version"),
    locationId: text("location_id")
      .notNull()
      .references(() => storageLocations.id),
    relPath: text("rel_path").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    sha256: text("sha256"),
    status: text("status", { enum: ["installed", "missing", "moving", "damaged"] })
      .notNull()
      .default("installed"),
    meta: json<CollectionMeta>("meta").notNull(),
    installedAt: integer("installed_at").notNull(),
    verifiedAt: integer("verified_at"),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("collections_kind_idx").on(table.kind),
    index("collections_location_idx").on(table.locationId),
    index("collections_catalog_idx").on(table.catalogEntryId),
  ],
);

export const downloads = sqliteTable(
  "downloads",
  {
    id: id(),
    jobId: text("job_id"),
    /** What kind of thing is being fetched; decides how it is installed afterwards. */
    kind: text("kind", { enum: ["zim", "map", "terrain", "places", "file", "model", "document", "dataset", "extract"] }).notNull(),
    catalogEntryId: text("catalog_entry_id"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    locationId: text("location_id")
      .notNull()
      .references(() => storageLocations.id),
    relPath: text("rel_path").notNull(),
    state: text("state", {
      enum: ["queued", "running", "paused", "verifying", "completed", "failed", "cancelled"],
    }).notNull(),
    totalBytes: integer("total_bytes"),
    receivedBytes: integer("received_bytes").notNull().default(0),
    sha256Expected: text("sha256_expected"),
    sha256Actual: text("sha256_actual"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    error: text("error"),
    errorKind: text("error_kind"),
    attempts: integer("attempts").notNull().default(0),
    collectionId: text("collection_id"),
    meta: json<Record<string, unknown>>("meta").notNull(),
    createdAt: createdAt(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    updatedAt: updatedAt(),
  },
  (table) => [index("downloads_state_idx").on(table.state)],
);

/** Last successful answer from an upstream catalogue, so Explore still reads offline. */
export const catalogCache = sqliteTable("catalog_cache", {
  entryId: text("entry_id").primaryKey(),
  resolved: json<Record<string, unknown>>("resolved").notNull(),
  resolvedAt: integer("resolved_at").notNull(),
});

// ── Documents ───────────────────────────────────────────────────────────────

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    title: text("title").notNull(),
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    ext: text("ext").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    locationId: text("location_id")
      .notNull()
      .references(() => storageLocations.id),
    relPath: text("rel_path").notNull(),
    category: text("category"),
    description: text("description"),
    author: text("author"),
    source: text("source"),
    language: text("language"),
    pageCount: integer("page_count"),
    extraction: text("extraction", {
      enum: ["pending", "running", "done", "failed", "unsupported"],
    })
      .notNull()
      .default("pending"),
    extractionDetail: text("extraction_detail"),
    textChars: integer("text_chars").notNull().default(0),
    /** Pages with no text of their own that OCR could try: scanned PDF pages, or 1 for an image. */
    scanPages: integer("scan_pages").notNull().default(0),
    /** Pages OCR has been run on; null until it has been run at all. */
    ocrPages: integer("ocr_pages"),
    /** A sentence for people about the last OCR run: what it could not read, or why it stopped. */
    ocrDetail: text("ocr_detail"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("documents_sha_idx").on(table.sha256), index("documents_created_idx").on(table.createdAt)],
);

export const tags = sqliteTable("tags", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const documentTags = sqliteTable(
  "document_tags",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.tagId] })],
);

/**
 * The chapters of a book: a collection that is a folder of documents read in order
 * (a handbook or a guide from the catalogue). One row ties a document to its book and
 * says where it comes in the contents. The document itself is an ordinary document;
 * deleting it, or removing the book, removes the row with it.
 */
export const bookChapters = sqliteTable(
  "book_chapters",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** The chapter's name in links between chapters. Stays the same from one edition to the next. */
    key: text("key").notNull(),
    /** Reading order within the book, from 0. */
    position: integer("position").notNull(),
    /** The named part of the book the chapter belongs to. */
    section: text("section").notNull().default(""),
    /** The number as printed in the contents: "00", "05A", "A". */
    number: text("number"),
    /** One line for the contents page. */
    summary: text("summary"),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.key] }),
    uniqueIndex("book_chapters_document_idx").on(table.documentId),
    index("book_chapters_order_idx").on(table.collectionId, table.position),
  ],
);

/**
 * What a book brought in from a Calibre library says about itself beyond what every
 * document has: all its authors, its series and place in it, and whether Outpost kept a
 * copy of its cover (under `<data>/covers/`). Deleting the document removes the row.
 */
export const bookDetails = sqliteTable("book_details", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  authors: json<string[]>("authors").notNull(),
  series: text("series"),
  seriesIndex: real("series_index"),
  /** Extension of the kept cover ("jpg", "png"), or null when there is none. */
  coverExt: text("cover_ext"),
  /** Calibre's own identifier for the book, so the same book brought in twice is recognised. */
  calibreUuid: text("calibre_uuid"),
  createdAt: createdAt(),
});

/**
 * Bringing in a Calibre library from a folder on a storage location: read first (the
 * plan), then carried out as the person chose. The Calibre folder is only ever read.
 */
export const calibreImports = sqliteTable("calibre_imports", {
  id: id(),
  state: text("state", { enum: ["reading", "ready", "importing", "completed", "failed", "discarded"] }).notNull(),
  /** No reference to the location: forgetting a location must not be held up by an old import. */
  locationId: text("location_id").notNull(),
  /** The Calibre library's folder inside the location. */
  relPath: text("rel_path").notNull(),
  plan: json<Record<string, unknown>>("plan"),
  options: json<Record<string, unknown>>("options"),
  report: json<Record<string, unknown>>("report"),
  error: text("error"),
  createdAt: createdAt(),
  completedAt: integer("completed_at"),
});

// ── Notes ───────────────────────────────────────────────────────────────────

export const notes = sqliteTable(
  "notes",
  {
    id: id(),
    parentId: text("parent_id"),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    coverAttachmentId: text("cover_attachment_id"),
    /** Editor document (ProseMirror JSON). The source of truth for a page. */
    content: json<Record<string, unknown>>("content").notNull(),
    /** Plain text derived from content, for previews and duplicate detection. */
    contentText: text("content_text").notNull().default(""),
    contentHash: text("content_hash").notNull().default(""),
    position: real("position").notNull().default(0),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    isTemplate: integer("is_template", { mode: "boolean" }).notNull().default(false),
    trashedAt: integer("trashed_at"),
    /** Where an imported page came from, for safe re-imports. */
    importKey: text("import_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastViewedAt: integer("last_viewed_at"),
  },
  (table) => [
    index("notes_parent_idx").on(table.parentId, table.position),
    index("notes_updated_idx").on(table.updatedAt),
    index("notes_import_idx").on(table.importKey),
  ],
);

export const noteTags = sqliteTable(
  "note_tags",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.noteId, table.tagId] })],
);

/** Page → page links found in content. Backlinks are this table read backwards. */
export const noteLinks = sqliteTable(
  "note_links",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    targetId: text("target_id").notNull(),
    targetKind: text("target_kind", { enum: ["note", "document"] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.targetKind, table.targetId] }),
    index("note_links_target_idx").on(table.targetKind, table.targetId),
  ],
);

/**
 * What a page said before a save changed it. Thinned with age (see notes/versions.ts).
 * A page that is encrypted keeps only versions that are themselves ciphertext.
 */
export const noteVersions = sqliteTable(
  "note_versions",
  {
    id: id(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    content: json<Record<string, unknown>>("content").notNull(),
    encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
    /** When the page was saved like this (the page's `updatedAt` at the time). */
    savedAt: integer("saved_at").notNull(),
    /** Bytes of the stored content, for the Storage screen. */
    sizeBytes: integer("size_bytes").notNull().default(0),
  },
  (table) => [index("note_versions_note_idx").on(table.noteId, table.savedAt)],
);

/**
 * A passage marked in a library document, with an optional line about it. Kept here
 * only; the document's file is never written to.
 */
export const documentHighlights = sqliteTable(
  "document_highlights",
  {
    id: id(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Page of a PDF, 1-based; null for other documents. */
    page: integer("page"),
    /** Chapter of an EPUB, 1-based as in its address; null for other documents. */
    chapter: integer("chapter"),
    /** The words marked, and a few words either side to find them again. */
    exact: text("exact").notNull(),
    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("document_highlights_document_idx").on(table.documentId, table.page, table.chapter)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    noteId: text("note_id"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Relative to the data directory's attachments folder. */
    relPath: text("rel_path").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("attachments_note_idx").on(table.noteId)],
);

export const imports = sqliteTable("imports", {
  id: id(),
  kind: text("kind", { enum: ["markdown", "notion", "html", "text", "pdf", "mixed"] }).notNull(),
  state: text("state", {
    enum: ["uploaded", "analysing", "ready", "importing", "completed", "failed", "discarded"],
  }).notNull(),
  originalName: text("original_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  analysis: json<Record<string, unknown>>("analysis"),
  options: json<Record<string, unknown>>("options"),
  report: json<Record<string, unknown>>("report"),
  error: text("error"),
  createdAt: createdAt(),
  completedAt: integer("completed_at"),
});

// ── Search and retrieval ────────────────────────────────────────────────────

/**
 * One row per thing that can appear in search results. `kind` + `entityId` point back
 * at the owning table; the search layer never needs to know that table's shape.
 */
export const searchEntities = sqliteTable(
  "search_entities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    /** Source collection or grouping shown with a result, e.g. a document category. */
    collection: text("collection"),
    /** In-app route that opens the entity. */
    url: text("url").notNull(),
    sourcePath: text("source_path"),
    meta: json<Record<string, unknown>>("meta"),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("search_entities_ref_idx").on(table.kind, table.entityId)],
);

/**
 * Passages. Keyword search indexes them through `chunks_fts` ("Did you mean" reads their words
 * as written from `chunks_words`); semantic search attaches
 * vectors through `embeddings`. A chunk keeps everything needed to cite its source.
 */
export const chunks = sqliteTable(
  "chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityRowId: integer("entity_row_id")
      .notNull()
      .references(() => searchEntities.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    /** Denormalised from the entity so the FTS index can weight them per column. */
    title: text("title").notNull(),
    tags: text("tags").notNull().default(""),
    heading: text("heading").notNull().default(""),
    text: text("text").notNull(),
    page: integer("page"),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    contentHash: text("content_hash").notNull(),
    indexVersion: integer("index_version").notNull(),
  },
  (table) => [index("chunks_entity_idx").on(table.entityRowId, table.ordinal), index("chunks_hash_idx").on(table.contentHash)],
);

export const embeddingModels = sqliteTable("embedding_models", {
  /** Stable identifier such as "transformers:Xenova/all-MiniLM-L6-v2". */
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  dimensions: integer("dimensions").notNull(),
  createdAt: createdAt(),
});

/**
 * Vectors are keyed by chunk and model, so several models with different dimensions
 * can coexist and an index can be rebuilt for a new model without touching the old one.
 */
export const embeddings = sqliteTable(
  "embeddings",
  {
    chunkId: integer("chunk_id")
      .notNull()
      .references(() => chunks.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => embeddingModels.id, { onDelete: "cascade" }),
    /** Little-endian Float32 values, L2-normalised. */
    vector: blob("vector", { mode: "buffer" }).notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.chunkId, table.modelId] }), index("embeddings_model_idx").on(table.modelId)],
);

// ── Maps ────────────────────────────────────────────────────────────────────

export const places = sqliteTable(
  "places",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    collectionId: text("collection_id").notNull(),
    geonameId: integer("geoname_id"),
    name: text("name").notNull(),
    asciiName: text("ascii_name").notNull().default(""),
    altNames: text("alt_names").notNull().default(""),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    featureClass: text("feature_class"),
    featureCode: text("feature_code"),
    country: text("country"),
    admin1: text("admin1"),
    population: integer("population").notNull().default(0),
    elevation: integer("elevation"),
  },
  (table) => [index("places_collection_idx").on(table.collectionId)],
);

export const markers = sqliteTable("markers", {
  id: id(),
  name: text("name").notNull(),
  note: text("note").notNull().default(""),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  color: text("color").notNull().default("teal"),
  /** One of `MARKER_ICONS`; "pin" is the plain dot. */
  icon: text("icon").notNull().default("pin"),
  /** The `<sym>` the place had in the GPX file it came from, as written there, so that exporting it again loses nothing. */
  gpxSym: text("gpx_sym"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  noteId: text("note_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tracks = sqliteTable("tracks", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("teal"),
  /** GeoJSON FeatureCollection of the routes, tracks and waypoints in the file. */
  geojson: json<Record<string, unknown>>("geojson").notNull(),
  sourceFilename: text("source_filename"),
  distanceMeters: real("distance_meters").notNull().default(0),
  ascentMeters: real("ascent_meters"),
  pointCount: integer("point_count").notNull().default(0),
  bounds: json<[number, number, number, number]>("bounds"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Road routes ─────────────────────────────────────────────────────────────

/** Installed main-roads networks (modules/roads): the network itself is a file in the data directory. */
export const roadNetworks = sqliteTable("road_networks", {
  id: id(),
  /** Geofabrik's region id, or null for a file the person brought. */
  regionId: text("region_id"),
  name: text("name").notNull(),
  country: text("country"),
  dataDate: text("data_date"),
  /** The network file, relative to the data directory ("roads/<id>.roads"). */
  relPath: text("rel_path").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  nodes: integer("nodes").notNull(),
  edges: integer("edges").notNull(),
  crossings: integer("crossings").notNull().default(0),
  /** Where the extract came from: Geofabrik's address, or "Your file". */
  source: text("source").notNull(),
  bbox: json<[number, number, number, number]>("bbox"),
  /** The extract read: kept (where) or deleted once read. */
  extract: json<{ kept: boolean; locationId: string | null; relPath: string | null; bytes: number; collectionId?: string | null }>(
    "extract",
  ).notNull(),
  /** How the build went: seconds, peak memory, ways read. */
  stats: json<Record<string, unknown>>("stats"),
  builtAt: integer("built_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Country files (modules/maps/country-files.ts): each Geofabrik extract Outpost downloaded
 * and read, whether it was kept (then also a collection of kind "extract") or deleted once
 * read. A row is what the Map data screen says of a country's file ("read and deleted
 * 17 Nov 2026, 2.29 GB"); it is history, never a file of its own.
 */
export const countryFiles = sqliteTable(
  "country_files",
  {
    id: id(),
    /** Geofabrik's region id ("united-kingdom", "us/ohio"). */
    regionId: text("region_id").notNull(),
    name: text("name").notNull(),
    country: text("country"),
    /** The day the data is from, as the file's header says ("2026-11-21"), or from its dated name. */
    dataDate: text("data_date"),
    /** Geofabrik's dated file name ("united-kingdom-261121.osm.pbf"). */
    fileName: text("file_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    bytes: integer("bytes").notNull(),
    /** The kept file's collection; null when the file was deleted once read. */
    collectionId: text("collection_id"),
    /** What was made from it this time: the road network and the places pack, where asked. */
    roadNetworkId: text("road_network_id"),
    packId: text("pack_id"),
    readAt: integer("read_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("country_files_region_idx").on(table.regionId)],
);

/** Road routes a person planned and saved, with their directions, so they print with no network loaded. */
export const roadRoutes = sqliteTable("road_routes", {
  id: id(),
  name: text("name").notNull(),
  fromTo: text("from_to").notNull().default(""),
  distanceM: real("distance_m").notNull(),
  durationS: real("duration_s").notNull(),
  /** The whole planned route (`RoadRouteResult` in the shared package). */
  route: json<Record<string, unknown>>("route").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Contacts ────────────────────────────────────────────────────────────────

/**
 * People and places to reach. What a person typed is in `data`; the columns beside it
 * are worked out from it for listing and finding. See modules/contacts.
 */
export const contacts = sqliteTable(
  "contacts",
  {
    id: id(),
    /** The card's own identity (vCard UID): how a file brought in twice is known to hold the same contact. */
    uid: text("uid").notNull(),
    kind: text("kind", { enum: ["person", "organisation"] })
      .notNull()
      .default("person"),
    displayName: text("display_name").notNull(),
    /** Lower case with accents folded, family name first: what the list is ordered by. */
    sortKey: text("sort_key").notNull(),
    /** The contact's fields (`ContactFields` in the shared package; its tags are in `contact_tags`). */
    data: json<Record<string, unknown>>("data").notNull(),
    /** Lower case words and bare digits, for the filter on the Contacts screen. */
    searchText: text("search_text").notNull().default(""),
    isEmergency: integer("is_emergency", { mode: "boolean" }).notNull().default(false),
    /** The saved place on the map it points at. */
    markerId: text("marker_id"),
    /** vCard lines Outpost has no field for, one to a line as they came, so that an export gives them back. */
    extra: text("extra").notNull().default(""),
    source: text("source", { enum: ["manual", "file", "picker"] })
      .notNull()
      .default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("contacts_uid_idx").on(table.uid),
    index("contacts_sort_idx").on(table.sortKey),
    index("contacts_emergency_idx").on(table.isEmergency),
  ],
);

/**
 * A contact's tags. They are kept by name and are not rows of `tags`: that table is
 * tidied by the notes and the documents whenever one of theirs stops using a tag, which
 * would take a contact's tag with it.
 */
export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.name] }), index("contact_tags_name_idx").on(table.name)],
);

/** Contact → page of notes. A page that has been deleted leaves a row behind that is not shown. */
export const contactPages = sqliteTable(
  "contact_pages",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    noteId: text("note_id").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.noteId] }), index("contact_pages_note_idx").on(table.noteId)],
);

// ── Encryption ──────────────────────────────────────────────────────────────

/**
 * OpenPGP keys people keep here. The server cannot use them: all cryptography is done
 * in the browser. A public key is anyone's to read. A private key is stored only in the
 * form its passphrase protects, which `modules/encryption/packets.ts` checks on the way
 * in, and only when a person asks for it to be kept here as well as on their device.
 */
export const pgpKeys = sqliteTable("pgp_keys", {
  /** Lower-case hex, worked out by the server from the key itself. */
  fingerprint: text("fingerprint").primaryKey(),
  publicArmored: text("public_armored").notNull(),
  privateArmored: text("private_armored"),
  /** Listed under "My keys" rather than with other people's. */
  mine: integer("mine", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Portable drives: bringing changes back ──────────────────────────────────

/**
 * Small facts about this library that are not settings and must survive "reset
 * settings". At home: `library.id`, a random identity made the first time it is needed.
 * On a portable drive: `drive.madeFrom` (the id of the library that wrote the drive),
 * `drive.writtenAt` and `drive.baseline` (the version of the record below).
 */
export const libraryMeta = sqliteTable("library_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Written on a portable drive when it is made or updated, and empty everywhere else:
 * what each page, document, saved place and track was at that moment. When the drive
 * comes home, anything that differs from this record was changed on the drive, and
 * anything at home that differs from it was changed at home. See modules/merge.
 */
export const driveBaseline = sqliteTable(
  "drive_baseline",
  {
    kind: text("kind", { enum: ["page", "document", "place", "track"] }).notNull(),
    itemId: text("item_id").notNull(),
    /** Fingerprint of what the person made: see modules/merge/fingerprint.ts. */
    hash: text("hash").notNull(),
    /** Pages: the page it sat under. */
    parentId: text("parent_id"),
    /** Pages: it was in the trash already. */
    trashed: integer("trashed", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.kind, table.itemId] })],
);

/** One attempt to bring a drive's changes home: what was found, what was chosen, how it ended. */
export const driveMerges = sqliteTable(
  "drive_merges",
  {
    id: id(),
    /** Identity of the drive: the id of its library folder, which survives updates. */
    driveId: text("drive_id").notNull(),
    /** When the data that was read had been written to the drive. With `driveId` it names one generation of a drive. */
    driveWrittenAt: integer("drive_written_at").notNull().default(0),
    /** Folder of the drive as it was mounted, for people; never used to find it again without checking. */
    drivePath: text("drive_path").notNull(),
    /** "data", or a kept "data-before-update-…" folder. */
    sourceFolder: text("source_folder").notNull(),
    driveLabel: text("drive_label").notNull(),
    state: text("state", {
      enum: ["analysing", "ready", "merging", "completed", "stopped", "failed", "discarded"],
    }).notNull(),
    baseline: text("baseline", { enum: ["recorded", "dates", "other-library"] }),
    analysis: json<Record<string, unknown>>("analysis"),
    choices: json<Record<string, unknown>>("choices"),
    error: text("error"),
    createdAt: createdAt(),
    completedAt: integer("completed_at"),
    undoneAt: integer("undone_at"),
  },
  (table) => [index("drive_merges_drive_idx").on(table.driveId, table.driveWrittenAt)],
);

/**
 * Everything a merge did, one row per thing, written in the same transaction as the
 * change it describes. It is the record shown to the person, what "undo" works from
 * (`undo` holds what was there before), and how a later merge of the same drive knows
 * what has been dealt with already (`driveHash` is the drive's version that was).
 */
export const driveMergeActions = sqliteTable(
  "drive_merge_actions",
  {
    mergeId: text("merge_id")
      .notNull()
      .references(() => driveMerges.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** The item of the preview this row answers; a stopped merge that carries on skips what it has done. */
    itemKey: text("item_key"),
    kind: text("kind", { enum: ["page", "document", "place", "track", "collection", "attachment"] }).notNull(),
    outcome: text("outcome", {
      enum: ["added", "updated", "copied", "trashed", "removed", "moved", "kept", "already", "skipped", "failed"],
    }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull().default(""),
    driveItemId: text("drive_item_id"),
    homeItemId: text("home_item_id"),
    /** The drive's version this decision was about; "deleted" when it was gone from the drive. */
    driveHash: text("drive_hash"),
    /** The home item right after the change; null when the two sides were left to differ. */
    homeHash: text("home_hash"),
    /** What is needed to put things back: the page as it was, the place that was removed. */
    undo: json<Record<string, unknown>>("undo"),
    undoneAt: integer("undone_at"),
    undoMessage: text("undo_message"),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.mergeId, table.seq] }), index("drive_merge_actions_item_idx").on(table.kind, table.driveItemId)],
);

// ── Chat ────────────────────────────────────────────────────────────────────

/**
 * Conversations with a language model the person runs themselves. Kept here so that a
 * conversation is on every device; with no accounts, that also means everyone who can
 * open this Outpost can read them.
 */
export const chatConversations = sqliteTable(
  "chat_conversations",
  {
    id: id(),
    title: text("title").notNull().default(""),
    /** A person named it, so it is no longer named after its first message. */
    titleSet: integer("title_set", { mode: "boolean" }).notNull().default(false),
    /** The model's name as the model server knows it. Empty: the one chosen in Settings. */
    model: text("model").notNull().default(""),
    useLibrary: integer("use_library", { mode: "boolean" }).notNull().default(false),
    /** The one document or note this conversation is about, when it was started from one. */
    scopeKind: text("scope_kind", { enum: ["document", "note"] }),
    scopeEntityId: text("scope_entity_id"),
    scopeTitle: text("scope_title"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("chat_conversations_updated_idx").on(table.updatedAt)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    /** Position in the conversation, from 1. */
    seq: integer("seq").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    /** The words as typed, or as the model wrote them. Never markup that is shown as such. */
    text: text("text").notNull().default(""),
    state: text("state", { enum: ["writing", "complete", "cut-short", "stopped", "failed", "nothing-found"] })
      .notNull()
      .default("complete"),
    failure: text("failure"),
    notice: text("notice"),
    model: text("model"),
    grounded: integer("grounded", { mode: "boolean" }).notNull().default(false),
    /** The passages the model was given for this reply, as they were sent. */
    sources: json<unknown[]>("sources"),
    searchedFor: text("searched_for"),
    /** Earlier messages that were not sent to the model for this reply. */
    omitted: integer("omitted").notNull().default(0),
    tookMs: integer("took_ms"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("chat_messages_order_idx").on(table.conversationId, table.seq)],
);

// ── Radio: repeaters ────────────────────────────────────────────────────────

/**
 * A list of repeaters brought in from a file a person chose. The file itself is not
 * kept: its rows are in `repeaters`. `dataDate` is the day the data is from, which is
 * what every screen shows; `mapping` is how the file's columns were read, offered again
 * when a newer copy of the same list is brought in.
 */
export const repeaterLists = sqliteTable("repeater_lists", {
  id: id(),
  name: text("name").notNull(),
  source: text("source").notNull().default(""),
  sourceUrl: text("source_url"),
  format: text("format").notNull(),
  mapping: json<Record<string, string>>("mapping"),
  fileName: text("file_name"),
  dataDate: integer("data_date").notNull(),
  /**
   * For a list Outpost fetched from a declared source: the source's id, the address, when,
   * and the publisher's terms as they were read then. Null for a list from a file the
   * person chose.
   */
  fetched: json<Record<string, unknown>>("fetched"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Repeaters, from lists and entered by hand (`listId` null). Frequencies are whole
 * hertz. `sourceKey` is what ties a row to its line in the list from one update to the
 * next, and `sourceRow` is what the list last said: an entry the person changed
 * (`editedAt`) or removed (`removedAt`) is recognised by them, so an update can leave it
 * alone and still tell whether the list has moved on. A removed entry of a list stays as
 * a row, so that the next update does not bring it back. An entry that is the same
 * repeater as another is set aside the same way, with `mergedInto` naming the entry that
 * is shown in its place; it comes back if that entry goes. See modules/repeaters.
 */
export const repeaters = sqliteTable(
  "repeaters",
  {
    id: id(),
    listId: text("list_id").references(() => repeaterLists.id, { onDelete: "cascade" }),
    sourceKey: text("source_key"),
    callsign: text("callsign").notNull(),
    outputHz: integer("output_hz").notNull(),
    inputHz: integer("input_hz"),
    band: text("band").notNull(),
    /** Mode ids between commas (",fm,dmr,"), so one can be found with LIKE. */
    modes: text("modes").notNull().default(","),
    ctcssHz: real("ctcss_hz"),
    dcsCode: text("dcs_code"),
    dmrColourCode: integer("dmr_colour_code"),
    talkgroups: text("talkgroups").notNull().default(""),
    accessNote: text("access_note").notNull().default(""),
    channel: text("channel").notNull().default(""),
    place: text("place").notNull().default(""),
    region: text("region").notNull().default(""),
    country: text("country").notNull().default(""),
    lat: real("lat"),
    lon: real("lon"),
    locator: text("locator").notNull().default(""),
    positionPrecisionM: integer("position_precision_m"),
    antennaM: real("antenna_m"),
    keeper: text("keeper").notNull().default(""),
    status: text("status").notNull().default("unknown"),
    statusText: text("status_text").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** Lower-case words of the callsign, place, region, keeper, channel and locator, for finding by typing. */
    searchText: text("search_text").notNull().default(""),
    sourceRow: json<Record<string, unknown>>("source_row"),
    editedAt: integer("edited_at"),
    removedAt: integer("removed_at"),
    /** The entry shown in place of this one. Set only with `removedAt`. Not a foreign key: the entry it names may go first. */
    mergedInto: text("merged_into"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("repeaters_list_idx").on(table.listId, table.sourceKey),
    index("repeaters_merged_idx").on(table.mergedInto),
    // Everything the map and a sort by distance read, so that neither has to visit the rows themselves.
    index("repeaters_position_idx").on(table.lat, table.lon, table.removedAt, table.id),
    index("repeaters_output_idx").on(table.outputHz),
    // In the order the list is shown in, whatever case a callsign was typed in.
    index("repeaters_callsign_idx").on(sql`${table.callsign} COLLATE NOCASE`),
    // All that the search across everything looks at, so that it reads this and not the rows: it is asked on every search.
    index("repeaters_search_idx").on(table.searchText, table.removedAt, table.outputHz, table.inputHz, table.id),
  ],
);

// ── HF propagation ──────────────────────────────────────────────────────────

/** A transmitter a person owns: what a prediction needs to know about it, and their notes. */
export const radioProfiles = sqliteTable("radio_profiles", {
  id: id(),
  name: text("name").notNull(),
  model: text("model").notNull().default(""),
  powerWatts: real("power_watts").notNull(),
  minMhz: real("min_mhz").notNull(),
  maxMhz: real("max_mhz").notNull(),
  modes: json<string[]>("modes").notNull(),
  receiver: text("receiver").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** An antenna as it is put up: which of the engine's models stands for it, and how. */
export const antennaProfiles = sqliteTable("antenna_profiles", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: [
      "isotropic",
      "horizontal-dipole",
      "inverted-v",
      "end-fed-half-wave",
      "end-fed-horizontal",
      "end-fed-vertical",
      "vertical-monopole",
      "end-fed-sloping",
    ],
  }).notNull(),
  heightM: real("height_m").notNull().default(0),
  /** Length of the wire in metres, for an end-fed wire of a stated length; null for every other kind. */
  lengthM: real("length_m"),
  ground: text("ground", { enum: ["poor", "average", "good", "sea"] })
    .notNull()
    .default("average"),
  /** Compass bearing the broadside faces; null turns it towards the other station. */
  broadsideDeg: real("broadside_deg"),
  /** A sloping wire's angle above the horizontal, in degrees; null for every other kind. */
  slopeDeg: real("slope_deg"),
  /** A sloping wire's bearing from its low end towards its high end; null turns its low end towards the other station. */
  highEndDeg: real("high_end_deg"),
  gainDb: real("gain_db").notNull().default(0),
  feedlineLossDb: real("feedline_loss_db").notNull().default(0),
  minMhz: real("min_mhz").notNull(),
  maxMhz: real("max_mhz").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Answers already worked out, by a key made from the question, the engine and the data
 * it read. The same key always means the same answer, so a row is never updated, only
 * read again or dropped when the table is trimmed. `kind` says what was asked: a path
 * between two points today; a coverage grid or one pair of a communication plan later.
 */
export const propagationResults = sqliteTable(
  "propagation_results",
  {
    key: text("key").primaryKey(),
    kind: text("kind", { enum: ["point", "compare", "coverage", "plan"] }).notNull(),
    engine: text("engine").notNull(),
    request: json<Record<string, unknown>>("request").notNull(),
    result: json<Record<string, unknown>>("result").notNull(),
    createdAt: createdAt(),
    lastUsedAt: integer("last_used_at").notNull(),
  },
  (table) => [index("propagation_results_used_idx").on(table.lastUsedAt)],
);

/** A question a person chose to keep, by name. The answer is worked out again when it is opened. */
export const propagationSaved = sqliteTable("propagation_saved", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["point", "coverage"] })
    .notNull()
    .default("point"),
  request: json<Record<string, unknown>>("request").notNull(),
  /** The key of the answer it was saved with, so a changed answer can be noticed. */
  resultKey: text("result_key"),
  noteId: text("note_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A communication plan: several stations (places with their equipment), the hours and
 * bands of interest, and what the plan is for. The matrix worked out for it is an
 * answer like any other (`propagation_results`, by `resultKey`); the plan itself is the
 * person's own.
 */
export const communicationPlans = sqliteTable("communication_plans", {
  id: id(),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  /** The stations, as `PlanStation[]`. */
  stations: json<Array<Record<string, unknown>>>("stations").notNull(),
  /** The day planned for, YYYY-MM-DD (UTC). */
  date: text("date").notNull(),
  /** The hours of interest, UTC, 1 to 24; a window may run past midnight. */
  fromUtc: integer("from_utc").notNull(),
  toUtc: integer("to_utc").notNull(),
  bands: json<string[]>("bands").notNull(),
  mode: text("mode").notNull(),
  requiredSnrDb: real("required_snr_db"),
  referenceBandwidthHz: real("reference_bandwidth_hz"),
  solar: json<Record<string, unknown>>("solar").notNull(),
  /** Notes and documents the plan points at, as `PlanLink[]`. */
  links: json<Array<Record<string, unknown>>>("links").notNull(),
  /** The key of the matrix last worked out for the plan as it stands. */
  resultKey: text("result_key"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One file of logged contacts brought in, with what was and was not read from it. */
export const observationImports = sqliteTable("observation_imports", {
  id: id(),
  fileName: text("file_name").notNull(),
  /** What the file's header says of itself. */
  adifVersion: text("adif_version").notNull().default(""),
  program: text("program").notNull().default(""),
  records: integer("records").notNull(),
  imported: integer("imported").notNull(),
  duplicates: integer("duplicates").notNull(),
  /** Records not brought in by reason, and things read with a loss, as `{ skipped, notes }` of `{ reason, count }[]`. */
  skipped: json<Record<string, unknown>>("skipped").notNull(),
  createdAt: createdAt(),
});

/**
 * What actually happened on the air: a contact made, a station heard, or an attempt
 * that failed. An end's position is only ever what the person or their log stated; an
 * end with no stated position has none, and is left out of any comparison.
 */
export const radioObservations = sqliteTable(
  "radio_observations",
  {
    id: id(),
    /** When, UTC, in milliseconds. */
    at: integer("at").notNull(),
    frequencyMhz: real("frequency_mhz"),
    band: text("band").notNull().default(""),
    /** The mode as it was logged ("SSB", "FT8", "MFSK/JS8"). */
    mode: text("mode").notNull().default(""),
    outcome: text("outcome", { enum: ["contact", "heard", "failed"] }).notNull(),
    txCall: text("tx_call").notNull().default(""),
    txLat: real("tx_lat"),
    txLon: real("tx_lon"),
    /** Where the position came from: a locator as logged, "coordinates", or "" for none. */
    txFrom: text("tx_from").notNull().default(""),
    rxCall: text("rx_call").notNull().default(""),
    rxLat: real("rx_lat"),
    rxLon: real("rx_lon"),
    rxFrom: text("rx_from").notNull().default(""),
    powerWatts: real("power_watts"),
    antenna: text("antenna").notNull().default(""),
    reportSent: text("report_sent").notNull().default(""),
    reportReceived: text("report_received").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** How the signal travelled, when the log says (ADIF's PROP_MODE: "F2", "SAT", "RPT"…); "" when it does not. */
    propMode: text("prop_mode").notNull().default(""),
    source: text("source", { enum: ["manual", "adif"] }).notNull(),
    importId: text("import_id").references(() => observationImports.id, { onDelete: "cascade" }),
    /** The same contact brought in twice has the same value here; see `observations.ts`. */
    sameAs: text("same_as").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("radio_observations_at_idx").on(table.at),
    uniqueIndex("radio_observations_same_idx").on(table.sameAs),
    index("radio_observations_import_idx").on(table.importId),
  ],
);

// ── Power plans (Tools → Power and batteries) ───────────────────────────────

/** A battery bank, its loads and its charging, as a person typed them (`PowerPlanInput` without the name and notes). */
export const powerPlans = sqliteTable("power_plans", {
  id: id(),
  /** The household it is for, or null for a plan shared by every household. */
  householdId: text("household_id"),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  system: json<Record<string, unknown>>("system").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A person's own devices for the battery calculators: a name, its figure, and where the figure came from. */
export const powerDevices = sqliteTable("power_devices", {
  id: id(),
  name: text("name").notNull(),
  /** "run", "charge" or "radio". */
  kind: text("kind").notNull(),
  /** "dc", "usb" or "ac". */
  supply: text("supply").notNull(),
  watts: real("watts"),
  wattHours: real("watt_hours"),
  receiveW: real("receive_w"),
  transmitW: real("transmit_w"),
  standbyW: real("standby_w"),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Morse trainer (Radio) ───────────────────────────────────────────────────

/**
 * The Morse trainer's progress: one row for the whole copy (there are no accounts), with
 * the Koch lesson reached, the best receive speeds, and the trainer's settings as each
 * browser last sent them (`MorseSettings`).
 */
export const morseProgress = sqliteTable("morse_progress", {
  /** Always "household": there is one. */
  id: id(),
  kochLesson: integer("koch_lesson").notNull().default(1),
  bestCharWpm: real("best_char_wpm"),
  bestEffWpm: real("best_eff_wpm"),
  settings: json<Record<string, unknown>>("settings").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One finished drill or exercise of the Morse trainer: receive, send, a simulated contact or an echo reply. */
export const morseSessions = sqliteTable(
  "morse_sessions",
  {
    id: id(),
    /** "receive", "send", "qso" or "echo". */
    kind: text("kind").notNull(),
    /** When it finished, milliseconds. */
    at: integer("at").notNull(),
    accuracy: real("accuracy").notNull(),
    charWpm: real("char_wpm"),
    effWpm: real("eff_wpm"),
    rhythm: real("rhythm"),
    lesson: integer("lesson"),
    /** Character → times missed. */
    misses: json<Record<string, number>>("misses").notNull(),
    /** Character → times it was in the drill. */
    tries: json<Record<string, number>>("tries").notNull(),
  },
  (table) => [index("morse_sessions_at_idx").on(table.at)],
);

// ── Supplies (Preparedness) ─────────────────────────────────────────────────

/**
 * Stored supplies: food, water and the rest, one row to a batch (the same tins bought on
 * another day, with another date, are another row). Quantities are of `unit`; dates are
 * calendar days as the label prints them ("2027-03-31"), with what kind of date it is.
 */
export const supplyItems = sqliteTable(
  "supply_items",
  {
    id: id(),
    /** The household it is for (`households.id`; the first is "household"). Not a foreign key. */
    householdId: text("household_id").notNull().default("household"),
    name: text("name").notNull(),
    category: text("category").notNull(),
    quantity: real("quantity").notNull().default(0),
    unit: text("unit").notNull().default(""),
    location: text("location").notNull().default(""),
    /** "use-by" (safety) or "best-before" (quality); null with no date. */
    dateKind: text("date_kind"),
    date: text("date"),
    /** Energy of one unit, as the label gives it per pack, or per 100 g with the weight of a unit. */
    kcalPerUnit: real("kcal_per_unit"),
    kcalPer100g: real("kcal_per_100g"),
    gramsPerUnit: real("grams_per_unit"),
    /** For water: litres in one unit. */
    litresPerUnit: real("litres_per_unit"),
    /** Fewer than this of the product, and it goes on the shopping list. */
    minimum: real("minimum"),
    /** As scanned or typed; `barcodeKey` is the form it is matched by (a GTIN as 14 digits). */
    barcode: text("barcode"),
    barcodeKey: text("barcode_key"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("supply_items_barcode_idx").on(table.barcodeKey), index("supply_items_date_idx").on(table.date)],
);

/** Barcodes the inventory has been told about, kept after the last of the product is used up or removed. */
export const supplyProducts = sqliteTable("supply_products", {
  barcodeKey: text("barcode_key").primaryKey(),
  barcode: text("barcode").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull().default(""),
  kcalPerUnit: real("kcal_per_unit"),
  kcalPer100g: real("kcal_per_100g"),
  gramsPerUnit: real("grams_per_unit"),
  litresPerUnit: real("litres_per_unit"),
  updatedAt: updatedAt(),
});

/** Who the supplies are for, and how long they should last. One row, id "household". */
export const supplyHousehold = sqliteTable("supply_household", {
  id: id(),
  daysWanted: integer("days_wanted").notNull(),
  drinkingLitres: real("drinking_litres").notNull(),
  allUsesLitres: real("all_uses_litres").notNull(),
  /** Which of the two water figures the days and the shopping list are worked to. */
  waterBasis: text("water_basis").notNull(),
  /** The energy table chosen ("uk", "international"); null to take it from Home's country. */
  energyTable: text("energy_table"),
  /** When the shopping list was last worked out, and when anything it is worked from last changed. */
  shoppingWorkedAt: integer("shopping_worked_at"),
  stockChangedAt: integer("stock_changed_at").notNull(),
  updatedAt: updatedAt(),
});

export const supplyMembers = sqliteTable("supply_members", {
  id: id(),
  position: integer("position").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull().default(""),
  /** An age band of the planning table, for a person. */
  band: text("band"),
  sex: text("sex"),
  /** A stated need, in place of the table's. */
  kcalPerDay: real("kcal_per_day"),
  drinkingLitres: real("drinking_litres"),
  allUsesLitres: real("all_uses_litres"),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Households (modules/households) ─────────────────────────────────────────

/**
 * The households Outpost keeps things for: one's own home, the family's, a caravan. The
 * first is id "household", which is what every table keyed by household held before
 * there were several (docs/development/households.md). Which one is current is the
 * setting row "households.current".
 */
export const households = sqliteTable("households", {
  id: id(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  /** "fixed": home is a saved place. "portable": home is where it is now (`here_*`). */
  kind: text("kind").notNull().default("fixed"),
  /** A fixed household's home: a saved place (`markers.id`). Not a foreign key: a place removed leaves no home. */
  homeMarkerId: text("home_marker_id"),
  /** A portable household's base (where the caravan is kept): shown, never taken as home. */
  baseMarkerId: text("base_marker_id"),
  /** A country the person chose (ISO 3166-1 alpha-2), in place of the one home is in. */
  country: text("country"),
  /** A fixed household's address in its own words, as a stranger would read it on a grab card; empty when not given. */
  address: text("address").notNull().default(""),
  /** A portable household's position, as a person last set it. */
  hereLat: real("here_lat"),
  hereLon: real("here_lon"),
  hereName: text("here_name"),
  hereAt: integer("here_at"),
  /** "device", "map" or "place". */
  hereSource: text("here_source"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Who is in each household, in order. A person (supply_members) may be in several; their needs are on the person. */
export const householdPeople = sqliteTable(
  "household_people",
  {
    householdId: text("household_id").notNull(),
    personId: text("person_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.personId] }), index("household_people_person").on(table.personId)],
);

/** Where a portable household has been, newest kept: the last 50 a household. */
export const householdPositions = sqliteTable(
  "household_positions",
  {
    id: id(),
    householdId: text("household_id").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    name: text("name"),
    at: integer("at").notNull(),
    source: text("source").notNull(),
  },
  (table) => [index("household_positions_household_at").on(table.householdId, table.at)],
);

/** The shopping list: lines worked out from the stock, and lines a person added. */
export const supplyShopping = sqliteTable("supply_shopping", {
  id: id(),
  /** The household it is for (`households.id`; the first is "household"). Not a foreign key. */
  householdId: text("household_id").notNull().default("household"),
  position: integer("position").notNull(),
  source: text("source").notNull(),
  /** The stock row the line buys more of, when there is one. */
  itemId: text("item_id"),
  name: text("name").notNull(),
  quantity: real("quantity"),
  unit: text("unit").notNull().default(""),
  reasons: json<string[]>("reasons").notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
// ── Reference layers (modules/layers) ───────────────────────────────────────

/**
 * Features of the reference layers on the map: publicly mapped infrastructure, places and
 * boundaries from published datasets, and documented historical records. Every row keeps
 * where it came from, when, how exactly it is placed and under what licence. Rows belong
 * to the collection (a downloaded or imported pack) they were read from. A spatial index
 * (`reference_features_rtree`) and a full-text index (`reference_features_fts`) are kept
 * by triggers written by hand in the migration.
 */
export const referenceFeatures = sqliteTable(
  "reference_features",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The collection of the pack, or "pending:<download id>" while one is being installed. */
    collectionId: text("collection_id").notNull(),
    /** The adapter that read it: "natural-earth", "ourairports", "osm", "wikidata", "import". */
    provider: text("provider").notNull(),
    /** The record's own id at its source ("node/123", "Q12345", an airport's ident). */
    sourceId: text("source_id").notNull(),
    layer: text("layer").notNull(),
    /** What it is within the layer, in the source's own terms ("military=airfield", "large_airport"). */
    kind: text("kind").notNull().default(""),
    name: text("name").notNull().default(""),
    altNames: text("alt_names").notNull().default(""),
    /** ISO 3166-1 alpha-2, upper case, when known. */
    country: text("country"),
    /** A representative point in WGS 84. Null for a historical record whose place is not documented. */
    lat: real("lat"),
    lon: real("lon"),
    minLon: real("min_lon"),
    minLat: real("min_lat"),
    maxLon: real("max_lon"),
    maxLat: real("max_lat"),
    /** GeoJSON geometry, for an area or a line; null for a point. */
    geometry: json<Record<string, unknown>>("geometry"),
    /** The source's own fields that are kept, as text. */
    props: json<Record<string, string>>("props").notNull(),
    provenance: text("provenance", { enum: ["public-infrastructure", "historical", "user", "unverified"] }).notNull(),
    /** How exactly it is placed, in words, and in metres where that can be said. */
    accuracy: text("accuracy").notNull(),
    accuracyMeters: real("accuracy_m"),
    publisher: text("publisher").notNull(),
    license: text("license").notNull(),
    sourceUrl: text("source_url"),
    /** The date the publisher gives the data, as they write it (a version date, a data timestamp). */
    publishedAt: text("published_at"),
    retrievedAt: integer("retrieved_at").notNull(),
    /** Set when another record describes the same thing: this one is kept for its provenance and not drawn twice. */
    duplicateOf: integer("duplicate_of"),
  },
  (table) => [
    index("reference_features_collection_idx").on(table.collectionId),
    index("reference_features_layer_idx").on(table.layer, table.country),
    index("reference_features_source_idx").on(table.provider, table.sourceId),
    index("reference_features_duplicate_idx").on(table.duplicateOf),
  ],
);

/**
 * What a historical record says beyond its place: one row for each feature in the
 * "historical" layer. `recordType` keeps apart an actual historical target list, a
 * historical assessment of likely targets and an author's speculation; it is required.
 */
export const historicalRecords = sqliteTable("historical_records", {
  featureId: integer("feature_id")
    .primaryKey()
    .references(() => referenceFeatures.id, { onDelete: "cascade" }),
  recordType: text("record_type", { enum: ["target-list", "assessment", "speculation"] }).notNull(),
  /** "1956", "1959–1962": as the source dates what it describes. */
  period: text("period").notNull(),
  locationText: text("location_text").notNull().default(""),
  documentTitle: text("document_title").notNull(),
  documentPublisher: text("document_publisher").notNull().default(""),
  documentDate: text("document_date").notNull().default(""),
  /** The archive's reference for the document (a record group, a file number, a briefing book number). */
  archiveRef: text("archive_ref").notNull().default(""),
  /** The document's original classification or archival context, as the archive gives it. */
  classification: text("classification").notNull().default(""),
  targetCategory: text("target_category").notNull().default(""),
  evidenceQuality: text("evidence_quality").notNull(),
  geographicPrecision: text("geographic_precision").notNull(),
  citations: json<string[]>("citations").notNull(),
  documentUrl: text("document_url"),
  /** A document in the library that is the source, when the person has it there. */
  libraryDocumentId: text("library_document_id"),
  notes: text("notes").notNull().default(""),
});

/**
 * Country-level figures from published reports, entered or imported by a person, each
 * with its citation. Facts about countries only: nothing finer than the source gives.
 */
export const countryFigures = sqliteTable(
  "country_figures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    collectionId: text("collection_id").notNull(),
    country: text("country").notNull(),
    indicator: text("indicator").notNull(),
    value: real("value"),
    valueText: text("value_text").notNull().default(""),
    unit: text("unit").notNull().default(""),
    /** The year the figure is for. */
    year: text("year").notNull().default(""),
    sourceTitle: text("source_title").notNull(),
    publisher: text("publisher").notNull(),
    publishedAt: text("published_at").notNull().default(""),
    url: text("url"),
    page: text("page").notNull().default(""),
    license: text("license").notNull().default(""),
    notes: text("notes").notNull().default(""),
    retrievedAt: integer("retrieved_at").notNull(),
  },
  (table) => [index("country_figures_country_idx").on(table.country), index("country_figures_collection_idx").on(table.collectionId)],
);

// ── Weather and hazards (Preparedness) ────────────────────────────────────────

/**
 * The places a person chose to keep forecasts and warnings for: copies of saved places
 * (`markerId` says which, while it exists), so that the cache stays readable if the
 * saved place is moved or removed. `region` is the Met Office warnings region the
 * person chose for it. See modules/weather.
 */
export const weatherPlaces = sqliteTable("weather_places", {
  id: id(),
  markerId: text("marker_id"),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  region: text("region"),
  position: integer("position").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * What was fetched, one row for each kind of thing and place: the latest copy only. The
 * publisher's figures and words are in `data`, as read; `bytes` is what arrived; `sent`
 * says what was sent to get it.
 */
export const weatherCache = sqliteTable(
  "weather_cache",
  {
    id: id(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    /** "" for something that is not for one place (the UK's warnings). */
    placeId: text("place_id").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
    validFrom: integer("valid_from"),
    validUntil: integer("valid_until"),
    bytes: integer("bytes").notNull(),
    sent: text("sent").notNull(),
    data: json<unknown>("data").notNull(),
  },
  (table) => [uniqueIndex("weather_cache_kind_place_idx").on(table.kind, table.placeId)],
);

/** Barometer readings a person typed or brought in from a file. */
export const weatherReadings = sqliteTable(
  "weather_readings",
  {
    id: id(),
    takenAt: integer("taken_at").notNull(),
    /** As given, with its unit ("hPa" or "inHg"). */
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    /** The pressure where it was read, in hPa. */
    stationHpa: real("station_hpa").notNull(),
    /** Height above sea level of the barometer, metres. */
    heightM: real("height_m").notNull(),
    /** Reduced to sea level by the formula in @outpost/shared weather.ts. */
    seaLevelHpa: real("sea_level_hpa").notNull(),
    note: text("note").notNull().default(""),
    /** The point of the compass the wind was blowing from when the reading was taken ("SW"), or null when not given. */
    windFrom: text("wind_from"),
    origin: text("origin").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("weather_readings_taken_idx").on(table.takenAt)],
);

// ── Emergency plans (Preparedness) ──────────────────────────────────────────

/**
 * A household's emergency plan. What the person writes is `body` (steps, people,
 * contacts, places, supplies, where things are, links), as `PlanBody`; the plan in use
 * (when it was started and when each step was ticked) is `use`, kept apart so that a
 * tick never overwrites an edit made on another device, nor an edit a tick.
 */
export const emergencyPlans = sqliteTable("emergency_plans", {
  id: id(),
  /** The household it is for (`households.id`; the first is "household"). Not a foreign key. */
  householdId: text("household_id").notNull().default("household"),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  kindText: text("kind_text").notNull().default(""),
  templateId: text("template_id"),
  emergencyNumber: text("emergency_number").notNull().default("112"),
  reviewEveryDays: integer("review_every_days"),
  body: json<Record<string, unknown>>("body").notNull(),
  use: json<Record<string, unknown>>("use").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
  openedAt: integer("opened_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A person's medical sheet (Preparedness → Medical sheets): what they typed for whoever
 * has to be told. Either `record` (the `MedicalRecord`) or `armor` (one armoured OpenPGP
 * message, encrypted in the browser) is set, never both; the name is plain either way.
 */
export const medicalSheets = sqliteTable("medical_sheets", {
  id: id(),
  /** The household member (supply_members) it is for, or null. Not a foreign key: a member taken out leaves the sheet. */
  memberId: text("member_id"),
  /** For a sheet not linked to a person: the household it belongs to, or null. A linked sheet goes with its person. */
  householdId: text("household_id"),
  name: text("name").notNull(),
  record: json<Record<string, unknown>>("record"),
  armor: text("armor"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The household's communication plan (Preparedness → Keeping in touch): one row, id "household". */
export const commsPlans = sqliteTable("comms_plans", {
  id: id(),
  body: json<Record<string, unknown>>("body").notNull(),
  updatedAt: updatedAt(),
});

/** The household binder last made (Preparedness → Household binder): one row, id "household". */
export const householdBinder = sqliteTable("household_binder", {
  id: id(),
  parts: json<string[]>("parts").notNull(),
  /** When the newest thing in it had last changed. */
  contentAt: integer("content_at").notNull(),
  madeAt: integer("made_at").notNull(),
  pages: integer("pages").notNull(),
  /** What each part was made from (household-papers/fingerprints.ts); null for a binder made before these were kept. */
  fingerprints: json<Record<string, string>>("fingerprints"),
});

/**
 * The household book (Preparedness): the wizard's answers, kept as a draft, and the
 * record of the last book made with the summary the next one compares itself with. One
 * row, id "household".
 */
export const householdBook = sqliteTable("household_book", {
  id: id(),
  answers: json<unknown>("answers").notNull(),
  answersAt: integer("answers_at"),
  made: json<unknown>("made"),
});

export const nowMs = sql`(unixepoch('subsec') * 1000)`;

/**
 * A scenario saved in the nuclear effects simulator (Preparedness → Nuclear
 * preparedness): only what the person typed. The effects are worked out again from it
 * whenever it is opened, so it always shows what the current model says.
 */
export const nuclearScenarios = sqliteTable("nuclear_scenarios", {
  id: id(),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  /** The simulator's input, as `EffectsInput`: yield, burst height and wind. */
  effects: json<Record<string, unknown>>("effects").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A set of scenarios kept together, as they were on the nuclear preparedness map at once
 * (at most six). Each member is only what the person typed, as for a single scenario;
 * the set holds its own copies, so deleting a saved single scenario leaves it whole.
 * Nothing about the set as a whole is worked out or kept: no total of any kind.
 */
export const nuclearScenarioSets = sqliteTable("nuclear_scenario_sets", {
  id: id(),
  name: text("name").notNull(),
  /** `NuclearSetMember[]`: each member's name, notes, ground zero, `EffectsInput` and whether it was hidden. */
  members: json<Array<Record<string, unknown>>>("members").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Devices on this network ─────────────────────────────────────────────────

/**
 * What answered when the person scanned the networks this computer is on, and the name
 * and note they gave each device. Device names can be people's names ("Anna's
 * iPhone"): this is shown on the Devices screen only, never put in search, and erased
 * with everything else.
 */
export const networkDevices = sqliteTable(
  "network_devices",
  {
    id: id(),
    /** "mac:a0:b1:c2:d3:e4:f5" when the hardware address is known, else "ip:192.168.1.20". */
    key: text("key").notNull(),
    mac: text("mac"),
    addresses: json<string[]>("addresses").notNull(),
    /** The name it gave itself, as last seen. */
    name: text("name").notNull().default(""),
    /** What it announces, as `NetworkAdvert[]`. */
    services: json<Array<Record<string, unknown>>>("services").notNull(),
    /** Ports of the fixed list that accepted a connection when it was last found. */
    openPorts: json<number[]>("open_ports").notNull(),
    isSelf: integer("is_self", { mode: "boolean" }).notNull().default(false),
    isRouter: integer("is_router", { mode: "boolean" }).notNull().default(false),
    /** The person's own name for it, and their note. */
    label: text("label").notNull().default(""),
    note: text("note").notNull().default(""),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("network_devices_key").on(table.key)],
);

/** Each scan that finished: when, what was looked at, and what it found and sent. The last twenty are kept. */
export const networkScans = sqliteTable("network_scans", {
  id: id(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at").notNull(),
  subnets: json<string[]>("subnets").notNull(),
  found: integer("found").notNull(),
  named: integer("named").notNull(),
  packets: integer("packets").notNull(),
  newDevices: integer("new_devices").notNull(),
  goneDevices: integer("gone_devices").notNull(),
});

// ── Games ───────────────────────────────────────────────────────────────────

/**
 * What the games keep for the household (there are no accounts): one row per game. The
 * allotment's row holds its whole plot; each other game's holds its tally of games
 * played and won. An unfinished game of cards, Sudoku, draughts or pairs is not here: it
 * stays on the device it is being played on.
 */
export const gameSaves = sqliteTable("game_saves", {
  /** The game's id: "allotment", "solitaire", "peg-solitaire", "sudoku", "draughts", "chess", "pairs" or "snake". */
  id: id(),
  state: json<Record<string, unknown>>("state").notNull(),
  /** Goes up by one each time the row is written, so that two writes at once cannot both win. */
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── The household board (Messages) ─────────────────────────────────────────

/**
 * A file sent on the board, to be saved on another device. Its bytes are in the data
 * directory at `board/<aa>/<id>/<name>`. When it is removed or its days are up the bytes
 * go and the row stays, with `gone_at`, so that the message that carried it can say so.
 */
export const boardFiles = sqliteTable(
  "board_files",
  {
    id: id(),
    /** The name as sent, made safe for a file system. */
    filename: text("filename").notNull(),
    /** The type served with it: always one a browser downloads and never runs. */
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Relative to the data directory's `board` folder. */
    relPath: text("rel_path").notNull(),
    createdAt: createdAt(),
    /** When it is removed by itself; null keeps it until someone removes it. */
    expiresAt: integer("expires_at"),
    /** When its bytes went, and why: "expired" or "removed". */
    goneAt: integer("gone_at"),
    goneReason: text("gone_reason", { enum: ["expired", "removed"] }),
  },
  (table) => [index("board_files_expires").on(table.expiresAt)],
);

/**
 * One message on a channel: the household's own board ("board"), or, later, a channel a
 * transport (a radio link) carries. A check-in is a message with a status. Removing one
 * keeps the row with who removed it and when, and empties its words.
 */
export const boardMessages = sqliteTable(
  "board_messages",
  {
    id: id(),
    /** "board" for the household's board; a transport names its own ("meshtastic:LongFast"). */
    channel: text("channel").notNull(),
    /** Where it was written: "here" (a device on this Outpost), or the name of the transport it came in by. */
    source: text("source").notNull(),
    /** The transport's own id for it, so that one heard twice is kept once. Null for one written here. */
    externalId: text("external_id"),
    kind: text("kind", { enum: ["message", "checkin"] }).notNull(),
    /** The name the person chose on their device. Not proof of anything. */
    author: text("author").notNull(),
    body: text("body").notNull(),
    /** A check-in's status. */
    status: text("status", { enum: ["safe", "help", "other"] }),
    /** Where they are, in their own words: "gone to Mum's". */
    place: text("place"),
    lat: real("lat"),
    lon: real("lon"),
    accuracyM: real("accuracy_m"),
    fileId: text("file_id").references(() => boardFiles.id, { onDelete: "set null" }),
    /** What a transport knows about it that the board does not use (a node id, a signal report). */
    meta: json<Record<string, unknown>>("meta"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: integer("edited_at"),
    editedBy: text("edited_by"),
    removedAt: integer("removed_at"),
    removedBy: text("removed_by"),
    /** When it reached the server, for one written on a phone out of reach and sent later (`createdAt` is when it was written). Null otherwise. */
    sentAt: integer("sent_at"),
  },
  (table) => [
    index("board_messages_channel_created").on(table.channel, table.createdAt),
    index("board_messages_author_kind").on(table.kind, table.author),
    uniqueIndex("board_messages_external").on(table.source, table.externalId),
  ],
);
// ── Learning progress (the reader) ──────────────────────────────────────────

/**
 * Where each learner got to in a reference archive: one row per learner, archive and
 * page. A learner is a name chosen on a device, or "" for someone who chose "Just me";
 * it is not an account and proves nothing about who was holding the device. `archive`
 * is the archive's own name without its date (`khanacademy_en_all`), so that progress
 * outlives updating the archive to a newer edition. See docs/learning.md.
 */
export const learningPages = sqliteTable(
  "learning_pages",
  {
    id: id(),
    learner: text("learner").notNull(),
    archive: text("archive").notNull(),
    /** The archive's title when this page was last recorded, for when it is no longer installed. */
    archiveTitle: text("archive_title").notNull(),
    /** The page's address inside the archive, as the reader's address shows it. */
    path: text("path").notNull(),
    title: text("title").notNull().default(""),
    firstOpenedAt: integer("first_opened_at").notNull(),
    lastOpenedAt: integer("last_opened_at").notNull(),
    /** Seconds the page was on show while the reader's tab was visible, in all. */
    secondsInView: integer("seconds_in_view").notNull().default(0),
    /** When the learner marked it done, or its video was played through; null when not done. */
    doneAt: integer("done_at"),
    /** "marked" (pressed Done) or "watched" (its video played to the end). */
    doneHow: text("done_how"),
    /** The last time anything was recorded for it: "where they got to" is the newest. */
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("learning_pages_page_idx").on(table.learner, table.archive, table.path),
    index("learning_pages_recent_idx").on(table.learner, table.archive, table.updatedAt),
  ],
);

/** Time in view by day, for "about 2 hours this week": one row per learner, archive and day. */
export const learningDays = sqliteTable(
  "learning_days",
  {
    learner: text("learner").notNull(),
    archive: text("archive").notNull(),
    /** The server's own calendar day, "2026-11-17". */
    day: text("day").notNull(),
    seconds: integer("seconds").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.learner, table.archive, table.day] })],
);

/**
 * What a page of links lists: the other pages of the same archive it links to, as the
 * reader saw them when someone opened it. The same for every learner, since it is the
 * archive's shape and not anyone's progress. Used only to say "3 of 5 done in Fractions".
 */
export const learningTopics = sqliteTable(
  "learning_topics",
  {
    archive: text("archive").notNull(),
    path: text("path").notNull(),
    title: text("title").notNull().default(""),
    /** The pages it links to, inside the same archive. */
    links: json<string[]>("links").notNull(),
    /** It is the archive's first page, whose links (subjects, a menu) are left out of every other page's list. */
    isHome: integer("is_home", { mode: "boolean" }).notNull().default(false),
    seenAt: integer("seen_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.archive, table.path] })],
);

// ── Readiness (Preparedness: roll call, the log of events, routine checks, the offline drill) ──

/** Someone asked everyone to check in: the roll call counts from the latest. The message it posted is on the board. */
export const rollCalls = sqliteTable("roll_calls", {
  id: id(),
  askedBy: text("asked_by").notNull(),
  note: text("note").notNull().default(""),
  /** The board message that asked; null once that message is gone. */
  messageId: text("message_id"),
  createdAt: createdAt(),
});

/** One line of the household's log of events: what happened, when, and who wrote it down. */
export const eventLog = sqliteTable(
  "event_log",
  {
    id: id(),
    /** The household it is for (`households.id`; the first is "household"). Not a foreign key. */
    householdId: text("household_id").notNull().default("household"),
    /** When it happened, which may be a little before it was written down. */
    happenedAt: integer("happened_at").notNull(),
    author: text("author").notNull(),
    text: text("text").notNull(),
    /** The emergency plan in use when it was written, and its name then (kept if the plan goes). */
    planId: text("plan_id"),
    planName: text("plan_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: integer("edited_at"),
    editedBy: text("edited_by"),
  },
  (table) => [index("event_log_happened").on(table.happenedAt)],
);

/** A check the household does every so often (rotate the water, run the generator), and when it was last done. */
export const routineChecks = sqliteTable("routine_checks", {
  id: id(),
  /** The household it is for (`households.id`; the first is "household"). Not a foreign key. */
  householdId: text("household_id").notNull().default("household"),
  name: text("name").notNull(),
  everyDays: integer("every_days").notNull(),
  note: text("note").notNull().default(""),
  /** A screen of Outpost it belongs to ("supplies", "backup"), or null. */
  link: text("link"),
  /** The suggestion it was started from, or null for one of the household's own. */
  templateId: text("template_id"),
  lastDoneAt: integer("last_done_at"),
  lastDoneBy: text("last_done_by"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** An offline drill that was followed through: which steps worked, and what did not. */
export const offlineDrills = sqliteTable("offline_drills", {
  id: id(),
  by: text("by").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at").notNull(),
  /** Step id to "worked" or "failed". Steps not answered are left out. */
  answers: json<Record<string, "worked" | "failed">>("answers").notNull(),
  notes: text("notes").notNull().default(""),
});

/**
 * The household's record of what it sowed (Tools → Garden): one row a sowing or planting.
 * `crop_id` is a crop of the calendar (`GARDEN_CROP_IDS`) or null for something else.
 */
export const gardenSowings = sqliteTable(
  "garden_sowings",
  {
    id: id(),
    /** The household it is for (`households.id`; the first is "household"). Not a foreign key. */
    householdId: text("household_id").notNull().default("household"),
    cropId: text("crop_id"),
    name: text("name").notNull(),
    /** "2026-04-12". */
    sownOn: text("sown_on").notNull(),
    place: text("place").notNull().default(""),
    amount: text("amount").notNull().default(""),
    plantedOutOn: text("planted_out_on"),
    harvestedOn: text("harvested_on"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("garden_sowings_sown_on").on(table.sownOn)],
);

/** The garden's one setting (Tools → Garden): the household's usual last frost, "MM-DD". One row, id "household". */
export const gardenSettings = sqliteTable("garden_settings", {
  id: id(),
  lastFrost: text("last_frost"),
  updatedAt: updatedAt(),
});

/**
 * Satellite tracking (modules/satellites): orbital elements from CelesTrak, one row per
 * satellite, replaced whole by each fetch a person presses for. Passes are worked out in
 * the browser from these; the server does no orbital work.
 */
export const satelliteElements = sqliteTable("satellite_elements", {
  noradId: integer("norad_id").primaryKey(),
  name: text("name").notNull(),
  designator: text("designator"),
  /** The element set's own epoch, milliseconds: how old it is decides whether passes can be trusted. */
  epoch: integer("epoch").notNull(),
  /** The mean elements as CelesTrak publishes them (CCSDS OMM fields, from its CSV). */
  elements: json<Record<string, string | number>>("elements").notNull(),
  groups: json<string[]>("groups").notNull(),
});

/** The transmitters SatNOGS DB lists for the satellites kept above. Frequencies in Hz. */
export const satelliteTransmitters = sqliteTable(
  "satellite_transmitters",
  {
    id: text("id").primaryKey(),
    noradId: integer("norad_id").notNull(),
    description: text("description").notNull(),
    alive: integer("alive", { mode: "boolean" }).notNull(),
    status: text("status").notNull(),
    type: text("type"),
    mode: text("mode"),
    uplinkLowHz: integer("uplink_low_hz"),
    uplinkHighHz: integer("uplink_high_hz"),
    downlinkLowHz: integer("downlink_low_hz"),
    downlinkHighHz: integer("downlink_high_hz"),
    invert: integer("invert", { mode: "boolean" }).notNull().default(false),
    baud: real("baud"),
    updatedAt: text("updated_at"),
  },
  (table) => [index("satellite_transmitters_norad_idx").on(table.noradId)],
);

/** What SatNOGS DB's satellite list says of each satellite kept above, replaced whole by each fetch. */
export const satelliteAbout = sqliteTable("satellite_about", {
  noradId: integer("norad_id").primaryKey(),
  name: text("name").notNull(),
  otherNames: json<string[]>("other_names").notNull(),
  status: text("status").notNull(),
  launched: text("launched"),
  deployed: text("deployed"),
  decayed: text("decayed"),
  website: text("website"),
  operator: text("operator"),
  countries: json<string[]>("countries").notNull(),
  citation: text("citation"),
  frequencyViolator: integer("frequency_violator", { mode: "boolean" }).notNull().default(false),
  associated: json<string[]>("associated").notNull(),
});

/** A Wikipedia article's summary a person fetched for a satellite; kept until they discard it. */
export const satelliteWikipedia = sqliteTable("satellite_wikipedia", {
  noradId: integer("norad_id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  extract: text("extract").notNull(),
  /** "number", "cospar", "name", "search" or "series" (SatelliteWikipediaMatch). */
  foundBy: text("found_by").notNull(),
  searchedFor: text("searched_for").notNull(),
  /** The Wikidata item that tied the article to the satellite, or null. */
  wikidataId: text("wikidata_id"),
  /** The reference collection (a Wikipedia ZIM) it was read from, or null when read online. */
  archiveCollectionId: text("archive_collection_id"),
  archiveTitle: text("archive_title"),
  archiveDate: text("archive_date"),
  editedAt: text("edited_at"),
  fetchedAt: integer("fetched_at").notNull(),
});

/** Articles a person discarded for a satellite, so that they are not offered for it again. */
export const satelliteWikipediaDiscarded = sqliteTable(
  "satellite_wikipedia_discarded",
  {
    noradId: integer("norad_id").notNull(),
    title: text("title").notNull(),
    discardedAt: integer("discarded_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.noradId, table.title] })],
);

/** When each publisher was last fetched from, and how it went. */
export const satelliteFetches = sqliteTable("satellite_fetches", {
  source: text("source").primaryKey(),
  fetchedAt: integer("fetched_at"),
  count: integer("count").notNull().default(0),
  error: text("error"),
  triedAt: integer("tried_at"),
});

/** A decoder's network port Outpost reads from: APRS (KISS), aircraft (SBS) or ships (NMEA). Outpost never writes to it. */
export const heardReceivers = sqliteTable("heard_receivers", {
  id: id(),
  /** "aprs", "adsb" or "ais". */
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  /** "tcp": Outpost connects to the decoder; "udp": Outpost listens on the port, for datagrams from `host` only. */
  transport: text("transport").notNull().default("tcp"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Each station, aircraft or ship heard, with what was last heard of it. Kept until a person clears it. */
export const heardStations = sqliteTable(
  "heard_stations",
  {
    id: id(),
    /** "aprs", "adsb", "ais" or "mesh". */
    source: text("source").notNull(),
    /** The callsign, the aircraft's hex code, the ship's MMSI or the radio's id. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    kindWords: text("kind_words"),
    symbol: text("symbol"),
    receiverId: text("receiver_id"),
    lat: real("lat"),
    lon: real("lon"),
    altitude: real("altitude"),
    course: real("course"),
    speed: real("speed"),
    comment: text("comment"),
    direct: integer("direct", { mode: "boolean" }).notNull().default(true),
    via: text("via"),
    details: json<Record<string, unknown>>("details").notNull(),
    firstAt: integer("first_at").notNull(),
    lastAt: integer("last_at").notNull(),
    positionAt: integer("position_at"),
    reports: integer("reports").notNull().default(0),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    pinName: text("pin_name"),
  },
  (table) => [uniqueIndex("heard_stations_key_idx").on(table.source, table.key), index("heard_stations_last_idx").on(table.lastAt)],
);

/** Each position heard: a station's trail, and what the range view is drawn from. */
export const heardReports = sqliteTable(
  "heard_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stationId: text("station_id").notNull(),
    receiverId: text("receiver_id"),
    at: integer("at").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    altitude: real("altitude"),
    direct: integer("direct", { mode: "boolean" }).notNull().default(true),
    via: text("via"),
    snr: real("snr"),
    rssi: real("rssi"),
    hops: integer("hops"),
  },
  (table) => [
    index("heard_reports_station_idx").on(table.stationId, table.at),
    index("heard_reports_receiver_idx").on(table.receiverId, table.at),
    index("heard_reports_at_idx").on(table.at),
  ],
);

/** A range test kept by name (the range view): one station, one receiver, a time span. */
export const heardRangeTests = sqliteTable("heard_range_tests", {
  id: id(),
  name: text("name").notNull(),
  receiverId: text("receiver_id"),
  stationId: text("station_id"),
  fromAt: integer("from_at").notNull(),
  toAt: integer("to_at").notNull(),
  createdAt: createdAt(),
});
