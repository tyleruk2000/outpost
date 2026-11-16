/** A reference collection (ZIM archive) that can be read in the app. */
export interface ReferenceBook {
  collectionId: string;
  bookName: string;
  title: string;
  description: string | null;
  language: string | null;
  articleCount: number | null;
  sizeBytes: number;
  /** Address of the book's pages, ending in "/". Append an article path. */
  contentBase: string;
  iconUrl: string | null;
  /** False while it cannot be served: drive disconnected, reader not running, still loading. */
  ready: boolean;
}

export interface ReferenceBooksResponse {
  books: ReferenceBook[];
}

export interface ReferenceBookResponse {
  book: ReferenceBook;
  /** Why the book cannot be read right now, in plain words; null when it can. */
  reason: string | null;
}

export interface ReferenceStatus {
  mode: "external" | "managed" | "none";
  available: boolean;
  problem: string | null;
  books: number;
}

export interface ReferenceSuggestion {
  title: string;
  path: string;
  /** In-app route that opens the article. */
  url: string;
}

export interface ReferenceSearchResponse {
  total: number;
  results: Array<{ title: string; path: string; snippet: string; segments: Array<{ text: string; hit: boolean }>; url: string }>;
}

/**
 * How a file inside an archive can be shown: a PDF or e-book in the document viewer, sound
 * and pictures that move in a player, anything else only handed to the browser.
 */
export type ArchiveFileKind = "pdf" | "epub" | "audio" | "video" | "other";

// The extensions openZIM's nautilus treats as sound and as video.
const AUDIO_FILE = /\.(ogg|mp3|aif|mpa|wav|wma)$/i;
const VIDEO_FILE = /\.(webm|ogv|mp4|mpg|mpeg|avi|mkv|mov|wmv|m4v|h264|3gp)$/i;

export function archiveFileKind(path: string): ArchiveFileKind {
  if (/\.pdf$/i.test(path)) return "pdf";
  if (/\.epub$/i.test(path)) return "epub";
  if (AUDIO_FILE.test(path)) return "audio";
  if (VIDEO_FILE.test(path)) return "video";
  return "other";
}

/** One file of a document an archive lists. */
export interface ArchiveDocumentFile {
  /** The file's name as the archive's list gives it. */
  name: string;
  /** Path inside the book, e.g. "files/Water treatment.pdf". */
  path: string;
  kind: ArchiveFileKind;
  /** The document it has become in the library, when it has been added. */
  documentId: string | null;
}

/** A document listed by an archive that is a collection of files and not of pages. */
export interface ArchiveDocument {
  id: string;
  title: string;
  description: string;
  author: string;
  files: ArchiveDocumentFile[];
}

export interface ArchiveDocumentList {
  /** Path of the archive's own page that would have drawn this list, e.g. "home". */
  home: string;
  /** How many documents the archive lists. */
  total: number;
  /** How many of them match the words asked for; equal to `total` when none were. */
  matched: number;
  offset: number;
  documents: ArchiveDocument[];
  /** Entries of the archive's list that name no file Outpost can address, and are left out. */
  skipped: number;
  /** True when the archive lists more documents than Outpost reads. */
  truncated: boolean;
}

export interface ArchiveDocumentsResponse {
  /** Null when the archive is an ordinary one, made of pages. */
  list: ArchiveDocumentList | null;
  /** Why an archive that keeps such a list could not have it read, in plain words. */
  problem: string | null;
}
