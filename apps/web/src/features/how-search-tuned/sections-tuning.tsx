/** "How search was tuned", parts 4 to 8: the changes in order, the final score, meaning, speed, the lessons and the summary. */
import { blended, favoured, MEANING_CEILING, meaningScore, PI_STAGES, PI_SUMMARY, SCORED_EXAMPLE, WEIGHTS } from "./data";
import { MemoryPlate, ProgressPlate, QuantisePlate, SpeedPlate, WeightsPlate } from "./figures";
import { Figures, Part, Prose, Step, Sub, Sum } from "./parts";

const two = (value: number) => value.toFixed(2);
const three = (value: number) => value.toFixed(3);

export function StepsSection() {
  return (
    <Part id="steps" title="The changes, in the order they were made">
      <Prose>
        <p>The work was done in five packages. Each was measured before and after.</p>
        <p>
          Some “before” figures differ from the “after” of the package before. That is because the evaluation set grew, or got harder,
          between them.
        </p>
      </Prose>

      <Step
        id="step-1"
        title="1. Truthful basics"
        problem={
          <p>
            Pages after the first were empty, question words had to match, and the score shown was a place in a list, not a measure of the
            match.
          </p>
        }
        evidence={
          <p>
            “water” counted 206 and showed 3. The owner’s question scored nDCG@5 0.26 on the Pi. The Pi as it ranked scored 0.393 over the
            set, with a useful result in the first three for 76% of questions.
          </p>
        }
        change={
          <ul>
            <li>The two-phase search: every match found, grouped into items, the best 200 scored again.</li>
            <li>
              Words that only shape a question (“how”, “to”, “the”, “what”) left out, and listed as left out. “not” and “without” kept.
            </li>
            <li>
              When fewer than 5 items hold every word, items holding at least half of what the question is about are added after them, with
              a notice. Rarer words weigh more in that half.
            </li>
            <li>One score from 0 to 1 for every result, in five weighted parts (below).</li>
            <li>Places and repeaters moved to a strip of their own, out of the ranked list.</li>
            <li>A few words saying why each result is there replaced the percentage.</li>
          </ul>
        }
        result={
          <ul>
            <li>Fixture: nDCG@5 0.740 → 0.883; success@3 98% → 100%.</li>
            <li>Fixture p95 32 → 87 ms. Scoring 200 items again costs time; that was paid back later.</li>
            <li>The Pi’s own candidates re-ranked offline: 0.393 → 0.917; success@3 76% → 98%.</li>
            <li>The owner’s question, re-ranked offline: 0.26 → 1.00.</li>
          </ul>
        }
      />

      <Step
        id="step-2"
        title="2. Understanding the question"
        problem={<p>Different words for the same thing found different things, and a typing slip quietly found other things.</p>}
        evidence={<p>“tyre” and “tire” found different results. “power cut” on Wikipedia found “Bandsaw”.</p>}
        change={
          <ul>
            <li>
              About 250 entries of other ways of saying things: British and American spellings, household words (“torch”, “flashlight”), and
              rules for words that mean the same only in company. “change” also means “replace” or “fit” only beside a part, such as a
              battery. “treat” also means “purify” only beside “water”.
            </li>
            <li>The word as typed scores a little more than another way of saying it, and the screen says what else was searched.</li>
            <li>A word still being typed matches as a beginning (“batt” finds “battery”) only when the whole word finds too little.</li>
            <li>
              “Did you mean”: a typed word in no passage, or almost none, is compared with the words the library holds as written. The
              nearest, at most two letters different (one for a short word), is offered as a link. It never replaces what was typed.
            </li>
          </ul>
        }
        result={
          <ul>
            <li>The set grew to 56 questions, many of them about spellings and other words.</li>
            <li>Fixture: nDCG@5 0.818 → 0.878; success@3 98% → 100%; zero results 2% → 0%.</li>
            <li>Own results p95 72 ms on a library of 4,000 passages.</li>
          </ul>
        }
      />

      <Step
        id="step-3"
        title="3. The reference collections"
        problem={
          <p>
            Every collection was asked every question. Each collection’s top article was shown as 100%, and lists of tags or “Main Page”
            were shown as answers.
          </p>
        }
        evidence={<p>On the Pi, asking all 37 collections took 6.7 seconds at the median.</p>}
        change={
          <ul>
            <li>
              Each collection is given a <strong>prior</strong> for the question: a score from what it says it is about (its title,
              description, category, tags and language) and how well it answered the same words lately. A general encyclopaedia gets 0.3; a
              topic match in its title or description 0.5.
            </li>
            <li>
              The six with the best prior are asked first, for 8 articles each. The rest are asked when those give fewer than 3 good
              results, or when the person asks for all.
            </li>
            <li>A search of titles runs beside the full-text search, so that an article titled “Burn” is found for “treat a burn”.</li>
            <li>
              Pages that only list other pages are dropped: tag lists, “page=4”, “Highest voted questions”, Main Page, Category: pages.
            </li>
            <li>
              Every article is scored on the same 0 to 1 scale as the library’s own items. In one list with them it counts 0.95 of its
              score, so that a page you chose to keep comes first when the two are close.
            </li>
          </ul>
        }
        result={
          <ul>
            <li>Fixture: reference success@3 69% → 85%; useful share of the first five 43% → 70%; whole list nDCG@5 0.733 → 0.850.</li>
            <li>
              Pi: collections asked per question 37 → 10.9; all done 6.7 → 1.4 s at the median; the first useful article after 0.6 s at the
              median.
            </li>
          </ul>
        }
      />

      <Step
        id="step-4"
        title="4. Speed, the kind of question, and duplicates"
        problem={
          <p>
            On the Pi, the slowest searches of the library’s own items took nearly a second. Words alone could not tell a first aid manual
            from a hiking forum, or CPR the first aid from CPR the Canadian Pacific Railway.
          </p>
        }
        evidence={<p>Own results p95 on the Pi: 888 ms. Making snippets took 250 ms for “water” alone (see Speed, below).</p>}
        change={
          <ul>
            <li>The snippet fix, and less work for each search (see Speed).</li>
            <li>Mild adjustments for the kind of question (see The final score).</li>
            <li>Results of one title shown once, with “Also in…”.</li>
            <li>Emergency plans and supplies added to search, for the current household only. Medical notes and encrypted text never.</li>
          </ul>
        }
        result={
          <ul>
            <li>Pi: nDCG@5 0.863; success@3 98%; own results p95 888 → 393 ms.</li>
            <li>Pi reference collections: success@3 96%; useful share of the first five 92%.</li>
            <li>
              Fixture: 0.845 → 0.832, after three deliberately misleading items were added to it. The number fell because the test got
              harder, not because search got worse.
            </li>
          </ul>
        }
      />

      <Step
        id="step-5"
        title="5. Search by meaning, done properly"
        problem={<p>Search by meaning was off on the Pi, and when it was on during a build, searches slowed down.</p>}
        evidence={
          <p>
            Timed stage by stage on the Pi (below), the question waited behind the passage the model was reading for the build: about 300 ms
            each.
          </p>
        }
        change={
          <ul>
            <li>The meaning index held in memory as 8-bit numbers and compared with the processor’s vector instructions.</li>
            <li>During a build, questions go to a second copy of the model, on one thread of its own.</li>
            <li>Results found by meaning alone come after every result that holds all your words.</li>
            <li>
              For a first aid question, a trusted medical source that holds every word and means the same as the question comes first.
            </li>
          </ul>
        }
        result={
          <ul>
            <li>Pi, meaning complete over 59,327 passages: nDCG@5 0.873; success@3 98%; zero results 0%; own results p95 122 ms.</li>
            <li>“rescue breaths for a child” on the fixture: 0.44 → 0.67, the first aid manual now above the forum post.</li>
          </ul>
        }
      />

      <Sub id="steps-rejected">Tried and rejected</Sub>
      <Prose>
        <p>Some changes were tried, measured, and taken out. They are as much a part of the tuning as what was kept.</p>
      </Prose>
      <Figures
        label="Changes tried and rejected"
        prose
        head={["Tried", "What the measurement said", "Why it went"]}
        rows={[
          [
            "A fixed cut-off for meaning: drop anything less similar than a set number",
            "Nonsense, “zzqx flurble”, came within 0.45 of a passage on the Pi. The note that answers “dog paws snow ice” scored only 0.19.",
            "No single number keeps the real answer and drops the nonsense. Instead, a result found by meaning alone is dropped when it is more than 0.2 behind the nearest.",
          ],
          [
            "Meaning at full weight",
            "Fixture nDCG@5 0.838 at half weight, 0.826 at full weight, 0.836 by words alone.",
            "The library’s own items have meaning numbers and reference articles do not, so at full weight own items rose above better articles.",
          ],
          [
            "Lowering forum posts that match only by their words",
            "+0.003 nDCG@5.",
            "Within noise (see Lessons), and it pushed down a useful answer about hypothermia.",
          ],
          [
            "A cross-encoder: a second model that reads the question and each passage together to re-order them",
            "For all 32 answerable questions of the answers test, the passage holding the answer was already among the five handed to the model, and first for 30.",
            "Little to gain, seconds per question on a Pi, and the usual models are trained on MS MARCO, whose data is for non-commercial use only.",
          ],
        ]}
      />
    </Part>
  );
}

