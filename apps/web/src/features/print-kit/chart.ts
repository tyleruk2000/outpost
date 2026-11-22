/**
 * Charts for printed pages: lines, bands between two lines, and bars, over a numeric x
 * axis, drawn as SVG with d3-scale and d3-shape (both ISC, a few kilobytes, no DOM, no
 * network) and labelled in the book's typeface. A gap in a series (null) is left as a
 * gap: nothing is drawn where there is no figure, and nothing is joined across one.
 *
 * Every series has its own dash as well as its colour, so a black-and-white copy keeps
 * them apart, and the key under the chart names each.
 */
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import type { Drawing } from "./diagrams";
import { drawing, round, svgKeyItem, svgText } from "./draw";
import { PRINT_COLOURS as C } from "./tokens";

export interface ChartLine {
  kind: "line";
  name: string;
  /** y for each x of the chart's `xs`, or null where there is none. */
  values: Array<number | null>;
  colour: string;
  dash?: string;
  width?: number;
  /** Straight between points (the default) or a smooth curve that does not overshoot them. */
  smooth?: boolean;
  /** A dot on every point. */
  dots?: boolean;
}

export interface ChartBand {
  kind: "band";
  name: string;
  low: Array<number | null>;
  high: Array<number | null>;
  colour: string;
  opacity?: number;
}

export interface ChartBars {
  kind: "bars";
  name: string;
  values: Array<number | null>;
  colour: string;
}

export type ChartSeries = ChartLine | ChartBand | ChartBars;

export interface ChartInput {
  width: number;
  height: number;
  xs: number[];
  series: ChartSeries[];
  /** The y axis's range; worked out from the figures when not given. */
  yDomain?: [number, number];
  xDomain?: [number, number];
  /** The words on each x tick. */
  xTick?: (x: number) => string;
  xTicks?: number[];
  yTick?: (y: number) => string;
  yTicks?: number;
  xLabel?: string;
  yLabel?: string;
  /** Horizontal lines across the chart at these y, each with its words at the right. */
  rules?: Array<{ y: number; words: string; colour?: string; dash?: string }>;
  /** Bands of x shaded across the whole height (night, say), each with words at the top. */
  spans?: Array<{ from: number; to: number; words?: string; fill: string }>;
  /** The key is drawn under the chart unless false. */
  key?: boolean;
}

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

