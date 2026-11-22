/**
 * The paper aids laid out with the print kit (features/print-kit): one-time pads, each
 * copy in a box to cut out, and the Vigenère square with a worked example on it.
 *
 * The kit's typeface is not monospaced, so the letters are not set as lines of text:
 * each letter is placed by itself, centred on its own place in a grid, the same pitch on
 * every line. Columns of a pad and cells of the square line up exactly, as Courier's did,
 * and the letters are in Atkinson Hyperlegible, drawn so that letters that look alike
 * (O and Q, I and J, M and N) are told apart: what a person copying a pad by hand needs.
 * Every letter is real text in the file.
 *
 * Nothing here touches the network or keeps anything: pads in, a document out.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { PRINT_COLOURS as C, callout, calloutSymbol, drawing, PRINT_FONT, para, printDocument, round, svgText } from "@/features/print-kit";
import { ALPHABET, vigenereSquare } from "./ciphers";
import { type AidPaper, lineNumber, PAD_LINE, PAD_RULE, type Pad, padHeading, padHolder, SQUARE_HOW, SQUARE_TITLE } from "./paper-aids";

/** Room for the pad inside its box: the narrower of the two papers' measures, less the box's insets. */
const PAD_WIDTH = 595.28 - 96 - 22;
/** Where the first letter's place starts, after the line's number. */
const LETTERS_LEFT = 24;
/** A group of five is followed by a gap this many places wide. */
const GROUP_GAP = 0.7;
/** The distance from one letter's place to the next. */
export const PAD_PITCH = (PAD_WIDTH - LETTERS_LEFT) / (PAD_LINE + (PAD_LINE / 5 - 1) * GROUP_GAP);
const PAD_LETTER = 9.5;
const PAD_LEADING = 14.5;

/** The middle of the place of the letter at `index` along a line. */
export const padLetterX = (index: number): number => LETTERS_LEFT + PAD_PITCH * (index + 0.5 + Math.floor(index / 5) * GROUP_GAP);

/** A letter centred on (x, baseline). */
const letterAt = (x: number, y: number, letter: string, size: number, options: { bold?: boolean; fill?: string } = {}) =>
  `<text x="${round(x)}" y="${round(y)}" font-family="${PRINT_FONT}" font-size="${size}"${options.bold ? ' font-weight="bold"' : ""} fill="${
    options.fill ?? C.ink
  }" text-anchor="middle">${letter}</text>`;

/** A pad's letters, a line of fifty at a time, numbered, each letter in its place. */
export function padLetters(letters: string): { svg: string; width: number; height: number } {
  const lines = Math.ceil(letters.length / PAD_LINE);
  let body = "";
  for (let line = 0; line < lines; line += 1) {
    const y = 10 + line * PAD_LEADING;
    if (line % 2 === 1)
      body += `<rect x="${LETTERS_LEFT - 4}" y="${round(y - 10)}" width="${round(PAD_WIDTH - LETTERS_LEFT + 4)}" height="${PAD_LEADING}" fill="${C.shade}"/>`;
    body += svgText(14, y, lineNumber(line), { anchor: "end", size: 7, fill: C.muted });
    const part = letters.slice(line * PAD_LINE, (line + 1) * PAD_LINE);
    [...part].forEach((letter, index) => {
      body += letterAt(padLetterX(index), y, letter, PAD_LETTER);
    });
  }
  const height = 10 + (lines - 1) * PAD_LEADING + 5;
  return drawing(PAD_WIDTH, height, body);
}

const padBox = (colour: string): Record<string, unknown> => ({
  hLineWidth: () => 0.8,
  vLineWidth: () => 0.8,
  hLineColor: () => C.muted,
  vLineColor: () => C.muted,
  hLineStyle: () => ({ dash: { length: 4, space: 2 } }),
  vLineStyle: () => ({ dash: { length: 4, space: 2 } }),
  fillColor: (row: number) => (row === 0 ? colour : null),
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: (row: number) => (row === 0 ? 5 : 8),
  paddingBottom: (row: number) => (row === 0 ? 4 : 7),
});

/** One copy of a pad: a band saying which pad and whose copy, the letters, and the rule, in a box to cut out. */
function padCopy(pad: Pad, copy: 1 | 2): Content {
  const colour = copy === 1 ? C.accent : C.know;
  const letters = padLetters(pad.letters);
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            columns: [
              { text: padHeading(pad, copy), bold: true, fontSize: 9.5, color: C.paper, width: "*" },
              { text: padHolder(copy), bold: true, fontSize: 9.5, color: C.paper, width: "auto" },
            ],
          },
        ],
        [
          {
            stack: [
              { svg: letters.svg, width: letters.width, height: letters.height },
              {
                columns: [
                  { svg: calloutSymbol("warn"), width: 9, height: 9, margin: [0, 1, 0, 0] },
                  { text: PAD_RULE, fontSize: 7.5, color: C.warnInk, width: "*", lineHeight: 1.1 },
                ],
                columnGap: 5,
                margin: [0, 7, 0, 0],
              },
            ],
          },
        ],
      ],
    },
    layout: padBox(colour),
    unbreakable: true,
    margin: [0, 0, 0, 12],
  } as Content;
}