export function FormulaSection() {
  const parts = SCORED_EXAMPLE.parts;
  const sum = WEIGHTS.reduce((total, part) => total + part.weight * parts[part.key]!, 0);
  return (
    <Part id="formula" title="The final score">
      <Prose>
        <p>Every result, whatever found it, gets one score from 0 to 1, made of five parts.</p>
        <p>Each part is itself 0 to 1. The score is their weighted sum.</p>
      </Prose>
      <WeightsPlate />
      <Prose>
        <p>
          <strong>Coverage</strong> is the share of the question’s words the result holds, each word weighed by how rare it is in the
          library, by the same inverse document frequency BM25 uses.
        </p>
        <p>
          A word found exactly as typed, or as its plural, counts in full. Another form of it (“boiling” for “boil”) counts 0.92. Another
          way of saying it (“tire” for “tyre”) counts 0.85. A longer word it only begins (“battery” for “batt”) counts 0.6.
        </p>
        <p>
          <strong>Title</strong> is the same share counted in the title; a word in the tags counts 0.75 of that, in a heading 0.6.{" "}
          <strong>Closeness</strong> is 1 when the words are side by side and halves as the stretch holding them doubles.{" "}
          <strong>Frequency</strong> grows with how often the words occur, with diminishing returns. <strong>Side by side</strong> is 1 when
          every word is there, next to each other, in the order typed.
        </p>
        <p>Coverage carries half. So a result with every word beats one missing a word, unless the missing word is common.</p>
        <p>
          Worked out by Outpost’s scorer for a passage of “{SCORED_EXAMPLE.title}”, under the heading “{SCORED_EXAMPLE.heading}”: “
          {SCORED_EXAMPLE.text}”. The question is “How to change car battery”, which leaves “change” (also “replace” or “fit”), “car” and
          “battery”.
        </p>
      </Prose>
      <Figures
        label="The score of one passage, part by part"
        head={["Part", "Value", "Weight", "Weight × value"]}
        numeric={[1, 2, 3]}
        rows={[
          ...WEIGHTS.map((part) => [part.name, three(parts[part.key]!), two(part.weight), three(part.weight * parts[part.key]!)]),
          [<strong key="t">Score</strong>, "", "", <strong key="s">{three(sum)}</strong>],
        ]}
      />
      <Prose>
        <p>
          Coverage is 0.961, not 1: “change” is found only as “replace”, which counts 0.85. Side by side is 0, because the words are not
          next to each other in the order typed. Beside the result the screen says “All 3 words, close together; also matched replace”.
        </p>
      </Prose>

      <Sub id="formula-why">Why weights like these, and how they are tested</Sub>
      <Prose>
        <p>
          Numbers like 0.5 and 0.2 are <strong>hyperparameters</strong>: settings chosen by people, not learned from data. Every system that
          ranks or predicts has them.
        </p>
        <p>
          Each has a reason. Coverage is largest because holding what was asked matters most. Side by side is smallest: words side by side
          already earn full closeness, so it adds only a little for the order typed.
        </p>
        <p>
          A reason is not proof. The evaluation set is what turns a guess into a decision: a new weight is a change like any other, run
          against the set, and kept only if the measures say so.
        </p>
        <p>
          With 56 questions, letting a program search for the best weights would fit these 56 questions and little else. Weights set by
          reason and checked by measurement are less likely to fit the quirks of a set this small.
        </p>
      </Prose>

      <Sub id="formula-priors">Adjustments for the kind of question</Sub>
      <Prose>
        <p>Words alone cannot tell that a first aid manual answers “rescue breaths” better than a hiking forum using the same words.</p>
        <p>
          So after scoring, a <strong>prior</strong>, an expectation held before looking at the words, adjusts the score a little.
        </p>
        <ul>
          <li>A medical question favours a medical or first aid source: × 1.25.</li>
          <li>A question about a generator, heater or stove used safely favours official safety guidance: × 1.25.</li>
          <li>A question about a car favours vehicle sources: × 1.2.</li>
          <li>A “how to” question favours manuals, guides and questions and answers: × 1.1.</li>
        </ul>
        <p>Together they multiply a score by at most 1.3.</p>
        <p>A raised score also never gains more than its distance from 1, divided by the same factor. So a strong result gains little:</p>
      </Prose>
      <Sum>
        0.40 × 1.25 = {two(favoured(0.4, 1.25))} · but 0.90 rises only to {two(favoured(0.9, 1.25))}, since 1 − (1 − 0.90) ÷ 1.25 = 0.92
      </Sum>
      <Prose>
        <p>
          That makes the priors a tie-breaker among results the words found about equally. They cannot lift a poor match over a good one.
        </p>
        <p>
          A few words have a strong other meaning: “CPR” is also the Canadian Pacific Railway. A result plainly in the other sense keeps
          0.75 of its score: 0.60 becomes {two(favoured(0.6, 0.75))}. A question that names the other sense (“CPR railway”) is taken at its
          word.
        </p>
      </Prose>
    </Part>
  );
}

