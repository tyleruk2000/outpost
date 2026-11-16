/**
 * A language model on the person's own machine or network, reached over the
 * OpenAI-compatible chat API that Ollama, llama.cpp's server and LM Studio all serve.
 *
 * Outpost bundles no model and downloads none. This file only knows how to talk to a
 * server the person has set up: it sends one request to `<address>/chat/completions`
 * and reads the answer as it is written. The request uses the fields all three servers
 * document (`model`, `messages`, `stream`, `temperature`, `max_tokens`) and nothing
 * else. See docs/ai.md for what was checked against which server's documentation.
 *
 * Ollama is asked in its own way when the server turns out to be one (`/api/chat`
 * beside the `/v1` address), for one reason: its OpenAI-compatible endpoint has no way
 * to say how much the model should read at once, and cuts a prompt that is too long
 * without saying so. Its own endpoint can be told the context size, can be told to
 * refuse a prompt that does not fit, and says how many tokens the prompt came to.
 *
 * Everything a server can do wrong is turned into a sentence a person can act on:
 * nothing listening, no such model, a model that cannot write text, an address with no
 * chat endpoint, a prompt too long for the model, a model too slow to wait for, and a
 * server that stops part-way through.
 */
import type { AnswerFailure, AnswerTestFailure, AnswerTestResult } from "@outpost/shared";
import { AppError } from "../../core/errors.ts";
import type { GenerationRequest, ModelProvider } from "../retrieval/types.ts";
import type { ModelServerAddress } from "./address.ts";

export interface ModelTimeouts {
  /** How long to wait for the first sign of life. A small machine reads the whole prompt before it writes a word. */
  firstTokenMs: number;
  /** How long a silence is allowed once the model has started. */
  idleMs: number;
  /** The longest one answer may take from start to finish. */
  totalMs: number;
  /** How long the model list and the test request may take. */
  probeMs: number;
}

export const DEFAULT_TIMEOUTS: ModelTimeouts = { firstTokenMs: 180_000, idleMs: 60_000, totalMs: 600_000, probeMs: 60_000 };

/** A failure of the model server, with the kind of failure kept so the interface can say what to do. */
export class ModelServerError extends AppError {
  readonly failure: AnswerFailure;
  /** For a prompt that was too long, when the server gave the figures: what it came to and what fits. */
  readonly sizes: { promptTokens: number; contextTokens: number } | null;

  constructor(failure: AnswerFailure, message: string, sizes: { promptTokens: number; contextTokens: number } | null = null) {
    super(failure === "context-too-long" ? "too_large" : "upstream", message);
    this.name = "ModelServerError";
    this.failure = failure;
    this.sizes = sizes;
  }
}

/**
 * Which servers have said they are Ollama, by the address that was asked. Remembered for
 * a few minutes so that every answer does not ask again; a server that did not answer at
 * all is not remembered, since it may only have been starting.
 */
const knownServers = new Map<string, { ollama: boolean; at: number }>();
const KNOWN_FOR_MS = 5 * 60_000;

/** Test seam: forget which servers are Ollama. */
export function forgetModelServers(): void {
  knownServers.clear();
}

export interface ChatModelProvider extends ModelProvider {
  readonly model: string;
  readonly address: ModelServerAddress;
  /** The model names the server reports. Throws a `ModelServerError` when it cannot be asked. */
  listModels(signal?: AbortSignal): Promise<string[]>;
  /** Asks the model for one word, and says exactly what failed if anything did. Never throws. */
  test(signal?: AbortSignal): Promise<AnswerTestResult>;
}

const minutes = (ms: number) => {
  const value = Math.round(ms / 60_000);
  return value >= 1 ? `${value} minute${value === 1 ? "" : "s"}` : `${Math.round(ms / 1000)} seconds`;
};

