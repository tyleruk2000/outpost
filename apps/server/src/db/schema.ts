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

// ── Installed content ───────────────────────────────────────────────────────

export interface CollectionMeta {
  /** Kiwix: book name used in content URLs, ZIM UUID, article count. */
  zim?: { bookName: string; uuid: string; articleCount?: number; flavour?: string };
  /** Maps: tile bounds and zooms of an extract. */
  map?: {
    bounds: [number, number, number, number];
    minZoom: number;
    maxZoom: number;
    tileType: "vector" | "terrain";
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
    kind: text("kind", { enum: ["zim", "map", "terrain", "places", "file", "model"] }).notNull(),
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
    kind: text("kind", { enum: ["zim", "map", "terrain", "places", "file", "model", "document"] }).notNull(),
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
 * Passages. Keyword search indexes them through `chunks_fts`; semantic search attaches
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

export const nowMs = sql`(unixepoch('subsec') * 1000)`;
