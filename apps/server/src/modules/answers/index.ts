/**
 * "Answer from my library": the last step of the retrieval pipeline.
 *
 *   question ─▶ retriever ─▶ context assembler ─▶ model on the person's own machine ─▶ answer
 *
 * One question in, one answer out, written from numbered passages of the person's own
 * documents, notes and book chapters, with a citation after each statement. There is
 * no conversation, no memory, no tool the model can call, and nothing is kept: the
 * question, the passages and the answer exist only for the length of the request, and
 * none of them is written to the database or the log.
 *
 * What leaves Outpost: the standing instructions, the passages that were found and the
 * question, sent to the one address in the `answers.endpoint` setting (see address.ts).
 * Nothing is sent until a person asks for an answer, and nothing is sent at all when
 * no passage was found.
 *
 * A model on a home machine writes one answer at a time, so this does too: a second
 * request while one is being written is refused, not queued.
 */
import type { AnswerEvent, AnswerModelsResponse, AnswerSource, AnswersStatus, AnswerTestResult } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, messageOf } from "../../core/errors.ts";
import { checkCitations, isSafetyCritical } from "../retrieval/index.ts";
import { buildAnswerPrompt } from "../retrieval/prompt.ts";
import { assertOwnNetwork, type ModelServerAddress, parseModelServerAddress, placeRefusal } from "./address.ts";
import { contextTokensFor } from "./fit.ts";
import {
  type ChatModelProvider,
  DEFAULT_TIMEOUTS,
  ModelServerError,
  type ModelTimeouts,
  openAiChatProvider,
  withoutThinking,
} from "./provider.ts";

/**
 * Most passages handed to the model for one question. Eight were handed over at first;
 * with five, chosen passage by passage, both small models that were tried answered more
 * questions rightly and the smaller one made up fewer answers (docs/ai.md, "Measured
 * with a real model").
 */
export const ANSWER_PASSAGES = 5;
/** The longest answer asked for, in tokens (about 750 words). A model that reaches it is reported as cut short. */
export const ANSWER_MAX_TOKENS = 1024;
/**
 * The longest answer accepted, in characters, whatever the server does with the limit
 * above: several times what 1,024 tokens come to. Past it the model is stopped and the
 * answer is reported as cut short.
 */
export const ANSWER_MAX_CHARS = 24_000;

/**
 * Words that say a sentence is a question without saying what it is about. Search
 * treats every word as something a passage must contain, so "how long should I boil
 * water" finds nothing with all seven words and falls back to passages with any of
 * them, including ones that merely contain "I" or "how". Searching for "long boil
 * water" finds the passages that are about the subject. English only: a question in
 * another language is searched for as typed.
 */
const SMALL_WORDS = new Set(
  "a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our shall should so than that the their them then there these they this those to us was we were what when where which who whom whose why will with would you your about tell explain please".split(
    " ",
  ),
);

