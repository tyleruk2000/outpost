/**
 * The old page model, brought into the new one, so that a paper made of `Block`s
 * (propagation/plans/document.ts) can be printed with the print kit as it is and moved
 * to the kit's components a piece at a time.
 *
 * - A title becomes a heading (a section's own header is the kit's), a heading a label.
 * - A table becomes the kit's table; a list its bullets.
 * - A drawing's `SheetItem`s become an SVG drawing with its words as the caption.
 */
import type { Content } from "pdfmake/interfaces";
import type { SheetItem } from "@/features/maps/print/sheet";
import type { Block } from "@/features/propagation/plans/document";
import { bullets, dataTable, figure, heading, label, para } from "./components";
import { PRINT_FONT } from "./tokens";

const hex = (rgb: readonly [number, number, number]) =>
  `#${rgb
    .map((part) =>
      Math.round(Math.max(0, Math.min(1, part)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** What a sheet draws, as SVG, in the box from (x, y) that is `width` by `height` points. Pictures and hidden words are left out. */
export function sheetItemsToSvg(items: SheetItem[], box: { x: number; y: number; width: number; height: number }): string {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind === "rect")
      out.push(
        `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" fill="${item.fill ? hex(item.fill) : "none"}"${
          item.stroke ? ` stroke="${hex(item.stroke)}" stroke-width="${item.lineWidth ?? 1}"` : ""
        }${item.dash ? ` stroke-dasharray="${item.dash.join(" ")}"` : ""}/>`,
      );
    else if (item.kind === "line")
      out.push(
        `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${hex(item.color)}" stroke-width="${item.width}"/>`,
      );
    else if (item.kind === "polygon")
      out.push(`<polygon points="${item.points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="${hex(item.fill)}"/>`);
    else if (item.kind === "text" && !item.hidden) {
      const anchor = item.anchor ?? "start";
      const rotate = item.upward ? ` transform="rotate(-90 ${item.x} ${item.y})"` : "";
      out.push(
        `<text x="${item.x}" y="${item.y}" font-family="${PRINT_FONT}" font-size="${item.size}"${item.bold ? ' font-weight="bold"' : ""} fill="${hex(item.color)}" text-anchor="${anchor}"${rotate}>${escapeXml(item.text)}</text>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">${out.join("")}</svg>`;
}

/** Blocks as the kit's content, `measure` points wide. */
export function blocksToContent(blocks: Block[], measure: number): Content[] {
  return blocks.map((block): Content => {
    switch (block.kind) {
      case "title":
        return heading(block.text);
      case "heading":
        return label(block.text);
      case "para":
        return para(block.text);
      case "list":
        return bullets(block.items);
      case "table":
        return dataTable(block.head, block.rows, { right: block.right });
      default: {
        const items = block.draw(0, 0, measure);
        return figure(sheetItemsToSvg(items, { x: 0, y: 0, width: measure, height: block.height }), {
          width: measure,
          caption: block.words,
        });
      }
    }
  });
}
