/**
 * Played against keyed: two tracks of marks on one time axis, so a short dah or a
 * crowded letter gap shows as a visible mismatch. The tracks keep two categorical chart
 * colours (played --chart-1, keyed --chart-2), a legend and a label beside each, and the
 * same numbers are in the tables underneath. Pointing at a track, or focusing the chart
 * and using the arrow keys, reads out one element of each.
 */
import type { KeyingAnalysis, TimelineSpan, TimelineTracks } from "@outpost/shared";
import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import { ScrollBox } from "@/features/radio/scroll-box";
import { cn, formatNumber, plural } from "@/lib/utils";

const PLAYED = "var(--chart-1)";
const KEYED = "var(--chart-2)";

const units = (n: number | null): string => (n === null ? "–" : `${n.toFixed(1)} dits`);
const ms = (n: number | null): string => (n === null ? "–" : `${formatNumber(n)} ms`);
const element = (e: "dit" | "dah" | null): string => e ?? "–";

/** Round tick steps for the time axis, about four of them across. */
function ticksFor(totalMs: number): number[] {
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  const step = steps.find((s) => totalMs / s <= 5) ?? 20000;
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs; t += step) ticks.push(t);
  return ticks;
}

/** The mark of `spans` nearest `atMs`, as its index. */
function nearest(spans: readonly TimelineSpan[], atMs: number): number | null {
  let best: number | null = null;
  let distance = Number.POSITIVE_INFINITY;
  spans.forEach((span, index) => {
    const d = atMs < span.start ? span.start - atMs : atMs > span.end ? atMs - span.end : 0;
    if (d < distance) {
      distance = d;
      best = index;
    }
  });
  return best;
}

function Track({
  label,
  spans,
  totalMs,
  colour,
  active,
  onPoint,
}: {
  label: string;
  spans: readonly TimelineSpan[];
  totalMs: number;
  colour: string;
  active: number | null;
  onPoint: (index: number | null) => void;
}) {
  const width = Math.max(1, totalMs);
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    onPoint(nearest(spans, ((event.clientX - box.left) / box.width) * width));
  };
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-small text-ink">{label}</span>
      <svg
        viewBox={`0 0 ${width} 10`}
        preserveAspectRatio="none"
        className="h-6 w-full rounded-control bg-surface-strong"
        aria-hidden
        onPointerMove={point}
        onPointerDown={point}
      >
        {spans.map((span, index) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: marks are in time order and never move
            key={index}
            x={span.start}
            y={active === index ? 0.5 : 1.5}
            width={Math.max(1, span.end - span.start)}
            height={active === index ? 9 : 7}
            style={{ fill: colour, opacity: active === null || active === index ? 1 : 0.55 }}
          />
        ))}
      </svg>
    </div>
  );
}

