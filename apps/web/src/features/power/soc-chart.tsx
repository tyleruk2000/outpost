/**
 * The battery's state of charge hour by hour over a few days: one line, one hue, the
 * usable limit marked across it, labelled axes, a readout that answers the pointer and
 * the arrow keys, and the same figures as a table for a screen reader. Drawn by hand as
 * SVG like every chart in Outpost (see features/propagation/charts.tsx).
 */
import { type KeyboardEvent, memo, type PointerEvent, useId, useState } from "react";
import { useWidth } from "@/lib/use-width";

const AXIS_TEXT = "tabular fill-ink-muted text-[11px]";

/** "Day 2, 14:00": the end of hour `index` (0-based) counted from midnight of day 1. */
export const hourLabel = (index: number): string =>
  `Day ${Math.floor(index / 24) + 1}, ${String(index % 24).padStart(2, "0")}:00 to ${String((index % 24) + 1).padStart(2, "0")}:00`;

/** Drawn again only when its figures change, not each time the plan around it is typed in. */
export const SocChart = memo(function SocChart({
  soc,
  floor,
  name,
  height = 200,
}: {
  soc: number[];
  floor: number;
  name: string;
  height?: number;
}) {
  const [ref, width] = useWidth(640);
  const [at, setAt] = useState<number | null>(null);
  const tableId = useId();
  const left = 44;
  const right = 12;
  const top = 10;
  const bottom = 34;
  const days = Math.ceil(soc.length / 24);
  const x = (index: number) => left + (index / Math.max(1, soc.length - 1)) * (width - left - right);
  const y = (share: number) => top + (1 - share) * (height - top - bottom);
  const path = soc.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("");
  const shown = at ?? soc.length - 1;
  const indexAt = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.min(
      soc.length - 1,
      Math.max(0, Math.round(((event.clientX - box.left - left) / (width - left - right)) * (soc.length - 1))),
    );
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, PageUp: -24, PageDown: 24 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setAt(Math.min(soc.length - 1, Math.max(0, (at ?? soc.length - 1) + step)));
  };
  const value = soc[shown] ?? 0;
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
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--chart-grid)" }} />
              <text x={left - 6} y={y(tick) + 4} textAnchor="end" className={AXIS_TEXT}>
                {Math.round(tick * 100)}%
              </text>
            </g>
          ))}
          {Array.from({ length: days }, (_, day) => day).map((day) => (
            <g key={`day-${day}`}>
              {day > 0 ? (
                <line x1={x(day * 24 - 0.5)} x2={x(day * 24 - 0.5)} y1={top} y2={height - bottom} style={{ stroke: "var(--chart-axis)" }} />
              ) : null}
              <text x={x(day * 24 + 11.5)} y={height - bottom + 15} textAnchor="middle" className={AXIS_TEXT}>
                Day {day + 1}
              </text>
              {width > 420
                ? [6, 12, 18].map((h) => (
                    <text key={h} x={x(day * 24 + h - 0.5)} y={height - bottom + 28} textAnchor="middle" className={AXIS_TEXT}>
                      {String(h).padStart(2, "0")}
                    </text>
                  ))
                : null}
            </g>
          ))}
          <line
            x1={left}
            x2={width - right}
            y1={y(floor)}
            y2={y(floor)}
            className="stroke-ink-muted"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <text
            x={width - right}
            y={y(floor) - 5}
            textAnchor="end"
            className="tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
          >
            Usable limit, {Math.round(floor * 100)}%
          </text>
          <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: "var(--chart-1)" }} />
          <line
            x1={x(shown)}
            x2={x(shown)}
            y1={top}
            y2={height - bottom}
            className="stroke-ink"
            strokeWidth={1}
            opacity={at === null ? 0.45 : 1}
          />
          <circle cx={x(shown)} cy={y(value)} r={4.5} strokeWidth={2} className="stroke-page" style={{ fill: "var(--chart-1)" }} />
        </svg>
        <p aria-live="polite" className="tabular min-h-[1.3125rem] text-small text-ink">
          {hourLabel(shown)}: {Math.round(value * 100)}% charged at the end of the hour
        </p>
      </section>
      <div id={tableId} className="sr-only">
        <table>
          <caption>{name}</caption>
          <thead>
            <tr>
              <th scope="col">Hour</th>
              <th scope="col">State of charge</th>
            </tr>
          </thead>
          <tbody>
            {soc.map((share, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: hours are positions
              <tr key={index}>
                <th scope="row">{hourLabel(index)}</th>
                <td>{Math.round(share * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
