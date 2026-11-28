/**
 * Right-to-left words (Arabic, Hebrew) put in the order they are drawn.
 *
 * pdfmake lays a line out left to right, a word at a time. pdfkit's font engine (fontkit)
 * shapes each word, joining Arabic letters, and turns an Arabic or Hebrew word round, but
 * it never moves one word past another. So a line holding right-to-left words is put in
 * visual order here, with the Unicode Bidirectional Algorithm (bidi-js), and cut into
 * pieces: each Arabic or Hebrew word on its own, in the order its letters are written, for
 * fontkit to join and turn; everything else (spaces, figures, brackets mirrored, Latin) in
 * the order it is drawn.
 *
 * A passage is ordered as one line. A long right-to-left passage that wraps keeps its words
 * in order within each line but reads its lines in the wrong order, so the kit is for names
 * and short phrases in these scripts, not paragraphs.
 *
 * Why not line by line: the algorithm's levels and mirroring belong to the paragraph, but its
 * reordering (rules L1 and L2) belongs to each line, so it must run after pdfmake has broken
 * the lines and before it draws them. pdfmake 0.3.15's browser build gives no hook there: its
 * Line, LayoutBuilder and ElementWriter are inside the bundle, and nothing it calls back
 * (pageBreakBefore, header, footer, background) is handed the lines. Ordering before layout
 * cannot know where the lines will break, since the width of a table cell or column is only
 * worked out inside pdfmake. The ways open: a patch to pdfmake's build (pnpm patch) calling a
 * hook from ElementWriter.alignLine to reorder `line.inlines` by a level carried on each run
 * (pdfmake copies a run's own properties onto its pieces) and set their x again; building
 * pdfmake from its sources with that change, which means bundling pdfkit's Node parts;
 * breaking right-to-left passages here where the width is known (a paragraph across the
 * measure), leaving cells as they are; or waiting for pdfmake to support right to left.
 */
import type { Bidi } from "bidi-js";

/** Letters fontkit lays out right to left: Arabic and Hebrew, its figures and marks included. */
const RTL_SCRIPT = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
/** Marks, joiners and the kashida, which belong to the letters beside them. */
const joins = (unit: string) => /\p{Mn}/u.test(unit) || unit === "\u200c" || unit === "\u200d" || unit === "\u0640";

/** Whether some text has a letter written right to left. */
export const hasRightToLeft = (text: string): boolean => RTL_SCRIPT.test(text);

/**
 * Whether a passage reads right to left: its first letter with a direction of its own is Arabic or Hebrew (the
 * Unicode Bidirectional Algorithm's rule P2, with letters as the strong characters). Figures and punctuation have
 * none, so "123 שלום" reads right to left and "Tel Aviv שלום" left to right.
 */
export function startsRightToLeft(text: string): boolean {
  for (const character of text) {
    if (!/\p{L}/u.test(character)) continue;
    return RTL_SCRIPT.test(character);
  }
  return false;
}

export interface OrderedPiece {
  text: string;
  /** An Arabic or Hebrew word, in written order: fontkit turns it round. Otherwise the text is in drawn order. */
  rtl: boolean;
}

/** A line as pieces, left to right as drawn. */
export function visualPieces(bidi: Bidi, text: string): OrderedPiece[] {
  const levels = bidi.getEmbeddingLevels(text);
  const order = bidi.getReorderedIndices(text, levels);
  const mirrored = bidi.getMirroredCharactersMap(text, levels.levels);
  const units = order.map((index) => ({ unit: mirrored.get(index) ?? text[index]!, level: levels.levels[index]! }));
  // A letter outside the basic plane is two code units, and a reversed span turns them round: put them back.
  for (let index = 0; index + 1 < units.length; index += 1) {
    const here = units[index]!.unit.charCodeAt(0);
    const next = units[index + 1]!.unit.charCodeAt(0);
    if (here >= 0xdc00 && here <= 0xdfff && next >= 0xd800 && next <= 0xdbff) {
      [units[index], units[index + 1]] = [units[index + 1]!, units[index]!];
      index += 1;
    }
  }
  const pieces: OrderedPiece[] = [];
  let word: string[] = [];
  let wordLevel = -1;
  let plain = "";
  const endWord = () => {
    if (word.length) pieces.push({ text: word.reverse().join(""), rtl: true });
    word = [];
    wordLevel = -1;
  };
  const endPlain = () => {
    if (plain) pieces.push({ text: plain, rtl: false });
    plain = "";
  };
  for (const { unit, level } of units) {
    const inWord = RTL_SCRIPT.test(unit) || (joins(unit) && level % 2 === 1);
    if (inWord) {
      if (word.length && level !== wordLevel) endWord();
      endPlain();
      word.push(unit);
      wordLevel = level;
    } else {
      endWord();
      plain += unit;
    }
  }
  endWord();
  endPlain();
  return pieces;
}