/**
 * The pads: each twice, the sender's copy and then the receiver's, in the order they
 * were made. A copy is never split between two pages, so that each can be cut out
 * whole; as many go on a page as fit.
 */
export function padsDocument(pads: readonly Pad[], paper: AidPaper, made: Date): TDocumentDefinitions {
  return printDocument({
    paper,
    title: "One-time pads",
    made,
    footerName: "One-time pads · Outpost",
    footerRight: "Burn or shred each copy when it is finished",
    parts: [{ kind: "plain", content: pads.flatMap((pad) => [padCopy(pad, 1), padCopy(pad, 2)]) }],
  });
}

// ── The Vigenère square ─────────────────────────────────────────────────────

/** The square's cells are 6.4 mm, as on the sheet the browser prints: 27 of them go across either paper. */
const CELL = 6.4 * (72 / 25.4);
const SQUARE_LETTER = 9;
/** The worked example: key letter K, message letter E. */
const EXAMPLE = { key: 10, message: 4 };

/** The square, the alphabet along the top and down the side, with the example's row, column and cell marked. */
export function squareDrawing(): { svg: string; width: number; height: number } {
  const rows = vigenereSquare();
  const side = CELL * (ALPHABET.length + 1);
  const at = (index: number) => index * CELL;
  let body = "";
  // The headings, shaded; the example's row and column, washed in their colours, and the cell where they meet.
  body += `<rect x="0" y="0" width="${round(side)}" height="${round(CELL)}" fill="${C.accentSoft}"/>`;
  body += `<rect x="0" y="0" width="${round(CELL)}" height="${round(side)}" fill="${C.accentSoft}"/>`;
  body += `<rect x="0" y="${round(at(EXAMPLE.key + 1))}" width="${round(side)}" height="${round(CELL)}" fill="${C.knowSoft}"/>`;
  body += `<rect x="${round(at(EXAMPLE.message + 1))}" y="0" width="${round(CELL)}" height="${round(side)}" fill="${C.warnSoft}"/>`;
  body += `<rect x="${round(at(EXAMPLE.message + 1))}" y="${round(at(EXAMPLE.key + 1))}" width="${round(CELL)}" height="${round(CELL)}" fill="${C.act}"/>`;
  for (let index = 0; index <= ALPHABET.length + 1; index += 1) {
    const heavy = index <= 1 || index === ALPHABET.length + 1;
    const stroke = heavy ? C.ink : C.rule;
    const width = heavy ? 0.9 : 0.4;
    body += `<line x1="0" y1="${round(at(index))}" x2="${round(side)}" y2="${round(at(index))}" stroke="${stroke}" stroke-width="${width}"/>`;
    body += `<line x1="${round(at(index))}" y1="0" x2="${round(at(index))}" y2="${round(side)}" stroke="${stroke}" stroke-width="${width}"/>`;
  }
  // A capital in the book's typeface is 0.668 of its size high: its baseline is put half of that below the middle of the cell.
  const baseline = CELL / 2 + (0.668 * SQUARE_LETTER) / 2;
  [...ALPHABET].forEach((heading, index) => {
    body += letterAt(at(index + 1) + CELL / 2, baseline, heading, SQUARE_LETTER, { bold: true, fill: C.accent });
  });
  rows.forEach((row, rowIndex) => {
    const y = at(rowIndex + 1) + baseline;
    body += letterAt(CELL / 2, y, ALPHABET[rowIndex]!, SQUARE_LETTER, { bold: true, fill: C.accent });
    [...row].forEach((cell, column) => {
      const meet = rowIndex === EXAMPLE.key && column === EXAMPLE.message;
      body += letterAt(at(column + 1) + CELL / 2, y, cell, SQUARE_LETTER, meet ? { bold: true, fill: C.paper } : {});
    });
  });
  return drawing(round(side), round(side), body);
}

/** The worked example, in words, from the square itself. */
export function squareExample(): { key: string; message: string; cipher: string } {
  return {
    key: ALPHABET[EXAMPLE.key]!,
    message: ALPHABET[EXAMPLE.message]!,
    cipher: vigenereSquare()[EXAMPLE.key]![EXAMPLE.message]!,
  };
}

/** The Vigenère square on one page, how to use it under it, and the worked example. */
export function squareDocument(paper: AidPaper, made: Date): TDocumentDefinitions {
  const square = squareDrawing();
  const { key, message, cipher } = squareExample();
  return printDocument({
    paper,
    title: SQUARE_TITLE,
    made,
    footerName: "Cipher aid · Outpost",
    footerRight: "Keep it beside you; it holds no secret",
    parts: [
      {
        kind: "plain",
        content: [
          { text: "Cipher aid", fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.4 },
          { text: SQUARE_TITLE, fontSize: 20, bold: true, lineHeight: 1.05, margin: [0, 2, 0, 8] },
          { svg: square.svg, width: square.width, height: square.height, alignment: "center", margin: [0, 0, 0, 10] },
          para(SQUARE_HOW),
          callout(
            "know",
            "An example, marked on the square",
            para(
              `Key letter **${key}**, message letter **${message}**: along row ${key} (blue) to column ${message} (amber), the cipher letter is **${cipher}** (red). To decipher, go along row ${key} to ${cipher}; the message letter at the top of that column is ${message}.`,
              0,
            ),
          ),
        ],
      },
    ],
  });
}
