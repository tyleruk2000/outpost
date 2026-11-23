/**
 * The ranking rules of docs/search.md, one at a time: small words left out, every word
 * first and then most of them, coverage, closeness, one scale for every source, kiwix's
 * answers scored again, items grouped before they are limited, and places kept apart.
 */
import { afterEach, describe, expect, it } from "vitest";
import { parseQuery, plainQuery, toFtsQuery } from "../src/modules/search/query.ts";
import { reasonFor, scoreFields, scoringTerms } from "../src/modules/search/score.ts";
import { blendMeaning, type SearchResult } from "../src/modules/search/service.ts";
import { stem } from "../src/modules/search/stem.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { startSlowKiwix, uuidFor, writeArchives } from "./slow-kiwix.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function app(): Promise<TestApp> {
  const made = await createTestApp();
  cleanups.push(() => made.close());
  return made;
}

type Result = { entityId: string; title: string; score: number; why?: string; kind: string };
const ids = (body: { results: Result[] }) => body.results.map((result) => result.entityId);

describe("question words", () => {
  it("are left out of what must match, but kept in phrases and when nothing else was typed", () => {
    expect(parseQuery("How to change car battery")).toMatchObject({
      required: ["change", "car", "battery"],
      ignored: ["How", "to"],
      prefixLast: true,
    });
    expect(toFtsQuery(parseQuery("How to change car battery "))).toBe('("change" AND "car" AND "battery")');
    expect(parseQuery('"how to" knots ').required).toEqual(["how to", "knots"]);
    expect(parseQuery("to be or").required).toEqual(["to", "be", "or"]);
    // "without" and "not" change the meaning: never dropped.
    expect(parseQuery("bread without yeast ").required).toEqual(["bread", "without", "yeast"]);
  });

  it("leave no word open for a prefix when the last one typed was a small word", () => {
    expect(parseQuery("car battery to").prefixLast).toBe(false);
  });

  it("are not sent to kiwix-serve", () => {
    expect(plainQuery(parseQuery('how do I "clove hitch" a rope'))).toBe('"clove hitch" rope');
  });
});

describe("the stemmer", () => {
  it("brings word forms together as the index does", () => {
    expect(stem("boiling")).toBe(stem("boil"));
    expect(stem("batteries")).toBe(stem("battery"));
    expect(stem("changing")).toBe(stem("change"));
    expect(stem("caresses")).toBe("caress");
    expect(stem("relational")).toBe("relat");
  });
});

describe("the score", () => {
  const terms = scoringTerms(parseQuery("change car battery "), () => 1);

  it("weighs coverage most: every word beats a word in the title", () => {
    const every = scoreFields(terms, { title: "Notes", text: "To change a car battery, undo the negative terminal." });
    const some = scoreFields(terms, { title: "Car battery", text: "Lead acid cells." });
    expect(every.coverage).toBe(1);
    expect(some.coverage).toBeCloseTo(2 / 3);
    expect(every.score).toBeGreaterThan(some.score);
    expect(reasonFor(some)).toBe("2 of 3 words, not “change”");
  });

  it("rewards words close together, and side by side most", () => {
    const together = scoreFields(terms, { title: "Notes", text: "Change the car battery every five years." });
    const apart = scoreFields(terms, {
      title: "Notes",
      text: "A car can wait. Weeks later, with the weather on the turn, the battery may need care; plans change.",
    });
    expect(together.phrase).toBe(1);
    expect(apart.phrase).toBe(0);
    expect(together.closeness).toBeGreaterThan(apart.closeness);
    expect(together.score).toBeGreaterThan(apart.score);
    expect(reasonFor(together)).toBe("All 3 words, side by side");
  });

  it("counts rare words for more", () => {
    const weighted = scoringTerms(parseQuery("water bowline "), (term) => (term === "bowline" ? 4 : 0.5));
    expect(scoreFields(weighted, { title: "x", text: "bowline" }).coverage).toBeCloseTo(4 / 4.5);
    expect(scoreFields(weighted, { title: "x", text: "water" }).coverage).toBeCloseTo(0.5 / 4.5);
  });
});

