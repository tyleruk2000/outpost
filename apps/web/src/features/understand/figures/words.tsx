import type { ExplainKeywordHit, ExplainResponse } from "@outpost/shared";
import { Fragment } from "react";
import { kindMeta } from "@/components/search-hit";
import { formatNumber, plural } from "@/lib/utils";
import { COLOR, passageWhere } from "../charts/colors";
import { AxisNote, HiddenTable, Legend } from "../charts/figure";
import { LinePlot } from "../charts/line-plot";
import { Tip, TipBody, useTip } from "../charts/tip";
import { BM25_B, BM25_K1, inverseDocumentFrequency, saturationCurve, termFrequencyCeiling } from "../lib/bm25";
import { clamp, formatShare, formatValue, niceMax } from "../lib/scale";
import { RankedBars } from "./ranked";

/** The question broken into the words the index is asked for, and the expression actually sent. */
export function QueryWords({ trace }: { trace: ExplainResponse }) {
  const { words, excluded, prefixLast, expression, relaxed } = trace.parse;
  const joiner = relaxed ? "OR" : "AND";
  const chip = "inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-page px-3 py-1 text-small text-ink";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {words.map((word, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the same word may be typed twice; order is the identity
          <Fragment key={index}>
            {index > 0 ? <span className="font-mono text-micro text-ink-muted">{joiner}</span> : null}
            <span className={chip} style={{ borderColor: COLOR.keyword }}>
              {word}
              {prefixLast && index === words.length - 1 ? (
                <span className="font-mono text-ink-muted" title="Matches any word that starts this way">
                  *
                </span>
              ) : null}
            </span>
          </Fragment>
        ))}
        {excluded.map((word, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: order is the identity
          <Fragment key={`not-${index}`}>
            <span className="font-mono text-micro text-ink-muted">NOT</span>
            <span className={`${chip} border-dashed border-border-strong line-through decoration-ink-muted`}>{word}</span>
          </Fragment>
        ))}
        {words.length === 0 ? <span className="text-small text-ink-muted">No searchable words were found in the question.</span> : null}
      </div>
      <dl className="mt-4 grid gap-x-4 gap-y-1 text-small sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">Sent to the index</dt>
        <dd className="font-mono text-[0.8125rem] break-words text-ink">{expression ?? "nothing: there were no words to look for"}</dd>
      </dl>
      <ul className="mt-3 grid max-w-[68ch] gap-1 text-small text-ink-muted">
        {prefixLast && words.length > 0 ? (
          <li>
            The star after “{words[words.length - 1]}” means “any word starting with these letters”. The last word of a question is treated
            this way in case it is still being typed.
          </li>
        ) : null}
        {excluded.length > 0 ? <li>A word typed with a minus sign in front is left out: passages containing it are dropped.</li> : null}
        {relaxed ? (
          <li>
            <span className="font-medium text-ink">The search was relaxed.</span> No single passage contained every word, so the index was
            asked again for passages containing any of them. That is why the words are joined by OR, not AND.
          </li>
        ) : words.length > 1 ? (
          <li>AND means a passage must contain every word to be found at all.</li>
        ) : null}
      </ul>
    </div>
  );
}

/** A weight as text. The index's floor for a very common word is shown as what it means, not as 0.000001. */
function weightText(idf: number): string {
  return idf < 0.001 ? "almost 0" : formatValue(idf);
}

export function rarityReading(trace: ExplainResponse): string {
  const terms = trace.parse.terms;
  if (terms.length === 0) return "There are no words to count.";
  const rarest = terms.reduce((best, term) => (term.idf > best.idf ? term : best), terms[0]!);
  const commonest = terms.reduce((best, term) => (term.idf < best.idf ? term : best), terms[0]!);
  const total = trace.parse.totalChunks;
  if (terms.length === 1 || rarest.term === commonest.term)
    return `“${rarest.term}” appears in ${formatNumber(rarest.chunksContaining)} of ${plural(total, "passage")}, which gives it a weight of ${formatValue(rarest.idf)}.`;
  // A word in more than half of everything is given almost no weight; a ratio against that would be a silly number.
  if (commonest.idf < 0.001)
    return `“${rarest.term}” is the rarest word here (${formatNumber(rarest.chunksContaining)} of ${plural(total, "passage")}), with a weight of ${formatValue(rarest.idf)}. “${commonest.term}” is in more than half of everything (${formatNumber(commonest.chunksContaining)} passages), so a match on it counts for almost nothing.`;
  return `“${rarest.term}” is the rarest word here (${formatNumber(rarest.chunksContaining)} of ${plural(total, "passage")}), so a match on it counts ${formatValue(rarest.idf / Math.max(commonest.idf, 1e-9), 2)} times as much as a match on “${commonest.term}” (${formatNumber(commonest.chunksContaining)} passages).`;
}

