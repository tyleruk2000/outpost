# Reference collections in search

How a search reaches into the reference collections (Wikipedia and the other archives), which of their pages it leaves out, and how long it waits for them. Part of the search guide, which starts at [Search](search.md).

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
