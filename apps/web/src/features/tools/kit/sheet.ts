/**
 * A sheet of guidance to print and keep: blocks of text laid out as pages by the same
 * writer the communication plans use, so it can be saved, added to the library and
 * shared through the shared buttons (features/library/made).
 */
import { writePdfPages } from "@/features/maps/print/pdf";
import { type Block, toSheets } from "@/features/propagation/plans/document";

export type { Block };

/** Characters the PDF's typeface lacks, written as it can: fractions spelt out, the minus sign as a hyphen. */
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

/** The sheet's pages as PDF bytes. `made` dates the file by its content, so the same sheet written twice is the same file. */
export function guidanceSheetPdf(blocks: Block[], title: string, footer: string, made: Date): Uint8Array {
  return writePdfPages({ pages: toSheets(blocks.map(plainBlock), plainForPdf(footer)), title, created: made });
}
