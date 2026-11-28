# Search by meaning

Turning it on, what it costs, where its model runs, and its limits. Inside Outpost, **Search → How search by meaning works** explains it in plain words and diagrams ([Seeing how it works](search.md#seeing-how-it-works)). Part of the search guide, which starts at [Search](search.md).

Search by meaning finds passages about the same thing even when they share no words with
your query. An **embedding model** turns each passage into a list of numbers (a vector),
and your query is compared with them. A small model is **built in**, in the app, the
Docker image and portable drives; nothing is downloaded and nothing leaves the machine.

## Turning it on

**Settings → Search by meaning**: the section says what it will cost for your library.
Turn the switch on. The index builds by itself: **Starting**, then **Reading your
library** with a progress bar and the time left, then **Ready**. You can leave the page.
Until then searches are keyword searches, and say so.

If it points at an embedding server that is not there, the section offers **Use what
comes with Outpost**. The rest is under **More options**.

## What it costs

With the built-in model:

| What | About |
| --- | --- |
| Building the index | 45 seconds per thousand passages on a fast laptop; four minutes on a Raspberry Pi 5, so 60,000 passages take about four hours the first time. |
| A search | A few milliseconds more on a laptop. |
| Disk | 2.2 MB per thousand passages. |
| Memory | About 300 MB while in use (twice that during a build), given back after five idle minutes, plus 400 bytes a passage. |

The progress line shows the real time left. A faster computer can [do the reading
instead](#reading-the-library-on-a-faster-computer).

## Choosing where the model runs

### Built in ("Built in")

[all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
(Apache-2.0). It gives the same vectors on every platform, so vectors built on one
computer work on another, and uses at most half the processor threads. **It was trained
on English**: for other languages use a local server. **It is small**: it knows "paw" and
"pads" belong together but will not follow an argument; hybrid search covers for it with
exact words.

Running from source, fetch its files once with `node scripts/fetch-embedding-model.mjs`
(23.7 MB from `huggingface.co`). Until then Settings says "The built-in model has not been
fetched yet"; keyword search is unaffected.

### A local embedding server ("Local server")

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

In Docker, use `http://host.docker.internal:11434/v1` (on Linux, the `compose.yaml` Outpost
comes with already has the `extra_hosts` line that gives the container that name).

### Demonstration vectors

Vectors made from word counts, used by *How search works* while search by meaning is off.
They show the mechanics but are not a language model and add little to keyword search.

## Building the index

Turning it on, choosing another model, or **Build index** starts a build, which only does
what is missing. **Pause** and **Stop** sit beside the progress line; **Carry on reading**
resumes, and a restart carries on by itself. New and changed documents are read a few
seconds after they are indexed. A failed build says why and offers **Try again**.

## Changing the model

Vectors are kept per model and never mixed. Switching keeps the old ones under "Vectors
from other models" until you delete them, and the new model builds its own. See
[ai.md](ai.md#planning-for-a-change-of-embedding-model).

## Reading the library on a faster computer

A laptop can do a Raspberry Pi's reading for it, about eight times as fast. On the laptop,
in a copy of Outpost's source with the model fetched (`node
scripts/fetch-embedding-model.mjs`), give the Pi's address:

```bash
node scripts/build-vectors.mjs http://192.168.1.134:8080
```

It asks the Pi for the passages it has not read yet, reads them with the same built-in
model, shows the time left, and sends the vectors back. A build running on the Pi carries
on with whatever is still missing; run the command again later for passages added since.
With a household PIN set, the Pi refuses the vectors from a device that is not unlocked:
the command keeps the file and says where, and you import it under **Settings → Search by
meaning → More options**. Every passage's text goes to the laptop, contacts and notes
included, so use a computer of your own on your own network.

## Moving vectors between installations

A faster computer holding the same library, with the same model and passage settings, can
also build all the vectors itself and hand them over. **Settings → Search by meaning →
More options** has **Save vectors to a file** and **Load vectors from a file**, or on the
fast computer:

```bash
curl -o vectors.jsonl.gz "http://localhost:8080/api/semantic/export"
```

and on the small one:

```bash
curl -X POST "http://localhost:8080/api/semantic/import" \
  -H "X-Outpost-Request: 1" \
  -H "Content-Type: application/gzip" \
  --data-binary @vectors.jsonl.gz
```

Vectors are matched by passage text, so passages that differ are not matched. The small
computer still needs the same model for its searches.

## Hybrid ranking

When search by meaning is ready, the default is **Best of both**, and the count above the
results says which way they were found ("found by words and by meaning").

- A result found both ways scores more than by its words alone.
- A result found by meaning alone says **Similar in meaning**, and always comes after every
  result holding all your words: when the words find plenty these wait below them, and
  when the words find little up to eight follow. Contacts are never found by meaning
  alone. The model finds something near any question, nonsense included, so these are
  only as good as it is.
- When no word you typed is in your library at all ("asdfghjkl") and nothing is close in
  meaning, the screen says **Nothing matches** and offers **Show N loosely related
  pages** instead of listing them. **By meaning** always lists them.
- For a first aid or medical question, a trusted source holding all your words, with one of
  them in its title, a heading or a tag, whose passage means the same as the question comes
  first, and says "means the same". A whole book that mentions the word on one page does not.

**More options** holds **Weight of matching words**, **Weight of matching meaning** (both
1) and, for the passages given to an answer, **Evenness of combining** (60); *How search
works* lets you try a change first.

## Limits of the built-in index

Each query is compared with every vector, which stays comfortable to about 100,000
passages (about 220 MB on disk); beyond that, searches slow in proportion. Reference
articles are found by keyword only. Results found by meaning show the passage's start,
unhighlighted.

How it works inside, for developers: [development/answers-and-search.md](development/answers-and-search.md).
