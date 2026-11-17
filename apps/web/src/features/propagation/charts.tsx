/**
 * The charts of the HF planner, drawn by hand as SVG like every chart in Outpost.
 *
 * Three forms, each picked by what the numbers are for: a grid of cells for "how good,
 * at every hour, for every row" (a share of days is a magnitude, so one hue from light
 * to dark); lines for one or a few quantities through the day; bars for ranking the
 * bands at one hour. Every chart draws only what the engine returned, answers the
 * pointer and the arrow keys, and carries the same numbers as a table for a screen
 * reader. Colours are the chart tokens; none is added here.
 */
import { utcLabel } from "@outpost/shared";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useId, useState } from "react";
import { useWidth } from "@/features/radio/use-width";
import { cn } from "@/lib/utils";

const AXIS_TEXT = "tabular fill-ink-muted text-[11px]";
/** The hours of the day as the engine numbers them: 1 is 01:00 UTC, 24 is midnight at the end of the day. */
const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);

export function ChartFrame({
  title,
  reading,
  children,
  className,
}: {
  title: string;
  reading?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="mb-2">
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        {reading ? <p className="mt-0.5 max-w-[70ch] text-small text-ink-muted">{reading}</p> : null}
      </figcaption>
      {children}
    </figure>
  );
}

// ── Shares of days as steps of one hue ──────────────────────────────────────

/** The steps a share of days is drawn in. Below a tenth is left the colour of the track: nothing to speak of. */
const STEPS = [
  { from: 0.9, fill: "var(--chart-seq-5)", label: "90% or more" },
  { from: 0.7, fill: "var(--chart-seq-4)", label: "70 to 89%" },
  { from: 0.5, fill: "var(--chart-seq-3)", label: "50 to 69%" },
  { from: 0.3, fill: "var(--chart-seq-2)", label: "30 to 49%" },
  { from: 0.1, fill: "var(--chart-seq-1)", label: "10 to 29%" },
] as const;
const EMPTY_FILL = "var(--surface-strong)";

export const shareFill = (share: number | null): string =>
  share === null ? "transparent" : (STEPS.find((step) => share >= step.from)?.fill ?? EMPTY_FILL);
export const percent = (share: number | null): string => (share === null ? "no figure" : `${Math.round(share * 100)}%`);

/** What stands in a chart for "the antenna is not modelled here": said in words wherever it is drawn. */
export const NOT_MODELLED = "not modelled for this antenna";
/** What stands in a chart for "the figure is approximate here": a sign beside the label, and these words wherever it is read out. */
export const APPROXIMATE = "approximate";
export const APPROXIMATE_SIGN = "≈";

/** A swatch of the hatching that marks a cell with no figure because the antenna is not modelled there. */
function HatchSwatch() {
  return (
    <svg aria-hidden width={12} height={12} className="shrink-0 rounded-[2px]">
      <rect width={12} height={12} className="fill-page stroke-border-strong" />
      <path d="M-2 8 L8 -2 M2 14 L14 2 M-2 14 L14 -2" className="stroke-ink-muted" strokeWidth={1} />
    </svg>
  );
}

/** A swatch of the dashed frame and sign that mark a row whose figures are approximate. */
function ApproximateSwatch() {
  return (
    <span
      aria-hidden
      className="flex size-3 shrink-0 items-center justify-center rounded-[2px] border border-dashed border-ink text-[10px] leading-none text-ink"
    >
      {APPROXIMATE_SIGN}
    </span>
  );
}

