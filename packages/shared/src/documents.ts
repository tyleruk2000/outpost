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
  /** Address of the original file. Add `?download=1` to save it instead of viewing. */
  fileUrl: string;
  createdAt: number;
  updatedAt: number;
}

export type DocumentSort = "added" | "title" | "size";

export interface DocumentListResponse {
  documents: DocumentDto[];
  /** Number of documents matching the filters, ignoring `limit` and `offset`. */
  total: number;
}

export interface DocumentResponse {
  document: DocumentDto;
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
}

export interface DocumentTextResponse {
  documentId: string;
  extraction: DocumentExtractionState;
  extractionDetail: string | null;
  pageCount: number | null;
  /** All sections, or only those of the requested page. */
  sections: DocumentSection[];
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
