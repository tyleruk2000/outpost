import { Readable } from "node:stream";
import zlib from "node:zlib";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { chooseEncoding, MIN_BYTES, registerJsonCompression } from "../src/core/compress.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const big = { rows: Array.from({ length: 400 }, (_, index) => ({ id: index, name: `Collection ${index}`, size: index * 1000 })) };

let server: FastifyInstance | undefined;
let app: TestApp | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  await app?.close();
  app = undefined;
});

async function withRoutes(): Promise<FastifyInstance> {
  server = Fastify();
  registerJsonCompression(server);
  server.get("/big", async () => big);
  server.get("/small", async () => ({ ok: true }));
  server.get("/stream", (_request, reply) => reply.type("application/json").send(Readable.from([JSON.stringify(big)])));
  server.get("/tile", (_request, reply) => reply.type("application/x-protobuf").send(Buffer.alloc(MIN_BYTES * 4)));
  server.get("/packed", (_request, reply) =>
    reply
      .type("application/json")
      .header("content-encoding", "gzip")
      .send(zlib.gzipSync(JSON.stringify(big))),
  );
  await server.ready();
  return server;
}

describe("compressing JSON answers", () => {
  it("compresses a large JSON answer with Brotli or gzip, as the browser takes", async () => {
    const routes = await withRoutes();
    const plain = JSON.stringify(big);
    const br = await routes.inject({ url: "/big", headers: { "accept-encoding": "gzip, deflate, br" } });
    expect(br.headers["content-encoding"]).toBe("br");
    expect(br.headers.vary).toContain("accept-encoding");
    expect(br.rawPayload.length).toBeLessThan(plain.length / 4);
    expect(JSON.parse(zlib.brotliDecompressSync(br.rawPayload).toString())).toEqual(big);

    const gz = await routes.inject({ url: "/big", headers: { "accept-encoding": "gzip" } });
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(JSON.parse(zlib.gunzipSync(gz.rawPayload).toString())).toEqual(big);
    expect(Number(gz.headers["content-length"])).toBe(gz.rawPayload.length);

    const none = await routes.inject({ url: "/big" });
    expect(none.headers["content-encoding"]).toBeUndefined();
    expect(none.json()).toEqual(big);
  });

  it("leaves small answers, streams, tiles and what is already compressed as they are", async () => {
    const routes = await withRoutes();
    const headers = { "accept-encoding": "br, gzip" };
    for (const url of ["/small", "/stream", "/tile"]) {
      const response = await routes.inject({ url, headers });
      expect(response.headers["content-encoding"], url).toBeUndefined();
    }
    const packed = await routes.inject({ url: "/packed", headers });
    expect(packed.headers["content-encoding"]).toBe("gzip");
    expect(JSON.parse(zlib.gunzipSync(packed.rawPayload).toString())).toEqual(big);
  });

  it("reads Accept-Encoding with its weights", () => {
    expect(chooseEncoding(undefined)).toBeUndefined();
    expect(chooseEncoding("identity")).toBeUndefined();
    expect(chooseEncoding("gzip, deflate, br, zstd")).toBe("br");
    expect(chooseEncoding("br;q=0, gzip;q=0.8")).toBe("gzip");
    expect(chooseEncoding("*")).toBe("br");
    expect(chooseEncoding("*;q=0")).toBeUndefined();
  });

  it("is on for the real server's API, and never for the live-events stream", async () => {
    app = await createTestApp();
    for (let index = 0; index < 30; index += 1) await app.api("POST", "/api/notes", { title: `Page about water, number ${index}` });
    const tree = await app.api("GET", "/api/notes/tree", undefined, { headers: { "accept-encoding": "br" } });
    expect(tree.status).toBe(200);
    expect(tree.headers["content-encoding"]).toBe("br");
    // The stream is written straight to the socket, past every hook; a compressed one would never reach the browser.
    const address = await app.app.listen({ port: 0, host: "127.0.0.1" });
    const controller = new AbortController();
    const events = await fetch(`${address}/api/events`, {
      headers: { "accept-encoding": "gzip, br", "x-outpost-request": "1" },
      signal: controller.signal,
    });
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    expect(events.headers.get("content-encoding")).toBeNull();
    controller.abort();
  });
});
