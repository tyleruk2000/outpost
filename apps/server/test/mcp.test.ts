/**
 * The Model Context Protocol endpoint, `/mcp`, spoken to by hand: no client library, so
 * that what is tested is what the specification's pages say goes over the wire.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRateLimit, decodeHeaderValue, MCP_VERSIONS } from "../src/modules/tools/mcp.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const MODERN = "2026-07-28";

let app: TestApp;
let notePassage = 0;

/** Each test speaks from an address of its own, so that the allowance per address does not run out across tests. */
let next = 10;
const fresh = () => `192.168.7.${next++}`;

interface Sent {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: tests read JSON-RPC bodies loosely
  body: any;
  text: string;
  headers: Record<string, unknown>;
}

async function send(
  body: unknown,
  options: { headers?: Record<string, string>; remoteAddress?: string; method?: string; raw?: string } = {},
): Promise<Sent> {
  const response = await app.app.inject({
    method: (options.method ?? "POST") as "POST",
    url: "/mcp",
    remoteAddress: options.remoteAddress ?? fresh(),
    headers: { host: "localhost", "content-type": "application/json", ...options.headers },
    payload: options.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  let parsed: unknown;
  try {
    parsed = response.json();
  } catch {
    parsed = undefined;
  }
  return { status: response.statusCode, body: parsed, text: response.body, headers: response.headers };
}

const rpc = (method: string, params?: Record<string, unknown>, id: number | string = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params ? { params } : {}),
});

const meta = (version = MODERN) => ({
  "io.modelcontextprotocol/protocolVersion": version,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "hand-written test", version: "1" },
});

/** A 2026-07-28 request, with its headers mirrored from the body. */
function modern(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const base: Record<string, string> = { "mcp-protocol-version": MODERN, "mcp-method": method };
  if (method === "tools/call") base["mcp-name"] = String(params.name);
  return send(rpc(method, { ...params, _meta: meta() }), { headers: { ...base, ...headers } });
}

const setMcp = (enabled: boolean, extra = {}) => app.api("PUT", "/api/tools/mcp", { enabled }, extra);

beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
  const note = await app.api("POST", "/api/notes", {
    title: "Water at altitude",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Above two thousand metres, keep water at a rolling boil for three minutes before drinking it." },
          ],
        },
      ],
    },
  });
  expect(note.status).toBe(200);
  await app.ctx.jobs.whenIdle();
  expect((await setMcp(true)).status).toBe(200);
});
afterAll(async () => {
  await app.close();
});

