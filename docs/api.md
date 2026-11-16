# API reference

This page lists every HTTP route the Outpost server registers, grouped by module:
method, path, what it is for, and the main request and response fields.
Field-by-field shapes are TypeScript types in `packages/shared/src/`; this page names
the type rather than repeating it.

The API is the web app's own interface. It is not versioned, and it may change between
releases.

## Conventions

### Same origin only

The API is designed to be called from the Outpost web app, on the same origin. The
server sends no CORS headers, so a page on another origin cannot call it from a
browser. Scripts and command-line tools on your own machine can.

Requests must be addressed to a host name the server answers to (see
[deployment.md](deployment.md#letting-other-devices-use-it-lan-access)).
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

Outpost has no accounts, and no route is reserved for anyone. A request that reaches
the server may call any route, as long as it keeps the two rules above:

1. it is addressed to a host name the server answers to; and
2. if it is not a `GET`, `HEAD` or `OPTIONS`, it carries `X-Outpost-Request: 1` and
   does not come from another site.

Who can reach the server in the first place is decided when it starts: only the
computer it runs on, unless `OUTPOST_LAN_ACCESS` is on, in which case every device on
the network can. Both rules are in `apps/server/src/core/guard.ts`.

There is one exception. `POST /api/manage/cleanup/everything`, which erases a person's
own notes and documents, is accepted only from the computer the server runs on, unless
the server was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`. That is a rule about
where a request comes from, not who sent it; see
[security.md](security.md#erasing-everything).

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
| `forbidden` | 403 | Refused: an address the server does not answer to, a missing header, a request from another site, a blocked download address. |
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
| `merge.changed` | A merge of a drive's changes moves to another state | merge id |

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
`import.commit`, `portable.build`, `portable.runtimes`, `merge.analyse`, `merge.apply`, `manage.remove`,
`manage.derived`, `manage.erase`.

A job that was cancelled part of the way through work that cannot be undone keeps a
`result` saying what it had done by then; the three `manage.*` jobs do this.

## System

Types: `packages/shared/src/system.ts`, `common.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | `{ status: "ok", version }`. Used by health checks. |
| `GET /api/system` | Version, platform, memory and load, database size, whether LAN access is on (`lanAccess`), and counts per job queue (`SystemInfo`). |
| `GET /api/events` | The live event stream described above. |
| `POST /api/system/restart` | Stops the server so that its supervisor starts it again. Answers `409 conflict` unless the server was started with `OUTPOST_SUPERVISED=true`. |

### Jobs

| Method and path | Purpose |
| --- | --- |
| `GET /api/jobs` | Recent jobs, newest first: `{ jobs: JobDto[] }`. Query: `active=true` for queued, running and paused only; `limit` (default 50, at most 200). |
| `GET /api/jobs/:id` | One job: `{ job }`. `job.result` holds the outcome once it has finished. |
| `POST /api/jobs/:id/pause` | Stop a job but keep it. |
| `POST /api/jobs/:id/resume` | Queue a paused or failed job again. |
| `POST /api/jobs/:id/cancel` | Stop a job for good. |

### Settings

| Method and path | Purpose |
| --- | --- |
| `GET /api/settings` | `{ settings }`: every setting with its current value (`Settings`). |
| `PATCH /api/settings` | Body: any subset of settings, by key. Only the keys given are changed. An unknown key or an invalid value is a `400`. Answers `{ settings }`. |

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
| `ocr.auto` | false | Read new scanned documents and images by OCR as they are added |
| `ocr.languages` | `eng` | Tesseract language codes joined by `+`, such as `deu+eng`. A language is used only if its data is installed; see `GET /api/ocr` |
| `search.semantic.enabled` | false | |
| `search.semantic.provider` | `built-in` | `built-in` (the model that ships with Outpost), `openai-compatible` (a local server), `demo`, `none`. The value `transformers` from earlier builds is read as `built-in` |
| `search.semantic.model` | `Xenova/all-MiniLM-L6-v2` | The name a local server knows its model by. Not used by the built-in model |
| `search.semantic.endpoint` | `http://127.0.0.1:11434/v1` | |
| `search.semantic.batchSize` | 16 | 1 to 256 |
| `search.hybrid.rrfK` | 60 | 1 to 1000 |
| `search.hybrid.keywordWeight` | 1 | 0 to 10 |
| `search.hybrid.semanticWeight` | 1 | 0 to 10 |
| `search.includeReference` | true | |
| `answers.enabled` | false | Answers written by a language model the person runs. See [ai.md](ai.md) |
| `answers.endpoint` | `http://127.0.0.1:11434/v1` | An `http` or `https` address without credentials; `/v1` is added when it has no path |
| `answers.model` | empty | The model's name as the server knows it |
| `answers.temperature` | 0.2 | 0 to 2 |
| `answers.contextChars` | 6000 | 1000 to 60000 characters of quoted passages per question |
| `maps.tileSource` | empty (newest daily build) | an address |
| `maps.terrainSource` | `https://download.mapterhorn.com/planet.pmtiles` | an address |
| `maps.defaultMaxZoom` | 14 | 0 to 15 |
| `storage.checkIntervalSeconds` | 30 | 5 to 3600 |

## Storage

Types: `packages/shared/src/storage.ts`. See [storage.md](storage.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/storage/locations` | `{ roots, locations }` (`StorageLocationsResponse`): the storage roots, and each location with capacity, status and usage by kind. |
| `POST /api/storage/refresh` | Checks every location now. `{ locations }`. |
| `GET /api/storage/browse` | Lists folders for the folder picker (`StorageBrowseResponse`). Query: `path`; without it, the roots. Only folders inside the roots can be listed. |
| `POST /api/storage/folders` | Works out the path of a new folder. Body: `parent`, `name`. Answers `{ path }`. The folder itself is created when it is added as a location. |
| `POST /api/storage/locations` | Adds a location. Body: `name`, `path`, `kind` (`internal`, `external`, `network`, `volume`), `makeDefault?`. |
| `PATCH /api/storage/locations/:id` | Body: `name?`, `kind?`, `isDefault?: true`. |
| `DELETE /api/storage/locations/:id` | Forgets a location. Refused (`409`) while it holds content or is the last one. Nothing on disk is deleted. |

### Network shares

Types: `packages/shared/src/shares.ts`. Outpost connects a share itself only when it
runs directly on a Mac; `mode` in the first route says which case applies (`macos`,
`docker`, `linux` or `unsupported`). Elsewhere the routes that connect answer
`415 unsupported`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/storage/shares` | `{ mode, shares, hints }` (`NetworkSharesResponse`): the shares Outpost knows, each with its status and the storage locations on it. No response ever contains a password. |
| `GET /api/storage/shares/discover` | `{ supported, servers }`: file servers that announce themselves on the local network. `supported` is false anywhere but a Mac run directly. |
| `POST /api/storage/shares` | Connects an SMB share. Body (`ConnectShareRequest`): `server`, `port?`, `share`, `userName`, `password`, `rememberPassword`. Answers `{ share, note? }`. |
| `POST /api/storage/shares/:id/reconnect` | Body: `password?`, `rememberPassword?`. Without a password, the one remembered in the Keychain is used. |
| `POST /api/storage/shares/:id/disconnect` | Unmounts the share. Answers `409 conflict` with `details.work` while something is using it, unless the body is `{ "confirm": true }`. |
| `DELETE /api/storage/shares/:id` | Disconnects, removes the remembered password and forgets the share. Query `confirm=true` as above. |

## Search

Types: `packages/shared/src/search.ts`. See [search.md](search.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/search` | Unified search (`SearchResponse`). Query: `q` (at most 500 characters), `kinds` (comma separated, for example `document,note`), `tag`, `mode` (`keyword`, `semantic`, `hybrid`), `limit` (1 to 100, default 20), `offset`. |
| `GET /api/search/stats` | `{ entities, chunks }`: indexed items per kind and the number of passages. |

Response fields worth knowing: `relaxed` (the search fell back to "any word"),
`facets` (results per kind), `warnings` (sources that could not answer, with a
reason), and per result `url` (the in-app route), `passages` and `sources`.

## Semantic search

Types: `SemanticStatus` in `packages/shared/src/semantic.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/semantic/status` | Whether it is enabled and ready, the model, counts of passages and vectors, other models with stored vectors, whether a build is running, `build` (the latest index build for the current model as a job, in whatever state, or null) and `builtIn` (the model that ships with Outpost: whether it is installed, its name, licence, size, dimensions and threads). `?fresh=1` asks the model again now rather than trusting an answer from the last minute. |
| `POST /api/jobs/:id/pause`, `/cancel` | Pause or stop the build named in `build`. `POST /api/semantic/index` continues a paused one. |
| `POST /api/semantic/index` | Starts (or continues) building vectors for the current model. `409` if no provider is configured or it does not answer. Answers the status. |
| `POST /api/semantic/test` | Body: `text`. Embeds it once and answers `{ modelId, dimensions, tookMs }`. |
| `DELETE /api/semantic/models/:modelId` | Deletes every vector of one model. `{ removed }`. |
| `GET /api/semantic/export` | Downloads vectors as gzip-compressed JSON lines. Query: `model` (a model id; default the current one). |
| `POST /api/semantic/import` | Body: the exported file itself, with `Content-Type: application/gzip`. Answers `{ modelId, vectorsInFile, passagesUpdated, vectorsWithoutPassage }`. |

The file format is described in
[search.md](search.md#moving-vectors-between-installations).

## Answers

One question, one answer written by a language model the person runs themselves, from
passages of their library. Types: `packages/shared/src/answers.ts`. See
[ai.md](ai.md) for the prompt, what is sent where, and the events in full.

| Method and path | Purpose |
| --- | --- |
| `GET /api/answers/status` | `AnswersStatus`: `enabled`, `ready`, `reason`, `model`, `server`, `place` (`this-computer`, `local-network`, `elsewhere`), `busy`. Read from settings; the model server is not contacted. |
| `GET /api/answers/models` | `{ models, message }`: the model names the configured server reports, or why they could not be read. Contacts the model server, and only while answers are switched on. |
| `POST /api/answers/test` | Asks the configured model for one word. `AnswerTestResult`: `ok`, `failure` (`address`, `unreachable`, `not-a-model-server`, `no-such-model`, `not-a-chat-model`, `no-chat-endpoint`, `too-slow`, `other`), `message`, `models`, `reply`, `tookMs`. Always `200`. |
| `POST /api/answers` | Body: `question` (1 to 1000 characters), `mode?` (`keyword`, `semantic`, `hybrid`). Writes an answer and streams it. |

`POST /api/answers` is the one endpoint that answers a `POST` with a stream. It
answers `409` if answers are not set up, or if another answer is being written
(`details.busy` is then `true`): one is written at a time, and a second is refused,
not queued. Otherwise the response is `200` with
`Content-Type: text/event-stream`, and these events, each with one JSON `data` line:

| Event | Data |
| --- | --- |
| `sources` | Always first: `question`, `searchedFor`, `model`, `server`, `sources`, `omitted`, `safetyCritical`. Each source has `marker`, `kind`, `entityId`, `title`, `collection`, `url`, `page`, `heading`, `quote` and `safetyCritical`. |
| `delta` | `text`: the next piece of the answer. |
| `done` | `outcome` (`answered`, or `nothing-found` when no passage matched and the model was not asked), `used` and `unsupported` (citation markers that are and are not real sources), `cutShort`, `tookMs`. |
| `error` | `failure` and a `message` for a person. Sent in place of `done` when the model server fails after the stream has begun. |

Closing the connection stops the model. Nothing about the question or the answer is
stored. Because it is a `POST`, it needs the `X-Outpost-Request` header, so a browser
reads it with `fetch`, not `EventSource`.

## Retrieval

Types: `apps/server/src/modules/retrieval/types.ts`. See [ai.md](ai.md).

| Method and path | Purpose |
| --- | --- |
| `POST /api/retrieval/passages` | Body: `query`, `limit?`, `kinds?`, `mode?`. Answers `{ query, passages: RetrievedPassage[] }`. |
| `POST /api/retrieval/context` | Same body plus `maxChars?`. Answers an `AssembledContext`: `text`, `citations`, `omitted`, `safetyCritical`. |

### Seeing how search works

These feed the **How search works** screen. They run the same code as real search and
return what each stage produced, so nothing on that screen is a mock-up. They read
only; nothing is changed. Types: `packages/shared/src/retrieval.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/retrieval/overview` | `ExplainOverview`: how many things and passages are indexed, passage length distribution, passage settings, and which vector source is in use. |
| `GET /api/retrieval/entities?q=` | `{ entities }`: indexed things whose title matches, to pick one to look inside. |
| `GET /api/retrieval/chunks?kind=&entityId=` | `{ entity, chunks, chunkSize, chunkOverlap }`: the passages one thing was cut into, with offsets and overlaps. |
| `POST /api/retrieval/explain` | Body: `query`, `limit?` (3 to 20, default 8). `ExplainResponse`: the query's terms, the keyword ranking with per-term scores, the vector ranking with similarities, the fusion table with each list's contribution, the assembled context, the prompt `POST /api/answers` would send for this question (built by the same code; this endpoint sends nothing), and timings. |
| `POST /api/retrieval/projection` | Body: `query?`, `limit?` (20 to 800, default 300). `ProjectionResponse`: passages (and the query) placed in two dimensions by principal component analysis of their vectors. |

When no embedding provider is configured, the vector stages use the built-in
demonstration vectors and say so in the response (`ExplainVectorSource`).

## Documents

Types: `packages/shared/src/documents.ts`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/documents` | Uploads one or more files as `multipart/form-data` (at most 200 per request). Optional fields or query parameters: `category`, `tags` (comma separated), `locationId`, `allowDuplicate`. Answers `{ results: UploadResult[] }`, one per file with status `created`, `duplicate` or `rejected`; one bad file does not fail the others. |
| `GET /api/documents` | Lists documents (`DocumentListResponse`). Query: `q` (title or file name), `category`, `tag`, `type` (`pdf`, `markdown`, `text`, `html`, `epub`, `image`), `sort` (`added`, `title`, `size`), `order`, `limit` (at most 200), `offset`, `chapters`. The chapters of books are left out unless `q` or `tag` is given: a book is one thing in the library, reached from its collection. `chapters=true` always lists them, `chapters=false` never. A chapter's `book` says which book it is from. |
| `GET /api/documents/facets` | Counts by category, tag and type, with totals (`DocumentFacets`). Chapters of books are not counted. |
| `GET /api/documents/:id` | `{ document }` (`DocumentDto`). `scanPages` is how many pages have no text of their own (1 for an image), `ocrPages` how many of them OCR has been run on (`null` if never), and `ocrDetail` a sentence about the last OCR run. For a chapter of a book, also `chapter` (`DocumentChapterDto`): the book, the chapter's place in it, and the previous and next chapters. |
| `PATCH /api/documents/:id` | Body (`DocumentPatch`): `title`, `description`, `category`, `author`, `source`, `language`, `tags`. Omitted fields are left alone; `tags` replaces the whole list. |
| `DELETE /api/documents/:id` | Deletes the document and its file. Query `forget=true` removes only Outpost's record and leaves the file. |
| `POST /api/documents/:id/reextract` | Reads the text again. `{ document, jobId }`. Text that OCR read from pages with no text of their own is kept. |
| `POST /api/documents/:id/ocr` | Reads the text of a scanned PDF's pages, or of a PNG, JPEG, GIF or WebP image, by OCR, as a job on the `ocr` queue (one at a time). Body: `{ "redo": true }` to read again the pages OCR has read before; otherwise only pages not yet read. Answers `{ document, jobId }` (`DocumentOcrResponse`), or the job already doing it. Follow and cancel it through `/api/jobs`; cancelling keeps the pages read so far. `415` for a type OCR does not read or when OCR is not available (the message says why), `409` while the document's own text is still being read or when there is nothing left to read, `503` while its storage is disconnected. |
| `GET /api/ocr` | Whether this installation can run OCR and with what (`OcrStatus`): `available`, `reason` when not, `engine`, the installed `languages` (each `builtIn` or added, and whether `selected`), `missingLanguages`, `languageFolder`, `auto`, and `limits`. |
| `GET /api/documents/:id/text` | The extracted text in sections (`DocumentTextResponse`). Query: `page`. Each section has `ocr: true` when it was read from a picture by OCR. |
| `GET /api/documents/:id/markdown` | A Markdown document with its formatting, as a tree of plain values (`DocumentMarkdownResponse`): headings (each with an `id` made from its words), paragraphs, lists, quotes, code (with the `lang` written after the fence, such as `mermaid` or `viz`), tables, and bold, italic, code and links inside them. Never HTML. A link is one of three things: `link`, for an `http`, `https` or `mailto` address; `jump`, to a heading of the same document; or `ref`, for `outpost:entry/<entry id>/<chapter key>`, which carries the entry's id and name and, when it is in the library, the `collectionId` and `documentId` the server found. Pictures become their description and caption; embedded HTML becomes its words. `415` for a document that is not Markdown, `413` for a file over 2 MB (the web app then shows the text from `/text`), `404` when the file is missing. |
| `GET /api/documents/:id/file` | The original file. Supports byte ranges and `ETag`. Query `download=1` forces a download. Sent with a sandbox policy. |
| `POST /api/documents/move` | Body: `locationId`. Moves every document that is not on that location to it, as a job. `{ job, documents }`. |
| `GET /api/tags` | `{ tags }`: every tag with the number of documents carrying it (`TagDto`). |

Accepted types: PDF, EPUB, Markdown, plain text (`.txt`, `.csv`, `.json`), HTML and
images (`.png`, `.jpg`, `.gif`, `.webp`, `.svg`). A file must be what its extension
says. An identical file (same SHA-256) is reported as `duplicate` unless
`allowDuplicate` is set.

## Notes

Types: `packages/shared/src/notes.ts`. See
[notes-and-imports.md](notes-and-imports.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/notes/tree` | Every page, flat, for the sidebar tree (`NoteTreeResponse`). |
| `GET /api/notes/recent` | Recently opened pages. Query: `limit` (default 20). |
| `GET /api/notes/favorites` | Starred pages. |
| `GET /api/notes/trash` | Pages in the trash (`NoteTrashResponse`). |
| `GET /api/notes/templates` | Built-in templates and your own (`NoteTemplatesResponse`). |
| `GET /api/notes/lookup` | Pages whose title contains `q`, for the link menu. Query: `q`, `limit`. |
| `POST /api/notes` | Creates a page. Body (`CreateNoteBody`): `parentId`, `title`, `icon`, `content`, `templateId`, `afterId`. `{ note }`. |
| `GET /api/notes/:id` | `{ note }` (`NoteDetail`): content, tags, breadcrumbs, backlinks, children. Query `view=1` records that the page was opened. |
| `PATCH /api/notes/:id` | Saves changes. Body (`UpdateNoteBody`): `title`, `icon`, `content`, `tags`, `isFavorite`, `coverAttachmentId`, `isTemplate`, `baseUpdatedAt`. If the stored page is newer than `baseUpdatedAt` the answer is `409 conflict` with `details.current`, and nothing is overwritten. |
| `POST /api/notes/:id/move` | Body (`MoveNoteBody`): `parentId`, `afterId`. |
| `POST /api/notes/:id/duplicate` | Body: `withChildren?`. |
| `DELETE /api/notes/:id` | Moves the page and its sub-pages to the trash. `{ trashed: [ids] }`. |
| `DELETE /api/notes/:id?permanent=1` | Deletes a page that is in the trash for good, with attachments nothing else uses. |
| `POST /api/notes/:id/restore` | Brings a page back from the trash. |
| `GET /api/notes/:id/export.md` | The page as a Markdown file. |
| `GET /api/notes/export.zip` | The whole workspace as a zip of Markdown files and attachments. |
| `POST /api/attachments` | Uploads one file as `multipart/form-data` (at most 50 MB). Optional `noteId` field or query parameter. `{ attachment }` (`AttachmentDto`). |
| `GET /api/attachments/:id` | The file, sent with a sandbox policy. |
| `DELETE /api/attachments/:id` | Deletes an attachment. `409` while a page still uses it. |

## Imports

Types: `packages/shared/src/imports.ts`. See
[notes-and-imports.md](notes-and-imports.md#imports).

| Method and path | Purpose |
| --- | --- |
| `POST /api/imports` | Uploads files as `multipart/form-data` (at most 500 per request): `.md`, `.markdown`, `.txt`, `.html`, `.htm`, `.pdf`, `.csv` or `.zip`. Analysis starts by itself. `{ import }` (`ImportDto`). |
| `GET /api/imports` | Recent imports (`ImportSummary[]`). Query: `limit` (default 30). |
| `GET /api/imports/:id` | One import with its analysis (the plan) and, later, its report. |
| `POST /api/imports/:id/commit` | Carries out the plan. Body (`ImportOptions`): `duplicates` (`skip`, `copy`, `replace`), `pdfs` (`library`, `skip`), `parentId?`, `replaceConfirmed?`. |
| `POST /api/imports/:id/cancel` | Stops the analysis or the commit that is running. |
| `DELETE /api/imports/:id` | Discards an import and removes its uploaded files. |

## Collections

Types: `packages/shared/src/collections.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/collections` | Installed collections (`CollectionDto[]`). Query: `kind` (`zim`, `map`, `terrain`, `places`, `file`, `model`). |
| `GET /api/collections/:id` | `{ collection }`. |
| `DELETE /api/collections/:id` | Removes a collection. `deleteFiles` is **required**, in the body (`{ "deleteFiles": true }`) or the query: `true` deletes the file, `false` removes only Outpost's record. |
| `POST /api/collections/:id/verify` | Checks the file against its recorded checksum, as a job. `{ job }`. The job's `result` is a `CollectionVerifyResult`. |
| `POST /api/collections/:id/move` | Body: `locationId`. Moves the collection, as a job. `{ job }`. |
| `GET /api/collections/:id/chapters` | The contents of a book (`BookContentsResponse`): its named parts in reading order, each with its chapters (`key`, `number`, `title`, `summary`, `documentId`). `404` for a collection that is not a book. A book is a collection of kind `file` whose `meta.book` holds its number of chapters. |

## Reference collections (Kiwix)

Types: `packages/shared/src/kiwix.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/kiwix/status` | `{ mode, available, problem, books }` (`ReferenceStatus`). `mode` is `external`, `managed` or `none`. |
| `GET /api/kiwix/books` | Readable books (`ReferenceBook[]`), each with a `contentBase` address to append an article path to. |
| `GET /api/kiwix/books/:collectionId` | One book, and the `reason` it cannot be read when it cannot. |
| `GET /api/kiwix/books/:collectionId/suggest` | Title suggestions. Query: `q`. |
| `GET /api/kiwix/books/:collectionId/search` | Full-text search inside one book. Query: `q`, `offset`, `limit` (at most 50). |
| `POST /api/kiwix/import` | Registers a `.zim` file that is already on a storage location. Body: `locationId`, `relPath`, `title?`. Nothing is copied. |
| `POST /api/kiwix/books/:collectionId/files/save` | Copies a file out of the archive into the document library. No connection is needed. Body: `path` (the file's path inside the book, for example `example.org/docs/manual.pdf`), `title?`. Answers `{ status, document }` (`SaveArchiveFileResponse`): `created`; `already` when this file had been added before; `duplicate` when the library held the same file from elsewhere. PDF, EPUB, Markdown and text files only; a page is a `400`. |
| `POST /api/kiwix/books/:collectionId/files/check` | Which of these files are already documents. Body: `paths` (at most 500). Answers `{ files: [{ path, state, documentId? }] }`, where `state` is `new` or `saved`. |
| `GET` or `HEAD /kiwix/open/*` | The sandboxing proxy for article content. Not under `/api/`. Only `content/…` and a book's icon can be reached. Use the `contentBase` a book reports; the first segment after `/kiwix/` is fixed, and any other value is a `404`. |

## Downloads

Types: `packages/shared/src/downloads.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/downloads` | Every download, newest first (`DownloadDto[]`), with progress, speed, time remaining and, for failures, `error` and `errorKind`. |
| `GET /api/downloads/plan` | What the queue is going to do (`DownloadPlan`): what is active, waiting and paused, estimated start and finish times, and whether each storage location has room for what is queued. |
| `GET /api/downloads/:id` | Everything known about one download (`DownloadDetail`): source and mirror, checksums, destination, timing, recent speed readings, history of state changes, attempts. |
| `POST /api/downloads/pause-all` | Pauses every active download. `{ paused }`. |
| `POST /api/downloads/resume-all` | Resumes every paused download. `{ resumed }`. |
| `POST /api/downloads/:id/pause` | Pauses; the partial file is kept. |
| `POST /api/downloads/:id/resume` | Continues a paused download. |
| `POST /api/downloads/:id/cancel` | Cancels; nothing is installed. |
| `POST /api/downloads/:id/retry` | Queues a failed or cancelled download again, continuing from its partial file. |
| `DELETE /api/downloads/:id` | Removes a finished, failed or cancelled download from the list, with any partial file. A completed file is never deleted this way. |

Downloads are started by the catalogue, maps and links routes, not here. `kind` says
what is being fetched: `zim`, `map`, `terrain`, `places`, `file`, `model`, or `document`
for a file saved from a link. A completed `document` download carries the `documentId`
of the library document it became.

## Links

Types: `packages/shared/src/links.ts`.

These fetch a file that a reference page links to but its archive does not hold, and
add it to the document library. The fetch is an ordinary download of kind `document`:
it shows on the Downloads screen, obeys the speed limit and can be paused.

| Method and path | Purpose |
| --- | --- |
| `POST /api/links/save` | Body: `url`, `title?`, `foundIn?` (the collection the link was found in, for the document's description), `locationId?` (default: the default storage location). Answers `{ download }`; or `{ already: "saved", document }` when the library has it; or `{ already: "saving", download }` when it is on its way (`SaveLinkResponse`). |
| `POST /api/links/save-all` | Body: `links` (1 to 200 of `{ url, title? }`), `foundIn?`, `locationId?`. Answers `{ queued, already, refused }` (`SaveLinksResponse`): the downloads started, how many were already saved or on their way, and each link that was refused with the reason. One bad link does not fail the others. |
| `POST /api/links/check` | Body: `urls` (at most 500). Answers `{ links }` (`LinkState[]`): each address with `state` `new`, `saved` (with `documentId`), `saving` (with `downloadId`) or `unsupported`. Fetches nothing. |

A link is accepted only when it starts with `http://` or `https://`, carries no user
name or password, and ends in the name of a kind of file the library keeps (see
[Documents](#documents)) other than a web page. An address on this computer or a
private network is refused with `403 forbidden`, and every connection the download
makes, redirects included, must land on a public address, unless the server was started
with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`. What arrives must be the kind of file its
name says, or nothing is kept.

## Catalogue

Types: `packages/shared/src/catalog.ts`. See [catalog/README.md](../catalog/README.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/catalog` | Categories, entries, packs, manifests, manifest and pack problems and the time of the last refresh (`CatalogResponse`). Works offline from the manifests and the last known details. An entry that is a book carries `chapterCount`; its list of chapters is not sent. |
| `POST /api/catalog/refresh` | Asks each source what it currently offers (`CatalogRefreshSummary`). Needs a connection; `503 offline` without one. |
| `POST /api/catalog/entries/:id/download` | Starts downloading an entry. Body: `locationId?`. `{ download, replacesCollectionId }`. When the entry is already installed and the source has a newer version, the old version is removed once the new one is installed and verified. |
| `POST /api/catalog/packs/:id/install` | Fetches what a pack holds that is not here yet. Body: `locationId?`, `entryIds?` (part of the pack; all of it when omitted). Starts a download for each such entry and adds those that ship with Outpost. Answers `{ queued, added, already, failed }` (`CatalogPackInstallResponse`); one entry failing to start is reported in `failed` and does not stop the others. `404` for an unknown pack, `400` for an entry that is not in it. |
| `POST /api/catalog/entries/:id/add` | Adds an entry that ships with Outpost, copying it into the library with no connection. Body: `locationId?`. Answers `{ collectionId, documentId?, chapterCount?, replacedCollectionId }` (`CatalogAddResponse`): `documentId` for a single file, `chapterCount` for a book, whose chapters become one document each. |

## Maps

Types: `packages/shared/src/maps.ts`. See [maps.md](maps.md).

### Regions and tiles

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/regions` | The ready-made regions in groups, each with whether it is installed or downloading (`MapRegionsResponse`). |
| `POST /api/maps/estimate` | Body: `bbox` (`[west, south, east, north]`), `maxZoom`, `minZoom?`, `tileType?` (`vector` or `terrain`). Answers a `MapEstimate` with the exact size. Needs a connection. |
| `POST /api/maps/regions` | Starts a region download. Body: `name`, `bbox`, `maxZoom`, `minZoom?`, `regionId?`, `locationId?`, `includeTerrain?`. `{ downloads }`. |
| `POST /api/maps/import` | Registers a `.pmtiles` file already on a storage location. Body: `locationId`, `relPath`, `name`, `tileType?`. `{ collection }`. |
| `GET /api/maps/overview` | Installed regions, place-name datasets and counts (`MapOverview`). |
| `GET /api/maps/sources` | The parts of a MapLibre style that depend on what is installed: tile addresses, bounds, zoom range, glyph and sprite addresses, attribution (`MapSources`). |
| `GET /api/maps/tiles/:z/:x/:y.mvt` | A vector tile from the best installed region. `204` when no region has it. |
| `GET /api/maps/terrain/:z/:x/:y.webp` (or `.png`) | A terrain tile. |

### Places

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/places` | Place search (`PlaceSearchResponse`). Query: `q`, `limit` (at most 50), `near` (`latitude,longitude`). When `q` is a position, `coordinate` is set and `places` is empty. |
| `GET /api/maps/places/datasets` | Installed place-name datasets. |
| `POST /api/maps/places/datasets` | Downloads one. Body: `dataset` (`cities500`, `cities15000` or `country`), `country` (two letters, with `country`), `locationId?`. `{ download }`. |
| `DELETE /api/maps/places/datasets/:id` | Removes a dataset and its names. |

### Markers and tracks

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/markers` | `{ markers }` (`MarkerDto[]`). |
| `POST /api/maps/markers` | Body: `name`, `lat`, `lon`, `note?`, `color?`, `isFavorite?`, `noteId?`. |
| `PATCH /api/maps/markers/:id` | Any of the same fields. |
| `DELETE /api/maps/markers/:id` | |
| `GET /api/maps/tracks` | `{ tracks }` (`TrackDto[]`). |
| `POST /api/maps/tracks` | Saves a route drawn on the map: straight lines between the points sent. Body: `name`, `points` (at least two of `{ lat, lon }`), `description?`, `color?`. Answers `{ track, elevation }` (`RouteSaveResponse`). |
| `PUT /api/maps/tracks/:id/points` | Replaces a track's lines with one drawn through `points`. Its waypoints are kept. Answers `{ track, elevation }`. |
| `POST /api/maps/tracks/import` | One GPX file as `multipart/form-data` (at most 20 MB). Optional fields: `name`, `color`, `importWaypointsAsMarkers`. Answers `{ track, markers }`. |
| `GET /api/maps/tracks/:id` | One track with its geometry as GeoJSON. |
| `PATCH /api/maps/tracks/:id` | Body: `name?`, `description?`, `color?`. |
| `DELETE /api/maps/tracks/:id` | |
| `GET /api/maps/tracks/:id/export.gpx` | One track as GPX. |
| `GET /api/maps/export.gpx` | A selection as one GPX file. Query: `markers=1`, `tracks=<id>,<id>`. |

## Backup

Types: `BackupStatus` in `packages/shared/src/semantic.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/backup/status` | `{ restorePending, previousData, supervised }`. |
| `GET /api/backup/download` | Streams a backup `.zip`: the database, attachments, extracted text and your own catalogue manifests. Refuses a request that another site caused the browser to make. |
| `POST /api/backup/restore` | Body: the backup file itself, with `Content-Type: application/zip`. Checks it and stages it for the next start. `{ staged, createdAt, appVersion, supervised }`. When applied, the database, attachments and extracted text are replaced; catalogue manifests in the backup are not put back; unfinished jobs are dropped, downloads that were under way are marked cancelled, and unfinished imports are discarded. |
| `DELETE /api/backup/restore` | Drops a staged restore. |

## Managing and cleaning up

Types: `packages/shared/src/manage.ts`. See
[storage.md](storage.md#managing-and-cleaning-up) for what each clean-up removes and
keeps, and [security.md](security.md#removing-in-bulk) for what they can touch.

Items are named by key: `collection:<id>` or `document:<id>`. A catalogue sheet or
book is one item, keyed by its collection, with its documents listed in `documents`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/manage/usage` | What is taking the space (`UsageResponse`): `rows` by kind, each with `bytes` (null while still being counted), `count`, `basis` (`records`, `disk` or `estimate`), `disconnectedBytes` and `within` (set when the row is part of another, as passages and vectors are part of the database); `locations` with capacity, free space, what Outpost's records say is there and what was measured on disk (null when not connected); `dataDir`; `measuredAt` and `measuring`. Starts a count in the background if the last is more than five minutes old or something has changed. |
| `POST /api/manage/measure` | Checks drives and starts a count now. Same answer as above. |
| `GET /api/manage/items` | Everything installed: `{ items: ManagedItem[] }`, each with `key`, `kind` (`zim`, `map`, `terrain`, `places`, `sheet`, `file`, `model`, `document`), `origin` (`downloaded` or `own`), size, date added, location and whether it is connected, `state` (`ok`, `missing`, `damaged`, `busy`) and `busyReason`. |
| `POST /api/manage/plan` | What a removal would do, by the rules of the removal itself. Changes nothing. Body: `{ scope: "items", keys, files?, disconnected? }`, `{ scope: "downloaded", disconnected? }` or `{ scope: "everything" }`. Answers a `CleanupPlan`: `changes`, `remove` (count and bytes), `byKind`, `byLocation` (deleted and staying, per location), `own`, `linkedDocuments`, `disconnected` and `outside` (with file paths), `refused` (with reasons), `downloads`, and for `everything` `personal`. |
| `POST /api/manage/remove` | Body: `{ keys, files?: "delete" \| "keep", disconnected?: "leave" \| "forget" }` (defaults `delete` and `leave`). Starts a `manage.remove` job: `{ job }`. `409` when nothing chosen can be removed, or another clean-up is waiting or running. |
| `POST /api/manage/move` | Body: `{ keys, locationId }`. Starts one `collection.move` job per collection and one `documents.move` job for the documents: `{ jobs, refused }`, where `refused` names each item that was not moved and why. `507 insufficient_space` when the target cannot hold the whole selection; nothing is started then. |
| `GET /api/manage/leftovers` | `{ items: Leftover[], more, measuredAt, measuring }`. Kinds: `download`, `missing`, `untracked`, `upload`, `history`, `cache`, `previous`. At most 200 of a kind are listed; `more` counts the rest. |
| `POST /api/manage/leftovers/clear` | Body: `{ ids }`, as issued by the list. Clears each and answers `{ cleared: { count, bytes }, failed: [{ id, title, reason }] }`. An id Outpost did not issue, or a file something now uses, is refused and reported in `failed`. |
| `GET /api/manage/cleanup` | `CleanupStatus`: `erase` (`{ allowed, reason: "local" \| "option" \| "remote", option }`, for the device asking), `derived` (vectors, documents, reclaimable and total database bytes), and the clean-up job that is `active` and the `last` that finished. |
| `POST /api/manage/cleanup/downloaded` | Body: `{ disconnected?: "leave" \| "forget" }`. Removes all downloaded content, as a `manage.remove` job. |
| `POST /api/manage/cleanup/derived` | Body: `{ steps }`, any of `vectors`, `text`, `compact`. A `manage.derived` job; compacting always runs last. |
| `POST /api/manage/cleanup/everything` | Body: `{ confirm: "erase everything" }`. A `manage.erase` job. `403 forbidden` unless the request comes from the computer Outpost runs on or the server was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`; `400` without the phrase. |

The three jobs answer a `CleanupResult` as their `result`: `removed`, `forgotten`,
`left`, `leftBehind` (files not deleted, with paths), `failed` (with reasons),
`stopped` and `notReached`. Stop one with `POST /api/jobs/:id/cancel`.

`POST /api/documents/move` also takes `ids`, to move only those documents.

## Portable drives

Types: `packages/shared/src/portable.ts`. See [portable.md](portable.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/portable/status` | Whether a packaged app is available, the Node version, and which runtimes are cached (`PortableStatus`). |
| `GET /api/portable/inspect` | Query: `path`. Whether that folder is already an Outpost drive, and its manifest. |
| `POST /api/portable/plan` | Body (`PortableRequest`): `targetPath`, `platforms`, `collectionIds`, `documents` (`all` or `none`), `reader?`, `replaceExisting?`. Answers a `PortablePlan`: sizes, free space, problems and warnings. Writes nothing. |
| `POST /api/portable/build` | Same body. Starts writing the drive, as a job. `409` if the plan has problems, or the folder is already a drive and `replaceExisting` is not true. |
| `POST /api/portable/runtimes` | Body: `platforms`. Downloads Node runtimes into the cache ahead of time, as a job. |

### Bringing changes back from a drive

Types: `packages/shared/src/merge.ts`. See
[portable.md](portable.md#bringing-changes-back-from-a-drive). Nothing here writes to
the drive. One merge is read or carried out at a time.

| Route | What it does |
| --- | --- |
| `GET /api/merge/inspect` | Query: `path`, a folder inside a storage root. Whether it is an Outpost drive, when and by which version it was written, and the sets of notes it holds: the current `data` folder and any `data-before-update-…` folders kept by an update (`DriveInspection`). Reads two small files; `403` outside the storage roots. |
| `POST /api/merge` | Body: `path`, `source?` (one of the folders named by `inspect`; the current one when omitted). Starts job `merge.analyse`, which copies the drive's database into the data directory and compares it with the library. `409` while another merge is being read or carried out. Answers the merge (`MergeDto`) in state `analysing`. |
| `GET /api/merge` | Earlier merges, newest first, without their previews or records. Query: `limit`. |
| `GET /api/merge/:id` | One merge. `analysis` (the preview, `MergeAnalysis`) once its state is `ready`: every item with its `key`, `kind`, `change`, the `choices` it allows and its `defaultChoice`, and `blocked` with the reason when it cannot be brought back. `report` once anything has been done: every action with its outcome, a sentence, and whether it can be undone. States: `analysing`, `ready`, `merging`, `completed`, `stopped`, `failed`, `discarded`. |
| `GET /api/merge/:id/compare` | Query: `key`. Both versions of one item as text, `home` and `drive` (`MergeCompareResponse`); pages are given as Markdown. Only while the merge is `ready`. |
| `POST /api/merge/:id/commit` | Body: `choices` (item key → `apply`, `skip`, `both`, `home` or `drive`; only those that differ from the defaults need sending), `deletionsConfirmed?`. Starts job `merge.apply`. `400` for a choice an item does not allow or a key not in the preview; `409` with `details.needsConfirmation` and `details.removing` when anything would be removed at home and `deletionsConfirmed` is not true. |
| `POST /api/merge/:id/cancel` | Stops the job. While reading, the merge is discarded. While merging, what was done stays, the merge becomes `stopped` and its record says how far it got. |
| `POST /api/merge/:id/undo` | Body: `removeDocuments?` (also remove documents the merge copied in; default false). Puts back what the record allows; each action then carries `undoMessage`. `409` unless the merge is `completed` or `stopped` and not already undone. |
| `DELETE /api/merge/:id` | Gives up a preview that was not carried out, or clears a failed one, and removes the copy of the drive's database. The record of a merge that was carried out cannot be deleted. |

What each choice means: `apply` brings the change home (for a removal: removes it at
home too); `skip` leaves home as it is and the item is offered again; `both` keeps
home's version and adds the drive's beside it; `home` keeps home's and remembers the
decision; `drive` replaces home's version, which is kept in the record.

## Everything else

Any other `GET` address without a file extension returns the web app, so that in-app
routes such as `/library` can be opened directly. An unknown address under `/api/`
answers `404 not_found` as JSON.
