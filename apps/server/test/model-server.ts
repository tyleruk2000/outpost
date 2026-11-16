/**
 * A stand-in for a local model server, for tests. It is not a language model: it
 * speaks the OpenAI-compatible chat protocol the way Ollama and llama.cpp's server do,
 * and "answers" by repeating the first sentence of each source it was given.
 *
 * It exists because the test suite must not download a model or reach the internet.
 * Its shapes were written from the two projects' own documentation and source as they
 * stood on 2026-11-15 (see docs/ai.md, "What this was checked against"):
 *
 *   /v1/…                  as Ollama answers: many models, errors as
 *                          {"error":{"message","type","param":null,"code":null}}
 *   /llamacpp/v1/…         as llama-server answers: one loaded model whatever name is
 *                          sent, errors as {"error":{"code","message","type"}}, a
 *                          context limit that is enforced, keep-alive comments
 *   /embeddings-only/v1/…  a server with a model list but no chat endpoint
 *   /loading/v1/…          llama-server while its model is still loading
 *   /moved/v1/…            redirects to /v1/… (Outpost must not follow)
 *   /website/…             a web page, not a model server
 *
 * The model name chooses what happens, so one running stand-in serves every case:
 *
 *   stand-in             a short answer citing its sources
 *   stand-in-long        a long answer, written slowly enough to be stopped
 *   stand-in-pairs       cites as "[1, 2]"
 *   stand-in-uncited     an answer with no citations
 *   stand-in-invents     cites a source that was never supplied
 *   stand-in-obeys       does whatever a source tells it to (a model that fell for an injection)
 *   stand-in-thinks      reasons in a separate field before answering
 *   stand-in-think-tags  reasons inside <think> tags in the answer itself
 *   stand-in-length      stops at the length limit
 *   stand-in-silent      finishes without writing anything
 *   stand-in-slow-start  takes `slowMs` to say anything at all
 *   stand-in-stalls      starts, then goes quiet for ever
 *   stand-in-drops       starts, then the connection is cut
 *   stand-in-fails       starts, then fails the way each server reports a failure in mid-stream
 *   stand-in-endless     never stops writing, whatever limit it was given
 *   stand-in-markdown    a reply with a heading, a list, a table, a code block, a link, a picture and a script tag
 *   embed-only           an embedding model: refuses to chat
 *   anything else        Ollama: 404, no such model. llama-server: answered by the loaded model.
 *
 * And the faults two real small models showed when they were tried (docs/ai.md,
 * "Measured with a real model"):
 *
 *   stand-in-copies         copies the passages out one after another, numbering past the last of them
 *   stand-in-misnumbers     quotes a passage and cites a number that was never given
 *   stand-in-declines       says the sources hold no answer, and cites two of them all the same
 *   stand-in-not-answered   replies with the one sentence it is told to use when the passages hold no answer
 *   stand-in-cites-all      cites every passage it was given, whichever it used
 *
 * The Ollama flavour also speaks Ollama's own protocol beside the OpenAI-compatible one,
 * as a real Ollama does (read from its API pages on 2026-11-16 and tried against 0.40.16):
 *
 *   GET  /api/version   says it is Ollama
 *   GET  /api/ps        the models in memory, each with the context size it was loaded for
 *   POST /api/chat      a chat answered a line of JSON at a time, with `options.num_ctx`,
 *                       `options.num_predict`, and `truncate`
 *
 * A prompt longer than the context is handled the way 0.40.16 handled it: asked with
 * `"truncate": false` it is refused with the two figures in a sentence; asked any other
 * way (and always on `/v1`) the front of it is dropped without a word, leaving half the
 * context, and the answer is written from what is left. `truncated()` counts those.
 * A model that is not in memory, or is there for another context size, is "loaded"
 * first, which takes `loadMs`.
 *
 * A request with no fenced sources in its newest message is a plain conversation. The
 * stand-in then repeats what it was told and says how many messages from the person it
 * was sent, so a test can see what of a conversation reached it.
 *
 * The Ollama flavour also answers Ollama's own list of models, `GET /api/tags`, in the
 * shape Ollama's API documentation gives (read on 2026-11-16): sizes, parameter counts
 * and quantisation. The other flavours have no such list, as the real servers do not.
 *
 * To be strict where a real server is lenient, a chat request carrying any field
 * outside the ones all three servers document is refused, so a test fails if Outpost
 * starts sending something a real server might not understand.
 *
 * Run directly it listens on the port given: `node model-server.ts 8485`. `/health`
 * answers "ok", and `/stats` says how many chat requests have arrived, how many are being
 * answered, and how many were abandoned by their caller.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

export interface StandInOptions {
  port?: number;
  /** Pause between pieces of an answer. */
  chunkDelayMs?: number;
  /** Pause between pieces for `stand-in-long`. */
  longChunkDelayMs?: number;
  /** How long `stand-in-slow-start` waits before answering. */
  slowMs?: number;
  /** The context size, in tokens (characters ÷ 4 here), of the llama-server flavour, and of the Ollama flavour when it is not asked for one. */
  contextTokens?: number;
  /** False for an Ollama flavour without Ollama's own endpoints: only the OpenAI-compatible ones answer. */
  ollamaApi?: boolean;
  /** How long loading a model into memory takes, the first time it is used or when the context size asked for changes. */
  loadMs?: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  // biome-ignore lint/suspicious/noExplicitAny: tests assert on whatever was sent
  body: any;
}

