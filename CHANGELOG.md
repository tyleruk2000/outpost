# Changelog

All notable changes to Outpost are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Releases are tagged `v<major>.<minor>.<patch>`.

## [Unreleased]

Everything below is the first version of Outpost. It will be released as 0.1.0. What has
not yet been tried is listed in [docs/testing-status.md](docs/testing-status.md).

### Added

#### Foundation

- One Node 24 server (TypeScript, Fastify) serving the web app and an HTTP API from one
  SQLite database and a set of folders; migrations applied at start.
- A background job queue in the database: named queues with limits, pause, resume,
  cancel, retries with growing pauses, and jobs that survive a restart (being stopped by
  a restart does not use up one of a job's attempts).
- Live updates to the browser over one server-sent-events stream.
- An orderly stop on SIGTERM or SIGINT: stop accepting, end live streams, give requests
  three seconds, stop jobs so they resume, close the database; exit anyway after eight
  seconds, inside Docker's ten.
- A web app (React, Vite, Tailwind) with light and dark themes, a keyboard command
  palette, and layouts from phone width up.
- The 24-hour or 12-hour clock, chosen under **Settings → Appearance → Clock** and kept
  in the browser; UTC is always 24-hour.
- Every screen reachable from the navigation on any screen size, from one description
  that draws the sidebar, the phone's More sheet, the quick search and the shortcuts.
  Child screens sit indented under their parent; a test fails if a route is in no list.
- Drop-downs, menus and popovers opened inside a dialog are drawn above it.
- `THIRD-PARTY-LICENSES.txt` in the packaged app and the Docker image.

#### Contacts

- A Contacts screen: names, labelled numbers, emails, addresses, notes, tags, an
  emergency mark that lists those first, a callsign with frequencies, and links to a
  saved place and to notes.
- Found as you type by name, number, place, tag or callsign; call, text, email and copy
  in one touch; a large-type view; a printable emergency sheet of marked contacts.
- vCard import (2.1, 3.0, 4.0) from a file or the phone's picker (Chrome on Android over
  HTTPS), previewed first, with likely duplicates merged, replaced or added only when
  chosen; photos left out. Export as vCard 3.0 or 4.0.
- A read-only CardDAV address book for phones, off until turned on.
- A label such as "constructor" or "__proto__" no longer breaks listing or export.
- Contacts are in backups, search, "erase everything" and portable drives (`0007_contacts`).

#### Storage

- Storage locations on any mounted folder (internal disks, external drives, network
  shares, Docker volumes) inside storage roots set at start-up.
- Locations recognised by a marker file, so a drive is known at a new path and a
  different drive at the old path is not mistaken for it.
- Disconnected drives reported plainly; nothing is removed while a drive is away.
- Usage by kind of content, and a free-space check with a reserve before every download,
  upload and move.
- Moving a collection, all documents or a selection of documents to another location:
  copied, read back and checked against checksums before the original is deleted.
  Checking a collection against its checksum.
- **Storage → Manage and clean up**: space by kind and location; every collection and
  document in one sortable list to remove or move; leftovers cleared only when chosen;
  and three clean-ups (remove downloaded content, rebuild search data, erase everything).
- "Erase everything" needs a typed phrase, offers a backup first, and runs only on the
  computer Outpost runs on unless `OUTPOST_ALLOW_REMOTE_ERASE=true`.
- A cancelled job can report what it had done before it stopped.

#### Database

- A Database section on Storage: the SQLite file's place and size, its write-ahead log,
  free space (warning below 256 MB), what is in it, where its bytes go in seven groups,
  the layout and SQLite versions, journal mode and last backup.
- **Check the database** (quick or full integrity check) as a job, from any device.
- **Reclaim unused space** (`VACUUM`) as a job, from the computer Outpost runs on only;
  refused without room or while other work runs, and other writes wait or are refused
  while it runs.

#### Automatic backups

- Scheduled backups (daily or weekly, at a chosen time) to a storage location, off until
  one is chosen. Each is a job that writes a consistent copy, reads it back and checks
  it; a failed one is kept, marked and reported.
- Only the two newest failed backups are kept; a failing schedule retries after one,
  two, four, eight hours, up to a day.
- A disconnected location is skipped, never replaced by another; the backup is made when
  it returns.
- The newest seven scheduled and seven hand-started backups are kept by default; only
  files Outpost can read as its own backups are ever removed.
- Backups listed with date, size, version and check, with **Back up now**, download,
  **Restore this one** and delete.
- Restoring, deleting a stored backup and keeping fewer only on the computer Outpost
  runs on, unless `OUTPOST_ALLOW_REMOTE_ERASE=true`. A restore checks every file against
  the archive's checksums.

#### Document library

- Uploads of PDF, EPUB, Markdown, text, CSV, JSON, HTML and images: type checked by
  content, duplicates found by checksum, originals kept unchanged.
- Text extracted for search from PDF (by page), EPUB, Markdown, HTML and text, in a
  worker thread.
