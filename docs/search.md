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
| `clov` | While you type, the last word also matches as a beginning ("clove"), but only when the word itself is in fewer than five items, and those come after. A space or closing quote ends that. |
| `"tyre"` | Only this word, not other spellings or names for it. |

English word forms match ("boil" finds "boiling"); accents, capitals and punctuation are
ignored; `AND` and `OR` are just words. Up to 500 characters.

Small words that only shape a question ("how", "to", "the", "what", "do", "I", "my" and
the like) are left out, and the results name them: "How to change car battery" looks for
"change", "car" and "battery". "Not", "no", "without" and "off" are kept, since they change
the meaning. Inside quotes every word counts, and a query of nothing but small words keeps
them all.

### Other spellings and names

A word is also searched as it is spelt or said elsewhere, and the results say so: "Also
searched: tire". **Search only for what you typed** turns this off for that search; a word in
quotes is never widened. About 250 entries:

- British and American spellings: tyre and tire, aluminium, diarrhoea, colour, centre,
  sterilise (with their endings: "sterilising" also finds "sterilizing").
- British and American words: petrol and gasoline, torch and flashlight, nappy and diaper,
  paracetamol and acetaminophen, mobile phone and cell phone, 999 and 911.
- Names for the same emergency: power cut, power outage and blackout; burn and scald;
  CPR and resuscitation; jump start and boost.
- Some only beside other words: "change" also finds "replace" and "fit" beside a part
  ("change car battery"), and "treat" finds "purify" and "disinfect" beside "water".

A passage with any one of them counts as holding the word; the word as typed counts a
little more than another way of saying it. Phrases such as "power cut" are found with
their words near each other in any order ("the power was cut"). Reference collections are
asked a second time with the other spelling ("tire pressure"), never more.

### Did you mean

When a word you typed is in no passage (or, when nothing has every word, in only one or
two), Outpost looks for the nearest word your library does hold: at most two letters
added, dropped, changed or swapped (one, for a word of four letters or fewer), the same
first letter preferred, then the commoner word. It is offered as a link: "Did you mean
**purify** water?" The search of your library stays as you typed it. Small words are never
offered, and a word must be in at least two passages. The words come from your own library,
as it is now, not from reference collections.

Reference collections know nothing of slips, so when a word you typed is in no passage of
your library and a near word is, they are asked for both: "purifiy water" as typed, and
"purify water". The word as typed counts in full, so a real word your library happens not
to hold ("bowline") still finds its own articles first. The reference results say so: "Also
showing results for **purify** water."

### When few items have every word

When fewer than five items hold every word, Outpost adds items that hold **most** of
them, after the ones that hold all. "Most" is weighed: each word counts by how rare it is
in your library, and an item must hold at least half of the total. So an item with
"bowline" alone can come for "water bowline", but one with "water" alone does not. The
results say "Only 2 results have every word; results with some of them follow", or "No
result has every word; showing results with some."

### What is searched

