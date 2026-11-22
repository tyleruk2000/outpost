/**
 * The purification guidance as a sheet to print and keep beside the water: the methods
 * and what each does, the bleach tables, and what none of them removes, all quoted from
 * the screen's own data. Pure. `purificationBlocks` is the sheet as plain blocks (the
 * household book prints them); `purificationDocument` is the printed sheet, laid out
 * with the print kit, with the kit's drawing of the boiling the quotes describe.
 */
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  boiling,
  bullets,
  callout,
  dataTable,
  figure,
  heading,
  label,
  measureOf,
  note,
  PRINT_COLOURS,
  PRINT_TYPE,
  type PrintPaper,
  para,
  printable,
  quote,
  twoColumns,
} from "@/features/print-kit";
import { type Block, guidanceDocument, sourcesBlock } from "../kit/sheet";
import { BLEACH_STEPS, BLEACH_TABLES, EFFECT_LEGEND, METHODS, WATER_SOURCES, WHAT_NONE_REMOVE } from "./guidance";

/** The date the guidance on the sheet was read from its sources: the sheet is dated by it, not by the clock. */
export const GUIDANCE_READ = "2026-11-16";

export const PURIFICATION_TITLE = "Making water safe to drink: official guidance (read 16 November 2026)";

export function purificationBlocks(): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: "Making water safe to drink" },
    {
      kind: "para",
      text: "General information quoted from official guidance, read on 16 November 2026. Follow your water supplier's or health authority's instructions where they give any: they know your water.",
    },
    { kind: "heading", text: "What each method does (CDC chart CS341852-A)" },
    {
      kind: "table",
      head: ["Method", "Bacteria", "Viruses", "Giardia", "Cryptosporidium"],
      rows: METHODS.map((method) => [method.name, method.bacteria, method.viruses, method.giardia, method.cryptosporidium]),
    },
    { kind: "para", text: EFFECT_LEGEND },
  ];
  for (const method of METHODS) {
    if (method.quotes.length === 0) continue;
    blocks.push(
      { kind: "heading", text: method.name },
      { kind: "list", items: method.quotes.map((quote) => `"${quote.text}" (${quote.who})`) },
    );
  }
  blocks.push({ kind: "heading", text: "Household bleach" });
  for (const table of BLEACH_TABLES) {
    blocks.push(
      { kind: "para", text: table.title },
      { kind: "table", head: ["Water", "Bleach to add"], rows: table.rows.map((row) => [row.water, row.dose]) },
    );
  }
  blocks.push({ kind: "list", items: BLEACH_STEPS.map((step) => `"${step.text}" (${step.who})`) });
  blocks.push(
    { kind: "heading", text: "What none of these makes safe" },
    { kind: "list", items: WHAT_NONE_REMOVE.map((item) => `"${item.text}" (${item.who})`) },
  );
  blocks.push({
    kind: "heading",
    text: "Sources",
  });
  blocks.push({
    kind: "list",
    items: [
      WATER_SOURCES.cdcBackcountry,
      WATER_SOURCES.cdcEmergency,
      WATER_SOURCES.cdcHiking,
      WATER_SOURCES.epa,
      WATER_SOURCES.who,
      WATER_SOURCES.dwi,
    ].map((source) => `${source.name}: ${source.url}`),
  });
  return blocks;
}

// ── The printed sheet ───────────────────────────────────────────────────────

const READ_WORDS = "16 November 2026";

/** A verdict's cell: the words, on a tint for each kind, so that the words still carry it in grey. */
function verdictCell(words: string): TableCell {
  const not = words.startsWith("Not effective");
  const some = words.startsWith("Somewhat");
  const fill = not
    ? PRINT_COLOURS.actSoft
    : some
      ? PRINT_COLOURS.warnSoft
      : words.startsWith("Effective")
        ? PRINT_COLOURS.accentSoft
        : null;
  const colour = not ? PRINT_COLOURS.act : some ? PRINT_COLOURS.warnInk : PRINT_COLOURS.accent;
  const [first, ...rest] = printable(words).split(", ");
  return {
    text: [
      { text: first ?? "", bold: true, color: colour },
      ...(rest.length > 0 ? [{ text: `, ${rest.join(", ")}`, color: PRINT_COLOURS.ink }] : []),
    ],
    fillColor: fill,
    fontSize: PRINT_TYPE.small + 0.3,
  } as TableCell;
}

