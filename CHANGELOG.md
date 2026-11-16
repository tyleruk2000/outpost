# Changelog

All notable changes to Outpost are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Releases are tagged `v<major>.<minor>.<patch>`.

## [Unreleased]

Everything below is the first version of Outpost. It will be released as 0.1.0.

### Added

#### Foundation

- One server process (Node 24, TypeScript, Fastify) serving the web app and an HTTP
  API from a single SQLite database and a set of folders.
- A background job queue stored in the database: named queues with their own limits,
  pause, resume, cancel, retries with growing pauses, and jobs that survive a restart.
- Live updates to the browser over one server-sent-events stream.
- A web app (React, Vite, Tailwind) with light and dark themes, a keyboard-driven
  command palette, and a layout that works from phone width up.
- Database migrations applied automatically at start.
- The packaged app and the Docker image include `THIRD-PARTY-LICENSES.txt`, the licences
  of the projects bundled into them.

#### Storage

- Storage locations on any mounted folder: internal disks, external drives, network
  shares and Docker volumes, limited to storage roots set at start-up.
- Locations identified by a marker file, so a drive is recognised when it comes back
  at a different path, and a different drive at the old path is not mistaken for it.
- Disconnected drives reported plainly; nothing is removed while a drive is away.
- Usage by kind of content for each location, and a free-space check with a reserve
  before every download, upload and move.
- Moving a collection to another location with copy, read-back verification and
  switch-over before the original is deleted.
- Moving all documents to another location, each checked against its recorded
  checksum.
- Checking a collection against its recorded checksum.
- **Manage and clean up**, a page under Storage (`/storage/manage`): what is taking the
  space by kind and by location, measured in the background and marked as recorded,
  measured or estimated; every collection and document in one sortable, filterable
  list, to remove or move one or many, with a summary before and an account after;
  leftovers (unfinished downloads, records whose file has gone, files no record refers
  to, caches, history) cleared only when chosen; and three clean-ups: remove all
  downloaded content, clear and rebuild search data, erase everything and start again.
- "Erase everything" needs a typed phrase, offers a backup first, and can only be
  started on the computer Outpost runs on unless the server is started with
  `OUTPOST_ALLOW_REMOTE_ERASE=true`.
- A cancelled job can keep an account of what it had done before it was stopped.
- A selection of documents can be moved to another location (`ids` on
  `POST /api/documents/move`).

#### Document library

- Uploading PDF, EPUB, Markdown, plain text, CSV, JSON, HTML and image files, with the
  type checked by content, duplicates detected by checksum, and originals kept
  unmodified.
- Text extraction for search from PDF (page by page), EPUB, Markdown, HTML and text,
  in a worker thread.
- Markdown documents shown with their formatting: headings, bold, italic, links, lists,
  task lists, quotations, code and tables. The file is drawn from a tree of plain values
  and is never turned into HTML, so nothing written in it can run or load from the internet.
- Links inside Outpost from a Markdown document: to one of its own headings, and to a
  catalogue entry or a chapter of its book (`outpost:entry/<entry id>/<chapter key>`).
  The server looks the target up; a file cannot point the browser anywhere of its own
  choosing. A link to a book that is not in the library keeps its words and leads to
  it in Explore.
- Diagrams and figures in Markdown documents. A `mermaid` block is drawn by Mermaid
  (bundled, loaded only when needed) and shown as an image, never as markup in the
  page; a `viz` block is drawn as a signal figure (waveform, spectrum, response curve,
  radiation pattern, constellation, waterfall, annotated radio display). Both follow
  the theme, keep a legible size on a phone by scrolling inside their own box, and
  have a larger view. A block that cannot be drawn is shown as written.
- Books: a collection that is a folder of chapters, one document each, with a contents
  page, and previous, next and contents links in every chapter. Chapters are found by
  search and are not listed one by one among the documents.
- Titles, authors, categories, descriptions and tags; a PDF viewer with byte-range
  loading; originals served in a sandbox.
- Optional OCR for scanned PDF pages and PNG, JPEG, GIF and WebP images, on the
  machine and without the network: Tesseract compiled to WebAssembly with English
  built in, run as a cancellable background job that keeps its place across restarts.
  Off by default; offered on each scanned document, or automatic for new documents
  with a setting. What it reads is searchable page by page and is marked as read by
  OCR. Other languages work from a data file placed in the data directory.

#### Notes