export function MeaningSection() {
  const example = { words: 0.7, similarity: 0.55 };
  const sense = meaningScore(example.similarity);
  return (
    <Part id="meaning" title="Search by meaning, in depth">
      <Sub id="meaning-embeddings">Embeddings and cosine similarity</Sub>
      <Prose>
        <p>
          A small model reads each passage and gives back 384 numbers that stand for what it means. That list is an{" "}
          <strong>embedding</strong>.
        </p>
        <p>
          Think of it as a point in a space of 384 directions. The model was trained so that texts meaning similar things land near each
          other.
        </p>
        <p>
          Nearness is measured by <strong>cosine similarity</strong>: the cosine of the angle between two points seen from the middle. 1
          means the same direction; 0 means unrelated.
        </p>
        <p>
          Outpost scales every embedding to a length of 1. Then the cosine is simply the sum of the 384 pairs of numbers multiplied
          together, the <strong>dot product</strong>.
        </p>
      </Prose>

      <Sub id="meaning-model">Why a small model is fast but weak</Sub>
      <Prose>
        <p>
          The model is all-MiniLM-L6-v2, from the Sentence Transformers project: 6 layers, 384 numbers, 23.7 MB, Apache-2.0 licence, English
          only.
        </p>
        <p>Being small, it reads quickly and fits on a Pi. On a Pi 5 it still takes about four minutes for every 1,000 passages.</p>
        <p>
          Being small, it also judges coarsely. Nonsense scored 0.45 against a passage while a real paraphrase scored 0.19. It is a guide to
          meaning, not a reader.
        </p>
        <p>A faster computer can read the passages for it: an Apple M2 Max laptop read 6,235 passages in 226 seconds.</p>
      </Prose>

      <Sub id="meaning-int8">Eight bits instead of thirty-two</Sub>
      <Prose>
        <p>To compare a question with 59,000 passages, all their numbers must be read. Held as they are, they take about 90 MB.</p>
        <p>
          <strong>Quantisation</strong> keeps each number in fewer bits. Each passage’s numbers are stored as whole numbers from −127 to
          127, with one scale for the passage: its largest number divided by 127.
        </p>
      </Prose>
      <QuantisePlate />
      <MemoryPlate />
      <Prose>
        <p>Rounding moves a similarity by a few thousandths. That is enough to swap two passages that are all but tied.</p>
        <p>
          So the 8-bit comparison only picks <strong>candidates</strong>: twice as many as wanted, plus 16. Their exact similarity is then
          worked out from the stored 32-bit numbers. The order returned is the exact one; only the search for it is approximate.
        </p>
        <p>
          The comparison uses <strong>SIMD</strong>, “single instruction, multiple data”: one processor instruction multiplies 16 pairs of
          numbers at once. It is written by hand in WebAssembly, 200 bytes of it. Where SIMD is missing, plain JavaScript does the same
          about twenty times slower.
        </p>
      </Prose>
      <Figures
        label="Comparing a question with 57,800 passages, on the laptop"
        head={["Held as", "Memory", "Time"]}
        numeric={[1, 2]}
        rows={[
          ["32-bit numbers, read from the database each time", "–", "115 ms"],
          ["32-bit numbers, kept in memory", "≈ 90 MB", "21 ms"],
          ["8-bit numbers, SIMD, closest re-scored exactly", "≈ 23 MB", "3.2 ms"],
        ]}
      />

      <Sub id="meaning-together">How words and meaning are combined</Sub>
      <Prose>
        <p>The similarity becomes a score on the same scale: 0.2 or less earns nothing, 0.7 or more earns the most meaning can, 0.6.</p>
        <p>A result found by its words and by meaning keeps its words’ score, and meaning fills half of what is left.</p>
      </Prose>
      <Sum>
        words 0.70, similarity 0.55 → meaning score 0.6 × (0.55 − 0.2) ÷ 0.5 = {two(sense)} → half of it, {two(sense / 2)} → 1 − (1 − 0.70)
        × (1 − {two(sense / 2)}) = {three(blended(example.words, example.similarity))}
      </Sum>
      <Prose>
        <p>The score can only rise, and never past 1.</p>
        <p>
          A result found by meaning alone, with none of your words, is marked “Similar in meaning”. Its score is at most {MEANING_CEILING},
          and always just below the lowest result that holds all your words.
        </p>
        <p>
          So meaning never outranks a result with all your words. When your words find plenty, the results by meaning wait below; when they
          find little, those fill the list.
        </p>
        <p>
          Answers work a little differently. They pick passages, not results, and merge the two lists by reciprocal rank fusion. A passage
          found by meaning alone must also have a similarity of at least 0.3 to be handed to the model.
        </p>
      </Prose>
    </Part>
  );
}

