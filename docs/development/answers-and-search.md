# Answers, search and tools: internals

For people changing the code. The household guides are [ai.md](../ai.md),
[search.md](../search.md) and [mcp.md](../mcp.md); routes are in [api.md](../api.md).

## Answers

`question → Retriever (outpost-hybrid) → [Reranker: interface only] → ContextAssembler →
ModelProvider → checkCitations`. No reranker is implemented: on the answers set the hybrid
retriever already puts the answering passage in the five given to the model for all 32
answerable questions (first for 30), so a cross-encoder could only reorder those five, at
the cost of a second model run per passage (seconds per question on a Raspberry Pi). Code: `apps/server/src/modules/answers/`,
`modules/retrieval/` (prompt in `retrieval/prompt.ts`), `modules/chat/`. Recommended
models: `packages/shared/src/recommended-models.ts`; first choice: `model-choice.ts`;
measured results: `model-trials.ts` (writes [which-model.md](../which-model.md)).

**Requests.** OpenAI-compatible: `POST <address>/chat/completions` with exactly `model`,
`messages`, `stream: true`, `temperature`, `max_tokens: 1024`; models from
`GET <address>/models`. No API key; redirects refused. When `GET <host>/api/version`
answers (cached five minutes), Ollama's own `POST /api/chat` is used instead, with
`truncate: false`, `shift: false` and `options: {temperature, num_predict, num_ctx}`,
after `GET /api/ps` to tell whether the model is loaded. `num_ctx` follows the budget
alone (4,096 / 8,192 / 16,384 / 32,768), so answers and chat never reload the model
between them. Reasoning (`reasoning`, `reasoning_content`, `<think>…</think>`) is not shown.

Ollama 0.40.16, tried 16 November 2026: its OpenAI endpoint silently cuts a prompt that
does not fit (13,739 tokens answered from the last 2,050) and makes room mid-reply by
dropping the prompt's start; `truncate` and `shift` are not on its API page but were
honoured. A reply that fills the context ends with the same `done_reason` as the length
limit; Chat tells them apart by token counts. llama-server refuses with
`exceed_context_size_error`. LM Studio documents neither its stream nor its errors.

**Address rule** (`answers/address.ts`): http/https only; no credentials, `?` or `#`;
names resolved before every request and refused if public unless
`OUTPOST_ALLOW_REMOTE_MODEL_SERVER`. "This computer": `127.x`, `::1`, `localhost`,
`host.docker.internal`. "Your network": private ranges, `100.64.0.0/10`, bare names,
`.local`, `.lan`, `.home`, `.internal`, `.home.arpa`. `/api/chat/setup/try` refuses any
address `setup/look` does not ask.

**Settling a reply** (`answers/tidy.ts`): a marker to an unknown number is repointed only
when the preceding words are one or more whole sentences of exactly one passage (refused
for a dropped "not", a changed figure, an added claim, two matching passages, fewer than
four words). A decline is a first sentence about the passages, sources, documents or
library, or the model about itself; "cannot" alone is not one. Fixture:
`test/fixtures/answers/refusals-seen.json`.

**Retrieval thresholds** (`modules/search/service.ts`): half the question's rarity-weighted
words; similarity ≥ 0.3 and within 0.2 of the best. Chosen on the evaluation library.

## Retrieval API fields

Body for `/api/retrieval/passages` and `/context`: `query` (1–1000), `limit` (1–30, 8),
`maxChars` (200–60000, 6000; `/context` only, first passage always included), `kinds`
(default `["document","note"]`), `mode`. Small words are not dropped.

`RetrievedPassage`: `chunkId`, `kind`, `entityId`, `title`, `collection`, `sourcePath`,
`url` (with `?page=N`), `page`, `heading`, `charStart`, `charEnd`, `text` (exact),
`contentHash`, `indexVersion`, `score` (0–1), `retrievedBy`.

`AssembledContext`: `query`, `text` (`[1] Title, Heading, page N` blocks), `citations`
(`marker`, `chunkId`, `kind`, `entityId`, `title`, `collection`, `url`, `page`,
`heading`, `quote`, `contentHash`), `omitted`, `safetyCritical`.