/** For each word: how many passages contain it, and the weight (IDF) that follows from that. */
export function RarityChart({ trace }: { trace: ExplainResponse }) {
  const tip = useTip();
  const { totalChunks } = trace.parse;
  // A word typed twice is counted once.
  const terms = trace.parse.terms.filter((term, index, all) => all.findIndex((other) => other.term === term.term) === index);
  const ceiling = inverseDocumentFrequency(totalChunks, 0);
  const track = "h-2.5 min-w-0 flex-1";
  if (terms.length === 0) return <p className="text-small text-ink-muted">The question has no words to count.</p>;
  return (
    <div ref={tip.boxRef} className="relative">
      <Legend
        className="mb-3"
        items={[
          { label: "Share of passages containing the word", color: COLOR.other },
          { label: "The weight a match earns (inverse document frequency)", color: COLOR.keyword },
        ]}
      />
      <ul className="divide-y divide-border border-y border-border">
        {terms.map((term, index) => {
          const share = totalChunks > 0 ? term.chunksContaining / totalChunks : 0;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same word may be typed twice
            <li key={index} className="grid gap-x-6 gap-y-1.5 py-3 sm:grid-cols-[minmax(6rem,10rem)_1fr_1fr] sm:items-center">
              <p className="truncate text-small font-medium text-ink">{term.term}</p>
              <div className="flex items-center gap-2.5">
                <div className={track}>
                  <div
                    role="img"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so its value can be read from the keyboard
                    tabIndex={0}
                    aria-label={`${term.term}: in ${formatNumber(term.chunksContaining)} of ${formatNumber(totalChunks)} passages`}
                    className="understand-mark h-full min-w-[3px] rounded-r-[4px]"
                    style={{ width: `${clamp(share * 100, 0, 100)}%`, background: COLOR.other }}
                    {...tip.bind(
                      <TipBody
                        value={`${formatNumber(term.chunksContaining)} of ${formatNumber(totalChunks)} passages`}
                        label={`contain “${term.term}”`}
                      >
                        {formatShare(share)} of the index
                      </TipBody>,
                    )}
                  />
                </div>
                <span className="tabular w-28 shrink-0 text-small text-ink">
                  {formatNumber(term.chunksContaining)} of {formatNumber(totalChunks)}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className={track}>
                  <div
                    role="img"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so its value can be read from the keyboard
                    tabIndex={0}
                    aria-label={`${term.term}: weight ${weightText(term.idf)}`}
                    className="understand-mark h-full min-w-[3px] rounded-r-[4px]"
                    style={{ width: `${clamp((term.idf / ceiling) * 100, 0, 100)}%`, background: COLOR.keyword }}
                    {...tip.bind(
                      <TipBody value={weightText(term.idf)} label={`weight of “${term.term}”`}>
                        ln(({formatNumber(totalChunks)} − {formatNumber(term.chunksContaining)} + 0.5) ÷ (
                        {formatNumber(term.chunksContaining)} + 0.5) + 1)
                      </TipBody>,
                    )}
                  />
                </div>
                <span className="tabular w-28 shrink-0 text-small text-ink">weight {weightText(term.idf)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <AxisNote className="mt-2">
        The first bar of each pair runs from none to all {formatNumber(totalChunks)} passages. The second runs from 0 to{" "}
        {formatValue(ceiling)}, the weight a word would have if no passage contained it.
      </AxisNote>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption="How common each word of the question is"
        columns={["Word", "Passages containing it", "Passages in the index", "Weight (inverse document frequency)"]}
        rows={terms.map((term) => [term.term, term.chunksContaining, totalChunks, weightText(term.idf)])}
      />
    </div>
  );
}

const MAX_COUNT = 10;

/**
 * BM25's diminishing returns, drawn from its formula. This is the general shape, with
 * the usual constants; it is not measured from the reader's library.
 */
export function SaturationCurve() {
  const ceiling = termFrequencyCeiling();
  return (
    <>
      <LinePlot
        ariaLabel="How a word's contribution grows with the number of times it appears, then levels off."
        caption={`BM25 term-frequency part with k1 = ${BM25_K1} and b = ${BM25_B}`}
        xColumn="Times the word appears"
        series={[
          {
            id: "average",
            label: "A passage of average length",
            endLabel: "Average length",
            color: COLOR.keyword,
            values: saturationCurve(MAX_COUNT, 1).map((point) => point.value),
          },
          {
            id: "long",
            label: "A passage twice as long",
            endLabel: "Twice as long",
            color: COLOR.other,
            values: saturationCurve(MAX_COUNT, 2).map((point) => point.value),
          },
        ]}
        xTicks={Array.from({ length: MAX_COUNT + 1 }, (_, count) => count)}
        yTicks={[0, 0.5, 1, 1.5, 2, 2.5]}
        formatY={(value) => formatValue(value)}
        describeX={(count) => (count === 1 ? "The word appears once" : `The word appears ${count} times`)}
        reference={{ value: ceiling, label: `Ceiling: ${formatValue(ceiling)}, never reached` }}
      />
      <AxisNote className="mt-1">
        Across: times the word appears in the passage. Up: what it adds to the score, as a multiple of the word’s weight.
      </AxisNote>
    </>
  );
}

const FIELDS: Array<{ id: keyof ExplainKeywordHit["fields"]; label: string; weight: number }> = [
  { id: "title", label: "title", weight: 8 },
  { id: "tags", label: "tags", weight: 4 },
  { id: "heading", label: "heading", weight: 3 },
  { id: "text", label: "text", weight: 1 },
];

/** Which fields of a passage the words were found in. A filled mark means found; the number is how many mentions one word there is counted as. */
function FieldMarks({ fields }: { fields: ExplainKeywordHit["fields"] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-micro" aria-label="Where the words were found">
      {FIELDS.map((field) => {
        const found = fields[field.id];
        return (
          <li
            key={field.id}
            className={found ? "flex items-center gap-1.5 font-medium text-ink" : "flex items-center gap-1.5 text-ink-muted"}
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px] border"
              style={{ borderColor: found ? COLOR.keyword : COLOR.borderStrong, background: found ? COLOR.keyword : "transparent" }}
            />
            {field.label} ×{field.weight}
            <span className="sr-only">{found ? ": found here" : ": not found here"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function keywordReading(trace: ExplainResponse): string {
  const hits = trace.keyword.hits;
  const first = hits[0];
  if (!first) return "No passage contained the words of this question.";
  const last = hits[hits.length - 1]!;
  const inTitle = hits.filter((hit) => hit.fields.title).length;
  const lead = `The best match scores ${formatValue(first.score)}; the last one shown, ${formatValue(last.score)}.`;
  const title =
    inTitle > 0
      ? ` ${inTitle === hits.length ? "Every passage here comes" : `${inTitle} of the ${hits.length} come`} from a document whose title contains one of the words, and each word in a title is counted as eight mentions.`
      : "";
  return `${lead}${title}`;
}

/** The keyword results as ranked bars of BM25 score. */
export function KeywordResults({ trace }: { trace: ExplainResponse }) {
  const hits = trace.keyword.hits;
  const max = niceMax(Math.max(...hits.map((hit) => hit.score), 0.0001), 4);
  return (
    <RankedBars
      color={COLOR.keyword}
      measure="BM25 score"
      max={max}
      caption="Keyword results in rank order"
      axis={
        <>
          Bar length is the BM25 score, from 0 to {formatValue(max)}. Scores have no fixed top: they only mean something compared with each
          other, for this question.
        </>
      }
      rows={hits.map((hit) => ({
        chunkId: hit.chunkId,
        rank: hit.rank,
        title: hit.title,
        where: [hit.kind !== "document" ? (kindMeta[hit.kind]?.label ?? hit.kind) : null, passageWhere(hit)].filter(Boolean).join(", "),
        url: hit.url,
        segments: hit.segments,
        value: hit.score,
        valueText: formatValue(hit.score),
        length: hit.length,
        detail: <FieldMarks fields={hit.fields} />,
      }))}
    />
  );
}
