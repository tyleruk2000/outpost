/** Filtering, ordering and wording for catalogue entries. Pure, so the rules can be tested without a screen. */
import { type CatalogCategorySlug, type CatalogEntryDto, type CatalogPack, formatBytes } from "@outpost/shared";
import { formatDate } from "@/lib/utils";

export type ShowFilter = "all" | "included" | "installed" | "not_installed";
export type SortOrder = "name" | "smallest" | "largest";

export interface CatalogFilter {
  query: string;
  show: ShowFilter;
}

type Searchable = Pick<CatalogEntryDto, "name" | "description" | "publisher" | "tags">;

/** Every word typed has to appear somewhere in the name, description, publisher or tags. */
export function matchesQuery(entry: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [entry.name, entry.description, entry.publisher, ...(entry.tags ?? [])].join("\n").toLowerCase();
  return words.every((word) => text.includes(word));
}

/** An entry whose file ships with Outpost: adding it copies the file, and nothing is downloaded. */
export const isIncluded = (entry: Pick<CatalogEntryDto, "source">): boolean => entry.source.type === "bundled";

export function filterEntries<T extends Searchable & Pick<CatalogEntryDto, "status" | "source">>(entries: T[], filter: CatalogFilter): T[] {
  return entries.filter((entry) => {
    if (filter.show === "included" && !isIncluded(entry)) return false;
    if (filter.show === "installed" && entry.status !== "installed") return false;
    if (filter.show === "not_installed" && entry.status === "installed") return false;
    return matchesQuery(entry, filter.query);
  });
}

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Entries of unknown size go last whichever way the sizes run. */
export function sortEntries<T extends Pick<CatalogEntryDto, "name" | "sizeBytes">>(entries: T[], order: SortOrder): T[] {
  const sorted = [...entries];
  if (order === "name") return sorted.sort((a, b) => byName.compare(a.name, b.name));
  const direction = order === "smallest" ? 1 : -1;
  return sorted.sort((a, b) => {
    if (a.sizeBytes === null || b.sizeBytes === null)
      return a.sizeBytes === b.sizeBytes ? byName.compare(a.name, b.name) : a.sizeBytes === null ? 1 : -1;
    return (a.sizeBytes - b.sizeBytes) * direction || byName.compare(a.name, b.name);
  });
}

/** How many entries each category holds, plus the total under "all". */
export function countByCategory(entries: Array<Pick<CatalogEntryDto, "category">>): Record<string, number> {
  const counts: Record<string, number> = { all: entries.length };
  for (const entry of entries) counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  return counts;
}

/** A category, everything, or the packs (curated lists across categories). */
export type CategoryChoice = CatalogCategorySlug | "all" | "packs";

// ── Wording ──

/** "about 14.0 MB" while the size is the catalogue's estimate, the exact figure once the source has confirmed it. */
export function sizeText(entry: Pick<CatalogEntryDto, "sizeBytes" | "sizeIsEstimate">): string {
  if (entry.sizeBytes === null) return "Size not known yet";
  return entry.sizeIsEstimate ? `about ${formatBytes(entry.sizeBytes)}` : formatBytes(entry.sizeBytes);
}

let languageNames: Intl.DisplayNames | undefined;

