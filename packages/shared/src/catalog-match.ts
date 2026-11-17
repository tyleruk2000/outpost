/**
 * Whether a catalogue entry is about what was typed, and its size in words: the rules
 * Explore uses, and the ones the server's search_catalogue tool uses, so that both find
 * and describe the same entries alike.
 */
import type { CatalogEntryDto } from "./catalog.ts";
import { formatBytes } from "./common.ts";

type Searchable = Pick<CatalogEntryDto, "name" | "description" | "publisher" | "tags">;

/** Every word typed has to appear somewhere in the name, description, publisher or tags. */
export function matchesQuery(entry: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [entry.name, entry.description, entry.publisher, ...(entry.tags ?? [])].join("\n").toLowerCase();
  return words.every((word) => text.includes(word));
}

/** "about 14.0 MB" while the size is the catalogue's estimate, the exact figure once the source has confirmed it. */
export function sizeText(entry: Pick<CatalogEntryDto, "sizeBytes" | "sizeIsEstimate">): string {
  if (entry.sizeBytes === null) return "Size not known yet";
  return entry.sizeIsEstimate ? `about ${formatBytes(entry.sizeBytes)}` : formatBytes(entry.sizeBytes);
}
