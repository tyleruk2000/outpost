/**
 * The battery bank drawn as it is joined: each battery a box with its − and + terminals,
 * the batteries of a string joined + to −, the strings joined + to + and − to −, and the
 * bank's own two terminals. One layout, drawn on the screen (bank-diagram-view.tsx) and
 * in the printed plan (`bankDrawing`). A bank too big to draw battery by battery is drawn
 * as one box named for its shape, "8S3P".
 */
import { PRINT_COLOURS as C, type Drawing, drawing, round, svgText } from "@/features/print-kit";
import { bank } from "./calc/energy";
import { figure } from "./inputs";

/** Above these, the bank is drawn as one box: a string wider than four batteries stops reading at phone width. */
export const MOST_IN_SERIES_DRAWN = 4;
export const MOST_IN_PARALLEL_DRAWN = 4;

const CELL_W = 64;
const CELL_H = 38;
const LINK = 22;
const ROW_GAP = 16;
const SIDE = 40;
const TOP = 30;
const BOTTOM = 8;
const NUB = 4;
const BUS = 16;
const COMPACT_W = 150;

export interface BankCell {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

export interface BankWire {
  /** Points as "x,y x,y …". */
  points: string;
  pole: "+" | "-";
}

export interface BankLayout {
  width: number;
  height: number;
  compact: boolean;
  cells: BankCell[];
  wires: BankWire[];
  /** The bank's terminals, where the cables to the rest of the system join. */
  minus: { x: number; y: number };
  plus: { x: number; y: number };
  /** "2 in series × 2 in parallel: 25.6 V, 200 Ah, 5.12 kWh". */
  summary: string;
  /** The whole drawing in words. */
  alt: string;
  /** Said under a compact drawing. */
  note: string | null;
}

/** Watt-hours in words: Wh under a thousand, kWh from there. */
export const energyWords = (wattHours: number): string =>
  wattHours >= 1000 ? `${figure(wattHours / 1000, 2)} kWh` : `${figure(wattHours, 0)} Wh`;

/** The bank's shape in words: "1 battery", "4 in series", "2 in parallel", "2 in series × 2 in parallel". */
export function shapeWords(series: number, parallel: number): string {
  if (series === 1 && parallel === 1) return "1 battery";
  if (parallel === 1) return `${series} in series`;
  if (series === 1) return `${parallel} in parallel`;
  return `${series} in series × ${parallel} in parallel`;
}

export function bankLayout(volts: number, ampHours: number, seriesIn: number, parallelIn: number): BankLayout {
  const series = Math.max(1, Math.round(seriesIn));
  const parallel = Math.max(1, Math.round(parallelIn));
  const sizes = bank(volts, ampHours, series, parallel);
  const summary = `${shapeWords(series, parallel)}: ${figure(sizes.volts, 1)} V, ${figure(sizes.ampHours, 0)} Ah, ${energyWords(sizes.wattHours)}`;
  const one = `each ${figure(volts, 1)} V, ${figure(ampHours, 0)} Ah`;
  const joined =
    series === 1 && parallel === 1
      ? `One battery, ${figure(volts, 1)} V, ${figure(ampHours, 0)} Ah; its terminals are the bank's.`
      : parallel === 1
        ? `${series} batteries, ${one}, joined in one string, the + of each to the − of the next; the first battery's − and the last one's + are the bank's terminals.`
        : series === 1
          ? `${parallel} batteries, ${one}, joined + to + and − to −; those two joins are the bank's terminals.`
          : `${parallel} strings of ${series} batteries, ${sizes.batteries} in all, ${one}. In each string the + of each battery goes to the − of the next; the strings' ends are joined − to − and + to +, and those two joins are the bank's terminals.`;
  const compact = series > MOST_IN_SERIES_DRAWN || parallel > MOST_IN_PARALLEL_DRAWN;
  const note = compact
    ? `${series}S${parallel}P: too many to draw one by one. ${series} in each string, + to −, and ${parallel} ${parallel === 1 ? "string" : "strings"} joined + to + and − to −.`
    : null;
  const alt = `Battery bank, ${summary}. ${joined}`;

  const cells: BankCell[] = [];
  const wires: BankWire[] = [];
  const columns = compact ? 1 : series;
  const rows = compact ? 1 : parallel;
  const cellW = compact ? COMPACT_W : CELL_W;
  const width = SIDE * 2 + columns * cellW + (columns - 1) * LINK;
  const height = TOP + rows * CELL_H + (rows - 1) * ROW_GAP + BOTTOM;
  const minusBus = SIDE - BUS;
  const plusBus = width - SIDE + BUS;
  const busTop = TOP - 12;

  for (let row = 0; row < rows; row += 1) {
    const y = TOP + row * (CELL_H + ROW_GAP);
    const mid = y + CELL_H / 2;
    for (let column = 0; column < columns; column += 1) {
      const x = SIDE + column * (cellW + LINK);
      cells.push({
        x,
        y,
        width: cellW,
        height: CELL_H,
        lines: compact
          ? [`${series}S${parallel}P`, `${sizes.batteries} batteries, ${one}`]
          : [`${figure(volts, 1)} V`, `${figure(ampHours, 0)} Ah`],
      });
      // + of this battery to − of the next in the string.
      if (column < columns - 1) wires.push({ points: `${x + cellW + NUB},${mid} ${x + cellW + LINK - NUB},${mid}`, pole: "+" });
    }
    const last = SIDE + (columns - 1) * (cellW + LINK) + cellW;
    wires.push({ points: `${SIDE - NUB},${mid} ${minusBus},${mid} ${minusBus},${busTop}`, pole: "-" });
    wires.push({ points: `${last + NUB},${mid} ${plusBus},${mid} ${plusBus},${busTop}`, pole: "+" });
  }

  return { width, height, compact, cells, wires, minus: { x: minusBus, y: busTop }, plus: { x: plusBus, y: busTop }, summary, alt, note };
}

/** The same drawing for the printed plan, in the print kit's colours. */
export function bankDrawing(volts: number, ampHours: number, series: number, parallel: number): Drawing & { layout: BankLayout } {
  const layout = bankLayout(volts, ampHours, series, parallel);
  let body = "";
  for (const wire of layout.wires)
    body += `<polyline points="${wire.points}" fill="none" stroke="${wire.pole === "+" ? C.act : C.ink}" stroke-width="1.6"/>`;
  for (const cell of layout.cells) {
    const mid = cell.y + cell.height / 2;
    body += `<rect x="${cell.x - NUB}" y="${round(mid - 5)}" width="${NUB}" height="10" fill="${C.ink}"/>`;
    body += `<rect x="${cell.x + cell.width}" y="${round(mid - 5)}" width="${NUB}" height="10" fill="${C.act}"/>`;
    body += `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" rx="4" fill="${C.shade}" stroke="${C.muted}" stroke-width="1"/>`;
    body += svgText(cell.x + 6, mid + 3, "-", { bold: true, size: 9 });
    body += svgText(cell.x + cell.width - 6, mid + 3, "+", { bold: true, size: 9, anchor: "end", fill: C.act });
    cell.lines.forEach((line, index) => {
      body += svgText(cell.x + cell.width / 2, cell.y + 15 + index * 11, line, {
        anchor: "middle",
        size: index === 0 ? 8 : 7,
        bold: index === 0,
        fill: index === 0 ? C.ink : C.muted,
      });
    });
  }
  const terminal = (x: number, y: number, words: string, colour: string, anchor: "start" | "end") =>
    `<circle cx="${x}" cy="${y}" r="3" fill="${colour}"/>${svgText(anchor === "start" ? x + 6 : x - 6, y + 3, words, { size: 7.5, bold: true, anchor, fill: colour })}`;
  body += terminal(layout.minus.x, layout.minus.y, "Bank -", C.ink, "start");
  body += terminal(layout.plus.x, layout.plus.y, "Bank +", C.act, "end");
  return { ...drawing(layout.width, layout.height, body), layout };
}
