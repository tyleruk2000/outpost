/**
 * A coverage map on paper, laid out with the print kit: the picture of the map with its
 * legend, the same grid again as shaded cells with each cell's class written in it (so
 * the shade is never the only mark, and a search finds the figures), and what the map
 * rests on. The words are the map's own blocks (coverage-map/coverage-document.ts).
 */
import type { CoverageQuantity, CoverageResult } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  blocksToContent,
  bullets,
  PRINT_COLOURS as C,
  callout,
  drawing,
  figure,
  label,
  measureOf,
  note,
  para,
  printDocument,
  round,
  sectionHeader,
  sheetItemsToSvg,
  svgText,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import {
  cellMarks,
  coverageDocument,
  coverageTitle,
  type MapPictureBox,
  NO_PATH,
  NOT_ANSWERED,
  PAPER_SHADES,
} from "../coverage-map/coverage-document";
import type { PredictionPaper } from "../prediction-document";
import { groupsOf } from "./prediction-print";
import { kept } from "./radio-parts";

const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });

/** A JPEG's bytes as a data address, for a picture in the PDF. */
export function jpegAddress(jpeg: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < jpeg.length; index += 0x8000) binary += String.fromCharCode(...jpeg.subarray(index, index + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** The grid, north at the top, each cell shaded by its class with the class written in it. */
export function gridDrawing(result: CoverageResult, quantity: CoverageQuantity, utcHour: number, width: number) {
  const { grid } = result;
  const marks = cellMarks(result, quantity, utcHour);
  const left = 34;
  const cell = Math.min(22, (width - left) / grid.columns);
  const height = cell * grid.rows + 4;
  const size = Math.max(4.5, Math.min(8, cell * 0.55));
  let body = "";
  for (let row = 0; row < grid.rows; row += 1) {
    const y = (grid.rows - 1 - row) * cell;
    const latitude = grid.south + (row + 0.5) * grid.latStep;
    if (grid.rows <= 24 || row % 2 === 0)
      body += svgText(left - 4, y + cell / 2 + 2.4, latitude.toFixed(2), { anchor: "end", size: 6, fill: C.muted });
    for (let column = 0; column < grid.columns; column += 1) {
      const mark = marks[row * grid.columns + column] ?? NOT_ANSWERED;
      const level = Number(mark);
      const fill = Number.isInteger(level) && level >= 1 ? PAPER_SHADES[level - 1]! : "#ffffff";
      const x = left + column * cell;
      body += `<rect x="${round(x)}" y="${round(y)}" width="${round(cell)}" height="${round(cell)}" fill="${fill}" stroke="#ffffff" stroke-width="0.6"/>`;
      if (mark === NOT_ANSWERED)
        body += `<path d="M${round(x + 2)},${round(y + 2)} L${round(x + cell - 2)},${round(y + cell - 2)} M${round(x + cell - 2)},${round(y + 2)} L${round(x + 2)},${round(y + cell - 2)}" stroke="${C.muted}" stroke-width="0.5"/>`;
      body += svgText(x + cell / 2, y + cell / 2 + size * 0.36, mark, {
        anchor: "middle",
        size,
        bold: level >= 1,
        fill: level >= 4 ? "#ffffff" : mark === NO_PATH || mark === NOT_ANSWERED ? C.muted : C.ink,
      });
    }
  }
  body += `<rect x="${left}" y="0" width="${round(cell * grid.columns)}" height="${round(cell * grid.rows)}" fill="none" stroke="${C.muted}" stroke-width="0.6"/>`;
  return drawing(Math.ceil(left + cell * grid.columns + 2), Math.ceil(height), body);
}

export interface CoveragePrintInput {
  result: CoverageResult;
  quantity: CoverageQuantity;
  utcHour: number;
  paper: PredictionPaper;
  picture: MapPictureBox | null;
  /** The picture's pieces as data addresses, by id. */
  pictures?: ReadonlyMap<string, string>;
}

export function coveragePrint(input: CoveragePrintInput): TDocumentDefinitions {
  const { result, quantity, utcHour, paper, picture } = input;
  const measure = measureOf(paper);
  const blocks = coverageDocument(result, quantity, utcHour, picture);
  const groups = groupsOf(blocks);
  const opening = groups.get("") ?? [];
  const title = opening[0]?.kind === "title" ? opening[0].text.replace(/^HF coverage: /, "") : "";
  const content: Content[] = [
    sectionHeader(
      {
        number: 1,
        title,
        subtitle: `HF coverage for any day of ${monthYear.format(new Date(`${result.request.date}T00:00:00Z`))}`,
        id: "coverage",
      },
      measure,
    ),
  ];
  for (const block of opening.slice(1)) {
    if (block.kind === "drawing") {
      const isMap = block.words?.startsWith("The map shows");
      const items = block.draw(0, 0, measure);
      const width = isMap && picture ? picture.width : measure;
      content.push(
        figure(sheetItemsToSvg(items, { x: 0, y: 0, width, height: block.height }, input.pictures), {
          width: Math.min(width, measure),
          title: isMap ? undefined : "Legend",
          caption: isMap ? block.words : undefined,
        }),
      );
    } else if (block.kind === "para" && block.text.startsWith("Approximate map"))
      content.push(callout("warn", "Approximate", para(block.text)));
    else if (block.kind === "para" && block.text.startsWith("The picture of the map could not"))
      content.push(callout("know", "No picture", para(block.text)));
    else if (block.kind === "para") content.push(para(block.text));
  }

  const figures = groups.get("The same grid in figures") ?? [];
  content.push(
    kept(
      label("The same grid, cell by cell"),
      { svg: gridDrawing(result, quantity, utcHour, measure).svg, margin: [0, 2, 0, 4] } as Content,
      ...figures.filter((block) => block.kind === "para").map((block) => note(block.kind === "para" ? block.text : "")),
    ),
  );

  const rests = groups.get("What this map rests on") ?? [];
  content.push(
    callout(
      "know",
      "What this map rests on",
      rests.flatMap((block) => (block.kind === "list" ? [bullets(block.items)] : blocksToContent([block], measure))),
    ),
  );
  const before = groups.get("Before relying on it") ?? [];
  content.push(
    callout(
      "warn",
      "Before relying on it",
      before.filter((block) => block.kind === "list").flatMap((block) => (block.kind === "list" ? [bullets(block.items)] : [])),
    ),
    ...before.filter((block) => block.kind === "para").map((block) => note(block.kind === "para" ? block.text : "")),
  );

  return printDocument({
    paper,
    title: coverageTitle(result, quantity, utcHour),
    made: new Date(result.computedAt),
    footerName: `HF coverage · ${result.request.tx.name}`,
    footerRight: `VOACAP median for ${monthYear.format(new Date(`${result.request.date}T00:00:00Z`))}`,
    parts: [{ kind: "section", running: `1 · ${title}`, content }],
  });
}
