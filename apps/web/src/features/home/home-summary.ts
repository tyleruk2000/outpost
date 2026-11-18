import { formatBytes } from "@outpost/shared";
import { plural } from "@/lib/utils";

/**
 * The sentence at the top of Home. Each figure is the one the screen it names shows:
 * documents as the Library's Documents tab counts them, pages as Notes does, and
 * collections as the Library's Collections tab lists them (maps and terrain included).
 */
export function homeSummary(
  counts: { documents: number; pages: number; collections: number },
  free: number,
  locations: number,
  /** Storage locations that hold something and are not connected just now (a NAS switched off), by name. */
  away: string[] = [],
): string {
  if (counts.documents === 0 && counts.pages === 0 && counts.collections === 0)
    return `Nothing is stored yet. There is ${formatBytes(free)} of room across ${plural(locations, "storage location")}.`;
  const parts = [
    counts.documents ? plural(counts.documents, "document") : null,
    counts.pages ? plural(counts.pages, "page") : null,
    counts.collections ? plural(counts.collections, "collection") : null,
  ].filter(Boolean);
  const held = parts.join(", ").replace(/, ([^,]*)$/, " and $1");
  if (away.length > 0) {
    const names = away.map((name) => `“${name}”`).join(" and ");
    return `${held}. ${names} ${away.length === 1 ? "is" : "are"} not connected, so what is kept there cannot be opened until ${away.length === 1 ? "it is" : "they are"} back; everything else is on this device and readable with no connection. ${formatBytes(free)} free.`;
  }
  return `${held}, all on this device and readable with no connection. ${formatBytes(free)} free.`;
}
