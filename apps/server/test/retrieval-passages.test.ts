/**
 * Which passages are handed to a language model for a question: chosen passage by
 * passage, by their words and, when search by meaning is on, by meaning too.
 */
import { afterEach, describe, expect, it } from "vitest";
import { subjectOf } from "../src/modules/answers/index.ts";
import { demoProvider } from "../src/modules/semantic/providers.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function library(): Promise<TestApp> {
  const app = await createTestApp();
  apps.push(app);
  const { search } = app.ctx.services;
  const note = (id: string, title: string, sections: Array<{ heading: string; text: string }>) =>
    search.upsert({ kind: "note", entityId: id, title, url: `/notes/${id}`, tags: [], sections });
  // One long item about water, whose passages mostly do not answer a question about boiling.
  note("water", "Water", [
    { heading: "Boiling", text: "Bring the water to a rolling boil and keep it there for one minute." },
    { heading: "Storing", text: "Store treated water in clean containers, in the dark. It keeps for six months." },
    { heading: "Tablets", text: "One tablet treats one litre of clear water. Wait thirty minutes before drinking." },
    { heading: "Sources", text: "Rain water from a clean roof is the best water to start from." },
  ]);
  note("stove", "Stove", [{ heading: "Fuel", text: "The stove will boil a litre of water in four minutes on gas." }]);
  note("radio", "Radio", [{ heading: "Codes", text: "The Q code is a set of three-letter signals. QTH is your location." }]);
  note("hens", "Hens", [{ heading: "Housing", text: "Keep dogs away from the run, even friendly ones." }]);
  note("copy", "Water, second copy", [{ heading: "Boiling", text: "Bring the water to a rolling boil and keep it there for one minute." }]);
  return app;
}

const found = async (app: TestApp, q: string, extra: Record<string, unknown> = {}) => {
  const { search } = app.ctx.services;
  const response = await search.searchPassages({ q, kinds: ["note"], mode: "keyword", ...extra });
  const records = new Map(search.getChunks(response.hits.map((hit) => hit.chunkId)).map((record) => [record.chunkId, record]));
  return {
    ...response,
    where: response.hits.map((hit) => `${records.get(hit.chunkId)!.title}/${records.get(hit.chunkId)!.heading}`),
  };
};

describe("finding passages by their words", () => {
  it("ranks passages, not the items they belong to, and takes the same text once", async () => {
    const app = await library();
    const result = await found(app, "boil water");
    // Both passages that hold both words, whichever item each is in; the other passages of "Water" are not dragged along,
    // and the second copy of the same text is left out.
    expect(result.where.slice(0, 2).sort()).toEqual(["Stove/Fuel", "Water/Boiling"]);
    expect(result.where).not.toContain("Water, second copy/Boiling");
    expect(result.relaxed).toBe(false);
    expect(result.hits.every((hit) => hit.keywordRank !== null && hit.semanticRank === null && hit.similarity === null)).toBe(true);
    expect(result.hits[0]!.score).toBe(1);
  });

  it("when too few passages hold every word, adds those that hold most of what the question is about, and no others", async () => {
    const app = await library();
    // No passage has all three words. The ones about storing water hold two of them; one that only says "water" does not count.
    const partly = await found(app, "storing water barrels");
    expect(partly.relaxed).toBe(true);
    expect(partly.where).toEqual(["Water/Storing"]);
    expect(partly.hits[0]!.coverage).toBeGreaterThanOrEqual(0.5);
    expect(partly.hits[0]!.coverage).toBeLessThan(1);
  });

  it("finds nothing for a question that shares one common word with the library", async () => {
    const app = await library();
    // "Code" is in the radio notes and "dogs" in the notes on hens. Neither is about the Countryside Code.
    expect(subjectOf("What does the Countryside Code say about dogs?")).toBe("Countryside Code say dogs");
    expect((await found(app, "Countryside Code say dogs")).hits).toEqual([]);
    expect((await found(app, "bake sourdough bread")).hits).toEqual([]);
    // The retrieval endpoint answers the same.
    const passages = await app.api("POST", "/api/retrieval/passages", { query: "Countryside Code say dogs", mode: "keyword" });
    expect(passages.body.passages).toEqual([]);
  });

  it("still finds a passage when one word of the question is not in the library at all", async () => {
    const app = await library();
    // Nothing says "purify", and the question is plainly about the tablets.
    const result = await found(app, "purify water tablet litre");
    expect(result.where[0]).toBe("Water/Tablets");
    // In a library of two notes, too: a word nothing holds does not outweigh the ones that are found.
    const small = await createTestApp();
    apps.push(small);
    small.ctx.services.search.upsert({
      kind: "note",
      entityId: "knots",
      title: "Knots",
      url: "/notes/knots",
      tags: [],
      sections: [{ heading: "Loops", text: "The bowline makes a fixed loop at the end of a rope." }],
    });
    expect((await found(small, subjectOf("How do I tie a bowline loop?"))).where).toEqual(["Knots/Loops"]);
  });

  it("can be kept to the passages of one item, and to a number of passages", async () => {
    const app = await library();
    const within = await found(app, "water", { within: { kind: "note", entityId: "water" }, limit: 30 });
    expect(within.where.every((place) => place.startsWith("Water/"))).toBe(true);
    expect(within.where).toHaveLength(4);
    expect((await found(app, "water", { limit: 2 })).hits).toHaveLength(2);
    expect((await found(app, "water", { limit: 10, perItem: 1 })).where.filter((place) => place.startsWith("Water/"))).toHaveLength(1);
  });

  it("searches for the generator, not for a word “generator's” that no passage holds", () => {
    expect(subjectOf("How often should the generator's oil be changed?")).toBe("generator oil changed");
    expect(subjectOf("What is Naismith’s rule?")).toBe("Naismith rule");
  });
});

