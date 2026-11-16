/**
 * The printed page as a list of things to draw: the pictures of the map, its border,
 * the ticks and figures of the graticule round it, and the strip underneath with the
 * title, date, scale bars, north and the credits.
 *
 * The list is all there is. The preview on screen draws it as SVG and the PDF writer
 * draws it as a page, so what is shown before anything is made is what is made.
 * Positions are in points from the top-left corner of the page. Text is measured with
 * the PDF's own typeface (see helvetica.ts), so lines break in the same places in both.
 */
import type { Bbox } from "@outpost/shared";
import { formatNumber } from "@/lib/utils";
import type { Graticule } from "./graticule";
import { fitText, textWidth, wrapText } from "./helvetica";
import { type PageGeometry, PT_PER_MAP_PX, PT_PER_MM } from "./paper";
import { formatPercent, formatScale, type ScaleBar, scaleBars, scaleVariation } from "./scale";

/** Red, green and blue, each from 0 to 1. Paper has no themes: these are the only colours on the page outside the map. */
export type Rgb = readonly [number, number, number];
export const INK: Rgb = [0.09, 0.12, 0.13];
export const MUTED: Rgb = [0.3, 0.35, 0.37];
export const PAPER: Rgb = [1, 1, 1];

export type SheetItem =
  | { kind: "image"; id: string; x: number; y: number; width: number; height: number }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: Rgb;
      stroke?: Rgb;
      lineWidth?: number;
      /** A broken outline, as for a line to cut along: the lengths of a dash and of the gap after it. */
      dash?: readonly [number, number];
    }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: Rgb; width: number }
  | { kind: "polygon"; points: Array<readonly [number, number]>; fill: Rgb }
  | {
      kind: "text";
      /** Where the baseline starts, is centred or ends, according to `anchor`. */
      x: number;
      y: number;
      text: string;
      size: number;
      bold?: boolean;
      /** Set in Courier, where every character is as wide as every other (see courier.ts), so that letters stand in columns. Helvetica otherwise. */
      mono?: boolean;
      color: Rgb;
      anchor?: "start" | "middle" | "end";
      /** Turned a quarter-turn to read from the bottom of the page upwards, as figures down the side of a map do. */
      upward?: boolean;
    };

export type SheetText = Extract<SheetItem, { kind: "text" }>;

export interface Sheet {
  width: number;
  height: number;
  items: SheetItem[];
}

export interface SheetInput {
  geometry: PageGeometry;
  /** The ground the map shows. */
  bbox: Bbox;
  /** The 1:n at the middle of the sheet. */
  scale: number;
  title: string;
  /** Already written out: "16 November 2026". */
  date: string;
  /** One line of credits for everything drawn, written out in full (see credits.ts). */
  credits: string;
  graticule: Graticule;
  /** The pictures the map is made of, placed in the map's own pixels from its top-left corner. */
  pictures: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}

const SMALL = 6.5;
const LEADING = 8;
const TICK = 4;

function bar(items: SheetItem[], metric: ScaleBar, miles: ScaleBar, left: number, top: number): void {
  const label = (text: string, x: number, y: number): SheetItem => ({ kind: "text", x, y, text, size: 6, color: INK, anchor: "middle" });
  const last = <T>(list: T[]) => list[list.length - 1]!;

  // Kilometres: a bar of alternating black and white lengths, figures above.
  const barTop = top + 10;
  metric.ticks.slice(0, -1).forEach((tick, index) => {
    const width = metric.ticks[index + 1]!.at - tick.at;
    items.push({ kind: "rect", x: left + tick.at, y: barTop, width, height: 3, fill: index % 2 === 0 ? INK : PAPER });
  });
  items.push({ kind: "rect", x: left, y: barTop, width: metric.length, height: 3, stroke: INK, lineWidth: 0.5 });
  for (const tick of metric.ticks) {
    if (tick.label) items.push(label(tick === last(metric.ticks) ? `${tick.label} ${metric.unit}` : tick.label, left + tick.at, top + 7.5));
  }

  // Miles: a rule with ticks hanging from it, figures below.
  const rule = top + 18;
  items.push({ kind: "line", x1: left, y1: rule, x2: left + miles.length, y2: rule, color: INK, width: 0.5 });
  for (const tick of miles.ticks) {
    items.push({ kind: "line", x1: left + tick.at, y1: rule, x2: left + tick.at, y2: rule + 3, color: INK, width: 0.5 });
    if (tick.label) items.push(label(tick === last(miles.ticks) ? `${tick.label} ${miles.unit}` : tick.label, left + tick.at, rule + 9.5));
  }
}

