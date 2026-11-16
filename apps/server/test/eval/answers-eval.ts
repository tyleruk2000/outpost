/**
 * The answers evaluation: a fixed set of questions asked of a fixed small library,
 * through Outpost itself, with a real language model writing the answers.
 *
 *   node apps/server/test/eval/answers-eval.ts --models llama3.2:3b,llama3.2:1b
 *
 * It starts an Outpost of its own on a throwaway folder, puts the library of library.ts
 * into its search index, points "Answers from your library" at the model server, and
 * asks each question of questions.ts with `POST /api/answers`, exactly as the Search
 * screen does. What comes back is judged by rule (judge.ts) and counted.
 *
 * It needs a model server with the models named, so it is NOT part of the test suites,
 * which must pass on a machine with none. It downloads nothing and changes nothing on
 * the model server; it only asks it to write.
 *
 * Options:
 *   --models a,b      the models to try, by the names the model server knows (required)
 *   --server URL      the model server (default http://127.0.0.1:11434/v1, where Ollama listens)
 *   --mode M          keyword, hybrid or both (default both). Hybrid builds the built-in
 *                     search-by-meaning index first, which needs apps/server/models.
 *   --runs N          ask everything N times over (default 1). Small models vary from run to run.
 *   --only id,id      only these questions
 *   --json FILE       also write every question, passage list and reply to FILE
 *   --rejudge FILE    ask nothing: judge the replies saved in FILE (by --json) again, by the
 *                     questions and rules as they now stand, and print the table. For when a
 *                     pattern in questions.ts turns out to be wrong. Needs no model server.
 *   --quiet           the tables only, not a line for each question
 */
import "../../src/core/v8-flags.ts";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import { createTestApp, type TestApp } from "../helpers.ts";
import { type EvalReply, type GivenPassage, type Judgement, judge, type Tally, tally } from "./judge.ts";
import { LIBRARY } from "./library.ts";
import { type EvalQuestion, QUESTIONS } from "./questions.ts";

const { values: options } = parseArgs({
  options: {
    models: { type: "string" },
    server: { type: "string", default: "http://127.0.0.1:11434/v1" },
    mode: { type: "string", default: "both" },
    runs: { type: "string", default: "1" },
    only: { type: "string" },
    json: { type: "string" },
    rejudge: { type: "string" },
    quiet: { type: "boolean", default: false },
  },
});

if (!options.models && !options.rejudge) {
  console.error("Name the models to try: --models llama3.2:3b,llama3.2:1b");
  process.exit(2);
}
const models = (options.models ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const modes = options.mode === "both" ? (["keyword", "hybrid"] as const) : ([options.mode as "keyword" | "hybrid"] as const);
const runs = Math.max(1, Number(options.runs) || 1);
const only = options.only ? new Set(options.only.split(",").map((id) => id.trim())) : null;
const questions = QUESTIONS.filter((question) => !only || only.has(question.id));

interface Row {
  model: string;
  mode: string;
  run: number;
  question: EvalQuestion;
  reply: EvalReply;
  judgement: Judgement;
  /** Milliseconds from asking to the first word, when there was one. */
  firstWordMs: number | null;
  totalMs: number;
  searchedFor: string;
  omitted: number;
  /** Passages the model server refused as too long and Outpost left out when it asked again. */
  leftOut: number;
  /** Outpost said the model was being loaded first (only Ollama can be asked). */
  loading: boolean;
  promptChars: number;
  /** What the model wrote, before Outpost settled the answer it shows (`reply.text`). */
  written: string;
}

/** Asks one question the way the Search screen does, and reads the stream to its end. */
async function ask(
  origin: string,
  question: EvalQuestion,
  mode: string,
): Promise<Omit<Row, "model" | "mode" | "run" | "judgement" | "question">> {
  const started = performance.now();
  const response = await fetch(`${origin}/api/answers`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-outpost-request": "1" },
    body: JSON.stringify({ question: question.question, mode }),
  });
  const reply: EvalReply = { outcome: "answered", text: "", given: [], cutShort: false, failure: null };
  let firstWordMs: number | null = null;
  let searchedFor = "";
  let omitted = 0;
  let leftOut = 0;
  let loading = false;
  let promptChars = 0;
  if (!response.ok || !response.body) {
    reply.failure = `http-${response.status}`;
    return {
      reply,
      firstWordMs,
      totalMs: Math.round(performance.now() - started),
      searchedFor,
      omitted,
      leftOut,
      loading,
      promptChars,
      written: "",
    };
  }
  const titles = new Map(LIBRARY.map((document) => [document.title, document.id]));
  let written = "";
  let finalText: string | null = null;
  const handle = (type: string, data: Record<string, unknown>) => {
    if (type === "sources") {
      searchedFor = String(data.searchedFor ?? "");
      omitted = Number(data.omitted ?? 0);
      leftOut = Number(data.leftOut ?? 0);
      const sources = data.sources as Array<{ marker: number; title: string; heading: string | null; quote: string }>;
      promptChars = sources.reduce((sum, source) => sum + source.quote.length, 0);
      reply.given = sources.map(
        (source): GivenPassage => ({
          marker: source.marker,
          document: titles.get(source.title) ?? source.title,
          heading: source.heading,
          quote: source.quote,
        }),
      );
    } else if (type === "loading") {
      loading = true;
    } else if (type === "delta") {
      if (firstWordMs === null && String(data.text ?? "").trim()) firstWordMs = Math.round(performance.now() - started);
      written += String(data.text ?? "");
    } else if (type === "done") {
      reply.outcome = String(data.outcome);
      reply.cutShort = data.cutShort === true;
      // A version of Outpost that tidies the answer after the model has finished says what it shows in the end.
      if (typeof data.text === "string") finalText = data.text;
    } else if (type === "error") {
      reply.failure = String(data.failure);
    }
  };
  const decoder = new TextDecoder();
  let rest = "";
  let type = "";
  for await (const chunk of response.body) {
    rest += decoder.decode(chunk as Uint8Array, { stream: true });
    let newline = rest.indexOf("\n");
    while (newline !== -1) {
      const line = rest.slice(0, newline);
      rest = rest.slice(newline + 1);
      newline = rest.indexOf("\n");
      if (line.startsWith("event: ")) type = line.slice(7);
      else if (line.startsWith("data: ")) handle(type, JSON.parse(line.slice(6)) as Record<string, unknown>);
    }
  }
  reply.text = finalText ?? written;
  return {
    reply,
    firstWordMs,
    totalMs: Math.round(performance.now() - started),
    searchedFor,
    omitted,
    leftOut,
    loading,
    promptChars,
    written,
  };
}