/** What a server said went wrong, read from either of the two error shapes in use. */
function readErrorBody(text: string): { message: string; type: string | null; promptTokens: number | null; contextTokens: number | null } {
  try {
    const body = JSON.parse(text) as { error?: unknown };
    const error = body.error;
    if (typeof error === "string") return { message: error, type: null, promptTokens: null, contextTokens: null };
    if (error && typeof error === "object") {
      const fields = error as { message?: unknown; type?: unknown; n_prompt_tokens?: unknown; n_ctx?: unknown };
      return {
        message: typeof fields.message === "string" ? fields.message : "",
        type: typeof fields.type === "string" ? fields.type : null,
        promptTokens: typeof fields.n_prompt_tokens === "number" ? fields.n_prompt_tokens : null,
        contextTokens: typeof fields.n_ctx === "number" ? fields.n_ctx : null,
      };
    }
  } catch {
    // Not JSON: a proxy's error page, or a server that is not a model server.
  }
  return { message: "", type: null, promptTokens: null, contextTokens: null };
}

/** The most that is read of anything a model server sends that is not the answer itself: an error, a list, a test reply. */
const MOST_BYTES = 256 * 1024;
/** The longest single line accepted in the answer stream. A real server's are a few hundred bytes. */
const LONGEST_LINE = 64 * 1024;

/**
 * A reply's text, up to a limit. Outpost trusts the model server it was pointed at,
 * but an address can be wrong, and whatever is there should not be able to fill memory.
 */
