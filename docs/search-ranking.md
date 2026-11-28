# How search ranks results

The order of a search's results, the sources it favours, and why each result is there. What the search box understands is in [Search](search.md).

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

## Favoured sources and other meanings

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

## Why each result is there

Beside each result a few words say why: "All 3 words in the title", "All 3 words, side by
side", "All 3 words, far apart", "2 of 3 words, not “sand”", "also matched tire", "favoured: first aid source",
"another meaning of “cpr”", "Found by meaning".
