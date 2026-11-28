# API reference

Every HTTP route the server registers, by module: method, path, what it takes and what
it gives. Shapes are TypeScript types in `packages/shared/src/<module>.ts`; a table names
the type rather than repeating it. The API is the web app's own interface: it is not
versioned and may change between releases.

## Conventions

### Same origin only

The server sends no CORS headers, so a page on another origin cannot call it from a
browser; scripts on your own machine can. A request must be addressed to a host name
the server answers to
([deployment.md](deployment.md#letting-other-devices-use-it-lan-access)), or it gets
`403 forbidden`.

### The `X-Outpost-Request` header

Every request that is not `GET`, `HEAD` or `OPTIONS` must carry `X-Outpost-Request: 1`
and must not come from another site (by `Origin` or `Sec-Fetch-Site`). Otherwise:
`403 forbidden`.

```bash
curl -X POST http://localhost:8080/api/notes \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"title": "Hello"}'
```

### Who may call what

There are no accounts. Any request that keeps the two rules above may call any route.
Who can reach the server is set at start: only this computer, unless
`OUTPOST_LAN_ACCESS` is on (`core/guard.ts`).

A few routes are **local only**: `403` unless the request comes from the computer the
server runs on (a loopback address or one of its own addresses, outside a container,
with no forwarding header), or the server was started with
`OUTPOST_ALLOW_REMOTE_ERASE=true`. They are erasing everything, restoring a backup,
deleting a stored backup, lowering how many are kept, setting or removing the backup
passphrase, `POST /api/database/reclaim`, `POST /api/system/restart`, the update routes
that install, and replacing or deleting HTTPS certificates. `POST /api/https/own` (a
private key) has its own rule. This is a rule about where a request comes from, not who
sent it ([security.md](security.md#erasing-everything)).

While a household PIN is set, every change from a device not unlocked answers `403
locked` (see [The household PIN](#the-household-pin)).

### Bodies

JSON unless a route says otherwise, at most 20 MB. Times are milliseconds since 1970
unless a field says ISO date. Ids are lower-case ULIDs.

### Errors

Every failure answers `{ "error": { "code", "message", "details"? } }` (`ApiErrorBody`).
`message` is written for people and can be shown as it is.

| Code | Status | Meaning |
| --- | --- | --- |
| `bad_request` | 400 | Not valid; `details.issues` for validation failures. |
| `forbidden` | 403 | Wrong host, missing header, another site, blocked download address, wrong PIN (`details.wrongPin`), not local. |
| `locked` | 403 | A change from a device not unlocked with the household PIN. |
| `not_found` | 404 | No such thing. |
| `conflict` | 409 | Clashes with the current state: exists, running, edited elsewhere. |
| `too_large` | 413 | Over a limit. |
| `unsupported` | 415 | A file type or feature not supported. |
| `too_many` | 429 | Rate limited; `Retry-After` or `details.retryAfterSeconds`. |
| `storage_unavailable` | 503 | A storage location is not connected or not writable (`details.locationId`). |
| `offline` | 503 | The server could not reach the internet. |
| `upstream` | 502 | Another server failed or answered badly. |
| `insufficient_space` | 507 | `details.requiredBytes`, `freeBytes`, `reserveBytes`. |
| `internal` | 500 | Unexpected; see the server log. |

### Live events

`GET /api/events` is a server-sent-events stream, with a comment line every 25 seconds.
Each event has a name and `data` `{ id?, data? }`. On shutdown the server sends
`server.stopping` and ends the stream; `EventSource` reconnects by itself. An event says
that something changed, not what it now is: fetch again.

| Event | Sent when | `id` / `data` |
| --- | --- | --- |
| `job.updated` | A job changes state or progress | job id / `JobDto` |
| `download.updated`, `download.removed` | A download changes, or leaves the list | download id |
| `storage.changed` | A location is added, changed, removed, (dis)connected or moved (not for free space) | |
| `settings.changed` | Settings saved | |
| `documents.changed` | A document added, changed or removed | document id |
| `notes.changed` | A page created, changed, moved, trashed or restored | page id; after a save `{ updatedAt, origin }` |
| `collections.changed`, `catalog.changed` | A collection or the catalogue changes | id when one |
| `maps.changed`, `repeaters.changed`, `layers.changed` | Map data, repeaters or reference packs change | |
| `imports.changed`, `merge.changed` | An import or a merge changes state | its id |
| `semantic.changed`, `portable.changed`, `https.changed` | Vectors, a portable drive, or HTTPS changes | |
| `chat.changed` | A conversation changes or a reply finishes | conversation id |
| `encryption.changed` | The key shelf changes | fingerprint |
| `backup.changed`, `update.changed`, `export-all.changed`, `database.changed` | Those modules' state changes | |
| `board.changed` | A message, check-in or file changes | `{ action, channel, kind?, author?, excerpt?, status? }` |
| `power.changed`, `games.changed`, `nuclear.changed`, `learning.changed`, `network.changed`, `household-papers.changed`, `readiness.changed`, `garden.changed`, `satellites.changed`, `mesh.changed` | Those modules' data changes | |

### Long work is a job

Long work (downloads, text extraction, moves, checks, index builds, imports, drives,
clean-ups) is a background job. The route that starts it answers at once, usually with
the job; progress comes as `job.updated` or from `GET /api/jobs/:id`. Jobs survive a
restart. A job cancelled part-way through work that cannot be undone keeps a `result`
saying what it had done. Queues are listed in
[development/server-modules.md](development/server-modules.md#jobs).

## The household PIN

Types: `access.ts`. Unlocking sets the `outpost_device` cookie (`HttpOnly`,
`SameSite=Strict`); a script unlocks once and sends it back. Five wrong PINs from an
address (an IPv6 /64), then one a minute, then `429 too_many`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/access` | `AccessState`: `mode` (`open`, `pin`), `canChange`, `pinSetAt`, `unlockedDevices`, `unlockedAt`. |
| `POST /api/access/unlock` | `{ pin }`. Unlocks this device. |
| `POST /api/access/lock` | Locks this device. |
| `POST /api/access/pin` | `{ pin, current? }`, 4 to 12 digits. Sets or changes the PIN; locks every other device. |
| `POST /api/access/remove` | `{ current }`. Back to no PIN. |
| `POST /api/access/lock-others` | Locks every other device. `{ access, locked }`. |

Routes that only read but are sent as `POST` (`READ_BY_POST` in `modules/access`) are
not locked.

## System

Types: `system.ts`, `common.ts`, `device.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | `{ status: "ok", version }`. |
| `GET /api/system` | `SystemInfo`: version, platform, memory, load, database size, `lanAccess`, jobs per queue. |
| `GET /api/events` | The live event stream. |
| `POST /api/system/restart` | Exits so the supervisor starts it again (applies a staged restore). Local only; `409` unless started with `OUTPOST_SUPERVISED=true`. |
| `GET /api/device/status` | `DeviceStatus`: each `DeviceCheck` (`state` `good`, `attention`, `problem`, `unknown`; `summary`, `advice`, `link`) and event-loop delay by minute. |
| `GET /api/device/clock` | The server's time, zone, and whether this request may set it (`ServerClock.setting`). |
| `POST /api/device/clock` | `{ deviceNow }`. Sets the server's clock. Local only unless `OUTPOST_ALLOW_REMOTE_CLOCK=true`; `400` before 2024 or after 2100. `{ now, movedMs }`. |
| `GET /metrics` | Prometheus text, only with `OUTPOST_METRICS=true` (`404` otherwise), only to loopback and private addresses. Names in `deploy/pi/monitoring.md`. |

### Jobs

| Method and path | Purpose |
| --- | --- |
| `GET /api/jobs` | `{ jobs }`, newest first. `active=true`, or `states` (comma list); `types`, `notTypes` (comma lists); `limit` (50, at most 200). |
| `GET /api/jobs/:id` | `{ job }`; `job.result` once finished. `job.progress.unit` says what it counts; `ratePerSecond` while it runs. |
| `GET /api/jobs/:id/detail` | `JobDetail` (`tasks.ts`): the job, its `samples` (at most 200, kept a week after it ends), its `events` (at most 100) and `waiting` (why it has not started). |
| `POST /api/jobs/:id/pause`, `/resume`, `/cancel` | Pause (kept), queue again, stop for good. |

### Settings

| Method and path | Purpose |
| --- | --- |
| `GET /api/settings` | `{ settings }` (`Settings`). |
| `PATCH /api/settings` | Any subset by key. Unknown key or bad value: `400`. `{ settings }`. |

Defaults are in `modules/settings/service.ts`. The main keys:

| Key | Default | Range or values |
| --- | --- | --- |
| `downloads.concurrency` | 2 | 1 to 8 |
| `downloads.rateLimitKbps` | 0 | kB/s across all downloads; 0 is no limit |
| `downloads.maxAttempts` | 8 | 1 to 20 |
| `indexing.concurrency` | 1 | 1 to 8 |
| `indexing.chunkSize` / `chunkOverlap` | 1200 / 150 | 300 to 4000 / 0 to 800 characters |
| `indexing.maxPdfPages` | 5000 | 0 (no limit) to 100000 |
| `ocr.auto` | false | OCR new scans as they are added |
| `ocr.languages` | `eng` | Tesseract codes joined by `+`; only installed ones are used |
| `search.semantic.enabled` | false | |
| `search.semantic.provider` | `built-in` | `built-in`, `openai-compatible`, `demo`, `none` (`transformers` is read as `built-in`) |
| `search.semantic.model` | `Xenova/all-MiniLM-L6-v2` | A local server's model name |
| `search.semantic.endpoint` | `http://127.0.0.1:11434/v1` | |
| `search.semantic.batchSize` | 16 | 1 to 256 |
| `search.hybrid.rrfK` | 60 | 1 to 1000 |
| `search.hybrid.keywordWeight` / `semanticWeight` | 1 / 1 | 0 to 10 |
| `search.includeReference` | true | |
| `answers.enabled` | false | |
| `answers.endpoint` | `http://127.0.0.1:11434/v1` | `http`/`https` without credentials; `/v1` added when there is no path |
| `answers.model` | empty | |
| `answers.temperature` | 0.2 | 0 to 2 |
| `answers.contextChars` | 6000 | 1000 to 60000 |
| `contacts.carddav` | false | The read-only address book for phones |
| `https.enabled` | false | Second listener on `OUTPOST_HTTPS_PORT` |
| `https.certificate` | `outpost` | `outpost` or `own` (the files in `tls/own`) |
| `https.names` | empty | Up to 20 extra host names or IP addresses |
| `maps.tileSource` | empty (newest daily build) | an address |
| `maps.terrainSource` | `https://download.mapterhorn.com/planet.pmtiles` | an address |
| `maps.defaultMaxZoom` | 14 | 0 to 15 |
| `storage.checkIntervalSeconds` | 30 | 5 to 3600 |
| `board.fileDays` | 7 | 0 (until removed) to 365 |
| `weather.updateOnOpen`, `weather.riversKm` | false, 8 | set through `PUT /api/weather/options` |
| `radio.licensed`, `radio.callsign` | | the licence setting |
| `tools.enabled` and the area switches, `medical.inSearch` | off | |

### HTTPS

Types: `https.ts`. Turned on with `https.enabled`; see
[deployment.md](deployment.md#https-on-your-network).

| Method and path | Purpose |
| --- | --- |
| `GET /api/https` | `HttpsStatus`: the two settings, `listening`, ports, `problem`, `addresses`, `names` on the certificate, `leftOut`, `authority` (name, fingerprint, dates, permitted names and blocks), `certificateExpiresAt`, `unavailable`, `inContainer`, `lanAccess`, `authorityRight`, and `own` (the `tls/own` folder, which files are there, `keyRight`, `expiry`, `problem`, and the certificate's details, trust and what it covers). Nothing secret. |
| `GET /api/https/outpost-authority.crt` | The authority's certificate, DER, `application/x-x509-ca-cert`; `?format=pem` for PEM. `404` until HTTPS has been on once. No route serves a private key. |
| `GET /api/https/outpost-authority.pem` | The same as a PEM attachment. |
| `POST /api/https/authority/replace` | New authority and server certificate. Local only; `409` on a portable drive. |
| `DELETE /api/https/authority` | Deletes the authority and its keys; turns HTTPS off unless an own certificate is in use. Local only. |
| `POST /api/https/own` | Multipart, one to three files of at most 256 KB (certificate, key, chain; PEM or DER; or one PKCS#12 with a `password` field). Checks them, writes `tls/own/fullchain.pem` and `privkey.pem`, turns HTTPS on with them. Allowed locally or over HTTPS; from another device over plain http only with the field `acceptKeyOverPlainHttp=yes` (logged), else `403`. `400` with the reason for files that cannot work; `409` on a portable drive, with a plainly wrong clock, or links in the folder; `413` over size. |
| `POST /api/https/own/use` | Uses the two files already in `tls/own`. Any device. `409` missing, `400` unusable. |
| `DELETE /api/https/own` | Deletes them; if in use, HTTPS goes off and `https.certificate` back to `outpost`. Local only. |
| `GET /api/https/own-root.crt`, `.pem` | The certificate devices must trust for an own certificate, when Outpost holds it. `404` otherwise. |

## Storage

Types: `storage.ts`, `database.ts`, `shares.ts`. See [storage.md](storage.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/storage/locations` | `{ roots, locations }`: each with capacity, status, usage by kind and `defaultFor`. |
| `POST /api/storage/refresh` | Checks every location now. |
| `GET /api/storage/browse` | Folders for the picker, inside the roots only. `path`. |
| `POST /api/storage/folders` | `{ parent, name }` → `{ path }`; created when added as a location. |
| `POST /api/storage/locations` | `{ name, path, kind, makeDefault? }`, `kind` `internal`, `external`, `network`, `volume`. |
| `PATCH /api/storage/locations/:id` | `name?`, `kind?`, `isDefault?: true`. |
| `DELETE /api/storage/locations/:id` | Forgets it; `409` while it holds content or is the last. Nothing on disk is deleted. |
| `PUT /api/storage/kind-defaults` | `{ kind, locationId }` (`maps`, `terrain`, `places`, `layers`, `collections`, `documents`; `null` for the default). `{ kindDefaults }`. |

### The database

| Method and path | Purpose |
| --- | --- |
| `GET /api/database` | `DatabaseStatus`: path, size, write-ahead log, free space, SQLite version, migrations, last backup, check and reclaim, what reclaiming needs, and `contents` (by group; null and `measuring` until worked out in a worker). |
| `POST /api/database/contents` | Works the contents out again; `database.changed` when done. |
| `POST /api/database/check` | `{ kind: "quick" \| "full" }`: a `database.check` job; result `DatabaseCheck`. `409` while a check or reclaim is under way. |
| `POST /api/database/reclaim` | A `database.vacuum` job. Local only. `409` when nothing is unused or anything else is running or writing (`details.waitingFor`); `507` without room. While it runs, every write on any path answers `409`, other queues wait, and `GET /api/backup/download` is refused. |

### Network shares

Outpost connects a share itself only when run directly on a Mac; `mode` says which case
applies (`macos`, `docker`, `linux`, `unsupported`), and elsewhere connecting answers
`415`. No response contains a password.

| Method and path | Purpose |
| --- | --- |
| `GET /api/storage/shares` | `{ mode, shares, hints }`. |
| `GET /api/storage/shares/discover` | `{ supported, servers }` announced on the network. |
| `POST /api/storage/shares/list` | `{ server, port?, userName, password }` → `{ shares, unusable }`. The password is not kept. |
| `GET /api/storage/shares/mounted` | `{ mounts }` already connected on this Mac, and whether each is usable. |
| `POST /api/storage/shares/adopt` | `{ mountPath }`: use one already connected. |
| `POST /api/storage/shares` | `ConnectShareRequest`: `server`, `port?`, `share`, `userName`, `password`, `rememberPassword`. `{ share, note? }`. |
| `POST /api/storage/shares/:id/reconnect` | `password?`, `rememberPassword?`; without, the Keychain's. |
| `POST /api/storage/shares/:id/disconnect` | `409` with `details.work` while in use, unless `{ confirm: true }`. |
| `DELETE /api/storage/shares/:id` | Disconnects, forgets it and its password. `confirm=true` as above. |

## Search

Types: `search.ts`, `semantic.ts`. See [search.md](search.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/search` | `SearchResponse`. `q` (≤500 characters), `kinds`, `tag`, `mode` (`keyword`, `semantic`, `hybrid`), `limit` (1 to 100, 20), `offset`, `reference` (`include` or `later`), `exact=1` (no other spellings or names). |
| `GET /api/search/reference` | `q`, `exact=1`, `scope` (`routed`, the default: the collections likeliest to hold the answer first; `all`). NDJSON (`ReferenceSearchEvent`): `start` `{ collections, more, ranked }`, `collection` lines as archives answer (`done: false` for a first look at its titles, replaced by its `done: true` line), `widen` `{ collections }` when the rest are asked because the first found too little, then `end` `{ searched, missing, message, more, tookMs }`. Results carry scores on one scale. Close the connection to stop. |
| `GET /api/search/stats` | `{ entities, chunks }`. |

`total` counts every match of the kinds asked for (at least that many when search by
meaning is in use); `relaxed` means fewer than five items held every word and items
holding most of them follow (`everyWord` counts those that hold all); `ignored` lists the
small words left out; `alsoSearched` the other spellings and names searched as well;
`didYouMean` (`{ query, words }` or null) a near word for one in no passage, offered
only while fewer than five results are found; `facets` are per kind; `warnings` name sources that could not
answer. Each result's `score` is 0 to 1 on one scale for every source, and `why` says in
a few words why it is there ([search.md](search.md#ranking)). With `reference=include`
the search waits up to 10 seconds for archives and counts their articles in `total`; with
`later` it leaves them to `/reference`, and `referenceToCome` says whether there are any.
Repeaters (kind `repeater`) and places in reference layers (`map-feature`) are answered by
their own modules and come in `places` (up to five, `placesFirst` when the query looks
like one of their names), or in `results` when their kind is asked for.

### Semantic search

| Method and path | Purpose |
| --- | --- |
| `GET /api/semantic/status` | `SemanticStatus`: enabled, ready, model, counts, other models' vectors, the `build` job, `secondsLeft`, `keptChunks`, `builtIn`. `?fresh=1` asks the model again. |
| `POST /api/semantic/index` | Starts or continues the build. `409` with no working provider. Turning the setting on starts it anyway. |
| `POST /api/semantic/use-built-in` | Turns it on with the shipped model. `409` when that model is not installed. |
| `POST /api/semantic/test` | `{ text }` → `{ modelId, dimensions, tookMs }`. |
| `DELETE /api/semantic/models/:modelId` | Deletes one model's vectors. `{ removed }`. |
| `GET /api/semantic/export` | Vectors as gzip JSON lines. `model`. |
| `GET /api/semantic/passages` | Passages with no vector yet for `model` (default: the one in use or chosen), as the model reads them, gzip JSON lines `{h, t}` after a header; `all=1` for every passage. For `scripts/build-vectors.mjs`. |
| `POST /api/semantic/import` | The exported file, `application/gzip`. `{ modelId, vectorsInFile, passagesUpdated, vectorsWithoutPassage }`; `400` for vectors of another size. |

Pause or cancel a build through `/api/jobs`. File format:
[search.md](search.md#moving-vectors-between-installations).

## Answers

One question, one answer from a model the person runs. Types: `answers.ts`. See
[ai.md](ai.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/answers/status` | `AnswersStatus`: `enabled`, `ready`, `reason`, `model`, `server`, `place`, `busy`. Does not contact the model server. |
| `GET /api/answers/models` | `{ models, message }` from the model server, while answers are on. |
| `POST /api/answers/test` | Asks for one word. `AnswerTestResult` (`ok`, `failure`, `message`, `models`, `reply`, `tookMs`). Always `200`. |
| `POST /api/answers` | `{ question (1 to 1000), mode? }`. Streams the answer. |

`POST /api/answers` answers `409` when not set up or when another answer is being
written (`details.busy`): one at a time, refused not queued. Otherwise it is a
`text/event-stream`, read with `fetch` since it is a `POST`:

| Event | Data |
| --- | --- |
| `sources` | First: `question`, `searchedFor`, `model`, `server`, `sources` (each `marker`, `kind`, `entityId`, `title`, `collection`, `url`, `page`, `heading`, `quote`, `safetyCritical`), `omitted`, `leftOut`, `safetyCritical`. Sent again if the server refused the passages as too long and fewer were sent. |
| `loading` | Ollama is loading the model. |
| `delta` | `text`: the next piece. |
| `done` | `outcome` (`answered`, `nothing-found`, `not-covered`), `text` when it differs, `used`, `unsupported`, `repointed`, `citesAll`, `cutShort`, `tookMs`. |
| `error` | `failure`, `message`, in place of `done`. |

Closing the connection stops the model. Nothing is stored.

## Chat

Types: `chat.ts`. See [ai.md](ai.md#chat). Every conversation is open to every caller.

| Method and path | Purpose |
| --- | --- |
| `GET /api/chat/status` | `ChatStatus`: `enabled`, `usable`, `reason`, `defaultModel`, `server`, `place`, `writingIn`, `tools`. No contact with the model server. |
| `GET /api/chat/models` | `{ models, message, ollama }`; with Ollama, size, parameters, quantisation, family, `writes`, `tools`. |
| `POST /api/chat/look-for-ollama` | `ChatLookResult` from Ollama's default address. Saves nothing. |
| `POST /api/chat/setup/look` | Asks `answers.endpoint`, then Ollama's defaults. `ModelSetupLook` with `recommended`. Saves nothing. |
| `POST /api/chat/setup/try` | `{ address, model }`. Asks for one word; on success saves the endpoint, model and `answers.enabled`. An address `look` would not ask is refused uncontacted. |
| `GET /api/chat/conversations` | `{ conversations }`, newest first, at most 500; `q`. |
| `POST /api/chat/conversations` | `title?`, `model?`, `useLibrary?`, `about?` (`{ kind: "document" \| "note", id }`). `ChatConversationDetail`. |
| `GET /api/chat/conversations/:id` | `{ conversation, messages, sentFrom }`. |
| `PATCH /api/chat/conversations/:id` | `title`, `model`, `useLibrary`. |
| `DELETE /api/chat/conversations/:id` | Stops any reply, deletes it. |
| `POST /api/chat/conversations/:id/messages` | `{ text (≤16,000), replaceLast? }`. Stores it, starts the reply, answers the detail at once. |
| `POST /api/chat/conversations/:id/regenerate` | Writes the last reply again. |
| `POST /api/chat/conversations/:id/stop` | Stops the reply; answers once it is stored. |
| `GET /api/chat/conversations/:id/stream` | The reply being written (below). |
| `POST /api/chat/messages/:id/note` | Saves a reply as a new page. `{ noteId, title }`. |

Sending and regenerating answer `409` with no model server (`details.setup`), no model
(`details.noModel`) or something already being written (`details.busy`): one reply or
answer at a time across Outpost.

A `ChatMessage` has `role`, `text`, `blocks` (`MarkdownBlock` tree), `state` (`writing`,
`complete`, `cut-short`, `stopped`, `failed`, `nothing-found`), `failure`, `notice`,
`model`, `grounded`, `sources` (passages, and lookups of kind `lookup` with `{ tool,
arguments, area, ok }`), `searchedFor`, `declined`, `used`, `unsupported`, `repointed`,
`citesAll`, `omitted`, `tookMs`, `createdAt`.

The stream is a `GET`: any number may watch, and leaving does not stop the model. A
comment line every 15 seconds.

| Event | Data |
| --- | --- |
| `idle` | Nothing is being written; the stream ends. |
| `start` | `messageId`, `phase` (`finding`, `loading`, `waiting`, `looking`, `writing`), `model`, `grounded`, `sources`, `searchedFor`, `omitted`, `startedAt`. |
| `phase` | `phase`; `sources` and `searchedFor` once known; `looking`, the tool's title. |
| `blocks` | `from`, `blocks`: replace from index `from` (a late joiner gets `from` 0). |
| `done` | `message` as stored; the stream ends. |

## Tools a model can call

Read-only tools Chat runs for a model ([ai.md](ai.md#looking-things-up-in-outpost)).
Types: `tools.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/tools` | `ToolsStatus`: `enabled`, `areas`, `offForModels`, `tools`, and `mcp` (`enabled`, `canChange`, `addresses`, `versions`). |
| `PUT /api/tools/mcp` | `{ enabled }`. Local only (`403` from any other device). |

The switches are settings. **`/mcp`** is the Model Context Protocol endpoint: `POST`
only, JSON-RPC 2.0, plain JSON answers, off by default (`403`). Outside `/api/`, so its
own rules apply ([mcp.md](mcp.md)). Methods: `initialize`, `ping`, `server/discover`,
`tools/list`, `tools/call`, and client notifications.

## Retrieval

Types: `modules/retrieval/types.ts`, `retrieval.ts`. The explain routes feed **How
search works**, run the real code and change nothing.

| Method and path | Purpose |
| --- | --- |
| `POST /api/retrieval/passages` | `{ query, limit?, kinds?, mode? }` → `{ query, passages }`. |
| `POST /api/retrieval/context` | Same plus `maxChars?` → `AssembledContext` (`text`, `citations`, `omitted`, `safetyCritical`). |
| `GET /api/retrieval/overview` | `ExplainOverview`: counts, passage lengths and settings, vector source. |
| `GET /api/retrieval/entities?q=` | `{ entities }` whose title matches. |
| `GET /api/retrieval/chunks?kind=&entityId=` | The passages one thing was cut into. |
| `POST /api/retrieval/explain` | `{ query, limit? (3 to 20) }` → `ExplainResponse`: terms, keyword and vector rankings, fusion, context, the prompt answers would send (not sent), timings. |
| `POST /api/retrieval/projection` | `{ query?, limit? (20 to 800) }` → passages in two dimensions by PCA. |

With no embedding provider, the vector stages use demonstration vectors and say so.

## Documents

Types: `documents.ts`, `calibre.ts`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/documents` | Multipart, at most 200 files. Optional `category`, `tags`, `locationId`, `allowDuplicate`, `source` (≤1,000), `title` (≤300, one file only). `{ results }`, each `created`, `duplicate` or `rejected`. |
| `GET /api/documents` | `DocumentListResponse`. `q`, `category`, `tag`, `type` (`pdf`, `markdown`, `text`, `html`, `epub`, `image`, `audio`), `sort` (`added`, `title`, `size`), `order`, `limit` (50, ≤200), `offset`, `chapters`. Book chapters are left out unless `q` or `tag` is given or `chapters=true`. |
| `GET /api/documents/facets` | Counts by category, tag and type (no chapters). |
| `GET /api/documents/:id` | `{ document }`: with `scanPages`, `ocrPages`, `ocrDetail`, and `chapter` for a book's chapter. |
| `PATCH /api/documents/:id` | `title`, `description`, `category`, `author`, `source`, `language`, `tags` (replaces the list). |
| `DELETE /api/documents/:id` | Deletes it and its file; `forget=true` keeps the file. |
| `POST /api/documents/:id/reextract` | Reads the text again (keeps OCR text). `{ document, jobId }`. |
| `POST /api/documents/:id/ocr` | OCR of a scanned PDF or a PNG, JPEG, GIF or WebP, as a job on the `ocr` queue. `{ redo? }`. `415` unsupported or unavailable, `409` busy or nothing left, `503` disconnected. |
| `GET /api/ocr` | `OcrStatus`: available, engine, languages, missing, folder, `auto`, limits. |
| `GET /api/documents/:id/text` | Extracted text by section (`ocr: true` where read by OCR). `page`. |
| `GET /api/documents/:id/markdown` | A Markdown document as a tree of plain values, never HTML: headings with ids, paragraphs, lists, quotes, code with `lang`, tables, inline runs; links as `link`, `jump` or `ref` (`outpost:entry/<id>/<chapter>`, resolved). `415` not Markdown, `413` over 2 MB. |
| `GET /api/documents/:id/pictures/:number` | A picture a Markdown document carries (1 to 9999), only PNG, JPEG, GIF or WebP, sandboxed. |
| `GET /api/documents/:id/epub` | `DocumentEpubResponse`: title, author, language, cover, chapters (≤2,000), contents, notes. `415` with `details.reason` `protected` (DRM, never opened) or `damaged`. See [epub.md](epub.md). |
| `GET /api/documents/:id/epub/chapters/:position` | One chapter as the same tree, plus `sup`, `sub`, `anchor`, `picture`, `chapter` links, `figure`, note quotes and plain tables; `notes` says what was left out. `413` over 2 MB or 120,000 tags; `415` nested too deeply. |
| `GET /api/documents/:id/epub/file?path=` | A picture from the book: a clean relative path; only PNG, JPEG, GIF, WebP or SVG by their bytes (`415` otherwise), ≤16 MB. An SVG ≤2 MB with no script, handlers, `foreignObject` or entities, sent as a download. |
| `GET /api/documents/:id/file` | The original file, sandboxed, with ranges and `ETag`. `download=1`. |
| `GET /api/documents/:id/highlights`, `POST` | Highlights; `POST` takes `exact`, `prefix`, `suffix`, `page` or `chapter`, `note`. The file is not written to. |
| `POST /api/documents/:id/highlights/to-notes` | A page of the highlights (all or `highlightIds`). `{ note }`. |
| `GET /api/highlights` | Highlights matching `q`. |
| `PATCH /api/highlights/:id`, `DELETE` | Change the note (with optional `baseUpdatedAt`: `409` if saved since), or delete. |
| `POST /api/documents/move` | `{ locationId, ids? }`: moves documents there, as a job. |
| `GET /api/tags` | `{ tags }` with counts. |
| `GET /api/documents/:id/book` | Calibre details (`authors`, `series`, `seriesIndex`, `coverUrl`, `inCalibreFolder`), or `null`. |
| `GET /api/documents/:id/cover` | The kept cover picture. |

Accepted: PDF, EPUB, Markdown, text (`.txt`, `.csv`, `.json`), HTML, images (`.png`,
`.jpg`, `.gif`, `.webp`, `.svg`) and audio (`.mp3`, `.m4a`, `.m4b`, `.aac`, `.ogg`,
`.oga`, `.opus`, `.flac`, `.wav`). A file must be what its extension says. An identical
file (same SHA-256) is a `duplicate` unless `allowDuplicate`.

### Audiobooks

A multi-file audiobook is a book collection with `meta.audiobook`; one file alone is a
document of type `audio`. Both play from `/api/documents/:id/file`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/audiobooks` | `AudiobookListResponse`. `q`, `sort` (`added`, `title`). |
| `GET /api/audiobooks/:id` | The book by collection id or any chapter's id, or one audio document. `404` otherwise. |
| `POST /api/audiobooks` | Multipart: one `.zip` or audio files; `title`, `librivoxId`, `locationId`. `202 { job }` (`audiobook.add`): unpacks safely, orders by track or name, files under `collections/audiobooks/<title>/`. Result `AudiobookAddResult`. |
| `GET /api/audiobooks/librivox` | The shelf from `catalog/audiobooks.json`, with `inLibrary`. Contacts nobody. |

### Calibre libraries

Reading a library only reads its folder.

| Method and path | Purpose |
| --- | --- |
| `POST /api/calibre` | `{ locationId, relPath }`, symlinks followed and held to storage (`403`). Job `calibre.read`; `CalibreImportResponse` with a `CalibrePlan` (books, bytes, covers, `leftOut`, `beyondLimit` past 20,000). |
| `GET /api/calibre` | Latest imports. `limit` (20, ≤100). |
| `GET /api/calibre/:id` | One import with plan, options, progress and `report`. |
| `POST /api/calibre/:id/commit` | `{ mode: "copy" \| "in-place", locationId? }`. Job `calibre.import`; `507` without room for a copy. Re-committing a failed import adds what is missing. |
| `POST /api/calibre/:id/cancel` | Stops; books added stay. |
| `DELETE /api/calibre/:id` | Discards a plan not carried out. |

## Notes

Types: `notes.ts`. See [notes-and-imports.md](notes-and-imports.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/notes/tree`, `/recent`, `/favorites`, `/trash`, `/templates` | The sidebar tree, recently opened (`limit` 20), starred, trash, templates. |
| `GET /api/notes/lookup` | Pages whose title contains `q`. |
| `POST /api/notes` | `CreateNoteBody`: `parentId`, `title`, `icon`, `content`, `templateId`, `afterId`, `clientId` (8 to 64 characters: becomes the id, so a repeat returns the same page). |
| `GET /api/notes/:id` | `NoteDetail`: content, tags, breadcrumbs, backlinks, children. `view=1` records the visit. |
| `PATCH /api/notes/:id` | `UpdateNoteBody`: `title`, `icon`, `content`, `tags`, `isFavorite`, `coverAttachmentId`, `isTemplate`, `baseUpdatedAt`, `removeEncryption`, `origin`. `409` with `details.current` if the page is newer than `baseUpdatedAt`. |
| `POST /api/notes/:id/move` | `{ parentId, afterId }`. |
| `POST /api/notes/:id/duplicate` | `{ withChildren? }`. |
| `DELETE /api/notes/:id` | To the trash with sub-pages; `?permanent=1` deletes a trashed page for good. |
| `POST /api/notes/:id/restore` | Out of the trash. |
| `POST /api/notes/:id/discard` | Deletes the page for good only if it holds nothing (no title, icon, tags, cover, sub-pages or text): `{ discarded }`. The app sends it when a page made by New page is left untouched. |
| `GET /api/notes/:id/versions`, `/:versionId` | Earlier versions; one with content. |
| `POST /api/notes/:id/versions/:versionId/restore` | `{ baseUpdatedAt }`. The current version is kept as a version. |
| `GET /api/notes/versions/space`, `DELETE /api/notes/versions` | Space used by versions; erase them all. |
| `GET /api/notes/:id/export.md`, `GET /api/notes/export.zip` | One page as Markdown; everything as a zip. |
| `POST /api/attachments` | One file, ≤50 MB, optional `noteId`. |
| `GET /api/attachments/:id`, `DELETE` | The file (sandboxed); delete (`409` while used). |

**Encrypted pages.** A page is encrypted when its whole `content` is one `pgp-message`
code block holding one armoured OpenPGP message; `GET` then gives `encrypted: true`.
The server cannot decrypt it. A `PATCH` that swaps text and ciphertext, or one message
for another, needs `baseUpdatedAt`; ciphertext to text also needs
`removeEncryption: true`. Templates cannot be encrypted. No preview, links or passages
are kept for an encrypted page, and the save that encrypts it erases the old text from
the database file.

## Encryption

Types: `encryption.ts`. A shelf for keys: the server does no cryptography and no route
takes a passphrase, an unprotected private key, or anything to encrypt or decrypt.

| Method and path | Purpose |
| --- | --- |
| `GET /api/encryption/keys` | `{ keys }` (`StoredKey`): fingerprint, public key, `hasPrivateKey`, `mine`, dates. |
| `PUT /api/encryption/keys` | `{ publicKey (one, ≤100 kB), mine? }`. Filed by its fingerprint. `400` for anything else; `413` at 500 keys. |
| `GET /api/encryption/keys/:fingerprint/private` | The passphrase-protected private key, `no-store`. |
| `PUT /api/encryption/keys/:fingerprint/private` | `{ privateKey }`; `400` unless every secret part is protected by a stretched passphrase. |
| `DELETE /api/encryption/keys/:fingerprint/private` | Stops keeping the private half. |
| `DELETE /api/encryption/keys/:fingerprint` | Deletes both halves. |

`:fingerprint` is 40 hex digits (64 for a version 6 key).

## Imports

Types: `imports.ts`. See [notes-and-imports.md](notes-and-imports.md).

| Method and path | Purpose |
| --- | --- |
| `POST /api/imports` | Multipart, ≤500 files: `.md`, `.markdown`, `.txt`, `.html`, `.htm`, `.pdf`, `.csv`, `.zip`. Analysis starts. `{ import }`. |
| `GET /api/imports` | Recent (`limit` 30), with counts. |
| `GET /api/imports/:id` | With the plan and, later, the report. |
| `POST /api/imports/:id/commit` | `ImportOptions`: `duplicates` (`skip`, `copy`, `replace`), `pdfs` (`library`, `skip`), `parentId?`, `replaceConfirmed?`. |
| `POST /api/imports/:id/cancel`, `DELETE` | Stop; discard with its uploads. |

## Collections

Types: `collections.ts`, `kiwix.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/collections` | `kind` (`zim`, `map`, `terrain`, `places`, `file`, `model`, `dataset`). |
| `GET /api/collections/:id` | `{ collection }`. |
| `DELETE /api/collections/:id` | `deleteFiles` **required** (body or query): `true` deletes the file, `false` only the record. |
| `POST /api/collections/:id/verify` | Checksum check as a job; result `CollectionVerifyResult`. |
| `POST /api/collections/:id/move` | `{ locationId }`, as a job. |
| `GET /api/collections/:id/chapters` | A book's contents (`BookContentsResponse`). |

### Reference collections (Kiwix)

| Method and path | Purpose |
| --- | --- |
| `GET /api/kiwix/status` | `ReferenceStatus`: `mode` (`external`, `managed`, `none`), `available`, `problem`, `books`. |
| `GET /api/kiwix/books` | Readable books with `contentBase` and `frameBase`. |
| `GET /api/kiwix/books/:collectionId` | One book, or why it cannot be read. |
| `GET …/:collectionId/suggest` | Up to ten titles for `q` (≤200). |
| `GET …/:collectionId/search` | Full text: `q` (≤300), `offset`, `limit` (20, ≤50) → `{ total, results }`. |
| `GET …/:collectionId/documents` | The document list of a nautilus collection: `q`, `offset`, `limit` (0 to 500) → `ArchiveDocumentsResponse` (`list` null for an ordinary archive; files with `path`, `kind`, `documentId`, `adding`, `problem`). |
| `POST /api/kiwix/import` | `{ locationId, relPath, title? }`: registers a `.zim` already on storage. `409` if already there. |
| `POST …/:collectionId/files/save` | `{ path, title? }`: copies a PDF, EPUB, Markdown or text file out of the archive into the library, offline. `{ status: created \| already \| duplicate, document }`; `507` without room. |
| `POST …/files/check` | `{ paths (≤500) }` → each `new`, `saved` or `adding`. |
| `POST …/files/sizes` | `{ paths (≤500) }` → sizes from headers (three at a time, ≤8 s, remembered). |
| `POST …/files/add-all/plan` | `ArchiveAddScope` (`{ kind: "list", q? }` or `{ kind: "files", files (≤300) }`) → `ArchiveAddPlan`: count, already, bytes, unsized, location, `refusal`. |
| `POST …/files/add-all` | Starts `kiwix.add-files` on `reference-files`. `{ job, already }`; `507`, `409` nothing to add, `502` unreadable. Result `ArchiveAddResult` (`stopped`: `cancelled`, `space`, `storage`, `unreadable`). |
| `GET …/files/add-all` | The current or last such job. |
| `GET`, `HEAD /kiwix/open/*` | The sandboxing proxy for article content (not under `/api/`). Only `content/…` and a book's icon. Every answer carries a `sandbox` CSP without `allow-same-origin`, plus a small script that reports the page, its links and video endings and stands in for storage. `502` while kiwix-serve is down. See [security.md](security.md#reference-zim-content). |

## Downloads

Types: `downloads.ts`. Downloads are started by the catalogue, maps, links and other
modules, not here. `kind`: `zim`, `map`, `terrain`, `places`, `file`, `model`,
`document`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/downloads` | Unfinished, and the 50 latest finished: `DownloadsResponse` with `historyTotal`. |
| `GET /api/downloads/history` | Finished, a page at a time (`offset`, `limit` 50, ≤200). |
| `GET /api/downloads/plan` | `DownloadPlan`: active, waiting, paused, estimated times, room per location. |
| `GET /api/downloads/:id` | `DownloadDetail`: source, mirror, checksums, destination, timing, speeds, history, attempts. |
| `POST /api/downloads/pause-all`, `/resume-all` | All at once. |
| `POST /api/downloads/:id/pause`, `/resume`, `/cancel`, `/retry` | Pause keeps the partial file; retry continues from it. |
| `DELETE /api/downloads/:id` | Off the list, with any partial file. A completed file is never deleted. |

### Links

Fetches a file a reference page links to but its archive lacks, as a download of kind
`document`. Types: `links.ts`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/links/save` | `{ url, title?, foundIn?, locationId? }` → `{ download }`, or `{ already: "saved" \| "saving" }`. |
| `POST /api/links/save-all` | `{ links (1 to 200), foundIn?, locationId? }` → `{ queued, already, refused }`. |
| `POST /api/links/check` | `{ urls (≤500) }` → each `new`, `saved`, `saving` or `unsupported`. Fetches nothing. |

A link must be `http`/`https`, carry no credentials, and end in a kind of file the
library keeps (not a web page). Private and local addresses are refused (`403`), for
every hop, unless `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`. What arrives must be what its
name says.

### Web pages

One page, fetched because a person asked, kept as a readable copy. Types: `webpages.ts`.
Each takes exactly one address.

| Method and path | Purpose |
| --- | --- |
| `POST /api/webpages/preview` | `{ url }` → `WebPagePreview`: `previewId`, final and requested URL, title, byline, site, date, language, words, excerpt, `pictures` (count, hosts), `existing` copies, `limits`. Held in memory for fifteen minutes; waits up to 20 seconds; pictures not fetched. |
| `POST /api/webpages/save` | `SaveWebPageRequest`: `url`, `previewId?`, `pictures?`, `keepBoth?` or `replaceDocumentId?` (one required when already saved), `locationId?`. `{ job }` (`webpage.save`); result `SaveWebPageResult`. |

Errors: `400` not one plain address; `403` private or local (also by redirect); `409`
already saved without a choice (`details.existing`), or too many being read; `413` over
5 MB or 50,000 elements; `415` not a readable page; `502` site error or too slow; `503`
unreachable.

## Catalogue

Types: `catalog.ts`. See [catalog/README.md](../catalog/README.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/catalog` | `CatalogResponse`: categories, entries, packs, manifests, problems, last refresh. Works offline. |
| `POST /api/catalog/refresh` | Asks each source what it offers. `503 offline` without a connection. |
| `POST /api/catalog/entries/:id/download` | `{ locationId? }` → `{ download, replacesCollectionId }`; an older installed version is removed once the new one is verified. |
| `POST /api/catalog/packs/:id/install` | `{ locationId?, entryIds? }` → `{ queued, added, already, failed }`. |
| `POST /api/catalog/entries/:id/add` | Adds an entry that ships with Outpost, offline. `{ collectionId, documentId?, chapterCount?, replacedCollectionId }`. |

## Maps

Types: `maps.ts` and the files named below. See [maps.md](maps.md).

### Regions and tiles

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/regions` | Ready-made regions, with installed and downloading state. |
| `POST /api/maps/estimate` | `{ bbox [w,s,e,n], maxZoom, minZoom?, tileType? }` → `MapEstimate` (exact size). Needs a connection. |
| `POST /api/maps/regions` | `{ name, bbox, maxZoom, minZoom?, regionId?, locationId?, includeTerrain? }` → `{ downloads }`. |
| `GET /api/maps/data` | Everything kept for the map, by country (six rows: map, terrain, names, roads, places, country file; a seventh, streets for routes, where the streets service is installed), world, other areas and kept country files, each with size, location, data date, state and its download or task (`MapDataResponse`). Asks nothing outside. |
| `POST /api/maps/data/add` | `{ regionId?, kinds, keep?, locationId?, layers?, newerThan?, map?, country? }` → `{ countryFile, downloadIds, taskIds }`. `keep` is required whenever roads, places or the country file are asked. Remembers `keep` as `maps.countryFileKeep`. `409` while that region's country file is already coming. |
| `POST /api/maps/import` | `{ locationId, relPath, name, tileType? }`: registers a `.pmtiles` file. |
| `GET /api/maps/overview` | `MapOverview`: regions, place-name datasets, counts. |
| `GET /api/maps/sources` | `MapSources`: tile addresses, bounds, zooms, glyphs, sprites, attribution, imagery sets. |
| `GET /api/maps/tiles/:z/:x/:y.mvt` | A vector tile from the best region; `ETag` names the region; `204` where none has it. `?raw=1` sends a gzipped tile as stored (`X-Outpost-Tile-Encoding: gzip`, `no-store`), for a browser keeping it. |
| `GET /api/maps/terrain/:z/:x/:y.webp` (or `.png`) | A terrain tile, likewise. |
| `GET /api/maps/terrain-profile` | `from`, `to` (`lat,lon`, ≤1,000 km apart) → `TerrainProfile` (`radio.ts`): up to 4,096 heights, `null` and `gaps` where no terrain. |
| `GET /api/maps/height` | `at` → `PointHeight`: `heightMeters`, `cellMeters`, or `null`s. |
| `GET /api/maps/sight-range` | `at`, `aerial`, `station` (0 to 1,000 m) → `SightRange` (`radio-range.ts`): viewshed on 720 bearings to 100 km, `seen` bits base64, `bearings`, `shares`, `typicalMeters` (median over the bearings of the furthest ground in sight, none in sight counting 0; null with no terrain), `coverage` (`terrain`, `partial`, `none`, with `horizonMeters`). About 190 kB (15 kB compressed), cached; the ground read for a place is kept, so other heights there are quick. With `Accept: application/x-ndjson`, a line at a time (`SightRangeEvent`): `start` (`expectMs`, the last fresh read here), `progress`, `part` (the range to 25 km, then 50 km), `end` (the whole answer); compressed. Closing the request stops the work unless someone else is waiting for the same place. |
| `GET /api/maps/relay` | `a`, `b` (≤200 km), `aHeight`, `bHeight`, `relay` → `RelayPlan`: up to eight highest and eight nearest places in sight of both, and `both` as a range. |
| `GET /api/maps/walk-reach` | `at`, `minutes` (30, 60, 120, 240, 360, 480; 90 and 180 still answered), `pace` (`standard`, `slower`, `slowest`) → `WalkReach` (`walk-reach.ts`): Tobler's function over terrain, faster on paths, barred by water, cliffs and slopes over 45°; `minutesGrid` one byte a cell, the cell growing with the time so the grid stays about 800 cells a side. Reachable from here on foot. |
| `GET /api/maps/walk-reach/progress` | the same query → `{ share }`: 0 to 1 while that walk is worked out, 1 once known, null when not asked. |
| `GET /api/maps/area-size` | `bbox`, `maxZoom`, `terrain=1` → `MapAreaSize`: tiles and bytes per layer from the archives' directories. `413` past 12,000 tiles a layer. |

Bad input is `400`; nothing here downloads. `?raw=1` and `area-size` serve
[keeping a map area on a phone](offline.md#a-phone-out-of-reach-of-the-server); the
shared tile arithmetic is in `kept.ts`.

### Satellite imagery

Types: `imagery.ts`. An installed set is a map collection (`meta.map.tileType:
"imagery"`), managed through the collections routes.

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/imagery` | `ImageryOverview`: sets, world entries, sources with licence and credit, area limits. Contacts nobody. |
| `POST /api/maps/imagery/scenes` | `{ bbox, from?, to? }` → `SceneSearchResponse`: Sentinel-2 passes (covering first, then least cloudy) and, where available, aerial-photograph surveys first. Each option's `key` lasts an hour. Needs a connection. |
| `POST /api/maps/imagery/estimate` | `{ bbox, sceneKey, locationId? }` → `ImageryEstimate`: bytes, requests, size, time, cloud, warning, free space. `400` over 10,000 km² (aerial: 40,000 tiles or 1.5 GB). |
| `POST /api/maps/imagery/areas` | `{ bbox, sceneKey, name, locationId?, acceptLarge? }` → `{ download }`. Over 2,500 km² (aerial: 10,000 tiles or 300 MB) needs `acceptLarge`. |
| `POST /api/maps/imagery/world` | `{ entryId: blue-marble-2km \| blue-marble-500m, locationId? }`. |
| `GET /api/maps/imagery/:id/:z/:x/:y.webp` | A tile, cached immutably; `204` where none. `?raw=1` as for map tiles. |

### Reference layers

Types: `reference-layers.ts`. See [reference-layers.md](reference-layers.md). A pack is a
collection (`kind: "dataset"`). Estimating and downloading are `POST` because they ask a
server on the internet.

| Method and path | Purpose |
| --- | --- |
| `GET /api/reference/catalogue` | Providers with licence, quoted terms, date read, verdict, `clientName`; linked-only sources; countries. Contacts nobody. |
| `POST /api/reference/estimate` | `{ provider, scope (countries?, bbox?, regions?), layers?, clientNameAgreed? }`. Refused (`400`) without `clientNameAgreed` where the provider is sent a name, and for the whole world unless published that way. Each item's size and how it was worked out, the total, notes. `estimateId` lasts half an hour. `scope.regions`: up to three Geofabrik ids from the kept list, with `databaseBytes` and `fileKeptByDefault`. |
| `POST /api/reference/downloads` | `{ estimateId, keys, locationId?, keepFile? }` → `{ downloads, tasks }`. A Geofabrik item is its country file: downloaded once, or read again where it is kept (a task, no download). `409` for an expired estimate. |
| `GET /api/reference/regions` | `lat?`, `lon?` → Geofabrik's list as kept (`held`, `readAt`, `regions`, `suggested`). Contacts nobody. |
| `POST /api/reference/regions` | Fetches and keeps that list (~500 kB). |
| `GET /api/reference/packs` | `ReferencePackDto`s: source, layers, countries, version, dates, records, size, licence, location, `notes`. |
| `DELETE /api/reference/packs/:id` | Removes a pack; `?deleteFiles=1` its file too. |
| `POST /api/reference/imports` | Multipart: `format` (`features-csv`, `geojson`, `historical-csv`, `country-figures-csv`, `osm-pbf`, `worldpop-tif`), `title`, `options` (JSON: layer, provenance, publisher, licence, accuracy, source, date, CRS, country), `replaces?`, file ≤32 MB. Nothing stays on the drive if refused. `{ jobId }`; result `imported`, `skipped`, `duplicates`, `problems`. |
| `POST /api/reference/imports/from-storage` | The same for a file on storage, left where it is. |
| `GET /api/reference/templates/:format.csv` | A CSV form's columns. |
| `GET /api/reference/layers` | What is installed by layer, population grids, credits. |
| `GET /api/reference/features` | `bbox`, `zoom`, `layers`, `countries?`, `providers?`, `kinds?` → up to 1,500 `points` or counted `cells`, and `shapes`. Flood zones only from zoom 11, ≤3,000 (`floodZones`: `zoom-in`, `too-many`). |
| `GET /api/reference/at` | `lat`, `lon`, `layers` → up to ten areas containing the point. |
| `GET /api/reference/features/:id` | One record with its sources, `airportFrequencies` for an airport, `food` (`FoodFactsDto`) for a food place. |
| `GET /api/reference/search` | `q`, `layers?`, `limit` (≤100), `near?` (`lat,lon`: nearest first, each with `distanceMeters` and the `place` it is near). |
| `GET /api/reference/nearest` | `lat`, `lon`, `layer` (`food`), `kind?`, `limit` (1 to 20), `any?` (`1`: the nearest few of the layer whatever their kind, rather than the nearest of each kind) → nearest hits with distance and bearing, within 100 km. |
| `GET /api/reference/figures` | Country figures with citations. |
| `GET /api/reference/population/grid` | `bbox`, `zoom` → cells and legend. |
| `GET /api/reference/population/sum` | `lat`, `lon`, `radiusKm` (≤300) → people in the circle, two significant figures. |
| `GET /api/reference/historical` | `recordType?`, `limit`, `offset` → historical records for the nuclear workspace. |

### Places

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/places` | `q`, `limit` (≤50), `near`, `country` (two letters: the household's, put first with the country `near` is in) → `PlaceSearchResponse`. A position (coordinates, grid reference, locator) fills `coordinate`; `otherReadings` when the text could mean two. `notice` when no place had every word and the search was loosened (a kind word, a word left out, a slip of a letter); `nearest` (`hospital`, `pharmacy`, `shelter`, `water`, `fuel`) when the text asks for the nearest of a kind. |
| `GET /api/maps/places/datasets`, `POST`, `DELETE …/:id` | Place-name datasets: `{ dataset: cities500 \| cities15000 \| country, country?, locationId? }`. |
| `POST /api/maps/places/os-names/check` | Asks `api.os.uk` for the current OS Open Names edition (`OsNamesCheck`); kept half an hour. |
| `POST /api/maps/places/os-names` | `{ locationId?, roads? }`: downloads that edition. `409` without a recent check or if installed. |

### Markers and tracks

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/markers`, `POST`, `PATCH …/:id`, `DELETE …/:id` | `name`, `lat`, `lon`, `note?`, `color?`, `icon?` (one of `MARKER_ICONS`; `pin` by default), `isFavorite?`, `noteId?`. |
| `GET /api/maps/tracks` | `{ tracks }`. |
| `POST /api/maps/tracks` | A drawn route: `{ name, points (≥2), description?, color? }` → `{ track, elevation }`. |
| `PUT /api/maps/tracks/:id/points` | Redraws the line through `points`; waypoints kept. |
| `POST /api/maps/tracks/import` | One GPX, ≤20 MB; `name`, `color`, `importWaypointsAsMarkers`. |
| `POST /api/maps/files/preview` | One GPX, KML, KMZ or GeoJSON, ≤20 MB; reads, saves nothing. |
| `POST /api/maps/files/import` | The same file: lines to one track (rings as `_outline` lines), points to markers; KML with lines in several `Folder`s to one track each (`moreTracks`). |
| `PUT /api/maps/recordings/:id` | A recorded track: `:id` 26 characters chosen by the device; multipart `name`, `color?` and a GPX of tracks with times, ≤150,000 points. A repeat answers `alreadySaved`. |
| `GET /api/maps/tracks/:id`, `PATCH`, `DELETE` | GeoJSON; `name`, `description`, `color`. |
| `GET /api/maps/tracks/:id/export.gpx` | One track. |
| `GET /api/maps/export.gpx` | `markers=1`, `tracks=<ids>`; icons as Garmin `<sym>`. |
| `GET /api/maps/tracks/:id/export.kml`, `.geojson`; `GET /api/maps/export.kml`, `.geojson` | The same as KML 2.2 (a `Folder` per route, outlines as `Polygon`) or GeoJSON (`kind`: `route`, `area`, `waypoint`, `place`). |

### Finding a route

Types: `route-finder.ts`. Searching and previewing each make one request to a route
source on the internet; the rest is local.

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/route-sources` | Sources, the default, file problems, and the `clientName` a search sends. |
| `POST /api/maps/route-search` | `{ text? (3 to 80), bbox? (≤2° a side), sourceId? }` → up to 40 routes and 20 named paths. `503 offline`, `502` busy or bad answer, `409` another search running. |
| `POST /api/maps/route-search/preview` | `{ ref, sourceId? }` → `RoutePreview` with a `token`. `413` too large. |
| `POST /api/maps/route-search/add` | `{ token, name?, color?, includeAlternatives? }` → `{ track, elevation }`. A token makes one route; a repeat returns it. `409` when the preview has lapsed (15 minutes, or evicted past 600,000 points or 200 previews). |
| `POST /api/maps/tracks/:id/heights` | Reads heights again for a found route. `400` for drawn, imported or redrawn tracks. |

A found track carries `source` (`TrackSource`): credit, licence, OSM element, when and
from where.

### Streets for routes

Types: `streets.ts`. The optional streets service (Valhalla, the Compose profile
"routes"): door-to-door drives, walking and cycling, reachable areas. Without it, every
route here answers `415` with what to do, and a drive's reachable area comes from the
installed road networks ("Main roads only"). Shapes and behaviour:
[development/street-routes.md](development/street-routes.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/streets/status` | `state`, `installed`, `message`, the streets in use, a build under way, the modes available, kept country files to build from. |
| `POST /api/streets/route` | `{ points, mode: drive-door \| walk \| cycle, units?, crossing? }` → Outpost's road route with streets at each end, or streets all the way, as turn-by-turn lines. A walk or a ride is re-timed over installed terrain and carries `hills` (climb, descent, highest, lowest, steepest 250 m, a profile of at most 200 points, the time on the flat); null with no terrain along it, and a warning says so. `400` "Streets are not installed for France". |
| `POST /api/streets/reach` | `{ point, mode: drive \| walk \| cycle, minutes: one to three of 15, 30, 60, 90, 120 (drive, cycle) or 30, 60, 120, 240, 360, 480 (walk), source? }` → GeoJSON areas, smallest time first, labelled "Streets" or "Main roads only". |
| `POST /api/streets/tiles/estimate` | `{ regions }` → time, memory, disk writes and space a build takes, with the warnings to show. |
| `POST /api/streets/tiles` | `{ regions, workLocationId? }` or `{ import: { locationId, relPath } }` → `{ jobId, estimate }` (task `streets.build`). `409` while one runs. |
| `DELETE /api/streets/tiles` | Deletes the streets in use. |

## Contacts

Types: `contacts.ts`. See [contacts.md](contacts.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/contacts` | `q`, `tag`, `emergency=1`, `limit` (300, ≤1,000), `offset` → marked first, then by family name, with `total`, `all`, `emergency`, `tags`. |
| `POST /api/contacts` | `ContactFields` with `markerId?`, `pageIds?`. `400` with no name, number or address; `409` at 20,000. |
| `GET /api/contacts/:id` | With linked place and pages, and `otherFields`. |
| `PATCH /api/contacts/:id` | Fields given; `baseUpdatedAt` → `409` if changed. |
| `DELETE /api/contacts/:id` | |
| `GET /api/contacts/emergency` | The marked contacts, whole. |
| `GET /api/contacts/export.vcf` | `version` (`3.0`, `4.0`), `ids`, `tag`, `emergency=1`. |
| `POST /api/contacts/import/preview` | One vCard file (≤50 MB) or `{ picked }` from the contact picker → `ContactImportPreview` (fresh, already here, duplicates side by side, unreadable). Token lasts half an hour. |
| `POST /api/contacts/import/apply` | `{ token, choices?, leaveOut? }`; choices `keep`, `merge`, `replace`, `both`. |
| `DELETE /api/contacts/import/:token` | Forgets the file. |
| `GET /api/contacts/phones` | `ContactsPhoneStatus`: on or not, user name, path. |

### The address book for phones (CardDAV)

Not under `/api/`, for contacts apps, only while `contacts.carddav` is on (`404`
otherwise). No credentials needed. Read-only.

| Method and path | Purpose |
| --- | --- |
| `GET`, `PROPFIND /.well-known/carddav` | `301` to `/dav/`. |
| `OPTIONS /dav/…` | `DAV: 1, 3, addressbook`. |
| `PROPFIND /dav/`, `/dav/principal/`, `/dav/addressbooks/`, `/dav/addressbooks/contacts/` | `207` multistatus, `Depth` 0 or 1. |
| `REPORT /dav/addressbooks/contacts/` | `addressbook-multiget`, `addressbook-query`; `sync-collection` is `403`. |
| `GET`, `HEAD /dav/addressbooks/contacts/<id>.vcf` | One contact, vCard 3.0, with `ETag`. |
| Anything that writes | `403 need-privileges`. |

## Repeaters

Types: `repeaters.ts`. See [radio.md](radio.md). Only
`POST /api/repeaters/sources/:id/fetch` makes an outbound request. Frequencies are whole
hertz; the output is what the repeater transmits on.

| Method and path | Purpose |
| --- | --- |
| `GET /api/repeaters/overview` | Lists held, counts by band and mode, how many have a position. |
| `GET /api/repeaters` | `q` (callsign, town, keeper, channel, locator, or MHz prefix), `band`, `mode`, `hideOffAir=1`, `list` (or `own`), `near`, `withinKm`, `limit` (50, ≤200), `offset`. |
| `GET /api/repeaters/overlay?bbox=` | All repeaters in the box up to 400, otherwise counts by patch. Same filters. |
| `GET /api/repeaters/export?format=chirp` (or `outpost`) | CSV of the filtered entries (CHIRP ≤2,000 rows). `X-Outpost-Repeater-Count`. |
| `POST /api/repeaters/import/preview` | One CSV or JSON list (16 MB, 100,000 rows), `mapping?`, `listId?` → `RepeaterImportPreview` with duplicates. Keeps nothing. |
| `POST /api/repeaters/import` | The same, committed, with `name`, `source`, `sourceUrl`, `dataDate`, and for an update `edited` (`keep`, `replace`), `gone` (`remove`, `keep`), `duplicates` (`keep-both`, `skip`, `prefer-newer`). One at a time. |
| `GET /api/repeaters/sources` | Declared sources by region (`fetch`, `link`, `none`), with terms as read. |
| `POST /api/repeaters/sources/:id/fetch` | Fetches a `fetch` source once → a `token` and a preview. `409` asked too recently, `502`, `503`. |
| `POST /api/repeaters/fetched/:token/preview`, `/import`, `DELETE` | Read again, commit (the list records where and when, and the terms), or forget. Lasts half an hour. |
| `GET /api/repeaters/duplicates` | Same repeater (callsign, output within 3 kHz) and possible pairs. |
| `POST /api/repeaters/duplicates/merge` | `{ keepId, mergeIds (1 to 20) }`. |
| `POST /api/repeaters/duplicates/merge-all` | Merges every sure group, keeping the newest list's entry. |
| `POST /api/repeaters/:id/separate` | Brings back what was merged into it. |
| `PATCH /api/repeaters/lists/:id`, `DELETE` | Change a list's details, or remove it with every entry. |
| `POST /api/repeaters/lists/:id/restore-removed` | Brings back entries removed one by one. |
| `POST /api/repeaters` | An entry by hand: `callsign`, `outputHz`, and optional input, modes, tones, DMR colour code, talkgroups, place, position or `locator`, keeper, status, notes. |
| `GET /api/repeaters/:id`, `PATCH`, `DELETE` | One entry; a changed list entry becomes the person's; a removed one is kept as a mark. |
| `POST /api/repeaters/:id/revert` | Back to what its list says. |

## HF propagation

Worked out by VOACAP on the server, offline. Types: `propagation.ts`,
`propagation-p533.ts`, `propagation-coverage.ts`, `propagation-plans.ts`. See
[hf-propagation.md](hf-propagation.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/radio/propagation/engines` | The engine, its checksum, range, `ready`, `problem`, and `data`. Every engine route answers `415` with `reason` `engine-data-missing` or `engine-unavailable` when it cannot run. |
| `GET /api/radio/propagation/datasets` | Installed data and the solar table by month. |
| `GET /api/radio/propagation/engine-data` | `EngineDataStatus`: whether VOACAP's coefficients are here, what is missing, how they came, where Download fetches them. |
| `POST /api/radio/propagation/engine-data/download` | Fetches them (15 files, 559 kB) at the pinned commit. `{ download, status }`. `409` if here. |
| `DELETE /api/radio/propagation/engine-data` | Removes them. |
| `POST /api/radio/propagation/datasets/solar-cycle/download` | A newer solar cycle table. |
| `POST /api/radio/propagation/predict` | One path, one day (body below) → `PredictionResult`: 24 hours with the asked frequency, every band, a 2 to 30 MHz sweep, modes, ionosphere, MUF, FOT, HPF, LUF, and `runs`. `?background=true` → `{ job }`. |
| `POST /api/radio/propagation/compare` | `{ base, what }` (`seasons`, `sunspots`, `power`, `antennas`, `noise`). |
| `POST /api/radio/propagation/listing` | VOACAP's own printed page. |
| `GET /api/radio/propagation/results/:key` | A worked-out answer, until cleared. |
| `GET`, `POST /api/radio/propagation/saved`, `DELETE …/:id` | Named predictions: `{ name, request, key? }`. |
| `POST /api/radio/propagation/coverage` | A coverage map → `{ coverage }` or `{ job }`. `409` at three waiting; `400` for an area under 0.5°, over 360° or past 89° latitude. |
| `GET /api/radio/propagation/coverage`, `/:key` | Saved maps and limits; one map. |
| `POST /api/radio/propagation/coverage/saved`, `DELETE …/:id` | Keep a map by name, or not. |
| `GET /api/radio/propagation/second-model` | `SecondModelStatus` for P.533: offered, engine, maps. |
| `POST /api/radio/propagation/second-model/engine/build` | Builds P.533 here (job on `engine-build`), installed only if the result matches the recorded file. `415` where no compiler exists. |
| `POST /api/radio/propagation/second-model/maps/download` | The ITU's maps (25 files, 137 MB). |
| `POST /api/radio/propagation/second-model/compare` | The `predict` body, run by both models with isotropic 0 dBi antennas → `SecondModelComparison`. `415 second-model-unavailable`; `400` for power under 1 W or SSN outside 1 to 311. |
| `GET`, `POST /api/radio/communication-plans`, `GET`, `PATCH`, `DELETE …/:id` | Communication plans: `name`, `notes`, `stations` (≤8), `date`, `fromUtc`, `toUtc`, `bands`, `mode`, `requiredSnrDb`, `referenceBandwidthHz`, `solar`, `links`. `PATCH` with `baseUpdatedAt` → `409 changed-elsewhere`. |
| `POST /api/radio/communication-plans/import` | `{ text }`: a plan file from an export (`format: outpost-communication-plan`) or a bare plan → a new plan; links to pages and documents not held here are dropped. |
| `POST …/communication-plans/:id/matrix`, `GET` | Works the plan out (≤56 runs) → `PlanResult`; the last result if the plan is unchanged. |
| `GET /api/radio/observations` | The contact log: `limit` (≤500), `offset`; `imports`, `importing`, `adif`. |
| `POST /api/radio/observations`, `DELETE …/:id` | One entry: `at`, `frequencyMhz`, `band`, `mode`, `outcome` (`contact`, `heard`, `failed`), `tx`, `rx`, power, antenna, reports, notes. `409` duplicate. |
| `POST /api/radio/observations/import` | ADIF, ≤64 MB. ≤128 kB at once (`{ import }`), larger as a `propagation.adif-import` job. All or nothing. `400 not-adif` or `nothing-to-read`; `409 import-busy`. |
| `DELETE /api/radio/observations/imports/:id` | Takes an import back. |
| `POST /api/radio/observations/compare` | The log against the engine (≤500 paths). |
| `GET /api/radio/profiles`, `POST …/radios`, `…/antennas`, `PATCH`, `DELETE` | Radios and antennas. An end-fed wire needs `lengthM` (4.5 to 82); a sloping one also `slopeDeg` (10 to 60) and `highEndDeg`. |

A prediction's body:

```json
{
  "tx": { "name": "London", "lat": 51.5074, "lon": -0.1278 },
  "rx": { "name": "Birmingham", "lat": 52.4862, "lon": -1.8904 },
  "date": "2026-11-16",
  "powerWatts": 5,
  "txAntenna": { "kind": "horizontal-dipole", "heightM": 5, "ground": "average", "broadsideDeg": null, "gainDb": 0, "feedlineLossDb": 0 },
  "rxAntenna": { "kind": "horizontal-dipole", "heightM": 5, "ground": "average", "broadsideDeg": null, "gainDb": 0, "feedlineLossDb": 0 },
  "noise": "city",
  "frequencyMhz": 7.1,
  "mode": "ssb",
  "solar": { "source": "table" }
}
```

`solar` may be `{ "source": "manual", "ssn": 60 }` or `{ "source": "fof2", "fof2Mhz":
6.4, "utcHour": 12 }`. Optional: `requiredSnrDb`, `referenceBandwidthHz`,
`reply: { powerWatts, noise }`. A coverage body drops `rx` and `reply` and adds
`area` (`west`, `south`, `east`, `north`; `east` may pass 180) and `resolution`
(`coarse`, `medium`, `fine`: 16, 32 or 48 cells on the long side).

Checked before the engine runs (`400` says which): latitude and longitude, a date from
1950 to 2100, power 0.1 W to 500 kW, 2 to 30 MHz, sunspot number 0 to 300, a horizontal
antenna at least 0.5 m up, end-fed lengths and slopes as above, a requirement of −30 to
99.9 dB in 1 Hz.

An end-fed wire on each frequency is modelled (about a half-wave), **approximate**
(longer: VOACAP's sloping long wire) or **not modelled** (shorter). Approximate results
carry `approximate: true` (on cells, series, plan bands and `PlanChoice`, log rows,
counted in `approximateLevels`; a coverage map's `approximate` gives the reason).
Not-modelled cells have `notModelled: true`, `path: null` and noughts; a plan has `null`
there; a coverage map is `400 antenna-not-modelled`. `runs` lists `{ mhz, state, tx, rx }`
per frequency.

## Power plans

Types: `power.ts`. The server keeps plans and devices and works nothing out; see
[tools-power.md](tools-power.md).

| Method and path | Purpose |
| --- | --- |
| `GET`, `POST /api/power/plans` | `name`, `notes`, `battery`, `loads` (≤60: `device`, `radio` or `charge`, supplied `dc`, `usb` or `ac`, with `origin`), `usb`, `inverter`, `solar` (with `sunHours` and `sunHoursSource`), `charger`, `cableRatingA`. `400` out of range or past 500 plans. |
| `GET`, `PUT`, `DELETE /api/power/plans/:id` | `PUT` takes the whole plan and optional `baseUpdatedAt` → `409` with `details.updatedAt` if saved since. |
| `POST /api/power/plans/:id/copy` | "… (copy)". |
| `POST /api/power/plans/import` | `{ text }`: a plan file from an export (`format: outpost-power-plan`) or a bare plan → a new plan. `400` for another kind of file. |
| `GET`, `POST /api/power/devices`, `PUT`, `DELETE …/:id` | Own devices: `name`, `kind` (`run`, `charge`, `radio`), `supply`, `watts`, `wattHours`, `receiveW`, `transmitW`, `standbyW`, `note`. ≤500. |

## Morse trainer

Types: `morse.ts`; the engine runs in the browser. One record for the whole copy; see
[morse-trainer.md](morse-trainer.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/morse` | `{ progress, sessions (newest 200), sessionCount, weakChars, suggestedCallsign }`. |
| `PUT /api/morse/progress` | `kochLesson` (1 to 40), `bestCharWpm`, `bestEffWpm` (only raised), `settings` (merged). |
| `POST /api/morse/sessions` | `kind` (`receive`, `send`, `qso`, `echo`), `accuracy` (0 to 1), optional speeds, rhythm, lesson, misses, tries. 90 % receive raises the bests. Oldest go past 5,000. |
| `DELETE /api/morse` | Forgets everything. |

## Games

Types: `games.ts`; the allotment engine is `packages/shared/src/games/allotment/`. One
save per game for the whole copy; unfinished card and board games are never sent. See
[games.md](games.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/games` | `{ tallies, allotmentStarted }` for `solitaire`, `peg-solitaire`, `sudoku`, `draughts`, `chess`, `pairs`, `snake`, per way of playing. |
| `POST /api/games/:game/results` | `variant`, `won`, optional `seconds`, `moves`, `left`, `score`. Bests from wins only (fewest left and best score from any). |
| `DELETE /api/games/:game` | Clears a tally, or for `allotment` the plot. |
| `GET /api/games/allotment` | `{ plot (version 2), now, hemisphere, hemisphereFrom, season, awayMs, started }`, worked out to the server's clock without writing. `409 details.damaged` if unreadable. |
| `POST /api/games/allotment/actions` | `sow`, `water`, `harvest`, `harvestAll`, `collect`, `sell`, `sellAll`, `buyBed`, `buy`, `setHemisphere`. `409` with the reason for an action that cannot be done. |

## Messages (the household board)

Types: `board.ts`; see [messages.md](messages.md). A message has a `channel` (`board`, or
a radio channel; `^[a-z0-9][a-z0-9:._-]{0,63}$`) and a `source`. Text is plain, never
markup. Each address may make 30 changes a minute and send 30 files an hour (`429`).

| Method and path | Purpose |
| --- | --- |
| `GET /api/board/messages` | `channel`, `before`, `limit` (1 to 200) → `{ messages, older }`, oldest first. |
| `GET /api/board/messages/:id` | |
| `GET /api/board/summary` | Latest check-ins, people, `newSince` (`since`), newest time, `fileDays`, limits. |
| `POST /api/board/messages` | `{ author (1 to 40), body (1 to 10,000), channel? }`. |
| `POST /api/board/check-ins` | `{ author, status: safe \| help \| other, body?, place?, position?, channel?, writtenAt?, clientId? }`. From a phone out of reach `writtenAt` (≤7 days back) becomes `createdAt`; a repeated `clientId` returns the first. |
| `GET /api/board/roll-call` | `RollCallResponse`: latest check-ins, `answered` since the last ask, latest five asks. |
| `POST /api/board/roll-calls` | `{ by, note?, alsoOn? }`: posts the roll call on the board and radio channels. `{ ask, refused }`. |
| `PATCH /api/board/messages/:id` | `{ by, body?, place?, status?, baseUpdatedAt }`. `409` if changed or removed. |
| `POST /api/board/messages/:id/remove` | `{ by }`: words, place, position and file go; the row stays marked. |
| `POST /api/board/files` | Multipart `author`, `body?`, `channel?`, then one file ≤200 MB. `507` at 100 files or 4 GB. |
| `GET /api/board/files/:id` | Always an attachment, sandboxed, `nosniff`. |
| `POST /api/board/files/:id/library` | Copies it into the library. |

## Learning progress

Types: `learning.ts`; see [learning.md](learning.md). `learner` is a name of ≤40
characters or `""`; it proves nothing. `collectionId` must be an installed ZIM; `path`
≤2,000 characters, no `..`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/learning/visits` | `learner`, `collectionId`, `path`, `title`, `seconds`, `opened`. Seconds added are capped. `409` past 50 learners. |
| `POST /api/learning/done` | `done`, `how` (`marked`, `watched`). |
| `POST /api/learning/topics` | The pages a page links to (`links` ≤600). |
| `GET /api/learning/page` | One page's progress or `null`. |
| `GET /api/learning/learners` | Everyone with progress, and the household's people. |
| `GET /api/learning/progress` | `learner=` or `everyone=1`, `collectionId?` → courses with pages, done, seconds, topics. |
| `DELETE /api/learning/progress` | One learner's or everyone's. |

## Nuclear preparedness

Saved scenarios; effects are worked out in the browser (`computeEffects`). See
[nuclear-preparedness.md](nuclear-preparedness.md).

| Method and path | Purpose |
| --- | --- |
| `GET`, `POST /api/nuclear/scenarios` | `name`, `notes`, `lat`, `lon`, `effects` (`yieldKt`, `burst` surface, height or optimum psi, `wind`). `201`. |
| `GET`, `PATCH`, `DELETE /api/nuclear/scenarios/:id` | `PATCH` with `baseUpdatedAt` → `409` if newer. |
| `GET`, `POST /api/nuclear/sets`, `GET`, `PATCH`, `DELETE …/:id` | Sets of one to six scenarios lettered A to F. |

A scenario outside the model (1 kt to 10 Mt, height ≤12,000 m and within the curves,
wind 8 to 45 mph, direction 0 to 359) is `400` with `details.problems`.

## Backup

Types: `backup.ts`. "Local only" as in [Who may call what](#who-may-call-what); `right`
in the answers says whether this request has it, and why (`localBy`). A passphrase may
be sent only by a local-allowed request that would not send it over plain http
(`protection.right.reason`: `local`, `https`, `remote`, `insecure`). A refused restore
gives `details.reason`: `passphrase_required`, `wrong_passphrase`, `damaged`,
`insecure`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/backup/status` | `{ lastDownload, restorePending, previousData, supervised, right, protection }`. |
| `PUT /api/backup/protection`, `DELETE` | Local only. `{ passphrase (1 to 1024) }`: new backups are encrypted to a new key pair; the passphrase is not stored. `DELETE` stops it for new backups. |
| `GET /api/backup/download` | Streams the database, attachments, extracted text and own manifests: `.zip`, or `.zip.enc` when protected. |
| `POST /api/backup/restore` | Local only. The file (`application/zip` or `application/vnd.outpost.backup`); passphrase in `X-Outpost-Backup-Passphrase` (base64 UTF-8). Stages it for the next start; unfinished jobs, downloads and imports are dropped then. |
| `DELETE /api/backup/restore` | Drops a staged restore. |
| `GET /api/backup/schedule`, `PATCH` | `BackupSchedule`: `locationId` (`null` off), `frequency`, `time`, `weekday`, `keep` (1 to 60; lowering is local only), last and next run, `waiting`, `lastFailure`, `active`, `right`. |
| `POST /api/backup/run` | Back up now. `409` no location or busy; `503` disconnected. |
| `GET /api/backup/stored` | Backups on the chosen location, with `check`, `protected`, `currentPassphrase`. |
| `GET /api/backup/stored/:name/download` | The file. |
| `POST /api/backup/stored/:name/restore` | Local only. `{}` or `{ passphrase }`. Stages it. |
| `DELETE /api/backup/stored/:name` | Local only. |
| `POST /api/backup/stored/:name/test` | Opens it in a scratch folder, checks and counts, removes it. `{ job }`. |

Downloads of backups and exports refuse a request another site caused. `:name` must be
a name Outpost gives its backups.

## Updates

| Method and path | Purpose |
| --- | --- |
| `GET /api/update/status` | `UpdateStatus`: `current`, `install` (`docker-helper`, `docker`, `portable`, `source`), `keyed`, `latest`, `staged`, `lastResult`, `waiting`, `active`, `right`. |
| `POST /api/update/check` | Fetches and checks `latest.json` and its signature from `OUTPOST_UPDATE_URL`. |
| `POST /api/update/download` | Local only. Fetches, checks and keeps the release, as a job. |
| `POST /api/update/upload` | Local only. The release file, `application/vnd.outpost.update`. |
| `GET /api/update/files` | Release files on connected storage. |
| `POST /api/update/from-storage` | Local only. `{ locationId, relPath }`. |
| `POST /api/update/apply` | Local only, with the update service. Backs up, then hands over. |
| `DELETE /api/update/staged` | Removes the kept release. |
| `POST /api/update/restore-before` | Local only. Stages the backup made before the last update. |

How releases work: [development/releases.md](development/releases.md).

## Taking everything out

| Method and path | Purpose |
| --- | --- |
| `GET /api/export-all/estimate` | `ExportEstimate` per part (`notes`, `contacts`, `places`, `supplies`, `barometer`, `radio-log`, `plans`, `weather-places`, `radio-plans`, `power-plans`, `papers`, `board`, `documents`). |
| `GET /api/export-all` | The latest `export-all.run` job and its `ExportResult`. |
| `POST /api/export-all` | `{ destination: { kind: download } \| { kind: location, locationId }, include? }`. `409` while one runs. |
| `GET /api/export-all/:id/download`, `DELETE` | The zip; delete it from the server. |

## Managing and cleaning up

Types: `manage.ts`. See [storage.md](storage.md). Items are keyed `collection:<id>` or
`document:<id>`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/manage/usage` | `UsageResponse`: rows by kind (bytes, count, basis, within), locations, measured time. Starts a count if stale. |
| `POST /api/manage/measure` | Count now. |
| `GET /api/manage/items` | Everything installed, with origin, size, location, `state`. |
| `POST /api/manage/plan` | `{ scope: items \| downloaded \| everything, … }` → `CleanupPlan`. Changes nothing. |
| `POST /api/manage/remove` | `{ keys, files?: delete \| keep, disconnected?: leave \| forget }` → `manage.remove` job. |
| `POST /api/manage/move` | `{ keys, locationId }` → move jobs and `refused`. `507` if it will not fit. |
| `GET /api/manage/leftovers`, `POST …/clear` | Leftover files by kind (≤200 a kind); clear by the ids issued. |
| `GET /api/manage/cleanup` | `CleanupStatus`: `erase` right, derived data sizes, active and last job. |
| `POST /api/manage/cleanup/downloaded` | Removes all downloaded content. |
| `POST /api/manage/cleanup/derived` | `{ steps: vectors, text, compact }`. |
| `POST /api/manage/cleanup/everything` | `{ confirm: "erase everything" }`. Local only. |

Their jobs' result is a `CleanupResult` (`removed`, `forgotten`, `left`, `leftBehind`,
`failed`, `stopped`, `notReached`).

## Portable drives

Types: `portable.ts`, `merge.ts`. See [portable.md](portable.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/portable/status` | Packaged app available, Node version, cached runtimes. |
| `GET /api/portable/inspect` | `path`: whether it is an Outpost drive. |
| `POST /api/portable/plan` | `PortableRequest` (`targetPath`, `platforms`, `collectionIds`, `documents`, `reader?`, `replaceExisting?`) → `PortablePlan`. Writes nothing. |
| `POST /api/portable/build` | Same body, as a job. `409` with problems or an existing drive. |
| `POST /api/portable/runtimes` | `{ platforms }`: fetches Node runtimes ahead. |
| `GET /api/merge/inspect` | `path` inside the roots → `DriveInspection` with the sets of notes it holds. |
| `POST /api/merge` | `{ path, source? }` → `merge.analyse` (copies the drive's database and compares). One merge at a time. |
| `GET /api/merge`, `/:id` | Earlier merges; one with `analysis` and `report`. |
| `GET /api/merge/:id/compare` | `key` → both versions as text. |
| `POST /api/merge/:id/commit` | `{ choices, deletionsConfirmed? }` → `merge.apply`. `409 needsConfirmation` if anything would be removed. |
| `POST /api/merge/:id/cancel`, `/undo`, `DELETE` | Stop; put back what the record allows; give up a preview. |

Nothing writes to the drive. Choices: `apply` brings it home, `skip` offers it again,
`both` keeps both, `home` keeps home's and remembers, `drive` replaces home's (kept in
the record).

## Households and people

Types: `households.ts`. See [development/households.md](development/households.md). One
household is current for the whole Outpost; every change publishes `households.changed`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/households` | `{ households, currentId }`. |
| `POST /api/households` | `{ name, kind?, homePlaceId?, basePlaceId?, copyPeopleFrom? }`. At most 20. |
| `GET`, `PUT /api/households/:id` | One household; change `name`, `kind`, `homePlaceId`, `basePlaceId`, `countryOverride` (only what is named). |
| `DELETE /api/households/:id?confirm=true` | Removes it and what it holds, never a person. Without `confirm`: 409 with `details.holds`. Never the last. |
| `PUT /api/households/:id/people` | `{ personIds }`, in order. |
| `PUT /api/households/current` | `{ id }`: the current household, for every device. |
| `PUT /api/households/:id/here`, `GET …/positions` | A portable household's position `{ lat, lon, name?, source }`; the last 50. |
| `GET`, `POST /api/people`, `GET`, `PUT`, `DELETE …/:id?confirm=true` | People and pets, with the households each is in. Removing someone with medical sheets asks first (409); the sheets stay. |

## Supplies

Types: `supplies.ts`, `supplies-energy.ts`. See [supplies.md](supplies.md). Nothing here
reaches out. Dates are `YYYY-MM-DD`; routes about today take `?today=`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/supplies` | Stock, household and places. |
| `GET /api/supplies/foods?q=&limit=` | Matching foods from the shipped USDA SR Legacy table, per 100 g. |
| `GET /api/supplies/outlook` | For other screens: `SupplyOutlook` (days of food and water, what runs out first, expiring, totals), `missing` (shopping suggestions) and `energy`. |
| `POST /api/supplies/items`, `GET`, `PATCH`, `DELETE …/:id` | A row: `name`, `category`, `quantity`, optional unit, location, date and kind, energy, litres, minimum, barcode, notes. ≤5,000 rows; figure limits in `SUPPLY_FIGURE_MAX`. |
| `POST /api/supplies/items/:id/adjust` | `{ by }`, never below nought. |
| `PUT /api/supplies/household` | `HouseholdInput`: days wanted, water, members (the current household's people). |
| `GET /api/supplies/barcodes/:code` | Rows and product for a barcode (matched as GTIN-14). |
| `GET /api/supplies/shopping`, `POST …/work-out`, `POST`, `PATCH`, `DELETE …/:id` | The shopping list; work it out again (own lines kept); lines. |
| `POST /api/supplies/shopping/:id/bought` | Adds to stock and takes the line off or lowers it. |
| `GET /api/supplies/export.csv` | Every row. |
| `POST /api/supplies/import/preview`, `/apply` | `{ text ≤2 MB }` → `ImportPreview` (with the `household` it was read against); `{ householdId?, rows }` applied all or nothing, 409 if another household is current since. |

## Devices on this network

Types: `network.ts`. See [tools-qr-and-network.md](tools-qr-and-network.md). QR codes have
no routes.

| Method and path | Purpose |
| --- | --- |
| `GET /api/network` | `NetworkStatus`: `unavailable`, abilities, subnets and plan, skipped, limits, last scan, job, devices, makers registry, `scanRight`. Sends nothing. |
| `POST /api/network/scan` | `network.scan` job. `409` running; `415` in a container without host networking, on a portable drive, another system or no private network; `403` from another device with `OUTPOST_NETWORK_SCAN_LOCAL_ONLY=true`. |
| `PATCH /api/network/devices/:id`, `DELETE` | `label` (≤80), `note` (≤2,000); forget one. |
| `DELETE /api/network/devices` | Forget all. |
| `GET /api/network/devices.csv` | |
| `POST /api/network/makers`, `DELETE` | Fetch the IEEE registry (the only outbound request here); remove it. |

## Weather and hazards

Types: `weather.ts`, `weather-rivers.ts`. See [weather.md](weather.md). Only
`POST /api/weather/update` and `POST /api/weather/river-readings` reach out.

| Method and path | Purpose |
| --- | --- |
| `GET /api/weather` | `WeatherResponse`: `places`, `kept` copies by kind (`forecast`, `warnings`, `flood`, `rivers`, `river-readings`, `climate`, `solar`) with what was sent and received, `sources` with licence and credit, options, `now`. Fetches nothing. |
| `POST /api/weather/places`, `PATCH`, `DELETE …/:id` | `markerId` or `name`, `lat`, `lon`; `region`. ≤12. |
| `POST /api/weather/places/import` | `{ text }`: GeoJSON points (≤1 MB) → `WeatherPlacesImportResult` (`added`, `already`, `noRoom`, `notPoints`). |
| `POST /api/weather/update` | **Fetches.** `{ kinds, placeIds? }` → `outcomes`. A failure keeps the previous copy. One at a time. |
| `POST /api/weather/river-readings` | **Fetches.** `{ placeId, stationId }`: three days of a station's readings. `502` keeps what was held. |
| `DELETE /api/weather/kept/:id` | |
| `PUT /api/weather/options` | `updateOnOpen`, `riversKm` (3, 8, 15, 25). |
| `GET /api/weather/home-warnings` | For other screens: warnings and flood warnings in force for the home place, `stale`, `note`. Fetches nothing. |
| `GET /api/weather/readings`, `POST`, `DELETE …/:id` | Barometer: `takenAt`, `value`, `unit` (`hPa`, `inHg`), `heightM` (−450 to 3000), `note`; refused outside 850 to 1100 hPa at sea level. |
| `POST /api/weather/readings/clear` | `{ range, expected? }`. |
| `GET /api/weather/readings/export`, `POST …/import` | CSV out; CSV in (≤4 MB, with unit, height and zone defaults, `apply`). |

## Emergency plans

Types: `emergency-plans.ts`, `emergency-templates.ts`. See
[emergency-plans.md](emergency-plans.md). Answers for one plan are
`EmergencyPlanResponse` (`plan`, and `resolved` links, `null` where deleted).

| Method and path | Purpose |
| --- | --- |
| `GET /api/emergency-plans`, `POST` | Summaries; make one (`EmergencyPlanInput`, ≤200). |
| `GET`, `PUT`, `DELETE /api/emergency-plans/:id` | `PUT` with `baseUpdatedAt` → `409` if newer; ticks kept for steps still there. |
| `POST …/:id/copy`, `/start`, `/reset`, `/reviewed`, `/opened` | Copy; start; clear ticks; mark reviewed; record opened. |
| `POST …/:id/ticks` | `{ stepId, done }`. |
| `POST …/:id/ticks/merge` | Ticks made on a phone out of reach (`PlanTickMerge`) → `{ plan, resolved, applied, dropped }`. |

## Household papers

Types: `household-papers.ts`; see [household-papers.md](household-papers.md). A medical
sheet holds a `record` or an `armor` (encrypted in the browser), never both. Plain sheets
are searchable only while `medical.inSearch` is on and readable by tools only while
`tools.medical` is on.

| Method and path | Purpose |
| --- | --- |
| `GET /api/medical-sheets`, `POST` | `{ sheets, inSearch, inTools }`; make one (≤60). |
| `GET`, `PUT`, `DELETE /api/medical-sheets/:id` | `PUT` with `baseUpdatedAt`; a `record` over an encrypted sheet needs `removeEncryption: true`. |
| `GET /api/keeping-in-touch`, `PUT` | The communication plan and `resolved` links. `PUT` with `baseUpdatedAt`: `409` if older than the stored plan, or `null` once a plan is kept. |
| `GET /api/household-binder` | `BinderStatus`: last made, changes since, and `fingerprints` (a hash per part of what it is made from; `stale` compares them, so a deletion counts). |
| `POST /api/household-binder/made` | Records a binder made in the browser, with the `fingerprints` of the status it was made from. |

## Household book

Types: `packages/shared/src/household-book.ts`; see [household-book.md](household-book.md).
Changes publish `household-book.changed`. One record per household: the wizard's answers
(`BookAnswers`) and the last book made (`BookMade`: `madeAt`, `pages`, `sections`, and a
`summary` of a few lines a section that the next book compares itself with).

| Method and path | Purpose |
| --- | --- |
| `GET /api/household-book` | The answers (the defaults until first saved), `answersAt`, `made`, `fingerprints` of what the book is made from, and `stale`: which of them changed since the book was made. |
| `PUT /api/household-book` | Save the answers (`BookInput`). With `baseAnswersAt` older than the answers kept, `409 conflict` and nothing is overwritten. |
| `GET /api/household-book/facts` | What the book reads round home, for the answers as saved (`BookFacts`): the nearest help and places to keep away from in the reference layers (`held: false` for a layer with nothing in it), the flood and planning zones holding home, the climate kept for home with the wind's direction, and each journey's straight line with the ground along it and a stop for each day's walking. Reads only what is held. |
| `POST /api/household-book/made` | Record a book made in the browser (`BookMadeInput`, with the `fingerprints` it was made from). |

## Readiness

Types: `readiness.ts`; see [readiness.md](readiness.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/event-log` | `from`, `others=1` (adds check-ins and ticks) → lines (≤500). |
| `POST /api/event-log` | `{ author, text (≤1,000), at? (≤30 days back), planId? }`. |
| `PATCH /api/event-log/:id`, `DELETE` | `{ by, text?, at?, baseUpdatedAt }`. |
| `POST /api/event-log/to-notes` | Writes the lines to a new page. |
| `GET /api/routine-checks`, `POST`, `PUT`, `DELETE …/:id` | Checks with `dueAt`, `overdue`; `{ name, everyDays (1 to 3,650), note?, link? }`, ≤60. `PUT` with `baseUpdatedAt`: `409` if saved since. |
| `POST /api/routine-checks/suggested` | Adds the template's checks. |
| `POST /api/routine-checks/:id/done` | `{ by, at?, baseUpdatedAt? }`; `at: null` clears it. A check changed since `baseUpdatedAt` refuses it with `409`. |
| `GET /api/offline-drill` | `DrillLine`s (`held`, `missing`, `stale`, `untried`) and the last run. |
| `POST /api/offline-drill/runs` | `{ by, startedAt, answers, notes? }`. |

## Garden

Types: `garden.ts`; see [garden.md](garden.md). The calendar is worked out in the browser.

| Method and path | Purpose |
| --- | --- |
| `GET /api/garden` | Settings and every sowing. |
| `PUT /api/garden/settings` | `{ lastFrost: "MM-DD" \| null, baseUpdatedAt? }` (not 29 February). `baseUpdatedAt` is the `updatedAt` read (`null` if never saved); a newer one refuses it with `409`. |
| `POST /api/garden/sowings`, `PUT`, `DELETE …/:id` | `cropId` or `name`, `sownOn`, optional place, amount, dates, notes. ≤5,000. `PUT` with `baseUpdatedAt`: `409` if saved since. |

## Tide times

Types: `tides.ts`; see [tides.md](tides.md). Worked out from the bundled constants.

| Method and path | Purpose |
| --- | --- |
| `GET /api/tides/stations?lat=&lon=&limit=` | Nearest stations (1 to 50, 8) with distance and datum. |
| `GET /api/tides/stations/:id/predictions?from=&days=` | High and low waters and a 10-minute curve, metres above the datum, 1 to 31 days. |

## Satellites

Types: `satellites.ts`; see [satellites.md](satellites.md). Passes are worked out in the
browser.

| Method and path | Purpose |
| --- | --- |
| `GET /api/satellites` | Elements, transmitters, sources, `fetching`, `now`. Asks no one. |
| `POST /api/satellites/fetch` | Contacts CelesTrak (not within 2 hours of the last good fetch) and SatNOGS DB (not within a day). `502` when CelesTrak fails; the old elements stay. |

## Mesh radio

Types: `mesh.ts`, `heard.ts`; see [mesh-radio.md](mesh-radio.md). Radio channels are
board channels (`meshtastic:longfast`, `meshcore:0`), read and written with the board's
routes; a message too long, a file or an edit is `400` there. Settings routes are
**local only** unless started with `OUTPOST_ALLOW_REMOTE_SETTINGS=true`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/mesh` | Each way in's set-up (passwords only as `passwordSet`), status, channels, `right`. |
| `GET /api/mesh/devices` | USB radios in `/dev`. |
| `PUT /api/mesh/meshtastic` | `MeshtasticInput`: `mode` (`off`, `broker`, `client`), broker or client settings, `channels`. A password left out is kept; `""` removes it. `400` for a broker password under 12 characters, and for a household broker with another address, port or user name (or TLS turned off) and no password given while one is saved. |
| `PUT /api/mesh/meshcore` | `MeshCoreInput`: `mode` (`off`, `serial`, `tcp`), device, host, port, channels. |
| `POST /api/mesh/broker/find` | Looks for a broker on 1883 and 8883. |
| `POST /api/mesh/broker/test` | Signs in, subscribes, sends a check, listens 8 s. A password left out is the saved one, used only for the address, port and user name it was saved with (and not without TLS if saved with it); otherwise `400`. |
| `POST /api/mesh/broker/dynsec` | Asks the broker's dynamic security plugin `listClients`. |
| `POST /api/mesh/broker/radio-account` | Creates a role and account for the radio. |
| `GET /api/mesh/positions`, `PUT /api/mesh/radios/:id/map` | Radios heard and whether each is on the map. |
| `POST /api/mesh/test` | Posts a test message on a channel. |
| `GET /api/heard/receivers`, `POST`, `PUT`, `DELETE …/:id` | Receivers (local only to change): `{ kind, name, host, port, transport, enabled }`; status with packets, positions, errors. |
| `GET /api/heard/stations?source=`, `/:id` | Stations heard (≤5,000), one with its trail (≤500). |
| `PUT /api/heard/stations/:id/pin`, `DELETE …/:id`, `POST /api/heard/clear` | Pin, remove, clear by source or time. |
| `GET /api/heard/reports` | Positions for the range view (≤20,000). |
| `GET`, `POST /api/heard/range-tests`, `DELETE …/:id` | Range tests by name. |
| `POST /api/heard/pi` | `{ decoder, action: start \| stop \| refresh, device? }` for the Pi's decoder helper. Local only. |

## Everything else

Any other `GET` without a file extension returns the web app, so in-app addresses open
directly. An unknown address under `/api/` answers `404 not_found`.
