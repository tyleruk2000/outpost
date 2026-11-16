/**
 * Writes a sheet (see sheet.ts) as a PDF file of one page, or several sheets as a file
 * of several pages.
 *
 * Why this is written here and not taken from a library. What the page needs from the
 * format is small: a page of a stated size, pictures that are already JPEG (a PDF
 * holds JPEG data as it stands, so nothing is compressed here), lines, filled shapes,
 * and text in a typeface every reader supplies. That is the eight kinds of object
 * below. The libraries that could do it instead were looked up on the npm registry on
 * 16 November 2026, all MIT: jsPDF 4.2.1 (maintained; brings a PNG reader, a
 * compressor and optional HTML-to-canvas and SVG code); pdf-lib 1.17.1 (no release
 * since 2021) and its maintained fork @cantoo/pdf-lib 2.11.1 (brings a compressor, a
 * colour library and an HTML parser); pdfkit 0.20.2 (maintained; built for Node, with a
 * font engine and encryption code). Each is a general PDF toolkit many times the size
 * of what is used here, and a dependency to keep up to date, for a file simple enough
 * to check by reading it.
 *
 * The format: ISO 32000-1 (PDF 1.7). The page's size is its `MediaBox`, in points, and
 * the pictures are placed at their true size in points, so a printer set to 100%
 * reproduces the stated scale. `PrintScaling /None` asks the reader's print dialogue
 * to start at 100% instead of "fit to page"; readers may ignore it, which is why the
 * page also says how long its scale bar should measure.
 *
 * Hidden words (text drawn in no ink, for search) may be in any script. The page's
 * typefaces cannot write those, so such words are written in a font of a third kind:
 * a Type 3 font whose glyphs draw nothing, with a ToUnicode map (ISO 32000-1, 9.10.3)
 * that says which character each of its codes stands for. Nothing is drawn with it
 * and no font is carried, but a reader that extracts text, the library's among them,
 * reads the words exactly. One such font holds 256 characters; a file that needs more
 * has more of them.
 *
 * Nothing here touches the page or the network: sheet in, bytes out.
 */
import { monoWidth } from "./courier";
import { encodeWinAnsi, textWidth } from "./helvetica";
import type { Rgb, Sheet, SheetItem } from "./sheet";

export interface PdfPicture {
  /** A baseline JPEG file, as a canvas makes it. */
  jpeg: Uint8Array;
  /** Its size in pixels. */
  width: number;
  height: number;
}

export interface PdfInput {
  sheet: Sheet;
  /** The pictures the sheet refers to, by id. */
  pictures: ReadonlyMap<string, PdfPicture>;
  /** For the file's own record of what it is; shown by readers as the document's title. */
  title: string;
  created: Date;
}

export interface PdfPagesInput {
  /** One sheet to a page, in order. Each page is the size of its own sheet. */
  pages: readonly Sheet[];
  /** The pictures the sheets refer to, by id. A file of text alone has none. */
  pictures?: ReadonlyMap<string, PdfPicture>;
  title: string;
  created: Date;
}

