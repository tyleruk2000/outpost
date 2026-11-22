/**
 * The paper aids laid out with the print kit: every letter of every copy in its place on
 * an exact grid, read back from the PDF in order, and the square with its example.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { ALPHABET, vigenereSquare } from "./ciphers";
import { PAD_PITCH, padLetters, padLetterX, padsDocument, squareDocument, squareDrawing, squareExample } from "./kit-aids";
import { PAD_RULE, type Pad, padHeading, SQUARE_TITLE } from "./paper-aids";

const MADE = new Date(Date.UTC(2026, 10, 16));

/** Letters that are not random, so that a line out of place would show. */
const pad = (serial: string, letters: number, start = 0): Pad => ({
  serial,
  letters: Array.from({ length: letters }, (_, index) => ALPHABET[(index + start) % 26]).join(""),
});

interface Item {
  str: string;
  transform: number[];
}

async function read(bytes: Uint8Array): Promise<{ pages: Item[][]; title?: string; sizes: number[][] }> {
  const loading = getDocument({ data: bytes.slice() });
  const pdf = await loading.promise;
  const pages: Item[][] = [];
  const sizes: number[][] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const view = page.getViewport({ scale: 1 });
    sizes.push([view.width, view.height]);
    pages.push(((await page.getTextContent()).items as Item[]).filter((item) => item.str.trim()));
  }
  const info = (await pdf.getMetadata()).info as { Title?: string };
  await loading.destroy();
  return { pages, sizes, title: info.Title };
}

/** The capitals after each copy's heading, in the order the file has them (a reader joins a group's letters, with spaces between). */
function lettersByCopy(items: readonly Item[]): Map<string, string> {
  const found = new Map<string, string>();
  let heading: string | undefined;
  for (const item of items) {
    if (item.str.startsWith("One-time pad ")) {
      heading = item.str;
      found.set(heading, "");
    } else if (heading && /^[A-Z ]+$/.test(item.str)) found.set(heading, found.get(heading)! + item.str.replace(/ /g, ""));
    else if (item.str.startsWith("Use each letter once")) heading = undefined;
  }
  return found;
}

describe("one-time pads with the print kit", () => {
  it("puts every letter on an exact grid: the same place on every line, groups of five apart", () => {
    expect(padLetterX(1) - padLetterX(0)).toBeCloseTo(PAD_PITCH, 9);
    expect(padLetterX(5) - padLetterX(4)).toBeCloseTo(PAD_PITCH * 1.7, 9);
    const drawn = padLetters(pad("AAA-BBB", 250).letters);
    const xs = [...drawn.svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="middle">([A-Z])<\/text>/g)];
    expect(xs).toHaveLength(250);
    // Column by column, every line's letter is at the same x.
    for (let column = 0; column < 50; column += 1) {
      const atColumn = new Set(xs.filter((_, index) => index % 50 === column).map((match) => match[1]));
      expect(atColumn.size).toBe(1);
    }
    expect(drawn.width).toBeLessThanOrEqual(595.28 - 96 - 20);
  });

  it("makes a PDF with each pad twice, every letter as text and in order, and the rule on every copy", async () => {
    const pads = [pad("AAA-BBB", 250), pad("CCC-DDD", 250, 7)];
    const made = await renderPdf(padsDocument(pads, "a4", MADE));
    writeSample("encryption-pads-a4-after", made.bytes);
    const { pages, sizes, title } = await read(made.bytes);
    expect(title).toBe("One-time pads");
    expect(sizes[0]![0]).toBeCloseTo(595.28, 1);
    const found = lettersByCopy(pages.flat());
    expect([...found.keys()]).toEqual(pads.flatMap((one) => [padHeading(one, 1), padHeading(one, 2)]));
    for (const one of pads) {
      expect(found.get(padHeading(one, 1))).toBe(one.letters);
      expect(found.get(padHeading(one, 2))).toBe(one.letters);
    }
    const words = contentText(padsDocument(pads, "a4", MADE).content);
    expect(words.split(PAD_RULE).length - 1).toBe(4);
    expect(words).toContain("For the sender");
    expect(words).toContain("For the receiver");
    expect((await renderPdf(padsDocument(pads, "a4", MADE))).bytes).toEqual(made.bytes);
  }, 30_000);

  it("never splits a copy between pages", async () => {
    const many = Array.from({ length: 6 }, (_, index) => pad(`PAD-${ALPHABET[index]!.repeat(3)}`, 500, index));
    const made = await renderPdf(padsDocument(many, "letter", MADE));
    writeSample("encryption-pads-letter-after", made.bytes);
    const { pages, sizes } = await read(made.bytes);
    expect(sizes[0]).toEqual([612, 792]);
    expect(pages.length).toBeGreaterThan(1);
    for (const items of pages) {
      const found = lettersByCopy(items);
      for (const letters of found.values()) expect(letters).toHaveLength(500);
    }
    expect(lettersByCopy(pages.flat()).size).toBe(12);
  }, 30_000);
});

describe("the Vigenère square with the print kit", () => {
  it("draws the whole square, each letter centred in its cell, with the example where its row and column meet", () => {
    const { svg } = squareDrawing();
    const letters = [...svg.matchAll(/>([A-Z])<\/text>/g)].map((match) => match[1]);
    const rows = vigenereSquare();
    expect(letters).toEqual([...ALPHABET, ...rows.flatMap((row, index) => [ALPHABET[index]!, ...row])]);
    expect(squareExample()).toEqual({ key: "K", message: "E", cipher: "O" });
  });

  it("is one page whose words a reader finds", async () => {
    for (const paper of ["a4", "letter"] as const) {
      const made = await renderPdf(squareDocument(paper, MADE));
      writeSample(`encryption-square-${paper}-after`, made.bytes);
      const { pages, title } = await read(made.bytes);
      expect(title).toBe(SQUARE_TITLE);
      expect(pages).toHaveLength(1);
      const text = pages[0]!.map((item) => item.str).join(" ");
      expect(text).toContain("Vigenère square");
      expect(text).toContain("To encipher: find the key letter down the left side");
      // The square's letters, in order, before the words under it.
      const before = pages[0]!.slice(
        0,
        pages[0]!.findIndex((item) => item.str.startsWith("To encipher")),
      );
      const letters = before
        .filter((item) => /^[A-Z ]+$/.test(item.str))
        .map((item) => item.str.replace(/ /g, ""))
        .join("");
      expect(letters).toBe(
        ALPHABET +
          vigenereSquare()
            .map((row, index) => ALPHABET[index] + row)
            .join(""),
      );
    }
  }, 30_000);
});