describe("keyword search", () => {
  it("answers the owner's question with the page about replacing a car battery", async () => {
    const test = await app();
    const { search } = test.ctx.services;
    search.upsert({
      kind: "document",
      entityId: "physics",
      title: "University physics, volume 1",
      url: "/library/documents/physics",
      sections: [
        {
          page: 301,
          text: "What do a car battery and a sandwich have in common? Both contain energy that can change form. How to account for it is the law of conservation of energy.",
        },
      ],
    });
    search.upsert({
      kind: "document",
      entityId: "radio",
      title: "The setup menu (1): display, audio, TX and RX",
      url: "/library/documents/radio",
      sections: [{ page: 8, text: "Battery saver: how to change it. SAVE is kind to the battery when the car is off." }],
    });
    search.upsert({
      kind: "document",
      entityId: "manual",
      title: "Car maintenance manual",
      url: "/library/documents/manual",
      sections: [
        { page: 3, heading: "Oil", text: "Check the oil with the engine cold." },
        {
          page: 12,
          heading: "How to replace a car battery",
          text: "Changing a car battery takes twenty minutes. Disconnect the negative terminal first.",
        },
      ],
    });
    const { body } = await test.api("GET", `/api/search?q=${encodeURIComponent("How to change car battery")}`);
    expect(ids(body)[0]).toBe("manual");
    expect(body.results[0].url).toBe("/library/documents/manual?page=12");
    expect(body.ignored).toEqual(["How", "to"]);
    // No word of the question is marked unless it matters.
    const marked = body.results.flatMap((result: { passages: Array<{ segments: Array<{ text: string; hit: boolean }> }> }) =>
      result.passages.flatMap((passage) => passage.segments.filter((segment) => segment.hit).map((segment) => segment.text.toLowerCase())),
    );
    expect(marked).not.toContain("how");
    expect(marked).not.toContain("to");
    // Scores mean something on their own: not every source's best is 1.
    expect(body.results[0].score).toBeLessThan(1);
    expect(body.results[0].score).toBeGreaterThan(body.results[1].score);
  });

  it("puts what holds every word first, adds what holds most of them when that is too little, and says so", async () => {
    const test = await app();
    const { search } = test.ctx.services;
    const note = (entityId: string, title: string, text: string) =>
      search.upsert({ kind: "note", entityId, title, url: `/notes/${entityId}`, sections: [{ text }] });
    note("both", "Soda bread", "Bread made with bicarbonate of soda and buttermilk.");
    note("bread", "Bread notes", "Bread needs flour and water.");
    note("buttermilk", "Buttermilk", "Buttermilk keeps a week.");
    note("flour", "Flour", "Strong flour for bread.");
    for (let index = 0; index < 8; index += 1) note(`other-${index}`, `Other ${index}`, "Nothing here about baking.");

    const few = (await test.api("GET", "/api/search?q=bread+buttermilk+")).body;
    expect(few.everyWord).toBe(1);
    expect(few.relaxed).toBe(true);
    expect(ids(few)[0]).toBe("both");
    // "buttermilk" is the rarer word, so holding it is holding most of what the question is about; "bread" alone is not.
    expect(ids(few)).toEqual(["both", "buttermilk"]);
    expect(few.results.slice(1).every((result: Result) => result.why === "1 of 2 words, not “bread”")).toBe(true);

    // With enough items holding every word, nothing else is added.
    for (let index = 0; index < 5; index += 1) note(`more-${index}`, `More ${index}`, "Bread and buttermilk.");
    const enough = (await test.api("GET", "/api/search?q=bread+buttermilk+")).body;
    expect(enough.relaxed).toBe(false);
    expect(enough.total).toBe(6);

    const none = (await test.api("GET", "/api/search?q=buttermilk+flour+")).body;
    expect(none).toMatchObject({ relaxed: true, everyWord: 0 });
  });

  it("leaves out an item that shares only a common word with the question", async () => {
    const test = await app();
    const { search } = test.ctx.services;
    for (let index = 0; index < 10; index += 1) {
      search.upsert({
        kind: "note",
        entityId: `w${index}`,
        title: `Water ${index}`,
        url: `/notes/w${index}`,
        sections: [{ text: "water" }],
      });
    }
    search.upsert({ kind: "note", entityId: "rare", title: "Bowline", url: "/notes/rare", sections: [{ text: "A bowline knot." }] });
    const { body } = await test.api("GET", "/api/search?q=water+bowline+");
    expect(ids(body)).toEqual(["rare"]);
    expect(body.relaxed).toBe(true);
  });

  it("reaches every item, however many passages a few long books hold", async () => {
    const test = await app();
    const { search } = test.ctx.services;
    for (const book of ["one", "two", "three"]) {
      search.upsert({
        kind: "document",
        entityId: book,
        title: `Water book ${book}`,
        url: `/library/documents/${book}`,
        sections: Array.from({ length: 45 }, (_, page) => ({ page: page + 1, text: `Water, page ${page + 1}.` })),
      });
    }
    for (let index = 0; index < 30; index += 1) {
      search.upsert({
        kind: "document",
        entityId: `small-${index}`,
        title: `Leaflet ${index}`,
        url: `/library/documents/small-${index}`,
        sections: [{ page: 1, text: "Mentions water once." }],
      });
    }
    const pages = [];
    for (const offset of [0, 20]) pages.push((await test.api("GET", `/api/search?q=water&kinds=document&limit=20&offset=${offset}`)).body);
    expect(pages[0].total).toBe(33);
    expect(pages[0].results).toHaveLength(20);
    expect(pages[1].results).toHaveLength(13);
    const seen = pages.flatMap((page) => ids(page));
    expect(new Set(seen).size).toBe(33);
  });
});

