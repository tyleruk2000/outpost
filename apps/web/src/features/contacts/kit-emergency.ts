/**
 * The emergency sheet laid out with the print kit (features/print-kit): the same entries,
 * rows and words as emergency-document.ts, which the household binder still prints the old
 * way. Each contact is a block kept on one page: the name in bold beside a bar in the
 * accent, their role and note under it, then a table of what each thing is and the thing.
 * Phone numbers and callsigns are large, bold, shaded and never broken: one too long for
 * its column is set smaller instead.
 *
 * A sheet whose words hold letters the kit's typeface lacks is made the old way instead
 * (emergency-sheet.tsx, kit-letters.ts). Pure: contacts in, a document out.
 */
import type { ContactDto } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { PRINT_COLOURS as C, callout, measureOf, para, printable, printDocument } from "@/features/print-kit";
import type { ClockStyle } from "@/lib/clock";
import { plural } from "@/lib/utils";
import { type Entry, entryOf, madeWords, measure, type SheetPaper } from "./emergency-document";

/** Every word the sheet prints for these contacts, for the check on letters. */
export const emergencyTexts = (contacts: ContactDto[]): string[] =>
  contacts.flatMap((contact) => {
    const entry = entryOf(contact);
    return [entry.name, ...entry.lines, ...entry.rows.flatMap((row) => [row.label, row.lead ?? "", row.value, row.quiet ?? ""])];
  });

const LABEL = 92;
const NUMBER = 14;

function entryBlock(entry: Entry, measureWidth: number): Content {
  const valueWidth = measureWidth - 6 - LABEL - 16;
  const body = entry.rows.map((row) => {
    const labelCell = { text: printable(row.label), fontSize: 8.5, color: C.muted, margin: [0, row.number ? 3 : 0.5, 0, 0] };
    if (row.number) {
      const size = Math.max(7, Math.min(NUMBER, (NUMBER * valueWidth) / Math.max(1, measure(row.value, NUMBER, true))));
      return [labelCell, { text: row.value, fontSize: size, bold: true, noWrap: true, lineHeight: 1, fillColor: C.accentSoft }];
    }
    return [
      labelCell,
      {
        text: [
          ...(row.lead ? [{ text: `${printable(row.lead)}  `, bold: true }] : []),
          printable(row.value),
          ...(row.quiet ? [{ text: `\n${row.quiet}`, fontSize: 8.5, color: C.muted }] : []),
        ],
        fontSize: 10,
        lineHeight: 1.1,
      },
    ];
  });
  return {
    columns: [
      { width: 4, canvas: [{ type: "rect", x: 0, y: 0, w: 4, h: 22, color: C.accent }] },
      {
        width: "*",
        stack: [
          { text: printable(entry.name), fontSize: 14, bold: true, lineHeight: 1.05 },
          ...entry.lines.map((line) => ({ text: printable(line), fontSize: 9.5, color: C.muted, lineHeight: 1.1 })),
          ...(body.length > 0
            ? [
                {
                  table: { widths: [LABEL, "*"], body },
                  layout: {
                    hLineWidth: (index: number) => (index === 0 ? 0 : 0.4),
                    vLineWidth: () => 0,
                    hLineColor: () => C.rule,
                    paddingLeft: (index: number) => (index === 0 ? 0 : 6),
                    paddingRight: () => 4,
                    paddingTop: () => 3,
                    paddingBottom: () => 3,
                  },
                  margin: [0, 5, 0, 0],
                },
              ]
            : []),
        ],
      },
    ],
    columnGap: 10,
    unbreakable: true,
    margin: [0, 0, 0, 16],
  } as Content;
}

export interface KitEmergencyOptions {
  made: Date;
  style: ClockStyle;
  paper?: SheetPaper;
}

/** The sheet as a document. */
export function emergencyDocument(contacts: ContactDto[], options: KitEmergencyOptions): TDocumentDefinitions {
  const paper = options.paper ?? "a4";
  const width = measureOf(paper);
  const when = madeWords(options.made, options.style);
  const content: Content[] = [
    { text: "Emergency sheet", fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: "In an emergency", fontSize: 24, bold: true, lineHeight: 1.05, margin: [0, 2, 0, 4] },
    { text: `${plural(contacts.length, "contact")}, as kept in Outpost on ${when}.`, fontSize: 10, color: C.muted, margin: [0, 0, 0, 10] },
    callout(
      "warn",
      "Other people's details",
      para(
        "These are other people's details. Keep the sheet where those who may need it can find it. A printed or saved copy does not change when a contact does: make it again after a number changes.",
        0,
      ),
    ),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 2, 0, 14] },
    ...contacts.map((contact) => entryBlock(entryOf(contact), width)),
  ];
  return printDocument({
    paper,
    title: `Emergency sheet, ${plural(contacts.length, "contact")}`,
    made: options.made,
    footerName: "Emergency sheet · Outpost",
    footerRight: `Made ${when}`,
    parts: [{ kind: "plain", content }],
  });
}
