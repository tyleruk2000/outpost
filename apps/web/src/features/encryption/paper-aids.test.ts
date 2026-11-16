/**
 * The paper aids as a PDF file: its pages, their size, and the letters in it, read
 * back both from the file's own bytes and by another PDF reader.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { monoWidth } from "@/features/maps/print/courier";
import type { Sheet } from "@/features/maps/print/sheet";
import { ALPHABET, vigenereSquare } from "./ciphers";
import {
  aidPdf,
  likelyPaper,
  makePads,
  PAD_RULE,
  type Pad,
  padHeading,
  padLines,
  padPages,
  SQUARE_TITLE,
  squarePages,
  textRight,
} from "./paper-aids";

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

/** Letters that are not random, so that a line out of place would show: the alphabet over and over, started at a different letter for each pad. */
const pad = (serial: string, letters: number, start = 0): Pad => ({
  serial,
  letters: Array.from({ length: letters }, (_, index) => ALPHABET[(index + start) % 26]).join(""),
});

/** Every line of text a reader finds in the file, page by page, in the order it is written. */
async function read(file: Uint8Array) {
  const reading = getDocument({
    data: file.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
  });
  const document = await reading.promise;
  const pages: Array<{ width: number; height: number; lines: string[]; fonts: string[] }> = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; fontName: string }>;
    pages.push({
      width: view.width,
      height: view.height,
      lines: items.map((item) => item.str).filter((line) => line.trim()),
      fonts: [...new Set(items.map((item) => content.styles[item.fontName]?.fontFamily ?? ""))],
    });
  }
  const info = (await document.getMetadata()).info as { Title?: string };
  await reading.destroy();
  return { pages, title: info.Title };
}

/** The letters of each copy of each pad as a reader finds them: what follows a copy's heading, up to its rule. */
function lettersByCopy(lines: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  let heading: string | undefined;
  for (const line of lines) {
    if (/^One-time pad /.test(line)) {
      heading = line;
      found.set(heading, "");
    } else if (heading && /^[A-Z]{1,5}( [A-Z]{1,5})*$/.test(line)) found.set(heading, found.get(heading)! + line.replace(/ /g, ""));
    else if (/^Use each letter once/.test(line)) heading = undefined;
  }
  return found;
}

