/**
 * The search evaluation set (scripts/search-eval) against its fixture library and the
 * recorded answers of 37 reference collections. Writes the tables to the file named by
 * SEARCH_EVAL_OUT: the whole search, the same with search by meaning on (when the built-in
 * model's files are here), and the reference collections on their own as the search screen
 * gets them. Fails if the measures fall below what they are.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error: a plain JavaScript module shared with scripts/search-eval.mjs
import { library } from "../../../scripts/search-eval/library.mjs";
// @ts-expect-error: as above
import * as metrics from "../../../scripts/search-eval/metrics.mjs";
// @ts-expect-error: as above
import { formatReference, measureReference, readReference, summariseReference } from "../../../scripts/search-eval/reference-stream.mjs";
import { builtInInstallation, defaultModelDir } from "../src/modules/semantic/built-in-model.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { type SlowKiwix, startSlowKiwix, uuidFor, writeArchives } from "./slow-kiwix.ts";

interface Query {
  q: string;
  grades: Record<string, number>;
  pi: string[];
  sets?: string[];
  nonsense?: boolean;
}
interface Row {
  q: string;
  grades: number[];
  ideal: number[];
  expects: boolean;
  count: number;
  ms: number;
  titles: string[];
  sets: string[];
  /** Results found by meaning alone ("Similar in meaning"). */
  byMeaningAlone: number;
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

const { formatSummary, formatTable, foundByWords, gradeById, gradeByPattern, loadQueries, summarise } = metrics;
/** The first household questions, and the everyday searches tried on a Raspberry Pi (queries.json `sets`). */
const household = (rows: Row[]) => rows.filter((row) => !row.sets.length || row.sets.includes("household"));
const everyday = (rows: Row[]) => rows.filter((row) => row.sets.includes("everyday"));
/** What five people asked in the persona tests of 24 November 2026, keyboard-mashing included. */
const persona = (rows: Row[]) => rows.filter((row) => row.sets.includes("persona"));
const modelPresent = builtInInstallation(defaultModelDir()).installed;