## Tools

`apps/server/src/modules/tools/`: each tool has a name, description, zod schema (sent as
JSON Schema) and a function calling the service a screen already uses; shared
calculations live in `packages/shared`. Before checking, digit strings become numbers and
empty optional arguments are dropped (`lenient`). Answers are plain labelled lines, at
most 3,000 characters, paged. Tool definitions total 7,642 characters (about 2,000
tokens). Results go back headed `Source [n] (from Outpost: …)`; the record is stored in
the message's `sources` as kind `lookup`. `test/tools-readonly.test.ts` runs every tool
with network, jobs, downloads and live events failing the test, and checks the database
is unchanged. A reply holding a tool call written as JSON is suppressed.

## MCP

`modules/tools/mcp.ts`. Stateless, dual-era: a request with
`_meta["io.modelcontextprotocol/protocolVersion"]` or `MCP-Protocol-Version: 2026-07-28`
is served as 2026-07-28; `initialize` or anything else as 2025-11-25/06-18/03-26 (no
`Mcp-Session-Id` given out). Checks before the body is read: switch (`tools.mcp`, own
row), source address (loopback, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`,
`fe80::/10`, `fc00::/7`), no `Forwarded`/`X-Forwarded-*`/`X-Real-IP`, `Host` guard,
`Origin` equal to own origin, `Sec-Fetch-Site` `same-origin`/`none` (all 403); token
bucket of 20 then 1/s per address, IPv6 by /64, 300 addresses (429); JSON only (415);
256 KB (413). `Cache-Control: no-store`.

| Method | Answer |
| --- | --- |
| `initialize` | Version asked if an earlier one, else 2025-11-25; `capabilities.tools.listChanged: false`; `serverInfo`, `instructions`. |
| notifications | `202`, no body; cancel does nothing (closing the request stops a tool). |
| `ping` | `{}` |
| `server/discover` | `supportedVersions`, `capabilities`, `instructions`. |
| `tools/list` | Tools of areas on: `name`, `title`, `description`, `inputSchema` (2020-12), `annotations` read-only, idempotent, closed-world. |
| `tools/call` | `content: [{type:"text"}]`, `isError`. Unknown or switched-off tool: `-32602`. |

On 2026-07-28 every result adds `resultType: "complete"` and serverInfo in `_meta`.
Errors: parse `-32700`/400; invalid request or batch `-32600`/400; unknown method
`-32601` (404 on 2026-07-28, 200 earlier); missing `_meta` fields `-32602`/400; header
mismatch (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, base64 decoded) `-32020`/400;
unsupported version `-32022`/400; other methods than POST 405. Not built: SSE, sessions,
resumption, subscriptions, resources, prompts, logging, completion, progress, MRTR,
elicitation, sampling, roots, batches, HTTP+SSE, authorization, `x-mcp-header`.

## Search internals

### Ranking weights

The one scale every result is put on (`score.ts`; the guide's summary is
[search.md](../search.md#ranking)):

| Part | Share | What it asks |
| --- | --- | --- |
| Coverage | 0.50 | How much of the query it holds, each word weighed by its IDF in the library. Another form of a word counts 0.92 of it, another name for it (the synonyms) 0.85, a longer word it begins 0.6. Words held far apart count less (`SPREAD`): full while their closeness, scaled to the terms held, is 0.25 or more (within about four times their length, in the title or one passage), down to 0.8 of itself as it falls to 0; the reason then says "far apart". `parts.coverage` stays unscaled for the relaxed threshold. |
| Title | 0.20 | How much of the query is in the title (a tag counts 0.75, a heading 0.6). |
| Closeness | 0.15 | How near together the words are, stop words in between not counted. |
| Side by side | 0.05 | All the words adjacent, in the order typed. |
| Frequency | 0.10 | How often they occur, with diminishing returns. |

BM25 column weights: title 8, tags 4, heading 3, body 1. Intent priors (`intent.ts`):
medical × 1.25 (medical and first aid sources), safety × 1.25 (official guidance on
generators, heaters, stoves, fuel, carbon monoxide), vehicle × 1.2, how-to × 1.1 (Q&A,
manuals, guides); together at most × 1.3, applied so a high score rises by less (0.9 to
0.92). Fuel alone is not a vehicle word. A medical-source article whose title holds none of the question's words less its action words (`Intent.about`) × `NAMES_ANOTHER` (0.85), "about something else". "Bleeding" is in the household's sense unless the question names the other. Contractions typed without an apostrophe ("wont") are read with one (`CONTRACTIONS`, query.ts). Another sense of an ambiguous word × 0.75. A collection plainly about another subject × 0.9 ("on another subject"): the subjects are routing.ts `TOPICS`, the question's from its words, the source's from its collection name alone; preparedness, outdoors, repair and water count as every question's, and a question or collection naming no subject is left alone.

"Did you mean": a word in no passage (or, when nothing holds every word, in one or two) is
matched to the nearest library word within edit distance 2 (1 for four letters or fewer),
same first letter preferred, then the commoner, unless a word one key-slip away at the start (every other first letter, 52 whole-word lookups) is held by 20 times as many passages ("vattery" → battery, not vatter); lookups that SQLite reports as malformed give no suggestion rather than an error; never a stop word, the word in at least
two passages; offered while fewer than five results come back (meaning-only results not
counted). The relaxed pass adds items whose IDF-weighted coverage is at least 0.5.

Search by meaning, passages for an answer: kept when similarity ≥ 0.3 and within 0.2 of
the nearest, fused by reciprocal rank (`weight / (k + rank)`, `search.hybrid.rrfK` 60,
`keywordWeight` and `semanticWeight` 1). Up to five passages, deduplicated by text.

Reference routing: six archives first, eight articles from each; the rest asked at once
when the first find fewer than three good ones, unless the person's own library holds five
items with every word (`widen: false`, counted with one FTS query that stops at five).
The screen asks `/api/search/reference` 350 ms after the last keystroke
(`REFERENCE_SETTLE_MS`, less the screen's own wait) and aborts a superseded one. Results kept five minutes. Time limits: 8 s
per full-text search, 3 s per title search, 30 s to be reached. An archive with no
full-text index is tried again after a week, a failing one after half an hour.

Built-in model, measured on an Apple M2 Max (four threads): 33 to 54 s per thousand
passages (Settings quotes 45); a Raspberry Pi 5 about four minutes. About 3 ms to compare a
question with 57,800 passages and 10 ms to embed it; on a 57,600-passage library, own
results p95 about 35 ms on the laptop.

### Passages are never changed in place

`chunks_fts` and `chunks_words` are external-content FTS5 tables kept in step by insert
and delete triggers. A passage is never `UPDATE`d (migration 0048 refuses it): a new title
or new tags put each passage back under a new number, its vectors copied across, and the
vector matrix in memory is let go (`onChunksRenumbered`). The reason: an encrypting save
turns on FTS5 `secure-delete` for that save (`scrubbing`), and in SQLite 3.54 erasing a
passage that had earlier been deleted and put back under the same number in the ordinary
way breaks the index (`fts5: checksum mismatch`, then "database disk image is malformed"
from the `fts5vocab` word list). Numbers used once, new ones for anything re-indexed, and
the index stayed sound in every sequence tried (`test/search-index-sound.test.ts`
reproduces the break through the API: rename and tag a page, then encrypt it).
Check an index against its passages with `INSERT INTO chunks_fts(chunks_fts, rank)
VALUES ('integrity-check', 1)`: without the `1` an index out of step with them passes.

### Keyword pass

Keyword ranking (`modules/search/keyword.ts`, `score.ts`):

1. `parseQuery` drops `STOP_WORDS` (not inside quotes, not when nothing else is left)
   and lists them as `ignored`.
2. One FTS pass, no `LIMIT`, returns every matching passage's rowid and BM25 (no join);
   the item, kind and household of each passage come from `owners.ts`, an in-memory map
   noted on every write and read again whole when a rowid is not in it. Items are grouped
   in JS, keeping each one's best four passages. This is what makes `total` exact and
   every page reachable (a book's title is copied onto each of its passages, so a
   passage-level `LIMIT` filled up with three books). Items with `meta.household` (plans,
   supplies) are skipped unless it is the current household.
3. The first `max(200, offset + limit)` items by best BM25 are scored by `scoreFields` on
   their best BM25 passage; the best `max(60, window + 5)` then on their next three too.
   `intent.ts` priors (≤ × 1.3; × 0.75 for another sense) reorder within each part of the
   list (on device / every word / prefix only). `snippet()`/`highlight()` run only for the
   passages shown (`markPassages`), one `rowid = CAST(? AS INTEGER)` lookup each. With
   `rowid IN (?, …)` or a plain `rowid = ?` the bound numbers did not narrow the FTS5 scan
   at all: every match came back with its snippet made (250 ms for "water" in 57,000
   passages) and the wanted ones were picked out in JS. Items that hold the last word only
   as a beginning are marked with the all-words prefix expression; the rest, and the
   relaxed pass, never use a prefix.
4. Fewer than `FEW` (5) strict items: the any-word pass adds items with rarity-weighted
   coverage ≥ `RELAXED_COVERAGE` (0.5), after the strict ones. `everyWord` and
   `relaxed` tell the page what to say.

Word weights are the index's own IDF, one `count(*)` per term; the total passage count is
cached (`passageCount`, dropped on every write, trusted 30 s otherwise). The stemmer
(`stem.ts`) is Porter's, as the `porter` tokenizer uses, so the scorer finds a word
exactly when the index does; its cache holds 200,000 words.

After ordering: `collapseSameTitles` (cards.ts) joins non-reference results of one
normalised title into the first, as `alsoIn`; `firstCard` asks the card sources (water in
search, the power cut plan from emergency-plans via `addCards`) then `placeCard`.
`syncKind` indexes a small table whole (plans, supplies), writing only items whose
`IndexEntity` JSON changed. `searchReference` adds the "Did you mean" word as the first
alternative of a term no passage holds (`forReference`), so kiwix-serve is asked both
ways, and reports it as `instead` on the `start` line.

Semantic and local sources are asked before the keyword pass, so the model embeds the
query in its worker while the words are searched; query vectors are kept (200, LRU).
`vector-index.ts` keeps the model's vectors as one 8-bit matrix (`int8-matrix.ts`: a scale
per row, rows padded to 16 bytes, about 23 MB for 60,000 passages), updated by `upsert`,
reloaded when `count(*)` differs, dropped after `MATRIX_IDLE_MS`. A query takes
`2 × limit + 16` candidates by an integer dot product in hand-assembled WebAssembly SIMD
(`i16x8.extmul` + `i32x4.extadd_pairwise`; JavaScript where SIMD is missing), then reads those
candidates' Float32 vectors from SQLite and returns their exact similarities. Kind- or
item-narrowed queries still read SQLite. While the built-in model's worker owes passages
(a build), a query goes to a second worker on one thread (`built-in.ts`, `quick`), so it
does not wait for the passage the first is on. Local sources get the query without `STOP_WORDS`; the layers
store matches only the last word as a prefix.

`scripts/search-eval/speed.mjs build|run <folder>` makes a library of about 57,800
passages from the system word list (Zipf frequencies, household words placed among them)
and times the evaluation set's searches at the server. On an M2 Max laptop the own-results
p95 went from 178 ms to 31 ms with these changes, and a flat vector query from 115 ms to 22 ms.
`run <folder> 3 --meaning [--building]` gives every passage a random vector, switches the
built-in model on (with `--building`, 3,000 passages are left for a build that runs during
the timing) and prints the time of the question's vector and of the comparison. Measured on
the M2 Max: comparing 57,800 vectors 21 ms as Float32, 3.2 ms as 8 bits (exact similarities
included); own results p95 during a build 108 ms with one worker, 36 ms with the second.

Other sources' results are scored by `rescore` from what they show (title, subtitle,
snippet). Local sources (places, repeaters) go to `places`, not `results`, unless their
kind was asked for; `placesFirst` when the query looks like a name, callsign or frequency.
Meaning is blended by `blendMeaning`: a result found both ways scores
`1 − (1 − words)(1 − meaningScore × MEANING_LIFT)` (0.5; full weight let own items, which have
vectors, pass better reference articles, which have none); one found by meaning alone
(“Similar in meaning”) must be within `SIMILARITY_WINDOW` (0.2) of the nearest and, beside words
(`BESIDE_WORDS`), at least `MEANING_FLOOR` (0.3, as for answers) similar, at most `MEANING_ONLY_MOST`
(8) of them, never a contact; on "By meaning" (`MEANING_ONLY`) none of these apply. When the keyword
pass found nothing, every term's count is 0 and the nearest is below `LOOSE_BELOW` (0.6), hybrid search
drops them and returns their number as `looseHeld`; `loose=1` keeps them. Calibrated on the Pi (24
November 2026): keyboard-mashing's nearest 0.35 to 0.58, useful meaning results 0.29 at least. It scores at most `MEANING_CEILING` (0.6) and always below the lowest result holding
every word (`WordsHeld.everyWord`, from `RankedItem.everyWord` and, for reference articles,
`rescore`). For a medical question, a result that is a trusted source (`adjustFor(...).trusted`)
with a word in its title, a heading or a tag (`parts.title > 0`: not a whole book that
mentions it once), holds every word and is at least `SAME_MEANING` (0.6) similar is put before the rest, its
reason ending “and means the same”. Answers still fuse passages with RRF (`searchPassages`).

Reference archives (`modules/kiwix`):

- `routing.ts` gives each archive a prior for the question (topics, its own words, general
  encyclopaedia, how-to, `RouteMemory` of recent good results, language) and
  `routeArchives` splits them into the first `ROUTED_FIRST` (6) and the rest. The rest are
  searched in the same search when the first give fewer than `referenceShape.enoughGood`
  (3) results scoring `GOOD_SCORE` (0.6), and otherwise on `scope=all`.
- Full text (`referenceShape.firstEach`, 8, from each routed archive) goes through Outpost's
  own queue three at a time, because kiwix-serve works four at a time and finishes searches
  whose caller has gone; title search (`suggest`, for `titleWords`) through a second queue,
  one at a time. A collection's titles go out as a `done: false` part, replaced by its last.
- `junk.ts` drops list pages before scoring; `rank` (the search service's `rescore`, with
  `titleIsAnswer` and `TITLE_MATCH_BONUS` where the archive's prior reaches
  `TITLE_ANSWER_PRIOR`) puts every article on the one scale.
- `search-health.ts` marks an archive refused (400s) or failing (three in a row) in
  `meta.kiwix.search`, so it is searched by titles only and not warned about.

`GET /api/search` without `reference=later` merges archives by score (each at
`OWN_FIRST`, 0.95, of its score beside the library's own) and waits at most 10 seconds. The
search screen makes the same list as the articles stream in (`oneList` in
`apps/web/src/lib/reference-search.ts`, `REFERENCE_BESIDE_OWN` from `@outpost/shared`): the ten
best articles go among page 1 of the person's own, before the first own result scoring less,
only those above the page's last own score when more pages follow; `useSteadyOrder` holds the
order under a pointer, focus, or a finger for 1.5 s after it lifts and while the page scrolls.

### Measuring search

`scripts/search-eval/queries.json` holds 99 questions in three sets (`sets`): the 56 household
questions, 31 everyday searches tried on a Raspberry Pi ("car battery flat", "ration food for
a family", "storm warning"; five are in both), and 17 asked in the persona tests of 24 November
2026 ("persona": "can I take paracetamol and ibuprofen together", "bleeding wont stop", four
keyboard-mashings marked `nonsense`). A query's `titleNeeds` caps a title without it at grade 1;
`not` grades a title in another sense 0. Each has graded answers
in the fixture library (`library.mjs`, item id → 0–3) and patterns for grading any
library's results. `reference.json` is what 37 reference collections answered to them,
with each collection's description, category, tags and language, recorded from a real
library with GET requests only (`node scripts/search-eval/record-reference.mjs
http://host:8080 [--set everyday]`: each archive's full text and its title search, through Outpost's
per-archive endpoints; titles, paths and snippet starts: short quotations of Stack
Exchange and Wikimedia archives, CC BY-SA, and of others under their own open licences),
which `test/slow-kiwix.ts` replays (its title search answers with the titles holding every
word).

