/**
 * A sheet of guidance to print and keep, laid out with the print kit
 * (features/print-kit): numbered sections, callouts, steps, tables and drawings, in the
 * household book's look. `guidanceDocument` makes the document from sections a screen
 * builds; `kitBlocks` prints old `Block`s in the kit's look while a sheet moves to the
 * kit's components; `sourcesBlock` sets the sources small at the end.
 *
 * The sheets are dated by when their guidance was read, not by the clock, so the same
 * sheet made twice is the same file.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  blocksToContent,
  bullets,
  label,
  measureOf,
  PRINT_COLOURS,
  PRINT_TYPE,
  type PrintPaper,
  printDocument,
  sectionHeader,
} from "@/features/print-kit";
import type { Block } from "@/features/propagation/plans/document";
import type { Source } from "./result";

export type { Block };

/** Characters the old writer's typeface lacked, written as it can: fractions spelt out, the minus sign as a hyphen. */
export function plainForPdf(text: string): string {
  return text
    .replace(/⅛/g, "1/8")
    .replace(/⅓/g, "1/3")
    .replace(/⅔/g, "2/3")
    .replace(/[−–]/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/→/g, "->")
    .replace(/²/g, "2")
    .replace(/³/g, "3");
}

function plainBlock(block: Block): Block {
  if (block.kind === "list") return { ...block, items: block.items.map(plainForPdf) };
  if (block.kind === "table") return { ...block, head: block.head.map(plainForPdf), rows: block.rows.map((row) => row.map(plainForPdf)) };
  if (block.kind === "drawing") return block;
  return { ...block, text: plainForPdf(block.text) };
}

/** Old blocks, in the kit's look. */
export const kitBlocks = (blocks: Block[], measure: number): Content[] => blocksToContent(blocks.map(plainBlock), measure);

export interface GuidanceSection {
  title: string;
  subtitle?: string;
  content: Content[];
  /** Goes on under the last section, on the same page, instead of starting a new one. */
  runOn?: boolean;
}

export interface GuidanceSheet {
  paper: PrintPaper;
  /** The file's title, as a PDF reader shows it. */
  title: string;
  subject?: string;
  /** When its guidance was read: the file is dated by it. */
  made: Date;
  /** The footer's left: "Making water safe to drink". */
  footerName: string;
  /** The footer's right: "Read 16 November 2026". */
  footerRight: string;
  sections: GuidanceSection[];
}

/** A guidance sheet, laid out with the print kit. Pure: words in, document out. */
export function guidanceDocument(sheet: GuidanceSheet): TDocumentDefinitions {
  const measure = measureOf(sheet.paper);
  const parts: Array<{ kind: "section"; running: string; content: Content[] }> = [];
  sheet.sections.forEach((section, index) => {
    const header = sectionHeader(
      { number: index + 1, title: section.title, subtitle: section.subtitle, id: `guidance-${index + 1}` },
      measure,
    );
    const last = parts.at(-1);
    if (section.runOn && last) last.content.push({ text: "", margin: [0, 6, 0, 0] }, header, ...section.content);
    else parts.push({ kind: "section", running: `${index + 1} · ${section.title}`, content: [header, ...section.content] });
  });
  return printDocument({
    paper: sheet.paper,
    title: sheet.title,
    subject: sheet.subject,
    made: sheet.made,
    footerName: sheet.footerName,
    footerRight: sheet.footerRight,
    parts,
  });
}

/** The sources, small, under a label: each name, its address and when it was read. */
export function sourcesBlock(sources: Source[], heading = "Sources"): Content {
  return {
    stack: [
      label(heading),
      {
        ...(bullets(
          sources.map((source) => [source.name, source.url, source.read ? `read ${source.read}` : null].filter(Boolean).join(", ")),
        ) as object),
        fontSize: PRINT_TYPE.small,
        color: PRINT_COLOURS.muted,
      },
    ],
    margin: [0, 8, 0, 0],
  } as Content;
}
