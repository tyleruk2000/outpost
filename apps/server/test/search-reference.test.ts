/**
 * Search in two parts: what Outpost holds at once, and what reference collections hold
 * as each of them answers. kiwix-serve is stood in for by one whose archives are slow.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { referenceTimings, resultsFromEach } from "../src/modules/kiwix/index.ts";
import { createSearchQueue } from "../src/modules/kiwix/search-queue.ts";
import { inTurn, missingMessage, referenceBudgets } from "../src/modules/search/service.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { type SlowBook, type SlowKiwix, startSlowKiwix, uuidFor, writeArchives } from "./slow-kiwix.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanups: Array<() => Promise<void> | void> = [];
const timings = { ...referenceTimings };
const budgets = { ...referenceBudgets };
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  Object.assign(referenceTimings, timings);
  Object.assign(referenceBudgets, budgets);
});

const ARTICLES = ["Water", "Watermill", "Water wheel", "Wave", "Walnut"];
/** Books named and sized in the order given, so the first is the smallest and is asked first. */
const book = (index: number, delayMs: number, extra: Partial<SlowBook> = {}): SlowBook => ({
  uuid: uuidFor(index),
  name: `book-${String(index).padStart(2, "0")}`,
  title: `Book ${String(index).padStart(2, "0")}`,
  delayMs,
  articles: ARTICLES,
  ...extra,
});

interface World {
  app: TestApp;
  kiwix: SlowKiwix;
  /** The server's address on a real socket, for requests that are dropped part of the way. */
  base: string;
  ids: string[];
}

async function world(books: SlowBook[], env: Record<string, string> = {}): Promise<World> {
  const kiwix = await startSlowKiwix({ books });
  cleanups.push(() => kiwix.close());
  const app = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url, ...env });
  cleanups.push(() => app.close());
  const location = app.ctx.services.storage.getDefault();
  const ids: string[] = [];
  for (const [index, relPath] of writeArchives(location.path, books).entries()) {
    const imported = await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath, title: books[index]!.title });
    expect(imported.status).toBe(200);
    ids.push(imported.body.collection.id);
  }
  const { search } = app.ctx.services;
  search.upsert({ kind: "note", entityId: "n1", title: "Water kit", url: "/notes/n1", sections: [{ text: "Carry water and a filter." }] });
  search.upsert({
    kind: "document",
    entityId: "d1",
    title: "Water purification",
    url: "/library/documents/d1",
    sections: [{ page: 1, text: "Boil water for one minute." }],
  });
  const base = await app.app.listen({ port: 0, host: "127.0.0.1" });
  return { app, kiwix, base, ids };
}

// biome-ignore lint/suspicious/noExplicitAny: tests read lines loosely and assert on them
type Line = Record<string, any>;
/** Reads the reference part to its end, noting when each line came. */
async function readReference(base: string, q: string, signal?: AbortSignal): Promise<Array<Line & { at: number }>> {
  const started = performance.now();
  const response = await fetch(`${base}/api/search/reference?q=${encodeURIComponent(q)}`, { signal });
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const lines: Array<Line & { at: number }> = [];
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    for (let at = buffer.indexOf("\n"); at !== -1; at = buffer.indexOf("\n")) {
      lines.push({ ...JSON.parse(buffer.slice(0, at)), at: performance.now() - started });
      buffer = buffer.slice(at + 1);
    }
  }
  return lines;
}

