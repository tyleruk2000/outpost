import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectTo2d } from "../src/modules/retrieval/explain.ts";
import { demoProvider, demoTerms } from "../src/modules/semantic/providers.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("demonstration vectors", () => {
  it("point the same way for texts that share words, and say which words they used", async () => {
    const provider = demoProvider();
    const [boil, boiled, rope] = await provider.embed(["Boil the water for one minute.", "The water was boiled.", "Coil the rope neatly."], "passage");
    const dot = (a: Float32Array, b: Float32Array) => a.reduce((sum, value, index) => sum + value * b[index]!, 0);
    expect(dot(boil!, boiled!)).toBeGreaterThan(0.4);
    expect(Math.abs(dot(boil!, rope!))).toBeLessThan(0.2);
    expect(Math.hypot(...boil!)).toBeCloseTo(1, 5);
    expect(demoTerms("The water was boiling and boiled")).toEqual(["water", "boil", "boil"]);
  });
});

describe("flattening vectors to two dimensions", () => {
  it("keeps apart what is apart and reports how much each axis explains", () => {
    const cluster = (centre: number[], n: number) => Array.from({ length: n }, (_, index) => Float32Array.from(centre.map((value, d) => value + Math.sin(index * 7 + d) * 0.05)));
    const vectors = [...cluster([1, 0, 0, 0, 0, 0], 12), ...cluster([0, 1, 0, 0, 0, 0], 12), ...cluster([0, 0, 1, 0, 0, 0], 12)];
    const { points, explained } = projectTo2d(vectors);
    expect(points).toHaveLength(36);
    const centroid = (from: number) => {
      const slice = points.slice(from, from + 12);
      return [slice.reduce((s, p) => s + p[0], 0) / 12, slice.reduce((s, p) => s + p[1], 0) / 12] as const;
    };
    const distance = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const [a, b, c] = [centroid(0), centroid(12), centroid(24)];
    // Three well-separated groups stay three groups on the page.
    for (const pair of [[a, b], [a, c], [b, c]] as const) expect(distance(pair[0], pair[1])).toBeGreaterThan(0.5);
    expect(explained[0] + explained[1]).toBeGreaterThan(0.9);
    expect(explained[0]).toBeGreaterThanOrEqual(explained[1]);
    expect(projectTo2d([])).toEqual({ points: [], explained: [0, 0] });
  });
});

