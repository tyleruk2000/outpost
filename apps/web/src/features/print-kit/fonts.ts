/**
 * The printed page's typeface, Atkinson Hyperlegible Next (SIL Open Font License 1.1,
 * fonts/OFL.txt), in its regular, bold, italic and bold italic. The files are in the
 * repository and built into this module, which is only loaded when a PDF is made: no
 * font is fetched from anywhere.
 */
import bold from "./fonts/AtkinsonHyperlegibleNext-Bold.ttf?inline";
import boldItalic from "./fonts/AtkinsonHyperlegibleNext-BoldItalic.ttf?inline";
import italic from "./fonts/AtkinsonHyperlegibleNext-Italic.ttf?inline";
import regular from "./fonts/AtkinsonHyperlegibleNext-Regular.ttf?inline";

/** A data address's base64 part, which is what pdfmake's file system takes. */
const base64 = (url: string) => url.slice(url.indexOf(",") + 1);

export const FONT_FILES: Record<string, string> = {
  "Atkinson-Regular.ttf": base64(regular),
  "Atkinson-Bold.ttf": base64(bold),
  "Atkinson-Italic.ttf": base64(italic),
  "Atkinson-BoldItalic.ttf": base64(boldItalic),
};

export const FONT_FAMILY = {
  normal: "Atkinson-Regular.ttf",
  bold: "Atkinson-Bold.ttf",
  italics: "Atkinson-Italic.ttf",
  bolditalics: "Atkinson-BoldItalic.ttf",
};
