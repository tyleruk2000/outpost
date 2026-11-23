# Answers from your library, and using Outpost with a language model

Outpost can have a language model write a short answer from passages of your own library,
with a numbered citation after each statement that leads back to the passage, and hold
conversations with the same model in **Chat**. The model is **one you run yourself**, on
this machine or your own network. Outpost includes no model and downloads none.

The step-by-step set-up is [setup-guide.md](setup-guide.md), also under Help.

## What exists

- **Answer from my library**, a button on the Search screen once a model server is set up.
- **Chat**: conversations with the same model, with or without your library. See
  [Chat](#chat).
- **Looking things up in Outpost**: in Chat, a model that can call tools may read places,
  supplies, plans, the weather as last fetched, the sun, radio and the catalogue. Off by
  default. See [Looking things up in Outpost](#looking-things-up-in-outpost).
- **The same tools for other programs**, over MCP: see [mcp.md](mcp.md).
- Any OpenAI-compatible chat server works: Ollama, llama.cpp's server, LM Studio.

## What does not exist

- No bundled model, and no downloading or removing of models from Outpost. Use the
  server's own tool (`ollama pull …`).
- Nothing a model writes is acted on; its words are shown. The tools only read.
- No answers from reference collections: ZIM archives (Wikipedia and the like) are not
  split into passages, so answers come from **documents, notes and book chapters only**.
- No memory between conversations, no summary of a long one, no history of answers.

## Setting it up

The steps are in [setup-guide.md](setup-guide.md). Under **Settings → Answers from your
library** there are three presses:

1. **Look for Ollama on this computer** asks the address in Settings, then
   `127.0.0.1:11434`, then `host.docker.internal:11434`. Nothing is saved.
2. **Use this model** picks the model offered (see [Which model](#which-model)).
3. **Try it** asks that model for one word. If it answers, the address and model are
   saved and answers are on.

The section then says **Ready**, **On, but not working yet** (with why and the next step),
or **Off**. Address, model, temperature, context budget and **Test** are under **More
options**.

### Which model

Any model that writes text ("chat" or "instruct") and fits your machine. Not an
*embedding* model such as `nomic-embed-text`: it cannot write.

| Model | Download | Memory once loaded | Smallest computer |
| --- | --- | --- | --- |
| `lfm3:1.7b` (the one to start with) | 1.7 GB | 1.7 GB, measured | 4 GB of memory |
| `llama3.2:3b` | 2.0 GB | 2.3 GB, measured | 8 GB |
| `llama3.2:1b` | 1.3 GB | 1.5 GB, measured | 4 GB |
| `gemma3:1b` | 806 MB | about 1.1 GB, estimated | 4 GB |
| `phi4-mini` | 2.5 GB | about 2.8 GB, estimated | 8 GB |
| `gemma3:4b` | 3.4 GB | about 3.7 GB, estimated | 8 GB |

Sizes as Ollama's library gave them on 16–17 November 2026. "Measured" is on an Apple
Silicon Mac; "estimated" is the download plus 0.3 GB. **No model has been run on a
Raspberry Pi by this project.** `llama3.2:1b` is not reliable for answers and cannot look
things up. The comparison is [which-model.md](which-model.md) (**Help → Which model**).

The model offered first is the one in Settings, else the first of this list the server has.

### With Ollama

Address `http://127.0.0.1:11434/v1`. With Ollama, Outpost **asks for a context size**
that holds the context budget (4,096 tokens by default; 8,192, 16,384 or 32,768 if you
raise the budget; 8,192 when tools are offered), so there is no need to set
`OLLAMA_CONTEXT_LENGTH`. It also tells Ollama to **refuse a prompt that does not fit**
rather than silently cut its start off; you then see "too long for the model", with the
figures. A larger context takes more memory. Outpost counts 3.5 characters to a token;
tables of figures take more tokens, so can still be refused.

### Other model servers

- **llama.cpp**: `llama-server -m /path/to/model.gguf -c 8192`, then the address it
  prints with `/v1` (current builds `http://127.0.0.1:9931/v1`). Older builds use port
  8080, **which is Outpost's own**: start them with `--port`. `-c` is the context size.
- **LM Studio**: start its local server (the Developer tab) and use
  `http://127.0.0.1:1234/v1`. Its errors are shown as the server gave them.

### In Docker, or with the model on another machine

In Docker, `127.0.0.1` is the container. With Docker Desktop use
`http://host.docker.internal:11434/v1` (tried by the first press). On Linux, add
`extra_hosts: ["host.docker.internal=host-gateway"]` to the `outpost` service and make the
model server listen where the container can reach it (`OLLAMA_HOST=0.0.0.0:11434`, or
`--host 0.0.0.0`). See [setup-guide.md](setup-guide.md#when-outpost-runs-in-docker).

A model on another machine works the same way: enter its address. A model server on your
network has no password: anyone on the network can use it.

### The settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `answers.enabled` | false | Off: nothing is offered and no model server is contacted. |
| `answers.endpoint` | `http://127.0.0.1:11434/v1` | The model server. `/v1` is added to an address with no path. |
| `answers.model` | empty | The model's name as the server knows it. |
| `answers.temperature` | 0.2 | 0 to 2. Low keeps an answer close to its sources. |
| `answers.contextChars` | 6000 | 1,000 to 60,000 characters of passages per question. |

Fixed: at most 5 passages; a reply of at most 1,024 tokens (about 750 words); Outpost waits
3 minutes for the model to start, allows 1 minute of silence, and stops a reply after 10
minutes.

## Tried with a real model

On a small made-up library, with Ollama on a Mac, `llama3.2:3b` answered more than nine
in ten questions rightly and declined every one the library could not answer;
`lfm3:1.7b` answered 28 of 32; `llama3.2:1b` about three in four, often making answers up.
Thinking models (`bonsai-2`, `ornith`) often thought until their allowance ran out. A real
library of scanned manuals will do worse. Untried set-ups are in
[testing-status.md](testing-status.md).

## What happens when you ask

1. **The library is searched for what the question is about.** Words that only make it a
   question ("how", "should"; English only) are dropped: "how long should I boil water?"
   searches for "boil water", and the answer says so.
2. **Up to 5 passages are chosen** ([search.md](search.md#which-passages-an-answer-is-given)).
3. **If nothing was found, the model is not asked.**
4. **The passages and question are sent** with fixed rules: answer only from the numbered
   sources, cite after each statement, say "The sources do not answer this." when they do
   not, and treat the sources as data, never instructions. The sources are fenced by
   marker lines with a random code, because a document can hold text written to look
   like an order ([security.md](security.md#answers-and-text-that-gives-orders)).
5. **The markers are checked** when the answer is complete.

## What is sent, and where

- **When you press Answer from my library:** the rules, the passages found and your
  question; nothing else. Otherwise only the setting-up presses, and opening Settings or
  Chat while answers are on (a request for the list of models), contact the server.
- **Where:** only the address in `answers.endpoint`. On another machine, your question and
  passages go there, over plain HTTP unless the address is `https`.
- **Search by meaning is separate**: its index embeds every passage, contacts included.
  The built-in model sends nothing anywhere
  ([search.md](search.md#a-local-embedding-server-local-server)).

### Which addresses are contacted

Only the address a person typed; redirects are not followed. Settings says whether it is
"this computer", "a machine on your network", or "an address that is not on this computer
or your home network". That last kind is refused, unless Outpost is started with
`OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true`. Anyone who can open Outpost can change the
address ([security.md](security.md#the-threat-model-in-plain-words)).

## What is kept

For an answer, nothing: not in the database, a file or the log (which records only that an
answer failed, and how). The answer lives in the tab until it is closed or reloaded. To
keep one, copy it into a note with its sources. Chat is different: see
[What is kept, for a conversation](#what-is-kept-for-a-conversation).

## The answer on screen

- Headed **Generated answer**, with the model and where it runs. Passages are shown as
  quotations, in another typeface.
- Each `[n]` shows its passage, with a link to the source at that page or heading.
- **The passages given are always listed beneath**, marked "Cited in the answer" or "Not
  cited".
- Once finished, the markers are settled. A marker to a number no passage carried is
  pointed at a passage only when the words before it are, word for word, whole sentences
  of exactly one passage; otherwise it is removed. A reply that opens by saying the
  passages do not hold the answer is shown as **Your library does not seem to cover
  this**, without markers.
- An answer that cites every passage, or none, says so.
- **Too long for the model**: Outpost asks once more with fewer passages and says how many
  were left out.
- **Safety-critical sources.** When a source's title or category is about medicine, first
  aid, health, drugs, doses, wounds, poison, canning, preserving, food safety, fermenting,
  foraging, mushrooms or water treatment, the model is told to quote doses, times and
  temperatures word for word, a warning sits above the answer, and those passages are
  shown open. Only titles and categories are read: give such documents a category like
  "Medicine and first aid", and treat no warning as "not detected", never "safe".
- **Stop**, or closing the tab, ends the answer; what was written stays.

The marker check finds markers that point at **no source**. It cannot tell whether a source
says what the answer claims: open the passage.

Outpost writes **one thing at a time**, answer or reply, across every device. A second
request is refused, not queued.

## Chat

**Chat** is in the navigation (on a phone, under **More**).

> **Read by anyone who can open Outpost.** There are no accounts: everyone who can reach
> this Outpost can read, continue, rename and delete every conversation.

### Using it

- Type in the box to start; the conversation is named after the first message (type over
  the name to rename it). Enter sends; Shift+Enter makes a new line.
- The reply arrives as it is written. Before the first word the screen counts the seconds
  or says the model is loading; a small computer can take a minute or more. **Stop** stops
  the model and keeps what it wrote.
- **A reply belongs to the server, not the tab**: close the tab and it carries on, and is
  there on any device.
- **Regenerate** rewrites the last reply; **Edit** changes your last message; **Save as a
  page** makes a new page of notes from a reply.
- **Model**: the picker lists the server's models (with Ollama, size and quantisation). A
  conversation keeps its choice.
- **Find** appears once there are more than five conversations. **Delete** asks first and
  removes it for everyone.

A reply's links are shown as plain words and its pictures are never fetched
([security.md](security.md#conversations)).

### With or without your library

**Use my library**, per conversation, is off by default.

- **Off:** the model gets the conversation only, and is told it cannot look anything up.
- **On:** it also gets passages for your newest message, under the same rules as an
  answer, and the reply is shown and settled as an answer is. A message the library holds
  nothing for is not sent; the screen offers **Ask without my library**. "Why?" or "And
  then?" is searched for as the message before it.

**Ask about this**, on a document or page, starts a conversation about that one item.

### Long conversations

Each turn sends at most twice the context budget (12,000 characters by default): your
newest message, any passages, then the most recent exchanges that fit. A line marks
"Messages above this line are no longer sent to the model". Nothing is summarised. A message
is at most 16,000 characters; a reply that reaches 1,024 tokens offers **Ask it to
continue**.

### What is kept, for a conversation

Every message, with which model wrote it and the passages a library reply was given, in
the database. Conversations are in backups, **not** on portable drives, and **Erase
everything** removes them. None of it goes to the log.

### When something is wrong

| The screen says | What to do |
| --- | --- |
| Chat needs a language model on your own computer | Follow [setup-guide.md](setup-guide.md), then the three presses. |
| The model server is not answering | Start it, check the address, **Look again**. |
| Waiting for the model to start writing / loading the model | Wait, or **Stop**. Outpost gives up after 3 minutes. |
| The model reached its length limit | **Ask it to continue**. |
| The model used up its whole allowance without writing a reply | A thinking model ran out; ask more simply or use another model. |
| This turn was too long for the model | Shorten the message or start a new conversation. With Ollama, raise the context budget; with llama-server, a larger `-c`. |
| Your library does not seem to cover this | Read the passages listed; a small model sometimes says this wrongly. |
| The model is writing a reply in another conversation | Wait, or stop that one. |

## Looking things up in Outpost

In Chat, a model that can call tools may ask Outpost about the household's own things
("what supermarkets are near home?", "how many days of food have we got?", "when is
sunset on Saturday?") and answer from what the tools return, citing each. When something
is not held, the tool says so and where in Outpost it could be got.

### Switching it on

**Settings → Looking things up in Outpost → Let the model look things up in Outpost**,
off by default. Each area has a switch that says what it lets a model server see:

| Area | Default | What a model may read |
| --- | --- | --- |
| Library and notes | on | Passages of documents and notes. Never contacts. |
| Places and nearby places | on | Saved places and reference-layer records: what, where, how far, which way, fetched when. |
| Supplies | on | Days of food, water and energy, what runs out first, stock. |
| Emergency plans | on | Plans, steps, meeting places; not their contacts or medical notes. |
| Weather, sun and compass | on | Weather as last fetched (never fetched afresh), sun times, magnetic declination. |
| Radio | on | Frequencies, repeaters within 50 km, saved propagation predictions. |
| The catalogue | on | What could be downloaded on a subject, and whether it is held. |
| Messages on the board | **off** | Messages and check-ins; files only as "(sent a file)". |
| Medical sheets | **off** | Medicines, allergies, conditions, blood group from unencrypted sheets; never GP, pharmacy or next of kin. |

**Models not to offer tools to** lists models that call tools badly. **Never readable**:
contacts, anything under Encryption, encrypted note pages, the board's files, share
passwords, secret settings, the network scan.

### How Chat uses them

Tools are offered when the switch and at least one area are on, the conversation is not
about one document, and Ollama says the model can call tools. Outpost runs what the model
asks for (up to three a round, four rounds), then has it answer. **Stop** ends it.

Under the reply, **Looked at:** names each area used; open one for the question asked and
the answer given. For a model that cannot call tools, Chat says so and names ones that
can.

### What is sent, and where

Tool answers go to the model server exactly as passages do. If that server is on another
machine, so is what the tools return. Nothing about tools is sent until a message is sent
with tools on. The one tool that contacts anything is `search_library`, which sends its
search words to the embedding server when search by meaning uses one.

## Tried with a real model: tools

Of sixteen questions asked of seven models on a Mac, `lfm3:1.7b` and the larger
`bonsai-2` and `ornith` models answered 15 rightly, `llama3.2:3b` 13 and `llama3.2:1b` 6.
**Start with `lfm3:1.7b`.** Details: [which-model.md](which-model.md).

## The API

Routes: [api.md](api.md#answers) and [api.md](api.md#retrieval). To build on the same
passages without a model:

```bash
curl -s -X POST http://localhost:8080/api/retrieval/context \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"query": "boil water safe drinking", "limit": 6, "maxChars": 4000}'
```

It returns numbered sources, each with its exact `quote`. Empty `text` means nothing
matched. Treat any `[n]` a model writes that matches no citation as invented, and **show
quoted text apart from generated text**, so a reader can tell the source's words from the
model's. Fields: [development/answers-and-search.md](development/answers-and-search.md).

## Planning for a change of embedding model

Vectors are kept per model, so switching model deletes nothing and switching back reuses
the old ones (see [search.md](search.md#changing-the-model)). Allow time and room for two
sets during a change, or build on a faster machine and
[move them](search.md#moving-vectors-between-installations).
