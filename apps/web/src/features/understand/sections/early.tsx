import type { ExplainEntity, ExplainOverview } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ErrorState } from "@/components/page";
import { formatNumber, plural } from "@/lib/utils";
import { Figure, FigureInvitation, FigureSkeleton, FromTrace, Prose } from "../charts/figure";
import { type ChunksResponse, useTraceState } from "../data";
import { LengthHistogram, lengthsReading } from "../figures/lengths";
import { PassagesPicture } from "../figures/passages-picture";
import { PipelineDiagram } from "../figures/pipeline";
import { DocumentPicker, DocumentRibbon, ribbonReading } from "../figures/ribbon";
import { TimingBar, timingReading } from "../figures/timing";
import { KeywordResults, keywordReading, QueryWords, RarityChart, rarityReading, SaturationCurve } from "../figures/words";
import { Stage } from "../stages";

export function JourneySection() {
  const { trace, overview, query, empty } = useTraceState();
  const data = query ? trace.data : undefined;
  const demonstration = (data?.semantic.source ?? overview?.vectors.source) === "demonstration";
  return (
    <Stage id="stage-journey">
      <Prose>
        <p>
          This page follows one question from the moment you type it. Most of it is about search: how Outpost finds the pages that answer
          you, and puts them in order.
        </p>
        <p>
          The same search can also feed a <strong>language model</strong>: a program that writes text, like a chatbot. On its own, a model
          answers from memory. It has not read your documents. When it does not know, it tends to make up something that sounds right. That
          is called a <strong>hallucination</strong>.
        </p>
        <p>
          The usual cure has a long name: <strong>retrieval-augmented generation</strong>, or RAG. It means: find the right passages first
          (retrieval), add them to the question (augmented), and only then let the model write (generation). The model is told to answer
          from those passages and to say which one each sentence came from.
        </p>
        <p>
          Outpost does the finding and the adding. It does not come with a model. If you set one up in Settings, Outpost hands it the
          passages and shows you its answer. That is why the last two steps below are drawn dashed: they happen on your model, not here.
        </p>
      </Prose>

      <Figure
        id="fig-journey"
        title="The journey of one question"
        reading={
          data
            ? `Your question, “${data.query}”, went through every solid box below. The numbers on each box are what happened at that step. Choose a box to jump to its part of the page.`
            : empty
              ? "Each box is a step, and a link to the part of this page that explains it. Once your library has something in it, a traced question fills the boxes in with what happened to it."
              : "Each box is a step, and a link to the part of this page that explains it. Trace a question and the boxes fill in with what happened to it."
        }
      >
        <PipelineDiagram overview={overview} trace={data} />
      </Figure>

      <Prose>
        <p>
          Two things are worth noticing before going further. First, most of the work is done <em>beforehand</em>. Reading documents,
          cutting them up and indexing them happens once, when something is added to the library. Answering a question afterwards is quick
          because of it.
        </p>
        <p>
          Second, there are two searches, not one. One looks for your words. The other looks for your meaning. They fail in different ways,
          so running both and combining them finds more than either does alone. Most of this page is about those two searches and how their
          results are merged.
        </p>
      </Prose>

      <Figure id="fig-timing" title="Where the time went" reading={data ? timingReading(data) : undefined}>
        <FromTrace shape="bar" invitation="One bar, divided by how long each step took.">
          {(traced) => <TimingBar trace={traced} />}
        </FromTrace>
        {data && demonstration ? (
          <p className="mt-3 max-w-[68ch] text-small text-ink-muted">
            Search by meaning is slower here than it would normally be. With demonstration vectors nothing is stored, so a vector is made
            for every passage each time you ask. With a real model the passages’ vectors are made once and kept, and only your question is
            turned into a vector when you ask.
          </p>
        ) : null}
      </Figure>
    </Stage>
  );
}

function indexSentence(overview: ExplainOverview): string {
  const documents = overview.entities.document ?? 0;
  const pages = overview.entities.note ?? 0;
  const others = Object.entries(overview.entities)
    .filter(([kind]) => kind !== "document" && kind !== "note")
    .reduce((sum, [, count]) => sum + count, 0);
  const base = `Right now the index holds ${plural(documents, "document")} and ${plural(pages, "page")} of your own`;
  const extra =
    others > 0
      ? `, plus ${plural(others, "short entry", "short entries")} of other kinds (such as the list of collections available to download, which is indexed so that it can be found too)`
      : "";
  return `${base}${extra}: ${plural(overview.chunks, "passage")} in all.`;
}

