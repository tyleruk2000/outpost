/**
 * Makes the PDF. pdfmake (MIT) and the typeface are loaded here, on the first PDF made,
 * and not before: they are a separate part of the app's files, fetched from Outpost
 * itself like the rest of it. Nothing is fetched from anywhere else.
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { countingPages } from "./document";
import { PRINT_FONT } from "./tokens";

type PdfMake = typeof import("pdfmake/build/pdfmake.min.js");

let loading: Promise<PdfMake> | null = null;

/** pdfmake with Outpost's typeface in it, loaded once. */
function loadPdfMake(): Promise<PdfMake> {
  loading ??= Promise.all([import("pdfmake/build/pdfmake.min.js"), import("./fonts")])
    .then(([module, fonts]) => {
      const pdfMake = ((module as { default?: PdfMake }).default ?? module) as PdfMake;
      pdfMake.addVirtualFileSystem(fonts.FONT_FILES);
      pdfMake.addFonts({ [PRINT_FONT]: fonts.FONT_FAMILY });
      return pdfMake;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export interface RenderedPdf {
  bytes: Uint8Array;
  /** How many pages it came to. */
  pages: number;
}

export async function renderPdf(definition: TDocumentDefinitions): Promise<RenderedPdf> {
  const pdfMake = await loadPdfMake();
  const { doc, pages } = countingPages(definition);
  const buffer = await pdfMake.createPdf(doc).getBuffer();
  return { bytes: new Uint8Array(buffer), pages: Math.max(1, pages()) };
}
