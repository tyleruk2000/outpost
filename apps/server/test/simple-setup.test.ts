/**
 * The simple face of search by meaning and of answers: what the server does so that
 * the screen needs one switch for the first and three presses for the second.
 *
 * The embedding server here is a local fixture, and the model server is the stand-in
 * (model-server.ts). No real embedding server and no real language model is involved.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  type ChatModel,
  guideMarkdown,
  looksLikeEmbeddingModel,
  type ModelSetupLook,
  type ModelSetupTry,
  parametersInBillions,
  RECOMMENDED_MODELS,
  recommendedEntry,
  recommendModel,
  STARTING_MODEL,
} from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_MODEL_ID, builtInInstallation, defaultModelDir } from "../src/modules/semantic/built-in-model.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { startModelServer } from "./model-server.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function testApp(): Promise<TestApp> {
  const app = await createTestApp();
  cleanups.push(() => app.close());
  return app;
}

/** A local server that speaks the OpenAI embeddings format. `slowMs` makes each batch take a while. */
async function embeddingServer(options: { slowMs?: number } = {}) {
  let calls = 0;
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      calls += 1;
      const input = (JSON.parse(body) as { input: string[] }).input;
      const data = input.map((text, index) => ({ index, embedding: [text.includes("water") ? 3 : 0, text.includes("rope") ? 4 : 0, 1] }));
      setTimeout(
        () => {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ data }));
        },
        // The first request is the check that the server is there; only passages are slow.
        input.length === 1 && input[0] === "outpost" ? 0 : (options.slowMs ?? 0),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, calls: () => calls };
}

function addNote(app: TestApp, id: string, text: string) {
  app.ctx.services.search.upsert({ kind: "note", entityId: id, title: id, url: `/notes/${id}`, sections: [{ text }] });
}

const status = async (app: TestApp) => (await app.api("GET", "/api/semantic/status")).body;

/** Switches search by meaning on with a server of the person's own, and waits for what that sets going. */
async function switchOnWith(app: TestApp, endpoint: string, extra: Record<string, unknown> = {}) {
  const saved = await app.api("PATCH", "/api/settings", {
    "search.semantic.enabled": true,
    "search.semantic.provider": "openai-compatible",
    "search.semantic.endpoint": endpoint,
    "search.semantic.model": "test-embed",
    ...extra,
  });
  expect(saved.status).toBe(200);
  await app.ctx.services.semantic.settled();
}

