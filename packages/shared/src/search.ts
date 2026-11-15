export interface SearchSegment {
  text: string;
  /** True for the parts of the text that matched the query. */
  hit: boolean;
}

export interface SearchPassage {
  chunkId: number | null;
  segments: SearchSegment[];
  page: number | null;
  heading: string | null;
}

/** Kinds of thing a search result can be. Modules may add more. */
export type SearchKind = "document" | "note" | "collection" | "catalog" | "marker" | "track" | "reference" | (string & {});

export interface SearchResult {
  kind: SearchKind;
  entityId: string;
  title: string;
  titleSegments: SearchSegment[];
  subtitle: string | null;
  collection: string | null;
  /** In-app route that opens the source at the matching place. */
  url: string;
  tags: string[];
  /** 0–1, relative to the best result of this search. */
  score: number;
  passages: SearchPassage[];
  sources: string[];
}

export type SearchMode = "keyword" | "semantic" | "hybrid";

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  relaxed: boolean;
  total: number;
  results: SearchResult[];
  facets: Record<string, number>;
  warnings: Array<{ source: string; message: string }>;
  tookMs: number;
}
