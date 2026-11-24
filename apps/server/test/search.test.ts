import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chunkSections } from "../src/modules/search/chunker.ts";
import { reciprocalRankFusion } from "../src/modules/search/fusion.ts";
import { parseQuery, toFtsQuery, toSegments } from "../src/modules/search/query.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("query parsing", () => {
  it("requires every word and prefixes the one being typed", () => {
    expect(toFtsQuery(parseQuery("water purif"))).toBe('("water" AND "purif"*)');
    expect(toFtsQuery(parseQuery("water purification "))).toBe('("water" AND "purification")');
  });

  it("supports phrases and exclusions", () => {
    expect(toFtsQuery(parseQuery('"clove hitch" -sailing knots '))).toBe('("clove hitch" AND "knots") NOT "sailing"');
  });

  it("neutralises FTS syntax typed by a person", () => {
    for (const hostile of ["title: x OR y", "a AND (b", '"unterminated', "NEAR(a b)", "x* ^y", "{text}: z", "a - b", '""']) {
      const expression = toFtsQuery(parseQuery(hostile));
      // Every term is quoted, so operators and column filters are only ever plain words.
      if (expression) expect(expression.replace(/"[^"]*"\*?/g, "").replace(/\b(AND|OR|NOT)\b|[() ]/g, "")).toBe("");
    }
    expect(toFtsQuery(parseQuery("   "))).toBeNull();
    expect(toFtsQuery(parseQuery("-only"))).toBeNull();
  });

  it("turns highlight markers into segments without trusting the text as HTML", () => {
    expect(toSegments("boil \u0002water\u0003 for <b>one</b> minute")).toEqual([
      { text: "boil ", hit: false },
      { text: "water", hit: true },
      { text: " for <b>one</b> minute", hit: false },
    ]);
  });
});

describe("chunking", () => {
  it("keeps passages inside their page and records offsets", () => {
    const pageOne = "First page. ".repeat(60).trim();
    const pageTwo = "Second page text.";
    const passages = chunkSections(
      [
        { text: pageOne, page: 1, heading: "Intro" },
        { text: pageTwo, page: 2 },
      ],
      { size: 300, overlap: 40 },
    );
    expect(passages.length).toBeGreaterThan(2);
    expect(passages.every((passage) => passage.text.length <= 300)).toBe(true);
    const last = passages.at(-1)!;
    expect(last).toMatchObject({ page: 2, text: pageTwo, heading: "" });
    expect(passages[0]).toMatchObject({ page: 1, heading: "Intro", charStart: 0 });
    const whole = `${pageOne}\n\n${pageTwo}`;
    for (const passage of passages) expect(whole.slice(passage.charStart, passage.charEnd)).toBe(passage.text);
    // Overlap: consecutive passages on a page share some text.
    expect(passages[1]!.charStart).toBeLessThan(passages[0]!.charEnd);
  });

  it("gives identical text an identical hash", () => {
    const [a] = chunkSections([{ text: "Same words." }], { size: 500, overlap: 0 });
    const [b] = chunkSections([{ text: "Same words." }], { size: 900, overlap: 100 });
    expect(a!.contentHash).toBe(b!.contentHash);
  });
});

describe("rank fusion", () => {
  it("rewards items that several lists agree on", () => {
    const fused = reciprocalRankFusion(
      [
        { weight: 1, items: ["a", "b", "c"] },
        { weight: 1, items: ["c", "a", "d"] },
      ],
      (item) => item,
      60,
    );
    expect(fused.map((entry) => entry.item)).toEqual(["a", "c", "b", "d"]);
    expect(fused[0]!.ranks).toEqual([1, 2]);
    expect(fused[3]!.ranks).toEqual([null, 3]);
  });

  it("respects weights", () => {
    const fused = reciprocalRankFusion(
      [
        { weight: 1, items: ["a"] },
        { weight: 3, items: ["b"] },
      ],
      (item) => item,
    );
    expect(fused[0]!.item).toBe("b");
  });
});

