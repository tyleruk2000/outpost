/**
 * The document library: files a person has added (PDFs, EPUBs, Markdown, text, HTML
 * and images), their metadata, and the text Outpost read from them for search.
 */

import type { SavedFrom } from "./webpages.ts";

/** Broad family a file belongs to. Decides how it is viewed and how its text is read. */
export type DocumentType = "pdf" | "markdown" | "text" | "html" | "epub" | "image";

/**
 * Where reading a document's text has got to. "unsupported" means the file is stored
 * and can be opened but has no text to search (an image, a scanned PDF);
 * `extractionDetail` says why.
 */
export type DocumentExtractionState = "pending" | "running" | "done" | "failed" | "unsupported";

/** The book a document is a chapter of. */
export interface DocumentBookDto {
  /** The book's collection: its page is the book's contents. */
  collectionId: string;
  title: string;
  /** The chapter's number as printed in the contents, when it has one. */
  number: string | null;
}

export interface DocumentDto {
  /** Identifies the document forever, wherever its file is moved. */
  id: string;
  title: string;
  /** File name as it was when added. */
  originalName: string;
  type: DocumentType;
  /** Derived from the validated file type, never from what the uploader claimed. */
  mime: string;
  /** Lower-case extension without the dot. */
  ext: string;
  sizeBytes: number;
  sha256: string;
  locationId: string;
  /** False while the drive or share holding the file is disconnected. */
  locationAvailable: boolean;
  /** Path of the original inside its storage location. */
  relPath: string;
  category: string | null;
  description: string | null;
  author: string | null;
  source: string | null;
  language: string | null;
  tags: string[];
  /** Pages in a PDF; null for everything else and until the text has been read. */
  pageCount: number | null;
  extraction: DocumentExtractionState;
  /** A sentence for people: why extraction failed, was skipped, or was cut short. */
  extractionDetail: string | null;
  /** Characters of searchable text. */
  textChars: number;
  /**
   * Pages with no text of their own that OCR could try: scanned pages of a PDF, or 1
   * for an image. 0 when there are none, or for a type OCR does not read.
   */
  scanPages: number;
  /** Pages OCR has been run on. Null until it has been run on this document at all. */
  ocrPages: number | null;
  /** A sentence for people about the last OCR run: what it could not read, or why it stopped. */
  ocrDetail: string | null;
  /** Address of the original file. Add `?download=1` to save it instead of viewing. */
  fileUrl: string;
  /** Set when the document is a chapter of a book from the catalogue. */
  book?: DocumentBookDto | null;
  createdAt: number;
  updatedAt: number;
}

export type DocumentSort = "added" | "title" | "size";

export interface DocumentListResponse {
  documents: DocumentDto[];
  /** Number of documents matching the filters, ignoring `limit` and `offset`. */
  total: number;
}

/** A neighbouring chapter, enough to link to it. */
export interface ChapterLinkDto {
  documentId: string;
  title: string;
  number: string | null;
}

/** Where a chapter comes in its book, and what is on either side of it. */
export interface DocumentChapterDto {
  collectionId: string;
  bookTitle: string;
  key: string;
  number: string | null;
  /** The named part of the book it belongs to; empty when the book has no parts. */
  section: string;
  /** Counted from 1, in reading order. */
  position: number;
  total: number;
  previous: ChapterLinkDto | null;
  next: ChapterLinkDto | null;
}

export interface DocumentResponse {
  document: DocumentDto;
  /** Present when the document is a chapter of a book. */
  chapter?: DocumentChapterDto;
}

/** Fields `PATCH /api/documents/:id` accepts. Omitted fields are left alone. */
export interface DocumentPatch {
  title?: string;
  description?: string | null;
  category?: string | null;
  author?: string | null;
  source?: string | null;
  language?: string | null;
  /** Replaces the whole tag list. Tags that do not exist yet are created. */
  tags?: string[];
}

export interface DocumentFacets {
  categories: Array<{ name: string; count: number }>;
  tags: Array<{ name: string; count: number }>;
  types: Array<{ type: DocumentType; count: number }>;
  total: number;
  totalBytes: number;
}

/** Outcome for one file of an upload. One bad file does not fail the others. */
export interface UploadResult {
  originalName: string;
  status: "created" | "duplicate" | "rejected";
  /** The new document, or for "duplicate" the one already in the library. */
  document?: DocumentDto;
  /** For "rejected": what was wrong and what to do, in plain words. */
  reason?: string;
  /** For "rejected": the error code ("unsupported", "too_large", "insufficient_space", …). */
  code?: string;
}

export interface UploadResponse {
  results: UploadResult[];
}

