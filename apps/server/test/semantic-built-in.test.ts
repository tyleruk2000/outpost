import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { type BuiltInEmbedder, createBuiltInEmbedder } from "../src/modules/semantic/built-in.ts";
import manifest from "../src/modules/semantic/built-in-model.json" with { type: "json" };
import {
  BUILT_IN_MODEL,
  BUILT_IN_MODEL_ID,
  builtInInstallation,
  defaultModelDir,
  embedThreads,
  modelNameFor,
} from "../src/modules/semantic/built-in-model.ts";
import { type EmbeddingProvider, normalise } from "../src/modules/semantic/providers.ts";
import reference from "./fixtures/embedding-reference.json" with { type: "json" };
import { createTestApp, type TestApp } from "./helpers.ts";

/**
 * The model's files are fetched by a script and are not in the repository. Tests that
 * run the real model are skipped, and say so, when it has not been fetched:
 *
 *   node scripts/fetch-embedding-model.mjs
 */
const modelPresent = builtInInstallation(defaultModelDir()).installed;
const NEEDS_MODEL = "run `node scripts/fetch-embedding-model.mjs` once to include these";
if (!modelPresent)
  console.warn(`\nThe built-in embedding model is not on this machine, so the tests that run it are skipped: ${NEEDS_MODEL}.\n`);

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function embedder(options: Parameters<typeof createBuiltInEmbedder>[0] = {}): BuiltInEmbedder {
  const made = createBuiltInEmbedder(options);
  cleanups.push(() => made.close());
  return made;
}

function emptyFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-embed-test-"));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function testApp(): Promise<TestApp> {
  const app = await createTestApp();
  cleanups.push(() => app.close());
  return app;
}

/** A reference vector from the fixture, where each is stored as base64 of 32-bit floats. */
function referenceVector(index: number): Float32Array {
  const bytes = Buffer.from(reference.referenceVectors[index]!, "base64");
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index]! * b[index]!;
  return sum;
};

describe("the built-in embedding model: what does not need its files", () => {
  it("names its vectors after the exact files and settings that made them", () => {
    expect(BUILT_IN_MODEL_ID).toMatch(/^built-in:all-MiniLM-L6-v2-q8-[0-9a-f]{8}$/);
    const name = modelNameFor(manifest);
    const changed = (patch: object) => modelNameFor({ ...manifest, ...patch });
    expect(changed({})).toBe(name);
    // Any change that alters what a vector comes out as gives the vectors another name.
    expect(changed({ maxTokens: 512 })).not.toBe(name);
    expect(changed({ pooling: "cls" })).not.toBe(name);
    expect(changed({ files: { ...manifest.files, model: { ...manifest.files.model, sha256: "0".repeat(64) } } })).not.toBe(name);
    expect(changed({ files: { ...manifest.files, tokenizer: { ...manifest.files.tokenizer, sha256: "0".repeat(64) } } })).not.toBe(name);
    // The fixture of known-good values was made for this very model; regenerate it when the model changes.
    expect(reference.builtIn.modelId).toBe(BUILT_IN_MODEL_ID);
  });

  it("uses half the processors, and no more than four", () => {
    expect([1, 2, 4, 8, 12, 64].map(embedThreads)).toEqual([1, 1, 2, 4, 4, 4]);
  });

  it("says plainly when the model's files are missing or incomplete", async () => {
    const dir = emptyFolder();
    const missing = builtInInstallation(dir);
    expect(missing.installed).toBe(false);
    expect(!missing.installed && missing.reason).toMatch(/has not been fetched yet.*fetch-embedding-model/);

    // Every file there, but one cut short.
    for (const file of Object.values(BUILT_IN_MODEL.files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file.path)), { recursive: true });
      fs.writeFileSync(path.join(dir, file.path), Buffer.alloc(Math.min(file.bytes, 64)));
    }
    const short = builtInInstallation(dir);
    expect(!short.installed && short.reason).toMatch(/wrong size/);

    // Asking for a vector fails with the same explanation, and starts no worker.
    const provider = embedder({ modelDir: emptyFolder() });
    await expect(provider.embed(["water"], "query")).rejects.toThrow(/has not been fetched yet/);
    expect(provider.loaded()).toBe(false);
    expect(await provider.check()).toMatchObject({ ok: false, reason: expect.stringMatching(/has not been fetched yet/) });
  });

  it("is what turning search by meaning on gives, with nothing else to choose", async () => {
    const app = await testApp();
    // Off by default, and nothing is loaded while it is off.
    const off = (await app.api("GET", "/api/semantic/status")).body;
    expect(off).toMatchObject({ enabled: false, ready: false, modelId: null, provider: "built-in", build: null });
    expect(off.builtIn).toMatchObject({
      name: "all-MiniLM-L6-v2",
      licence: "Apache-2.0",
      languages: "English",
      dimensions: 384,
      bytes: 23684397,
    });

    await app.ctx.services.semantic.replaceBuiltIn({ modelDir: emptyFolder() });
    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true });
    const status = (await app.api("GET", "/api/semantic/status")).body;
    expect(status).toMatchObject({ enabled: true, provider: "built-in", modelId: BUILT_IN_MODEL_ID, ready: false, embeddedChunks: 0 });
    expect(status.builtIn).toMatchObject({ installed: false });
    expect(status.reason).toMatch(/has not been fetched yet/);
    expect(status.builtIn.reason).toBe(status.reason);

    // A build cannot start, and says why.
    const refused = await app.api("POST", "/api/semantic/index");
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/has not been fetched yet/);
    // Searching still works, by words.
    app.ctx.services.search.upsert({
      kind: "note",
      entityId: "n",
      title: "Water",
      url: "/notes/n",
      sections: [{ text: "Boil the water." }],
    });
    const { body } = await app.api("GET", "/api/search?q=water");
    expect(body.mode).toBe("keyword");
    expect(body.results[0].entityId).toBe("n");
  });

  it("treats the old in-process setting as the built-in model", async () => {
    const app = await testApp();
    // An installation that had chosen the provider this one replaces.
    const store = app.ctx.sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0)");
    store.run("search.semantic.provider", JSON.stringify("transformers"));
    store.run("search.semantic.enabled", JSON.stringify(true));
    const reopened = await createTestApp({}, app.dir);
    cleanups.push(() => reopened.app.close());
    expect((await reopened.api("GET", "/api/settings")).body.settings).toMatchObject({
      "search.semantic.enabled": true,
      "search.semantic.provider": "built-in",
    });
    expect((await reopened.api("GET", "/api/semantic/status")).body.modelId).toBe(BUILT_IN_MODEL_ID);
  });
});

