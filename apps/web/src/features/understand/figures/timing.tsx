import type { ExplainResponse } from "@outpost/shared";
import { COLOR } from "../charts/colors";
import { HiddenTable } from "../charts/figure";
import { Tip, TipBody, useTip } from "../charts/tip";
import { formatMs, formatShare } from "../lib/scale";

export interface TimingPart {
  id: string;
  label: string;
  ms: number;
  color: string;
}

/** The stages of one trace as parts of its total time. What the stages do not account for is shown as "everything else". */
export function timingParts(timings: ExplainResponse["timings"]): TimingPart[] {
  const staged = timings.keywordMs + timings.semanticMs + timings.fusionMs + timings.contextMs;
  return [
    { id: "keyword", label: "Keyword search", ms: timings.keywordMs, color: COLOR.keyword },
    { id: "meaning", label: "Search by meaning", ms: timings.semanticMs, color: COLOR.meaning },
    { id: "fusion", label: "Fusion", ms: timings.fusionMs, color: COLOR.fused },
    { id: "context", label: "Building the context", ms: timings.contextMs, color: COLOR.other },
    {
      id: "rest",
      label: "Everything else (reading the question, counting words)",
      ms: Math.max(0, Math.round((timings.totalMs - staged) * 10) / 10),
      color: COLOR.borderStrong,
    },
  ];
}

export function timingReading(trace: ExplainResponse): string {
  const parts = timingParts(trace.timings);
  const total = parts.reduce((sum, part) => sum + part.ms, 0);
  const longest = parts.reduce((best, part) => (part.ms > best.ms ? part : best), parts[0]!);
  if (total <= 0) return "The whole trace took too little time to measure.";
  return `The whole trace took ${formatMs(trace.timings.totalMs)}. ${longest.label.split(" (")[0]} took the largest share, ${formatShare(longest.ms / total)}.`;
}

export function TimingBar({ trace }: { trace: ExplainResponse }) {
  const tip = useTip();
  const parts = timingParts(trace.timings);
  const total = parts.reduce((sum, part) => sum + part.ms, 0);
  const drawn = parts.filter((part) => part.ms > 0);

  return (
    <div ref={tip.boxRef} className="relative">
      {/* biome-ignore lint/a11y/useSemanticElements: a group of focusable bar segments, not a form */}
      <div role="group" aria-label="Time spent in each stage" className="flex h-3 w-full gap-0.5">
        {drawn.map((part) => (
          <div
            key={part.id}
            role="img"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: each segment is focusable so its value can be read from the keyboard
            tabIndex={0}
            aria-label={`${part.label}: ${formatMs(part.ms)}, ${formatShare(part.ms / total)} of the total`}
            className="understand-mark h-full min-w-[3px] first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: part.ms, flexBasis: 0, background: part.color }}
            {...tip.bind(
              <TipBody value={formatMs(part.ms)} label={part.label}>
                {formatShare(part.ms / total)} of the total
              </TipBody>,
            )}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1 text-small text-ink-muted sm:grid-cols-2">
        {parts.map((part) => (
          <li key={part.id} className="flex items-baseline gap-2">
            <span aria-hidden className="size-2.5 shrink-0 translate-y-px rounded-[2px]" style={{ background: part.color }} />
            <span className="min-w-0 flex-1">{part.label}</span>
            <span className="tabular shrink-0 text-ink">{formatMs(part.ms)}</span>
          </li>
        ))}
      </ul>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption="Time spent in each stage of the trace"
        columns={["Stage", "Time", "Share of total"]}
        rows={parts.map((part) => [part.label, formatMs(part.ms), total > 0 ? formatShare(part.ms / total) : "0%"])}
      />
    </div>
  );
}
