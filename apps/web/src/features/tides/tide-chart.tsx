/**
 * The height of the tide over the days asked for: one line, high and low waters marked
 * on it, metres on the left, days along the foot, a readout that answers the pointer and
 * the arrow keys, and the same figures (the highs and lows) as a table for a screen
 * reader. Hand-drawn SVG, like every chart in Outpost.
 */
import { addDays, type TideTurn } from "@outpost/shared";
import { type KeyboardEvent, memo, type PointerEvent, useId, useState } from "react";
import { formatShortDate } from "@/features/maps/lib/sun-text";
import { type ClockStyle, useClockStyle } from "@/lib/clock";
import { useWidth } from "@/lib/use-width";
import { clockAt, reading, type ZoneChoice } from "../solar-clock/zone";
import { formatHeight, midnightOn } from "./words";

const AXIS_TEXT = "tabular fill-ink-muted text-[11px]";

/** "15 Jan, 05:34". */
export function whenText(ms: number, zone: ZoneChoice, style: ClockStyle): string {
  return `${formatShortDate(reading(zone, ms).date)}, ${clockAt(ms, zone, style)}`;
}

/** Tidy tick values for a span of metres: every 0.25, 0.5, 1 or 2 m. */
function ticks(min: number, max: number): number[] {
  const span = max - min;
  const step = span <= 1.2 ? 0.25 : span <= 3 ? 0.5 : span <= 6 ? 1 : 2;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export const TideChart = memo(function TideChart({
  curve,
  turns,
  zone,
  name,
  height = 220,
}: {
  curve: Array<{ t: number; h: number }>;
  turns: TideTurn[];
  zone: ZoneChoice;
  name: string;
  height?: number;
}) {
  const style = useClockStyle();
  const [ref, width] = useWidth(640);
  const [at, setAt] = useState<number | null>(null);
  const tableId = useId();
  const left = 48;
  const right = 12;
  const top = 12;
  const bottom = 26;
  const first = curve[0]?.t ?? 0;
  const last = curve[curve.length - 1]?.t ?? first + 1;
  const heights = curve.map((point) => point.h);
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const pad = Math.max(0.05, (high - low) * 0.08);
  const yMin = low - pad;
  const yMax = high + pad;
  const x = (t: number) => left + ((t - first) / Math.max(1, last - first)) * (width - left - right);
  const y = (h: number) => top + (1 - (h - yMin) / (yMax - yMin)) * (height - top - bottom);
  const path = curve.map((point, i) => `${i === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.h).toFixed(1)}`).join("");

  // Midnight on the chosen clock, for each day the chart spans.
  const midnights: number[] = [];
  for (let date = reading(zone, first).date; ; date = addDays(date, 1)) {
    const m = midnightOn(date, zone);
    if (m > last) break;
    if (m >= first) midnights.push(m);
  }
  const labelEvery = Math.max(1, Math.ceil((midnights.length * 56) / Math.max(1, width - left - right)));

  const indexAt = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = (event.clientX - box.left - left) / (width - left - right);
    return Math.min(curve.length - 1, Math.max(0, Math.round(share * (curve.length - 1))));
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    // The curve is every ten minutes: an arrow moves an hour, Page Up and Page Down a day.
    const step = { ArrowLeft: -6, ArrowRight: 6, PageUp: -144, PageDown: 144 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setAt(Math.min(curve.length - 1, Math.max(0, (at ?? 0) + step)));
  };
  const shown = at === null ? null : curve[at];

  return (
    <div>
      <section
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is read with the arrow keys
        tabIndex={0}
        aria-label={`${name}. Left and right arrow keys move an hour; Page Up and Page Down a day.`}
        aria-describedby={tableId}
        onKeyDown={onKey}
        className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg
          width={width}
          height={height}
          className="block touch-pan-y select-none"
          aria-hidden
          onPointerMove={(event) => setAt(indexAt(event))}
          onPointerDown={(event) => setAt(indexAt(event))}
          onPointerLeave={() => setAt(null)}
        >
          {ticks(yMin, yMax).map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--chart-grid)" }} />
              <text x={left - 6} y={y(tick) + 4} textAnchor="end" className={AXIS_TEXT}>
                {formatHeight(tick)}
              </text>
            </g>
          ))}
          {midnights.map((m, i) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={top} y2={height - bottom} style={{ stroke: "var(--chart-axis)" }} strokeWidth={0.75} />
              {i % labelEvery === 0 && x(m) + 4 < width - right - 30 ? (
                <text x={x(m) + 4} y={height - bottom + 16} className={AXIS_TEXT}>
                  {formatShortDate(reading(zone, m + 60_000).date)}
                </text>
              ) : null}
            </g>
          ))}
          <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: "var(--chart-1)" }} />
          {turns.map((turn) => (
            <circle
              key={turn.t}
              cx={x(turn.t)}
              cy={y(turn.h)}
              r={4}
              strokeWidth={2}
              className="stroke-page"
              style={{ fill: "var(--chart-1)" }}
            />
          ))}
          {shown ? (
            <>
              <line x1={x(shown.t)} x2={x(shown.t)} y1={top} y2={height - bottom} className="stroke-ink" strokeWidth={1} />
              <circle cx={x(shown.t)} cy={y(shown.h)} r={4.5} strokeWidth={2} className="stroke-page fill-ink" />
            </>
          ) : null}
        </svg>
        <p aria-live="polite" className="tabular min-h-[1.3125rem] text-small text-ink">
          {shown
            ? `${whenText(shown.t, zone, style)}: ${formatHeight(shown.h)}`
            : "Point at the curve, or use the arrow keys, to read the height at a time."}
        </p>
      </section>
      <div id={tableId} className="sr-only">
        <table>
          <caption>{name}: high and low waters</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Tide</th>
              <th scope="col">Height</th>
            </tr>
          </thead>
          <tbody>
            {turns.map((turn) => (
              <tr key={turn.t}>
                <th scope="row">{whenText(turn.t, zone, style)}</th>
                <td>{turn.kind === "high" ? "High water" : "Low water"}</td>
                <td>{formatHeight(turn.h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
