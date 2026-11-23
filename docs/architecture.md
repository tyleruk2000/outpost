# Architecture

Outpost is one Node.js process that serves a web app and an HTTP API from a SQLite
database and a set of folders. One optional helper process, kiwix-serve, reads ZIM
archives.

```
 Browser ──────────────► Outpost server (Node 26, Fastify)
   React app                 │
   same origin only          ├── SQLite (one file): library records, notes, search index, jobs
                             ├── data directory:    attachments, extracted text, staging, models
                             ├── storage locations: documents, collections, maps (any mounted folder)
                             └── kiwix-serve ◄───── proxied, sandboxed, never exposed directly
```

## Decisions and why

### Node and TypeScript on the server

One language across server, web app and shared types, so the API contract is checked
by the compiler on both sides (`packages/shared`). Fastify 5 (a plugin per module), zod 4
at the routes, Drizzle ORM with generated migrations, an in-process job queue on SQLite,
and unpdf (PDF.js) for PDF text (PyMuPDF and the `mupdf` npm package are AGPL).

The server runs TypeScript directly on Node 26 (type stripping), so development has no
build step. Releases are bundled with esbuild into `dist/app`, which runs with nothing
but a Node binary; the Docker image and portable drives use the same bundle.

### SQLite for everything, including search

One file, no service, safe on an SD card in WAL mode, and FTS5 is a capable full-text
engine. The database belongs on a local disk: WAL needs real file locking, which network
shares do not reliably give. Large content lives outside it, on any storage. PostgreSQL
with pgvector is not built; the seams are `VectorIndex` and the search service.

### Storage locations are identified by a marker file, not a path

Each location has `.outpost-location.json` at its root holding its id, and records refer
to *(location id, relative path)*. A drive that comes back at another mount point is
found by its marker inside the configured roots; a different drive at the old path does
not match and the location shows as disconnected. Browsers can only name folders inside
the storage roots set at start (`OUTPOST_STORAGE_ROOTS`), and every path from a request
is checked against them.

### One job queue for all long work

Long work is rows in a `jobs` table, run in-process on named queues with their own
concurrency. Rows survive restarts; whatever was running is queued again and resumes
from what is on disk. Progress reaches the browser over one server-sent-events stream.
A Redis-and-workers job server would be the wrong weight for a single node on a Pi.

**Stopping** is one path for a signal and a self-restart (`core/stop.ts`, close hooks in
`app.ts`): stop accepting; abort `ctx.stopping`, which ends never-ending responses; give
requests in flight `DRAIN_LIMIT_MS`, then close them; stop jobs with reason "shutdown"
(they stay running for the next start to requeue); run modules' close callbacks; close
the database; exit. It exits after `EXIT_LIMIT_MS` regardless.

**Faults** (`core/faults.ts`): an unhandled rejection is logged and the server carries
on; an uncaught exception is logged and the server stops in the same order with code 1,
for its supervisor to restart it.

**At rest** the server sets no fixed-tick timer except a few checks of outside things
that send no event (storage locations, HTTPS, scheduled backups, shares). The job runner
sets a timer only for a job told to wait. Live-event streams share one keep-alive. The
web app's files are compressed at build time; fingerprinted files and map icons are
cached for a year, map fonts for a week. API JSON over 1 kB is compressed as sent
(`core/compress.ts`: Brotli quality 4, else gzip); streams, files and tiles are not.