async function readLimited(response: Response, most = MOST_BYTES): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      read += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (read >= most) break;
    }
  } catch {
    // Whatever arrived before the connection failed is all there is.
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

/** Text from a server, made safe to put in a sentence: one line, no markup, not too long. */
const quoteServer = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

export function openAiChatProvider(
  address: ModelServerAddress,
  model: string,
  timeouts: ModelTimeouts = DEFAULT_TIMEOUTS,
  /** Run before every request; throws when the address may not be contacted. */
  guard: () => Promise<void> = async () => {},
): ChatModelProvider {
  const { base, host } = address;
  const chatUrl = `${base}/chat/completions`;
  // The one way out of this module to the network.
  const fetch: typeof globalThis.fetch = async (input, init) => {
    await guard();
    return globalThis.fetch(input, init);
  };

  const unreachable = () =>
    new ModelServerError(
      "unreachable",
      `No model server answered at ${host}. Check that it is running${address.place === "this-computer" ? " on this computer" : ""} and that the address in Settings is right.`,
    );

  /** Turns an error answer from the server into the failure it means. */
  function failureOf(status: number, text: string): ModelServerError {
    const { message, type, promptTokens, contextTokens } = readErrorBody(text);
    if (
      type === "exceed_context_size_error" ||
      (status === 400 && /context (size|length|window)|too many tokens|maximum context/i.test(message))
    ) {
      // llama-server gives the two figures as fields; Ollama gives them in its sentence:
      // "request (13739 tokens) exceeds the available context size (4096 tokens)".
      const said = /\((\d+) tokens\)[^(]*\((\d+) tokens\)/.exec(message);
      const figures =
        promptTokens !== null && contextTokens !== null
          ? { promptTokens, contextTokens }
          : said
            ? { promptTokens: Number(said[1]), contextTokens: Number(said[2]) }
            : null;
      const sizes = figures
        ? ` They came to ${figures.promptTokens} tokens and the model is set up to read ${figures.contextTokens} at once.`
        : "";
      return new ModelServerError(
        "context-too-long",
        `The passages and the question were too long for the model.${sizes} Lower the context budget in Settings, or start the model with a larger context.`,
        figures,
      );
    }
    if (status === 404 && /model\b.*\bnot found|no such model|model .*does not exist/i.test(message)) {
      return new ModelServerError(
        "no-such-model",
        `The model server at ${host} has no model called "${model}". Check the name in Settings, or fetch the model with your model server's own tool.`,
      );
    }
    if (type === "not_supported_error" || /does not support (chat|generate|completion)/i.test(message)) {
      return new ModelServerError(
        "not-a-chat-model",
        `"${model}" cannot write text. It is probably an embedding model, which turns text into numbers for search. Choose a chat model in Settings.`,
      );
    }
    if (status === 404 || status === 405) {
      return new ModelServerError(
        "no-chat-endpoint",
        `The server at ${host} has no chat endpoint: ${chatUrl} answered ${status}. Check the address in Settings; for Ollama, llama.cpp and LM Studio it ends in /v1.`,
      );
    }
    if (status === 503 && /loading/i.test(message)) {
      return new ModelServerError("other", "The model server is still loading its model. Try again in a moment.");
    }
    const said = quoteServer(message || text);
    return new ModelServerError("other", `The model server answered with an error (${status})${said ? `: ${said}` : "."}`);
  }

  // Ollama's own endpoints sit beside the OpenAI-compatible ones: http://host:11434/v1 and http://host:11434/api/…
  const ollamaRoot = base.endsWith("/v1") ? base.slice(0, -"/v1".length) : null;

  /** A small question to the server about itself. Undefined when it did not answer in the way asked. */
  async function ask(url: string, signal: AbortSignal): Promise<unknown> {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]),
        redirect: "error",
      });
      const text = await readLimited(response);
      return response.ok ? (JSON.parse(text) as unknown) : null;
    } catch (error) {
      // Refused before anything was sent: that is for the request itself to report.
      if (error instanceof AppError) throw error;
      return undefined;
    }
  }

  /** Whether the server is Ollama: it says its version at `/api/version`. */
  async function isOllama(signal: AbortSignal): Promise<boolean> {
    if (!ollamaRoot) return false;
    const known = knownServers.get(ollamaRoot);
    if (known && Date.now() - known.at < KNOWN_FOR_MS) return known.ollama;
    const answer = await ask(`${ollamaRoot}/api/version`, signal);
    // No answer at all: not remembered. The request that follows will say the server is not there.
    if (answer === undefined) return false;
    const ollama = Boolean(answer && typeof (answer as { version?: unknown }).version === "string");
    knownServers.set(ollamaRoot, { ollama, at: Date.now() });
    return ollama;
  }

  /**
   * Whether Ollama will have to load the model before it can read anything: it is not
   * among the models `/api/ps` lists, or is there for another context size, which Ollama
   * loads afresh. False whenever that cannot be told (no answer, or an answer of another
   * shape), so that nothing untrue is said.
   */
  async function needsLoading(contextTokens: number | undefined, signal: AbortSignal): Promise<boolean> {
    const answer = (await ask(`${ollamaRoot}/api/ps`, signal)) as { models?: unknown } | null | undefined;
    if (!answer || !Array.isArray(answer.models)) return false;
    const names = new Set([model, model.includes(":") ? model : `${model}:latest`]);
    const present = (answer.models as Array<{ name?: unknown; model?: unknown; context_length?: unknown } | null>).some(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        (names.has(String(entry.name)) || names.has(String(entry.model))) &&
        (contextTokens === undefined || typeof entry.context_length !== "number" || entry.context_length === contextTokens),
    );
    return !present;
  }

  async function* generate(request: GenerationRequest): AsyncGenerator<string> {
    const outer = request.signal;
    outer?.throwIfAborted();
    const controller = new AbortController();
    const stopFromOutside = () => controller.abort(outer?.reason);
    outer?.addEventListener("abort", stopFromOutside, { once: true });

    // One timer for silence (long before the first sign of life, shorter after it),
    // and one for the whole answer.
    let gaveUp: "first" | "idle" | "total" | null = null;
    let silence: NodeJS.Timeout | undefined;
    const waitFor = (ms: number, why: "first" | "idle") => {
      clearTimeout(silence);
      silence = setTimeout(() => {
        gaveUp = why;
        controller.abort();
      }, ms);
    };
    const whole = setTimeout(() => {
      gaveUp = "total";
      controller.abort();
    }, timeouts.totalMs);
    waitFor(timeouts.firstTokenMs, "first");

    const tooSlow = () =>
      new ModelServerError(
        "too-slow",
        gaveUp === "first"
          ? `The model had not started writing after ${minutes(timeouts.firstTokenMs)}, so Outpost stopped waiting. A smaller model, or a smaller context budget in Settings, will answer sooner.`
          : gaveUp === "idle"
            ? `The model went quiet for ${minutes(timeouts.idleMs)} part-way through, so Outpost stopped waiting.`
            : `The answer was still being written after ${minutes(timeouts.totalMs)}, so Outpost stopped it.`,
      );
    const notAModelServer = () =>
      new ModelServerError(
        "other",
        `Something answered at ${host}, but not in the way a model server does. Check the address in Settings.`,
      );

    // One question, or a conversation: the turns that came before go between the instructions and the newest message.
    const messages = [
      { role: "system", content: request.system },
      ...(request.history ?? []).map(({ role, content }) => ({ role, content })),
      { role: "user", content: request.prompt },
    ];
    const temperature = request.temperature ?? 0.2;
    const maxTokens = request.maxTokens ?? 1024;

    /** Sends the request, and turns a refusal to connect or an error answer into the failure it means. */
    const post = async (url: string, accept: string, body: unknown): Promise<Response> => {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept },
          body: JSON.stringify(body),
          signal: controller.signal,
          // The question goes to the server that was named, and to no other.
          redirect: "error",
        });
      } catch (error) {
        // Refused before anything was sent: say why, not that the server did not answer.
        if (error instanceof AppError && !(error instanceof ModelServerError)) throw error;
        if (outer?.aborted) throw error;
        if (gaveUp) throw tooSlow();
        throw unreachable();
      }
      if (!response.ok) throw failureOf(response.status, await readLimited(response));
      if (!response.body) throw new ModelServerError("other", "The model server sent an empty reply.");
      return response;
    };

    /** The lines of a reply as they arrive. Ends when the server closes the stream. */
    async function* linesOf(response: Response): AsyncGenerator<string> {
      const decoder = new TextDecoder();
      let rest = "";
      const reader = response.body!.getReader();
      try {
        for (;;) {
          let chunk: { done: boolean; value?: Uint8Array };
          try {
            chunk = await reader.read();
          } catch (error) {
            if (outer?.aborted) throw error;
            if (gaveUp) throw tooSlow();
            throw new ModelServerError("interrupted", "The model server stopped part-way through the answer.");
          }
          if (chunk.done) break;
          rest += decoder.decode(chunk.value, { stream: true });
          if (rest.length > LONGEST_LINE && !rest.includes("\n")) throw notAModelServer();
          let newline = rest.indexOf("\n");
          while (newline !== -1) {
            const line = rest.slice(0, newline).replace(/\r$/, "");
            rest = rest.slice(newline + 1);
            newline = rest.indexOf("\n");
            yield line;
          }
        }
        if (rest.trim()) yield rest;
      } finally {
        reader.cancel().catch(() => {});
      }
    }

    /** Ollama's own way: one JSON object to a line, the last one saying why it ended and what the prompt came to. */
    async function* viaOllama(): AsyncGenerator<string> {
      if (request.onLoading && (await needsLoading(request.contextTokens, controller.signal))) request.onLoading();
      const response = await post(`${ollamaRoot}/api/chat`, "application/x-ndjson", {
        model,
        messages,
        stream: true,
        // A prompt that does not fit is refused, not cut down behind Outpost's back; and a reply that runs
        // out of room stops there, where Ollama would otherwise make room by dropping the start of the prompt.
        truncate: false,
        shift: false,
        options: {
          temperature,
          num_predict: maxTokens,
          ...(request.contextTokens ? { num_ctx: request.contextTokens } : {}),
        },
      });
      let ended = false;
      for await (const line of linesOf(response)) {
        if (!line.trim()) continue;
        let event: {
          error?: unknown;
          message?: { content?: unknown };
          done?: unknown;
          done_reason?: unknown;
          prompt_eval_count?: unknown;
        };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.error) throw failureOf(500, JSON.stringify({ error: event.error }));
        // Any line is a sign of life, including a model's private reasoning (`message.thinking`), which is not shown.
        waitFor(timeouts.idleMs, "idle");
        const content = event.message?.content;
        if (typeof content === "string" && content) yield content;
        if (event.done === true) {
          ended = true;
          request.onFinish?.({
            finishReason: typeof event.done_reason === "string" ? event.done_reason : null,
            promptTokens: typeof event.prompt_eval_count === "number" ? event.prompt_eval_count : null,
          });
          break;
        }
      }
      if (!ended) throw new ModelServerError("interrupted", "The model server stopped part-way through the answer.");
    }

    /** The way every supported server speaks: server-sent events, ended by a finish reason and `[DONE]`. */
    async function* viaOpenAi(): AsyncGenerator<string> {
      const response = await post(chatUrl, "text/event-stream", {
        model,
        messages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
      });
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/event-stream")) {
        // A server that ignores `stream` answers in one piece. Anything else is not a model server.
        const text = await readLimited(response);
        let entire: string | undefined;
        try {
          const body = JSON.parse(text) as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> };
          const content = body.choices?.[0]?.message?.content;
          if (typeof content === "string") {
            entire = content;
            request.onFinish?.({
              finishReason: typeof body.choices?.[0]?.finish_reason === "string" ? body.choices[0].finish_reason : null,
            });
          }
        } catch {
          // Falls through to the error below.
        }
        if (entire === undefined) throw notAModelServer();
        if (entire) yield entire;
        return;
      }

      let finishReason: string | null = null;
      let sawDone = false;
      for await (const line of linesOf(response)) {
        // Blank lines end an event; lines starting with a colon are keep-alive comments.
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          sawDone = true;
          break;
        }
        let event: {
          error?: unknown;
          choices?: Array<{ delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown }; finish_reason?: unknown }>;
        };
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        // llama.cpp reports a failure in mid-stream as one `data: {"error": …}` line and then closes.
        if (event.error) throw failureOf(500, JSON.stringify({ error: event.error }));
        // Any event is a sign of life, including a model's private reasoning, which is not shown.
        waitFor(timeouts.idleMs, "idle");
        const choice = event.choices?.[0];
        if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
        const content = choice?.delta?.content;
        if (typeof content === "string" && content) yield content;
      }
      // Both a finish reason and the [DONE] line mean the model ended the answer itself.
      // A stream that simply closes means the server gave up; Ollama loses the reason.
      if (!sawDone && finishReason === null) {
        throw new ModelServerError("interrupted", "The model server stopped part-way through the answer.");
      }
      request.onFinish?.({ finishReason });
    }

    try {
      let ollama: boolean;
      try {
        ollama = await isOllama(controller.signal);
      } catch (error) {
        if (error instanceof AppError && !(error instanceof ModelServerError)) throw error;
        ollama = false;
      }
      yield* ollama ? viaOllama() : viaOpenAi();
    } finally {
      clearTimeout(silence);
      clearTimeout(whole);
      outer?.removeEventListener("abort", stopFromOutside);
      // Whoever was reading has stopped (finished, failed or walked away): close the connection so the model stops too.
      controller.abort();
    }
  }

  async function listModels(signal?: AbortSignal): Promise<string[]> {
    let response: Response;
    try {
      response = await fetch(`${base}/models`, {
        headers: { accept: "application/json" },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeouts.probeMs)])
          : AbortSignal.timeout(Math.min(timeouts.probeMs, 10_000)),
        redirect: "error",
      });
    } catch (error) {
      // Refused before anything was sent: say why, not that the server did not answer.
      if (error instanceof AppError && !(error instanceof ModelServerError)) throw error;
      if (signal?.aborted) throw error;
      throw unreachable();
    }
    const text = await readLimited(response);
    let names: string[] | undefined;
    if (response.ok) {
      try {
        const body = JSON.parse(text) as { data?: Array<{ id?: unknown }> };
        if (Array.isArray(body.data))
          names = body.data.map((item) => item?.id).filter((id): id is string => typeof id === "string" && id.length > 0);
      } catch {
        // Not JSON.
      }
    }
    if (!names) {
      throw new ModelServerError(
        "other",
        `Something answered at ${host}, but it did not give a list of models (${base}/models answered ${response.status}). Check the address in Settings; for Ollama, llama.cpp and LM Studio it ends in /v1.`,
      );
    }
    return names.slice(0, 200).map((name) => name.slice(0, 200));
  }

  async function test(signal?: AbortSignal): Promise<AnswerTestResult> {
    const started = performance.now();
    const result = (
      ok: boolean,
      failure: AnswerTestFailure | null,
      message: string,
      models: string[],
      reply: string | null,
    ): AnswerTestResult => ({
      ok,
      failure,
      message,
      models,
      reply,
      tookMs: Math.round(performance.now() - started),
    });

    // 1. Is anything there, and is it a model server?
    let models: string[] = [];
    try {
      models = await listModels(signal);
    } catch (error) {
      if (error instanceof ModelServerError) {
        return result(false, error.failure === "unreachable" ? "unreachable" : "not-a-model-server", error.message, [], null);
      }
      throw error;
    }
    const has = models.length > 0 ? ` It has: ${models.slice(0, 12).join(", ")}${models.length > 12 ? " and others" : ""}.` : "";

    // 2. Can the named model write? One short request, not streamed.
    let response: Response;
    try {
      response = await fetch(chatUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with the one word: ready" }],
          stream: false,
          temperature: 0,
          max_tokens: 32,
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeouts.probeMs)]) : AbortSignal.timeout(timeouts.probeMs),
        redirect: "error",
      });
    } catch (error) {
      // Refused before anything was sent: say why, not that the server did not answer.
      if (error instanceof AppError && !(error instanceof ModelServerError)) throw error;
      if (signal?.aborted) throw error;
      if (error instanceof Error && error.name === "TimeoutError") {
        return result(
          false,
          "too-slow",
          `"${model}" did not answer a one-word request within ${minutes(timeouts.probeMs)}. It may still be loading; try again. If it is always this slow, choose a smaller model.`,
          models,
          null,
        );
      }
      return result(false, "unreachable", unreachable().message, models, null);
    }
    const text = await readLimited(response);
    if (!response.ok) {
      const failure = failureOf(response.status, text);
      const kind: AnswerTestFailure =
        failure.failure === "no-such-model"
          ? "no-such-model"
          : failure.failure === "not-a-chat-model"
            ? "not-a-chat-model"
            : failure.failure === "no-chat-endpoint"
              ? "no-chat-endpoint"
              : "other";
      return result(false, kind, kind === "no-such-model" ? `${failure.message}${has}` : failure.message, models, null);
    }
    let reply: unknown;
    try {
      reply = (JSON.parse(text) as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    } catch {
      reply = undefined;
    }
    if (typeof reply !== "string" && reply !== null) {
      return result(
        false,
        "not-a-model-server",
        `Something answered at ${host}, but not in the way a model server answers a chat request. Check the address in Settings.`,
        models,
        null,
      );
    }
    const words = typeof reply === "string" ? reply.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    return result(
      true,
      null,
      `"${model}" answered${words ? `: “${words}”` : ", though with no words (some models think first and ran out of room in this short test)"}.`,
      models,
      words || null,
    );
  }

  return { id: `openai-compatible:${model}`, model, address, generate, listModels, test };
}

