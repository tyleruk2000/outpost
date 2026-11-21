/**
 * A coverage map written out as a PDF: the picture of the map with its cells shaded as
 * the screen shades them, the legend with the count of cells in each class, what was
 * asked, the size of the grid, the same grid again in figures, and the caveats.
 *
 * Nothing here works anything out about propagation. Each cell is one answer from the
 * engine and is put in its class by the rule the screen uses (`coverageClasses` in
 * `@outpost/shared`). A cell with no figure at the hour shown is never given one: on
 * the picture it has no shade, and in the figures it is a dash, or a cross where the
 * engine did not answer for the cell at all.
 *
 * The picture alone would carry the values by colour only, which a grey printer and a
 * search of the file both lose. So the second part of the page is the grid in figures:
 * one character to a cell, north at the top, as real text.
 */
import {
  bandOf,
  type CoverageQuantity,
  type CoverageResult,
  coverageClasses,
  coverageClassOf,
  coverageValue,
  NOISE_ENVIRONMENTS,
  utcLabel,
} from "@outpost/shared";
import { mercatorX, mercatorY } from "@/features/maps/print/scale";
import { INK, MUTED, type Rgb, type SheetItem } from "@/features/maps/print/sheet";
import { appLocale } from "@/lib/region";
import type { Block } from "../plans/document";

/**
 * The five shades on paper, lowest class first: the light theme's `--chart-seq-1` to
 * `-5` (styles/tokens.css) as sRGB. Paper is light whatever the screen is set to. They
 * are one hue from pale to dark, so they stay in order when printed in grey.
 */
export const PAPER_SHADES = ["#d2eef0", "#99d4d7", "#50afb4", "#00868c", "#005459"] as const;
/** The colour of land on the light map, which shows through a cell. */
const LAND: Rgb = [0xec / 255, 0xef / 255, 0xef / 255];
/** As solid as a cell is drawn (`CELL_OPACITY` in map/layers.ts). */
const CELL_OPACITY = 0.62;

const QUANTITY_LABEL: Record<CoverageQuantity, string> = {
  reliability: "Reliability",
  snr: "Signal to noise",
  signal: "Signal strength",
};

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
const mhz = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)} MHz`;
const km = (value: number) => (value >= 100 ? `${Math.round(value)} km` : `${value.toFixed(1)} km`);
const count = (cells: number) => `${cells.toLocaleString("en-GB")} ${cells === 1 ? "cell" : "cells"}`;
/** The PDF's typeface has no true minus sign; a hyphen stands for it on paper. */
const plain = (text: string) => text.replace(/−/g, "-");

/** Exactly what the number behind a shade is, for the legend. The screen says the same words. */
export function quantityMeaning(result: CoverageResult, quantity: CoverageQuantity): string {
  const { mode } = result;
  const needs = mode.requiredSnrDbHz === null ? "" : `${mode.requiredSnrDbHz} dB in a 1 Hz bandwidth`;
  if (quantity === "reliability")
    return `The share of the days of the month on which the signal-to-noise ratio at the cell's centre is predicted to reach what ${mode.label} needs (${needs}). It is the engine's own figure, and it is not the chance of a contact.`;
  if (quantity === "snr")
    return `The median signal-to-noise ratio in a 1 Hz bandwidth at the cell's centre, less the ${needs} that ${mode.label} needs. Zero is exactly enough on the median day; on half the days the ratio is lower.`;
  return "The median signal power at the receiving antenna at the cell's centre, as an S-meter reading by the convention S9 = −73 dBm and 6 dB to the unit. Real S-meters seldom follow it closely.";
}

export const belowLowest = (quantity: CoverageQuantity): string =>
  quantity === "reliability" ? "Under 10%" : quantity === "snr" ? "More than 20 dB short" : "Below S1";

/** What stands for a cell in the grid of figures. */
export const NO_PATH = "-";
export const NOT_ANSWERED = "x";

/** The class of every cell at an hour: 1 to 5, 0 for below the lowest class, "-" for no path, "x" for a cell the engine did not answer. */
export function cellMarks(result: CoverageResult, quantity: CoverageQuantity, utcHour: number): string[] {
  const classes = coverageClasses(quantity);
  return result.cells.map((cell) => {
    if (!cell) return NOT_ANSWERED;
    const value = coverageValue(cell, quantity, utcHour, result.mode.requiredSnrDbHz);
    if (value === null || !Number.isFinite(value)) return NO_PATH;
    return String(coverageClassOf(classes, value) + 1);
  });
}

/** "HF coverage, London, 40 m, reliability at 12:00 UTC, for 16 Nov 2026" */
export function coverageTitle(result: CoverageResult, quantity: CoverageQuantity, utcHour: number): string {
  const { tx, frequencyMhz, date } = result.request;
  return `HF coverage, ${tx.name}, ${bandOf(frequencyMhz)?.label ?? mhz(frequencyMhz)}, ${QUANTITY_LABEL[quantity].toLowerCase()} at ${utcLabel(utcHour)} UTC, for ${shortDate.format(dateOf(date))}`;
}