- `apps/server/test/search-quality.test.ts` runs the set on the fixture library and the
  recorded collections and fails below nDCG@5 0.81 on the household set or 0.72 on the everyday
  set, success@3 95% or any zero-result question, when a car search's first three are not all
  useful, below 0.6 on the persona set, when the medicine question's first two are not grade 3 or
  "bleeding wont stop" shows a brake page, when keyboard-mashing finds anything by meaning alone, and below success@3 80% or with any list page among the reference
  collections' own results. `SEARCH_EVAL_OUT=table.txt` writes both tables.
- `node scripts/search-eval.mjs http://host:8080` runs it against a running Outpost with
  GET requests only and grades by pattern, each set apart as well (a dropped connection is
  asked once more); `--rescore` also orders that server's
  candidates with this checkout's scorer, offline, adding what this checkout's title words
  ("paracetamol ibuprofen") find in titles. `--reference` measures the reference
  collections as the search screen gets them (`reference-stream.mjs`): time to the first
  article, to the first useful one and to the end, success@3 and the useful share of the
  first five of the list shown, and the server's time for the person's own results.

Measures: nDCG@5 (gain 2^grade − 1; ideal from the grades, or on a real library from
everything either run retrieved), success@3 (grade ≥ 2 in the first three), zero-result
rate, p95 time.

