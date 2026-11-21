/**
 * Shapes for the "How search works" screen: a real query taken through every stage of
 * retrieval, with the intermediate results kept so they can be shown.
 */
import type { SearchSegment } from "./search.ts";

export interface ExplainOverview {
  /** Things in the index, by kind ("document", "note", …). */
  entities: Record<string, number>;
  /** Passages with text. */
  chunks: number;
  /** How long passages are, as a histogram of character counts. */
  chunkLengths: Array<{ from: number; to: number; count: number }>;
  settings: { chunkSize: number; chunkOverlap: number; rrfK: number; keywordWeight: number; semanticWeight: number };
  vectors: ExplainVectorSource & { embedded: number; total: number };
}

export interface ExplainVectorSource {
  /**
   * "model": vectors come from the embedding model configured in Settings.
   * "demonstration": no model is ready, so word-count vectors are made on the spot to
   * show the mechanics. They are not a language model.
   */
  source: "model" | "demonstration";
  modelId: string;
  dimensions: number | null;
  /** Why the configured model is not being used, when it is not. */
  reason: string | null;
}

export interface ExplainEntity {
  kind: string;
  entityId: string;
  title: string;
  url: string;
  chunks: number;
}

export interface ExplainChunk {
  chunkId: number;
  ordinal: number;
  heading: string | null;
  page: number | null;
  text: string;
  /** Offsets into the entity's whole text. Neighbouring passages overlap where these ranges do. */
  charStart: number | null;
  charEnd: number | null;
  /** Characters this passage shares with the one before it. */
  overlapWithPrevious: number;
  contentHash: string;
  hasVector: boolean;
}

export interface ExplainHit {
  rank: number;
  chunkId: number;
  kind: string;
  entityId: string;
  title: string;
  url: string;
  page: number | null;
  heading: string | null;
  /** The passage, with matched words marked where keyword search found them. */
  segments: SearchSegment[];
  /** Characters in the whole passage. */
  length: number;
}

export interface ExplainKeywordHit extends ExplainHit {
  /** BM25 score, turned positive so that larger is better. */
  score: number;
  /** Which fields the words were found in. Title, heading and tags count for more than body text. */
  fields: { title: boolean; heading: boolean; text: boolean; tags: boolean };
}

export interface ExplainSemanticHit extends ExplainHit {
  /** Cosine similarity to the query, -1 to 1. */
  similarity: number;
  /** The first numbers of this passage's vector, for drawing. */
  vector: number[];
  /**
   * Whether the passage holds any of the question's words, by the keyword index's own
   * stemming; null when the question has no words to look for.
   */
  sharesWords: boolean | null;
}

export interface ExplainFusionRow {
  chunkId: number;
  title: string;
  heading: string | null;
  page: number | null;
  url: string;
  /** 1-based position in each list, or null when that search did not return it. */
  keywordRank: number | null;
  semanticRank: number | null;
  /** weight / (k + rank) from each list. */
  keywordPart: number;
  semanticPart: number;
  score: number;
  rank: number;
}

export interface ExplainResponse {
  query: string;
  parse: {
    words: string[];
    excluded: string[];
    /** The last word is treated as the start of a word, because it may still be being typed. */
    prefixLast: boolean;
    /** The expression handed to the full-text index. */
    expression: string | null;
    /** No passage had every word, so the search fell back to any word. */
    relaxed: boolean;
    /** How common each word is. Rare words count for more. */
    terms: Array<{ term: string; chunksContaining: number; idf: number }>;
    totalChunks: number;
  };
  keyword: { tookMs: number; hits: ExplainKeywordHit[] };
  semantic: ExplainVectorSource & {
    tookMs: number;
    /** How many stored vectors the query was compared with. */
    compared: number;
    /** The first numbers of the query's vector. */
    queryVector: number[];
    /** For demonstration vectors: the words that make up the query's vector. */
    queryTerms: string[];
    hits: ExplainSemanticHit[];
  };
  fusion: { k: number; keywordWeight: number; semanticWeight: number; rows: ExplainFusionRow[] };
  /** The passages laid out as numbered sources, as a language model would be given them. */
  context: {
    text: string;
    citations: Array<{
      marker: number;
      chunkId: number;
      title: string;
      heading: string | null;
      page: number | null;
      url: string;
      quote: string;
    }>;
    omitted: number;
    safetyCritical: boolean;
    characters: number;
    /** A rough token count (characters ÷ 4). Real counts depend on the model. */
    approxTokens: number;
  };
  /**
   * The prompt "Answer from my library" sends to the person's own model for this question:
   * the same text, built by the same code. This endpoint only shows it; nothing is sent.
   */
  prompt: { system: string; user: string; approxTokens: number };
  timings: { keywordMs: number; semanticMs: number; fusionMs: number; contextMs: number; totalMs: number };
}

export interface ProjectionPoint {
  chunkId: number;
  x: number;
  y: number;
  kind: string;
  title: string;
  excerpt: string;
  /** Cosine similarity to the query, when a query was given. */
  similarity: number | null;
  /** Among the nearest passages to the query. */
  nearest: boolean;
}

/** Passage vectors flattened to two dimensions so they can be drawn. */
export interface ProjectionResponse extends ExplainVectorSource {
  /** Share of the vectors' variation that each of the two axes keeps, 0 to 1. */
  explained: [number, number];
  points: ProjectionPoint[];
  query: { x: number; y: number } | null;
  /** Passages drawn, out of how many have vectors. */
  shown: number;
  total: number;
}
