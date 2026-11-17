/**
 * The catalogue: what could be downloaded on a subject, with its size, and whether it is
 * already held. Read from the list Explore shows (`ctx.services.catalog.list()`), matched
 * by Explore's own rule (`matchesQuery`) and sized in its words (`sizeText`). Nothing is
 * asked of any source: sizes and availability are as of the last refresh.
 */
import { CATALOG_CATEGORIES, type CatalogEntryDto, matchesQuery, sizeText } from "@outpost/shared";
import { z } from "zod";
import { dayOf, defineTool, pageOf, type ToolDefinition } from "./types.ts";

function heldWords(entry: CatalogEntryDto): string {
  if (entry.status === "installed") return entry.updateAvailable ? "Held: yes (a newer edition is offered)." : "Held: yes.";
  if (entry.status === "queued" || entry.status === "downloading" || entry.status === "paused") return "Held: being downloaded now.";
  const failed = entry.status === "failed" ? " (the last download failed)" : "";
  if (entry.source.type === "bundled") return `Held: no${failed}; it ships with Outpost, so adding it in Explore needs no connection.`;
  if (entry.availability === "unavailable")
    return `Held: no${failed}; its source no longer offers it${entry.unavailableReason ? ` (${entry.unavailableReason})` : ""}.`;
  return `Held: no${failed}; in Explore, ${sizeText(entry)}.`;
}

export const searchCatalogue = defineTool({
  name: "search_catalogue",
  title: "the catalogue",
  area: "catalogue",
  description:
    "What could be downloaded into Outpost on a subject (encyclopaedias, manuals, maps of knowledge), with its size and whether it is already held. Give a subject in a few words.",
  input: z.object({
    subject: z.string().trim().min(1).max(120).describe("A subject in a few words, e.g. first aid."),
    page: z.number().int().min(1).max(20).optional().describe("Which page, from 1."),
  }),
  run({ subject, page }, { ctx }) {
    const catalogue = ctx.services.catalog.list({ adopt: false });
    let entries = catalogue.entries.filter((entry) => matchesQuery(entry, subject));
    let loose = false;
    if (entries.length === 0) {
      // No entry has every word: those with the most of them, by Explore's rule word by word.
      const words = subject.split(/\s+/).filter((word) => word.length > 2);
      const scored = catalogue.entries
        .map((entry) => ({ entry, hits: words.filter((word) => matchesQuery(entry, word)).length }))
        .filter((item) => item.hits > 0)
        .sort((a, b) => b.hits - a.hits);
      entries = scored.map((item) => item.entry);
      loose = entries.length > 0;
    }
    const refreshed = catalogue.lastRefreshedAt
      ? `Sizes as of ${dayOf(catalogue.lastRefreshedAt)}.`
      : "Sizes are the catalogue's estimates.";
    if (entries.length === 0) {
      return {
        held: false,
        url: "/explore",
        text: `Nothing in Outpost's catalogue is about "${subject}". Try other words; the library itself is searched with search_library.`,
      };
    }
    const { shown, line } = pageOf(entries, page ?? 1, 8);
    const category = (slug: string) => CATALOG_CATEGORIES.find((entry) => entry.slug === slug)?.label ?? slug;
    return {
      held: true,
      label: `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`,
      url: "/explore",
      text: [
        `In the catalogue, for "${subject}"${loose ? " (no entry has every word; these have some)" : ""}:`,
        ...shown.map(
          (entry) =>
            `- ${entry.name} (${category(entry.category)}, ${entry.publisher}): ${entry.description.replace(/\s+/g, " ").slice(0, 140)} ${heldWords(entry)}`,
        ),
        line,
        refreshed,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const CATALOGUE_TOOLS: ToolDefinition[] = [searchCatalogue];
