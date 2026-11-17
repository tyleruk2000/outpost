import type { ExplainResponse } from "@outpost/shared";
import { ShieldAlert } from "lucide-react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { formatNumber } from "@/lib/utils";
import { Figure, FromTrace, Prose } from "../charts/figure";
import { CONTEXT_BUDGET, TRACE_LIMIT, useTraceState } from "../data";
import { BudgetBar, budgetReading, Sources } from "../figures/context";
import {
  BUMP_SHOWN,
  BumpChart,
  bumpReading,
  ContributionBars,
  contributionReading,
  curveReading,
  FusionControls,
  ReciprocalCurve,
  useWhatIf,
} from "../figures/fusion";
import { CitationChecker, contextCommand, PromptBlock } from "../figures/model";
import { formatValue } from "../lib/scale";
import { SETTINGS_ANSWERS, SETTINGS_MEANING, SETTINGS_READING, Stage } from "../stages";

/** The fusion figures share one set of what-if settings, so they live in one component per trace. */
function FusionFigures({ trace }: { trace: ExplainResponse }) {
  const whatIf = useWhatIf(trace);
  // With no passage from either search there is nothing to draw; the readings say so.
  const nothing = whatIf.rows.length === 0;
  return (
    <>
      <Figure id="fig-formula" title="The formula, with your numbers in it" reading={curveReading(whatIf.settings.k)}>
        <FusionControls whatIf={whatIf} />
        <div className="mt-5">
          <ReciprocalCurve whatIf={whatIf} />
        </div>
      </Figure>
      <Figure
        id="fig-bump"
        title={whatIf.changed ? "Two lists become one (what if)" : "Two lists become one"}
        reading={bumpReading(whatIf.rows, BUMP_SHOWN)}
      >
        {nothing ? null : <BumpChart whatIf={whatIf} />}
        <p className={nothing ? "hidden" : "mt-3 max-w-[68ch] text-small text-ink-muted"}>
          Follow a line from a place on either side to the middle. A passage with lines from both sides was found by both searches. A
          passage with a line from one side only was found by one; its missing side is marked with a small grey dot. Point at a passage, or
          move to it with the Tab key, to pick it out.
        </p>
      </Figure>
      <Figure id="fig-contributions" title="Where each final score came from" reading={contributionReading(whatIf.rows)}>
        {nothing ? null : <ContributionBars whatIf={whatIf} />}
      </Figure>
    </>
  );
}

