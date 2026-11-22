/**
 * The safe cooking temperatures as a sheet to print and keep in the kitchen, from the
 * screen's own data. Pure. `safetyBlocks` is the sheet as plain blocks;
 * `safetyDocument` is the printed sheet, laid out with the print kit, with the FSA's and
 * FSS's temperatures drawn on one scale (diagrams.ts).
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import {
  callout,
  dataTable,
  figure,
  heading,
  label,
  measureOf,
  type PrintPaper,
  para,
  printable,
  quote,
  twoColumns,
} from "@/features/print-kit";
import { type Block, guidanceDocument, sourcesBlock } from "../kit/sheet";
import { temperatureScale } from "./diagrams";
import { COOKING_SOURCES, FSA_RULE, FSA_TIME_TEMPERATURE, GAS_MARKS, SAFETY_QUOTES, TIME_IS_A_GUIDE } from "./safety";

/** When the guidance was read: the sheet is dated by it, not by the clock. */
export const SAFETY_READ = "2026-11-16";
export const SAFETY_SHEET_TITLE = "Safe cooking temperatures: UK food-safety guidance (read 16 November 2026)";

export function safetyBlocks(): Block[] {
  return [
    { kind: "title", text: "Safe cooking temperatures" },
    {
      kind: "para",
      text: "General information quoted from the Food Standards Agency (FSA) and Food Standards Scotland (FSS), read on 16 November 2026. A cooking time is a guide; the temperature in the middle of the food is what matters.",
    },
    { kind: "para", text: `"${FSA_RULE}" (FSA)` },
    {
      kind: "table",
      head: ["In the middle of the food", "For at least"],
      rows: FSA_TIME_TEMPERATURE.map((row) => [`${row.celsius}°C`, row.time]),
    },
    { kind: "heading", text: "Checks" },
    { kind: "list", items: [...SAFETY_QUOTES, TIME_IS_A_GUIDE].map((quote) => `"${quote.text}" (${quote.who})`) },
    { kind: "heading", text: "Roasting a bird, when the packaging gives no time (FSA)" },
    {
      kind: "list",
      items: [
        "Turkey, oven preheated to 180ºC (160ºC fan, 350ºF or Gas Mark 4): 45 minutes per kg plus 20 minutes under 4.5 kg; 40 minutes per kg from 4.5 to 6.5 kg; 35 minutes per kg over 6.5 kg.",
        "Chicken, 180ºC (160ºC fan, 350ºF or Gas Mark 4): 45 minutes per kg plus 20 minutes.",
        "Goose, 200ºC (180ºC fan, 400ºF or Gas Mark 6): 35 minutes per kg. Duck, 200ºC: 45 minutes per kg.",
      ],
    },
    { kind: "heading", text: "Gas marks (Which?)" },
    {
      kind: "table",
      head: ["Gas mark", "°C", "Fan °C", "°F"],
      rows: GAS_MARKS.map((row) => [String(row.mark), String(row.celsius), String(row.fan), String(row.fahrenheit)]),
    },
    { kind: "heading", text: "Sources" },
    {
      kind: "list",
      items: [COOKING_SOURCES.fsaCooking, COOKING_SOURCES.fsaChristmas, COOKING_SOURCES.fss, COOKING_SOURCES.which].map(
        (source) => `${source.name}: ${source.url}`,
      ),
    },
  ];
}

/** The FSA's roasting times for a bird when the packaging gives none, as the sheet's list gives them. */
const ROASTS: string[][] = [
  [
    "Turkey",
    "180ºC (160ºC fan, 350ºF or Gas Mark 4)",
    "45 minutes per kg plus 20 minutes under 4.5 kg; 40 minutes per kg from 4.5 to 6.5 kg; 35 minutes per kg over 6.5 kg",
  ],
  ["Chicken", "180ºC (160ºC fan, 350ºF or Gas Mark 4)", "45 minutes per kg plus 20 minutes"],
  ["Goose", "200ºC (180ºC fan, 400ºF or Gas Mark 6)", "35 minutes per kg"],
  ["Duck", "200ºC", "45 minutes per kg"],
];

const quoted = (item: { text: string; who: string }) => quote(printable(item.text), item.who);

/** The safe cooking temperatures as a printed sheet, laid out with the print kit. */
export function safetyDocument(paper: PrintPaper): TDocumentDefinitions {
  const measure = measureOf(paper);
  const checks = SAFETY_QUOTES.filter((item) => !item.text.includes("Danger Zone") && item.who !== "FSS");
  const half = Math.ceil(checks.length / 2);
  return guidanceDocument({
    paper,
    title: SAFETY_SHEET_TITLE,
    subject: "UK food-safety guidance on cooking temperatures, quoted.",
    made: new Date(`${SAFETY_READ}T00:00:00Z`),
    footerName: "Safe cooking temperatures",
    footerRight: "UK food-safety guidance, read 16 November 2026",
    sections: [
      {
        title: "Safe cooking temperatures",
        subtitle:
          "General information quoted from the Food Standards Agency (FSA) and Food Standards Scotland (FSS), read on 16 November 2026.",
        content: [
          callout("know", "The temperature in the middle is what matters", [
            quote(FSA_RULE, "FSA"),
            dataTable(
              ["In the middle of the food", "For at least"],
              FSA_TIME_TEMPERATURE.map((row) => [`**${row.celsius}°C**`, row.time]),
              { widths: [140, "*"] },
            ),
          ]),
          figure(temperatureScale(measure).svg, {
            title: "On one scale",
            width: measure,
            caption: `“${printable(SAFETY_QUOTES.find((item) => item.text.includes("Danger Zone"))!.text)}” (FSA) “${printable(
              SAFETY_QUOTES.find((item) => item.who === "FSS")!.text,
            )}” (FSS)`,
          }),
          heading("Checks"),
          twoColumns(checks.slice(0, half).map(quoted), checks.slice(half).map(quoted)),
        ],
      },
      {
        title: "Roasting and oven temperatures",
        subtitle: "For a bird when the packaging gives no time (FSA), and gas marks (Which?).",
        content: [
          label("Roasting a bird, when the packaging gives no time (FSA)"),
          dataTable(["Bird", "Oven, preheated", "Time"], ROASTS, { bold: [0], widths: [50, 150, "*"] }),
          callout("warn", "A cooking time is a guide", para(`“${TIME_IS_A_GUIDE.text}” (${TIME_IS_A_GUIDE.who})`, 0)),
          label("Gas marks (Which?)"),
          dataTable(
            ["Gas mark", "°C", "Fan °C", "°F", ""],
            GAS_MARKS.map((row) => [`**${row.mark}**`, String(row.celsius), String(row.fan), String(row.fahrenheit), row.words]),
            { right: [1, 2, 3], widths: [50, 50, 50, 50, "*"] },
          ),
          sourcesBlock([COOKING_SOURCES.fsaCooking, COOKING_SOURCES.fsaChristmas, COOKING_SOURCES.fss, COOKING_SOURCES.which]),
        ],
      },
    ],
  });
}
