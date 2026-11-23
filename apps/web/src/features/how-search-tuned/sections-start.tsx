/** "How search was tuned", parts 1 to 3: where it started, how search is measured, and how keyword search works underneath. */
import {
  BM25_LIBRARY,
  BM25_PASSAGES,
  bm25Score,
  CPR_IDEAL,
  CPR_QUERY,
  CPR_RESULTS,
  dcg,
  discount,
  GRADED_EXAMPLES,
  gain,
  ndcg,
  OWNER_QUERY,
  oldShownScore,
  RRF_K,
} from "./data";
import { DiscountPlate, OldScoresPlate, PipelinePlate, SaturationPlate, StemsPlate } from "./figures";
import { Figures, Part, Prose, Sub, Sum } from "./parts";

const two = (value: number) => value.toFixed(2);
const three = (value: number) => value.toFixed(3);

export function StartSection() {
  return (
    <Part id="start" title="Where it started">
      <Prose>
        <p>The owner searched a Raspberry Pi running Outpost for “{OWNER_QUERY}”.</p>
        <p>It found 42 results in 35 ms. The first eight are below, with the score each was shown.</p>
        <p>Not one of them is about changing a car battery.</p>
      </Prose>
      <OldScoresPlate />
      <Prose>
        <p>Three faults were behind it.</p>
        <ul>
          <li>“How” and “to” counted as words to find, as much as “battery”.</li>
          <li>Passages were ranked by one measure, BM25 (explained below), with nothing to reward a result for holding every word.</li>
          <li>The score on the screen did not measure the match at all.</li>
        </ul>
      </Prose>

      <Sub id="start-fusion">Where scores like 1.000, 0.984, 0.968 came from</Sub>
      <Prose>
        <p>The search made several lists: the library’s own results, places, and radio repeaters.</p>
        <p>
          It merged them by <strong>reciprocal rank fusion</strong>. Each result earns 1 ÷ ({RRF_K} + its place) from each list it is in.
        </p>
        <p>Only the place counts. The reason is sound: scores from different searches are measured differently and cannot be compared.</p>
        <p>The screen then showed each result’s points as a share of first place’s points.</p>
      </Prose>
      <Sum>
        place 1: (1 ÷ 61) ÷ (1 ÷ 61) = {three(oldShownScore(1))} · place 2: 61 ÷ 62 = {three(oldShownScore(2))} · place 3: 61 ÷ 63 ={" "}
        {three(oldShownScore(3))} · place 4: 61 ÷ 64 = {three(oldShownScore(4))}
      </Sum>
      <Prose>
        <p>Two results scored 1.000 because each was first in a list of its own. Two scored 0.984 because each was second.</p>
        <p>So the number said only where a result stood in its own list. A physics textbook first in a poor list scored a perfect 1.000.</p>
        <p>Shown as a percentage, it looked like a measure of how well the result matched. It was not one.</p>
      </Prose>

      <Sub id="start-review">A second reading of the code</Sub>
      <Prose>
        <p>Before anything was changed, a second model read the code and searched the Pi, reading only.</p>
        <p>The Pi held 59,351 passages from 458 documents, 1,353 pages of notes and 37 reference collections. Search by meaning was off.</p>
        <p>It found, among other things:</p>
        <ul>
          <li>Searching documents for “water” counted 206 results but showed 3, and every page after the first was empty.</li>
          <li>Each reference collection’s first article was shown as “100%”, whatever it said.</li>
          <li>“tyre” and “tire”, “petrol” and “gasoline”, “diarrhoea” and “diarrhea” found different things.</li>
          <li>A first search of the reference collections took 7.9 to 15.7 seconds.</li>
        </ul>
        <p>It proposed an order of work, and the first item was a way to measure search. Everything below follows that order.</p>
      </Prose>
      <Sub>What a search does now</Sub>
      <PipelinePlate />
    </Part>
  );
}

