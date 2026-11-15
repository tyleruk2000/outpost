/**
 * Importing existing knowledge: Markdown, HTML and text files, ZIP archives of them
 * (including Notion's "Markdown & CSV" export) and PDFs.
 *
 * An import goes through fixed steps. Files are uploaded, then analysed into a plan
 * (`ImportAnalysis`) that says exactly what would be created; nothing is written to
 * the notes or the library until the person has seen that plan and commits it with
 * their choices (`ImportOptions`). What actually happened is kept as an `ImportReport`.
 */

export const IMPORT_STATES = ["uploaded", "analysing", "ready", "importing", "completed", "failed", "discarded"] as const;
export type ImportState = (typeof IMPORT_STATES)[number];

/** File name endings an import accepts, lower case. */
export const IMPORT_EXTENSIONS = [".md", ".markdown", ".txt", ".html", ".htm", ".pdf", ".csv", ".zip"] as const;

/** Where the pages came from, as far as the files show. */
export type ImportSource = "notion" | "markdown" | "html" | "text" | "mixed";
/** `ImportSource`, or "pdf" for an upload that holds nothing but PDFs. */
export type ImportKind = ImportSource | "pdf";

export type ImportItemKind = "page" | "database" | "attachment" | "document" | "skipped";

/** What a page is made from. "folder" is a folder with no file of its own: an empty parent page. */
export type ImportItemFormat = "markdown" | "html" | "text" | "csv" | "folder";

export interface ImportDuplicate {
  noteId: string;
  title: string;
  /**
   * "imported-before": a page made by an earlier import of the same source.
   * "same-content": a page with the same title and text that did not come from this
   * source, most likely written by hand. These are never overwritten.
   */
  reason: "imported-before" | "same-content";
}

export interface ImportItem {
  /** Path inside the upload, with `/` separators. A folder page ends in `/`. */
  path: string;
  kind: ImportItemKind;
  title: string;
  /** `path` of the page this sits under, or null at the top of the import. */
  parentPath: string | null;
  sizeBytes: number;
  /** Identifies the source of this item across imports, so importing it again can be recognised. */
  importKey: string;
  duplicateOf?: ImportDuplicate;
  /** Things that will not come across exactly, in words for the person importing. */
  warnings: string[];
  /** Why a "skipped" item is left out. */
  reason?: string;
  /** Pages and databases only. */
  format?: ImportItemFormat;
  /** The file the content is read from when it is not `path` itself (the fuller twin of a Notion database CSV). */
  source?: string;
  /** Link and image addresses found in the page that point into the import: address as written → `path` of the item. */
  links?: Record<string, string>;
}

export type ImportConstructKind =
  /** `$$…$$` and `$…$` maths; kept as its LaTeX text. */
  | "equation"
  /** A database shown inside a Notion page; becomes a link to the database's own page. */
  | "embedded-database"
  /** `<iframe>`, `<video>`, `<audio>`, `<embed>`, `<object>`; left out. */
  | "embedded-media"
  /** HTML that the page model cannot hold; the tags are removed and the words kept. */
  | "html"
  /** `<!-- … -->`; left out. */
  | "html-comment"
  /** Notion columns in an HTML export; their content follows one after another. */
  | "columns"
  /** Footnotes; kept as ordinary paragraphs. */
  | "footnote"
  /** `[[Page]]` links, which are not standard Markdown; kept as text. */
  | "wiki-link"
  /** A picture at a web address; kept as a link because an import never downloads anything. */
  | "external-image"
  /** A link or picture pointing at a file that is not in the import; kept as text. */
  | "missing-link"
  /** A link or picture with an address that is not allowed (for example `javascript:`). */
  | "unsafe-address"
  /** A table too long or too wide to keep whole. */
  | "table-truncated"
  /** A file of a kind Outpost does not import. */
  | "skipped-file"
  /** Something else the converter simplified. */
  | "other"
  /** Converted, not lost: `<aside>` became a callout. */
  | "callout"
  /** Converted, not lost: `<details>` became a toggle. */
  | "toggle";

