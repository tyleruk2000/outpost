/**
 * For tests only: a made PDF read back with pdf.js, the way the library's own reader of
 * PDFs reads it, each page's size and words.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function readPdf(file: Uint8Array) {
  const reading = getDocument({ data: file.slice(), useSystemFonts: false, disableFontFace: true });
  const document = await reading.promise;
  const pages: Array<{ width: number; height: number; text: string }> = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const [, , width, height] = page.view;
    const content = await page.getTextContent();
    pages.push({
      width: Math.round(width! * 100) / 100,
      height: Math.round(height! * 100) / 100,
      text: content.items
        .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : ""))
        .join(" ")
        .replace(/[ \t]+/g, " "),
    });
  }
  const { info } = (await document.getMetadata()) as { info: Record<string, string> };
  await reading.destroy();
  return { pages, info, text: pages.map((page) => page.text).join("\n") };
}
