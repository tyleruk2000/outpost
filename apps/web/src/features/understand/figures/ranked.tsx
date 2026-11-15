import type { SearchSegment } from "@outpost/shared";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Highlighted } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { AxisNote, HiddenTable } from "../charts/figure";
import { Tip, TipBody, useTip } from "../charts/tip";

export interface RankedRow {
  chunkId: number;
  rank: number;
  title: string;
  where: string;
  url: string;
  segments: SearchSegment[];
  value: number;
  /** The value as shown at the end of the bar. */
  valueText: string;
  length: number;
  detail?: ReactNode;
}

/**
 * A ranked list of passages as horizontal bars: one bar per passage, longest first,
 * with the passage's own words under it. Used for both searches, in each one's colour.
 */
export function RankedBars({
  rows,
  max,
  color,
  measure,
  axis,
  caption,
  initial = 6,
}: {
  rows: RankedRow[];
  /** The value a full-width bar stands for. */
  max: number;
  color: string;
  /** Name of the measure, for tooltips and the table: "BM25 score", "Cosine similarity". */
  measure: string;
  axis: ReactNode;
  caption: string;
  initial?: number;
}) {
  const tip = useTip();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, initial);

  return (
    <div ref={tip.boxRef} className="relative">
      <AxisNote className="mb-2">{axis}</AxisNote>
      <ol className="divide-y divide-border border-y border-border">
        {shown.map((row) => (
          <li key={row.chunkId} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 py-3">
            <span className="tabular pt-px text-small text-ink-muted" aria-hidden>
              {row.rank}
            </span>
            <div className="min-w-0">
              <p className="text-small">
                <Link
                  to={row.url}
                  className="font-medium text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline"
                >
                  {row.title}
                </Link>
                {row.where ? <span className="text-ink-muted"> · {row.where}</span> : null}
              </p>
              <div className="mt-1.5 flex items-center gap-2.5">
                <div className="h-2.5 min-w-0 flex-1">
                  <div
                    role="img"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: the bar is focusable so its value can be read from the keyboard
                    tabIndex={0}
                    aria-label={`Rank ${row.rank}: ${row.title}${row.where ? `, ${row.where}` : ""}. ${measure} ${row.valueText}.`}
                    className="understand-mark h-full min-w-[3px] rounded-r-[4px]"
                    style={{ width: `${Math.max(0, Math.min(100, (row.value / max) * 100))}%`, background: color }}
                    {...tip.bind(
                      <TipBody value={row.valueText} label={`${measure}, rank ${row.rank}`}>
                        {row.title}
                        {row.where ? `, ${row.where}` : ""} · {formatNumber(row.length)} characters
                      </TipBody>,
                    )}
                  />
                </div>
                <span className="tabular w-12 shrink-0 text-right text-small text-ink">{row.valueText}</span>
              </div>
              <p className="mt-1.5 line-clamp-3 max-w-[78ch] text-small leading-relaxed text-ink-muted">
                <Highlighted segments={row.segments} />
              </p>
              {row.detail ? <div className="mt-1.5">{row.detail}</div> : null}
            </div>
          </li>
        ))}
      </ol>
      {rows.length > initial ? (
        <Button variant="ghost" size="sm" className="mt-2 -ml-2.5" aria-expanded={all} onClick={() => setAll((value) => !value)}>
          {all ? `Show only the first ${initial}` : `Show all ${rows.length}`}
        </Button>
      ) : null}
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption={caption}
        columns={["Rank", "Passage", measure, "Characters"]}
        rows={rows.map((row) => [row.rank, `${row.title}${row.where ? `, ${row.where}` : ""}`, row.valueText, row.length])}
      />
    </div>
  );
}
