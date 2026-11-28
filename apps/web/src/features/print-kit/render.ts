/**
 * Makes the PDF. pdfmake (MIT) and the typeface are loaded here, on the first PDF made,
 * and not before: they are a separate part of the app's files, fetched from Outpost
 * itself like the rest of it. Nothing is fetched from anywhere else.
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { countingPages } from "./document";
import { FALLBACK_LOADERS, type FallbackFont, needsRightToLeft, withFallbacks } from "./fallback";
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
  /**
   * What `textForMarks` found in pdfkit's fonts: how many had a map back to text, and how many glyphs of no letter
   * of their own it gave the zero width joiner. It reads pdfkit's insides, so a test checks it still finds them.
   */
  textMaps: { fonts: number; marks: number };
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

type PdfKitFonts = { _fontFamilies?: Record<string, { unicode?: number[][] }> };

/**
 * A glyph that stands for no letter of its own, such as the dots Noto Sans Arabic draws
 * as marks of their own, is written by pdfkit with an empty entry in the font's map back
 * to text, which a reader turns into a stray control character in the middle of the word
 * (so a search for the word fails). Such glyphs are given the zero width joiner, which
 * readers leave out. Done after the pages are laid out and before the fonts are written.
 */
function textForMarks(pdfKit: PdfKitFonts): { fonts: number; marks: number } {
  let fonts = 0;
  let marks = 0;
  for (const font of Object.values(pdfKit._fontFamilies ?? {})) {
    if (Array.isArray(font.unicode)) fonts += 1;
    font.unicode?.forEach((codePoints, glyph) => {
      if (codePoints?.length === 0) {
        font.unicode![glyph] = [0x200d];
        marks += 1;
      }
    });
  }
  return { fonts, marks };
}

export async function renderPdf(definition: TDocumentDefinitions): Promise<RenderedPdf> {
  const pdfMake = await loadPdfMake();
  // Letters the typeface lacks are set in a fallback font, loaded only when they are there.
  let fallen = withFallbacks(definition);
  // Arabic and Hebrew are put in the order they are drawn; what does it is loaded only for them.
  if (needsRightToLeft(fallen.fonts)) fallen = withFallbacks(definition, await (await import("./rtl")).loadRightToLeft(fallen.fonts));
  await loadFallbacks(pdfMake, fallen.fonts);
  const { doc, pages } = countingPages(fallen.doc);
  const output = pdfMake.createPdf(doc);
  const textMaps = textForMarks((await output.getStream()) as unknown as PdfKitFonts);
  const buffer = await output.getBuffer();
  return { bytes: new Uint8Array(buffer), pages: Math.max(1, pages()), textMaps };
}
