/**
 * Chat: conversations with a language model the person runs themselves.
 *
 * It is built on what "Answer from my library" already has, not beside it: the same
 * model server at the same address, behind the same rule about which addresses may be
 * contacted (`modules/answers/address.ts`); the same retrieval and the same fenced
 * prompt when a conversation uses the library; the same one-at-a-time turn.
 *
 * What is different is that a conversation is kept. Its messages are rows in the
 * database, so they are on every device, and, since Outpost has no accounts, readable
 * by everyone who can open it. Nothing of a conversation is written to the log.
 *
 * What leaves Outpost: when a person sends a message, the standing instructions, the
 * recent messages of that conversation that fit the budget (see context.ts), and, when
 * the conversation uses the library, the passages found for the question. All of it
 * goes to the one configured model server and nowhere else. Opening the Chat screen
 * asks that server for its list of models; that request carries nothing.
 */
import type {
  ChatConversationDetail,
  ChatLookResult,
  ChatModelsResponse,
  ChatStatus,
  ChatStreamEvent,
  ModelSetupLook,
  ModelSetupTry,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { parseModelServerAddress } from "../answers/address.ts";
import { planHistory, titleFrom } from "./context.ts";
import { chatModels, lookForOllama, OLLAMA_DEFAULT_ADDRESSES } from "./models.ts";
import { replyAsNote } from "./note.ts";
import { type ChatRunner, createRunner, historyBudget } from "./run.ts";
import { lookForModelServer, placesToLook, tryModel } from "./setup.ts";
import { type ChatStore, createChatStore, shownReply, toConversation, toMessage } from "./store.ts";

/** The longest message a person can send, in characters. */
export const CHAT_MESSAGE_MAX = 16_000;

export interface ChatService {
  store: ChatStore;
  runner: ChatRunner;
  /** Stops a reply being written, then removes every conversation. Only "erase everything" calls it. */
  eraseAll(): Promise<number>;
  /** Test seam: where "Look for Ollama" looks. */
  setOllamaAddresses(addresses: readonly string[]): void;
}

declare module "../../core/context.ts" {
  interface Services {
    chat: ChatService;
  }
}

export async function registerChat(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { answers, settings, documents, notes } = ctx.services;
  const store = createChatStore(ctx);
  const runner = createRunner(ctx, store);
  let ollamaAddresses: readonly string[] = OLLAMA_DEFAULT_ADDRESSES;
  if (ctx.config.ollamaAddresses.length > 0) {
    // Named by whoever started Outpost. One that cannot be read as an address stops the start, with the reason.
    ollamaAddresses = ctx.config.ollamaAddresses.map((address) => parseModelServerAddress(address).base);
  }

  // A server that stopped in the middle of a reply left it marked as being written.
  const abandoned = store.settleAbandoned();
  if (abandoned > 0) ctx.log.info({ replies: abandoned }, "replies that were being written when Outpost stopped were marked unfinished");

  ctx.services.chat = {
    store,
    runner,
    async eraseAll() {
      // A reply still being written would be stored into a conversation that is about to go.
      await runner.close();
      const removed = store.eraseAll();
      ctx.events.publish({ type: "chat.changed" });
      return removed;
    },
    setOllamaAddresses(addresses) {
      ollamaAddresses = addresses;
    },
  };
  // On the way down the model is stopped at once, so that the reply is stored as it stands and
  // every browser watching it is told; by the time the close hooks run it has usually finished.
  ctx.stopping.addEventListener("abort", () => void runner.close(), { once: true });
  ctx.onClose.push(() => runner.close());

  const changed = (id: string) => ctx.events.publish({ type: "chat.changed", id });

  function status(): ChatStatus {
    const { address, defaultModel, reason } = answers.server();
    return {
      enabled: settings.get("answers.enabled"),
      usable: reason === null,
      reason,
      defaultModel,
      server: address?.host ?? null,
      place: address?.place ?? null,
      writingIn: runner.current()?.conversationId ?? null,
    };
  }

  function detail(id: string): ChatConversationDetail {
    const row = store.row(id);
    const rows = store.rowsOf(id);
    const live = runner.of(id);
    const grounded = row.useLibrary || row.scopeKind !== null;
    // Which of these would go with the next question, were it asked now.
    const planned = planHistory(
      rows.filter((entry) => entry.state !== "writing").map(({ id: messageId, role, text }) => ({ id: messageId, role, text })),
      historyBudget(settings.get("answers.contextChars"), "", grounded),
    );
    return {
      conversation: toConversation(row),
      // The reply being written is sent as it stands now, not as it was last saved.
      messages: rows.map((entry) =>
        live?.messageId === entry.id ? { ...toMessage(entry, live.blocks), sources: live.sources } : toMessage(entry),
      ),
      sentFrom: planned.sentFrom,
    };
  }

  /** Starts the reply to the newest message of a conversation. Everything that can refuse does so before anything is written. */
  function reply(id: string, change: () => void): ChatConversationDetail {
    const row = store.row(id);
    if (runner.of(id)) throw conflict("A reply is being written in this conversation. Stop it, or wait for it to finish.", { busy: true });
    const server = answers.server();
    if (server.reason) throw conflict(server.reason, { setup: true });
    const model = row.model || server.defaultModel;
    if (!model) throw conflict("Choose which model this conversation uses first.", { noModel: true });
    const other = runner.current();
    if (other || answers.status().busy) {
      throw conflict(
        other
          ? "The model is writing a reply in another conversation. It writes one at a time; send this when that one has finished, or stop it."
          : "The model is writing an answer from the library at the moment. It writes one thing at a time; send this when that has finished.",
        { busy: true, conversationId: other?.conversationId ?? null },
      );
    }

    ctx.sqlite.transaction(change)();
    const rows = store.rowsOf(id);
    const question = rows.at(-1);
    if (question?.role !== "user") throw conflict("There is no message to reply to.");
    store.nameIfUnnamed(id, titleFrom(question.text));
    runner.start({
      conversationId: id,
      question: question.text,
      earlier: rows.slice(0, -1).map(({ id: messageId, role, text }) => ({ id: messageId, role, text })),
      model,
      useLibrary: row.useLibrary,
      scope: row.scopeKind && row.scopeEntityId ? { kind: row.scopeKind, entityId: row.scopeEntityId } : null,
      previousSearch:
        rows.findLast((entry) => entry.role === "assistant" && entry.searchedFor && (entry.sources?.length ?? 0) > 0)?.searchedFor ?? null,
    });
    changed(id);
    return detail(id);
  }

  const idParams = z.object({ id: z.string().regex(/^[0-9a-z]{1,40}$/) });

  /** Whether chat can be used. Read from settings alone: the model server is not contacted. */
  app.get("/api/chat/status", async () => status());

  /** The models the server reports, with sizes when the server is Ollama. Contacts the model server. */
  app.get("/api/chat/models", async (): Promise<ChatModelsResponse> => chatModels(answers.server(), answers.timeouts(), answers.guard));

  /**
   * "Look for Ollama on this computer": asks the address Ollama listens on by default,
   * once, because a person pressed the button. Saves nothing.
   */
  app.post(
    "/api/chat/look-for-ollama",
    async (): Promise<ChatLookResult> => lookForOllama(answers.timeouts(), answers.guard, ollamaAddresses),
  );

  /**
   * Setting up, step one: looks for a model server at the address in Settings and then
   * where Ollama listens, because a person pressed the button. Says which of its models
   * to start with. Saves nothing.
   */
  app.post(
    "/api/chat/setup/look",
    async (): Promise<ModelSetupLook> => lookForModelServer(settings.all(), answers.timeouts(), answers.guard, ollamaAddresses),
  );

  const tryBody = z.object({ address: z.string().trim().min(1).max(500), model: z.string().trim().min(1).max(200) });

  /**
   * Setting up, the last step: asks the chosen model at the address that was found for
   * one word. When it answers, the address and the model are saved and answers are
   * switched on; when it does not, nothing changes and the result says what failed.
   */
  app.post("/api/chat/setup/try", async (request): Promise<ModelSetupTry> => {
    const input = tryBody.parse(request.body);
    return tryModel(
      input,
      placesToLook(settings.get("answers.endpoint"), ollamaAddresses),
      answers.timeouts(),
      answers.guard,
      runner.current() !== undefined || answers.status().busy,
      (saved) => {
        settings.update(saved);
      },
    );
  });

  app.get("/api/chat/conversations", async (request) => {
    const query = z.object({ q: z.string().max(200).optional() }).parse(request.query);
    return { conversations: store.list(query.q, runner.current()?.conversationId ?? null) };
  });

  const createBody = z.object({
    title: z.string().trim().max(200).optional(),
    model: z.string().trim().max(200).optional(),
    useLibrary: z.boolean().optional(),
    /** "Ask about this": the one document or note the conversation is about. */
    about: z.object({ kind: z.enum(["document", "note"]), id: z.string().regex(/^[0-9A-Za-z]{1,40}$/) }).optional(),
  });

  app.post("/api/chat/conversations", async (request) => {
    const input = createBody.parse(request.body ?? {});
    let scope: Parameters<ChatStore["create"]>[0]["scope"];
    if (input.about) {
      // Looked up, so that a conversation is only ever about something that exists.
      const title = input.about.kind === "note" ? notes.get(input.about.id).title : documents.get(input.about.id).title;
      scope = { kind: input.about.kind, entityId: input.about.id, title: title || "Untitled" };
    }
    const conversation = store.create({
      title: input.title || (scope ? `About ${scope.title}`.slice(0, 200) : undefined),
      model: input.model,
      useLibrary: input.useLibrary,
      scope,
    });
    changed(conversation.id);
    return detail(conversation.id);
  });

  app.get("/api/chat/conversations/:id", async (request) => detail(idParams.parse(request.params).id));

  const patchBody = z
    .object({
      title: z.string().trim().min(1, "A conversation needs a name.").max(200).optional(),
      model: z.string().trim().max(200).optional(),
      useLibrary: z.boolean().optional(),
    })
    .strict();

  app.patch("/api/chat/conversations/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    store.update(id, patchBody.parse(request.body ?? {}));
    changed(id);
    return detail(id);
  });

  app.delete("/api/chat/conversations/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    store.row(id);
    // A reply being written into it is stopped first, so the model does not go on working for nobody.
    const live = runner.of(id);
    if (live) {
      live.stop();
      await live.finished;
    }
    store.remove(id);
    changed(id);
    return { ok: true };
  });

  const messageBody = z.object({
    text: z
      .string()
      .max(CHAT_MESSAGE_MAX, `A message can be up to ${CHAT_MESSAGE_MAX.toLocaleString("en-GB")} characters.`)
      .refine((value) => value.trim().length > 0, "Type a message first."),
    /** Edit and resend: the newest message from the person, and the reply to it, are replaced by this one. */
    replaceLast: z.boolean().optional(),
  });

  /**
   * Sends a message and starts the reply. Answers at once with the conversation as it
   * now stands; the reply is watched on the stream below. Refuses, changing nothing,
   * when no model server is set up, no model is chosen, or the model is busy.
   */
  app.post("/api/chat/conversations/:id/messages", async (request) => {
    const { id } = idParams.parse(request.params);
    const input = messageBody.parse(request.body);
    return reply(id, () => {
      if (input.replaceLast) {
        const last = store.rowsOf(id).findLast((entry) => entry.role === "user");
        if (last) store.removeFrom(id, last.seq);
      }
      store.addUserMessage(id, input.text.trim());
    });
  });

  /** Regenerate: the reply to the newest message is thrown away and written again. */
  app.post("/api/chat/conversations/:id/regenerate", async (request) => {
    const { id } = idParams.parse(request.params);
    return reply(id, () => {
      const rows = store.rowsOf(id);
      const last = rows.findLast((entry) => entry.role === "user");
      if (!last) throw conflict("There is no message to reply to.");
      store.removeFrom(id, last.seq + 1);
    });
  });

  /** Stop: closes the connection to the model server, and answers once the reply is stored as it stands. */
  app.post("/api/chat/conversations/:id/stop", async (request) => {
    const { id } = idParams.parse(request.params);
    store.row(id);
    const live = runner.of(id);
    if (live) {
      live.stop();
      await live.finished;
    }
    return detail(id);
  });

  /**
   * The reply being written in a conversation, as it grows (see `ChatStreamEvent`).
   * Any number of browsers can watch; leaving does not stop the model. A `GET`, and it
   * changes nothing.
   */
  app.get("/api/chat/conversations/:id/stream", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    store.row(id);
    const raw = reply.raw;
    reply.hijack();
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Tells a reverse proxy in front of Outpost not to hold the reply back until it is whole.
      "X-Accel-Buffering": "no",
    });
    const send = (event: ChatStreamEvent) => {
      if (raw.destroyed || raw.writableEnded) return;
      const { type, ...data } = event;
      raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const live = runner.of(id);
    if (!live) {
      send({ type: "idle" });
      raw.end();
      return reply;
    }
    send({
      type: "start",
      messageId: live.messageId,
      phase: live.phase,
      model: live.model,
      grounded: live.grounded,
      sources: live.sources,
      searchedFor: live.searchedFor,
      omitted: live.omitted,
      startedAt: live.startedAt,
    });
    if (live.blocks.length > 0) send({ type: "blocks", from: 0, blocks: live.blocks });

    // A small machine can read the prompt for a minute before writing a word; keep the connection visibly alive.
    const heartbeat = setInterval(() => {
      if (!raw.destroyed && !raw.writableEnded) raw.write(": the model is working\n\n");
    }, 15_000);
    heartbeat.unref();
    const listener = (event: ChatStreamEvent) => {
      send(event);
      if (event.type === "done") leave();
    };
    const leave = () => {
      clearInterval(heartbeat);
      live.listeners.delete(listener);
      raw.off("close", leave);
      if (!raw.writableEnded) raw.end();
    };
    live.listeners.add(listener);
    raw.on("close", leave);
    return reply;
  });

  /**
   * Saves a reply as a new page of notes. Never into a page that exists. The page says
   * what wrote it; the reply's own links and pictures become plain words (see note.ts).
   */
  app.post("/api/chat/messages/:id/note", async (request) => {
    const { id } = idParams.parse(request.params);
    const message = store.message(id);
    if (message.role !== "assistant" || !message.text.trim())
      throw new AppError("bad_request", "Only a reply with words in it can be saved as a note.");
    if (message.state === "writing") throw conflict("This reply is still being written. Save it when it has finished.");
    const conversation = store.row(message.conversationId);
    const question = store
      .rowsOf(message.conversationId)
      .filter((entry) => entry.seq < message.seq && entry.role === "user")
      .at(-1);
    const note = notes.create({
      title: (conversation.title || titleFrom(question?.text ?? "")).slice(0, 200),
      content: replyAsNote({
        // As shown: a marker to a number no passage carried does not go into a note.
        reply: shownReply(message).text,
        question: question?.text ?? "",
        model: message.model,
        writtenAt: message.createdAt,
        sources: toMessage(message).sources,
        unfinished: message.state !== "complete",
      }),
    });
    return { noteId: note.id, title: note.title };
  });
}
