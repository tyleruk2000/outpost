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

Browsers can only name folders inside the **storage roots** set when the server starts
(`OUTPOST_STORAGE_ROOTS`). The server never accepts an absolute path from a request
without checking it against those roots.

### One job queue for all long work

Downloads, text extraction, imports, moving and verifying collections, index builds,
writing portable drives and bringing their changes back are rows in a `jobs` table,
run in-process on named queues with their own concurrency limits. Rows survive restarts; whatever was running is
queued again and its handler resumes from what is on disk. Progress reaches the
browser over one server-sent-events stream. A separate job server (Redis and a worker
fleet) would be the wrong weight for a single-node tool that must run on a Pi.

CPU-heavy parsing (PDF text) runs in a worker thread so that one large document cannot
stall the HTTP server. OCR does the same, on a queue of its own that runs one document
at a time. So does the built-in embedding model, in a worker that stays loaded while it
is in use and is ended after five idle minutes. A GPX file is read in a worker too, by
a reader that keeps only what is stored and never builds a tree of the file, so what it
costs in memory is bounded by the points in it (see [security.md](security.md#files-people-upload)).

### Search in three layers behind one entry point

Owning modules describe what they hold (`search.upsert({ kind, title, sections, url })`)
and never see how search works.

1. **Keyword**: FTS5 over passages, BM25 with title, heading and tag columns weighted
   above body text, snippets with match positions, prefix matching on the word being
   typed, and a fallback from "all words" to "any word" that is stated in the results.
2. **Semantic** (optional): vectors per passage, keyed by *(passage, model id)* so
   models of different dimensions coexist and an index can be rebuilt for a new model
   without disturbing the old one. The built-in index is flat (exact, no native code).
   A small embedding model ships with Outpost and runs as WebAssembly; a local
   embedding server can be used instead.
3. **Hybrid**: reciprocal rank fusion of every source's ranked list. Because it uses
   ranks, not scores, the same fusion also folds in articles from Kiwix archives, whose
   scores are not comparable to anything.

Passages keep document id, page, heading, character offsets, content hash and index
version: everything needed to cite a source. The retrieval module turns a question
into numbered, quoted context with citations.

### Answers: a model the person runs, never one Outpost ships

The last step of that pipeline, a language model writing an answer from the numbered
passages, is done by a server the person runs themselves (Ollama, llama.cpp, LM
Studio), reached over the OpenAI-compatible chat API. Outpost bundles no model and
downloads none: a model is gigabytes, the good choice changes every few months, and
which one to trust with your documents is not Outpost's decision to make. The
`answers` module is therefore small: an address, one prompt, a stream.

- **One question, one answer.** No conversation, memory, agents or tools. Each of
  those widens what a planted sentence in a document could make the model do; a
  reference tool that can also write a sourced summary does not need them.
- **Streamed, not a job.** An answer is tied to the person waiting for it. It is sent
  as server-sent events on the `POST` that asked for it, and when that connection
  closes (Stop, a closed tab, a lost network) the connection to the model closes too.
  A job would outlive the reader and would have to be stored.
- **One at a time, refused not queued.** A model on a home machine cannot write two
  answers at once, and a queue would hide a wait of minutes behind a spinner.
- **Nothing stored.** The question, the passages sent and the answer exist for the
  length of the request. The browser keeps the current answer in memory only.
- **Sources fenced, answers inert.** Passages are sent between marker lines carrying a
  code made up for that request, with a rule that nothing between them is an
  instruction. The answer is drawn as words; the only links are citation markers,
  which lead to passages Outpost supplied.
- **Grounding is checked where it can be.** No passage found means no request to the
  model. Markers that match no source are flagged. Whether a real source supports a
  claim cannot be checked mechanically, so every marker opens its passage.

It has been tested against a stand-in server that speaks the protocol, not against a
real model. The interfaces are in `modules/retrieval/types.ts`; the whole of it is
described in [ai.md](ai.md).

### Reference collections through kiwix-serve, behind a sandboxing proxy

ZIM archives are served by the Kiwix project's own server rather than re-implemented:
it is maintained, it handles the format's full-text indexes, and running it as a
separate process keeps its GPL code at arm's length from Outpost's MIT code.

A ZIM archive is a copy of someone else's web site, scripts included. Served from
Outpost's origin, those scripts could call Outpost's API and change the library, just
as the person reading can. So the browser never talks to kiwix-serve. Outpost proxies
only article content and replaces the response's security policy with a `sandbox` that
omits `allow-same-origin`. The page then runs in an origin of its own: it cannot read
Outpost's storage or API responses, cannot send the header a state-changing request
needs, and cannot load anything from the internet. This was checked in a real browser
against kiwix-serve 3.8.2 with a Wikipedia archive.

The frame cannot be inspected from outside, so the proxy adds a small script to each
page that tells the reader around it which page is showing, which files the page links
to, and which link was pressed. It runs before the archive's own scripts and keeps its
own way of reading a link's address, because books made from web sites carry a script
that makes every link report the address it had on the live site. The reader treats
everything the frame says as untrusted. A PDF inside the archive opens in Outpost's
own PDF viewer, read straight from the archive, and a PDF or e-book can be copied into
the document library, which needs no connection. A link that really does leave the
archive is never followed inside the frame; if it points at a file the library keeps,
the reader offers to fetch it through the download manager.

kiwix-serve trusts its library file and will not search a book that has no language
recorded, so Outpost writes complete metadata, which it reads back from each archive.

### A book is a collection of documents, one per chapter

The handbook and radio guides that ship with Outpost are book-length. Kept as one
document each, search could only say "somewhere in this book" and a phone would load
eighty thousand words to show a page. So a book is one collection (kind `file`, with
`meta.book`) whose folder holds one Markdown file per chapter, and each chapter is an
ordinary document recorded where it lies. The `book_chapters` table ties the two
together: which document is which chapter, in what order, under which part. The
collection is what a person adds, checks, moves and removes; its page is the contents.
The chapters are searched and opened like any document, and are left out of the
library's own list and counts so that three hundred of them do not bury everything
else. Links between chapters are written as `outpost:entry/<entry id>/<chapter key>`
and looked up when a chapter is shown, so they work across books and say plainly when
the other book has not been added. Code: `modules/books`, `modules/catalog`
(`addBook`), `documents/markdown-view.ts`.

### A drive comes home as a three-way comparison, not a sync

A portable drive is a second copy of the library that changes on its own, on computers
with clocks nobody controls. To bring its changes home without guessing, three states
are needed for every page, document, saved place and track: what it is on the drive,
what it is at home, and what it was when the two were last the same. So a drive is
written with that third state on it (`drive_baseline`: a fingerprint of each thing,
and `library_meta`: which library wrote it and when), and every merge records what it
did with each of the drive's things (`drive_merge_actions`), which serves as the base
the next time the same drive is read. Dates are only consulted for a drive that has no
record, and there anything they do not settle is a conflict for a person to decide.

The drive is untrusted and is never written to. Its database is copied into the data
directory (with its write-ahead log, which holds the newest changes after an unclean
stop) and read from the copy, read-only, table by table, with every value checked.
Changes at home go through the owning services, so a page from a drive is sanitised,
linked and indexed like any other, and each change is written in one transaction with
its line in the merge's record. That record is what a person reads afterwards, what
"undo" works from, and why stopping part-way leaves a whole library. Code:
`modules/merge` (`drive.ts`, `fingerprint.ts`, `diff.ts`, `apply.ts`, `service.ts`).

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

- There are no accounts: whoever can reach Outpost can use all of it. What is
  controlled is who can reach it, and what a browser can be tricked into doing. The
  rules are in `core/guard.ts`.
- One action asks where a request came from: erasing a person's own notes and
  documents is accepted only from the computer Outpost runs on, unless a start-up
  option says otherwise (`core/local.ts`).
- Binds to localhost by default. Sharing it on the network is a start-up setting
  (`OUTPOST_LAN_ACCESS`), never changeable from the browser, and the server refuses to
  start on an address other devices can reach without it.
- Every state-changing request must carry a custom header and come from the same
  origin. A page on another site cannot add the header without a CORS preflight, which
  is never approved. The Host header is checked against the names the server answers
  to, which defeats DNS rebinding. Every response carries `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`
  and, outside the reference proxy, `X-Frame-Options: SAMEORIGIN`.
- The app's Content Security Policy is `default-src 'self'` with `connect-src 'self'`:
  the browser itself enforces that nothing is loaded from, or sent to, anywhere else.
- Files people upload are served with `Content-Security-Policy: sandbox`, so an
  uploaded HTML or SVG file can never run script in Outpost's origin. Imported HTML and
  Markdown are converted to a fixed node schema; nothing is stored as raw HTML.
- Downloads are limited to hosts named in catalogue manifests for the first request,
  and every connection, including each redirect hop, must land on a public address.
  Integrity comes from the checksum published by the source, not from the mirror.
- The one fetch from a host no manifest lists is a file a person chooses to save from
  a link in a reference page. It must be an `http` or `https` address ending in a kind
  of file the library keeps, it goes through the same download manager and the same
  public-address rule, and what arrives is kept only if it is the kind of file its name
  says.
- Archives are unpacked with path, size, count and ratio limits, and never onto paths
  outside the staging folder.
- No telemetry. The server makes an outbound request only as the direct result of a
  person's action: refreshing the catalogue, starting a download, saving a file from
  a link, estimating or downloading a map region or place names, fetching the runtimes
  for a portable drive, or, if they configured one, calling their own embedding server
  or asking their own model server for an answer.

See [security.md](security.md) for the threat model.

## Code layout

```
apps/server/src/
  config.ts          environment → configuration
  app.ts             builds the Fastify app (used by index.ts and by tests)
  core/              context, request guard, jobs, events, errors, safe paths, guarded HTTP client
  db/                schema (Drizzle) and migrations
  modules/           one folder per feature; index.ts registers routes and a service
apps/web/src/
  styles/            design tokens, base, prose
  components/        shell and controls
  features/          one folder per screen
packages/shared/     API types and pure helpers used by both sides
catalog/             catalogue manifests, their schema, packs, map region presets, and the
                     sheets and books that ship with Outpost (bundled/)
scripts/             packaged-app build, map asset fetch, embedding model fetch
e2e/                 Playwright tests against the packaged app
```

Modules, in registration order: search, semantic, retrieval, answers, documents, notes, imports,
collections, books, kiwix, downloads, links, catalog, maps, backup, portable, merge, manage. A module may use the
services of those before it. [development/server-modules.md](development/server-modules.md)
is the contract a module works to.

## Limits and trade-offs

These are deliberate, and stated so nobody has to discover them.

| Area | Limit | Why, and what would lift it |
| --- | --- | --- |
| Scale | One node, one writer. | SQLite. Fine for a household or a classroom; a larger deployment needs the PostgreSQL seam filled in. |
| Vector search | Flat index: every query compares against every stored vector. | Exact and dependency-free; comfortable to roughly 100,000 passages. `VectorIndex` is the seam for sqlite-vec or pgvector. |
| Built-in embedding model | Small and English (all-MiniLM-L6-v2): other languages are matched poorly. It reads 256 word pieces at a time, so a longer passage is read in stretches and their vectors averaged. Run by ONNX Runtime as WebAssembly, about four times slower than its native build: 33 to 54 seconds per thousand passages on an Apple M2 Max, about 300 MB of memory while loaded. Not run on a Raspberry Pi, an Intel Mac, Windows or musl Linux. | WebAssembly needs no binary per platform, so it runs wherever Node does (the native runtime has no musl or Intel-macOS builds). A small multilingual model is five times the size and half the speed; a local embedding server (Ollama, llama.cpp) is the way to use one today. Other models could be offered as downloads; that is not built. |
| OCR | Optional and off by default; slow, and it makes mistakes. Tesseract compiled to WebAssembly, English built in, other languages from a data file a person adds. Only pictures on a page are read: text drawn as shapes is not. A page scanned the wrong way up is found by trying the other ways, not by detecting its orientation. | No native code, so it runs everywhere Node does. Reading drawn text needs a PDF renderer with a canvas (`@napi-rs/canvas`), a native dependency. Languages could be fetched through the download manager; that is not built. `modules/ocr/types.ts` is the seam for another engine. |
| Language model answers | Need a model server the person runs (Ollama, llama.cpp, LM Studio); no model is bundled. One question and one answer, one at a time, from documents, notes and book chapters only. Tested against a stand-in server, not a real model. | Bundling a model would add gigabytes and a native runtime. Reference articles would need Outpost to split ZIM content into passages. See ai.md. |
| ZIM archives | Need kiwix-serve (the Compose sidecar, or a binary for non-Docker installs). | Reading the format in pure JavaScript would mean reimplementing libzim. |
| Maps | Vector basemap only from the Protomaps schema; hill shading and contour lines need a separate terrain download; contour lines are only as fine as that terrain; routing is not offered; the line-of-sight check is geometry over that terrain, not a prediction of radio coverage. | Contour lines are traced in the browser from the installed terrain (see maps.md), so there is no contour tileset to download or host. |
| Map source | Depends on the Protomaps build host staying available for new downloads. | The source address is a setting; any PMTiles archive with the same schema works, including one you host. |
| Notes collaboration | Last writer wins, with conflict detection; no live co-editing. | The editor could take a CRDT later; the storage format would need to change. |
| Portable drives | A drive is a copy, not a live sync partner. Changes made on it come home only when a person plugs it in and brings them back, one drive at a time, after reading a preview. Conflicts are settled per item, as whole pages: text is not merged line by line. Settings, the order of pages among their siblings, and the favourite mark on existing pages are not brought back. | Deliberate: nothing is overwritten that a person has not seen. Merging inside a page would need the editor to keep a history of edits (a CRDT), as live co-editing would. |
| Bringing a drive back | Tested with two real libraries on one computer, with the drive as a folder. Not tried with a physical USB drive carried to a second computer and back, nor with a drive written by a genuinely older release (there is none yet; the tests strip the record from a drive to stand in for one). A drive is read up to 100,000 pages, 100,000 documents, 100,000 saved places, 20,000 tracks and a 32 GB database. A document removed at home because it was ticked in a merge cannot be brought back by undo. | A manual pass with a real drive. The limits are constants in `modules/merge/fingerprint.ts` and `drive.ts`. |
| Windows without Docker | Untried. Nobody has run the server tests or the packaged app on Windows. | A manual pass on a Windows machine. |
| Access | No accounts and no per-person permissions: everyone who can reach Outpost can read, add, change and delete everything. | Outpost is for one household or one trusted network. Anything wider needs an authenticating proxy in front of it. |

## Dependency licences

Outpost is MIT. Everything linked into it is MIT, ISC, BSD or Apache-2.0. Things that
are not are kept outside the process or left out:

The packaged app and the Docker image carry `THIRD-PARTY-LICENSES.txt`: every package
the server and the web app depend on when running, each with its licence text. It is
written by `scripts/build-app.mjs` from the installed packages.

| Component | Licence | How it is used |
| --- | --- | --- |
| kiwix-serve, libzim | GPL-3.0 / GPL-2.0+ | Separate process, reached over HTTP. Not linked, not bundled in the Outpost image. |
| `mupdf` (npm), PyMuPDF | AGPL-3.0 | Not used. PDF text comes from unpdf (PDF.js, Apache-2.0). |
| Tesseract (`tesseract.js-core`) and its English model | Apache-2.0 | Bundled, for OCR. The model is Tesseract's English `tessdata_best` in integer form, as packaged in `@tesseract.js-data/eng` (whose own packaging is MIT). |
| all-MiniLM-L6-v2 (embedding model) | Apache-2.0 | Bundled, for semantic search; fetched at build time from Hugging Face at a pinned revision and checked against checksums, never committed. Trained by the Sentence Transformers project; the files are the 8-bit ONNX conversion published as `Xenova/all-MiniLM-L6-v2`. Its model card lists training data with terms of their own (MS MARCO, Reddit comments and others); the weights are released under Apache-2.0. Hugging Face's terms of service, read on 2026-11-15, say that content in a public repository stays under the licence its owner gave it. Notice and licence text: `server/embed/all-MiniLM-L6-v2/`. |
| ONNX Runtime (`onnxruntime-web`), `@huggingface/tokenizers` | MIT, Apache-2.0 | Bundled; they run the embedding model. The runtime is the project's own WebAssembly build. The npm package carries no licence file, so the build takes the licence and third-party notices from the project's repository at the release's commit: `server/embed/LICENSE-onnxruntime.txt`, `ThirdPartyNotices-onnxruntime.txt`. |
| BlockNote | MPL-2.0, with GPL add-ons | Not used. The editor is Tiptap (MIT) with Outpost's own blocks. |
| `saxes`, `sax` (streaming XML parsers) | ISC; BlueOak-1.0.0 | Not used. GPX is read by Outpost's own small XML reader (`apps/server/src/modules/maps/gpx-xml.ts`). Looked at on 16 November 2026: `saxes` is strict but its repository is archived; `sax` is maintained but accepts XML that is not well-formed, and its licence is not one of the four above. `@tmcw/togeojson` and `@xmldom/xmldom`, which read GPX before, are no longer shipped; `@xmldom/xmldom` (MIT) remains for one test. |
| Atkinson Hyperlegible, Literata, Noto Sans | OFL-1.1 | Bundled fonts. |
| Protomaps basemap styles | BSD-3-Clause (design CC0) | Bundled. |
| maplibre-contour | BSD-3-Clause (includes code adapted from d3-contour, ISC, and vt-pbf, MIT) | Bundled in the web app. Traces contour lines in the browser from installed terrain. |
| Map data | ODbL (OpenStreetMap) | Downloaded by the user; attribution shown on the map. |
| GeoNames | CC BY 4.0 | Downloaded by the user; credited where shown. |
| Natural Earth | Public domain | Bundled world outline. |
| Catalogue content | Per collection | Never bundled. Each entry states its licence, and says so when it has not been verified. |
| Reference sheets (`catalog/bundled/radio/`) | MIT, with the project | Bundled. The project's own compilations of facts from official sources, each listing its sources. |
| Handbook and radio guides (`catalog/bundled/logbook73/`) | MIT, © 2026 Tyler Allen | Bundled. Written by this project's author for LogBook73 and generated from it; each book's last chapter carries the licence text. See [radio.md](radio.md#the-handbook-and-the-radio-guides). |
| Signal figures (`apps/web/src/features/library/figures/radio-viz*.ts*`) | MIT, © 2026 Tyler Allen | Ported from LogBook73's `RadioViz` component and its maths; the files say so. |
| Mermaid 12 | MIT | Bundled in the web app; draws diagrams in Markdown documents. Its dependencies are MIT, ISC, BSD-3-Clause or Apache-2.0, with two notes: DOMPurify is dual-licensed and is used under Apache-2.0, and `robust-predicates` is released into the public domain (Unlicense). |
| elkjs (Mermaid's optional ELK layout) | EPL-2.0 or GPL-3.0-or-later | Not shipped. The build replaces it with a stand-in (`figures/no-elk.ts`, `resolve.alias` in `apps/web/vite.config.ts`); diagrams are laid out with dagre. |
