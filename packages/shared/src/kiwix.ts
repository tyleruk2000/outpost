import type { JobDto } from "./common.ts";

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

/** A file's place in the adding that is under way: being copied now, or waiting for the ones before it. */
export type ArchiveFileTurn = "now" | "waiting";

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
  /** Being copied into the library now, or waiting its turn in an "add all" that is under way. */
  adding: ArchiveFileTurn | null;
  /** Why the last "add all" could not add it, when it could not and it has not been added since. */
  problem: string | null;
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

/** The job type of an "add all": files of one archive copied into the document library, one after another. */
export const ARCHIVE_ADD_JOB = "kiwix.add-files";

/**
 * What an "add all" is asked to add: every document of the archive's own list (those
 * matching `q`, when words are given), or files named one by one, as a page that links
 * to them does.
 */
export type ArchiveAddScope = { kind: "list"; q?: string } | { kind: "files"; files: Array<{ path: string; title?: string }> };

/** What an "add all" would do, worked out before it starts. Nothing is changed by asking. */
export interface ArchiveAddPlan {
  /** Files that would be copied: those of a kind the library keeps that are not in it yet. */
  count: number;
  /** Files asked for that are in the library already. */
  already: number;
  /** What the files to copy come to, counting those whose size is known. */
  bytes: number;
  /** Files to copy whose size the archive did not give in time. */
  unsized: number;
  /** Where the copies go: the default storage location. Null when there is none to write to. */
  location: { id: string; name: string; freeBytes: number | null } | null;
  /** Free space Outpost leaves untouched on every location. */
  reserveBytes: number;
  /** Why it cannot start now, in plain words; null when it can. */
  refusal: string | null;
  /** Whether scanned pages are read by OCR without being asked (Settings, Documents). */
  ocrAuto: boolean;
}

/** How an "add all" turned out. Kept as the job's result, also when it was stopped part of the way. */
export interface ArchiveAddResult {
  scope: "list" | "files";
  /** The words the list was narrowed by; empty for the whole list. */
  q: string;
  /** Files it set out to copy: those not in the library when it began. */
  wanted: number;
  added: number;
  addedBytes: number;
  /** Files that turned out to be in the library already: added meanwhile, or the same file kept from elsewhere. */
  already: number;
  /** The first of those that could not be added, each with the reason. */
  failed: Array<{ path: string; title: string; reason: string }>;
  /** How many more failed than are named. */
  failedMore: number;
  /** Files it had not come to when it stopped. */
  notReached: number;
  /** Why it stopped before the end: cancelled by a person, no room left, the storage location went away, or the archive did. */
  stopped: "cancelled" | "space" | "storage" | "unreadable" | null;
  /** The reason in words, when it stopped for anything but being cancelled. */
  stoppedReason: string | null;
  locationName: string;
}

export interface ArchiveAddStatus {
  /** The "add all" for this archive that is waiting or running; failing that, the last one that ended. */
  job: JobDto | null;
}

export interface StartArchiveAddResponse {
  job: JobDto;
  /** True when one was already under way for this archive, and that one is given back instead. */
  already: boolean;
}

export interface ArchiveFileSizes {
  /** Sizes in bytes, in the order asked; null where the archive did not say. */
  files: Array<{ path: string; sizeBytes: number | null }>;
}
