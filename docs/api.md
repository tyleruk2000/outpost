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

There is one kind of exception. `POST /api/manage/cleanup/everything`, which erases a
person's own notes and documents, is accepted only from the computer the server runs
on, unless the server was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`. The same
holds for restoring a backup, deleting a stored one and lowering how many are kept (see
[Backup](#backup)), and for `POST /api/https/authority/replace`,
`DELETE /api/https/authority` and `DELETE /api/https/own`, which would stop every device
that trusted Outpost's HTTPS certificate from trusting it, or leave HTTPS impossible to
put back from another device. `POST /api/https/own`, which carries a private key, has a
rule of its own: local, or over HTTPS. That is a rule about where a request comes from,
not who sent it; see [security.md](security.md#erasing-everything).

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
When the server is stopping it sends `server.stopping` and ends the stream; a browser's
`EventSource` connects again by itself once the server is back.

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
| `repeaters.changed` | A repeater list is imported, brought up to date or removed, or an entry is added, changed or removed | |
| `imports.changed` | An import changes state | import id |
| `semantic.changed` | Vectors are built, loaded or removed | |
| `portable.changed` | A portable drive or runtime download finishes | |
| `https.changed` | The HTTPS listener starts or stops, its certificate is re-issued or replaced, the certificate authority is replaced or deleted, or a certificate of the person's own nears its end, expires, or has its files changed | |
| `merge.changed` | A merge of a drive's changes moves to another state | merge id |
| `chat.changed` | A conversation is started, added to, renamed or deleted, or a reply finishes | conversation id |
| `encryption.changed` | A key is added to, changed on or removed from the key shelf | fingerprint |

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
| `POST /api/system/restart` | Stops the server so that its supervisor starts it again, which is how a staged restore is applied. Accepted only from the computer Outpost runs on, or from anywhere with `OUTPOST_ALLOW_REMOTE_ERASE=true`; otherwise `403 forbidden`. Answers `409 conflict` unless the server was started with `OUTPOST_SUPERVISED=true`. |

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
| `contacts.carddav` | false | Let phones and computers on the network subscribe to the contacts, read-only. See [Contacts](#contacts) |
| `https.enabled` | false | Serve Outpost over HTTPS as well, on `OUTPOST_HTTPS_PORT`. See [HTTPS](#https) |
| `https.certificate` | `outpost` | Whose certificate the HTTPS listener presents: `outpost` (made and signed by Outpost's own authority) or `own` (the two files in `tls/own`). Setting it to `own` with no usable files leaves HTTPS not running, with the reason in `problem`; `POST /api/https/own/use` checks first |
| `https.names` | empty | Other names and addresses for the certificate to list, separated by commas or spaces; at most 20. Each must be a host name or an IP address, without `http://` or a port |
| `maps.tileSource` | empty (newest daily build) | an address |
| `maps.terrainSource` | `https://download.mapterhorn.com/planet.pmtiles` | an address |
| `maps.defaultMaxZoom` | 14 | 0 to 15 |
| `storage.checkIntervalSeconds` | 30 | 5 to 3600 |

### HTTPS

