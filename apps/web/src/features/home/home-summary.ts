import { formatBytes } from "@outpost/shared";
import { plural } from "@/lib/utils";

/**
 * The sentence at the top of Home. Each figure is the one the screen it names shows:
 * documents as the Library's Documents tab counts them, pages as Notes does, and
 * collections as the Library's Collections tab lists them (maps and terrain included).
 */
export function homeSummary(counts: { documents: number; pages: number; collections: number }, free: number, locations: number): string {
  if (counts.documents === 0 && counts.pages === 0 && counts.collections === 0)
    return `Nothing is stored yet. There is ${formatBytes(free)} of room across ${plural(locations, "storage location")}.`;
  const parts = [
    counts.documents ? plural(counts.documents, "document") : null,
    counts.pages ? plural(counts.pages, "page") : null,
    counts.collections ? plural(counts.collections, "collection") : null,
  ].filter(Boolean);
  return `${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}, all on this device and readable with no connection. ${formatBytes(free)} free.`;
}