describe("search by meaning: one switch", () => {
  it("builds its index by itself when it is switched on, and says when it is ready", async () => {
    const server = await embeddingServer();
    const app = await testApp();
    addNote(app, "w", "Carry two litres of water.");
    addNote(app, "r", "Coil the rope before stowing.");

    // Nothing but the switch (and, here, where the model is): no request to build anything.
    await switchOnWith(app, server.endpoint);
    await app.ctx.jobs.whenIdle();
    const built = await status(app);
    expect(built).toMatchObject({ enabled: true, ready: true, embeddedChunks: 2, totalChunks: 2, indexing: false, secondsLeft: null });
    expect(built.build).toMatchObject({ type: "semantic.index", state: "succeeded" });
    const { body } = await app.api("GET", "/api/search?q=water&mode=semantic");
    expect(body.mode).toBe("semantic");
    expect(body.results[0].entityId).toBe("w");
  });

  it("reads what is added afterwards without being asked, even when the library was empty at first", async () => {
    const server = await embeddingServer();
    const app = await testApp();
    await switchOnWith(app, server.endpoint);
    await app.ctx.jobs.whenIdle();
    expect(await status(app)).toMatchObject({ embeddedChunks: 0, totalChunks: 0 });

    // What the search module does a few seconds after passages change.
    addNote(app, "w", "Carry two litres of water.");
    app.ctx.services.semantic.requestIndexing(false);
    await app.ctx.jobs.whenIdle();
    expect(await status(app)).toMatchObject({ embeddedChunks: 1, totalChunks: 1 });
  });

  it("builds nothing when a setting that has nothing to do with it changes", async () => {
    const server = await embeddingServer();
    const app = await testApp();
    await switchOnWith(app, server.endpoint);
    await app.ctx.jobs.whenIdle();
    const before = server.calls();
    addNote(app, "w", "Carry two litres of water.");
    await app.api("PATCH", "/api/settings", { "downloads.concurrency": 3 });
    await app.ctx.services.semantic.settled();
    await app.ctx.jobs.whenIdle();
    expect(server.calls()).toBe(before);
    expect((await status(app)).embeddedChunks).toBe(0);
  });

  it("pauses the build when it is switched off, keeps what was read, and carries on when switched on again", async () => {
    const server = await embeddingServer({ slowMs: 150 });
    const app = await testApp();
    for (let index = 0; index < 6; index += 1) addNote(app, `n${index}`, `Note ${index} about water and rope.`);
    await switchOnWith(app, server.endpoint, { "search.semantic.batchSize": 1 });
    await expect.poll(async () => (await status(app)).embeddedChunks, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": false });
    await app.ctx.jobs.whenIdle();
    const off = await status(app);
    // Off: nothing is in use, and what was read is still there.
    expect(off).toMatchObject({ enabled: false, ready: false, indexing: false, embeddedChunks: 0 });
    expect(off.keptChunks).toBeGreaterThanOrEqual(2);
    expect(off.keptChunks).toBeLessThan(6);
    const kept = off.keptChunks;
    const paused = app.ctx.jobs.findBySubject("semantic:openai-compatible:test-embed").at(-1);
    expect(paused?.state).toBe("paused");
    // Searches go by words while it is off.
    expect((await app.api("GET", "/api/search?q=water&mode=semantic")).body.mode).toBe("keyword");

    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true });
    await app.ctx.services.semantic.settled();
    await app.ctx.jobs.whenIdle();
    const on = await status(app);
    expect(on).toMatchObject({ embeddedChunks: 6, totalChunks: 6, keptChunks: 6 });
    // The same build carried on; nothing that had been read was read again.
    expect(on.build).toMatchObject({ id: paused?.id, state: "succeeded" });
    expect(kept).toBeGreaterThan(0);
  });

  it("says how long a running build still needs, from its own speed", async () => {
    const server = await embeddingServer({ slowMs: 900 });
    const app = await testApp();
    for (let index = 0; index < 80; index += 1) addNote(app, `n${index}`, `Note ${index} about water.`);
    await switchOnWith(app, server.endpoint, { "search.semantic.batchSize": 8 });
    // Too early to say.
    expect((await status(app)).secondsLeft).toBeNull();
    await expect.poll(async () => (await status(app)).secondsLeft, { timeout: 15_000, interval: 500 }).not.toBeNull();
    const running = await status(app);
    expect(running.indexing).toBe(true);
    // Eight passages every 0.9 seconds: what is left of eighty takes a few seconds, not minutes.
    expect(running.secondsLeft).toBeGreaterThan(0);
    expect(running.secondsLeft).toBeLessThan(12);
    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": false });
    await app.ctx.jobs.whenIdle();
  });

  it("notices a set-up that cannot work, and starts nothing for it", async () => {
    const app = await testApp();
    addNote(app, "w", "Carry two litres of water.");
    // Pointing at a server that does not exist: the state the owner's own installation was left in.
    await switchOnWith(app, "http://127.0.0.1:9/v1");
    const broken = await status(app);
    expect(broken).toMatchObject({ enabled: true, ready: false, provider: "openai-compatible", build: null, embeddedChunks: 0 });
    expect(broken.reason).toMatch(/The embedding server at http:\/\/127\.0\.0\.1:9\/v1 is not reachable/);
    // The library changing does not start a build against a server that has just failed to answer.
    app.ctx.services.semantic.requestIndexing(false);
    await app.ctx.jobs.whenIdle();
    expect((await status(app)).build).toBeNull();
  });
});

const modelPresent = builtInInstallation(defaultModelDir()).installed;