- A workspace of nested pages with headings, lists, task lists, quotes, code blocks,
  tables, images, callouts, toggles, page links and document embeds.
- Backlinks, favourites, recently opened pages, built-in and personal templates,
  duplication, and a trash with restore.
- Attachments with content-checked types.
- Autosave with conflict detection between tabs and devices.
- A block editor with a slash menu, Markdown shortcuts, a selection toolbar, block
  handles, page-link pickers, a page tree with drag and drop, and a formatting bar
  above the keyboard on phones.
- Markdown export of one page or the whole workspace, with relative links and
  attachments.

#### Imports

- Importing Markdown, HTML, text and CSV files as pages and PDFs as library documents,
  singly or in a ZIP, including Notion's "Markdown & CSV" export.
- A plan shown before anything is written: the page tree, warnings, what will not come
  across intact, and pages that already exist.
- Hierarchy, links between pages, pictures, tags and Notion databases reconstructed.
- Skip, copy or replace for pages that already exist; hand-written pages are never
  overwritten.
- Imports that can be stopped and continued without creating anything twice, and a
  report of what was created, updated, skipped and failed.

#### Search

- Keyword search across documents, notes, collections, catalogue entries, markers and
  tracks: phrases, exclusions, prefix matching while typing, English word forms,
  accent-insensitive, with a stated fallback from "all words" to "any word".
- Ranking that weights titles, tags and headings above body text, with highlighted
  passages and links that open a PDF at the matching page.
- Articles from installed reference collections merged into results.
- Optional semantic search with a local OpenAI-compatible embedding server, a
  resumable index build, vectors stored per model, and export and import of vectors
  between installations.
- A built-in embedding model for semantic search, so that it works with nothing to
  install: all-MiniLM-L6-v2 (Apache-2.0, 8-bit ONNX, 23.7 MB) run by ONNX Runtime
  compiled to WebAssembly in a worker thread, with no native code. It is part of the
  packaged app, the Docker image and portable drives (39 MB in all), is fetched at build
  time at a pinned revision and checked against checksums, and never downloads anything
  when Outpost runs. Off by default; Settings states the cost before it is switched on,
  and shows the build with its time left, pause, stop, continue and any failure.
  Measured on an Apple M2 Max: 38 to 42 seconds per thousand passages, 2.2 kB of disk
  per passage. It replaces the in-process option that needed a package nobody had.
- Keeping the semantic index up to date by itself now waits for a person to have built
  it once, and no longer restarts a build they paused or stopped.
- Hybrid ranking by reciprocal rank fusion.
- Retrieval endpoints that return passages with full provenance and numbered, cited
  context for use with a language model, with a flag for safety-critical sources.

#### Answers from your library

