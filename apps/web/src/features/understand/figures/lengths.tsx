import type { ExplainOverview } from "@outpost/shared";
import { formatNumber, plural } from "@/lib/utils";
import { COLOR } from "../charts/colors";
import { AxisNote, HiddenTable, useMeasure } from "../charts/figure";
import { Tip, TipBody, useTip } from "../charts/tip";
import { formatShare, linear, niceTicks } from "../lib/scale";
import { readLengths } from "../lib/text";

export function lengthsReading(overview: ExplainOverview): string {
  const target = overview.settings.chunkSize;
  const read = readLengths(overview.chunkLengths, target);
  if (read.total === 0 || !read.peak) return "There are no passages yet.";
  const parts = [
    `The most common length is ${formatNumber(read.peak.from)} to ${formatNumber(read.peak.to)} characters (${plural(read.peak.count, "passage")}).`,
    `${formatShare(read.short / read.total)} are well under the target of ${formatNumber(target)}: the ends of sections, short pages, and one-line entries.`,
  ];
  if (read.over > 0)
    parts.push(
      `${plural(read.over, "passage")} ${read.over === 1 ? "is" : "are"} over the target, because a cut is only made at the end of a word.`,
    );
  return parts.join(" ");
}

const HEIGHT = 200;
const MARGIN = { top: 26, right: 22, bottom: 30, left: 40 };

/** How long passages are: a column for each band of lengths, with the configured size marked. */
export function LengthHistogram({ overview }: { overview: ExplainOverview }) {
  const [ref, width] = useMeasure<HTMLDivElement>(720);
  const tip = useTip();
  const buckets = overview.chunkLengths;
  const target = overview.settings.chunkSize;
  const step = buckets[0] ? buckets[0].to - buckets[0].from : 100;
  const last = Math.max(target, ...buckets.map((bucket) => bucket.to));
  const top = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const yTicks = niceTicks(0, top, 3);
  const x = linear([0, last], [MARGIN.left, width - MARGIN.right]);
  const y = linear([0, yTicks[yTicks.length - 1] ?? top], [HEIGHT - MARGIN.bottom, MARGIN.top]);
  const band = x(step) - x(0);
  const bar = Math.max(2, Math.min(24, band - 2));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  // Label as many band edges as fit without touching.
  const every = Math.max(1, Math.ceil(46 / Math.max(1, band)));
  const edges = Array.from({ length: Math.round(last / step) + 1 }, (_, index) => index * step).filter((_, index) => index % every === 0);
  const targetX = x(target);
  const labelLeft = targetX > width * 0.5;

  return (
    <div ref={tip.boxRef} className="relative">
      <div ref={ref}>
        <svg width={width} height={HEIGHT} aria-label="Passage lengths. A column for each band of lengths." className="block max-w-full">
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? COLOR.axis : COLOR.grid}
                strokeWidth={1}
              />
              <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" className="tabular fill-ink-muted text-[0.6875rem]">
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {edges.map((edge) => (
            <text
              key={edge}
              x={x(edge)}
              y={HEIGHT - MARGIN.bottom + 16}
              textAnchor="middle"
              className="tabular fill-ink-muted text-[0.6875rem]"
            >
              {formatNumber(edge)}
            </text>
          ))}
          {buckets.map((bucket) => {
            const centre = x(bucket.from + step / 2);
            const topY = y(bucket.count);
            const height = Math.max(1, y(0) - topY);
            const radius = Math.min(4, bar / 2, height);
            const left = centre - bar / 2;
            // Rounded at the data end only; square on the baseline.
            const shape = `M${left},${y(0)} V${topY + radius} Q${left},${topY} ${left + radius},${topY} H${left + bar - radius} Q${left + bar},${topY} ${left + bar},${topY + radius} V${y(0)} Z`;
            const label = `${formatNumber(bucket.from)} to ${formatNumber(bucket.to)} characters`;
            return (
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: each column is focusable so its value can be read from the keyboard
              <g
                key={bucket.from}
                role="img"
                tabIndex={0}
                aria-label={`${label}: ${plural(bucket.count, "passage")}`}
                className="understand-mark"
                {...tip.bind(
                  <TipBody value={plural(bucket.count, "passage")} label={label}>
                    {formatShare(bucket.count / Math.max(1, total))} of all passages
                  </TipBody>,
                )}
              >
                <rect x={centre - band / 2} y={MARGIN.top} width={band} height={HEIGHT - MARGIN.top - MARGIN.bottom} fill="transparent" />
                <path d={shape} fill={COLOR.axis} />
              </g>
            );
          })}
          <line x1={targetX} x2={targetX} y1={MARGIN.top - 6} y2={y(0)} stroke={COLOR.ink} strokeWidth={1} />
          <text
            x={labelLeft ? targetX - 6 : targetX + 6}
            y={MARGIN.top - 12}
            textAnchor={labelLeft ? "end" : "start"}
            className="tabular fill-ink text-[0.75rem] font-medium"
          >
            Target size: {formatNumber(target)} characters
          </text>
        </svg>
      </div>
      <div className="flex justify-between gap-4" style={{ paddingLeft: MARGIN.left }}>
        <AxisNote>Length of passage, in characters. Height is the number of passages.</AxisNote>
      </div>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption="Passages by length"
        columns={["Length in characters", "Passages"]}
        rows={buckets.map((bucket) => [`${bucket.from} to ${bucket.to}`, bucket.count])}
      />
    </div>
  );
}
