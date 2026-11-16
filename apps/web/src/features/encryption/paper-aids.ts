/**
 * The paper aids as paper: what a one-time pad sheet and a Vigenère square say, and
 * their pages laid out for a PDF file.
 *
 * The words and the lines of a pad are here once, and both the sheet on screen
 * (hand-tab.tsx) and the PDF are made from them. The PDF is written by the map's own
 * writer (maps/print/pdf.ts): Helvetica for the words, Courier for the letters, both
 * typefaces every PDF reader has, so the file carries no font and its letters are
 * real text. Everything is in PDF points, measured from the top-left corner of the page.
 *
 * Nothing here touches the network or keeps anything: pads in, pages or bytes out.
 */
import { monoWidth } from "@/features/maps/print/courier";
import { textWidth, wrapText } from "@/features/maps/print/helvetica";
import { PAPERS, PT_PER_MM } from "@/features/maps/print/paper";
import { writePdfPages } from "@/features/maps/print/pdf";
import type { Rgb, Sheet, SheetItem } from "@/features/maps/print/sheet";
import { ALPHABET, inGroups, randomLetters, vigenereSquare } from "./ciphers";

export interface Pad {
  serial: string;
  letters: string;
}

/** Letters to a line of a pad. */
export const PAD_LINE = 50;

export function makePads(count: number, letters: number): Pad[] {
  return Array.from({ length: count }, () => ({ serial: `${randomLetters(3)}-${randomLetters(3)}`, letters: randomLetters(letters) }));
}

/** A pad's letters as its lines, each in groups of five. */
export function padLines(letters: string): string[] {
  return (letters.match(new RegExp(`.{1,${PAD_LINE}}`, "g")) ?? []).map((line) => inGroups(line));
}

export const padHeading = (pad: Pad, copy: 1 | 2) => `One-time pad ${pad.serial}, copy ${copy} of 2`;
export const padHolder = (copy: 1 | 2) => (copy === 1 ? "For the sender" : "For the receiver");
export const lineNumber = (index: number) => String(index + 1).padStart(2, "0");
export const PAD_RULE =
  "Use each letter once, from the top. Cross out what you have used. Never use any part of this pad for a second message. Burn or shred it when it is finished, and let nobody else see it.";

export const SQUARE_TITLE = "Vigenère square";
export const SQUARE_HOW =
  "To encipher: find the key letter down the left side and the message letter along the top; the cipher letter is where that row and column meet. To decipher: go along the key letter’s row to the cipher letter; the message letter is at the top of that column.";

// ── Pages ───────────────────────────────────────────────────────────────────

/** The two papers a home printer takes. */
export const AID_PAPERS = ["a4", "letter"] as const;
export type AidPaper = (typeof AID_PAPERS)[number];
export const isAidPaper = (value: unknown): value is AidPaper => (AID_PAPERS as readonly unknown[]).includes(value);

/** US Letter where the device is set to a country that uses it; A4 everywhere else. */
export function likelyPaper(language: string | undefined): AidPaper {
  return /[-_](US|CA|MX|PH|CL|CO|VE|GT|PA|DO|PR)\b/i.test(language ?? "") ? "letter" : "a4";
}

const BLACK: Rgb = [0, 0, 0];
/** Blank paper on every side: 12 mm, the margin the browser's own print of these sheets asks for. */
const MARGIN = 12 * PT_PER_MM;

// A pad copy: a box to cut along, a line saying which pad and whose copy, the letters, the rule.
const BOX_PAD_X = 12;
const BOX_PAD_TOP = 10;
const BOX_PAD_BOTTOM = 9;
const BOX_GAP = 12;
const HEADING_SIZE = 9;
const LETTER_SIZE = 12;
const LETTER_LEADING = 15;
const NUMBER_SIZE = 8;
/** Room for a line's number, and the space between it and the letters. */
const NUMBER_WIDTH = 14;
const NUMBER_GAP = 10;
const RULE_SIZE = 8;
const RULE_LEADING = 10;

interface Part {
  height: number;
  /** Its items, with `y` measured from the top of the part. */
  items: SheetItem[];
}

function padPart(pad: Pad, copy: 1 | 2, width: number): Part {
  const items: SheetItem[] = [];
  const left = MARGIN + BOX_PAD_X;
  const right = MARGIN + width - BOX_PAD_X;
  let y = BOX_PAD_TOP + HEADING_SIZE;
  items.push({ kind: "text", x: left, y, text: padHeading(pad, copy), size: HEADING_SIZE, bold: true, color: BLACK });
  items.push({ kind: "text", x: right, y, text: padHolder(copy), size: HEADING_SIZE, color: BLACK, anchor: "end" });
  y += 7;
  padLines(pad.letters).forEach((line, index) => {
    y += LETTER_LEADING;
    items.push({
      kind: "text",
      x: left + NUMBER_WIDTH,
      y,
      text: lineNumber(index),
      size: NUMBER_SIZE,
      mono: true,
      color: BLACK,
      anchor: "end",
    });
    items.push({ kind: "text", x: left + NUMBER_WIDTH + NUMBER_GAP, y, text: line, size: LETTER_SIZE, mono: true, color: BLACK });
  });
  y += 9;
  for (const line of wrapText(PAD_RULE, RULE_SIZE, right - left)) {
    y += RULE_LEADING;
    items.push({ kind: "text", x: left, y, text: line, size: RULE_SIZE, color: BLACK });
  }
  const height = y + BOX_PAD_BOTTOM;
  items.unshift({ kind: "rect", x: MARGIN, y: 0, width, height, stroke: BLACK, lineWidth: 0.5, dash: [3, 2] });
  return { height, items };
}

