/**
 * Which reference collections are searched first, which of their pages are left out, how
 * title search joins full-text search in one ranked list, and how archives that cannot be
 * searched by their full text are remembered.
 */
import { afterEach, describe, expect, it } from "vitest";
import { isJunkHit } from "../src/modules/kiwix/junk.ts";
import { type ArchiveProfile, createRouteMemory, priorOf, ROUTED_FIRST, routeArchives, routeWords } from "../src/modules/kiwix/routing.ts";
import { createSearchHealth, type SearchMark } from "../src/modules/kiwix/search-health.ts";
import { expandQuery, parseQuery, titleWords } from "../src/modules/search/query.ts";
import { scoringTerms } from "../src/modules/search/score.ts";
import { titleIsAnswer } from "../src/modules/search/service.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { type SlowBook, type SlowKiwix, startSlowKiwix, uuidFor, writeArchives } from "./slow-kiwix.ts";

const parsed = (q: string) => expandQuery(parseQuery(q)).parsed;
const route = (q: string) => routeWords(parsed(q));

const ARCHIVES: ArchiveProfile[] = [
  {
    id: "wikimed",
    title: "WikiMed Medical Encyclopedia",
    description: "The medical articles of Wikipedia.",
    category: "medicine",
    tags: "medical;wikipedia",
    sizeBytes: 500,
  },
  { id: "nhs", title: "NHS Medicines A to Z", description: "The NHS guide to medicines.", category: "medicine", sizeBytes: 50 },
  {
    id: "mechanics",
    title: "Motor Vehicle Mechanics Q&A",
    description: "Questions and answers for mechanics and owners of cars, trucks and motorcycles.",
    category: "repair",
    tags: "stack_exchange",
    sizeBytes: 300,
  },
  {
    id: "bicycles",
    title: "Bicycles Q&A",
    description: "Questions and answers for people involved with bicycles.",
    category: "repair",
    sizeBytes: 300,
  },
  {
    id: "wikipedia",
    title: "Best of Wikipedia",
    description: "A selection of the best Wikipedia articles.",
    category: "encyclopedias",
    tags: "wikipedia",
    sizeBytes: 900,
  },
  {
    id: "cooking",
    title: "Cooking Q&A",
    description: "Questions and answers for professional and amateur cooks.",
    category: "food",
    sizeBytes: 200,
  },
  {
    id: "arduino",
    title: "Arduino Q&A",
    description: "Questions and answers about Arduino hardware and software.",
    category: "engineering",
    sizeBytes: 250,
  },
  {
    id: "woodworking",
    title: "Woodworking Q&A",
    description: "For professional and amateur woodworkers.",
    category: "repair",
    sizeBytes: 100,
  },
  { id: "quotes", title: "Wikiquote", description: "Sayings of people.", category: "reference", sizeBytes: 400 },
  {
    id: "factbook",
    title: "CIA World Factbook",
    description: "Information about the countries of the world, prepared by the CIA.",
    category: "reference",
    sizeBytes: 400,
  },
  { id: "ted", title: "TED talks", description: "Talks.", category: "preparedness", language: "fra,spa", sizeBytes: 10 },
];
const first = (q: string, memory = createRouteMemory()) => routeArchives(ARCHIVES, route(q), { memory }).first.map((archive) => archive.id);

