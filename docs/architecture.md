# Architecture

Outpost is one Node.js process that serves a web app and an HTTP API from a SQLite
database and a set of folders. One optional helper process, kiwix-serve, reads ZIM
archives. That is the whole system. Everything below is detail.

```
 Browser ──────────────► Outpost server (Node 24, Fastify)
   React app                 │
   same origin only          ├── SQLite (one file): library records, notes, search index, jobs
                             ├── data directory:    attachments, extracted text, staging, models
                             ├── storage locations: documents, collections, maps (any mounted folder)
                             └── kiwix-serve ◄───── proxied, sandboxed, never exposed directly
```

## Decisions and why

### Node and TypeScript on the server, not Python

The brief suggested Python and FastAPI; the maintainer prefers Node. One language
across server, web app and shared types means the API contract is checked by the
compiler on both sides (`packages/shared`). The equivalents used:

| Brief | Outpost | Notes |
| --- | --- | --- |
| FastAPI | Fastify 5 | Plugin per feature module |
| Pydantic | zod 4 | Request validation at the route |
| SQLAlchemy | Drizzle ORM | Typed schema, generated SQL migrations |
| Background jobs | In-process job queue on SQLite | See below |
| PyMuPDF | unpdf (PDF.js) | MIT/Apache; PyMuPDF and the `mupdf` npm package are AGPL |

The server runs TypeScript directly on Node 24 (type stripping), so development has no
build step. For release it is bundled with esbuild into `dist/app`, a directory that
runs with nothing but a Node binary. The Docker image and portable drives both use
that same bundle.

### SQLite for everything, including search

One file, no service to run, safe on a Raspberry Pi's SD card in WAL mode, and FTS5 is
a capable full-text engine. The database lives in the data directory, which should be
a local disk: WAL needs real file locking, which network shares do not provide
reliably. Large content does not live in the database and can be on any storage.

