import type { ExplainEntity, ExplainOverview } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ErrorState } from "@/components/page";
import { formatNumber, plural } from "@/lib/utils";
import { Figure, FigureInvitation, FigureSkeleton, FromTrace, Prose } from "../charts/figure";
import { type ChunksResponse, useTraceState } from "../data";
import { LengthHistogram, lengthsReading } from "../figures/lengths";
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
          A language model on its own answers from memory. It has read a great deal, but it has not read your documents, and when it does
          not know something it tends to write a fluent guess. That failing has a name: a <strong>hallucination</strong> is a statement a
          model produces that sounds right and is not supported by anything.
        </p>
        <p>
          <strong>Retrieval-augmented generation</strong>, usually shortened to RAG, is the standard remedy. Before the model writes a word,
          a search finds the pieces of text most likely to contain the answer. Those pieces are placed in front of the model with an
          instruction: answer from these, and say which one each statement came from. Retrieval is the finding. Augmented means the question
          has had the found text added to it. Generation is the writing.
        </p>
        <p>
          Outpost does the retrieval and the augmenting. It does not include a language model. The writing is done by a model you run
          yourself, if you have set one up in Settings: Outpost hands it the passages and shows you what it wrote. So the journey below is
          drawn with its last two steps dashed: they happen on your model server, and everything before them happens here.
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
          A search that returned whole documents would leave you to find the right paragraph yourself. And a language model can only read a
          limited amount at a time, so handing it a 300-page manual is not possible. Both problems have the same answer: cut every document
          into small pieces, and search the pieces.
        </p>
        <p>
          A piece is called a <strong>passage</strong> (you will also see the word <em>chunk</em>; they mean the same thing). In this
          library a passage is at most {size ? formatNumber(size) : "about a thousand"} characters, which is two or three paragraphs.
        </p>
        <p>
          The cutting follows the document’s own shape where it can. A page of a PDF, or the text under one heading, is never merged with
          its neighbour, so every passage belongs to exactly one page and one heading and can be pointed to precisely. When a page or
          section is too long for one passage, it is cut at the end of a paragraph if possible, otherwise at the end of a sentence,
          otherwise between two words.
        </p>
        <p>
          A cut can still land in the middle of a thought. So when a section has to be cut, the next passage does not start where the last
          one stopped. It starts about {overlap ? formatNumber(overlap) : "a hundred and fifty"} characters earlier. That shared stretch is
          the <strong>overlap</strong>, and it means a sentence that straddles a cut is whole in at least one of the two passages.
        </p>
      </Prose>

      <Figure
        id="fig-ribbon"
        title="One document, cut into passages"
        reading={
          chunks.data
            ? ribbonReading(chunks.data)
            : "The whole text of a document as one ribbon, read left to right and top to bottom. Each block is a passage, drawn at its true position and length."
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
        <p>
          Passages sit on two rows only so that neighbours can be told apart; the text runs straight through. Where a block on one row
          reaches past the start of the next block on the other row, the two share that text, and the stretch is drawn in a stronger tone
          across both rows. A thin upright line marks the start of a new page or heading. Notice that there is never an overlap across one
          of those lines: a new section always starts clean.
        </p>
        <p>The target size is a ceiling, not a rule. Most sections do not divide evenly, so many passages are shorter than the limit.</p>
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
          Once cut, the passages are put into an <strong>index</strong>. An index is a structure prepared in advance so that a question can
          be answered without reading everything, in the way the index at the back of a book tells you which pages mention a word without
          your reading the book. Outpost keeps two: one by word, described in the next section, and one by vector, described in the section
          after. {overview && !empty ? indexSentence(overview) : ""}
        </p>
        <p>
          Each passage also carries a <strong>content hash</strong>: a short fingerprint worked out from its text. Change one letter and the
          fingerprint changes; leave the text alone and it stays the same. When a document is read again, a passage whose fingerprint has
          not changed keeps the vector already made for it. That matters because making vectors is by far the slowest part of indexing, and
          most edits touch only a few passages. You can see each passage’s fingerprint under the ribbon above.
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
          First the question is tidied into something the index understands. Punctuation is dropped. Each word is reduced to its stem, so
          that “boil”, “boiled” and “boiling” count as the same word. Then the words are joined into an <strong>expression</strong>: a small
          formula saying which words a passage must contain.
        </p>
      </Prose>

      <Figure id="fig-query-words" title="Your question, as the index sees it">
        <FromTrace shape="text" invitation="The words of your question, and the expression built from them.">
          {(traced) => <QueryWords trace={traced} />}
        </FromTrace>
      </Figure>

      <Prose>
        <p>
          Finding the passages is the easy half. The harder half is putting them in order, because a question of three words may match
          dozens of passages and you will read only the first few. The index gives every matching passage a score, using a formula called{" "}
          <strong>BM25</strong> (“best match 25”, the twenty-fifth version its authors tried). It has been the standard way to rank keyword
          results for thirty years, and it rests on three ideas.
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
        <p>
          One more thing changes a score: <em>where</em> the word was found. A word in a document’s title says more about the whole document
          than the same word in passing. In Outpost a mention in the title is counted as eight mentions, in a tag as four, in a heading as
          three, and in the text itself as one. Because of saturation, eight mentions are not worth eight times as much as one; in the curve
          above they are worth nearly twice as much.
        </p>
        <p>
          The final score of a passage is the sum, over each of your words, of that word’s weight multiplied by its saturated count. Here is
          what that gives for your question.
        </p>
      </Prose>

      <Figure id="fig-keyword-results" title="What keyword search found, in order" reading={data ? keywordReading(data) : undefined}>
        <FromTrace shape="bars" invitation="A ranked list of passages, each with a bar for its BM25 score and the words that matched.">
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
        <p>
          The weakness of keyword search is plain from how it works. It matches letters, not ideas. Ask about “making water safe” and it
          will not find a passage that only says “disinfect” or “purify”, however good that passage is. Stemming helps with endings; it does
          nothing for synonyms. That gap is what the second search is for.
        </p>
      </Prose>
    </Stage>
  );
}