- **Answer from my library** on the Search screen: a language model you run yourself
  (through Ollama, llama.cpp's server or LM Studio) writes a short answer to a question
  from passages of your documents, notes and book chapters. Outpost includes no model
  and downloads none. Off until it is set up; the search results are unchanged and stay
  beneath the answer.
- The answer streams as it is written and can be stopped. It is headed as generated
  and names the model. Each citation marker shows the quoted passage and opens the
  source; the passages the model was given are always listed beneath.
- Grounding that is checked: the model is told to answer only from the numbered
  passages and to say when they do not hold the answer; a marker that matches no
  passage is struck through; an answer that cites nothing is called out; and when no
  passage is found the model is not asked at all.
- The existing safety flag carries through: when a source is about medicine, first aid
  or preserving food, the model is asked for the source's own words, a warning sits
  above the answer and those passages are shown open.
- **Settings → Answers from your library**: server address, the model (chosen from the
  server's own list when it can be read), a test that says what failed (not reachable,
  not a model server, no such model, not a chat model, no chat endpoint, too slow),
  temperature (0.2 by default) and a context budget.
- `POST /api/answers` streams the answer as server-sent events; it writes one answer at
  a time, stops the model when the reader goes away, and stores nothing.
  `GET /api/answers/status`, `GET /api/answers/models` and `POST /api/answers/test`
  support the settings.
- Questions are searched for by what they are about: words such as "how" and "should"
  are left out, and the answer says which words were searched for.
- *How search works* shows the prompt that is really sent, and explains how the
  sources are fenced off from instructions.
- Tested against a stand-in server that speaks the protocol
  (`apps/server/test/model-server.ts`), checked against the Ollama and llama.cpp
  documentation of 2026-11-15. **Not yet run against a real model.**
- A model server must be on this computer or a private network: an address on the public
  internet is refused, by spelling and by looking the name up before each request,
  unless Outpost is started with `OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true`.

#### Reference collections

- A catalogue of 236 items in JSON manifests, with a validator: 128 Kiwix archives; 83
  official handbooks, rules and textbooks fetched as PDFs from their publishers (FAA,
  NASA, USGS, the US National Weather Service, FAO, WHO, Ready.gov, USDA, OpenStax,
  UIAA, Ofcom, IARU, CEPT, NIST, NTIA, CISA and others), each pinned by size and
  SHA-256; and nine radio reference sheets and sixteen radio books that ship with
  Outpost. Downloaded PDFs join
  the document library and are searchable to the page.
- Radio reference sheets included with Outpost and added with no connection: amateur
  bands (UK, US, worldwide), licence-free radio, emergency and calling frequencies,
  weather and time broadcasts, repeaters and data modes, an operating reference, and
  the informal preparedness conventions, each figure read from an official source.
- The Radio Engineering Handbook and fifteen radio companion guides from LogBook73,
  included with Outpost as books and added with no connection: 328 chapters with 563
  diagrams and 149 signal figures. Written by the same author under the MIT licence;
  each guide carries its review date, basis and sources. Regenerated from a LogBook73
  checkout by `pnpm catalog:import-logbook73`.
- A catalogue entry that ships with Outpost can be a book: a `bundled` source names
  either one file or a folder of chapters in named sections.
- Packs: curated sets of catalogue entries for a purpose, listed first in Explore and
  fetched together after choosing what to leave out and where to keep it.
- A record of every source considered, its licence and how it is used
  (`docs/sources.md`).
- A catalogue refresh that does not contact a publisher about a pinned file, and a
  maintainers' online check that paces itself to publishers' crawl delays.
- A download manager: pause, resume, retry, resumable transfers across mirrors,
  checksum verification against the publisher's value, a shared speed limit applied
  smoothly, a queue forecast and per-download history.
- A Downloads screen that leads with the plan (how much is left, when it will finish,
  what each storage location will hold afterwards, speed against the limit), and a
  details page for every download: speed over time, each change of state, the source
  and the mirror that served it, the checksum, and the destination.
- Reading ZIM archives through kiwix-serve behind a sandboxing proxy, with search and
  title suggestions inside each collection.
- Files inside a reference collection: a PDF opens in the built-in PDF viewer when its
  link is pressed, and PDFs and e-books can be added to the document library straight
  from the archive, with no connection.
- A bar under the reader's header that lists every file the page links to, inside the
  collection or out on the internet, and adds the chosen ones to the library at once.
- Saving a file that a reference page links to on the internet: fetched through the
  download manager into the document library, from public `http` and `https`
  addresses only, and kept only if it is the kind of file its name says.
- Links read before a web-site archive's own script can rewrite them, so a file inside
  the archive is not mistaken for one on the internet.
- Registering a ZIM archive that is already on a storage location.
- Updating an installed collection to a newer version from the catalogue.

#### Maps

- Regional map extracts cut from a remote PMTiles archive, with an exact size before
  downloading, ready-made regions and custom boxes, and optional terrain.
- Installed regions served as one continuous vector map, with bundled styles, fonts and
  icons.
- A configurable map source, and importing an existing `.pmtiles` file.
- Offline place search from GeoNames data.
- Markers, GPX import and export, and coordinate parsing including British National
  Grid references.
- A Maps screen: saved places, routes with elevation profiles, distance measuring,
  hill shading, drawing a box to download with its exact size shown first, and a
  three-position sheet on phones.
- Contour lines traced in the browser from installed terrain: nothing more to
  download, spacing that follows the zoom, index lines labelled with their height.
- The download box adjusted by handles on its edges as well as its corners, with the
  pointer or the arrow keys.
- Moving a saved place straight from the map (press and hold, the map's menu, or the
  list), by pointer or keyboard, with the new position confirmed before it is kept.

#### Portable drives

- Writing a standalone Outpost to a folder on a removable drive: the app, a
  checksum-verified Node runtime for each chosen platform, launchers for macOS,
  Windows and Linux, a narrowed copy of the database and the chosen content.
- The reader for reference collections included for macOS and Linux.
- Updating a drive in place, keeping what it held before.
- Bringing a drive's changes back into the library it was made from (**Storage →
  Bring back changes from a drive**). A preview groups what changed on each side: new
  pages, documents, saved places and tracks; things changed only on the drive; things
  changed on both sides; things removed on the drive; and collections downloaded
  there. New things are added and one-sided changes applied; a conflict keeps both
  versions unless you choose home's or the drive's, with the two shown side by side;
  nothing is removed at home unless ticked. The merge runs as a job that can be
  stopped part-way, keeps a record of everything it did, and can be undone from that
  record. The drive is only read, never written to.
