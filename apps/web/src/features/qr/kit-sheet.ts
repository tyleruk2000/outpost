/**
 * The printed sheet of a code laid out with the print kit (features/print-kit): a heading,
 * the code in a frame to cut out, what it holds in a table, and how to use it in two steps.
 *
 * The code is drawn as filled rectangles, one to a run of dark modules, inside a drawing
 * placed at its own size: the modules come to exactly PRINTED_WIDTH_MM across, with the
 * quiet zone the standard asks for round them in white. Black on white, as readers expect.
 * Only the words are in the file as text: the code's own text is not added unseen, because
 * for a Wi-Fi code it holds the password. A sheet whose words hold letters the kit's
 * typeface lacks is made the old way instead (sheet.ts). Pure: a code and words in, a
 * document out.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { AidPaper } from "@/features/encryption/paper-aids";
import {
  PRINT_COLOURS as C,
  callout,
  type Drawing,
  dataTable,
  drawing,
  printable,
  printDocument,
  round,
  steps,
} from "@/features/print-kit";
import type { Described } from "./content";
import type { QrCode } from "./encoder";
import { darkRuns, QUIET_ZONE } from "./render";
import { PRINTED_WIDTH_MM } from "./sheet";

const PT_PER_MM = 72 / 25.4;
/** White beyond the quiet zone, to the broken line to cut along. */
const CUT_MARGIN = 4 * PT_PER_MM;

/** Every word the sheet prints, for the check on letters. */
export const qrTexts = (described: Described, footer: string): string[] => [
  described.heading,
  described.action,
  footer,
  ...described.lines.flatMap((line) => [line.label, line.value]),
];

/** The code at its printed size, its quiet zone, and a broken line round them to cut along. */
export function codeDrawing(code: QrCode): Drawing & { module: number; codeLeft: number } {
  const side = PRINTED_WIDTH_MM * PT_PER_MM;
  const module = side / code.size;
  const quiet = QUIET_ZONE * module;
  const extent = side + 2 * quiet + 2 * CUT_MARGIN;
  const codeLeft = CUT_MARGIN + quiet;
  let body = `<rect x="0" y="0" width="${round(extent)}" height="${round(extent)}" fill="#ffffff"/>`;
  body += `<rect x="0.5" y="0.5" width="${round(extent - 1)}" height="${round(extent - 1)}" rx="6" fill="none" stroke="${C.muted}" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  // A little taller than the module (0.3 pt), so that no white seam shows between neighbouring runs in a viewer that smooths edges.
  for (const run of darkRuns(code))
    body += `<rect x="${round(codeLeft + run.column * module)}" y="${round(codeLeft + run.row * module)}" width="${round(run.length * module)}" height="${round(module + 0.3)}" fill="#000000"/>`;
  return { ...drawing(extent, extent, body), module, codeLeft };
}

export function qrDocument(code: QrCode, described: Described, paper: AidPaper, footer: string, made: Date): TDocumentDefinitions {
  const picture = codeDrawing(code);
  const content: Content[] = [
    { text: "QR code", fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: printable(described.heading), fontSize: 22, bold: true, lineHeight: 1.05, margin: [0, 2, 0, 12] },
    { svg: picture.svg, width: picture.width, height: picture.height, alignment: "center", margin: [0, 0, 0, 4] },
    {
      text: `Cut along the broken line to put it up. The code is ${PRINTED_WIDTH_MM / 10} cm across: print at actual size (100%).`,
      fontSize: 7.5,
      color: C.muted,
      alignment: "center",
      margin: [0, 0, 0, 14],
    },
  ];
  if (described.lines.length > 0)
    content.push(
      dataTable(
        ["What it holds", ""],
        described.lines.map((line) => [line.label, line.value]),
        { widths: [110, "*"], bold: [0] },
      ),
    );
  content.push(callout("know", "How to use it", steps(["Point the phone’s camera at the code.", described.action])));
  return printDocument({
    paper,
    title: described.title,
    made,
    footerName: "QR code · Outpost",
    footerRight: footer,
    parts: [{ kind: "plain", content }],
  });
}
