/**
 * A small line chart over whole-number positions (a count, a rank). One y-axis, a
 * recessive grid, 2px lines, and a crosshair that snaps to the nearest position and
 * lists every series there. The arrow keys move the crosshair when the plot has focus.
 */
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { useWidth } from "@/lib/use-width";
import { clamp, linear } from "../lib/scale";
import { COLOR } from "./colors";
import { HiddenTable, Legend } from "./figure";
import { Tip, TipBody, useTip } from "./tip";

export interface LineSeries {
  id: string;
  label: string;
  /** A short name for the label at the line's end. */
  endLabel?: string;
  color: string;
  /** One value per position, starting at `xStart`. */
  values: number[];
}

export function LinePlot({
  series,
  xStart = 0,
  xTicks,
  yTicks,
  formatY,
  describeX,
  reference,
  ariaLabel,
  caption,
  xColumn,
  height = 220,
  endLabelRoom = 130,
}: {
  series: LineSeries[];
  xStart?: number;
  xTicks: number[];
  yTicks: number[];
  formatY: (value: number) => string;
  /** The tooltip heading for a position: "The word appears 3 times". */
  describeX: (x: number) => ReactNode;
  /** A labelled horizontal line: a ceiling or a threshold. */
  reference?: { value: number; label: string };
  ariaLabel: string;
  caption: string;
  xColumn: string;
  height?: number;
  endLabelRoom?: number;
}) {
  const [ref, width] = useWidth(640);
  const tip = useTip();
  const [at, setAt] = useState<number | null>(null);
  const narrow = width < 480;
  const labelled = !narrow && series.some((item) => item.endLabel);
  const margin = { top: 18, right: labelled ? endLabelRoom : 14, bottom: 30, left: 44 };
  const count = Math.max(...series.map((item) => item.values.length));
  const xEnd = xStart + count - 1;
  const x = linear([xStart, xEnd], [margin.left, width - margin.right]);
  const y = linear([yTicks[0] ?? 0, yTicks[yTicks.length - 1] ?? 1], [height - margin.bottom, margin.top]);
  const path = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? "M" : "L"}${x(xStart + index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  // End labels of lines that finish close together are moved apart, each joined to its line by a short leader.
  const ends = series
    .map((item) => ({ id: item.id, at: y(item.values[item.values.length - 1] ?? 0), label: 0 }))
    .sort((a, b) => a.at - b.at);
  ends.forEach((end, index) => {
    end.label = index === 0 ? end.at : Math.max(end.at, ends[index - 1]!.label + 15);
  });
  const shift = ends.length > 1 ? (ends[ends.length - 1]!.label - ends[ends.length - 1]!.at) / 2 : 0;
  const labelY = new Map(ends.map((end) => [end.id, end.label - shift]));
  const shownTicks = narrow && xTicks.length > 7 ? xTicks.filter((_, index) => index % 2 === 0) : xTicks;

  const showAt = (position: number, svg: Element) => {
    const box = svg.getBoundingClientRect();
    const index = position - xStart;
    setAt(position);
    tip.show(
      { clientX: box.left + x(position), clientY: box.top + Math.min(...series.map((item) => y(item.values[index] ?? 0))) },
      <TipBody label={describeX(position)}>
        <ul className="mt-1 grid gap-0.5 text-small">
          {series.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="tabular font-semibold text-ink">{formatY(item.values[index] ?? 0)}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </TipBody>,
    );
  };
  const clear = () => {
    setAt(null);
    tip.hide();
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") return clear();
    const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    showAt(clamp((at ?? xStart - 1) + move, xStart, xEnd), event.currentTarget);
  };

  return (
    <div ref={tip.boxRef} className="relative">
      {series.length > 1 ? (
        <Legend className="mb-2" items={series.map((item) => ({ label: item.label, color: item.color, swatch: "line" as const }))} />
      ) : null}
      <div ref={ref}>
        <svg
          width={width}
          height={height}
          role="img"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the values can be stepped through with the arrow keys
          tabIndex={0}
          aria-label={`${ariaLabel} Use the left and right arrow keys to read values.`}
          className="understand-plot block max-w-full"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            showAt(clamp(Math.round(x.invert(event.clientX - box.left)), xStart, xEnd), event.currentTarget);
          }}
          onPointerLeave={clear}
          onFocus={(event) => showAt(at ?? xStart, event.currentTarget)}
          onBlur={clear}
          onKeyDown={onKeyDown}
        >
          {yTicks.map((tick, index) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={index === 0 ? COLOR.axis : COLOR.grid}
                strokeWidth={1}
              />
              <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" className="tabular fill-ink-muted text-[0.6875rem]">
                {formatY(tick)}
              </text>
            </g>
          ))}
          {shownTicks.map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={height - margin.bottom + 16}
              textAnchor="middle"
              className="tabular fill-ink-muted text-[0.6875rem]"
            >
              {tick}
            </text>
          ))}
          {reference ? (
            <>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                stroke={COLOR.ink}
                strokeWidth={1}
              />
              <text x={margin.left + 6} y={y(reference.value) - 6} className="fill-ink text-[0.75rem] font-medium">
                {reference.label}
              </text>
            </>
          ) : null}
          {at !== null ? <line x1={x(at)} x2={x(at)} y1={margin.top} y2={y(yTicks[0] ?? 0)} stroke={COLOR.axis} strokeWidth={1} /> : null}
          {series
            .slice()
            .reverse()
            .map((item) => (
              <g key={item.id}>
                <path d={path(item.values)} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {at !== null && item.values[at - xStart] !== undefined ? (
                  <circle cx={x(at)} cy={y(item.values[at - xStart]!)} r={5} fill={item.color} stroke={COLOR.page} strokeWidth={2} />
                ) : null}
                {labelled && item.endLabel ? (
                  <>
                    <circle
                      cx={x(xEnd)}
                      cy={y(item.values[item.values.length - 1] ?? 0)}
                      r={4}
                      fill={item.color}
                      stroke={COLOR.page}
                      strokeWidth={2}
                    />
                    <line
                      x1={x(xEnd) + 6}
                      y1={y(item.values[item.values.length - 1] ?? 0)}
                      x2={x(xEnd) + 14}
                      y2={labelY.get(item.id) ?? 0}
                      stroke={COLOR.axis}
                      strokeWidth={1}
                    />
                    <text x={x(xEnd) + 18} y={(labelY.get(item.id) ?? 0) + 4} className="fill-ink text-[0.75rem]">
                      {item.endLabel}
                    </text>
                  </>
                ) : null}
              </g>
            ))}
        </svg>
      </div>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption={caption}
        columns={[xColumn, ...series.map((item) => item.label)]}
        rows={Array.from({ length: count }, (_, index) => [
          xStart + index,
          ...series.map((item) => (item.values[index] === undefined ? null : formatY(item.values[index]!))),
        ])}
      />
    </div>
  );
}
