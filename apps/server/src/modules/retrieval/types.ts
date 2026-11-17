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

import type { ToolSpec } from "../tools/index.ts";

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
  /** Only passages of this one item. */
  within?: { kind: string; entityId: string };
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

/** One tool call as the model asked for it. */
export interface ToolCallRequest {
  id: string | null;
  name: string;
  arguments: unknown;
}

/** A message of a turn after the newest one from the person. */
export type GenerationStep =
  | { role: "assistant"; content: string; toolCalls: ToolCallRequest[] }
  /** What one tool answered, for the call with this id and name. */
  | { role: "tool"; callId: string | null; name: string; content: string }
  /** A line from Outpost, not from the person: "answer now from what you have". */
  | { role: "user"; content: string };

export interface GenerationRequest {
  system: string;
  /** The newest message from the person. */
  prompt: string;
  /** Earlier turns of a conversation, oldest first, sent between the instructions and `prompt`. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /**
   * Tools the model may ask for (modules/tools), sent as the request's `tools` field in
   * both protocols. Only to a model the server says can call them.
   */
  tools?: ToolSpec[];
  /**
   * What came after `prompt` in this same turn: the model asking for tools, what they
   * answered, and, at the end of a turn that has looked up all it may, a line from
   * Outpost telling it to answer. Sent after the newest message, in order.
   */
  after?: GenerationStep[];
  /**
   * Called once, when the model ends its turn asking for tools rather than answering in
   * words, with what it asked for. `arguments` is the parsed JSON, or the string as the
   * model sent it when it was not valid JSON. `id` is the server's id for the call, when
   * it gave one (the OpenAI-compatible protocol does; Ollama may not).
   */
  onToolCalls?: (calls: ToolCallRequest[]) => void;
  maxTokens?: number;
  temperature?: number;
  /**
   * How many tokens the model should be set up to read at once, for a server that can
   * be asked (Ollama). The prompt and the reply must both fit in it. Other servers have
   * their context fixed when they start, and ignore this.
   */
  contextTokens?: number;
  signal?: AbortSignal;
  /**
   * Called once, before the request is sent, when the model server has said that the
   * model is not in memory (or is there for another context size) and so must be loaded
   * first. Only a server that can be asked (Ollama, by `/api/ps`) ever causes this; with
   * any other it is never called, because a slow start there may be loading or reading
   * and nothing says which.
   */
  onLoading?: () => void;
  /**
   * Called once when the model ends the answer itself, with why it stopped:
   * "stop" (it had finished), "length" (it reached `maxTokens`, or, with Ollama told not to make room, filled the context), or null when the
   * server did not say; how many tokens the prompt came to, and how many the reply did,
   * when the server says (Ollama does). Not called when generation fails or is cancelled.
   */
  onFinish?: (info: { finishReason: string | null; promptTokens?: number | null; replyTokens?: number | null }) => void;
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
