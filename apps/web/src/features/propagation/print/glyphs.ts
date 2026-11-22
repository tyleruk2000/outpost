/**
 * The letters the print kit's typeface has: Latin, Latin-1 and Latin Extended-A, with the
 * usual punctuation. A place in another script (Москва, 東京) has letters it has not; they
 * are printed as "?", and the screen names them, as it did for the old writer.
 */
import { printable } from "@/features/print-kit";
import type { Block } from "../plans/document";

const WRITABLE = /[ -~ -ſ‐-‧‰-›€™\n\t]/u;

/** Each character of the lines the typeface cannot write, once. */
export function kitUnwritable(lines: string[]): string[] {
  const found = new Set<string>();
  for (const line of lines) for (const character of printable(line)) if (!WRITABLE.test(character)) found.add(character);
  return [...found];
}

export const kitWritable = (line: string): string =>
  [...printable(line)].map((character) => (WRITABLE.test(character) ? character : "?")).join("");

/** The words of the blocks, as lines. */
export function blockLines(blocks: Block[]): string[] {
  return blocks.flatMap((block) =>
    block.kind === "list"
      ? block.items
      : block.kind === "table"
        ? [block.head, ...block.rows].flat()
        : block.kind === "drawing"
          ? []
          : [block.text],
  );
}

/** The blocks with every letter the typeface lacks written as "?". */
export function writableBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    if (block.kind === "list") return { ...block, items: block.items.map(kitWritable) };
    if (block.kind === "table") return { ...block, head: block.head.map(kitWritable), rows: block.rows.map((row) => row.map(kitWritable)) };
    if (block.kind === "drawing") return block;
    return { ...block, text: kitWritable(block.text) };
  });
}
