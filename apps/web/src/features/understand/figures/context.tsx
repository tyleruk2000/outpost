import type { ExplainResponse } from "@outpost/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn, formatNumber, plural } from "@/lib/utils";
import { COLOR } from "../charts/colors";
import { AxisNote, HiddenTable } from "../charts/figure";
import { Tip, TipBody, useTip } from "../charts/tip";
import { CONTEXT_BUDGET } from "../data";
import { formatShare } from "../lib/scale";
import { approxTokens, layoutBudget } from "../lib/text";

type Citation = ExplainResponse["context"]["citations"][number];

const whereOf = (citation: Citation) =>
  [
    citation.title,
    citation.heading && citation.heading !== citation.title ? citation.heading : null,
    citation.page ? `page ${citation.page}` : null,
  ]
    .filter(Boolean)
    .join(", ");

export function budgetReading(trace: ExplainResponse): string {
  const { citations, omitted } = trace.context;
  if (citations.length === 0) return "No passage was found, so there is nothing to hand over.";
  const used = citations.reduce((sum, citation) => sum + citation.quote.length, 0);
  const fit = `${plural(citations.length, "passage")} fitted, using ${formatNumber(used)} of the ${formatNumber(CONTEXT_BUDGET)} characters allowed (${formatShare(used / CONTEXT_BUDGET)}).`;
  const left =
    omitted > 0
      ? ` ${plural(omitted, "passage")} that ranked well enough ${omitted === 1 ? "was" : "were"} left out because ${omitted === 1 ? "it" : "they"} would not fit.`
      : " Nothing had to be left out.";
  return `${fit}${left}`;
}

/** The context budget: each chosen passage a segment sized by its characters, numbered as its citation marker. */
export function BudgetBar({ trace }: { trace: ExplainResponse }) {
  const tip = useTip();
  const { citations, omitted } = trace.context;
  const layout = layoutBudget(
    citations.map((citation) => ({ marker: citation.marker, characters: citation.quote.length })),
    CONTEXT_BUDGET,
  );
  const byMarker = new Map(citations.map((citation) => [citation.marker, citation]));
  const free = Math.max(0, CONTEXT_BUDGET - layout.used);

  return (
    <div ref={tip.boxRef} className="relative">
      <div className="relative pt-5">
        <div className="flex h-7 w-full gap-0.5 rounded-control bg-surface-strong">
          {layout.segments.map((segment) => {
            const citation = byMarker.get(segment.marker)!;
            return (
              <a
                key={segment.marker}
                href={`#source-${segment.marker}`}
                aria-label={`Source ${segment.marker}: ${whereOf(citation)}, ${formatNumber(segment.characters)} characters`}
                className="understand-mark flex h-full min-w-[3px] items-center overflow-hidden rounded-[4px] pl-1.5 text-micro font-semibold"
                style={{ width: `${segment.width * 100}%`, background: COLOR.fused, color: "var(--understand-on-fill)" }}
                {...tip.bind(
                  <TipBody value={`${formatNumber(segment.characters)} characters`} label={`[${segment.marker}] ${whereOf(citation)}`}>
                    About {formatNumber(approxTokens(segment.characters))} tokens, {formatShare(segment.characters / CONTEXT_BUDGET)} of the
                    budget
                  </TipBody>,
                )}
              >
                {/* The marker is printed only where the segment has room for it. */}
                <span className="tabular [container-type:inline-size] w-full">
                  <span className="understand-fit">{segment.marker}</span>
                </span>
              </a>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${layout.budgetAt * 100}%` }} aria-hidden>
          <div className="absolute top-3.5 bottom-[-4px] w-px" style={{ background: COLOR.ink }} />
          <p className="tabular absolute top-[-2px] right-1 text-micro font-medium whitespace-nowrap text-ink">
            Budget: {formatNumber(CONTEXT_BUDGET)} characters
          </p>
        </div>
      </div>
      <AxisNote className="mt-2">
        Each numbered block is one source, as wide as its text is long.{" "}
        {free > 0 ? `The grey remainder is ${formatNumber(free)} characters of unused budget.` : "The budget is full."}
        {omitted > 0 ? ` ${plural(omitted, "passage")} did not fit.` : ""}
      </AxisNote>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption={`Sources in the context, against a budget of ${CONTEXT_BUDGET} characters`}
        columns={["Marker", "Source", "Characters", "About how many tokens"]}
        rows={citations.map((citation) => [citation.marker, whereOf(citation), citation.quote.length, approxTokens(citation.quote.length)])}
      />
    </div>
  );
}

/** The assembled context as it is: numbered sources with their exact text, each linked to its place in the library. */
export function Sources({ trace }: { trace: ExplainResponse }) {
  const { citations } = trace.context;
  const [full, setFull] = useState(false);
  if (citations.length === 0)
    return (
      <p className="text-small text-ink-muted">
        Neither search found a passage, so the context is empty. A model given nothing should say it has nothing to go on.
      </p>
    );
  return (
    <div>
      <ol className="divide-y divide-border border-y border-border">
        {citations.map((citation) => (
          <li
            key={citation.marker}
            id={`source-${citation.marker}`}
            className="grid scroll-mt-28 grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 py-4"
          >
            <span className="tabular font-mono text-small font-semibold text-ink" aria-hidden>
              [{citation.marker}]
            </span>
            <div className="min-w-0">
              <p className="text-small">
                <Link
                  to={citation.url}
                  aria-label={`Source ${citation.marker}: ${whereOf(citation)}`}
                  className="font-medium text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline"
                >
                  {whereOf(citation)}
                </Link>
                <span className="tabular text-ink-muted"> · {formatNumber(citation.quote.length)} characters</span>
              </p>
              <blockquote
                className={cn(
                  "mt-1.5 max-w-[74ch] font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink",
                  !full && "line-clamp-4",
                )}
              >
                {citation.quote}
              </blockquote>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="ghost" size="sm" className="mt-2 -ml-2.5" aria-expanded={full} onClick={() => setFull((value) => !value)}>
        {full ? "Show the start of each source" : "Show every source in full"}
      </Button>
    </div>
  );
}
