/**
 * The contracts for retrieval-augmented generation.
 *
 * Retrieval, context assembly and citations are implemented in this module.
 * `ModelProvider` is implemented in `modules/answers` for any OpenAI-compatible chat
 * server a person runs themselves (Ollama, llama.cpp, LM Studio); Outpost bundles no
 * model. `Reranker` is declared and nothing implements it. Nothing here imports a
 * model library.
 *
 *   question ─▶ Retriever ─▶ [Reranker] ─▶ ContextAssembler ─▶ ModelProvider ─▶ answer
 *                                                   │                               │
 *                                                   └──────── citations ◀───────────┘
 */

/** A passage with everything needed to trace it back to its source. */
export interface RetrievedPassage {
  chunkId: number;
  /** The owning entity: "document", "note", … and its id in that module. */
  kind: string;
  entityId: string;
  title: string;
  /** Source collection or category, when the owning module set one. */
  collection: string | null;
  /** Path of the original file relative to its storage location, when there is one. */
  sourcePath: string | null;
  /** In-app route that opens the source at this passage. */
  url: string;
  page: number | null;
  heading: string | null;
  charStart: number | null;
  charEnd: number | null;
  /** The passage text exactly as stored. Quoted material must come from here. */
  text: string;
  contentHash: string;
  indexVersion: number;
  /** Rank-based relevance, 0–1 within this retrieval. */
  score: number;
  /** Layers that surfaced it: "keyword", "semantic". */
  retrievedBy: string[];
}

export interface RetrievalRequest {
  query: string;
  /** Maximum passages to return. */
  limit?: number;
  kinds?: string[];
  mode?: "keyword" | "semantic" | "hybrid";
  signal?: AbortSignal;
}

export interface Retriever {
  readonly id: string;
  retrieve(request: RetrievalRequest): Promise<RetrievedPassage[]>;
}

/** Reorders passages with a stronger (slower) relevance model. Optional. */
export interface Reranker {
  readonly id: string;
  rerank(query: string, passages: RetrievedPassage[], signal?: AbortSignal): Promise<RetrievedPassage[]>;
}

export interface Citation {
  /** The marker used in the context and expected back in the answer, e.g. 1 for "[1]". */
  marker: number;
  chunkId: number;
  kind: string;
  entityId: string;
  title: string;
  collection: string | null;
  url: string;
  page: number | null;
  heading: string | null;
  /** Exact source text the marker refers to. */
  quote: string;
  contentHash: string;
}

export interface AssembledContext {
  query: string;
  /** Numbered source blocks, ready to place in a prompt. */
  text: string;
  citations: Citation[];
  /** Passages that did not fit the budget. */
  omitted: number;
  /**
   * True when any source belongs to a domain where a wrong paraphrase can hurt
   * someone (medicine, first aid, food preservation). Interfaces built on this must
   * then show quoted source text distinctly from generated wording.
   */
  safetyCritical: boolean;
}

export interface ContextAssembler {
  assemble(query: string, passages: RetrievedPassage[], options?: { maxChars?: number; maxPassages?: number }): AssembledContext;
}

export interface GenerationRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /**
   * Called once when the model ends the answer itself, with why it stopped:
   * "stop" (it had finished), "length" (it reached `maxTokens`), or null when the
   * server did not say. Not called when generation fails or is cancelled.
   */
  onFinish?: (info: { finishReason: string | null }) => void;
}

/** A locally hosted language model. Implemented for OpenAI-compatible servers in `modules/answers/provider.ts`. */
export interface ModelProvider {
  readonly id: string;
  generate(request: GenerationRequest): AsyncIterable<string>;
}

/** An answer with its claims tied to sources: what `modules/answers` has once a model has finished writing. */
export interface CitedAnswer {
  /** Generated wording. Always presented as an interpretation, never as the source. */
  text: string;
  citations: Citation[];
  /** Markers the model used that do not correspond to any supplied source. */
  unsupportedMarkers: number[];
  safetyCritical: boolean;
}