describe("one-time pads as a PDF", () => {
  const pads = [pad("AAA-BBB", 250), pad("CCC-DDD", 250, 7)];

  it("is pages of A4 or US Letter, in points", async () => {
    const a4 = await read(aidPdf(padPages(pads, "a4"), "One-time pads", new Date(0)));
    expect(a4.pages).toHaveLength(1);
    expect(a4.pages[0]!.width).toBeCloseTo(595.28, 2);
    expect(a4.pages[0]!.height).toBeCloseTo(841.89, 2);
    expect(a4.title).toBe("One-time pads");
    const file = aidPdf(padPages(pads, "letter"), "One-time pads", new Date(0));
    expect(latin1(file)).toContain("/MediaBox [0 0 612 792]");
    const letter = await read(file);
    expect(letter.pages.map((page) => [page.width, page.height])).toEqual([[612, 792]]);
  });

  it("holds each pad twice, with every letter as text and in order", async () => {
    const { pages } = await read(aidPdf(padPages(pads, "a4"), "One-time pads", new Date(0)));
    const found = lettersByCopy(pages.flatMap((page) => page.lines));
    expect([...found.keys()]).toEqual([
      "One-time pad AAA-BBB, copy 1 of 2",
      "One-time pad AAA-BBB, copy 2 of 2",
      "One-time pad CCC-DDD, copy 1 of 2",
      "One-time pad CCC-DDD, copy 2 of 2",
    ]);
    for (const made of pads) {
      expect(found.get(padHeading(made, 1))).toBe(made.letters);
      expect(found.get(padHeading(made, 2))).toBe(made.letters);
    }
    const words = pages.flatMap((page) => page.lines).join(" ");
    expect(words).toContain("For the sender");
    expect(words).toContain("For the receiver");
    // The rule is on every copy, whole, though it is broken over two lines.
    expect(words.split("Use each letter once, from the top.").length - 1).toBe(4);
    expect(words).toContain(PAD_RULE.slice(-40));
  });

  it("writes the letters in the file as plain text, a line of the pad at a time", () => {
    const made = pad("AAA-BBB", 100);
    const text = latin1(aidPdf(padPages([made], "a4"), "One-time pads", new Date(0)));
    const written = [...text.matchAll(/\/F3 12 Tf [^\n]*?\(([A-Z ]+)\) Tj/g)].map((match) => match[1]);
    expect(written).toEqual([...padLines(made.letters), ...padLines(made.letters)]);
    expect(written[0]).toBe("ABCDE FGHIJ KLMNO PQRST UVWXY ZABCD EFGHI JKLMN OPQRS TUVWX");
    expect(text).toContain("(01) Tj");
    expect(text).toContain("(02) Tj");
  });

  it("names Courier and Helvetica and carries no font of its own", async () => {
    const file = aidPdf(padPages(pads, "a4"), "One-time pads", new Date(0));
    const text = latin1(file);
    expect(text).toContain("/Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding");
    expect(text).toContain("/Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding");
    expect(text).toContain("/BaseFont /Helvetica ");
    expect(text).not.toMatch(/\/FontFile|\/FontDescriptor|\/Subtype \/(TrueType|Type0|CIDFontType)/);
    // No stream but the pages' own drawing instructions, which are text: nothing is compressed or embedded.
    expect(text.match(/\nstream\n/g)).toHaveLength(1);
    expect(text).not.toContain("/Filter");
    // Small enough that it is plainly letters and lines: under 8 kB for two pads.
    expect(file.length).toBeLessThan(8_000);
    const { pages } = await read(file);
    expect(pages[0]!.fonts.some((font) => /mono|courier/i.test(font))).toBe(true);
  });

  it("is a well-formed file of several pages when the pads do not fit on one", async () => {
    const many = Array.from({ length: 8 }, (_, index) => pad(`PAD-${ALPHABET[index]}${ALPHABET[index]}${ALPHABET[index]}`, 500, index));
    const sheets = padPages(many, "a4");
    // A copy of 500 letters is ten lines; three fit on a page of A4, and there are sixteen copies.
    expect(sheets).toHaveLength(6);
    const file = aidPdf(sheets, "One-time pads", new Date(0));
    const text = latin1(file);
    const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const entries = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    // Catalogue, page list, two fonts, the record, two more fonts, and a page and its drawing six times over.
    expect(entries).toHaveLength(7 + 2 + 5 * 2);
    for (const [index, offset] of entries.entries())
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    for (const match of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const from = match.index + match[0].length;
      expect(text.slice(from + Number(match[1]), from + Number(match[1]) + 10)).toBe("\nendstream");
    }
    expect(text).toContain("/Kids [3 0 R 10 0 R 12 0 R 14 0 R 16 0 R 18 0 R] /Count 6");

    const { pages } = await read(file);
    expect(pages).toHaveLength(6);
    const found = lettersByCopy(pages.flatMap((page) => page.lines));
    expect(found.size).toBe(16);
    for (const made of many) {
      expect(found.get(padHeading(made, 1))).toBe(made.letters);
      expect(found.get(padHeading(made, 2))).toBe(made.letters);
    }
    // No copy is split: every page starts with a heading and ends with the end of a rule.
    for (const page of pages) {
      expect(page.lines[0]).toMatch(/^One-time pad PAD-/);
      expect(page.lines[page.lines.length - 1]).toMatch(/let nobody else see it\.$/);
    }
  });

  const onPaper = (sheets: Sheet[], label: string) => {
    for (const sheet of sheets) {
      for (const item of sheet.items) {
        if (item.kind === "text") {
          expect(textRight(item), `${label}: ${item.text}`).toBeLessThanOrEqual(sheet.width - 28);
          expect(item.y, `${label}: ${item.text}`).toBeLessThanOrEqual(sheet.height - 28);
          expect(item.y - item.size, `${label}: ${item.text}`).toBeGreaterThanOrEqual(28);
        } else if (item.kind === "rect") {
          expect(item.x + item.width, label).toBeLessThanOrEqual(sheet.width - 28);
          expect(item.y + item.height, label).toBeLessThanOrEqual(sheet.height - 28);
        } else if (item.kind === "line") {
          expect(Math.max(item.x1, item.x2), label).toBeLessThanOrEqual(sheet.width - 28);
          expect(Math.max(item.y1, item.y2), label).toBeLessThanOrEqual(sheet.height - 28);
        }
      }
    }
  };

  it("keeps every size of pad, and the square, inside the paper's margins on both papers", () => {
    for (const paper of ["a4", "letter"] as const) {
      for (const letters of [100, 250, 500])
        onPaper(padPages([pad("AAA-BBB", letters), pad("CCC-DDD", letters)], paper), `${paper} ${letters}`);
      onPaper(squarePages(paper), `${paper} square`);
    }
  });

  it("makes pads from the random source: different each time, the two copies alike", async () => {
    const made = makePads(2, 100);
    expect(made[0]!.letters).toMatch(/^[A-Z]{100}$/);
    expect(made[0]!.letters).not.toBe(made[1]!.letters);
    const { pages } = await read(aidPdf(padPages(made, "letter"), "One-time pads"));
    const found = lettersByCopy(pages.flatMap((page) => page.lines));
    for (const one of made) expect([found.get(padHeading(one, 1)), found.get(padHeading(one, 2))]).toEqual([one.letters, one.letters]);
  });
});

describe("the Vigenère square as a PDF", () => {
  it("is one page with the whole square as text, each letter in the middle of its cell", async () => {
    const sheets = squarePages("a4");
    expect(sheets).toHaveLength(1);
    const letters = sheets[0]!.items.filter((item) => item.kind === "text" && item.mono);
    // 26 along the top, and 26 rows of a heading and 26 letters.
    expect(letters).toHaveLength(26 + 26 * 27);
    const file = aidPdf(sheets, SQUARE_TITLE, new Date(0));
    const text = latin1(file);
    // "è" is byte 232 of the encoding, written as an octal escape.
    expect(text).toContain("(Vigen\\350re square) Tj");
    expect(text).toContain("/BaseFont /Courier-Bold");
    const { pages, title } = await read(file);
    expect(title).toBe("Vigenère square");
    expect(pages).toHaveLength(1);
    const single = pages[0]!.lines.filter((line) => /^[A-Z]$/.test(line));
    const rows = vigenereSquare();
    const expected = [...ALPHABET, ...rows.flatMap((row, index) => [ALPHABET[index]!, ...row])];
    expect(single).toEqual(expected);
    expect(pages[0]!.lines.join(" ")).toContain("To encipher: find the key letter down the left side");
    // A letter is 5.4 points wide and its cell 18.14: it starts 6.37 points in from the cell's left edge.
    expect(monoWidth("A", 9)).toBeCloseTo(5.4, 9);
  });
});

describe("which paper to start with", () => {
  it("is US Letter where that is the paper, and A4 elsewhere", () => {
    expect(likelyPaper("en-US")).toBe("letter");
    expect(likelyPaper("fr-CA")).toBe("letter");
    expect(likelyPaper("en-GB")).toBe("a4");
    expect(likelyPaper("de")).toBe("a4");
    expect(likelyPaper(undefined)).toBe("a4");
  });
});