export function SpeedSection() {
  return (
    <Part id="speed" title="Speed">
      <Sub id="speed-stages">Where the time goes on a Pi</Sub>
      <Prose>
        <p>To make something faster, first find where its time goes. Each stage of a search was timed on the Pi.</p>
      </Prose>
      <Figures
        label="One search on the Raspberry Pi, stage by stage, while the meaning index was being built"
        head={["Stage", "Median", "p95"]}
        numeric={[1, 2]}
        rows={PI_STAGES.map((stage) => [stage.stage, stage.median, stage.p95])}
      />
      <Prose>
        <p>Keyword search was not the problem. The question waited for the model, busy reading the build’s passages.</p>
        <p>
          A second copy of the model, on one thread, answers questions while a build runs. On the laptop, p95 during a build fell 108 → 36
          ms.
        </p>
      </Prose>

      <Sub id="speed-snippet">The snippet bug</Sub>
      <Prose>
        <p>
          A <strong>snippet</strong> is the short piece of a passage shown under a result, with your words marked. The index makes it.
        </p>
        <p>
          The search asked for the snippets of the passages to be shown with “rowid IN (…)”: only these passage numbers. The index did not
          use the numbers to narrow its work.
        </p>
        <p>
          It made a snippet for every passage holding the words, and the database threw away all but the few wanted. For “water” in 57,000
          passages that took 250 ms.
        </p>
        <p>
          Now each snippet is asked for on its own, with “rowid = CAST(? AS INTEGER)”. Told plainly that the number is a whole number, the
          index goes straight to the one passage.
        </p>
        <p>
          Other savings: the item each passage belongs to is kept in memory; each candidate is scored on its best passage first; the count
          of passages is kept rather than counted on every search.
        </p>
        <p>
          On a synthetic library of 57,800 passages on the laptop, own results p95 fell 178 → 31 ms. Keeping the meaning numbers in memory
          took a comparison from 115 to 22 ms.
        </p>
      </Prose>

      <Sub id="speed-practice">What 888 → 122 ms means</Sub>
      <SpeedPlate />
      <Prose>
        <p>Before, one search in twenty of your own library took nearly a second or more. That pause is felt every time.</p>
        <p>After, 95 searches in 100 finish within an eighth of a second, which feels close to immediate.</p>
        <p>
          Reference collections are slower, because each is a separate search of a large archive: the first useful article now arrives after
          0.4 s at the median and 1.6 s for the slowest one in twenty.
        </p>
      </Prose>
    </Part>
  );
}

