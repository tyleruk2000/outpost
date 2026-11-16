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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Repeaters, from lists and entered by hand (`listId` null). Frequencies are whole
 * hertz. `sourceKey` is what ties a row to its line in the list from one update to the
 * next, and `sourceRow` is what the list last said: an entry the person changed
 * (`editedAt`) or removed (`removedAt`) is recognised by them, so an update can leave it
 * alone and still tell whether the list has moved on. A removed entry of a list stays as
 * a row, so that the next update does not bring it back. See modules/repeaters.
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("repeaters_list_idx").on(table.listId, table.sourceKey),
    // Everything the map and a sort by distance read, so that neither has to visit the rows themselves.
    index("repeaters_position_idx").on(table.lat, table.lon, table.removedAt, table.id),
    index("repeaters_output_idx").on(table.outputHz),
    // In the order the list is shown in, whatever case a callsign was typed in.
    index("repeaters_callsign_idx").on(sql`${table.callsign} COLLATE NOCASE`),
    // All that the search across everything looks at, so that it reads this and not the rows: it is asked on every search.
    index("repeaters_search_idx").on(table.searchText, table.removedAt, table.outputHz, table.inputHz, table.id),
  ],
);

export const nowMs = sql`(unixepoch('subsec') * 1000)`;
