/**
 * Writing one reply.
 *
 * A reply belongs to the server, not to the browser tab that asked for it. A small
 * model can take minutes, and a phone that locks its screen drops its connection; the
 * reply goes on being written and is there when the person comes back, on that device
 * or another. So a reply is a "run" held here, and any number of browsers can watch it
 * (see the stream route). It ends when the model finishes, when a person presses Stop
 * (which closes the connection to the model server, so the model stops working), when
 * the model server fails, or when a time limit passes.
 *
 * There is one run at a time across Outpost, shared with "Answer from my library": a
 * model on a home machine writes one thing at a time.
 *
 * While the model writes, its text is read as Markdown again and again and sent on as
 * the tree of plain values the web app draws. Only the blocks that changed are sent.
 */
import type { AnswerFailure, AnswerSource, ChatMessage, ChatPhase, ChatStreamEvent, MarkdownBlock } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { contextTokensFor } from "../answers/fit.ts";
import { ANSWER_PASSAGES, namesNoSubject, subjectOf } from "../answers/index.ts";
import { type ChatModelProvider, ModelServerError, withoutThinking } from "../answers/provider.ts";
import { isSafetyCritical } from "../retrieval/index.ts";
import { buildAnswerPrompt } from "../retrieval/prompt.ts";
import type { AssembledContext, RetrievedPassage } from "../retrieval/types.ts";
import { PLAIN_SYSTEM, planHistory, type Turn } from "./context.ts";
import { type ChatStore, replyBlocks, toMessage } from "./store.ts";

/** Most passages handed to the model for one question, as for an answer. */
export const CHAT_PASSAGES = ANSWER_PASSAGES;
/** The longest reply asked for, in tokens (about 750 words). A model that reaches it is reported as cut short. */
export const CHAT_MAX_TOKENS = 1024;
/** The longest reply accepted, in characters, whatever the server does with the limit above. */
export const CHAT_MAX_CHARS = 24_000;
/** Characters set aside for the standing instructions when the budget is shared out. */
const INSTRUCTIONS_ALLOWANCE = 1000;

/**
 * The most characters sent to the model in one turn: twice the context budget in
 * Settings (12,000 by default, about 3,000 tokens). With a reply of 1,024 tokens that
 * fits the 4,096 tokens Ollama reads by default.
 */
export const turnBudget = (contextChars: number) => Math.max(4000, contextChars * 2);

/** What is left for earlier messages once the newest one, the instructions and the passages have their share. */
export function historyBudget(contextChars: number, question: string, grounded: boolean): number {
  return Math.max(0, turnBudget(contextChars) - INSTRUCTIONS_ALLOWANCE - question.length - (grounded ? contextChars : 0));
}

export interface Run {
  conversationId: string;
  messageId: string;
  model: string;
  grounded: boolean;
  phase: ChatPhase;
  sources: AnswerSource[];
  searchedFor: string | null;
  omitted: number;
  startedAt: number;
  /** The reply as it stands, as blocks. */
  blocks: MarkdownBlock[];
  /** Tells whoever is watching what happened next. */
  listeners: Set<(event: ChatStreamEvent) => void>;
  /** A person pressed Stop: the model is stopped and the reply is kept as unfinished. */
  stop(): void;
  /** The server is closing: the model is stopped, and the reply says why it ends where it does. */
  shutDown(): void;
  /** Settles when the reply has been stored in its final state. */
  finished: Promise<ChatMessage>;
}

export interface RunRequest {
  conversationId: string;
  /** The person's newest message. */
  question: string;
  /** The messages before it, oldest first. */
  earlier: Turn[];
  model: string;
  useLibrary: boolean;
  scope: { kind: "document" | "note"; entityId: string } | null;
  /** What the library was searched for to write the reply before this one, when it was. */
  previousSearch: string | null;
}