| Kind | What is indexed |
| --- | --- |
| Documents | Title, author or file name, category, tags, and the text, page by page for PDFs; for scans, the OCR text once read. A book chapter is a document. |
| Notes | Title, parent pages' titles, tags, and the text under each heading. |
| Installed collections | Title, publisher, description. |
| Catalogue entries | What Explore lists, so you can find something to download. |
| Map markers and tracks | Names and notes. |
| Contacts | Name, title, organisation, tags, numbers, addresses, callsign, channels and notes. |
| Emergency plans | Name, what it is for, the steps (by before, during and after), supplies, where things are, places, people's names and what they must remember, people to call, keeping in touch, notes. Never what a person needs for their health. |
| Supplies | Name, category, where it is kept, how much, its date and notes. |
| Medical sheets | Medicines, allergies and conditions, only with **Find them in search** on (under **Medical sheets**), and never a sheet kept encrypted. |
| Repeaters | Callsign, town and frequency (up to 50 found). |
| Places in reference layers | Feature names in installed packs (up to 30 found). |
| Reference articles | Articles in installed ZIM archives: see [below](#reference-collections-in-results). |

Not searched: the notes trash, your page templates, and the household board.

Emergency plans and supplies belong to a household: only the current household's are
found. With several households, each such result names whose it is, and the results say
"Emergency plans and supplies are those of Home, the current household."

Text is cut into passages of about 1,200 characters overlapping by 150 (**Settings →
Reading documents**). A passage never crosses a page or heading, so a result points at
the exact page. A change applies to documents added or re-read afterwards.

### Ranking

Every result, whatever found it, gets a score from 0 to 1 by the same rule, so a page of
your own and an article in a reference collection can be put in one order:

| Part | Share | What it asks |
| --- | --- | --- |
| Coverage | 0.50 | How much of the query it holds, each word weighed by how rare it is in your library. Another form of a word ("boiling" for "boil") counts 0.92 of it, another name for it 0.85, a longer word it begins 0.6. |
| Title | 0.20 | How much of the query is in the title (a tag counts three quarters, a heading 0.6). |
| Closeness | 0.15 | How near together the words are, small words in between not counted. |
| Side by side | 0.05 | All the words next to each other, in the order typed. |
| Frequency | 0.10 | How often they occur, each further mention adding less. |

An item is scored by its best passage and shows up to three, with the words that matter
marked; a PDF opens at that passage's page.

The index first finds every passage holding the words and groups them into items, so every
match is counted and every page of results can be reached, however many passages a long
book has. The first 200 items by BM25 (weights title 8, tags 4, heading 3, body 1) are
then scored by the rule above: each by its best passage in BM25's order, and the 60 that
come out best (more for a later page) by their next three passages as well. Paging further
scores further.

**Places and repeaters** whose names match are not mixed into the list: they are shown
apart, under **Places and repeaters**, after the results, or before them when what you
typed looks like one of their names, a callsign or a frequency. Their tabs list them all.

**What is on this device comes first.** Catalogue entries would have to be downloaded
before they could be opened, so they always come after everything that can be opened now:
on the **Everything** tab they are listed last, under **Available to download**, after
**In reference collections**.

#### Favoured sources and other meanings

Words cannot tell that a question about rescue breaths is better answered by a first aid
manual than by a hiking forum using the same words. So two mild corrections follow:

| The question | Favours | At most |
| --- | --- | --- |
| About first aid or medicine ("burn", "rescue breaths", "CPR") | Medical and first aid sources | × 1.25 |
| About using a generator, heater, stove or fuel safely, or carbon monoxide | Official safety guidance | × 1.25 |
| About a car or other vehicle ("tyre", "brakes", "winter driving") | Vehicle and motor collections | × 1.2 |
| How to do something ("how to…", "fix…", "replace…") | Questions and answers, manuals, guides | × 1.1 |

What kind of source a result is comes from its collection (a reference article's archive,
a document's category), its tags, and the words of its own title that are not the
question's: "First aid manual" is a first aid source for "rescue breaths", but "Electric car
battery chemistry" is not a vehicle source for "car battery" just for saying "car".
Together the priors are at most × 1.3, and a high score rises by less (0.9 becomes 0.92),
so they settle near ties and never lift a poor match over a good one. Fuel alone is not a
vehicle word: "store petrol safely" is about a shed.

A few words have a strong other meaning. When the question is in the household's sense and
a result is plainly in the other, its score counts three quarters: "CPR" in a railway
history, a "generator" that makes signals for electronics (for a question about running or
using one), a "stroke" of an engine or a swimmer, a "shock" absorber, "bleeding" brakes
(for a medical question). A question that names the other meaning ("CPR railway") is taken
at its word.

#### Why each result is there

Beside each result a few words say why it is there, from the same rule: "All 3 words in
the title", "All 3 words, side by side", "2 of 3 words, not “sand”", "All 2 words in the
title; also matched tire", and what the corrections did: "favoured: first aid source",
"another meaning of “cpr”". Found by meaning: "Found by meaning". A place: its name.

#### One title, one row

An installed collection, the document made from one of its files and its catalogue entry
can share one title, and so can several documents called "Quick reference card". The list
shows the first, best placed, once, and names the others under it, each a link: "Also in:
Document, Radio manuals; Available to download". The count of results counts it once.
Reference articles are not joined this way: two collections' articles of one name are
usually two articles.

### The answer, above the results

For a few questions there is one place in Outpost that is plainly the answer, and a single
line above the results links to it:

- making water safe to drink ("purify water", "how do I boil water"): **Tools: Water**;
- a power cut ("power cut", "blackout", "what to do in a power cut"): the current
  household's power cut plan, when it has one;
- the exact name of one place on the map, when your library holds almost nothing with that
  name: the place on the map.

Never more than one, only on the first page of **Everything**, and never instead of the
results. **Go to** does not offer the same screen again.

### How fast

Your own results come from the index on this device. On a library of 57,600 passages (the
size of one Raspberry Pi's, made up for the test) a laptop answers 95 searches in 100
within about 35 ms; a Raspberry Pi takes several times as long. Two things are kept in
memory for it: which item each passage belongs to (a few hundred kilobytes), and, while
search by meaning is in use, its vectors (see [below](#limits-of-the-built-in-index)).

### Filters

The tabs above the results limit them to one kind. When search by meaning is ready, a
switch offers **Best of both**, **Exact words** or **By meaning**. API:
[api.md](api.md#search).

### Reference collections in results

Articles in ZIM archives are searched by kiwix-serve, not Outpost's index. **Your own
results do not wait for them**: they appear at once, and "Still searching reference
collections…" shows while the archives are asked.

**Which collections are asked.** Searching every archive takes seconds each on a small
computer, and most cannot hold the answer. So each search asks the six collections
likeliest to hold it first, eight articles from each:

- a collection about what the question is about: medical words ("burn", "nosebleed",
  "diarrhoea") go to medical collections, car words ("tyre", "jump start") to the motor
  mechanics, food words to the cooking ones, and so on for some twenty everyday topics,
  judged from each collection's title and description (and, counting for less, its
  catalogue category and tags);
- a collection whose title or description uses the question's own words;
- a general encyclopaedia such as Wikipedia;
- for "how to…" questions, collections of questions and answers, manuals and guides;
- collections that gave good results for the same words in recent searches (remembered
  until Outpost restarts).

A collection in a language other than English counts for less. When only one or two
collections would be left over, all are asked. When the first six find fewer than three
good articles, the rest are asked straight away in the same search. Otherwise **Search all
reference collections** under the results asks every one; answers already found are kept
for five minutes, so the first six answer again at once.

**How articles are found.** For each collection, kiwix-serve is asked two things at once:

- its full text, for the words that matter, without the small words (and once more for
  them [said another way](#other-spellings-and-names), when they can be);
- its titles, for the words a title would hold: the question without the words that only
  say what to do ("treat a burn" asks for titles with "burn"). Titles answer in a fraction
  of the time, so they are usually the first reference results to appear.

**What is left out.** Pages that only list other pages: lists of questions by tag
(addresses under `questions/tagged/`, `tags/`, `users/`, `badges/`), one page of a longer
list (`page=N` in the address), titles such as "Highest voted … questions" and "Questions
tagged …", a wiki's main page, and its Category:, Portal:, Special:, Template:, Help:,
Talk: and User: pages. The reader still opens them.

**One ranked list.** Every article is scored by the [same rule](#ranking) as your own
items, from its title and snippet, and one that shows less than half of what the query is
about is dropped. An article whose title is made only of the question's words and holds
every word a title would ("Burn" for "treat a burn", "Tire pressure" for "tyre pressure")
counts as holding the whole question ("The title is what was asked" beside it), in a
collection that fits the question (one about its topic, or a general encyclopaedia): in a
dictionary or a book of quotations, "Burn" is a word or a heading, not the answer. The [favoured sources and other meanings](#favoured-sources-and-other-meanings) apply to
articles too, an article's kind of source being its collection.

- **In reference collections**, under your own results, shows the five best articles
  across all collections; the **Reference** tab lists every article found. Both are in
  score order as articles arrive. While the pointer is over the list, or focus is in it,
  nothing in it moves: newcomers wait, with a line saying how many, and take their places
  when you move away.
- Quick search lists the five best of the same collections, in the same order, and keeps
  them still while the pointer is over them.
- In the full list of a search asked in one part (the API's `reference=include`), an
  article counts 0.95 of its score beside your own items: among nearly equal results,
  yours come first.

**Collections that are searched by their titles only.** A collection that kiwix-serve
says has no full-text index, or whose full-text search fails three times in a row, is
marked once and from then on searched by its titles only, with no warning in the results.
Its details in **Library → Collections** say so, when it was noticed and what the Kiwix
server said. A collection without an index is tried again after a week, a failing one
after half an hour; the mark goes the first time a full-text search works.

**Time.** Three full-text searches are at kiwix-serve at once, and one title search beside
them: kiwix-serve works on four requests at a time, and one more would wait inside it. A
collection that takes more than 8 seconds (3 for its titles), or is not reached within 30,
is left out and named; its answer is kept for five minutes for the next search.

- Turn it off with **Settings → Search → Search inside reference collections**.
- If kiwix-serve is not running, your own results still appear, with a note saying why.
- A collection that is a set of documents with a list
  ([troubleshooting.md](troubleshooting.md#a-collection-opens-as-a-list-of-documents)) is
  found by its documents' titles and authors (every typed word must start a word of one),
  up to 50,000 documents across all collections. A collection whose list matches is always
  among those asked first, since its list costs kiwix-serve nothing. The text inside is
  searched only once a file is added to your library.

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
| Memory | About 300 MB while loaded, given back after five idle minutes; and the vectors, 1.5 KB a passage (about 90 MB for 60,000), the same. |
| The model itself | 39 MB in the app. |

A Raspberry Pi 5 is about five times slower: about four minutes per thousand passages
(measured 23 November 2026), so 60,000 passages take about four hours the first time.
The progress line shows the real time left. Or build on a faster computer and [move the vectors](#moving-vectors-between-installations).

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

When search by meaning is ready, the default is **Best of both**, and the count above the
results says which way they were found ("found by words and by meaning").

- **The list of results.** A result's similarity to the query becomes a score: 0.2 and
  below counts as nothing, 0.7 and above as 0.6, the most meaning alone can earn, so it
  stays below a result holding every word. A result found both ways scores
  1 − (1 − words) × (1 − meaning): more than either alone.
- **Passages for an answer.** Ranked separately and combined by reciprocal rank fusion,
  each passage scoring `weight / (k + rank)` summed over the lists it is in.

| Setting | Default | Effect |
| --- | --- | --- |
| `search.hybrid.rrfK` | 60 | Passages for an answer: larger flattens the difference between ranks. |
| `search.hybrid.keywordWeight` | 1 | Weight of the words (multiplies their score in the list). |
| `search.hybrid.semanticWeight` | 1 | Weight of meaning (multiplies its score in the list). |

Search by meaning is off until it is turned on and its index built, because building
costs time: on a Raspberry Pi with tens of thousands of passages, hours. Until then
searches are keyword searches and say so.

They are under **More options**; *How search works* lets you try a change first. **By
meaning** alone leaves reference articles out, since they have no vectors.

### Limits of the built-in index

Each query is compared with every vector: exact, and comfortable to about 100,000
passages (about 220 MB on disk); beyond that, searches slow in proportion. The vectors are
read into memory at the first search and kept up to date as passages are read, so a search
does not read them from the database again: about 20 ms for 57,600 passages on a laptop,
against 115 ms reading them each time. Five minutes without a search, and the memory is
given back. A search narrowed to one kind of result still reads them from the database.
The same question asked again within a while reuses its vector. Reference articles are
found by keyword only. Results found by meaning show the passage's start, unhighlighted.

How it works inside, for developers: [development/answers-and-search.md](development/answers-and-search.md).
