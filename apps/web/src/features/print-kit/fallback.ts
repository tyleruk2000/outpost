/**
 * Letters the book's typeface does not have: names in Greek, Cyrillic, Arabic, Hebrew,
 * Devanagari, Thai, Chinese, Japanese kana or Korean, and Latin letters beyond it. Each
 * run of words is set in Atkinson Hyperlegible Next where it has the letter, and in a
 * Noto Sans font (SIL Open Font License, fonts/noto/OFL.txt) where it does not.
 *
 * pdfmake chooses a font for a run of text, not for a letter, so a document is split into
 * runs before it is laid out (`withFallbacks`). Only the fallback fonts a document uses are
 * loaded, each its own part of the app's files, when a PDF is made.
 *
 * The Noto files are subsets made for print: Latin, Greek and Cyrillic in full; Chinese
 * to the 3,755 characters of GB 2312 level 1 with kana; Korean to the 2,350 syllables of
 * KS X 1001. A rarer character prints as an empty box. Arabic and Hebrew are set in their
 * letters' order as stored; pdfmake does not reorder right-to-left text.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

/** The code points Atkinson Hyperlegible Next Regular has, as ranges (worked out from the font file with fontkit). */
const PRINT_COVERAGE: ReadonlyArray<readonly [number, number]> = [
  [32, 126],
  [160, 172],
  [174, 180],
  [182, 263],
  [266, 275],
  [278, 283],
  [286, 291],
  [294, 295],
  [298, 299],
  [302, 307],
  [310, 311],
  [313, 318],
  [321, 328],
  [336, 341],
  [344, 347],
  [350, 357],
  [362, 363],
  [366, 382],
  [402, 402],
  [536, 539],
  [567, 567],
  [710, 711],
  [713, 713],
  [728, 733],
  [768, 772],
  [774, 776],
  [778, 780],
  [786, 786],
  [806, 808],
  [916, 916],
  [937, 937],
  [956, 956],
  [960, 960],
  [7808, 7813],
  [7838, 7838],
  [7922, 7923],
  [8201, 8201],
  [8211, 8212],
  [8216, 8218],
  [8220, 8222],
  [8224, 8226],
  [8230, 8230],
  [8240, 8240],
  [8249, 8250],
  [8260, 8260],
  [8364, 8364],
  [8377, 8377],
  [8467, 8467],
  [8482, 8482],
  [8494, 8494],
  [8706, 8706],
  [8719, 8719],
  [8721, 8722],
  [8725, 8725],
  [8729, 8730],
  [8734, 8734],
  [8747, 8747],
  [8776, 8776],
  [8800, 8800],
  [8804, 8805],
  [9674, 9674],
  [9834, 9834],
];

/** Whether the book's own typeface has this letter. Line breaks and other controls count as had. */
export function printCovers(code: number): boolean {
  if (code < 32) return true;
  let low = 0;
  let high = PRINT_COVERAGE.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = PRINT_COVERAGE[middle]!;
    if (code < start) high = middle - 1;
    else if (code > end) low = middle + 1;
    else return true;
  }
  return false;
}

export type FallbackFont =
  | "NotoSans"
  | "NotoSansArabic"
  | "NotoSansHebrew"
  | "NotoSansDevanagari"
  | "NotoSansThai"
  | "NotoSansSC"
  | "NotoSansKR";

const within = (code: number, ...ranges: Array<[number, number]>) => ranges.some(([start, end]) => code >= start && code <= end);

/** The fallback font for a letter the typeface lacks, by the script it belongs to. */
export function fallbackFor(code: number): FallbackFont {
  if (within(code, [0x600, 0x6ff], [0x750, 0x77f], [0xfb50, 0xfdff], [0xfe70, 0xfeff])) return "NotoSansArabic";
  if (within(code, [0x590, 0x5ff], [0xfb1d, 0xfb4f])) return "NotoSansHebrew";
  if (within(code, [0x900, 0x97f], [0xa8e0, 0xa8ff])) return "NotoSansDevanagari";
  if (within(code, [0xe00, 0xe7f])) return "NotoSansThai";
  if (within(code, [0x1100, 0x11ff], [0x3130, 0x318f], [0xac00, 0xd7af])) return "NotoSansKR";
  if (within(code, [0x2e80, 0x2fdf], [0x3000, 0x30ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xffef]))
    return "NotoSansSC";
  return "NotoSans";
}