/**
 * Removes a model's private reasoning when it arrives inside the answer itself, as
 * `<think>…</think>` at the very start. (Servers that send reasoning in a field of its
 * own are handled in the provider, which never passes that field on.)
 */
export async function* withoutThinking(pieces: AsyncIterable<string>): AsyncGenerator<string> {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let held = "";
  // "after": the reasoning has ended and the blank lines that follow it are being skipped.
  let state: "start" | "thinking" | "after" | "answer" = "start";
  for await (const piece of pieces) {
    if (state === "answer") {
      yield piece;
      continue;
    }
    held += piece;
    if (state === "start") {
      const trimmed = held.trimStart();
      if (trimmed.startsWith(OPEN)) state = "thinking";
      else if (trimmed.length >= OPEN.length || !OPEN.startsWith(trimmed)) state = "answer";
      else continue;
    }
    if (state === "thinking") {
      const end = held.indexOf(CLOSE);
      if (end === -1) continue;
      held = held.slice(end + CLOSE.length);
      state = "after";
    }
    if (state === "after") {
      held = held.trimStart();
      if (!held) continue;
      state = "answer";
    }
    yield held;
    held = "";
  }
  // A stream that ended while still undecided was all answer; one that ended inside the reasoning had no answer.
  if (state === "start" && held) yield held;
}
