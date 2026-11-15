import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCitations } from "../src/modules/retrieval/index.ts";
import { type EmbeddingProvider, normalise } from "../src/modules/semantic/providers.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

/**
 * A stand-in embedding model for tests: each of a few concepts is an axis, and a text
 * points along the axes of the concept words it contains. It gives "boil" and
 * "purify" the same direction without sharing a single keyword, which is exactly the
 * behaviour semantic search exists for, with none of the weight of a real model.
 */
const concepts: Record<string, number> = {
  water: 0,
  boil: 0,
  boiling: 0,
  purify: 0,
  purification: 0,
  drinking: 0,
  filter: 0,
  hydrate: 0,
  thirst: 0,
  knot: 1,
  hitch: 1,
  rope: 1,
  bowline: 1,
  tie: 1,
  lashing: 1,
  wound: 2,
  bandage: 2,
  bleeding: 2,
  injury: 2,
  dressing: 2,
  stove: 3,
  tent: 3,
  shelter: 3,
  camp: 3,
};
function conceptProvider(modelId = "test:concepts", dimensions = 4): EmbeddingProvider & { calls: number } {
  const provider = {
    modelId,
    provider: "test",
    model: "concepts",
    calls: 0,
    async embed(texts: string[]) {
      provider.calls += 1;
      return texts.map((text) => {
        const vector = new Float32Array(dimensions);
        for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
          const axis = concepts[word];
          if (axis !== undefined && axis < dimensions) vector[axis] = vector[axis]! + 1;
        }
        if (vector.every((value) => value === 0)) vector[dimensions - 1] = 0.001;
        return normalise(vector);
      });
    },
    async check() {
      return { ok: true as const, dimensions };
    },
  };
  return provider;
}

