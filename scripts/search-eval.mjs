#!/usr/bin/env node
/**
 * Runs the household evaluation set (scripts/search-eval/queries.json) against a
 * running Outpost and prints a table: each question, nDCG@5 and its first results, then
 * nDCG@5, success@3, the zero-result rate and p95 time over the set. Results are graded
 * by the patterns in the set, so any library can be measured. Only GET requests are sent.
 *
 *   node scripts/search-eval.mjs [base URL] [--rescore] [--json file]
 *
 * --rescore also takes the candidates the server returns for the words that matter
 * (and, when they can be said another way, for that too: "tire pressure" for "tyre
 * pressure") and puts them in order with the scorer of this checkout
 * (apps/server/src/modules/search/score.ts) and its mild priors for the kind of question
 * (intent.ts), offline: a way to see what a new ranking
 * would do to a library before it is installed. A server that offers "Did you mean" for
 * a search that found nothing is taken at its word, as a person would.
 * The fixture library and its numbers are in the server's tests (search-quality.test.ts).
 *
 * --reference measures the reference collections instead, as the search screen gets them
 * (scripts/search-eval/reference-stream.mjs): when the first article and the first useful
 * one came, when the search ended, and how good the list shown is; and the time of
 * Outpost's own results asked without them. Searches run one after another, as a person's do.
 */
import { writeFileSync } from "node:fs";
import { adjusted, adjustFor, intentOf } from "../apps/server/src/modules/search/intent.ts";
import { alternateQuery, expandQuery, parseQuery, plainQuery } from "../apps/server/src/modules/search/query.ts";
import { inverseFrequency, reasonFor, scoreFields, scoringTerms } from "../apps/server/src/modules/search/score.ts";
import { formatSummary, formatTable, gradeByPattern, loadQueries, percentile, resultText, summarise } from "./search-eval/metrics.mjs";
import { formatReference, measureReference, readReference } from "./search-eval/reference-stream.mjs";

const args = process.argv.slice(2);
const base = (args.find((arg) => /^https?:/.test(arg)) ?? "http://localhost:8080").replace(/\/$/, "");
const rescoreToo = args.includes("--rescore");
const jsonAt = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const PLACES = new Set(["map-feature", "repeater"]);

async function get(path) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return { body: await response.json(), ms: performance.now() - started };
}

const search = (q, limit = 20) => get(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);

/** Items holding a word, as the server counts them, for weighing words by rarity. */
const counted = new Map();
async function itemsHolding(term) {
  if (!counted.has(term)) {
    // Without reference collections, which do not count toward rarity and are slow to ask.
    counted.set(term, (await get(`/api/search?q=${encodeURIComponent(`"${term}"`)}&limit=1&reference=later`)).body.total);
  }
  return counted.get(term);
}

async function rescore(q) {
  const { parsed } = expandQuery(parseQuery(q));
  const { body, ms } = await search(plainQuery(parsed) || q, 60);
  const alternate = alternateQuery(parsed);
  if (alternate) {
    // The same said the other way: its candidates join the first, once each.
    const seen = new Set(body.results.map((result) => `${result.kind}:${result.entityId}`));
    for (const result of (await search(alternate, 60)).body.results) {
      if (!seen.has(`${result.kind}:${result.entityId}`)) body.results.push(result);
    }
  }
  const stats = (await get("/api/search/stats")).body;
  const items = Object.values(stats.entities).reduce((sum, n) => sum + n, 0);
  // A term said several ways is as common as its commonest way.
  const weights = await Promise.all(
    parsed.required.map(async (term, index) =>
      Math.max(...(await Promise.all([term, ...(parsed.alternatives?.[index] ?? [])].map((form) => itemsHolding(form))))),
    ),
  );
  const terms = scoringTerms(parsed, (_, index) => (parsed.required.length < 2 ? 1 : inverseFrequency(items, weights[index])));
  const intent = intentOf({
    words: parsed.required.flatMap((term, index) => [term, ...(parsed.alternatives?.[index] ?? [])]),
    ignored: parsed.ignored ?? [],
  });
  const results = body.results
    .filter((result) => !PLACES.has(result.kind))
    .map((result) => {
      const text = resultText(result);
      const parts = scoreFields(terms, { title: result.title, heading: result.subtitle, text });
      const { factor } = adjustFor(intent, {
        title: result.title,
        collection: result.collection,
        tags: result.tags ?? [],
        text,
        article: result.kind === "reference",
      });
      return { ...result, score: adjusted(parts.score, factor), why: reasonFor(parts), coverage: parts.coverage };
    })
    .filter((result) => parsed.required.length < 2 || result.coverage >= 0.5)
    .sort((a, b) => b.score - a.score);
  return { results, ms };
}

