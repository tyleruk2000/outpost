/** Filtering, ordering and wording for catalogue entries. Pure, so the rules can be tested without a screen. */
import { type CatalogCategorySlug, type CatalogEntryDto, formatBytes } from "@outpost/shared";
import { formatDate } from "@/lib/utils";

export type ShowFilter = "all" | "installed" | "not_installed";
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

export function filterEntries<T extends Searchable & Pick<CatalogEntryDto, "status">>(entries: T[], filter: CatalogFilter): T[] {
  return entries.filter((entry) => {
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

export type CategoryChoice = CatalogCategorySlug | "all";

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

export type EntryActionKind = "download" | "update" | "open" | "retry" | "manage" | "none";

export interface EntryAction {
  kind: EntryActionKind;
  /** The words on the control; null when there is nothing to press. */
  label: string | null;
}

/** Members can browse and open; only administrators start, retry or update downloads. */
export function entryAction(situation: EntrySituation, isAdmin: boolean): EntryAction {
  switch (situation) {
    case "available":
      return isAdmin ? { kind: "download", label: "Download" } : { kind: "none", label: null };
    case "update":
      return isAdmin ? { kind: "update", label: "Update" } : { kind: "open", label: "Open" };
    case "installed":
      return { kind: "open", label: "Open" };
    case "failed":
      return isAdmin ? { kind: "retry", label: "Retry" } : { kind: "none", label: null };
    case "queued":
    case "downloading":
    case "paused":
      return isAdmin ? { kind: "manage", label: null } : { kind: "none", label: null };
    case "unavailable":
      return { kind: "none", label: null };
  }
}