/** The area the grid covers, as [west, south, east, north]. */
export function gridBox(result: CoverageResult): [number, number, number, number] {
  const { grid } = result;
  return [grid.west, grid.south, grid.west + grid.columns * grid.lonStep, grid.south + grid.rows * grid.latStep];
}

export interface MapBox {
  /** On the page, in points. */
  width: number;
  height: number;
}

/**
 * The size of the map's picture on the page: the shape the area has on the map (taller
 * towards the poles than its degrees suggest), as wide as the text unless that would
 * make it taller than `maxHeight`.
 */
export function mapBox(result: CoverageResult, innerWidth: number, maxHeight = 330): MapBox {
  const [west, south, east, north] = gridBox(result);
  const aspect = (mercatorX(east) - mercatorX(west)) / Math.max(1e-9, mercatorY(south) - mercatorY(north));
  const height = Math.min(maxHeight, innerWidth / aspect);
  return { width: Math.min(innerWidth, height * aspect), height };
}

const rgbOf = (hex: string): Rgb => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255) as unknown as Rgb;
/** A shade as it looks on the map, where the land shows through it. */
const onLand = (hex: string): Rgb =>
  rgbOf(hex).map((part, index) => part * CELL_OPACITY + LAND[index]! * (1 - CELL_OPACITY)) as unknown as Rgb;

/**
 * The map's picture: its size on the page (see `mapBox`), and the pieces it was drawn
 * in, each by its id among the pictures given to the PDF writer and its place inside
 * the box, in points. One piece on any device tried; more where a device draws small.
 */
export interface MapPictureBox extends MapBox {
  pieces: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}

/**
 * The coverage map as blocks, in reading order. Without a picture (the device could
 * not draw it) the page says so and the grid of figures stands alone.
 */
