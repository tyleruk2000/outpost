/**
 * A local HTTP server for download tests: serves buffers with or without Range
 * support, slowly if asked, and can drop the connection part-way through a response.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PART_SUFFIX } from "../../../src/modules/downloads/service.ts";
import type { TestApp } from "../../helpers.ts";

export interface FileRoute {
  body: Buffer;
  /** Honour Range requests (206 / 416). Default true. */
  ranges?: boolean;
  /** Honour If-Range (send the whole file when its validator no longer matches). Default true; false sends the tail regardless. */
  ifRange?: boolean;
  /** Send in pieces of this size with `delayMs` between them. */
  chunkBytes?: number;
  delayMs?: number;
  /** Destroy the connection after this many body bytes, for the first `drops` requests. */
  dropAfterBytes?: number;
  drops?: number;
  /**
   * Held before the connection is dropped, so a test can wait until the client has
   * written every byte to its file. Without it the line is cut after a short pause, and
   * on a busy machine some of the bytes may still be inside the client (they are lost,
   * and the client rightly asks again from what reached its disk).
   */
  beforeDrop?: () => Promise<unknown>;
  /** Answer with this status and no body instead of the file. */
  status?: number;
  /** Answer HEAD requests with this status, while GET still serves the file. */
  headStatus?: number;
  headers?: Record<string, string>;
  /** Redirect elsewhere instead of serving. */
  redirectTo?: string;
  /** Compute the body from the query string, for feeds that filter. */
  respond?: (query: URLSearchParams) => Buffer | string;
}

export interface SeenRequest {
  method: string;
  path: string;
  /** Query string without the "?", or "". */
  query: string;
  range: string | undefined;
  ifRange: string | undefined;
}

export interface FileServer {
  /** e.g. "http://127.0.0.1:41233" */
  origin: string;
  host: string;
  port: number;
  routes: Map<string, FileRoute>;
  requests: SeenRequest[];
  url(path: string): string;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function send(res: http.ServerResponse, route: FileRoute, data: Buffer): Promise<void> {
  const chunkBytes = route.chunkBytes ?? data.length;
  const dropping = route.dropAfterBytes !== undefined && (route.drops ?? 1) > 0;
  if (dropping) route.drops = (route.drops ?? 1) - 1;
  let sent = 0;
  while (sent < data.length) {
    if (res.destroyed) return;
    let end = Math.min(data.length, sent + Math.max(1, chunkBytes));
    if (dropping) end = Math.min(end, route.dropAfterBytes!);
    if (end > sent) {
      await new Promise<void>((resolve) => res.write(data.subarray(sent, end), () => resolve()));
      sent = end;
    }
    if (dropping && sent >= route.dropAfterBytes!) {
      // Let the bytes reach the client, then cut the line mid-response.
      if (route.beforeDrop) await route.beforeDrop().catch(() => undefined);
      else await sleep(30);
      res.destroy();
      return;
    }
    if (route.delayMs) await sleep(route.delayMs);
  }
  res.end();
}

export async function startFileServer(host = "127.0.0.1"): Promise<FileServer> {
  const routes = new Map<string, FileRoute>();
  const requests: SeenRequest[] = [];

  const server = http.createServer((req, res) => {
    const [path = "/", query = ""] = (req.url ?? "/").split("?");
    requests.push({
      method: req.method ?? "GET",
      path,
      query,
      range: req.headers.range,
      ifRange: req.headers["if-range"] as string | undefined,
    });
    const route = routes.get(path);
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    if (route.redirectTo) {
      res.writeHead(302, { location: route.redirectTo }).end();
      return;
    }
    if (route.status) {
      res.writeHead(route.status, route.headers).end();
      return;
    }
    if (route.headStatus && req.method === "HEAD") {
      res.writeHead(route.headStatus).end();
      return;
    }
    if (route.respond) {
      const body = Buffer.from(route.respond(new URLSearchParams(query)));
      res.writeHead(200, { ...route.headers, "content-length": String(body.length) }).end(body);
      return;
    }
    const total = route.body.length;
    // "bytes=100-" to the end, or "bytes=100-199", a bounded stretch (clipped to the file, as HTTP says).
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    // If-Range: a validator that no longer matches means "send the whole current file".
    const ifRange = req.headers["if-range"];
    const unchanged =
      route.ifRange === false || ifRange === undefined || ifRange === route.headers?.etag || ifRange === route.headers?.["last-modified"];
    if (range && route.ranges !== false && unchanged) {
      const start = Number(range[1]);
      if (start >= total) {
        res.writeHead(416, { "content-range": `bytes */${total}` }).end();
        return;
      }
      const end = range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
      res.writeHead(206, {
        ...route.headers,
        "content-length": String(end + 1 - start),
        "content-range": `bytes ${start}-${end}/${total}`,
      });
      if (req.method === "HEAD") return void res.end();
      void send(res, route, route.body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { ...route.headers, "content-length": String(total) });
    if (req.method === "HEAD") return void res.end();
    void send(res, route, route.body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const origin = `http://${host.includes(":") ? `[${host}]` : host}:${port}`;

  return {
    origin,
    host,
    port,
    routes,
    requests,
    url: (path) => `${origin}${path}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A port that nothing is listening on, for "connection refused". */
export async function unusedPort(): Promise<number> {
  const server = await startFileServer();
  await server.close();
  return server.port;
}

/** Repeatable pseudo-random bytes, so a failing test shows the same data every run. */
export function testBytes(length: number, seed = 1): Buffer {
  const out = Buffer.alloc(length);
  let state = seed >>> 0 || 1;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[index] = state >>> 24;
  }
  return out;
}

export async function waitFor<T>(
  check: () => T | undefined | null | false | Promise<T | undefined | null | false>,
  what: string,
  timeoutMs = 10_000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(15);
  }
}

/**
 * For a route's `beforeDrop`: waits until the newest download's partial file holds this
 * many bytes, so the request that continues it asks for exactly the rest.
 */
export function partFileHolds(app: TestApp, bytes: number): () => Promise<unknown> {
  return () =>
    waitFor(() => {
      const row = app.ctx.services.downloads.list()[0];
      if (!row) return false;
      const part = `${app.ctx.services.storage.resolve(row.locationId, row.relPath)}${PART_SUFFIX}`;
      try {
        return fs.statSync(part).size >= bytes;
      } catch {
        return false;
      }
    }, `${bytes} bytes in the partial file`);
}
