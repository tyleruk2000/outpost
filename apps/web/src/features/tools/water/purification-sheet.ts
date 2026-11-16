/**
 * The purification guidance as a sheet to print and keep beside the water: the methods
 * and what each does, the bleach tables, and what none of them removes, all quoted from
 * the screen's own data. Pure: blocks out.
 */
import type { Block } from "../kit/sheet";
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
