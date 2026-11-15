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
  results: Array<{ title: string; path: string; snippet: string; url: string }>;
}