describe("places and repeaters", () => {
  it("stay out of the results in a strip of their own, first when the query is one of their names", async () => {
    const test = await app();
    const { search } = test.ctx.services;
    search.upsert({ kind: "note", entityId: "n", title: "Water kit", url: "/notes/n", sections: [{ text: "Carry water." }] });
    search.addSource({
      id: "test-places",
      layer: "local",
      kind: "map-feature",
      isAvailable: () => true,
      weight: () => 0.7,
      search: async ({ q }) =>
        ["Waterfields", "Waterfields Farm", "Watermillock"]
          .filter((name) => name.toLowerCase().startsWith(q.trim().toLowerCase().slice(0, 5)))
          .map((name, index) => ({
            kind: "map-feature",
            entityId: name,
            title: name,
            titleSegments: [{ text: name, hit: true }],
            subtitle: "Farm, United Kingdom",
            collection: null,
            url: `/maps?feature=${index}`,
            tags: [],
            score: 1 - index / 40,
            passages: [],
            sources: ["keyword"],
          })),
    });
    const water = (await test.api("GET", "/api/search?q=water")).body;
    expect(ids(water)).toEqual(["n"]);
    expect(water.places.map((place: Result) => place.title)).toContain("Waterfields");
    expect(water.placesFirst).toBe(false);
    expect(water.facets["map-feature"]).toBe(3);
    expect(water.results[0].score).toBeLessThan(1);

    expect((await test.api("GET", "/api/search?q=waterfields")).body.placesFirst).toBe(true);
    const asked = (await test.api("GET", "/api/search?q=water&kinds=map-feature")).body;
    expect(asked.results.map((result: Result) => result.kind)).toEqual(["map-feature", "map-feature", "map-feature"]);
  });
});

describe("reference collections", () => {
  it("are asked for the words that matter, and their answers are scored on the same scale and put in order", async () => {
    const kiwix = await startSlowKiwix({
      books: [
        {
          uuid: uuidFor(1),
          name: "qa",
          title: "Mechanics Q&A",
          delayMs: 0,
          articles: [],
          hits: [
            { title: "Why does my car pull to the left?", path: "q/1", snippet: "...the car pulls when braking..." },
            { title: "Battery light comes on", path: "q/2", snippet: "...the battery light on the dash of the car..." },
            { title: "How to change a car battery", path: "q/3", snippet: "...to change the car battery, first undo..." },
          ],
        },
      ],
    });
    cleanups.push(() => kiwix.close());
    const test = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url });
    cleanups.push(() => test.close());
    const location = test.ctx.services.storage.getDefault();
    const [relPath] = writeArchives(location.path, kiwix.books);
    await test.api("POST", "/api/kiwix/import", { locationId: location.id, relPath, title: "Mechanics Q&A" });
    test.ctx.services.search.upsert({
      kind: "note",
      entityId: "own",
      title: "Garage",
      url: "/notes/own",
      sections: [{ text: "The car battery is under the bonnet." }],
    });

    const { body } = await test.api("GET", `/api/search?q=${encodeURIComponent("how to change car battery")}`);
    expect(kiwix.started).toContain("qa: change car battery");
    const titles = body.results.map((result: Result) => result.title);
    // kiwix-serve's own order put this last; every word, in the title, puts it first.
    expect(titles[0]).toBe("How to change a car battery");
    expect(body.results[0].why).toBe("All 3 words in the title; favoured: vehicle source");
    // One word of three, and a common one: not shown.
    expect(titles).not.toContain("Why does my car pull to the left?");
    // One scale: the article with every word outranks Outpost's own note with two of them.
    const own = body.results.find((result: Result) => result.entityId === "own");
    expect(own.score).toBeLessThan(body.results[0].score);
  });
});

describe("words and meaning together", () => {
  it("score more than either alone, and meaning alone stays below a result with every word", () => {
    const result = (entityId: string, score: number, source: string): SearchResult => ({
      kind: "note",
      entityId,
      title: entityId,
      titleSegments: [],
      subtitle: null,
      collection: null,
      url: `/notes/${entityId}`,
      tags: [],
      score,
      passages: [],
      sources: [source],
    });
    const blended = blendMeaning(
      [result("both", 0.7, "keyword"), result("words", 0.75, "keyword")],
      [result("both", 0.6, "semantic"), result("meaning", 0.95, "semantic")],
      { keywordWeight: 1, semanticWeight: 1 },
    );
    expect(blended.map((item) => item.entityId)).toEqual(["both", "words", "meaning"]);
    expect(blended[0]!.sources).toEqual(["keyword", "semantic"]);
    expect(blended[2]!.score).toBeLessThanOrEqual(0.6);
  });
});