- A drive now carries a record of what every page, document, saved place and track was
  when it was written, so changes on the drive are told from changes at home exactly.
  A drive written before this is compared by content and dates, and anything unsure
  is a conflict to decide.

#### Backup

- Backup of the database, attachments and extracted text as one file, and a staged
  restore that is checked before it is applied and keeps the data it replaces.

#### Security

- Local-only by default. Sharing Outpost with the network is a start-up setting
  (`OUTPOST_LAN_ACCESS`) that cannot be changed from the browser, and the server
  refuses to start on an address other devices can reach without it.
- No accounts: everyone who can reach Outpost can read, add, change and delete
  everything in it. LAN access is for a network where everyone is trusted.
- Protection against requests from other sites (every state-changing request must
  carry a custom header and come from the same origin), a Host allow-list against DNS
  rebinding, and a strict Content Security Policy.
- A guarded download client that refuses private addresses, and holds catalogue
  downloads to the hosts their manifests list.
- Limits on archive extraction; sanitising of imported Markdown and HTML into a fixed
  content model.
- No telemetry, and no outbound request unless a person asks for one.
- Answers from a language model: the question and passages go only to the model
  server a person configured (redirects refused, no credentials in the address),
  sources are fenced as data in the prompt, and an answer is drawn as words only, with
  no links but the citation markers Outpost builds.

#### Deployment

- A Dockerfile for `linux/amd64` and `linux/arm64`, and a Compose stack that builds the
  image locally (`outpost:local`) and runs it with a kiwix-serve sidecar.
- A packaged app that runs with only a Node binary.
- Checks to run locally: lint, type checking, server and web tests, catalogue
  validation, and browser tests against the packaged app with the internet blocked.

### Known limitations

These are deliberate or known, and are explained in
[docs/architecture.md](docs/architecture.md#limits-and-trade-offs).

- **Scale.** One node and one writer (SQLite). Suited to a household or a classroom.
- **Semantic search** uses a flat index, comfortable to roughly 100,000 passages.
- **The built-in embedding model** is small and English: other languages are matched
  poorly, only the first 256 word pieces of a passage (about a thousand characters) are
  read, and it has not been run on a Raspberry Pi or on Windows. A local embedding
  server can be used instead.
- **OCR** is slow and makes mistakes, reads only pictures of pages (not text drawn as
  shapes), and has English only unless a language file is added by hand.
- **No language model is included.** Answers need a model server you run yourself.
  They are one question and one answer, from documents, notes and book chapters only
  (reference collections are not read), and have been tested against a stand-in
  server, not a real model.
- **Reference collections need kiwix-serve**: the Compose sidecar, or a binary for
  installations without Docker. On a portable drive they cannot be opened on Windows,
  because the Kiwix project publishes no Windows build of its reader at the version
  used.
- **Maps** draw the Protomaps basemap schema only. There is no routing, and hill
  shading and contour lines need a separate terrain download.
- **New map downloads depend on the map source staying available.** The source address
  is a setting, and any compatible archive works, including one you host.
- **Notes** have conflict detection but no live co-editing.
- **A portable drive is a copy, not a live sync partner.** Its changes come home when
  the drive is plugged in and they are brought back. Conflicts are settled per page,
  not line by line. Bringing a drive back has been tested with the drive as a folder
  on one computer, not with a physical drive carried to a second one.
- **Tried on one platform.** Outpost has been run by hand on macOS on Apple Silicon,
  including the Compose stack with the `arm64` image. Linux on x86-64, Intel Macs,
  Windows, Raspberry Pi hardware and NAS products are untried. Nothing builds or tests
  it automatically, and no image is published.
- **No accounts.** Everyone who can reach Outpost can read and change everything. There
  are no per-page or per-person permissions.
- **No built-in HTTPS and no encryption at rest.** Use a reverse proxy and encrypted
  drives where that matters; see [docs/security.md](docs/security.md).
- **The HTTP API is not versioned** and may change between releases.
