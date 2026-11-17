/**
 * The Model Context Protocol endpoint and the model tools, held to what docs/mcp.md and
 * docs/security.md promise, from the side of someone trying to get round them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
let next = 10;
const fresh = () => `192.168.9.${next++}`;

beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
  const local = await app.api("PUT", "/api/tools/mcp", { enabled: true }, { remoteAddress: "127.0.0.1" });
  expect(local.status).toBe(200);
});
afterAll(async () => {
  await app?.close();
});

const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });

async function send(headers: Record<string, string>, options: { method?: string; payload?: string } = {}) {
  const response = await app.app.inject({
    method: (options.method ?? "POST") as "POST",
    url: "/mcp",
    remoteAddress: fresh(),
    headers: { host: "localhost:8080", ...headers },
    payload: options.payload ?? ping,
  });
  return response;
}

describe("a page on another site", () => {
  it("is refused when its origin is this host on another port", async () => {
    // Another program's page on the same computer is another origin. Over plain http at a
    // network address a browser sends no Sec-Fetch-Site, so the Origin is all there is.
    const other = await send({ "content-type": "application/json", origin: "http://localhost:3000" });
    expect(other.statusCode).toBe(403);
    const otherScheme = await send({ "content-type": "application/json", origin: "https://localhost:8080" });
    expect(otherScheme.statusCode).toBe(403);
    // This server's own origin, with the port written or left to its default, is accepted.
    expect((await send({ "content-type": "application/json", origin: "http://localhost:8080" })).statusCode).toBe(200);
    const plain = await app.app.inject({
      method: "POST",
      url: "/mcp",
      remoteAddress: fresh(),
      headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json" },
      payload: ping,
    });
    expect(plain.statusCode).toBe(200);
  });

  it("cannot send what a browser sends without asking first", async () => {
    for (const type of ["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      expect((await send({ "content-type": type })).statusCode, type).toBe(415);
    }
    expect((await send({})).statusCode).toBe(415);
    // A client's own spelling of application/json is taken.
    expect((await send({ "content-type": "Application/JSON; charset=utf-8" })).statusCode).toBe(200);
  });

  it("is never told yes to a preflight", async () => {
    const response = await send(
      { origin: "http://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
      { method: "OPTIONS", payload: "" },
    );
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-headers"]).toBeUndefined();
  });

  it("is refused for every way of writing an origin that is not this one", async () => {
    for (const origin of ["http://localhost.evil.example:8080", "http://localhost@evil.example:8080", "null", "file://", "http://[::1]:8080"]) {
      expect((await send({ "content-type": "application/json", origin })).statusCode, origin).toBe(403);
    }
  });
});

describe("what a tool sends anywhere", () => {
  it("search_library sends its words to the embedding model search by meaning uses, and nothing more", async () => {
    const { search, semantic, tools } = app.ctx.services;
    search.upsert({
      kind: "document",
      entityId: "d-water",
      title: "Field hygiene",
      url: "/library/documents/d-water",
      sections: [{ text: "Boil it for one minute before drinking." }],
    });
    const asked: string[][] = [];
    semantic.overrideProvider({
      modelId: "test:stand-in",
      provider: "test",
      model: "stand-in",
      async embed(texts: string[]) {
        asked.push(texts);
        return texts.map(() => new Float32Array([1, 0, 0, 0]));
      },
      async check() {
        return { ok: true as const, dimensions: 4 };
      },
    });
    try {
      expect((await app.api("POST", "/api/semantic/index")).status).toBe(200);
      await app.ctx.jobs.whenIdle();
      asked.length = 0;
      const result = await tools.call("search_library", { query: "boil water" }, { signal: new AbortController().signal });
      expect(result.ok).toBe(true);
      // The query, and only the query, went to the embedding model: with a model server on another machine, that is a request on the network.
      expect(asked).toEqual([["boil water"]]);
    } finally {
      semantic.overrideProvider(undefined);
    }
  });
});
