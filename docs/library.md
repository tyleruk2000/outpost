# The library, and PDFs made in Outpost

The document library holds the files a person has added: PDFs, EPUB books, Markdown,
text, HTML, images and audio (see [Audiobooks](#audiobooks)). Each file is checked to be what its name says, given a checksum,
refused if the library already holds the same bytes, stored on a storage location, read
for its text as a background job, and indexed for search. It is opened in Outpost's own
readers, it is in backups, and it travels on a portable drive. The routes are in
[api.md](api.md#documents), what is and is not trusted in
[security.md](security.md#files-people-upload), where files are kept in
[storage.md](storage.md), and how search reads them in [search.md](search.md).

This page is about two things: **audiobooks**, and **a PDF that Outpost makes**, which can
be added to the library from the screen that made it.

## Audiobooks

Public-domain audiobooks, such as LibriVox's, kept on the server and played in the
browser from it. This is audiobooks, kept simple: not a media server.

### Getting one

- **From LibriVox, through Explore → Audiobooks.** A starter shelf of fifteen books,
  three practical, six classics for adults and six for children, each with its
  readers, running time, number of files, an approximate size (worked out from the
  running time at the 64 kbps of LibriVox's zips: LibriVox does not state the size and
  the Internet Archive was not asked), a line about it and its licence. **Download the
  zip** is a link your browser follows; **Add the downloaded zip** then takes the file
  from your device. Outpost never fetches a recording itself: LibriVox's files are
  hosted by the Internet Archive, whose terms of use could not be read, and their zips
  are built on request so no size or checksum can be pinned. The reading of the terms is
  in [sources.md](sources.md#audiobooks-and-the-niosh-pocket-guide-added-on-2026-11-17).
  On an iPhone, Safari saves the zip to Files → Downloads, where the picker finds it.
- **Library → Documents, Type: Audiobooks → Add audiobook.** A zip of a book's
  chapters, or a book's audio files chosen together (MP3, M4A, M4B, AAC, Ogg, Opus,
  FLAC, WAV), with an optional title. The files are sent with a progress bar; the
  server then unpacks and files them as a job, which the window follows (closing it does
  not stop it).
- **Add documents** takes one audio file as an ordinary document. It plays the same way,
  as a book of one chapter.

### What adding a zip does

- It is unpacked into a folder of its own under the storage location's
  `documents/.incoming/`, with the same code and limits as an import
  ([security.md](security.md#archives)): a name that climbs out of the folder, an
  absolute name or a password refuses the whole zip; links and special files are never
  created; sizes and compression ratios are capped. That folder is always removed
  afterwards.
- Only audio files whose first bytes match their extension are kept. Everything else (a
  cover picture, a text file) is left out and listed when the job ends.
- **Order.** When every file has a track number (and disc number, where given) and no
  two are the same, the tags decide; otherwise the file names do, in natural order
  ("Chapter 2" before "Chapter 10").
- **Names.** A chapter's title is its own title tag, or else its file name. The book's
  title is what you typed, else LibriVox's title for a book recognised from the shelf,
  else the album tag all the files agree on, else the zip's name. The author is
  LibriVox's, or the artist (or album artist) all the files agree on. Readers are
  LibriVox's, or a tag named for a reader (`NARRATOR` or `READER`, ID3 `TXXX` with
  either, MP4 `©nrt`). Nothing is guessed: a field the sources do not give, or disagree
  about, is left empty.
- **Recognising a LibriVox book.** A zip whose name is that of a shelf book's zip (a
  browser's " (1)" on a second download is allowed for), or one added with **Add the
  downloaded zip**, and whose number of audio files is the number LibriVox lists, takes
  LibriVox's record: title, authors, readers, page, and its licence statement:
  "Public domain in the United States", with LibriVox's own words on other countries.
  A book not recognised is given no licence: the files do not say.
- The files go to `collections/audiobooks/<title>/`, named `001 <original name>` and so
  on, and are recorded as a book: one collection, one document per chapter in order
  (`book_chapters`), with `meta.audiobook` holding the author, readers, each chapter's
  running time and the LibriVox match. No new table was needed. Removing it under the
  book's page removes its files; Check files and Move work as for any book.

Tags and running times are read by Outpost's own small reader
(`apps/server/src/modules/documents/audio-tags.ts`): ID3 versions 1 to 2.4 and, for an
MP3's running time, the frame count of a Xing, Info or VBRI header, or else the bitrate of
a constant-bitrate file; MP4 atoms (M4A, M4B); Vorbis comments in Ogg (Vorbis, Opus) and
FLAC; a WAV file's INFO list. It reads at most the first 4 MB and the last 128 KB of a
file. Chapters marked inside one M4B file are not read: such a book plays as one long
chapter.

### Where it is in the Library

Under **Library → Documents, Type: Audiobooks**: each book once, however many files it
has, with its author and reader, chapters, running time and size, and "started on this
device" once it has been. The type filter is the way in, not a section of its own; a
line above the documents says how many audiobooks there are and shows them. A book is
also listed under Collections, as an audiobook. **Search** finds a book by its title,
author and reader (they are its description), a chapter by its title, and one recording
by its title and author. The words spoken are not transcribed, so they are not searched.

### Playing

A book's page (and an audio document's page; a chapter opened from search plays its
book from that chapter) has the player: the chapter and where you are in it, a
position bar, **Back 30** and **Forward 30** seconds, **Play** and **Pause**,
**Previous** and **Next** chapter, **Speed** (0.75× to 2×, remembered on the device),
and the chapters, each with its running time; pressing one plays it. At the end of a
chapter the next one follows.

- **From the server, a range at a time.** The player is a plain `<audio>` element given
  the document's file address, which answers byte ranges; nothing is transcoded.
  Whether a file plays is the browser's to say (`canPlayType`, and its own error): one it
  cannot play says so, names the kind of file, and offers it to download. Safari, for
  instance, has not always played Ogg.
- **Your place**, per book, is kept in the browser's own storage on this device
  (`outpost.audiobooks.places`, up to 200 books), never on the server: on pause, on a
  change of chapter, when the page is hidden or left, and at most every five seconds
  while playing. Opening a book and leaving keeps nothing. Coming back, the book is at
  that chapter and second, and the button says **Resume**. When the last chapter ends,
  the place is forgotten and the book starts again from the beginning.
- **The lock screen.** Where the browser has the Media Session API, the chapter, book and
  author are shown on the lock screen and in the notification shade, with play, pause,
  30 seconds back and forward, previous and next chapter, and seeking. It does not need
  a secure page; where it is missing the player works without it.
- **With the screen off.** A plain `<audio>` element is what phones keep playing when
  locked or in the background; no Web Audio is used. The next chapter is started from
  the `ended` event, which is what lets it follow on with the screen off where the
  browser allows that.
- **Leaving the page stops the book** where it is (and keeps the place). There is no
  player that follows you round the app.

**Power.** The player has no timer. While nothing plays, nothing runs. While it plays,
the time on screen follows the element's own `timeupdate` and is not redrawn while the
page is hidden. Measured on 17 November 2026 (headless Chromium at phone width, the
packaged app, an Apple M2 Max): a book's page, the Audiobooks list and Explore's
Audiobooks at rest, 0% of a core, no frames, no requests; playing, about 0.5% of a core
with the page visible and 0.1% hidden, and no requests but the file's own ranges. The
server's cost at rest with books held: 0%.

### Not tested

- **On a real phone.** Lock-screen controls, playing with the screen off and the next
  chapter following on while locked were not tried on an iPhone or an Android phone; the
  end-to-end test runs in a browser set up as a Pixel 7
  (`e2e/tests/audiobooks.mobile.spec.ts`), and the Media Session part is tested against
  a stand-in in a web test.
- **With a real LibriVox zip.** No recording was downloaded while this was built (see
  [sources.md](sources.md)). The tests use small files written for them: WAV, MP3, Ogg,
  FLAC and M4B with their tags. That LibriVox's zips arrive with the names on the shelf
  rests on the zip addresses LibriVox's API gives.
- On a Raspberry Pi.

### Code

| | |
| --- | --- |
| Audio file types, served in place | `apps/server/src/modules/documents/file-types.ts` |
| Tags and running times | `apps/server/src/modules/documents/audio-tags.ts` |
| Receiving, the add job, the list, the shelf | `apps/server/src/modules/audiobooks/` |
| The shelf's data | `catalog/audiobooks.json` |
| The player, its place on the device, the lists, the add window | `apps/web/src/features/audiobooks/` |



## Where Outpost makes a PDF

| Where | What the PDF is | In the library as |
| --- | --- | --- |
| Maps → **Print or save as PDF** | One page: the map at a stated scale, with scale bars, north and credits. See [maps.md](maps.md#printing-a-map). | "Map, *title or centre*, 1:25,000, 16 Nov 2026", tag `Map` |
| Radio → HF propagation, under the form once there is an answer | A prediction: the path, both stations as run, the sunspot number and its source, the frequency and every band hour by hour, the caveats. See [hf-propagation.md](hf-propagation.md#a-prediction-on-paper). | "HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026", tag `HF prediction` |
| The same screen, under "with one thing changed" | The comparison on screen: every row's figures by hour. | "HF comparison, …, months of the year, for …", tag `HF comparison` |
| Radio → HF coverage, under the legend | The coverage map as shown: its picture, legend, the grid in figures, the caveats. See [hf-propagation.md](hf-propagation.md#a-coverage-map-on-paper). | "HF coverage, London, 40 m, reliability at 12:00 UTC, for …", tag `HF coverage map` |
| Radio → Communication plans → a plan | The plan written out. See [hf-propagation.md](hf-propagation.md#exports). | "Communication plan, *name*, for 16 Nov 2026", tag `Communication plan` |
| Encryption → By hand → paper aids | One-time pads and the cipher square. A pad asks first; see below. | "One-time pads, …", tag `One-time pads`; `Cipher aid` |
| Contacts → Emergency sheet | The marked contacts, as on the sheet, with the date and time it was made. **Asks first**; see below. See [contacts.md](contacts.md#using-them). | "Emergency sheet, 3 contacts, made 16 Nov 2026", tag `Emergency sheet` |
| Preparedness → Nuclear preparedness, under the results | The scenarios shown, each under its letter, with a map of its rings (and of its fallout pattern) unless maps are switched off, and an overview map when there are several. With saved places ticked, **asks first**. See [nuclear-preparedness.md](nuclear-preparedness.md#on-paper). | "Nuclear effects scenario: *name*", tag `Nuclear effects scenario` |
| Maps → Sun tab, or a place's Sun section | Sun times day by day for two weeks, a month or a year. See [maps.md](maps.md#sun-times-on-paper). | "Sun times, Helvellyn, November 2026", tag `Sun times` |
| Radio → Frequencies | The frequencies chosen, as a sheet. | Tag `Frequencies` |
| Tools → Power and batteries → a saved plan | The plan worked out: loads, battery, charging, how long it lasts. | Tag `Power plan` |
| Tools → Water, "Making water safe to drink"; Tools → Cooking, "Safe cooking temperatures" | The official guidance as quoted on the screen, with the date it was read. | Tag `Guidance` |
| Tools → QR codes | The code and what it holds. A code holding a Wi-Fi password or someone's contact details **asks first**. | Tag `QR code` |
| Tools → Solar clock, Sundial and Nocturnal tabs | A template to cut out, for the place and date chosen. | Tags `Sundial template`, `Nocturnal template` |
| Preparedness → Supplies, the shopping list | What is missing, as a list to take to the shop. | Tag `Shopping list` |
| Library → Learning, under "On paper" | Each learner's courses: where they got to, pages opened and done, time this week, the topic counts. **Asks first**; see below. See [learning.md](learning.md). | "Learning progress, Sam, 17 Nov 2026", tag `Learning progress` |
| Preparedness → Emergency plans → a plan's cards | Wallet cards, a fridge sheet or a grab list. **Asks first**: it holds the household's names and numbers. | "Wallet cards, *plan*, 16 Nov 2026", tag `Wallet cards`, `Fridge sheet` or `Grab list` |

Every one of them offers the same three things, in the same words:

- **Save as PDF.** A link to the file, which the browser saves. It is a plain link and
  not a button that starts a download, because a plain link is the only kind a phone's
  browser will follow.
- **Add to library.** Sends the same bytes to the library. This does not go through the
  device's own files at all, so it works where saving does not: from a phone's Home
  Screen a link that saves a file has not always done anything
  ([encryption.md](encryption.md#printing-from-a-phone)). Where Outpost was opened that
  way, this is the main button and saving stands second.
- **Share**, where the device has a share sheet that takes files.

## What "Add to library" does

It uploads the file through `POST /api/documents`, the route the Library screen's own
**Add documents** uses. There is no second way in on the server. So a PDF made here gets
exactly what any file gets: the check that it is a PDF, the checksum, the duplicate
check, the free-space check, a folder of its own on the storage location, the reading
of its text, search, and a place in backups.

What the screen adds to the request, and why:

- **Where it goes.** The category **Made in Outpost**, so that everything made here can
  be listed together in the Library (filter by category) and told apart from what was
  brought in. **Change where**, under the buttons, sets another category; the choice is
  kept in the browser (`outpost.library.madeCategory`) and used from then on, on every
  screen that makes a PDF. It is not asked each time. The library has no folders or
  collections of a person's own; a category is the nearest thing it has to one.
- **What it is called.** The title in the table above: what it is, of what, and for
  when. The file is named from the title
  (`hf-prediction-london-to-edinburgh-20-m-for-16-nov-2026.pdf`).
- **A tag** saying what kind of thing it is.
- **Where it came from.** The document's **Source** reads "Made in Outpost from the
  communication plan “Family net”: /radio/plans/…". On the document's page, under that
  field, a line says Outpost made the file and links back to the plan, the planner or
  the same ground on the map **as it is now**, which may not be as it was when the file
  was made. A saved prediction has no address of its own, so its link goes to the
  planner, where saved predictions are listed; the source names the one it was.

What the person sees afterwards:

- **While it is sent:** a progress bar that moves with the bytes the server has taken,
  the size of the file, and **Stop**. Once every byte is sent and the server is filing
  it, the bar says so. Leaving the page while it is under way asks first.
- **Added:** "Added to the library under “Made in Outpost” as *title*", the title being
  a link that opens the document. It can be found by search once its text has been read,
  which for these files takes a second or two.
- **Already there:** if the library holds the same bytes, nothing is added and the
  screen says "Already in the library as *title*, added on *date*", with a link to that
  one. There is no "add anyway" here.
- **No room:** the server's sentence naming the storage location, the size of the PDF,
  and a link to Storage. The file is still in the page to save or to try again with.
- **Storage away:** the same, saying the location is not connected.
- **No answer:** that Outpost did not answer, and that the PDF is still there to try
  again with.
- **Stopped:** that nothing was added.

### When two files are the same file

The duplicate check is by checksum, so "the same PDF" means the same bytes.

- **A prediction, a comparison and a coverage map** are dated by the moment the engine
  answered, not the moment of printing, and say nothing about when they were printed.
  The same answer written out twice is the same file. Asking the same question again
  finds the answer already worked out, with the same date, so that is the same file too,
  until the engine or its data changes or the kept answer is cleared.
- **A communication plan** says the day it was written out, and the file's own date is
  that day. Written out twice in a day it is the same file; the next day it is another.
- **Nuclear scenarios** are dated by the scenarios' own last change. Made again
  unchanged, with or without maps, the file came out the same, byte for byte, in the
  tests (the maps are drawn again each time, from the same tiles by the same device), so
  the library says it already has it. A different device, or a map region installed
  or removed in between, can draw the pictures differently: then it is another document.
- **Sun times** say the day they were made, and the file's date is that day: the same
  sheet made twice in a day is the same file.
- **The emergency sheet** says the minute it was made, so it is made afresh each time
  the screen is opened, and each is another document. That is deliberate: a copy should
  say how old it is. Delete older ones in the Library.
- **A map page** is a picture drawn again each time it is made, and carries the time it
  was made. The file made once and added twice is one document; the same page made
  again is another document. Delete the older one in the Library if it is not wanted.

### What the library can read in them

The PDFs are written by Outpost's own writer
(`apps/web/src/features/maps/print/pdf.ts`). Their text is real text in Helvetica and
Courier, two of the typefaces every PDF reader supplies; the file names them and does
not carry them. The library's reading of PDFs (pdf.js, through `unpdf`) reads that text
without the fonts: this is checked end to end, by adding a prediction and a plan and
reading back the rows of their Courier tables from `GET /api/documents/:id/text`
(`e2e/tests/made-pdf.spec.ts`, `plans.spec.ts`).

A **map** is a picture, and a picture cannot be searched. So its page also carries, as
text over the map that is in the file and drawn in no ink (PDF text rendering mode 3,
the way a scanned page carries its OCR text), a few sentences saying what the map
shows: its title, how much ground and where (centre, corners, Maidenhead locator), the
scale and paper, the day, the person's saved places and routes that were ticked for the
page, and the names that were actually drawn on the map (those the map gave room to;
a name left out because it would overlap another is not listed). A search for a hill on
the map then finds the map. A name in a script the PDF's typeface cannot write is left
out and counted. At most 250 names are listed. `e2e/tests/maps-print.spec.ts` adds a
page and checks that this is what the library read.

A **coverage map**'s picture carries its values by colour. The page repeats the grid in
figures (one character to a cell) so that the values survive a grey printer and can be
read as text.

## Paper aids: a pad asks first

The one-time pads and the cipher square on the Encryption screen can be printed, saved
as a PDF, and added to the library like every other PDF Outpost makes.

A one-time pad is a secret that should exist as two sheets of paper and nowhere else.
The library is the opposite of that: Outpost has no accounts, so every document can be
read by everyone who can reach it on the network; documents are in every backup and on
every portable drive; and their text is in the search index. So for a pad **Add to
library** asks first, in those words, and nothing is sent unless the question is
answered yes. It is there for pads made for practice or teaching, and for a person who
has decided a copy need not be secret. The warning beside the saved file says the same.

The cipher square is not a secret and is added with no question.

## The emergency sheet asks first

The emergency sheet is other people's names, numbers and addresses. They are already
readable by everyone on the Contacts screen; adding the sheet to the library adds a
second copy that search reaches, that goes into every backup and onto portable drives,
and that does not change when a contact is corrected or removed. So **Add to library**
asks first, saying exactly that (`confirm` on `PdfButtons`), and nothing is sent unless
the answer is yes. The sheet carries the date and time it was made, so a copy found
later says how old it is. Saving the PDF to the device asks nothing.

## Learning progress, on paper

The Library's **Learning** tab lists, for one learner or for everyone, the courses they
opened in the reference collections and where they got to ([learning.md](learning.md)).
Its PDF is a record of what a child has covered, which a household may want on paper.
Progress itself is kept out of search; a PDF of it in the library is searched like any
document, goes into every backup and onto drives, and does not change when the progress
does. So **Add to library** asks first, saying that. The sheet is dated by the day it was
written out.

## Letters the typefaces cannot write

The writer's typefaces (Helvetica and Courier, which every reader supplies) can write
Western European letters and nothing else. Where a sheet has to show a person's name or
an address in any other script, a "?" is not acceptable, so:

- **The line is drawn as a picture** by the browser, at 300 to the inch, in the
  device's own type, where its letters would have stood, and made smaller if it would
  be wider than its column (`apps/web/src/features/maps/print/lettering.ts`). The
  browser joins and orders every script the device can show (Arabic, Hebrew, Indic
  scripts), which a font carried in the file could not do without a shaping engine.
- **The words are kept in the file, unseen**, over the picture, so that the library's
  search and a screen reader find them. The writer gives such words a Type 3 font whose
  every glyph draws nothing, with a ToUnicode map saying which character each code is
  (256 to a font; a file that needs more has more fonts). Right-to-left words are put in
  the order they stand on a page, so that pdf.js reads them back in reading order.
  `pdf.test.ts` reads Greek, Arabic, Hebrew, Polish, an emoji and 300 Chinese
  characters back exactly; `more-pdfs.spec.ts` searches the library for a Greek name
  only a picture shows.
- **If the device will not draw**, each run of such letters is printed "[?]" and the
  sheet and the screen say how many entries were affected.

Carrying a font instead was looked at. The fonts Outpost ships (Atkinson Hyperlegible
Next, Atkinson Hyperlegible Mono and Literata, all under the SIL Open Font License,
which allows embedding a subset) are WOFF2 files of Latin, Latin Extended and, for
Literata, Greek, Cyrillic and Vietnamese: no Arabic, Hebrew, Indic or Chinese. Using
them would need a Brotli decompressor and a TrueType subsetter written here (variable
fonts at that), and would still print "?" for most of the world's scripts. Pictures
cover whatever the device can show. The cost: the picture is not sharp at any size (it
is 300 to the inch), and its letters cannot be selected as they look; the unseen words
can.

Used by the emergency sheet and sun times (a saved place's name). The other PDFs still
print "?" for such letters and say which (the prediction, comparison and plan; the map
page draws only its title as a picture, without the unseen words).

## Not done

What else in Outpost prints or makes a file, and why it has no PDF (checked by reading
the web app for `window.print`, `usePrinting`, print stylesheets, `download` links,
blobs and exports, November 2026):

- **A route's details and elevation profile**, **a saved place list**, **the repeater
  list**: each exports a file for another program (GPX, or CHIRP and other radio
  formats), nothing prints. A PDF of each would be a new document (a route card with
  its profile drawn, a repeater table) to design; not asked for, not built.
- **Notes** export as Markdown and are already in search. **A recording** exports GPX.
  **Contacts** export as vCard. **Backups**, the semantic index and the HTTPS
  authority's certificate are files for a machine, not for reading.
- **Keys and encrypted files** on the Encryption screen are saved as files on purpose
  and must not go to the library.
- **The radio reference sheets.** They are Markdown documents already in the library.
- **The set-up guide and the trust-store steps** (Settings → HTTPS) are screens with
  nothing to print.
- **A PDF of the contact log's comparison with predictions.**
- **A link back to one saved prediction or one saved coverage map.** Neither has an
  address of its own; the link goes to the screen that lists them.
- **Choosing a storage location** for a PDF made here. It goes where new documents go.
- **Not tried on a real phone.** The flows were run in a desktop browser and in a
  browser set up as a Pixel 7 (`e2e/tests/made-pdf.mobile.spec.ts`,
  `maps-print.mobile.spec.ts`). iOS Safari, and Outpost opened from an iPhone's Home
  Screen, were not tried; what is said above about them rests on the sources in
  [encryption.md](encryption.md#printing-from-a-phone).

## Code

| | |
| --- | --- |
| What a made PDF is, its source, its category, the upload | `apps/web/src/features/library/made/made-pdf.ts` |
| The buttons, the status, the hook that holds both | `apps/web/src/features/library/made/pdf-actions.tsx` |
| The line under a document's Source that leads back | `apps/web/src/features/library/made/made-in-outpost.tsx` |
| The emergency sheet as pages | `apps/web/src/features/contacts/emergency-document.ts`, `emergency-sheet.tsx` |
| Sun times as pages, and the buttons in the Sun tab | `apps/web/src/features/maps/lib/sun-document.ts`, `panels/sun-pdf.tsx` |
| Lines drawn as pictures; words in any script, unseen | `apps/web/src/features/maps/print/lettering.ts`, `pdf.ts` |
| The guard that nothing prints or makes a PDF without the actions | `apps/web/src/lib/made-pdf-rule.test.ts` |
| A prediction and a comparison as pages | `apps/web/src/features/propagation/prediction-document.ts`, `comparison-document.ts`, `prediction-export.tsx` |
| The nuclear scenarios as pages, and their maps | `apps/web/src/features/nuclear/document.ts`, `print-maps.ts`, `print-frames.ts`, `print-figures.ts`, `pdf-export.tsx` |
| A coverage map as pages, and its picture | `apps/web/src/features/propagation/coverage-map/coverage-document.ts`, `coverage-picture.ts`, `coverage-export.tsx` |
| A plan's PDF | `apps/web/src/features/propagation/plans/plan-export.tsx`, `document.ts` |
| A map's words | `apps/web/src/features/maps/print/map-words.ts` |
| Learning progress as pages | `apps/web/src/features/learning/progress-document.ts`, `learning-panel.tsx` |
| The upload, with `title` and `source` | `apps/server/src/modules/documents/upload.ts` |