describe("choosing which reference collections to search first", () => {
  it("sends a medical question to the medical archives, a car question to the mechanics, and keeps a general encyclopaedia near", () => {
    expect(first("treat a burn").slice(0, 2).sort()).toEqual(["nhs", "wikimed"]);
    expect(first("tyre pressure")[0]).toBe("mechanics");
    expect(first("tire pressure")[0]).toBe("mechanics");
    expect(first("fix a puncture").slice(0, 2)).toContain("bicycles");
    expect(first("tyre pressure")).toContain("wikipedia");
    expect(first("make bread without yeast")[0]).toBe("cooking");
    expect(first("treat a burn")).toHaveLength(ROUTED_FIRST);
  });

  it("gives each archive a prior with its reasons, and holds back archives in another language", () => {
    expect(priorOf(ARCHIVES[2]!, route("how to change car battery"))).toMatchObject({
      prior: expect.any(Number),
      reasons: expect.arrayContaining(["how-to"]),
    });
    expect(priorOf(ARCHIVES[4]!, route("zzqx"))).toEqual({ id: "wikipedia", prior: 0.3, reasons: ["general"] });
    // "amateur" in a woodworker's description does not make it a radio archive.
    expect(priorOf(ARCHIVES[7]!, route("radio")).prior).toBe(0);
    expect(priorOf(ARCHIVES[10]!, route("flood")).reasons).toContain("language");
  });

  it("learns which archives answered well for the same words", () => {
    const memory = createRouteMemory();
    expect(first("stove", memory)[0]).not.toBe("woodworking");
    for (let time = 0; time < 3; time += 1) memory.record(["stove"], "woodworking", true);
    expect(first("stove", memory)[0]).toBe("woodworking");
    // An archive that stops answering well loses its place again.
    for (let time = 0; time < 10; time += 1) memory.record(["stove"], "woodworking", false);
    expect(memory.share(["stove"], "woodworking")).toBe(0);
  });

  it("keeps what it learned in a form it can be made from again, and ignores a form it does not know", () => {
    const memory = createRouteMemory();
    for (let time = 0; time < 3; time += 1) memory.record(["stove"], "woodworking", true);
    memory.record(["burn"], "wikimed", false);
    const again = createRouteMemory(2000, JSON.parse(JSON.stringify(memory.saved())));
    expect(again.share(["stove"], "woodworking")).toBe(1);
    expect(again.share(["burn"], "wikimed")).toBe(0);
    expect(first("stove", again)[0]).toBe("woodworking");
    for (const odd of [
      null,
      7,
      { version: 99, words: [] },
      { version: 1, words: "x" },
      { version: 1, words: [["stove", [["a", "yes"]]]] },
    ]) {
      expect(createRouteMemory(2000, odd).share(["stove"], "a")).toBe(0);
    }
  });

  it("searches every archive at once when only a couple would be left over, and always those whose list already matched", () => {
    expect(routeArchives(ARCHIVES.slice(0, 8), route("water")).rest).toEqual([]);
    const plan = routeArchives(ARCHIVES, route("water"), { always: new Set(["ted"]) });
    expect(plan.first.map((archive) => archive.id)).toContain("ted");
    expect(plan.first.length + plan.rest.length).toBe(ARCHIVES.length);
  });
});

describe("pages that only list other pages", () => {
  it("leaves out lists of questions, pages of lists, main pages and category pages, and keeps articles", () => {
    const junk = [
      { title: "questions/tagged/3d-design_page=8", path: "questions/tagged/3d-design_page%253D8" },
      { title: "Highest Voted 'jump-start' Questions", path: "questions/tagged/jump-start" },
      { title: "questions_page=91", path: "questions_page%253D91" },
      { title: "Main Page", path: "Main_Page" },
      { title: "Category:Knots", path: "A/Category:Knots" },
      { title: "Newest 'battery' Questions", path: "questions/tagged/battery?tab=newest" },
    ];
    const kept = [
      { title: "Bowline", path: "Bowline" },
      { title: "How do I fix a puncture?", path: "questions/123/how-do-i-fix-a-puncture" },
      { title: "List of knots", path: "List_of_knots" },
      { title: "AC/DC", path: "AC/DC" },
      { title: "Page (paper)", path: "Page_(paper)" },
    ];
    expect(junk.filter((hit) => !isJunkHit(hit))).toEqual([]);
    expect(kept.filter((hit) => isJunkHit(hit))).toEqual([]);
  });
});

describe("titles that are the answer", () => {
  it("asks title search for the words a title would hold", () => {
    expect(titleWords(parsed("treat a burn"))).toEqual(["burn"]);
    expect(titleWords(parsed("store petrol safely"))).toEqual(["petrol"]);
    expect(titleWords(parsed("tyre pressure"))).toEqual(["tyre", "pressure"]);
    expect(titleWords(parsed("fix"))).toEqual(["fix"]);
  });

  it("knows a title made of the question's words that holds every word a title would", () => {
    const check = (q: string, title: string) => {
      const query = parsed(q);
      return titleIsAnswer(
        title,
        scoringTerms(query, () => 1),
        titleWords(query),
      );
    };
    expect(check("treat a burn", "Burn")).toBe(true);
    expect(check("treat a burn", "Burns")).toBe(true);
    expect(check("tyre pressure", "Tire pressure")).toBe(true);
    expect(check("tyre pressure", "Pressure")).toBe(false);
    expect(check("treat a burn", "Burn (film)")).toBe(false);
  });
});

