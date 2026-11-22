/** The templates on the print kit: the pieces to cut out at exactly the size they always were, and a page of how to use them. */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { writePdfPages } from "@/features/maps/print/pdf";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { nocturnalSheets, sheetText, sundialSheets } from "./templates";
import { KIT_LOOK, nocturnalDocument, sundialDocument } from "./templates-kit";

/** The pages through the old writer, as the templates were made before the print kit. */
const sundialPdf = (input: Parameters<typeof sundialSheets>[0]) =>
  writePdfPages({ pages: sundialSheets(input), title: "Sundial", created: new Date(Date.UTC(input.year, 0, 1)) });
const nocturnalPdf = (input: Parameters<typeof nocturnalSheets>[0]) =>
  writePdfPages({ pages: nocturnalSheets(input), title: "Nocturnal", created: new Date(Date.UTC(input.year, 0, 1)) });

const HOME = { latitude: 51.48, longitude: -0.1, standardOffset: 0, year: 2026, placeName: "Home" };
const SYDNEY = { latitude: -33.87, longitude: 151.21, standardOffset: 600, year: 2026, placeName: "Sydney" };

/** Each piece of text pdf.js finds on a page, with where its baseline starts, in points from the page's top left. */
async function placed(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  const pages: Array<Array<{ text: string; x: number; y: number; height: number }>> = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const { height } = page.getViewport({ scale: 1 });
    pages.push(
      (await page.getTextContent()).items.flatMap((item) =>
        "str" in item && item.str.trim()
          ? [{ text: item.str.trim(), x: item.transform[4] as number, y: height - (item.transform[5] as number), height: item.height }]
          : [],
      ),
    );
  }
  return pages;
}

describe("the templates on the print kit", () => {
  it("draws the same pieces as before, line for line, in colour", () => {
    const old = sundialSheets(HOME);
    const kit = sundialSheets(HOME, KIT_LOOK);
    const lines = (page: (typeof old)[number]) =>
      page.items.flatMap((item) => (item.kind === "line" ? [[item.x1, item.y1, item.x2, item.y2].map((v) => v.toFixed(3)).join()] : []));
    // Every line of the dial plate is where it was; the gnomon's too.
    expect(lines(kit[0]!)).toEqual(lines(old[0]!));
    for (const drawn of lines(kit[1]!)) expect(lines(old[1]!)).toContain(drawn);
    const nocturnal = nocturnalSheets(HOME, KIT_LOOK);
    expect(lines(nocturnal[0]!)).toEqual(lines(nocturnalSheets(HOME)[0]!));
    expect(sheetText(nocturnal).join(" ")).toContain("Kochab");
  });

  it("prints every piece at the size it was: the hour figures and the scale bar's words stand where they stood", async () => {
    for (const [name, oldBytes, document] of [
      ["sundial", sundialPdf(HOME), sundialDocument(HOME)],
      ["nocturnal", nocturnalPdf(HOME), nocturnalDocument(HOME)],
    ] as const) {
      const printed = await renderPdf(document);
      writeSample(`${name}-after`, printed.bytes);
      expect(printed.pages).toBe(3);
      const before = await placed(oldBytes);
      const after = await placed(printed.bytes);
      for (const page of [0, 1]) {
        // The bar's words start 104 mm right of the bar's left end, on its line: the same place on the paper.
        const bar = (pages: typeof before) => pages[page]!.find((item) => item.text.startsWith("This bar should measure"));
        expect(bar(after)!.x).toBeCloseTo(bar(before)!.x, 1);
        expect(bar(after)!.y).toBeCloseTo(bar(before)!.y, 0);
      }
      // Figures on the drawing: the same baseline and the same middle, whatever the typeface.
      const figures = name === "sundial" ? ["9", "12", "3", "6"] : ["Jan", "Jun", "Oct"];
      for (const figure of figures) {
        const was = before[0]!.find((item) => item.text === figure);
        const now = after[0]!.find((item) => item.text === figure);
        expect(now, figure).toBeDefined();
        expect(now!.y).toBeCloseTo(was!.y, 0);
      }
    }
  }, 60_000);

  it("says how to set it up and use it, in words that can be found", async () => {
    const sundial = contentText(sundialDocument(HOME).content);
    expect(sundial).toContain("Find true north, not a compass's.");
    expect(sundial).toContain("Never look at the sun");
    expect(sundial).toContain("51.5°, your latitude");
    expect(contentText(sundialDocument(SYDNEY).content)).toContain("true south");
    const nocturnal = contentText(nocturnalDocument(HOME).content);
    expect(nocturnal).toContain("Merak and Dubhe");
    expect(nocturnal).toContain("Polaris, through the centre hole");
    const one = await renderPdf(sundialDocument(HOME));
    const two = await renderPdf(sundialDocument(HOME));
    expect(two.bytes).toEqual(one.bytes);
  }, 60_000);

  it("prints a place named in Greek, Cyrillic or Chinese by its name, as words a reader finds", async () => {
    for (const [placeName, make, sample] of [
      ["Αθήνα", sundialDocument, "sundial-names-after"],
      ["Москва", nocturnalDocument, "nocturnal-names-after"],
      ["北京", sundialDocument, null],
    ] as const) {
      const printed = await renderPdf(make({ ...HOME, placeName }));
      if (sample) writeSample(sample, printed.bytes);
      const text = (await placed(printed.bytes))
        .flat()
        .map((piece) => piece.text)
        .join("");
      expect(text.replace(/\s/g, "")).toContain(placeName);
    }
  }, 60_000);
});