export function CuttingSection({
  entities,
  chunks,
  selected,
  onSelect,
}: {
  entities: UseQueryResult<ExplainEntity[]>;
  chunks: UseQueryResult<ChunksResponse>;
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  const { overview, empty } = useTraceState();
  const size = overview?.settings.chunkSize;
  const overlap = overview?.settings.chunkOverlap;
  const others = overview
    ? Object.entries(overview.entities).some(([kind, count]) => kind !== "document" && kind !== "note" && count > 0)
    : false;
  return (
    <Stage id="stage-cutting">
      <Prose>
        <p>
          Imagine asking a librarian how to change a car battery. A good librarian does not hand you a 300-page car manual. They open it at
          the right page and point to the right paragraph. Search tries to do the same.
        </p>
        <p>
          To point at a paragraph, it has to know where each paragraph is. So when you add a document, Outpost cuts its text into short
          pieces. Each piece is called a <strong>passage</strong>. A passage is a few paragraphs long: at most{" "}
          {size ? formatNumber(size) : "about a thousand"} letters and spaces.
        </p>
        <p>
          When you search, every passage is checked on its own. The best passage decides where a document comes in the list. It is also the
          bit of text you see under the title, and the page the document opens at.
        </p>
      </Prose>

      <Figure
        id="fig-passages-idea"
        title="Why a document is cut up"
        reading="Search can then point you to the right page of the right book, not only to the right book."
      >
        <PassagesPicture />
      </Figure>

      <Prose>
        <p>
          A passage never runs from one page onto the next. It never runs past a heading either. That way each passage has one page number.
        </p>
        <p>
          A long page is cut where a paragraph ends, if it can be. If not, it is cut where a sentence ends. Only as a last resort is it cut
          between two words.
        </p>
        <p>
          A cut can still fall in the middle of a thought. So each passage repeats the last few lines of the one before it: about{" "}
          {overlap ? formatNumber(overlap) : "a hundred and fifty"} letters. This repeated stretch is called the <strong>overlap</strong>.
          Thanks to it, a sentence cut in two is still whole in one of the passages.
        </p>
      </Prose>

      <Figure
        id="fig-ribbon"
        title="A document of yours, cut into passages"
        reading={
          chunks.data
            ? ribbonReading(chunks.data)
            : "The text of one document, drawn as a long strip read from left to right. Each block on the strip is one passage."
        }
      >
        {empty ? (
          <FigureInvitation shape="ribbon" empty>
            A ribbon for each document: its passages in order, with the text they share marked.
          </FigureInvitation>
        ) : entities.isError ? (
          <ErrorState error={entities.error} onRetry={() => void entities.refetch()} />
        ) : !entities.data ? (
          <FigureSkeleton shape="ribbon" />
        ) : (
          <>
            <div className="mb-4">
              <DocumentPicker entities={entities.data} value={selected} onChange={onSelect} />
            </div>
            {chunks.isError ? (
              <ErrorState error={chunks.error} onRetry={() => void chunks.refetch()} />
            ) : !chunks.data ? (
              <FigureSkeleton shape="ribbon" />
            ) : (
              <div className={chunks.isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
                <DocumentRibbon data={chunks.data} demonstration={overview?.vectors.source === "demonstration"} />
              </div>
            )}
          </>
        )}
      </Figure>

      <Prose>
        <p>How to read the strip:</p>
        <ul>
          <li>The blocks take turns on two rows. That is only so you can tell neighbours apart. The text itself runs straight on.</li>
          <li>Where two blocks overlap, they share those lines. The shared part is drawn darker.</li>
          <li>A thin upright line marks a new page or a new heading. No block ever crosses one.</li>
          <li>Many blocks are shorter than the limit. A page rarely divides into equal parts, and a short page is one short passage.</li>
        </ul>
        <p>Choose a block to read its passage.</p>
      </Prose>

      <Figure id="fig-lengths" title="How long the passages are" reading={overview && !empty ? lengthsReading(overview) : undefined}>
        {empty ? (
          <FigureInvitation shape="columns" empty>
            A count of passages by length, with the target size marked.
          </FigureInvitation>
        ) : overview ? (
          <LengthHistogram overview={overview} />
        ) : (
          <FigureSkeleton shape="columns" />
        )}
        {overview && !empty && others ? (
          <p className="mt-3 max-w-[68ch] text-small text-ink-muted">
            The tall column of very short passages is mostly not your documents: each collection in the download catalogue is indexed as one
            short entry.
          </p>
        ) : null}
      </Figure>

      <Prose>
        <p>
          Next, the passages go into an <strong>index</strong>. It works like the index at the back of a book. It lists every word, and
          which passages hold it. So a search never has to read everything: it looks your words up. Outpost keeps two indexes. One is by
          word, and the next section is about it. The other is by meaning, and the section after that is about it.{" "}
          {overview && !empty ? indexSentence(overview) : ""}
        </p>
        <p>
          Each passage also gets a <strong>fingerprint</strong>: a short code worked out from its text. If one letter changes, the code
          changes. If nothing changes, the code stays the same. When a document is read again, Outpost compares fingerprints. Passages that
          have not changed are kept as they are, which saves the slowest work. You can see each fingerprint under the strip above.
        </p>
      </Prose>
    </Stage>
  );
}

export function WordsSection() {
  const { trace, query } = useTraceState();
  const data = query ? trace.data : undefined;
  return (
    <Stage id="stage-words">
      <Prose>
        <p>
          Keyword search is the kind you already know: find the passages that contain the words you typed. It is exact, fast and
          predictable, and it is still the best tool when you remember a particular term, a name or a part number.
        </p>
        <p>
          First the question is tidied. Punctuation is dropped. Small words that only shape a question, such as “how”, “to”, “the” and
          “what”, are left out. So “How to change car battery” looks for “change”, “car” and “battery”. Words like “not” and “without” are
          kept, because they change the meaning.
        </p>
        <p>
          Each word is cut back to its root, so “boil”, “boiled” and “boiling” count as one word. Some words are also given the other ways
          they are spelt or said: “tyre” is searched as “tyre” or “tire”, “power cut” as “power cut”, “power outage” or “blackout”. The
          results name what else was searched, and you can turn it off. Then the words are joined into an <strong>expression</strong>: a
          short line telling the index which words a passage must hold.
        </p>
        <p>
          A passage must hold every word, or another way of saying it. If fewer than five items do, Outpost also shows items that hold most
          of the words. They come after the others, and the results say so.
        </p>
        <p>
          If a word is in no passage at all, it may be a slip. Outpost looks through the words your library does hold for the nearest one, a
          letter or two away, and offers it: “Did you mean purify water?” It never searches your library for the other word unless you
          choose it. Reference collections, which know nothing of slips, are asked for both, and the results say so.
        </p>
      </Prose>

      <Figure id="fig-query-words" title="Your question, as the index sees it">
        <FromTrace shape="text" invitation="The words of your question, and the expression built from them.">
          {(traced) => <QueryWords trace={traced} />}
        </FromTrace>
      </Figure>

      <Prose>
        <p>
          Finding the passages is the easy half. The harder half is putting them in order. A question of three words may match dozens of
          passages, and you will read only the first few.
        </p>
        <p>
          This happens in two steps. First the index picks the likely passages with a standard formula called <strong>BM25</strong> (“best
          match 25”). Then Outpost gives each of them a score from 0 to 1, by one rule for everything it searches: your documents, your
          notes, and articles in reference collections. That way a result from one place can be compared with a result from another. The
          rule, and BM25 too, rest on a few ideas.
        </p>
        <h3>Rare words count for more</h3>
        <p>
          If you search for “the bowline”, a passage containing “bowline” tells you far more than a passage containing “the”. BM25 captures
          this with <strong>inverse document frequency</strong>, or IDF: the fewer passages a word appears in, the more weight a match on it
          earns. The name describes the sum: count how many passages contain the word (its document frequency), and turn that count upside
          down.
        </p>
      </Prose>

      <Figure
        id="fig-rarity"
        title="How common each of your words is, and the weight that gives it"
        reading={data ? rarityReading(data) : undefined}
      >
        <FromTrace shape="bars" invitation="A pair of bars for each word: how many passages contain it, and how much a match on it counts.">
          {(traced) => <RarityChart trace={traced} />}
        </FromTrace>
        {data ? (
          <p className="mt-3 max-w-[68ch] text-small text-ink-muted">
            The weight is worked out exactly as the index does it: the natural logarithm of (N − n + 0.5) ÷ (n + 0.5), where N is everything
            in the index and n is how much of it contains the word. A word found in more than half of everything is given a weight of almost
            nothing.
          </p>
        ) : null}
      </Figure>

      <Prose>
        <h3>Repeating a word helps less and less</h3>
        <p>
          A passage that mentions your word twice is probably more about it than a passage that mentions it once. But a passage that
          mentions it twenty times is not ten times better than one that mentions it twice. BM25 builds in diminishing returns: each further
          mention adds less than the one before, and the total approaches a ceiling without reaching it. This is called <em>saturation</em>.
        </p>
        <h3>Long passages do not win by length</h3>
        <p>
          A long passage has more chances to contain any word. So BM25 marks a passage down a little if it is longer than average, and up a
          little if it is shorter. The lower line in the figure is the same word in a passage twice the average length.
        </p>
      </Prose>

      <Figure
        id="fig-saturation"
        title="The first mention counts most"
        reading="This is the shape of the formula, not a measurement of your library. One mention in a passage of average length earns exactly the word’s weight. Two earn 1.38 times it. Ten earn 1.96 times it, and no number of mentions reaches 2.2."
        footnote="Drawn from BM25’s term-frequency formula with its usual constants, k1 = 1.2 and b = 0.75, which are the ones the index uses."
      >
        <SaturationCurve />
      </Figure>

      <Prose>
        <h3>All your words, close together, in the title</h3>
        <p>On top of those ideas, Outpost’s score asks four plain questions of each passage:</p>
        <ul>
          <li>
            <strong>How much of the question does it hold?</strong> Each word counts by its weight, so missing a rare word costs more than
            missing a common one. This is half the score.
          </li>
          <li>
            <strong>Are the words in the title?</strong> A title says what the whole thing is about. A heading or a tag counts a little
            less. This is a fifth of the score.
          </li>
          <li>
            <strong>Are the words close together?</strong> “Replace a car battery” is about car batteries. A page that says “car” at the top
            and “battery” at the bottom may not be. Side by side, in the order you typed them, counts most.
          </li>
          <li>
            <strong>How often do they appear?</strong> As above, each extra mention adds less.
          </li>
        </ul>
        <p>
          Then two mild corrections, for what words cannot tell. A question about first aid favours medical and first aid sources, a “how
          to” question manuals and questions and answers, one about a car the motor collections, and one about using a generator safely
          official safety guidance: at most 1.3 times the score, enough to settle near ties and never enough to lift a poor match over a
          good one. And a word with a strong other meaning (“CPR” is also a railway) counts a result plainly in that other meaning three
          quarters of its score.
        </p>
        <p>
          The list of results shows the answer in a few words beside each one, such as “All 3 words, side by side”, “2 of 3 words” with the
          missing word named, “All 2 words in the title; also matched tire” or “All 3 words; favoured: first aid source”. A title that
          appears more than once (a collection, the document made from it and its catalogue entry) is one row, with the others named under
          it. Here are the passages found for your question, in order, before those corrections.
        </p>
      </Prose>

      <Figure id="fig-keyword-results" title="What keyword search found, in order" reading={data ? keywordReading(data) : undefined}>
        <FromTrace shape="bars" invitation="A ranked list of passages, each with a bar for its score and the words that matched.">
          {(traced) =>
            traced.keyword.hits.length > 0 ? (
              <KeywordResults trace={traced} />
            ) : (
              <p className="text-small text-ink-muted">
                No passage contains {traced.parse.words.length > 1 ? "any of these words" : "this word"}. Keyword search has nothing to
                offer for this question; search by meaning, next, may still find something.
              </p>
            )
          }
        </FromTrace>
      </Figure>

      <Prose>
        <h3>Reference collections</h3>
        <p>
          Articles in reference collections such as Wikipedia are not in this index. Each archive has its own, searched by a separate
          program, and every archive asked costs seconds on a small computer. So Outpost asks the six likeliest to hold the answer first,
          judged from what each says it is: a question with “burn” in it goes to the medical collections, one with “tyre” to the motor
          mechanics, and a general encyclopaedia is nearly always asked. If those six find fewer than three good articles, the rest are
          asked too; otherwise they wait behind “Search all reference collections”.
        </p>
        <p>
          Each archive is asked twice at once: for its full text, and for titles holding the words a title would (“burn” for “treat a
          burn”), which answer much sooner. Pages that only list other pages, such as a list of questions by tag, are left out. Every
          article is then scored by the same rule as above, from its title and snippet, and all of them form one list across the archives.
          An article whose title is just the thing asked about, such as “Burn”, counts as holding the whole question.
        </p>
      </Prose>

      <Prose>
        <p>
          The weakness of keyword search is plain from how it works. It matches letters, not ideas. Ask about “making water safe” and it
          will not find a passage that only says “disinfect” or “purify”, however good that passage is. Stemming helps with endings; it does
          nothing for synonyms. That gap is what the second search is for.
        </p>
      </Prose>
    </Stage>
  );
}