export interface StandIn {
  /** `http://127.0.0.1:<port>`: add `/v1` for the Ollama flavour. */
  url: string;
  port: number;
  /** Every request received, oldest first. */
  requests: RecordedRequest[];
  /** Chat requests whose caller went away before the answer was finished. */
  abandoned(): number;
  /** Chat requests being answered at this moment. */
  writing(): number;
  /** Chat requests whose prompt was longer than the context and was cut down without a word. */
  truncated(): number;
  /** The models in memory, as "name@context". */
  loaded(): string[];
  /** Puts every model out of memory, as Ollama does with one that has sat idle. */
  unload(): void;
  close(): Promise<void>;
}

/** The chat requests among everything a stand-in received, whichever of the two protocols they came by. */
export const isChatPath = (path: string) => path.endsWith("/chat/completions") || path === "/api/chat";

const MODELS = [
  "stand-in",
  "stand-in-long",
  "stand-in-pairs",
  "stand-in-uncited",
  "stand-in-invents",
  "stand-in-obeys",
  "stand-in-thinks",
  "stand-in-think-tags",
  "stand-in-length",
  "stand-in-silent",
  "stand-in-slow-start",
  "stand-in-stalls",
  "stand-in-drops",
  "stand-in-fails",
  "stand-in-endless",
  "stand-in-markdown",
  "stand-in-copies",
  "stand-in-misnumbers",
  "stand-in-declines",
  "stand-in-not-answered",
  "stand-in-cites-all",
  "embed-only",
];

/** A reply that uses everything a model's Markdown can hold, including what must never act in a browser. */
export const MARKDOWN_REPLY = [
  "## Lighting the stove",
  "",
  "Do it in this order:",
  "",
  "1. Fill the tank **two thirds** full.",
  "2. Prime the burner.",
  "",
  "| Fuel | Burn time |",
  "| --- | --- |",
  "| Paraffin | 2 hours |",
  "| Meths | 40 minutes |",
  "",
  "```sh",
  "stove --prime --wait 30",
  'echo "<b>lit</b>"',
  "```",
  "",
  "More at [the maker's site](https://stoves.example/manual?from=outpost) ![a stove](https://tracker.example/pixel.png).",
  "",
  "<script>window.__standInRan = true</script>",
  "",
  '<img src="https://tracker.example/second.png" onerror="window.__standInRan = true">',
].join("\n");

/** The fields Ollama, llama-server and LM Studio all document for chat completions. */
const DOCUMENTED_FIELDS = new Set(["model", "messages", "stream", "temperature", "max_tokens", "stop", "seed", "top_p"]);
/**
 * What Ollama's own chat endpoint takes. `truncate` and `shift` were not on its API page on 2026-11-16;
 * Ollama 0.40.16 acted on both when tried, and a version that does not know a field ignores it.
 */
