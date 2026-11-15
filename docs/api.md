# API reference

This page lists every HTTP route the Outpost server registers, grouped by module:
method, path, who may call it, what it is for, and the main request and response
fields. Field-by-field shapes are TypeScript types in `packages/shared/src/`; this
page names the type rather than repeating it.

The API is the web app's own interface. It is not versioned, and it may change between
releases.

## Conventions

### Same origin only

The API is designed to be called from the Outpost web app, on the same origin. The
server sends no CORS headers, so a page on another origin cannot call it from a
browser. Scripts and command-line tools on your own machine can.

Requests must be addressed to a host name the server answers to (see
[deployment.md](deployment.md#letting-other-devices-use-it-lan-access-and-sign-in)).
Otherwise the answer is `403 forbidden`: "This address is not one Outpost answers to."

### The `X-Outpost-Request` header

Every request that is not `GET`, `HEAD` or `OPTIONS` must carry:

```
X-Outpost-Request: 1
```

Without it the answer is `403 forbidden`: "This request did not come from the Outpost
app." A request whose `Origin` or `Sec-Fetch-Site` shows it comes from another site is
refused in the same way.

```bash
curl -X POST http://localhost:8080/api/notes \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"title": "Hello"}'
```

### Who may call what

- **Sign-in off** (the default on one computer): every request is treated as the local
  administrator.
- **Sign-in on:** every `/api/` route needs a session cookie (`outpost_session`, set
  by `POST /api/auth/login`), except `GET /api/health`, `GET /api/auth/session`,
  `POST /api/auth/login` and `POST /api/auth/setup`. Without one the answer is
  `401 unauthenticated`.

In the tables below, **signed in** means any account (administrator or member), and
**admin** means an administrator.

### Request and response bodies

JSON, unless a route says otherwise. JSON bodies are limited to 20 MB. Times are
milliseconds since 1970 unless a field says it is an ISO date. Ids are lower-case
ULIDs.

### Errors

Every failing call answers with a JSON body of this shape (`ApiErrorBody` in
`packages/shared/src/common.ts`):

```json
{ "error": { "code": "not_found", "message": "Document was not found.", "details": {} } }
```

`message` is written for people and can be shown as it is. `details` is optional and
depends on the error. The codes, from `apps/server/src/core/errors.ts`:

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `bad_request` | 400 | The request is not valid. For validation failures, `details.issues` lists them. |
| `unauthenticated` | 401 | Sign in to continue. |
| `forbidden` | 403 | Not allowed: wrong role, wrong host, missing header, a blocked download address. |
| `not_found` | 404 | No such thing. |
| `conflict` | 409 | The request clashes with the current state: already exists, already running, edited elsewhere. |
| `too_large` | 413 | A file or region is over a limit. |
| `unsupported` | 415 | A file type or feature that is not supported. |
| `storage_unavailable` | 503 | A storage location is not connected or cannot be written. `details.locationId` when known. |
| `insufficient_space` | 507 | Not enough free space. `details.requiredBytes`, `freeBytes`, `reserveBytes`. |
| `offline` | 503 | The server could not reach the internet for something that needs it. |
| `upstream` | 502 | Another server (a download source, kiwix-serve, an embedding server) failed or answered badly. |
| `internal` | 500 | An unexpected error. The server log has the details. |

### Live events

`GET /api/events` is a server-sent-events stream (`text/event-stream`). It stays open,
and the server writes a comment line every 25 seconds to keep it alive. Each event has
a name and a JSON `data` of the form `{ "id": …, "data": … }`; both parts are optional.

| Event | Sent when | `id` / `data` |
| --- | --- | --- |
| `job.updated` | A background job changes state or progress | job id / the job (`JobDto`) |
| `download.updated` | A download changes state or progress | download id / the download |
| `download.removed` | A download is removed from the list | download id |
| `storage.changed` | A location is added, changed, removed, connected or disconnected | |
| `settings.changed` | Settings are saved | |
| `documents.changed` | A document is added, changed or removed | document id, when one |
| `notes.changed` | A page is created, changed, moved, trashed or restored | page id |
| `collections.changed` | A collection is installed, changed or removed | collection id, when one |
| `catalog.changed` | The catalogue is reloaded or refreshed, or a catalogue download starts | entry id, when one |
| `maps.changed` | Regions, place names, markers or tracks change | |
| `imports.changed` | An import changes state | import id |
| `semantic.changed` | Vectors are built, loaded or removed | |
| `portable.changed` | A portable drive or runtime download finishes | |

An event says that something changed, not what it now is: fetch the resource again.

### Long work is a job

Anything that takes time (downloads, reading text from documents, moving and checking
files, index builds, imports, writing a portable drive) runs as a background job. The
route that starts it answers at once, usually with the job, and progress arrives as
`job.updated` events or by polling `GET /api/jobs/:id`.

Jobs run on named queues, each with its own limit on how many run at once: `download`,
`index`, `transfer` and `import`. They survive a restart: a job that was running is
queued again and continues from what is on disk.

Job types in use: `download.run`, `document.extract`, `documents.move`,
`collection.verify`, `collection.move`, `semantic.index`, `import.analyse`,
`import.commit`, `portable.build`, `portable.runtimes`.

## System

Types: `packages/shared/src/system.ts`, `common.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/health` | anyone | `{ status: "ok", version }`. Used by health checks. |
| `GET /api/system` | signed in | Version, platform, memory and load, database size, and counts per job queue (`SystemInfo`). |
| `GET /api/events` | signed in | The live event stream described above. |
| `POST /api/system/restart` | admin | Stops the server so that its supervisor starts it again. Answers `409 conflict` unless the server was started with `OUTPOST_SUPERVISED=true`. |

### Jobs

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/jobs` | signed in | Recent jobs, newest first: `{ jobs: JobDto[] }`. Query: `active=true` for queued, running and paused only; `limit` (default 50, at most 200). |
| `GET /api/jobs/:id` | signed in | One job: `{ job }`. `job.result` holds the outcome once it has finished. |
| `POST /api/jobs/:id/pause` | admin | Stop a job but keep it. |
| `POST /api/jobs/:id/resume` | admin | Queue a paused or failed job again. |
| `POST /api/jobs/:id/cancel` | admin | Stop a job for good. |

### Settings

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/settings` | signed in | `{ settings }`: every setting with its current value (`Settings`). |
| `PATCH /api/settings` | admin | Body: any subset of settings, by key. Only the keys given are changed. An unknown key or an invalid value is a `400`. Answers `{ settings }`. |

Settings and their defaults are defined in
`apps/server/src/modules/settings/service.ts`:

| Key | Default | Range or values |
| --- | --- | --- |
| `downloads.concurrency` | 2 | 1 to 8 |
| `downloads.rateLimitKbps` | 0 | Speed limit across all downloads together, in kilobytes per second; 0 means no limit |
| `downloads.maxAttempts` | 8 | 1 to 20 |
| `indexing.concurrency` | 1 | 1 to 8 |
| `indexing.chunkSize` | 1200 | 300 to 4000 characters |
| `indexing.chunkOverlap` | 150 | 0 to 800 characters |
| `indexing.maxPdfPages` | 5000 | 0 (no limit) to 100000 |
| `search.semantic.enabled` | false | |
| `search.semantic.provider` | `none` | `none`, `transformers`, `openai-compatible` |
| `search.semantic.model` | `Xenova/all-MiniLM-L6-v2` | |
| `search.semantic.endpoint` | `http://127.0.0.1:11434/v1` | |
| `search.semantic.batchSize` | 16 | 1 to 256 |
| `search.hybrid.rrfK` | 60 | 1 to 1000 |
| `search.hybrid.keywordWeight` | 1 | 0 to 10 |
| `search.hybrid.semanticWeight` | 1 | 0 to 10 |
| `search.includeReference` | true | |
| `maps.tileSource` | empty (newest daily build) | an address |
| `maps.terrainSource` | `https://download.mapterhorn.com/planet.pmtiles` | an address |
| `maps.defaultMaxZoom` | 14 | 0 to 15 |
| `storage.checkIntervalSeconds` | 30 | 5 to 3600 |

## Sign-in and accounts

Types: `SessionInfo` in `packages/shared/src/system.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/auth/session` | anyone | `{ authRequired, setupRequired, setupTokenRequired, lanAccess, user }`. `user` is null when not signed in. |
| `POST /api/auth/setup` | anyone, once | Creates the first administrator and signs in. Body: `username`, `password` (at least 10 characters), and `setupToken` when `setupTokenRequired`. `409` once an administrator exists. |
| `POST /api/auth/login` | anyone | Body: `username`, `password`. Sets the session cookie. Answers `{ user }`. After five failures from one address or against one account, answers `403 forbidden` with "Too many attempts. Try again in N seconds." for a period that doubles each time, up to 15 minutes. |
| `POST /api/auth/logout` | signed in | Ends the session and clears the cookie. |
| `GET /api/users` | admin | `{ users }`: id, username, role, createdAt, lastLoginAt. |
| `POST /api/users` | admin | Creates an account. Body: `username`, `password`, `role` (`admin` or `member`). |
| `POST /api/users/:id/password` | the account itself, or admin | Body: `password`, and `currentPassword` when changing your own (an administrator changing someone else's does not need it). `403` when the current password is wrong. Ends that account's sessions on every device. |
| `DELETE /api/users/:id` | admin | Deletes an account. Not your own, and not the last administrator. |

User names are 2 to 64 letters, digits, dots, dashes or underscores.

## Storage

Types: `packages/shared/src/storage.ts`. See [storage.md](storage.md).

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/storage/locations` | signed in | `{ roots, locations }` (`StorageLocationsResponse`): the storage roots, and each location with capacity, status and usage by kind. |
| `POST /api/storage/refresh` | admin | Checks every location now. `{ locations }`. |
| `GET /api/storage/browse` | admin | Lists folders for the folder picker (`StorageBrowseResponse`). Query: `path`; without it, the roots. Only folders inside the roots can be listed. |
| `POST /api/storage/folders` | admin | Works out the path of a new folder. Body: `parent`, `name`. Answers `{ path }`. The folder itself is created when it is added as a location. |
| `POST /api/storage/locations` | admin | Adds a location. Body: `name`, `path`, `kind` (`internal`, `external`, `network`, `volume`), `makeDefault?`. |
| `PATCH /api/storage/locations/:id` | admin | Body: `name?`, `kind?`, `isDefault?: true`. |
| `DELETE /api/storage/locations/:id` | admin | Forgets a location. Refused (`409`) while it holds content or is the last one. Nothing on disk is deleted. |

## Search

Types: `packages/shared/src/search.ts`. See [search.md](search.md).

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/search` | signed in | Unified search (`SearchResponse`). Query: `q` (at most 500 characters), `kinds` (comma separated, for example `document,note`), `tag`, `mode` (`keyword`, `semantic`, `hybrid`), `limit` (1 to 100, default 20), `offset`. |
| `GET /api/search/stats` | signed in | `{ entities, chunks }`: indexed items per kind and the number of passages. |

Response fields worth knowing: `relaxed` (the search fell back to "any word"),
`facets` (results per kind), `warnings` (sources that could not answer, with a
reason), and per result `url` (the in-app route), `passages` and `sources`.

## Semantic search

Types: `SemanticStatus` in `packages/shared/src/semantic.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/semantic/status` | signed in | Whether it is enabled and ready, the model, counts of passages and vectors, other models with stored vectors, and whether a build is running. |
| `POST /api/semantic/index` | admin | Starts (or continues) building vectors for the current model. `409` if no provider is configured or it does not answer. Answers the status. |
| `POST /api/semantic/test` | admin | Body: `text`. Embeds it once and answers `{ modelId, dimensions, tookMs }`. |
| `DELETE /api/semantic/models/:modelId` | admin | Deletes every vector of one model. `{ removed }`. |
| `GET /api/semantic/export` | admin | Downloads vectors as gzip-compressed JSON lines. Query: `model` (a model id; default the current one). |
| `POST /api/semantic/import` | admin | Body: the exported file itself, with `Content-Type: application/gzip`. Answers `{ modelId, vectorsInFile, passagesUpdated, vectorsWithoutPassage }`. |

The file format is described in
[search.md](search.md#moving-vectors-between-installations).

## Retrieval

Types: `apps/server/src/modules/retrieval/types.ts`. See [ai.md](ai.md).

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /api/retrieval/passages` | signed in | Body: `query`, `limit?`, `kinds?`, `mode?`. Answers `{ query, passages: RetrievedPassage[] }`. |
| `POST /api/retrieval/context` | signed in | Same body plus `maxChars?`. Answers an `AssembledContext`: `text`, `citations`, `omitted`, `safetyCritical`. |

### Seeing how search works

These feed the **How search works** screen. They run the same code as real search and
return what each stage produced, so nothing on that screen is a mock-up. They read
only; nothing is changed. Types: `packages/shared/src/retrieval.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/retrieval/overview` | signed in | `ExplainOverview`: how many things and passages are indexed, passage length distribution, passage settings, and which vector source is in use. |
| `GET /api/retrieval/entities?q=` | signed in | `{ entities }`: indexed things whose title matches, to pick one to look inside. |
| `GET /api/retrieval/chunks?kind=&entityId=` | signed in | `{ entity, chunks, chunkSize, chunkOverlap }`: the passages one thing was cut into, with offsets and overlaps. |
| `POST /api/retrieval/explain` | signed in | Body: `query`, `limit?` (3 to 20, default 8). `ExplainResponse`: the query's terms, the keyword ranking with per-term scores, the vector ranking with similarities, the fusion table with each list's contribution, the assembled context, the prompt a local model would be given (shown, never sent anywhere), and timings. |
| `POST /api/retrieval/projection` | signed in | Body: `query?`, `limit?` (20 to 800, default 300). `ProjectionResponse`: passages (and the query) placed in two dimensions by principal component analysis of their vectors. |

When no embedding provider is configured, the vector stages use the built-in
demonstration vectors and say so in the response (`ExplainVectorSource`).

## Documents

Types: `packages/shared/src/documents.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /api/documents` | signed in | Uploads one or more files as `multipart/form-data` (at most 200 per request). Optional fields or query parameters: `category`, `tags` (comma separated), `locationId`, `allowDuplicate`. Answers `{ results: UploadResult[] }`, one per file with status `created`, `duplicate` or `rejected`; one bad file does not fail the others. |
| `GET /api/documents` | signed in | Lists documents (`DocumentListResponse`). Query: `q` (title or file name), `category`, `tag`, `type` (`pdf`, `markdown`, `text`, `html`, `epub`, `image`), `sort` (`added`, `title`, `size`), `order`, `limit` (at most 200), `offset`. |
| `GET /api/documents/facets` | signed in | Counts by category, tag and type, with totals (`DocumentFacets`). |
| `GET /api/documents/:id` | signed in | `{ document }` (`DocumentDto`). |
| `PATCH /api/documents/:id` | signed in | Body (`DocumentPatch`): `title`, `description`, `category`, `author`, `source`, `language`, `tags`. Omitted fields are left alone; `tags` replaces the whole list. |
| `DELETE /api/documents/:id` | admin | Deletes the document and its file. Query `forget=true` removes only Outpost's record and leaves the file. |
| `POST /api/documents/:id/reextract` | signed in | Reads the text again. `{ document, jobId }`. |
| `GET /api/documents/:id/text` | signed in | The extracted text in sections (`DocumentTextResponse`). Query: `page`. |
| `GET /api/documents/:id/file` | signed in | The original file. Supports byte ranges and `ETag`. Query `download=1` forces a download. Sent with a sandbox policy. |
| `POST /api/documents/move` | admin | Body: `locationId`. Moves every document that is not on that location to it, as a job. `{ job, documents }`. |
| `GET /api/tags` | signed in | `{ tags }`: every tag with the number of documents carrying it (`TagDto`). |

Accepted types: PDF, EPUB, Markdown, plain text (`.txt`, `.csv`, `.json`), HTML and
images (`.png`, `.jpg`, `.gif`, `.webp`, `.svg`). A file must be what its extension
says. An identical file (same SHA-256) is reported as `duplicate` unless
`allowDuplicate` is set.

## Notes

Types: `packages/shared/src/notes.ts`. See
[notes-and-imports.md](notes-and-imports.md).

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/notes/tree` | signed in | Every page, flat, for the sidebar tree (`NoteTreeResponse`). |
| `GET /api/notes/recent` | signed in | Recently opened pages. Query: `limit` (default 20). |
| `GET /api/notes/favorites` | signed in | Starred pages. |
| `GET /api/notes/trash` | signed in | Pages in the trash (`NoteTrashResponse`). |
| `GET /api/notes/templates` | signed in | Built-in templates and your own (`NoteTemplatesResponse`). |
| `GET /api/notes/lookup` | signed in | Pages whose title contains `q`, for the link menu. Query: `q`, `limit`. |
| `POST /api/notes` | signed in | Creates a page. Body (`CreateNoteBody`): `parentId`, `title`, `icon`, `content`, `templateId`, `afterId`. `{ note }`. |
| `GET /api/notes/:id` | signed in | `{ note }` (`NoteDetail`): content, tags, breadcrumbs, backlinks, children. Query `view=1` records that the page was opened. |
| `PATCH /api/notes/:id` | signed in | Saves changes. Body (`UpdateNoteBody`): `title`, `icon`, `content`, `tags`, `isFavorite`, `coverAttachmentId`, `isTemplate`, `baseUpdatedAt`. If the stored page is newer than `baseUpdatedAt` the answer is `409 conflict` with `details.current`, and nothing is overwritten. |
| `POST /api/notes/:id/move` | signed in | Body (`MoveNoteBody`): `parentId`, `afterId`. |
| `POST /api/notes/:id/duplicate` | signed in | Body: `withChildren?`. |
| `DELETE /api/notes/:id` | signed in | Moves the page and its sub-pages to the trash. `{ trashed: [ids] }`. |
| `DELETE /api/notes/:id?permanent=1` | admin | Deletes a page that is in the trash for good, with attachments nothing else uses. |
| `POST /api/notes/:id/restore` | signed in | Brings a page back from the trash. |
| `GET /api/notes/:id/export.md` | signed in | The page as a Markdown file. |
| `GET /api/notes/export.zip` | signed in | The whole workspace as a zip of Markdown files and attachments. |
| `POST /api/attachments` | signed in | Uploads one file as `multipart/form-data` (at most 50 MB). Optional `noteId` field or query parameter. `{ attachment }` (`AttachmentDto`). |
| `GET /api/attachments/:id` | signed in | The file, sent with a sandbox policy. |
| `DELETE /api/attachments/:id` | signed in | Deletes an attachment. `409` while a page still uses it. |

## Imports

Types: `packages/shared/src/imports.ts`. See
[notes-and-imports.md](notes-and-imports.md#imports).

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /api/imports` | signed in | Uploads files as `multipart/form-data` (at most 500 per request): `.md`, `.markdown`, `.txt`, `.html`, `.htm`, `.pdf`, `.csv` or `.zip`. Analysis starts by itself. `{ import }` (`ImportDto`). |
| `GET /api/imports` | signed in | Recent imports (`ImportSummary[]`). Query: `limit` (default 30). |
| `GET /api/imports/:id` | signed in | One import with its analysis (the plan) and, later, its report. |
| `POST /api/imports/:id/commit` | signed in | Carries out the plan. Body (`ImportOptions`): `duplicates` (`skip`, `copy`, `replace`), `pdfs` (`library`, `skip`), `parentId?`, `replaceConfirmed?`. |
| `POST /api/imports/:id/cancel` | signed in | Stops the analysis or the commit that is running. |
| `DELETE /api/imports/:id` | signed in | Discards an import and removes its uploaded files. |

## Collections

Types: `packages/shared/src/collections.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/collections` | signed in | Installed collections (`CollectionDto[]`). Query: `kind` (`zim`, `map`, `terrain`, `places`, `file`, `model`). |
| `GET /api/collections/:id` | signed in | `{ collection }`. |
| `DELETE /api/collections/:id` | admin | Removes a collection. `deleteFiles` is **required**, in the body (`{ "deleteFiles": true }`) or the query: `true` deletes the file, `false` removes only Outpost's record. |
| `POST /api/collections/:id/verify` | admin | Checks the file against its recorded checksum, as a job. `{ job }`. The job's `result` is a `CollectionVerifyResult`. |
| `POST /api/collections/:id/move` | admin | Body: `locationId`. Moves the collection, as a job. `{ job }`. |

## Reference collections (Kiwix)

Types: `packages/shared/src/kiwix.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/kiwix/status` | signed in | `{ mode, available, problem, books }` (`ReferenceStatus`). `mode` is `external`, `managed` or `none`. |
| `GET /api/kiwix/books` | signed in | Readable books (`ReferenceBook[]`), each with a `contentBase` address that includes a short-lived token. |
| `GET /api/kiwix/books/:collectionId` | signed in | One book, and the `reason` it cannot be read when it cannot. |
| `GET /api/kiwix/books/:collectionId/suggest` | signed in | Title suggestions. Query: `q`. |
| `GET /api/kiwix/books/:collectionId/search` | signed in | Full-text search inside one book. Query: `q`, `offset`, `limit` (at most 50). |
| `POST /api/kiwix/import` | admin | Registers a `.zim` file that is already on a storage location. Body: `locationId`, `relPath`, `title?`. Nothing is copied. |
| `GET` or `HEAD /kiwix/:token/*` | holder of a valid token | The sandboxing proxy for article content. Not under `/api/`: access is carried by the token in the path, because sandboxed pages do not send cookies. Only `content/…` and a book's icon can be reached. |

## Downloads

Types: `packages/shared/src/downloads.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/downloads` | signed in | Every download, newest first (`DownloadDto[]`), with progress, speed, time remaining and, for failures, `error` and `errorKind`. |
| `GET /api/downloads/plan` | signed in | What the queue is going to do (`DownloadPlan`): what is active, waiting and paused, estimated start and finish times, and whether each storage location has room for what is queued. |
| `GET /api/downloads/:id` | signed in | Everything known about one download (`DownloadDetail`): source and mirror, checksums, destination, timing, recent speed readings, history of state changes, attempts. |
| `POST /api/downloads/pause-all` | admin | Pauses every active download. `{ paused }`. |
| `POST /api/downloads/resume-all` | admin | Resumes every paused download. `{ resumed }`. |
| `POST /api/downloads/:id/pause` | admin | Pauses; the partial file is kept. |
| `POST /api/downloads/:id/resume` | admin | Continues a paused download. |
| `POST /api/downloads/:id/cancel` | admin | Cancels; nothing is installed. |
| `POST /api/downloads/:id/retry` | admin | Queues a failed or cancelled download again, continuing from its partial file. |
| `DELETE /api/downloads/:id` | admin | Removes a finished, failed or cancelled download from the list, with any partial file. A completed file is never deleted this way. |

Downloads are started by the catalogue and maps routes, not here.

## Catalogue

Types: `packages/shared/src/catalog.ts`. See [catalog/README.md](../catalog/README.md).

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/catalog` | signed in | Categories, entries, manifests, manifest problems and the time of the last refresh (`CatalogResponse`). Works offline from the manifests and the last known details. |
| `POST /api/catalog/refresh` | admin | Asks each source what it currently offers (`CatalogRefreshSummary`). Needs a connection; `503 offline` without one. |
| `POST /api/catalog/entries/:id/download` | admin | Starts downloading an entry. Body: `locationId?`. `{ download, replacesCollectionId }`. When the entry is already installed and the source has a newer version, the old version is removed once the new one is installed and verified. |

## Maps

Types: `packages/shared/src/maps.ts`. See [maps.md](maps.md).

### Regions and tiles

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/maps/regions` | signed in | The ready-made regions in groups, each with whether it is installed or downloading (`MapRegionsResponse`). |
| `POST /api/maps/estimate` | admin | Body: `bbox` (`[west, south, east, north]`), `maxZoom`, `minZoom?`, `tileType?` (`vector` or `terrain`). Answers a `MapEstimate` with the exact size. Needs a connection. |
| `POST /api/maps/regions` | admin | Starts a region download. Body: `name`, `bbox`, `maxZoom`, `minZoom?`, `regionId?`, `locationId?`, `includeTerrain?`. `{ downloads }`. |
| `POST /api/maps/import` | admin | Registers a `.pmtiles` file already on a storage location. Body: `locationId`, `relPath`, `name`, `tileType?`. `{ collection }`. |
| `GET /api/maps/overview` | signed in | Installed regions, place-name datasets and counts (`MapOverview`). |
| `GET /api/maps/sources` | signed in | The parts of a MapLibre style that depend on what is installed: tile addresses, bounds, zoom range, glyph and sprite addresses, attribution (`MapSources`). |
| `GET /api/maps/tiles/:z/:x/:y.mvt` | signed in | A vector tile from the best installed region. `204` when no region has it. |
| `GET /api/maps/terrain/:z/:x/:y.webp` (or `.png`) | signed in | A terrain tile. |

### Places

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/maps/places` | signed in | Place search (`PlaceSearchResponse`). Query: `q`, `limit` (at most 50), `near` (`latitude,longitude`). When `q` is a position, `coordinate` is set and `places` is empty. |
| `GET /api/maps/places/datasets` | signed in | Installed place-name datasets. |
| `POST /api/maps/places/datasets` | admin | Downloads one. Body: `dataset` (`cities500`, `cities15000` or `country`), `country` (two letters, with `country`), `locationId?`. `{ download }`. |
| `DELETE /api/maps/places/datasets/:id` | admin | Removes a dataset and its names. |

### Markers and tracks

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/maps/markers` | signed in | `{ markers }` (`MarkerDto[]`). |
| `POST /api/maps/markers` | signed in | Body: `name`, `lat`, `lon`, `note?`, `color?`, `isFavorite?`, `noteId?`. |
| `PATCH /api/maps/markers/:id` | signed in | Any of the same fields. |
| `DELETE /api/maps/markers/:id` | signed in | |
| `GET /api/maps/tracks` | signed in | `{ tracks }` (`TrackDto[]`). |
| `POST /api/maps/tracks/import` | signed in | One GPX file as `multipart/form-data` (at most 20 MB). Optional fields: `name`, `color`, `importWaypointsAsMarkers`. Answers `{ track, markers }`. |
| `GET /api/maps/tracks/:id` | signed in | One track with its geometry as GeoJSON. |
| `PATCH /api/maps/tracks/:id` | signed in | Body: `name?`, `description?`, `color?`. |
| `DELETE /api/maps/tracks/:id` | signed in | |
| `GET /api/maps/tracks/:id/export.gpx` | signed in | One track as GPX. |
| `GET /api/maps/export.gpx` | signed in | A selection as one GPX file. Query: `markers=1`, `tracks=<id>,<id>`. |

## Backup

Types: `BackupStatus` in `packages/shared/src/semantic.ts`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/backup/status` | admin | `{ restorePending, previousData, supervised }`. |
| `GET /api/backup/download` | admin | Streams a backup `.zip`: the database, attachments, extracted text and your own catalogue manifests. Refuses a request that another site caused the browser to make. |
| `POST /api/backup/restore` | admin | Body: the backup file itself, with `Content-Type: application/zip`. Checks it and stages it for the next start. `{ staged, createdAt, appVersion, supervised }`. When applied, the database, attachments and extracted text are replaced; catalogue manifests in the backup are not put back; every session is ended and unfinished jobs are dropped. |
| `DELETE /api/backup/restore` | admin | Drops a staged restore. |

## Portable drives

Types: `packages/shared/src/portable.ts`. See [portable.md](portable.md).

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/portable/status` | admin | Whether a packaged app is available, the Node version, and which runtimes are cached (`PortableStatus`). |
| `GET /api/portable/inspect` | admin | Query: `path`. Whether that folder is already an Outpost drive, and its manifest. |
| `POST /api/portable/plan` | admin | Body (`PortableRequest`): `targetPath`, `platforms`, `collectionIds`, `documents` (`all` or `none`), `reader?`, `replaceExisting?`. Answers a `PortablePlan`: sizes, free space, problems and warnings. Writes nothing. |
| `POST /api/portable/build` | admin | Same body. Starts writing the drive, as a job. `409` if the plan has problems, or the folder is already a drive and `replaceExisting` is not true. |
| `POST /api/portable/runtimes` | admin | Body: `platforms`. Downloads Node runtimes into the cache ahead of time, as a job. |

## Everything else

Any other `GET` address without a file extension returns the web app, so that in-app
routes such as `/library` can be opened directly. An unknown address under `/api/`
answers `404 not_found` as JSON.