/** A stand-in model that can be made to fail, to see what the build reports. */
function standIn(): EmbeddingProvider & { failing: boolean; embedded: number } {
  const provider = {
    modelId: "test:stand-in",
    provider: "test",
    model: "stand-in",
    failing: false,
    embedded: 0,
    async embed(texts: string[], _kind: "passage" | "query", signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (provider.failing) throw new Error("the model fell over");
      provider.embedded += texts.length;
      return texts.map((text) => normalise(Float32Array.from([text.length % 7, 1, text.includes("water") ? 5 : 0])));
    },
    async check() {
      return { ok: true as const, dimensions: 3 };
    },
  };
  return provider;
}

describe("the index build, as the settings screen sees it", () => {
  function addNote(app: TestApp, id: string, text: string) {
    app.ctx.services.search.upsert({ kind: "note", entityId: id, title: id, url: `/notes/${id}`, sections: [{ text }] });
  }

  it("reports the build: none, finished, and failed with the reason", async () => {
    const app = await testApp();
    const provider = standIn();
    app.ctx.services.semantic.overrideProvider(provider);
    addNote(app, "a", "Carry water.");
    expect((await app.api("GET", "/api/semantic/status")).body.build).toBeNull();

    await app.api("POST", "/api/semantic/index");
    await app.ctx.jobs.whenIdle();
    const built = (await app.api("GET", "/api/semantic/status")).body;
    expect(built.build).toMatchObject({ type: "semantic.index", state: "succeeded", progress: { current: 1, total: 1 } });
    expect(built).toMatchObject({ embeddedChunks: 1, indexing: false });

    addNote(app, "b", "Coil the rope.");
    provider.failing = true;
    await app.api("POST", "/api/semantic/index");
    // A failure is tried again a few seconds later; cancelling the wait makes it final for the test.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const waiting = (await app.api("GET", "/api/semantic/status")).body;
    expect(waiting.build).toMatchObject({ state: "queued", error: "the model fell over" });
    expect(waiting.indexing).toBe(true);
  });

  it("keeps the index up to date by itself only after a person has built it, and never against their pause", async () => {
    const app = await testApp();
    const provider = standIn();
    const { semantic } = app.ctx.services;
    semantic.overrideProvider(provider);
    addNote(app, "a", "Carry water.");

    // The library changed, but nobody has asked for an index: nothing is embedded.
    semantic.requestIndexing(false);
    await app.ctx.jobs.whenIdle();
    expect(provider.embedded).toBe(0);

    // A person builds it; from then on a change is picked up without asking.
    await app.api("POST", "/api/semantic/index");
    await app.ctx.jobs.whenIdle();
    expect(provider.embedded).toBe(1);
    addNote(app, "b", "Coil the rope.");
    semantic.requestIndexing(false);
    await app.ctx.jobs.whenIdle();
    expect(provider.embedded).toBe(2);

    // A build the person paused stays paused when the library changes …
    addNote(app, "c", "Pitch the tent.");
    const paused = app.ctx.jobs.enqueue(
      "semantic.index",
      { modelId: provider.modelId },
      { title: "Build semantic search index", subject: `semantic:${provider.modelId}`, paused: true },
    );
    semantic.requestIndexing(false);
    await app.ctx.jobs.whenIdle();
    expect(provider.embedded).toBe(2);
    expect((await app.api("GET", "/api/semantic/status")).body.build).toMatchObject({ id: paused.id, state: "paused" });

    // … and "Continue building" carries on with that same build rather than starting another.
    await app.api("POST", "/api/semantic/index");
    await app.ctx.jobs.whenIdle();
    expect(provider.embedded).toBe(3);
    expect((await app.api("GET", "/api/semantic/status")).body.build).toMatchObject({ id: paused.id, state: "succeeded" });

    // The same after a person stopped a build.
    addNote(app, "d", "Light the stove.");
    const stopped = app.ctx.jobs.enqueue(
      "semantic.index",
      { modelId: provider.modelId },
      { title: "Build semantic search index", subject: `semantic:${provider.modelId}`, paused: true },
    );
    app.ctx.jobs.cancel(stopped.id);
    semantic.requestIndexing(false);
    await app.ctx.jobs.whenIdle();
    expect(provider.embedded).toBe(3);
  });
});