describe("search quality on the household evaluation set", () => {
  let app: TestApp;
  let kiwix: SlowKiwix;
  const rows: Row[] = [];
  /** The same searches with search by meaning on, when the built-in model is here. */
  const meaningRows: Row[] = [];
  const keywordAgain: Row[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: rows of a plain JavaScript module
  const referenceRows: any[] = [];
  let evaluate: (into: Row[]) => Promise<void>;
  /** Set once the first hook has finished: the passes with search by meaning build on what it set up. */
  let keywordDone = false;

  // Each pass over the questions is a hundred searches, each asking 37 reference collections: some 15 s on a
  // quiet machine, and several times that on one running every other test file too. The keyword passes are
  // set up here and the passes with search by meaning in a hook of their own (below), each with room for a
  // loaded machine: together, in one hook, they took 75 s of its 120 on a quiet one.
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
    evaluate = async (into: Row[]) => {
      for (const query of loadQueries() as Query[]) {
        const started = performance.now();
        let { body } = await app.api("GET", `/api/search?q=${encodeURIComponent(query.q)}&limit=20`);
        const ms = performance.now() - started;
        // Nothing found by the words and a word offered in its place: a person would take the offer, so that is what is graded.
        const followed = !foundByWords(body.results) && body.didYouMean ? (body.didYouMean.query as string) : null;
        if (followed) ({ body } = await app.api("GET", `/api/search?q=${encodeURIComponent(followed)}&limit=20`));
        const results = body.results as Array<{ kind: string; entityId: string; title: string; sources: string[] }>;
        const ideal = [...Object.values(query.grades), ...pool.map((hit) => gradeByPattern(query, hit))].filter((value) => value > 0);
        into.push({
          q: followed ? `${query.q} → ${followed}` : query.q,
          grades: results.map((result) => grade(query, result)),
          ideal,
          expects: ideal.length > 0,
          count: results.length,
          ms,
          titles: results.map((result) => (result.kind === "reference" ? `[ref] ${result.title}` : result.title)),
          sets: query.sets ?? [],
          byMeaningAlone: results.filter((result) => result.sources.every((source) => source === "semantic")).length,
        });
      }
    };
    await evaluate(rows);
    // The reference collections on their own, as the search screen asks for them, one search after another.
    const base = await app.app.listen({ port: 0, host: "127.0.0.1" });
    for (const query of loadQueries() as Query[]) {
      if (query.pi.length === 0) continue;
      referenceRows.push(measureReference(query, await readReference(base, query.q)));
    }
    keywordDone = true;
  }, 180_000);
  afterAll(async () => {
    // A file, not the console: the test runner keeps a passing test's output to itself.
    if (process.env.SEARCH_EVAL_OUT) {
      const withMeaning = meaningRows.length
        ? `${formatTable(meaningRows)}\n\n${formatSummary("fixture library, keyword again", summarise(keywordAgain))}\n${formatSummary("fixture library, with search by meaning", summarise(meaningRows))}\n${formatSummary("fixture library, with search by meaning, household questions", summarise(household(meaningRows)))}\n${formatSummary("fixture library, with search by meaning, everyday searches", summarise(everyday(meaningRows)))}\n${formatSummary("fixture library, with search by meaning, persona questions", summarise(persona(meaningRows)))}\nFound by meaning alone for keyboard-mashing: ${persona(
            meaningRows,
          )
            .filter((row) => !row.expects)
            .map((row) => `${row.q} ${row.byMeaningAlone}`)
            .join(", ")}\n\n`
        : "";
      writeFileSync(
        process.env.SEARCH_EVAL_OUT,
        `${formatTable(rows)}\n\n${formatSummary("fixture library", summarise(rows))}\n${formatSummary("fixture library, household questions", summarise(household(rows)))}\n${formatSummary("fixture library, everyday searches", summarise(everyday(rows)))}\n${formatSummary("fixture library, persona questions", summarise(persona(rows)))}\n\n${withMeaning}${formatReference("recorded reference collections", referenceRows)}\n`,
      );
    }
    await app?.close();
    await kiwix?.close();
  });

  it("puts a useful answer in the first three for nearly every question, and finds something for every one", () => {
    const summary = summarise(rows);
    expect(summary.success3).toBeGreaterThanOrEqual(0.95);
    expect(summary.zeroResultRate).toBe(0);
    expect(summarise(household(rows)).ndcg5).toBeGreaterThanOrEqual(0.81);
    // Harder: graded against every article the Pi's 37 collections hold for them, most of which no list can show.
    expect(summarise(everyday(rows)).ndcg5).toBeGreaterThanOrEqual(0.72);
  });

  it("answers the everyday car searches with vehicle sources, not a radio manual that mentions a flat battery", () => {
    for (const q of ["car battery flat", "car battery dead", "car won't start"]) {
      const row = rows.find((candidate) => candidate.q === q)!;
      expect(
        row.grades.slice(0, 3).every((grade) => grade >= 2),
        `${q}: ${row.titles.slice(0, 3).join(" | ")}`,
      ).toBe(true);
      expect(row.titles.slice(0, 5)).not.toContain("Best practices");
    }
  });

  it("puts a useful reference article in the first three for nearly every question, with no list pages", () => {
    const summary = summariseReference(referenceRows);
    expect(summary.success3).toBeGreaterThanOrEqual(0.8);
    expect(
      referenceRows.flatMap((row) => row.titles).filter((title: string) => /questions\/tagged|Highest Voted|Main Page/.test(title)),
    ).toEqual([]);
  });

  it("answers the persona tests' medicine and first aid questions with pages about them", () => {
    const medicine = rows.find((row) => row.q === "can I take paracetamol and ibuprofen together")!;
    // The painkillers' own page and the encyclopaedia's article on the two together, before a page on another medicine.
    expect(medicine.grades.slice(0, 2), medicine.titles.join(" | ")).toEqual([3, 3]);
    const bleeding = rows.find((row) => row.q === "bleeding wont stop")!;
    expect(bleeding.titles.slice(0, 5).filter((title) => /brake|keg/i.test(title))).toEqual([]);
    expect(bleeding.titles.slice(0, 3)).toContain("First aid manual");
    // Low beside the others: "how to pick a lock" and "sunrise tomorrow" have no answer in the recorded collections.
    expect(summarise(persona(rows)).ndcg5).toBeGreaterThanOrEqual(0.6);
  });

  it("answers the owner's question with the car battery page first", () => {
    const row = rows.find((candidate) => candidate.q === "How to change car battery")!;
    expect(row.titles[0]).toBe("Car maintenance manual");
  });

  // With the model that comes with Outpost, when its files are here: the index is built, then the same searches.
  describe.skipIf(!modelPresent)("with search by meaning on", () => {
    // biome-ignore lint/suspicious/noDuplicateTestHooks: a hook of its own on purpose, with its own time (see the first)
    beforeAll(async () => {
      if (!keywordDone) throw new Error("Not tried: the keyword passes before these did not finish (see the first hook's error).");
      // The keyword searches again first: a second pass differs a little from the first (reference collections
      // answer from what they have read since), and that, not the first, is what meaning is compared with.
      await evaluate(keywordAgain);
      await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true });
      await app.ctx.services.semantic.settled();
      // Building the index is real work (some 15 s on a quiet machine). whenIdle gives up quietly after its
      // timeout, so the index is checked to be built rather than taken to be: graded on half an index, the
      // measures below would fail for a reason that is not search's.
      await app.ctx.jobs.whenIdle(150_000);
      const built = app.ctx.jobs.list({ types: ["semantic.index"] });
      expect(built.length).toBeGreaterThan(0);
      expect(built.filter((job) => job.state !== "succeeded").map((job) => `${job.state}: ${job.error ?? ""}`)).toEqual([]);
      await evaluate(meaningRows);
    }, 300_000);

    it("does at least as well with search by meaning on, and puts the first aid manual first for rescue breaths", () => {
      const summary = summarise(meaningRows);
      expect(summary.success3).toBeGreaterThanOrEqual(0.95);
      expect(summary.zeroResultRate).toBe(0);
      expect(summarise(household(meaningRows)).ndcg5).toBeGreaterThanOrEqual(summarise(household(keywordAgain)).ndcg5);
      expect(meaningRows.find((row) => row.q === "rescue breaths for a child")!.titles[0]).toBe("First aid manual");
    });

    it("finds nothing by meaning alone for keyboard-mashing, with search by meaning on", () => {
      const mashing = persona(meaningRows).filter((row) => !row.expects);
      expect(mashing.length).toBeGreaterThanOrEqual(4);
      for (const row of mashing) expect(row.byMeaningAlone, `${row.q}: ${row.titles.join(" | ")}`).toBe(0);
    });
  });
});