export function chart(input: ChartInput): Drawing {
  const keyHeight = input.key === false ? 0 : 16;
  const left = input.yLabel ? 34 : 26;
  const right = input.rules?.length ? 64 : 8;
  const top = 10;
  const bottom = (input.xLabel ? 28 : 18) + keyHeight;
  const plotWidth = input.width - left - right;
  const plotHeight = input.height - top - bottom;

  const allY = input.series.flatMap((series) =>
    series.kind === "band" ? [...series.low, ...series.high].filter(finite) : series.values.filter(finite),
  );
  const yDomain: [number, number] = input.yDomain ?? [Math.min(0, ...allY), Math.max(1, ...allY)];
  const xDomain: [number, number] = input.xDomain ?? [Math.min(...input.xs), Math.max(...input.xs)];
  const x = scaleLinear()
    .domain(xDomain)
    .range([left, left + plotWidth]);
  const y = scaleLinear()
    .domain(yDomain)
    .range([top + plotHeight, top])
    .nice(input.yTicks ?? 5);
  const [y0, y1] = y.domain() as [number, number];

  let body = "";
  // Spans first, under everything.
  for (const span of input.spans ?? []) {
    const from = x(Math.max(span.from, xDomain[0]));
    const to = x(Math.min(span.to, xDomain[1]));
    if (to <= from) continue;
    body += `<rect x="${round(from)}" y="${top}" width="${round(to - from)}" height="${round(plotHeight)}" fill="${span.fill}"/>`;
    if (span.words && to - from > 24) body += svgText((from + to) / 2, top + 8, span.words, { anchor: "middle", size: 6.5, fill: C.muted });
  }
  // Grid and the y axis.
  for (const tick of y.ticks(input.yTicks ?? 5)) {
    const at = round(y(tick));
    body += `<line x1="${left}" y1="${at}" x2="${left + plotWidth}" y2="${at}" stroke="${tick === y0 ? C.muted : C.rule}" stroke-width="${tick === y0 ? 0.8 : 0.4}"/>`;
    body += svgText(left - 4, at + 2.5, input.yTick ? input.yTick(tick) : String(tick), { anchor: "end", size: 6.5, fill: C.muted });
  }
  // The x axis.
  for (const tick of input.xTicks ?? x.ticks(8)) {
    const at = round(x(tick));
    body += `<line x1="${at}" y1="${top + plotHeight}" x2="${at}" y2="${top + plotHeight + 3}" stroke="${C.muted}" stroke-width="0.6"/>`;
    body += svgText(at, top + plotHeight + 11, input.xTick ? input.xTick(tick) : String(tick), {
      anchor: "middle",
      size: 6.5,
      fill: C.muted,
    });
  }
  if (input.xLabel)
    body += svgText(left + plotWidth / 2, top + plotHeight + 22, input.xLabel, { anchor: "middle", size: 7, fill: C.muted });
  if (input.yLabel) body += svgText(8, top + plotHeight / 2, input.yLabel, { anchor: "middle", size: 7, fill: C.muted, rotate: -90 });

  const points = (values: Array<number | null>) => input.xs.map((at, index) => [at, values[index] ?? null] as const);
  for (const series of input.series) {
    if (series.kind === "band") {
      const shape = area<readonly [number, number | null, number | null]>()
        .defined((point) => finite(point[1]) && finite(point[2]))
        .x((point) => x(point[0]))
        .y0((point) => y(point[1] as number))
        .y1((point) => y(point[2] as number))
        .curve(curveMonotoneX);
      const path = shape(input.xs.map((at, index) => [at, series.low[index] ?? null, series.high[index] ?? null] as const));
      if (path) body += `<path d="${path}" fill="${series.colour}" fill-opacity="${series.opacity ?? 0.25}" stroke="none"/>`;
    } else if (series.kind === "bars") {
      const step = input.xs.length > 1 ? plotWidth / (xDomain[1] - xDomain[0] + 1) : plotWidth;
      const barWidth = Math.max(1.5, step * 0.7);
      points(series.values).forEach(([at, value]) => {
        if (!finite(value)) return;
        const height = y(y0) - y(value);
        body += `<rect x="${round(x(at) - barWidth / 2)}" y="${round(y(value))}" width="${round(barWidth)}" height="${round(Math.max(0, height))}" fill="${series.colour}"/>`;
      });
    } else {
      const shape = line<readonly [number, number | null]>()
        .defined((point) => finite(point[1]))
        .x((point) => x(point[0]))
        .y((point) => y(point[1] as number));
      if (series.smooth) shape.curve(curveMonotoneX);
      const path = shape(points(series.values));
      if (path)
        body += `<path d="${path}" fill="none" stroke="${series.colour}" stroke-width="${series.width ?? 1.6}" stroke-linejoin="round" stroke-linecap="round"${
          series.dash ? ` stroke-dasharray="${series.dash}"` : ""
        }/>`;
      if (series.dots)
        for (const [at, value] of points(series.values))
          if (finite(value))
            body += `<circle cx="${round(x(at))}" cy="${round(y(value))}" r="1.7" fill="#ffffff" stroke="${series.colour}" stroke-width="1"/>`;
    }
  }
  for (const rule of input.rules ?? []) {
    if (rule.y < y0 || rule.y > y1) continue;
    const at = round(y(rule.y));
    body += `<line x1="${left}" y1="${at}" x2="${left + plotWidth}" y2="${at}" stroke="${rule.colour ?? C.muted}" stroke-width="0.8" stroke-dasharray="${rule.dash ?? "2 2"}"/>`;
    body += svgText(left + plotWidth + 3, at + 2.5, rule.words, { size: 6.5, fill: rule.colour ?? C.muted });
  }
  // The key.
  if (input.key !== false) {
    let at = left;
    const keyY = input.height - 4;
    for (const series of input.series) {
      const item = svgKeyItem(
        at,
        keyY,
        series.kind === "line"
          ? { line: true, stroke: series.colour, dash: series.dash }
          : {
              fill: series.colour,
              stroke: series.kind === "band" ? "none" : series.colour,
              opacity: series.kind === "band" ? (series.opacity ?? 0.25) : 1,
            },
        series.name,
      );
      body += item.svg;
      at += item.width;
    }
  }
  return drawing(input.width, input.height, body);
}