/** "80 mm", "62.5 mm": the length a bar should measure on paper, for checking a print with a ruler. */
const millimetres = (points: number) => `${formatNumber(Number((points / PT_PER_MM).toFixed(1)))} mm`;

/** What the page says about its own scale and north. Kept apart so the dialog can say the same thing in the same words. */
export function sheetNotes(bbox: Bbox, scale: number, metric: ScaleBar): string[] {
  const variation = scaleVariation(bbox, scale);
  const exact = (value: number) => `1:${formatNumber(Math.round(value))}`;
  const latitude = `${Math.abs(variation.latitude).toFixed(2)}°${variation.latitude < 0 ? "S" : "N"}`;
  const changes =
    variation.percent < 0.005
      ? "Across this sheet it is the same to within 0.01%."
      : `It changes with latitude: ${exact(variation.top)} along the top edge and ${exact(variation.bottom)} along the bottom, ${formatPercent(variation.percent)} at most.`;
  const length = metric.meters >= 1000 ? `${formatNumber(metric.meters / 1000)} km` : `${formatNumber(metric.meters)} m`;
  return [
    `Web Mercator projection. Scale ${formatScale(scale)} along the middle of the sheet (${latitude}). ${changes}`,
    `Printed at 100% ("actual size"), the ${length} bar is ${millimetres(metric.length)} long. True north is straight up everywhere on the sheet; magnetic north is not shown.`,
  ];
}