/** What went wrong, reworded for a conversation where the provider's words were written for one answer. */
function noticeFor(error: ModelServerError): string {
  if (error.failure === "context-too-long") {
    const sizes = / They came to \d+ tokens and the model is set up to read \d+ at once\./.exec(error.message)?.[0] ?? "";
    return `This turn was too long for the model.${sizes} Shorten your message, start a new conversation, lower the context budget in Settings, or start the model with a larger context.`;
  }
  return error.message
    .replace("Choose a chat model in Settings.", "Choose another model for this conversation.")
    .replace(
      "Check the name in Settings, or fetch the model with your model server's own tool.",
      "Choose another model for this conversation, or fetch this one with your model server's own tool.",
    );
}

export function createRunner(ctx: AppContext, store: ChatStore) {
  const { answers, retrieval, settings, search } = ctx.services;
  let current: Run | undefined;

  /** Every passage of one document or note, in reading order. */
  function passagesOfItem(kind: string, entityId: string): RetrievedPassage[] {
    const ids = (
      ctx.sqlite
        .prepare(
          `SELECT c.id AS id FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id
           WHERE e.kind = ? AND e.entity_id = ? ORDER BY c.ordinal LIMIT 400`,
        )
        .all(kind, entityId) as Array<{ id: number }>
    ).map((entry) => entry.id);
    return search.getChunks(ids).map((record) => ({
      chunkId: record.chunkId,
      kind: record.kind,
      entityId: record.entityId,
      title: record.title,
      collection: record.collection,
      sourcePath: record.sourcePath,
      url: record.page === null ? record.url : `${record.url}${record.url.includes("?") ? "&" : "?"}page=${record.page}`,
      page: record.page,
      heading: record.heading || null,
      charStart: record.charStart,
      charEnd: record.charEnd,
      text: record.text,
      contentHash: record.contentHash,
      indexVersion: record.indexVersion,
      score: 0,
      retrievedBy: [],
    }));
  }

  /**
   * The passages for a message. In a conversation about one item: the passages of
   * that item that match the message first, then the item from its beginning, as far
   * as the budget goes. Otherwise: what the library's search finds for the message.
   *
   * A message that names no subject of its own ("Why?", "And then?") is searched for
   * as the message before it was, so that it is answered from the same passages. A
   * message that does name a subject is only ever searched for as itself: a new
   * question the library holds nothing for must come back as "nothing found", not be
   * answered from whatever the last question turned up.
   */
  async function findPassages(request: RunRequest, signal: AbortSignal): Promise<{ context: AssembledContext; searchedFor: string }> {
    const contextChars = settings.get("answers.contextChars");
    const searchedFor = request.previousSearch && namesNoSubject(request.question) ? request.previousSearch : subjectOf(request.question);
    let passages: RetrievedPassage[];
    if (request.scope) {
      const whole = passagesOfItem(request.scope.kind, request.scope.entityId);
      const wanted = new Set(whole.map((passage) => passage.chunkId));
      const matching = (
        await retrieval.retriever.retrieve({ query: searchedFor, limit: 30, kinds: [request.scope.kind], within: request.scope, signal })
      ).filter((passage) => wanted.has(passage.chunkId));
      const seen = new Set(matching.map((passage) => passage.chunkId));
      passages = [...matching, ...whole.filter((passage) => !seen.has(passage.chunkId))];
    } else {
      passages = await retrieval.retriever.retrieve({ query: searchedFor, limit: CHAT_PASSAGES, signal });
    }
    const context = retrieval.assembler.assemble(request.question, passages, {
      maxChars: contextChars,
      maxPassages: request.scope ? 24 : CHAT_PASSAGES,
    });
    return { context, searchedFor };
  }

  /**
   * Starts a reply. The reply's row exists and the turn is taken before this returns,
   * so two requests cannot both start one. Throws when the model server is not set up
   * or something is already being written.
   */
  function start(request: RunRequest): Run {
    const found = answers.providerFor(request.model);
    if (!found) throw new AppError("conflict", answers.server().reason ?? "No model server is set up.");
    const provider: ChatModelProvider = found;
    const controller = new AbortController();
    const release = answers.takeTurn(controller);
    if (!release) {
      throw new AppError(
        "conflict",
        current
          ? "The model is writing a reply in another conversation. It writes one at a time; send this when that one has finished, or stop it."
          : "The model is writing an answer from the library at the moment. It writes one thing at a time; send this when that has finished.",
        { busy: true, conversationId: current?.conversationId ?? null },
      );
    }

    const grounded = request.useLibrary || request.scope !== null;
    const contextChars = settings.get("answers.contextChars");
    const planned = planHistory(request.earlier, historyBudget(contextChars, request.question, grounded));
    const started = performance.now();
    let row: ReturnType<ChatStore["startReply"]>;
    try {
      row = store.startReply(request.conversationId, { model: request.model, grounded });
      row = store.patchReply(row.id, { omitted: planned.omitted });
    } catch (error) {
      release();
      throw error;
    }

    let stoppedByPerson = false;
    let finish!: (message: ChatMessage) => void;
    const run: Run = {
      conversationId: request.conversationId,
      messageId: row.id,
      model: request.model,
      grounded,
      phase: grounded ? "finding" : "waiting",
      sources: [],
      searchedFor: null,
      omitted: planned.omitted,
      startedAt: Date.now(),
      blocks: [],
      listeners: new Set(),
      stop() {
        stoppedByPerson = true;
        controller.abort();
      },
      shutDown() {
        controller.abort();
      },
      finished: new Promise<ChatMessage>((resolve) => {
        finish = resolve;
      }),
    };
    current = run;
    const tell = (event: ChatStreamEvent) => {
      for (const listener of run.listeners) listener(event);
    };

    // The reply's text, read into blocks no more often than the reading itself can keep up with.
    let text = "";
    let lastJson: string[] = [];
    let parseTimer: NodeJS.Timeout | undefined;
    let parseCost = 0;
    let savedAt = Date.now();
    const publish = () => {
      parseTimer = undefined;
      const before = performance.now();
      const blocks = replyBlocks(text);
      const json = blocks.map((block) => JSON.stringify(block));
      let from = 0;
      while (from < json.length && from < lastJson.length && json[from] === lastJson[from]) from += 1;
      parseCost = performance.now() - before;
      if (from === json.length && json.length === lastJson.length) return;
      lastJson = json;
      run.blocks = blocks;
      tell({ type: "blocks", from, blocks: blocks.slice(from) });
      // Kept as it grows, so that a server that stops loses a few seconds of a reply and not all of it.
      if (Date.now() - savedAt > 2000) {
        savedAt = Date.now();
        store.patchReply(row.id, { text });
      }
    };
    const schedule = () => {
      if (parseTimer) return;
      parseTimer = setTimeout(publish, Math.max(60, Math.min(1000, parseCost * 5)));
    };

    const settle = (patch: Parameters<ChatStore["patchReply"]>[1]): ChatMessage => {
      clearTimeout(parseTimer);
      const saved = store.patchReply(row.id, { text, tookMs: Math.round(performance.now() - started), ...patch });
      return toMessage(saved);
    };

    /** Asks the model and stores what it wrote. Throws when the reply did not finish. */
    async function write(): Promise<ChatMessage> {
      // What the person said since the model last replied, with the newest message at the end.
      const asked = planned.unanswered ? `${planned.unanswered}\n\n${request.question}` : request.question;
      let system = PLAIN_SYSTEM;
      let prompt = asked;
      if (grounded) {
        const { context, searchedFor } = await findPassages(request, controller.signal);
        controller.signal.throwIfAborted();
        run.searchedFor = searchedFor;
        run.sources = context.citations.map(({ marker, kind, entityId, title, collection, url, page, heading, quote }) => ({
          marker,
          kind,
          entityId,
          title,
          collection,
          url,
          page,
          heading,
          quote,
          safetyCritical: isSafetyCritical({ title, collection }),
        }));
        store.patchReply(row.id, { sources: run.sources, searchedFor });
        if (run.sources.length === 0) {
          // Nothing was found, so there is nothing to answer from. The model is not asked.
          return settle({
            state: "nothing-found",
            notice: request.scope
              ? "No text of this item is in the search index, so there was nothing to give the model. It may still be being read, or it may have no text that could be read."
              : "Nothing in your documents, notes or books matches this, so the model was not asked. A reply written from no passages would be the model’s guess, not your library’s.",
          });
        }
        ({ system, user: prompt } = buildAnswerPrompt({ ...context, query: asked }));
      }
      run.phase = "waiting";
      tell({ type: "phase", phase: "waiting", sources: run.sources, searchedFor: run.searchedFor });

      let finishReason: string | null = null;
      const pieces = provider.generate({
        system,
        prompt,
        history: planned.sent.map(({ role, text: content }) => ({ role, content })),
        temperature: settings.get("answers.temperature"),
        maxTokens: CHAT_MAX_TOKENS,
        // The same size an answer asks for, so that Ollama does not load the model afresh between the two.
        contextTokens: contextTokensFor(settings.get("answers.contextChars"), CHAT_MAX_TOKENS),
        signal: controller.signal,
        onLoading: () => {
          run.phase = "loading";
          tell({ type: "phase", phase: "loading" });
        },
        onFinish: (info) => {
          finishReason = info.finishReason;
        },
      });
      for await (const piece of withoutThinking(pieces)) {
        if (!text) {
          run.phase = "writing";
          tell({ type: "phase", phase: "writing" });
        }
        text += piece;
        schedule();
        if (text.length > CHAT_MAX_CHARS) {
          // Leaving the loop closes the connection to the model, which stops it.
          finishReason = "length";
          break;
        }
      }
      if (!text.trim()) {
        throw new ModelServerError(
          "empty",
          finishReason === "length"
            ? "The model used up its whole allowance without writing a reply. Models that think before answering can do this; try another model."
            : "The model sent back no words. Regenerate the reply, or try another model.",
        );
      }
      return settle(
        finishReason === "length"
          ? { state: "cut-short", notice: "The model reached its length limit, so this reply stops before its end." }
          : { state: "complete" },
      );
    }

    /** The reply as it is stored when the model did not finish it. */
    function unfinished(error: unknown): ChatMessage {
      if (stoppedByPerson) {
        return settle({
          state: "stopped",
          notice: text ? "Stopped. This reply is unfinished." : "Stopped before the model had written anything.",
        });
      }
      if (controller.signal.aborted && !(error instanceof AppError)) {
        // The server is shutting down.
        return settle({
          state: "stopped",
          failure: "interrupted",
          notice: "Outpost was stopped while this reply was being written, so it stops here. Regenerate it to ask again.",
        });
      }
      if (error instanceof ModelServerError) {
        // The kind of failure only: never the conversation.
        ctx.log.warn({ failure: error.failure }, "the model server did not finish a reply");
        return settle({ state: "failed", failure: error.failure, notice: noticeFor(error) });
      }
      // Refused before anything was sent (the address is not on this network, say).
      if (error instanceof AppError) return settle({ state: "failed", failure: "other" satisfies AnswerFailure, notice: error.message });
      ctx.log.error({ err: error }, "writing a reply failed");
      return settle({
        state: "failed",
        failure: "other",
        notice: "Something went wrong on the server while the reply was being written. The log has the details.",
      });
    }

    void (async () => {
      let message: ChatMessage;
      try {
        message = await write();
      } catch (error) {
        try {
          message = unfinished(error);
        } catch (failure) {
          // The database has gone (the server is closing). There is nothing more to store.
          ctx.log.error({ err: failure }, "a reply could not be stored");
          message = toMessage({ ...row, text, state: "stopped", notice: "This reply could not be stored." });
        }
      } finally {
        clearTimeout(parseTimer);
        // Whatever happened, the model is told to stop: this closes the connection to it.
        controller.abort();
        release();
        if (current === run) current = undefined;
      }
      tell({ type: "done", message });
      finish(message);
      ctx.events.publish({ type: "chat.changed", id: request.conversationId });
    })();

    return run;
  }

  return {
    start,
    current: () => current,
    of: (conversationId: string) => (current?.conversationId === conversationId ? current : undefined),
    /** For shutdown: stops whatever is being written and waits, briefly, for it to be stored. */
    async close() {
      const run = current;
      if (!run) return;
      run.shutDown();
      await Promise.race([run.finished, new Promise((resolve) => setTimeout(resolve, 2000).unref())]);
    },
  };
}

export type ChatRunner = ReturnType<typeof createRunner>;