describe("the earlier revisions, which open with initialize", () => {
  it("answers initialize with the version asked for when it is one it speaks", async () => {
    const { status, body, headers } = await send(
      rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }),
    );
    expect(status).toBe(200);
    expect(headers["content-type"]).toMatch(/^application\/json/);
    expect(headers["cache-control"]).toBe("no-store");
    // Stateless: no session is minted.
    expect(headers["mcp-session-id"]).toBeUndefined();
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "outpost", version: expect.any(String) },
      },
    });
    expect(typeof body.result.instructions).toBe("string");
  });

  it("answers an unknown version with the newest earlier revision it speaks", async () => {
    const { body } = await send(
      rpc("initialize", { protocolVersion: "1999-01-01", capabilities: {}, clientInfo: { name: "t", version: "1" } }),
    );
    expect(body.result.protocolVersion).toBe("2025-11-25");
  });

  it("takes notifications/initialized and notifications/cancelled with 202 and no body", async () => {
    for (const method of ["notifications/initialized", "notifications/cancelled"]) {
      const { status, text } = await send({ jsonrpc: "2.0", method, params: method.endsWith("cancelled") ? { requestId: 1 } : undefined });
      expect(status).toBe(202);
      expect(text).toBe("");
    }
  });

  it("answers ping", async () => {
    const { status, body } = await send(rpc("ping", undefined, "p-1"), { headers: { "mcp-protocol-version": "2025-11-25" } });
    expect(status).toBe(200);
    expect(body).toEqual({ jsonrpc: "2.0", id: "p-1", result: {} });
  });

  it("lists only the tools that are offered, with their schemas, and drops an area that is switched off", async () => {
    const { body } = await send(rpc("tools/list"), { headers: { "mcp-protocol-version": "2025-11-25" } });
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(app.ctx.services.tools.offered().map((tool) => tool.name));
    expect(names).toContain("search_library");
    const search = body.result.tools.find((tool: { name: string }) => tool.name === "search_library");
    expect(search.inputSchema).toMatchObject({ type: "object", properties: { query: { type: "string" } } });
    expect(search.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(body.result.resultType).toBeUndefined();

    expect((await app.api("PATCH", "/api/settings", { "tools.library": false })).status).toBe(200);
    try {
      const after = await send(rpc("tools/list"));
      const left = after.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(left).not.toContain("search_library");
      expect(left).not.toContain("read_passage");
      // And a call to one of them is refused as if there were no such tool.
      const call = await send(rpc("tools/call", { name: "search_library", arguments: { query: "water" } }));
      expect(call.body.error).toMatchObject({ code: -32602, message: "Unknown tool: search_library" });
    } finally {
      await app.api("PATCH", "/api/settings", { "tools.library": true });
    }
  });

  it("calls a library tool and gives back what it found as text", async () => {
    const { status, body } = await send(rpc("tools/call", { name: "search_library", arguments: { query: "rolling boil" } }));
    expect(status).toBe(200);
    expect(body.result.isError).toBe(false);
    expect(body.result.content).toHaveLength(1);
    expect(body.result.content[0].type).toBe("text");
    expect(body.result.content[0].text).toContain("Water at altitude");
    notePassage = Number(/Passage (\d+)/.exec(body.result.content[0].text)?.[1]);
    expect(notePassage).toBeGreaterThan(0);

    const read = await send(rpc("tools/call", { name: "read_passage", arguments: { passage: notePassage } }));
    expect(read.body.result.isError).toBe(false);
    expect(read.body.result.content[0].text).toContain("rolling boil for three minutes");
  });

  it("refuses an unknown tool with -32602", async () => {
    const { status, body } = await send(rpc("tools/call", { name: "launch_rockets", arguments: {} }, 7));
    expect(status).toBe(200);
    expect(body).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32602, message: "Unknown tool: launch_rockets" } });
  });

  it("gives arguments that do not fit back as the tool's own error, for the model to read", async () => {
    const { body } = await send(rpc("tools/call", { name: "search_library", arguments: { query: 42 } }));
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/did not fit/);
  });

  it("answers an unknown method with -32601", async () => {
    const { status, body } = await send(rpc("resources/list"));
    expect(status).toBe(200);
    expect(body.error.code).toBe(-32601);
  });

  it("refuses an MCP-Protocol-Version header it does not speak", async () => {
    const { status, body } = await send(rpc("tools/list"), { headers: { "mcp-protocol-version": "2024-11-05" } });
    expect(status).toBe(400);
    expect(body.error.code).toBe(-32600);
  });
});

describe("JSON-RPC itself", () => {
  it("answers a body that is not JSON with a parse error", async () => {
    const { status, body } = await send(undefined, { raw: "{ not json" });
    expect(status).toBe(400);
    expect(body).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: expect.any(String) } });
  });

  it("refuses what is not a request: no version, a null id, no method, a batch", async () => {
    for (const message of [
      { id: 1, method: "ping" },
      { jsonrpc: "2.0", id: null, method: "ping" },
      { jsonrpc: "2.0", id: 1 },
      [rpc("ping"), rpc("ping", undefined, 2)],
      "ping",
    ]) {
      const { status, body } = await send(message);
      expect(status).toBe(400);
      expect(body.error.code).toBe(-32600);
    }
  });
});

