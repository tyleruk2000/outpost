/**
 * The tools evaluation: a fixed set of questions asked in Chat, through Outpost itself,
 * of a real language model that may look things up with Outpost's tools.
 *
 *   node apps/server/test/eval/tools-eval.ts --models llama3.2:3b,llama3.2:1b
 *   node apps/server/test/eval/tools-eval.ts --probe      what each tool answers here, no model
 *
 * It starts an Outpost of its own on a throwaway folder, filled with something in every
 * area (test/fixtures/tools/filled.ts, plus a layer of drinking water), switches answers
 * and "Let the model look things up" on, and sends each question of TOOL_QUESTIONS as the
 * first message of a new conversation, as the Chat screen does. It records the tools the
 * model called, with what it asked of them, the reply word for word, and the time to the
 * first word and to the end, and judges each reply by the question's rule.
 *
 * It needs a model server with the models named, so it is NOT part of the test suites.
 * It downloads nothing and changes nothing on the model server; between models it asks
 * Ollama to put the last one out of memory (`keep_alive: 0`, which is what `ollama stop`
 * does), so that one model's timings do not pay for another's.
 *
 * Options:
 *   --models a,b   the models to try (required unless --probe)
 *   --server URL   the model server (default http://127.0.0.1:11434/v1)
 *   --only id,id   only these questions
 *   --json FILE    also write every question, call and reply to FILE
 */
import "../../src/core/v8-flags.ts";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import type { AnswerSource, ChatConversationDetail, ChatMessage } from "@outpost/shared";
import { filledServer } from "../fixtures/tools/filled.ts";
import type { TestApp } from "../helpers.ts";
import { TOOL_QUESTIONS, type ToolQuestion } from "./tool-questions.ts";

const { values: options } = parseArgs({
  options: {
    models: { type: "string" },
    server: { type: "string", default: "http://127.0.0.1:11434/v1" },
    only: { type: "string" },
    json: { type: "string" },
    probe: { type: "boolean", default: false },
  },
});

const only = options.only ? new Set(options.only.split(",").map((id) => id.trim())) : null;
const questions = TOOL_QUESTIONS.filter((question) => !only || only.has(question.id));
const ollamaRoot = options.server!.replace(/\/v1\/?$/, "");

/** A layer of drinking water near Northampton, imported as a person would under Maps → Layers. */
async function addDrinkingWater(app: TestApp): Promise<void> {
  const location = app.ctx.services.storage.getDefault();
  const relPath = "layers/drinking-water.geojson";
  const file = app.ctx.services.storage.resolve(location.id, relPath);
  fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  const point = (name: string, lon: number, lat: number) => ({
    type: "Feature",
    properties: { name },
    geometry: { type: "Point", coordinates: [lon, lat] },
  });
  fs.writeFileSync(
    file,
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        point("Market Square fountain", -0.8954, 52.2389),
        point("Abington Park drinking fountain", -0.8709, 52.2441),
        point("Becket's Park tap", -0.8888, 52.2318),
      ],
    }),
  );
  const started = await app.api("POST", "/api/reference/imports/from-storage", {
    format: "geojson",
    locationId: location.id,
    relPath,
    title: "Drinking water (evaluation)",
    options: {
      layer: "shelters",
      kind: "Drinking water",
      provenance: "public-record",
      publisher: "OpenStreetMap contributors (evaluation)",
      license: "ODbL 1.0",
      accuracy: "As mapped",
    },
  });
  if (started.status !== 200) throw new Error(`The drinking water layer was not imported: ${JSON.stringify(started.body)}`);
  await app.ctx.jobs.whenIdle();
}

interface Call {
  tool: string;
  arguments: unknown;
  ok: boolean;
}

interface Row {
  model: string;
  question: ToolQuestion;
  calls: Call[];
  text: string;
  state: string;
  notice: string | null;
  firstWordMs: number | null;
  totalMs: number;
  verdict: { right: boolean; why: string };
}

/** Sends one question as the first message of a new conversation and waits for the reply, timing it. */
async function ask(
  origin: string,
  app: TestApp,
  model: string,
  question: ToolQuestion,
): Promise<Omit<Row, "model" | "question" | "verdict">> {
  const created = (await app.api("POST", "/api/chat/conversations", { model })).body as ChatConversationDetail;
  const id = created.conversation.id;
  const started = performance.now();
  const sent = await app.api("POST", `/api/chat/conversations/${id}/messages`, { text: question.question });
  if (sent.status !== 200) throw new Error(`Sending failed: ${JSON.stringify(sent.body)}`);
  let firstWordMs: number | null = null;
  let done: ChatMessage | null = null;
  const response = await fetch(`${origin}/api/chat/conversations/${id}/stream`);
  const decoder = new TextDecoder();
  let rest = "";
  let type = "";
  for await (const chunk of response.body!) {
    rest += decoder.decode(chunk as Uint8Array, { stream: true });
    let newline = rest.indexOf("\n");
    while (newline !== -1) {
      const line = rest.slice(0, newline);
      rest = rest.slice(newline + 1);
      newline = rest.indexOf("\n");
      if (line.startsWith("event: ")) type = line.slice(7);
      else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (type === "phase" && data.phase === "writing" && firstWordMs === null) firstWordMs = Math.round(performance.now() - started);
        if (type === "done") done = data.message as ChatMessage;
      }
    }
  }
  if (!done) {
    // The reply finished before the stream was opened: read it back.
    const detail = (await app.api("GET", `/api/chat/conversations/${id}`)).body as ChatConversationDetail;
    done = detail.messages.at(-1) ?? null;
  }
  const totalMs = Math.round(performance.now() - started);
  const message = done!;
  const calls = (message.sources as AnswerSource[])
    .filter((source) => source.kind === "lookup" && source.lookup)
    .map((source) => ({ tool: source.lookup!.tool, arguments: source.lookup!.arguments, ok: source.lookup!.ok }));
  return { calls, text: message.text, state: message.state, notice: message.notice, firstWordMs, totalMs };
}