describe("remembering archives that cannot be searched by their full text", () => {
  function health() {
    const marks = new Map<string, SearchMark>();
    let now = 1_000_000;
    const subject = createSearchHealth({
      read: (id) => marks.get(id),
      write: (id, mark) => (mark ? marks.set(id, mark) : marks.delete(id)),
      now: () => now,
    });
    return { subject, marks, later: (ms: number) => (now += ms) };
  }

  it("marks an archive kiwix-serve says has no full-text index at once, and tries it again after a week", () => {
    const { subject, marks, later } = health();
    subject.refused("a", 400, "<p>The fulltext search is not available for this content.</p>");
    expect(marks.get("a")).toMatchObject({ fullText: "none", message: "The fulltext search is not available for this content." });
    expect(subject.fullTextNow("a")).toBe(false);
    later(8 * 24 * 3600_000);
    expect(subject.fullTextNow("a")).toBe(true);
    subject.worked("a");
    expect(marks.has("a")).toBe(false);
  });

  it("marks one that fails three times in a row, and renews the mark at once when a retry fails", () => {
    const { subject, marks, later } = health();
    subject.failed("b", "kiwix-serve answered 500");
    subject.failed("b", "kiwix-serve answered 500");
    expect(marks.has("b")).toBe(false);
    subject.failed("b", "kiwix-serve answered 500");
    expect(marks.get("b")?.fullText).toBe("failing");
    later(31 * 60_000);
    expect(subject.fullTextNow("b")).toBe(true);
    subject.failed("b", "kiwix-serve answered 500");
    expect(subject.fullTextNow("b")).toBe(false);
  });
});

// ── Against a stand-in for kiwix-serve ──

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

interface World {
  app: TestApp;
  kiwix: SlowKiwix;
  base: string;
  ids: string[];
}

async function world(books: Array<SlowBook & { description?: string; category?: string }>): Promise<World> {
  const kiwix = await startSlowKiwix({ books });
  cleanups.push(() => kiwix.close());
  const app = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url });
  cleanups.push(() => app.close());
  const location = app.ctx.services.storage.getDefault();
  const ids: string[] = [];
  for (const [index, relPath] of writeArchives(location.path, books).entries()) {
    const { body } = await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath, title: books[index]!.title });
    app.ctx.services.collections.update(body.collection.id, {
      description: books[index]!.description ?? null,
      category: books[index]!.category ?? null,
    });
    ids.push(body.collection.id);
  }
  const base = await app.app.listen({ port: 0, host: "127.0.0.1" });
  return { app, kiwix, base, ids };
}

