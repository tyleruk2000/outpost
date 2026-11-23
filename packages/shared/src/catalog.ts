import type { DownloadDto } from "./downloads.ts";

/**
 * Catalogue categories, in the order Explore shows them: what a new household wants first (an
 * encyclopedia, a medical reference, maps), then being ready, then the skills and the rest.
 */
export const CATALOG_CATEGORIES = [
  { slug: "encyclopedias", label: "Wikipedia and encyclopedias" },
  { slug: "medicine", label: "Medicine and first aid" },
  { slug: "maps", label: "Offline maps" },
  { slug: "preparedness", label: "Disaster preparedness" },
  { slug: "survival", label: "Survival and wilderness skills" },
  { slug: "climbing", label: "Climbing and mountaineering" },
  { slug: "food", label: "Food preservation and cooking" },
  { slug: "agriculture", label: "Agriculture and gardening" },
  { slug: "navigation", label: "Navigation and the outdoors" },
  { slug: "radio", label: "Radio communications" },
  { slug: "engineering", label: "Engineering and electronics" },
  { slug: "repair", label: "Vehicle and equipment repair" },
  { slug: "science", label: "Science and education" },
  { slug: "reference", label: "History and general reference" },
  { slug: "reading", label: "Literature and reading" },
] as const;

export type CatalogCategorySlug = (typeof CATALOG_CATEGORIES)[number]["slug"];

export const CATALOG_CATEGORY_SLUGS = CATALOG_CATEGORIES.map((category) => category.slug) as [
  CatalogCategorySlug,
  ...CatalogCategorySlug[],
];

export const CATALOG_FORMATS = ["zim", "pdf", "epub", "html", "markdown", "other"] as const;
export type CatalogFormat = (typeof CATALOG_FORMATS)[number];

/** A book in the Kiwix library, found by name and flavour each time it is needed. */
export interface CatalogKiwixSource {
  type: "kiwix";
  name: string;
  /** "maxi", "nopic", "mini", … or the empty string for books with a single edition. */
  flavour: string;
}

/** A file at a fixed https address. */
export interface CatalogHttpSource {
  type: "http";
  url: string;
  sha256?: string;
  sizeBytes?: number;
  version?: string;
  published?: string;
}

/** One chapter of a book that ships with Outpost. */
export interface CatalogBookChapter {
  /** The chapter's name in links between chapters. It stays the same from one edition to the next. */
  key: string;
  /** The number as printed in the contents: "00", "05A", "A". */
  number?: string;
  title: string;
  /** One line for the contents page. */
  summary?: string;
  /** File name inside the book's folder: "03-everyday-controls.md". */
  file: string;
}

/** A named part of a book, holding its chapters in reading order. */
export interface CatalogBookSection {
  title: string;
  chapters: CatalogBookChapter[];
}

/** A book that ships with Outpost: a folder of Markdown chapters and their order. */
export interface CatalogBook {
  /** Path of the folder inside `bundled`, with forward slashes: "logbook73/g90". */
  folder: string;
  /** In reading order. Every chapter belongs to one section. */
  sections: CatalogBookSection[];
}

/**
 * Something that ships with Outpost itself, in the `bundled` folder beside the manifests:
 * either one file, which becomes one document, or a book, which becomes one document per
 * chapter. Adding it to the library copies it from there: no network is involved.
 */
export interface CatalogBundledSource {
  type: "bundled";
  /** One file. Path inside the `bundled` folder, with forward slashes: "radio/uk-amateur-bands.md". */
  file?: string;
  /** A book of chapters. Exactly one of `file` and `book` is given. */
  book?: CatalogBook;
  /** The edition, usually the day it was last checked. A higher one offers an update. */
  version?: string;
  published?: string;
}

export type CatalogSource = CatalogKiwixSource | CatalogHttpSource | CatalogBundledSource;

/** One entry as written in a manifest. */
export interface CatalogManifestEntry {
  id: string;
  name: string;
  description: string;
  category: CatalogCategorySlug;
  publisher: string;
  language: string;
  format: CatalogFormat;
  license: string;
  licenseNote?: string;
  attribution: string;
  homepage?: string;
  /** YYYY-MM-DD: when a maintainer last checked that the entry resolves. */
  lastVerified: string;
  tags?: string[];
  /** Estimate, shown until the live size is known. */
  sizeBytes?: number;
  source: CatalogSource;
}