export function MeasureSection() {
  const cpr = CPR_RESULTS.map((result, index) => ({ ...result, place: index + 1 }));
  const actual = dcg(cpr.map((result) => result.grade));
  const best = dcg(CPR_IDEAL);
  return (
    <Part id="measure" title="How to tell whether search is good">
      <Prose>
        <p>The measuring tool was built first, before any change to search.</p>
        <p>Without it, every change is a guess. A change that mends one search can break five others nobody looked at.</p>
        <p>With it, every change can be run against the same questions and kept only if the numbers say so.</p>
      </Prose>

      <Sub id="measure-set">The evaluation set</Sub>
      <Prose>
        <p>
          The <strong>evaluation set</strong> is 56 household questions, written down with what a good answer to each would be.
        </p>
        <p>
          Each question comes with <strong>grades</strong>: for each item that should come up, how good it is.
        </p>
        <ul>
          <li>3: the answer.</li>
          <li>2: useful.</li>
          <li>1: on the subject.</li>
          <li>0: not useful. Some items are decoys, written to be found by the words but not to answer the question.</li>
        </ul>
        <p>A real library’s items are not known in advance, so each question also has patterns of words.</p>
        <p>
          A result with every pattern in its title is graded 3. One with every pattern somewhere in its title or text is graded 2. One with
          any pattern in its title is graded 1.
        </p>
      </Prose>
      <Figures
        label="Three questions from the evaluation set"
        prose
        head={["Question", "Graded items", "Patterns for a real library"]}
        rows={GRADED_EXAMPLES.map((example) => [
          <span key="q" className="font-medium">
            {example.q}
          </span>,
          <ul key="g" className="grid gap-0.5">
            {example.grades.map(([title, grade]) => (
              <li key={title}>
                <span className="tabular font-semibold">{grade}</span> {title}
              </li>
            ))}
          </ul>,
          <ul key="p" className="grid gap-0.5">
            {example.patterns.map((pattern) => (
              <li key={pattern}>{pattern}</li>
            ))}
          </ul>,
        ])}
      />
      <Prose>
        <p>
          The graded items live in a small <strong>fixture library</strong>: a made-up library built for the test, with the items the
          questions should find and the decoys beside them.
        </p>
        <p>
          With it are the real answers of the Pi’s 37 reference collections to every question: 6,933 articles, recorded by reading only.
        </p>
      </Prose>

      <Sub id="measure-ndcg">nDCG@5: how good the order of the first five is</Sub>
      <Prose>
        <p>nDCG@5 is a number from 0 to 1. It is 1 when the first five results are in the best order there could be.</p>
        <p>It is worked out in four steps.</p>
        <ol>
          <li>
            <strong>Gain.</strong> Each grade is worth 2<sup>grade</sup> − 1: a 3 is worth {gain(3)}, a 2 is worth {gain(2)}, a 1 is worth{" "}
            {gain(1)}, a 0 nothing. The answer is worth far more than something on the subject.
          </li>
          <li>
            <strong>Discount by place.</strong> Each gain is multiplied by 1 ÷ log₂(place + 1). People read from the top, so lower places
            count for less.
          </li>
          <li>
            <strong>Add up.</strong> The sum of the first five is the discounted cumulative gain, DCG.
          </li>
          <li>
            <strong>Normalise.</strong> Divide by the DCG of the best order possible, the <strong>ideal</strong>. That makes questions with
            many good answers and questions with one comparable.
          </li>
        </ol>
      </Prose>
      <DiscountPlate />
      <Prose>
        <p>Worked by hand for “{CPR_QUERY}”, as search ranks it now on the fixture library and recorded collections:</p>
      </Prose>
      <Figures
        label={`nDCG@5 for “${CPR_QUERY}”, worked by hand`}
        head={["Place", "Result", "Grade", "Gain", "Discount", "Gain × discount"]}
        numeric={[0, 2, 3, 4, 5]}
        rows={cpr.map((result) => [
          result.place,
          <span key="t">
            {result.title}
            <span className="block text-ink-muted">{result.where}</span>
          </span>,
          result.grade,
          gain(result.grade),
          two(discount(result.place)),
          two(gain(result.grade) * discount(result.place)),
        ])}
      />
      <Sum>
        DCG = 7.00 + 1.89 + 0 + 0.43 + 0.39 = {two(actual)}. The best five grades there are to be had are {CPR_IDEAL.join(", ")}, so the
        ideal DCG = {two(best)}. nDCG@5 = {two(actual)} ÷ {two(best)} ={" "}
        {three(
          ndcg(
            CPR_RESULTS.map((result) => result.grade),
            CPR_IDEAL,
          ),
        )}
        .
      </Sum>
      <Prose>
        <p>The decoy forum post at third place costs most. Moved below the two articles, nDCG@5 would rise.</p>
        <p>The figure for the whole set is the average over its questions.</p>
      </Prose>

      <Sub id="measure-others">Success@3, zero results and p95</Sub>
      <Prose>
        <p>
          <strong>Success@3</strong> is the share of questions with a useful result, graded 2 or 3, among the first three. It asks the
          simplest thing a person wants: is something good in view without scrolling? “{CPR_QUERY}” succeeds: the first aid manual is first.
        </p>
        <p>
          “treat a burn” fails it. Its first three are articles titled “Burn”, graded 1 by the patterns because their titles do not say
          “treat”, and the first aid manual is fourth. A person might call an article titled “Burn” useful. A measure is only as good as its
          grades, and these were set by rules.
        </p>
        <p>
          <strong>The zero-result rate</strong> is the share of questions that should find something and find nothing. The set also holds a
          question that should find nothing, “zzqx flurble”.
        </p>
        <p>
          <strong>p95</strong> is the 95th percentile of the time a search takes. Put every search’s time in order, fastest first; p95 is
          the time 95 of every 100 searches stay within. With 56 searches it is the 54th fastest, so only two were slower.
        </p>
        <p>An average would hide the slow searches, and a slow search is what a person notices.</p>
      </Prose>

      <Sub id="measure-ways">Three ways to run it</Sub>
      <Figures
        label="Three ways to run the evaluation"
        prose
        head={["Run against", "What it can tell you", "What it cannot"]}
        rows={[
          [
            "The fixture library, in the tests",
            "Exactly how good the order is, because every answer is known. It runs in seconds and the same every time, so it catches a change that makes things worse.",
            "Whether it works on a real library. The library is small and was written by the people tuning, so it can flatter them.",
          ],
          [
            "The live Pi, reading only",
            "How search does on 59,000 real passages on the real hardware, including its speed.",
            "Exact grades: results are graded by patterns. The ideal is the best order of what was found, so it measures order, not what was missed.",
          ],
          [
            "The Pi’s results re-ranked offline (“--rescore”)",
            "What a new way of ranking would do to the real library before it is installed: the Pi’s candidates are put in order by the new code on a laptop.",
            "Anything the old search did not find, and anything about speed.",
          ],
        ]}
      />
    </Part>
  );
}