describe("semantic and hybrid search", () => {
  let app: TestApp;
  let provider: ReturnType<typeof conceptProvider>;

  beforeEach(async () => {
    app = await createTestApp();
    const { search } = app.ctx.services;
    search.upsert({
      kind: "document",
      entityId: "d-water",
      title: "Field hygiene",
      url: "/library/documents/d-water",
      collection: "Medicine and first aid",
      sourcePath: "documents/d-water/hygiene.pdf",
      sections: [{ page: 3, heading: "Safe drinking", text: "Boil it for one minute, or filter and treat it, before drinking." }],
    });
    search.upsert({
      kind: "document",
      entityId: "d-knots",
      title: "Ropework",
      url: "/library/documents/d-knots",
      sections: [{ page: 1, text: "A bowline makes a fixed loop. A clove hitch holds a rope to a post." }],
    });
    search.upsert({
      kind: "note",
      entityId: "n-kit",
      title: "Kit list",
      url: "/notes/n-kit",
      sections: [{ text: "Tent, stove, sleeping bag and a bandage for each person." }],
    });
    provider = conceptProvider();
    app.ctx.services.semantic.overrideProvider(provider);
  });
  afterEach(() => app.close());

  async function buildIndex() {
    expect((await app.api("POST", "/api/semantic/index")).status).toBe(200);
    await app.ctx.jobs.whenIdle();
  }

  it("stays a keyword search, and says so, until vectors exist", async () => {
    const { body } = await app.api("GET", "/api/search?q=purification&mode=semantic");
    expect(body.mode).toBe("keyword");
    expect(body.warnings[0].source).toBe("semantic");
    expect(body.total).toBe(0);
  });

  it("builds vectors for every passage and reports progress in status", async () => {
    await buildIndex();
    const status = (await app.api("GET", "/api/semantic/status")).body;
    expect(status).toMatchObject({
      modelId: "test:concepts",
      ready: true,
      dimensions: 4,
      totalChunks: 3,
      embeddedChunks: 3,
      indexing: false,
    });
  });

  it("finds a passage by meaning that shares no keyword with the query", async () => {
    await buildIndex();
    const keyword = (await app.api("GET", "/api/search?q=purification&mode=keyword")).body;
    expect(keyword.total).toBe(0);
    const semantic = (await app.api("GET", "/api/search?q=purification&mode=semantic")).body;
    expect(semantic.mode).toBe("semantic");
    expect(semantic.results[0]).toMatchObject({ entityId: "d-water", sources: ["semantic"], url: "/library/documents/d-water?page=3" });
    expect(semantic.results[0].passages[0]).toMatchObject({ page: 3, heading: "Safe drinking" });
  });

  it("fuses keyword and semantic rankings in hybrid mode", async () => {
    await buildIndex();
    // "bandage" appears literally in the note; semantically it sits with wounds.
    const { body } = await app.api("GET", "/api/search?q=bandage+knot&mode=hybrid");
    expect(body.mode).toBe("hybrid");
    const ids = body.results.map((result: { entityId: string }) => result.entityId);
    expect(ids).toContain("n-kit");
    expect(ids).toContain("d-knots");
    const kit = body.results.find((result: { entityId: string }) => result.entityId === "n-kit");
    expect(kit.sources.sort()).toEqual(["keyword", "semantic"]);
  });

  it("embeds only what is new or changed", async () => {
    await buildIndex();
    const callsAfterFirstBuild = provider.calls;
    await buildIndex();
    expect(provider.calls).toBe(callsAfterFirstBuild + 0);
    app.ctx.services.search.upsert({
      kind: "note",
      entityId: "n-kit",
      title: "Kit list",
      url: "/notes/n-kit",
      sections: [{ text: "Rope and a tarp for shelter." }],
    });
    await buildIndex();
    expect(provider.calls).toBe(callsAfterFirstBuild + 1);
    expect((await app.api("GET", "/api/semantic/status")).body.embeddedChunks).toBe(3);
  });

  it("keeps vectors from different models and dimensions apart", async () => {
    await buildIndex();
    app.ctx.services.semantic.overrideProvider(conceptProvider("test:concepts-wide", 8));
    await buildIndex();
    const status = (await app.api("GET", "/api/semantic/status")).body;
    expect(status).toMatchObject({ modelId: "test:concepts-wide", dimensions: 8, embeddedChunks: 3 });
    expect(status.otherModels).toEqual([{ modelId: "test:concepts", dimensions: 4, vectors: 3 }]);
    expect((await app.api("GET", "/api/search?q=rope&mode=semantic")).body.results[0].entityId).toBe("d-knots");
    expect((await app.api("DELETE", `/api/semantic/models/${encodeURIComponent("test:concepts")}`)).body.removed).toBe(3);
  });

  it("exports vectors and imports them into another installation with the same passages", async () => {
    await buildIndex();
    const exported = await app.app.inject({ method: "GET", url: "/api/semantic/export", headers: { host: "localhost" } });
    expect(exported.statusCode).toBe(200);
    const lines = gunzipSync(exported.rawPayload).toString("utf8").trim().split("\n");
    expect(JSON.parse(lines[0]!)).toMatchObject({ format: "outpost-embeddings", version: 1, modelId: "test:concepts", dimensions: 4 });
    expect(lines).toHaveLength(4);

    const other = await createTestApp();
    try {
      // Same water passage, different ids; the knots document is absent here.
      other.ctx.services.search.upsert({
        kind: "document",
        entityId: "another-id",
        title: "Field hygiene",
        url: "/library/documents/another-id",
        sections: [{ page: 3, heading: "Safe drinking", text: "Boil it for one minute, or filter and treat it, before drinking." }],
      });
      const imported = await other.app.inject({
        method: "POST",
        url: "/api/semantic/import",
        headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/gzip" },
        payload: exported.rawPayload,
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json()).toMatchObject({ modelId: "test:concepts", vectorsInFile: 3, passagesUpdated: 1, vectorsWithoutPassage: 2 });
      // The receiving installation can search by meaning once it has a provider for queries.
      other.ctx.services.semantic.overrideProvider(conceptProvider());
      const { body } = await other.api("GET", "/api/search?q=thirst&mode=semantic");
      expect(body.results[0].entityId).toBe("another-id");
    } finally {
      await other.close();
    }
  });

  it("rejects an import that is not an embeddings export", async () => {
    const response = await app.app.inject({
      method: "POST",
      url: "/api/semantic/import",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/gzip" },
      payload: Buffer.from("not gzip at all"),
    });
    expect(response.statusCode).toBe(400);
  });

  it("explains what is missing when no provider is configured", async () => {
    app.ctx.services.semantic.overrideProvider(undefined);
    expect((await app.api("POST", "/api/semantic/index")).status).toBe(409);
    const status = (await app.api("GET", "/api/semantic/status")).body;
    expect(status.ready).toBe(false);
  });
});

describe("retrieval for future question answering", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
    app.ctx.services.search.upsert({
      kind: "document",
      entityId: "d1",
      title: "Home canning guide",
      url: "/library/documents/d1",
      collection: "Food preservation",
      sourcePath: "documents/d1/canning.pdf",
      sections: [
        {
          page: 12,
          heading: "Processing times",
          text: "Process pint jars of tomatoes in a boiling-water canner for 40 minutes at sea level.",
        },
        { page: 13, heading: "Altitude", text: "Add 5 minutes of processing time above 1,000 feet." },
      ],
    });
    app.ctx.services.search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Allotment diary",
      url: "/notes/n1",
      sections: [{ text: "Tomatoes ripened late this year." }],
    });
  });
  afterEach(() => app.close());

  it("returns passages with the provenance needed to cite them", async () => {
    const { body } = await app.api("POST", "/api/retrieval/passages", { query: "tomatoes processing" });
    const passage = body.passages.find((item: { entityId: string }) => item.entityId === "d1");
    expect(passage).toMatchObject({
      kind: "document",
      title: "Home canning guide",
      collection: "Food preservation",
      sourcePath: "documents/d1/canning.pdf",
      page: 12,
      heading: "Processing times",
      url: "/library/documents/d1?page=12",
      indexVersion: 1,
      retrievedBy: ["keyword"],
    });
    expect(passage.text).toContain("40 minutes");
    expect(passage.contentHash).toMatch(/^[0-9a-f]{32}$/);
    expect(typeof passage.chunkId).toBe("number");
    expect(passage.charEnd).toBeGreaterThan(passage.charStart);
  });

  it("assembles numbered context with exact quotes and flags safety-critical sources", async () => {
    const { body } = await app.api("POST", "/api/retrieval/context", { query: "tomatoes" });
    expect(body.safetyCritical).toBe(true);
    expect(body.citations.length).toBeGreaterThanOrEqual(2);
    expect(body.citations[0].marker).toBe(1);
    for (const citation of body.citations) expect(body.text).toContain(`[${citation.marker}] `);
    const canning = body.citations.find((citation: { entityId: string }) => citation.entityId === "d1");
    expect(body.text).toContain(canning.quote);
  });

  it("respects the context budget", async () => {
    const { body } = await app.api("POST", "/api/retrieval/context", { query: "tomatoes", maxChars: 200, limit: 1 });
    expect(body.citations).toHaveLength(1);
  });

  it("detects citation markers that point at no source", () => {
    const citations = [{ marker: 1 }, { marker: 2 }] as never;
    expect(checkCitations("Process for 40 minutes [1]. Add salt [3].", citations)).toEqual({ used: [1], unsupported: [3] });
  });
});
