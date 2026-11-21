/**
 * Highlights: a passage marked in a library document (a PDF, an EPUB or a Markdown
 * document), with an optional line about it. Kept in Outpost's database only; the
 * document's file is never written to.
 *
 * A passage is found again by its words and a few words either side (`exact`,
 * `prefix`, `suffix`), within a page of a PDF or a chapter of an EPUB.
 */

export interface HighlightDto {
  id: string;
  documentId: string;
  /** Page of a PDF, 1-based; null for other documents. */
  page: number | null;
  /** Chapter of an EPUB, 1-based as in its address; null for other documents. */
  chapter: number | null;
  exact: string;
  prefix: string;
  suffix: string;
  /** The line written about it; empty when none was. */
  note: string;
  /** In-app address that opens the document at the passage and marks it. */
  url: string;
  createdAt: number;
  updatedAt: number;
}

/** A highlight with the title of its document, for the list across every document. */
export interface HighlightListItem extends HighlightDto {
  documentTitle: string;
}

export interface HighlightsResponse {
  highlights: HighlightDto[];
}

export interface HighlightSearchResponse {
  highlights: HighlightListItem[];
}

export interface CreateHighlightBody {
  page?: number | null;
  chapter?: number | null;
  exact: string;
  prefix?: string;
  suffix?: string;
  note?: string;
}

export interface UpdateHighlightBody {
  note: string;
  /** The highlight's `updatedAt` as it was read. A newer stored highlight refuses it with 409. */
  baseUpdatedAt?: number;
}

/** `POST /api/documents/:id/highlights/to-notes`: every highlight of the document, or these. */
export interface HighlightsToNotesBody {
  highlightIds?: string[];
}

export interface HighlightsToNotesResponse {
  note: { id: string; title: string };
}

/** The most words a highlight may mark, and the longest margin note. */
export const MAX_HIGHLIGHT_CHARS = 4000;
export const MAX_HIGHLIGHT_NOTE_CHARS = 2000;
/** How many characters either side are kept to find the passage again. */
export const HIGHLIGHT_CONTEXT_CHARS = 48;

/** The address of a highlight: the document at its page or chapter, with the passage marked. */
export function highlightUrl(highlight: Pick<HighlightDto, "id" | "documentId" | "page" | "chapter">): string {
  const params: string[] = [];
  if (highlight.chapter !== null) params.push(`chapter=${highlight.chapter}`);
  if (highlight.page !== null && highlight.page > 1) params.push(`page=${highlight.page}`);
  params.push(`highlight=${encodeURIComponent(highlight.id)}`);
  return `/library/documents/${encodeURIComponent(highlight.documentId)}?${params.join("&")}`;
}