const queries = loadQueries().filter((query) => query.pi.length > 0);

if (args.includes("--reference")) {
  const rows = [];
  const own = [];
  const ownServer = [];
  for (const query of queries) {
    const { body, ms } = await get(`/api/search?q=${encodeURIComponent(query.q)}&limit=20&reference=later`);
    own.push(ms);
    ownServer.push(body.tookMs);
    rows.push(measureReference(query, await readReference(base, query.q)));
    process.stderr.write(".");
  }
  process.stderr.write("\n");
  console.log(formatReference(`${base}, reference collections`, rows));
  console.log(
    `${base}, own results without reference collections: p95 ${Math.round(percentile(ownServer, 0.95))} ms at the server, ${Math.round(percentile(own, 0.95))} ms here`,
  );
  if (jsonAt) writeFileSync(jsonAt, JSON.stringify({ reference: rows, ownMs: own, ownServerMs: ownServer }, null, 1));
  process.exit(0);
}
const before = [];
const after = [];
for (const query of queries) {
  let { body, ms } = await search(query.q);
  if (body.results.length === 0 && body.didYouMean) ({ body } = await search(body.didYouMean.query));
  before.push({ query, results: body.results, ms });
  if (rescoreToo) after.push({ query, ...(await rescore(query.q)) });
  process.stderr.write(".");
}
process.stderr.write("\n");

/** The best grades to be had: all that either run found. */
function rows(runs, others = []) {
  return runs.map((run, index) => {
    // The same article can come back twice (two copies of an archive); it is graded once.
    const keys = new Set();
    run.results = run.results.filter((result) => {
      const key = `${result.kind}:${result.entityId}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    const grades = run.results.map((result) => gradeByPattern(run.query, result));
    const pool = [...run.results, ...(others[index]?.results ?? [])];
    // One grade per item, the best it earned: the two runs can show it with different snippets.
    const seen = new Map();
    for (const result of pool) {
      const key = `${result.kind}:${result.entityId}`;
      seen.set(key, Math.max(seen.get(key) ?? 0, gradeByPattern(run.query, result)));
    }
    const ideal = [...seen.values()].filter((grade) => grade > 0);
    return {
      q: run.query.q,
      grades,
      ideal,
      expects: true,
      count: run.results.length,
      ms: run.ms,
      titles: run.results.map((result) => (result.kind === "reference" ? `[ref] ${result.title}` : result.title)),
    };
  });
}

const now = rows(before, after);
console.log(formatTable(now));
console.log(`\n${formatSummary(`${base}, as it ranks`, summarise(now))}`);
if (rescoreToo) {
  const next = rows(after, before);
  console.log(`\n${formatTable(next)}`);
  console.log(`\n${formatSummary(`${base}, its candidates in the new order (offline)`, summarise(next))}`);
  console.log(formatSummary(`${base}, as it ranks`, summarise(now)));
}
if (jsonAt) writeFileSync(jsonAt, JSON.stringify({ before: now, after: rescoreToo ? rows(after, before) : null }, null, 1));
