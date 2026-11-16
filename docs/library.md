# The library, and PDFs made in Outpost

The document library holds the files a person has added: PDFs, EPUB books, Markdown,
text, HTML and images. Each file is checked to be what its name says, given a checksum,
refused if the library already holds the same bytes, stored on a storage location, read
for its text as a background job, and indexed for search. It is opened in Outpost's own
readers, it is in backups, and it travels on a portable drive. The routes are in
[api.md](api.md#documents), what is and is not trusted in
[security.md](security.md#files-people-upload), where files are kept in
[storage.md](storage.md), and how search reads them in [search.md](search.md).

This page is about one thing: **a PDF that Outpost makes can be added to the library
from the screen that made it.**

## Where Outpost makes a PDF

| Where | What the PDF is | In the library as |
| --- | --- | --- |
| Maps → **Print or save as PDF** | One page: the map at a stated scale, with scale bars, north and credits. See [maps.md](maps.md#printing-a-map). | "Map, *title or centre*, 1:25,000, 16 Nov 2026", tag `Map` |
| Radio → HF propagation, under the form once there is an answer | A prediction: the path, both stations as run, the sunspot number and its source, the frequency and every band hour by hour, the caveats. See [hf-propagation.md](hf-propagation.md#a-prediction-on-paper). | "HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026", tag `HF prediction` |
| The same screen, under "with one thing changed" | The comparison on screen: every row's figures by hour. | "HF comparison, …, months of the year, for …", tag `HF comparison` |
| Radio → HF coverage, under the legend | The coverage map as shown: its picture, legend, the grid in figures, the caveats. See [hf-propagation.md](hf-propagation.md#a-coverage-map-on-paper). | "HF coverage, London, 40 m, reliability at 12:00 UTC, for …", tag `HF coverage map` |
| Radio → Communication plans → a plan | The plan written out. See [hf-propagation.md](hf-propagation.md#exports). | "Communication plan, *name*, for 16 Nov 2026", tag `Communication plan` |
| Encryption → By hand → paper aids | One-time pads and the cipher square. **Not offered to the library**; see below. | — |

Every one of them except the paper aids offers the same three things, in the same
words:

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

## Not done

- **The contacts emergency sheet as a PDF.** It prints from the browser and has no PDF.
  It needs a table laid out by the PDF writer, and names outside Western European
  letters drawn as pictures or written in a font carried in the file (the writer has
  neither a carried font nor a table with wrapped cells). When it is built, adding it to
  the library will put other people's names and numbers into search and backups; they
  are already readable by everyone on the Contacts screen, and the shared buttons can
  ask before adding (`confirm` on `PdfButtons`), which nothing uses yet.
- **Sun times for a place as a PDF.** Needs a page design (a year's table, or a month's)
  and the map's sun code run for each day; nothing of it is started.
- **The radio reference sheets.** They are Markdown documents already in the library.
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
| A prediction and a comparison as pages | `apps/web/src/features/propagation/prediction-document.ts`, `comparison-document.ts`, `prediction-export.tsx` |
| A coverage map as pages, and its picture | `apps/web/src/features/propagation/coverage-map/coverage-document.ts`, `coverage-picture.ts`, `coverage-export.tsx` |
| A plan's PDF | `apps/web/src/features/propagation/plans/plan-export.tsx`, `document.ts` |
| A map's words | `apps/web/src/features/maps/print/map-words.ts` |
| The upload, with `title` and `source` | `apps/server/src/modules/documents/upload.ts` |