/** Words cut into runs, each with the font that has its letters; undefined is the book's own. */
export function fontRuns(text: string): Array<{ text: string; font?: FallbackFont }> {
  const runs: Array<{ text: string; font?: FallbackFont }> = [];
  // A word is set whole in one font, so that a Greek word keeps its own π and a Latin one its Ĉ.
  for (const piece of text.match(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu) ?? []) {
    const word = /[\p{L}\p{M}\p{N}]/u.test(piece);
    let font: FallbackFont | undefined;
    if (word) {
      for (const character of piece) {
        const code = character.codePointAt(0)!;
        if (!printCovers(code)) {
          font = fallbackFor(code);
          break;
        }
      }
    } else {
      // Spaces and punctuation between words of another script stay with them.
      const before = runs.at(-1)?.font;
      font = before && [...piece].every((character) => /[\s,.;:'’()-]/.test(character)) ? before : undefined;
      if (!font) for (const character of piece) if (!printCovers(character.codePointAt(0)!)) font = fallbackFor(character.codePointAt(0)!);
    }
    const last = runs.at(-1);
    if (last && last.font === font) last.text += piece;
    else runs.push({ text: piece, font });
  }
  return runs;
}

const decodeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
const encodeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const needsFallback = (text: string) => {
  for (const character of text) if (!printCovers(character.codePointAt(0)!)) return true;
  return false;
};

/**
 * A document with every run of text the typeface cannot set given a fallback font, and
 * which fallback fonts it needs. A document that needs none is given back as it is.
 */
export function withFallbacks(doc: TDocumentDefinitions): { doc: TDocumentDefinitions; fonts: Set<FallbackFont> } {
  const fonts = new Set<FallbackFont>();
  const split = (text: string): Content => {
    const runs = fontRuns(text);
    for (const run of runs) if (run.font) fonts.add(run.font);
    return runs.map((run) => (run.font ? { text: run.text, font: run.font } : run.text)) as Content;
  };
  const inline = (value: unknown): unknown => {
    if (typeof value === "string") return needsFallback(value) ? { text: split(value) } : value;
    if (Array.isArray(value)) return value.map(inline);
    if (value && typeof value === "object" && "text" in value) {
      const node = value as { text: unknown };
      if (typeof node.text === "string" && needsFallback(node.text)) return { ...node, text: split(node.text) };
      if (Array.isArray(node.text)) return { ...node, text: node.text.map(inline) };
    }
    return value;
  };
  // A drawing's words: each run the typeface lacks becomes a tspan in its fallback font, which pdfmake's SVG drawing looks up by family.
  const svgWords = (svg: string): string =>
    svg.replace(/(<text\b[^>]*>)([^<]*)(<\/text>)/g, (whole, open: string, words: string, close: string) => {
      const plain = decodeXml(words);
      if (!needsFallback(plain)) return whole;
      // pdfmake's SVG drawing leaves a gap where the font changes next to a letter, so a drawing changes font only at a space:
      // a word holding a letter the typeface lacks is set whole, its punctuation with it, in the fallback.
      const runs: Array<{ text: string; font?: FallbackFont }> = [];
      for (const piece of plain.split(/(\s+)/)) {
        if (piece === "") continue;
        const missing = [...piece].find((character) => !printCovers(character.codePointAt(0)!));
        const font = /^\s+$/.test(piece) ? runs.at(-1)?.font : missing ? fallbackFor(missing.codePointAt(0)!) : undefined;
        const last = runs.at(-1);
        if (last && last.font === font) last.text += piece;
        else runs.push({ text: piece, font });
      }
      for (const run of runs) if (run.font) fonts.add(run.font);
      return `${open}${runs.map((run) => (run.font ? `<tspan font-family="${run.font}">${encodeXml(run.text)}</tspan>` : encodeXml(run.text))).join("")}${close}`;
    });
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return needsFallback(node) ? { text: split(node) } : node;
    if (typeof node === "function") return (...args: unknown[]) => walk((node as (...a: unknown[]) => unknown)(...args));
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const record = { ...(node as Record<string, unknown>) };
    if (typeof record.svg === "string") record.svg = svgWords(record.svg);
    if ("text" in record) {
      if (typeof record.text === "string") {
        if (needsFallback(record.text)) record.text = split(record.text);
      } else if (Array.isArray(record.text)) record.text = record.text.map(inline);
    }
    for (const key of ["stack", "columns", "ul", "ol", "section", "content", "header", "footer"])
      if (key in record) record[key] = walk(record[key]);
    if (record.table && typeof record.table === "object") {
      const table = record.table as { body?: unknown[][] };
      record.table = { ...table, body: table.body?.map((row) => row.map(walk)) };
    }
    return record;
  };
  const content = walk(doc.content) as Content;
  const header = doc.header ? walk(doc.header) : doc.header;
  const footer = doc.footer ? walk(doc.footer) : doc.footer;
  return { doc: { ...doc, content, header: header as never, footer: footer as never }, fonts };
}

/** Each fallback font's files, as base64, loaded when first needed. Single-weight fonts use their one file for bold. */
export const FALLBACK_LOADERS: Record<FallbackFont, () => Promise<{ regular: string; bold: string }>> = {
  NotoSans: async () => {
    const [regular, bold] = await Promise.all([
      import("./fonts/noto/NotoSans-Regular.ttf?inline"),
      import("./fonts/noto/NotoSans-Bold.ttf?inline"),
    ]);
    return { regular: base64(regular.default), bold: base64(bold.default) };
  },
  NotoSansArabic: async () => single((await import("./fonts/noto/NotoSansArabic-Regular.ttf?inline")).default),
  NotoSansHebrew: async () => single((await import("./fonts/noto/NotoSansHebrew-Regular.ttf?inline")).default),
  NotoSansDevanagari: async () => single((await import("./fonts/noto/NotoSansDevanagari-Regular.ttf?inline")).default),
  NotoSansThai: async () => single((await import("./fonts/noto/NotoSansThai-Regular.ttf?inline")).default),
  NotoSansSC: async () => single((await import("./fonts/noto/NotoSansSC-Regular.ttf?inline")).default),
  NotoSansKR: async () => single((await import("./fonts/noto/NotoSansKR-Regular.ttf?inline")).default),
};

const base64 = (url: string) => url.slice(url.indexOf(",") + 1);
const single = (url: string) => ({ regular: base64(url), bold: base64(url) });
