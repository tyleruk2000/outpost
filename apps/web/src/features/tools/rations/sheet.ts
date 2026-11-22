/**
 * The ration plan as a sheet to print and keep: who is fed, each person's daily figure and
 * what it is made of, the stock shared by need, and who must not be put on a reduced
 * ration by a calculator. Pure. `rationBlocks` is the sheet as plain blocks;
 * `rationDocument` is the printed sheet, laid out with the print kit, with each person's
 * share drawn against their need (diagrams.ts).
 */
import { type PersonNeed, RATION_QUOTES, RATION_SOURCES, type ShareLine } from "@outpost/shared";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { callout, dataTable, figure, heading, measureOf, PRINT_COLOURS, type PrintPaper, para, quote } from "@/features/print-kit";
import { type Block, guidanceDocument, sourcesBlock } from "../kit/sheet";
import { shareBars } from "./diagrams";

const whole = (value: number) => Math.round(value).toLocaleString("en-GB");

export function rationBlocks({
  title,
  needs,
  shared,
  whoNot,
}: {
  title: string;
  needs: PersonNeed[];
  shared: { perDay: number; lines: ShareLine[] };
  whoNot: string;
}): Block[] {
  return [
    { kind: "title", text: title },
    {
      kind: "para",
      text: "A planning aid worked out with Outpost's ration calculator from the figures of the bodies named below. It gives no medical or dietary advice.",
    },
    { kind: "heading", text: "Who must not be put on a reduced ration by a calculator" },
    { kind: "para", text: whoNot },
    { kind: "heading", text: "Each person's need a day" },
    {
      kind: "table",
      head: ["Who", "Made of", "kcal a day", "Kept on full"],
      rows: needs.map((need) => [
        need.name || "Someone",
        need.parts.map((part) => `${part.label} ${whole(part.kcal)}`).join(" + "),
        need.kcal === null ? "no figure" : whole(need.kcal),
        need.protected ? `yes: ${need.why.join(", ")}` : "",
      ]),
    },
    { kind: "heading", text: `The stock shared by need: ${whole(shared.perDay)} kcal a day` },
    {
      kind: "table",
      head: ["Who", "kcal a day", "Of their need"],
      rows: shared.lines.map((line) => [line.name || "Someone", whole(line.kcal), `${Math.round(line.ofNeed * 100)}%`]),
    },
    { kind: "heading", text: "Sources" },
    { kind: "list", items: Object.values(RATION_SOURCES).map((source) => `${source.name}, read ${source.read}`) },
  ];
}

export interface RationSheet {
  title: string;
  needs: PersonNeed[];
  shared: { perDay: number; lines: ShareLine[] };
  whoNot: string;
  /** How many days the stock is to last, and the stock, kcal: for the figures at the top. */
  days: number;
  storeKcal: number;
  /** The sheet's date: when its sources were read. */
  made: Date;
  paper: PrintPaper;
}

/** The ration plan as a printed sheet, laid out with the print kit. */
export function rationDocument(sheet: RationSheet): TDocumentDefinitions {
  const measure = measureOf(sheet.paper);
  const { needs, shared } = sheet;
  const kept = new Set(needs.filter((need) => need.protected).map((need) => need.id));
  const short = shared.lines.filter((line) => line.ofNeed < 0.999);
  const figures = {
    table: {
      widths: ["*", "*", "*"],
      body: [
        [
          [whole(sheet.storeKcal), "kcal in the stock"],
          [String(sheet.days), sheet.days === 1 ? "day it must last" : "days it must last"],
          [whole(shared.perDay), "kcal a day from it"],
        ].map(([value, words]) => ({
          stack: [
            { text: value, fontSize: 16, bold: true, color: PRINT_COLOURS.accent, lineHeight: 1 },
            { text: words, fontSize: 7.5, color: PRINT_COLOURS.muted, margin: [0, 3, 0, 0] },
          ],
        })),
      ],
    },
    layout: {
      hLineWidth: (index: number) => (index === 0 ? 1.4 : 0.4),
      vLineWidth: (index: number) => (index === 0 || index === 3 ? 0 : 0.4),
      hLineColor: (index: number) => (index === 0 ? PRINT_COLOURS.accent : PRINT_COLOURS.rule),
      vLineColor: () => PRINT_COLOURS.rule,
      paddingLeft: (index: number) => (index === 0 ? 0 : 8),
      paddingTop: () => 7,
      paddingBottom: () => 7,
    },
    margin: [0, 0, 0, 12],
  };
  const bars = shareBars(
    shared.lines.map((line) => ({ ...line, kept: kept.has(line.id) })),
    measure,
  );
  return guidanceDocument({
    paper: sheet.paper,
    title: sheet.title,
    subject: "A ration plan: a planning aid worked out with Outpost's ration calculator.",
    made: sheet.made,
    footerName: sheet.title,
    footerRight: "A planning aid, not dietary advice",
    sections: [
      {
        title: sheet.title,
        subtitle:
          "A planning aid worked out with Outpost's ration calculator from the figures of the bodies named below. It gives no medical or dietary advice.",
        content: [
          figures as never,
          callout("act", "Who must not be put on a reduced ration by a calculator", para(sheet.whoNot, 0)),
          figure(bars.svg, {
            title: "Each person's share of the stock, a day",
            width: measure,
            caption:
              short.length === 0
                ? "The stock gives everyone their whole need for the days it must last."
                : "Those kept on a full ration have their need met first while the stock allows; the rest share what is left in proportion to their needs.",
          }),
          ...(short.length > 0
            ? [
                callout("warn", "Less than their need", [
                  quote(RATION_QUOTES.fnneAcrossTheBoard, "UNHCR, UNICEF, WFP and WHO"),
                  quote(RATION_QUOTES.sphereNotIndividual, "Sphere, of its planning figures"),
                ]),
              ]
            : []),
          heading("Each person's need a day"),
          dataTable(
            ["Who", "Made of", "kcal a day", "Kept on full"],
            needs.map((need) => [
              need.name || "Someone",
              need.parts.map((part) => `${part.label} ${whole(part.kcal)}`).join(" + "),
              need.kcal === null ? "no figure" : whole(need.kcal),
              need.protected ? `yes: ${need.why.join(", ")}` : "",
            ]),
            { right: [2], bold: [0] },
          ),
          heading(`The stock shared by need: ${whole(shared.perDay)} kcal a day`),
          dataTable(
            ["Who", "kcal a day", "Of their need"],
            shared.lines.map((line) => [line.name || "Someone", whole(line.kcal), `${Math.round(line.ofNeed * 100)}%`]),
            { right: [1, 2], bold: [0] },
          ),
          sourcesBlock(Object.values(RATION_SOURCES)),
        ],
      },
    ],
  });
}