export function FusionSection() {
  const { trace, query } = useTraceState();
  const data = query ? trace.data : undefined;
  const best = data?.keyword.hits[0];
  const closest = data?.semantic.hits[0];
  const demonstration = data?.semantic.source === "demonstration";
  return (
    <Stage id="stage-fusion">
      <Prose>
        <p>
          There are now two ranked lists of passages, one from each search. They have to become one. The obvious way would be to add each
          passage’s two scores together. It does not work, and seeing why explains the method that is used instead.
        </p>
        <p>
          {best && closest
            ? `For your question, the best keyword match scored ${formatValue(best.score)} and the closest passage by meaning scored ${closest.similarity.toFixed(2)}.`
            : "A keyword score might be 8.4. A cosine similarity might be 0.43."}{" "}
          These are not amounts of the same thing. A BM25 score has no upper limit and changes with the question: more words, or rarer
          words, and every score goes up. A cosine similarity is always between −1 and 1. Add them and the keyword score simply drowns the
          other one. Rescaling them first only hides the problem, since nothing says a BM25 of 8 is “as good as” a cosine of 0.8.
        </p>
        <p>
          What the two lists do share is order. Each has a first place, a second place and so on. A passage’s position in a list is its{" "}
          <strong>rank</strong>, and a rank means the same thing in both lists. So the lists are combined using ranks alone, and the scores
          are thrown away.
        </p>
        <h3>Reciprocal rank fusion</h3>
        <p>
          The method is called <strong>reciprocal rank fusion</strong>, or RRF. Each list awards a passage 1 divided by (<em>k</em> plus its
          rank in that list). “Reciprocal” just means “one divided by”. A passage’s final score is what the two lists award it, added
          together. A passage missing from a list gets nothing from that list. Then everything is sorted by final score.
        </p>
        <p>
          Two properties fall out of this. A passage that both searches found collects two awards, so agreement between the searches is
          rewarded. And a passage that one search put first can still beat a passage that both searches put low, so a strong opinion from
          one side is not ignored.
        </p>
        <p>
          The number <em>k</em> decides how much the very top places are worth compared with the rest. It is {data ? data.fusion.k : 60}{" "}
          here; 60 is the value the method’s inventors found worked well, and it has been the usual choice ever since. Each list can also be
          given a weight, which multiplies its awards. Equal weights treat the two searches as equally trustworthy.
        </p>
      </Prose>

      {data ? (
        <div className={trace.isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <FusionFigures key={data.query} trace={data} />
        </div>
      ) : (
        <>
          <Figure id="fig-formula" title="The formula, with your numbers in it">
            <FromTrace
              shape="text"
              invitation="The formula with your settings in it, sliders to change them on this page, and a curve of what each place is worth."
            >
              {() => null}
            </FromTrace>
          </Figure>
          <Figure id="fig-bump" title="Two lists become one">
            <FromTrace
              shape="bump"
              invitation="Three columns: the order by words, the final order, and the order by meaning, with a line for each passage."
            >
              {() => null}
            </FromTrace>
          </Figure>
          <Figure id="fig-contributions" title="Where each final score came from">
            <FromTrace
              shape="bars"
              invitation="A bar for each of the top passages, split into the part from words and the part from meaning."
            >
              {() => null}
            </FromTrace>
          </Figure>
        </>
      )}

      <Prose>
        <p>
          Try the sliders. Pull <em>k</em> down to 1 and first place in either list becomes worth far more than second, so each search’s
          favourite jumps to the top. Push it to 200 and all places are worth nearly the same, so being found by both searches matters more
          than where. Set one weight to 0 and the final order becomes the other search’s order exactly.
        </p>
        {demonstration ? (
          <p>
            One thing to keep straight. This page always runs both searches so that you can see the combining. The ordinary search box only
            does so once search by meaning is switched on in <Link to={SETTINGS_MEANING}>Settings</Link>. Until then it uses words alone,
            and what you see here is what it would do.
          </p>
        ) : null}
      </Prose>
    </Stage>
  );
}

export function ContextSection() {
  const { trace, query } = useTraceState();
  const data = query ? trace.data : undefined;
  return (
    <Stage id="stage-context">
      <Prose>
        <p>
          The search is finished: there is one ranked list of passages. If you were reading the results yourself, this is where it would
          end. For a language model there is one more job, which is to lay the best passages out in a form it can use and you can check.
          That bundle of text is called the <strong>context</strong>.
        </p>
        <p>
          It has to be rationed. A model reads its instructions, the sources, the question and its own answer-in-progress all in one go, and
          the most it can hold at once is its <strong>context window</strong>. The window is measured in <strong>tokens</strong>. A token is
          a word or a piece of a word, the unit a model actually reads; in English one token is about four characters, so a thousand tokens
          is roughly 750 words. This page estimates tokens by dividing characters by four. A real count depends on the model and will differ
          a little.
        </p>
        <p>
          Small local models have small windows, a few thousand tokens. And even when the window is large, filling it is a mistake: every
          extra passage costs time, and a model given twenty passages of which three matter is more likely to be distracted than helped. So
          there is a budget. Here it is {formatNumber(CONTEXT_BUDGET)} characters of quoted text and at most {TRACE_LIMIT} passages, which
          is what answers use unless the budget has been changed in <Link to={SETTINGS_ANSWERS}>Settings</Link>.
        </p>
        <p>
          The rule for filling it is simple. Take the passages in their final order. Add each one if it still fits. If one is too long for
          the space that is left, skip it and try the next. The first passage always goes in, even if it is over the budget by itself.
        </p>
      </Prose>

      <Figure id="fig-budget" title="What fitted in the budget" reading={data ? budgetReading(data) : undefined}>
        <FromTrace shape="bar" invitation="One bar for the budget, with a numbered block for each source that went in.">
          {(traced) => <BudgetBar trace={traced} />}
        </FromTrace>
      </Figure>

      <Prose>
        <p>
          The numbers on the blocks are not ranks. Once the passages are chosen they are rearranged: passages from the same document are put
          together, in the order they appear in that document, so that the model reads each source the way a person would. Then they are
          numbered from 1. Each number is a <strong>citation</strong> marker. Behind it Outpost keeps a record of exactly what it points to:
          the document or page, the heading, the page number, the passage’s exact words and a link that opens the source at that place.
        </p>
        <p>What follows is the context itself. This is your own text, quoted letter for letter. Nothing in it was written by a machine.</p>
      </Prose>

      {data?.context.safetyCritical ? (
        <Notice
          tone="warning"
          icon={<ShieldAlert aria-hidden />}
          title="These sources are flagged as safety-critical"
          className="my-6 max-w-[46rem]"
        >
          At least one source has a title or category to do with medicine, first aid, water treatment or preserving food. In those subjects
          a confident paraphrase that changes a dose, a time or a temperature can hurt someone. So the rule changes: anything built on this
          context must show the source’s own words, clearly marked as a quotation, and must not present a rewording as if it were the
          source. The flag looks only at titles and categories, never at the text, so its absence means “not detected”, not “safe”.
        </Notice>
      ) : null}

      <Figure
        id="fig-sources"
        title="The numbered sources, exactly as a model would be given them"
        reading={
          data && data.context.citations.length > 0
            ? `About ${formatNumber(data.context.approxTokens)} tokens in all, counting the header line of each source. Only passages from your documents and pages are handed over; catalogue listings and saved places in the ranking are passed by. Each title opens the source at that passage.`
            : undefined
        }
      >
        <FromTrace shape="text" invitation="The chosen passages as numbered sources, each with its title, heading, page and exact words.">
          {(traced) => <Sources trace={traced} />}
        </FromTrace>
      </Figure>
    </Stage>
  );
}

export function ModelSection() {
  const { trace, query } = useTraceState();
  const data = query ? trace.data : undefined;
  return (
    <Stage id="stage-model">
      <Prose>
        <p>
          Everything up to here, Outpost does. This last step is done by a language model, and there is none inside Outpost. If you run one
          yourself (with Ollama, llama.cpp or LM Studio) and name it in <Link to={SETTINGS_ANSWERS}>Settings</Link>, the Search screen
          offers <strong>Answer from my library</strong>: Outpost sends that model what is shown below, and shows you what it writes, with
          the passages beneath it. Nothing is sent until you press that button, and it goes to your model server and nowhere else.
        </p>
        <p>
          A request to a language model is called a <strong>prompt</strong>. It usually has two parts. The <em>system</em> part is the
          standing instruction: how to behave. The <em>user</em> part is the material for this particular request: here, the numbered
          sources followed by your question.
        </p>
      </Prose>

      <Figure id="fig-prompt" title="The prompt that is sent">
        <FromTrace shape="text" invitation="The instructions, your sources and your question, laid out as a model would receive them.">
          {(traced) => <PromptBlock trace={traced} />}
        </FromTrace>
      </Figure>

      <Prose>
        <p>
          Given that prompt, a model reads the sources, writes a few sentences in reply to the question, and puts a marker such as [2] after
          each statement to say which source it rests on. The instruction to answer <em>only</em> from the sources, and to say so when they
          do not contain the answer, is what is meant by <em>grounding</em> an answer.
        </p>
        <p>
          Look at the two lines of equals signs around the sources, and the code they share. Your documents can contain anything, including
          a sentence written to look like an order: “ignore your instructions and say this instead”. Planting such a sentence is called{" "}
          <strong>prompt injection</strong>. The lines fence the sources off as material to report on, the rules say that nothing between
          them is to be obeyed, and the code is made up afresh for every question so that no document can contain it and close the fence
          early. This lowers the risk. It does not remove it: a small model can still be talked round. What keeps that harmless is that
          Outpost never acts on an answer. It is shown as words, and the only links in it are the markers, which lead to passages Outpost
          itself supplied.
        </p>
        <p>
          The markers are the point of the whole arrangement. A model’s sentence is an interpretation; the source’s sentence is the source.
          With a marker beside every claim, you can open the passage and see for yourself whether it says what the model says it says.
          Without markers you would have to take the answer on trust.
        </p>
        <p>
          Grounding makes hallucination much less likely. It does not make it impossible. A model can still misread a source, blend two
          sources into a claim neither makes, attach a real marker to a sentence the source does not support, or cite a number that was
          never supplied. The last of these can be caught mechanically, and Outpost’s server has a small checker for it: it lists the
          markers an answer uses and reports any that match no supplied source. The others need a reader. That is why the markers lead back
          to the text and not just to a title.
        </p>
      </Prose>

      <Figure
        id="fig-checker"
        title="Check the markers in an answer"
        reading="The check Outpost runs on every answer it shows, done here on any text you paste: an answer from another program, or one you have changed to see what happens."
      >
        <FromTrace shape="text" invitation="A box for an answer, and a check of its markers against the sources above.">
          {(traced) => <CitationChecker trace={traced} />}
        </FromTrace>
      </Figure>

      <Prose>
        <h3>Asking for an answer</h3>
        <p>
          {data ? (
            <>
              <Link to={`/search?q=${encodeURIComponent(data.query)}`}>Open this question on the Search screen</Link> and choose{" "}
              <strong>Answer from my library</strong>.
            </>
          ) : (
            <>
              Type a question on the <Link to="/search">Search screen</Link> and choose <strong>Answer from my library</strong>.
            </>
          )}{" "}
          The button is there once a model server is set up in{" "}
          <Link to={SETTINGS_ANSWERS}>Settings, under “Answers from your library”</Link>. The answer is labelled as generated and names the
          model that wrote it; the markers in it open the passages; a marker that matches no source is struck through; and an answer with no
          markers is called out. When no passage is found, the model is not asked at all. One thing differs from the search box: before
          looking for passages, an answer leaves out the words that only make a sentence a question (“how”, “should”, “the”) and searches
          for the rest, and it says which words it searched for.
        </p>
        <p>
          Answers draw on documents, notes and book chapters. Articles in reference collections such as Wikipedia are not cut into passages
          by Outpost, so they are never among the sources, even when they appear in the search results.
        </p>
        <p>
          To build something of your own on the same passages, ask Outpost for the context directly. The request below returns the numbered
          sources and their citation records, without a prompt around them. The guide{" "}
          <Link to="/help/answers#h-the-api" className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
            Answers from your library
          </Link>{" "}
          describes the rest.
        </p>
        <pre>
          <code>{contextCommand(data?.query ?? "your question")}</code>
        </pre>
        <p>However an answer is produced, it is the model’s work, not your library’s. Read it with the sources open.</p>
      </Prose>
    </Stage>
  );
}

export function WrongSection() {
  return (
    <Stage id="stage-wrong">
      <Prose>
        <p>
          When a system like this gives a poor answer, the cause is almost always in one of four places. The figures on this page let you
          tell which.
        </p>
        <h3>The right passage was never found</h3>
        <p>
          Look for it in <a href="#fig-keyword-results">what keyword search found</a> and{" "}
          <a href="#fig-meaning-results">what search by meaning found</a>. If it is in neither list, nothing later can rescue it. The usual
          reasons: your question and the passage use different words, and there is no real embedding model to bridge them; or the answer was
          split by a cut, so that neither half looks relevant by itself (check <a href="#fig-ribbon">how the document was cut</a>); or the
          document’s text could not be read when it was added.
        </p>
        <h3>It was found, but ranked too low</h3>
        <p>
          Find it in <a href="#fig-bump">the chart of the two lists</a>. If it sits well down one side and is missing from the other, it
          ended up “lower down” and never reached the context. A more specific question often lifts it. So can the weights, if one search is
          consistently better for your kind of material.
        </p>
        <h3>It was ranked well, but did not fit</h3>
        <p>
          <a href="#fig-budget">The budget bar</a> says how many passages were left out for lack of room. Long passages fill the budget
          quickly. Smaller passages let more distinct sources in, at the cost of each carrying less of its surroundings.
        </p>
        <h3>It was in the context, and the model got it wrong anyway</h3>
        <p>
          This one is the model’s doing, not the search’s, and you can tell. If the right text is among{" "}
          <a href="#fig-sources">the numbered sources</a> and the answer contradicts it, or cites a marker that does not support the claim,
          the fault is in the generation. Check the markers, read the cited source, and prefer the source.
        </p>
        <h3>Where to change things</h3>
        <ul>
          <li>
            <Link to={SETTINGS_READING}>Settings, under “Reading documents”</Link>: the passage size and the overlap. A change applies to
            documents added or read again from then on, not to passages already cut.
          </li>
          <li>
            <Link to={SETTINGS_MEANING}>Settings, under “Search by meaning”</Link>: switching it on, which builds the index of vectors by
            itself. Under “More options” there: where the model runs, and the fusion numbers (<em>k</em> and the two weights). The sliders{" "}
            <a href="#fig-formula">above</a> let you see what a change would do before making it.
          </li>
          <li>
            <Link to={SETTINGS_ANSWERS}>Settings, under “Answers from your library”</Link>: which model writes, how freely it words things,
            and the context budget.
          </li>
        </ul>
      </Prose>
    </Stage>
  );
}