export function KeywordSection() {
  const idfs = BM25_LIBRARY.words.map(({ word, holding }) => ({
    word,
    holding,
    idf: bm25Score(BM25_PASSAGES[0]!).parts.find((part) => part.word === word)!.idf,
  }));
  return (
    <Part id="keywords" title="How keyword search works underneath">
      <Sub id="keywords-passages">Passages and the index</Sub>
      <Prose>
        <p>Outpost does not search whole documents. It cuts each into passages of a few paragraphs.</p>
        <p>Each passage keeps its document’s title and the heading it sits under.</p>
        <p>
          The passages are kept in a <strong>full-text index</strong>, SQLite’s FTS5. It works like the index at the back of a book: for
          each word, the passages that hold it.
        </p>
        <p>Finding the passages that hold “car” and “battery” is then a matter of reading two short lists, not every passage.</p>
      </Prose>

      <Sub id="keywords-tokens">Tokens and stems</Sub>
      <Prose>
        <p>
          Before a passage goes into the index, its text is cut into <strong>tokens</strong>: words in lower case, accents removed, split at
          anything that is not a letter or a digit.
        </p>
        <p>
          Each token is then <strong>stemmed</strong>: cut back to a root, so that “batteries” finds “battery” and “boiling” finds “boil”.
          The index uses the Porter stemmer, a set of rules for English endings from 1980.
        </p>
        <p>
          A stem need not be a word. “battery” and “batteries” both become “batteri”. What matters is that both forms become the same stem.
        </p>
      </Prose>
      <StemsPlate />
      <Prose>
        <p>Stemming has a cost. “tired” becomes “tire”, so a search for “tire pressure” also matched passages about being tired.</p>
        <p>
          The index cannot be told otherwise. So the ranking was changed: a word that only shares the stem of the word typed, and is not
          that word or its plural, counts 0.6 of a full match, not 0.92. This applies to tyre, tire, tinned, canned and cot.
        </p>
      </Prose>

      <Sub id="keywords-bm25">BM25: how the index ranks passages</Sub>
      <Prose>
        <p>
          <strong>BM25</strong> (“best match 25”) is the standard way a full-text index ranks what it finds. It has three parts.
        </p>
        <ul>
          <li>
            <strong>Term frequency.</strong> A passage that says “battery” more often is more likely to be about batteries. But each repeat
            adds less than the one before.
          </li>
          <li>
            <strong>Inverse document frequency.</strong> A rare word says more than a common one. Holding “battery” means more than holding
            “change”.
          </li>
          <li>
            <strong>Length normalisation.</strong> A long passage holds more words by chance, so the same count counts for less in it.
          </li>
        </ul>
      </Prose>
      <Sum>
        score = Σ over the words: IDF × tf × (k₁ + 1) ÷ (tf + k₁ × (1 − b + b × length ÷ average length)), with IDF = ln((N − n + 0.5) ÷ (n
        + 0.5)), k₁ = 1.2 and b = 0.75
      </Sum>
      <Prose>
        <p>
          Here tf is how often the word occurs in the passage, N the number of passages, and n the number holding the word. k₁ sets how fast
          repeats stop counting; b how much length counts.
        </p>
        <p>
          A worked example, in a made-up library of {BM25_LIBRARY.passages.toLocaleString("en-GB")} passages averaging{" "}
          {BM25_LIBRARY.average} words. {idfs.map((entry) => `“${entry.word}” is in ${entry.holding}`).join(" and ")}:
        </p>
      </Prose>
      <Sum>
        {idfs.map((entry, index) => (
          <span key={entry.word}>
            {index > 0 ? " · " : ""}IDF of “{entry.word}” = ln(({BM25_LIBRARY.passages} − {entry.holding} + 0.5) ÷ ({entry.holding} + 0.5))
            = {two(entry.idf)}
          </span>
        ))}
      </Sum>
      <Figures
        label="BM25 for “car battery” in three passages"
        head={["Passage", "“battery” share", "“car” share", "BM25"]}
        numeric={[1, 2, 3]}
        rows={BM25_PASSAGES.map((passage) => {
          const score = bm25Score(passage);
          const share = (word: string) => score.parts.find((part) => part.word === word)!;
          return [
            passage.name,
            `${passage.counts.battery} times: ${two(share("battery").part)} × ${two(share("battery").idf)}`,
            `${passage.counts.car} time: ${two(share("car").part)} × ${two(share("car").idf)}`,
            <strong key="s">{two(score.total)}</strong>,
          ];
        })}
      />
      <Prose>
        <p>B holds the same words as A, but in 300 words instead of 80, so it scores less.</p>
        <p>C says “battery” three times as often as A, yet scores only about a fifth more. Repeats do not run away with the score.</p>
        <p>“battery” is in five times fewer passages than “car”, so each of its matches is worth nearly twice as much.</p>
      </Prose>
      <SaturationPlate />

      <Sub id="keywords-paging">Why copying the title onto every passage broke paging</Sub>
      <Prose>
        <p>The index ranks with each part of a passage weighted: the title 8 times, tags 4, the heading 3, the text once.</p>
        <p>
          Because every passage carries its document’s title, every passage of a book whose title holds “water” gets that weight of 8 for
          “water”. A long handbook about water puts every one of its passages near the top.
        </p>
        <p>The old search asked the index for its best 120 passages for a page of 20 results, then grouped them into documents.</p>
        <p>For “water”, all 120 came from three books. So the page showed 3 results, though 206 documents matched. Page 2 was empty.</p>
        <p>The fix splits the search in two.</p>
        <ol>
          <li>Find every matching passage, with no limit. Only passage numbers and ranks are read, which is fast.</li>
          <li>Group them into their items in memory, keeping each item’s best four passages.</li>
          <li>Take the best 200 items, or more for a later page, and score them again on Outpost’s own scale.</li>
        </ol>
        <p>Now the count is exact and every page can be reached. BM25 only decides which 200 items are looked at closely.</p>
      </Prose>
    </Part>
  );
}
