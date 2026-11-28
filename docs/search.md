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

- **How search works** (the "How were these found?" link under any search) follows one
  question of yours through every step on your own library, from cutting passages to the
  exact prompt a model would get, with the ranking weights adjustable to try. It sends
  nothing. While search by meaning is off, it uses [demonstration
  vectors](#demonstration-vectors) and says so.
- **Search → How search by meaning works** (also linked from **Settings → Search by
  meaning**) explains search by meaning in plain words and diagrams, with this Outpost's
  own figures: whether it is on, how much of the library has been read, and the model.
- **Search → How search was tuned** (also linked from the top of How search works)
  explains how search was measured and improved one change at a time: the evaluation
  questions and their grades, nDCG@5 worked by hand, BM25, the final score's weights, the
  8-bit meaning index, where the time went on a Raspberry Pi, and the before and after.

## Answers from your library

With a language model of your own set up ([ai.md](ai.md#setting-it-up)), **Answer from my
library** sits above the results and writes an answer from the best passages, citing
each. How well depends on the model ([ai.md](ai.md#tried-with-a-real-model)).

Until one is set up, Home (under its search box) and the Search screen (on the empty
screen, and after the results) say what answers would do and that they need a writing
model, which Outpost does not include: the small model built in, all-MiniLM-L6-v2, only
finds pages by meaning. **Set up answers** opens the three steps (find Ollama, choose a
model, try it) in place. Ollama goes on the computer Outpost runs on; opened from a phone,
the steps name that computer by its address.

### Which passages an answer is given

Answers, conversations using the library, and the retrieval API take up to five passages:
those holding the question's words (or, if too few, most of what it is about, rarer words
counting for more), and, when search by meaning is on, the passages nearest in meaning. A
passage found both ways comes first, and the same text is given only once. If nothing
qualifies, the model is not asked.

## Keyword search

### What you can type

| You type | It means |
| --- | --- |
| `water filter` | Both words must appear. |
| `"chlorine dioxide"` | The exact phrase. |
| `water -pool` | "water" but not "pool". `-"swimming pool"` excludes a phrase. |
| `clov` | While you type, the last word also matches as a beginning ("clove"), when few items hold the word itself; those come after. A space or closing quote ends that. |
| `"tyre"` | Only this word, not other spellings or names for it. |

English word forms match ("boil" finds "boiling"); accents, capitals and punctuation are
ignored; `AND` and `OR` are just words. Up to 500 characters.

Small words that only shape a question ("how", "to", "the", "what", "do", "I", "my" and
the like) are left out, and the results name them: "How to change car battery" looks for
"change", "car" and "battery". "Not", "no", "without" and "off" are kept, since they change
the meaning. Inside quotes every word counts. "Wont", "dont", "cant" and the like, typed
without the apostrophe, are read as "won't", "don't", "can't".

### Other spellings and names

A word is also searched as it is spelt or said elsewhere, and the results say so: "Also
searched: tire". **Search only for what you typed** turns this off for that search; a word
in quotes is never widened. About 250 entries:

- British and American spellings: tyre and tire, aluminium, diarrhoea, colour, sterilise
  (with their endings: "sterilising" also finds "sterilizing").
- British and American words: petrol and gasoline, torch and flashlight, nappy and diaper,
  paracetamol and acetaminophen, mobile phone and cell phone, 999 and 911.
- Names for the same emergency: power cut, power outage and blackout; burn and scald;
  CPR and resuscitation; jump start and boost.
- Some only beside other words: "change" also finds "replace" and "fit" beside a part
  ("change car battery"), and "treat" finds "purify" and "disinfect" beside "water".

The word as typed counts a little more than another way of saying it. Phrases such as
"power cut" are found with their words near each other in any order.

### Did you mean

When a word you typed is in no passage of your library (or in only one or two, and few
results come back), Outpost offers the nearest word your library does hold, as a link:
"Did you mean **purify** water?" Your search stays as you typed it. The words come from
your own library, not from reference collections.

A slip of the first key counts too: "vattery" offers **battery**, a far commoner word than
one that starts with a "v". Reference collections are then asked both ways, as typed and
corrected, and say so: "Also showing results for **purify** water." A real word your library happens not to hold
("bowline") still finds its own articles first.

### When few items have every word

When fewer than five items hold every word, items holding **most** of them follow, each
word weighed by how rare it is in your library: an item with "bowline" alone can come for
"water bowline", but one with "water" alone does not. The results say "Only 2 results have
every word; results with some of them follow", or "No result has every word; showing
results with some."

### What is searched

| Kind | What is indexed |
| --- | --- |
| Documents | Title, author or file name, category, tags, and the text, page by page for PDFs; for scans, the OCR text once read. A book chapter is a document. |
| Notes | Title, parent pages' titles, tags, and the text under each heading. |
| Installed collections | Title, publisher, description. |
| Catalogue entries | What Explore lists, so you can find something to download. |
| Saved places and routes | Names and notes. |
| Contacts | Name, title, organisation, tags, numbers, addresses, callsign, channels and notes. |
| Emergency plans | Name, purpose, steps, supplies, where things are, places, people's names and what they must remember, people to call, keeping in touch, notes. Never what a person needs for their health. |
| Supplies | Name, category, where it is kept, how much, its date and notes. |
| Medical sheets | Medicines, allergies and conditions, only with **Find them in search** on (under **Medical sheets**), and never a sheet kept encrypted. |
| Repeaters | Callsign, town and frequency (up to 50 found). |
| Nearby places and map layers | Names of the places and features kept for the map (up to 30 found). |
| Reference articles | Articles in installed ZIM archives: see [below](#reference-collections-in-results). |

Not searched: the notes trash, your page templates, and the household board.

Emergency plans and supplies belong to a household: only the current household's are
found. With several households, each such result names whose it is.

Text is cut into passages of about 1,200 characters overlapping by 150 (**Settings →
Reading documents**). A passage never crosses a page or heading, so a result points at
the exact page. A change applies to documents added or re-read afterwards.

### Ranking

Every result, whatever found it, is scored on one scale from 0 to 1, so a page of your
own and an article in a reference collection can be put in one order. Half the score is
how much of the query a result holds, rarer words counting for more; the rest is the
words in its title, how near together they are, whether they stand side by side in the
order typed, and how often they occur. Words held far apart count for less: a passage that
says "car" at its start and "the battery is flat" at its end is not about a flat car
battery, and says "All 3 words, far apart". An item is scored by its best passage and shows up
to three, with the words that matter marked; a PDF opens at that passage's page. The
exact weights are in [development/answers-and-search.md](development/answers-and-search.md#ranking-weights).

- **Places and repeaters** whose names match are shown apart, under **Places and
  repeaters**: after the results, or before them when what you typed looks like a name, a
  callsign or a frequency.
- **What is on this device comes first.** Catalogue entries would have to be downloaded,
  so on **Everything** they are listed last, under **Available to download**, after **In
  reference collections**.
- **One title, one row.** Results of the same title (an installed collection, the
  document made from one of its files and its catalogue entry) are shown once, best
  placed, with the others named under it: "Also in: Document, Radio manuals; Available to
  download". Reference articles are not joined this way.

#### Favoured sources and other meanings

Words cannot tell that a first aid manual answers "rescue breaths" better than a hiking
forum using the same words. So, mildly, a medical question favours medical and first aid
sources, a question about generators, heaters, stoves or carbon monoxide favours official
safety guidance, a question about a car favours vehicle collections, and a "how to…"
question favours manuals, guides and questions and answers. A source's kind comes from
its collection, category, tags and title. These settle near ties; they never lift a poor
match over a good one.

For a medical question, an article in a medical collection whose title names nothing the
question is about counts a little less, and says "about something else": asked whether
paracetamol and ibuprofen can be taken together, the page on taking acrivastine with
other medicines mentions both, but is about acrivastine. A book or a manual is not judged
by its title this way.

The other way round, a collection plainly about another subject than the question counts a
little less, and says "on another subject": a radio manual for "car battery flat", a woodshop
forum for "first aid kit list". Collections for the whole household (preparedness, the
outdoors, repairs, water) are never another subject.

A few words have a strong other meaning: "CPR" in a railway history, a signal
"generator", the "stroke" of an engine, a "shock" absorber, "bleeding" brakes. When the
question is in the household's sense and a result is plainly in the other, it counts for
less. A question that names the other meaning ("CPR railway") is taken at its word.

#### Why each result is there

Beside each result a few words say why: "All 3 words in the title", "All 3 words, side by
side", "All 3 words, far apart", "2 of 3 words, not “sand”", "also matched tire", "favoured: first aid source",
"another meaning of “cpr”", "Found by meaning".

### The answer, above the results

For a few questions one place in Outpost is plainly the answer, and a single line above
the results links to it:

- making water safe to drink ("purify water", "how do I boil water"): **Tools: Water**;
- a power cut ("power cut", "blackout"): the current household's power cut plan, when it
  has one;
- the exact name of one place on the map, when your library holds almost nothing with that
  name: the place on the map.

Never more than one, only on the first page of **Everything**, and never instead of the
results.

### Filters

The tabs above the results limit them to one kind. When search by meaning is ready, a
switch offers **Best of both**, **Exact words** or **By meaning**. **By meaning** alone
leaves reference articles out, since they have no vectors. Programs can search the same
way through the API: [api.md](api.md#search).

### Reference collections in results

Articles in ZIM archives are searched by kiwix-serve. **Your own results do not wait for
them**: they appear at once, and "Still searching reference collections…" shows while the
archives are asked.

- **The likeliest collections first.** Asking every archive takes seconds each on a small
  computer, so each search first asks the six likeliest to hold the answer: collections on
  the question's topic (medical words to medical collections, car words to motor
  mechanics, and so on), those whose title or description uses its words, a general
  encyclopaedia, manuals and questions-and-answers for "how to…", and those that answered
  the same words well recently. When those find little, the next eight likeliest are asked
  straight away; **Search all reference collections** under the results asks every one.
- **Not for every letter.** While you type, the collections are asked once the words have
  stood still for about a third of a second, and a search typed over is dropped.
- **Titles and text.** Each collection is asked for its full text and for its titles;
  titles answer fastest, so they are usually the first reference results to appear.
- **Left out:** pages that only list other pages (questions by tag, one page of a longer
  list, a wiki's main, category, portal, help, talk and user pages). The reader still opens
  them.
- **One list.** Articles are scored by the same rule as your own items; one that shows
  less than half of what was asked is dropped. An article whose title is exactly what was
  asked ("Burn" for "treat a burn"), in a collection that fits the question, says "The
  title is what was asked".
- **On Everything**, the ten best articles join the list of your own results as they arrive,
  each where its score puts it, on a phone as on a wide screen: "Car battery flat after
  sitting for 9 months" comes above a radio manual that mentions a flat battery. Between two
  nearly as good, your own comes first (an article counts 0.95 of its score). When more pages
  of your own follow, the first page holds only the articles that rank on it. The line under
  the count says how many are in the list; **See all reference results** and the
  **Reference** tab list every one.
- **Nothing moves under your hand.** While the pointer or focus is in the list, or for a
  moment after a finger lifts (longer while the page still scrolls), newcomers wait, with a
  line saying how many.
- A collection kiwix-serve cannot search by its full text is searched by its titles only;
  its details in **Library → Collections** say so.
- A collection slower than a few seconds is left out of that search and named.
- Turn it off with **Settings → Search → Search inside reference collections**. If
  kiwix-serve is not running, your own results still appear, with a note saying why.
- A collection that is a set of documents with a list
  ([troubleshooting.md](troubleshooting.md#a-collection-opens-as-a-list-of-documents)) is
  found by its documents' titles and authors. The text inside is searched only once a file
  is added to your library.

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

It does not read text drawn as shapes in a PDF, does not keep layout (tables come out as
lines of words), and tries a page the other ways up only when its first reading scores
badly, taking up to four times as long.

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

### Turning it on

**Settings → Search by meaning**: the section says what it will cost for your library.
Turn the switch on. The index builds by itself: **Starting**, then **Reading your
library** with a progress bar and the time left, then **Ready**. You can leave the page.
Until then searches are keyword searches, and say so.

If it points at an embedding server that is not there, the section offers **Use what
comes with Outpost**. The rest is under **More options**.

### What it costs

With the built-in model:

| What | About |
| --- | --- |
| Building the index | 45 seconds per thousand passages on a fast laptop; four minutes on a Raspberry Pi 5, so 60,000 passages take about four hours the first time. |
| A search | A few milliseconds more on a laptop. |
| Disk | 2.2 MB per thousand passages. |
| Memory | About 300 MB while in use (twice that during a build), given back after five idle minutes, plus 400 bytes a passage. |

The progress line shows the real time left. A faster computer can [do the reading
instead](#reading-the-library-on-a-faster-computer).

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

In Docker, use `http://host.docker.internal:11434/v1` (on Linux, the `compose.yaml` Outpost
comes with already has the `extra_hosts` line that gives the container that name).

#### Demonstration vectors

Vectors made from word counts, used by *How search works* while search by meaning is off.
They show the mechanics but are not a language model and add little to keyword search.

### Building the index

Turning it on, choosing another model, or **Build index** starts a build, which only does
what is missing. **Pause** and **Stop** sit beside the progress line; **Carry on reading**
resumes, and a restart carries on by itself. New and changed documents are read a few
seconds after they are indexed. A failed build says why and offers **Try again**.

### Changing the model

Vectors are kept per model and never mixed. Switching keeps the old ones under "Vectors
from other models" until you delete them, and the new model builds its own. See
[ai.md](ai.md#planning-for-a-change-of-embedding-model).

### Reading the library on a faster computer

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

### Moving vectors between installations

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

### Hybrid ranking

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

### Limits of the built-in index

Each query is compared with every vector, which stays comfortable to about 100,000
passages (about 220 MB on disk); beyond that, searches slow in proportion. Reference
articles are found by keyword only. Results found by meaning show the passage's start,
unhighlighted.

How it works inside, for developers: [development/answers-and-search.md](development/answers-and-search.md).
