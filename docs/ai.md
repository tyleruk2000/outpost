# Using Outpost with a language model

Outpost does not include a language model and does not generate answers. What it does
include is the part of a question-answering system that does not need a model: finding
the right passages and handing them over with exact citations. This page describes
what exists, what does not, and how to connect a local model yourself.

## What exists today

- **Passages with provenance.** Every indexed passage records its document or note,
  page, heading, character offsets and a hash of its text.
- **`POST /api/retrieval/passages`**: the passages that best match a question.
- **`POST /api/retrieval/context`**: the same passages laid out as numbered sources,
  ready to place in a prompt, with a citation record for each number.
- **A safety flag** on that context, set when a source belongs to a field where a
  wrong paraphrase can hurt someone.
- **Optional semantic search**, so retrieval can work by meaning as well as by words.
  See [search.md](search.md#semantic-search).
- **Typed interfaces** for the missing parts, in
  `apps/server/src/modules/retrieval/types.ts`.

## What does not exist

- No language model, and no code that calls one.
- No reranker. The `Reranker` interface is declared; nothing implements it.
- No endpoint that returns an answer, and no chat or "ask" screen in the web app.
- No retrieval from reference collections. Articles in ZIM archives are searched by
  kiwix-serve and are not split into passages by Outpost, so retrieval covers
  documents and notes.

The server keeps two registries for a later release, `rerankers` and `models` on the
retrieval service. Both are empty.

## The intended flow

```
question ─▶ Retriever ─▶ [Reranker] ─▶ ContextAssembler ─▶ ModelProvider ─▶ answer
                                              │                               │
                                              └──────── citations ◀───────────┘
```

| Step | Interface | State |
| --- | --- | --- |
| Find passages | `Retriever` | Implemented (`outpost-hybrid`): runs the ordinary search and returns whole passages. |
| Reorder them with a stronger model | `Reranker` | Interface only. |
| Lay them out as numbered sources | `ContextAssembler` | Implemented. |
| Generate text | `ModelProvider` | Interface only: `generate(request)` returns the answer as a stream of text. |
| Tie the answer back to sources | `CitedAnswer` | Type only. A helper, `checkCitations`, finds which `[n]` markers an answer used and which refer to no supplied source; it is not exposed over HTTP. |

An integration for Ollama, llama.cpp or any OpenAI-compatible local endpoint would
implement `ModelProvider` and leave the layers below it unchanged.

## The request

Both endpoints take the same JSON body.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `query` | string, 1 to 1000 characters | required | The question or search terms. |
| `limit` | integer, 1 to 30 | 8 | Most passages to return. |
| `maxChars` | integer, 200 to 60000 | 6000 | For `/context`: budget for the quoted text. The first passage is always included. |
| `kinds` | array of strings | `["document", "note"]` | Which kinds of item to retrieve from. |
| `mode` | `keyword`, `semantic` or `hybrid` | hybrid when semantic search is ready, otherwise keyword | How to search. |

The query is handled like a search-box query: every word must match, with a fallback
to any word (see [search.md](search.md#keyword-search)). Without semantic search, a
few key terms retrieve better than a long sentence.

## The shapes

`RetrievedPassage` (from `/api/retrieval/passages`, in `passages`):

| Field | Meaning |
| --- | --- |
| `chunkId` | Id of the passage in the index. |
| `kind`, `entityId` | The owning item, for example `document` and its id. |
| `title`, `collection` | Title, and the item's category when it has one. |
| `sourcePath` | Path of the original file inside its storage location, when there is one. |
| `url` | In-app route that opens the source at this passage, with `?page=N` for PDFs. |
| `page`, `heading` | Where the passage is. |
| `charStart`, `charEnd` | Offsets into the item's text. |
| `text` | The passage exactly as stored. Quoted material must come from here. |
| `contentHash` | Hash of the passage text. |
| `indexVersion` | Version of the indexing rules that produced the passage. |
| `score` | Relevance from 0 to 1 within this retrieval. |
| `retrievedBy` | Which layers found it: `keyword`, `semantic`. |

`AssembledContext` (the whole response of `/api/retrieval/context`):

| Field | Meaning |
| --- | --- |
| `query` | The query as given. |
| `text` | Numbered source blocks: `[1] Title, Heading, page N`, then the quoted passage, separated by blank lines. |
| `citations` | One `Citation` per number: `marker`, `chunkId`, `kind`, `entityId`, `title`, `collection`, `url`, `page`, `heading`, `quote` (the exact text) and `contentHash`. |
| `omitted` | Passages that did not fit the budget. |
| `safetyCritical` | See below. |

Passages from the same source are kept together and in reading order.

## A worked example

This asks Outpost for context and passes it to a model running in Ollama. It needs
`curl` and `jq`. The model name is an example; use one you have pulled. With sign-in
on, add your session cookie to the Outpost request.

```bash
QUESTION="boil water safe drinking"

CONTEXT=$(curl -s -X POST http://localhost:8080/api/retrieval/context \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$QUESTION" '{query: $q, limit: 6, maxChars: 4000}')")

# The numbered sources, exactly as they will be given to the model:
echo "$CONTEXT" | jq -r '.text'

# Whether the sources are in a safety-critical field:
echo "$CONTEXT" | jq '.safetyCritical'
```

```bash
jq -n --arg q "$QUESTION" --arg sources "$(echo "$CONTEXT" | jq -r '.text')" '{
  model: "llama3.2",
  stream: false,
  system: "Answer only from the numbered sources. After each statement give the number of the source it comes from in square brackets, like [1]. If the sources do not answer the question, say so.",
  prompt: ("Sources:\n\n" + $sources + "\n\nQuestion: " + $q)
}' | curl -s http://127.0.0.1:11434/api/generate -d @- | jq -r '.response'
```

To show a source next to the answer, look the number up in `citations`:

```bash
echo "$CONTEXT" | jq '.citations[] | {marker, title, page, url, quote}'
```

If `text` is empty, nothing in your library matched; do not ask the model to answer
from nothing.

## Quoted text and generated text

This is the rule any interface built on these endpoints must follow, and the reason
the citation carries the exact `quote`:

> **Show quoted source text distinctly from generated wording.** The model's words are
> an interpretation. The source's words are the source. A reader must always be able
> to tell which is which, and to open the source.

It matters most for medical, first-aid, safety and food-preservation content, where a
confident paraphrase that changes a dose, a time or a temperature can injure someone.

`safetyCritical` is `true` when the title or category of any source in the context
matches one of these terms: medic…, first aid, health, drug, dose, dosage, wound,
poison, canning, preserv…, food safety, ferment…, foraging, mushroom, water treatment,
purif…. When it is true:

- show the quoted passages themselves, clearly marked as quotations, alongside or
  instead of the generated answer;
- make it obvious that the generated text is not the source;
- link each quotation to its source (`url`).

Limits of the flag: it looks only at titles and categories, not at the text. A
document about dosage with an unrevealing title and no category is not flagged. Give
documents a category such as "Medicine and first aid" to make the flag reliable, and
treat `false` as "not detected", never as "safe".

Also check the answer's markers. Any `[n]` that does not correspond to a citation you
supplied was invented by the model and should be shown as unsupported or removed.

## Planning for a change of embedding model

Embedding models improve, and you may want to change yours. The index is built for
that:

- Vectors are stored per passage **and per model id** (`<provider>:<model>`). Vectors
  from different models, even with different dimensions, sit side by side and are
  never compared with each other.
- Switching the model in Settings does not delete anything. Searches use the new
  model's vectors as soon as some exist; until then they are keyword searches. Start
  **Build index** for the new model.
- The old model's vectors stay, listed under "Vectors from other models", until you
  remove them (`DELETE /api/semantic/models/:modelId`). Switching back uses them
  again.
- Each vector records the hash of the text it was made from. When a passage's text
  changes, its vector is replaced on the next build.
- Passages carry an `indexVersion`, so a later version of Outpost can tell which
  passages were made under older splitting rules.
- A large index can be built on another machine and moved; see
  [search.md](search.md#moving-vectors-between-installations).

Allow for the build time and for the extra space of holding two sets of vectors
during a change.