describe("search by meaning: repairing a set-up that cannot work", () => {
  it("refuses, and changes nothing, when the built-in model is not part of the installation", async () => {
    const app = await testApp();
    const folder = fs.mkdtempSync(`${app.dir}/no-model-`);
    await app.ctx.services.semantic.replaceBuiltIn({ modelDir: folder });
    await app.api("PATCH", "/api/settings", {
      "search.semantic.provider": "openai-compatible",
      "search.semantic.model": "nomic-embed-text",
    });
    const refused = await app.api("POST", "/api/semantic/use-built-in");
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/has not been fetched yet/);
    expect((await app.api("GET", "/api/settings")).body.settings).toMatchObject({
      "search.semantic.enabled": false,
      "search.semantic.provider": "openai-compatible",
    });
  });

  it.skipIf(!modelPresent)(
    "switches to the built-in model in one request, from off or from a server that does not answer, and builds the index",
    { timeout: 90_000 },
    async () => {
      const app = await testApp();
      addNote(app, "w", "Trim the hair between the pads and rinse off grit and road salt after each walk.");
      addNote(app, "r", "Hold the bevel flat on the stone and draw the chisel back with even strokes.");
      // As the owner's installation was: off, and pointing at a local embedding server that is not there.
      await app.api("PATCH", "/api/settings", {
        "search.semantic.enabled": false,
        "search.semantic.provider": "openai-compatible",
        "search.semantic.endpoint": "http://127.0.0.1:9/v1",
        "search.semantic.model": "nomic-embed-text",
      });
      expect(await status(app)).toMatchObject({ enabled: false, provider: "openai-compatible", ready: false });

      const repaired = await app.api("POST", "/api/semantic/use-built-in");
      expect(repaired.status).toBe(200);
      expect(repaired.body).toMatchObject({ enabled: true, provider: "built-in", modelId: BUILT_IN_MODEL_ID, ready: true });
      await app.ctx.jobs.whenIdle(60_000);
      expect(await status(app)).toMatchObject({ embeddedChunks: 2, totalChunks: 2, indexing: false });
      // The address of the person's own server is still in the settings, should they want it back.
      expect((await app.api("GET", "/api/settings")).body.settings).toMatchObject({
        "search.semantic.endpoint": "http://127.0.0.1:9/v1",
        "search.semantic.model": "nomic-embed-text",
      });
      const { body } = await app.api("GET", `/api/search?q=${encodeURIComponent("dog paws snow ice")}&mode=semantic`);
      expect(body.mode).toBe("semantic");
      expect(body.results[0].entityId).toBe("w");

      // Pressing it again when it is already so does no harm.
      expect((await app.api("POST", "/api/semantic/use-built-in")).body).toMatchObject({ enabled: true, provider: "built-in" });
    },
  );
});

const model = (id: string, sizeBytes: number | null, parameters: string | null = null, family: string | null = "llama"): ChatModel => ({
  id,
  sizeBytes,
  parameters,
  quantization: sizeBytes === null ? null : "Q4_K_M",
  family: sizeBytes === null ? null : family,
});

