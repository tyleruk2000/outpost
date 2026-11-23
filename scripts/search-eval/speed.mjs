#!/usr/bin/env node
/**
 * How fast Outpost's own results come on a library the size of a Raspberry Pi's: 440
 * documents (twelve of them long books, three with "water" in the title), 1,353 notes and
 * 1,058 contacts, about 57,600 passages, written from the system's word list
 * (/usr/share/dict/words) with the frequencies of real text (Zipf), the household's words
 * placed among them at plausible ranks. Then the evaluation set's searches, timed at the
 * server, as the search screen asks them (reference collections apart).
 *
 *   node scripts/search-eval/speed.mjs build <folder>     makes the library (once; about 15 s)
 *   node scripts/search-eval/speed.mjs run <folder> [n]   runs every search n times (default 3)
 *
 * With --meaning, search by meaning is on with the built-in model (its files must have been
 * fetched): every passage is given a vector first (random ones, made here in a moment, since
 * the library's words are random too), so each search embeds its question with the real model
 * and compares it with 57,600 vectors. With --building as well, 3,000 passages are left
 * without one, so the index build runs, with the real model, while the searches are timed.
 * The time each part takes is printed: words, the question's vector, comparing it.
 *
 * The folder is a data directory of its own; nothing else is touched. No network.
 */
import fs from "node:fs";
import { createTestApp } from "../../apps/server/test/helpers.ts";
import { library } from "./library.mjs";
import { loadQueries, percentile } from "./metrics.mjs";

const [mode, folder, times] = process.argv.slice(2);
if (!["build", "run"].includes(mode) || !folder) {
  console.error("node scripts/search-eval/speed.mjs build|run <folder> [times]");
  process.exit(2);
}

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

function vocabulary() {
  const dict = fs
    .readFileSync("/usr/share/dict/words", "utf8")
    .split("\n")
    .filter((word) => /^[a-z]{3,12}$/.test(word));
  const words = Array.from({ length: 30_000 }, () => dict[Math.floor(rand() * dict.length)]);
  const small =
    "the of and to a in is that for it as with was on be by at this are from or an which have not but they his had can all".split(" ");
  // A household's words, at about the rank they have in a library of manuals and guides.
  const placed = [
    ["water", 40],
    ["use", 60],
    ["power", 120],
    ["time", 30],
    ["car", 300],
    ["child", 400],
    ["battery", 600],
    ["food", 150],
    ["heat", 350],
    ["fire", 250],
    ["light", 200],
    ["change", 90],
    ["make", 50],
    ["safe", 220],
    ["kit", 1500],
    ["winter", 900],
    ["driving", 1100],
    ["generator", 2500],
    ["purify", 6000],
    ["rescue", 2000],
    ["breaths", 4000],
    ["cut", 300],
    ["store", 500],
    ["radio", 700],
    ["frequency", 1600],
    ["emergency", 800],
    ["first", 70],
    ["aid", 1300],
    ["burn", 1700],
    ["treat", 1200],
    ["tyre", 5000],
    ["tire", 3000],
    ["pressure", 650],
    ["petrol", 4500],
    ["bread", 2200],
    ["yeast", 5500],
    ["freezer", 4200],
    ["map", 1000],
    ["compass", 3800],
    ["knot", 3500],
    ["bowline", 15000],
    ["potato", 2800],
    ["outage", 9000],
    ["blackout", 8000],
  ];
  const all = [...small, ...words];
  for (const [word, rank] of placed) all.splice(rank, 0, word);
  return all;
}

const vocab = vocabulary();
const cumulative = [];
let sum = 0;
for (let rank = 1; rank <= vocab.length; rank += 1) {
  sum += 1 / rank ** 1.05;
  cumulative.push(sum);
}
const word = () => {
  const target = rand() * sum;
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] < target) low = middle + 1;
    else high = middle;
  }
  return vocab[low];
};
const words = (count) => Array.from({ length: count }, word).join(" ");

