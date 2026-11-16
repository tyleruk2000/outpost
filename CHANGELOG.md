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
- Stopping is prompt and in order: on SIGTERM or SIGINT the server stops accepting,
  ends the live-event streams (a browser tab left open no longer keeps the process up),
  gives requests in flight three seconds, stops jobs so that they resume, closes the
  database and exits. It exits anyway after eight seconds, inside Docker's ten.
- A web app (React, Vite, Tailwind) with light and dark themes, a keyboard-driven
  command palette, and a layout that works from phone width up.
- Times of day on the 24-hour or the 12-hour clock ("14:32" or "2:32 pm"), chosen under
  Settings → Appearance → Clock and kept in the browser. It follows the device until
  someone chooses, and applies to every time the app writes; UTC is always 24-hour.
- Database migrations applied automatically at start.
- Every screen can be found from the navigation, on a wide screen as on a phone. One
  description of every screen and where it belongs (`apps/web/src/components/nav.ts`)
  draws the sidebar, the phone's More sheet, the quick search's "Go to" list and the
  shortcuts. A screen reached from inside another (How search works, the five radio
  tools, Import files, Manage and clean up, Bring back from a drive, the set-up guide)
  is listed indented under it in the sidebar and in the More sheet, behind a button that
  shows or hides them; the group of the screen in view opens by itself, and what was
  opened or closed is remembered on the device. Collapsed to icons, such a screen opens
  a short menu of itself and those under it. The parent screen links to them under its
  title ("How search works" beside the box on the Search page). On a short window the
  screens, the page tree and the upkeep list scroll together. A test fails if a route is
  in no list, and an end-to-end walk presses its way to every screen at desktop and
  phone width, also at an address browsers do not treat as secure.