OCR: Tesseract 5.1 as WebAssembly (`tesseract.js-core`), English `tessdata_best`
(integer), in a worker thread. PDF pages are rebuilt from their images with the PDF text
library (JPEG, CCITT G4, JPEG 2000, raw, stencils, strips tried; JBIG2 untried). Pages
scoring below 60 are retried in three other orientations. Output in `extracted/`.

Embeddings: `onnxruntime-web` in a worker, half the threads, max four (native ONNX is
about four times faster but needs per-platform builds). Passages longer than the model's
256 pieces are read in consecutive stretches, averaged by length. Files fetched at build time at a
pinned revision and SHA-256-checked on every load; `scripts/fetch-embedding-model.mjs`
puts them in `apps/server/models/` (not committed). Model id
`built-in:all-MiniLM-L6-v2-q8-<fingerprint>` (now `245889ee`; the earlier one that cut
long passages was `84769597`). Build batches of 16 (`search.semantic.batchSize`).

Export format: gzip JSON lines; header
`{"format":"outpost-embeddings","version":1,"modelId","provider","model","dimensions","exportedAt"}`,
then `{"h": <passage text hash>, "v": <float32 base64>}`, applied to every passage with
that text and no vector for the model. `GET /api/semantic/passages[?model=][&all=1]` is the
other half: header `{"format":"outpost-passages","version":1,"modelId","passages"}`, then
`{"h", "t"}` with `t` exactly what the build embeds (`passageInput`: title, heading, text).
`scripts/build-vectors.mjs <address>` fetches it, embeds with `floor(threads / 4)` copies of
the built-in model, writes an export and posts it to `/api/semantic/import`.

## Stand-in and evaluations

Automated tests never contact a real model: `apps/server/test/model-server.ts` speaks
Ollama's and llama.cpp's protocols (including Ollama's silent cutting and tool calls), and
refuses any field outside those listed, so the tests fail if Outpost starts sending
something a real server might not understand. Named models reproduce real faults
(`stand-in-drops`, `stand-in-fails`, `stand-in-tools`, `stand-in-tools-loops`,
`stand-in-no-tools`).

With a real model server (not part of the suites; downloads nothing):

```bash
node apps/server/test/eval/answers-eval.ts --models llama3.2:3b,llama3.2:1b --runs 2
node apps/server/test/eval/tools-eval.ts --models lfm3:1.7b --json run.json
node apps/server/test/eval/tools-eval.ts --rejudge run.json
```

`answers-eval`: 45 questions (32 answerable, 13 not) over 16 made-up documents.
`tools-eval`: its own Outpost filled by `test/fixtures/tools/filled.ts`, 16 questions
through Chat. Both judge crudely by rule; read the replies.