/** The words of a question that say what it is about. The same text back when nothing can be dropped. */
export function subjectOf(question: string): string {
  // Quoted phrases and excluded words are search syntax the person meant; leave such a question alone.
  if (/["“”]/.test(question) || /(^|\s)-\S/.test(question)) return question;
  // "How long", "how many": the second word asks for an amount, it does not name the subject.
  const words = question
    .replace(/\bhow\s+(long|much|many|often|far|big|old)\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words
    .filter((word) => !SMALL_WORDS.has(word.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, "")))
    // "The generator's oil" is about the generator: the index holds no word "generator's".
    .map((word) => word.replace(/(\p{L})['’]s(?=$|[^\p{L}])/giu, "$1"));
  const subject = kept.join(" ").replace(/[?!.,;:]+$/g, "");
  return subject && subject !== question ? subject : question;
}

/**
 * True for a message made only of words that name no subject: "Why?", "And then?",
 * "Can you explain that?". Searching the library for such a message finds nothing of
 * its own, because there is nothing in it to search for.
 */
export function namesNoSubject(question: string): boolean {
  const words = question.split(/\s+/).map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, ""));
  return words.filter(Boolean).every((word) => SMALL_WORDS.has(word) || FOLLOW_UP_WORDS.has(word));
}

/** Words of a follow-up that point back at what was said, in addition to the small words above. */
const FOLLOW_UP_WORDS = new Set(
  "again also else more now ok okay really say said sure then too yes no not go on continue it's that's mean".split(" "),
);

export interface AnswersService {
  status(): AnswersStatus;
  /** The model answers would be written by, when one is set up. */
  provider(): ChatModelProvider | undefined;
  /**
   * The model server as chat uses it: the same address under the same rule, whether or
   * not a model has been chosen in Settings. `reason` says why it may not be used.
   */
  server(): { address?: ModelServerAddress; defaultModel: string; reason: string | null };
  /** Another model on the same server, behind the same guard. Undefined when the server may not be used. */
  providerFor(model: string): ChatModelProvider | undefined;
  /** Checks an address the way every request to the model server is checked. Throws when it may not be contacted. */
  guard(address: ModelServerAddress): Promise<void>;
  timeouts(): ModelTimeouts;
  /**
   * Takes the model's one turn: a model on a home machine writes one thing at a time,
   * whether that is an answer or a reply in a conversation. Returns how to give the turn
   * back, or undefined when something is being written already.
   */
  takeTurn(controller: AbortController): (() => void) | undefined;
  /** Test seam: shorter waits than a real model needs. */
  setTimeouts(timeouts: Partial<ModelTimeouts>): void;
}

declare module "../../core/context.ts" {
  interface Services {
    answers: AnswersService;
  }
}

export async function registerAnswers(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { settings, retrieval } = ctx.services;
  let timeouts: ModelTimeouts = DEFAULT_TIMEOUTS;
  let cached: { key: string; provider: ChatModelProvider } | undefined;
  /** The answer being written now, if there is one. Set and cleared synchronously, so two requests cannot both take it. */
  let writing: AbortController | undefined;

  const guardFor = (address: ModelServerAddress) => () => assertOwnNetwork(address, ctx.config.allowRemoteModelServer);

  /** The server alone: switched on, with an address that may be used. */
  function server(): { address?: ModelServerAddress; defaultModel: string; reason: string | null } {
    const all = settings.all();
    const defaultModel = all["answers.model"].trim();
    if (!all["answers.enabled"])
      return { defaultModel, reason: "Answers are turned off. Turn them on in Settings and say where your model runs." };
    let address: ModelServerAddress;
    try {
      address = parseModelServerAddress(all["answers.endpoint"]);
    } catch (error) {
      return { defaultModel, reason: messageOf(error) };
    }
    return { address, defaultModel, reason: placeRefusal(address, ctx.config.allowRemoteModelServer) };
  }

  function configured(): { address?: ModelServerAddress; model: string; reason: string | null } {
    const { address, defaultModel: model, reason } = server();
    if (reason || !address) return { address, model, reason };
    if (!model) return { address, model, reason: "Choose which model writes the answers, in Settings." };
    return { address, model, reason: null };
  }

  function currentProvider(): ChatModelProvider | undefined {
    const { address, model, reason } = configured();
    if (!address || reason) return undefined;
    const key = `${address.base}|${model}`;
    if (cached?.key !== key) {
      cached = { key, provider: openAiChatProvider(address, model, timeouts, guardFor(address)) };
      // The declared registry of model providers holds the one that is set up.
      retrieval.models.clear();
      retrieval.models.set(cached.provider.id, cached.provider);
    }
    return cached.provider;
  }

  function status(): AnswersStatus {
    const all = settings.all();
    const { address, model, reason } = configured();
    return {
      enabled: all["answers.enabled"],
      ready: reason === null,
      reason,
      model,
      server: address?.host ?? null,
      place: address?.place ?? null,
      busy: writing !== undefined,
    };
  }

  ctx.services.answers = {
    status,
    provider: currentProvider,
    server,
    providerFor(model) {
      const { address, reason } = server();
      return address && !reason ? openAiChatProvider(address, model, timeouts, guardFor(address)) : undefined;
    },
    guard: (address) => guardFor(address)(),
    timeouts: () => timeouts,
    takeTurn(controller) {
      if (writing) return undefined;
      writing = controller;
      return () => {
        if (writing === controller) writing = undefined;
      };
    },
    setTimeouts(next) {
      timeouts = { ...timeouts, ...next };
      cached = undefined;
    },
  };
  settings.onChange(() => {
    if (!currentProvider()) {
      cached = undefined;
      retrieval.models.clear();
    }
  });
  // The answer being written is the request the server would otherwise wait for.
  ctx.stopping.addEventListener("abort", () => writing?.abort(), { once: true });

  /** Whether answers are set up. Read from settings alone: the model server is not contacted. */
  app.get("/api/answers/status", async () => status());

  /**
   * The models the server at the configured address reports, for choosing one in
   * Settings. Works before a model is chosen, and contacts the server only while
   * answers are switched on.
   */
  app.get("/api/answers/models", async (): Promise<AnswerModelsResponse> => {
    const all = settings.all();
    if (!all["answers.enabled"]) return { models: [], message: "Answers are turned off." };
    try {
      const address = parseModelServerAddress(all["answers.endpoint"]);
      return {
        models: await openAiChatProvider(address, all["answers.model"].trim(), timeouts, guardFor(address)).listModels(),
        message: null,
      };
    } catch (error) {
      if (error instanceof AppError) return { models: [], message: error.message };
      throw error;
    }
  });

  /** Asks the configured model for one word and says exactly what failed, if anything did. */
  app.post("/api/answers/test", async (): Promise<AnswerTestResult> => {
    const { address, model, reason } = configured();
    if (!address) return { ok: false, failure: "address", message: reason ?? "No address is set.", models: [], reply: null, tookMs: 0 };
    // An address that may not be contacted is an answer in itself; nothing is sent to find out more.
    try {
      await guardFor(address)();
    } catch (error) {
      return { ok: false, failure: "address", message: messageOf(error), models: [], reply: null, tookMs: 0 };
    }
    if (!model) {
      // No model yet: the useful answer is whether the server is there and what it has.
      const probe = openAiChatProvider(address, "", timeouts, guardFor(address));
      try {
        const models = await probe.listModels();
        return {
          ok: false,
          failure: "no-such-model",
          message:
            models.length > 0
              ? `The model server at ${address.host} is running. Now choose one of its models.`
              : `The model server at ${address.host} is running but reports no models. Fetch one with your model server's own tool.`,
          models,
          reply: null,
          tookMs: 0,
        };
      } catch (error) {
        if (error instanceof ModelServerError) {
          return {
            ok: false,
            failure: error.failure === "unreachable" ? "unreachable" : "not-a-model-server",
            message: error.message,
            models: [],
            reply: null,
            tookMs: 0,
          };
        }
        throw error;
      }
    }
    if (writing) {
      return {
        ok: false,
        failure: "other",
        message: "The model is writing an answer at the moment. Test it again when that has finished.",
        models: [],
        reply: null,
        tookMs: 0,
      };
    }
    return openAiChatProvider(address, model, timeouts, guardFor(address)).test();
  });

  const body = z.object({
    question: z.string().trim().min(1, "Type a question first.").max(1000),
    mode: z.enum(["keyword", "semantic", "hybrid"]).optional(),
  });

  /**
   * Writes an answer and sends it as it is written, as server-sent events (see
   * `AnswerEvent`). Problems found before anything is sent are ordinary JSON errors;
   * problems after that arrive as an `error` event, because the status line has gone.
   */
  app.post("/api/answers", async (request, reply) => {
    const input = body.parse(request.body);
    const provider = currentProvider();
    if (!provider) throw new AppError("conflict", configured().reason ?? "Answers are not set up.");
    if (writing) {
      throw new AppError(
        "conflict",
        "Outpost is already writing an answer, here or on another device. A model on a home machine writes one at a time; ask again when that one has finished.",
        { busy: true },
      );
    }
    const controller = new AbortController();
    writing = controller;
    const started = performance.now();
    const all = settings.all();
    const raw = reply.raw;
    let sentHeaders = false;
    let heartbeat: NodeJS.Timeout | undefined;

    const send = (event: AnswerEvent) => {
      if (raw.destroyed || raw.writableEnded) return;
      const { type, ...data } = event;
      raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // The person pressed Stop, closed the tab or lost the network: stop the model too.
    const gone = () => {
      if (!raw.writableFinished) controller.abort();
    };
    raw.on("close", gone);
    /** The person left before anything was sent: there is no reply to make. */
    const abandon = () => {
      if (!sentHeaders) {
        reply.hijack();
        raw.destroy();
      }
      return reply;
    };

    try {
      // The library is searched for what the question is about. If that finds nothing, nothing was
      // found: falling back to the small words would only turn up passages that happen to contain "what".
      const searchedFor = subjectOf(input.question);
      const passages = await retrieval.retriever.retrieve({
        query: searchedFor,
        limit: ANSWER_PASSAGES,
        mode: input.mode,
        signal: controller.signal,
      });
      const context = retrieval.assembler.assemble(input.question, passages, {
        maxChars: all["answers.contextChars"],
        maxPassages: ANSWER_PASSAGES,
      });
      if (controller.signal.aborted) return abandon();

      reply.hijack();
      raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        // Tells a reverse proxy in front of Outpost not to hold the answer back until it is whole.
        "X-Accel-Buffering": "no",
      });
      sentHeaders = true;
      const sources: AnswerSource[] = context.citations.map(({ marker, kind, entityId, title, collection, url, page, heading, quote }) => ({
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
      send({
        type: "sources",
        question: input.question,
        searchedFor,
        model: provider.model,
        server: provider.address.host,
        sources,
        omitted: context.omitted,
        safetyCritical: context.safetyCritical,
      });

      // Nothing was found, so there is nothing to answer from. The model is not asked.
      if (sources.length === 0) {
        send({
          type: "done",
          outcome: "nothing-found",
          used: [],
          unsupported: [],
          cutShort: false,
          tookMs: Math.round(performance.now() - started),
        });
        return reply;
      }

      // A small machine can read the prompt for a minute before writing a word; keep the connection visibly alive.
      heartbeat = setInterval(() => {
        if (!raw.destroyed && !raw.writableEnded) raw.write(": waiting for the model\n\n");
      }, 15_000);
      heartbeat.unref();

      const prompt = buildAnswerPrompt(context);
      let text = "";
      let finishReason: string | null = null;
      const pieces = provider.generate({
        system: prompt.system,
        prompt: prompt.user,
        temperature: all["answers.temperature"],
        maxTokens: ANSWER_MAX_TOKENS,
        contextTokens: contextTokensFor(all["answers.contextChars"], ANSWER_MAX_TOKENS),
        signal: controller.signal,
        onFinish: (info) => {
          finishReason = info.finishReason;
        },
      });
      for await (const piece of withoutThinking(pieces)) {
        text += piece;
        send({ type: "delta", text: piece });
        if (text.length > ANSWER_MAX_CHARS) {
          // Leaving the loop closes the connection to the model, which stops it.
          finishReason = "length";
          break;
        }
      }
      if (!text.trim()) {
        throw new ModelServerError(
          "empty",
          finishReason === "length"
            ? "The model used up its whole allowance without writing an answer. Models that think before answering can do this; try another model."
            : "The model sent back no words. Try asking again, or try another model.",
        );
      }
      const marks = checkCitations(text, context.citations);
      send({
        type: "done",
        outcome: "answered",
        used: marks.used,
        unsupported: marks.unsupported,
        cutShort: finishReason === "length",
        tookMs: Math.round(performance.now() - started),
      });
      return reply;
    } catch (error) {
      // Stopped by the person: there is nobody to tell.
      if (controller.signal.aborted) return abandon();
      if (!sentHeaders) throw error;
      if (error instanceof ModelServerError) {
        // The kind of failure only: never the question, the passages or the answer.
        request.log.warn({ failure: error.failure }, "the model server did not finish an answer");
        send({ type: "error", failure: error.failure, message: error.message });
      } else {
        request.log.error({ err: error }, "writing an answer failed");
        send({
          type: "error",
          failure: "other",
          message: "Something went wrong on the server while the answer was being written. The log has the details.",
        });
      }
      return reply;
    } finally {
      clearInterval(heartbeat);
      raw.off("close", gone);
      if (writing === controller) writing = undefined;
      // Whatever happened, the model is told to stop: this closes the connection to it.
      controller.abort();
      if (sentHeaders && !raw.writableEnded) raw.end();
    }
  });
}