describe("how search works", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
    const { search } = app.ctx.services;
    await app.api("PATCH", "/api/settings", { "indexing.chunkSize": 300, "indexing.chunkOverlap": 60 });
    search.upsert({
      kind: "document", entityId: "d-water", title: "Water treatment in the field", url: "/library/documents/d-water", collection: "Medicine and first aid", tags: ["water"],
      sections: [
        { page: 1, heading: "Boiling", text: "Boiling is the most reliable way to make water safe to drink. Bring the water to a rolling boil for one minute. At altitude, boil for three minutes because water boils at a lower temperature. Let it cool before drinking and keep it covered so that it stays clean. ".repeat(2) },
        { page: 2, heading: "Chemical treatment", text: "Chlorine dioxide tablets treat one litre of water in thirty minutes. Cold or cloudy water takes longer." },
      ],
    });
    search.upsert({ kind: "document", entityId: "d-knots", title: "Knots for climbing", url: "/library/documents/d-knots", sections: [{ page: 4, text: "The clove hitch is quick to tie. The bowline makes a fixed loop at the end of a rope." }] });
    search.upsert({ kind: "note", entityId: "n-kit", title: "Kit list", url: "/notes/n-kit", sections: [{ heading: "Cooking", text: "Stove, gas, lighter, a pan for boiling water, a mug." }] });
  });
  afterEach(() => app.close());

  it("describes the index: what is in it, how passages were cut, and which vectors are in use", async () => {
    const { status, body } = await app.api("GET", "/api/retrieval/overview");
    expect(status).toBe(200);
    expect(body.entities).toEqual({ document: 2, note: 1 });
    expect(body.chunks).toBeGreaterThanOrEqual(4);
    expect(body.chunkLengths.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(body.chunks);
    expect(body.settings).toMatchObject({ chunkSize: 300, chunkOverlap: 60, rrfK: 60 });
    // No model is configured, so the page is told plainly that it is looking at demonstration vectors.
    expect(body.vectors).toMatchObject({ source: "demonstration", modelId: "demo:word-counts", dimensions: 256 });
    expect(body.vectors.reason).toMatch(/turned off/);
  });

  it("shows how one document was cut into overlapping passages", async () => {
    const list = (await app.api("GET", "/api/retrieval/entities")).body.entities;
    expect(list[0]).toMatchObject({ kind: "document", entityId: "d-water" });
    const { body } = await app.api("GET", "/api/retrieval/chunks?kind=document&entityId=d-water");
    expect(body.chunks.length).toBeGreaterThanOrEqual(3);
    expect(body.chunks[0]).toMatchObject({ ordinal: 0, page: 1, heading: "Boiling", overlapWithPrevious: 0 });
    // Passages cut from the same long section share some text with their neighbour.
    expect(body.chunks[1].overlapWithPrevious).toBeGreaterThan(0);
    expect(body.chunks[1].overlapWithPrevious).toBeLessThanOrEqual(80);
    // A new section starts clean.
    expect(body.chunks.at(-1)).toMatchObject({ page: 2, heading: "Chemical treatment", overlapWithPrevious: 0 });
    expect((await app.api("GET", "/api/retrieval/chunks?kind=document&entityId=nope")).status).toBe(404);
  });

  it("takes one query through every stage with real numbers", async () => {
    const { status, body } = await app.api("POST", "/api/retrieval/explain", { query: "boiling water" });
    expect(status).toBe(200);

    // Words, and how rare each is.
    expect(body.parse.words).toEqual(["boiling", "water"]);
    expect(body.parse.expression).toBe('("boiling" AND "water"*)');
    expect(body.parse.terms.map((term: { term: string }) => term.term)).toEqual(["boiling", "water"]);
    expect(body.parse.terms.every((term: { chunksContaining: number; idf: number }) => term.chunksContaining > 0 && term.idf > 0)).toBe(true);

    // Keyword hits are ranked passages with BM25 scores and where the words were found.
    const keyword = body.keyword.hits;
    expect(keyword.length).toBeGreaterThanOrEqual(2);
    expect(keyword[0].rank).toBe(1);
    expect(keyword[0].score).toBeGreaterThan(keyword[1].score - 1e-9);
    expect(keyword[0]).toMatchObject({ kind: "document", entityId: "d-water", fields: { title: true, text: true } });
    expect(keyword[0].segments.some((segment: { hit: boolean }) => segment.hit)).toBe(true);
    expect(keyword.find((hit: { entityId: string }) => hit.entityId === "n-kit").fields).toMatchObject({ title: false, text: true });

    // Vector hits come with similarities and enough of each vector to draw.
    expect(body.semantic).toMatchObject({ source: "demonstration", dimensions: 256 });
    expect(body.semantic.queryTerms).toEqual(["boil", "water"]);
    expect(body.semantic.queryVector).toHaveLength(64);
    expect(body.semantic.compared).toBeGreaterThanOrEqual(4);
    const semantic = body.semantic.hits;
    expect(semantic[0].similarity).toBeGreaterThan(0);
    expect(semantic[0].similarity).toBeGreaterThanOrEqual(semantic.at(-1).similarity);
    expect(semantic.every((hit: { entityId: string }) => hit.entityId !== "d-knots")).toBe(true);

    // Fusion: each row shows its place in both lists and what each contributed.
    const { k, rows } = body.fusion;
    expect(k).toBe(60);
    const top = rows[0];
    expect(top.rank).toBe(1);
    expect(top.score).toBeCloseTo(top.keywordPart + top.semanticPart, 10);
    if (top.keywordRank !== null) expect(top.keywordPart).toBeCloseTo(1 / (60 + top.keywordRank), 10);
    if (top.semanticRank !== null) expect(top.semanticPart).toBeCloseTo(1 / (60 + top.semanticRank), 10);
    expect(rows.map((row: { score: number }) => row.score)).toEqual([...rows.map((row: { score: number }) => row.score)].sort((a, b) => b - a));

    // Context: numbered sources with exact quotes, flagged as safety-critical, and the prompt that would be sent.
    expect(body.context.citations[0].marker).toBe(1);
    expect(body.context.text).toContain(`[1] `);
    expect(body.context.text).toContain(body.context.citations[0].quote);
    expect(body.context.safetyCritical).toBe(true);
    expect(body.context.approxTokens).toBe(Math.ceil(body.context.characters / 4));
    expect(body.prompt.system).toMatch(/cite the source/);
    expect(body.prompt.system).toMatch(/Quote the source's own wording/);
    expect(body.prompt.user).toContain("Question: boiling water");
    expect(body.timings.totalMs).toBeGreaterThan(0);
  });

  it("says when it had to fall back to matching any word", async () => {
    const { body } = await app.api("POST", "/api/retrieval/explain", { query: "bowline tablets " });
    expect(body.parse.relaxed).toBe(true);
    expect(body.parse.expression).toBe('("bowline" OR "tablets"*)');
    expect(body.keyword.hits.length).toBe(2);
  });

  it("uses the configured model's stored vectors once they exist", async () => {
    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true, "search.semantic.provider": "demo" });
    expect((await app.api("POST", "/api/semantic/index")).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const overview = (await app.api("GET", "/api/retrieval/overview")).body;
    expect(overview.vectors).toMatchObject({ source: "model", modelId: "demo:word-counts", reason: null });
    expect(overview.vectors.embedded).toBe(overview.chunks);
    const { body } = await app.api("POST", "/api/retrieval/explain", { query: "rope loop" });
    expect(body.semantic.source).toBe("model");
    expect(body.semantic.hits[0].entityId).toBe("d-knots");
    expect(body.semantic.hits[0].vector).toHaveLength(64);
    const chunks = (await app.api("GET", "/api/retrieval/chunks?kind=document&entityId=d-knots")).body.chunks;
    expect(chunks.every((chunk: { hasVector: boolean }) => chunk.hasVector)).toBe(true);
  });

  it("draws a map of the vectors with the query placed among them", async () => {
    const { status, body } = await app.api("POST", "/api/retrieval/projection", { query: "boiling water", limit: 50 });
    expect(status).toBe(200);
    expect(body.source).toBe("demonstration");
    expect(body.points.length).toBe(body.shown);
    expect(body.shown).toBeLessThanOrEqual(body.total);
    expect(body.query).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    const nearest = body.points.filter((point: { nearest: boolean }) => point.nearest);
    expect(nearest.length).toBeGreaterThan(0);
    expect(nearest.every((point: { similarity: number }) => point.similarity > 0)).toBe(true);
    // The passages about water sit closer to the query than the one about knots.
    const distance = (point: { x: number; y: number }) => Math.hypot(point.x - body.query.x, point.y - body.query.y);
    const water = body.points.filter((point: { title: string }) => point.title.startsWith("Water")).map(distance);
    const knots = body.points.filter((point: { title: string }) => point.title.startsWith("Knots")).map(distance);
    expect(Math.min(...water)).toBeLessThan(Math.min(...knots));
    // Without a query it is simply the map.
    const plain = (await app.api("POST", "/api/retrieval/projection", {})).body;
    expect(plain.query).toBeNull();
    expect(plain.points.every((point: { similarity: number | null }) => point.similarity === null)).toBe(true);
  });

  it("validates what it is asked", async () => {
    expect((await app.api("POST", "/api/retrieval/explain", { query: "" })).status).toBe(400);
    expect((await app.api("POST", "/api/retrieval/explain", { query: "x", limit: 500 })).status).toBe(400);
    expect((await app.api("POST", "/api/retrieval/projection", { limit: 5 })).status).toBe(400);
  });
});