/** The CDC chart, cell for cell, each verdict tinted. */
function methodsTable(): Content {
  const head = ["Method", "Bacteria", "Viruses", "Giardia", "Cryptosporidium"].map((words) => ({
    text: words,
    bold: true,
    fontSize: PRINT_TYPE.small + 0.5,
    fillColor: PRINT_COLOURS.shade,
  }));
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [80, "*", "*", "*", "*"],
      body: [
        head,
        ...METHODS.map((method) => [
          { text: method.name, bold: true, fontSize: PRINT_TYPE.table },
          verdictCell(method.bacteria),
          verdictCell(method.viruses),
          verdictCell(method.giardia),
          verdictCell(method.cryptosporidium),
        ]),
      ],
    },
    layout: {
      hLineWidth: () => 1.5,
      vLineWidth: () => 1.5,
      hLineColor: () => "#ffffff",
      vLineColor: () => "#ffffff",
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 2, 0, 6],
  } as Content;
}

const quoted = (item: { text: string; who: string }) => quote(printable(item.text), item.who);

/** The purification guidance as a printed sheet, laid out with the print kit. */
export function purificationDocument(paper: PrintPaper): TDocumentDefinitions {
  const measure = measureOf(paper);
  const boil = METHODS.find((method) => method.id === "boil")!;
  const others = METHODS.filter((method) => method.id !== "boil" && method.quotes.length > 0);
  const tables = BLEACH_TABLES.map((table) => [
    label(table.title, PRINT_COLOURS.know),
    dataTable(
      ["Water", "Bleach to add"],
      table.rows.map((row) => [row.water, row.dose.replace(/ \/ /g, "\n")]),
      { widths: [62, "*"] },
    ),
  ]);
  return guidanceDocument({
    paper,
    title: PURIFICATION_TITLE,
    subject: "Official guidance on making water safe to drink, quoted.",
    made: new Date(`${GUIDANCE_READ}T00:00:00Z`),
    footerName: "Making water safe to drink",
    footerRight: `Official guidance, read ${READ_WORDS}`,
    sections: [
      {
        title: "Making water safe to drink",
        subtitle: `General information quoted from official guidance, read on ${READ_WORDS}.`,
        content: [
          callout(
            "know",
            "Your supplier knows your water",
            para("Follow your water supplier's or health authority's instructions where they give any: they know your water.", 0),
          ),
          callout("act", "What none of these makes safe", WHAT_NONE_REMOVE.map(quoted)),
          heading("What each method does"),
          methodsTable(),
          note(`${printable(EFFECT_LEGEND)} (CDC chart CS341852-A)`),
        ],
      },
      {
        title: "Each method, in their words",
        subtitle: "What the CDC, the EPA, the WHO and the Drinking Water Inspectorate say of each.",
        content: [
          label("Boiling"),
          figure(boiling().svg, { width: measure * 0.62, caption: "Outpost's drawing of the words on boiling quoted under it." }),
          twoColumns(boil.quotes.slice(0, 2).map(quoted), boil.quotes.slice(2).map(quoted)),
          ...others.flatMap((method) =>
            method.id === "iodine"
              ? [callout("warn", "Iodine", method.quotes.map(quoted))]
              : [label(method.name), ...method.quotes.map(quoted)],
          ),
          sourcesBlock([
            WATER_SOURCES.cdcBackcountry,
            WATER_SOURCES.cdcEmergency,
            WATER_SOURCES.cdcHiking,
            WATER_SOURCES.epa,
            WATER_SOURCES.who,
            WATER_SOURCES.dwi,
          ]),
        ],
      },
      {
        title: "Household bleach",
        subtitle: "The EPA's and the CDC's tables, exactly as published. Use the one for the strength on your bottle.",
        content: [
          callout("warn", "With every dose", bullets(BLEACH_STEPS.map((step) => `“${printable(step.text)}” (${step.who})`))),
          twoColumns(tables.slice(0, 2).flat(), tables.slice(2).flat()),
        ],
      },
    ],
  });
}
