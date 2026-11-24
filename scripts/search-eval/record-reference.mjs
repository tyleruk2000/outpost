#!/usr/bin/env node
/**
 * Records what a real library's reference collections answer to the evaluation set, into
 * reference.json, for the server's tests to search offline (search-quality.test.ts).
 * Only GET requests are sent, to a running Outpost:
 *
 *   node scripts/search-eval/record-reference.mjs http://outpost.local:8080 [--set everyday]
 *
 * For each question and each collection it asks for the full text (ten results, for the
 * words that matter and once more said another way) and for titles (kiwix-serve's title
 * search, for the words a title would hold), three requests at a time. What is found is
 * added to what reference.json already holds, once each, with the start of its snippet.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { alternateQuery, expandQuery, parseQuery, plainQuery, titleWords } from "../../apps/server/src/modules/search/query.ts";
import { loadQueries } from "./metrics.mjs";

const base = (process.argv.find((arg) => /^https?:/.test(arg)) ?? "http://localhost:8080").replace(/\/$/, "");
const file = new URL("./reference.json", import.meta.url);
const recorded = JSON.parse(readFileSync(file, "utf8"));

async function get(path) {
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

const { books } = await get("/api/kiwix/books");
const { collections } = await get("/api/collections?kind=zim");
const tasks = [];
// `--set everyday` records only the questions of that set (queries.json), for a set newly added.
const onlySet = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : null;
for (const query of loadQueries().filter((query) => !onlySet || query.sets?.includes(onlySet))) {
  if (query.pi.length === 0) continue;
  const { parsed } = expandQuery(parseQuery(query.q));
  const patterns = [plainQuery(parsed) || query.q, alternateQuery(parsed)].filter(Boolean);
  const titles = titleWords(parsed).join(" ");
  for (const book of books) {
    for (const pattern of patterns) tasks.push({ book, kind: "search", q: pattern });
    if (titles) tasks.push({ book, kind: "suggest", q: titles });
  }
}

function entryFor(book) {
  let entry = recorded.collections.find((collection) => collection.title === book.title);
  if (!entry) {
    const about = collections.find((collection) => collection.id === book.collectionId);
    entry = {
      title: book.title,
      description: about?.description ?? null,
      category: about?.category ?? null,
      tags: about?.meta?.kiwix?.tags ?? null,
      language: about?.meta?.kiwix?.language ?? about?.language ?? null,
      hits: [],
    };
    recorded.collections.push(entry);
  }
  return entry;
}

let done = 0;
let added = 0;
async function work() {
  for (let task = tasks.shift(); task; task = tasks.shift()) {
    const path = `/api/kiwix/books/${task.book.collectionId}/${task.kind}?q=${encodeURIComponent(task.q)}${task.kind === "search" ? "&limit=10" : ""}`;
    const answer = await get(path).catch(() => null);
    const hits = task.kind === "search" ? (answer?.results ?? []) : (answer?.suggestions ?? []);
    const entry = entryFor(task.book);
    for (const hit of hits) {
      if (entry.hits.some((other) => other.path === hit.path)) continue;
      entry.hits.push({ title: hit.title, path: hit.path, snippet: (hit.snippet ?? "").slice(0, 160).replace(/\p{Cs}/gu, "") });
      added += 1;
    }
    done += 1;
    if (done % 100 === 0) process.stderr.write(`${done} asked, ${added} added\n`);
  }
}
await Promise.all([work(), work(), work()]);
recorded.collections.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(file, `${JSON.stringify(recorded, null, 2)}\n`);
console.log(`${added} hits added; ${recorded.collections.reduce((sum, collection) => sum + collection.hits.length, 0)} in all.`);
