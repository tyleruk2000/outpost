# Search

This page describes what the search box understands, what is searched, how results
are ranked, how to turn on optional semantic search ("search by meaning"), and how to
have a language model of your own write an answer from what was found.

Keyword search is always available and needs no set-up. Semantic search is optional
and off by default. So is reading the text of scanned pages and images
([OCR](#scanned-pages-and-images-ocr)).

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
- **It has not been run against a real model yet**, only against a stand-in server
  that speaks the same protocol. See [ai.md](ai.md).

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
| Reference articles | Articles inside installed ZIM archives; see [below](#reference-collections-in-results) |

Pages in the notes trash, and your own page templates, are not searched.

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
Outpost asks kiwix-serve to search up to 24 installed archives, takes each archive's
best matches in turn so one large archive does not crowd out the rest, and merges them
with your own results by rank.

- Turn this off with **Settings → Search → Search inside reference collections**
  (`search.includeReference`).
- If kiwix-serve is not running, your own results still appear, with a note saying why
  reference articles are missing.
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
because building the index takes processor time and disk space.

Nothing is sent to the internet. Text goes only to the model: the built-in one, on the
machine Outpost runs on, or a server you configure.

### Turning it on

Open **Settings → Search by meaning**. The section says what the index will cost for
your library before you touch anything. Switch it on; **Built in** is already chosen.
Then choose **Build index**. That is all.

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

Choose **Build index** in the same settings section (or `POST /api/semantic/index`).
This starts a background job that sends every passage without a vector to the model,
in batches of 16 (`search.semantic.batchSize`).

- Each passage is embedded together with its title and heading.
- The job only does what is missing. **Pause** and **Stop** are beside the progress
  line; after either, or after a restart of the server, **Continue building** carries
  on from where it was. What is already built is used by searches in the meantime.
- After the first build, new and changed passages are embedded automatically a few
  seconds after they are indexed. That never starts a first build, and never restarts
  one you paused or stopped: only you do that.
- A build that fails says why in the same place, keeps what it had built, and offers
  **Try again**.
- Until at least one vector exists, searches remain keyword searches, with the note
  "Semantic search is not set up, so this is a keyword search."

### Changing the model

Vectors are stored per model. If you switch model, the old vectors are kept and listed
under "Vectors from other models" until you delete them, and the new model needs its
own build. Vectors from different models are never mixed. See
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

When semantic search is ready, the default mode is **hybrid**: keyword results,
semantic results and reference articles are each ranked on their own, then combined
with reciprocal rank fusion. An item's score is the sum, over the lists it appears in,
of `weight / (k + rank)`. Only positions are used, never raw scores, which is what
lets results from unrelated systems be combined fairly.

| Setting | Default | Effect |
| --- | --- | --- |
| `search.hybrid.rrfK` | 60 | The constant `k`. Larger values flatten the difference between ranks. |
| `search.hybrid.keywordWeight` | 1 | Weight of the keyword list, and of reference articles. |
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
