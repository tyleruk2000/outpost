# Search

Keyword search works at once with no set-up. Search by meaning and reading scanned pages
([OCR](ocr.md)) are optional and off by default.

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
  vectors](search-by-meaning.md#demonstration-vectors) and says so.
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
  CPR and resuscitation; jump start and boost; accident and emergency, emergency
  department and emergency room.
- Kitchen names: bicarbonate of soda, baking soda and bicarb. "Preserve" beside a food
  ("how to preserve fish") also finds canning, curing, smoking, salting, drying and
  pickling it, since a guide names the way and seldom says "preserve"; not the other way. A name with a small word in
  it ("of", "and") is known when typed with or without it.
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
| Documents | Title, author or file name, category, tags, and the text, page by page for PDFs; for scans, the OCR text once read. A book chapter is a document. A PDF's bookmarks name the chapter of each page: it is searched with the page and shown with a result, so a whole book found by its words says which chapter matched. A PDF added before this was read without them; **Read text again** in its details adds them. |
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
| Reference articles | Articles in installed ZIM archives: see [below](search-reference-collections.md). |

Not searched: the notes trash, your page templates, and the household board.

Emergency plans and supplies belong to a household: only the current household's are
found. With several households, each such result names whose it is.

Text is cut into passages of about 1,200 characters overlapping by 150 (**Settings →
Reading documents**). A passage never crosses a page or heading, so a result points at
the exact page. A change applies to documents added or re-read afterwards.

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

## More about search

- [How search ranks results](search-ranking.md): the order of the results, the sources it favours, and why each is there.
- [Reference collections in search](search-reference-collections.md): how a search reaches into Wikipedia and the other archives.
- [Scanned pages and images (OCR)](ocr.md): reading the words in scanned pages so they can be searched.
- [Search by meaning](search-by-meaning.md): turning it on, what it costs, where its model runs, and its limits.
