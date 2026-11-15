# Search

This page describes what the search box understands, what is searched, how results
are ranked, and how to turn on optional semantic search ("search by meaning").

Keyword search is always available and needs no set-up. Semantic search is optional
and off by default.

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
6. the numbered sources a language model would be given;
7. the prompt that would be sent (it is shown, never sent: Outpost runs no model);
8. what can go wrong at each step, and how to tell.

Everything on that page comes from the same code as real search. Two things to know
when reading it:

- With no embedding model set up, the "meaning" steps use the built-in
  [demonstration vectors](#demonstration-demonstration), and the page says so. They
  show the mechanics; they are word matching by another route, not understanding.
- The ranking steps cover everything search covers, including catalogue listings and
  saved places. The context step keeps only passages from your documents and pages,
  because those are what a model should quote from.

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
| Documents | Title, author or file name, category, tags, and the text read from the file, page by page for PDFs. A chapter of a book is a document, shown with its book's name. In a Markdown file, a signal figure (a `viz` block) is searched by its title and caption and a Mermaid diagram's source is not searched at all |
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

Not searchable: scanned PDFs and images. They are stored and can be opened, and are
found by title and tags, but there is no OCR in this version.

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

## Semantic search

Semantic search finds passages about the same thing even when they share no words
with your query. It needs an **embedding model**: a program that turns text into a
list of numbers (a vector). Outpost stores one vector per passage and compares them
with the vector of your query.

Nothing is sent to the internet. Text goes only to the provider you configure.

### Choosing a provider

Set these under **Settings → Search by meaning**.

#### A local embedding server ("Local server", recommended)

Any server that speaks the OpenAI embeddings format works: Ollama, the llama.cpp
server, LocalAI and others. Outpost sends
`POST <server address>/embeddings` with `{"model": "...", "input": ["..."]}`. No API
key is sent, so the server must accept requests without one.

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

#### Demonstration ("Demonstration")

Built in, with nothing to install. Each passage's vector is made from counts of its
words (after dropping common words and trimming endings), placed in 256 positions by
hashing. Two passages that share words point in similar directions.

This is **not a language model**. It cannot know that "purify" and "boil" are related
unless the passages share words, so its results add little to keyword search. It is
there so that every step of vector search (cutting into passages, making vectors,
comparing, fusing) can be seen working on your own library before you set up a real
model. The **How search works** screen uses it automatically when no other provider
is configured.

#### Inside Outpost

Outpost can run a model in its own process through the `@huggingface/transformers`
package. This has real limits:

- The package is optional and **not installed**: it is not in the Docker image, the
  packaged app or portable drives. It can only be used when running from source, after
  you add the package to `apps/server` yourself. Its native runtime has no builds for
  musl Linux or Intel Macs.
- The calls Outpost makes to the library were tried once by hand with a real model
  (all-MiniLM-L6-v2). The test suite does not repeat that: it checks only that a
  missing package or missing model is reported clearly.
- Model files are read only from `<data directory>/models/`. Outpost tells the library
  never to download anything, and this version has no model downloader. Copy the
  model's files there yourself, keeping the folder layout of the model's repository,
  so that a model called `Xenova/all-MiniLM-L6-v2` is at
  `<data directory>/models/Xenova/all-MiniLM-L6-v2/`. Outpost asks for the 8-bit
  quantised ONNX variant of the model.
- The **Model** setting is that folder name.

If the package is missing, the status reads: "Running a model inside Outpost needs the
optional @huggingface/transformers package, which is not part of this installation."

### Building the index

Choose **Build index** in the same settings section (or `POST /api/semantic/index`).
This starts a background job that sends every passage without a vector to the model,
in batches of 16 (`search.semantic.batchSize`).

- Each passage is embedded together with its title and heading.
- The job only does what is missing. You can pause it, cancel it or restart the server,
  and **Continue building** carries on.
- After the first build, new and changed passages are embedded automatically a few
  seconds after they are indexed.
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
- Vectors live in the database. A 384-dimension model needs about 1.5 kB per passage,
  so 100,000 passages add about 150 MB.
- Reference articles are not embedded and are found by keyword only.
- Semantic results show the start of the matching passage rather than highlighted
  words, because there are no matching words to highlight.

See also [ai.md](ai.md) for using retrieved passages with a language model.