export interface ImportConstructCount {
  kind: ImportConstructKind;
  /** How many were found; for "html", "footnote" and "other", how many pages have them. */
  count: number;
  /** Path of one file where it was found. */
  example: string;
}

export interface ImportTotals {
  pages: number;
  databases: number;
  attachments: number;
  documents: number;
  skipped: number;
  /** Hidden and system files (`.DS_Store`, `__MACOSX`, dot-folders) that were passed over without being listed. */
  ignored: number;
  /** Size of everything that would be imported. */
  bytes: number;
  /** Pages and databases that already exist, by how they were recognised. */
  importedBefore: number;
  sameContent: number;
}

export interface ImportAnalysis {
  source: ImportSource;
  /** Every file considered, parents before their children, siblings in natural order. */
  items: ImportItem[];
  totals: ImportTotals;
  /** What will not come across intact. */
  unsupported: ImportConstructCount[];
  /** What was recognised and converted to Outpost's own blocks. */
  converted: ImportConstructCount[];
  /** Reasons the import cannot go ahead at all. Empty when it can. */
  problems: string[];
  /** Number of warnings across all items. */
  warnings: number;
}

export type ImportDuplicatePolicy = "skip" | "copy" | "replace";

export interface ImportOptions {
  /** The page to put the imported pages under; null or absent for the top level. */
  parentId?: string | null;
  /** What to do with pages that already exist. "replace" overwrites pages from an earlier import. */
  duplicates: ImportDuplicatePolicy;
  /** Whether PDFs are added to the document library or left out. */
  pdfs: "library" | "skip";
  /** Must be true for `duplicates: "replace"`: the person has confirmed that existing pages will be overwritten. */
  replaceConfirmed?: boolean;
}

export interface ImportedPage {
  noteId: string;
  title: string;
  path: string;
}

export interface ImportCreatedPage extends ImportedPage {
  /** Directly under the place the import was put. */
  topLevel: boolean;
}

export interface ImportSkippedItem {
  path: string;
  title: string;
  reason: string;
  /** The existing page that was kept. */
  noteId?: string;
}

export interface ImportFailedItem {
  path: string;
  title: string;
  /** What went wrong, in words the person can act on. */
  reason: string;
}

export interface ImportedDocument {
  documentId: string;
  title: string;
  /** The library already held this exact file. */
  alreadyInLibrary: boolean;
}

export interface ImportReport {
  created: ImportCreatedPage[];
  updated: ImportedPage[];
  skipped: ImportSkippedItem[];
  failed: ImportFailedItem[];
  /** Pictures and files attached to pages. */
  attachments: number;
  documents: ImportedDocument[];
  unsupported: ImportConstructCount[];
  warnings: number;
  durationMs: number;
  /** The import was stopped before every item had its turn. */
  stopped: boolean;
}

/** The background job working on an import right now. */
export interface ImportJobInfo {
  id: string;
  state: "queued" | "running" | "paused" | "succeeded" | "failed" | "cancelled";
  progress: { current: number; total: number | null; message: string | null };
}

export interface ImportSummary {
  id: string;
  kind: ImportKind;
  state: ImportState;
  /** The uploaded file's name, or "first.md and 2 more". */
  originalName: string;
  sizeBytes: number;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
  /** Counts from the report, once there is one. */
  counts: { created: number; updated: number; skipped: number; failed: number; documents: number } | null;
}

export interface ImportDto extends Omit<ImportSummary, "counts"> {
  analysis: ImportAnalysis | null;
  options: ImportOptions | null;
  report: ImportReport | null;
  job: ImportJobInfo | null;
  /** A failed or stopped import whose files are still held, so committing again continues it. */
  canRetry: boolean;
}

export interface ImportResponse {
  import: ImportDto;
}

export interface ImportListResponse {
  imports: ImportSummary[];
}