describe("the queue in front of kiwix-serve", () => {
  const options = { concurrency: 2, limitMs: 80, ceilingMs: 400, remember: 10, rememberMs: 60_000 };
  /** A search that takes a while and says when it began and ended. */
  function slow(log: string[], name: string, ms: number, value = name) {
    return async (signal: AbortSignal) => {
      log.push(`begin ${name}`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("given up"));
        });
      });
      log.push(`end ${name}`);
      return value;
    };
  }

  it("lets only so many through at once, and answers each in turn", async () => {
    const queue = createSearchQueue<string>(options);
    const log: string[] = [];
    const asked = ["a", "b", "c", "d"].map((name) => queue.ask(name, slow(log, name, 30)));
    expect(queue.load()).toEqual({ running: 2, waiting: 2 });
    expect(await Promise.all(asked)).toEqual(["a", "b", "c", "d"].map((value) => ({ status: "found", value })));
    expect(log.slice(0, 2)).toEqual(["begin a", "begin b"]);
    expect(log.indexOf("begin c")).toBeGreaterThan(log.indexOf("end a"));
    expect(queue.load()).toEqual({ running: 0, waiting: 0 });
  });

  it("drops a search nobody is waiting for before it begins, and lets one that has begun finish and keeps its answer", async () => {
    const queue = createSearchQueue<string>(options);
    const log: string[] = [];
    const gone = new AbortController();
    const asked = ["a", "b", "c", "d"].map((name) => queue.ask(name, slow(log, name, 40), gone.signal));
    gone.abort();
    expect(await Promise.all(asked)).toEqual(Array(4).fill({ status: "gone" }));
    // Two had begun and hold their places to the end; the other two never reach kiwix-serve.
    expect(queue.load()).toEqual({ running: 2, waiting: 0 });
    await sleep(70);
    expect(log.sort()).toEqual(["begin a", "begin b", "end a", "end b"]);
    expect(queue.load()).toEqual({ running: 0, waiting: 0 });
    // What was finished for nobody is not thrown away.
    expect(await queue.ask("a", slow(log, "a again", 40))).toEqual({ status: "found", value: "a" });
    expect(log).not.toContain("begin a again");
  });

  it("shares one search between two callers, and one caller leaving does not stop it for the other", async () => {
    const queue = createSearchQueue<string>(options);
    const log: string[] = [];
    const first = new AbortController();
    const one = queue.ask("a", slow(log, "a", 30), first.signal);
    const two = queue.ask("a", slow(log, "a twice", 30));
    first.abort();
    expect(await one).toEqual({ status: "gone" });
    expect(await two).toEqual({ status: "found", value: "a" });
    expect(log).toEqual(["begin a", "end a"]);
  });

  it("stops waiting at the limit, counted from when the search began, and still keeps the late answer", async () => {
    const queue = createSearchQueue<string>({ ...options, concurrency: 1 });
    const log: string[] = [];
    const started = performance.now();
    const quick = queue.ask("quick", slow(log, "quick", 60));
    const late = queue.ask("late", slow(log, "late", 150));
    expect(await quick).toEqual({ status: "found", value: "quick" });
    // "late" waited 60 ms for its turn; that is not held against it.
    expect(await late).toEqual({ status: "slow" });
    expect(performance.now() - started).toBeGreaterThanOrEqual(60 + 80 - 5);
    expect(queue.load().running).toBe(1);
    await sleep(100);
    expect(await queue.ask("late", slow(log, "late again", 10))).toEqual({ status: "found", value: "late" });
  });

  it("gives up on a search that goes on past the ceiling, and reports one that fails", async () => {
    const queue = createSearchQueue<string>({ ...options, limitMs: 1000, ceilingMs: 60 });
    const log: string[] = [];
    expect(await queue.ask("endless", slow(log, "endless", 5000))).toMatchObject({ status: "failed" });
    expect(queue.load()).toEqual({ running: 0, waiting: 0 });
    expect(
      await queue.ask("broken", async () => {
        throw new Error("no such archive");
      }),
    ).toEqual({ status: "failed", message: "no such archive" });
    // A failure is not remembered: asking again tries again.
    expect(await queue.ask("broken", async () => "mended")).toEqual({ status: "found", value: "mended" });
  });

  it("forgets the answers kept longest when there are too many, and all of them in time", async () => {
    const queue = createSearchQueue<string>({ ...options, remember: 2, rememberMs: 50 });
    for (const name of ["a", "b", "c"]) await queue.ask(name, async () => name);
    expect(await queue.ask("a", async () => "a anew")).toEqual({ status: "found", value: "a anew" });
    expect(await queue.ask("c", async () => "c anew")).toEqual({ status: "found", value: "c" });
    await sleep(70);
    expect(await queue.ask("c", async () => "c anew")).toEqual({ status: "found", value: "c anew" });
  });
});