PostgreSQL with pgvector is not implemented. The seams where it would attach are the
`VectorIndex` interface and the search service; see [Limits](#limits-and-trade-offs).

### Storage locations are identified by a marker file, not a path

Every location has `.outpost-location.json` at its root holding its id. Records refer
to content as *(location id, relative path)*. If a USB drive comes back at a different
mount point, or a share is remounted under another name, Outpost finds the marker
inside the configured roots and carries on. If a *different* drive appears at the old
path, the marker does not match and the location is reported as disconnected rather
than silently used.

Browsers can only name folders inside the **storage roots** the administrator
configured (`OUTPOST_STORAGE_ROOTS`). The server never accepts an absolute path from a
request without checking it against those roots.

### One job queue for all long work

Downloads, text extraction, imports, moving and verifying collections, index builds
and writing portable drives are rows in a `jobs` table, run in-process on named queues
with their own concurrency limits. Rows survive restarts; whatever was running is
queued again and its handler resumes from what is on disk. Progress reaches the
browser over one server-sent-events stream. A separate job server (Redis and a worker
fleet) would be the wrong weight for a single-node tool that must run on a Pi.

CPU-heavy parsing (PDF text) runs in a worker thread so that one large document cannot
stall the HTTP server.

### Search in three layers behind one entry point

Owning modules describe what they hold (`search.upsert({ kind, title, sections, url })`)
and never see how search works.

1. **Keyword**: FTS5 over passages, BM25 with title, heading and tag columns weighted
   above body text, snippets with match positions, prefix matching on the word being
   typed, and a fallback from "all words" to "any word" that is stated in the results.
2. **Semantic** (optional): vectors per passage, keyed by *(passage, model id)* so
   models of different dimensions coexist and an index can be rebuilt for a new model
   without disturbing the old one. The built-in index is flat (exact, no native code).
3. **Hybrid**: reciprocal rank fusion of every source's ranked list. Because it uses
   ranks, not scores, the same fusion also folds in articles from Kiwix archives, whose
   scores are not comparable to anything.

Passages keep document id, page, heading, character offsets, content hash and index
version: everything needed to cite a source. The retrieval module turns a question
into numbered, quoted context with citations. No language model ships; the interfaces
for one are in `modules/retrieval/types.ts` and described in [ai.md](ai.md).

### Reference collections through kiwix-serve, behind a sandboxing proxy

ZIM archives are served by the Kiwix project's own server rather than re-implemented:
it is maintained, it handles the format's full-text indexes, and running it as a
separate process keeps its GPL code at arm's length from Outpost's MIT code.

A ZIM archive is a copy of someone else's web site, scripts included. Served from
Outpost's origin, those scripts could call Outpost's API as the signed-in person. So
the browser never talks to kiwix-serve. Outpost proxies only article content and
replaces the response's security policy with a `sandbox` that omits
`allow-same-origin`. The page then runs in an origin of its own: it cannot read
cookies, storage or API responses, and cannot load anything from the internet. Since
cookies are not sent from a sandboxed page, access is carried by a short-lived signed
token in the URL. This was checked in a real browser against kiwix-serve 3.8.2 with a
Wikipedia archive.

kiwix-serve trusts its library file and will not search a book that has no language
recorded, so Outpost writes complete metadata, which it reads back from each archive.

### Maps: regional extracts of a planet archive, composited on the server

Tiles come from the Protomaps daily planet build (OpenStreetMap data, ODbL), a single
PMTiles archive that supports HTTP range requests. Outpost reads the archive's
directories to work out exactly which byte ranges a region needs, which gives an
**exact** size before downloading, then fetches only those ranges into a new, valid
PMTiles file. This is the same method as the Protomaps `pmtiles extract` tool,
implemented in Node so that it is resumable, reports progress, goes through the same
download manager as everything else, and adds no binary dependency. OpenStreetMap's
public tile servers are never used.

The browser sees one tile endpoint. The server looks through installed regions for
the best archive holding each tile, so regions join seamlessly and a world overview
fills in when zoomed out. Styles, fonts and sprites are served by Outpost. Place-name
search uses GeoNames data loaded into FTS5.

### Security posture

- Binds to localhost by default. LAN access is a start-up setting, never changeable
  from the browser, and turns sign-in on.
- Every state-changing request must carry a custom header and come from the same
  origin. A page on another site cannot add the header without a CORS preflight, which
  is never approved. The Host header is checked against the names the server answers
  to, which defeats DNS rebinding.
- The app's Content Security Policy is `default-src 'self'` with `connect-src 'self'`:
  the browser itself enforces that nothing is loaded from, or sent to, anywhere else.
- Files people upload are served with `Content-Security-Policy: sandbox`, so an
  uploaded HTML or SVG file can never run script in Outpost's origin. Imported HTML and
  Markdown are converted to a fixed node schema; nothing is stored as raw HTML.
- Downloads are limited to hosts named in catalogue manifests for the first request,
  and every connection, including each redirect hop, must land on a public address.
  Integrity comes from the checksum published by the source, not from the mirror.
- Archives are unpacked with path, size, count and ratio limits, and never onto paths
  outside the staging folder.
- Passwords are hashed with scrypt. Sessions are random tokens stored hashed.
- No telemetry. The server makes an outbound request only as the direct result of a
  person's action: refreshing the catalogue, starting a download, estimating or
  downloading a map region or place names, fetching the runtimes for a portable drive,
  or, if they configured one, calling their own embedding server.

See [security.md](security.md) for the threat model.

## Code layout

```
apps/server/src/
  config.ts          environment → configuration
  app.ts             builds the Fastify app (used by index.ts and by tests)
  core/              context, jobs, events, errors, safe paths, guarded HTTP client
  db/                schema (Drizzle) and migrations
  modules/           one folder per feature; index.ts registers routes and a service
apps/web/src/
  styles/            design tokens, base, prose
  components/        shell and controls
  features/          one folder per screen
packages/shared/     API types and pure helpers used by both sides
catalog/             catalogue manifests, their schema, and map region presets
scripts/             packaged-app build, map asset fetch
e2e/                 Playwright tests against the packaged app
```

Modules, in registration order: search, semantic, retrieval, documents, notes, imports,
collections, kiwix, downloads, catalog, maps, backup, portable. A module may use the
services of those before it. [development/server-modules.md](development/server-modules.md)
is the contract a module works to.

## Limits and trade-offs

These are deliberate, and stated so nobody has to discover them.

| Area | Limit | Why, and what would lift it |
| --- | --- | --- |
| Scale | One node, one writer. | SQLite. Fine for a household or a classroom; a larger deployment needs the PostgreSQL seam filled in. |
| Vector search | Flat index: every query compares against every stored vector. | Exact and dependency-free; comfortable to roughly 100,000 passages. `VectorIndex` is the seam for sqlite-vec or pgvector. |
| Local embedding model | Needs the optional `@huggingface/transformers` package, which is not in the packaged app. | Its native runtime is large and has no musl or Intel-macOS builds. A local embedding server (Ollama, llama.cpp) works everywhere today. |
| Hybrid ranking settings | The fusion constant and the two weights are settings without a control on the Settings screen. | They can be changed through the API (see search.md), and tried out live on the How search works page. |
| OCR | Not included. Scanned PDFs and images are stored and viewable but have no searchable text. | A provider interface and optional Tesseract are the planned route. |
| Language model answers | Not included, by design for this release. | Interfaces exist; see ai.md. |
| ZIM archives | Need kiwix-serve (the Compose sidecar, or a binary for non-Docker installs). | Reading the format in pure JavaScript would mean reimplementing libzim. |
| Maps | Vector basemap only from the Protomaps schema; no contour lines; hill shading needs a separate terrain download; routing is not offered. | Contours need a contour tileset or client-side generation; both are possible later. |
| Map source | Depends on the Protomaps build host staying available for new downloads. | The source address is a setting; any PMTiles archive with the same schema works, including one you host. |
| Notes collaboration | Last writer wins, with conflict detection; no live co-editing. | The editor could take a CRDT later; the storage format would need to change. |
| Portable drives | A drive is a copy, not a sync partner: changes made on the drive are not merged back. | Merging two diverged libraries safely is a project of its own. |
| Windows without Docker | Untried. The server suite is set up to run on Windows in CI, but no CI run has happened yet, and nobody has run the packaged app on Windows by hand. | A first green CI run, then a manual pass. |

## Dependency licences

Outpost is MIT. Everything linked into it is MIT, ISC, BSD or Apache-2.0. Things that
are not are kept outside the process or left out:

| Component | Licence | How it is used |
| --- | --- | --- |
| kiwix-serve, libzim | GPL-3.0 / GPL-2.0+ | Separate process, reached over HTTP. Not linked, not bundled in the Outpost image. |
| `mupdf` (npm), PyMuPDF | AGPL-3.0 | Not used. PDF text comes from unpdf (PDF.js, Apache-2.0). |
| BlockNote | MPL-2.0, with GPL add-ons | Not used. The editor is Tiptap (MIT) with Outpost's own blocks. |
| Atkinson Hyperlegible, Literata, Noto Sans | OFL-1.1 | Bundled fonts. |
| Protomaps basemap styles | BSD-3-Clause (design CC0) | Bundled. |
| Map data | ODbL (OpenStreetMap) | Downloaded by the user; attribution shown on the map. |
| GeoNames | CC BY 4.0 | Downloaded by the user; credited where shown. |
| Natural Earth | Public domain | Bundled world outline. |
| Catalogue content | Per collection | Never bundled. Each entry states its licence, and says so when it has not been verified. |
