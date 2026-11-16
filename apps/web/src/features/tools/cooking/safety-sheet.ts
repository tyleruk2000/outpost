/**
 * The safe cooking temperatures as a sheet to print and keep in the kitchen, from the
 * screen's own data. Pure: blocks out.
 */
import type { Block } from "../kit/sheet";
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