- A drop-down, a menu or a popover opened inside a dialog is drawn above the dialog.
  It was drawn underneath, so the drop-downs of every form in a dialog ("Log an entry"
  on the contact log, a plan's station, an equipment profile) opened where they could
  not be seen or pressed.
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

#### Database

- A Database section on the Storage screen: where Outpost's SQLite file is and how big,
  with its write-ahead log and the free space on its drive (with a warning below
  256 MB); what is in it, counted as the rest of the app names things, and where its
  bytes go in seven groups, measured with SQLite's `dbstat` in a worker and kept with
  the time it was worked out; the layout version, SQLite version, journal mode and the
  last backup.
- **Check the database** (SQLite's quick check, or the full integrity check) as a job
  that reads on a connection of its own, open to every device.
- **Reclaim unused space** (`VACUUM`) as a job, from the computer Outpost runs on only:
  refused without room for it or while other work runs; while it runs, other jobs
  wait, backups cannot take their copy, and changes are refused with a message.

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
- PDFs that Outpost makes can be added to the library from the screen that made them.
  Wherever a PDF is made (a printed map page, an HF prediction, the comparison under it,
  a coverage map, a communication plan) the same three actions are offered in the same
  words: **Save as PDF**, **Add to library** and, where the device can, **Share**. Adding
  goes through the library's own upload, so the file is checksummed, checked for a
  duplicate and for room, read for search and kept in backups like any other. It is
  filed under the category "Made in Outpost" (or one chosen once and remembered on the
  device), named for what it is and when, and its source links back to what it was made
  from. Progress, **Stop**, and plain words when there is no room, the storage is away
  or the library already has the file. On a phone it is the route that does not depend
  on the phone saving a file. The upload takes a `title` and a `source` with the file.
  A one-time pad asks before it is added, and says why. See `docs/library.md`.
- The contacts emergency sheet as a PDF, with the same three actions. Adding it to the
  library asks first: the sheet is other people's details, readable and searchable by
  everyone on the network once it is there, and a copy that does not change when a
  contact does. The PDF says when it was made. Phone numbers are never broken across
  lines. Names, addresses and labels in letters the PDF's typefaces lack (Greek, Polish,
  Arabic, Chinese) are drawn by the browser as pictures, with the words kept in the
  file, unseen, so that search finds them; where a device will not draw, each such run
  is printed "[?]" and the sheet says how many entries.
- Sun times on paper: under the times in the Sun tab and a place's Sun section, a PDF
  of two weeks, the month or the year, a day to a line (first light, sunrise, solar
  noon, sunset, last light, day length), on the clock the screen shows, from the same
  code, with the screen's caveats. The same three actions.
- The PDF writer can carry words in any script as hidden text (a Type 3 font that draws
  nothing, with a ToUnicode map), read by pdf.js and so by the library's search.
- A test that fails when a screen prints or makes a PDF without the shared library
  actions (`apps/web/src/lib/made-pdf-rule.test.ts`).
- An HF prediction as a PDF (A4 or US Letter, two pages, black on white) and as
  Markdown: the path and date, both stations as the engine ran them, the sunspot number
  and its source, the frequency and every band hour by hour with the engine's figures,
  the best hours and bands, every caveat, and the engine and data versions. A cell with
  no figure is printed as a dash, never as a nought.
- A coverage map as a PDF: its picture, the legend with the count of cells in each
  class, the size of the grid, the grid again in figures so that it reads when printed
  in grey, what was asked and the caveats.
- A printed map page carries, as text drawn in no ink, what it shows: where, how large,
  at what scale, when, and the names drawn on it. A search for a place on a map that is
  in the library finds the map.

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
- Imported files are converted to pages in a process of their own, with a minute and
  1 GB for each, so a file built to be slow or to need a great deal of memory (or simply
  a very large one) no longer stops the server answering or grows its memory: 4,000
  empty `<i>` in a 28 kB HTML file held it for 16 seconds, and a 4 MB file could take
  2 GB. The HTML converter is also no longer slow at that file, or at text in many
  small pieces.
- Imports that can be stopped and continued without creating anything twice, and a
  report of what was created, updated, skipped and failed.
- A block of code in an imported HTML file, or in a saved web page, keeps its indents
  and line ends when a highlighter has put them in elements of their own.

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
- Search by meaning and answers were made as simple as they can honestly be, with a
  set-up guide. **Search by meaning is one switch**: turning it on uses the built-in
  model and builds the index by itself, says how long is left from the build's own
  speed, says when it is ready, and reads what is added later without being asked;
  turning it off pauses a build and says what is kept. A set-up left pointing at an
  embedding server that is not there is said plainly, on or off, and put right in one
  press. **Answers and chat are three presses**: look for Ollama, use the model
  offered, try it; when the model answers, the address and the model are saved and
  answers are switched on. The section's first line says whether it is working (it
  asks the model server, not only the settings) or the one next step. Everything both
  sections could do before is behind **More options**, where the three numbers that
  weigh the two searches now live too. **A short list of small models** that suit a
  laptop or a Raspberry Pi 5 is shown where a model is chosen and where there is none
  yet, with each one's download size, memory and what to expect, and the command for
  the one to start with; the list is one data file. **The set-up guide** is a page
  inside Outpost (`/help/search-and-answers`), so it works with no internet, linked
  from both sections and from Chat; the same guide is
  [docs/setup-guide.md](docs/setup-guide.md), written from the same source. Its
  commands, setting names and ports were read from the publishers' pages on
  2026-11-16. The three presses, a few answers and a chat turn were run by hand against
  a real Ollama with two small models that day; the automated tests still use the
  stand-in. See [docs/ai.md](docs/ai.md#tried-with-a-real-model).

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
- **Measured with two small real models.** A fixed set of 45 questions over a small
  test library (`apps/server/test/eval/`), asked through Outpost of `llama3.2:3b` and
  `llama3.2:1b` on Ollama 0.40.16, with a script that counts right answers, rightly
  declined questions, made-up answers, citation faults and times. The figures before
  and after the changes below are in `docs/ai.md`. It is run by hand; the test suites
  never contact a real model server and fail if a test tries to.
- **Passages for an answer are chosen one by one**, by words and by meaning together,
  five at most, where there used to be up to three from each of the best documents and
  eight in all. A passage that only shares a common word with the question is no
  longer handed to the model, and a question the library plainly does not cover finds
  nothing, so the model is not asked.
- **Ollama is asked for a context size, and not to cut a prompt down.** Left to itself
  it answered a prompt that was too long from half of it, without saying so. Outpost
  now uses Ollama's own chat endpoint, asks for a context that holds what the context
  budget allows, and passes on a refusal as "too long for the model".
- `OUTPOST_OLLAMA_ADDRESSES` names where "Look for Ollama on this computer" looks, for
  an Ollama on another port.

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

- A catalogue of 310 items in JSON manifests, with a validator: 155 Kiwix archives; 130
  official handbooks, rules, guides and textbooks fetched as PDFs from their publishers
  (FAA, NASA, USGS, the US National Weather Service, FAO, WHO, Ready.gov, USDA, OpenStax,
  UIAA, Ofcom, IARU, CEPT, NIST, NTIA, CISA, the Met Office, the Health and Safety
  Executive, GOV.UK, the US Department of Energy and others), each
  pinned by size and SHA-256; and nine radio reference sheets and sixteen radio books
  that ship with Outpost. Downloaded PDFs join
  the document library and are searchable to the page.
- 72 of those were added in a second pass on 16 November 2026, each fetched and its
  licence read that day: Met Office weather factsheets, HSE safety guidance, UK government guides (life saving signals, the
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
- The check no longer takes "not found" in answer to `HEAD` as a file being gone until
  a request for its first byte is refused too: two publishers answer `HEAD` with 404 for
  files they serve. NIST Special Publication 811 and the Met Office's Thunderstorms
  factsheet, left out for that reason, are listed.
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
- **Add to library** in the reader says what it does where it is pressed: the document
  is copied out of the collection into the library on a named storage location, nothing
  is downloaded from the internet, and the space is used a second time, with each
  file's size and what all of them come to against what is free. A line of the list
  shows a document being added, waiting its turn, in the library, or not added, with
  the reason and **Try again**.
- **Add all to library** for a collection that lists documents (and **Add these** for
  what a search is showing): one job that copies every document not yet in the
  library, after a dialog that states how many, how much space and where, and refuses
  when there is not room. It shows "12 of 108", can be stopped, goes on when the page
  is closed, picks up after a restart, never copies a document twice, and waits for
  the reading of text to keep up, so that it does not hold back other documents. At
  the end it says how many were added, how many were already there and which failed
  and why. Files a page links to inside its collection are added by the same job.
  Documents added from a collection stay when the collection is removed. See
  [docs/troubleshooting.md](docs/troubleshooting.md#adding-a-collections-documents-to-the-library).
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
- Satellite imagery under the map's roads and names, from local files only: the world
  from NASA's Blue Marble (July 2004, 2 km or 500 m a pixel), and small areas chosen on
  the map from one Sentinel-2 pass (10 m a pixel), fetching only the parts of the
  scene's files that cover the area. Before fetching, the day, cloud over the area,
  exact bytes to fetch, size, time, licence and cost (free, no account) are shown, with
  warnings for large areas. Each picture's credit and day are shown on the map and on
  printed pages. No migration.
- Markers, GPX import and export, and coordinate parsing including British National
  Grid references.
- Exported GPX checked against the GPX 1.1 schema with a wider set of exports. Two
  things it refused are fixed: a time kept from an imported file in a form GPX does
  not allow is written in the form it does, and a point at 180° east is written as
  180° west. `docs/maps.md` says what was checked, with what, and what was not.
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
- Sun times that can be found and read on a phone: today's sunrise and sunset in words
  under the centre readout whenever the sheet is lowered; sunrise and sunset set large,
  first and last light under them, and the rest in a quieter list; nothing cut off at
  320 px wide, in either clock or in UTC.
- The sheet's row of tab names is clear of the bar at the bottom of the screen on a
  phone with a home indicator, where it had been under it, and takes a second line
  when the text is too large for one, where its last name, Sun, had run off the edge.
- A cross marks the centre of the map wherever something reads it (the readout while it
  says "Centre", the Sun tab), on any size of screen. On a phone the centre is now the
  middle of the part of the map in view, so it is never behind the sheet, and raising
  the sheet slides the map to keep it there. The cross is on the point the coordinates
  give, which it was not after the map had flown somewhere.
- Icons for saved places: sixteen, beside the colour, chosen in the place editor by
  touch or keyboard and shown on the map, in the lists, on the pin while a place is
  edited, in the map's search and on a printed map. Existing places stay plain pins.
  Where places crowd together an icon is drawn only where it has room; in a test with
  5,000 places in view, all with icons, the map was about one frame slower between
  frames than with plain pins. A database migration adds the columns
  (`0013_place_icons`).
- Saved places are exported to GPX with the Garmin symbol name for their icon, and a
  waypoint's symbol is read as an icon when it is a known one; the file's own symbol
  is kept, so a round trip loses nothing. An icon given on a portable drive comes home
  with the place.
- The menu of a point pressed and held with a finger stays open when the finger is
  lifted, wherever on the map it was pressed.
- A card for where you are while the map follows the device: its position to copy or
  save, and how closely the device claims to know it.
- Maidenhead locators: a grid over the map (fields, squares, subsquares and extended
  squares as the zoom allows), the locator of a position beside its coordinates, and
  locators of four, six or eight characters read by the map's search.
- The grey line: day and night over the map, worked out on the device for now (kept
  to the minute) or a chosen date and time. The line where the Sun rises or sets, night
  shaded in steps at the ends of civil, nautical and astronomical twilight, and the
  point where the Sun is overhead; right across the date line and round the poles. A
  button beside the Maidenhead grid's, remembered on the device; a legend that says the
  time it is drawn for; the Sun tab on the same day. Printed with a line saying the
  time when it is on, and offered on HF coverage maps for the hour shown, about the
  15th of the month.
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
- On a phone, one rule for where things sit over the map, in place of each tool
  choosing for itself: the search box across the top with a menu of every tool by
  name at its end, the tools as icons under it for as many as fit, a card for what is
  in hand that takes at most the lower three fifths of the clear map and scrolls
  inside itself beyond that, and the readout and credits above the sheet. Nothing lies
  over anything else; with larger text or a small screen things step aside in a set
  order, and each is still reachable. The centre of the map is kept clear of any card.
  Line of sight is named once, not on the card and the sheet both. Everything pressed
  is 44 px. The maps set into the radio screens follow the same rule. Measured in
  Chromium at four phone sizes, three text sizes, with and without a home indicator,
  light and dark; not looked at on a real phone. See `docs/maps.md` and
  `docs/development/web-screens.md`.
- On a wide screen, opening a route after the map has flown somewhere fits it in the
  middle of the clear part of the map; it used to land 28 px to the left.

#### Repeaters

- A repeater database of your own, kept in Outpost's database and used with no
  connection. Outpost ships with no repeaters. A list is imported from a file you
  obtained (three layouts of the RSGB ETCC's lists, CHIRP's, the WIA's directory,
  Hearham's JSON list, Outpost's own export, or any CSV with headings or JSON list of
  records), shown before it is kept, and entries can be added and changed by hand.
- Sources of repeater lists by country, on the Repeaters screen, with the country the
  map was last looking at first. Each says whether Outpost can get the list (the
  IRTS's and Hearham's, fetched once when you press **Get the list**, through the
  guarded download client), how to get it by hand (the publisher's page and the
  steps: the RSGB ETCC's, RepeaterBook's, Open Repeater's, the WIA's, the SRAL's), or
  that there is nothing usable, with the reason and the publisher's terms as read on
  16 November 2026 (docs/sources.md). Outpost reads no list out of a web page and
  gets round no sign-in, rate limit or check for a browser. The sources are declared
  in `catalog/repeater-sources.json`, which an administrator can add to or override.
  The fetch was tested against a stand-in publisher, not pressed against a real one.
- One repeater shown once. An import says how many of its rows are already held or
  repeat within the file, shows them side by side, and asks what to do: keep both
  (the default), leave what is held as it is, or show the newer data with anything
  you typed or changed carried onto it. **Find duplicates** does the same for what
  is already held. Nothing is deleted by a merge: the entries not kept are set aside,
  can be separated again, and come back if the entry kept goes with its list.
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
- Bringing a list up to date sees a new row that repeats an entry the list already
  has, as importing the same file afresh does. Two repeaters that may be one are
  offered as that even when each is also held twice. A fetched file whose name in the
  address cannot be decoded is kept, under the name as written, and not reported as a
  failed connection.
#### HF propagation

- A planner under **Radio** that predicts how a shortwave signal gets between two
  places through a day: reliability, signal-to-noise ratio, signal and noise, MUF, FOT,
  HPF and LUF, the path's hops and take-off angle, every amateur band from 80 m to
  10 m, SSB, CW, FT8 and JS8Call side by side, and the working for short, steep (NVIS)
  paths with geometry, signal-to-noise ratio and reliability kept apart.
- Predictions come from VOACAP, run as WebAssembly in a worker thread with no access to
  the computer's files. Outpost has no propagation model of its own and predicts
  nothing when the engine or its data is missing or damaged.
- Every answer says where its sunspot number came from (NOAA's forecast from a dated
  table, a number you typed, or an foF2 you measured) and is never called live.
- Radio and antenna profiles, generic antennas that say how they are modelled, and
  predictions saved by name, which open again as the question that was saved, antenna
  and date included.
- The engine's data listed with versions, sizes, dates and checksums; a newer solar
  cycle table fetched through the download manager when asked for.
- Charts drawn by hand from the engine's figures, readable with the keyboard and by a
  screen reader.
- Three reference circuits held to the text the Fortran original prints. See
  [docs/hf-propagation.md](docs/hf-propagation.md).
- **Choose a place on the offline map** wherever the planner takes a position: press
  the map, or press a saved place to use it by name. Works by touch.
- **End-fed half-wave wires of a stated length** in the HF planner, coverage maps,
  communication plans, the contact log's comparison and equipment profiles: a 10 m and
  a 5 m wire, each horizontal and vertical, as generic antennas, and a wire length (4.5
  to 82 m) as part of an antenna profile. Each is run as one of VOACAP's own models with
  the length in metres, as checked against the engine: an upright wire as its vertical
  monopole (type 22) of that height on every band, with its length in wavelengths said
  band by band; a level wire as its horizontal dipole (type 23) only where the wire is
  about a half-wave. On other bands a level wire is **not modelled**: the engine's dipole
  is fed at its centre, so no figure is given, and the band is hatched on the charts and
  written "Not modelled" in the ranking, the plan matrix and the plan's exports, never
  as 0%. The matching unit's loss is not modelled and is said to be taken off as
  feedline loss. The antenna that was "End-fed half-wave, horizontal at 6 m" is renamed
  "End-fed half-wave recut for every band, horizontal at 6 m": its length follows the
  frequency, as it always did, and everything saved with it is unchanged.
- **HF coverage** under Radio: the engine asked about every cell of a grid laid over
  the area the map shows, drawn as a layer over the offline map by reliability,
  signal-to-noise ratio or signal strength for any hour of the day. Every cell is one
  answer from the engine; a cell it cannot answer is crossed through, and nothing is
  smoothed or filled in. The legend says what the number is, states the grid and counts
  the cells in each class. The work is a job that can be stopped; three grid sizes, up
  to 2,304 cells; maps can be saved, reopened and deleted.
- **Communication plans** under Radio: several stations with their equipment, the hours
  and bands of interest, and for every pair each band through the day, both ways. A
  primary and an alternate band are chosen by a rule written out on the screen. Plans
  link to notes and documents, and are written out as a PDF or as Markdown that reads
  as plain text.
- **Contact log** under Radio: contacts, stations heard and calls not answered, typed in
  or imported from an ADIF file (specification 3.1.8, the `.adi` form). An end has a
  position only when the file states one; the same contact is never added twice; every
  record is accounted for. The log can be set beside the engine's predictions, as
  counts, with every entry left out given its reason and no percentage from a handful.
- Plans, the log, equipment profiles and saved predictions are counted among a person's
  own things under Manage and clean up, and erased with everything else.
- A large ADIF file (over 128 kB) is brought in by a job, a batch of 200 contacts at a
  time, with progress and a Stop button on the log screen. Done in the request, 20,000
  contacts held the server for 3.1 seconds and 200,000 for 28; the longest hold is now
  under 50 ms at any size. All of a file is in the log or none of it.
- An ADIF file with no header that starts with a byte-order mark or a blank line is
  read (it was recorded as an import of no records), and a file with nothing in it to
  read is refused in words.
- A new coverage map is no longer cleared before it can be saved when eight or more
  maps and plans are already kept: the eight most recently used are counted among the
  unsaved ones, and listing saved maps and plans no longer counts as using them, or
  reads their results (ten saved fine maps: 88 ms a list before, 0.6 ms now).
- The limit of three coverage maps waiting, and one job for the same map asked for
  twice, hold however much other work is queued.
- **A second model** beside VOACAP: under a prediction, **Compare with a second model
  (ITU P.533)** runs the ITU's own P.533 software for the same path and shows, for each
  band and hour, whether each model has the path open, the MUF, signal and
  signal-to-noise ratio from each, and the difference, with both run on isotropic
  antennas. Optional: the engine is built on your own computer from the ITU's source
  (`scripts/build-p533-engine.mjs`, Docker) and its 137 MB of maps are downloaded when
  you ask. Nothing of the ITU's ships with Outpost. The build reproduces the ITU's nine
  reference outputs line for line. See [docs/hf-propagation.md](docs/hf-propagation.md#a-second-model-itu-p533).
- **VOACAP's ionospheric and noise coefficients are no longer shipped.** The 13
  coefficient files (CCIR Reports 322 and 340, with NTIA/ITS tables in the same files)
  and two short-whip patterns of unstated source, 559 kB, left the repository and the
  packaged app: the ITU's repository that was relied on for them also says "All rights
  reserved". They are one download, from the engine's own repository at the pinned
  commit, checked file by file: with **Download** where the planner, coverage maps,
  plans and the log's comparison would run (one line says what is missing, how big and
  why), or at set-up with `node scripts/fetch-voacap-data.mjs --data-dir <dir>`, which
  `deploy/pi/install.sh` runs (`--no-voacap-data` to skip). They are kept in the data
  directory, listed on **Engine and data** with where they came from and when, and in
  **Manage and clean up** with a warning before removal. An installation whose app
  folder still holds them copies them into the data directory on first start with no
  download. The engine refuses cleanly without them and never runs on a partial or
  altered set. See [docs/hf-propagation.md](docs/hf-propagation.md#data).

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

#### Encryption

- An **Encryption** screen: OpenPGP keys, text and files, working in the browser and
  with GnuPG, and classical ciphers to work with pencil and paper.
- Keys: make a pair (Curve25519, or RSA 4096 for old correspondents) with a name, an
  optional address, an expiry and a passphrase; add someone's public key or a private key
  of your own by pasting or from a file; fingerprints shown in full; export, a
  revocation certificate, and deleting, each after saying what follows.
- A private key is kept in the browser, or on Outpost as well if asked, always in the
  form its passphrase protects. The server refuses one that is not.
- Text: encrypt to keys, with a passphrase, or both; sign; decrypt; check a signature,
  with a result that says which key signed and whether anyone has checked whose it is.
- Files: encrypt and decrypt a file to a download, up to 537 MB.
- Pages of notes can be encrypted from their menu, then unlocked, read and edited in the
  browser. The ciphertext is saved only after it has been decrypted back to the same
  page, and the text it replaces is erased from the search index and the database file.
- Ciphers by hand: Caesar and ROT13, Vigenère, Playfair, rail fence, columnar
  transposition and the one-time pad, each with its steps shown on your own message, a
  Vigenère square and one-time pad sheets to print, and a plain statement of how little
  each protects.
- Keys, text, files and encrypted pages need a page opened over HTTPS or on the computer
  Outpost runs on; elsewhere the screen says why. See docs/encryption.md.
- "Print pads" and "Print a Vigenère square" open the sheet over the whole screen as it
  will print, with **Print** and **Save as PDF**. The PDF (A4 or US Letter, letters in
  Courier as real text) is made in the page and sent nowhere; the screen says a saved
  file is another copy of the pads to destroy. Before, the button called the browser's
  print and showed nothing, so on a phone whose browser does not print from a button it
  did nothing at all.
- A Print button no longer fails in silence, here, on the emergency sheet in Contacts or
  on the map's page: it is left out where the browser has no print, stands second where
  Outpost was opened from the Home Screen, and says what to do instead when a press is
  followed by no sign of printing. docs/encryption.md, "Printing from a phone", has what
  is known about each browser and its sources.

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
- The restart that applies a staged restore is accepted only from the computer Outpost
  runs on, like the restore itself (or from anywhere with
  `OUTPOST_ALLOW_REMOTE_ERASE=true`). On another device the notice says where to do it.
- Backups can be protected with a passphrase (Settings → Backup), off by default. Every
  backup made afterwards, scheduled ones included, is encrypted to a public key; Outpost
  keeps no passphrase and nothing that opens a backup, so it cannot recover a lost one.
  A file that was altered or cut short is refused and told apart from a wrong
  passphrase. Changing the passphrase applies to later backups; older ones open with
  the passphrase they were made under, and the list shows which. Set, changed and
  removed only where restoring is allowed, and never from another device over plain
  http. The file format is written out in `docs/storage.md`.

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
  are read at a time. Waypoints turned into saved places are written a hundred at a
  time with a pause between, so a file may turn all 20,000 it can hold into places
  without the server stopping to do it (it was held to 5,000, written in one go).
- Run from source, the server turns off one optimisation of the JavaScript engine
  (compiled calls from WebAssembly into JavaScript), after a fault in V8 13.6 was traced
  in crash reports from the tests: two worker threads starting at once could end the
  process with "Check failed: end > addr". The packaged app's GPX worker runs no
  WebAssembly and is not affected. See security.md.
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
- A certificate of your own for that listener, as a separate choice in the same section:
  one from a public authority for a name you own, from an authority of your own, or from
  a tool such as mkcert. It is given in Settings (PEM or DER files in any order, or one
  PKCS#12 file with its password) or put in `tls/own` of the data directory as
  `fullchain.pem` and `privkey.pem`, and is checked first: what cannot work is refused
  with the reason, and Settings says which of the server's addresses it does not cover
  and whether devices need anything installed. A key is accepted by upload only at the
  computer Outpost runs on or over HTTPS. The folder is looked at every half minute, so
  a renewal is taken up without a restart; an expired certificate goes on being served
  and Outpost never switches to its own authority by itself. Going back is one press.
  Not tried with a certificate from a real public authority, a PKCS#12 file made by
  anything but OpenSSL, or in Docker.
- The computer Outpost runs on is recognised at its own network address as well as at
  `localhost`: a browser on it opening `http://192.168.1.20:8080` may now erase
  everything, restore and delete backups, restart, set the backup passphrase and give
  an HTTPS key, as it could at `localhost`. Not in a container, and never for a
  link-local address; why it is sound is in `docs/security.md`.
- A certificate and key can be given in Settings from another device over plain http,
  once the page has said that the key (and a `.pfx` password) would cross the network
  unencrypted, offered HTTPS or the folder instead, and the person has ticked that they
  accept it. The server needs `acceptKeyOverPlainHttp=yes` in the upload for that, and
  logs the address it came from.
- The steps for trusting a certificate now come straight after the list of addresses
  and cover Linux, Firefox on any computer and the command line on each system, each
  with the download in the form that system wants (`.crt` or `.pem`), how to check it
  worked and how to remove it. Every step is cited to its maker's documentation in
  `docs/deployment.md`. On a Mac the downloads were added to and removed from a
  keychain made for the purpose; nothing was tried on a real iPhone, Android phone,
  Windows or Linux computer.

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
- **No encryption at rest**, apart from backups protected with a passphrase and private
  keys on the Encryption page. Use encrypted drives where that matters. HTTPS is built
  in but off until turned on in Settings; see [docs/security.md](docs/security.md).
- **The HTTP API is not versioned** and may change between releases.