function judge(question: ToolQuestion, row: Omit<Row, "model" | "question" | "verdict">): { right: boolean; why: string } {
  // A call that was refused (no such tool, arguments that did not fit) looked nothing up.
  const called = row.calls.filter((call) => call.ok).map((call) => call.tool);
  const refused = row.calls.filter((call) => !call.ok).length;
  if (row.state !== "complete" && row.state !== "cut-short") return { right: false, why: `the reply did not finish (${row.state})` };
  if (question.tools.length === 0) {
    if (row.calls.length > 0)
      return { right: false, why: `called ${row.calls.map((call) => call.tool).join(", ")} for a question that needs no tool` };
  } else {
    for (const wanted of question.tools) {
      const any = wanted.split("|");
      if (!called.some((name) => any.includes(name)))
        return { right: false, why: `did not call ${any.join(" or ")}${refused > 0 ? ` with arguments that fitted (${refused} refused)` : ""}` };
    }
  }
  const text = row.text.replace(/\s+/g, " ");
  if (!question.answer.some((pattern) => pattern.test(text))) return { right: false, why: "the answer does not hold what the tool said" };
  const invented = question.mustNot?.find((pattern) => pattern.test(text));
  if (invented) return { right: false, why: `the answer says what was not held (${invented.source})` };
  return { right: true, why: "" };
}

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
};

async function unload(model: string): Promise<void> {
  await fetch(`${ollamaRoot}/api/generate`, { method: "POST", body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => {});
}

async function memoryOf(model: string): Promise<{ bytes: number; context: number } | null> {
  try {
    const answer = (await (await fetch(`${ollamaRoot}/api/ps`)).json()) as {
      models?: Array<{ name: string; size: number; context_length?: number }>;
    };
    const found = answer.models?.find((entry) => entry.name === model || entry.name === `${model}:latest`);
    return found ? { bytes: found.size, context: found.context_length ?? 0 } : null;
  } catch {
    return null;
  }
}

const filled = await filledServer();
const { app } = filled;
try {
  await addDrinkingWater(app);
  if (options.probe) {
    for (const question of questions) {
      for (const [name, args] of question.probe ?? []) {
        const result = await app.ctx.services.tools.call(name, args, { signal: new AbortController().signal });
        console.log(`\n=== ${question.id}: ${name} ${JSON.stringify(args)}\n${result.text}`);
      }
    }
  } else {
    const models = (options.models ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (models.length === 0) throw new Error("Name the models to try: --models llama3.2:3b");
    await app.app.listen({ port: 0, host: "127.0.0.1" });
    const origin = `http://127.0.0.1:${(app.app.server.address() as AddressInfo).port}`;
    const rows: Row[] = [];
    const memory: Record<string, { bytes: number; context: number } | null> = {};
    for (const model of models) {
      for (const other of models) await unload(other);
      const saved = await app.api("PATCH", "/api/settings", {
        "answers.enabled": true,
        "answers.endpoint": options.server,
        "answers.model": model,
        "tools.enabled": true,
      });
      if (saved.status !== 200) throw new Error(JSON.stringify(saved.body));
      for (const question of questions) {
        const asked = await ask(origin, app, model, question);
        const verdict = judge(question, asked);
        memory[model] ??= await memoryOf(model);
        rows.push({ model, question, ...asked, verdict });
        const calls = asked.calls.map((call) => `${call.ok ? "" : "(refused) "}${call.tool} ${JSON.stringify(call.arguments)}`).join("; ");
        console.log(
          `${model} ${question.id} ${verdict.right ? "RIGHT" : `WRONG: ${verdict.why}`} | ${(asked.firstWordMs ?? -1) / 1000}s/${asked.totalMs / 1000}s | calls: ${calls || "none"}\n  ${asked.text.replace(/\s+/g, " ").slice(0, 400)}`,
        );
      }
      await unload(model);
    }
    console.log("\nModel | right | of | first word, s (median) | whole reply, s (median) | memory GB | context");
    for (const model of models) {
      const mine = rows.filter((row) => row.model === model);
      const first = median(mine.flatMap((row) => (row.firstWordMs === null ? [] : [row.firstWordMs])));
      const whole = median(mine.map((row) => row.totalMs));
      const held = memory[model];
      console.log(
        `${model} | ${mine.filter((row) => row.verdict.right).length} | ${mine.length} | ${first === null ? "-" : (first / 1000).toFixed(1)} | ${whole === null ? "-" : (whole / 1000).toFixed(1)} | ${held ? (held.bytes / 1e9).toFixed(2) : "-"} | ${held?.context ?? "-"}`,
      );
    }
    if (options.json) {
      fs.writeFileSync(
        options.json,
        JSON.stringify(
          { memory, rows: rows.map((row) => ({ ...row, question: { id: row.question.id, question: row.question.question } })) },
          null,
          2,
        ),
      );
    }
  }
} finally {
  await filled.close();
}
