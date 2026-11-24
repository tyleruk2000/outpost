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
  /** Results with the same title further down (a collection, its document, its catalogue entry), named under this one. */
  alsoIn?: SearchAlsoIn[];
}

export interface SearchAlsoIn {
  kind: SearchKind;
  entityId: string;
  title: string;
  collection: string | null;
  subtitle: string | null;
  url: string;
}

/** The one place in Outpost that is plainly the answer to a question, shown above the results. */
export interface SearchCard {
  /** "tool": a screen of Outpost; "plan": one of the household's emergency plans; "place": a place on the map. */
  kind: "tool" | "plan" | "place";
  title: string;
  /** One line on what it holds. */
  about: string;
  url: string;
}

/**
 * Among results that are nearly as good, a person's own come first: where reference
 * articles and the library's own items are one list (on the server, and on the search
 * screen as the articles arrive), an article's score counts this much of itself.
 */
export const REFERENCE_BESIDE_OWN = 0.95;

export interface SearchSuggestion {
  /** The whole query with the suggested words in place of the typed ones. */
  query: string;
  /** The words suggested, to show in bold. */
  words: string[];
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
      /**
       * Collections left for later: the search asks those most likely to hold the answer
       * first. They are searched too if those find too little ("widen"), or when asked for
       * with `scope=all`. Absent from an older server.
       */
      more?: number;
      /** Results carry scores on one scale, to be shown as one list in score order. Absent from an older server. */
      ranked?: boolean;
      /**
       * A word typed is in no passage of the library and a near word is ("purifiy", "purify"): the
       * collections are asked for the query with it as well. Absent when not.
       */
      instead?: SearchSuggestion;
    }
  | {
      /** The first collections found too little, so the rest, this many, are being searched too. */
      type: "widen";
      collections: number;
    }
  | {
      type: "collection";
      collectionId: string;
      title: string;
      /** Its best matches, best first. Empty when it has none. */
      results: SearchResult[];
      /**
       * False for a first look (its titles) while its full text is still being searched: a
       * later line for the same collection replaces these results. True for its last word.
       */
      done?: boolean;
    }
  | {
      type: "end";
      /** How many collections answered. */
      searched: number;
      /** Collections whose articles are missing from the results: too slow to answer in time, or not searchable. */
      missing: ReferenceSearchMissing[];
      /** Why none could be searched at all (kiwix-serve is not running, say); null otherwise. */
      message: string | null;
      /** Collections not searched because the first found enough; `scope=all` searches them. */
      more?: number;
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
  /**
   * Other spellings and ways of saying the words typed that were searched as well
   * ("tire" for "tyre", "power outage" for "power cut"). Empty when asked with `exact=1`.
   */
  alsoSearched: string[];
  /** A word typed is in no passage, or almost none, while a near word is common: offered, never searched instead. */
  didYouMean: SearchSuggestion | null;
  total: number;
  results: SearchResult[];
  /** Places and repeaters whose names match: shown in a strip of their own, not among the results. */
  places: SearchResult[];
  /** The query looks like one of their names, a callsign or a frequency, so the strip comes first. */
  placesFirst: boolean;
  /** The one place in Outpost that is plainly the answer, above the results; first page only. Absent from an older server. */
  card?: SearchCard | null;
  /**
   * The current household's name, when there are several and the results hold its emergency
   * plans or supplies, which are that household's only. Absent from an older server.
   */
  householdShown?: string | null;
  facets: Record<string, number>;
  warnings: Array<{ source: string; message: string }>;
  /**
   * Only in an answer asked for with `reference=later`: true when there are reference
   * collections to search for this, which `GET /api/search/reference` does.
   */
  referenceToCome?: boolean;
  tookMs: number;
}