/** A natural unit of a document's text: a PDF page, the text under a heading, a chapter. */
export interface DocumentSection {
  /** 1-based page number, for PDFs. */
  page: number | null;
  heading: string | null;
  text: string;
  /** True when the text was read from a picture by OCR, and so may contain mistakes. */
  ocr: boolean;
}

export interface DocumentTextResponse {
  documentId: string;
  extraction: DocumentExtractionState;
  extractionDetail: string | null;
  pageCount: number | null;
  /** All sections, or only those of the requested page. */
  sections: DocumentSection[];
}

/** `POST /api/documents/:id/ocr`: the document, and the background job reading its scanned pages. */
export interface DocumentOcrResponse {
  document: DocumentDto;
  jobId: string;
}

/** A language OCR has the data for on this installation. */
export interface OcrLanguage {
  /** The engine's code for it, such as "eng". */
  code: string;
  /** "English" */
  name: string;
  /** True for the language that ships with Outpost; false for one added to the data directory. */
  builtIn: boolean;
  /** Whether OCR is set to read it (the `ocr.languages` setting). */
  selected: boolean;
}

/** `GET /api/ocr`: whether this installation can read text from scans, and with what. */
export interface OcrStatus {
  available: boolean;
  /** Why not, in plain words. Null when `available`. */
  reason: string | null;
  /** Name of the OCR engine. */
  engine: string;
  languages: OcrLanguage[];
  /** Languages named in the `ocr.languages` setting whose data is not installed. */
  missingLanguages: string[];
  /** Folder inside the data directory where more language files can be put. */
  languageFolder: string;
  /** Whether new documents without text are read by OCR automatically (the `ocr.auto` setting). */
  auto: boolean;
  limits: {
    /** Most scanned pages of one PDF read in one go. */
    pagesPerRun: number;
    /** Largest picture read, in pixels. */
    maxPixels: number;
  };
}

/**
 * A link to something inside Outpost: a catalogue entry, or a chapter of the book that
 * entry adds. A Markdown file writes it as `outpost:entry/<entry id>/<chapter key>`; the
 * server looks the entry up and sends only what it found, so the web app never builds an
 * address out of anything a file wrote.
 */
export interface MarkdownRef {
  t: "ref";
  /** A catalogue entry that exists on this server. */
  entryId: string;
  entryName: string;
  /** The entry is in the library as this collection. */
  collectionId?: string;
  /** The chapter is in the library as this document. */
  documentId?: string;
  /** A heading in the target chapter (see `MarkdownBlock` heading ids). */
  anchor?: string;
  c: MarkdownInline[];
}

/**
 * A run of text inside a Markdown block. This is what the server keeps of a Markdown
 * file's formatting: enough to read it as written, and nothing that could act in a
 * browser. A link is present only when its address is a web or mail address; a "jump"
 * goes to a heading of the same document; a "ref" goes to something inside Outpost.
 * Nothing here carries an address a file chose, other than those web and mail links.
 */
export type MarkdownInline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "break" }
  | { t: "strong" | "em" | "del"; c: MarkdownInline[] }
  | { t: "link"; href: string; c: MarkdownInline[] }
  /**
   * A picture. Only the description and caption its author gave it are shown, unless
   * the file carries the picture itself (a saved web page does): then `picture` is its
   * number, and the bytes are at `/api/documents/<id>/pictures/<number>`.
   */
  | { t: "image"; alt: string; caption?: string; picture?: number }
  /** `to` is the id of a heading in this document. */
  | { t: "jump"; to: string; c: MarkdownInline[] }
  | MarkdownRef;

export interface MarkdownListItem {
  /** Set for a task-list item: whether its box is ticked. */
  checked?: boolean;
  c: MarkdownBlock[];
}

export type MarkdownBlock =
  /**
   * `depth` is 1 to 6, as written in the file. `id` is made from the heading's words
   * (lower case, hyphens for spaces), the way links to a heading are usually written;
   * it is unique within the document.
   */
  | { t: "heading"; depth: number; id?: string; c: MarkdownInline[] }
  | { t: "paragraph"; c: MarkdownInline[] }
  | { t: "list"; ordered: boolean; start?: number; items: MarkdownListItem[] }
  | { t: "quote"; c: MarkdownBlock[] }
  /** `lang` is the word after the opening fence, lower case: "mermaid", "viz", "json". */
  | { t: "code"; lang?: string; v: string }
  /** The first row is the header. Every row has the same number of cells. */
  | { t: "table"; rows: MarkdownInline[][][] }
  | { t: "rule" };

export interface DocumentMarkdownResponse {
  documentId: string;
  blocks: MarkdownBlock[];
  /** Present when the file is a web page Outpost saved: where from, and when. */
  savedFrom?: SavedFrom;
}

export interface TagDto {
  id: string;
  name: string;
  /** Documents carrying this tag. */
  documentCount: number;
}

export interface TagListResponse {
  tags: TagDto[];
}
