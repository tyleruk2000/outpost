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
  shortcuts. A screen reached from inside another (How search works, the radio tools,
  Import files, Manage and clean up, Bring back changes from a drive, the set-up guide)
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
  documentation of 2026-11-15. The automated tests still use only the stand-in; runs
  against real models are below and under
  [Chat: tools a model can use, and MCP](#chat-tools-a-model-can-use-and-mcp).
- A model server must be on this computer or a private network: an address on the public
  internet is refused, by spelling and by looking the name up before each request,
  unless Outpost is started with `OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true`.
- **Measured with two small real models.** A fixed set of 45 questions over a small
  test library (`apps/server/test/eval/`), asked through Outpost of `llama3.2:3b` and
  `llama3.2:1b` on Ollama 0.40.16, with a script that counts right answers, rightly
  declined questions, made-up answers, citation faults and times. The figures before
  and after the changes below are in `docs/ai.md`. It is run by hand; the test suites
  never contact a real model server and fail if a test tries to. Five more models were
  run through the same questions on 17 November (see **Which model** under
  [Help: the guides in the app](#help-the-guides-in-the-app)).
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
- **A finished answer is settled before it is shown as finished.** A reply that says
  the passages hold no answer is shown as "Your library does not seem to cover this",
  citing nothing. A marker to a number no passage carried is pointed at a passage only
  when the words it stands on are, word for word, whole sentences of exactly one
  passage, and is otherwise taken out; the answer says which. An answer that cites
  every passage says so. Measured again with both models: no right answer was lost.
- **"Loading the model"**: when Ollama says the model is not in memory, the answer and
  the reply say it is being loaded. Nothing is said for servers that cannot be asked.
- **Too long for the model**: a refused answer is asked once more with fewer passages,
  and says how many were left out.

#### Chat

- **Chat**, a screen for conversations with a language model you run yourself, on the
  same model server and under the same own-network rule as answers. Tried with
  `llama3.2:3b` and `llama3.2:1b` on Ollama: Stop, a conversation past the context
  size, Use my library, a model loading, and two requests at once (see `docs/ai.md`).
- Conversations are kept on the server, so they are on every device: start one by
  typing, rename, find by name, delete after asking. There are no accounts, so
  everyone who can open Outpost can read them, and the screen says so.
- Replies arrive as they are written and go on being written if the tab is closed.
  Stop closes the connection to the model server. Regenerate, edit and resend the last
  message, copy a reply, copy a code block, save a reply as a new page in Notes.
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
- A turn the model server refuses as too long is sent once more without its earliest
  messages, and the reply says so; a reply that Ollama stops because the context is
  full says it ran out of room, not that it reached its length limit. Replies from the
  library are settled as answers are.

#### Reference collections

- A catalogue of 410 items in JSON manifests, with a validator: 173 Kiwix archives; 212
  official handbooks, rules, guides and textbooks fetched as PDFs from their publishers
  (FAA, NASA, USGS, the US National Weather Service, FAO, WHO, Ready.gov, FEMA, the CDC,
  USDA, OpenStax, UIAA, Ofcom, IARU, CEPT, NIST, NTIA, CISA, the Met Office, the Health
  and Safety Executive, GOV.UK, the US Department of Energy and others), each pinned by
  size and SHA-256; and nine radio reference sheets and sixteen radio books that ship
  with Outpost. Downloaded PDFs join the document library and are searchable to the
  page. There are 22 packs. What was added on 17 November is under
  [Catalogue additions](#catalogue-additions).
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

- **The estimated range shades what is in sight**, for repeaters and points alike: ground
  in sight is shaded, ground hidden by nearer ground is left clear, and the outline is the
  furthest ground in sight. It was the first unbroken stretch in sight, which from a
  hilltop is nearly nothing: from Scafell Pike it said 0.1 to 3.3 km where ground was in
  sight 55 to 100 km away.
- **Estimated radio range from any point**: press and hold the map (or right-click) and
  choose **Estimated radio range from here** for the repeaters' line-of-sight estimate
  from a hilltop or any place: an outline shaped by the terrain, the answer in words, your
  aerial's height and the other station's, remembered on the device.
- **A printed map can show magnetic north** (tick **Magnetic north**; off unless chosen,
  remembered in the browser): a blue MN arrow beside true north, the declination for the
  middle of the sheet on the day with its yearly change and whether to add or subtract
  it, and blue magnetic north lines across the map every 30 mm, to set a compass against
  anywhere on the sheet.
- **Print or save as PDF** on a phone: raising the sheet to its full height no longer
  leaves it empty.
- **Print or save as PDF** on a phone lays the page out in the sheet, raised to half,
  as line of sight does: paper, which way up, the scale and both buttons, with the box on
  the map above it. As a card over the map its settings could not be seen on a phone in
  a browser, whose bars leave a card about 160 px of the 286 it needs. The coordinates
  step aside while the page is laid out, so the box has the clear map to itself.
- On a phone the credits under the map are one line: the map's own ("Protomaps ©
  OpenStreetMap") stays in sight and **4 more** opens the rest in place. They took
  three lines of a small map written out in full. All of them are still written out on
  a wide screen, and none can be taken off: the licences ask for them.
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
- Aerial photographs for small areas, where a government publishes them openly in a
  form Outpost reads: New Zealand's (LINZ, CC BY 4.0, 5 cm to 30 cm, WebP inside
  Cloud-Optimised GeoTIFFs) and the lower 48 United States' (USDA NAIP, public domain,
  30 cm to 1 m, through Microsoft's Planetary Computer). They are offered beside the
  Sentinel-2 days when an area is chosen, with the same confirmation, and warnings by
  bytes and tiles rather than area. England's Environment Agency photographs were
  researched and are not offered: they are published only as ECW, a closed format
  (docs/sources.md). No migration, no new dependency.
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

#### Reference layers for the map

- A Layers tab on the Maps screen: published data drawn over the map, each layer
  switched on by itself, with a legend that tells a published record (a filled dot), a
  historical document (a ring marked H) and anything unverified (a ring marked ?) apart
  without colour; population density in people per square kilometre; filters by
  country, source and kind; a search of the records by name, also from the search across
  everything. A pressed record shows its publisher, dates, licence, accuracy and a link
  to it at its source. See [reference-layers.md](docs/reference-layers.md).
- Sources, each fetched only on a press after its size is shown: Natural Earth (countries,
  regions, populated places), OurAirports, OpenStreetMap (military sites, nuclear
  facilities, hospitals, emergency services, shelters) by Overpass question or from a
  Geofabrik extract read by Outpost's own `.osm.pbf` reader, Wikidata (nuclear power
  stations and research reactors), WorldPop (population, 2020, 1 km) and Switzerland's
  emergency meeting points. FAS, SIPRI, NTI, the IAEA and the historical archives are
  linked, with why.
- Imports of files a person obtains: places (CSV), points, lines and areas (GeoJSON, such
  as an emergency planning zone), historical records with every field the specification
  asks and which of three kinds of record each is, and country-level figures with their
  citations. British National Grid, Swiss and Web Mercator coordinates are converted;
  other systems are refused.
- A store in SQLite with a spatial index (R*Tree) and full-text names (migration 0016),
  duplicates across sources found and kept with both sources, packs replaced only when
  their successor is in, and records kept on the map while the drive holding a pack is
  away. The GeoTIFF reader learns LZW and 32-bit floating point.
- Flood zones for England as a reference layer: the Environment Agency's Flood Map for
  Planning (Flood Zones 2 and 3, Open Government Licence), fetched on a press for the
  area on screen up to about 20 km across, after a count and a stated size; drawn filled
  under the map's names, zone 3 in a deeper tone with a solid edge and zone 2 lighter
  with a broken one; the legend quotes the Agency's definitions and its caveat that the
  zones are "not suitable for showing whether an individual property is at risk of
  flooding", and says a planning zone is not a forecast.

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
- **A level end-fed wire longer than a half-wave has approximate figures** in place of
  none. On those bands it is run as VOACAP's sloping long wire (ITS-78, type 41) laid
  level at the wire's height, one file per frequency, and every figure is labelled
  approximate: in the planner's band table (a dashed frame and ≈, as well as the shade),
  the first line of the answer, coverage maps' legends, plans' matrices and
  recommendations, the comparison, the contact log's comparison (counted apart) and the
  prediction, comparison, coverage and plan PDFs and Markdown ("~" beside "n/m"). The
  half-wave band is unchanged, and the step of about a decibel between the two models is
  said where bands stand side by side. A wire shorter than a half-wave is still not
  modelled. Answers kept for questions this changes are worked out again; no other key
  changes. The comparison's PDF and Markdown no longer print a series that is not
  modelled as noughts. See docs/hf-propagation.md.
- **More antennas a portable operator carries**, by name, in the HF planner: a 20 m
  end-fed wire (a half-wave on 40 m) sloping 25° from 1.5 m to a 10 m pole, and level
  6 m up; and the SPOOLTENNA (PARKS or ULTRA), 65 ft of wire sloping as its owner's
  manuals show it. A **sloping wire** is a new way an end-fed wire is put up, with the
  height of its low end, its slope and the bearing of its high end: run as VOACAP's
  sloping long wire (type 41) at its slope where it is a half-wave or longer, every
  figure labelled approximate, and not modelled where it is shorter. With no bearing, its
  low end is turned towards the other station. The antenna lists are grouped by wire
  length and then how it is put up, the person's own first, with a box to find one by
  typing. Inverted-L and inverted-V wires, short loaded whips, small loops, delta loops
  and random wires were looked at and are not offered as presets; see
  docs/hf-propagation.md, "A sloping wire" and "Other antennas looked at". Migration
  0018 adds the two columns. Answers kept with the antennas there were before keep their keys.
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
  and its 137 MB of maps are downloaded when you ask. **Build the P.533 engine** has
  Outpost do the build itself, as a job, with no shell and no Docker: it fetches the
  ITU's source and a pinned compiler (wasi-sdk, about 190 MB, deleted afterwards),
  holds each to its checksum, and keeps the result only if it is byte for byte the
  recorded file; added for the first Raspberry Pi, where Outpost runs in a container
  and the script (`scripts/build-p533-engine.mjs`, Docker) could not be run without
  logging in to it. Nothing of the ITU's ships with Outpost. The build reproduces the ITU's nine
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

#### Morse trainer (Radio)

- Radio → Morse trainer, from LogBook73's: Koch receive lessons (40, in LCWO's order,
  with the offer of the next at 90 %) and callsign, word, abbreviation and QSO-phrase
  drills; a send trainer with a straight key, iambic paddle (Curtis A and B, radio
  presets), single lever and bug, and Quick targets, Echo (with timing coaching and a
  played-against-keyed time line) and guided CQ conversations; a practice contact with
  a made-up station; On the air, which builds a call a Reverse Beacon Network skimmer
  can spot, plays it, checks your keying of it and links to the network's own page
  (Outpost asks the network nothing); a code chart with the timing rule; and progress
  over time, by lesson and by weak character.
- Keys on the screen made for thumbs (both paddles held at once, no scrolling, zooming
  or long-press menu), keyboard bindings for USB interfaces that type keys, mouse-paddle
  capture, and wired keys and game controllers where the browser and the page allow,
  saying what is missing where they do not. Sound starts on the first tap on an iPhone
  and asks not to be muted by its silent switch.
- One record of progress and one list of sessions for the household, in the database
  (migration `0026_morse_trainer`): counted in Storage → Database and Manage and clean
  up, erased with everything else, in backups, and cleared by Start again.

#### Games

- A **Games** section after Preparedness, for when the internet is out: Allotment,
  Solitaire, Peg solitaire, Sudoku, Draughts and Pairs, each drawn in code (no image,
  font or sound files), each its own small chunk, playable by touch, mouse and keyboard
  with every cell, card or hole a control with a spoken name. See
  [docs/games.md](docs/games.md).
- **Allotment**: one plot for the household, kept on the server so every device sees the
  same, every action applied with the server's clock. A crop grows only in its real
  British months (from its earliest sowing to its last harvest, as the Royal
  Horticultural Society gives them; under glass, all year) and only while its bed is
  moist; otherwise it waits, losing nothing. Watering with the can lasts 12 hours; rain
  falls on wet days worked out from the date alone, the same on every device, more often
  in autumn and winter (in the southern hemisphere the months move on six); the water
  butt keeps the open beds watered for 2 days after rain; the greenhouse is in season all
  year but gets no rain. Twelve crops, growing in moist soil in their months from four
  minutes (radishes) to three days (squash): broad beans, garlic, onions and kale were
  added so that something grows in every month. The stall, more beds, a water butt,
  compost, hens, a hive, an apple tree and a greenhouse; a few milestones. Dry and moist
  soil, rain, and why each bed waits are shown on the plot; there is a "This month on
  the plot" section, and a card for each crop in the almanac saying where its facts come
  from. It never punishes: nothing withers, dies or runs out, a ripe crop waits for
  ever, what builds up stops at a small cap, radish seed and onion sets are free, and
  after a year away everything is waiting. A plot saved before these rules is read into
  them with nothing lost (no migration). **Start again** is in plain view at the foot of
  the screen, not folded inside About. See [docs/games.md](docs/games.md#allotment).
- **Solitaire** (Klondike, also called patience), draw one or three, with undo, tap to
  send a card where it fits, pick and put, drag, and putting away all that can go.
  **Peg solitaire** on the English 33-hole board. **Sudoku** made on the device, every
  puzzle with exactly one answer, three levels, notes, undo and a check. **Draughts**,
  English rules, against a computer that thinks in a worker, or two at one device.
  **Pairs**, a memory game for children.
- One table, `game_saves` (migration `0027_games`), for the allotment and each game's
  tally (played, won, best time, fewest moves): counted in Storage → Database and Manage
  and clean up, erased with everything else, in backups. A game in progress of the
  others stays on the device it is played on, so two people can play at once.
- The quick search finds a screen by other names it is given (Solitaire by "patience"
  and "klondike").

#### Frequencies to listen to (Radio)

- Radio → Frequencies to listen to (`/radio/frequencies`): where to tune, with no
  connection, to hear the time, news, emergency broadcasts, weather, distress and
  calling channels, amateur emergency nets and licence-free channels. A reference set
  bundled with the app, kind by kind and country by country, each entry with the page it
  was checked against and the day; nothing is fetched.
- Time signals in detail: each station's frequencies, power, hours, how the signal is
  laid out so that a clock can be set by ear, which time it gives, and where it is heard;
  closed stations kept with their closing dates; a guide to setting a clock.
- Filters by kind, country or region (starting from the home place's country), band and
  "a set like mine", and a search box that finds frequencies by their first figures and
  channels by number. `?kind=time-signals` (and the other kinds) opens one kind.
- A shortwave schedule with an end date is shown as expired from the day after, worked
  out on the device.
- The filtered list as a PDF, with Save as PDF, Add to library and Share.
- A data test that fails on an entry with no source, no checked date, a frequency outside
  its band, an unknown place, a duplicate or a bad date. See
  [docs/radio-frequencies.md](docs/radio-frequencies.md).
- With a country chosen, shortwave time signals and broadcasters filed under other parts of
  the world are listed under it as "Shortwave from further away", so that WWV is not hidden
  from a reader in Britain.

#### Supplies (Preparedness)

- **Preparedness → Supplies** keeps stored food, water, fuel, medicine, batteries and
  equipment: how many, where they are kept, and the date on them, use-by (safety) and
  best before (quality) treated differently. Made for a phone: large plus and minus on
  every row, one press to use one, and "Add, then another like this".
- How many days the food (by energy, eaten in use-by order) and the water last for the
  household, with what was counted and left out; what runs out first; what to use
  first; totals by category and by place. The household's needs are official planning
  figures, each named and changeable: energy from Public Health England's Government
  Dietary Recommendations (2016), water from the UK government's 3 litres a day to drink
  and WHO's 7.5 to 15 litres for all uses.
- A shopping list: the shortfall to the days wanted in whole packs of what is already
  kept, what is below a minimum and what is past its use-by; edited, ticked off into
  stock with the date asked for, made a PDF and copied as text.
- A barcode scanner: a typed number or a keyboard-like scanner, a photo (which works
  at a plain http address), and the live camera on a secure page, with a reader of
  Outpost's own for EAN-13, UPC-A, EAN-8 and Code 128 where the browser has none.
  Nothing is looked up on the internet.
- CSV out and in, with a preview and a choice for duplicates. Items have addresses a
  note can link to; `GET /api/supplies/outlook` answers days of food and water and what
  is missing for other screens. Migration 0016. See [docs/supplies.md](docs/supplies.md).
- **The energy in a food, offered by name.** Typing a food's name offers its energy per
  100 g from USDA FoodData Central (SR Legacy, April 2018, 7,793 foods, public domain),
  which ships with Outpost (724 kB) and works offline; British words such as courgette,
  mince and tinned also find the American entry. Choosing one fills the energy and asks
  for the weight of the tin or pack rather than assuming one, and the item's notes say
  where the figure came from.
- **How long it lasts** says the days of energy, whose daily figure it uses (Public
  Health England's, or one given for a person under Household), and which foods are not
  counted, with one press (**Give them their energy**) to give each a figure in turn.
  `GET /api/supplies/foods` answers the food search.


#### Weather and hazards (Preparedness)

- **Preparedness → Weather and hazards** keeps forecasts, severe-weather warnings,
  flood warnings and river levels, and climate and sunshine averages for saved places,
  so that they can be read with no connection. Everything says who it came from, when it
  was fetched and the period it covers, and says in words when it is old or has run out
  ("Fetched 3 days ago: this forecast has run out").
- Nothing is fetched by itself: **Update now**, or the tick box "also update when I open
  this screen", off by default. The server fetches and keeps one copy for every device.
- Sources, each with its terms quoted in docs/sources.md: Open-Meteo, asked for the Met
  Office's models; the Met Office's UK warnings feed (no position sent), shown in its
  own words with a link to each warning; the Environment Agency's flood warnings and
  river levels (England); NASA POWER's monthly climate averages; PVGIS's peak sun hours
  for a solar panel, which Tools → Power and batteries asks for. Positions are sent
  rounded to two decimal places.
- A barometer log: readings typed in hPa or inHg with the barometer's height, reduced to
  sea level by the standard atmosphere's formula; a chart; and the three-hour tendency in
  the Met Office's words (rising slowly, quickly, very rapidly; now falling), with the
  Met Office's general rule quoted as a rule of thumb, not a forecast. Readings can be
  brought in from a logger's CSV file.
- `GET /api/weather/home-warnings` gives other screens the warnings in force for the
  home place when they were last fetched.
- The fetched copies are listed and cleared under Manage and clean up; places, copies
  and readings go with "erase everything". Migration `0021_weather`.
- One meaning of "home" everywhere: the saved place with the home icon, the first saved
  if several (it no longer depends on which was edited or starred last). With none,
  Weather and hazards says in one line how to mark one, with a link to Maps, and says
  when the home is not in its list of places.
#### Nuclear preparedness: the third sitting

- **The workspace shows the reference layers**: the Maps screen's Layers panel, record
  card and dataset manager, mounted unchanged in the Layers tab; a press on the map
  opens a record outside the Scenario tab. A **Records** tab lists historical records by
  period with their kind and document. The provenance key counts what is held.
- **People inside each ring** of the selected scenario, from an installed WorldPop grid:
  a rounded count, said as who lives there and not a prediction of harm; partial or none
  at the grid's edge; none for the fallout pattern; never a total.
- **Plans**: an emergency plan template for a radiation emergency (UKHSA's go in, stay
  in, tune in, on GOV.UK); the **Plans** tab gathers the household's plans of that kind,
  places and the distances between them, supplies, ways to keep in touch, notes; a saved
  scenario can be attached to a plan as an illustration.
- **Several scenarios on the map** (up to six, A to F), saved together as a set
  (migration `0024_nuclear_scenario_sets`).
- **Colour**: a hue for each kind of effect, from validated map tokens, on the map, the
  legend, the results and the PDF.
- **The wind field** is labelled, takes compass points, says under itself whether a
  pattern is drawn and why not, fits the map to the pattern, and offers a nearby
  forecast's wind from the weather kept on this device.
- **Reference layers**: a WorldPop grid can be imported from a file; historical records
  are listed by `GET /api/reference/historical`.
- **Maps in the scenarios' PDF**: each scenario's section has a map of its rings over
  the offline basemap and, where a fallout pattern is drawn, a second map out to the
  100 rads per hour contour; several scenarios get an overview map first, with nothing
  added up across them. Drawn only when "Make the PDF" is pressed, with progress in
  words and Stop; "Maps in the PDF" off gives the words-only PDF at once. Saved places
  only when ticked, and then "Add to library" asks first. Reference layers are never
  drawn. With no map region for the area, or a device that cannot draw it, the rings
  to scale and a line saying why. The Markdown stays words only and says so.

#### Emergency plans (Preparedness)

- **Preparedness → Emergency plans**: a household's own plans for a power cut,
  flooding, no phone or internet, a storm, snow and ice, a heatwave, sheltering at home
  and leaving at short notice, each started from a template whose every step quotes a
  dated official source whose own terms allow its words to be copied (Be Ready, GOV.UK
  and the Environment Agency, and the Met Office under the Open Government Licence;
  Ofcom unchanged, by its permission), or from blank. Publishers whose terms do not
  (the British Red Cross, Ready.gov) are pointed to, never quoted. The screen tells the
  source's words from words changed and from the household's own, and lists what was
  taken out; the licence statements go with the words on screen and on paper. Where no
  official guidance was found, the template asks instead of advising.
- Steps for before, during and after; the household and what each must remember;
  people to contact in order, linked from Contacts, with an out-of-area contact; places
  to meet, linked from saved places; how to communicate if the phones fail, with a
  communication plan; supplies set beside the inventory (days of food and water held
  against days wanted, each thing in stock, low or missing, and one press to put what
  is missing on the shopping list); a power plan's headline figure; where things are;
  notes and links. A contact or place deleted since is shown as missing, not dropped.
- "Use now": only the steps to tick (each tick kept with its time), the numbers to call
  and the places to meet, in large type. Reset for next time. A review is asked for
  after a period the household sets.
- Cards to print: wallet cards that fold to bank-card size, four to a sheet with cut and
  fold marks; a fridge sheet on one page; a grab list. Names in other scripts are drawn
  as pictures with the words kept for search. Migration 0018. See
  [docs/emergency-plans.md](docs/emergency-plans.md).
- The list of plans and "Use now" show one line when Outpost holds a Met Office or
  Environment Agency warning for the home place, in the publisher's words, with its
  age and a link to Weather and hazards; nothing when there is none or the copy is more
  than a day (flood: twelve hours) old.

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
- "Keep on this phone" for an emergency plan, at the foot of its "Use now": the plan's
  steps, numbers, people and places, so that "Use now" opens out of reach. Its steps can
  be ticked there; the ticks are kept on the phone and sent when the server is back,
  added to those made elsewhere meanwhile (the union, earliest time; an untick only
  removes the very tick it saw; a reset on the server wins).
  `POST /api/emergency-plans/:id/ticks/merge`.
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

#### Tools: Power and batteries

- Quick calculators under Tools → Power and batteries: battery runtime, solar output
  and time to charge (PVWatts' losses, each one changeable), cable size and voltage
  drop (IEC 60028 copper, ASTM B258 gauges, and the current limits of 33 CFR 183.425
  given as guidance), batteries in series and parallel, generator fuel from the
  generator's own data sheet, Ohm's law, the resistor colour code, resistors in series
  and parallel, an LED's resistor and a voltage divider. Nothing typed into them is
  kept. Each says its formula and source.
- Power plans: a battery bank, its loads (a radio with transmit, receive and standby
  power and a duty cycle from its mode; a Raspberry Pi; anything typed in; AC loads
  through an inverter), solar with peak sun hours by month, and a generator or mains
  charger. Worked out into the day's use, runtime and days of autonomy, each month from
  full, the solar to break even in the darkest month, peak currents against the
  battery's and the cable's ratings, and the state of charge hour by hour, with every
  assumption listed. Plans are kept on the server (migration `0016_power_plans`),
  copied, compared, written out as a PDF (Save as PDF, Add to library, Share), counted
  on the Storage screen and erased with everything else.
- A power plan can fill its peak sun hours from what Weather and hazards has fetched
  from PVGIS for one of its places (best tilt or level ground), on a press, asking
  before replacing figures typed in. The plan records whose figures they are, and the
  PDF says so. Where none have been fetched, the screen says where to fetch them.
- A library of common devices for the battery calculators, each figure as its maker
  published it, with the document, URL and date read: Raspberry Pi boards and
  additions, phones, tablets and laptops by battery, handheld and HF radios, receivers,
  a LoRa node, routers, switches, NAS boxes, a monitor, a lamp, a cool box, and what an
  inverter must supply for a kettle or microwave; medical devices only as their makers'
  guides. The quick battery runtime calculator builds its load from them (or one load
  in watts as before): how long what runs lasts, phone charges instead and besides, a
  number of days, which uses most, the battery needed and the solar to keep up, "at
  least" wherever a figure is a maximum. "Add a load" in a plan starts from the same
  library; a load made from it cites its source on the screen and in the PDF. A
  person's own devices are kept on the server (migration `0025_power_devices`). Plans
  can now have USB loads through a converter and charges of a battery.
#### Nuclear preparedness

- Preparedness → Nuclear preparedness: a workspace over the offline map (and satellite
  imagery, where downloaded) with an educational nuclear effects simulator. A place, a
  yield from 1 kiloton to 10 megatons, a surface burst, a height of burst or the height
  that carries a chosen overpressure farthest, and a wind give rings for blast (20, 10,
  5, 2 and 1 psi), second- and third-degree burns, initial radiation (600 and 100
  rads), the fireball and the crater, and, for a surface burst, the idealised fallout
  plume along the wind. Every figure is read from Glasstone and Dolan, *The Effects of
  Nuclear Weapons* (1977), cited to its figure or table, tested against the book's own
  worked examples, and rounded to two significant figures. Parameters the model does not
  cover are refused with the reason.
- Rings are circles on the ground, labelled with their scenario, level and distance and
  told apart by line style as well as colour; saved places are measured against a
  scenario in words; scenarios are saved (migration `0018_nuclear_scenarios`), opened
  again, compared two at a time as A and B, and written out as a PDF or Markdown with
  every assumption, limitation and source. Saved scenarios are counted under Storage,
  Database, and erased by "erase everything".
- The plan for the rest of the module (data sources and their terms, layers, a
  historical records category, the dataset manager and personal planning) is in
  `docs/nuclear-preparedness.md`.

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

#### Tools: Solar clock

- Tools → Solar clock (`/tools/solar-clock`), worked out on the device with no internet,
  for the home place, a saved place or typed coordinates, on this device's time zone or
  a UTC offset set by hand. Now: the sun's height and bearing, sundial time beside clock
  time, the equation of time, the longitude correction, solar noon and the sun's path
  through the day. Clock recovery: the time to set clocks by from a stick's shadow (two
  equal shadows, the shortest shadow, its length, its compass bearing) or sunrise on a
  sea horizon, each with a range worked out from the stated measurement error, what a
  date a few days out does to it, and better sources. Make a sundial: hour lines for the
  latitude, true north from a shadow, the correction table for the place, a card-and-
  pencil dial, and a template PDF. Make a nocturnal: how to use one, a template PDF made
  for the place's longitude and clock, and a star-clock calculator. Northern hemisphere
  only for the stars, as the screen says.
- The sun's altitude and azimuth at an instant, NOAA's refraction model and the moment
  the sun stands at a height, beside `sunDay` in `features/maps/lib/sun.ts`; sidereal time
  and the positions of Polaris, Dubhe and Kochab in `features/maps/lib/sky.ts`. All held
  to the US Naval Observatory's published values in tests.
- The solar clock draws its methods: the shadow's path seen from above, the stick and the
  sun's height, the compass's view of a shadow, and each recovered time on the day's sun
  with its range. The sundial, the gnomon, true north and the night sky with a nocturnal
  are drawn for the place. See [docs/tools-solar-clock.md](docs/tools-solar-clock.md).
- Recovering the time from a shadow's compass bearing fills in the magnetic declination
  for the place from the World Magnetic Model (see [Tools: Compass](#tools-compass)).

#### Tools: QR codes and devices on this network

- QR codes: make a code from text or a web address, a Wi-Fi network, a contact (typed
  or from Contacts, with the fields chosen), a phone number, an email address or a
  saved place, in the browser with Outpost's own encoder written from ISO/IEC 18004;
  save it as PNG or SVG, copy, print, or save, add to the library or share a printed
  sheet. Nothing typed leaves the page.
- Devices on this network: lists what answers on the private networks the computer
  running Outpost is on, with names, addresses, what each announces, the maker (once
  the IEEE's registry is fetched on a press), and what is new or gone since last time.
  One ping per address and two fixed ports for those that ignore it, 20 probes a
  second; no port scanning or probing of services. Names and notes of your own;
  migration 0016.
- Devices on this network: `OUTPOST_NETWORK_SCAN_LOCAL_ONLY=true` lets only the
  computer Outpost runs on start a scan. Off by default, so nothing changes unless an
  administrator sets it.

#### Deployment

- A Dockerfile for `linux/amd64` and `linux/arm64`, and a Compose stack that builds the
  image locally (`outpost:local`) and runs it with a kiwix-serve sidecar.
- A packaged app that runs with only a Node binary.
- Two scripts for a Raspberry Pi in `deploy/pi/`: `install.sh` checks for a 64-bit
  Raspberry Pi OS, can install Docker (`--install-docker`), share Outpost with the
  network (`--lan`) and publish the HTTPS port (`--https`), then builds and starts the
  stack; `hotspot.sh` gives the Pi a Wi-Fi network of its own, to be carried somewhere
  with no router. **Neither has been run on a Raspberry Pi**: they were checked only
  for syntax and with `--dry-run` on a Mac. See
  [docs/deployment.md](docs/deployment.md#from-a-mac-to-a-raspberry-pi-step-by-step).
- Checks to run locally: lint, type checking, server and web tests, catalogue
  validation, and browser tests against the packaged app with the internet blocked.

#### Tools: calculators

- Five screens of calculators under Tools: Water, Outdoors, Radio calculators, Building
  and Cooking (`docs/tools.md` lists every one with its formula, source, range and
  limits). Each input has its unit beside it, remembered on the device with the last
  figure typed; the answer appears as you type, in figures and in a sentence; a figure
  that cannot be used is said to be, in words; and "How this is worked out" gives the
  formula, its source with the date it was read, the range it holds for and what it
  leaves out. **Copy** and **Save as a page** keep an answer.
- Water: water to store by the UK Government's, the CDC's, FEMA's or the WHO's figure,
  with every body's figure listed beside the answer; rain from a roof; filter life from
  the filter's own label; and making water safe to drink, quoted from the CDC, the EPA,
  the WHO and the Drinking Water Inspectorate, with the EPA's and the CDC's bleach tables
  exactly as published and a sheet to print.
- Outdoors: Naismith's rule with Langmuir's and Tranter's corrections, gradient,
  distance and bearing between positions in any format the map reads, the sun's day, the
  wind chill and heat index by the weather services' formulas (refused outside their
  ranges), and water and food for a walk as ranges from the UK MoD and the Compendium of
  Physical Activities.
- Radio: antenna lengths with an adjustable factor, free-space path loss, the
  smooth-earth radio horizon (linking to the map's line of sight over terrain), cable
  loss from makers' published figures, watts, dBm and S-units on both S9 conventions, and
  battery life on a duty cycle. The radio calculators draw the antenna and the radio
  horizon.
- Building: concrete and mortar by Hanson's published mixes, area and volume, roof pitch,
  a cutting list (first fit decreasing, said not to be optimal), U-values by BS EN ISO
  6946's simple sum and heat loss, both said to be estimates, and sheets and fixings.
- Cooking: the FSA's roasting times with the check that matters (75 °C in the thickest
  part), the FSA's safe temperatures as a sheet to print, a timer that can be started
  from a roasting time, boiling at altitude, weights and measures, gas marks and scaling
  a recipe.
- A small kit (`apps/web/src/features/tools/kit/`) that these calculators share and
  others can use.
#### Tidy-ups

- The README lists every feature with its docs page, the ways to install, what needs a
  download first, and the limits; its pictures are made again from demonstration data by
  `e2e/readme/screenshots.spec.ts` (`readme-screenshots.config.ts`), and
  `scripts/check-readme-links.mjs` checks its relative links and anchors.
- A model's reply stops at the piece where its reader stopped, even when several pieces
  arrived in one read.
- A file that did not decrypt no longer leaves the Encryption screen showing it being
  decrypted, with its button busy, for good (seen on a busy machine).
- Chat no longer takes someone who has scrolled up back down when a piece of the reply
  is drawn before the browser has said they scrolled.
- A backup is not listed until its check has finished; it was shown as "Not verified"
  while it was being checked.
- A prediction's basis sentence, which is kept and printed, is dated and no longer says
  "(today)"; the screen says how old the table is.
- A map page made twice the same day is one document in the library.
- `formatDuration` says "1 second", and never "60 seconds".
- At a plain http address, every "Keep" action says it needs HTTPS and opens Settings,
  "HTTPS on your network"; the repeaters screen's location message names it too.
- On a phone: the shared dialog's Close and the segmented control are 44 px; a dialog
  whose header and footer outgrow the screen scrolls as a whole; HF coverage, plans,
  Offline maps, the Sun tab and drawing a route fit 320 px with the text at 150%.
- Tests: those that failed only on a busy machine wait on what they wait for, or do
  less (see the commits); server tests remove the folders they make, and a run fails
  if one is left; an end-to-end test presses each secure-page-only action at a plain
  http address.

#### Fixes from a review (ten faults)

- CSV imports read numbers by the file's own decimal mark, the same in every numeric
  column: a semicolon file's `1,5` litres is one and a half, not fifteen; `1.234,5` and
  `1,234.5` are read as one number; a cell the file does not settle is refused with both
  readings. The supplies preview says how each number that was not plain was read. The
  same rule reads the barometer's CSV and country figures.
- Answers and chat decline only when the first sentence says the passages, sources,
  documents or library do not hold the answer, or the model says it could not find it;
  a cited instruction that uses "cannot" or "not available" keeps its citations.
- A reference query's answer is written through `pipeline()`: a full or unplugged drive
  fails the download with a message instead of ending the process. The same kind of
  unhandled stream error is closed in the reference CSV reader, the tar extractor and
  the semantic index export.
- "Reclaim unused space" waits up to 30 seconds for changes under way (an upload, a
  reply being written) and otherwise stops with the reason; every write on any path,
  `/dav/` included, is refused while it runs; a write that meets the lock is a `409`.
- A refused reference import leaves nothing on the drive.
- A device's announcement can no longer make Outpost look up a name of its choosing
  through DNS: only `.local` names, by multicast DNS, and only inside the network looked
  at. File servers offered under Network shares are limited to `.local` names.
- A weather place removed during an update keeps nothing; orphan copies are cleared at
  start-up.
- `GET /api/reference/templates/constructor` is a `404`, not a `500`; names from
  devices, imports and OpenStreetMap are looked up only among a table's own keys.
- An estimate for no country and no box is refused unless the source covers the world.
- More kinds of container are recognised (Podman, Kubernetes, systemd-nspawn, LXC), the
  own-address rule can be turned off with `OUTPOST_OWN_ADDRESS_IS_LOCAL=false`, and
  Settings and Storage say which rule made them take a device for this computer.

#### A power plan chooses where its panels are

- A plan's solar section now has a choice of place: every place on Weather and hazards
  (saying whether sun figures are held), saved places not in that list yet, and a
  position typed in. Where none are held for the place, **Fetch sun hours for** it asks
  PVGIS on a press, through the weather module's own route, after saying what is sent;
  the place joins the weather list and the copy is kept there. Before, the plan could
  only use figures already fetched on the other screen, and offered no choice at all
  when one place had them.

#### Messages: the household board

- **Messages**, a board for one household on the home network, with no extra hardware
  and no internet: short messages for everyone; check-ins ("I'm safe, gone to Mum's"),
  with each person's latest at the top and, if ticked, the device's position (on a
  secure page only); and files sent from one device for another to save. A person is a
  name chosen once on each device; there are no accounts, and anyone on the network can
  post under any name, read everything, and change or remove any message. A removed
  message keeps a line saying who removed it. No push notifications: it does not wake
  a locked phone. See [docs/messages.md](docs/messages.md).
- Home says "N new on the board" when there is something new. **Settings → Message
  board** sets how long sent files are kept (7 days by default).
- The board is counted under Storage and Manage and clean up, can be emptied from the
  leftovers, is erased with everything else, and goes into backups with its files; it
  does not go on a portable drive. A message changed on another device after this one
  opened it is not overwritten. Migration `0028_board`.

#### Mesh radio (Messages)

- **Not yet tried with a real radio.** The household board can reach beyond the Wi-Fi
  through a LoRa radio running Meshtastic or MeshCore firmware. Meshtastic connects by
  MQTT in JSON mode, with Outpost as the broker or through a broker the household
  already runs; MeshCore by USB cable or its network port. A radio channel is a channel
  of the board, shown beside **Home** on Messages; nothing is relayed between Home and a
  radio channel by itself. Set up under **Settings → Mesh radio**, and only from the
  computer Outpost runs on; off until then, with no listener, timer or open device.
  Built from the projects' published documentation and tested against stand-ins (for
  MeshCore by USB cable, only the device list and the port settings were tested, not
  opening a device). A default public channel can be read by anyone
  with a radio in range, and the screen says so. See
  [docs/mesh-radio.md](docs/mesh-radio.md).

#### Audiobooks (Library)

- **Audiobooks**: add a zip or audio files and they become one book with its chapters in
  order, kept on the server and played in the browser from it, with speed, 30-second
  skips, controls on the lock screen where the browser offers them, and the place
  reached kept on each device. Found by title in search and listed under Library →
  Documents and Collections. See [docs/library.md](docs/library.md#audiobooks).
- **Explore → Audiobooks**: a shelf of 15 public-domain LibriVox recordings, as links to
  download in your own browser and then add. Outpost never fetches a recording; LibriVox
  says its recordings are public domain in the USA and asks people elsewhere to check
  their own country's law.

#### Learning progress (Library)

- **Learning progress**: the reader records where each learner got to in a reference
  archive (Khan Academy, PhET and others): pages opened, time on screen while the tab is
  visible, and pages done. The reader's bar has a learner switch ("Who is learning?")
  and **Done**; a video played through counts as watched. A learner is a name chosen on
  the device, with no password; nothing is recorded on a device until someone is chosen
  there. Progress is kept under the archive's name without its date, so it carries on
  through an update. Not tried with the real Khan Academy archive or any real course
  archive. See [docs/learning.md](docs/learning.md).
- **Library → Learning** lists each learner's courses, pages done and time this week,
  and can be printed. A collection's page offers "Carry on where Sam left off".
- Learning progress can be removed per learner under Manage and clean up. It is erased
  with everything else, and kept in backups and on portable drives. It is not put in
  search and never sent to a model server. Migration `0029_learning_progress`.

#### Catalogue additions

- Explore lists eight CDC health and safety sheets (making water safe, food after a
  power cut, wound care, diarrhoea, heat illness, generator carbon monoxide,
  handwashing, water treatment outdoors) and seven FEMA guides (the planning guidance
  for response to a nuclear detonation, the P-320 safe room guide and the five *Protect
  Your Property* brochures), each fetched from the agency's own site with a pinned
  checksum. Both sites had refused Outpost's client on the two days before and answered
  it on 17 November; `docs/sources.md` quotes their reuse statements, with what was left
  out and why.
- The NIOSH Pocket Guide to Chemical Hazards (publication 2005-149, third printing),
  public domain, from cdc.gov.
- 66 more publications from their publishers, for days, months and years without a
  connection: UK household emergency plans (Be Ready, Ready Scotland, nidirect), cold,
  heat, flood, fire and gas guidance, more of Ready.gov and the CDC; the rest of the US
  Department of Energy's fundamentals handbooks; hand-tool and trail manuals from the US
  Forest Service; soil, seed and poultry manuals; repairing old buildings (the National
  Park Service's Preservation Briefs); the ICRC's *War Surgery*; fifteen more OpenStax
  textbooks and two NASA histories. `docs/sources.md` records each, and what was looked
  at and left out, and why.
- 18 more Kiwix archives: eight Project Gutenberg literature and humanities shelves,
  Wikiquote, Book Dash picture books, Mutopia sheet music and seven Stack Exchange
  sites. They were kept by the owner's decision after Kiwix's `robots.txt` was found to
  disallow every client: Outpost goes on fetching Kiwix's feed and a file only when a
  person presses Download, as Kiwix's own readers do, and the catalogue's online check
  now leaves Kiwix's hosts alone (see [For contributors](#for-contributors)). See
  [docs/sources.md](docs/sources.md#kiwixs-robotstxt-read-on-2026-11-17).
- Five new packs, "A few days without power", "If it goes on for months", "Rebuilding",
  "Something good to read" and "For children", making 22; "First things" now opens with
  the UK household emergency plan. A new category, "Literature and reading".

#### Help: the guides in the app

- **Help** in the sidebar: every page of Outpost's documentation inside the app, grouped
  for a household and readable with no internet. The quick search finds each guide and
  its sections.
- The installation guide walks from a Mac to a Raspberry Pi step by step, says what has
  and has not been tried, and covers moving a library across. Troubleshooting covers
  each message the Raspberry Pi scripts stop with.
- **Which model**: a guide comparing seven models measured on a Mac (an Apple M2 Max
  with Ollama), for answers from the library and for looking things up: `llama3.2:1b`,
  `lfm3:1.7b`, `bonsai-2:2b`, `llama3.2:3b`, `bonsai-2:4b`, `bonsai-2:9b` and
  `ornith:9b`, each with its download, memory, licence, results and times. None was
  timed on a Raspberry Pi. Written from one data file
  (`packages/shared/src/model-trials.ts`); see [docs/which-model.md](docs/which-model.md).

#### Chat: tools a model can use, and MCP

- **Looking things up in Outpost**: Chat can let a model read places and map layers,
  supplies, emergency plans, the weather as last fetched, the sun and compass, radio,
  the catalogue and the library, and answer from what Outpost holds, saying where each
  fact came from. The tools only read: none changes anything, starts a download or asks
  the internet, and a test runs every tool and fails if one does. Off by default
  (**Settings → Looking things up in Outpost**), switchable by area; the message board's
  area is off until turned on, and contacts, keys, encrypted pages and the board's files
  are never readable. When tools are on, Chat suggests a model measured to look things
  up well. Tried by script with the seven models of Which model; see
  [docs/ai.md](docs/ai.md#looking-things-up-in-outpost).
- **An MCP endpoint**, `/mcp`, serving the same tools under the same switches to other
  programs on the home network that speak the Model Context Protocol. Off by default,
  and switched on only at the computer Outpost runs on (see [Security](#security-1)).
  Not tried with a real MCP client. See [docs/mcp.md](docs/mcp.md).

#### Maps: place names and postcodes for Great Britain

- Place names, roads and postcodes for Great Britain from Ordnance Survey's OS Open
  Names (Open Government Licence), downloaded on a press from the Offline tab and
  updated whole when OS publishes a new edition. The map and the search list credit
  Ordnance Survey.
- The map's search finds a postcode however it is typed, offers the district or sector
  for a partial one, and says Northern Ireland is not covered. Exact names come first,
  then places before roads, then nearness; each result says what it is and where.

#### Maps: heights

- The map's readout gives the height of the ground under the pointer, following it as
  it moves, or at the centre of the map while the mouse is elsewhere and when opened
  on a phone, from installed terrain. `GET /api/maps/height`. It first showed only
  once the pointer had been held still for a quarter of a second, which on the first
  real device read as no height at all; heights are now asked for at a steady pace (at
  most ten a second, one at a time) and the last figure stays until the next arrives.
- **Settings → Appearance → Heights**: metres or feet for every height on the map
  screens, kept in the browser.

#### Food and supplies (Maps)

- **Maps → Layers → Food and supplies**: shops, markets, food banks, drinking water,
  fuel and pharmacies from OpenStreetMap, fetched for the area on screen up to about a
  county, each kind with its own mark and switch. In the UK the Food Standards Agency's
  registered food shops can be added to the same layer; a shop in both is shown once.
- The nearest of each kind to home or the middle of the map, with distance (in
  kilometres and miles) and bearing, worked out offline. `GET /api/reference/nearest`.
- **For a whole region**: a US state, a German Land, an English county or any region
  Geofabrik publishes, chosen by name, with the size and what will be shown first; one
  download fills the other OpenStreetMap layers too. The region's extract is deleted
  once read unless you keep it; only the places stay. See
  [docs/reference-layers.md](docs/reference-layers.md#food-and-supplies).

#### Airport frequencies (Reference layers)

- Downloading or updating the airports layer also fetches OurAirports'
  `airport-frequencies.csv` (about 1.3 MB, public domain), and each airport's card lists
  its radio frequencies in MHz, tower and information services first, marked not for
  navigation or flight planning. About five rows show on a phone, and the card folds.
- An airports pack whose frequencies could not be fetched still installs and says why
  under Reference data for the map; a pack from before says on each card that
  frequencies are not held until it is updated.

#### Repeaters: estimated range

- An **Estimated range** switch on a repeater's map card (and a button on the repeater's
  own screen) draws where its aerial is in line of sight over installed terrain, for a
  handheld, a car or a roof aerial, out to 100 km, on 72 bearings. It is an estimate of
  line of sight only, says its heights and what it leaves out, and is off until switched
  on. With no terrain it is the smooth-Earth radio horizon, a dashed circle, and says
  so; where terrain covers only part of the area it says so and dashes the edge where
  terrain ran out. On a phone the card folds so the outline has room.
  `GET /api/maps/sight-range`. See [docs/radio.md](docs/radio.md).

#### River and sea levels (Preparedness)

- **Weather and hazards → River and sea levels**: the Environment Agency's stations near
  a place, fetched on a press, each with its latest level, when it was measured, its
  datum, where it sits in the Agency's typical range and whether it is rising, steady or
  falling, in three short lines. England only, and the screen says so.
- A station's own view: its last three days as a chart with its typical range and
  highest on record, and as a table.
- The Flood view now holds flood warnings only, and links to River and sea levels. See
  [docs/weather.md](docs/weather.md#river-and-sea-levels).

#### Tools: Compass

- **Tools → Compass**: magnetic north from NOAA's World Magnetic Model 2025 (valid to
  the end of 2029), grid north on the National Grid, and what to add or subtract going
  between map and compass at a place, worked out with no internet; with a drawing of
  the three norths and of a bearing from map to compass, and a bearing converted
  between the three.
- A live compass on phones at an HTTPS address, corrected to true or grid north. Not
  tried on a real phone.
- The map's centre card gives magnetic north at the centre and opens the Compass for
  that point. See [docs/tools-compass.md](docs/tools-compass.md).

#### For contributors

- `e2e/tools/idle-cost.mjs` measures what a screen costs while nobody is touching it:
  the processor time of the page and the server, and what keeps them awake.
- The catalogue's online check takes `--skip-host <host>` to leave a host unasked, and
  leaves Kiwix's hosts alone unless `--include-kiwix` is given.
- `apps/web/src/lib/one-product.test.ts` fails when a screen goes its own way on the
  rules written in `docs/development/web-screens.md` (dialog buttons, back links, names,
  separators, empty states, sections, icons).
- `apps/server/test/eval/tools-eval.ts` asks real models sixteen questions that need
  the tools, and `scripts/write-which-model.mjs` writes `docs/which-model.md` from the
  figures.

### Raspberry Pi, first run on real hardware

- `deploy/pi/install.sh` was run on a Raspberry Pi 5 (Raspberry Pi OS, Debian 12) on
  17 November 2026 and built and started Outpost in about three minutes. What that
  showed, and what changed:
  - A Pi can have two Dockers, the system's and a rootless one of the user's, and the
    script used whichever plain `docker` meant without saying so. It now says when that
    is the rootless one, and `--sudo` uses the system's.
  - Raspberry Pi OS starts with memory limits switched off, so Docker does not apply the
    limits in `compose.yaml`. The script says so, and the deployment page says what the
    message means.
  - The addresses printed at the end no longer include Docker's own networks, and an
    address on Tailscale is labelled as that.
- `deploy/pi/nas-share.sh`, new: connects one folder of an SMB share on a NAS to Outpost
  in Docker. The password is asked for at the keyboard and kept in a file only root can
  read; the folder is mounted by the system when first used; both containers are given
  it in a way that survives the share being mounted after they start. Tried against a
  Synology NAS.
- [docs/deployment.md](docs/deployment.md), [docs/storage.md](docs/storage.md) and
  [docs/troubleshooting.md](docs/troubleshooting.md) say what was tried on the Pi and
  what was not, in place of "never run on a Pi".

### Changed

- **Outpost at rest costs close to nothing.** With nobody using it, the server sets no
  timer on a fixed tick except a few checks of things outside it. The job queue no
  longer asks the database every two seconds; it sets a timer only for a job told to
  wait. Open live-event streams share one 50-second keep-alive that stops with the last
  of them. Storage checks no longer tell every open screen that free space moved, and a
  missing drive is looked for every ten minutes, or at once with **Check drives**.
  Automatic backups sleep until one is due; HTTPS looks again every five minutes while
  all is well; network shares are looked for again only while a storage location is
  away. See [docs/architecture.md](docs/architecture.md).
- **A tab in the background asks the server for nothing.** A hidden tab notes what
  changed and fetches it when shown, and closes its live-events stream after a minute;
  screens following work on the server ask only while live events cannot arrive and the
  page is shown. With the server out of reach, the app no longer asks whether it is back
  while it is in the background.
- **Screens at rest do no work**:
  - Games: no timers or requests at rest or while hidden; the allotment redraws only
    when something changes; Draughts ends its worker after each reply and does not think
    in a hidden tab; saves are batched and skipped when nothing changed.
  - Maps: a map at rest no longer fetches its tiles again every hour; the contour worker
    ends when idle; a recording does no drawing or ticking while the page is hidden, and
    redraws its line every five seconds.
  - Morse trainer: the sound sleeps between tones and when the page is hidden; the
    automatic keyers no longer redraw every frame while Send or On the air is open.
  - Chat and answers draw nothing while the page is hidden; the server formats a chat
    reply only while someone watches.
  - The kitchen timer wakes the page only while it counts on screen; the solar clock's
    Now tab reads the clock once a minute and not while hidden; Downloads does nothing
    in a background tab; the Supplies camera stops when the page is hidden.
  - Contacts no longer asks for the system summary every 15 seconds; Import no longer
    asks every 3 seconds while live events arrive, and its list of imports no longer
    reads every plan (30 imports of 5,000 pages: 6.3 ms a request instead of 115); the
    set-up guide no longer polls.
  - Finding a conversation by name and making the QR codes' printable sheet wait for
    typing to pause; typing in Frequencies to listen to redraws only the rows that
    change.
- **Less to download.** The app's files are compressed when it is built, and the server
  sends them as they are: the first load is 262 kB (gzip), where 1.1 MB was sent
  uncompressed. JSON answers over 1 kB are compressed as they are sent (the catalogue
  goes as 57 kB instead of 420 kB). The map's icons and fonts are cached by browsers, map
  tiles are checked with `ETag` and answered `304` when unchanged, and an empty tile is
  no longer cached for an hour. Parts are loaded when first used: the Supplies barcode
  scanner, the Morse trainer's Send, QSO practice and On the air, the HTTPS steps in
  Settings and the Offline maps tab. The notes lists no longer load the editor, and a
  tab no longer fetches back a page it has just saved.
- **Faults.** A screen that fails says so and offers **Reload** and **Home**, keeping the
  sidebar; before, the window went blank. A fault nothing else caught is logged; an
  uncaught exception stops the server in order, to be started again by Docker or
  whatever supervises it.
- **A change saved elsewhere is not overwritten.** Power plans and a person's own
  devices, communication plans, emergency plans and nuclear scenario sets refuse a save
  made from an older copy and offer to keep yours or take theirs. Notes: a draft kept
  after a reload says when the page has been saved since, and asks before replacing the
  newer version. Two tabs on one game follow each other. Power plans save at once when
  the page is hidden or closed, one save at a time; a household may keep at most 500.
- **Finding your way.** The sidebar keeps Downloads, Storage and Settings in view; Maps
  and Notes come with Library, and the phone's More sheet is grouped like the sidebar.
  Child screens lead back to their parent, and one name is used for each thing ("Bring
  back changes from a drive"; "Save as a page", not "note"). Settings lists its sections
  at the top. Home names the emergency plan and how long food and water last.
- **Quick search** finds screens, and each section of Settings, by everyday words
  (Tools and Preparedness screens by common words, Solitaire by "patience"), with whole
  words first; it lists the keyboard shortcuts. Search puts what is on this device
  before what would have to be downloaded, and offers the screens that match.
- **One way everywhere**: toasts have one look, stay clear of the bottom bar and can be
  hidden; one separator, one date format, one empty state and one way to move between
  sections; forms say "optional" in words; dialogs give focus back to what opened them;
  error notices are read out at once by screen readers; control outlines and
  placeholders meet contrast guidelines in both themes. On the contact log the empty
  log has its own buttons, and the Repeaters screen's main button goes last.
- **Saying before the press.** Manage and Settings say what another device may not do
  before it is tried. Restoring a backup, and removing a location or an item, say what
  will happen and whether it can be undone; the restore dialog lists what changes, and
  its button is **Restore after restart**. An import says what will be made,
  overwritten and left alone, and screen readers hear its stage, not every page. PDF
  choices say what each does, and map PDFs are named for place, scale and day.
- **Text size, and phones.** **Settings → Appearance → Text size**. Large text fits every
  top-level screen; the radio screens fit a phone at 150% and 200%, and the Downloads
  charts and Settings hold at 200%. Tabs wrap and are 44 px on phones (the HF planner's
  a thumb high); the bottom bar's labels are 12.5 px; the document page's header buttons
  are 44 px; the PDF reader's page steps go into a menu. The map panel's five tabs fit
  one line on an iPhone ("Offline maps" is written "Offline"), and a card's buttons
  (Pause, Stop, Preview the page) stay in view. Saving a place: the hint goes on a tap,
  the form stays above the keyboard and the place stays in view; touch screens say
  "tap". Notes on a phone keep Undo, Redo and Add a block in sight, selecting text no
  longer covers the phone's own menu, and tick boxes, callout icons and toggle arrows
  are finger-sized. Save a web page brings its result into view. Contacts: long names
  and tag filters wrap, and opening a contact from the keyboard moves focus to it. The
  Morse trainer shows no keyboard keys on a phone.
- **Library and Explore.** Explore starts with encyclopedias, medicine and maps, shows a
  few of each category and long lists a page at a time (on a phone, 1,713 elements
  instead of 5,689), keeps its filter in the address, and its catalogue is put together
  faster. Downloads history, places and routes show fifty at a time. The reference
  reader offers **Try again** when a collection cannot be read, says plainly when an
  archive lacks a file, takes the page's main heading as its title, and follows **Add
  all** by live events instead of asking.
- **Radio.** The HF planner's answer comes first, in local time beside UTC: it opens
  with the share of days a contact is predicted to get through, and explains the MUF.
  Repeaters, the HF planner and HF coverage start from your home place. Communication
  plans give their best figure as a share "of days", on screen, in the PDF and in
  Markdown. The Repeaters screen says its lists are kept in Outpost.
- **Storage and backups.** Storage counts each file once, and Home, Library and Storage
  give the same counts; its legend says "Books and other files". Storage → Database
  speaks plainly, with the technical detail behind a disclosure, and counts lists of
  repeaters, weather places, PGP keys and reference records. Storage shows which location
  holds the automatic backups. Settings says a backup was made, its name and size, where
  it went and what is not in it.
- **Maps.** The map offers your own area first, and says before the press that a
  region's size needs a connection. A reference-layer estimate over half an hour old is
  refused, and an import with no publisher is credited by name.
- **Notes, imports and encryption.** Long code lines scroll inside their block, as in the
  library. Notes home keeps titles readable at large text and has Trash and All
  templates on the page. Over plain http, the Encryption screen says first, in a shorter
  notice above the tabs, what does not work.
- **Supplies and tools.** Supplies counts items and says when no water is stored, and
  CSV figures that cannot be right are refused row by row. Path loss refuses distances
  under a wavelength, and its power is optional. The kitchen timer shows the time it will
  count from. Weight and Volume keep their From unit; walking and battery times are
  rounded to what their figures support.
- **Games.** Peg solitaire and Draughts count time only while the board is in view; the
  Sudoku board is wider; the allotment's cards say each thing once.
- The model to start with is now `lfm3:1.7b`, the best all round of the seven measured:
  the set-up steps, Settings, Chat and the guide all follow, and it fits a computer with
  4 GB of memory. `llama3.2:3b` stays on the list as the most reliable on answers from
  the library.
- Frequencies to listen to: the shortwave schedules of Radio Romania International and
  Radio Exterior de España were removed, with every mention of them in the shortwave
  guide. Their sites allow personal use only, and Outpost is published for anyone to
  copy. See [docs/sources.md](docs/sources.md).
- Estimated range on the map is now chosen repeater by repeater: each outline stays after
  its card closes, labelled with its callsign, up to eight at once, with "Hide all
  ranges" in the card. The folded card says the furthest reach as well as the usual one.

### Fixed

- Search counts every match, so every page of results can be reached.
- Importing search-by-meaning vectors of the wrong size for a model is refused.
- A screen opened on a phone from a scrolled list starts at its top.
- Erasing everything on a portable drive no longer lets a later merge remove things at
  home.
- A backup the computer slept through is made soon after it wakes, not hours later. A
  saved backup is recorded once, and the server no longer writes to a closed database
  when it shuts down.
- Free space is brought up to date once it moves 256 MiB, whatever the disk's size.
- Network shares are looked for again while any storage location is away; a share whose
  mount stayed listed after its server had gone was not looked for again.
- Manage and clean up no longer counts a download that is still arriving as left over.
  Downloads no longer says nothing was downloaded beside a Library with collections.
- The "Add all to library" count moves while the job runs again.
- Reloading a page of an archive in the reader, or opening a link to one, no longer
  answers 404 when the page's own name ends in `.html`.
- Updating a sheet included with Outpost from its collection page goes to the new
  edition. A map's attribution reads as words on its collection page.
- Updating an OpenStreetMap reference pack twice in one day no longer fails, and an
  OurAirports update made on the same day as the last download is no longer refused.
- Notes: "Try again" opens the page once the connection is back. Import: "Replace"
  leaves a page that has been encrypted since as it is.
- The power screens no longer say "changed somewhere else" when the database was only
  busy.
- Emergency plans: typed numbers are no longer silently lost, and a copy shows its own
  last-opened time.
- Supplies: hidden form fields no longer block saving; "Use one of", not "one one of".
- The barometer's CSV preview lists how each number not written plainly was read, and a
  height with a decimal comma is read.
- A wind from 360° is read as north in the nuclear simulator.
- Water's filter life no longer breaks the screen on very large figures, and storage
  gives both ends of a range in UK gallons. The sun calculator's "today" follows this
  device's date.
- Maps: the Sun tab and the sun line move on to the new day at midnight. Find a route:
  long server names wrap, so Search stays inside the panel.
- The HF planner's charts no longer spill sideways for a moment on a phone.
- Allotment: a bed's time label no longer covers its plants.
- The set-up guide's page in the repository keeps multi-line commands inside their
  steps.
- Mesh radio: a radio can no longer rename another, and one message on a very long
  topic no longer wipes what was learnt from the radios.
- An M4A or M4B made of thousands of tiny parts no longer holds up reading its tags.
- A long file name in Japanese, or made of emoji, is shortened instead of failing to
  save.
- Explore: the filter box's hint is no longer cut short on a narrow window.
- A repeater's card on a wide screen no longer hides its first line under its title while
  its range is on.

### Security

- **A symbolic link in a storage root no longer opens the whole disk to the network.**
  Whether a folder is inside the storage roots is now decided twice: as it is written,
  and again with every symbolic link in it followed. On a Mac the default root is
  `/Volumes`, where `/Volumes/Macintosh HD` is a link to `/`; checked by spelling alone,
  that let any device on the network list every folder on the computer and make a
  storage location in a person's home folder. The same test decides the folders the
  storage screen lists, a new location, each location's check at start-up, where a
  portable drive is made and which drive is read back home. A link inside a storage
  location is still followed; [docs/security.md](docs/security.md#paths) says why.
- **Erasing everything clears the words of what was erased from the search index's own
  storage.** The keyword index's storage is rebuilt before the database file is
  compacted, so nothing erased is left readable in the file.
- **Another device can no longer delete several of a person's own files in one step**
  (documents they uploaded, archives Outpost was pointed at): that is held to the rule
  for erasing everything and refused with `403`; they can be removed one at a time, or
  forgotten with their files kept. Downloaded content can still be removed in bulk from
  anywhere.
- **Another device can no longer write over the person's own HTTPS certificate and
  key.** Giving a new pair while one is already in `tls/own` deletes the old key as
  surely as deleting it does, and so follows the same rule as deleting Outpost's own
  authority.
- **The reader frames an archive's pages at a secret address of its own**, where a page
  may read its own archive's files. Archives whose page is a small web app (most
  collections of videos) showed an empty page, because a sandboxed page's requests for
  its own scripts, fonts and data count as coming from another site. Allowing that at
  the plain address would have let a page on any site read the library through a
  sandboxed frame of its own, so pages are framed under `/kiwix/<word>/content/…`, where
  the word is 32 random characters made once for the installation (`reader-token` in the
  data folder) and given only to Outpost's own screens; only there, and only to a
  request with `Origin: null`, may the answer be read. An archive's own scripts can see
  the word, so a hostile archive could send it out and let others read the downloaded
  archives (not notes, contacts or anything behind the API); removing `reader-token`
  and restarting makes a new one. The script the reader adds gives such a page stand-ins
  for the cookies and browser storage a sandbox refuses. The sandbox itself is
  unchanged: no `allow-same-origin`, no referrer. Checked in Chromium only.
- **Quick search failing to load no longer blanks the app.** Quick search that cannot be
  fetched (an old tab after an update, a dropped connection) was outside the screens'
  error boundary and left a blank window; it now says so and is fetched afresh at the
  next press. Letters typed while it loads are not taken as shortcuts.
- **Importing a search-by-meaning file refuses a line over 1 MB.** The import kept
  everything after the last line break in one string and searched it again with every
  piece, so a gzip file of a few kilobytes that unpacked to one endless line held the
  server's memory and processor for minutes. A real export's longest line is about
  44,000 characters.
- **The MCP endpoint can only be switched on at the computer Outpost runs on.** `/mcp`
  is off by default; its switch is kept outside the ordinary settings, changed only by a
  request from the computer itself, and turned off by erasing everything or putting the
  settings back to their defaults. With it on, any program on the home network that
  speaks MCP can read what the tools read, and whatever that program is connected to
  receives the answers; the switch says so. Being outside `/api/`, it has rules of its
  own: a page on another site cannot call it, an address outside the home network or a
  forwarded request is refused, and each address has an allowance. There are no tokens.
  See [docs/security.md](docs/security.md#the-mcp-endpoint).
- The mesh radio link is set up only from the computer Outpost runs on; its passwords
  are kept outside the database, and a broker connection from outside the home network
  is closed before anything is read. See
  [docs/security.md](docs/security.md#the-mesh-radio-link).

- **A restored backup or a portable drive no longer carries the mesh radio set-up or the
  MCP switch to another machine.** A restored server had connected, on its next start,
  to the broker the backup named. A restore now keeps this computer's own set-up, and a
  drive leaves both out.
- The MQTT broker stops checking passwords from an address after five wrong ones in a
  minute, and lets one address hold at most two connections that have not signed in.
  Each wrong password had cost the server about 27 ms of its only thread.
- A page in the reader can no longer fill the disk through learning progress: the reader
  passes on a list of links only for the page on show, and the server keeps at most
  2,000 lists for an archive, each of at most 64 kB.
- A download stops as soon as more arrives than its server's stated length, or, with no
  length, than the size it was offered at plus a tenth and 1 MB.
- **A NAS that is switched off no longer stops the map.** The regular check of each
  storage location asked a share in a way that held up the whole server while the share
  did not answer: 10 to 25 seconds at a time, map included. The check now waits
  elsewhere, gives a location 5 seconds before calling it not connected, and never
  piles up. File work has 16 threads, not 4. Measured on the Pi with the NAS cut off:
  health within 21 ms and map tiles within 70 ms throughout. A reference page on a
  location that is away says so, and Home names the location.
- Map layers are their own kind on Manage and clean up and Storage, not "Radio data", so
  the map's own files can be moved together. The layers' summary is kept until they
  change (it took about 5 s on the Pi on every opening of the map).
- **What is written to storage is read back.** As a download arrives, Outpost keeps a
  checksum of each megabyte it hands to the storage, and when the file is checked holds
  what the storage gives back against it, for every download, published checksum or
  not. A part that differs is fetched again from there on, by itself, and the
  download's history says the storage lost it; three times in one download and the
  storage is named as the fault. Added after a NAS share lost a 4 KiB block of a
  2.3 GB file without a word. See [docs/storage.md](docs/storage.md#what-is-written-is-read-back).
- A Geofabrik extract is read only when its MD5 was published with it, and Ordnance
  Survey's answers about its downloads are read up to 1 MB. The downloader itself
  holds the file to that MD5, in the same reading as its SHA-256: the download's page
  shows the published MD5 and the file's (it said "No checksum published" and then
  failed on one), and a file that fails is deleted, so that **Retry** fetches it again
  (it checked the same damaged file again). Found on the first Raspberry Pi, where a
  2.3 GB extract written to a NAS share arrived the right size with one 4 KiB block of
  zeros in it.
- The MCP endpoint compares the whole origin of a request, scheme and port included.
- A test fails when the server asks a host that [docs/security.md](docs/security.md) and
  [docs/offline.md](docs/offline.md) do not both name.

### Who is told what is asking

- **Wikidata is asked, once the person agrees.** Its query service requires a client
  name that says how to reach the project. A source that is sent that name (Wikidata,
  and OpenStreetMap by Overpass) now shows it word for word in "Get reference data",
  with what it does and does not reveal, and "Show the size" stays off until "Send this
  name to …" is ticked. The server refuses an estimate for such a source without the
  agreement, and an update of an installed pack waits for it too. Before, Wikidata was
  switched off altogether and the Overpass source sent the name without saying so.
- **Finding a known route** shows the same name beside the server a search goes to.
- **Repeater lists are fetched under the plain name** every other download uses,
  "Outpost (self-hosted offline library)", with no version and no project address.
- The name has one home, `core/client-name.ts`, and the version one, `core/version.ts`.

## Known limitations

These are deliberate or known, and are explained in
[docs/architecture.md](docs/architecture.md#limits-and-trade-offs).

- **Scale.** One node and one writer (SQLite). Suited to a household or a classroom.
- **Semantic search** uses a flat index, comfortable to roughly 100,000 passages.
- **The built-in embedding model** is small and English: other languages are matched
  poorly, and it has not been run on a Raspberry Pi or on Windows. A local embedding
  server can be used instead.
- **OCR** is slow and makes mistakes, reads only pictures of pages (not text drawn as
  shapes), and has English only unless a language file is added by hand.
- **No language model is included.** Answers and Chat need a model server you run
  yourself. They read documents, notes and book chapters only (reference collections
  are not read). They have been run on Ollama on one Mac only: answers with seven
  models (`llama3.2:3b` and `llama3.2:1b` through Chat by hand as well), and looking
  things up with the same seven, by script and judged by rule. llama.cpp, LM Studio and
  a Raspberry Pi have not been tried, and no model has been timed on a Pi. The MCP
  endpoint has not been tried with a real MCP client. See
  [docs/which-model.md](docs/which-model.md).
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
  Windows and Outpost on a NAS are untried; one Raspberry Pi 5 has been set up once
  with `deploy/pi/install.sh` and `nas-share.sh`, and `hotspot.sh` has never been run on
  a Pi. Nothing builds or tests it
  automatically, and no image is published.
- **Mesh radio has not been tried with a real radio**, only with stand-ins written for
  the tests. Expect the first real radio to find something.
- **The message board has no push notifications**: it does not wake a locked phone, and
  a name on it proves nothing.
- **Learning progress has not been tried with a real course archive**, Khan Academy's
  included.
- **Not tried on a real phone**: the live compass, and much of what was measured at
  phone sizes in a desktop browser (each docs page says which).
- **An archive whose page is a small web app** has been checked in Chromium only, not
  Safari or Firefox.
- **River and sea levels are England's only**, and OS Open Names covers Great Britain,
  not Northern Ireland.
- **No accounts.** Everyone who can reach Outpost can read and change everything. There
  are no per-page or per-person permissions.
- **No encryption at rest**, apart from backups protected with a passphrase and private
  keys on the Encryption page. Use encrypted drives where that matters. HTTPS is built
  in but off until turned on in Settings; see [docs/security.md](docs/security.md).
- **The HTTP API is not versioned** and may change between releases.