describe("helpers", () => {
  it("asks each archive for no more than is shown", () => {
    expect([1, 2, 4, 7, 24, 29, 100].map(resultsFromEach)).toEqual([10, 10, 5, 3, 3, 3, 3]);
  });

  it("takes collections' results in turn and names the ones that are missing", () => {
    const hit = (title: string) => ({ title }) as never;
    const parts = [
      { collectionId: "a", title: "A", results: [hit("a1"), hit("a2"), hit("a3")] },
      { collectionId: "b", title: "B", results: [] },
      { collectionId: "c", title: "C", results: [hit("c1")] },
    ];
    expect(inTurn(parts).map((result) => result.title)).toEqual(["a1", "c1", "a2", "a3"]);
    expect(missingMessage([])).toBeNull();
    expect(
      missingMessage([
        { collectionId: "a", title: "Appropedia", reason: "slow" },
        { collectionId: "b", title: "Wikivoyage", reason: "slow" },
        { collectionId: "c", title: "Old archive", reason: "failed" },
      ]),
    ).toBe(
      "Not searched in time, so missing from these results: “Appropedia”, “Wikivoyage”. Could not be searched, so missing from these results: “Old archive”.",
    );
  });
});

describe("search in two parts", () => {
  beforeEach(() => {
    Object.assign(referenceTimings, { archiveLimitMs: 600, archiveCeilingMs: 1500 });
    Object.assign(referenceBudgets, { onePartMs: 2500, inPartsMs: 2500 });
  });

  it("answers with what Outpost holds at once, and with each collection's articles as that collection answers", async () => {
    const { app, base, ids } = await world([book(1, 20), book(2, 20), book(3, 450)]);

    const started = performance.now();
    const own = await app.api("GET", "/api/search?q=water&reference=later");
    expect(performance.now() - started).toBeLessThan(200);
    expect(own.body.results.map((result: Line) => result.kind).sort()).toEqual(["document", "note"]);
    expect(own.body).toMatchObject({ total: 2, facets: { document: 1, note: 1 }, warnings: [], referenceToCome: true });
    expect((await app.api("GET", "/api/search?q=water&reference=later&kinds=note")).body.referenceToCome).toBe(true);
    // Asked in one part, the answer does not carry the field. (Another word: answers are remembered.)
    expect((await app.api("GET", "/api/search?q=walnut")).body.referenceToCome).toBeUndefined();
    expect(own.body.facets.reference).toBeUndefined();

    const lines = await readReference(base, "water");
    expect(lines[0]).toMatchObject({ type: "start", collections: 3 });
    expect(lines.slice(1, -1).map((line) => line.title)).toEqual(["Book 01", "Book 02", "Book 03"]);
    // The slow collection held nothing back: the quick ones were sent while it was still being searched.
    expect(lines[2]!.at).toBeLessThan(300);
    expect(lines[3]!.at).toBeGreaterThanOrEqual(440);
    expect(lines[1]).toMatchObject({ type: "collection", collectionId: ids[0] });
    expect(lines[1]!.results).toHaveLength(3);
    expect(lines[1]!.results[0]).toMatchObject({
      kind: "reference",
      entityId: `${ids[0]}:Water`,
      title: "Water",
      collection: "Book 01",
      url: `/library/read/${ids[0]}/Water`,
      score: 1,
      sources: ["reference"],
      passages: [
        {
          segments: [
            { text: "...about ", hit: false },
            { text: "water", hit: true },
            { text: " in Book 01...", hit: false },
          ],
        },
      ],
    });
    expect(lines.at(-1)).toMatchObject({ type: "end", searched: 3, missing: [], message: null });
  });

  it("does not wait for a collection past its limit, and names it as missing", async () => {
    const { app, base, kiwix } = await world([book(1, 20), book(2, 1000), book(3, 20)]);
    const lines = await readReference(base, "water");
    expect(lines.slice(1, -1).map((line) => line.title)).toEqual(["Book 01", "Book 03"]);
    const end = lines.at(-1)!;
    expect(end).toMatchObject({ type: "end", searched: 2, missing: [{ title: "Book 02", reason: "slow" }], message: null });
    expect(end.at).toBeGreaterThanOrEqual(590);
    expect(end.at).toBeLessThan(950);

    // The whole answer in one part says the same in its warnings, and still has everything else.
    const whole = (await app.api("GET", "/api/search?q=wave")).body;
    expect(whole.warnings).toEqual([{ source: "reference", message: "Not searched in time, so missing from these results: “Book 02”." }]);
    expect(whole.facets).toMatchObject({ reference: 2 });

    // The slow search was let finish, and its answer kept: asked again, nothing is missing and kiwix-serve is not asked.
    await kiwix.idle();
    const asked = kiwix.started.length;
    const again = await readReference(base, "water");
    expect(again.at(-1)).toMatchObject({ searched: 3, missing: [] });
    expect(again.at(-1)!.at).toBeLessThan(200);
    expect(kiwix.started.length).toBe(asked);
  });

  it("stops at its budget for the whole search and names every collection it did not reach", async () => {
    Object.assign(referenceBudgets, { inPartsMs: 300 });
    const { base, kiwix } = await world(Array.from({ length: 8 }, (_, index) => book(index + 1, 180)));
    const lines = await readReference(base, "water");
    const end = lines.at(-1)!;
    // Three at a time, 180 ms each: one round fits in 300 ms, the second is under way, the last two never began.
    expect(end.searched).toBe(3);
    expect(end.missing.map((item: Line) => item.title)).toEqual(["Book 04", "Book 05", "Book 06", "Book 07", "Book 08"]);
    expect(end.at).toBeLessThan(450);
    await kiwix.idle();
    expect(kiwix.started).toHaveLength(6);
  });

  it("says which collection could not be searched", async () => {
    const { app, base } = await world([book(1, 10), book(2, 10, { broken: true })]);
    const lines = await readReference(base, "water");
    expect(lines.at(-1)).toMatchObject({ searched: 1, missing: [{ title: "Book 02", reason: "failed" }] });
    expect((await app.api("GET", "/api/search?q=water")).body.warnings).toEqual([
      { source: "reference", message: "Could not be searched, so missing from these results: “Book 02”." },
    ]);
  });

  it("keeps counts and pages the same from one page to the next", async () => {
    const { app } = await world([book(1, 5), book(2, 5), book(3, 5), book(4, 5)]);
    // Four collections are asked for five articles each, and all five match "wa": twenty, and two of Outpost's own.
    const pages = [];
    for (const offset of [0, 5, 10, 15, 20, 25]) pages.push((await app.api("GET", `/api/search?q=wa&limit=5&offset=${offset}`)).body);
    for (const page of pages) expect(page).toMatchObject({ total: 22, facets: { reference: 20, note: 1, document: 1 } });
    const seen = pages.flatMap((page) => page.results.map((result: Line) => `${result.kind}:${result.entityId}`));
    expect(seen).toHaveLength(22);
    expect(new Set(seen).size).toBe(22);
    expect(pages[5].results).toEqual([]);

    // Reference on its own pages the same way.
    const reference = [];
    for (const offset of [0, 10]) reference.push((await app.api("GET", `/api/search?q=wa&kinds=reference&limit=10&offset=${offset}`)).body);
    expect(reference.map((page) => [page.total, page.results.length])).toEqual([
      [20, 10],
      [20, 10],
    ]);
    // Each collection's best match comes before any collection's second.
    expect(reference[0].results.slice(0, 4).map((result: Line) => result.collection)).toEqual(["Book 01", "Book 02", "Book 03", "Book 04"]);

    // In two parts, the first part counts and pages Outpost's own and nothing else.
    const own = [];
    for (const offset of [0, 1, 2]) own.push((await app.api("GET", `/api/search?q=wa&limit=1&offset=${offset}&reference=later`)).body);
    expect(own.map((page) => [page.total, page.results.length])).toEqual([
      [2, 1],
      [2, 1],
      [2, 0],
    ]);
    for (const page of own) expect(page.facets).toEqual({ note: 1, document: 1 });
    expect((await app.api("GET", "/api/search?q=wa&kinds=reference&reference=later")).body).toMatchObject({ total: 0, results: [] });
  });

  it("has nothing to send when searching inside collections is turned off, kiwix-serve is down, or nothing was typed", async () => {
    const { app, base, kiwix } = await world([book(1, 5)]);
    expect((await readReference(base, "  ")).map(({ at: _at, tookMs: _took, ...line }) => line)).toEqual([
      { type: "start", collections: 0 },
      { type: "end", searched: 0, missing: [], message: null },
    ]);
    await app.api("PATCH", "/api/settings", { "search.includeReference": false });
    expect((await readReference(base, "water"))[0]).toMatchObject({ type: "start", collections: 0 });
    expect((await app.api("GET", "/api/search?q=water&reference=later")).body.referenceToCome).toBe(false);
    expect(kiwix.started).toEqual([]);
    expect((await app.api("GET", `/api/search/reference?q=${"x".repeat(501)}`)).status).toBe(400);

    const down = await world([book(1, 5)], { OUTPOST_KIWIX_URL: "http://127.0.0.1:9" });
    const lines = await readReference(down.base, "water");
    expect(lines[0]).toMatchObject({ type: "start", collections: 0 });
    expect(lines.at(-1)).toMatchObject({ type: "end", searched: 0, missing: [] });
    expect(lines.at(-1)!.message).toMatch(/not answering/);
  });
});