- An EPUB reader: contents with cover, the book's table of contents, chapters in order,
  pictures, footnotes, tables and links between chapters, drawn from plain values (never
  the book's HTML). The place reached is kept per device; DRM books are refused; fixed
  layouts, audio, video, MathML and scripts are not supported.
- Markdown documents shown formatted, drawn from plain values and never turned into
  HTML; links to their own headings, and to catalogue entries and book chapters
  (`outpost:entry/<id>/<chapter>`), looked up by the server.
- `mermaid` diagrams and `viz` signal figures in Markdown, drawn as images that follow
  the theme, with a larger view.
- Books as folders of chapters, with contents and previous and next links; chapters are
  found by search.
- Titles, authors, categories, descriptions and tags; a PDF viewer with byte-range
  loading; originals served in a sandbox.
- Optional OCR for scanned PDFs and images (Tesseract in WebAssembly, English built in),
  as a resumable job, off by default; other languages from a data file.
- **Save a web page**: one page fetched, its article kept as a searchable document with
  its address and date, pictures inside the file if asked. Previewed first; nothing is
  crawled or fetched again; saving the same address twice asks.
- A Markdown document shows pictures carried in its own file; any other is described.
- PDFs made in Outpost (map pages, HF predictions and comparisons, coverage maps,
  communication plans, the contacts sheet, sun times) offer the same three actions:
  **Save as PDF**, **Add to library** and, where possible, **Share**. Added files go
  through the normal upload, under "Made in Outpost", with a link back to their source.
  A one-time pad and the contacts sheet ask first. A test fails if a screen makes a PDF
  without these actions.
- Sun times on paper: two weeks, a month or a year of first light, sunrise, noon, sunset,
  last light and day length.
- The PDF writer carries any script as hidden text, so search finds it; names in scripts
  the PDF fonts lack are drawn as pictures.
- An HF prediction as a two-page PDF and as Markdown, with every figure, caveat and
  version; a missing figure is a dash, never a nought.
- A coverage map as a PDF, with its legend, counts per class and the grid in figures.
- A printed map page carries what it shows as hidden text, so search finds the map.

#### Notes

- Nested pages with headings, lists, task lists, quotes, code, tables, images, callouts,
  toggles, page links and document embeds.
- Backlinks, favourites, recent pages, built-in and personal templates, duplication,
  and a trash with restore.
- Attachments with content-checked types; autosave with conflict detection.
- A block editor: slash menu, Markdown shortcuts, selection toolbar, block handles, page
  pickers, a page tree with drag and drop, and a formatting bar above a phone keyboard.
- A page tree that stays quick at thousands of pages.
- Moving pages by touch (press, hold, drag), or with "Move to…", "Move up", "Move down"
  and Alt with an arrow; every move can be undone.
- A block handle for single list items, with what is nested under them.
- Markdown export of a page or the whole workspace, with links and attachments.

#### Imports

- Markdown, HTML, text and CSV as pages and PDFs as documents, singly or in a ZIP,
  including Notion's "Markdown & CSV" export, with hierarchy, links, pictures, tags and
  databases rebuilt.
- A plan before anything is written: the page tree, warnings, what will not come across,
  and pages that already exist (skip, copy or replace; hand-written pages are never
  overwritten).
- Each file converted in a process of its own with a minute and 1 GB, so a hostile or
  huge file cannot stall the server.
- Imports can be stopped and continued without duplicates, with a report at the end.
- Code blocks in imported HTML and saved web pages keep their indents and line ends.

#### Search

- Keyword search across documents, notes, collections, catalogue entries, places and
  tracks: phrases, exclusions, prefixes, English word forms, accent-insensitive, with a
  stated fallback from "all words" to "any word".
- Ranking that weights titles, tags and headings; highlighted passages; PDFs open at the
  matching page.
- Articles from reference collections merged in, added below your own results as each
  collection answers, three archives at a time, 8 seconds each and 30 in all, with a
  note naming any left out. Every archive is searched.
- Optional search by meaning, with a resumable index build, vectors per model, and
  export and import of vectors.
- A built-in embedding model (all-MiniLM-L6-v2, Apache-2.0, 8-bit ONNX, 23.7 MB) run in
  WebAssembly, in the packaged app, Docker image and portable drives; it downloads
  nothing at run time. Long passages are read whole, in stretches averaged together.
- Hybrid ranking by reciprocal rank fusion.
- Retrieval endpoints with full provenance and cited context for a language model, and a
  flag for safety-critical sources.
- Search by meaning is one switch, and answers and chat three presses (look for Ollama,
  use the model offered, try it), with everything else under **More options**, a short
  list of suggested small models, and a set-up guide inside Outpost
  (`/help/search-and-answers`).
- Keeping the index up to date waits for someone to build it once, and never restarts a
  build they paused.

#### Answers from your library

- **Answer from my library** on Search: a model you run yourself (Ollama, llama.cpp's
  server, LM Studio) writes a short answer from passages of your documents, notes and
  chapters. Outpost includes and downloads no model; off until set up.
- The answer streams, can be stopped, is headed as generated and names the model. Each
  citation shows its passage; the passages given are listed beneath.
- Grounding checks: answer only from the numbered passages, strike a marker that matches
  none, call out an answer citing nothing, and skip the model when nothing is found. A
  plain "not covered" reply is shown as "Your library does not seem to cover this".
- Medical, first-aid and food-preserving sources get a warning, the source's own words
  and their passages shown open.
- **Settings → Answers from your library**: address, model, a test that names what
  failed, temperature (0.2) and a context budget.
- Questions searched by what they are about; the answer says which words were used.
- *How search works* shows the real prompt and how sources are fenced off.
- Up to five passages chosen one by one by words and meaning together.
- Ollama is asked for a context large enough for the budget, and a prompt too long is
  retried once with fewer passages, saying how many were left out.
- "Loading the model" shown when Ollama says the model is not in memory.
- `OUTPOST_OLLAMA_ADDRESSES` for an Ollama on another port.
- A model server must be on this computer or a private network unless
  `OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true`.
- A fixed set of 45 questions to measure real models, run by hand; the test suites never
  contact a model server.

#### Chat

- **Chat** with a model you run yourself, on the same server and own-network rule as
  answers.
- Conversations kept on the server for every device: rename, find, delete. No accounts,
  so anyone who can open Outpost can read them, and the screen says so.
- Replies stream and finish if the tab closes; Stop, regenerate, edit and resend, copy,
  and save a reply as a page in Notes.
- Replies drawn from plain values: links shown as words, pictures never fetched.
- A model picker from the server's list, remembered per conversation.
- **Use my library**, off by default, answers from your passages with citations; **Ask
  about this** starts a conversation about a document or page.
- Long conversations send the newest exchanges that fit, and show where that begins; a
  turn refused as too long is retried without the earliest messages.
- Plain words for each fault: no server, not answering, no such model, loading, cut off,
  stopped.
- Conversations are removed by "erase everything".

#### Reference collections

- A catalogue in JSON manifests, with a validator: Kiwix archives, official handbooks
  and textbooks fetched as PDFs from their publishers and pinned by size and SHA-256, and
  radio reference sheets and books that ship with Outpost. Downloaded PDFs join the
  library. Second pass on 16 November 2026: 72 more items and three packs (Weather in
  Britain, Coast and sea, Electricity and electronics).
- Radio reference sheets, the Radio Engineering Handbook and fifteen companion guides
  from LogBook73 (MIT), included and added with no connection.
- A catalogue entry can be a bundled book: one file or a folder of chapters.
- Packs: curated sets fetched together, listed first in Explore.
- `docs/sources.md`, a record of every source considered, its licence and use.
- A catalogue refresh that never contacts a publisher about a pinned file, and a
  maintainers' online check that respects crawl delays and no longer trusts a `404` to
  `HEAD` alone.
- A download manager: pause, resume, retry, resumable transfers across mirrors, checksum
  checks, a shared speed limit, a queue forecast and history; a Downloads screen led by
  the plan, and a details page per download.
- ZIM archives read through kiwix-serve behind a sandboxing proxy, with search and title
  suggestions.
- PDFs inside a collection open in the PDF viewer and can be added to the library; a bar
  lists every file a page links to and adds the chosen ones.
- A file a page links to on the internet can be saved through the download manager,
  from public addresses only, and kept only if it is what its name says.
- **Add to library**, **Add all to library** and **Add these** copy documents out of a
  collection as one resumable job, after stating the count, space and place. Documents
  added stay when the collection is removed.
- Document-list collections (openZIM's nautilus, such as the Post Disaster Resource
  Library) shown as a searchable list, read on the server.
- Registering a ZIM archive already on a storage location; updating a collection to a
  newer version.

#### Maps

- Regional extracts cut from a remote PMTiles archive, with the exact size first,
  ready-made regions, custom boxes with edge and corner handles, and optional terrain.
- Installed regions served as one vector map with bundled styles, fonts and icons; a
  configurable map source; importing a `.pmtiles` file.
- Offline place search from GeoNames.
- Satellite imagery from local files: NASA's Blue Marble for the world, and Sentinel-2
  scenes for small areas, fetching only the parts needed, with day, cloud, bytes,
  licence and cost shown first.
- Aerial photographs for small areas in New Zealand (LINZ, CC BY 4.0) and the lower 48
  United States (USDA NAIP, public domain).
- A Maps screen: saved places, routes with elevation profiles, measuring, hill shading,
  a three-position sheet on phones.
- Contour lines traced in the browser from installed terrain.
- Markers, GPX import and export, and coordinates including British National Grid.
- GPX 1.0 and 1.1 read in one pass with stated limits (1,000,000 points, 20,000
  waypoints, 10,000 tracks and routes, 100,000 segments, 20 MB); exports checked against
  the GPX 1.1 schema, with times and 180° east written the way GPX allows.
- Moving a saved place straight from the map, confirmed before it is kept.
- Icons for saved places (sixteen), shown on the map, lists, search and printed maps,
  and written to GPX as Garmin symbols (`0013_place_icons`).
- Sun times (first and last light, sunrise, sunset, noon, day length, nautical twilight,
  moon phase) for any place and date, worked out on the device; a **Sun** tab for the
  centre of the map.
- A cross at the centre of the map wherever something reads it; on a phone the centre is
  the middle of the visible map.
- A card for where you are while following the device.
- Maidenhead locators: a grid, a position's locator, and locators read by search.
- The grey line: day, night and the three twilights over the map for now or any time.
- A line-of-sight check between two points over installed terrain, with the Earth's
  curve and the first Fresnel zone. Geometry, not a coverage prediction.
- **Estimated radio range from here** on any point, shading ground in sight.
- Recording a track as you walk: kept on the device as it arrives, offered back after a
  reload, sent when Outpost is in reach. Runs only while the screen is on.
- **Print or save as PDF** of part of the map (A4, A3 or US Letter, a fixed scale or
  fit), with scale bars, north, a grid of latitude and longitude, credits, optional
  layers, and magnetic north with declination when ticked. Laid out in the sheet on a
  phone. Nothing is sent to the server.
- **Find a route** by name in OpenStreetMap, the one map feature that needs the internet;
  it names the server first and keeps the route's credit.
- On a phone, one layout rule for everything over the map: search on top, tools under it,
  one card at most three fifths of the map, credits on one line with **4 more**.
- Place names, roads and postcodes for Great Britain from OS Open Names (OGL), on a
  press, with postcode search however typed.
- The height of the ground under the pointer or at the centre (`GET /api/maps/height`),
  and **Settings → Appearance → Heights** for metres or feet.

#### Reference layers for the map

- A **Layers** tab: published data over the map, each layer on its own switch, a legend
  that tells published, historical and unverified records apart without colour,
  population density, filters and a search by name. A record shows its publisher,
  dates, licence and accuracy.
- Sources fetched only on a press after the size is shown: Natural Earth, OurAirports,
  OpenStreetMap (by Overpass or a Geofabrik extract), Wikidata, WorldPop and
  Switzerland's emergency meeting points; others linked, with why.
- Imports of CSV places, GeoJSON features, historical records and country figures, with
  British National Grid, Swiss and Web Mercator coordinates converted.
- A spatial store in SQLite (R*Tree, full-text names; 0016) that keeps both sources of a
  duplicate and keeps records while a pack's drive is away.
- Flood zones for England (Environment Agency Flood Map for Planning, OGL), for the area
  on screen, with the Agency's own caveat.
- **Food and supplies**: shops, markets, food banks, water, fuel and pharmacies from
  OpenStreetMap, plus the Food Standards Agency's registered shops in the UK; the
  nearest of each kind offline; a whole region from Geofabrik in one download.
- Airport radio frequencies from OurAirports on each airport's card, marked not for
  navigation.

#### Repeaters

- A repeater database of your own, used offline; Outpost ships none. Imported from the
  RSGB ETCC's lists, CHIRP, the WIA, Hearham, Outpost's own export or any CSV or JSON,
  previewed first, or entered by hand.
- Sources by country on the Repeaters screen: fetched once on **Get the list** where
  allowed (IRTS, Hearham), steps to get it by hand otherwise, or why there is none.
  Outpost scrapes no page and gets round no sign-in. Sources are declared in
  `catalog/repeater-sources.json`.
- Duplicates found on import and by **Find duplicates**, merged only by choice and never
  deleted; an update leaves your changes alone unless told otherwise.
- Filters by band, mode and distance with bearing; repeaters on the map, handed to line
  of sight, and found by the search across everything.
- Export as CHIRP CSV (check before transmitting) and Outpost's own CSV.
- Each entry shows its source and the date of its data.
- Frequencies read in the unit their column names, bands up to 250 GHz.
- **Estimated range** for a repeater: line of sight over terrain out to 100 km, for a
  handheld, car or roof aerial, or the smooth-Earth horizon without terrain; several
  ranges at once, each labelled.

#### HF propagation

- An HF planner under **Radio**: reliability, signal-to-noise, MUF, FOT, HPF and LUF,
  hops and take-off angle for every band from 80 m to 10 m and four modes, with NVIS
  working shown apart.
- Predictions from VOACAP in WebAssembly, in a worker with no file access; nothing is
  predicted without the engine and its data.
- Every answer names the source of its sunspot number and is never called live.
- Radio and antenna profiles, generic antennas, and predictions saved by name.
- The engine's data listed with versions and checksums; a newer solar cycle table
  fetched on request.
- Charts readable by keyboard and screen reader.
- Places chosen on the offline map.
- End-fed half-wave wires of a stated length, and sloping wires, run as VOACAP's own
  models; bands a model cannot cover are marked **Not modelled**, never 0%, and long
  wires are labelled approximate. The old "End-fed half-wave, horizontal at 6 m" is
  renamed "…recut for every band…" (0018).
- Portable presets: a 20 m end-fed wire sloping or level, and the SPOOLTENNA.
- **HF coverage**: the engine run for every cell of a grid over the map view, drawn as a
  layer, with no smoothing; up to 2,304 cells; maps saved and reopened.
- **Communication plans**: stations, hours and bands, each pair both ways, with primary
  and alternate bands chosen by a stated rule; PDF and Markdown.
- **Contact log**: contacts typed or imported from ADIF 3.1.8 (large files as a job, all
  or nothing), set beside the predictions as counts.
- **Compare with a second model (ITU P.533)**: optional, built on your computer from the
  ITU's source by **Build the P.533 engine**, with its 137 MB of maps downloaded on
  request; nothing of the ITU's ships with Outpost.
- VOACAP's coefficient files are no longer shipped (the source says "All rights
  reserved"): one checked download from the planner or at set-up
  (`scripts/fetch-voacap-data.mjs`, run by `deploy/pi/install.sh`).

#### Morse trainer (Radio)

- **Radio → Morse trainer**: 40 Koch lessons, callsign, word and phrase drills, a send
  trainer for straight key, paddles and bug with timing coaching, practice contacts, an
  On the air call for the Reverse Beacon Network (nothing is asked of it), a code chart,
  and progress by lesson and character.
- Thumb-sized keys on screen, keyboard and mouse keying, and wired keys and game
  controllers where the browser allows.
- One household record of progress (`0026_morse_trainer`).

#### Games

- **Games**: Allotment, Solitaire, Peg solitaire, Sudoku, Draughts and Pairs, drawn in
  code and playable by touch, mouse and keyboard with spoken names.
- **Allotment**: one shared plot; crops grow only in their real British months and in
  moist beds; rain worked out from the date; nothing withers or is lost.
- Allotment, 17 November 2026: crops wait rather than wither; water lasts 12 hours, plus
  rain by date and a water butt; broad beans, garlic, onions and kale added for winter.
  Version 1 plots are read into version 2 with nothing lost.
- Solitaire (draw one or three), Peg solitaire (33 holes), Sudoku with one answer each,
  Draughts against the computer or two players, and Pairs.
- Each game's tally in one table (`0027_games`); a game in progress stays on its device.

#### Frequencies to listen to (Radio)

- **Radio → Frequencies to listen to**: time, news, emergency broadcasts, weather,
  distress and calling channels, emergency nets and licence-free channels, by kind and
  country, each with the page and date it was checked against; nothing fetched.
- Time signals in detail, with how to set a clock by ear.
- Filters by kind, country, band and "a set like mine"; expired schedules shown so; a
  PDF of the list. Shortwave from further away is listed under the chosen country.
- A data test that fails on an entry with no source, date or valid frequency.

#### Supplies (Preparedness)

- **Preparedness → Supplies**: food, water, fuel, medicine, batteries and equipment, with
  quantity, place and dates (use-by and best before treated differently), made for a
  phone.
- How many days the food and water last, from named official figures you can change,
  what runs out first and what to use first.
- A shopping list in whole packs, ticked off into stock, as a PDF or text.
- A barcode scanner (typed, photo, or live camera on a secure page), looking nothing up.
- CSV in and out; `GET /api/supplies/outlook` for other screens (0016).
- Food energy by name from USDA FoodData Central (public domain, shipped, offline), and
  **Give them their energy** for foods not yet counted.

#### Weather and hazards (Preparedness)

- **Preparedness → Weather and hazards**: forecasts, warnings, flood warnings, and
  climate and sunshine averages for saved places, kept for reading offline, each with
  its source, fetch time and period, and its age in words.
- Fetched only on **Update now** or when opening the screen if ticked.
- Sources: Open-Meteo, the Met Office's warnings, the Environment Agency, NASA POWER and
  PVGIS; positions rounded to two decimals.
- A barometer log with sea-level reduction, a chart and the Met Office's tendency words;
  readings from CSV.
- **River and sea levels** (England): nearby stations with level, datum, typical range
  and trend, and three days per station.
- One meaning of "home": the saved place with the home icon (`0021_weather`).
- `GET /api/weather/home-warnings` gives other screens the warnings for home.

#### Emergency plans (Preparedness)

- **Preparedness → Emergency plans** from templates whose steps quote dated official
  sources whose terms allow it (Be Ready, GOV.UK, the Environment Agency, the Met
  Office, Ofcom), or blank; others are pointed to, never quoted.
- Steps, people, places, communication, supplies against the inventory, power and notes.
- "Use now": steps to tick, numbers and places in large type; reviews on a schedule.
- Wallet cards, a fridge sheet and a grab list to print (0018).
- A warning held for the home place is shown on the plans; a contact or place deleted
  since is shown as missing.

#### Nuclear preparedness

- **Preparedness → Nuclear preparedness**: an educational effects simulator over the
  offline map, from Glasstone and Dolan (1977), each figure cited and rounded to two
  significant figures; parameters outside the model refused (`0018_nuclear_scenarios`).
- Rings told apart by line style as well as colour; saved places measured in words;
  scenarios saved, compared and written out as PDF or Markdown.
- The reference layers in the workspace, a Records tab, people inside each ring from
  WorldPop (rounded, not a prediction of harm), radiation emergency plans, up to six
  scenarios at once (`0024_nuclear_scenario_sets`), a hue per effect, a labelled wind
  field, and maps in the PDF.

#### On a phone, out of reach of the server

- A service worker and manifest, so the app opens out of reach and can go on the Home
  Screen (HTTPS needed).
- **Keep on this phone** for notes, routes, saved places, a map area and an emergency
  plan; **On this phone** lists what is kept.
- Out of reach the app is read-only and says so; kept pages can be edited and sync back,
  asking when both sides changed; plan ticks merge.
- A kept map area refreshes without leaving a hole.

#### Encryption

- An **Encryption** screen: OpenPGP keys (Curve25519 or RSA 4096), text and files up to
  537 MB, in the browser and compatible with GnuPG, needing HTTPS or the computer itself.
- Private keys kept only in passphrase-protected form, in the browser or on Outpost.
- Encrypted pages of notes, saved only after decrypting back to the same page, with the
  old text erased from the index and database file.
- Ciphers by hand (Caesar, ROT13, Vigenère, Playfair, rail fence, columnar, one-time
  pad), with pads and a Vigenère square to print or save as PDF.
- Print buttons that are left out, or say what to do, where a browser cannot print.

#### Portable drives

- A standalone Outpost written to a removable drive: the app, checked Node runtimes,
  launchers for macOS, Windows and Linux, a narrowed database and chosen content; the
  collection reader for macOS and Linux; updated in place.
- **Storage → Bring back changes from a drive**: a preview by kind, conflicts kept both
  ways unless chosen, nothing removed at home unless ticked, as a stoppable, undoable
  job that only reads the drive. A drive records what each item was when written.

#### Backup

- One-file backup of the database, attachments and extracted text, and a staged restore
  checked before it is applied, keeping what it replaces. The restart that applies it
  follows the same local-only rule.
- Backups protected with a passphrase (**Settings → Backup**), encrypted to a public key;
  Outpost keeps nothing that opens them; damaged files are told from a wrong passphrase.

#### Tools: Power and batteries

- Calculators: battery runtime, solar output and charge time, cable size and voltage
  drop, batteries in series and parallel, generator fuel, Ohm's law, resistor colours,
  resistor networks, LED resistors and dividers; each states its formula and source.
- Power plans: battery bank, loads (radios by duty cycle, a Pi, AC through an inverter,
  USB through a converter), solar by month and charging, worked into runtime, autonomy,
  break-even solar and hourly charge, saved on the server (`0016_power_plans`), compared
  and printed.
- A plan's solar section chooses its place and fetches PVGIS sun hours on a press.
- A library of common devices with makers' published figures and sources; your own
  devices kept on the server (`0025_power_devices`).

#### Security

- Local-only by default; sharing with the network is a start-up setting
  (`OUTPOST_LAN_ACCESS`), and the server will not listen on a reachable address without it.
- No accounts: everyone who can reach Outpost can do everything.
- Cross-site request protection (custom header and same origin), a Host allow-list, and
  a strict Content Security Policy.
- A guarded download client that refuses private addresses and keeps catalogue downloads
  to their listed hosts.
- Limits on archive extraction; imported Markdown and HTML sanitised into a fixed model.
- A strict GPX reader of Outpost's own, in a worker, that never reads a DOCTYPE.
- Run from source, one V8 optimisation is turned off after a crash with two workers
  starting at once.
- Saved web pages fetched through the guarded client, read under limits in a worker, and
  kept as Markdown; pages drawn by script are refused.
- No telemetry and no outbound request unless a person asks.
- Model answers: questions go only to the configured server, sources fenced as data,
  answers drawn as words.
- Optional HTTPS on the home network (port 8443) with an authority Outpost makes for
  itself, or a certificate of your own (Settings, or `tls/own`, renewed without a
  restart), with steps to trust it on each system.
- The computer Outpost runs on is recognised at its own network address as well as
  `localhost` (not in a container; `OUTPOST_OWN_ADDRESS_IS_LOCAL=false` turns it off).
- A key may be given over plain HTTP only after a warning and an explicit tick.
- An optional household PIN for changes (**Settings → Who can use this library**), with
  wrong tries limited per address; `OUTPOST_FORGET_PIN` starts without one.

#### Tools

- **Solar clock**: the sun's position, sundial time and solar noon; recovering clock time
  from a shadow or a sea sunrise with an error range; making a sundial and a nocturnal
  with template PDFs. Stars for the northern hemisphere only.
- **QR codes** from text, Wi-Fi, a contact, a number, an email or a place, made in the
  browser, as PNG, SVG or a printed sheet.
- **Devices on this network**: what answers on the computer's private networks, with
  names and makers, one ping and two ports per address, no port scanning (0016);
  `OUTPOST_NETWORK_SCAN_LOCAL_ONLY=true` limits scans to the computer itself.
- Calculators for **Water**, **Outdoors**, **Radio**, **Building** and **Cooking**, each
  with units, a sentence answer, its formula and dated source, and **Copy** and **Save
  as a page**.
- **Compass**: magnetic north from the World Magnetic Model 2025 (to the end of 2029),
  grid north, conversions, and a live compass on phones over HTTPS; the map's centre
  card gives the declination.

#### Deployment

- A Dockerfile for `linux/amd64` and `linux/arm64`, and a Compose stack that builds
  `outpost:local` with a kiwix-serve sidecar.
- A packaged app that needs only Node.
- Raspberry Pi scripts in `deploy/pi/`: `install.sh` (Docker, `--lan`, `--https`,
  `--sudo`), `hotspot.sh` for a Wi-Fi network of the Pi's own, and `nas-share.sh` to
  connect an SMB share.
- **Settings → Server status**: storage, database, last backup, card wear, memory,
  temperature, power, clock and jobs in words.
- The server's clock checked against the browser's and set from it
  (`OUTPOST_ALLOW_REMOTE_CLOCK` for other devices).
- `install.sh --lan` announces the Pi as `outpost.local`.
- `/metrics` for Prometheus (`OUTPOST_METRICS`, private networks only) and a Grafana
  dashboard.
- Local checks: lint, types, tests, catalogue validation, and browser tests against the
  packaged app with the internet blocked.

#### Messages

- **Messages**, a household board on the home network: messages, check-ins with an
  optional position, and files for another device. No accounts or push notifications
  (`0028_board`). **Settings → Message board** sets how long files are kept.
- **Mesh radio**: the board reaches a LoRa radio running Meshtastic (MQTT, with Outpost
  as broker or another) or MeshCore (USB or network), set up only on the computer
  Outpost runs on.

#### Library

- **Audiobooks** from a zip or audio files, played from the server with speed, skips,
  lock-screen controls and place kept per device; **Explore → Audiobooks** links to 15
  public-domain LibriVox recordings, never fetched by Outpost.
- **Learning progress** in reference archives per learner (pages, time, done), kept
  through updates, listed under **Library → Learning** and printable
  (`0029_learning_progress`).
- **Import from Calibre** under Library: copy the books or use them in place; the Calibre
  folder is only read.

#### Catalogue additions (17 November 2026)

- Eight CDC sheets and seven FEMA guides, the NIOSH Pocket Guide, and 66 more
  publications (UK emergency plans, US DOE handbooks, Forest Service manuals, NPS
  Preservation Briefs, the ICRC's *War Surgery*, OpenStax, NASA histories).
- 18 more Kiwix archives, kept by the owner's decision although Kiwix's `robots.txt`
  disallows every client: Outpost fetches only when a person presses Download.
- Three Ordnance Survey map-reading guides added and taken out on 16 November by the
  owner's decision: not openly licensed, and a portable drive could copy them.
- Five new packs, making 22, and a "Literature and reading" category.

#### Help

- **Help**: every documentation page inside the app, grouped, offline, and found by the
  quick search.
- **Which model**: seven models compared on a Mac for answers and looking things up.
- Map and radio quick starts for whoever did not set Outpost up.

#### Chat: tools a model can use, and MCP

- **Looking things up in Outpost**: Chat can let a model read places, layers, supplies,
  plans, weather, sun and compass, radio, the catalogue and the library, citing where
  each fact came from. Read only, off by default, by area; contacts, keys, encrypted
  pages and board files are never readable.
- An MCP endpoint, `/mcp`, with the same tools, off by default and switched on only at
  the computer Outpost runs on.

#### For contributors

- `e2e/tools/idle-cost.mjs` measures a screen's cost at rest.
- The catalogue's online check takes `--skip-host` and leaves Kiwix alone unless
  `--include-kiwix`.
- A test that fails when a screen breaks the rules in `docs/development/web-screens.md`.
- `apps/server/test/eval/tools-eval.ts` and `scripts/write-which-model.mjs` for model
  trials.
- README screenshots made from demonstration data, and `scripts/check-readme-links.mjs`.

### Raspberry Pi, first run on real hardware (17 November 2026)

- `install.sh` built and started Outpost on a Raspberry Pi 5 in about three minutes. It
  now says when `docker` is a rootless one (`--sudo` uses the system's), warns that
  memory limits are off on Raspberry Pi OS, and leaves Docker's networks out of the
  addresses it prints.
- `nas-share.sh`, new, tried against a Synology NAS.

### Changed

- **At rest Outpost costs close to nothing**: no fixed-tick timers on the server but a
  few outside checks; one shared keep-alive for live streams; missing drives looked for
  every ten minutes or on **Check drives**; backups sleep until due.
- **A background tab asks the server for nothing**, and closes its live stream after a
  minute.
- **Screens at rest do no work**: games, maps, Morse, chat, timers, Downloads, Supplies,
  Contacts, Import and the set-up guide no longer poll or draw while idle or hidden.
- **Less to download**: assets precompressed (first load 262 kB gzip, was 1.1 MB), JSON
  compressed, map tiles answered `304` when unchanged, and rarely used parts loaded on
  first use.
- **Faults**: a failing screen offers **Reload** and **Home**; an uncaught exception stops
  the server in order.
- **A change saved elsewhere is not overwritten**: plans, devices and scenario sets refuse
  a save from an older copy and offer a choice; at most 500 power plans.
- **Finding your way**: Downloads, Storage and Settings always in view; child screens lead
  back; one name for each thing; Settings lists its sections.
- **Quick search** finds screens and Settings sections by everyday words, and lists the
  shortcuts; Search puts what is on this device first.
- **One way everywhere**: one look for toasts, separators, dates, empty states and
  sections; "optional" in words; focus returns after dialogs; contrast met in both themes.
- **Saying before the press**: what another device may not do, what a removal or restore
  will change, and what an import will make.
- **Text size, and phones**: **Settings → Appearance → Text size**; screens fit at 150%
  and 200%; 44 px controls on phones; many phone layout fixes.
- **Library and Explore**: Explore leads with encyclopedias, medicine and maps and pages
  long lists; lists of fifty; the reader offers **Try again**.
- **Radio**: the HF answer comes first, in local time beside UTC, as a share of days;
  Repeaters and HF start from home.
- **Storage and backups**: each file counted once; Database in plain words; Storage names
  the backup location.
- **Maps**: your own area first; stale estimates refused, and an estimate with no country
  or box refused unless the source covers the world. Map layers are their own kind under
  Storage, and their summary is counted in a worker and kept until they change (about
  5 s on a Pi at every opening before).
- **Supplies and tools**: impossible CSV figures refused per row; path loss refuses
  distances under a wavelength; times rounded to what their figures support.
- The model to start with is `lfm3:1.7b`; `llama3.2:3b` stays as the most reliable on
  answers from the library.
- Radio Romania International's and Radio Exterior de España's schedules removed: their
  terms allow personal use only.

### Fixed

- Search counts every match, so every page can be reached.
- CSV numbers read by the file's own decimal mark, with ambiguous cells refused.
- Answers decline only when the model says the passages do not hold the answer.
- Stream errors on a full or unplugged drive fail the download, not the process.
- A download whose server sends no length and more than the stated size is held to
  that size on every attempt; the retry no longer takes and installs whatever it is sent.
- "Reclaim unused space" waits for writes under way, and blocks all writes, `/dav/` too.
- A refused reference import leaves nothing behind.
- Wrong-size search-by-meaning vectors are refused.
- A phone screen opened from a scrolled list starts at its top.
- Erasing a portable drive no longer lets a later merge remove things at home.
- A backup slept through is made on waking, recorded once, and never written after
  shutdown; a backup is listed only after its check.
- Free space refreshed every 256 MiB of change.
- Network shares looked for again while any location is away.
- Manage and clean up no longer counts a download in progress as left over.
- The "Add all to library" count moves again.
- Archive pages whose names end in `.html` no longer answer 404 on reload.
- Bundled sheets update to the new edition.
- Updating an OpenStreetMap or OurAirports pack twice in a day works.
- A device's announcement can no longer make Outpost look up a name of its choosing.
- A weather place removed during an update keeps nothing.
- Names such as `constructor` from imports and devices are a `404`, not a `500`.
- Notes: "Try again" opens the page; Import's "Replace" leaves an encrypted page alone.
- Power screens no longer report a busy database as a change elsewhere.
- Emergency plans keep typed numbers; Supplies hidden fields no longer block saving.
- A wind from 360° is north in the nuclear simulator.
- The Sun tab moves to the new day at midnight.
- Mesh radio: a radio cannot rename another, and a long topic no longer wipes state.
- M4A or M4B files of thousands of parts no longer stall reading tags.
- Very long Japanese or emoji file names are shortened instead of failing.
- A model reply stops where its reader stopped; Chat no longer scrolls you back down.
- A failed decryption no longer leaves the Encryption screen busy.
- An HF basis sentence is dated, not "(today)"; a map page made twice a day is one
  document; `formatDuration` never says "60 seconds".
- On a phone, the Directions sheet shows a walk's or a ride's climb and its steepest
  stretch under the totals, as the panel does.
- Many small layout fixes on phones and narrow windows.

### Security

- **A symbolic link in a storage root no longer opens the whole disk.** Paths are checked
  as written and again with links followed (on a Mac `/Volumes/Macintosh HD` links to `/`).
- **Erasing everything clears erased words from the search index's storage.**
- **Another device cannot delete several of a person's own files in one step**, or
  overwrite their own HTTPS key.
- **Reader pages are framed at a secret per-installation address** (`reader-token`), so
  web-app archives work without letting other sites read the library.
- **Quick search failing to load no longer blanks the app.**
- **A search-by-meaning import refuses a line over 1 MB.**
- **The MCP endpoint is switched on only at the computer Outpost runs on**, compares the
  whole origin, and refuses forwarded or outside requests.
- **The mesh radio link** is set up only on the computer itself, keeps passwords out of
  the database, and closes outside broker connections; a restore or a portable drive no
  longer carries it or the MCP switch to another machine.
- The MQTT broker limits wrong passwords and unsigned connections per address.
- Learning progress cannot fill the disk.
- A download stops as soon as more arrives than it should.
- **A NAS that is switched off no longer stops the map**: storage checks wait elsewhere,
  five seconds at most.
  On the first Pi with its NAS blocked, health then answered within 21 ms and tiles within
  70 ms over 90 seconds (the map had stalled 10 to 25 seconds at a time). The check stays
  every 30 seconds: every 5 seconds cost about 1.3 ms of processor time each.
- **Devices on this network** no longer marks other devices "this computer" because macOS
  loopback and tunnel interfaces carry link-local addresses (16 November).
- **Storage → Manage and clean up → Installed** lists map layers (Natural Earth, airports,
  OpenStreetMap extracts) as a kind of their own rather than with the radio data.
- **What is written to storage is read back** against a checksum per megabyte, and a bad
  part is fetched again; added after a NAS share lost a 4 KiB block of a 2.3 GB file.
- Geofabrik extracts are held to their published MD5, and a failed file is deleted so
  **Retry** fetches it again.
- A test fails when the server asks a host that `docs/security.md` and `docs/offline.md`
  do not both name.

### Who is told what is asking

- Wikidata and Overpass show the client name they are sent, word for word, and wait for
  the person to agree.
- Finding a known route shows the same name beside its server.
- Repeater lists are fetched under the plain name "Outpost (self-hosted offline
  library)".

## Known limitations

These are deliberate, and explained in
[docs/architecture.md](docs/architecture.md#limits-and-trade-offs). What has not been
tried is in [docs/testing-status.md](docs/testing-status.md).

- **Scale**: one node and one SQLite writer, for a household or a classroom.
- **Search by meaning** uses a flat index, comfortable to about 100,000 passages; the
  built-in model is small and English-only.
- **OCR** is slow, makes mistakes, and reads English only unless a language file is added.
- **No language model is included**; answers and Chat need a model server you run, and
  read documents, notes and chapters, not reference collections.
- **Reference collections need kiwix-serve**; on a portable drive they cannot be opened
  on Windows.
- **Maps** use the Protomaps schema only, with no routing; hill shading and contours need
  a terrain download, and new downloads depend on the map source staying available.
- **Notes** detect conflicts but have no live co-editing.
- **A portable drive is a copy**, not a sync partner; conflicts are settled per page.
- **The message board has no push notifications**, and a name on it proves nothing.
- **River and sea levels are England's only**; OS Open Names covers Great Britain only.
- **No accounts** and no per-page permissions.
- **No encryption at rest**, apart from protected backups and private keys; use encrypted
  drives where that matters.
- **The HTTP API is not versioned.**