const OLLAMA_FIELDS = new Set(["model", "messages", "stream", "options", "truncate", "shift", "keep_alive", "think"]);
const OLLAMA_OPTIONS = new Set(["temperature", "num_predict", "num_ctx", "stop", "seed", "top_p", "top_k", "min_p"]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Source {
  marker: number;
  text: string;
}

/** The numbered sources in a prompt: "[n] where" on one line, the passage on the lines after it. */
function readSources(prompt: string): Source[] {
  const sources: Source[] = [];
  let current: Source | undefined;
  for (const line of prompt.split("\n")) {
    if (line.startsWith("=====") || line.startsWith("Question:") || line.startsWith("Answer")) {
      current = undefined;
      continue;
    }
    const header = /^\[(\d+)\] /.exec(line);
    if (header) {
      current = { marker: Number(header[1]), text: "" };
      sources.push(current);
    } else if (current) current.text += `${line} `;
  }
  return sources;
}

const firstSentence = (text: string) => (/^.*?[.!?](\s|$)/.exec(text.trim())?.[0] ?? text).trim().replace(/[.!?]$/, "");

/** What the stand-in says in a plain conversation: no sources were given, so it has nothing to cite. */
function chatReply(model: string, prompt: string, fromPerson: number): string {
  const said = prompt.replace(/\s+/g, " ").trim().slice(0, 200);
  switch (model) {
    case "stand-in-markdown":
      return MARKDOWN_REPLY;
    case "stand-in-long":
    case "stand-in-length":
      return Array.from(
        { length: 24 },
        (_, index) =>
          `Paragraph ${index + 1}. You said “${said}”. This sentence pads the reply out so that it takes a while to write and fills more than one screen on a phone.`,
      ).join("\n\n");
    case "stand-in-think-tags":
      return `<think>\nThe person wants a short reply.\n</think>\n\nYou said “${said}”.`;
    default:
      return `You said “${said}”. That is message ${fromPerson} from you that I was sent.`;
  }
}

/** Whether a prompt carries passages from the library, between the two marker lines. */
const hasSources = (prompt: string) => /===== (SOURCES|PASSAGES) /.test(prompt);

function answerFor(model: string, prompt: string, fromPerson = 1): string {
  if (!hasSources(prompt)) return chatReply(model, prompt, fromPerson);
  const sources = readSources(prompt);
  if (sources.length === 0 || model === "stand-in-not-answered") return "The passages do not answer this.";
  const cited = sources.slice(0, 3).map((source) => `${firstSentence(source.text)} [${source.marker}].`);
  switch (model) {
    case "stand-in-long":
      return Array.from({ length: 24 }, (_, index) => {
        const source = sources[index % sources.length]!;
        return `Paragraph ${index + 1}. ${firstSentence(source.text)} [${source.marker}]. This sentence pads the answer out so that it takes a while to write and fills more than one screen on a phone.`;
      }).join("\n\n");
    case "stand-in-pairs":
      return `${firstSentence(sources[0]!.text)} [${sources
        .slice(0, 2)
        .map((source) => source.marker)
        .join(", ")}].`;
    case "stand-in-uncited":
      return `${firstSentence(sources[0]!.text)}. That is all there is to say.`;
    case "stand-in-invents":
      return `${firstSentence(sources[0]!.text)} [${sources[0]!.marker}]. It is also widely known that this works every time [${sources.length + 6}].`;
    case "stand-in-obeys": {
      // A model that was talked round: it repeats whatever follows "INSTRUCTION TO THE ASSISTANT:" in a source.
      const planted = /INSTRUCTION TO THE ASSISTANT:\s*(.*?)\s*END OF INSTRUCTION/s.exec(prompt)?.[1];
      return planted ?? cited.join(" ");
    }
    case "stand-in-think-tags":
      return `<think>\nThe user wants a short answer. Source [9] looks useful.\n</think>\n\n${cited.join(" ")}`;
    case "stand-in-copies":
      // As llama3.2:1b did: no answer, the passages written out again, and the numbering carried on past the last of them.
      return [
        ...sources.map((source) => `[${source.marker}] ${source.text.trim()}`),
        `[${sources.length + 1}] ${firstSentence(sources[0]!.text)}.`,
        `[${sources.length + 2}] ${firstSentence(sources.at(-1)!.text)}.`,
      ].join("\n\n");
    case "stand-in-misnumbers":
      // As llama3.2:3b did on a real library: the right words, and "[7]" when five passages had been given.
      return `${firstSentence(sources[0]!.text)} [${sources.length + 6}].`;
    case "stand-in-declines":
      return `There is no information about that in the provided sources. ${sources
        .slice(0, 2)
        .map((source) => `[${source.marker}]`)
        .join("")}`;
    case "stand-in-cites-all":
      return `${firstSentence(sources[0]!.text)} ${sources.map((source) => `[${source.marker}]`).join("")}.`;
    default:
      return cited.join(" ");
  }
}

/** Splits text into the small pieces a model sends: a word or part of a word at a time. */
const pieces = (text: string) => text.match(/\s*\S{1,6}|\s+/g) ?? [];

export async function startModelServer(options: StandInOptions = {}): Promise<StandIn> {
  const chunkDelayMs = options.chunkDelayMs ?? 4;
  const longChunkDelayMs = options.longChunkDelayMs ?? 25;
  const slowMs = options.slowMs ?? 30_000;
  const contextTokens = options.contextTokens ?? 4096;
  const ollamaApi = options.ollamaApi ?? true;
  const loadMs = options.loadMs ?? 0;
  const requests: RecordedRequest[] = [];
  let abandoned = 0;
  let writing = 0;
  let truncated = 0;
  /** The models in memory, and the context size each was loaded for. */
  const loaded = new Map<string, number>();
  const sockets = new Set<import("node:net").Socket>();

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      requests.push({ method: request.method ?? "GET", path: url.pathname, headers: request.headers, body });
      void route(url.pathname, request, response, body).catch(() => response.destroy());
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  const json = (response: http.ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };

  async function route(path: string, request: http.IncomingMessage, response: http.ServerResponse, body: unknown): Promise<void> {
    if (path === "/health") return void response.end("ok");
    // For tests that cannot hold this object: what has been asked of the stand-in so far.
    if (path === "/stats") {
      return json(response, 200, {
        chats: requests.filter((entry) => isChatPath(entry.path)).length,
        abandoned,
        writing,
        truncated,
        loaded: [...loaded].map(([name, context]) => `${name}@${context}`),
      });
    }
    // For tests that cannot hold this object: put every model out of memory, as after sitting idle.
    if (path === "/unload") {
      loaded.clear();
      return void response.end("ok");
    }
    if (path.startsWith("/website")) {
      response.writeHead(200, { "Content-Type": "text/html" });
      return void response.end("<!doctype html><title>My router</title><h1>Welcome</h1>");
    }
    if (path.startsWith("/moved/")) {
      response.writeHead(307, { Location: path.replace("/moved", "") });
      return void response.end();
    }
    if (path.startsWith("/loading/")) {
      return json(response, 503, { error: { code: 503, message: "Loading model", type: "unavailable_error" } });
    }
    const flavour = path.startsWith("/llamacpp/") ? "llamacpp" : path.startsWith("/embeddings-only/") ? "embeddings-only" : "ollama";
    const local = path.replace(/^\/(llamacpp|embeddings-only)/, "");

    if (local === "/v1/models" && request.method === "GET") {
      if (flavour === "llamacpp") {
        // llama-server: always exactly one element, named after the model file.
        return json(response, 200, {
          object: "list",
          data: [
            {
              id: "stand-in.gguf",
              object: "model",
              created: 1735142223,
              owned_by: "llamacpp",
              meta: { vocab_type: 2, n_vocab: 32000, n_ctx_train: 8192, n_embd: 2048, n_params: 1000000, size: 1000000 },
            },
          ],
        });
      }
      const names = flavour === "embeddings-only" ? ["embed-only"] : MODELS;
      return json(response, 200, {
        object: "list",
        data: names.map((name) => ({ id: `${name}:latest`, object: "model", created: 1735142223, owned_by: "library" })),
      });
    }

    // Ollama's own list, beside its OpenAI-compatible one. The other servers have nothing at this path.
    if (path === "/api/tags" && request.method === "GET") {
      return json(response, 200, {
        models: MODELS.map((name, index) => ({
          name: `${name}:latest`,
          model: `${name}:latest`,
          modified_at: "2026-11-01T10:00:00.000000000Z",
          size: name === "embed-only" ? 274302450 : 2019393189 + index * 1000,
          digest: "a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72",
          details: {
            parent_model: "",
            format: "gguf",
            family: name === "embed-only" ? "nomic-bert" : "llama",
            families: [name === "embed-only" ? "nomic-bert" : "llama"],
            parameter_size: name === "embed-only" ? "137M" : "3.2B",
            quantization_level: name === "embed-only" ? "F16" : "Q4_K_M",
          },
          // As Ollama 0.40.16 sent it on 2026-11-16; its API documentation of that day does not list the field.
          capabilities: name === "embed-only" ? ["embedding"] : ["completion", "tools"],
        })),
      });
    }

    if (local === "/v1/chat/completions" && request.method === "POST" && flavour !== "embeddings-only") {
      return chat(flavour, "openai", request, response, body);
    }

    // Ollama's own endpoints, beside its OpenAI-compatible ones. The other servers have nothing at these paths.
    if (flavour === "ollama" && ollamaApi && !path.startsWith("/v1")) {
      if (path === "/api/version" && request.method === "GET") return json(response, 200, { version: "0.40.16" });
      if (path === "/api/ps" && request.method === "GET") {
        return json(response, 200, {
          models: [...loaded].map(([name, context]) => ({
            name,
            model: name,
            size: 2343095499,
            digest: "a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72",
            details: {
              parent_model: "",
              format: "gguf",
              family: "llama",
              families: ["llama"],
              parameter_size: "3.2B",
              quantization_level: "Q4_K_M",
            },
            expires_at: new Date(Date.now() + 300_000).toISOString(),
            size_vram: 2343095499,
            context_length: context,
          })),
        });
      }
      if (path === "/api/chat" && request.method === "POST") return chat("ollama", "ollama", request, response, body);
    }

    // Ollama's router answers an unknown path in plain text.
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("404 page not found");
  }

  async function chat(
    flavour: "ollama" | "llamacpp",
    /** Which protocol the request came by: the OpenAI-compatible one, or Ollama's own. */
    protocol: "openai" | "ollama",
    request: http.IncomingMessage,
    response: http.ServerResponse,
    body: unknown,
  ): Promise<void> {
    const refuse = (status: number, message: string, type: string, extra: Record<string, unknown> = {}) =>
      protocol === "ollama"
        ? // Ollama's own endpoints say what went wrong as one string.
          json(response, status, { error: message })
        : flavour === "ollama"
          ? json(response, status, { error: { message, type, param: null, code: null } })
          : json(response, status, { error: { code: status, message, type, ...extra } });

    if (
      !body ||
      typeof body !== "object" ||
      (protocol === "openai" && !/^application\/json\b/.test(request.headers["content-type"] ?? ""))
    ) {
      return refuse(400, "invalid request: a JSON body is required", "invalid_request_error");
    }
    const input = body as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      if (!(protocol === "ollama" ? OLLAMA_FIELDS : DOCUMENTED_FIELDS).has(key))
        return refuse(
          400,
          `stand-in: "${key}" is not a field ${protocol === "ollama" ? "Ollama takes" : "every server documents"}`,
          "invalid_request_error",
        );
    }
    const settings = (protocol === "ollama" && input.options && typeof input.options === "object" ? input.options : {}) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(settings)) {
      if (!OLLAMA_OPTIONS.has(key)) return refuse(400, `stand-in: "${key}" is not an option Ollama documents`, "invalid_request_error");
    }
    const messages = input.messages;
    const valid =
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every(
        (message) =>
          message &&
          typeof message === "object" &&
          ["system", "user", "assistant"].includes((message as { role?: unknown }).role as string) &&
          typeof (message as { content?: unknown }).content === "string",
      );
    if (!valid) return refuse(400, "invalid request: messages must be a list of {role, content}", "invalid_request_error");
    for (const [key, type] of [
      ["stream", "boolean"],
      ["temperature", "number"],
      ["max_tokens", "number"],
      ["truncate", "boolean"],
      ["shift", "boolean"],
    ] as const) {
      if (key in input && typeof input[key] !== type)
        return refuse(400, `invalid request: ${key} must be a ${type}`, "invalid_request_error");
    }
    for (const key of ["temperature", "num_predict", "num_ctx"]) {
      if (key in settings && typeof settings[key] !== "number")
        return refuse(400, `invalid request: options.${key} must be a number`, "invalid_request_error");
    }
    if (flavour === "ollama" && (typeof input.model !== "string" || !input.model)) {
      return refuse(400, "model is required", "invalid_request_error");
    }

    const asked = typeof input.model === "string" ? input.model : "";
    let model = asked.replace(/:latest$/, "");
    if (flavour === "ollama") {
      if (!MODELS.includes(model)) return refuse(404, `model '${asked}' not found`, "not_found_error");
      if (model === "embed-only") return refuse(400, `"${asked}" does not support chat`, "invalid_request_error");
    } else if (!MODELS.includes(model) || model === "embed-only") {
      // llama-server has one model loaded and answers with it whatever name arrives.
      model = "stand-in";
    }

    const list = (messages as Array<{ role: string; content: string }>).map((message) => ({ ...message }));
    const promptChars = list.reduce((sum, message) => sum + message.content.length, 0);
    let promptTokens = Math.ceil(promptChars / 4);
    const context = typeof settings.num_ctx === "number" ? settings.num_ctx : contextTokens;
    if (promptTokens > context) {
      if (flavour === "llamacpp" || (protocol === "ollama" && input.truncate === false)) {
        return refuse(
          400,
          `request (${promptTokens} tokens) exceeds the available context size (${context} tokens), try increasing it`,
          "exceed_context_size_error",
          { n_prompt_tokens: promptTokens, n_ctx: context },
        );
      }
      // Ollama, not told otherwise: the front of the newest message is dropped until half the context is left,
      // and the answer is written from that. Nothing in the reply says so.
      truncated += 1;
      const newest = list.at(-1)!;
      const others = promptChars - newest.content.length;
      newest.content = newest.content.slice(-Math.max(0, (context / 2) * 4 - others));
      promptTokens = Math.ceil((others + newest.content.length) / 4);
    }

    const user = [...list].reverse().find((message) => message.role === "user")?.content ?? "";
    const fromPerson = list.filter((message) => message.role === "user").length;
    const id = `chatcmpl-${requests.length}`;
    const created = Math.floor(Date.now() / 1000);

    // A model that is not in memory, or is there for another context size, is loaded before it says anything.
    const load = async () => {
      if (flavour !== "ollama") return;
      if (loaded.get(asked) !== context && loadMs > 0) await sleep(loadMs);
      loaded.set(asked, context);
    };

    if (input.stream !== true) {
      await load();
      const content =
        model === "stand-in-silent" ? "" : user.includes("Reply with the one word") ? "ready" : answerFor(model, user, fromPerson);
      if (protocol === "ollama") {
        return json(response, 200, {
          model: asked,
          created_at: new Date().toISOString(),
          message: { role: "assistant", content },
          done: true,
          done_reason: "stop",
          prompt_eval_count: promptTokens,
          eval_count: 3,
        });
      }
      return json(response, 200, {
        id,
        object: "chat.completion",
        created,
        model: asked,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: promptTokens, completion_tokens: 3, total_tokens: promptTokens + 3 },
      });
    }

    let finished = false;
    writing += 1;
    response.on("close", () => {
      writing -= 1;
      if (!finished) abandoned += 1;
    });
    const gone = () => response.destroyed || response.writableEnded;
    /** One piece of the reply, in whichever protocol was asked for. `reasoning` is a model's private thinking. */
    const write = (piece: string | null, kind: "content" | "reasoning" = "content", finish: string | null = null) => {
      if (protocol === "ollama") {
        const message: Record<string, unknown> = { role: "assistant", content: kind === "content" ? (piece ?? "") : "" };
        if (kind === "reasoning") message.thinking = piece;
        response.write(`${JSON.stringify({ model: asked, created_at: new Date().toISOString(), message, done: false })}\n`);
        return;
      }
      const delta: Record<string, unknown> =
        kind === "reasoning"
          ? flavour === "ollama"
            ? { role: "assistant", reasoning: piece }
            : { reasoning_content: piece }
          : flavour === "ollama"
            ? { role: "assistant", content: piece ?? "" }
            : piece === null
              ? {}
              : { content: piece };
      response.write(
        `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: asked, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    };
    const end = (reason: string) => {
      if (protocol === "ollama") {
        // Ollama's last line says why it ended and what the prompt came to.
        response.write(
          `${JSON.stringify({
            model: asked,
            created_at: new Date().toISOString(),
            message: { role: "assistant", content: "" },
            done: true,
            done_reason: reason,
            total_duration: 1_000_000,
            load_duration: 1_000,
            prompt_eval_count: promptTokens,
            eval_count: 3,
          })}\n`,
        );
      } else {
        // Both servers send the reason on a chunk of its own, then the [DONE] line.
        write(null, "content", reason);
        response.write("data: [DONE]\n\n");
      }
      finished = true;
      response.end();
    };

    await load();
    if (model === "stand-in-slow-start") await sleep(slowMs);
    if (gone()) return;
    response.writeHead(
      200,
      protocol === "ollama"
        ? { "Content-Type": "application/x-ndjson" }
        : { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    );
    // llama-server opens with the role and no content, and sends comment lines to keep the connection alive.
    if (flavour === "llamacpp") {
      response.write(
        `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: asked, choices: [{ index: 0, delta: { role: "assistant", content: null }, finish_reason: null }] })}\n\n`,
      );
      response.write(":\n\n");
    }

    if (model === "stand-in-thinks") {
      for (const piece of pieces("The user asks about the sources. Source [9] would be ideal but was not given. I will answer briefly.")) {
        if (gone()) return;
        write(piece, "reasoning");
        await sleep(chunkDelayMs);
      }
    }
    if (model === "stand-in-silent") return end("stop");
    if (model === "stand-in-endless") {
      const filler = `${"The same sentence, again and again, with no end in sight. ".repeat(4)}\n\n`;
      while (!gone()) {
        write(filler);
        await sleep(1);
      }
      return;
    }

    const all = pieces(answerFor(model, user, fromPerson));
    const delay = model === "stand-in-long" ? longChunkDelayMs : chunkDelayMs;
    for (const [index, piece] of all.entries()) {
      if (gone()) return;
      if (index === 4 && model === "stand-in-stalls") return;
      if (index === 4 && model === "stand-in-drops") return void response.destroy();
      if (index === 4 && model === "stand-in-fails") {
        if (protocol === "ollama") {
          // Ollama's own endpoint: one line carrying the error, then the stream closes.
          response.write(`${JSON.stringify({ error: "the model ran out of memory" })}\n`);
        } else if (flavour === "llamacpp") {
          // llama-server: one data line carrying the error, then the stream closes without [DONE].
          response.write(
            `data: ${JSON.stringify({ error: { code: 500, message: "the model ran out of memory", type: "server_error" } })}\n\n`,
          );
        } else {
          // Ollama's OpenAI-compatible endpoint: the error is lost. An empty piece, then the stream just closes.
          write("");
        }
        finished = true;
        return void response.end();
      }
      if (index === 6 && model === "stand-in-length") return end("length");
      write(piece);
      await sleep(delay);
    }
    end("stop");
  }

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    abandoned: () => abandoned,
    writing: () => writing,
    truncated: () => truncated,
    loaded: () => [...loaded].map(([name, context]) => `${name}@${context}`),
    unload: () => loaded.clear(),
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

// Run directly (not imported by a test). Written this way because `import.meta.main` is newer than Node 24.0.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const standIn = await startModelServer({
    port: Number(process.argv[2] ?? 8485),
    longChunkDelayMs: Number(process.env.STAND_IN_LONG_DELAY_MS ?? 25),
    loadMs: Number(process.env.STAND_IN_LOAD_MS ?? 0),
  });
  console.log(`Stand-in model server (not a language model) on ${standIn.url}/v1 and ${standIn.url}/llamacpp/v1`);
}
