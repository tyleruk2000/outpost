/** Bringing in a Calibre library: what it holds, the person's choice, and what became of it. */

export type CalibreImportState = "reading" | "ready" | "importing" | "completed" | "failed" | "discarded";

/** One book as the library describes it, with the one file of it that will be brought in. */
export interface CalibreBook {
  /** The book's folder, inside the library's folder. */
  folder: string;
  title: string;
  authors: string[];
  series: string | null;
  seriesIndex: number | null;
  tags: string[];
  /** The file that will be added: the EPUB where there is one, then the PDF, then plain text. */
  file: { name: string; ext: string; sizeBytes: number };
  /** The cover picture beside it, when there is one. */
  cover: { name: string; sizeBytes: number } | null;
  /** Other formats of the same book that stay only in Calibre: "MOBI", "AZW3". */
  otherFormats: string[];
}

/** A book folder that will not be brought in, and why, in words. */
export interface CalibreLeftOut {
  folder: string;
  title: string | null;
  reason: string;
}

export interface CalibrePlan {
  bookCount: number;
  /** The files that would be added, covers included. */
  totalBytes: number;
  coverCount: number;
  /** True when the folder has Calibre's own database (metadata.db) at its top. */
  hasCalibreDatabase: boolean;
  /** The first books, in the library's order; the rest are counted, not listed. */
  books: CalibreBook[];
  leftOut: CalibreLeftOut[];
  /** Books found beyond what one import takes (`CALIBRE_MAX_BOOKS`). */
  beyondLimit: number;
}

/** Most books one import brings in. A larger library is brought in a folder of authors at a time. */
export const CALIBRE_MAX_BOOKS = 20_000;
/** Books of the plan sent to the browser to be listed; the rest are counted. */
export const CALIBRE_LISTED_BOOKS = 300;

export interface CalibreOptions {
  /**
   * "copy": each book's file is copied into the library on `locationId`.
   * "in-place": each book is recorded where it is, inside the Calibre folder, and read from there.
   */
  mode: "copy" | "in-place";
  /** Where copies are kept. The default location when left out. Ignored in place. */
  locationId?: string;
}

export interface CalibreReport {
  added: number;
  /** Books whose file was already in the library, found by its contents. Nothing about them was changed. */
  alreadyThere: number;
  failed: Array<{ title: string; reason: string }>;
  /** True when the import was stopped before the last book. */
  stopped: boolean;
}

export interface CalibreJobInfo {
  id: string;
  state: "queued" | "running" | "paused" | "succeeded" | "failed" | "cancelled";
  progress: { current: number; total: number | null; message: string | null };
}

export interface CalibreImportDto {
  id: string;
  state: CalibreImportState;
  locationId: string;
  /** The location's name, or null when it has been forgotten since. */
  locationName: string | null;
  relPath: string;
  plan: CalibrePlan | null;
  options: CalibreOptions | null;
  report: CalibreReport | null;
  error: string | null;
  job: CalibreJobInfo | null;
  createdAt: number;
  completedAt: number | null;
}

export interface CalibreImportResponse {
  import: CalibreImportDto;
}

export interface CalibreImportListResponse {
  imports: CalibreImportDto[];
}

/** What a document brought in from Calibre carries beyond the usual details. */
export interface BookDetailsDto {
  documentId: string;
  authors: string[];
  series: string | null;
  seriesIndex: number | null;
  /** Address of the kept cover picture, or null. */
  coverUrl: string | null;
  /** True when the file is read where it lies in the Calibre folder: deleting the document then leaves the file. */
  inCalibreFolder: boolean;
}

export interface BookDetailsResponse {
  details: BookDetailsDto | null;
}