export function ShareLegend({
  what = "of days",
  notModelled = false,
  approximate = false,
}: {
  what?: string;
  notModelled?: boolean;
  approximate?: boolean;
}) {
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted" aria-label="What the shades mean">
      {[...STEPS].reverse().map((step) => (
        <li key={step.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[2px]" style={{ background: step.fill }} />
          {step.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-[2px]" style={{ background: EMPTY_FILL }} />
        under 10% {what}
      </li>
      {approximate ? (
        <li className="flex items-center gap-1.5">
          <ApproximateSwatch />
          {APPROXIMATE_SIGN} in a dashed frame: approximate figures (VOACAP's sloping long wire)
        </li>
      ) : null}
      {notModelled ? (
        <li className="flex items-center gap-1.5">
          <HatchSwatch />
          {NOT_MODELLED}: no figure
        </li>
      ) : null}
    </ul>
  );
}

export interface GridRow {
  label: string;
  /** A share, 0 to 1, for each of the 24 hours; null where there is no figure. */
  values: Array<number | null>;
  /** Shown in the readout after the row's label. */
  detail?: string;
  /** Drawn bolder: the row the person asked about. */
  marked?: boolean;
  /**
   * The antenna is a wire the engine's model does not describe on this row's frequency.
   * The row is hatched and read out as not modelled; its values are not looked at.
   */
  notModelled?: boolean;
  /**
   * The row's figures are approximate: an antenna is a level wire longer than a half-wave
   * there. The row is shaded as any other, framed with a dashed line, its label carries
   * "≈", and it is read out as approximate.
   */
  approximate?: boolean;
}

/**
 * Rows against the 24 hours of the day, each cell shaded by a share of days. Moving
 * over it, or with the arrow keys once it has focus, reads out one cell; pressing or
 * Enter chooses that hour for the rest of the screen.
 */
export function HourGrid({
  rows,
  hour,
  onHour,
  name,
  rowHeight = 14,
  labelEvery = 1,
  line,
  what = "of days",
}: {
  rows: GridRow[];
  /** The chosen hour, 1 to 24. */
  hour: number;
  onHour: (hour: number) => void;
  /** Accessible name: what the grid shows. */
  name: string;
  rowHeight?: number;
  /** Label every nth row. */
  labelEvery?: number;
  /** A line drawn across the grid, as a row position (may fall between rows) for each hour, with its name. */
  line?: { label: string; rowAt: Array<number | null>; describe: (hour: number) => string };
  what?: string;
}) {
  const [ref, width] = useWidth();
  const [at, setAt] = useState<{ row: number; hour: number } | null>(null);
  const tableId = useId();
  const hatchId = useId();
  const anyNotModelled = rows.some((row) => row.notModelled);
  const anyApproximate = rows.some((row) => row.approximate && !row.notModelled);
  // Rows of approximate figures that lie together are framed once, as one block. A frame to each row put a
  // dashed line between every pair of rows, and an antenna that is approximate on most of the range (a sloping
  // wire is, from its half-wave up) turned the whole chart into stripes with the shades lost behind them.
  const approximateRuns: Array<{ from: number; rows: number }> = [];
  rows.forEach((row, index) => {
    if (!row.approximate || row.notModelled) return;
    const last = approximateRuns[approximateRuns.length - 1];
    if (last && last.from + last.rows === index) last.rows += 1;
    else approximateRuns.push({ from: index, rows: 1 });
  });
  // Room for the longest label: "29 MHz" alone, or with the sign after it.
  const left = anyApproximate ? 62 : 46;
  const right = 6;
  const top = 6;
  const bottom = 20;
  const cellWidth = (width - left - right) / 24;
  const height = top + rows.length * rowHeight + bottom;
  const x = (h: number) => left + (h - 1) * cellWidth;
  const y = (row: number) => top + row * rowHeight;

  const locate = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const column = Math.floor((event.clientX - box.left - left) / cellWidth);
    const row = Math.floor((event.clientY - box.top - top) / rowHeight);
    if (column < 0 || column > 23 || row < 0 || row >= rows.length) return null;
    return { row, hour: column + 1 };
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = at ?? {
      row: Math.max(
        0,
        rows.findIndex((row) => row.marked),
      ),
      hour,
    };
    const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (move) {
      event.preventDefault();
      setAt({ row: Math.min(rows.length - 1, Math.max(0, from.row + move[0]!)), hour: Math.min(24, Math.max(1, from.hour + move[1]!)) });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onHour(from.hour);
    }
  };

  const read = at ? rows[at.row] : undefined;
  const readout =
    at && read
      ? `${utcLabel(at.hour)} UTC, ${read.label}${read.detail ? ` (${read.detail})` : ""}: ${read.notModelled ? NOT_MODELLED : `${read.approximate ? `${APPROXIMATE}, ` : ""}${percent(read.values[at.hour - 1] ?? null)} ${what}`}${line ? `. ${line.describe(at.hour)}` : ""}`
      : null;
  const points = line
    ? line.rowAt
        .map((row, index) => (row === null ? null : `${(x(index + 1) + cellWidth / 2).toFixed(1)},${(top + row * rowHeight).toFixed(1)}`))
        .filter((point) => point !== null)
        .join(" ")
    : "";

  return (
    <div>
      <section
        ref={ref}
        className="relative rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the grid is read with the arrow keys, like the path profile on the map
        tabIndex={0}
        aria-label={`${name}. Arrow keys read a cell; Enter chooses its hour.`}
        aria-describedby={tableId}
        onKeyDown={onKey}
        onBlur={() => setAt(null)}
      >
        <svg
          width={width}
          height={height}
          className="block touch-pan-y select-none"
          aria-hidden
          onPointerMove={(event) => setAt(locate(event))}
          onPointerLeave={() => setAt(null)}
          onPointerDown={(event) => {
            const found = locate(event);
            if (found) onHour(found.hour);
          }}
        >
          {anyNotModelled ? (
            <defs>
              <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={6} height={6} className="fill-page" />
                <line x1={0} y1={0} x2={0} y2={6} className="stroke-ink-muted" strokeWidth={1.25} />
              </pattern>
            </defs>
          ) : null}
          {rows.map((row, rowIndex) => (
            <g key={row.label} data-approximate={row.approximate && !row.notModelled ? "" : undefined}>
              {row.marked ||
              (rowIndex % labelEvery === 0 && !(labelEvery > 1 && (rows[rowIndex - 1]?.marked || rows[rowIndex + 1]?.marked))) ? (
                <text
                  x={left - 6}
                  y={y(rowIndex) + rowHeight / 2 + 4}
                  textAnchor="end"
                  className={cn(AXIS_TEXT, row.marked && "fill-ink font-semibold")}
                >
                  {row.approximate && !row.notModelled ? `${row.label} ${APPROXIMATE_SIGN}` : row.label}
                </text>
              ) : null}
              {row.notModelled ? (
                // One hatched bar for the whole day: there is no figure at any hour to shade a cell by.
                <rect
                  data-not-modelled
                  x={x(1) + 0.5}
                  y={y(rowIndex) + 0.5}
                  width={Math.max(1, cellWidth * 24 - 1)}
                  height={rowHeight - 1}
                  rx={1.5}
                  fill={`url(#${hatchId})`}
                />
              ) : (
                HOURS.map((h) => (
                  <rect
                    key={h}
                    x={x(h) + 0.5}
                    y={y(rowIndex) + 0.5}
                    width={Math.max(1, cellWidth - 1)}
                    height={rowHeight - 1}
                    rx={1.5}
                    style={{ fill: shareFill(row.values[h - 1] ?? null) }}
                  />
                ))
              )}
            </g>
          ))}
          {approximateRuns.map((run) => (
            // One dashed frame round each block of approximate rows: the shades inside are figures, and approximate ones.
            <rect
              key={run.from}
              data-approximate-frame
              x={x(1) - 1}
              y={y(run.from) - 1}
              width={Math.max(1, cellWidth * 24 + 2)}
              height={run.rows * rowHeight + 2}
              rx={2.5}
              fill="none"
              className="stroke-ink"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
          ))}
          {line && points ? (
            <polyline
              points={points}
              fill="none"
              className="stroke-ink"
              strokeWidth={2}
              strokeLinejoin="round"
              style={{ paintOrder: "stroke" }}
            />
          ) : null}
          <rect
            x={x(hour)}
            y={top - 2}
            width={cellWidth}
            height={rows.length * rowHeight + 4}
            rx={2}
            fill="none"
            className="stroke-ink"
            strokeWidth={1.5}
          />
          {at ? (
            <rect
              x={x(at.hour)}
              y={y(at.row)}
              width={cellWidth}
              height={rowHeight}
              rx={1.5}
              fill="none"
              className="stroke-ink"
              strokeWidth={2}
            />
          ) : null}
          {[3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <text key={h} x={x(h) + cellWidth / 2} y={height - 5} textAnchor="middle" className={AXIS_TEXT}>
              {String(h).padStart(2, "0")}
            </text>
          ))}
        </svg>
        <p aria-live="polite" className={cn("min-h-[1.3125rem] text-small", readout ? "text-ink" : "text-ink-muted")}>
          {readout ?? `Hours are UTC. ${utcLabel(hour)} is chosen${line ? `; the line is ${line.label}` : ""}.`}
        </p>
      </section>
      <ShareLegend what={what} notModelled={anyNotModelled} approximate={anyApproximate} />
      <div id={tableId} className="sr-only">
        <table>
          <caption>{name}</caption>
          <thead>
            <tr>
              <th scope="col">Hour UTC</th>
              {rows.map((row) => (
                <th key={row.label} scope="col">
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <th scope="row">{utcLabel(h)}</th>
                {rows.map((row) => (
                  <td key={row.label}>
                    {row.notModelled ? NOT_MODELLED : `${percent(row.values[h - 1] ?? null)}${row.approximate ? ` (${APPROXIMATE})` : ""}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Round numbers across a range: steps of 1, 2, 2.5 or 5 times a power of ten, about five of them. */
export function roundTicks(low: number, high: number): number[] {
  const rough = (high - low) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? rough;
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high + step * 1e-9; tick += step) ticks.push(Number(tick.toFixed(6)));
  return ticks;
}

// ── Lines through the day ───────────────────────────────────────────────────

export interface LineSeries {
  label: string;
  /** A chart token: "var(--chart-1)". The same thing keeps the same colour across the screen. */
  color: string;
  values: Array<number | null>;
  dashed?: boolean;
}

/**
 * One to four quantities on one scale through the 24 hours. A band may be drawn round
 * the first line (the span between a bad day and a good one) and a level marked across
 * the chart (what a mode needs).
 */
export function HourLines({
  series,
  hour,
  onHour,
  name,
  format,
  domain,
  band,
  level,
  height = 190,
}: {
  series: LineSeries[];
  hour: number;
  onHour: (hour: number) => void;
  name: string;
  format: (value: number) => string;
  /** The lowest and highest value of the scale. Worked out from the data when left out. */
  domain?: [number, number];
  band?: { low: Array<number | null>; high: Array<number | null>; label: string };
  level?: { value: number; label: string };
  height?: number;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  const right = 12;
  const top = 10;
  const bottom = 22;

  const all = [
    ...series.flatMap((item) => item.values),
    ...(band ? [...band.low, ...band.high] : []),
    ...(level ? [level.value] : []),
  ].filter((value): value is number => value !== null);
  let [low, high] = domain ?? [Math.min(...all), Math.max(...all)];
  if (high <= low) high = low + 1;
  const ticks = roundTicks(low, high);
  if (!domain) {
    // The scale runs to the round numbers on either side of the data.
    const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : 1;
    low = Math.floor(low / step) * step;
    high = Math.ceil(high / step) * step;
    if (ticks[0]! > low) ticks.unshift(low);
    if (ticks[ticks.length - 1]! < high) ticks.push(high);
  }
  // Room for the longest label on the scale, at about 6.5 px a character.
  const left = Math.max(36, Math.round(Math.max(...ticks.map((tick) => format(tick).length)) * 6.5) + 12);
  const x = (h: number) => left + ((h - 1) / 23) * (width - left - right);
  const y = (value: number) => top + (1 - (value - low) / (high - low)) * (height - top - bottom);
  const path = (values: Array<number | null>) => {
    let d = "";
    let pen = false;
    values.forEach((value, index) => {
      if (value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(index + 1).toFixed(1)},${y(value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const area = band
    ? band.high.map((value, index) => `${index === 0 ? "M" : "L"}${x(index + 1).toFixed(1)},${y(value ?? low).toFixed(1)}`).join("") +
      [...band.low]
        .map((value, index) => `L${x(index + 1).toFixed(1)},${y(value ?? low).toFixed(1)}`)
        .reverse()
        .join("") +
      "Z"
    : "";

  const shown = hover ?? hour;
  const hourAt = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.min(24, Math.max(1, Math.round(((event.clientX - box.left - left) / (width - left - right)) * 23) + 1));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onHour(Math.min(24, Math.max(1, hour + (event.key === "ArrowLeft" ? -1 : 1))));
    }
  };
  const readout = `${utcLabel(shown)} UTC: ${series.map((item) => `${series.length > 1 ? `${item.label} ` : ""}${item.values[shown - 1] === null || item.values[shown - 1] === undefined ? "no figure" : format(item.values[shown - 1]!)}`).join(", ")}${band && band.low[shown - 1] !== null && band.high[shown - 1] !== null ? ` (${band.label}: ${format(band.low[shown - 1]!)} to ${format(band.high[shown - 1]!)})` : ""}`;

  return (
    <div>
      <section
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is read with the arrow keys
        tabIndex={0}
        aria-label={`${name}. Left and right arrow keys move through the hours.`}
        aria-describedby={tableId}
        onKeyDown={onKey}
        className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg
          width={width}
          height={height}
          className="block touch-pan-y select-none"
          aria-hidden
          onPointerMove={(event) => setHover(hourAt(event))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(event) => onHour(hourAt(event))}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--chart-grid)" }} />
              <text x={left - 6} y={y(tick) + 4} textAnchor="end" className={AXIS_TEXT}>
                {format(tick)}
              </text>
            </g>
          ))}
          {[3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <text key={h} x={x(h)} y={height - 5} textAnchor="middle" className={AXIS_TEXT}>
              {String(h).padStart(2, "0")}
            </text>
          ))}
          {band ? <path d={area} style={{ fill: series[0]!.color, opacity: 0.14 }} /> : null}
          {level ? (
            <g>
              <line
                x1={left}
                x2={width - right}
                y1={y(level.value)}
                y2={y(level.value)}
                className="stroke-ink-muted"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <text
                x={width - right}
                y={y(level.value) - 5}
                textAnchor="end"
                className="tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
              >
                {level.label}
              </text>
            </g>
          ) : null}
          {series.map((item) => (
            <path
              key={item.label}
              d={path(item.values)}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={item.dashed ? "6 4" : undefined}
              style={{ stroke: item.color }}
            />
          ))}
          <line
            x1={x(shown)}
            x2={x(shown)}
            y1={top}
            y2={height - bottom}
            className="stroke-ink"
            strokeWidth={1}
            opacity={hover === null ? 0.45 : 1}
          />
          {series.map((item) => {
            const value = item.values[shown - 1];
            return value === null || value === undefined ? null : (
              <circle
                key={item.label}
                cx={x(shown)}
                cy={y(value)}
                r={4.5}
                strokeWidth={2}
                className="stroke-page"
                style={{ fill: item.color }}
              />
            );
          })}
        </svg>
        <p aria-live="polite" className="tabular min-h-[1.3125rem] text-small text-ink">
          {readout}
        </p>
      </section>
      {series.length > 1 || band ? (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted" aria-label="What the lines are">
          {series.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <svg aria-hidden width="18" height="10" viewBox="0 0 18 10" className="shrink-0">
                <line
                  x1="1"
                  x2="17"
                  y1="5"
                  y2="5"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={item.dashed ? "5 3" : undefined}
                  style={{ stroke: item.color }}
                />
              </svg>
              {item.label}
            </li>
          ))}
          {band ? (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-[18px] rounded-[2px]" style={{ background: series[0]!.color, opacity: 0.2 }} />
              {band.label}
            </li>
          ) : null}
        </ul>
      ) : null}
      <div id={tableId} className="sr-only">
        <table>
          <caption>{name}</caption>
          <thead>
            <tr>
              <th scope="col">Hour UTC</th>
              {series.map((item) => (
                <th key={item.label} scope="col">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <th scope="row">{utcLabel(h)}</th>
                {series.map((item) => (
                  <td key={item.label}>
                    {item.values[h - 1] === null || item.values[h - 1] === undefined ? "no figure" : format(item.values[h - 1]!)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ranking at one hour ─────────────────────────────────────────────────────

export interface BarRow {
  label: string;
  share: number | null;
  /** Said after the share: the ratio, the mode. */
  detail: string;
  marked?: boolean;
  /** The antenna is not modelled on this row: no bar and no figure, and the detail says why. */
  notModelled?: boolean;
  /** The row's figure is approximate: the bar is striped and framed with a dashed line, and the figure carries "≈". */
  approximate?: boolean;
}

/** Rows ranked by a share of days, as bars from a common left edge with the figure written beside each. */
export function ShareBars({ rows, name }: { rows: BarRow[]; name: string }) {
  return (
    <ul className="grid gap-1.5" aria-label={name}>
      {rows.map((row) => (
        <li
          key={row.label}
          className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 text-small sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,14rem)]"
        >
          <span className={cn("tabular text-ink-muted", row.marked && "font-semibold text-ink")}>{row.label}</span>
          {row.notModelled ? (
            // No track and no percentage: a band with no figure must not look like a band at nought.
            <span data-not-modelled className="flex items-center gap-2 text-ink-muted">
              <span className="h-3 flex-1 rounded-[2px] border border-dashed border-border-strong" aria-hidden />
              <span className="shrink-0">Not modelled</span>
            </span>
          ) : row.approximate ? (
            <span data-approximate className="flex items-center gap-2">
              <span className="h-3 flex-1 rounded-[2px] border border-dashed border-ink bg-surface-strong" aria-hidden>
                <span
                  className="block h-full rounded-r-[3px] rounded-l-[1px]"
                  style={{
                    width: `${Math.round((row.share ?? 0) * 100)}%`,
                    background: "repeating-linear-gradient(135deg, var(--chart-1) 0 3px, transparent 3px 5px)",
                  }}
                />
              </span>
              <span className="tabular w-12 shrink-0 text-right text-ink">
                <span className="sr-only">approximately </span>
                <span aria-hidden>{APPROXIMATE_SIGN}</span>
                {row.share === null ? "–" : percent(row.share)}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="h-3 flex-1 rounded-[2px] bg-surface-strong" aria-hidden>
                <span
                  className="block h-3 rounded-r-[4px] rounded-l-[1px]"
                  style={{ width: `${Math.round((row.share ?? 0) * 100)}%`, background: "var(--chart-1)" }}
                />
              </span>
              <span className="tabular w-12 shrink-0 text-right text-ink">{row.share === null ? "–" : percent(row.share)}</span>
            </span>
          )}
          <span className="tabular col-span-2 truncate text-ink-muted sm:col-span-1">{row.detail}</span>
        </li>
      ))}
    </ul>
  );
}