// biome-ignore lint/suspicious/noExplicitAny: tests read lines loosely
type Line = Record<string, any>;
async function lines(base: string, q: string, scope?: "all"): Promise<Line[]> {
  const response = await fetch(`${base}/api/search/reference?q=${encodeURIComponent(q)}${scope ? `&scope=${scope}` : ""}`);
  return (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
const finals = (all: Line[]) => all.filter((line) => line.type === "collection" && line.done !== false);

const shelf = (
  index: number,
  title: string,
  articles: string[],
  extra: Partial<SlowBook> & { description?: string; category?: string } = {},
) => ({
  uuid: uuidFor(index),
  name: `book-${String(index).padStart(2, "0")}`,
  title,
  delayMs: 5,
  articles,
  ...extra,
});

describe("reference search, routed", () => {
  const library = () => [
    shelf(1, "Motor Vehicle Mechanics Q&A", ["Tyre pressure", "Tyre pressure warning light", "Low tyre pressure in winter"], {
      description: "Questions and answers for owners of cars.",
      category: "repair",
    }),
    shelf(2, "WikiMed Medical Encyclopedia", ["Burn", "Burn centre", "Sunburn"], {
      description: "Medical articles.",
      category: "medicine",
    }),
    shelf(3, "Best of Wikipedia", ["Pressure", "Tyre", "Burn"], { description: "The best Wikipedia articles." }),
    ...["Arduino Q&A", "Woodworking Q&A", "Cooking Q&A", "Wikiquote", "Gardenology", "Homebrewing Q&A", "Bicycles Q&A"].map(
      (title, index) => shelf(index + 4, title, title === "Bicycles Q&A" ? ["Pressure cooker", "Tyre swing"] : ["Pressure cooker"]),
    ),
  ];

  it("searches the likeliest archives first and leaves the rest for 'Search all'", async () => {
    const { base, kiwix } = await world(library());
    const routed = await lines(base, "tyre pressure");
    expect(routed[0]).toMatchObject({ type: "start", collections: 6, more: 4, ranked: true });
    expect(routed.some((line) => line.type === "widen")).toBe(false);
    expect(routed.at(-1)).toMatchObject({ type: "end", more: 4 });
    expect(
      finals(routed)[0]?.title === "Motor Vehicle Mechanics Q&A" ||
        finals(routed).some((line) => line.title === "Motor Vehicle Mechanics Q&A"),
    ).toBe(true);
    expect(new Set(kiwix.started.map((entry) => entry.split(":")[0])).size).toBeLessThanOrEqual(6);

    const all = await lines(base, "tyre pressure", "all");
    expect(all[0]).toMatchObject({ type: "start", collections: 10, more: 0 });
    expect(all.at(-1)).toMatchObject({ type: "end", searched: 10, more: 0 });
  });

  it("searches the rest after all when the first archives find too little", async () => {
    const { base } = await world(library());
    const widened = await lines(base, "swing");
    expect(widened.find((line) => line.type === "widen")).toMatchObject({ collections: 4 });
    expect(widened.at(-1)).toMatchObject({ type: "end", searched: 10, more: 0 });
  });

  it("remembers across a restart which archive answered well, and forgets it when everything is erased", async () => {
    const { app, base, kiwix } = await world(library());
    const bicycles = library().find((book) => book.title === "Bicycles Q&A")!.name;
    // The first time, Bicycles Q&A is not among the likeliest for "swing": it is asked only when the search widens.
    const once = await lines(base, "swing");
    const firstWave = (all: Line[]) => all.find((line) => line.type === "start")!.collections as number;
    expect(kiwix.started.slice(0, firstWave(once)).some((entry) => entry.startsWith(`${bicycles}:`))).toBe(false);
    await kiwix.idle();

    const dir = app.dir;
    await app.app.close();
    const again = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url }, dir);
    cleanups.push(() => again.close());
    const againBase = await again.app.listen({ port: 0, host: "127.0.0.1" });
    const asked = kiwix.started.length;
    const twice = await lines(againBase, "swing");
    expect(kiwix.started.slice(asked, asked + firstWave(twice)).some((entry) => entry.startsWith(`${bicycles}:`))).toBe(true);

    // What was searched for is a person's own: erasing everything takes it too, and nothing brings it back.
    await again.app.close();
    const third = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url }, dir);
    cleanups.push(() => third.close());
    expect((third.ctx.sqlite.prepare("SELECT count(*) AS n FROM library_meta WHERE key = 'search.routes'").get() as { n: number }).n).toBe(
      1,
    );
    const erase = await third.api("POST", "/api/manage/cleanup/everything", { confirm: "Erase everything" });
    expect(erase.status).toBe(200);
    await third.ctx.jobs.whenIdle();
    await third.app.close();
    const fourth = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url }, dir);
    cleanups.push(() => fourth.close());
    expect(fourth.ctx.sqlite.prepare("SELECT count(*) AS n FROM library_meta WHERE key = 'search.routes'").get()).toEqual({ n: 0 });
  });

  it("does not search the rest when the person's own library already holds plenty with every word", async () => {
    const { app, base } = await world(library());
    for (let index = 0; index < 5; index += 1) {
      app.ctx.services.search.upsert({
        kind: "note",
        entityId: `swing-${index}`,
        title: `Garden swing ${index}`,
        url: `/notes/${index}`,
        sections: [{ text: "The swing needs oil." }],
      });
    }
    const asked = await lines(base, "swing");
    expect(asked.some((line) => line.type === "widen")).toBe(false);
    expect(asked.at(-1)).toMatchObject({ type: "end", more: 4 });
  });

  it("puts a title that is the answer above long pages, and leaves list pages out", async () => {
    const { base } = await world([
      shelf(1, "WikiMed Medical Encyclopedia", [], {
        category: "medicine",
        hits: [
          { title: "Highest Voted 'burn' Questions", path: "questions/tagged/burn", snippet: "...treat a burn... treat a burn..." },
          { title: "First aid for minor injuries", path: "First_aid", snippet: "...to treat a burn cool it under running water..." },
          { title: "Burn", path: "Burn", snippet: "A burn is an injury to skin caused by heat." },
        ],
      }),
      // A dictionary's "burn" is a word, not the answer: a collection of words does not fit a question about treating one.
      shelf(2, "Wiktionary", [], {
        description: "A dictionary.",
        hits: [{ title: "Burn", path: "burn", snippet: "To treat a burn, see burn." }],
      }),
    ]);
    // Asked about a burn, the encyclopaedia's article named for it is the answer.
    const about = await lines(base, "burn");
    const aboutResults = finals(about).find((line) => line.title === "WikiMed Medical Encyclopedia")!.results as Line[];
    expect(aboutResults[0]).toMatchObject({ title: "Burn" });
    const word = finals(about).find((line) => line.title === "Wiktionary")!.results[0];
    expect(word.score).toBeLessThan(aboutResults[0]!.score);

    // Asked what to do for one, it says only what a burn is: the page saying what to do comes first (outpost-1cws).
    const all = await lines(base, "treat a burn");
    const results = finals(all).find((line) => line.title === "WikiMed Medical Encyclopedia")!.results as Line[];
    expect(results.map((result) => result.title)).toEqual(["First aid for minor injuries", "Burn"]);
    expect(results[1]!.why).toMatch(/says what it is, not what to do/);
    expect(results[1]!.why).not.toMatch(/The title is what was asked/);
  });
});