export function coverageDocument(
  result: CoverageResult,
  quantity: CoverageQuantity,
  utcHour: number,
  picture: MapPictureBox | null,
): Block[] {
  const { request, mode, grid, basis } = result;
  const classes = coverageClasses(quantity);
  const marks = cellMarks(result, quantity, utcHour);
  const tally = (mark: string) => marks.filter((item) => item === mark).length;
  const [west, south, east, north] = gridBox(result);
  const band = bandOf(request.frequencyMhz);
  const f = `${mhz(request.frequencyMhz)}${band ? ` (${band.label})` : ""}`;
  const noise = NOISE_ENVIRONMENTS.find((item) => item.id === request.noise)?.label.toLowerCase() ?? request.noise;
  const corners = `from ${south.toFixed(2)}, ${west.toFixed(2)} at the south-west corner to ${north.toFixed(2)}, ${east.toFixed(2)} at the north-east`;

  const legend: Array<{ mark: string; label: string; fill: Rgb | null; cells: number }> = [
    ...[...classes.entries()].reverse().map(([index, item]) => ({
      mark: String(index + 1),
      label: item.label,
      fill: onLand(PAPER_SHADES[index]!),
      cells: tally(String(index + 1)),
    })),
    { mark: "0", label: `${belowLowest(quantity)}: no shade`, fill: null, cells: tally("0") },
    ...(tally(NO_PATH) > 0 ? [{ mark: NO_PATH, label: "No path found at this hour: no shade", fill: null, cells: tally(NO_PATH) }] : []),
    ...(tally(NOT_ANSWERED) > 0
      ? [{ mark: NOT_ANSWERED, label: "Not answered by the engine: crossed through", fill: null, cells: tally(NOT_ANSWERED) }]
      : []),
  ];

  const blocks: Block[] = [
    { kind: "title", text: `HF coverage: ${request.tx.name}, ${f}${result.approximate ? ", approximate" : ""}` },
    {
      kind: "para",
      text: `${QUANTITY_LABEL[quantity]} at ${utcLabel(utcHour)} UTC, for ${longDate.format(dateOf(request.date))}. The model works by month, so this is a map for any day of ${monthYear.format(dateOf(request.date))}. Transmitter: ${request.tx.name} (${request.tx.lat}, ${request.tx.lon}), ${request.powerWatts} W, ${mode.label}${
        mode.requiredSnrDbHz === null ? ", which has no stated requirement" : `, taken to need ${mode.requiredSnrDbHz} dB in 1 Hz`
      }.`,
    },
  ];

  if (picture) {
    blocks.push({
      kind: "drawing",
      height: picture.height,
      words: `The map shows the area ${corners}, with each cell shaded by its class.`,
      draw: (x, y) => [
        ...picture.pieces.map(
          (piece): SheetItem => ({ kind: "image", id: piece.id, x: x + piece.x, y: y + piece.y, width: piece.width, height: piece.height }),
        ),
        { kind: "rect", x, y, width: picture.width, height: picture.height, stroke: INK, lineWidth: 0.6 },
      ],
    });
  } else {
    blocks.push({
      kind: "para",
      text: `The picture of the map could not be drawn on this device, so this page has the grid in figures only. The area runs ${corners}.`,
    });
  }

  // An approximate map says so with its legend, where the shades are read.
  if (result.approximate) blocks.push({ kind: "para", text: `Approximate map: every figure on it is. ${result.approximate}` });
  blocks.push({
    kind: "drawing",
    height: legend.length * 12 + 2,
    words: legend.map((row) => `${row.mark}: ${row.label} (${count(row.cells)})`).join("; "),
    draw: (x, y) =>
      legend.flatMap((row, index): SheetItem[] => {
        const top = y + index * 12;
        return [
          row.fill
            ? { kind: "rect", x, y: top, width: 9, height: 9, fill: row.fill, stroke: MUTED, lineWidth: 0.4 }
            : { kind: "rect", x, y: top, width: 9, height: 9, stroke: MUTED, lineWidth: 0.4, dash: [1.5, 1.5] },
          // The figure this class has in the grid below, so that a shade printed in grey can still be told.
          { kind: "text", x: x + 16, y: top + 7.5, text: row.mark, size: 8, mono: true, bold: true, color: INK },
          { kind: "text", x: x + 28, y: top + 7.5, text: row.label, size: 8.5, color: INK },
          { kind: "text", x: x + 250, y: top + 7.5, text: count(row.cells), size: 8.5, color: MUTED, anchor: "end" },
        ];
      }),
  });
  blocks.push(
    { kind: "para", text: plain(quantityMeaning(result, quantity)) },
    {
      kind: "para",
      text: `The grid is ${grid.columns} × ${grid.rows} cells of ${grid.lonStep.toFixed(2)}° of longitude by ${grid.latStep.toFixed(2)}° of latitude, about ${km(grid.cellWidthKm)} by ${km(grid.cellHeightKm)} in the middle of the area, inside the dashed line. Each cell is one answer from the engine, for a receiver at the cell's centre. Nothing is smoothed and nothing is filled in between cells.`,
    },
  );

  // ── The same grid in figures ──
  const rows: string[][] = [];
  for (let row = grid.rows - 1; row >= 0; row -= 1) {
    const latitude = grid.south + (row + 0.5) * grid.latStep;
    rows.push([latitude.toFixed(2), marks.slice(row * grid.columns, (row + 1) * grid.columns).join(" ")]);
  }
  blocks.push(
    { kind: "heading", text: "The same grid in figures" },
    { kind: "table", head: ["Lat", "West to east"], right: [0], rows },
    {
      kind: "para",
      text: `One character to a cell, north at the top, each row with the latitude of its cells' centres. The columns run from ${(west + grid.lonStep / 2).toFixed(2)}° at the left to ${(east - grid.lonStep / 2).toFixed(2)}° at the right. The figures are the classes of the legend: 5 is the highest, 0 is below the lowest${
        tally(NO_PATH) > 0 ? `, ${NO_PATH} is a cell with no path at this hour` : ""
      }${tally(NOT_ANSWERED) > 0 ? `, ${NOT_ANSWERED} is a cell the engine did not answer` : ""}.`,
    },
  );

  blocks.push(
    { kind: "heading", text: "What this map rests on" },
    { kind: "para", text: `${basis.summary} It is not a reading of the ionosphere on the day.` },
    {
      kind: "list",
      items: [
        `Transmitting antenna: ${result.antennas.tx}`,
        `At every receiver: ${result.antennas.rx}; ${noise} noise`,
        ...result.unanswered.slice(0, 5).map((item) => `Cell ${item.index + 1} was not answered: ${item.reason}`),
        ...(result.unanswered.length > 5 ? [`${result.unanswered.length - 5} more cells were not answered.`] : []),
      ],
    },
    { kind: "heading", text: "Before relying on it" },
    { kind: "list", items: result.limits.map(plain) },
    {
      kind: "para",
      text: `Worked out by ${result.engine.model}, run by ${result.engine.implementation}, from ${result.datasets.map((item) => `${item.id} ${item.version}`).join("; ")}, on ${longDate.format(new Date(result.computedAt))} at ${new Date(result.computedAt).toISOString().slice(11, 16)} UTC (${count(result.cells.length)}). Key ${result.key}.`,
    },
  );
  return blocks;
}

export const coverageFooter = (result: CoverageResult): string =>
  `${result.request.tx.name}, ${mhz(result.request.frequencyMhz)} · VOACAP monthly median for ${monthYear.format(dateOf(result.request.date))}, not the conditions on the day · Outpost`;
