/**
 * Audiobooks: recordings kept in the library and played in the browser.
 *
 * An audiobook of several files is a book (a collection whose chapters are documents,
 * see `collections.ts`) with `meta.audiobook` describing it; one audio file on its own
 * is an ordinary document of type "audio". Both are listed and played the same way.
 */
import type { JobDto } from "./common.ts";

/** The extensions the library takes as audio. Whether a browser can play one is for the browser to say. */
export const AUDIO_EXTENSIONS = ["mp3", "m4a", "m4b", "aac", "ogg", "oga", "opus", "flac", "wav"] as const;

/** One file of an audiobook, in the order it is played. */
export interface AudiobookChapterDto {
  documentId: string;
  title: string;
  /** The file, with byte ranges, for the player. */
  fileUrl: string;
  mime: string;
  ext: string;
  sizeBytes: number;
  /** Running time read from the file, when it could be read. */
  seconds: number | null;
}

export interface AudiobookDto {
  /** The collection for a book of several files; the document for one file on its own. */
  id: string;
  kind: "book" | "single";
  collectionId: string | null;
  title: string;
  author: string | null;
  /** Who reads it, as the files' own tags or LibriVox's catalogue name them. Empty when neither does. */
  readers: string[];
  licence: string | null;
  /** What the licence means where the person is, in the publisher's words. */
  licenceNote: string | null;
  /** The publisher's page for the recording, when it is known. */
  sourceUrl: string | null;
  /** The LibriVox project, when the book was matched to one. */
  librivoxId: string | null;
  /** Sum of the chapters' running times; null when any of them is not known. */
  totalSeconds: number | null;
  sizeBytes: number;
  chapters: AudiobookChapterDto[];
  locationAvailable: boolean;
  addedAt: number;
}

/** One line of the list of audiobooks. */
export interface AudiobookSummaryDto {
  id: string;
  kind: "book" | "single";
  title: string;
  author: string | null;
  readers: string[];
  chapterCount: number;
  totalSeconds: number | null;
  sizeBytes: number;
  addedAt: number;
  /** Where the list leads: the book's page or the document's. */
  url: string;
}

export interface AudiobookListResponse {
  audiobooks: AudiobookSummaryDto[];
}

export interface AudiobookResponse {
  audiobook: AudiobookDto;
}

/** Adding is a background job: unpacking, checking and recording the files. */
export interface AudiobookAddResponse {
  job: JobDto;
}

/** What the add job leaves as its result. */
export interface AudiobookAddResult {
  collectionId?: string;
  documentId?: string;
  title?: string;
  chapters?: number;
  /** Files in a zip that were not taken, and why. */
  leftOut?: Array<{ path: string; reason: string }>;
}

// ── The LibriVox shelf: books offered in Explore as a link to download in the browser ──

export type LibrivoxShelf = "practical" | "adults" | "children";

export const LIBRIVOX_SHELVES: Array<{ id: LibrivoxShelf; label: string }> = [
  { id: "practical", label: "Practical and self-reliance" },
  { id: "adults", label: "Classics for adults" },
  { id: "children", label: "For children" },
];

export interface LibrivoxBookDto {
  /** LibriVox's project number. */
  id: string;
  shelf: LibrivoxShelf;
  title: string;
  authors: string[];
  readers: string[];
  language: string;
  totalSeconds: number;
  sections: number;
  /** The year of the text recorded, as LibriVox gives it. */
  textYear: string | null;
  summary: string;
  /** The book's page on librivox.org. */
  pageUrl: string;
  /** The zip of every chapter, as LibriVox links it. Opened in the browser, never fetched by Outpost. */
  zipUrl: string;
  /** The name the zip downloads under, used to recognise it when it is added. */
  zipName: string;
  /** About this many bytes: the running time at the 64 kbps the zip holds. */
  approxBytes: number;
  /** Set when this book is already in the library. */
  inLibrary: { id: string; url: string } | null;
}

export interface LibrivoxShelfResponse {
  books: LibrivoxBookDto[];
  /** The day the terms and the records were read. */
  checked: string;
  licence: string;
  licenceNote: string;
}