describe("finding passages by words and meaning together", () => {
  it("puts a passage both found first, drops passages far from the question, and says how each was found", async () => {
    const app = await library();
    const { semantic, search, settings } = app.ctx.services;
    // Word-count vectors stand in for an embedding model: near in meaning is then near in vocabulary, which is enough here.
    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true, "search.semantic.provider": "demo" });
    await app.api("POST", "/api/semantic/index");
    await expect
      .poll(async () => {
        const status = (await app.api("GET", "/api/semantic/status")).body;
        return !status.indexing && status.embeddedChunks >= status.totalChunks;
      })
      .toBe(true);
    expect(settings.get("search.semantic.provider")).toBe("demo");
    expect(semantic.index.count(demoProvider().modelId)).toBeGreaterThan(0);

    const both = await search.searchPassages({ q: "rolling boil water one minute", kinds: ["note"] });
    expect(both.mode).toBe("hybrid");
    const records = new Map(search.getChunks(both.hits.map((hit) => hit.chunkId)).map((record) => [record.chunkId, record]));
    const first = both.hits[0]!;
    expect(records.get(first.chunkId)!.heading).toBe("Boiling");
    expect(first.keywordRank).toBe(1);
    expect(first.semanticRank).not.toBeNull();
    expect(first.similarity).toBeGreaterThan(0.3);
    // Nothing unrelated came along: the notes on hens and the radio share no meaning with the question.
    expect([...records.values()].map((record) => record.title)).not.toContain("Hens");
    expect([...records.values()].map((record) => record.title)).not.toContain("Radio");
    // Every passage found by meaning alone is on the subject, and not far behind the nearest.
    const nearest = Math.max(...both.hits.map((hit) => hit.similarity ?? 0));
    for (const hit of both.hits.filter((entry) => entry.keywordRank === null && entry.coverage === null)) {
      expect(hit.similarity).toBeGreaterThanOrEqual(0.3);
      expect(hit.similarity).toBeGreaterThanOrEqual(nearest - 0.2);
    }

    // The retrieval endpoint says, passage by passage, which layer found it.
    const passages = (await app.api("POST", "/api/retrieval/passages", { query: "rolling boil water one minute" })).body.passages;
    expect(passages[0]).toMatchObject({ heading: "Boiling", retrievedBy: ["keyword", "semantic"], score: 1 });
  });
});