if (mode === "build") {
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const app = await createTestApp({}, folder, { voacapData: false });
  const { search } = app.ctx.services;
  let passages = 0;
  for (const entity of library()) passages += search.upsert(entity).chunks;
  for (let index = 0; index < 440; index += 1) {
    const pages = index < 12 ? 600 + Math.floor(rand() * 900) : 40 + Math.floor(rand() * 120);
    const title = index < 3 ? `${words(2)} water ${words(1)}` : words(2 + Math.floor(rand() * 4));
    const sections = Array.from({ length: pages }, (_, page) => ({
      page: page + 1,
      heading: rand() < 0.2 ? words(3) : "",
      text: words(140),
    }));
    const tags = rand() < 0.3 ? [word()] : [];
    passages += search.upsert({
      kind: "document",
      entityId: `doc-${index}`,
      title,
      url: `/library/documents/doc-${index}`,
      sections,
      tags,
    }).chunks;
  }
  for (let index = 0; index < 1353; index += 1) {
    const sections = [{ text: words(80 + Math.floor(rand() * 200)) }];
    passages += search.upsert({ kind: "note", entityId: `note-${index}`, title: words(3), url: `/notes/note-${index}`, sections }).chunks;
  }
  for (let index = 0; index < 1058; index += 1) {
    const sections = [{ text: words(12) }];
    passages += search.upsert({
      kind: "contact",
      entityId: `contact-${index}`,
      title: words(2),
      url: `/contacts/contact-${index}`,
      sections,
    }).chunks;
  }
  console.log(`${passages} passages in ${folder}`);
  await app.close();
} else {
  const meaning = process.argv.includes("--meaning");
  const building = process.argv.includes("--building");
  const app = await createTestApp({}, folder, { voacapData: false });
  const { sqlite } = app.ctx;
  const stages = { embed: [], compare: [] };
  if (meaning) {
    const { BUILT_IN_MODEL_ID } = await import("../../apps/server/src/modules/semantic/built-in-model.ts");
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO embedding_models (id, provider, model, dimensions, created_at) VALUES (?, 'built-in', 'all-MiniLM-L6-v2', 384, 0)",
      )
      .run(BUILT_IN_MODEL_ID);
    const missing = sqlite
      .prepare(
        "SELECT c.id, c.content_hash FROM chunks c LEFT JOIN embeddings m ON m.chunk_id = c.id AND m.model_id = ? WHERE c.text <> '' AND m.chunk_id IS NULL",
      )
      .raw()
      .all(BUILT_IN_MODEL_ID);
    const insert = sqlite.prepare("INSERT INTO embeddings (chunk_id, model_id, vector, content_hash, created_at) VALUES (?, ?, ?, ?, 0)");
    sqlite.transaction(() => {
      for (const [chunkId, hash] of missing) {
        const vector = Float32Array.from({ length: 384 }, () => rand() * 2 - 1);
        const norm = Math.hypot(...vector);
        for (let index = 0; index < 384; index += 1) vector[index] /= norm;
        insert.run(chunkId, BUILT_IN_MODEL_ID, Buffer.from(vector.buffer), hash);
      }
    })();
    // A build to run while searching: the last passages lose their vectors.
    sqlite
      .prepare("DELETE FROM embeddings WHERE model_id = ? AND chunk_id IN (SELECT id FROM chunks ORDER BY id DESC LIMIT ?)")
      .run(BUILT_IN_MODEL_ID, building ? 3000 : 0);
    // Each part of a search by meaning, timed where it happens.
    const { semantic } = app.ctx.services;
    const index = semantic.index;
    const query = index.query.bind(index);
    index.query = (...args) => {
      const started = performance.now();
      const hits = query(...args);
      stages.compare.push(performance.now() - started);
      return hits;
    };
    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true });
    await semantic.settled();
    // Switched on already in an earlier run: the build is asked for as Settings' button does.
    if (building) semantic.requestIndexing(true);
    const provider = semantic.provider();
    const embed = provider.embed.bind(provider);
    provider.embed = async (texts, kind, signal) => {
      const started = performance.now();
      const vectors = await embed(texts, kind, signal);
      if (kind === "query") stages.embed.push(performance.now() - started);
      return vectors;
    };
    if (building) await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log(`search by meaning on, ${index.count(BUILT_IN_MODEL_ID)} vectors${building ? ", index build running" : ""}`);
  }
  // A question asked a second time reuses its vector: each round asks it in other capitals, as a new question.
  let round = 0;
  const cased = (q) => (round % 2 ? q.toUpperCase() : q.toLowerCase()) + "?".repeat(Math.floor(round / 2));
  const ask = async (q) => (await app.api("GET", `/api/search?q=${encodeURIComponent(cased(q))}&limit=20&reference=later`)).body.tookMs;
  const queries = loadQueries().map((query) => query.q);
  for (const q of queries.slice(0, 3)) await ask(q);
  stages.embed.length = 0;
  stages.compare.length = 0;
  const timed = [];
  for (round = 1; round <= Number(times ?? 3); round += 1) for (const q of queries) timed.push({ q, ms: await ask(q) });
  const ms = timed.map((each) => each.ms);
  console.log(
    `own results at the server: median ${percentile(ms, 0.5)} ms, p95 ${percentile(ms, 0.95)} ms, slowest ${Math.max(...ms)} ms (${timed.length} searches)`,
  );
  if (building) {
    const { BUILT_IN_MODEL_ID } = await import("../../apps/server/src/modules/semantic/built-in-model.ts");
    const status = (await app.api("GET", "/api/semantic/status")).body;
    console.log(
      `  the build was still running at the end: ${status.indexing}, ${app.ctx.services.semantic.index.count(BUILT_IN_MODEL_ID)} vectors`,
    );
  }
  if (meaning) {
    const show = (list) => `median ${percentile(list, 0.5).toFixed(1)} ms, p95 ${percentile(list, 0.95).toFixed(1)} ms`;
    console.log(`  the question's vector: ${show(stages.embed)}; comparing it with every vector: ${show(stages.compare)}`);
  }
  for (const each of timed.sort((a, b) => b.ms - a.ms).slice(0, 5)) console.log(`  ${String(each.ms).padStart(5)} ms  ${each.q}`);
  await app.close();
}
process.exit(0);