const moved = (item: SheetItem, down: number): SheetItem => {
  switch (item.kind) {
    case "line":
      return { ...item, y1: item.y1 + down, y2: item.y2 + down };
    case "polygon":
      return { ...item, points: item.points.map(([x, y]) => [x, y + down] as const) };
    default:
      return { ...item, y: item.y + down };
  }
};

/**
 * The pads as pages: each pad twice, the sender's copy and then the receiver's, in the
 * order they were made. A copy is never split between two pages, so that each can be
 * cut out whole; as many go on a page as fit.
 */
export function padPages(pads: readonly Pad[], paper: AidPaper): Sheet[] {
  const { width, height } = PAPERS[paper];
  const room = width - 2 * MARGIN;
  // What the letters need across the page: a full line in groups of five, its number, and the box round them.
  const needed = 2 * BOX_PAD_X + NUMBER_WIDTH + NUMBER_GAP + monoWidth(inGroups("A".repeat(PAD_LINE)), LETTER_SIZE);
  if (needed > room) throw new Error("A line of a pad does not fit across this paper.");
  const pages: Sheet[] = [];
  let page: Sheet | undefined;
  let y = MARGIN;
  for (const pad of pads) {
    for (const copy of [1, 2] as const) {
      const part = padPart(pad, copy, room);
      if (!page || y + part.height > height - MARGIN) {
        page = { width, height, items: [] };
        pages.push(page);
        y = MARGIN;
      }
      for (const item of part.items) page.items.push(moved(item, y));
      y += part.height + BOX_GAP;
    }
  }
  return pages;
}

/** The square's cells are 6.4 mm, as on the sheet the browser prints: 27 of them go across either paper. */
const CELL = 6.4 * PT_PER_MM;
const SQUARE_LETTER = 9;

/** The Vigenère square on one page: the alphabet along the top and down the side in bold, and how to use it underneath. */
export function squarePages(paper: AidPaper): Sheet[] {
  const { width, height } = PAPERS[paper];
  const items: SheetItem[] = [];
  let y = MARGIN + 11;
  items.push({ kind: "text", x: MARGIN, y, text: SQUARE_TITLE, size: 11, bold: true, color: BLACK });
  const top = y + 8;
  const side = CELL * (ALPHABET.length + 1);
  for (let index = 0; index <= ALPHABET.length + 1; index += 1) {
    const at = index * CELL;
    // The lines round the two headings are the heavier ones.
    const lineWidth = index <= 1 ? 0.8 : 0.3;
    items.push({ kind: "line", x1: MARGIN, y1: top + at, x2: MARGIN + side, y2: top + at, color: BLACK, width: lineWidth });
    items.push({ kind: "line", x1: MARGIN + at, y1: top, x2: MARGIN + at, y2: top + side, color: BLACK, width: lineWidth });
  }
  // A capital in Courier is 562 thousandths high: its baseline is put half of that below the middle of the cell.
  const baseline = CELL / 2 + (0.562 * SQUARE_LETTER) / 2;
  const letter = (text: string, column: number, row: number, bold: boolean): SheetItem => ({
    kind: "text",
    x: MARGIN + (column + 0.5) * CELL,
    y: top + row * CELL + baseline,
    text,
    size: SQUARE_LETTER,
    mono: true,
    bold,
    color: BLACK,
    anchor: "middle",
  });
  [...ALPHABET].forEach((heading, index) => {
    items.push(letter(heading, index + 1, 0, true));
  });
  vigenereSquare().forEach((row, index) => {
    items.push(letter(ALPHABET[index]!, 0, index + 1, true));
    [...row].forEach((cell, column) => {
      items.push(letter(cell, column + 1, index + 1, false));
    });
  });
  y = top + side + 6;
  for (const line of wrapText(SQUARE_HOW, 9, Math.min(side, width - 2 * MARGIN))) {
    y += 12;
    items.push({ kind: "text", x: MARGIN, y, text: line, size: 9, color: BLACK });
  }
  return [{ width, height, items }];
}

/** How far across the page a line of lettering reaches, for the tests that keep everything on the paper. */
export function textRight(item: Extract<SheetItem, { kind: "text" }>): number {
  const width = item.mono ? monoWidth(item.text, item.size) : textWidth(item.text, item.size, item.bold);
  return item.anchor === "end" ? item.x : item.anchor === "middle" ? item.x + width / 2 : item.x + width;
}

/** The pages as the bytes of a PDF file. `title` is the file's own record of what it is. */
export function aidPdf(pages: readonly Sheet[], title: string, created = new Date()): Uint8Array {
  return writePdfPages({ pages, title, created });
}
