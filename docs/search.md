# Search

Keyword search works at once with no set-up. Search by meaning and reading scanned pages
([OCR](#scanned-pages-and-images-ocr)) are optional and off by default.

## Two places to search

- **Quick search**, the field at the top of the sidebar (the magnifying glass on a phone;
  <kbd>/</kbd>, or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd>). Under **Go to** it offers
  matching screens and Settings sections, by name and everyday words ("food" offers
  Supplies, "wifi" the QR codes tool), then up to six sections of Help's guides, then the
  best matches in your library and **See all results**.
- **Search**, the whole screen: every result, a tab per kind, the reference collections,
  and **Answer from my library**.


## Seeing how it works

**How search works** (the "How were these found?" link under any search, or
`/search/how-it-works`) follows one question of yours through every step on your own
library, from cutting passages to the exact prompt a model would get, with the ranking
weights adjustable to try. It sends nothing. While search by meaning is off, it uses
[demonstration vectors](#demonstration-vectors) and says so.

## Answers from your library

With a language model of your own set up ([ai.md](ai.md#setting-it-up)), **Answer from my
library** sits above the results and writes an answer from the best passages, citing
each. How well depends on the model ([ai.md](ai.md#tried-with-a-real-model)).

### Which passages an answer is given

Answers, conversations using the library, and the retrieval API rank passages one by one:

1. **By words.** Passages holding every word of the question. If there are too few,
   passages holding at least half of what the question is about are added, each word
   weighed by how rare it is in your library ("countryside" counts for far more than
   "say"). If none qualify, nothing is found and the model is not asked.
2. **By meaning**, when it is on: the nearest passages, kept only if their similarity is
   at least 0.3 and within 0.2 of the nearest one's.
3. **Combined** as in [hybrid ranking](#hybrid-ranking), so a passage found both ways
   comes first.
4. **The same text only once**, so a file kept in two places does not take two places.

Up to five are given.

## Keyword search

### What you can type

| You type | It means |
| --- | --- |
| `water filter` | Both words must appear. |
| `"chlorine dioxide"` | The exact phrase. |
| `water -pool` | "water" but not "pool". `-"swimming pool"` excludes a phrase. |
| `clov` | The last word matches as a beginning while you type ("clove"). A space or closing quote ends that. |

English word forms match ("boil" finds "boiling"); accents, capitals and punctuation are
ignored; `AND` and `OR` are just words. Up to 500 characters.

### When nothing has every word

Outpost searches again for items with **any** of the words, and says "No single item had
every word, so these match some of them."

### What is searched

| Kind | What is indexed |
| --- | --- |
| Documents | Title, author or file name, category, tags, and the text, page by page for PDFs; for scans, the OCR text once read. A book chapter is a document. |
| Notes | Title, parent pages' titles, tags, and the text under each heading. |
| Installed collections | Title, publisher, description. |
| Catalogue entries | What Explore lists, so you can find something to download. |
| Map markers and tracks | Names and notes. |
| Contacts | Name, title, organisation, tags, numbers, addresses, callsign, channels and notes. |
| Repeaters | Callsign, town and frequency (up to 50 found). |
| Places in reference layers | Feature names in installed packs (up to 30 found). |
| Reference articles | Articles in installed ZIM archives: see [below](#reference-collections-in-results). |

Not searched: the notes trash, your page templates, and the household board.

Text is cut into passages of about 1,200 characters overlapping by 150 (**Settings →
Reading documents**). A passage never crosses a page or heading, so a result points at
the exact page. A change applies to documents added or re-read afterwards.

### Ranking

Results are ranked by BM25 with weights title 8, tags 4, heading 3, body 1. An item ranks
by its best passage and shows up to three, with the matched words marked. The percentage
is relative to the best match of that search. A PDF opens at the matching page.

**What is on this device comes first.** Catalogue entries would have to be downloaded
before they could be opened, so they always come after everything that can be opened now:
on the **Everything** tab they are listed last, under **Available to download**, after
**In reference collections**.

### Filters

The tabs above the results limit them to one kind. When search by meaning is ready, a
switch offers **Best of both**, **Exact words** or **By meaning**. API:
[api.md](api.md#search).

### Reference collections in results

Articles in ZIM archives are searched by kiwix-serve, not Outpost's index. **Your own
results do not wait for them**: they appear at once, and "Still searching reference
collections…" shows while the archives are asked, three at a time.

- Each collection's best match is added under **In reference collections** as it
  answers; nothing already shown moves. The **Reference** tab lists every article found.
- A collection that takes more than 8 seconds, or is not reached within 30, is left out
  and named; its answer is kept for five minutes for the next search.
- Turn it off with **Settings → Search → Search inside reference collections**.
- If kiwix-serve is not running, your own results still appear, with a note saying why.
- A collection that is a set of documents with a list
  ([troubleshooting.md](troubleshooting.md#a-collection-opens-as-a-list-of-documents)) is
  found by its documents' titles and authors (every typed word must start a word of one),
  up to 50,000 documents across all collections. The text inside is searched only once a
  file is added to your library.

## Scanned pages and images (OCR)

A scanned PDF or a photo of a notice has no text to search until something reads the
picture. Outpost can do that on this machine. Nothing is sent or downloaded. It is **off
by default**, because it is slow and makes mistakes.

### Using it

- A document with scanned pages, or an image, offers **Read text from the scanned pages**
  (or **Read text from this image**) above its pages and under **Details → Text for
  search**. It runs in the background with progress, one document at a time, and can be
  stopped.
- **Settings → Reading documents → Read text from scans automatically** reads every new
  document as it is added.
- The text is then found by search, page by page, and **Show the text** shows exactly what
  was read.
- Only pages with no text of their own are read. Stopping keeps the pages read so far and
  offers **Read the remaining scanned pages**; a restart carries on. **Read the scanned
  pages again** starts over.
- The original file is only ever read.

### What to expect

Print reads well, handwriting badly; poor scans, small type, tables and other languages
bring errors. A clean page takes about 3 seconds on a fast laptop, many times longer on a
Raspberry Pi. Treat the text as a way to find the pages; the pages remain the record.

### Limits

| Limit | Value |
| --- | --- |
| Pages read in one go | 1,000 scanned pages of one PDF; the rest are offered afterwards. |
| Largest picture | 40 million pixels (A4 at 600 dpi is about 35 million). Larger is skipped. |
| Resolution read at | Up to 300 dpi and 12 million pixels; finer scans are scaled down. |
| Largest files | Images 64 MB, PDFs 512 MB. |
| Image types | PNG, JPEG, GIF (first frame), WebP. Not SVG. |
| Confidence | A page scoring below 50 of 100 is treated as having no text. |

It does not read text drawn as shapes or outlines in a PDF, does not keep layout (tables
come out as lines of words), and finds a page scanned upside down or sideways only when
its first reading scores badly; it then tries the other ways up, taking up to four times
as long.

### Other languages

English is built in. For another language:

1. Get `<code>.traineddata` (for example `deu.traineddata`) from Tesseract's
   [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) or `tessdata_best`
   collection (`.traineddata.gz` works too).
2. Put it in `<data directory>/ocr/tessdata/`.
3. Set `ocr.languages` to the codes joined by `+`, most likely first:

```bash
curl -X PATCH "http://localhost:8080/api/settings" \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"ocr.languages": "deu+eng"}'
```

More languages read more slowly. Documents already read are not read again by themselves:
use **Read the scanned pages again**. Language files are not in backups or on portable
drives; copy them yourself.

## Semantic search

Search by meaning finds passages about the same thing even when they share no words with
your query. An **embedding model** turns each passage into a list of numbers (a vector),
and your query is compared with them. A small model is **built in**, in the app, the
Docker image and portable drives; nothing is downloaded and nothing leaves the machine.

### How it works, in pictures

**Search → How search by meaning works** (also linked from **Settings → Search by
meaning**) explains it step by step with diagrams: passages, the 384 numbers the model
makes for each, finding the nearest passages to a question, how the two lists are
combined, where it runs, how the library is read, and what it cannot do. It shows this
Outpost's own figures: on or off, passages read of the total, and the model. New and
changed documents are read by themselves about five seconds after they are indexed,
while search by meaning is on. *How search works* has the same steps in more depth, on
a question of your own.

### Turning it on

**Settings → Search by meaning**: the section says what it will cost for your library.
Turn the switch on. The index builds by itself: **Starting**, then **Reading your
library** with a progress bar and the time left, then **Ready**. You can leave the page.
Turning it off pauses the build and keeps what was built.

If it points at an embedding server that is not there, the section offers **Use what
comes with Outpost**. The rest is under **More options**.

### What it costs

Measured with the built-in model on an Apple M2 Max laptop (four threads):

| What | Measured |
| --- | --- |
| Building the index | 33 to 54 seconds per thousand passages (Settings quotes 45). |
| A search | 12 to 20 ms with the index built; 40 to 140 ms during a build. |
| Disk | About 2.2 MB per thousand passages. |
| Memory | About 300 MB while loaded, given back after five idle minutes. |
| The model itself | 39 MB in the app. |

A small computer will be several times slower; the progress line shows the real time
left. Or build on a faster computer and [move the vectors](#moving-vectors-between-installations).

### Choosing where the model runs

#### Built in ("Built in")

[all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
(Apache-2.0). It gives the same vectors on every platform, so vectors built on one
computer work on another, and uses at most half the processor threads. **It was trained
on English**: for other languages use a local server. **It is small**: it knows "paw" and
"pads" belong together but will not follow an argument; hybrid search covers for it with
exact words.

Running from source, fetch its files once with `node scripts/fetch-embedding-model.mjs`
(23.7 MB from `huggingface.co`). Until then Settings says "The built-in model has not been
fetched yet"; keyword search is unaffected.

#### A local embedding server ("Local server")

For a larger or multilingual model. Any server with the OpenAI embeddings format works
(Ollama, llama.cpp, LocalAI). No API key is sent.

**Every passage is sent to it, contacts included**: names, phone numbers, addresses,
callsigns and notes, as well as your documents. So it must be on this computer or a
private network; a public address is refused unless Outpost was started with
`OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true`.

With Ollama: `ollama pull nomic-embed-text`, then under **More options**:

| Setting | Value |
| --- | --- |
| Where the model runs | Local server |
| Server address | `http://127.0.0.1:11434/v1` |
| Model | `nomic-embed-text` |

In Docker, use `http://host.docker.internal:11434/v1` (on Linux, with
`extra_hosts: ["host.docker.internal:host-gateway"]`).

#### Demonstration vectors

Vectors made from word counts, used by *How search works* while search by meaning is off.
They show the mechanics but are not a language model and add little to keyword search.

### Building the index

Turning it on, choosing another model, or **Build index** starts a build, which only does
what is missing. **Pause** and **Stop** sit beside the progress line; **Carry on reading**
resumes, and a restart carries on by itself. New and changed passages are added a few
seconds after indexing. A failed build says why and offers **Try again**. Until a vector
exists, searches are keyword searches, and say so.

### Changing the model

Vectors are kept per model and never mixed. Switching keeps the old ones under "Vectors
from other models" until you delete them, and the new model builds its own. See
[ai.md](ai.md#planning-for-a-change-of-embedding-model).

### Moving vectors between installations

A faster computer holding the same library, with the same model and passage settings, can
build the vectors for a small one. On the fast computer:

```bash
curl -o vectors.jsonl.gz "http://localhost:8080/api/semantic/export"
```

On the small one:

```bash
curl -X POST "http://localhost:8080/api/semantic/import" \
  -H "X-Outpost-Request: 1" \
  -H "Content-Type: application/gzip" \
  --data-binary @vectors.jsonl.gz
```

Settings has buttons for both. Vectors are matched by passage text, so passages that differ
are not matched. The small computer still needs the same model for its searches.

### Hybrid ranking

When search by meaning is ready, the default is **Best of both**: keyword and meaning
results are ranked separately and combined by reciprocal rank fusion, each item scoring
`weight / (k + rank)` summed over the lists it is in.

| Setting | Default | Effect |
| --- | --- | --- |
| `search.hybrid.rrfK` | 60 | Larger flattens the difference between ranks. |
| `search.hybrid.keywordWeight` | 1 | Weight of the keyword list. |
| `search.hybrid.semanticWeight` | 1 | Weight of the meaning list. |

They are under **More options**; *How search works* lets you try a change first. **By
meaning** alone leaves reference articles out, since they have no vectors.

### Limits of the built-in index

Each query is compared with every vector: exact, and comfortable to about 100,000
passages (about 220 MB); beyond that, searches slow in proportion. Reference articles are
found by keyword only. Results found by meaning show the passage's start, unhighlighted.

How it works inside, for developers: [development/answers-and-search.md](development/answers-and-search.md).