export function layoutSheet(input: SheetInput): Sheet {
  const { geometry, graticule } = input;
  const { map, strip } = geometry;
  const items: SheetItem[] = [];

  // ── The map, its border and the graticule round it ──
  for (const picture of input.pictures) {
    items.push({
      kind: "image",
      id: picture.id,
      x: map.x + picture.x * PT_PER_MAP_PX,
      y: map.y + picture.y * PT_PER_MAP_PX,
      width: picture.width * PT_PER_MAP_PX,
      height: picture.height * PT_PER_MAP_PX,
    });
  }
  items.push({ kind: "rect", x: map.x, y: map.y, width: map.width, height: map.height, stroke: INK, lineWidth: 0.6 });

  const right = map.x + map.width;
  const bottom = map.y + map.height;
  for (const tick of graticule.longitudes) {
    const x = map.x + tick.at * map.width;
    items.push({ kind: "line", x1: x, y1: map.y - TICK, x2: x, y2: map.y, color: INK, width: 0.5 });
    items.push({ kind: "line", x1: x, y1: bottom, x2: x, y2: bottom + TICK, color: INK, width: 0.5 });
    // Kept clear of the corner, where the figures of the other edge may be.
    const half = textWidth(tick.label, 6) / 2;
    if (x - half >= map.x - 2 && x + half <= right + 2) {
      items.push({ kind: "text", x, y: map.y - TICK - 2, text: tick.label, size: 6, color: INK, anchor: "middle" });
    }
  }
  for (const tick of graticule.latitudes) {
    const y = map.y + tick.at * map.height;
    items.push({ kind: "line", x1: map.x - TICK, y1: y, x2: map.x, y2: y, color: INK, width: 0.5 });
    items.push({ kind: "line", x1: right, y1: y, x2: right + TICK, y2: y, color: INK, width: 0.5 });
    const half = textWidth(tick.label, 6) / 2;
    if (y - half >= map.y - 2 && y + half <= bottom + 2) {
      items.push({ kind: "text", x: map.x - TICK - 2, y, text: tick.label, size: 6, color: INK, anchor: "middle", upward: true });
    }
  }

  // ── The strip: north on the right, the scale beside it, the title in the room that is left ──
  const stripRight = strip.x + strip.width;

  // North: an arrowhead on a stem, with its letter.
  const arrow = stripRight - 5;
  items.push({
    kind: "polygon",
    points: [
      [arrow, strip.y + 1],
      [arrow + 4.5, strip.y + 12],
      [arrow, strip.y + 9.5],
      [arrow - 4.5, strip.y + 12],
    ],
    fill: INK,
  });
  items.push({ kind: "line", x1: arrow, y1: strip.y + 9, x2: arrow, y2: strip.y + 27, color: INK, width: 0.9 });
  items.push({ kind: "text", x: arrow - 8, y: strip.y + 10, text: "N", size: 9, bold: true, color: INK, anchor: "end" });

  // Scale: the ratio, and a bar each for kilometres and miles.
  const barRoom = Math.min(190, strip.width * 0.3);
  const { metric, miles } = scaleBars(input.scale, barRoom);
  const longest = Math.max(metric.length, miles.length);
  // Room after the bar for the last figure and its unit, which are centred on the last tick.
  const barLeft = arrow - 34 - 22 - longest;
  bar(items, metric, miles, barLeft, strip.y);
  const ratio = formatScale(input.scale);
  const ratioRight = barLeft - 14;
  items.push({ kind: "text", x: ratioRight, y: strip.y + 14, text: ratio, size: 11, bold: true, color: INK, anchor: "end" });
  items.push({ kind: "text", x: ratioRight, y: strip.y + 23.5, text: "at the middle of the sheet", size: 6, color: MUTED, anchor: "end" });

  // Title and date, cut short rather than run into the scale.
  const titleRoom = ratioRight - Math.max(textWidth(ratio, 11, true), textWidth("at the middle of the sheet", 6)) - 16 - strip.x;
  const title = input.title.trim();
  if (title) {
    items.push({ kind: "text", x: strip.x, y: strip.y + 13, text: fitText(title, 13, titleRoom, true), size: 13, bold: true, color: INK });
    items.push({ kind: "text", x: strip.x, y: strip.y + 24, text: input.date, size: 7.5, color: MUTED });
  } else {
    items.push({ kind: "text", x: strip.x, y: strip.y + 13, text: input.date, size: 10, color: INK });
  }

  // What the scale means here, then the credits. The credits are a licence condition: never cut, never dropped.
  let baseline = strip.y + 38;
  for (const note of sheetNotes(input.bbox, input.scale, metric)) {
    for (const line of wrapText(note, SMALL, strip.width)) {
      items.push({ kind: "text", x: strip.x, y: baseline, text: line, size: SMALL, color: MUTED });
      baseline += LEADING;
    }
  }
  baseline += 1;
  for (const line of wrapText(input.credits, SMALL, strip.width)) {
    items.push({ kind: "text", x: strip.x, y: baseline, text: line, size: SMALL, color: INK });
    baseline += LEADING;
  }

  return { width: geometry.width, height: geometry.height, items };
}

/** Every word on the sheet, in drawing order: for the preview's accessible description and for tests. */
export function sheetWords(sheet: Sheet): string[] {
  return sheet.items.filter((item): item is SheetText => item.kind === "text").map((item) => item.text);
}

/** The lowest point anything on the sheet reaches, to check that nothing runs off the paper. */
export function sheetBottom(sheet: Sheet): number {
  let lowest = 0;
  for (const item of sheet.items) {
    if (item.kind === "text") lowest = Math.max(lowest, item.y + item.size * 0.25);
    else if (item.kind === "line") lowest = Math.max(lowest, item.y1, item.y2);
    else if (item.kind === "polygon") lowest = Math.max(lowest, ...item.points.map((point) => point[1]));
    else lowest = Math.max(lowest, item.y + item.height);
  }
  return lowest;
}