export function EchoTimeline({ tracks, analysis }: { tracks: TimelineTracks; analysis: KeyingAnalysis }) {
  const [active, setActive] = useState<number | null>(null);
  const readoutId = useId();
  const total = Math.max(1, tracks.totalMs);
  const ticks = ticksFor(tracks.totalMs);
  const summary = `Played ${plural(tracks.played.length, "mark")} over ${formatNumber(Math.round(tracks.totalMs))} ms; you keyed ${plural(tracks.keyed.length, "mark")}.`;
  const rows = tracks.rows;
  const row = active === null ? null : rows[active];

  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (rows.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current === null ? 0 : Math.min(rows.length - 1, current + 1)));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current === null ? 0 : Math.max(0, current - 1)));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(rows.length - 1);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  return (
    <div className="grid gap-4">
      <figure className="grid gap-2">
        <figcaption className="text-small font-medium text-ink">What was played against what you keyed</figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-[2px]" style={{ background: PLAYED }} />
            Played
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-[2px]" style={{ background: KEYED }} />
            You keyed
          </li>
        </ul>
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is read with the arrow keys, like the propagation charts
          tabIndex={0}
          aria-label={`Timeline: ${summary} Use the arrow keys to step through the elements.`}
          aria-describedby={readoutId}
          onKeyDown={onKey}
          onPointerLeave={() => setActive(null)}
          className="grid gap-1.5 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
        >
          <Track label="Played" spans={tracks.played} totalMs={tracks.totalMs} colour={PLAYED} active={active} onPoint={setActive} />
          <Track label="You keyed" spans={tracks.keyed} totalMs={tracks.totalMs} colour={KEYED} active={active} onPoint={setActive} />
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2" aria-hidden>
            <span />
            <div className="relative h-4 border-t" style={{ borderColor: "var(--chart-axis)" }}>
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className={cn(
                    "tabular absolute top-0.5 text-micro whitespace-nowrap",
                    tick === 0 ? "" : "-translate-x-1/2",
                    tick / total > 0.9 && "hidden",
                  )}
                  style={{ left: `${(tick / total) * 100}%`, color: "var(--chart-axis)" }}
                >
                  {tick === 0 ? "0 ms" : formatNumber(tick)}
                </span>
              ))}
            </div>
          </div>
        </section>
        <p id={readoutId} className="tabular min-h-[1.3125rem] text-small text-ink-muted" aria-live="polite">
          {row
            ? `Element ${row.index}: played ${element(row.playedElement)}${row.playedMs !== null ? ` ${ms(row.playedMs)}` : ""}, you keyed ${element(row.keyedElement)}${row.keyedMs !== null ? ` ${ms(row.keyedMs)}` : ""}.`
            : `Each track starts at its own first mark; both share one time scale. ${summary}`}
        </p>
      </figure>

      <ScrollBox label="Your timing against standard proportions" className="overflow-x-auto">
        <table className="tabular w-full text-left text-small">
          <caption className="mb-1 text-left font-medium text-ink">Your timing against standard proportions</caption>
          <thead className="text-ink-muted">
            <tr className="border-b border-border-strong">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Measure
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Aim for
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                You keyed
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {analysis.metrics.map((metric) => (
              <tr key={metric.id} className="border-b border-border">
                <th scope="row" className="py-1.5 pr-3 font-normal text-ink">
                  {metric.label}
                </th>
                <td className="py-1.5 pr-3 text-ink">{units(metric.expectedUnits)}</td>
                <td className="py-1.5 pr-3 text-ink">
                  {units(metric.keyedUnits)}
                  {metric.count > 0 ? <span className="text-ink-muted"> ({metric.count})</span> : null}
                </td>
                <td className={cn("py-1.5 text-ink", metric.score !== null && metric.score < 0.85 && "font-semibold")}>
                  {metric.score === null
                    ? metric.id === "ratio" && metric.keyedUnits !== null
                      ? "set by the keyer"
                      : "–"
                    : `${Math.round(metric.score * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>

      <details className="text-small">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-primary md:min-h-0">Element by element</summary>
        <ScrollBox label="Each element played and keyed" className="mt-2 overflow-x-auto">
          <table className="tabular w-full min-w-[24rem] text-left">
            <caption className="sr-only">Each element played and keyed, with the gap after it</caption>
            <thead className="text-ink-muted">
              <tr className="border-b border-border-strong">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Element
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Played
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Gap after
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  You keyed
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Your gap
                </th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {rows.map((r) => (
                <tr key={r.index} className={cn("border-b border-border", active !== null && rows[active] === r && "bg-surface-strong")}>
                  <td className="py-1.5 pr-3">{r.index}</td>
                  <td className="py-1.5 pr-3">
                    {element(r.playedElement)} {r.playedMs !== null ? ms(r.playedMs) : null}
                  </td>
                  <td className="py-1.5 pr-3">{ms(r.playedGapMs)}</td>
                  <td className="py-1.5 pr-3">
                    {element(r.keyedElement)} {r.keyedMs !== null ? ms(r.keyedMs) : null}
                  </td>
                  <td className="py-1.5">{ms(r.keyedGapMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      </details>
    </div>
  );
}