describe("an archive without a full-text index", () => {
  it("is marked the first time, searched by its titles only from then, never warned about, and explained in its details", async () => {
    const { app, base, kiwix, ids } = await world([
      shelf(1, "TED talks", ["Water and floods", "Water wars"], { noIndex: true }),
      shelf(2, "Water book", ["Water"]),
    ]);
    const first = await lines(base, "water");
    expect(first.at(-1)).toMatchObject({ type: "end", searched: 2, missing: [] });
    expect(
      finals(first)
        .find((line) => line.collectionId === ids[0])!
        .results.map((result: Line) => result.title),
    ).toEqual(["Water and floods", "Water wars"]);
    const row = app.ctx.services.collections.get(ids[0]!)!;
    expect(row.meta.kiwix).toMatchObject({
      search: { fullText: "none", message: "Invalid request The fulltext search is not available for this content." },
    });
    const asked = kiwix.started.filter((entry) => entry.startsWith("book-01")).length;

    const second = await lines(base, "floods");
    expect(second.at(-1)).toMatchObject({ missing: [] });
    expect(kiwix.started.filter((entry) => entry.startsWith("book-01")).length).toBe(asked);
    expect(finals(second)[0]!.results[0].title).toBe("Water and floods");
    // The collection's details carry the mark, for the screen to explain.
    const details = (await app.api("GET", `/api/collections/${ids[0]}`)).body;
    expect(details.collection.meta.kiwix.search.fullText).toBe("none");
  });
});

describe("reference search on a slow computer", () => {
  // On a Raspberry Pi a title search took a tenth of a second or more, and they went one at a
  // time: a widened search of thirty archives waited three to six seconds for its titles alone.
  const TITLE_MS = 100;
  const slowShelves = () => [
    shelf(1, "Motor Vehicle Mechanics Q&A", ["Tyre pressure"], { category: "repair", titleDelayMs: TITLE_MS }),
    ...Array.from({ length: 23 }, (_, index) =>
      shelf(index + 2, `Shelf ${index + 2} Q&A`, index === 20 ? ["Tyre swing"] : ["Pressure cooker"], { titleDelayMs: TITLE_MS }),
    ),
  ];

  it("asks for titles in every place kiwix-serve has free, never more than its four at once", async () => {
    const { base, kiwix } = await world(slowShelves());
    const started = performance.now();
    const all = await lines(base, "swing", "all");
    const ms = performance.now() - started;
    expect(all.at(-1)).toMatchObject({ type: "end", searched: 24, more: 0 });
    expect(finals(all).flatMap((line) => line.results.map((result: Line) => result.title))).toContain("Tyre swing");
    expect(kiwix.titlesPeak()).toBeGreaterThan(1);
    expect(kiwix.peak()).toBeLessThanOrEqual(4);
    // One at a time, the 24 title searches alone took 2.4 s.
    expect(ms).toBeLessThan(24 * TITLE_MS * 0.75);
  });

  it("widens in the same way", async () => {
    const { base, kiwix } = await world(slowShelves());
    const started = performance.now();
    const widened = await lines(base, "swing");
    const ms = performance.now() - started;
    expect(widened.find((line) => line.type === "widen")).toBeTruthy();
    expect(widened.at(-1)).toMatchObject({ type: "end", searched: 24, more: 0 });
    expect(kiwix.peak()).toBeLessThanOrEqual(4);
    expect(ms).toBeLessThan(24 * TITLE_MS * 0.75);
  });
});
