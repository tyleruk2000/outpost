/**
 * The search evaluation set (scripts/search-eval) against its fixture library and the
 * recorded answers of 37 reference collections. Writes the tables to the file named by
 * SEARCH_EVAL_OUT: the whole search, and the reference collections on their own as the
 * search screen gets them. Fails if the measures fall below what they are.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error: a plain JavaScript module shared with scripts/search-eval.mjs
import { library } from "../../../scripts/search-eval/library.mjs";
// @ts-expect-error: as above
import { formatSummary, formatTable, gradeById, gradeByPattern, loadQueries, summarise } from "../../../scripts/search-eval/metrics.mjs";
// @ts-expect-error: as above
import { formatReference, measureReference, readReference, summariseReference } from "../../../scripts/search-eval/reference-stream.mjs";
import { createTestApp, type TestApp } from "./helpers.ts";
import { type SlowKiwix, startSlowKiwix, uuidFor, writeArchives } from "./slow-kiwix.ts";

interface Query {
  q: string;
  grades: Record<string, number>;
  pi: string[];
}
interface Row {
  q: string;
  grades: number[];
  ideal: number[];
  expects: boolean;
  count: number;
  ms: number;
  titles: string[];
}
interface Recorded {
  collections: Array<{
    title: string;
    description: string | null;
    category: string | null;
    tags: string | null;
    language: string | null;
    hits: Array<{ title: string; path: string; snippet: string }>;
  }>;
}

const recorded = JSON.parse(readFileSync(new URL("../../../scripts/search-eval/reference.json", import.meta.url), "utf8")) as Recorded;
const asResult = (hit: { title: string; snippet: string }) => ({ title: hit.title, passages: [{ segments: [{ text: hit.snippet }] }] });
/** Library items by their grades; reference articles by the patterns, since their ids are made on import. */
const grade = (query: Query, result: { kind: string }) =>
  result.kind === "reference" ? gradeByPattern(query, result) : gradeById(query, result);

describe("search quality on the household evaluation set", () => {
  let app: TestApp;
  let kiwix: SlowKiwix;
  const rows: Row[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: rows of a plain JavaScript module
  const referenceRows: any[] = [];

  beforeAll(async () => {
    const books = recorded.collections.map((collection, index) => ({
      uuid: uuidFor(index + 1),
      name: `recorded-${String(index + 1).padStart(2, "0")}`,
      title: collection.title,
      delayMs: 0,
      articles: [],
      hits: collection.hits,
    }));
    kiwix = await startSlowKiwix({ books, threads: 8 });
    app = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url });
    const location = app.ctx.services.storage.getDefault();
    const { collections } = app.ctx.services;
    for (const [index, relPath] of writeArchives(location.path, books).entries()) {
      const { body } = await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath, title: books[index]!.title });
      // What the archive says it is, as a real library knows it: what reference collections are searched first is chosen by it.
      const about = recorded.collections[index]!;
      const row = collections.get(body.collection.id)!;
      collections.update(row.id, {
        description: about.description,
        category: about.category,
        meta: { ...row.meta, kiwix: { ...(row.meta.kiwix ?? {}), tags: about.tags ?? undefined, language: about.language ?? undefined } },
      });
    }
    for (const entity of library()) app.ctx.services.search.upsert(entity);
    const pool = recorded.collections.flatMap((collection) => collection.hits).map(asResult);
    for (const query of loadQueries() as Query[]) {
      const started = performance.now();
      let { body } = await app.api("GET", `/api/search?q=${encodeURIComponent(query.q)}&limit=20`);
      const ms = performance.now() - started;
      // Nothing found and a word offered in its place: a person would take the offer, so that is what is graded.
      const followed = body.results.length === 0 && body.didYouMean ? (body.didYouMean.query as string) : null;
      if (followed) ({ body } = await app.api("GET", `/api/search?q=${encodeURIComponent(followed)}&limit=20`));
      const results = body.results as Array<{ kind: string; entityId: string; title: string }>;
      const ideal = [...Object.values(query.grades), ...pool.map((hit) => gradeByPattern(query, hit))].filter((value) => value > 0);
      rows.push({
        q: followed ? `${query.q} → ${followed}` : query.q,
        grades: results.map((result) => grade(query, result)),
        ideal,
        expects: ideal.length > 0,
        count: results.length,
        ms,
        titles: results.map((result) => (result.kind === "reference" ? `[ref] ${result.title}` : result.title)),
      });
    }
    // The reference collections on their own, as the search screen asks for them, one search after another.
    const base = await app.app.listen({ port: 0, host: "127.0.0.1" });
    for (const query of loadQueries() as Query[]) {
      if (query.pi.length === 0) continue;
      referenceRows.push(measureReference(query, await readReference(base, query.q)));
    }
    // A file, not the console: the test runner keeps a passing test's output to itself.
    if (process.env.SEARCH_EVAL_OUT) {
      writeFileSync(
        process.env.SEARCH_EVAL_OUT,
        `${formatTable(rows)}\n\n${formatSummary("fixture library", summarise(rows))}\n\n${formatReference("recorded reference collections", referenceRows)}\n`,
      );
    }
  }, 60_000);
  afterAll(async () => {
    await app.close();
    await kiwix.close();
  });

  it("puts a useful answer in the first three for nearly every question, and finds something for every one", () => {
    const summary = summarise(rows);
    expect(summary.success3).toBeGreaterThanOrEqual(0.95);
    expect(summary.zeroResultRate).toBe(0);
    expect(summary.ndcg5).toBeGreaterThanOrEqual(0.8);
  });

  it("puts a useful reference article in the first three for nearly every question, with no list pages", () => {
    const summary = summariseReference(referenceRows);
    expect(summary.success3).toBeGreaterThanOrEqual(0.8);
    expect(
      referenceRows.flatMap((row) => row.titles).filter((title: string) => /questions\/tagged|Highest Voted|Main Page/.test(title)),
    ).toEqual([]);
  });

  it("answers the owner's question with the car battery page first", () => {
    const row = rows.find((candidate) => candidate.q === "How to change car battery")!;
    expect(row.titles[0]).toBe("Car maintenance manual");
  });
});
