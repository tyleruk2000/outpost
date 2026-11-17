# Search

This page describes what the search box understands, what is searched, how results
are ranked, how to turn on optional semantic search ("search by meaning"), and how to
have a language model of your own write an answer from what was found.

Keyword search is always available and needs no set-up. Semantic search is optional
and off by default. So is reading the text of scanned pages and images
([OCR](#scanned-pages-and-images-ocr)).

## Two places to search

- **Quick search** is the field at the top of the sidebar (the magnifying glass in the
  phone's top bar; <kbd>/</kbd>, or <kbd>Ctrl</kbd> or <kbd>⌘</kbd> <kbd>K</kbd>, from
  anywhere). It opens over the screen you are on. Under **Go to** it lists the screens
  of Outpost and the sections of Settings that match what you type, by their names and
  by the everyday words people use for them: "food" offers Preparedness: Supplies,
  "backup" opens Settings at its Backup section, "dark mode" Settings at Appearance,
  "wifi" Tools: QR codes. A word that no screen answers ("torch") offers none. Under
  that, the best matches in your library, as you type, and **See all results**, which
  opens the Search screen.
- **Search** (in the sidebar below that field, and in the phone's More sheet)
  is the whole screen: every result, a tab for each kind, the reference collections,
  and Answer from my library. When a screen of Outpost matches what you typed, it is
  offered at the top under **Go to**, as in quick search: "safe drinking water" offers
  Tools: Water, which holds the treatment tables.

**The guides under Help** (these pages of Outpost's documentation, inside the app) are
found under **Go to** too, after the screens and at most six at a time: by each guide's
name, its everyday words, and the names of its sections. "raspberry pi" offers the part
of the guide to installing Outpost about the Raspberry Pi, and "restore a backup" the
parts about restoring. They are Outpost's own pages, not part of your library, so they
are not in the library's search index, are not among its results, and are never sent
to a model server to answer a question.

## Seeing how it works

**How search works** (the "How were these found?" link under any search, or
`/search/how-it-works`) follows one question of yours through every step on your own
library and shows what each step produced:

1. the whole journey as a diagram, with the time each step took;
2. how a document was cut into overlapping passages;
3. search by words: how rare each of your words is, and how that and repetition make
   the score;
4. search by meaning: vectors, the angle between them, and a map of the passages;
5. how the two ranked lists are combined, with the constant and the weights adjustable
   on the page to see what would change;
6. the numbered sources a language model is given;
7. the exact prompt [Answer from my library](#answers-from-your-library) sends to your
   own model for that question (the page shows it; it sends nothing);
8. what can go wrong at each step, and how to tell.

Everything on that page comes from the same code as real search. Two things to know
when reading it:

- While search by meaning is off, or its index is not built, the "meaning" steps use
  [demonstration vectors](#demonstration-vectors), and the page says so. They
  show the mechanics; they are word matching by another route, not understanding.
- The ranking steps cover everything search covers, including catalogue listings and
  saved places. The context step keeps only passages from your documents and pages,
  because those are what a model should quote from.

## Answers from your library

Optional, and off until you set it up. With a language model running on your own
machine or network (through Ollama, llama.cpp or LM Studio), the Search screen offers
**Answer from my library** above the results. Pressing it:

1. searches your documents, notes and book chapters for what the question is about
   (the question's small words, such as "how" and "should", are left out, and the
   answer says which words were searched for);
2. sends the best passages, numbered, to your model with the question and a fixed set
   of rules: answer only from these, cite the number after each statement, say so when
   they do not hold the answer;
3. shows the answer as it is written, under the heading "Generated answer" and the
   model's name, with the passages it was given listed beneath.

The results list does not change and stays underneath. An answer can be stopped. Its
`[n]` markers show the quoted passage and open the source; a marker that matches no
passage is struck through; an answer that cites nothing is called out. If no passage
matches, the model is not asked at all.

Things to know:

- **Outpost includes no model and downloads none.** You install a model server and
  fetch a model yourself. [ai.md](ai.md#setting-it-up) has the steps, suggested small
  models with their sizes, and the settings.
- **Your question and the passages are sent to the model server you configured**, and
  nowhere else. By default that is a program on the same machine.
- **Reference collections are not read.** Articles in ZIM archives are not split into
  passages, so an answer never draws on Wikipedia, even when reference articles appear
  in the results below it.
- **Nothing is kept.** No question or answer is stored on the server or in the
  browser; an answer goes when the tab is closed or reloaded.
- **It is one question and one answer.** There is no conversation and no follow-up.
- **It has been measured with two small models, on a small test library.** The larger
  of the two answered about nine in ten of the questions the library held; the smaller
  is not reliable. See [ai.md](ai.md#measured-with-a-real-model) for the figures and
  for what has not been tried.

### Which passages an answer is given

Search ranks documents and shows a few passages of each. An answer needs the best
passages, whichever documents they are in, and as few beside-the-point ones as
possible: a small model handed a passage that shares a word with the question will
often answer from it. So answers, conversations that use the library, and the
retrieval API rank passages one by one, by this rule:

1. **By words.** The passages that hold every word of the question, in the full-text
   index's own order. If fewer do than are wanted (five, for an answer), passages that hold only some of the words
   are added, but only those that hold at least half of what the question is about:
   each word is weighed by how rare it is in your library, so "countryside" counts for
   much more than "say". A word the library does not hold at all counts as one found
   in a single passage. A passage that falls short is not handed over, and if none is
   left, nothing was found and the model is not asked.
2. **By meaning**, when search by meaning is on. The passages nearest the question,
   kept only if their similarity to it is at least 0.3 and within 0.2 of the nearest
   one's. A passage that holds some of the question's words stays whatever its
   similarity.
3. **Fused.** The two lists are combined passage by passage with the same reciprocal
   rank fusion as [hybrid ranking](#hybrid-ranking), so a passage both found comes
   first. Only passages that hold every word count as found by words here; the ones
   that hold some of them count only if meaning found them too, or if nothing else was
   found at all.
4. **The same text is taken once.** A file kept in two places would otherwise fill two
   of the five places.

Up to five passages are handed over. The three thresholds (half, 0.3 and 0.2) are
fixed in `apps/server/src/modules/search/service.ts`; they were chosen on the test
library described in [ai.md](ai.md#measured-with-a-real-model), which is small, and the
similarity figures are those of the embedding model that comes with Outpost.

*How search works* shows the two lists and their fusion passage by passage for a
question of yours. It does not apply the thresholds or the top-up of step 1, so the
passages it lists under "the numbered sources" can be more than an answer would be
given.

## Keyword search

### What you can type

| You type | It means |
| --- | --- |
| `water filter` | Both words must appear. |
| `"chlorine dioxide"` | The exact phrase. |
| `water -pool` | "water", but not items that mention "pool". `-"swimming pool"` excludes a phrase. |
| `clov` | The last word matches as a beginning while you are still typing it, so this finds "clove". A space after the word, or a closing quote, turns that off. |

Details:

- Word forms are matched for English: "boil" finds "boiling" and "boiled".
- Accents and capital letters are ignored: "wäter" finds "water".
- Punctuation is treated as a space. Operators such as `AND`, `OR`, `NEAR(` or
  `title:` have no special meaning; they are searched for as words.
- A query can be up to 500 characters long.
- A query made only of exclusions returns nothing.

### When nothing has every word

If no item contains all of your words, Outpost searches again for items containing
**any** of them and says so: "No single item had every word, so these match some of
them." In the API response this is `relaxed: true`.

### What is searched

| Kind | What is indexed |
| --- | --- |
| Documents | Title, author or file name, category, tags, and the text read from the file, page by page for PDFs. For scanned pages and images, the text read by OCR once that has been run. A chapter of a book is a document, shown with its book's name. In a Markdown file, a signal figure (a `viz` block) is searched by its title and caption and a Mermaid diagram's source is not searched at all |
| Notes | Title, the titles of parent pages, tags, and the text under each heading |
| Installed collections | Title, publisher and description |
| Catalogue entries | The entries listed in Explore, so you can find something to download |
| Map markers and tracks | Names and notes |
| Contacts | Name, title and organisation, tags, phone numbers, email and postal addresses, callsign, channels, the emergency note and the contact's own note |
| Repeaters | Callsign, town and frequency, from the repeater list itself (not split into passages; up to 50 found) |
| Places in reference layers | Names of the features in installed reference packs, opened on the map (up to 30 found) |
| Reference articles | Articles inside installed ZIM archives; see [below](#reference-collections-in-results) |

Pages in the notes trash, and your own page templates, are not searched. Nor is the
household board ([messages.md](messages.md)): its messages are not added to search and
are never sent to a model server.

Text is split into passages of about 1,200 characters with a 150-character overlap
(**Settings → Reading documents**, or the `indexing.chunkSize` and
`indexing.chunkOverlap` settings). A passage never crosses a page or a heading, so a
result can point at the exact page. Changing these settings affects documents added or
re-read afterwards.

Scanned PDFs and images have no text of their own. They are stored and can be opened,
and are found by title and tags; their contents become searchable once OCR has read
them, which happens only when you ask (see [below](#scanned-pages-and-images-ocr)).

### Ranking

Results are ranked with BM25, a standard relevance formula, over four fields with
these weights:

| Field | Weight |
| --- | --- |
| Title | 8 |
| Tags | 4 |
| Heading | 3 |
| Body text | 1 |

Passages are grouped by the item they belong to. An item is ranked by its best
passage and shows up to three matching passages, with the matched words marked. The
percentage next to a result is relative to the best match of that search, not an
absolute score.

A PDF result opens at the page of the match.

**What is on this device comes first.** An entry of the catalogue ("Available to
download") would have to be downloaded before it could be opened, and with the internet
down it cannot be. So however well one matches, it comes after everything that can be
opened now: your documents, pages, collections, places, contacts and the rest are
ranked by the formula above, and catalogue entries after them, ranked the same way
among themselves. The order holds from one page of results to the next. On the
**Everything** tab the catalogue entries are listed apart, last of all, under
**Available to download**: after your own results and after **In reference
collections** (articles in archives already on this device). That group is added once
the reference collections have answered, so that nothing moves under your finger when
it comes. In quick search they are the last group too. The **Available to download**
tab lists them alone, as before. Measured on the demonstration library (2,306 passages,
600 searches of 20 queries from one to four words, with this machine busy): 2.8 ms
median and 8.0 ms at the 90th percentile from asking to answer before, 2.6 to 2.7 ms
and 8.6 to 8.8 ms after. The query itself takes about 0.7 ms longer on average when a
word matches more than 800 passages, and the same otherwise.

### Filters

- **Kind.** The tabs above the results ("Everything", then one per kind with a count)
  restrict results to one kind. In the API: `kinds=document,note`.
- **Tag.** In the API: `tag=first aid` keeps items carrying that tag.
- **Mode.** When semantic search is ready, a switch offers "Best of both" (hybrid),
  "Exact words" (keyword) or "By meaning" (semantic). In the API:
  `mode=hybrid|keyword|semantic`.

See `GET /api/search` in [api.md](api.md#search).

### Reference collections in results

Articles inside ZIM archives are not copied into Outpost's index. When you search,
Outpost asks kiwix-serve to search every installed archive, and takes each archive's
best matches: enough to make about twenty in all, at least three from each and at most
ten.

**Your own results do not wait for this.** Documents, pages, places, routes, catalogue
entries and collections are found in Outpost's own index in a few milliseconds and are
shown at once. Archives are searched by kiwix-serve one after another, and on a slow
drive or a network share one archive can take seconds. So the search page and the
palette ask for the two apart:

- On the search page, "Still searching reference collections…" shows under the count of
  your own results, with how many collections have answered. Each collection's best
  match is added to **In reference collections**, below your own results, as that
  collection answers. The **Reference** tab lists every article found, up to the number
  above from each collection, twenty to a page.
- In the palette, the first five collections to answer each add their best match in a
  last group, **In reference collections**.
- Nothing already on the screen moves when articles arrive. They are only ever added
  at the end, in the order the collections answered, which is roughly smallest archive
  first. They are not merged into the ranked list of your own results: a merge would
  reorder a list you are already reading, and the two cannot be compared anyway (each
  archive ranks only its own articles).
- A collection that does not answer within 8 seconds of its turn, and any collection
  not reached within 30 seconds of the search starting, is left out, and a note names
  it. Its search is let finish and its answer kept for five minutes, so searching again
  for the same words has it at once.
- Typing something else drops the search of collections that have not had their turn.

The counts on the tabs for your own kinds come from Outpost's index and do not change
when articles arrive. The count on **Reference** is the number of articles found so
far.

Why it works this way, measured against kiwix-serve 3.8.2:

- kiwix-serve works on four requests at a time and makes the rest wait inside it. It
  finishes a search even when whoever asked has gone: with one working thread, a small
  request sent behind a dropped search waited 83 to 89 ms, against 1.5 ms alone. So
  before this, a search sent 24 archive searches at once, and typing three letters left
  72 of them queued where they could not be taken back, with anyone reading an article
  waiting behind them. Outpost now sends three at a time, one fewer than kiwix-serve
  works on so that reading stays quick, and keeps the rest in a queue of its own, where
  dropping one costs nothing. On a fast disk this is no slower: 24 searches of real
  archives took 60 ms sent all at once and 68 ms three at a time.
- On the installation this was built for (29 archives on a network share, the machine
  under heavy load), one archive took 1.3 to 7.2 seconds to search the first time and
  14 to 38 ms once what it read was in memory; asking one archive for ten results
  instead of one took about four seconds longer the first time. The whole search took
  7 to 20 seconds and showed nothing until the slowest archive had answered. That is
  why each archive is asked for few results, and why none holds back another.
- kiwix-serve can search several archives in one request. It was not faster (67 ms for
  six archives in one request against 27 ms for six requests), and it gives one answer
  when the slowest archive is done, so it is not used.

Through the API, `GET /api/search` still answers in one part unless asked otherwise:
reference articles are merged with your own results by rank, taking each archive's
best matches in turn so that one large archive does not crowd out the rest. It waits
at most 10 seconds for archives and names in `warnings` any that are missing. Ask with
`reference=later` and then `GET /api/search/reference` for the two parts; see
[api.md](api.md#search).

- Turn this off with **Settings → Search → Search inside reference collections**
  (`search.includeReference`).
- If kiwix-serve is not running, your own results still appear, with a note under
  **In reference collections** saying why reference articles are missing.
- Each reference collection also has its own search box in the reader.
- A collection that is a set of documents with a list (see
  [troubleshooting.md](troubleshooting.md#a-collection-opens-as-a-list-of-documents))
  has no articles for kiwix-serve to search. Its documents are found by their titles
  and authors instead: every word typed must start a word of one or the other. A result
  that is one PDF, e-book, recording or film opens it in the reader; any other opens
  the collection's list at that document. The text inside the files is not searched
  until a file is added to your library. Outpost reads each such list once after it
  starts and keeps it in memory, up to 50,000 documents across all collections; past
  that, the list used longest ago is found by search again only after it is next opened.

## Scanned pages and images (OCR)

A scanned PDF is a set of pictures of pages, and a photograph of a notice is a picture
of words. Neither has text a computer can search until something reads the picture.
Outpost can do that reading (optical character recognition, OCR) on the machine it runs
on. Nothing is sent anywhere, and nothing is downloaded to do it.

It is **off by default**, because it is slow and it makes mistakes.

### Using it

- A document with scanned pages, or an image, offers **Read text from the scanned
  pages** (or **Read text from this image**) above its pages and under **Details → Text
  for search**. The work is a background job with progress, and can be stopped. One
  document is read at a time.
- **Settings → Reading documents → Read text from scans automatically** does the same
  for every new document as it is added (`ocr.auto`).
- What was read is stored with the document's other text, so it is found by keyword
  search, page by page for a PDF, and by semantic search where that is set up. The
  document says that its text was read by OCR, and **Show the text** shows exactly what
  was read, each page marked.
- Only pages with no text of their own are read. Text that is in the file is never
  replaced by a reading of its picture. **Read text again** reads the file again and
  keeps what OCR read.
- Stopping keeps the pages read so far and offers **Read the remaining scanned pages**.
  A restart continues where it left off. **Read the scanned pages again** throws the
  earlier reading away and starts over.
- OCR writes only to Outpost's data directory (`extracted/`). The original file is
  opened for reading and nothing else.

### What to expect

OCR reads print well and handwriting badly. It gets words wrong on poor scans, small
type, unusual typefaces, tables, and anything not in a language it has been given. The
pages themselves remain the record; treat the text as a way to find them.

Two measurements, on the test pictures in the repository and on pages made for the
purpose, with the engine as shipped (Apple M2 Max, one processor core):

- A clean page of 462 words at 300 dots per inch took about 3 seconds, and every word
  came back right. That is clean, computer-set type in one typeface: the best case.
- The same page as a 100 dpi, blurred, noisy JPEG came back with errors ("shelter" as
  "shefter", "litre" as "ie").

A Raspberry Pi will be many times slower; nobody has measured it.

### How it works

- The engine is [Tesseract](https://github.com/tesseract-ocr/tesseract) 5.1 compiled to
  WebAssembly (`tesseract.js-core`), with its neural-network recogniser and Tesseract's
  English model (the integer form of `tessdata_best`, as the tesseract.js project
  packages it). Both are part of the installation, including
  the Docker image and portable drives. There is no native code, so it runs wherever
  Node does.
- It runs in a worker thread of its own, so the server stays responsive.
- An image is handed to the engine as it is. A PDF page is rebuilt from the pictures
  placed on it (which is all a scanned page is), using the same PDF library that reads
  PDF text. JPEG, fax (CCITT Group 4), JPEG 2000 and uncompressed scans, one-bit
  stencils and pages cut into strips have been tried this way. JBIG2 scans go through
  the same library's decoder and have not been tried.

### Limits

| Limit | Value |
| --- | --- |
| Pages read in one go | 1,000 scanned pages of one PDF; the rest are offered afterwards. Pages beyond **Most pages read from one PDF** are not read at all. |
| Largest picture decoded | 40 million pixels (an A4 page at 600 dpi is about 35 million). Larger pictures are skipped. |
| Size a page is read at | Its own resolution, up to 300 dpi and 12 million pixels. Finer scans are scaled down. |
| Largest files | Images of 64 MB, PDFs of 512 MB. |
| Image types | PNG, JPEG, GIF (the first frame) and WebP. Not SVG. |
| Sure enough to keep | A page the engine scores below 50 out of 100, whichever way up, is treated as having no text, so that marks which only look like writing are not indexed as words. When tried, such marks scored 24 to 44 and real text 73 or more. |

Things it does not do:

- **Text drawn as shapes.** Only pictures on a page are read. A PDF whose words were
  converted to outlines, or drawn as lines, has no picture to read. That would need a
  full PDF renderer, which needs native code.
- **Pages the wrong way up, reliably.** A page turned in the PDF itself, or a photo
  the camera marked as turned, is simply turned. A page scanned upside down or on its
  side is noticed only because its first reading scores badly (below 60 out of 100);
  the other three ways up are then tried and a clearly better one kept, which takes up
  to four times as long for that page. A poor scan lying on its right side can score
  well while only part of it is read.
- **Layout.** Columns are read in order; tables and forms come out as lines of words.

### Other languages

English is built in. Another language works once its Tesseract data file is on the
machine. Outpost does not download language data in this version; it uses only what
you put there:

1. Get `<code>.traineddata` for the language (for example `deu.traineddata` for German)
   from Tesseract's [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) or
   `tessdata_best` collection. A `.traineddata.gz` file also works.
2. Put it in `<data directory>/ocr/tessdata/`.
3. Set `ocr.languages` to the codes to read, joined by `+`, most likely first:

```bash
curl -X PATCH "http://localhost:8080/api/settings" \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"ocr.languages": "deu+eng"}'
```

`GET /api/ocr` lists the languages found and says if one that is asked for is missing.
More languages at once is slower. Documents already read are not read again on their
own: use **Read the scanned pages again**. Language files are not part of a backup or a
portable drive; copy them yourself.

## Semantic search

Semantic search ("search by meaning") finds passages about the same thing even when
they share no words with your query. It needs an **embedding model**: a program that
turns text into a list of numbers (a vector). Outpost stores one vector per passage and
compares them with the vector of your query.

A small model is **built in**: it is part of the packaged app, the Docker image and
portable drives, and there is nothing to install or download. It is **off by default**,
because building the index takes processor time and disk space. Turning it on is one
switch; the short version is in [setup-guide.md](setup-guide.md#search-by-meaning),
which is also a page inside Outpost.

Nothing is sent to the internet. Text goes only to the model: the built-in one, on the
machine Outpost runs on, or a server you configure.

### Turning it on

Open **Settings → Search by meaning**. The section says what turning it on will cost
for your library before you touch anything. Turn the switch on. That is all: the
built-in model is used, and the index is built without anything more being pressed.

The section then says, in order: **Starting**; **Reading your library**, with a
progress bar and "Reading 7,556 passages, about 5 minutes left"; and **Ready: Search now
also finds things by meaning**. The time left is judged from the build's own speed
once it has run for five seconds; before that the figure is the measured one for a
recent laptop, and says so. You can leave the page; the build carries on.

Turning the switch off stops using it, pauses a build that is running, and keeps what
was built: the section says how many passages are kept and how much room they take,
and turning it on again carries on from there.

**If it was left pointing somewhere that cannot work.** An installation can have been
set, by hand or by an earlier version, to use an embedding server of its own that is
not there. The section says so, whether the switch is on or off, and offers **Use what
comes with Outpost**: one press that switches to the built-in model, turns search by
meaning on and starts the build (`POST /api/semantic/use-built-in`). The address and
model name of the server are left in the settings, in case it is wanted again.

Everything else is behind **More options** in the same section, and nothing there has
been taken away: where the model runs (built in, or a server of your own), the build
with its **Pause**, **Stop** and **Build index**, the costs in the figures below, the
three numbers that weigh the two searches against each other (they used to be under
**Search**), saving and loading vectors, and vectors left by other models.

### What it costs

Measured with the built-in model as shipped, on an Apple M2 Max laptop (four processor
threads):

| What | Measured |
| --- | --- |
| Building the index | 258 seconds for a library of 7,822 passages averaging 769 characters (the bundled handbook, radio guides and reference sheets, and four PDFs from the catalogue): **33 seconds per thousand passages**. A library made only of passages of the full length (about 1,200 characters, nearly all read in two stretches) took 54 seconds per thousand. Settings quotes 45. |
| The same with one thread | About four times as long: 160 seconds per thousand full-length passages when they were still cut at the model's limit, which is the only time this was measured. Two threads took 82 then, four 42, and eight were no faster than four. |
| A search while that build was running | 40 to 140 ms, question embedded and 6,614 vectors compared. The question goes ahead of the passages being indexed. |
| A search with the index built | 12 to 20 ms. |
| Starting the model | About 0.3 seconds, the first time it is needed and again after five idle minutes. |
| Disk | **2.16 kB per passage** inside the database (14.3 MB for 6,614 passages), so about 2.2 MB per thousand. The numbers are 1.5 kB of that; the rest is how the database stores them. |
| Memory | About 300 MB while the model is loaded, measured in the Docker image: the container used 133 MiB before and 430 MiB during a build, inside its default 1 GB limit. (macOS reports more for the same work, about 550 MB.) It is given back after five minutes without a search or a build. |
| A build in the Docker image | 246 seconds for 6,614 passages (Linux on ARM64, on the same laptop): 37 seconds per thousand. This was measured before long passages were read in stretches, which added 7% on the Mac; the image has not been timed since. |
| Size of the model and its runtime | 39 MB in the packaged app: the model 23.7 MB, the WebAssembly runtime 14.8 MB, licence texts 0.4 MB. |

These were taken while other work was running on the laptop, so a quiet one does a
little better. A small computer will be several times slower. Nobody has measured a
Raspberry Pi; the build's own progress line shows the time left at the speed it is
really going. A build can be made on a faster computer and
[moved](#moving-vectors-between-installations).

Where it has been run: on an Apple Silicon Mac from source and from the packaged app;
in the Docker image on ARM64, and on AMD64 under emulation (which says it works there,
and nothing about its speed on a real PC); and from a copy of the packaged app started
the way a portable drive starts it. Each of those was done with the network blocked or
absent. The 6,563 distinct vectors built on the Mac and in the ARM64 image were the same
bit for bit, as were those of the two images. (The images were run before long passages
were read in stretches; since that change only the Mac has been run.) It has not been
run on a Raspberry Pi, an Intel Mac, Windows, or a musl-based Linux such as Alpine.

### Choosing where the model runs

#### Built in ("Built in")

The model is [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
from the Sentence Transformers project, in the 8-bit ONNX form published for
Transformers.js ([Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)),
Apache-2.0. Each passage becomes 384 numbers.

How it runs:

- **No native code.** The model is run by [ONNX Runtime](https://github.com/microsoft/onnxruntime)
  compiled to WebAssembly (the `onnxruntime-web` package), in a worker thread of its
  own. The same files run wherever Node does: Apple Silicon and Intel Macs, 64-bit PCs,
  ARM boards, glibc or musl Linux, Windows. This is slower than the native runtime
  (about four times, measured: the native one took 11.7 seconds per thousand passages on
  the same laptop), and was chosen because it needs no build per platform.
- **Nothing is downloaded when Outpost runs.** The model's files are part of the
  installation. They were fetched once, when the app was built, at a pinned revision,
  and each was checked against a SHA-256 checksum; the model checks them again every
  time it loads, and refuses files that do not match.
- **The server stays responsive.** The model uses half the processor threads, four at
  most. A search's question is embedded ahead of passages waiting to be indexed.
- **A vector does not depend on the machine.** The same text gave the same numbers,
  bit for bit, on every platform tried and with one thread or four, so vectors built on
  one computer can be loaded on another, and a portable drive's index works wherever the
  drive is plugged in.

What to know about the model:

- **It was trained on English.** Text in other languages is matched poorly. A small
  multilingual model (multilingual-e5-small was tried) is five times the size (135 MB),
  twice as slow and needs twice the memory, so it is not the default. Use a local server
  for a multilingual model.
- **It reads 256 word pieces at a time**, about a thousand characters of English, and
  Outpost's passages run to 1,200. A passage longer than that is read in consecutive
  stretches, each as long as the model allows and the last whatever remains, and its
  vector is the mean of the stretches' vectors, each counted by its length. Every word
  of the passage then counts once. A passage that fits, and every search question, is
  read in one go, exactly as the model's own library reads it. See
  [long passages](#long-passages-and-the-built-in-model) for why this way.
- **It is small.** It knows that "paw" and "pads" belong together; it will not follow
  an argument. Larger models rank better. Hybrid search covers for it with exact words.
- The model card lists what it was trained on: about a billion sentence pairs from
  public collections, some of which have terms of their own (MS MARCO and Reddit
  comments among them). Its publishers release the weights under Apache-2.0.

Where the files are, and their licences: `server/embed/` in the packaged app, with
`NOTICE.txt` and the licence texts beside them. Running from source, fetch them once:

```bash
node scripts/fetch-embedding-model.mjs
```

That downloads three files (23.7 MB) from `huggingface.co` and two licence texts from
ONNX Runtime's repository on GitHub, checks each against its checksum, and puts them in
`apps/server/models/`, which is not committed. `scripts/build-app.mjs` copies them into
the packaged app and warns if they are missing; the Docker build runs the fetch itself.
Without them, Settings says "The built-in model has not been fetched yet" and ordinary
search is unaffected.

#### Long passages and the built-in model

The first version of the built-in model cut a passage off at the model's limit, which
left the last lines of a long passage out of its vector. How much that matters, and
what to do instead, was measured on 7,556 passages as Outpost cuts them: the bundled
handbook (1,899), the radio guides (4,463) and reference sheets (138), and four PDFs
from the catalogue (1,056, mostly the NASA Systems Engineering Handbook). 1,942 of them
(26%) were longer than the limit: about three in ten of the radio books' passages and
one in ten of the PDFs', most by a little (290 word pieces on average, against 254).

The test: take 170 characters from the start, the middle and the end of each of 1,879
long passages, and from 1,139 short ones (6,776 questions in all), and see how often
the passage they came from is among the five nearest of the 7,556.

| How a long passage is read | From its start | Middle | End | End, wholly past the cut (114) | From short passages | Build, per thousand passages |
| --- | --- | --- | --- | --- | --- | --- |
| Cut at 256 word pieces (the first version) | 62% | 71% | 48% | 24% | 74% | 32.0 s |
| Cut at 512 instead | 60% | 70% | 55% | 52% | 74% | 33.8 s |
| Two equal halves, averaged | 61% | 85% | 63% | 75% | 70% | 33.8 s |
| Full-length windows that overlap, averaged | 66% | 77% | 59% | 65% | 73% | 44.8 s |
| **Consecutive stretches, mean by length (what Outpost does)** | 62% | 73% | 59% | 73% | 73% | 34.1 s |

- Reading 512 word pieces in one go hardly helped: the model was trained on short texts,
  and a long read blurs the start as much as it gains the end.
- Equal halves found the most in long passages, but made long passages turn up for
  questions that belonged to short ones, which are three passages in four.
- Consecutive stretches lose nothing measurable against the first version anywhere, and
  find text past the old cut three times as often, for 7% more building time.

Those questions are quotations, which flatters every method. 57 questions written by
hand in other words agree on the main point: for 20 about text past the old cut, the
right passage was in the first five 20% of the time when cut at 256, 50% when cut at
512, and 60% with consecutive stretches (75% with equal halves); for 22 about short
passages it was 59% whichever way. Fifty-seven questions are too few to say more.

A change like this gives the model a new id, so an index built by an earlier version is
not used: Settings lists it under "Vectors from other models" and the index needs
building again.

#### A local embedding server ("Local server")

For a larger model, a multilingual one, or one you already run. Any server that speaks
the OpenAI embeddings format works: Ollama, the llama.cpp server, LocalAI and others.
Outpost sends `POST <server address>/embeddings` with
`{"model": "...", "input": ["..."]}`. No API key is sent, so the server must accept
requests without one.

The server must be on this computer or a private network. Every passage in your library
is sent to it when the index is built, so an address on the public internet is refused
unless Outpost was started with `OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true`.

**Every passage includes your contacts.** Contacts are in the search index with
everything else (names, phone numbers, email and postal addresses, callsigns and
notes), so an embedding server on another machine receives those details too, as it
does the text of your documents and notes. The built-in model sends nothing anywhere.

A minimal example with Ollama on the same machine. The model name is an example; use
any embedding model your server offers. (The test suite exercises this provider
against a stand-in server that speaks the same format, not against Ollama itself.)

```bash
ollama pull nomic-embed-text
```

Then in Outpost:

| Setting | Value |
| --- | --- |
| Search by meaning | on |
| Where the model runs | Local server |
| Server address | `http://127.0.0.1:11434/v1` |
| Model | `nomic-embed-text` |

If Outpost runs in Docker, `127.0.0.1` is the container itself, not your computer. With
Docker Desktop use `http://host.docker.internal:11434/v1`. On Linux, add
`extra_hosts: ["host.docker.internal:host-gateway"]` to the `outpost` service and make
the embedding server listen on an address the container can reach.

#### Demonstration vectors

Each passage's vector is made from counts of its words (after dropping common words
and trimming endings), placed in 256 positions by hashing. Two passages that share
words point in similar directions.

This is **not a language model**. It cannot know that "purify" and "boil" are related
unless the passages share words, so its results add little to keyword search. The
**How search works** screen uses these vectors when search by meaning is off or its
index is not built, so that every step (cutting into passages, making vectors,
comparing, fusing) can be seen working on your own library. As a setting
(`search.semantic.provider` set to `demo`) it still works, and Settings shows it only to
someone who had already chosen it.

### Building the index

Turning search by meaning on starts the build. So does choosing another model under
**More options** while it is on, when that model answers. **Build index** under **More
options** (or `POST /api/semantic/index`) starts it by hand. The build is a background
job that sends every passage without a vector to the model, in batches of 16
(`search.semantic.batchSize`).

- Each passage is embedded together with its title and heading.
- The job only does what is missing. **Pause** and **Stop** are beside the progress
  line under **More options**; after either, **Carry on reading** on the first level
  (or **Continue building** under More options) carries on from where it was. A build
  that was running when the server stopped carries on by itself when it starts again.
  What is already built is used by searches in the meantime.
- While search by meaning is on, new and changed passages are embedded automatically
  a few seconds after they are indexed, whether or not there was anything to build
  when it was switched on. That never restarts a build you paused or stopped: only
  you do that. And it does not start one for a model that has just said it cannot run.
- Switching search by meaning off pauses a running build; switching it on again
  continues it.
- A build that fails says why in the same place, keeps what it had built, and offers
  **Try again**.
- Until at least one vector exists, searches remain keyword searches, with the note
  "Semantic search is not set up, so this is a keyword search."

### Changing the model

Vectors are stored per model. If you switch model (under **More options**), the old
vectors are kept and listed under "Vectors from other models" until you delete them,
and the new model needs its own build, which starts by itself while search by meaning
is on. A build that was running for the old model is paused. Vectors from different models are never mixed. See
[ai.md](ai.md#planning-for-a-change-of-embedding-model).

### Moving vectors between installations

Building is slow on a small device. A faster computer holding the same library can
build the vectors, and the small device can load them.

On the fast computer (same documents, same provider and model, same passage settings):

```bash
curl -o vectors.jsonl.gz "http://localhost:8080/api/semantic/export"
```

`?model=<model id>` exports a model other than the current one. A model id is the
provider and model joined by a colon, for example `openai-compatible:nomic-embed-text`.
The built-in model's id ends in a fingerprint of its exact files and settings, for
example `built-in:all-MiniLM-L6-v2-q8-245889ee`, so a version of Outpost that ships a
different model, or reads passages differently, gets an id of its own and never mixes
its vectors with these. (The first built-in model, which cut long passages off, was
`…-84769597`.)

On the small device:

```bash
curl -X POST "http://localhost:8080/api/semantic/import" \
  -H "X-Outpost-Request: 1" \
  -H "Content-Type: application/gzip" \
  --data-binary @vectors.jsonl.gz
```

The answer reports `vectorsInFile`, `passagesUpdated` and `vectorsWithoutPassage`.
The settings screen has buttons for both steps.

How it works, and what follows from it:

- The file is gzip-compressed JSON lines. The first line describes it:
  `{"format":"outpost-embeddings","version":1,"modelId":…,"provider":…,"model":…,"dimensions":…,"exportedAt":…}`.
  Every other line is `{"h":"<hash of the passage text>","v":"<vector, 32-bit floats, base64>"}`.
- Vectors are matched to passages by the hash of the passage **text**, not by ids. A
  vector is applied to every passage with the same text that has no vector for that
  model yet. Passages that differ (another file version, another passage length
  setting) are not matched.
- The receiving installation still needs the same provider and model configured and
  running, because each search query has to be turned into a vector too.

### Hybrid ranking

When semantic search is ready, the default mode is **hybrid**: keyword results and
semantic results are each ranked on their own, then combined with reciprocal rank
fusion. (Reference articles join that list only when the API is asked for everything in
one part; on the search page they are a group of their own, as described
[above](#reference-collections-in-results).) An item's score is the sum, over the lists it appears in,
of `weight / (k + rank)`. Only positions are used, never raw scores, which is what
lets results from unrelated systems be combined fairly.

| Setting | Default | Effect |
| --- | --- | --- |
| `search.hybrid.rrfK` | 60 | The constant `k`. Larger values flatten the difference between ranks. |
| `search.hybrid.keywordWeight` | 1 | Weight of the keyword list, and of reference articles when the API merges them in. |
| `search.hybrid.semanticWeight` | 1 | Weight of the semantic list. |

All three are under **Settings → Search**. *How search works* lets you try a change on
a question of your own before saving it. They can also be set through the API:

```bash
curl -X PATCH "http://localhost:8080/api/settings" \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"search.hybrid.semanticWeight": 1.5}'
```

In **semantic** mode only the semantic list is used; reference articles are left out,
because they have no vectors.

### Limits of the built-in index

- The index is flat: each query is compared with every stored vector. That is exact
  and needs no extra software, and is comfortable to roughly 100,000 passages. Beyond
  that, searches slow down in proportion. There is no approximate index in this
  version.
- Vectors live in the database. A 384-dimension model (the built-in one) needs about
  2.2 kB per passage as measured, so 100,000 passages add about 220 MB.
- Reference articles are not embedded and are found by keyword only.
- Semantic results show the start of the matching passage rather than highlighted
  words, because there are no matching words to highlight.

See also [ai.md](ai.md) for using retrieved passages with a language model.
