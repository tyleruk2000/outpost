/**
 * The document library: files a person has added (PDFs, EPUBs, Markdown, text, HTML
 * and images), their metadata, and the text Outpost read from them for search.
 */

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
 * A run of text inside a Markdown block (a chapter of an EPUB book is sent as the same
 * blocks and runs). This is what the server keeps of a file's formatting: enough to
 * read it as written, and nothing that could act in a browser. A link is present only when its address is a web or mail address; a "jump"
 * goes to a heading of the same document; a "ref" goes to something inside Outpost.
 * Nothing here carries an address a file chose, other than those web and mail links.
 */
export type MarkdownInline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "break" }
  | { t: "strong" | "em" | "del" | "sup" | "sub"; c: MarkdownInline[] }
  | { t: "link"; href: string; c: MarkdownInline[] }
  /** A picture, which is not shown: only the description and caption its author gave it. */
  | { t: "image"; alt: string; caption?: string }
  /** `to` is the id of a heading, or of an anchor, in this document. */
  | { t: "jump"; to: string; c: MarkdownInline[] }
  | MarkdownRef
  | EpubInline;

/**
 * What a chapter of an EPUB book adds to the runs above. A Markdown file never produces
 * these. None of them carries an address: a picture is named by its path inside the
 * book's own archive, which the server found there, and a link to another chapter by
 * that chapter's place in the reading order.
 */
export type EpubInline =
  /** A place a link can land on: an element of the chapter that had an id. It shows nothing. */
  | { t: "anchor"; id: string }
  /** A picture from inside the book. `src` is its path in the archive. */
  | { t: "picture"; src: string; alt: string }
  /** A link to another chapter of the same book, counted from 1; 0 is the book's contents. */
  | { t: "chapter"; chapter: number; anchor?: string; c: MarkdownInline[] };

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
  /** `kind` is set for a footnote or an aside in a book, which is set apart but is not a quotation. */
  | { t: "quote"; kind?: "note"; c: MarkdownBlock[] }
  /** `lang` is the word after the opening fence, lower case: "mermaid", "viz", "json". */
  | { t: "code"; lang?: string; v: string }
  /** The first row is the header, unless `plain` says the table has none. Every row has the same number of cells. */
  | { t: "table"; plain?: true; rows: MarkdownInline[][][] }
  | { t: "rule" }
  /** A picture from inside an EPUB book, standing on its own. `src` is its path in the archive. */
  | { t: "figure"; src: string; alt: string; caption?: MarkdownInline[] };

export interface DocumentMarkdownResponse {
  documentId: string;
  blocks: MarkdownBlock[];
}

/** One document of an EPUB's reading order: usually a chapter, sometimes a cover or a title page. */
export interface EpubChapterDto {
  /** Counted from 1, in reading order. */
  position: number;
  /** From the book's table of contents; otherwise its first heading, or "Section 3". */
  title: string;
  /** The heading search results know this chapter by, when its text has been read. */
  heading: string | null;
}

/** A line of an EPUB's table of contents. */
export interface EpubContentsEntry {
  title: string;
  /** The chapter it opens, counted from 1. Null for a line that only names a part of the book. */
  chapter: number | null;
  /** A place inside that chapter (see `EpubInline` anchors). */
  anchor?: string;
  /** 0 for a top-level line, 1 for one beneath it, and so on. */
  depth: number;
}

/** `GET /api/documents/:id/epub`: what an EPUB book says about itself, and what is in it. */
export interface DocumentEpubResponse {
  documentId: string;
  /** From the book's own package file, not from the library record. */
  title: string | null;
  author: string | null;
  language: string | null;
  /** Path of the cover picture inside the archive, when the book names one. */
  cover: string | null;
  chapters: EpubChapterDto[];
  /** The table of contents as the book gives it. Empty when it has none; the chapters are then the contents. */
  contents: EpubContentsEntry[];
  /** Sentences for people: what Outpost does not do for this book. */
  notes: string[];
}

/** `GET /api/documents/:id/epub/chapters/:position`: one chapter, as plain values the web app draws. */
export interface DocumentEpubChapterResponse {
  documentId: string;
  position: number;
  total: number;
  title: string;
  blocks: MarkdownBlock[];
  /** Sentences for people: what was left out of this chapter. */
  notes: string[];
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
