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
 *   embed-only           an embedding model: refuses to chat
 *   anything else        Ollama: 404, no such model. llama-server: answered by the loaded model.
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
  /** The llama-server flavour's context size, in tokens (characters ÷ 4 here). */
  contextTokens?: number;
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
  close(): Promise<void>;
}

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
  "embed-only",
];

/** The fields Ollama, llama-server and LM Studio all document for chat completions. */
const DOCUMENTED_FIELDS = new Set(["model", "messages", "stream", "temperature", "max_tokens", "stop", "seed", "top_p"]);

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
    if (line.startsWith("=====") || line.startsWith("Question:")) {
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

function answerFor(model: string, prompt: string): string {
  const sources = readSources(prompt);
  if (sources.length === 0) return "The sources do not answer this.";
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
  const requests: RecordedRequest[] = [];
  let abandoned = 0;
  let writing = 0;
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
        chats: requests.filter((entry) => entry.path.endsWith("/chat/completions")).length,
        abandoned,
        writing,
      });
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

    if (local === "/v1/chat/completions" && request.method === "POST" && flavour !== "embeddings-only") {
      return chat(flavour, request, response, body);
    }

    // Ollama's router answers an unknown path in plain text.
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("404 page not found");
  }

  async function chat(
    flavour: "ollama" | "llamacpp",
    request: http.IncomingMessage,
    response: http.ServerResponse,
    body: unknown,
  ): Promise<void> {
    const refuse = (status: number, message: string, type: string, extra: Record<string, unknown> = {}) =>
      flavour === "ollama"
        ? json(response, status, { error: { message, type, param: null, code: null } })
        : json(response, status, { error: { code: status, message, type, ...extra } });

    if (!/^application\/json\b/.test(request.headers["content-type"] ?? "") || !body || typeof body !== "object") {
      return refuse(400, "invalid request: a JSON body is required", "invalid_request_error");
    }
    const input = body as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      if (!DOCUMENTED_FIELDS.has(key))
        return refuse(400, `stand-in: "${key}" is not a field every server documents`, "invalid_request_error");
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
    ] as const) {
      if (key in input && typeof input[key] !== type)
        return refuse(400, `invalid request: ${key} must be a ${type}`, "invalid_request_error");
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

    const list = messages as Array<{ role: string; content: string }>;
    const promptChars = list.reduce((sum, message) => sum + message.content.length, 0);
    const promptTokens = Math.ceil(promptChars / 4);
    if (flavour === "llamacpp" && promptTokens > contextTokens) {
      return refuse(
        400,
        `request (${promptTokens} tokens) exceeds the available context size (${contextTokens} tokens), try increasing it`,
        "exceed_context_size_error",
        { n_prompt_tokens: promptTokens, n_ctx: contextTokens },
      );
    }
    // (Ollama does not refuse a prompt that is too long: it drops what does not fit and answers anyway.)

    const user = [...list].reverse().find((message) => message.role === "user")?.content ?? "";
    const id = `chatcmpl-${requests.length}`;
    const created = Math.floor(Date.now() / 1000);

    if (input.stream !== true) {
      const content = model === "stand-in-silent" ? "" : user.includes("Reply with the one word") ? "ready" : answerFor(model, user);
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
    const write = (delta: Record<string, unknown>, finish: string | null = null) =>
      response.write(
        `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: asked, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    const end = (reason: string) => {
      // Both servers send the reason on a chunk of its own, then the [DONE] line.
      write(flavour === "ollama" ? { role: "assistant", content: "" } : {}, reason);
      response.write("data: [DONE]\n\n");
      finished = true;
      response.end();
    };

    if (model === "stand-in-slow-start") await sleep(slowMs);
    if (gone()) return;
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    // llama-server opens with the role and no content, and sends comment lines to keep the connection alive.
    if (flavour === "llamacpp") {
      write({ role: "assistant", content: null });
      response.write(":\n\n");
    }

    if (model === "stand-in-thinks") {
      for (const piece of pieces("The user asks about the sources. Source [9] would be ideal but was not given. I will answer briefly.")) {
        if (gone()) return;
        write(flavour === "ollama" ? { role: "assistant", reasoning: piece } : { reasoning_content: piece });
        await sleep(chunkDelayMs);
      }
    }
    if (model === "stand-in-silent") return end("stop");
    if (model === "stand-in-endless") {
      const filler = `${"The same sentence, again and again, with no end in sight. ".repeat(4)}\n\n`;
      while (!gone()) {
        write(flavour === "ollama" ? { role: "assistant", content: filler } : { content: filler });
        await sleep(1);
      }
      return;
    }

    const all = pieces(answerFor(model, user));
    const delay = model === "stand-in-long" ? longChunkDelayMs : chunkDelayMs;
    for (const [index, piece] of all.entries()) {
      if (gone()) return;
      if (index === 4 && model === "stand-in-stalls") return;
      if (index === 4 && model === "stand-in-drops") return void response.destroy();
      if (index === 4 && model === "stand-in-fails") {
        if (flavour === "llamacpp") {
          // llama-server: one data line carrying the error, then the stream closes without [DONE].
          response.write(
            `data: ${JSON.stringify({ error: { code: 500, message: "the model ran out of memory", type: "server_error" } })}\n\n`,
          );
        } else {
          // Ollama: the error is lost on this endpoint. An empty piece, then the stream just closes.
          write({ role: "assistant", content: "" });
        }
        finished = true;
        return void response.end();
      }
      if (index === 6 && model === "stand-in-length") return end("length");
      write(flavour === "ollama" ? { role: "assistant", content: piece } : { content: piece });
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
  });
  console.log(`Stand-in model server (not a language model) on ${standIn.url}/v1 and ${standIn.url}/llamacpp/v1`);
}
