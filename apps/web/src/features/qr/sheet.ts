/**
 * The printed sheet of a code: a heading, the code, and what it holds in words.
 *
 * The code is drawn as filled rectangles, one to a run of dark modules, so that it is
 * as sharp in the PDF as the printer can make it. Text that the PDF's own typeface
 * cannot write (another script) is drawn as a picture by `writeLettered`, as on every
 * other sheet Outpost makes. Pure: a code and words in, one page out.
 */
import type { AidPaper } from "@/features/encryption/paper-aids";
import { textWidth, wrapText } from "@/features/maps/print/helvetica";
import { PAPERS, PT_PER_MM } from "@/features/maps/print/paper";
import { INK, MUTED, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import type { Described } from "./content";
import type { QrCode } from "./encoder";
import { darkRuns, QUIET_ZONE } from "./render";

/** How wide the code is printed, without its margin: well over the 5 cm that arm's length asks for. */
export const PRINTED_WIDTH_MM = 80;

export function qrSheet(code: QrCode, described: Described, paper: AidPaper, footer: string): Sheet {
  const { width, height } = PAPERS[paper];
  const margin = 20 * PT_PER_MM;
  const usable = width - margin * 2;
  const items: SheetItem[] = [];
  let y = margin + 18;

  for (const line of wrapText(described.heading, 18, usable, true).slice(0, 3)) {
    items.push({ kind: "text", x: width / 2, y, text: line, size: 18, bold: true, color: INK, anchor: "middle", fit: usable });
    y += 24;
  }

  const side = PRINTED_WIDTH_MM * PT_PER_MM;
  const module = side / code.size;
  const left = (width - side) / 2;
  const top = y + QUIET_ZONE * module;
  for (const run of darkRuns(code)) {
    // A little taller than the module (0.3 pt), so that no white seam shows between neighbouring runs in a viewer that smooths edges.
    items.push({
      kind: "rect",
      x: left + run.column * module,
      y: top + run.row * module,
      width: run.length * module,
      height: module + 0.3,
      fill: INK,
    });
  }
  y = top + side + QUIET_ZONE * module + 6;

  const labelWidth = Math.max(...described.lines.map((line) => textWidth(`${line.label}:`, 12, true))) + 8;
  for (const line of described.lines) {
    const wrapped = line.value.split("\n").flatMap((part) => wrapText(part, 12, usable - labelWidth));
    items.push({ kind: "text", x: margin, y, text: `${line.label}:`, size: 12, bold: true, color: INK });
    for (const text of wrapped.slice(0, 8)) {
      items.push({ kind: "text", x: margin + labelWidth, y, text, size: 12, color: INK, fit: usable - labelWidth });
      y += 16;
    }
    if (wrapped.length === 0) y += 16;
    y += 2;
  }

  y += 8;
  for (const text of wrapText(`${described.action} Point the phone’s camera at the code.`, 10, usable)) {
    items.push({ kind: "text", x: margin, y, text, size: 10, color: MUTED });
    y += 13;
  }
  items.push({ kind: "text", x: margin, y: height - margin + 10, text: footer, size: 8, color: MUTED, fit: usable });
  // Only the words above are in the file as text. The code's own text is not added unseen: for a Wi-Fi code it holds the password.
  return { width, height, items };
}