export function LessonsSection() {
  return (
    <Part id="lessons" title="What carries over to tuning models">
      <Prose>
        <p>Tuning a search and tuning a machine learning model are the same kind of work. These are the lessons that carry over.</p>
      </Prose>
      <Sub id="lessons-measure">Measure first</Sub>
      <Prose>
        <p>Decide what “better” means, as a number, before changing anything.</p>
        <p>
          In machine learning this is the <strong>metric</strong> or the <strong>objective</strong>. Without one, people change what is in
          front of them and cannot tell whether they helped.
        </p>
      </Prose>
      <Sub id="lessons-held-out">Held-out questions and overfitting</Sub>
      <Prose>
        <p>
          <strong>Overfitting</strong> is getting good at the examples you tuned on rather than at the task. A model that memorises its
          training data scores well on it and badly on anything new.
        </p>
        <p>
          So models are judged on a <strong>held-out test set</strong>: examples never looked at while tuning, used once at the end.
        </p>
        <p>
          Here, honestly, the same 56 questions were used to choose the changes and to report the results. The set is small and the fixture
          library was written by the people tuning. Its numbers flatter.
        </p>
        <p>
          The Pi is a partial check: its library was not written for the test. But its questions are the same ones, so it cannot show
          overfitting to the questions.
        </p>
        <p>
          A proper check would be a second set of questions written by someone else, not looked at during tuning, and run once now. That has
          not been done.
        </p>
      </Prose>
      <Sub id="lessons-ablation">Ablation: take one change out</Sub>
      <Prose>
        <p>When several changes go in together, the only way to know what each did is to remove one and measure again.</p>
        <p>
          That is <strong>ablation</strong>. Meaning was measured at full weight, at half weight and off: 0.826, 0.838 and 0.836. The half
          weight was kept. On the fixture, meaning hardly moves the average.
        </p>
      </Prose>
      <Sub id="lessons-trade-offs">Trade-offs</Sub>
      <Prose>
        <p>Quality, speed and memory pull against each other.</p>
        <ul>
          <li>Scoring 200 items again made search better and slower (p95 32 → 87 ms) until other work paid the time back.</li>
          <li>
            Eight bits saved three quarters of the memory and cost a little accuracy, which exact re-scoring of the closest bought back.
          </li>
          <li>A cross-encoder might have ordered a little better, at seconds per question on a Pi. It was not worth it.</li>
        </ul>
      </Prose>
      <Sub id="lessons-noise">Noise: why +0.003 is not a result</Sub>
      <Prose>
        <p>The nDCG@5 of the set is an average over 56 questions.</p>
        <p>One question moving from 0.80 to 0.97 moves the average by 0.17 ÷ 56 ≈ 0.003.</p>
        <p>
          So a gain of 0.003 can be one question changing its mind about two results. It is not evidence that the change helps in general.
        </p>
        <p>In machine learning this is why results come with several runs, error bars or a significance test.</p>
      </Prose>
      <Sub id="lessons-code">The code wins over the plan</Sub>
      <Prose>
        <p>Plans, notes and even comments drift from what the code does. When they disagree, the code is what runs.</p>
        <p>
          For this page every figure was checked against the code. The notes said results found by meaning alone are capped at 0.6; the code
          also keeps them below every result with all your words. The notes said a fixed similarity cut-off was rejected; for answers, the
          code still keeps one of 0.3.
        </p>
      </Prose>
    </Part>
  );
}

export function SummarySection() {
  return (
    <Part id="summary" title="Before and after, on the Raspberry Pi">
      <ProgressPlate />
      <Figures
        label="The Raspberry Pi before and after tuning"
        head={["Measure", "Before", "After"]}
        numeric={[1, 2]}
        rows={PI_SUMMARY.map((row) => [row.measure, row.before, row.after])}
      />
      <Prose>
        <p>
          Every figure here was measured on the Pi’s real library, reading only, with the evaluation set’s 56 questions. The owner’s
          question “after” is its candidates put in order by the new code, offline.
        </p>
      </Prose>
    </Part>
  );
}