Types: `packages/shared/src/https.ts`. See
[deployment.md](deployment.md#https-on-your-network) and
[security.md](security.md#https-on-the-home-network). HTTPS is turned on and off with
the `https.enabled` setting, and `https.certificate` says whose certificate it
presents; these routes report on it, manage Outpost's certificate authority, and take
a certificate of the person's own.

| Method and path | Purpose |
| --- | --- |
| `GET /api/https` | `HttpsStatus`: `enabled` and `source` (the two settings; `source` is `outpost` or `own`), `listening`, `port`, `httpPort`, `problem` (why it could not start, in words, or null), `addresses` (`{ url, name, kind }`, where `kind` is `address`, `name` or `this-computer`), `names` on the certificate being served, `leftOut` (`{ name, reason }` for listed names Outpost's authority may not sign), `authority` (`name`, `fingerprint`, `createdAt`, `expiresAt`, `permittedNames`, `permittedBlocks`, or null while Outpost has none), `certificateExpiresAt`, `unavailable` (`portable` or null), `inContainer`, `lanAccess`, `authorityRight` (`{ allowed, reason, option }`: whether this request may replace or delete the authority, or delete the person's certificate), and `own`. `own` is `folder` (the path of `tls/own` on the server), `files` (`{ certificate: "fullchain.pem", key: "privkey.pem" }`), `inFolder` (whether each is there), `keyRight` (`{ allowed, reason }`, `reason` being `local`, `https` or `remote`: whether this request may upload a key), `expiry` (`ok`, `soon`, `expired` or null), `problem` (why the files in the folder cannot be used as they are, or null) and `certificate`: null unless `source` is `own` and Outpost holds one, else `name`, `issuer`, `fingerprint`, `validFrom`, `expiresAt`, `key` (such as `ECDSA P-256`), `names`, `chain`, `trust` (`public`, `private` or `self-signed`, as far as Outpost can tell), `anchor` (`{ name, fingerprint, held }`: what a device has to trust, and whether Outpost can offer it), `covered` and `notCovered` (of the addresses the server is reached by), `notAnswered` (names on it that the Host check refuses), `warnings` and `notes`. Nothing secret is in it. |
| `GET /api/https/outpost-authority.crt` | The certificate authority's public certificate, DER, as `application/x-x509-ca-cert` with no `Content-Disposition` (the form Apple's example of delivering a root certificate to an iPhone uses): what a device installs. `?format=pem` gives PEM (`outpost-authority.pem`), for `curl --cacert` and the like. `404` until HTTPS has been turned on once. No route serves a private key. |
| `POST /api/https/authority/replace` | Deletes the authority and makes a new one, with a new server certificate. Answers `HttpsStatus`. Only from the computer Outpost runs on, or from anywhere when started with `OUTPOST_ALLOW_REMOTE_ERASE=true`; otherwise `403`. `409` on a portable drive. |
| `DELETE /api/https/authority` | Deletes the authority, the server certificate and their keys, and turns HTTPS off unless it is presenting a certificate of the person's own. Answers `HttpsStatus`. Same restriction. |
| `GET /api/https/outpost-authority.pem` | The same certificate as PEM (the form Linux trust stores and `curl --cacert` want), as an attachment. |
| `POST /api/https/own` | Gives Outpost a certificate and its key: `multipart/form-data` with one to three files of at most 256 KB each (the certificate, the key, the chain, in any order and under any field names; PEM or DER; or one PKCS#12 file) and, for PKCS#12, a `password` field. Outpost checks them, writes `fullchain.pem` and `privkey.pem` to `tls/own`, sets `https.certificate` to `own` and `https.enabled` to true, and answers `HttpsStatus`. `403` unless the request is from the computer Outpost runs on or arrived over HTTPS (a key must not cross the network in the clear; `OUTPOST_ALLOW_REMOTE_ERASE` does not change this). `400` with the reason for anything that cannot work (a key that is not the certificate's, a passphrase on the key, an expired certificate, no names, a key browsers refuse, a wrong password); nothing is kept then. `409` on a portable drive, when the clock is plainly wrong, or when the folder holds links to files kept elsewhere. `413` for a file over the limit. |
| `POST /api/https/own/use` | The same for the two files already in `tls/own`, which are left as they are. No key crosses the network, so any device may ask. `409` when a file is missing or unreadable, `400` with the reason when they cannot work; the certificate in use, if any, carries on. |
| `DELETE /api/https/own` | Deletes the two files from `tls/own`. If HTTPS was presenting them, turns it off and sets `https.certificate` back to `outpost`; it does not start HTTPS with Outpost's own certificate. Answers `HttpsStatus`. Restricted like `DELETE /api/https/authority`. |
| `GET /api/https/own-root.crt`, `GET /api/https/own-root.pem` | The certificate devices have to trust for the person's own certificate, when Outpost holds it: the root of their authority if it was among the files they gave, or a self-signed certificate itself. DER and PEM, sent as the authority's are. `404` otherwise, including for a certificate from a public authority. |

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
| `GET /api/search` | Unified search (`SearchResponse`). Query: `q` (at most 500 characters), `kinds` (comma separated, for example `document,note`), `tag`, `mode` (`keyword`, `semantic`, `hybrid`), `limit` (1 to 100, default 20), `offset`, `reference` (`include`, the default, or `later`). With `reference=later` the answer leaves reference collections out and so never waits for them, and `referenceToCome` says whether `GET /api/search/reference` has any to search. |
| `GET /api/search/reference` | What reference collections hold, for a search asked with `reference=later`. Query: `q`. The answer is `application/x-ndjson`: one JSON object to a line (`ReferenceSearchEvent`), sent as they happen. First `{"type":"start","collections":n}`; then one `{"type":"collection","collectionId","title","results"}` for each collection as it answers, with that collection's best matches (`SearchResult`, best first, possibly none); last `{"type":"end","searched","missing","message","tookMs"}`, where `missing` lists collections left out (`reason` is `slow` or `failed`) and `message` says why none could be searched at all, or is `null`. `collections` is 0, and nothing follows but `end`, when there are no collections, kiwix-serve is down, or searching inside collections is turned off. Close the connection to stop: collections not yet asked are then not asked. |
| `GET /api/search/stats` | `{ entities, chunks }`: indexed items per kind and the number of passages. |

Repeaters are found here too, as results of kind `repeater` whose `url` is
`/radio/repeaters/<id>`. They are not in the passage index: the repeaters module
answers for them itself, in keyword and hybrid modes, unless `kinds` leaves `repeater`
out or `tag` is given.

Response fields worth knowing: `relaxed` (the search fell back to "any word"),
`facets` (results per kind), `warnings` (sources that could not answer, with a
reason), and per result `url` (the in-app route), `passages` and `sources`.

In one part (`reference=include`), `total`, `facets.reference` and the pages count every
reference article found, and are the same whatever `offset` is. The search waits up to
10 seconds for reference collections; those that have not answered are named in a
warning whose `source` is `reference`. In two parts, `total`, `facets` and the pages of
`GET /api/search` cover Outpost's own results only, and reference articles are not
paged: every one found is in the lines of `GET /api/search/reference`.

```bash
curl -N "http://localhost:8080/api/search/reference?q=water"
```

## Semantic search

Types: `SemanticStatus` in `packages/shared/src/semantic.ts`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/semantic/status` | Whether it is enabled and ready, the model, counts of passages and vectors, other models with stored vectors, whether a build is running, `build` (the latest index build for the current model as a job, in whatever state, or null), `secondsLeft` (what a running build still needs at its own speed, or null), `keptChunks` (passages already embedded for the model that switching on would use, counted whether it is on or off) and `builtIn` (the model that ships with Outpost: whether it is installed, its name, licence, size, dimensions and threads). `?fresh=1` asks the model again now rather than trusting an answer from the last minute. |
| `POST /api/jobs/:id/pause`, `/cancel` | Pause or stop the build named in `build`. `POST /api/semantic/index` continues a paused one. |
| `POST /api/semantic/index` | Starts (or continues) building vectors for the current model. `409` if no provider is configured or it does not answer. Answers the status. Not needed in the ordinary way: setting `search.semantic.enabled` to true starts the build, and so does naming another model while it is on. |
| `POST /api/semantic/use-built-in` | Switches search by meaning on with the model that ships with Outpost, whatever it was pointed at before, and starts the build. Answers the status. `409` when that model is not part of the installation; nothing is changed then. |
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

## Chat

Conversations with the same model server, kept in the database. Types:
`packages/shared/src/chat.ts`. See [ai.md](ai.md#chat) for what is sent, what is kept
and how a long conversation is cut down. There are no accounts: every conversation is
open to every caller.

| Method and path | Purpose |
| --- | --- |
| `GET /api/chat/status` | `ChatStatus`: `enabled`, `usable`, `reason`, `defaultModel`, `server`, `place`, `writingIn` (the conversation a reply is being written in, or null). Read from settings; the model server is not contacted. |
| `GET /api/chat/models` | `{ models, message, ollama }`: the model server's models. Each has `id`, and, when the server also answers Ollama's `/api/tags`, `sizeBytes`, `parameters`, `quantization` and `family` (otherwise null), and `writes` when Ollama says what the model can do. Contacts the model server. |
| `POST /api/chat/look-for-ollama` | Asks the address Ollama listens on by default for its models. `ChatLookResult`: `found`, `address`, `models`, `message`. Always `200`. Saves nothing. |
| `POST /api/chat/setup/look` | Setting up, step one. Asks the address in `answers.endpoint`, then the addresses Ollama listens on by default. `ModelSetupLook`: a `ChatLookResult` with `recommended`, the model to offer first (see [ai.md](ai.md#which-model)). Always `200`. Saves nothing. |
| `POST /api/chat/setup/try` | Setting up, the last step. Body: `address`, `model`. Asks that model for one word. `ModelSetupTry`: an `AnswerTestResult` with `saved`. When the model answered, `answers.endpoint`, `answers.model` and `answers.enabled` have been saved. An address that `setup/look` would not ask is refused (`failure: "address"`) without being contacted. Always `200` for a well-formed body. |
| `GET /api/chat/conversations` | `{ conversations }`, newest first, at most 500. Query: `q` to find by name. Each is a `ChatConversationSummary`: the conversation, `messageCount`, `excerpt`, `writing`. |
| `POST /api/chat/conversations` | Body, all optional: `title`, `model`, `useLibrary`, `about` (`{ kind: "document" or "note", id }`, for a conversation about one item; `404` when the item does not exist). Answers a `ChatConversationDetail`. |
| `GET /api/chat/conversations/:id` | `ChatConversationDetail`: `conversation`, `messages`, and `sentFrom`, the id of the oldest message that would be sent with the next one (null when all would be). |
| `PATCH /api/chat/conversations/:id` | Body: any of `title`, `model`, `useLibrary`. An unknown key is a `400`. `useLibrary` is ignored for a conversation about one item. |
| `DELETE /api/chat/conversations/:id` | Deletes the conversation and its messages. A reply being written in it is stopped first. |
| `POST /api/chat/conversations/:id/messages` | Body: `text` (up to 16,000 characters), `replaceLast?` (true to replace the newest message from the person and its reply). Stores the message, starts the reply, and answers at once with the `ChatConversationDetail`; the reply's `state` is `writing`. |
| `POST /api/chat/conversations/:id/regenerate` | Throws away the reply to the newest message and starts it again. Answers the detail. |
| `POST /api/chat/conversations/:id/stop` | Stops the reply being written, by closing the connection to the model server, and answers the detail once the reply is stored as it stands. Harmless when nothing is being written. |
| `GET /api/chat/conversations/:id/stream` | The reply being written, as server-sent events. See below. |
| `POST /api/chat/messages/:id/note` | Saves a reply as a **new** page of notes. Answers `{ noteId, title }`. `400` for a message that is not a reply with words in it. |

Sending and regenerating answer `409 conflict`, having changed nothing, when no model
server is set up (`details.setup`), when the conversation has no model and Settings
names none (`details.noModel`), or when something is already being written
(`details.busy`, with `details.conversationId` when it is a conversation). One reply
or answer is written at a time across Outpost.

A message (`ChatMessage`) has `id`, `role` (`user` or `assistant`), `text`, `blocks`
(a reply's text as a tree of plain values, the same `MarkdownBlock` a Markdown
document is sent as; empty for a person's message), `state` (`writing`, `complete`,
`cut-short`, `stopped`, `failed`, `nothing-found`), `failure` and `notice` (why it did
not finish, and what to do), `model`, `grounded`, `sources`, `searchedFor`,
`unsupported` (citation markers that match no passage given), `omitted` (earlier
messages that were not sent for this reply), `tookMs` and `createdAt`.

`GET …/stream` is a `GET` and changes nothing; any number of browsers can watch, and
leaving does not stop the model. Events, each with one JSON `data` line:

| Event | Data |
| --- | --- |
| `idle` | Nothing is being written in this conversation. The stream ends. |
| `start` | Always first otherwise: `messageId`, `phase` (`finding`, `waiting`, `writing`), `model`, `grounded`, `sources`, `searchedFor`, `omitted`, `startedAt`. |
| `phase` | `phase`, and `sources` and `searchedFor` once the passages are known. |
| `blocks` | `from`, `blocks`: replace the reply's blocks from index `from` onward. A browser that joins part-way is first sent the whole reply so far (`from` 0). |
| `done` | `message`: the reply as it was stored, whatever its `state`. The stream ends. |

A comment line (`: the model is working`) is sent every 15 seconds to keep the
connection open.

```bash
# Start a conversation; the answer carries its id as conversation.id.
curl -s -X POST http://localhost:8080/api/chat/conversations \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" -d '{}'
# Send a message to it, then watch the reply being written.
curl -s -X POST http://localhost:8080/api/chat/conversations/<id>/messages \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" -d '{"text": "Hello"}'
curl -N http://localhost:8080/api/chat/conversations/<id>/stream
```

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
| `GET /api/documents/:id/pictures/:number` | One picture that a Markdown document carries (a saved web page keeps its pictures inside its file). `number` is 1 to 9999. Sent only if its bytes are a PNG, JPEG, GIF or WebP image, with that type, an `ETag`, and a sandbox policy. `404` when the document has no such picture or is not Markdown. |
| `GET /api/documents/:id/epub` | What an EPUB book says about itself (`DocumentEpubResponse`): `title`, `author` and `language` from its package file, `cover` (the cover picture's path inside the archive, or `null`), `chapters` in reading order (each with its `position` from 1, a `title`, and the `heading` search knows it by), `contents` (the table of contents from the navigation document or the NCX: `title`, `chapter`, an `anchor` inside it, `depth`; empty when the book has none) and `notes` (sentences, such as that the book is fixed-layout). At most 2,000 chapters. `415` for a document that is not an EPUB, and for a book that cannot be read: `error.details.reason` is `protected` for a copy-protected (DRM) book, which is never opened, and `damaged` for one that is malformed. `404` when the file is missing, `503` while its storage is disconnected. See [epub.md](epub.md). |
| `GET /api/documents/:id/epub/chapters/:position` | One chapter, by its place in the reading order from 1, as the same tree of plain values as `/markdown` (`DocumentEpubChapterResponse`: `position`, `total`, `title`, `blocks`, `notes`). Never the book's HTML, styles or scripts. Beyond what a Markdown file produces, a run may be `sup` or `sub`, an `anchor` (a place a link can land on), a `picture` (`src` is its path inside the archive), or a `chapter` link (to another chapter by number, 0 being the contents, with an optional `anchor`); a block may be a `figure` (a picture with a caption), a `quote` of `kind: "note"` (a footnote or sidebar), or a `table` marked `plain` (no header row). `notes` says what was left out: scripts, audio and video, mathematics, drawings, forms. `404` for a position the book does not have, `413` for a chapter over 2 MB or 120,000 tags (`details.reason` is `too_large`), `415` for one nested too deeply to read, and the refusals of the route above. |
| `GET /api/documents/:id/epub/file?path=` | A picture from inside the book, by its path in the archive as the two routes above give it. The path must be relative, in its simplest form and free of `..`, backslashes and schemes (`400` otherwise) and name a file of the book (`404`). Only bytes that are a PNG, JPEG, GIF, WebP or SVG are sent, under the type the bytes say; anything else, whatever it is called, is a `415`. At most 16 MB (`413`). An SVG is at most 2 MB, is refused (`415`) if it holds script, an event handler, a script address, `foreignObject` or declared entities, and is sent as a download, so it is only shown through an `<img>`. Sent with a sandbox policy and `ETag`. |
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
| `PATCH /api/notes/:id` | Saves changes. Body (`UpdateNoteBody`): `title`, `icon`, `content`, `tags`, `isFavorite`, `coverAttachmentId`, `isTemplate`, `baseUpdatedAt`, `removeEncryption`. If the stored page is newer than `baseUpdatedAt` the answer is `409 conflict` with `details.current`, and nothing is overwritten. For an encrypted page see below. |
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

### Encrypted pages

A page is encrypted when its whole `content` is one code block of the language
`pgp-message` holding one ASCII-armoured OpenPGP message
(`encryptedNoteDoc`, `encryptedNoteArmor` in `packages/shared/src/encryption.ts`).
`GET /api/notes/:id` then answers `encrypted: true`. The server cannot decrypt it and
has no route that tries. Its part is this:

- A `PATCH` whose `content` would put ciphertext in place of text, text in place of
  ciphertext, or one message in place of another must carry `baseUpdatedAt`
  (`400` without it, `409` if the page has changed).
- One that would put text in place of ciphertext must also carry
  `removeEncryption: true` (`409` without it).
- A template cannot be encrypted (`400`), and an encrypted page cannot become a
  template (`409`).
- For an encrypted page no preview text, links or search passages are kept, and the save
  that encrypts it erases the text it replaces from the database file.

`title`, `tags`, `icon`, `isFavorite` and the rest are saved as for any page.

## Encryption

Types: `packages/shared/src/encryption.ts`. See [encryption.md](encryption.md) and
[security.md](security.md#encryption). These routes are a shelf for keys and nothing
more: the server does no cryptography, and no route takes or returns a passphrase, an
unprotected private key, or anything to be encrypted or decrypted.

| Method and path | Purpose |
| --- | --- |
| `GET /api/encryption/keys` | `{ keys }` (`StoredKey`): `fingerprint`, `publicKey` (armoured), `hasPrivateKey`, `mine`, `addedAt`, `updatedAt`. Never a private key. |
| `PUT /api/encryption/keys` | Adds a public key, or replaces the stored copy of the same key. Body (`SaveKeyBody`): `publicKey` (armoured, one key, at most 100 kB), `mine?`. The key is filed under the fingerprint the server works out from it. `400` for anything that is not exactly one public key, including a private key; `413` at 500 keys. `{ key }`. |
| `GET /api/encryption/keys/:fingerprint/private` | `{ privateKey }`: the armoured private key, still protected by its passphrase, sent with `Cache-Control: no-store`. `404` when it is not kept on the server. |
| `PUT /api/encryption/keys/:fingerprint/private` | Keeps the private half of a key already on the shelf. Body (`SavePrivateKeyBody`): `privateKey`. `400` unless every secret part is protected by a stretched passphrase and the key is the one named; `404` when the public key is not there. `{ key }`. |
| `DELETE /api/encryption/keys/:fingerprint/private` | Stops keeping the private half. `{ key }`. |
| `DELETE /api/encryption/keys/:fingerprint` | Deletes the key, both halves. |

`:fingerprint` is 40 hexadecimal digits (64 for a version 6 key), in either case.
A change sends the event `encryption.changed`.

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
| `GET /api/kiwix/books/:collectionId/documents` | The documents of a collection that is a set of files with a list, made with openZIM's nautilus. Query: `q` (words, at most 200 characters; each must start a word of the title, author, description or a file name), `offset`, `limit` (0 to 500, 200 by default; 0 asks only whether there is a list). Answers `{ list, problem }` (`ArchiveDocumentsResponse`). `list` is `null` for an ordinary collection, and for one that cannot be read right now; otherwise `{ home, total, matched, offset, documents, skipped, truncated }`, each document `{ id, title, description, author, files: [{ name, path, kind, documentId, adding, problem }] }`. `path` is the file's path inside the book, for the proxy and for `files/save`; `kind` is `pdf`, `epub`, `audio`, `video` or `other`; `documentId` is set when the file is already in the library; `adding` is `now` while it is being copied, `waiting` while it waits its turn in an "add all", otherwise `null`; `problem` is why the last "add all" could not add it, until it is added. `problem` says why a collection that keeps such a list could not have it read. Changes nothing: what is read is held in memory. |
| `POST /api/kiwix/import` | Registers a `.zim` file that is already on a storage location. Body: `locationId`, `relPath`, `title?`. Nothing is copied. |
| `POST /api/kiwix/books/:collectionId/files/save` | Copies a file out of the archive into the document library, on the default storage location. No connection is needed. Body: `path` (the file's path inside the book, for example `example.org/docs/manual.pdf`), `title?`. Answers `{ status, document }` (`SaveArchiveFileResponse`): `created`; `already` when this file had been added before; `duplicate` when the library held the same file from elsewhere. PDF, EPUB, Markdown and text files only; a page is a `400`. A file the location has no room for is a `507` (`insufficient_space`) before anything is written. Two requests for the same file at once share one copy. |
| `POST /api/kiwix/books/:collectionId/files/check` | Which of these files are already documents, or on their way. Body: `paths` (at most 500). Answers `{ files: [{ path, state, documentId?, turn? }] }`, where `state` is `new`, `saved`, or `adding` with `turn` `now` or `waiting`. |
| `POST /api/kiwix/books/:collectionId/files/sizes` | How large these files are, as the archive says. Body: `paths` (at most 500). Answers `{ files: [{ path, sizeBytes }] }` (`ArchiveFileSizes`); `sizeBytes` is `null` for a file the archive gave no size for, and for a kind the library does not keep. The archive is asked for headers only, three files at a time, for at most eight seconds; what it says is remembered until the server stops. Changes nothing. |
| `POST /api/kiwix/books/:collectionId/files/add-all/plan` | What an "add all" would do. Body, an `ArchiveAddScope`: `{ kind: "list", q? }` for every document of the archive's list (those matching `q`), or `{ kind: "files", files: [{ path, title? }] }` for at most 300 files named one by one. Answers `ArchiveAddPlan`: `{ count, already, bytes, unsized, location: { id, name, freeBytes }, reserveBytes, refusal, ocrAuto }`. `count` files would be copied and `already` are in the library; `bytes` is what those with a known size come to and `unsized` how many have none; `refusal` is why it cannot start, in words, or `null`. Changes nothing. |
| `POST /api/kiwix/books/:collectionId/files/add-all` | Starts the job that copies them (type `kiwix.add-files`, queue `reference-files`). Same body. Answers `{ job, already }` (`StartArchiveAddResponse`); `already` is true when one was under way for this collection, which is given back instead. A `507` when there is not room, a `409` when everything asked for is in the library, a `502` when the collection cannot be read. The job's progress is `current` of `total` files; it is cancelled with `POST /api/jobs/:id/cancel`; its `result` is an `ArchiveAddResult`: `{ scope, q, wanted, added, addedBytes, already, failed: [{ path, title, reason }], failedMore, notReached, stopped, stoppedReason, locationName }`, kept also when it was cancelled; `stopped` is `null`, `cancelled`, `space` (no room left), `storage` (the location went away) or `unreadable` (the collection did). |
| `GET /api/kiwix/books/:collectionId/files/add-all` | `{ job }`: the "add all" for this collection that is waiting or running, failing that the last one that ended, or `null`. |
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
of the library document it became. A saved web page is not a download: it is a job of
its own (see [Web pages](#web-pages)).

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

## Web pages

Types: `packages/shared/src/webpages.ts`. See
[notes-and-imports.md](notes-and-imports.md#saving-a-web-page).

These fetch one page from the web, because a person asked, and keep a readable copy
in the document library. Each takes exactly one address; a body with any other field
(a list of addresses, say) is a `400`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/webpages/preview` | Body: `url`. Fetches that page, finds the article, and answers `WebPagePreview`: `previewId`, the `url` it came from after redirects and the `requestedUrl`, `title`, `byline`, `site`, `published`, `language`, `words`, an `excerpt`, `pictures` (`count`, `willFetch`, and the `hosts` they would come from), `existing` (copies of this address already in the library, as `{ documentId, title, savedAt }`), and the `limits`. Nothing is kept but the look itself, in memory, for fifteen minutes. The request holds until the page has arrived (at most 20 seconds) and been read; closing the connection stops the fetch. Pictures are not fetched. |
| `POST /api/webpages/save` | Body (`SaveWebPageRequest`): `url`; `previewId?` (saves the page as it was looked at, without fetching it again; without it, or once it has lapsed, the page is fetched); `pictures?` (default false: fetch the article's pictures); `keepBoth?` or `replaceDocumentId?` (required, one or the other, when the address is already in the library); `locationId?`. Answers `{ job }`: a job of type `webpage.save` on the `webpage` queue, followed and cancelled through `/api/jobs`. Its `result` is `SaveWebPageResult`: `documentId`, `title`, `url`, `pictures` (`kept`, `bytes`, and each one `skipped` with the reason), and `replacedDocumentId` when a copy was replaced. A second request for an address already being saved answers with the job under way. |

Errors: `400` for an address that is not one `http` or `https` address without
credentials; `403` for an address on this computer or a private network, or a page
that redirects to one (unless the server was started with
`OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`); `409` from `save` when the address is already
in the library and the request does not say what to do (`details.existing` lists the
copies), and from `preview` when too many pages are being read at once; `413` for a
page over 5 MB or 50,000 elements; `415` for an answer that is not a web page, a page
with no readable text, or one that could not be read; `502` when the site answered
with an error or took too long; `503` when it could not be reached. A job that fails
carries the same sentence in its `error`.

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
| `GET /api/maps/tiles/:z/:x/:y.mvt` | A vector tile from the best installed region. `204` when no region has it. With `?raw=1` a gzipped tile is sent as stored: no `Content-Encoding`, `X-Outpost-Tile-Encoding: gzip` instead, and `Cache-Control: no-store`. That is for a browser keeping the tile itself; see below. |
| `GET /api/maps/terrain/:z/:x/:y.webp` (or `.png`) | A terrain tile. |
| `GET /api/maps/terrain-profile` | The ground along the great circle between two points, read from installed terrain (`TerrainProfile` in `packages/shared/src/radio.ts`). Query: `from` and `to`, each `latitude,longitude`. At most 4,096 samples; `heights` holds `null` where no terrain is installed, and `gaps` names those stretches. Points more than 1,000 km apart, or in the same place, are refused with a 400. Nothing is downloaded. See [maps.md](maps.md#line-of-sight). |
| `GET /api/maps/area-size?bbox=west,south,east,north&maxZoom=14&terrain=1` | What keeping that box on a phone would fetch, read from the installed archives' directories without reading a tile (`MapAreaSize`): per layer the number of tiles the installed maps hold in the box, their bytes as stored, and the zoom range, which stops at the deepest zoom installed. `map` is `null` when no detailed map is installed; `terrain` is `null` unless asked for and installed. `400` for a box that is not one; `413` (`too_large`) past 12,000 tile positions in one layer. Changes nothing. |

`?raw=1` and `area-size` exist for [keeping a map area on a phone](offline.md#a-phone-out-of-reach-of-the-server).
The server only measures and serves; the browser fetches each tile and stores it. The
arithmetic both sides share (which tiles a box touches, the limits) is in
`packages/shared/src/kept.ts`.

### Places

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/places` | Place search (`PlaceSearchResponse`). Query: `q`, `limit` (at most 50), `near` (`latitude,longitude`). When `q` is a position (coordinates, a British grid reference or a Maidenhead locator), `coordinate` is set and `places` is empty; for a locator, `coordinate.locator` is the locator in capitals and the position is the middle of its cell. `otherReadings` is there only when the text can mean a second position (four characters that are both a grid reference and a locator). |
| `GET /api/maps/places/datasets` | Installed place-name datasets. |
| `POST /api/maps/places/datasets` | Downloads one. Body: `dataset` (`cities500`, `cities15000` or `country`), `country` (two letters, with `country`), `locationId?`. `{ download }`. |
| `DELETE /api/maps/places/datasets/:id` | Removes a dataset and its names. |

### Markers and tracks

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/markers` | `{ markers }` (`MarkerDto[]`). |
| `POST /api/maps/markers` | Body: `name`, `lat`, `lon`, `note?`, `color?`, `icon?` (one of `MARKER_ICONS`: `pin`, `home`, `shelter`, `tent`, `parking`, `water`, `food`, `first-aid`, `fuel`, `summit`, `viewpoint`, `mast`, `meeting`, `danger`, `star`, `flag`; `pin` when left out), `isFavorite?`, `noteId?`. `400` for any other icon. |
| `PATCH /api/maps/markers/:id` | Any of the same fields. |
| `DELETE /api/maps/markers/:id` | |
| `GET /api/maps/tracks` | `{ tracks }` (`TrackDto[]`). |
| `POST /api/maps/tracks` | Saves a route drawn on the map: straight lines between the points sent. Body: `name`, `points` (at least two of `{ lat, lon }`), `description?`, `color?`. Answers `{ track, elevation }` (`RouteSaveResponse`). |
| `PUT /api/maps/tracks/:id/points` | Replaces a track's lines with one drawn through `points`. Its waypoints are kept. Answers `{ track, elevation }`. |
| `POST /api/maps/tracks/import` | One GPX file as `multipart/form-data` (at most 20 MB). Optional fields: `name`, `color`, `importWaypointsAsMarkers`. Answers `{ track, markers }`. A waypoint saved as a marker takes the icon its `<sym>` stands for, when it is a known one. |
| `PUT /api/maps/recordings/:id` | Saves a track recorded on the map. `:id` is 26 characters chosen by the device (digits and lower-case letters, without `i`, `l`, `o`, `u`), and becomes the track's id. Body: `multipart/form-data` with `name`, `color?` and one GPX file (at most 20 MB) holding tracks only, with a time at every point and at most 150,000 points. Answers `{ track, alreadySaved }`; sent again with the same id, it answers with the track already there and writes nothing. See [maps.md](maps.md#recording-a-track). |
| `GET /api/maps/tracks/:id` | One track with its geometry as GeoJSON. |
| `PATCH /api/maps/tracks/:id` | Body: `name?`, `description?`, `color?`. |
| `DELETE /api/maps/tracks/:id` | |
| `GET /api/maps/tracks/:id/export.gpx` | One track as GPX. |
| `GET /api/maps/export.gpx` | A selection as one GPX file. Query: `markers=1`, `tracks=<id>,<id>`. A marker with an icon is written with the Garmin symbol name for it as `<sym>`, where there is one; see [maps.md](maps.md#icons-and-gpx). |

## Contacts
### Finding a route

Types: `packages/shared/src/route-finder.ts`. See
[maps.md](maps.md#finding-a-known-route). Searching and previewing each make one
request to a route source on the internet; everything else here is local.

| Method and path | Purpose |
| --- | --- |
| `GET /api/maps/route-sources` | The declared route sources, the one an administrator named as the default (`null` when the source is chosen by where the map is), and what was wrong with a source file that could not be read (`RouteSourcesResponse`). Contacts nobody. |
| `POST /api/maps/route-search` | Body: `text?` (3 to 80 characters of a name), `bbox?` (`[west, south, east, north]`, at most 2° each way), `sourceId?` (without it: the administrator's default, else the first source whose box holds the middle of `bbox`, else the first with no box). At least one of `text` and `bbox`. Answers `RouteSearchResponse`: up to 40 routes and 20 named paths, whether there were more, and how fresh the source's copy of the map is. `503` with code `offline` when the source cannot be reached; `502` when it is busy, slow or answers with something else; `409` when another search or preview is still running after this one has waited two seconds for its turn. |
| `POST /api/maps/route-search/preview` | Body: `ref` (`{ "type": "relation", "id" }` or `{ "type": "ways", "ids" }`, as a search result gives it), `sourceId?`. Answers a `RoutePreview`: the route as lines, its length, gaps and branches, its alternative legs, its sections if it is kept as sections, its credit, and a `token`. `413` when the route is too large to add. |
| `POST /api/maps/route-search/add` | Body: `token`, `name?`, `color?`, `includeAlternatives?`. Saves the previewed route as a track and answers `{ track, elevation }` (`RouteSaveResponse`). The source is not asked again. A token makes one route: a second request with the same token, while the first is still reading heights or after it has finished, is answered with that same route as it is now (the `name`, `color` and `includeAlternatives` of the second request are not used). `409` when the preview is no longer held (after fifteen minutes, or when it was let go to make room: previews are held up to 600,000 points and 200 previews in all, oldest let go first), or when the route made from it has since been removed. |
| `POST /api/maps/tracks/:id/heights` | For a route added this way: reads its heights again from installed terrain. Answers `{ track, elevation }`. A height a point already has is kept where terrain has none. `400` for a track that was drawn or imported, or whose shape has been redrawn by hand; `409` when the route changed while terrain was being read, in which case nothing is written. |

A track added this way carries `source` on its GeoJSON (`TrackSource`): the credit,
the licence, the OpenStreetMap element, when it was fetched and from which server.

## Backup

Types: `packages/shared/src/contacts.ts`. See [contacts.md](contacts.md).

| Method and path | Purpose |
| --- | --- |
| `GET /api/contacts` | The list (`ContactListResponse`): the marked contacts first, then by family name. Query: `q` (words, or part of a number), `tag`, `emergency=1`, `limit` (at most 1,000; 300 if not given), `offset`. `total` counts what matches, `all` every contact, `emergency` the marked ones, `tags` each tag with how many carry it. |
| `POST /api/contacts` | Makes a contact. Body: any of the fields of `ContactFields`, with `markerId?` (a saved place) and `pageIds?` (pages of notes). `{ contact }` (`ContactDto`). `400` when it has no name, number or address, or a field is longer than is kept; `409` at 20,000 contacts. |
| `GET /api/contacts/:id` | `{ contact }`, with the saved place and pages it links to (those that still exist) and `otherFields`, the lines kept from a phone that have no field. |
| `PATCH /api/contacts/:id` | Any of the same fields; what is left out stays. With `baseUpdatedAt` (the `updatedAt` that was read), `409` if the contact has changed since, and nothing is saved. |
| `DELETE /api/contacts/:id` | Removes it. |
| `GET /api/contacts/emergency` | `{ contacts }`: the marked contacts, whole, for the emergency sheet. |
| `GET /api/contacts/export.vcf` | A vCard file, as an attachment. Query: `version` (`3.0`, the default, or `4.0`), and to narrow it `ids` (comma-separated), `tag`, `emergency=1`. `404` when nothing matches. |
| `POST /api/contacts/import/preview` | Reads contacts and changes nothing. Either a `multipart/form-data` upload with one vCard file (at most 50 MB), or JSON `{ picked }` from the browser's contact picker (`PickedContact[]`). Answers a `ContactImportPreview`: `token`, `fresh`, `alreadyHere`, `repeated`, `duplicates` (each with the contact it looks like, why, the two side by side as `lines`, and what merging would add), `unreadable` (with reasons), `photosLeftOut`, `room`. The token is good for half an hour and does not survive a restart. |
| `POST /api/contacts/import/apply` | Body: `{ token, choices?, leaveOut? }`. `choices` maps a duplicate's card index to `keep` (the default), `merge`, `replace` or `both`; `leaveOut` lists card indexes of new contacts not to bring in. Answers a `ContactImportResult`. `409` when the token is no longer waiting. |
| `DELETE /api/contacts/import/:token` | Forgets a file that was read and not brought in. |
| `GET /api/contacts/phones` | `ContactsPhoneStatus`: whether the address book for phones is on, why it is not offered (`unavailable: "portable"`), the user name to type and the path to give a phone. It is turned on with the `contacts.carddav` setting. |

### The address book for phones (CardDAV)

Not under `/api/`, and not for the web app: these are for contacts apps, and answer
only while `contacts.carddav` is on (`404` otherwise). No header, user name or password
is needed. See [contacts.md](contacts.md#keeping-a-copy-on-a-phone-carddav) and
[security.md](security.md#the-address-book-for-phones-carddav).

| Method and path | Purpose |
| --- | --- |
| `GET`, `PROPFIND /.well-known/carddav` | `301` to `/dav/` (RFC 6764). |
| `OPTIONS /dav/…` | `DAV: 1, 3, addressbook`. |
| `PROPFIND /dav/`, `/dav/principal/`, `/dav/addressbooks/`, `/dav/addressbooks/contacts/` | Properties of the root, the principal, the home and the one address book (`Depth: 0` or `1`), as a `207` multistatus. The address book has `getctag`, `supported-report-set` and a read-only `current-user-privilege-set`. |
| `REPORT /dav/addressbooks/contacts/` | `addressbook-multiget` and `addressbook-query` (RFC 6352). `sync-collection` is answered `403` with `supported-report`. |
| `GET`, `HEAD /dav/addressbooks/contacts/<id>.vcf` | One contact as vCard 3.0, with its `ETag`. |
| Anything that writes | `403` with `need-privileges`. Nothing is changed. |
## Repeaters

Types: `packages/shared/src/repeaters.ts`. See [radio.md](radio.md#repeaters). One
route here makes an outbound request, `POST /api/repeaters/sources/:id/fetch`; nothing
else does. Frequencies are whole hertz; the **output** is what the repeater transmits
on.

| Method and path | Purpose |
| --- | --- |
| `GET /api/repeaters/overview` | What is held (`RepeatersOverview`): the imported lists with the date of each one's data, counts by band and mode, how many have a position. |
| `GET /api/repeaters` | A page of entries (`RepeaterListResponse`). Query: `q` (callsign, town, keeper, channel, locator; a number is megahertz and matches every output or input that starts that way), `band`, `mode`, `hideOffAir=1`, `list` (a list's id, or `own` for entries made by hand), `near=latitude,longitude` (sorts by distance and adds `distanceMeters` and `bearingDegrees`), `withinKm` (with `near`), `limit` (1 to 200, default 50), `offset`. Without `near` the order is by callsign. Entries with no position follow those with one, and are left out when `withinKm` is given. |
| `GET /api/repeaters/overlay?bbox=west,south,east,north` | What to draw in a box of the map (`RepeaterOverlayResponse`): every repeater when there are at most 400, otherwise counts by patch with each patch's middle, and as a point any repeater alone in its patch. Takes the same filters as the list. A box across the 180° meridian has its west edge east of its east edge. |
| `GET /api/repeaters/export?format=chirp` (or `outpost`) | A CSV of the entries the same filters and `near` pick, as a download: CHIRP's columns (at most 2,000 rows) or Outpost's own, which reads back without loss. `limit` takes the first so many. `X-Outpost-Repeater-Count` gives the number of rows. `404` when nothing matches. |
| `POST /api/repeaters/import/preview` | Multipart: one CSV file, or JSON list of records (16 MB, 100,000 rows) and optional fields `mapping` (JSON, field to column heading; see `RepeaterColumnMap`) and `listId`. Answers with how the file was read and what importing it would do (`RepeaterImportPreview`), including what an update of that list would change. Keeps nothing. The answer also counts the rows that are already held or repeat within the file (`duplicates`, with a few pairs side by side). |
| `POST /api/repeaters/import` | The same file and fields, committed, with `name`, `source`, `sourceUrl` and `dataDate` (`YYYY-MM-DD`, not in the future) for the list, and for an update `edited` (`keep`, the default, or `replace`) and `gone` (`remove`, the default, or `keep`). Answers with `RepeaterImportResult`. One import at a time: a second is refused with `409`. `duplicates` says what to do with rows that are the same repeater as one already held or as an earlier row: `keep-both` (the default), `skip` or `prefer-newer`. |
| `GET /api/repeaters/sources` | The declared sources by region (`RepeaterSourcesResponse`): for each its kind (`fetch`, `link` or `none`), the reason, the publisher's terms as read, the steps for one to be had by hand, and the list held from it if Outpost fetched one. Contacts nobody. |
| `POST /api/repeaters/sources/:id/fetch` | Fetch the file of a source of kind `fetch`, once, and answer with what it would bring in (`RepeaterFetchResponse`: a `token` for the held file and the same preview as for an upload). Nothing is kept. `409` when the source's host was asked too recently, with the seconds left in the message; `502` when the host refuses, is busy, sends a web page or something that is not a list, or does not finish; `503` when it cannot be reached; `400` for a source that is not of kind `fetch`. |
| `POST /api/repeaters/fetched/:token/preview` | The held file read again. JSON body: `mapping` (an object), `listId`, `dataDate`. |
| `POST /api/repeaters/fetched/:token/import` | The held file, committed. JSON body: the fields of an import (`name`, `source`, `dataDate`, `listId`, `edited`, `gone`, `duplicates`, `mapping`). The list records where it was fetched from, when, and the terms as read (`RepeaterListDto.fetched`). `404` once the file has been kept, forgotten, or has waited more than half an hour. |
| `DELETE /api/repeaters/fetched/:token` | Forget a held file. |
| `GET /api/repeaters/duplicates` | Entries held that are the same repeater (same callsign, output within 3 kHz), in groups, and pairs that may be (different callsigns, one frequency, nearly one place), each with the entry that would be kept (`RepeaterDuplicatesResponse`; the first 100 of each, with totals). Changes nothing. |
| `POST /api/repeaters/duplicates/merge` | Body: `keepId`, `mergeIds` (1 to 20). Makes one entry of them: what the person typed on the others is carried onto the kept entry, its gaps are filled, and the others are set aside. `400` unless each is the same repeater as the kept entry, or possibly the same. |
| `POST /api/repeaters/duplicates/merge-all` | Merges every group whose callsign and frequency agree, keeping in each the entry of the list with the newest data. Pairs that only may be the same are left. |
| `POST /api/repeaters/:id/separate` | Bring back the entries that were set aside for this one. |
| `PATCH /api/repeaters/lists/:id` | Change a list's `name`, `source`, `sourceUrl` or `dataDate`. |
| `DELETE /api/repeaters/lists/:id` | Remove a list and every entry in it, the person's changes to them included. |
| `POST /api/repeaters/lists/:id/restore-removed` | Bring back the entries of a list that were removed one by one. |
| `POST /api/repeaters` | Add an entry by hand. Body: `callsign`, `outputHz`, and optionally `inputHz`, `modes`, `ctcssHz`, `dcsCode`, `dmrColourCode`, `talkgroups`, `accessNote`, `channel`, `place`, `region`, `country`, `lat` and `lon`, `locator`, `antennaMeters`, `keeper`, `status`, `notes`. A `locator` with no coordinates places it at the middle of the square. |
| `GET /api/repeaters/:id` | One entry, its list, what the list says where the person has changed it, and the entries set aside for it (`RepeaterDetailResponse`). |
| `PATCH /api/repeaters/:id` | Change an entry. One that came from a list is then marked as the person's, and an update of the list leaves it alone. |
| `POST /api/repeaters/:id/revert` | Put a changed entry back to what its list says. |
| `DELETE /api/repeaters/:id` | Remove an entry. One from a list is kept as a mark, so that an update does not bring it back. |
## HF propagation

Predictions are worked out by VOACAP on the server, with no connection. See
[hf-propagation.md](hf-propagation.md) for what the figures mean.

| Route | What it does |
| --- | --- |
| `GET /api/radio/propagation/engines` | The engine: its model, the program that runs it, its checksum, the range it covers, and `ready`. When it cannot run, `problem` says why. |
| `GET /api/radio/propagation/datasets` | The data installed (versions, sizes, dates, checksums, terms), what was looked at and is not offered, and the solar table in use month by month. |
| `POST /api/radio/propagation/datasets/solar-cycle/download` | Fetches a newer solar cycle table through the download manager. Body: `{ locationId? }`. Returns `{ download }`. `409` when today's table is already downloaded or on its way. |
| `POST /api/radio/propagation/predict` | One path for one day. Body below. Returns a `PredictionResult` (`packages/shared/src/propagation.ts`): 24 hours, each with the frequency asked about, every band, a sweep of 2 to 30 MHz, every mode, the ionosphere over the middle of the path, MUF, FOT, HPF and LUF; with the engine, the data versions, the basis of the sunspot number and the answer's key. With `?background=true` it returns `{ job }` and the job's result holds the key. |
| `POST /api/radio/propagation/compare` | The same path with one thing changed. Body: `{ base, what }`, `what` one of `seasons`, `sunspots`, `power`, `antennas`, `noise`. Returns a series of 24 hours for each variant. |
| `POST /api/radio/propagation/listing` | The page VOACAP itself prints for the request, as `{ listing }`. |
| `GET /api/radio/propagation/results/:key` | An answer already worked out. `404` once it has been cleared to make room. |
| `GET` / `POST /api/radio/propagation/saved`, `DELETE …/saved/:id` | Predictions kept by name. `POST` body: `{ name, request, key? }`. |
| `GET /api/radio/profiles` | `{ radios, antennas }`. |
| `POST /api/radio/profiles/radios`, `PATCH` / `DELETE …/radios/:id` | A radio: `name`, `model`, `powerWatts`, `minMhz`, `maxMhz`, `modes`, `receiver`, `notes`. |
| `POST /api/radio/profiles/antennas`, `PATCH` / `DELETE …/antennas/:id` | An antenna: `name`, `kind`, `heightM`, `ground`, `broadsideDeg`, `gainDb`, `feedlineLossDb`, `minMhz`, `maxMhz`, `notes`. |

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

`solar` may instead be `{ "source": "manual", "ssn": 60 }` or
`{ "source": "fof2", "fof2Mhz": 6.4, "utcHour": 12 }`. Optional: `requiredSnrDb` and
`referenceBandwidthHz` (a person's own figures for the mode), and
`reply: { powerWatts, noise }` to predict the way back as well.

Limits checked before the engine sees a request: latitude -90 to 90, longitude -180 to
180, a real date from 1950 to 2100, power 0.1 W to 500 kW, frequency 2 to 30 MHz,
sunspot number 0 to 300, a horizontal antenna at least 0.5 m up, and a requirement
between -30 and 99.9 dB once restated in 1 Hz. `400` says which. `415` with
`details.reason = "engine-unavailable"` means the engine or its data is missing or
damaged: the message names the file, and nothing is predicted.

## Backup

Types: `packages/shared/src/backup.ts`.

"Local only" below means `403 forbidden` unless the request comes from the computer
Outpost runs on or the server was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`. The
`right` in the status and schedule says whether this request has that right:
`{ allowed, reason: "local" | "option" | "remote", option }`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/backup/status` | `{ restorePending, previousData, supervised, right }`. |
| `GET /api/backup/download` | Streams a backup `.zip`: the database, attachments, extracted text and your own catalogue manifests. Refuses a request that another site caused the browser to make. |
| `POST /api/backup/restore` | Local only, refused before the body is read. Body: the backup file itself, with `Content-Type: application/zip`. Checks it and stages it for the next start. `{ staged, createdAt, appVersion, supervised }`. When applied, the database, attachments and extracted text are replaced; catalogue manifests in the backup are not put back; unfinished jobs are dropped, downloads that were under way are marked cancelled, and unfinished imports are discarded. |
| `DELETE /api/backup/restore` | Drops a staged restore. |
| `GET /api/backup/schedule` | `BackupSchedule`: the settings (`locationId`, `frequency`, `time`, `weekday`, `keep`), the folder name, the location and whether it is connected, `lastBackupAt`, `nextRunAt`, `waiting` (a scheduled backup that is due and has not been made, with `reason` `not_connected`, `location_removed` or `failed`, a message and, for `failed`, `retryAt`), `lastFailure`, the `active` job, and `right`. |
| `PATCH /api/backup/schedule` | Body: any of `locationId` (a connected location, or `null` for off), `frequency` (`daily`, `weekly`), `time` (`HH:MM`, the server's clock), `weekday` (0 is Sunday), `keep` (1 to 60). A lower `keep` is local only. Returns the schedule. |
| `POST /api/backup/run` | "Back up now": a `backup.run` job. `409` when no location is chosen or a backup is already under way; `503 storage_unavailable` when the location is not connected. |
| `GET /api/backup/stored` | `{ available, reason, backups }`: Outpost's own backups on the chosen location, newest first, each with `name`, `kind` (`scheduled`, `manual`), `createdAt`, `sizeBytes`, `appVersion` and `check` (`verified`, `unverified`, `unreadable`). |
| `GET /api/backup/stored/:name/download` | The file. Refuses a request that another site caused the browser to make. |
| `POST /api/backup/stored/:name/restore` | Local only. Checks that backup and stages it, exactly as an upload is. `{ staged, createdAt, appVersion, supervised }`. |
| `DELETE /api/backup/stored/:name` | Local only. Deletes that backup and the record of its check. |

`:name` must be a file name Outpost gives its backups; anything else is `404`. The
server publishes `backup.changed` on the event stream when the schedule, a backup or
the list changes.

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
