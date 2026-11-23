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
  /** 0–1, on one scale for every source; not relative to the best result. */
  score: number;
  /** Why it is here, in a few words: "All 3 words, side by side", "2 of 3 words". */
  why?: string;
  passages: SearchPassage[];
  sources: string[];
}

export type SearchMode = "keyword" | "semantic" | "hybrid";

/**
 * One line of `GET /api/search/reference`, which sends what reference collections hold
 * a collection at a time. `start` comes first and `end` last; between them there is
 * one `collection` for each collection that answered, in the order they answered.
 */
export type ReferenceSearchEvent =
  | {
      type: "start";
      /** How many collections are being searched. 0 when there are none, or searching inside them is turned off. */
      collections: number;
    }
  | {
      type: "collection";
      collectionId: string;
      title: string;
      /** Its best matches, best first. Empty when it has none. */
      results: SearchResult[];
    }
  | {
      type: "end";
      /** How many collections answered. */
      searched: number;
      /** Collections whose articles are missing from the results: too slow to answer in time, or not searchable. */
      missing: ReferenceSearchMissing[];
      /** Why none could be searched at all (kiwix-serve is not running, say); null otherwise. */
      message: string | null;
      tookMs: number;
    };

export interface ReferenceSearchMissing {
  collectionId: string;
  title: string;
  reason: "slow" | "failed";
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  /** Too few results had every word, so results holding most of them follow those that do. */
  relaxed: boolean;
  /** How many items hold every word that matters. */
  everyWord: number;
  /** Words typed that only shape the question ("how", "to"), left out of matching and ranking. */
  ignored: string[];
  total: number;
  results: SearchResult[];
  /** Places and repeaters whose names match: shown in a strip of their own, not among the results. */
  places: SearchResult[];
  /** The query looks like one of their names, a callsign or a frequency, so the strip comes first. */
  placesFirst: boolean;
  facets: Record<string, number>;
  warnings: Array<{ source: string; message: string }>;
  /**
   * Only in an answer asked for with `reference=later`: true when there are reference
   * collections to search for this, which `GET /api/search/reference` does.
   */
  referenceToCome?: boolean;
  tookMs: number;
}