describe("revision 2026-07-28, stateless", () => {
  it("answers server/discover", async () => {
    const { status, body } = await modern("server/discover");
    expect(status).toBe(200);
    expect(body.result).toMatchObject({
      resultType: "complete",
      supportedVersions: [...MCP_VERSIONS],
      capabilities: { tools: {} },
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "outpost" } },
    });
  });

  it("lists and calls tools, every result complete", async () => {
    const list = await modern("tools/list");
    expect(list.body.result.resultType).toBe("complete");
    expect(list.body.result.tools.map((tool: { name: string }) => tool.name)).toContain("read_passage");

    const call = await modern("tools/call", { name: "search_library", arguments: { query: "rolling boil" } });
    expect(call.status).toBe(200);
    expect(call.body.result).toMatchObject({ resultType: "complete", isError: false });
    expect(call.body.result.content[0].text).toContain("Water at altitude");
  });

  it("decodes a base64 Mcp-Name before comparing it", async () => {
    const encoded = `=?base64?${Buffer.from("search_library").toString("base64")}?=`;
    const call = await modern("tools/call", { name: "search_library", arguments: { query: "boil" } }, { "mcp-name": encoded });
    expect(call.status).toBe(200);
    expect(decodeHeaderValue("=?base64?SGVsbG8sIOS4lueVjA==?=")).toBe("Hello, 世界");
    expect(decodeHeaderValue("=?base64?!!?=")).toBeNull();
  });

  it("answers an unknown method with 404 and -32601", async () => {
    const { status, body } = await modern("prompts/list");
    expect(status).toBe(404);
    expect(body.error.code).toBe(-32601);
  });

  it("refuses headers that do not match the body with -32020", async () => {
    const cases: Array<Record<string, string>> = [
      { "mcp-method": "tools/list" },
      { "mcp-protocol-version": "2025-11-25" },
      { "mcp-name": "read_passage" },
    ];
    for (const headers of cases) {
      const { status, body } = await modern("tools/call", { name: "search_library", arguments: { query: "x" } }, headers);
      expect(status).toBe(400);
      expect(body.error.code).toBe(-32020);
    }
    // A missing header is a mismatch too.
    const missing = await send(rpc("tools/list", { _meta: meta() }), { headers: { "mcp-protocol-version": MODERN } });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe(-32020);
  });

  it("refuses a modern request without its _meta with -32602", async () => {
    const { status, body } = await send(rpc("tools/list"), { headers: { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" } });
    expect(status).toBe(400);
    expect(body.error.code).toBe(-32602);
    const noCapabilities = await send(rpc("tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": MODERN } }), {
      headers: { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" },
    });
    expect(noCapabilities.status).toBe(400);
    expect(noCapabilities.body.error.code).toBe(-32602);
  });

  it("refuses a version it does not speak with -32022 and the list it does", async () => {
    const { status, body } = await send(rpc("tools/list", { _meta: meta("2030-01-01") }), {
      headers: { "mcp-protocol-version": "2030-01-01", "mcp-method": "tools/list" },
    });
    expect(status).toBe(400);
    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32022, message: "Unsupported protocol version", data: { supported: [...MCP_VERSIONS], requested: "2030-01-01" } },
    });
  });

  it("answers GET and DELETE with 405: no stream, no session", async () => {
    for (const method of ["GET", "DELETE"]) {
      const { status, headers } = await send(undefined, { method });
      expect(status).toBe(405);
      expect(headers.allow).toBe("POST");
    }
  });
});