describe("answers: which model to offer first", () => {
  it("reads a parameter count as the server writes it", () => {
    expect(parametersInBillions("3.2B")).toBe(3.2);
    expect(parametersInBillions("999.89M")).toBeCloseTo(0.99989, 5);
    expect(parametersInBillions("137M")).toBeCloseTo(0.137, 5);
    expect(parametersInBillions(null)).toBeNull();
    expect(parametersInBillions("large")).toBeNull();
  });

  it("tells a model that makes numbers for search from one that writes, by family and name", () => {
    expect(looksLikeEmbeddingModel({ id: "nomic-embed-text:latest", family: "nomic-bert" })).toBe(true);
    expect(looksLikeEmbeddingModel({ id: "mxbai-embed-large", family: null })).toBe(true);
    expect(looksLikeEmbeddingModel({ id: "bge-m3:latest", family: null })).toBe(true);
    expect(looksLikeEmbeddingModel({ id: "all-minilm:33m", family: "bert" })).toBe(true);
    expect(looksLikeEmbeddingModel({ id: "llama3.2:3b", family: "llama" })).toBe(false);
    expect(looksLikeEmbeddingModel({ id: "gemma3:1b", family: "gemma3" })).toBe(false);
  });

  it("takes the server's own word for what a model can do, when it gives one", () => {
    // Named like an embedding model, but the server says it writes; and the other way about.
    expect(looksLikeEmbeddingModel({ id: "my-embedder-chat", family: null, writes: true })).toBe(false);
    expect(looksLikeEmbeddingModel({ id: "plain-name", family: "llama", writes: false })).toBe(true);
  });

  it("offers one of Outpost's own short list first when the server has one, in the list's order", () => {
    const list = [
      model("mistral:7b", 4_372_824_384, "7.2B"),
      model("gemma3:1b", 815_319_791, "999.89M", "gemma3"),
      model("llama3.2:1b", 1_321_098_329, "1.2B"),
      model("llama3.2:latest", 2_019_393_189, "3.2B"),
    ];
    // "llama3.2:latest" is not the list's "llama3.2:3b" by name, so the next of the list that is held is offered.
    expect(recommendModel(list)).toBe("llama3.2:1b");
    expect(recommendModel([...list, model("llama3.2:3b", 2_019_393_189, "3.2B")])).toBe("llama3.2:3b");
    expect(recommendModel(list.filter((entry) => entry.id === "mistral:7b" || entry.id === "gemma3:1b"))).toBe("gemma3:1b");
  });

  it("keeps a short list that a Raspberry Pi 5 with 8 GB could run, with one model to start with", () => {
    expect(RECOMMENDED_MODELS.filter((entry) => entry.start)).toEqual([STARTING_MODEL]);
    expect(STARTING_MODEL.name).toBe("lfm3:1.7b");
    for (const entry of RECOMMENDED_MODELS) {
      // Nothing that needs more than half of 8 GB, and what is said to fit 4 GB leaves room for the system.
      expect(entry.memoryGb, entry.name).toBeLessThanOrEqual(4);
      if (entry.fits === "4 GB") expect(entry.memoryGb, entry.name).toBeLessThanOrEqual(2);
      expect(entry.download, entry.name).toMatch(/^\d+(\.\d)? (MB|GB)$/);
      expect(entry.page, entry.name).toMatch(/^https:\/\/ollama\.com\/library\/[a-z0-9.-]+$/);
    }
    expect(recommendedEntry("phi4-mini:latest")?.name).toBe("phi4-mini");
    expect(recommendedEntry("mistral:7b")).toBeUndefined();
  });

  it("otherwise offers the smallest model that is large enough to be worth trying, never one that cannot write", () => {
    const list = [
      model("mistral:7b", 4_372_824_384, "7.2B"),
      model("nomic-embed-text:latest", 274_302_450, "137M", "nomic-bert"),
      model("smollm2:135m", 270_898_672, "134.52M"),
      model("qwen3:4b", 2_497_293_931, "4.0B"),
      model("qwen3:1.7b", 1_359_293_444, "2.0B"),
    ];
    // Not the embedding model (nearly the smallest file), and not the 135-million-parameter one.
    expect(recommendModel(list)).toBe("qwen3:1.7b");
    expect(recommendModel(list.filter((entry) => entry.id !== "qwen3:1.7b"))).toBe("qwen3:4b");
  });

  it("keeps the model already chosen in Settings while the server still has it", () => {
    const list = [model("gemma3:1b", 815_319_791, "999.89M"), model("llama3.1:latest", 4_920_753_328, "8.0B")];
    expect(recommendModel(list, "llama3.1")).toBe("llama3.1:latest");
    expect(recommendModel(list, "mistral")).toBe("gemma3:1b");
    // An embedding model named in Settings by mistake is not offered again.
    expect(recommendModel([...list, model("nomic-embed-text", 274_302_450, "137M", "nomic-bert")], "nomic-embed-text")).toBe("gemma3:1b");
  });

  it("goes by size on disk when no parameter count is stated, and takes the largest when all are tiny", () => {
    expect(recommendModel([model("tiny", 300_000_000), model("small", 900_000_000), model("big", 5_000_000_000)])).toBe("small");
    expect(recommendModel([model("tiny", 300_000_000), model("tinier", 100_000_000)])).toBe("tiny");
  });

  it("takes the first model of a server that states no sizes, and nothing from a server with no model that writes", () => {
    expect(recommendModel([model("stand-in.gguf", null)])).toBe("stand-in.gguf");
    expect(recommendModel([model("nomic-embed-text", 274_302_450, "137M", "nomic-bert")])).toBeNull();
    expect(recommendModel([])).toBeNull();
  });
});

