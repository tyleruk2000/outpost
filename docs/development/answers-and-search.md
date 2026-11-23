# Answers, search and tools: internals

For people changing the code. The household guides are [ai.md](../ai.md),
[search.md](../search.md) and [mcp.md](../mcp.md); routes are in [api.md](../api.md).

## Answers

`question → Retriever (outpost-hybrid) → [Reranker: interface only] → ContextAssembler →
ModelProvider → checkCitations`. Code: `apps/server/src/modules/answers/`,
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

Keyword ranking (`modules/search/keyword.ts`, `score.ts`, rules in
[search.md](../search.md#ranking)):

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
`vector-index.ts` keeps the model's vectors as one Float32 matrix, updated by `upsert`,
reloaded when `count(*)` differs, dropped after `MATRIX_IDLE_MS`; kind- or item-narrowed
queries still read SQLite. Local sources get the query without `STOP_WORDS`; the layers
store matches only the last word as a prefix.

`scripts/search-eval/speed.mjs build|run <folder>` makes a library of about 57,800
passages from the system word list (Zipf frequencies, household words placed among them)
and times the evaluation set's searches at the server. On an M2 Max laptop the own-results
p95 went from 178 ms to 31 ms with these changes, and a flat vector query from 115 ms to 22 ms.

Other sources' results are scored by `rescore` from what they show (title, subtitle,
snippet). Local sources (places, repeaters) go to `places`, not `results`, unless their
kind was asked for; `placesFirst` when the query looks like a name, callsign or frequency.
Meaning is blended by `blendMeaning` (`MEANING_CEILING` 0.6). Answers still fuse passages
with RRF (`searchPassages`).

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
`OWN_FIRST`, 0.95, of its score beside the library's own) and waits at most 10 seconds.

### Measuring search

`scripts/search-eval/queries.json` holds 50 household questions, each with graded answers
in the fixture library (`library.mjs`, item id → 0–3) and patterns for grading any
library's results. `reference.json` is what 37 reference collections answered to them,
with each collection's description, category, tags and language, recorded from a real
library with GET requests only (`node scripts/search-eval/record-reference.mjs
http://host:8080`: each archive's full text and its title search, through Outpost's
per-archive endpoints; titles, paths and snippet starts: short quotations of Stack
Exchange and Wikimedia archives, CC BY-SA, and of others under their own open licences),
which `test/slow-kiwix.ts` replays (its title search answers with the titles holding every
word).

- `apps/server/test/search-quality.test.ts` runs the set on the fixture library and the
  recorded collections and fails below nDCG@5 0.8, success@3 95% or any zero-result
  question, and below success@3 80% or with any list page among the reference
  collections' own results. `SEARCH_EVAL_OUT=table.txt` writes both tables.
- `node scripts/search-eval.mjs http://host:8080` runs it against a running Outpost with
  GET requests only and grades by pattern; `--rescore` also orders that server's
  candidates with this checkout's scorer, offline. `--reference` measures the reference
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
that text and no vector for the model.

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
