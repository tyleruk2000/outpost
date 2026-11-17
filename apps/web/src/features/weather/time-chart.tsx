/**
 * One quantity over time, as a line: a forecast's temperature through the next days, a
 * barometer's pressure through the last days, a river's level. A range may be drawn
 * behind it as a quiet band, and a level marked across it as a dashed line, each named. Drawn by hand in SVG like every chart in
 * Outpost (docs/development/web-screens.md, "Charts"): thin marks, chart tokens only,
 * a crosshair that answers the pointer and the arrow keys, and the same numbers as a
 * table for a screen reader.
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { roundTicks } from "@/features/propagation/charts";
import { formatTimeOfDay } from "@/lib/clock";

const AXIS_TEXT = "tabular fill-ink-muted text-[11px]";
const DAY = 86_400_000;

function useWidth(fallback = 640): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export interface TimePoint {
  t: number;
  value: number;
}

const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" });

/** "Tue 17, 14:00": a moment on the axis and in the readout, in the device's own time. */
export const momentText = (t: number): string => `${dayLabel.format(t)}, ${formatTimeOfDay(t)}`;

export function TimeLine({
  points,
  name,
  format,
  color = "var(--chart-1)",
  marks = false,
  height = 170,
  now,
  band,
  rules = [],
  minSpan = 1,
}: {
  points: TimePoint[];
  /** Accessible name and table caption: what the line is. */
  name: string;
  format: (value: number) => string;
  color?: string;
  /** Draw a point at each value (readings), not only the line (a forecast's hours). */
  marks?: boolean;
  height?: number;
  /** Drawn as a line marked "now" when it falls inside the chart. */
  now?: number;
  /** A range drawn behind the line as a quiet band (a river's typical range). */
  band?: { low: number; high: number } | null;
  /** Levels marked across the chart as dashed lines, each labelled (the highest on record). */
  rules?: Array<{ value: number; label: string }>;
  /** The smallest span of the value axis, so that small changes are not drawn as large ones. */
  minSpan?: number;
}) {
  const [ref, width] = useWidth();
  const [chosen, setChosen] = useState<number | null>(null);
  const tableId = useId();
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const first = sorted[0]!.t;
  const last = Math.max(sorted[sorted.length - 1]!.t, first + 3_600_000);
  const values = [...sorted.map((point) => point.value), ...(band ? [band.low, band.high] : []), ...rules.map((rule) => rule.value)];
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < minSpan) {
    const pad = (minSpan - (high - low)) / 2;
    low -= pad;
    high += pad;
  }
  const ticks = roundTicks(low, high);
  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : 1;
  low = Math.floor(low / step) * step;
  high = Math.ceil(high / step) * step;
  const shownTicks = ticks.filter((tick) => tick >= low && tick <= high);
  const left = Math.max(36, Math.round(Math.max(...shownTicks.map((tick) => format(tick).length)) * 6.5) + 12);
  const right = 12;
  const top = 10;
  const bottom = 22;
  const x = (t: number) => left + ((t - first) / (last - first)) * (width - left - right);
  const y = (value: number) => top + (1 - (value - low) / (high - low)) * (height - top - bottom);
  const d = sorted.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`).join("");
  // Midnights inside the span, labelled with the day; fewer on a narrow chart.
  const midnights: number[] = [];
  const startDay = new Date(first);
  startDay.setHours(24, 0, 0, 0);
  for (let t = startDay.getTime(); t < last; t += DAY) midnights.push(t);
  const every = Math.max(1, Math.ceil((midnights.length * 44) / Math.max(1, width - left - right)));

  const index = chosen ?? sorted.length - 1;
  const shown = sorted[Math.min(index, sorted.length - 1)]!;
  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const t = first + ((event.clientX - box.left - left) / (width - left - right)) * (last - first);
    let best = 0;
    sorted.forEach((point, candidate) => {
      if (Math.abs(point.t - t) < Math.abs(sorted[best]!.t - t)) best = candidate;
    });
    return best;
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setChosen(Math.min(sorted.length - 1, Math.max(0, index + (event.key === "ArrowLeft" ? -1 : 1))));
    }
  };

  return (
    <div>
      <section
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is read with the arrow keys, like the HF planner's
        tabIndex={0}
        aria-label={`${name}. Left and right arrow keys move along it.`}
        aria-describedby={tableId}
        onKeyDown={onKey}
        className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg
          width={width}
          height={height}
          className="block touch-pan-y select-none"
          aria-hidden
          onPointerMove={(event) => setChosen(nearest(event))}
          onPointerDown={(event) => setChosen(nearest(event))}
        >
          {band ? (
            <rect
              x={left}
              width={width - left - right}
              y={y(band.high)}
              height={Math.max(1, y(band.low) - y(band.high))}
              style={{ fill: "var(--chart-seq-1)" }}
              data-band
            />
          ) : null}
          {shownTicks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--chart-grid)" }} />
              <text x={left - 6} y={y(tick) + 4} textAnchor="end" className={AXIS_TEXT}>
                {format(tick)}
              </text>
            </g>
          ))}
          {midnights.map((t, n) =>
            n % every === 0 ? (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={top} y2={height - bottom} style={{ stroke: "var(--chart-grid)" }} />
                <text x={x(t) + 3} y={height - 6} className={AXIS_TEXT}>
                  {dayLabel.format(t)}
                </text>
              </g>
            ) : null,
          )}
          {now !== undefined && now > first && now < last ? (
            <g>
              <line x1={x(now)} x2={x(now)} y1={top} y2={height - bottom} className="stroke-ink-muted" strokeDasharray="4 3" />
              <text x={x(now) + 3} y={top + 10} className="fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]">
                now
              </text>
            </g>
          ) : null}
          {rules.map((rule) => (
            <g key={rule.label} data-rule>
              <line
                x1={left}
                x2={width - right}
                y1={y(rule.value)}
                y2={y(rule.value)}
                style={{ stroke: "var(--chart-axis)" }}
                strokeDasharray="6 4"
              />
              <text
                x={width - right - 2}
                y={y(rule.value) - 4}
                textAnchor="end"
                className="fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
              >
                {rule.label}
              </text>
            </g>
          ))}
          <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
          {marks ? sorted.map((point) => <circle key={point.t} cx={x(point.t)} cy={y(point.value)} r={3} style={{ fill: color }} />) : null}
          <line x1={x(shown.t)} x2={x(shown.t)} y1={top} y2={height - bottom} className="stroke-ink" strokeWidth={1} opacity={0.6} />
          <circle cx={x(shown.t)} cy={y(shown.value)} r={4.5} strokeWidth={2} className="stroke-page" style={{ fill: color }} />
        </svg>
        <p aria-live="polite" className="tabular min-h-[1.3125rem] text-small text-ink">
          {momentText(shown.t)}: {format(shown.value)}
        </p>
      </section>
      <div id={tableId} className="sr-only">
        <table>
          <caption>{name}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((point) => (
              <tr key={point.t}>
                <th scope="row">{momentText(point.t)}</th>
                <td>{format(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