describe("keyword search", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
    const { search } = app.ctx.services;
    search.upsert({
      kind: "document",
      entityId: "d1",
      title: "Water purification in the field",
      url: "/library/documents/d1",
      collection: "Survival",
      tags: ["water", "first aid"],
      sections: [
        { page: 1, text: "Boiling is the most reliable way to make water safe. Bring it to a rolling boil for one minute." },
        { page: 2, text: "Chemical treatment with chlorine dioxide tablets takes thirty minutes. Filters remove protozoa and bacteria." },
      ],
    });
    search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Kit list",
      url: "/notes/n1",
      sections: [{ heading: "Cooking", text: "Stove, gas, lighter, pan for boiling water, mug." }],
    });
    search.upsert({
      kind: "document",
      entityId: "d2",
      title: "Knots for climbing",
      url: "/library/documents/d2",
      tags: ["rope"],
      sections: [{ page: 4, text: "The clove hitch is quick to tie and easy to adjust at a belay." }],
    });
  });
  afterEach(() => app.close());

  it("ranks a title match above a passing mention and links to the page", async () => {
    const { body } = await app.api("GET", "/api/search?q=water");
    expect(body.results.map((result: { entityId: string }) => result.entityId)).toEqual(["d1", "n1"]);
    expect(body.results[0].score).toBeGreaterThan(0.9);
    expect(body.results[0].why).toBe("In the title");
    expect(body.results[0].titleSegments).toContainEqual({ text: "Water", hit: true });
    expect(body.results[0].url).toMatch(/^\/library\/documents\/d1\?page=\d$/);
    expect(body.facets).toEqual({ document: 1, note: 1 });
  });

  it("finds a phrase on the right page and highlights it", async () => {
    const { body } = await app.api("GET", `/api/search?q=${encodeURIComponent('"chlorine dioxide"')}`);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].passages[0].page).toBe(2);
    expect(body.results[0].url).toBe("/library/documents/d1?page=2");
    expect(body.results[0].passages[0].segments.some((segment: { hit: boolean }) => segment.hit)).toBe(true);
  });

  it("matches word forms, prefixes, and accents", async () => {
    expect((await app.api("GET", "/api/search?q=boil ")).body.total).toBe(2);
    expect((await app.api("GET", "/api/search?q=clov")).body.results[0].entityId).toBe("d2");
    expect((await app.api("GET", `/api/search?q=${encodeURIComponent("wäter ")}`)).body.total).toBe(2);
  });

  it("filters by kind and by tag, and searches tags and headings", async () => {
    expect((await app.api("GET", "/api/search?q=water&kinds=note")).body.results.map((r: { entityId: string }) => r.entityId)).toEqual([
      "n1",
    ]);
    expect((await app.api("GET", "/api/search?q=rope ")).body.results[0].entityId).toBe("d2");
    expect((await app.api("GET", "/api/search?q=cooking ")).body.results[0].entityId).toBe("n1");
    expect((await app.api("GET", `/api/search?q=water&tag=${encodeURIComponent("first aid")}`)).body.total).toBe(1);
  });

  it("falls back to any-word matching and says so", async () => {
    const { body } = await app.api("GET", "/api/search?q=hitch+tablets+");
    expect(body.relaxed).toBe(true);
    expect(body.total).toBe(2);
  });

  it("counts every match, not only the page asked for, so that every page can be reached", async () => {
    const { search } = app.ctx.services;
    for (let index = 0; index < 30; index += 1) {
      search.upsert({
        kind: index % 3 === 0 ? "note" : "document",
        entityId: `r${index}`,
        title: `Radio log ${index}`,
        url: `/library/documents/r${index}`,
        sections: [{ text: `Radio contact number ${index}.` }],
      });
    }
    const seen = new Set<string>();
    for (let offset = 0; offset < 30; offset += 2) {
      const { body } = await app.api("GET", `/api/search?q=radio&limit=2&offset=${offset}`);
      expect(body.total).toBe(30);
      for (const result of body.results) seen.add(result.entityId);
    }
    expect(seen.size).toBe(30);
    expect((await app.api("GET", "/api/search?q=radio&limit=2&kinds=note")).body.total).toBe(10);
  });

  it("counts each kind the same whichever kind is asked for, and lists as many as it counts", async () => {
    const { search } = app.ctx.services;
    // Six documents hold "radio" itself, one page holds only a longer word it begins.
    for (let index = 0; index < 6; index += 1) {
      search.upsert({
        kind: "document",
        entityId: `r${index}`,
        title: `Radio log ${index}`,
        url: `/library/documents/r${index}`,
        sections: [{ text: "A radio contact." }],
      });
    }
    search.upsert({
      kind: "note",
      entityId: "rn",
      title: "Radiograph",
      url: "/notes/rn",
      sections: [{ text: "Radiographs of the knee." }],
    });
    const everything = (await app.api("GET", "/api/search?q=radio")).body;
    const pages = (await app.api("GET", "/api/search?q=radio&kinds=note")).body;
    const documents = (await app.api("GET", "/api/search?q=radio&kinds=document")).body;
    expect(pages.facets).toEqual(everything.facets);
    expect(documents.facets).toEqual(everything.facets);
    expect(pages.total).toBe(everything.facets.note ?? 0);
    expect(documents.total).toBe(everything.facets.document);
  });

  it("survives hostile input", async () => {
    for (const q of ['"', "AND OR NOT", "title:*", "a) OR (b", "\\", "NEAR(", "x".repeat(600)]) {
      const response = await app.api("GET", `/api/search?q=${encodeURIComponent(q)}`);
      expect([200, 400], q).toContain(response.status);
    }
  });

  it("replaces an entity's passages on update and forgets removed entities", async () => {
    const { search } = app.ctx.services;
    const unchanged = search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Kit list (summer)",
      url: "/notes/n1",
      sections: [{ heading: "Cooking", text: "Stove, gas, lighter, pan for boiling water, mug." }],
    });
    expect(unchanged.changed).toBe(false);
    expect((await app.api("GET", "/api/search?q=summer ")).body.total).toBe(1);

    const changed = search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Kit list",
      url: "/notes/n1",
      sections: [{ text: "Tent and sleeping bag." }],
    });
    expect(changed.changed).toBe(true);
    expect((await app.api("GET", "/api/search?q=stove ")).body.total).toBe(0);
    expect((await app.api("GET", "/api/search?q=tent ")).body.total).toBe(1);

    search.remove("note", "n1");
    expect((await app.api("GET", "/api/search?q=tent ")).body.total).toBe(0);
    expect(search.stats().entities).toEqual({ document: 2 });
  });

  it("puts what is on this device above what would have to be downloaded, on every page", async () => {
    const { search } = app.ctx.services;
    // Catalogue entries that match better than anything kept: water in the title, three times over.
    for (let index = 0; index < 4; index += 1) {
      search.upsert({
        kind: "catalog",
        entityId: `c${index}`,
        title: `Water water water library ${index}`,
        url: "/explore",
        tags: ["water"],
        sections: [{ text: "A collection about making water safe to drink: water, water, water." }],
      });
    }
    const { body } = await app.api("GET", "/api/search?q=water");
    expect(body.results.map((result: { kind: string }) => result.kind)).toEqual(["document", "note", ...Array(4).fill("catalog")]);
    // Scores are on one scale from 0 to 1, whatever found the result.
    expect(body.results.every((result: { score: number }) => result.score <= 1)).toBe(true);
    expect(body.facets).toEqual({ document: 1, note: 1, catalog: 4 });

    // Page by page the order holds: nothing kept turns up after something to download.
    const kinds: string[] = [];
    for (let offset = 0; offset < 6; offset += 2) {
      kinds.push(
        ...(await app.api("GET", `/api/search?q=water&limit=2&offset=${offset}`)).body.results.map((r: { kind: string }) => r.kind),
      );
    }
    expect(kinds).toEqual(["document", "note", "catalog", "catalog", "catalog", "catalog"]);

    // Only what is to download is still listed by itself.
    expect((await app.api("GET", "/api/search?q=water&kinds=catalog")).body.results).toHaveLength(4);
  });

  it("keeps an entity with no text findable by title", async () => {
    app.ctx.services.search.upsert({
      kind: "document",
      entityId: "img",
      title: "Trailhead photograph",
      url: "/library/documents/img",
      sections: [],
    });
    expect((await app.api("GET", "/api/search?q=trailhead ")).body.total).toBe(1);
  });
});