export interface CatalogManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  maintainers: string[];
  downloadHosts: string[];
  entries: CatalogManifestEntry[];
}

/** Whether the upstream source still offers the entry, as of the last refresh. */
export type CatalogAvailability = "unknown" | "available" | "unavailable";

export type CatalogInstallStatus = "not_installed" | "queued" | "downloading" | "paused" | "failed" | "installed";

/** A manifest entry merged with what the last refresh learned and what is installed. */
export interface CatalogEntryDto extends Omit<CatalogManifestEntry, "sizeBytes" | "source"> {
  manifestId: string;
  /** As in the manifest, except that a book's list of chapters is left out; see `chapterCount`. */
  source: CatalogKiwixSource | CatalogHttpSource | Omit<CatalogBundledSource, "book">;
  /** For a book that ships with Outpost: how many chapters it has. */
  chapterCount?: number;
  /** Exact when resolved, otherwise the manifest's estimate; null when neither is known. */
  sizeBytes: number | null;
  /** True when `sizeBytes` is the manifest's estimate rather than a figure from the source. */
  sizeIsEstimate: boolean;
  version: string | null;
  publishedAt: string | null;
  articleCount: number | null;
  /** When the details above were last confirmed with the source; null if never. */
  resolvedAt: number | null;
  availability: CatalogAvailability;
  /** Why the entry is unavailable, in plain words. */
  unavailableReason: string | null;
  status: CatalogInstallStatus;
  downloadId?: string;
  collectionId?: string;
  /** The document in the library that holds the installed file, for entries that are one document. */
  documentId?: string;
  installedVersion?: string;
  /** The installed version is older than the one the source now offers. */
  updateAvailable: boolean;
}

/** The answer to adding an entry that ships with Outpost. */
export interface CatalogAddResponse {
  collectionId: string;
  /** The document it became in the library; absent for a book, and if it could not be added there. */
  documentId?: string;
  /** For a book: how many chapters were added. */
  chapterCount?: number;
  /** Set when an older edition was in the library: it has been removed, with its file. */
  replacedCollectionId: string | null;
}

export interface CatalogProblem {
  /** Manifest file the problem was found in. */
  file: string;
  entryId?: string;
  message: string;
}

/** A named, curated list of catalogue entries that are usually wanted together. */
export interface CatalogPack {
  id: string;
  name: string;
  description: string;
  /** Entries in the pack, in the order its author gave. Every id is in the catalogue. */
  entryIds: string[];
  /** The countries a pack is for, when it is for some only (ISO codes): offered first where Home is in one of them. */
  countries?: string[];
}

/** What happened when a pack, or part of one, was asked for. */
export interface CatalogPackInstallResponse {
  /** Downloads that were started. */
  queued: DownloadDto[];
  /** Entries that ship with Outpost and were added there and then. */
  added: Array<{ entryId: string; name: string; documentId?: string; collectionId?: string }>;
  /** Entries that were already installed or already on their way. */
  already: number;
  /** Entries that could not be started, each with the reason. The rest went ahead. */
  failed: Array<{ entryId: string; name: string; reason: string }>;
}

export interface CatalogResponse {
  categories: Array<{ slug: CatalogCategorySlug; label: string; count: number }>;
  entries: CatalogEntryDto[];
  packs: CatalogPack[];
  manifests: Array<{ id: string; name: string }>;
  problems: CatalogProblem[];
  lastRefreshedAt: number | null;
}

export interface CatalogRefreshSummary {
  /** Entries the sources gave an answer for. */
  checked: number;
  available: number;
  unavailable: Array<{ entryId: string; reason: string }>;
  /** Entries whose source could not be asked this time; their last known details are kept. */
  unchecked: Array<{ entryId: string; reason: string }>;
  refreshedAt: number;
}

export interface CatalogDownloadRequest {
  /** Storage location to install to. Defaults to the default location. */
  locationId?: string;
}

export interface CatalogDownloadResponse {
  download: DownloadDto;
  /**
   * Set when this download updates something already installed: that collection and
   * its file are removed once the new version has been installed and verified.
   */
  replacesCollectionId: string | null;
}