describe("who may call it", () => {
  it("is off until switched on, and says where to switch it on", async () => {
    await setMcp(false);
    try {
      const { status, body } = await send(rpc("tools/list"));
      expect(status).toBe(403);
      expect(body.id).toBeUndefined();
      expect(body.error.message).toMatch(/Settings, at the computer Outpost runs on/);
      expect((await app.api("GET", "/api/tools")).body.mcp.enabled).toBe(false);
    } finally {
      await setMcp(true);
    }
  });

  it("refuses a page on another site, by Origin or by Sec-Fetch-Site", async () => {
    const sites: Array<Record<string, string>> = [
      { origin: "http://evil.example" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const headers of sites) {
      const { status, body } = await send(rpc("ping"), { headers });
      expect(status).toBe(403);
      expect(body.id).toBeUndefined();
    }
    // This server's own origin is accepted; the same host on another port is another site.
    expect((await send(rpc("ping"), { headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" } })).status).toBe(200);
    expect((await send(rpc("ping"), { headers: { origin: "http://localhost:8080" } })).status).toBe(403);
  });

  it("refuses a body that is not application/json", async () => {
    const { status } = await send(undefined, { raw: JSON.stringify(rpc("ping")), headers: { "content-type": "text/plain" } });
    expect(status).toBe(415);
  });

  it("refuses a body that is too large", async () => {
    const { status } = await send(rpc("tools/call", { name: "search_library", arguments: { query: "x".repeat(300 * 1024) } }));
    expect(status).toBe(413);
  });

  it("refuses a public address, and anything through a proxy", async () => {
    expect((await send(rpc("ping"), { remoteAddress: "203.0.113.5" })).status).toBe(403);
    expect((await send(rpc("ping"), { remoteAddress: "8.8.8.8" })).status).toBe(403);
    expect((await send(rpc("ping"), { remoteAddress: "2a00:1450:4009:81f::200e" })).status).toBe(403);
    expect((await send(rpc("ping"), { remoteAddress: "::ffff:8.8.8.8" })).status).toBe(403);
    for (const name of ["x-forwarded-for", "forwarded", "x-real-ip", "x-forwarded-host"]) {
      expect((await send(rpc("ping"), { headers: { [name]: "192.168.1.9" } })).status).toBe(403);
    }
    // Loopback, private, link-local and unique-local addresses are let in.
    for (const address of ["127.0.0.1", "::1", "10.1.2.3", "172.16.4.4", "fe80::1", "fd00::5", "::ffff:192.168.1.77"]) {
      expect((await send(rpc("ping"), { remoteAddress: address })).status).toBe(200);
    }
  });

  it("holds each address to its allowance, with 429 after the burst", async () => {
    const from = fresh();
    const statuses: number[] = [];
    for (let n = 0; n < 25; n++) statuses.push((await send(rpc("ping"), { remoteAddress: from })).status);
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(20).every((status) => status === 429)).toBe(true);
    const refused = await send(rpc("ping"), { remoteAddress: from });
    expect(refused.body.error.message).toMatch(/Too many requests/);
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    // Another address is not held to it.
    expect((await send(rpc("ping"))).status).toBe(200);
  });

  it("holds an IPv6 device to one allowance however many addresses of its /64 it moves through", async () => {
    const statuses: number[] = [];
    for (let n = 1; n <= 25; n++) statuses.push((await send(rpc("ping"), { remoteAddress: `fd00:7:7:7::${n.toString(16)}` })).status);
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(20).every((status) => status === 429)).toBe(true);
    // The next /64 is another network, and another allowance.
    expect((await send(rpc("ping"), { remoteAddress: "fd00:7:7:8::1" })).status).toBe(200);
  });

  it("refills the allowance with time and forgets the oldest addresses", () => {
    const limit = createRateLimit({ burst: 2, perMinute: 60, addresses: 3 });
    expect(limit.take("a", 0)).toBe(0);
    expect(limit.take("a", 0)).toBe(0);
    expect(limit.take("a", 0)).toBeGreaterThan(0);
    expect(limit.take("a", 1000)).toBe(0);
    for (const address of ["b", "c", "d", "e"]) limit.take(address, 1000);
    expect(limit.size).toBe(3);
  });
});

describe("the switch, PUT /api/tools/mcp", () => {
  it("is refused from another device and accepted at this computer", async () => {
    const lan = await createTestApp({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" }, undefined, { voacapData: false });
    try {
      const remote = await lan.api("PUT", "/api/tools/mcp", { enabled: true }, { remoteAddress: "192.168.1.50" });
      expect(remote.status).toBe(403);
      expect(remote.body.error.message).toMatch(/at the computer Outpost runs on/);
      expect((await lan.api("GET", "/api/tools", undefined, { remoteAddress: "192.168.1.50" })).body.mcp).toMatchObject({
        enabled: false,
        canChange: false,
      });

      const local = await lan.api("PUT", "/api/tools/mcp", { enabled: true }, { remoteAddress: "127.0.0.1" });
      expect(local.status).toBe(200);
      expect(local.body.mcp).toMatchObject({ enabled: true, canChange: true });
      expect(local.body.mcp.addresses[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    } finally {
      await lan.close();
    }
  });
});
