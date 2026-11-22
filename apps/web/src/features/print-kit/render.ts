/**
 * Makes the PDF. pdfmake (MIT) and the typeface are loaded here, on the first PDF made,
 * and not before: they are a separate part of the app's files, fetched from Outpost
 * itself like the rest of it. Nothing is fetched from anywhere else.
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { countingPages } from "./document";
import { FALLBACK_LOADERS, type FallbackFont, withFallbacks } from "./fallback";
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

const loadedFallbacks = new Set<FallbackFont>();

/** The fallback fonts a document needs and has not had yet, into pdfmake. */
async function loadFallbacks(pdfMake: PdfMake, fonts: ReadonlySet<FallbackFont>) {
  const wanted = [...fonts].filter((font) => !loadedFallbacks.has(font));
  const files = await Promise.all(wanted.map((font) => FALLBACK_LOADERS[font]()));
  wanted.forEach((font, index) => {
    const { regular, bold } = files[index]!;
    pdfMake.addVirtualFileSystem({ [`${font}-Regular.ttf`]: regular, [`${font}-Bold.ttf`]: bold });
    pdfMake.addFonts({
      [font]: { normal: `${font}-Regular.ttf`, bold: `${font}-Bold.ttf`, italics: `${font}-Regular.ttf`, bolditalics: `${font}-Bold.ttf` },
    });
    loadedFallbacks.add(font);
  });
}

export async function renderPdf(definition: TDocumentDefinitions): Promise<RenderedPdf> {
  const pdfMake = await loadPdfMake();
  // Letters the typeface lacks are set in a fallback font, loaded only when they are there.
  const fallen = withFallbacks(definition);
  await loadFallbacks(pdfMake, fallen.fonts);
  const { doc, pages } = countingPages(fallen.doc);
  const buffer = await pdfMake.createPdf(doc).getBuffer();
  return { bytes: new Uint8Array(buffer), pages: Math.max(1, pages()) };
}