/** "English" for "en"; the code itself when the browser does not know the language. */
export function languageName(code: string): string {
  try {
    languageNames ??= new Intl.DisplayNames(["en"], { type: "language" });
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The date the source published this edition, when it gave one. */
export function publishedDate(entry: Pick<CatalogEntryDto, "publishedAt">): string | null {
  const published = entry.publishedAt ? Date.parse(entry.publishedAt) : Number.NaN;
  return Number.isFinite(published) ? formatDate(published) : null;
}

/** The edition on offer: its date when the source gave one, otherwise its version label. */
export function editionText(entry: Pick<CatalogEntryDto, "version" | "publishedAt">): string | null {
  const date = publishedDate(entry);
  if (date) return `Published ${date}`;
  return entry.version ? `Version ${entry.version}` : null;
}

/** What kind of file an entry is, when it is not a reference collection (which needs no saying). */
export function formatLabel(format: CatalogEntryDto["format"]): string | null {
  switch (format) {
    case "pdf":
      return "PDF document";
    case "epub":
      return "EPUB book";
    case "html":
      return "Web page";
    case "markdown":
      return "Text document";
    case "other":
      return "File";
    default:
      return null;
  }
}

/** The licence as one plain sentence, saying so when nobody has checked the terms. */
export function licenceText(entry: Pick<CatalogEntryDto, "license" | "licenseNote">): string {
  const seeSource = /^see source$/i.test(entry.license.trim());
  // A note usually explains the terms of a licence that was read at the source. It marks
  // the licence as unchecked only when it says so, or when there is no licence to name.
  const unverified = seeSource ? Boolean(entry.licenseNote) : /not (?:been )?verified/i.test(entry.licenseNote ?? "");
  if (seeSource) return unverified ? "Licence: see the source. Not verified by the catalogue maintainers." : "Licence: see the source.";
  return unverified ? `Licence: ${entry.license}. Not verified by the catalogue maintainers.` : `Licence: ${entry.license}.`;
}

/**
 * What an entry is doing on this server and the one thing a person would do next.
 * `unavailable` wins only while nothing is installed or under way: a withdrawn
 * collection that is already here can still be opened.
 */
export type EntrySituation = "available" | "unavailable" | "queued" | "downloading" | "paused" | "failed" | "installed" | "update";

export function entrySituation(entry: Pick<CatalogEntryDto, "status" | "updateAvailable" | "availability">): EntrySituation {
  switch (entry.status) {
    case "queued":
    case "downloading":
    case "paused":
    case "failed":
      return entry.status;
    case "installed":
      return entry.updateAvailable && entry.availability !== "unavailable" ? "update" : "installed";
    default:
      return entry.availability === "unavailable" ? "unavailable" : "available";
  }
}

export type EntryActionKind = "download" | "add" | "update" | "open" | "retry" | "manage" | "none";

export interface EntryAction {
  kind: EntryActionKind;
  /** The words on the control; null when there is nothing to press. */
  label: string | null;
}

/** The one thing to do next. An entry that ships with Outpost is added, not downloaded. */
export function entryAction(situation: EntrySituation, included = false): EntryAction {
  switch (situation) {
    case "available":
      return included ? { kind: "add", label: "Add to library" } : { kind: "download", label: "Download" };
    case "update":
      return { kind: "update", label: "Update" };
    case "installed":
      return { kind: "open", label: "Open" };
    case "failed":
      return { kind: "retry", label: "Retry" };
    case "queued":
    case "downloading":
    case "paused":
      return { kind: "manage", label: null };
    case "unavailable":
      return { kind: "none", label: null };
  }
}

/**
 * Where "Open" leads. A sheet that ships with Outpost opens as the document it became;
 * everything else opens its collection page, where it is read, checked and managed.
 */
export function openTarget(entry: Pick<CatalogEntryDto, "source" | "documentId" | "collectionId">): string {
  return isIncluded(entry) && entry.documentId ? `/library/documents/${entry.documentId}` : `/library/collections/${entry.collectionId}`;
}

// ── Packs ──

export interface PackSummary {
  /** The pack's entries, in its own order. */
  items: CatalogEntryDto[];
  /** Entries already in the library. */
  installed: number;
  /** Entries being fetched or queued right now. */
  underWay: number;
  /** Entries that are neither here nor on their way. */
  missing: CatalogEntryDto[];
}

export const isUnderWay = (entry: Pick<CatalogEntryDto, "status">) =>
  entry.status === "queued" || entry.status === "downloading" || entry.status === "paused";

/** Where a pack stands against what is already in the library. */
export function packSummary(pack: Pick<CatalogPack, "entryIds">, entries: CatalogEntryDto[]): PackSummary {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const items = pack.entryIds.flatMap((id) => byId.get(id) ?? []);
  return {
    items,
    installed: items.filter((entry) => entry.status === "installed").length,
    underWay: items.filter(isUnderWay).length,
    missing: items.filter((entry) => entry.status !== "installed" && !isUnderWay(entry)),
  };
}

export interface FetchSize {
  /** Bytes still to fetch from the internet, as far as sizes are known. */
  bytes: number;
  /** Some of the sizes are the catalogue's estimates. */
  approximate: boolean;
  /** Entries whose size is not known at all. */
  unknown: number;
  /** Entries that need a connection, as opposed to those that ship with Outpost. */
  online: number;
  /** Entries that ship with Outpost and are simply added. */
  included: number;
}

/** What fetching these entries will take. Entries that ship with Outpost cost nothing to fetch. */
export function fetchSize(entries: CatalogEntryDto[]): FetchSize {
  const size: FetchSize = { bytes: 0, approximate: false, unknown: 0, online: 0, included: 0 };
  for (const entry of entries) {
    if (entry.source.type === "bundled") {
      size.included += 1;
      continue;
    }
    size.online += 1;
    if (entry.sizeBytes === null) size.unknown += 1;
    else {
      size.bytes += entry.sizeBytes;
      if (entry.sizeIsEstimate) size.approximate = true;
    }
  }
  return size;
}

/** "about 1.20 GB to fetch", "nothing to fetch", "62.0 MB to fetch, plus 2 of unknown size". */
export function fetchSizeText(size: FetchSize): string {
  if (size.online === 0) return "nothing to fetch";
  const amount = size.bytes > 0 ? `${size.approximate ? "about " : ""}${formatBytes(size.bytes)} to fetch` : "size not known yet";
  return size.unknown > 0 && size.bytes > 0 ? `${amount}, plus ${size.unknown} of unknown size` : amount;
}

/** One line on where a pack stands: "11 items, about 62.0 MB to fetch, 2 already here". */
export function packLine(summary: PackSummary): string {
  const total = summary.items.length;
  if (summary.installed === total) return `All ${total} already in your library`;
  const parts = [`${total} ${total === 1 ? "item" : "items"}`];
  if (summary.missing.length > 0) parts.push(fetchSizeText(fetchSize(summary.missing)));
  if (summary.installed > 0) parts.push(`${summary.installed} already here`);
  if (summary.underWay > 0) parts.push(`${summary.underWay} on ${summary.underWay === 1 ? "its" : "their"} way`);
  return parts.join(", ");
}
