/**
 * Which letters the print kit's typeface can set, for papers that hold people's names.
 *
 * The print kit (features/print-kit) sets every paper in Atkinson Hyperlegible Next, which
 * has Latin, Latin-1 and most of Latin Extended-A, and no Greek, Cyrillic, Arabic or CJK.
 * A name it cannot set would print as empty boxes, so a paper holding one is made the old
 * way instead (maps/print/pdf.ts), where the browser draws such a line as a picture with
 * the words kept for search (maps/print/lettering.ts). Nothing is ever transliterated.
 *
 * The ranges are characters both the regular and the bold face map, read from the font
 * files in print-kit/fonts with fontkit (each face's `characterSet`), less a few
 * mathematical signs no paper here uses. Read them again if the font files change.
 */

/** Code points both faces have, as inclusive ranges. */
export const KIT_LETTERS: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0xb4],
  [0xb6, 0x107],
  [0x10a, 0x113],
  [0x116, 0x11b],
  [0x11e, 0x123],
  [0x126, 0x127],
  [0x12a, 0x12b],
  [0x12e, 0x133],
  [0x136, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x150, 0x155],
  [0x158, 0x15b],
  [0x15e, 0x165],
  [0x16a, 0x16b],
  [0x16e, 0x17e],
  [0x192, 0x192],
  [0x218, 0x21b],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2022],
  [0x2026, 0x2026],
  [0x2030, 0x2030],
  [0x2039, 0x203a],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2212, 0x2212],
];

/** Marks the kit itself writes another way (print-kit `printable`): arrows, primes, some fractions. */
const STOOD_IN = new Set([..."′″→←⅓⅔⅛µ"].map((mark) => mark.codePointAt(0)!));

const settable = (point: number) =>
  point === 0x0a || STOOD_IN.has(point) || KIT_LETTERS.some(([low, high]) => point >= low && point <= high);

/** Whether the kit's typeface can set every character of the text (after composing accents onto their letters). */
export function kitCanSet(text: string): boolean {
  for (const character of text.normalize("NFC")) if (!settable(character.codePointAt(0)!)) return false;
  return true;
}

/** Whether all of the texts can be set. */
export const kitCanSetAll = (texts: Iterable<string>): boolean => {
  for (const text of texts) if (!kitCanSet(text)) return false;
  return true;
};