describe("a search that is dropped", () => {
  const TWENTY_FOUR = () => Array.from({ length: 24 }, (_, index) => book(index + 1, 120));

  it("asks kiwix-serve for nothing more once the person has gone", async () => {
    const { app, base, kiwix } = await world(TWENTY_FOUR());
    const gone = new AbortController();
    const reading = readReference(base, "water", gone.signal).catch((error: Error) => error.name);
    await sleep(60);
    gone.abort();
    expect(await reading).toBe("AbortError");
    await sleep(40);
    // Only the three that had begun are at kiwix-serve; the other twenty-one were never sent.
    expect(app.ctx.services.kiwix.searchLoad()).toEqual({ running: 3, waiting: 0 });
    await kiwix.idle();
    expect(kiwix.started).toHaveLength(3);
    expect(kiwix.wasted()).toBe(0);
    await sleep(30);
    expect(app.ctx.services.kiwix.searchLoad()).toEqual({ running: 0, waiting: 0 });
  });

  it("does the same for a search asked for in one part", async () => {
    const { app, base, kiwix } = await world(TWENTY_FOUR());
    const gone = new AbortController();
    const asking = fetch(`${base}/api/search?q=water`, { signal: gone.signal }).catch((error: Error) => error.name);
    await sleep(60);
    gone.abort();
    expect(await asking).toBe("AbortError");
    await sleep(40);
    expect(app.ctx.services.kiwix.searchLoad().waiting).toBe(0);
    await kiwix.idle();
    expect(kiwix.started).toHaveLength(3);
  });

  it("leaves nothing piled up inside kiwix-serve when three letters are typed quickly", async () => {
    const { app, base, kiwix } = await world(TWENTY_FOUR());
    for (const q of ["w", "wa"]) {
      const gone = new AbortController();
      const reading = readReference(base, q, gone.signal).catch(() => undefined);
      await sleep(70);
      gone.abort();
      await reading;
    }
    const lines = await readReference(base, "wat");
    expect(lines.at(-1)).toMatchObject({ type: "end", searched: 24, missing: [] });
    await kiwix.idle();
    // Never more than three at kiwix-serve, none waiting inside it, and at most three begun for each search that was dropped.
    expect(kiwix.peak()).toBeLessThanOrEqual(3);
    expect(kiwix.started.length).toBeLessThanOrEqual(24 + 6);
    expect(kiwix.started.filter((entry) => entry.endsWith(": wat"))).toHaveLength(24);
    await sleep(30);
    expect(app.ctx.services.kiwix.searchLoad()).toEqual({ running: 0, waiting: 0 });
  });
});
