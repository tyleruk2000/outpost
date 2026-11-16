/**
 * Shapes for Chat: conversations with a language model the person runs themselves.
 *
 * A conversation is kept on the server, so it is there on every device. There are no
 * accounts, so it is also there for everyone who can open this Outpost.
 *
 * What the model writes is untrusted text. It never reaches the browser as markup: the
 * server reads it as Markdown into the same tree of plain values a Markdown document
 * becomes (`MarkdownBlock`), and the web app draws that tree with its own elements.
 */
import type { AnswerFailure, AnswerSource, AnswerTestResult, ModelServerPlace } from "./answers.ts";
import type { MarkdownBlock } from "./documents.ts";

/** One item of the library a conversation is about, when it was started with "Ask about this". */
export interface ChatScope {
  kind: "document" | "note";
  entityId: string;
  /** The item's title when the conversation was started. */
  title: string;
  /** In-app route that opens the item. Built by Outpost. */
  url: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  /** The model this conversation uses. Empty means the one chosen in Settings. */
  model: string;
  /** Each question is answered from passages of the library, not from what the model learned. */
  useLibrary: boolean;
  /** Set when the conversation is about one document or note; the library is then that item alone. */
  scope: ChatScope | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatConversationSummary extends ChatConversation {
  messageCount: number;
  /** The start of the newest message, as plain words. */
  excerpt: string;
  /** A reply is being written in this conversation right now. */
  writing: boolean;
}

/**
 * How a reply ended.
 *
 *  - `writing`        the model is being asked, or is writing, now
 *  - `complete`       the model finished
 *  - `cut-short`      the model reached its length limit
 *  - `stopped`        a person pressed Stop, or Outpost was restarted
 *  - `failed`         the model server could not finish; `failure` and `notice` say why
 *  - `nothing-found`  the library held nothing for the question, so the model was not asked
 */
export type ChatReplyState = "writing" | "complete" | "cut-short" | "stopped" | "failed" | "nothing-found";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** The words as typed, or as the model wrote them. */
  text: string;
  /** A reply's text as a tree of plain values, for drawing. Empty for a person's message. */
  blocks: MarkdownBlock[];
  /** Always `complete` for a person's message. */
  state: ChatReplyState;
  failure: AnswerFailure | null;
  /** What happened and what to do next, in words for the person, when the reply did not finish. */
  notice: string | null;
  /** The model that wrote the reply. */
  model: string | null;
  /** The reply was written from passages of the library. */
  grounded: boolean;
  /** The passages the model was given for this reply. Empty for a plain reply. */
  sources: AnswerSource[];
  /** What the library was searched for, when it was. */
  searchedFor: string | null;
  /** Citation markers in the reply that match no passage the model was given. */
  unsupported: number[];
  /** Earlier messages of the conversation that were not sent to the model for this reply. */
  omitted: number;
  tookMs: number | null;
  createdAt: number;
}

export interface ChatConversationDetail {
  conversation: ChatConversation;
  messages: ChatMessage[];
  /**
   * The id of the oldest message that would be sent with the next question. Null when
   * all of them would be. Messages before it are kept and shown, and no longer sent.
   */
  sentFrom: string | null;
}

export interface ChatStatus {
  /** The switch in Settings (the same one as answers from the library). */
  enabled: boolean;
  /** Switched on with an address Outpost may use. Says nothing about whether the server is running. */
  usable: boolean;
  /** Why chat cannot be used yet, in plain words. Null when it can. */
  reason: string | null;
  /** The model chosen in Settings, used by conversations that have not chosen their own. */
  defaultModel: string;
  server: string | null;
  place: ModelServerPlace | null;
  /** The conversation a reply is being written in right now. The model writes one thing at a time. */
  writingIn: string | null;
}

export interface ChatModel {
  /** The name the server knows the model by; what is sent back to it. */
  id: string;
  /** Size on disk in bytes, when the server says (Ollama does). */
  sizeBytes: number | null;
  /** Parameter count as the server states it, for example "3.2B". */
  parameters: string | null;
  /** How the weights were compressed, for example "Q4_K_M". */
  quantization: string | null;
  family: string | null;
  /**
   * Whether the model can write text, when the server says (Ollama lists each model's
   * capabilities). Absent when it does not: then the name is all there is to go by.
   */
  writes?: boolean;
}

export interface ChatModelsResponse {
  models: ChatModel[];
  /** Why the list could not be read, when it could not. */
  message: string | null;
  /** The server answered Ollama's own list as well, which is where sizes come from. */
  ollama: boolean;
}

/** The result of "Look for Ollama on this computer". */
export interface ChatLookResult {
  found: boolean;
  /** The address that answered, ready to be saved as the setting. */
  address: string | null;
  models: ChatModel[];
  message: string;
}

/**
 * The result of the first step of setting up answers and chat: the model server that
 * was found, what it has, and which of its models Outpost would start with.
 */
export interface ModelSetupLook extends ChatLookResult {
  /**
   * The model to offer first: the one already chosen in Settings when the server has
   * it, otherwise the smallest that can write well enough to be worth trying. Null
   * when the server has no model that writes.
   */
  recommended: string | null;
}

/**
 * The result of the last step: the model was asked one short question. When it
 * answered, the address and the model were saved and answers were switched on.
 */
export interface ModelSetupTry extends AnswerTestResult {
  saved: boolean;
}

/** What a reply is doing at this moment. */
export type ChatPhase = "finding" | "waiting" | "writing";

/**
 * What `GET /api/chat/conversations/:id/stream` sends, as server-sent events named by
 * `type`. `idle` alone when nothing is being written. Otherwise `start` first, then
 * `blocks` as the reply grows, ended by `done`.
 */
export type ChatStreamEvent =
  | { type: "idle" }
  | {
      type: "start";
      messageId: string;
      phase: ChatPhase;
      model: string;
      grounded: boolean;
      sources: AnswerSource[];
      searchedFor: string | null;
      omitted: number;
      /** When the reply was asked for, in milliseconds since 1970. */
      startedAt: number;
    }
  | { type: "phase"; phase: ChatPhase; sources?: AnswerSource[]; searchedFor?: string | null }
  /** Replace the reply's blocks from index `from` onward with `blocks`. Earlier ones have not changed. */
  | { type: "blocks"; from: number; blocks: MarkdownBlock[] }
  /** The reply as it was stored: finished, stopped, cut short or failed. */
  | { type: "done"; message: ChatMessage };
