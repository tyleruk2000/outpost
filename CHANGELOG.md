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
- Times of day on the 24-hour or the 12-hour clock ("14:32" or "2:32 pm"), chosen under
  Settings → Appearance → Clock and kept in the browser. It follows the device until
  someone chooses, and applies to every time the app writes; UTC is always 24-hour.
- Database migrations applied automatically at start.
- The packaged app and the Docker image include `THIRD-PARTY-LICENSES.txt`, the licences
  of the projects bundled into them.

#### Contacts

- A Contacts screen for the people and places to reach when the phone network and the
  internet are down: names, labelled phone numbers, email addresses and addresses, a
  note, tags, a mark for an emergency that lists those first, a radio callsign with
  frequencies to try, and links to a saved place on the map and to pages of notes.
- Found as you type by name, part of a number, place, tag or callsign; call, text,
  email and copy in one touch; a large-type view of one contact; and an emergency sheet
  of the marked contacts that prints on its own.
- Contacts brought in from a phone as a vCard file (versions 2.1, 3.0 and 4.0, read by
  Outpost's own reader), or picked on the phone in Chrome on Android over https. The
  file is read into a preview first; a contact that looks like one already here is
  shown beside it and merged, replaced or added only when chosen. Photos are left out.
- Contacts exported as vCard 3.0 or 4.0.
- An address book phones can subscribe to (CardDAV): off until turned on, read-only, so
  contacts travel from Outpost to the phone and never back, with no password to keep.
  Tested with a client library and a sync program, not with a phone.
- A label that is also the name of something every JavaScript object has ("constructor",
  "__proto__") is a label like any other: it no longer stops the address book being
  listed for phones or exported.
- Contacts are in backups, are counted and removed by "erase everything", are in the
  search index, and travel on a portable drive unless left off.
- A database migration adds the tables (`0007_contacts`).

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

#### Automatic backups

- Backups on a schedule (daily or weekly, at a chosen time) to a folder of Outpost's
  own on a storage location, off until a location is chosen. Each is a job: a
  consistent copy of the database, written under a temporary name, renamed, then read
  back and checked. One that fails the check is kept, marked, not counted and reported.
- Only the newest two backups that failed their check are kept, and a scheduled backup
  that goes on failing is tried after one hour, then two, four, eight, up to a day.
- A location that is not connected is skipped, never replaced by another place; the
  screen says so, and the backup is made when the location or the server comes back.
- The newest seven scheduled and seven hand-started backups are kept by default. Only
  files Outpost named and can read as its own backups are ever removed.
- The stored backups are listed with date, size, version and whether they verified,
  with **Back up now**, download, **Restore this one** and delete.
- Restoring a backup (an uploaded file included), deleting a stored backup and keeping
  fewer can only be done on the computer Outpost runs on, unless the server is started
  with `OUTPOST_ALLOW_REMOTE_ERASE=true`. Restoring from another device was allowed
  before.
- Restoring checks every file against the checksum in the archive.

#### Document library

- Uploading PDF, EPUB, Markdown, plain text, CSV, JSON, HTML and image files, with the
  type checked by content, duplicates detected by checksum, and originals kept
  unmodified.
- Text extraction for search from PDF (page by page), EPUB, Markdown, HTML and text,
  in a worker thread.
- EPUB books read in the app: a contents page with the cover, title and author, the
  table of contents from the navigation document or the NCX, chapters in reading order
  with previous, next and a way back to the contents, pictures from inside the book,
  footnotes, tables, and links between chapters. A chapter is drawn from a tree of plain
  values, like a Markdown document; the book's own HTML, styles and scripts are never
  put in the page. The place reached in each book is remembered on the device, and a
  search result opens the chapter its passage is in. Copy-protected (DRM) books are
  refused in words and never opened; fixed layouts, audio, video, MathML and scripted
  content are not supported, and the page says so. See `docs/epub.md`.
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

- Save a web page to read offline. Paste the address of a page; Outpost fetches that
  one page, finds the article in it (title, writer and site when given, and the text
  with its headings, lists, quotations, tables, code and links), and keeps it as a
  document that says "Saved from *address* on *date*" and is searched like any other.
  Pictures come along if asked, inside the same file, within limits on their number
  and size. The page is looked at before it is saved, so what will be kept is seen
  first. One page per action: nothing is crawled, scheduled or fetched again, and the
  same address saved twice asks whether to replace the earlier copy or keep both. On
  the Library, the Import screen and the command palette.
- A Markdown document shows the pictures it carries in its own file; any other picture
  is still only described, and nothing is loaded from another site.

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
- A page tree that stays quick with thousands of pages: past two hundred rows only the
  rows near the part on screen are drawn, with keyboard movement, focus and
  screen-reader positions unchanged.
- Moving pages by touch: press and hold to lift a page, drag it with a label that says
  where it will land, and let the list scroll at its edges. Without dragging: "Move
  to…", "Move up" and "Move down" in the page's menu, and Alt with an arrow key.
  Every move can be undone from its message.
- A block handle for single list items: drag one item, with what is nested under it,
  within its list or to another list, and turn into, duplicate, move or delete just
  that item from the handle's menu or the keyboard. Alt (Option) and drag still moves
  the whole list.
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
- Search no longer waits for reference collections before it shows anything. Your own
  documents, pages, places and the rest appear at once; each collection's articles are
  added below as that collection answers, with a line saying collections are still
  being searched, and nothing already on screen moves. On an installation with 29
  archives on a network share a search had taken 7 to 20 seconds to show anything.
  Archive searches now wait in Outpost, three at a time, instead of inside kiwix-serve
  (which works on four at once and finishes a search nobody is waiting for), so typing
  quickly no longer leaves dozens of them queued; each archive has 8 seconds and the
  whole search 30, and a note names any collection left out. Every installed archive is
  searched, not only the first 24. `GET /api/search` takes `reference=later`, and
  `GET /api/search/reference` sends the articles a line at a time. See
  [docs/search.md](docs/search.md#reference-collections-in-results).
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
  Measured on an Apple M2 Max: 33 seconds per thousand passages for the bundled books,
  up to 54 for a library of nothing but full-length passages, and 2.2 kB of disk per
  passage. It replaces the in-process option that needed a package nobody had.
- The built-in model reads the whole of a passage. It takes 256 word pieces at a time,
  and about a quarter of the passages in the bundled books are longer; these were cut
  off, which left their last lines out of search by meaning. A longer passage is now
  read in consecutive stretches whose vectors are averaged by length. Measured on 7,556
  passages: text past the old cut is found among the first five results 73% of the time
  instead of 24%, nothing else is found less often, and building takes 7% longer. The
  model's id changed with it (`built-in:all-MiniLM-L6-v2-q8-245889ee`), so an index
  built before this needs building again; Settings says so.
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

#### Chat

- **Chat**, a screen for conversations with a language model you run yourself, on the
  same model server and under the same own-network rule as answers. Tested against a
  stand-in server; no real model has yet held a conversation through Outpost.
- Conversations are kept on the server, so they are on every device: start one by
  typing, rename, find by name, delete after asking. There are no accounts, so
  everyone who can open Outpost can read them, and the screen says so.
- Replies arrive as they are written and go on being written if the tab is closed.
  Stop closes the connection to the model server. Regenerate, edit and resend the last
  message, copy a reply, copy a code block, save a reply as a new note.
- A reply's headings, lists, tables and code are drawn from a tree of plain values,
  never as HTML; a link in a reply is shown as words and a picture is never fetched.
- A model picker fed by the model server's own list, remembered per conversation, with
  each model's size, parameter count and quantisation when the server is Ollama.
- **Use my library**, off by default: each message is answered from passages found in
  documents, notes and book chapters, with citation markers and links to the sources.
  **Ask about this** on a document or a page starts a conversation about that item.
- Long conversations send the newest exchanges that fit twice the context budget and
  leave out whole older ones; a line in the conversation shows where what is sent
  begins.
- Plain words for each way it can go wrong: no model server set up (with "Look for
  Ollama on this computer"), a server that is not answering, a model that is not
  installed, a model still loading, a reply cut off, a reply stopped.
- Conversations are counted and removed by "erase everything", which stops a reply
  being written first.

#### Reference collections

- A catalogue of 311 items in JSON manifests, with a validator: 155 Kiwix archives; 131
  official handbooks, rules, guides and textbooks fetched as PDFs from their publishers
  (FAA, NASA, USGS, the US National Weather Service, FAO, WHO, Ready.gov, USDA, OpenStax,
  UIAA, Ofcom, IARU, CEPT, NIST, NTIA, CISA, the Met Office, the Health and Safety
  Executive, GOV.UK, Ordnance Survey, the US Department of Energy and others), each
  pinned by size and SHA-256; and nine radio reference sheets and sixteen radio books
  that ship with Outpost. Downloaded PDFs join
  the document library and are searchable to the page.
- 75 of those were added in a second pass on 16 November 2026, each fetched and its
  licence read that day: Met Office weather factsheets, Ordnance Survey's map reading
  guides, HSE safety guidance, UK government guides (life saving signals, the
  Countryside Code, a flood plan, the National Risk Register, traffic signs), US
  Department of Energy handbooks on electricity, drawings and machinery, the six
  volumes of Lessons In Electric Circuits, six more OpenStax textbooks, U.S. Chart
  No. 1, Ofcom's EMF guidance, the space weather scales, a book on wireless networking,
  and 27 more Kiwix archives. Three packs were added (Weather in Britain, Coast and
  sea, Electricity and electronics) and nine extended. `docs/sources.md` also records
  what was looked at and left out, and why.
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
- Collections that are a set of documents with a list (those made with openZIM's
  nautilus, such as the Post Disaster Resource Library) are shown as that list in the
  reader: searched by title, author and description, each PDF opened in the built-in
  viewer and added to the library, recordings and films played, and the titles found
  by Outpost's own search. Their own page drew nothing, because it keeps its list in
  browser storage that a page in the sandbox does not have. The list is read on the
  server by a parser that accepts one shape and runs nothing.
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
- GPX 1.0 and 1.1 files read in one pass that keeps only what is stored, with stated
  limits on what a file may hold (1,000,000 points, 20,000 waypoints, 10,000 tracks
  and routes, 100,000 segments, in 20 MB). A day's recording of 150,000 points is
  read in a fraction of a second; a file over a limit is refused with a message
  saying which. Files that start with a byte-order mark or prefix every element are
  read, and extensions are passed over however many there are.
- A Maps screen: saved places, routes with elevation profiles, distance measuring,
  hill shading, drawing a box to download with its exact size shown first, and a
  three-position sheet on phones.
- Contour lines traced in the browser from installed terrain: nothing more to
  download, spacing that follows the zoom, index lines labelled with their height.
- The download box adjusted by handles on its edges as well as its corners, with the
  pointer or the arrow keys.
- Moving a saved place straight from the map (press and hold, the map's menu, or the
  list), by pointer or keyboard, with the new position confirmed before it is kept.
- Sunrise, sunset, first and last light, solar noon, day length, nautical twilight and
  the moon's phase for a saved place, a found position, any point on the map ("Sun
  times here") and where you are, for any date, worked out on the device. Times are on
  the device's clock or in UTC; the far north and south are said in words; checked
  against US Naval Observatory times.
- A **Sun** tab in the map's panel, beside Places, Routes and Offline maps: sun times
  for the centre of the map, with nothing saved, searched for or pressed and held. On a
  phone its name is on the sheet whenever the map is on screen. Over plain HTTP it says
  why the times where you are cannot be given, and links to Settings → HTTPS on your
  network.
- The Sun line of a saved place sits straight under the place's name, so it is on
  screen on a phone as soon as the place is opened; opening it raises the sheet.
- The menu of a point pressed and held with a finger stays open when the finger is
  lifted, wherever on the map it was pressed.
- A card for where you are while the map follows the device: its position to copy or
  save, and how closely the device claims to know it.
- Maidenhead locators: a grid over the map (fields, squares, subsquares and extended
  squares as the zoom allows), the locator of a position beside its coordinates, and
  locators of four, six or eight characters read by the map's search.
- A line-of-sight check between two points, from installed terrain: distance, bearing
  each way, the path drawn from the side with the ray, the Earth's curve (4/3 radius)
  and the first Fresnel zone, and the answer in words. It is geometry over terrain,
  not a prediction of coverage, and gives no verdict where terrain is missing.
- Recording a track as you walk: start, pause, resume and stop on the map, with the
  line drawn live and distance, time, moving time and climb shown as it goes. Points
  are kept on the device as they arrive, so a reload or a closed tab loses nothing and
  the unfinished recording is offered back; a save that cannot reach Outpost waits and
  is sent again. It runs only while the screen is on and Outpost is in front, which
  is as much as a browser allows, and says so before it starts. Not tried on a real
  phone outdoors.

#### Repeaters

- A repeater database of your own, kept in Outpost's database and used with no
  connection. Outpost ships with no repeaters and downloads none: no publisher whose
  terms were read gives leave for that (docs/sources.md). A list is imported from a
  CSV file you obtained (three layouts of the RSGB ETCC's lists, CHIRP's, Outpost's own
  export, or any CSV with headings), shown before it is kept, and entries can be added
  and changed by hand.
- Bringing a list up to date from a newer file leaves alone the entries you changed or
  removed unless you say otherwise, having been shown how many there are.
- A list filtered by band, mode and distance from a saved place, the middle of the
  map, where you are or a typed locator, with distance and bearing; repeaters on the
  map, counted by patch when there are too many to tell apart; a repeater handed to the
  line-of-sight check as one end; repeaters found by callsign, town or frequency in the
  search across everything.
- Export of the filtered set as CHIRP CSV, with a note to check it before
  transmitting, and as Outpost's own CSV, which reads back without loss. The CHIRP file
  has not been loaded into CHIRP or a radio.
- Every screen says where an entry came from and the date of its data, marks a list by
  its age, says that a status is what the list said then, and marks a position the
  list wrote roughly as approximate.
- Repeaters, imported and entered by hand, are counted and removed by "erase
  everything".
- A frequency in an imported list is read in the unit its column's heading names, and
  the bands run to 1 mm (250 GHz), so 24, 47 and 76 GHz given in megahertz are no longer
  read a thousand times too low. A number that could be two frequencies, with nothing
  to say which, is left out with the reason in the preview.

#### On a phone, out of reach of the server

- The web app keeps itself in the browser with a service worker, so it opens when the
  phone cannot reach the server, and has a web app manifest and icons so it can be
  added to the Home Screen. Needs HTTPS; over plain HTTP the app says so and points to
  the HTTPS settings.
- "Keep on this phone" on a page of notes (the pages inside it come too, with their
  pictures), on a route, on the saved places as a set, and on the part of the map in
  view, which is measured by the server before anything is fetched.
- "On this phone": what is kept, with sizes and dates, removing copies, the room the
  browser reports, and asking the browser to keep the data.
- Out of reach the app is read-only and says so in one line; a page or screen that was
  not kept says so instead of loading. Back in reach, kept copies are replaced by the
  server's versions. A new build replaces the kept app.
- Fetching a kept map area again replaces each tile as it arrives and removes nothing
  until every tile has: an interrupted refresh leaves a whole area, part of it newer,
  and says so.
- `GET /api/maps/area-size`, and `?raw=1` on map tiles.
- Print or save as PDF: a box the shape of the paper chooses part of the map, and one
  page is made on the device from the installed maps (A4, A3 or US Letter, either way
  up; fit the box or a round scale such as 1:25,000), with a title, the date, scale
  bars in kilometres and miles, north, latitude and longitude round the edge, and the
  map's credits with their addresses. Contour lines, hill shading, routes, saved
  places and names can each be left on or off. The map is drawn at 300 or 150 dots to
  the inch, in pieces where a canvas could not hold it, and the page states how the
  scale varies across the sheet. Nothing is sent to the server.
- "Find a route" in the Routes tab: look a waymarked walk, a cycle route or a named
  path up in OpenStreetMap by name or by the map view, see it on the map, and add it
  to your routes with heights from installed terrain. It needs the internet at the
  moment of searching and says so, names the server before anything is sent, and asks
  one question per press. The servers are declared in `catalog/route-sources.json`. A
  found route keeps its credit: in its panel, in the map's credits and in its GPX
  export. Gaps in a route are left open, never drawn across.

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
- GPX files read by a strict XML reader of Outpost's own that never builds a tree of
  the file and never reads a DOCTYPE, so that neither a hostile file nor a long
  recording can exhaust the server's memory. Reading happens in a worker thread; its
  heap limit is a last line and no longer what the server's safety rests on. Two files
  are read at a time, and a file may turn at most 5,000 waypoints into saved places.
- A saved web page is fetched through the guarded download client, pictures included,
  with a plain client name and no cookie or referrer; read in a worker thread under
  limits of size, elements and time; cleaned with an allow-list; and kept and shown as
  Markdown, never as HTML. A page drawn by script is refused with the reason: Outpost
  runs no page's scripts.
- No telemetry, and no outbound request unless a person asks for one.
- Answers from a language model: the question and passages go only to the model
  server a person configured (redirects refused, no credentials in the address),
  sources are fenced as data in the prompt, and an answer is drawn as words only, with
  no links but the citation markers Outpost builds.

- HTTPS on the home network, optional and off by default (Settings → HTTPS on your
  network): a second listener on port 8443 with a certificate from an authority Outpost
  makes for itself, limited to private addresses and local names, so that phones get the
  secure address browsers require for location and the like without a domain name or
  the internet. Plain HTTP keeps working and nothing is redirected. Settings gives the
  addresses, the certificate to download, and steps for trusting and removing it on
  each kind of device. Replacing or deleting the authority is accepted only from the
  computer Outpost runs on. Tested with Node, OpenSSL, curl and macOS; not on a real
  iPhone, Android phone or Windows computer.

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
  poorly, and it has not been run on a Raspberry Pi or on Windows. A local embedding
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
