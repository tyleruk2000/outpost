import { type KeyboardEvent, type PointerEvent, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, TooltipValue } from "./chart-tooltip";
import { bucketReadings, clamp, linearScale, nearestIndex, type Reading } from "./scale";
import { formatRate, formatSpeed, speedTicks } from "./speed";
import { useTextScale } from "./text-scale";
import { useWidth } from "./use-width";

/** Readings further apart than this were not one continuous transfer; the line breaks there. */
const GAP_MS = 5000;
/** A limit far above anything measured would flatten the line against the floor, so it is left off the plot. */
const LIMIT_WITHIN = 4;

type Pointing = { by: "pointer"; x: number } | { by: "keys"; at: number } | null;

/**
 * Speed over time as one line: time across, bytes per second up, one y-axis. A speed
 * limit is drawn as a labelled reference line. The pointer gets a crosshair that snaps
 * to the nearest reading; the keyboard gets the same with the arrow keys; a hidden
 * table carries the same numbers for screen readers.
 */
export function SpeedChart({
  readings,
  domain,
  xTicks,
  limit,
  height: baseHeight = 168,
  label,
  timeLabel,
  placeholder,
  tableCaption,
  tableBucketSeconds,
  className,
}: {
  /** Oldest first. `value` is bytes per second. */
  readings: readonly Reading[];
  /** The two ends of the time axis, in milliseconds since the epoch. */
  domain: readonly [number, number];
  xTicks: ReadonlyArray<{ at: number; label: string }>;
  /** Bytes per second, when a limit is in force. */
  limit?: number | null;
  height?: number;
  /** What the chart shows; its accessible name. */
  label: string;
  /** How a moment is written in the tooltip and the table. */
  timeLabel: (at: number) => string;
  /** Said in place of a line while there are too few readings to draw one. */
  placeholder?: string;
  tableCaption: string;
  tableBucketSeconds: number;
  className?: string;
}) {
  const [frame, measured] = useWidth<HTMLDivElement>();
  const scale = useTextScale();
  const height = Math.round(baseHeight * scale);
  /** The width of a character of the axis labels, near enough to keep room for them. */
  const character = 6.7 * scale;
  const width = measured || 640;
  const [pointing, setPointing] = useState<Pointing>(null);

  const shown = useMemo(
    () => readings.filter((reading) => reading.at >= domain[0] && reading.at <= domain[1]),
    [readings, domain[0], domain[1]],
  );
  const peak = shown.reduce((max, reading) => Math.max(max, reading.value), 0);
  const limitDrawn = limit && (peak === 0 || limit <= peak * LIMIT_WITHIN) ? limit : null;
  const y = speedTicks(Math.max(peak, limitDrawn ?? 0), baseHeight < 150 ? 2 : 4);
  const tickLabels = y.ticks.map((tick) => (tick === 0 ? "0" : formatRate(tick)));

  const margin = {
    top: 20 * scale,
    right: 10,
    bottom: 26 * scale,
    left: Math.max(30 * scale, Math.max(...tickLabels.map((text) => text.length)) * character + 12),
  };
  const plot = { left: margin.left, right: width - margin.right, top: margin.top, bottom: height - margin.bottom };
  const toX = linearScale(domain, [plot.left, plot.right]);
  const toY = linearScale([0, y.max], [plot.bottom, plot.top]);

  // Time labels are dropped from the left until those that remain have room; the right-hand one ("now") always stays.
  const spacedTicks: Array<{ at: number; label: string }> = [];
  let freeUntil = Number.POSITIVE_INFINITY;
  for (const tick of [...xTicks].sort((a, b) => b.at - a.at)) {
    const x = toX(tick.at);
    if (x < plot.left - 0.5 || x > plot.right + 0.5) continue;
    const wide = tick.label.length * character;
    const right = x > plot.right - 24 ? x : x < plot.left + 14 ? x + wide : x + wide / 2;
    if (right + 14 > freeUntil) continue;
    spacedTicks.push(tick);
    freeUntil = right - wide;
  }

  // One path per unbroken run of readings, with a faint wash underneath.
  const runs: Reading[][] = [];
  for (const reading of shown) {
    const run = runs[runs.length - 1];
    if (run && reading.at - run[run.length - 1]!.at <= GAP_MS) run.push(reading);
    else runs.push([reading]);
  }
  const point = (reading: Reading) => `${toX(reading.at).toFixed(1)},${toY(reading.value).toFixed(1)}`;

  const drawable = shown.length >= 2;
  const times = shown.map((reading) => reading.at);
  let active = -1;
  if (drawable && pointing) {
    active =
      pointing.by === "pointer"
        ? nearestIndex(times, linearScale([plot.left, plot.right], domain)(pointing.x))
        : nearestIndex(times, pointing.at);
  }
  const current = active >= 0 ? shown[active]! : null;
  const last = shown[shown.length - 1];

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setPointing({ by: "pointer", x: clamp(event.clientX - box.left, plot.left, plot.right) });
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!drawable) return;
    const from = active >= 0 ? active : shown.length - 1;
    const stride = event.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = from - stride;
    else if (event.key === "ArrowRight") next = from + stride;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = shown.length - 1;
    else if (event.key === "Escape") return setPointing(null);
    if (next === null) return;
    event.preventDefault();
    setPointing({ by: "keys", at: shown[clamp(next, 0, shown.length - 1)]!.at });
  };

  const table = useMemo(() => bucketReadings(shown, tableBucketSeconds), [shown, tableBucketSeconds]);

  return (
    <div className={cn("relative min-w-0", className)} ref={frame}>
      {/* biome-ignore lint/a11y/useSemanticElements: a chart is a group of marks, not a set of form fields */}
      <div
        role="group"
        aria-label={`${label}. Chart; the left and right arrow keys read it one reading at a time.`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is read with the arrow keys, like a slider over its readings
        tabIndex={0}
        className="touch-pan-y rounded-control"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setPointing((state) => (state?.by === "pointer" ? null : state))}
        onFocus={() => last && setPointing((state) => state ?? { by: "keys", at: last.at })}
        onBlur={() => setPointing(null)}
        onKeyDown={onKey}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block text-micro">
          {y.ticks.map((tick, index) => (
            <g key={tick}>
              <line
                x1={plot.left}
                x2={plot.right}
                y1={toY(tick)}
                y2={toY(tick)}
                className={tick === 0 ? "stroke-chart-axis" : "stroke-chart-grid"}
                strokeWidth={1}
              />
              <text x={plot.left - 8} y={toY(tick)} dy="0.32em" textAnchor="end" className="tabular fill-ink-muted">
                {tickLabels[index]}
              </text>
            </g>
          ))}
          {spacedTicks.map((tick) => {
            const x = toX(tick.at);
            const anchor = x > plot.right - 24 ? "end" : x < plot.left + 14 ? "start" : "middle";
            return (
              <g key={tick.at}>
                <line x1={x} x2={x} y1={plot.bottom} y2={plot.bottom + 4} className="stroke-chart-axis" strokeWidth={1} />
                <text x={x} y={plot.bottom + 18 * scale} textAnchor={anchor} className="tabular fill-ink-muted">
                  {tick.label}
                </text>
              </g>
            );
          })}

          {limitDrawn ? (
            <line
              x1={plot.left}
              x2={plot.right}
              y1={toY(limitDrawn)}
              y2={toY(limitDrawn)}
              className="stroke-ink-muted"
              strokeWidth={1}
              strokeDasharray="5 4"
            />
          ) : null}

          {drawable
            ? runs.map((run) => {
                const first = run[0]!;
                const end = run[run.length - 1]!;
                if (run.length === 1)
                  return <circle key={first.at} cx={toX(first.at)} cy={toY(first.value)} r={1.5} className="fill-chart-1" />;
                const line = run.map(point).join(" L");
                return (
                  <g key={first.at}>
                    <path
                      d={`M${line} L${toX(end.at).toFixed(1)},${plot.bottom} L${toX(first.at).toFixed(1)},${plot.bottom} Z`}
                      className="fill-chart-1"
                      fillOpacity={0.1}
                    />
                    <path
                      d={`M${line}`}
                      fill="none"
                      className="stroke-chart-1"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })
            : null}

          {limitDrawn ? (
            // Drawn over the line, with a halo in the page colour, so the words stay readable where the speed runs up against the limit.
            <text
              x={plot.left + 6}
              y={toY(limitDrawn) - 6}
              className="tabular fill-ink-muted stroke-page"
              strokeWidth={4}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              Limit {formatRate(limitDrawn)}
            </text>
          ) : null}

          {current ? (
            <g>
              <line
                x1={toX(current.at)}
                x2={toX(current.at)}
                y1={plot.top}
                y2={plot.bottom}
                className="stroke-chart-axis"
                strokeWidth={1}
              />
              <circle cx={toX(current.at)} cy={toY(current.value)} r={5} className="fill-chart-1 stroke-page" strokeWidth={2} />
            </g>
          ) : drawable && last ? (
            <circle cx={toX(last.at)} cy={toY(last.value)} r={4} className="fill-chart-1 stroke-page" strokeWidth={2} />
          ) : null}
        </svg>
      </div>

      {!drawable && placeholder ? (
        <p
          className="pointer-events-none absolute text-center text-small text-ink-muted"
          style={{ left: plot.left, right: margin.right, top: (plot.top + plot.bottom) / 2 - 10 * scale }}
        >
          {placeholder}
        </p>
      ) : null}

      {current ? (
        <ChartTooltip x={toX(current.at)} y={toY(current.value)} frameWidth={width} above={toY(current.value) > plot.top + 44}>
          <TooltipValue value={formatSpeed(current.value)} label={timeLabel(current.at)} />
        </ChartTooltip>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {current && pointing?.by === "keys" ? `${formatSpeed(current.value)}, ${timeLabel(current.at)}` : ""}
      </p>

      {/* A table ignores the one-pixel box that hides it from sight, so a block around it takes that job. */}
      <div className="sr-only">
        <table>
          <caption>{tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Speed</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.at}>
                <th scope="row">{timeLabel(row.at)}</th>
                <td>{formatSpeed(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
