import type { ToolLookup } from "./tools.ts";
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
  /** This source is from a field where a wrong paraphrase can hurt someone (medicine, first aid, preserving food). */
  safetyCritical: boolean;
  /**
   * Set when this source is not a passage but something the model looked up in Outpost
   * with a tool (kind `lookup`): `title` names what was looked at, `quote` is the answer
   * the tool gave, exactly as the model was sent it, and `url` opens the screen it came from.
   */
  lookup?: ToolLookup;
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
 *
 * `sources` can come a second time before any `delta`: the model server refused the
 * passages as more than the model can read at once, and Outpost asked again with
 * fewer. The second list replaces the first, and its `leftOut` counts the passages
 * that were taken away for that reason.
 */
export type AnswerEvent =
  | {
      type: "sources";
      question: string;
      /**
       * What the library was searched for: the question without its small words ("how",
       * "should", "the"), or the question as typed when it has no others.
       */
      searchedFor: string;
      /** The model named in Settings, as it was asked for. */
      model: string;
      server: string;
      sources: AnswerSource[];
      /** Passages that were found but did not fit the context budget. */
      omitted: number;
      /**
       * Passages that were sent once and refused by the model server as more than the
       * model can read at once, and so left out when it was asked again. Usually 0.
       */
      leftOut: number;
      /** A source is from a field where a wrong paraphrase can hurt someone. */
      safetyCritical: boolean;
    }
  /**
   * The model server says the model is not in memory, so it is loaded before it can
   * read anything. Only a server that can be asked (Ollama) ever causes this; with any
   * other, a slow first word may be loading or may be reading, and Outpost cannot tell.
   */
  | { type: "loading" }
  | { type: "delta"; text: string }
  | {
      type: "done";
      /**
       * `answered`: the model wrote an answer. `nothing-found`: no passage matched, so the
       * model was not asked. `not-covered`: the model read the passages and said they do
       * not hold the answer; nothing it wrote is then shown as resting on a passage.
       */
      outcome: "answered" | "nothing-found" | "not-covered";
      /**
       * The answer as it is to be shown, when that is not exactly what the `delta` events
       * added up to: markers to numbers no passage carried are taken out or pointed at
       * the one passage whose own sentences they stood on, and a reply that says the
       * passages do not answer loses every marker. Absent when nothing was changed.
       */
      text?: string;
      /** Markers left in the answer, each a passage that was given. */
      used: number[];
      /** Numbers the model cited that no passage carried. None is left in the answer as shown. */
      unsupported: number[];
      /** Which of those were pointed at the one passage whose own whole sentences the marker stood on. */
      repointed: Array<{ from: number; to: number }>;
      /** Three or more passages were given and the answer cites every one, which says nothing about which was used. */
      citesAll: boolean;
      /** The model stopped at the length limit, not because it had finished. */
      cutShort: boolean;
      tookMs: number;
    }
  | { type: "error"; failure: AnswerFailure; message: string };
