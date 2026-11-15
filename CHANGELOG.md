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

#### Document library

- Uploading PDF, EPUB, Markdown, plain text, CSV, JSON, HTML and image files, with the
  type checked by content, duplicates detected by checksum, and originals kept
  unmodified.
- Text extraction for search from PDF (page by page), EPUB, Markdown, HTML and text,
  in a worker thread.
- Titles, authors, categories, descriptions and tags; a PDF viewer with byte-range
  loading; originals served in a sandbox.

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
- Hybrid ranking by reciprocal rank fusion.
- Retrieval endpoints that return passages with full provenance and numbered, cited
  context for use with a language model, with a flag for safety-critical sources.

#### Reference collections

- A catalogue of 173 freely available items in JSON manifests, with a validator: 123
  Kiwix archives, and 50 official handbooks and textbooks fetched as PDFs from their
  publishers (FAA, NASA, USGS, the US National Weather Service, FAO, WHO, Ready.gov,
  USDA, OpenStax, UIAA), each pinned by size and SHA-256. Downloaded PDFs join the
  document library and are searchable to the page.
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

#### Portable drives

- Writing a standalone Outpost to a folder on a removable drive: the app, a
  checksum-verified Node runtime for each chosen platform, launchers for macOS,
  Windows and Linux, a narrowed copy of the database and the chosen content.
- The reader for reference collections included for macOS and Linux.
- Updating a drive in place, keeping what it held before.

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
- **The in-process embedding model** needs an optional package that is not in the
  Docker image, the packaged app or portable drives. A local embedding server works
  everywhere.
- **No OCR.** Scanned PDFs and images are stored and viewable but have no searchable
  text.
- **No language model.** Outpost retrieves and cites; it does not generate answers.
- **Reference collections need kiwix-serve**: the Compose sidecar, or a binary for
  installations without Docker. On a portable drive they cannot be opened on Windows,
  because the Kiwix project publishes no Windows build of its reader at the version
  used.
- **Maps** draw the Protomaps basemap schema only. There are no contour lines and no
  routing, and hill shading needs a separate terrain download.
- **New map downloads depend on the map source staying available.** The source address
  is a setting, and any compatible archive works, including one you host.
- **Notes** have conflict detection but no live co-editing.
- **A portable drive is a copy, not a sync partner.** Changes made on the drive are
  not merged back.
- **Tried on one platform.** Outpost has been run by hand on macOS on Apple Silicon,
  including the Compose stack with the `arm64` image. Linux on x86-64, Intel Macs,
  Windows, Raspberry Pi hardware and NAS products are untried. Nothing builds or tests
  it automatically, and no image is published.
- **No accounts.** Everyone who can reach Outpost can read and change everything. There
  are no per-page or per-person permissions.
- **No built-in HTTPS and no encryption at rest.** Use a reverse proxy and encrypted
  drives where that matters; see [docs/security.md](docs/security.md).
- **The HTTP API is not versioned** and may change between releases.
