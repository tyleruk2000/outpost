/**
 * Shapes for "Answer from my library": one question, one answer written by a language
 * model the person runs themselves, from passages of their own library, with numbered
 * citations back to those passages.
 */

/** One numbered source the model was given. The number is what `[n]` in the answer refers to. */
export interface AnswerSource {
  marker: number;
  kind: string;
  entityId: string;
  title: string;
  collection: string | null;
  /** In-app route that opens the source at this passage. Built by Outpost, never by the model. */
  url: string;
  page: number | null;
  heading: string | null;
  /** The passage exactly as it is stored, and exactly as it was sent to the model. */
  quote: string;
}

/**
 * Where the model server is, judged from its address alone. A name that is not plainly
 * local counts as "elsewhere": Outpost does not look names up to find out.
 */
export type ModelServerPlace = "this-computer" | "local-network" | "elsewhere";

export interface AnswersStatus {
  /** The switch in Settings. */
  enabled: boolean;
  /** Switched on, with a usable address and a model named. Says nothing about whether the server is running. */
  ready: boolean;
  /** Why answers cannot be asked for yet, in plain words. Null when they can. */
  reason: string | null;
  model: string;
  /** Host (and port) the question and passages would be sent to. */
  server: string | null;
  place: ModelServerPlace | null;
  /** An answer is being written right now; the server writes one at a time. */
  busy: boolean;
}

export interface AnswerModelsResponse {
  /** Model names the server reports. Empty when it could not be read. */
  models: string[];
  /** Why the list could not be read, when it could not. */
  message: string | null;
}

export type AnswerTestFailure =
  | "address"
  | "unreachable"
  | "not-a-model-server"
  | "no-such-model"
  | "not-a-chat-model"
  | "no-chat-endpoint"
  | "too-slow"
  | "other";

export interface AnswerTestResult {
  ok: boolean;
  failure: AnswerTestFailure | null;
  /** What happened, and what to do about it. */
  message: string;
  /** Model names the server reports, when it could be asked. */
  models: string[];
  /** The model's reply to the test request, when it gave one. */
  reply: string | null;
  tookMs: number;
}

/** Why an answer stopped before it was finished. */
export type AnswerFailure =
  | "unreachable"
  | "no-such-model"
  | "not-a-chat-model"
  | "no-chat-endpoint"
  | "context-too-long"
  | "too-slow"
  | "interrupted"
  | "empty"
  | "other";

/**
 * What `POST /api/answers` sends, as server-sent events named by `type`. Always
 * `sources` first; then either `done` at once (nothing was found, so no model was
 * asked), or `delta` events as the model writes, ended by `done` or `error`.
 */
export type AnswerEvent =
  | {
      type: "sources";
      question: string;
      /** The model named in Settings, as it was asked for. */
      model: string;
      server: string;
      sources: AnswerSource[];
      /** Passages that were found but did not fit the context budget. */
      omitted: number;
      /** A source is from a field where a wrong paraphrase can hurt someone. */
      safetyCritical: boolean;
    }
  | { type: "delta"; text: string }
  | {
      type: "done";
      outcome: "answered" | "nothing-found";
      /** Markers the answer used that are real sources. */
      used: number[];
      /** Markers the answer used that refer to no source it was given. */
      unsupported: number[];
      /** The model stopped at the length limit, not because it had finished. */
      cutShort: boolean;
      tookMs: number;
    }
  | { type: "error"; failure: AnswerFailure; message: string };