describe.skipIf(!modelPresent)(`the built-in embedding model, run for real (${modelPresent ? "model present" : NEEDS_MODEL})`, () => {
  it("gives the vectors the model's own library gives", { timeout: 60_000 }, async () => {
    const provider = embedder();
    const vectors = await provider.embed(reference.sentences, "passage");
    expect(vectors).toHaveLength(reference.sentences.length);
    for (const [index, vector] of vectors.entries()) {
      expect(vector).toHaveLength(384);
      expect(Math.hypot(...vector)).toBeCloseTo(1, 5);
      // Same direction as sentence-transformers computed from the original weights. The
      // difference is the 8-bit weights: with the full-precision file this pipeline gave
      // the reference vectors exactly. A wrong tokenizer, pooling or cut-off lands far below.
      expect(dot(vector, referenceVector(index)), `sentence ${index}`).toBeGreaterThan(0.97);
    }
    for (let a = 0; a < vectors.length; a += 1) {
      for (let b = a + 1; b < vectors.length; b += 1) {
        const similarity = dot(vectors[a]!, vectors[b]!);
        expect(
          Math.abs(similarity - reference.referenceSimilarities[a]![b]!),
          `sentences ${a} and ${b} against the reference`,
        ).toBeLessThan(0.04);
        // And exactly what this pipeline gave when the fixture was made, on any machine:
        // WebAssembly arithmetic does not depend on the processor underneath.
        expect(
          Math.abs(similarity - reference.builtInSimilarities[a]![b]!),
          `sentences ${a} and ${b} against the recorded run`,
        ).toBeLessThan(0.0005);
      }
    }
    // What the numbers are for: the question is nearest the passage that answers it,
    // though they share no word, and the two radio sentences find each other.
    const nearest = (index: number) =>
      vectors
        .map((vector, other) => (other === index ? -1 : dot(vectors[index]!, vector)))
        .reduce((best, value, at, all) => (value > all[best]! ? at : best), 0);
    expect(nearest(0)).toBe(1);
    expect(nearest(5)).toBe(4);
  });

  it("cuts a long text at the model's limit, and gives the same vector whatever it is batched with", { timeout: 60_000 }, async () => {
    const provider = embedder();
    const long = reference.sentences.at(-1)!;
    // The fixture's last text is longer than 256 word pieces, so text added to its end is never seen.
    expect(reference.tokens.at(-1)).toBe(BUILT_IN_MODEL.maxTokens);
    const [alone] = await provider.embed([long], "passage");
    const [, withMore, , again] = await provider.embed(
      ["Tent", `${long} And then something else entirely about boats.`, "Stove", long],
      "passage",
    );
    expect(dot(alone!, withMore!)).toBeCloseTo(1, 6);
    expect([...again!]).toEqual([...alone!]);
    // Text that is nothing at all still gets a vector rather than an error.
    const [empty] = await provider.embed([""], "passage");
    expect(Math.hypot(...empty!)).toBeCloseTo(1, 5);
  });

  it("answers a question ahead of passages being indexed, and stops a request that is withdrawn", { timeout: 60_000 }, async () => {
    const provider = embedder();
    await provider.check();
    const passages = Array.from({ length: 40 }, (_, index) => `Passage ${index}. ${"Keep the stove outside the tent. ".repeat(12)}`);
    const order: string[] = [];
    const controller = new AbortController();
    const batch = provider.embed(passages, "passage").then(() => order.push("passages"));
    const withdrawn = provider.embed(passages, "passage", controller.signal).then(
      () => "finished",
      (reason) => `stopped: ${reason}`,
    );
    const question = provider.embed(["where does the stove go"], "query").then(() => order.push("question"));
    controller.abort("paused");
    expect(await withdrawn).toBe("stopped: paused");
    await Promise.all([batch, question]);
    expect(order).toEqual(["question", "passages"]);
    // The worker is still good for more.
    expect((await provider.embed(["again"], "query"))[0]).toHaveLength(384);
  });

  it("refuses files that are not the ones it was built with", { timeout: 60_000 }, async () => {
    const dir = emptyFolder();
    fs.cpSync(defaultModelDir(), dir, { recursive: true });
    // Same size, different contents: only the checksum can tell.
    const file = path.join(dir, BUILT_IN_MODEL.files.tokenizerConfig.path);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("[CLS]", "[SEP]"));
    expect(builtInInstallation(dir).installed).toBe(true);
    const provider = embedder({ modelDir: dir });
    const result = await provider.check();
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/tokenizer_config\.json does not match its checksum/) });
    expect(provider.loaded()).toBe(false);
  });

  it("lets go of the model after a spell of nothing to do, and loads it again when asked", { timeout: 60_000 }, async () => {
    const provider = embedder({ idleMs: 150 });
    await provider.embed(["water"], "query");
    expect(provider.loaded()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(provider.loaded()).toBe(false);
    expect((await provider.embed(["water"], "query"))[0]).toHaveLength(384);
  });

  it("makes search by meaning work from the settings alone", { timeout: 60_000 }, async () => {
    const app = await testApp();
    const { search } = app.ctx.services;
    search.upsert({
      kind: "document",
      entityId: "d-water",
      title: "Field hygiene",
      url: "/library/documents/d-water",
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
      entityId: "n-aerial",
      title: "Shack notes",
      url: "/notes/n-aerial",
      sections: [{ text: "A quarter-wave antenna for 145 MHz is about 49 cm long." }],
    });

    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true });
    const ready = (await app.api("GET", "/api/semantic/status")).body;
    expect(ready).toMatchObject({
      enabled: true,
      provider: "built-in",
      modelId: BUILT_IN_MODEL_ID,
      ready: true,
      reason: null,
      dimensions: 384,
    });
    expect(ready.builtIn).toMatchObject({ installed: true, reason: null });

    expect((await app.api("POST", "/api/semantic/index")).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const built = (await app.api("GET", "/api/semantic/status")).body;
    expect(built).toMatchObject({ totalChunks: 3, embeddedChunks: 3, indexing: false });
    expect(built.build).toMatchObject({ state: "succeeded", result: { embedded: 3, modelId: BUILT_IN_MODEL_ID } });

    // No word of the question is in the passage that answers it.
    const question = "purify stream water";
    expect((await app.api("GET", `/api/search?q=${encodeURIComponent(question)}&mode=keyword`)).body.results).toEqual([]);
    const byMeaning = (await app.api("GET", `/api/search?q=${encodeURIComponent(question)}&mode=semantic`)).body;
    expect(byMeaning.mode).toBe("semantic");
    expect(byMeaning.results[0]).toMatchObject({ entityId: "d-water", sources: ["semantic"] });
    expect(
      (await app.api("GET", `/api/search?q=${encodeURIComponent("what length should the aerial be")}&mode=semantic`)).body.results[0]
        .entityId,
    ).toBe("n-aerial");
    // The default mode is now hybrid, and still finds it.
    const hybrid = (await app.api("GET", `/api/search?q=${encodeURIComponent(question)}`)).body;
    expect(hybrid.mode).toBe("hybrid");
    expect(hybrid.results[0].entityId).toBe("d-water");

    expect((await app.api("POST", "/api/semantic/test", { text: "tying knots" })).body).toMatchObject({
      modelId: BUILT_IN_MODEL_ID,
      dimensions: 384,
    });

    // Vectors leave and arrive under the model's full name, so only the same model and settings ever load them.
    const exported = await app.app.inject({ method: "GET", url: "/api/semantic/export", headers: { host: "localhost" } });
    const lines = gunzipSync(exported.rawPayload).toString("utf8").trim().split("\n");
    expect(JSON.parse(lines[0]!)).toMatchObject({
      format: "outpost-embeddings",
      version: 1,
      modelId: BUILT_IN_MODEL_ID,
      provider: "built-in",
      dimensions: 384,
    });
    expect(lines).toHaveLength(4);
    expect(exported.headers["content-disposition"]).toContain(`outpost-embeddings-${BUILT_IN_MODEL_ID.replace(":", "_")}.jsonl.gz`);

    const other = await testApp();
    other.ctx.services.search.upsert({
      kind: "document",
      entityId: "elsewhere",
      title: "Field hygiene",
      url: "/library/documents/elsewhere",
      sections: [{ page: 3, heading: "Safe drinking", text: "Boil it for one minute, or filter and treat it, before drinking." }],
    });
    const imported = await other.app.inject({
      method: "POST",
      url: "/api/semantic/import",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/gzip" },
      payload: exported.rawPayload,
    });
    expect(imported.json()).toMatchObject({ modelId: BUILT_IN_MODEL_ID, vectorsInFile: 3, passagesUpdated: 1, vectorsWithoutPassage: 2 });
    await other.api("PATCH", "/api/settings", { "search.semantic.enabled": true });
    // Nothing was embedded there except the question itself.
    expect((await other.api("GET", `/api/search?q=${encodeURIComponent(question)}&mode=semantic`)).body.results[0].entityId).toBe(
      "elsewhere",
    );
  });

  it("pauses and continues a build, keeping what was done", { timeout: 90_000 }, async () => {
    const app = await testApp();
    for (let index = 0; index < 60; index += 1) {
      app.ctx.services.search.upsert({
        kind: "note",
        entityId: `n${index}`,
        title: `Note ${index}`,
        url: `/notes/n${index}`,
        sections: [{ text: `Entry ${index}. ${"Check the guy lines again after the first hour. ".repeat(10)}` }],
      });
    }
    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true, "search.semantic.batchSize": 4 });
    await app.api("POST", "/api/semantic/index");
    // Let it get somewhere, then pause it as the screen's button does.
    let status = (await app.api("GET", "/api/semantic/status")).body;
    for (let tries = 0; tries < 200 && status.embeddedChunks < 8; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      status = (await app.api("GET", "/api/semantic/status")).body;
    }
    expect(status.build.state).toBe("running");
    expect((await app.api("POST", `/api/jobs/${status.build.id}/pause`)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const paused = (await app.api("GET", "/api/semantic/status")).body;
    expect(paused.build).toMatchObject({ id: status.build.id, state: "paused" });
    expect(paused.indexing).toBe(false);
    expect(paused.embeddedChunks).toBeGreaterThanOrEqual(8);
    expect(paused.embeddedChunks).toBeLessThan(60);

    await app.api("POST", "/api/semantic/index");
    await app.ctx.jobs.whenIdle();
    const done = (await app.api("GET", "/api/semantic/status")).body;
    expect(done.build).toMatchObject({ id: status.build.id, state: "succeeded" });
    expect(done.embeddedChunks).toBe(60);
  });
});