/** A number as a PDF wants it: plain decimals, no more of them than matter. */
const n = (value: number) => {
  const text = (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
};

const rgb = (color: Rgb) => color.map(n).join(" ");

/** Text as a PDF string in the page's encoding. Anything outside plain ASCII is written as an octal escape, so the page stays readable as text. */
function pdfString(text: string): string {
  // A character the encoding lacks should have been dealt with before now (export.ts draws such lines as pictures).
  const bytes = encodeWinAnsi(text) ?? encodeWinAnsi([...text].map((character) => (encodeWinAnsi(character) ? character : "?")).join(""))!;
  let out = "(";
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return `${out})`;
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/u;
const LEFT_TO_RIGHT = /[\p{L}\p{N}]/u;

/**
 * Words in a right-to-left script, put in the order they stand on a page. A PDF holds
 * its characters in the order they are drawn, left to right, and a reader that takes
 * the text out of it (pdf.js, which the library uses) turns right-to-left runs back
 * into reading order with the Unicode bidirectional rules. Written in reading order,
 * "محمد" would come out backwards. This is the simple part of those rules: a line
 * mostly in such a script is turned round whole, with its runs of Latin letters and
 * figures turned back; any other line has only its right-to-left runs turned round.
 * Exported for its tests.
 */
export function visualOrder(text: string): string {
  const characters = [...text];
  const rtl = characters.filter((character) => RTL.test(character)).length;
  if (rtl === 0) return text;
  const ltr = (character: string) => LEFT_TO_RIGHT.test(character) && !RTL.test(character);
  // pdf.js reads a line as right-to-left when three in ten of its characters are, or it is very short.
  const rightToLeft = rtl / text.length >= 0.3 || text.length <= 4;
  /** Turns round each run of characters that `inRun` takes, with the spaces and signs between two of them. */
  const turnRuns = (chars: string[], inRun: (character: string) => boolean) => {
    const out: string[] = [];
    let index = 0;
    while (index < chars.length) {
      if (!inRun(chars[index]!)) {
        out.push(chars[index]!);
        index += 1;
        continue;
      }
      let end = index + 1;
      let last = index;
      // The run goes on over neutral characters only as far as another of its own.
      while (end < chars.length && (inRun(chars[end]!) || !(RTL.test(chars[end]!) || ltr(chars[end]!)))) {
        if (inRun(chars[end]!)) last = end;
        end += 1;
      }
      out.push(...chars.slice(index, last + 1).reverse());
      index = last + 1;
    }
    return out;
  };
  if (rightToLeft) return turnRuns([...characters].reverse(), ltr).join("");
  return turnRuns(characters, (character) => RTL.test(character)).join("");
}

/** Text as a hexadecimal PDF string of one-byte codes. */
const hexString = (codes: readonly number[]) => `<${codes.map((code) => code.toString(16).padStart(2, "0").toUpperCase()).join("")}>`;

/**
 * Codes in the fonts that write hidden words in any script: each character gets a font
 * (U1, U2, ...) and a code in it, in the order first met.
 */
class UnicodeCodes {
  readonly characters: string[] = [];
  private readonly index = new Map<string, number>();
  static readonly PER_FONT = 256;

  /** Hidden words the page's own typefaces cannot write. */
  static needed(item: SheetItem): boolean {
    return item.kind === "text" && item.hidden === true && encodeWinAnsi(item.text) === null;
  }

  add(text: string) {
    for (const character of text) {
      if (this.index.has(character)) continue;
      this.index.set(character, this.characters.length);
      this.characters.push(character);
    }
  }

  get fonts(): number {
    return Math.ceil(this.characters.length / UnicodeCodes.PER_FONT);
  }

  /** The text as runs, each in one font: which font, and the codes. */
  runs(text: string): Array<{ font: number; codes: number[] }> {
    const runs: Array<{ font: number; codes: number[] }> = [];
    for (const character of text) {
      const at = this.index.get(character)!;
      const font = Math.floor(at / UnicodeCodes.PER_FONT);
      const code = at % UnicodeCodes.PER_FONT;
      const last = runs[runs.length - 1];
      if (last && last.font === font) last.codes.push(code);
      else runs.push({ font, codes: [code] });
    }
    return runs;
  }

  /** The ToUnicode map of one font: each code to its character, in UTF-16. */
  toUnicode(font: number): string {
    const chars = this.characters.slice(font * UnicodeCodes.PER_FONT, (font + 1) * UnicodeCodes.PER_FONT);
    const utf16 = (character: string) => {
      let hex = "";
      for (let index = 0; index < character.length; index += 1)
        hex += character.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
      return hex;
    };
    const blocks: string[] = [];
    // A map may give at most a hundred codes in one block.
    for (let start = 0; start < chars.length; start += 100) {
      const part = chars.slice(start, start + 100);
      blocks.push(
        `${part.length} beginbfchar\n${part.map((character, at) => `${hexString([start + at])} <${utf16(character)}>`).join("\n")}\nendbfchar`,
      );
    }
    return [
      "/CIDInit /ProcSet findresource begin",
      "12 dict begin",
      "begincmap",
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
      `/CMapName /Outpost-Hidden-${font + 1} def`,
      "/CMapType 2 def",
      "1 begincodespacerange",
      "<00> <FF>",
      "endcodespacerange",
      ...blocks,
      "endcmap",
      "CMapName currentdict /CMap defineresource pop",
      "end",
      "end",
    ].join("\n");
  }
}

/** Text for the document's record, where any character is allowed: UTF-16 with a byte-order mark, as hexadecimal. */
function recordString(text: string): string {
  let hex = "FEFF";
  for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** "D:20261116142233+00'00'": a date as PDF writes it, in the device's own time zone. */
function pdfDate(date: Date): string {
  const two = (value: number) => String(Math.trunc(Math.abs(value))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const zone = offset === 0 ? "Z" : `${offset < 0 ? "-" : "+"}${two(offset / 60)}'${two(offset % 60)}'`;
  return `D:${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}${zone}`;
}

/** The page's drawing instructions. PDF measures up from the bottom-left corner; the sheet measures down from the top-left. */
function content(sheet: Sheet, names: ReadonlyMap<string, string>, unicode: UnicodeCodes): string {
  const up = (y: number) => sheet.height - y;
  const lines: string[] = [];
  const draw = (item: SheetItem) => {
    switch (item.kind) {
      case "image": {
        const name = names.get(item.id);
        if (!name) throw new Error(`The page refers to a picture that was not supplied: ${item.id}`);
        lines.push(`q ${n(item.width)} 0 0 ${n(item.height)} ${n(item.x)} ${n(up(item.y + item.height))} cm /${name} Do Q`);
        break;
      }
      case "rect": {
        const box = `${n(item.x)} ${n(up(item.y + item.height))} ${n(item.width)} ${n(item.height)} re`;
        if (item.fill) lines.push(`${rgb(item.fill)} rg ${box} f`);
        if (item.stroke) {
          const pen = `${rgb(item.stroke)} RG ${n(item.lineWidth ?? 0.5)} w`;
          // The pattern of dashes stays set until it is changed, so it is put back to a solid line at once.
          lines.push(item.dash ? `${pen} [${item.dash.map(n).join(" ")}] 0 d ${box} S [] 0 d` : `${pen} ${box} S`);
        }
        break;
      }
      case "line":
        lines.push(`${rgb(item.color)} RG ${n(item.width)} w ${n(item.x1)} ${n(up(item.y1))} m ${n(item.x2)} ${n(up(item.y2))} l S`);
        break;
      case "polygon": {
        const path = item.points.map(([x, y], index) => `${n(x)} ${n(up(y))} ${index === 0 ? "m" : "l"}`).join(" ");
        lines.push(`${rgb(item.fill)} rg ${path} h f`);
        break;
      }
      case "text": {
        // PDF has no centred or right-aligned text: the start is worked out from the width.
        const width = item.mono ? monoWidth(item.text, item.size) : textWidth(item.text, item.size, item.bold);
        const back = item.anchor === "end" ? width : item.anchor === "middle" ? width / 2 : 0;
        const matrix = item.upward ? `0 1 -1 0 ${n(item.x)} ${n(up(item.y) - back)}` : `1 0 0 1 ${n(item.x - back)} ${n(up(item.y))}`;
        if (UnicodeCodes.needed(item)) {
          // Hidden words in another script: each run in the font that has its characters, all in no ink.
          const shown = unicode
            .runs(visualOrder(item.text))
            .map((run) => `/U${run.font + 1} ${n(item.size)} Tf ${hexString(run.codes)} Tj`)
            .join(" ");
          // Each blank glyph is half an em wide. A reader leaves out text that runs off the page, so a long line is squeezed to fit what room there is.
          const natural = ([...item.text].length * item.size) / 2;
          const room = Math.max(1, item.fit ?? sheet.width - item.x - 4);
          const squeeze = natural > room ? `${n((100 * room) / natural)} Tz ` : "";
          lines.push(`BT 3 Tr ${squeeze}${matrix} Tm ${shown} 0 Tr${squeeze ? " 100 Tz" : ""} ET`);
          break;
        }
        const face = item.mono ? (item.bold ? "F4" : "F3") : item.bold ? "F2" : "F1";
        // Rendering mode 3 is "neither fill nor stroke": the words are in the file and nothing is drawn. It stays set until changed, like the dashes above.
        const show = item.hidden ? `3 Tr ${pdfString(item.text)} Tj 0 Tr` : `${pdfString(item.text)} Tj`;
        lines.push(`BT /${face} ${n(item.size)} Tf ${rgb(item.color)} rg ${matrix} Tm ${show} ET`);
        break;
      }
    }
  };
  for (const item of sheet.items) draw(item);
  return lines.join("\n");
}

const ascii = (text: string) => {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
  return bytes;
};

/** One page: the layout the map's page has always had. */
export function writePdf(input: PdfInput): Uint8Array {
  return writePdfPages({ pages: [input.sheet], pictures: input.pictures, title: input.title, created: input.created });
}

export function writePdfPages(input: PdfPagesInput): Uint8Array {
  const [first, ...rest] = input.pages;
  if (!first) throw new Error("A PDF needs at least one page.");
  const pictures = [...(input.pictures ?? new Map<string, PdfPicture>()).entries()];
  const names = new Map(pictures.map(([id], index) => [id, `Im${index + 1}`]));
  // Courier is named in the file only when a page is lettered in it.
  const mono = input.pages.some((page) => page.items.some((item) => item.kind === "text" && item.mono));
  // Hidden words in scripts the typefaces lack, and the fonts that write them.
  const unicode = new UnicodeCodes();
  for (const sheet of input.pages)
    for (const item of sheet.items) if (item.kind === "text" && UnicodeCodes.needed(item)) unicode.add(item.text);
  const unicodeFonts = unicode.fonts;

  // Objects 1 to 7 are fixed, with the first page among them; then the pictures, then
  // Courier if it is used, then the fonts for hidden words in other scripts (each with
  // its map, and one glyph they all share), then each further page and its drawing instructions.
  const firstPicture = 8;
  const firstMono = firstPicture + pictures.length;
  const firstUnicode = firstMono + (mono ? 2 : 0);
  const blankGlyph = firstUnicode + 2 * unicodeFonts;
  const firstLaterPage = blankGlyph + (unicodeFonts > 0 ? 1 : 0);
  const pageObject = (index: number) => (index === 0 ? 3 : firstLaterPage + (index - 1) * 2);
  const resources = [
    `/Font << /F1 5 0 R /F2 6 0 R${mono ? ` /F3 ${firstMono} 0 R /F4 ${firstMono + 1} 0 R` : ""}${Array.from(
      { length: unicodeFonts },
      (_, index) => ` /U${index + 1} ${firstUnicode + 2 * index} 0 R`,
    ).join("")} >>`,
    pictures.length ? `/XObject << ${pictures.map((_, index) => `/Im${index + 1} ${firstPicture + index} 0 R`).join(" ")} >>` : "",
    "/ProcSet [/PDF /Text /ImageC]",
  ]
    .filter(Boolean)
    .join(" ");
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const page = (sheet: Sheet, contents: number) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(sheet.width)} ${n(sheet.height)}] /Resources << ${resources} >> /Contents ${contents} 0 R >>`;
  /** A font whose every glyph is the same blank, half an em wide, so that a selection of the hidden words has some width. */
  const hiddenFont = (index: number) => {
    const count = Math.min(UnicodeCodes.PER_FONT, unicode.characters.length - index * UnicodeCodes.PER_FONT);
    const glyphs = Array.from({ length: count }, (_, code) => `/g${code}`);
    return [
      `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 0 0] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << ${glyphs.map((glyph) => `${glyph} ${blankGlyph} 0 R`).join(" ")} >> /Encoding << /Type /Encoding /Differences [0 ${glyphs.join(" ")}] >> /FirstChar 0 /LastChar ${count - 1} /Widths [${Array.from({ length: count }, () => "500").join(" ")}] /Resources << >> /ToUnicode ${firstUnicode + 2 * index + 1} 0 R >>`,
    ];
  };
  const streamOf = (body: string) => [`<< /Length ${body.length} >>\nstream\n`, body, "\nendstream"];
  const drawing = (sheet: Sheet) => {
    const stream = content(sheet, names, unicode);
    return [`<< /Length ${stream.length} >>\nstream\n`, stream, "\nendstream"];
  };
  const objects: Array<Array<string | Uint8Array>> = [
    ["<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>"],
    [`<< /Type /Pages /Kids [${input.pages.map((_, index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${input.pages.length} >>`],
    [page(first, 4)],
    drawing(first),
    [font("Helvetica")],
    [font("Helvetica-Bold")],
    [
      `<< /Title ${recordString(input.title)} /Creator ${recordString("Outpost")} /Producer ${recordString("Outpost")} /CreationDate (${pdfDate(input.created)}) >>`,
    ],
    ...pictures.map(([, picture]) => [
      `<< /Type /XObject /Subtype /Image /Width ${picture.width} /Height ${picture.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${picture.jpeg.length} >>\nstream\n`,
      picture.jpeg,
      "\nendstream",
    ]),
    ...(mono ? [[font("Courier")], [font("Courier-Bold")]] : []),
    ...Array.from({ length: unicodeFonts }, (_, index) => [hiddenFont(index), streamOf(unicode.toUnicode(index))]).flat(),
    ...(unicodeFonts > 0 ? [streamOf("500 0 d0")] : []),
    ...rest.flatMap((sheet, index) => [[page(sheet, pageObject(index + 1) + 1)], drawing(sheet)]),
  ];

  const parts: Uint8Array[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? ascii(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  // The second line is four bytes above 127, which tells programs that move files about that this one is not text.
  push("%PDF-1.6\n%\xE2\xE3\xCF\xD3\n");
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(length);
    push(`${index + 1} 0 obj\n`);
    for (const part of body) push(part);
    push("\nendobj\n");
  });
  const table = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${table}\n%%EOF\n`);

  const file = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    file.set(part, at);
    at += part.length;
  }
  return file;
}

/** A file name from a title: its letters and figures, in lower case, joined by hyphens. "Map" when nothing is left. */
export function pdfFileName(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return `${base || "map"}.pdf`;
}