function seed(app: TestApp): void {
  for (const document of LIBRARY) {
    app.ctx.services.search.upsert({
      kind: document.kind,
      entityId: document.id,
      title: document.title,
      url: document.kind === "note" ? `/notes/${document.id}` : `/library/documents/${document.id}`,
      collection: document.collection ?? undefined,
      tags: [],
      sections: document.sections,
    });
  }
}

/** Builds the search-by-meaning index with the model that comes with Outpost, and waits for it. */
async function buildMeaningIndex(app: TestApp): Promise<void> {
  await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true });
  const first = (await app.api("GET", "/api/semantic/status")).body;
  if (first.reason) throw new Error(`Search by meaning is not available here: ${first.reason}`);
  // Switching it on starts the build by itself; asking again is harmless.
  await app.api("POST", "/api/semantic/index");
  for (let waited = 0; waited < 300; waited += 1) {
    const status = (await app.api("GET", "/api/semantic/status")).body;
    if (!status.indexing && status.embeddedChunks >= status.totalChunks && status.totalChunks > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The search-by-meaning index was not built within two and a half minutes.");
}

const median = (numbers: number[]) => {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
};
const seconds = (ms: number | null) => (ms === null ? "–" : (ms / 1000).toFixed(1));

function tableRow(model: string, mode: string, rows: Row[]): string {
  const counts: Tally = tally(rows);
  const asked = rows.filter((row) => row.judgement.asked && !row.reply.failure);
  const first = asked.map((row) => row.firstWordMs).filter((ms): ms is number => ms !== null);
  const total = asked.map((row) => row.totalMs);
  return [
    `\`${model}\``,
    mode === "keyword" ? "words" : "words and meaning",
    `${rows.filter((row) => row.judgement.retrieved === true).length} of ${counts.answerable}`,
    `${counts.correct} of ${counts.answerable}`,
    String(counts.correctUncited),
    String(counts.missed),
    String(counts.notRetrieved),
    String(counts.wrong),
    `${counts.refused} of ${counts.unanswerable}`,
    String(counts.madeUp),
    `${counts.invented} / ${counts.everything} / ${counts.afterRefusal} / ${counts.none}`,
    `${seconds(median(first))} (${seconds(first.length ? Math.max(...first) : null)})`,
    `${seconds(median(total))} (${seconds(total.length ? Math.max(...total) : null)})`,
    String(counts.cut),
    String(counts.failed),
  ].join(" | ");
}

const HEADER = [
  "| Model | Search | Search gave the passage that answers | Right, citing the passage | Right, passage not cited | Said it could not, though the passage was given | Said it could not; passage not found by search | Wrong | Declined rightly | Answered what the library does not hold | Citation faults: invented / cites all / cites after declining / none | First word, s: median (longest) | Whole answer, s: median (longest) | Cut short | Failed |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
].join("\n");

/** Judges saved replies again, and prints the table they now make. */
function rejudge(file: string): void {
  const saved = JSON.parse(fs.readFileSync(file, "utf8")) as Array<Omit<Row, "question" | "judgement"> & { id: string }>;
  const rows: Row[] = saved.flatMap((row) => {
    const question = QUESTIONS.find((entry) => entry.id === row.id);
    return question ? [{ ...row, question, judgement: judge(question, row.reply) }] : [];
  });
  const groups = [...new Set(rows.map((row) => `${row.model}\n${row.mode}`))].map((key) => key.split("\n") as [string, string]);
  const runsSaved = Math.max(0, ...rows.map((row) => row.run));
  console.log(`Judged again from ${file}: ${rows.length} replies, ${runsSaved === 1 ? "one run" : `${runsSaved} runs`} of the set.\n`);
  console.log(HEADER);
  for (const [model, mode] of groups) {
    console.log(
      `| ${tableRow(
        model,
        mode,
        rows.filter((row) => row.model === model && row.mode === mode),
      )} |`,
    );
  }
}

async function main(): Promise<void> {
  if (options.rejudge) return rejudge(options.rejudge);
  const app = await createTestApp();
  const all: Row[] = [];
  try {
    await app.app.listen({ port: 0, host: "127.0.0.1" });
    const origin = `http://127.0.0.1:${(app.app.server.address() as AddressInfo).port}`;
    seed(app);
    const version = await fetch(`${options.server!.replace(/\/v1\/?$/, "")}/api/version`)
      .then(async (response) => (response.ok ? ((await response.json()) as { version?: string }).version : undefined))
      .catch(() => undefined);
    console.log(
      `Answers evaluation, ${new Date().toISOString().slice(0, 10)}. ${questions.length} questions (${questions.filter((question) => question.answeredBy).length} the library answers, ${questions.filter((question) => !question.answeredBy).length} it does not), ${LIBRARY.length} documents, ${app.ctx.services.search.stats().chunks} passages. Model server: ${options.server}${version ? `, Ollama ${version}` : ""}. Runs: ${runs}.`,
    );
    if (modes.includes("hybrid")) await buildMeaningIndex(app);

    for (const model of models) {
      const saved = await app.api("PATCH", "/api/settings", {
        "answers.enabled": true,
        "answers.endpoint": options.server,
        "answers.model": model,
      });
      if (saved.status !== 200) throw new Error(`Could not set the model server: ${JSON.stringify(saved.body)}`);
      // The first request loads the model into memory. It is asked for one word first, so that loading is not timed as answering.
      const warm = (await app.api("POST", "/api/answers/test")).body as { ok: boolean; message: string; tookMs: number };
      if (!warm.ok) throw new Error(`${model} did not answer a one-word request: ${warm.message}`);
      console.log(
        `\n${model}: answered a one-word request in ${seconds(warm.tookMs)} s (this includes loading it, when it was not in memory).`,
      );
      for (const mode of modes) {
        for (let run = 1; run <= runs; run += 1) {
          for (const question of questions) {
            const asked = await ask(origin, question, mode);
            const judgement = judge(question, asked.reply);
            all.push({ model, mode, run, question, judgement, ...asked });
            if (!options.quiet) {
              const faults = Object.entries(judgement.faults)
                .filter(([, present]) => present)
                .map(([name]) => name);
              console.log(
                `  ${mode.padEnd(7)} ${String(run)} ${question.id.padEnd(20)} ${judgement.verdict.padEnd(15)} ${seconds(asked.firstWordMs).padStart(5)} ${seconds(asked.totalMs).padStart(5)} s  given ${asked.reply.given.length}${judgement.retrieved === false ? " (not the one that answers)" : ""}${faults.length ? `  faults: ${faults.join(", ")}` : ""}${asked.reply.cutShort ? "  cut" : ""}${asked.reply.failure ? `  ${asked.reply.failure}` : ""}`,
              );
              console.log(`      ${asked.reply.text.replace(/\s+/g, " ").trim().slice(0, 230) || `(${asked.reply.outcome})`}`);
            }
          }
        }
      }
    }
  } finally {
    await app.close();
  }

  console.log(`\n${HEADER}`);
  for (const model of models) {
    for (const mode of modes) {
      console.log(
        `| ${tableRow(
          model,
          mode,
          all.filter((row) => row.model === model && row.mode === mode),
        )} |`,
      );
    }
  }
  console.log(
    `\nEach cell counts over ${runs === 1 ? "one run" : `${runs} runs`} of the set. Citation faults are counted over the answers a model wrote, as shown to the person.`,
  );
  if (options.json) {
    fs.writeFileSync(
      options.json,
      JSON.stringify(
        all.map(({ question, ...row }) => ({ id: question.id, question: question.question, ...row })),
        null,
        2,
      ),
    );
  }
}

await main();