/** An address nothing listens on. */
const NOBODY = "http://127.0.0.1:9/v1";

describe("answers: set up in three steps", () => {
  async function station() {
    const server = await startModelServer();
    cleanups.push(() => server.close());
    const app = await testApp();
    app.ctx.services.answers.setTimeouts({ probeMs: 5_000 });
    // The address in Settings is asked first, and its default is where a real Ollama listens. A test must
    // not depend on whether one happens to be running on this machine, so it starts from a dead address.
    await app.api("PATCH", "/api/settings", { "answers.endpoint": NOBODY });
    return { app, server };
  }
  const settings = async (app: TestApp) => (await app.api("GET", "/api/settings")).body.settings;

  it("finds the model server where Ollama listens, says which model to start with, and saves nothing", async () => {
    const { app, server } = await station();
    app.ctx.services.chat.setOllamaAddresses([NOBODY, `${server.url}/v1`]);
    const before = await settings(app);
    const found = (await app.api("POST", "/api/chat/setup/look")).body as ModelSetupLook;
    expect(found).toMatchObject({ found: true, address: `${server.url}/v1` });
    expect(found.models.length).toBeGreaterThan(3);
    // The stand-in's models are all one size but for the embedding model, which is never offered: the smallest that writes.
    expect(found.recommended).toBe("stand-in:latest");
    expect(await settings(app)).toEqual(before);
    expect((await app.api("GET", "/api/answers/status")).body).toMatchObject({ enabled: false, ready: false });
  });

  it("asks the address already in Settings first, so a server somewhere else is found by the same button", async () => {
    const { app, server } = await station();
    app.ctx.services.chat.setOllamaAddresses([NOBODY]);
    await app.api("PATCH", "/api/settings", { "answers.endpoint": `${server.url}/llamacpp/v1` });
    const found = (await app.api("POST", "/api/chat/setup/look")).body as ModelSetupLook;
    // llama.cpp's server: one model, no sizes; it is the one to start with.
    expect(found).toMatchObject({ found: true, address: `${server.url}/llamacpp/v1`, recommended: "stand-in.gguf" });
    expect(found.models).toEqual([{ id: "stand-in.gguf", sizeBytes: null, parameters: null, quantization: null, family: null }]);
  });

  it("looks where whoever started Outpost said Ollama is, not at the usual port", async () => {
    const server = await startModelServer();
    cleanups.push(() => server.close());
    const app = await createTestApp({ OUTPOST_OLLAMA_ADDRESSES: `${NOBODY}, ${server.url}/v1` });
    cleanups.push(() => app.close());
    await app.api("PATCH", "/api/settings", { "answers.endpoint": "http://127.0.0.1:8/v1" });
    const found = (await app.api("POST", "/api/chat/setup/look")).body as ModelSetupLook;
    expect(found).toMatchObject({ found: true, address: `${server.url}/v1` });
    // An address that cannot be read stops the start, with the reason.
    await expect(createTestApp({ OUTPOST_OLLAMA_ADDRESSES: "not an address" })).rejects.toThrow(/is not an address/);
  });

  it("says so when nothing is found, and recommends nothing", async () => {
    const { app } = await station();
    app.ctx.services.chat.setOllamaAddresses([NOBODY]);
    const missing = (await app.api("POST", "/api/chat/setup/look")).body as ModelSetupLook;
    expect(missing).toMatchObject({ found: false, address: null, models: [], recommended: null });
    // The message names where it looked: here the one place the test gave it, never the real Ollama's.
    expect(missing.message).toMatch(/Nothing answered at 127\.0\.0\.1:9, which is where Ollama listens/);
  });

  it("tries the model, and when it answers saves the address and the model and switches answers on", async () => {
    const { app, server } = await station();
    app.ctx.services.chat.setOllamaAddresses([NOBODY, `${server.url}/v1`]);
    const tried = (await app.api("POST", "/api/chat/setup/try", { address: `${server.url}/v1`, model: "stand-in:latest" }))
      .body as ModelSetupTry;
    expect(tried).toMatchObject({ ok: true, saved: true, failure: null, reply: "ready" });
    expect(tried.message).toBe('"stand-in:latest" answered: “ready”.');
    expect(await settings(app)).toMatchObject({
      "answers.enabled": true,
      "answers.endpoint": `${server.url}/v1`,
      "answers.model": "stand-in:latest",
    });
    expect((await app.api("GET", "/api/answers/status")).body).toMatchObject({ enabled: true, ready: true, model: "stand-in:latest" });
    expect((await app.api("GET", "/api/chat/status")).body).toMatchObject({ usable: true, defaultModel: "stand-in:latest" });
  });

  it("changes nothing when the try fails, and says exactly what went wrong", async () => {
    const { app, server } = await station();
    app.ctx.services.chat.setOllamaAddresses([`${server.url}/v1`]);
    const before = await settings(app);
    const cannotWrite = (await app.api("POST", "/api/chat/setup/try", { address: `${server.url}/v1`, model: "embed-only:latest" }))
      .body as ModelSetupTry;
    expect(cannotWrite).toMatchObject({ ok: false, saved: false, failure: "not-a-chat-model" });
    expect(cannotWrite.message).toMatch(/cannot write text/);

    const nobody = (await app.api("POST", "/api/chat/setup/try", { address: NOBODY, model: "stand-in" })).body as ModelSetupTry;
    expect(nobody).toMatchObject({ ok: false, saved: false, failure: "unreachable" });
    expect(nobody.message).toMatch(/No model server answered at 127\.0\.0\.1:9/);

    // An address that set-up did not look at is refused before anything is sent to it: the address comes
    // from Settings or from where Ollama listens, never from the request alone.
    const requests = server.requests.length;
    const other = await startModelServer();
    cleanups.push(() => other.close());
    const notLookedAt = (await app.api("POST", "/api/chat/setup/try", { address: `${other.url}/v1`, model: "stand-in" }))
      .body as ModelSetupTry;
    expect(notLookedAt).toMatchObject({ ok: false, saved: false, failure: "address" });
    expect(notLookedAt.message).toMatch(/Outpost has not looked for a model server at 127\.0\.0\.1:\d+\. Enter that address in Settings/);
    expect(other.requests.length).toBe(0);
    expect(server.requests.length).toBe(requests);

    const notAnAddress = (await app.api("POST", "/api/chat/setup/try", { address: "ollama", model: "stand-in" })).body as ModelSetupTry;
    expect(notAnAddress).toMatchObject({ ok: false, saved: false, failure: "address" });
    expect((await app.api("POST", "/api/chat/setup/try", { address: `${server.url}/v1` })).status).toBe(400);
    expect(await settings(app)).toEqual(before);
  });

  it("refuses to try a model at an address on the internet, even when that address is the one in Settings", async () => {
    const { app, server } = await station();
    await app.api("PATCH", "/api/settings", { "answers.endpoint": "https://models.example.com/v1" });
    const requests = server.requests.length;
    const elsewhere = (await app.api("POST", "/api/chat/setup/try", { address: "https://models.example.com/v1", model: "stand-in" }))
      .body as ModelSetupTry;
    expect(elsewhere).toMatchObject({ ok: false, saved: false, failure: "address" });
    expect(elsewhere.message).toMatch(/is on the internet, not on this computer or your own network/);
    expect(server.requests.length).toBe(requests);
    expect((await app.api("GET", "/api/answers/status")).body).toMatchObject({ enabled: false });
  });
});

describe("the set-up guide", () => {
  it("is the same in the documentation as inside Outpost: docs/setup-guide.md is what its one source writes", () => {
    const file = path.resolve(import.meta.dirname, "../../../docs/setup-guide.md");
    // Out of date? Run `node scripts/write-setup-guide.mjs`.
    expect(fs.readFileSync(file, "utf8")).toBe(guideMarkdown());
  });
});