**Off the main thread:** PDF text, OCR (its own queue, one at a time), the built-in
embedding model (a worker ended after five idle minutes), reading a saved web page, and
reading GPX (a streaming reader whose memory is bounded by the points kept) run in
worker threads. Imported Markdown, HTML and text are converted in a child process,
because their memory is not bounded by file size and a worker out of heap can take the
server with it ([security.md](security.md#files-people-upload)).

### Search in three layers behind one entry point

Modules describe what they hold (`search.upsert({ kind, title, sections, url })`) and
never see how search works.

1. **Keyword**: FTS5 over passages, BM25 with title, heading and tag columns weighted
   above body, snippets, prefix matching on the word being typed, and a stated fallback
   from "all words" to "any word".
2. **Semantic** (optional): vectors keyed by *(passage, model id)*, so models of
   different sizes coexist and a new model's index builds without disturbing the old.
   The index is flat and exact. A small model ships as WebAssembly; a local embedding
   server can be used instead.
3. **Hybrid**: reciprocal rank fusion of every ranked list. Using ranks, not scores,
   lets it fold in Kiwix articles, whose scores compare with nothing.

Passages keep document, page, heading, offsets, content hash and index version, which is
everything needed to cite. The retrieval module turns a question into numbered, quoted
context.

### Answers: a model the person runs, never one Outpost ships

A model server the person runs (Ollama, llama.cpp, LM Studio) writes the answer, over
the OpenAI-compatible chat API. Outpost bundles and downloads no model: they are
gigabytes, the good choice changes every few months, and which to trust is the person's
decision.

- **One question, one answer.** No memory, agents or tools in Answers: each widens what
  a planted sentence could make the model do.
- **Streamed, not a job.** Sent as server-sent events on the `POST` that asked; when
  that connection closes, so does the model's.
- **One at a time, refused not queued.** A queue would hide minutes behind a spinner.
- **Nothing stored.** The question, passages and answer last as long as the request.
- **Sources fenced, answers inert.** Passages sit between marker lines with a per-request
  code and a rule that nothing between them is an instruction. The answer is drawn as
  words; the only links are citation markers to passages Outpost supplied.
- **Grounding checked where it can be.** No passage, no request. Markers matching no
  source are flagged; every marker opens its passage.

Interfaces: `modules/retrieval/types.ts`; the whole of it: [ai.md](ai.md).

### Reference collections through kiwix-serve, behind a sandboxing proxy

ZIM archives are served by the Kiwix project's own server: maintained, it handles the
format's full-text indexes, and a separate process keeps its GPL code apart from
Outpost's MIT code.

A ZIM archive is someone else's web site, scripts included. Served from Outpost's
origin, they could call the API. So the browser never talks to kiwix-serve: Outpost
proxies article content only and replaces the security policy with a `sandbox` without
`allow-same-origin`. The page runs in an origin of its own: it cannot read Outpost's
storage or responses, cannot send the header a change needs, and cannot load from the
internet.

The proxy adds a small script to each page that tells the reader which page is showing,
what it links to and which link was pressed; it runs before the archive's scripts and
keeps its own way of reading a link (some books rewrite links to their live-site
addresses). The reader treats all of it as untrusted. PDFs open in Outpost's viewer
straight from the archive; PDFs and e-books can be copied into the library offline. A
link that leaves the archive is never followed in the frame; a file the library keeps
is offered through the download manager.

A sandboxed page has no storage, so a nautilus collection (documents with a list drawn
from a browser database) would draw nothing. The server reads the list out of the
archive with a parser that runs nothing (`modules/kiwix/nautilus.ts`, `literal.ts`,
`document-lists.ts`), and the reader shows it itself.

kiwix-serve will not search a book with no language recorded, so Outpost writes
complete metadata, read back from each archive.

### A book is a collection of documents, one per chapter

The handbook and radio guides that ship with Outpost are book-length. A book is one
collection (kind `file`, `meta.book`) whose folder holds a Markdown file per chapter,
each an ordinary document; `book_chapters` records order and parts. The collection is
what is added, checked, moved and removed; chapters are searched and opened like any
document but left out of the library's list. Links between chapters are
`outpost:entry/<entry id>/<chapter key>`, resolved when shown, so they work across books
and say when the other book is missing. Code: `modules/books`, `modules/catalog`
(`addBook`), `documents/markdown-view.ts`.

### A drive comes home as a three-way comparison, not a sync

A portable drive changes on its own, on computers with clocks nobody controls. Bringing
its changes home without guessing needs three states for every page, document, place
and track: the drive's, home's, and what both were when last the same. A drive is
written with that third state (`drive_baseline` fingerprints; `library_meta`), and each
merge records what it did per thing (`drive_merge_actions`), which becomes the base next
time. Dates are consulted only for a drive with no record, and anything they do not
settle is a conflict for a person.

The drive is untrusted and never written to. Its database (with its write-ahead log) is
copied into the data directory and read from the copy, read-only, every value checked.
Changes at home go through the owning services, each in one transaction with its line
in the merge's record, which is what a person reads, what undo works from, and why
stopping part-way leaves a whole library. Code: `modules/merge`.

### Maps: regional extracts of a planet archive, composited on the server

Tiles come from the Protomaps daily planet build (OpenStreetMap data, ODbL), one
PMTiles archive that supports range requests. Outpost reads its directories to find the
byte ranges a region needs, which gives an **exact** size before downloading, then
fetches only those into a new, valid PMTiles file: the method of `pmtiles extract`, in
Node, so it is resumable, reports progress and goes through the download manager.
OpenStreetMap's public tile servers are never used.

Satellite imagery is the same kind of archive holding WebP pictures, made on the
person's computer from NASA's GeoTIFFs or from the parts of a Sentinel-2 scene or a
national aerial photograph that cover the area (`modules/maps/imagery/`).

The browser sees one tile endpoint; the server picks the best installed archive for each
tile, so regions join seamlessly and a world overview fills in when zoomed out. Styles,
fonts and sprites are served by Outpost. Place search uses GeoNames in FTS5.

### Road routes: a main-roads graph per country, joined in memory

Planned road directions come from a network built from a Geofabrik extract per country
or region: motorway to secondary roads, junctions, signs, car ferries and the Channel
Tunnel shuttle, read by Outpost's own `.osm.pbf` reader into typed arrays and written as
one binary file per network in the data directory (`roads/<id>.roads`), not SQLite rows:
routing needs all of it in memory, and a file of arrays loads in one read. The extract is
deleted once read unless kept. Networks join where neighbouring extracts share node ids
(Geofabrik keeps border-crossing ways whole); crossings join to the nearest main road.
A* by time over the joined graph; the path is folded into a driver's lines ("A26 (E17) -
Reims (A4)"). Built on the first route asked for and let go after 30 minutes unused. No
routing library, no server: see [development/road-routes.md](development/road-routes.md).

### A phone out of reach: a kept app and chosen copies

The web app keeps itself in the browser with a service worker, and a person keeps chosen
things there (a page of notes and the pages inside it, a route, saved places, a box of
map). Out of reach the app shows those. A kept copy is only ever replaced by the
server's version; the few writes allowed away (page text, new pages, check-ins) are sent
on return, and a page changed on both sides asks which to keep.

- **The worker is hand-written, about 150 lines** (`apps/web/src/sw/`). Workbox was
  considered; what Outpost needs is narrow (pages from the server first, a short list of
  API addresses answered from cache only for kept things, tiles stored gzipped, "no
  tile" outside a kept area), and a worker that goes wrong strands people on an old app,
  so it is better read whole. Its decisions are plain functions in `rules.ts`.
- **What is kept of the app is worked out at build time** (`apps/web/sw-plugin.ts`):
  everything the out-of-reach screens load, about 4.5 MB of 11 MB of scripts. The
  build's name and a hash are written into the worker.
- **Kept things are Cache Storage entries under their own addresses**, one cache per
  thing, so the map code is unchanged. The server measures a box from its archives'
  directories and can give a tile still gzipped (`modules/maps/kept-area.ts`).
- **Reach is asked, not assumed**: `/api/health` with a four-second limit.

Browser limits on stored data: [offline.md](offline.md#a-phone-out-of-reach-of-the-server).

### Several households, one current for everyone

People and pets are one global list; a household (`households`) lists who is in it and
has its own home (a saved place, or for a portable one where a person last said it is),
supplies, plans and papers. Rows carry `household_id`; one-row tables are keyed by the
household's id, the first being `"household"`, so the data from before needed no moving.
Which household is current is one server setting, not per device: a household shares
one Outpost, and every device, background task and chat tool then agrees on whose
supplies it is looking at. Changing it resets every screen through the live event
`households.changed`. See [development/households.md](development/households.md).

### Security posture

- No accounts: whoever can reach Outpost can use all of it. What is controlled is who
  can reach it and what a browser can be tricked into doing (`core/guard.ts`).
- Binds to localhost by default. Sharing on the network is a start-up setting
  (`OUTPOST_LAN_ACCESS`), never changeable from the browser; the server refuses to bind
  a reachable address without it.
- A few actions are accepted only from the computer Outpost runs on unless a start-up
  option says otherwise: erasing, restoring and deleting backups, replacing or deleting
  HTTPS certificates, reclaiming database space (`core/local.ts`).
- Every state-changing request carries a custom header and comes from the same origin;
  the CORS preflight another site would need is never approved. The Host header is
  checked against the names served, which defeats DNS rebinding. Responses carry
  `nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`
  and, outside the reference proxy, `X-Frame-Options: SAMEORIGIN`. The app's CSP is
  `default-src 'self'` with `connect-src 'self'`.
- Uploaded files are served with `Content-Security-Policy: sandbox`. Imported HTML and
  Markdown become a fixed node schema; nothing is stored as raw HTML.
- Downloads go only to hosts named in catalogue manifests for the first request, and
  every connection, each redirect included, must land on a public address. Integrity
  comes from the source's checksum. The exceptions a person triggers directly (a file
  linked from a reference page, a web page saved) follow the same public-address rule
  and are kept only if they are what they claim.
- Archives are unpacked with path, size, count and ratio limits, inside staging only.
- Encryption happens in the browser. The server keeps public keys and, if asked, a
  passphrase-protected private key; it never sees a passphrase or plain text. Where a
  browser will not do cryptography (plain HTTP from another device) the feature is
  unavailable rather than moved to the server.
- HTTPS for the home network is optional: a second listener with a certificate from
  Outpost's own authority (private addresses and local names only), or the person's own
  certificate, checked and reloaded when renewed (`modules/https`).
- No telemetry. The server reaches out only as the direct result of a person's action;
  every host is listed in [security.md](security.md) and [offline.md](offline.md).

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
catalog/             catalogue manifests, schema, packs, map region presets, bundled sheets and books
engines/             the HF propagation engine (WebAssembly), its data, the solar cycle table
scripts/             app build, asset and model fetches, engine builds, generated docs
e2e/                 Playwright tests against the packaged app
```

Registration order is in `modules/index.ts`; a module may use the services of those
before it. [development/server-modules.md](development/server-modules.md) is the
contract a module works to.

## Limits and trade-offs

Deliberate, and stated so nobody has to discover them. What has not been tried yet is
in [testing-status.md](testing-status.md).

| Area | Limit | Why, and what would lift it |
| --- | --- | --- |
| Scale | One node, one writer. | SQLite; fine for a household or classroom. Larger needs the PostgreSQL seam filled. |
| Vector search | Flat index: every query compares every vector. | Exact and dependency-free to about 100,000 passages. `VectorIndex` is the seam for sqlite-vec or pgvector. |
| Built-in embedding model | Small and English (all-MiniLM-L6-v2); 256 word pieces at a time, longer passages averaged. WebAssembly, about four times slower than native: 33 to 54 s per thousand passages on an M2 Max, ~300 MB loaded. Not run on a Pi, Intel Mac, Windows or musl Linux. | WebAssembly needs no per-platform binary. A multilingual model is five times the size and half the speed; use a local embedding server for one. |
| EPUB | Words and pictures in Outpost's type, a chapter at a time, ≤2 MB a chapter. No book styling, fixed layouts, audio, video, MathML, scripts or DRM. | The book's own pages never enter the browser; showing them would need a sandboxed frame per chapter. |
| OCR | Optional, slow, makes mistakes. Tesseract in WebAssembly, English built in. Reads pictures on a page, not text drawn as shapes; orientation by trying each way. | Drawn text needs a canvas renderer (`@napi-rs/canvas`, native). `modules/ocr/types.ts` is the seam. |
| Answers and chat | Need the person's own model server. One answer or reply at a time. Library read from documents, notes and chapters only. Conversations visible to everyone who can open Outpost. | Reference articles would need ZIM content split into passages. |
| ZIM archives | Need kiwix-serve. | Reading the format in JavaScript means reimplementing libzim. |
| Maps | Protomaps schema only; hill shading and contours need a terrain download and are only as fine as it; routing only for planned road directions on main roads, from networks installed per country (no live navigation, no foot or cycle routing); line of sight is geometry, not a coverage prediction. | Contours are traced in the browser, so there is no contour tileset. |
| Map source | Depends on the Protomaps build host for new downloads. | The address is a setting; any PMTiles archive of the same schema works. |
| HF propagation | VOACAP monthly medians, never today's conditions; 2 to 30 MHz, short path; coverage ≤2,304 cells; plans ≤8 stations; the log comparison calibrates nothing. P.533 optional, isotropic, built on each computer. The engine is a young one-author Rust translation. | The engine sits behind `modules/propagation/engine.ts`. |
| Recording a track | Only with the screen on and Outpost in front. | A browser limit; lifting it needs a native app. |
| Repeaters | None shipped. Two lists can be fetched on request (IRTS, Hearham); others are files or typed. Positions often approximate. Not kept on a phone, printed, or merged from a drive. | Most publishers' terms forbid an app fetching; a source is added in `catalog/repeater-sources.json` when allowed. |
| Printed maps | One page (A4, A3, Letter), a picture at 300 or 150 dpi; scale exact along the middle only. | Web Mercator on screen and paper. |
| Calculators | Published formulas only; health and safety figures quoted from official pages. | A calculator that guesses beyond its source would mislead. |
| Reference layers | No historical targeting dataset ships (none is cleared as data). Overpass only within servers whose terms allow it (Europe and North America), elsewhere a Geofabrik extract. | Adapters share `modules/layers/types.ts`. |
| Notes | Last writer wins, with conflict detection; no live co-editing. | A CRDT editor; the storage format would change. |
| Portable drives | A copy, not a sync partner: changes come home when plugged in, one drive at a time, after a preview, as whole items. Settings, sibling order and favourite marks are not brought back. Read up to 100,000 pages, documents and places, 20,000 tracks, a 32 GB database. A document removed by a merge is not restored by undo. | Merging inside a page needs an edit history (a CRDT). Limits in `modules/merge/fingerprint.ts`, `drive.ts`. |
| HTTPS at home | Each device must be told to trust Outpost's certificate. Android does not hold the authority to its limits. In Docker the port must be published and the host's address named. A public name on an own certificate must be in `OUTPOST_ALLOWED_HOSTS`. | A certificate browsers trust unaided needs a public domain and the internet. |
| A phone out of reach | Only what was kept: pages, routes, places, map areas. No documents, reference or search. Needs HTTPS. The browser decides how long it lasts (Safari: seven days without a visit unless on the Home Screen). | Documents could be kept the way notes are. |
| Contacts | No photos. Phones read over CardDAV and cannot write; contacts come in as vCard files or from Chrome's picker on Android over https. Not merged from a drive. | Two-way sync needs a holding place for a phone's deletions. |
| Access | No accounts or per-person permissions. | For one household or trusted network; anything wider needs an authenticating proxy. |

## Dependency licences

Outpost is MIT. Everything linked into it is MIT, ISC, BSD or Apache-2.0 ("the four").
What is not is kept outside the process or left out, with one exception, OpenPGP.js
(LGPL), shipped as a separate file loaded at run time ([below](#the-openpgp-library)).
The packaged app and Docker image carry `THIRD-PARTY-LICENSES.txt`, every runtime
package with its licence text, written by `scripts/build-app.mjs`.

| Component | Licence | How it is used |
| --- | --- | --- |
| kiwix-serve, libzim | GPL-3.0 / GPL-2.0+ | Separate process over HTTP. Not linked or in the image. |
| Dire Wolf 1.8, readsb 3.16, AIS-catcher, rtl-sdr | GPL-2.0+; GPL-3.0+; GPL-3.0; GPL-2.0+ | Separate programs the person runs (on the Pi via `deploy/pi/install.sh --decoders`). Outpost reads their ports; its KISS, AX.25, APRS, SBS and AIS readers are its own (`modules/heard/`). |
| pyais 3.3.1 | MIT | Not used; run once to make the AIS test fixture. |
| `mupdf`, PyMuPDF | AGPL-3.0 | Not used; PDF text from unpdf (Apache-2.0). |
| Tesseract (`tesseract.js-core`) and English model | Apache-2.0 | Bundled for OCR (`tessdata_best` integer model from `@tesseract.js-data/eng`, MIT packaging). |
| all-MiniLM-L6-v2 | Apache-2.0 | Bundled for semantic search; fetched at build from Hugging Face at a pinned revision, checksummed, never committed (8-bit ONNX `Xenova/all-MiniLM-L6-v2`). Its training data has terms of its own; the weights are Apache-2.0, and Hugging Face's terms (read 2026-11-15) keep repository content under its owner's licence. Notice: `server/embed/all-MiniLM-L6-v2/`. |
| `onnxruntime-web`, `@huggingface/tokenizers` | MIT, Apache-2.0 | Bundled; run the model. The npm package has no licence file, so the project's licence and notices are kept in `third-party/onnxruntime-1.31.1/` and copied into the build. |
| hfcast (`engines/voacap/engine/voacap.wasm`) | Apache-2.0 | Bundled; VOACAP in Rust, compiled to WebAssembly, pinned and built by `scripts/build-hf-engine.mjs`. VOACAP is NTIA/ITS work. See [hf-propagation.md](hf-propagation.md#licences-and-attribution). |
| VOACAP antenna files (`engines/voacap/data/`) | **Not one of the four.** NTIA/ITS work "not subject to copyright protection in the U.S." | Bundled, 15 kB; texts in `engines/voacap/NOTICE.txt`. |
| VOACAP coefficient files (CCIR Reports 322 and 340, NTIA/ITS tables) | **Not one of the four.** ITU data "free from any copyright assertions", in a repository whose headers reserve all rights | **Not shipped or in the repository.** Listed with checksums in `engines/voacap/coefficients.json`; fetched (559 kB) on a press of Download or by `scripts/fetch-voacap-data.mjs`. See [hf-propagation.md](hf-propagation.md#data). |
| USDA FoodData Central SR Legacy (`modules/supplies/foods/fdc-sr-legacy.json`) | Public domain, CC0 1.0 | Bundled, 724 kB: energy and macronutrients for 7,793 foods. Built by `scripts/build-food-energy.mjs`; USDA is named on screen. |
| NOAA CO-OPS tidal constants (`modules/tides/data/noaa-harmonic.json`) | Public domain | Bundled, 409 kB: 37 constituents and two datums for 1,370 stations. Built by `scripts/build-tide-stations.mjs`; NOAA is named on screen. |
| TICON-4 tidal constants (`modules/tides/data/ticon4-harmonic.json`) | CC BY 4.0 (Hart-Davis, Dettmering and Seitz, DGFI-TUM, 2025, on SEANOE) | Bundled, 932 kB: 39 constituents for 2,728 tide gauges worldwide. Built by `scripts/build-ticon-stations.mjs`; the dataset and its licence are named on screen. |
| Yale Bright Star Catalogue, 5th revised edition (`packages/shared/src/sky/stars.gen.ts`) | Public domain (US Government Works via NASA HEASARC); NASA ADC asks to credit it and Hoffleit and Warren. Debian files it as non-free over an old note against altering the files: an owner's decision is open (see sources.md) | Bundled, 44 kB: the 906 stars to magnitude 4.5 and a few fainter figure stars. Written by `scripts/write-star-catalogue.mjs`. |
| Solar cycle table (`engines/solar/`) | Public domain (NOAA) | Bundled as served on 16 Nov 2026; a newer one can be fetched. |
| ITURHFProp (ITU P.533) and its maps | **Not one of the four.** No licence file; "free from any copyright assertions", headers reserve all rights | Not shipped. Built on each computer by `scripts/build-p533-engine.mjs` (Docker, wasi-sdk 34.0); maps downloaded when asked. See [hf-propagation.md](hf-propagation.md#the-second-models-terms). |
| `voacapl` (Fortran VOACAP) | US Government work, CC0 | Not shipped; built only to check the engine. |
| BlockNote | MPL-2.0, GPL add-ons | Not used; the editor is Tiptap (MIT). |
| Workbox, `vite-plugin-pwa` | MIT | Not used; the service worker is Outpost's own. |
| `@mozilla/readability` with `jsdom` or `linkedom` | Apache-2.0; MIT; ISC | Not used. Readability needs a DOM on the server (`jsdom`: 6.9 MB and eighteen packages; `linkedom`: a second HTML parser). Outpost already has `rehype-parse`, `rehype-sanitize` and `rehype-remark`; the article is found by Readability's published method in `modules/webpages/readable.ts` (~900 lines), tried on far fewer pages than Mozilla's. |
| `@zxing/library`, `@ericblade/quagga2` | Apache-2.0; MIT | Not used. Supplies reads EAN-13, UPC-A, EAN-8 and Code 128 itself (`features/supplies/barcode/decode.ts`), or with the browser's `BarcodeDetector`. |
| `saxes`, `sax` | ISC; BlueOak-1.0.0 | Not used; GPX is read by Outpost's own XML reader (`modules/maps/gpx-xml.ts`). `saxes` is archived; `sax` accepts malformed XML and its licence is not one of the four. `@xmldom/xmldom` (MIT) remains for one test. |
| `@peculiar/x509`, `selfsigned`, `node-forge` | MIT; MIT; BSD-3-Clause or GPL-2.0 | Not used. The HTTPS module lays out certificates itself (`modules/https/der.ts`, `certificates.ts`, ~400 lines) and leaves keys and signing to Node; `@peculiar/x509` pulls in `tslib` (0BSD). PKCS#12 is read by `pkcs12.ts` (~290 lines), since Node does not return the key. No `openssl` in the image. |
| `vcf`, `vcard4`, `ical.js` | MIT; ISC; MPL-2.0 | Not used. vCard is read by `modules/contacts/vcard.ts` (~400 lines): none of these reads vCard 2.1 properly, which Android and Outlook export. |
| `tsdav` | MIT | **Tests only**, driving the CardDAV server. Its `xml-js` depends on `sax`, held at 1.2.4 (ISC) by `pnpm.overrides`. The server is `modules/contacts/dav.ts`. |
| `axe-core`, `@axe-core/playwright` | MPL-2.0 | **Tests only**: the end-to-end suite runs it on every screen (`e2e/tests/a11y.ts`). Used unmodified as a package. |
| Atkinson Hyperlegible, Literata, Noto Sans | OFL-1.1 | Bundled fonts. |
| Protomaps basemap styles | BSD-3-Clause (design CC0) | Bundled. |
| Helvetica character widths (`features/maps/print/helvetica.ts`) | Adobe's Core 14 AFM notice: free to use and distribute with the notice | 448 numbers for laying out printed maps; the typeface is not bundled. |
| pdfmake 0.3.15 (with pdfkit 0.21, fontkit, linebreak, xmldoc, `@pdfmake/svg-to-pdfkit`, `@noble/hashes`) | MIT | Bundled, as the package's own browser build, loaded only when a PDF is made with the print kit (`features/print-kit/`, 308 kB gzipped). Lays out the household book: flowing text, columns, tables, tinted boxes, SVG drawings, embedded fonts. Printed maps and the other papers still use Outpost's own PDF writer (`features/maps/print/pdf.ts`). |
| `sax` (inside pdfmake's build, through xmldoc, for reading SVG) | **Not one of the four.** BlueOak-1.0.0, a permissive licence | Bundled inside pdfmake's prebuilt file, which cannot be built without it short of rebuilding pdfmake. Accepted by the owner on 22 Nov 2026 as a permissive exception. |
| Noto Sans, Noto Sans Arabic, Hebrew, Devanagari, Thai, SC and KR, static subsets (`features/print-kit/fonts/noto/`) | OFL-1.1 | Bundled in the print kit as fallbacks for letters the book's typeface lacks, each loaded only when a document uses it (2.8 MB in all, most of it Chinese). Made from google/fonts' variable files with fontTools (instanced to 400 and 700, subset, hinting removed); licence beside them. |
| pdfmake 0.3.15 (with pdfkit 0.21, fontkit, linebreak, xmldoc, `@pdfmake/svg-to-pdfkit`, `@noble/hashes`) | MIT | Bundled, as the package's own browser build, loaded only when a PDF is made with the print kit (`features/print-kit/`, 308 kB gzipped). Lays out the household book: flowing text, columns, tables, tinted boxes, SVG drawings, embedded fonts. Every other paper is laid out with it too, except the printed map page (`maps/print/export.ts`), which uses Outpost's own PDF writer (`features/maps/print/pdf.ts`) to place the map picture at exact scale. |
| `sax` (inside pdfmake's build, through xmldoc, for reading SVG) | **Not one of the four.** BlueOak-1.0.0, a permissive licence | Bundled inside pdfmake's prebuilt file, which cannot be built without it short of rebuilding pdfmake. The owner may prefer a pdfmake built from source with `sax` held at 1.2.4 (ISC), as `xml-js` is. |
| d3-scale 4.0.2, d3-shape 3.2.0 (with d3-array, d3-path, d3-interpolate, d3-format, d3-time) | ISC | Bundled. Scales and line and area shapes for the charts on printed pages (`features/print-kit/chart.ts`), drawn as SVG; already in the tree through Mermaid. |
| bidi-js 1.1.0, fontkit 3.0.0 (with restructure, unicode-properties, unicode-trie, dfa, fflate) | MIT | Bundled in the print kit's lazy part, loaded only when a document has Arabic or Hebrew (`features/print-kit/rtl.ts`, 78 kB gzipped). bidi-js puts right-to-left words in the order they are drawn; fontkit draws a drawing's Arabic and Hebrew words as shapes. Both already in the tree, through MapLibre and pdfkit. |
| Atkinson Hyperlegible Next, static Regular, Bold, Italic and Bold Italic (`features/print-kit/fonts/`) | OFL-1.1 | Bundled in the print kit's lazy part (170 kB gzipped); from googlefonts/atkinson-hyperlegible-next at commit 7925f50, licence beside the files. |
| jsPDF, pdf-lib | MIT | Not used. |
| maplibre-contour | BSD-3-Clause (with d3-contour, ISC, and vt-pbf, MIT) | Bundled; traces contours in the browser. |
| `@jsquash/webp` 1.5.0 (libwebp 1.0.2 in WebAssembly) | Apache-2.0 (libwebp BSD-3-Clause) | Bundled in the server, pinned; encodes imagery tiles. Copied to `server/imagery/` with its licence. Chosen over `sharp` (LGPL-3.0 libvips) and JPEG (edges must be transparent). GeoTIFF reading, reprojection and the PMTiles writer are Outpost's own (not `geotiff.js`, whose `xml-utils` is CC0). |
| Map data | ODbL (OpenStreetMap) | Downloaded by the user; credited on the map. |
| GeoNames | CC BY 4.0 | Downloaded by the user; credited. |
| Natural Earth | Public domain | Bundled world outline, and country outlines for road routes (`modules/roads/country-outlines.json`, simplified); other layers downloaded as reference layers. |
| Catalogue content | Per collection | Never bundled; each entry states its licence, or that it is unverified. |
| Reference sheets (`catalog/bundled/radio/`) | MIT | Bundled; compilations of facts from official sources, each listing them. |
| Satellite tracking, ported from LogBook73 (`features/satellites/`) | MIT, © 2026 Tyler Allen | LogBook73's tracker rewritten into Outpost; its licence read 21 Nov 2026. |
| `satellite.js` 6.0.2 | MIT | Bundled, pinned; SGP4/SDP4 in the browser. |
| CelesTrak GP elements | No data licence; CelesTrak's usage policy | Not shipped. Fetched on "Get orbital elements", not within two hours, as CSV (the policy says TLE lacks new objects). Never republished. |
| SatNOGS DB transmitters | CC BY-SA 4.0 (db.satnogs.org/about, read 21 Nov 2026) | Not shipped. Fetched on the same press, at most daily, credited on screen and printed passes; copies stay CC BY-SA 4.0. |
| SatNOGS DB satellites (names, launch, countries, website) | CC BY-SA 4.0 (db.satnogs.org/about, read 22 Nov 2026) | Not shipped. Fetched on the same press, at most daily, credited on screen. |
| Wikipedia article summaries | CC BY-SA 4.0 (Wikipedia:Reusing Wikipedia content, read 22 Nov 2026) | Not shipped. Fetched for one satellite on its own press, kept until discarded, shown with a link to the article and the licence. |
| Handbook and radio guides (`catalog/bundled/logbook73/`) | MIT, © 2026 Tyler Allen | Bundled; each book's last chapter carries the licence. |
| Signal figures (`features/library/figures/radio-viz*`) | MIT, © 2026 Tyler Allen | Ported from LogBook73's `RadioViz`. |
| Mermaid 12 | MIT | Bundled; diagrams in Markdown. Dependencies within the four, with DOMPurify used under Apache-2.0 and `robust-predicates` public domain (Unlicense). |
| elkjs (Mermaid's optional ELK layout) | EPL-2.0 or GPL-3.0+ | Not shipped; replaced by a stand-in (`figures/no-elk.ts`); diagrams use dagre. |
| `jsqr` 1.4.0 | Apache-2.0 | Development dependency only: the tests read Outpost's QR encoder (`features/qr/encoder.ts`) back with it. |
| IEEE registry of hardware-address prefixes (`oui.csv`) | **Not one of the four.** No licence; IEEE pages "all rights reserved" | Not shipped. Fetched (~3.9 MB) on "Fetch the registry", kept in the data directory. |
| OpenPGP.js 6.3.2 | LGPL-3.0-or-later | **The one exception.** The published file is copied unchanged to `web/vendor/openpgp/openpgp.min.mjs` with `LGPL-3.0.txt`, `GPL-3.0.txt` and `NOTICE.txt`, loaded at run time only by Encryption and encrypted pages. Replaceable. |
| `@rnpgp/rnp` 0.1.1 | BSD-2-Clause | Not used; the alternative to OpenPGP.js. |
| `kbpgp` | BSD-3-Clause | Not used. |

### The OpenPGP library

Encryption needs an OpenPGP implementation that works with GnuPG. Three were compared
(16 Nov 2026):

| | OpenPGP.js 6.3.2 | `@rnpgp/rnp` 0.1.1 | `kbpgp` 2.1.20 |
| --- | --- | --- | --- |
| Licence | LGPL-3.0-or-later | BSD-2-Clause | BSD-3-Clause |
| What it is | JavaScript for browsers | RNP and Botan in WebAssembly, new bindings | Keybase's, in IcedCoffeeScript |
| State | On npm since 2014; two Cure53 audits | First released July 2026; "Status: alpha" | No release April 2020 to September 2025 |
| Size in the browser | 395 kB | 10.7 MB WebAssembly + 224 kB | not measured |
| Works with GnuPG 2.5.18 | Yes, both ways, in the test suite | Yes, in a short trial in Node | not tried |
| Needs a secure origin | Yes (`crypto.subtle`) | No | No |

OpenPGP.js was chosen: for a security feature, twelve years of releases and two audits
outweigh a licence that needs care. The care:

- **Not part of Outpost's bundles.** `openpgpVendor` in `apps/web/vite.config.ts` copies
  the published file; nothing imports `openpgp` except for types, and the end-to-end
  suite checks the file served is the published one and that no other screen fetches it.
- **Its licence travels with it**, in the same folder and in `THIRD-PARTY-LICENSES.txt`.
- **Replaceable**: another build with the same interface at that path. Outpost reaches it
  through `features/encryption/engine.ts`, implemented by `engine-openpgp.ts`.

The alternative is `@rnpgp/rnp` behind the same interface, in a worker: within the
licence policy and usable on plain HTTP, but alpha, in the one feature where that
matters most, and 10.7 MB more. This is the authors' reading of the licence, not legal
advice.
