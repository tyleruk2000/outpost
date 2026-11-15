import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAiCompatibleProvider, providerFromSettings, transformersProvider } from "../src/modules/semantic/providers.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A local server that speaks the OpenAI embeddings format, as Ollama and llama.cpp do. */
async function embeddingServer(options: { fail?: boolean } = {}) {
  const calls: Array<{ model: string; input: string[] }> = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (request.url !== "/v1/embeddings" || options.fail) {
        response.statusCode = options.fail ? 500 : 404;
        return response.end("model not loaded");
      }
      const parsed = JSON.parse(body) as { model: string; input: string[] };
      calls.push(parsed);
      // Deliberately returned out of order and un-normalised: the provider must cope.
      const data = parsed.input
        .map((text, index) => ({ index, embedding: [text.includes("water") ? 3 : 0, text.includes("rope") ? 4 : 0, 1] }))
        .reverse();
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ data }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, calls };
}

describe("embedding providers", () => {
  it("talks to a local OpenAI-compatible server and normalises what comes back", async () => {
    const server = await embeddingServer();
    const provider = openAiCompatibleProvider(`${server.endpoint}/`, "nomic-embed-text");
    expect(provider.modelId).toBe("openai-compatible:nomic-embed-text");
    expect(await provider.check()).toEqual({ ok: true, dimensions: 3 });
    const [water, rope] = await provider.embed(["boil water", "coil the rope"], "passage");
    expect(server.calls.at(-1)).toEqual({ model: "nomic-embed-text", input: ["boil water", "coil the rope"] });
    // Order follows the input, and each vector has length 1.
    expect(water![0]).toBeGreaterThan(0.9);
    expect(rope![1]).toBeGreaterThan(0.9);
    for (const vector of [water!, rope!]) expect(Math.hypot(...vector)).toBeCloseTo(1, 5);
  });

  it("explains an unreachable or failing server instead of throwing something obscure", async () => {
    const down = openAiCompatibleProvider("http://127.0.0.1:9/v1", "any");
    const result = await down.check();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/not reachable/);
    const failing = openAiCompatibleProvider((await embeddingServer({ fail: true })).endpoint, "any");
    const failed = await failing.check();
    expect(failed.ok === false && failed.reason).toMatch(/answered 500/);
  });

  it("says what is missing when the optional in-process package or the model is absent", async () => {
    const provider = transformersProvider(path.join(os.tmpdir(), "outpost-no-models"), "Xenova/all-MiniLM-L6-v2");
    const result = await provider.check();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/optional @huggingface\/transformers package|is not in the models folder/);
  });

  it("is chosen by settings", () => {
    const base = { "search.semantic.model": "m", "search.semantic.endpoint": "http://127.0.0.1:1/v1" };
    expect(providerFromSettings({ ...base, "search.semantic.provider": "none" } as never, "/models")).toBeUndefined();
    expect(providerFromSettings({ ...base, "search.semantic.provider": "openai-compatible" } as never, "/models")?.modelId).toBe(
      "openai-compatible:m",
    );
    expect(providerFromSettings({ ...base, "search.semantic.provider": "transformers" } as never, "/models")?.modelId).toBe(
      "transformers:m",
    );
  });
});

describe("semantic search through a local embedding server", () => {
  it("indexes and searches end to end from settings alone", async () => {
    const server = await embeddingServer();
    const app: TestApp = await createTestApp();
    cleanups.push(() => app.close());
    app.ctx.services.search.upsert({
      kind: "note",
      entityId: "w",
      title: "Hydration",
      url: "/notes/w",
      sections: [{ text: "Carry two litres of water." }],
    });
    app.ctx.services.search.upsert({
      kind: "note",
      entityId: "r",
      title: "Ropework",
      url: "/notes/r",
      sections: [{ text: "Coil the rope before stowing." }],
    });
    await app.api("PATCH", "/api/settings", {
      "search.semantic.enabled": true,
      "search.semantic.provider": "openai-compatible",
      "search.semantic.endpoint": server.endpoint,
      "search.semantic.model": "test-embed",
    });
    const status = (await app.api("GET", "/api/semantic/status")).body;
    expect(status).toMatchObject({ enabled: true, ready: true, modelId: "openai-compatible:test-embed", dimensions: 3 });
    expect((await app.api("POST", "/api/semantic/index")).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", "/api/semantic/status")).body.embeddedChunks).toBe(2);
    const { body } = await app.api("GET", "/api/search?q=water&mode=semantic");
    expect(body.mode).toBe("semantic");
    expect(body.results[0].entityId).toBe("w");
    // Passages are embedded together with their title and heading.
    expect(server.calls.some((call) => call.input.some((text) => text.startsWith("Hydration\n")))).toBe(true);
  });
});
