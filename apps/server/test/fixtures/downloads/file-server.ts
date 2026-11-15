/**
 * A local HTTP server for download tests: serves buffers with or without Range
 * support, slowly if asked, and can drop the connection part-way through a response.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FileRoute {
  body: Buffer;
  /** Honour Range requests (206 / 416). Default true. */
  ranges?: boolean;
  /** Send in pieces of this size with `delayMs` between them. */
  chunkBytes?: number;
  delayMs?: number;
  /** Destroy the connection after this many body bytes, for the first `drops` requests. */
  dropAfterBytes?: number;
  drops?: number;
  /** Answer with this status and no body instead of the file. */
  status?: number;
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
      await sleep(30);
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
    if (route.respond) {
      const body = Buffer.from(route.respond(new URLSearchParams(query)));
      res.writeHead(200, { ...route.headers, "content-length": String(body.length) }).end(body);
      return;
    }
    const total = route.body.length;
    const range = /^bytes=(\d+)-$/.exec(req.headers.range ?? "");
    // If-Range: a validator that no longer matches means "send the whole current file".
    const ifRange = req.headers["if-range"];
    const unchanged = ifRange === undefined || ifRange === route.headers?.etag || ifRange === route.headers?.["last-modified"];
    if (range && route.ranges !== false && unchanged) {
      const start = Number(range[1]);
      if (start >= total) {
        res.writeHead(416, { "content-range": `bytes */${total}` }).end();
        return;
      }
      res.writeHead(206, {
        ...route.headers,
        "content-length": String(total - start),
        "content-range": `bytes ${start}-${total - 1}/${total}`,
      });
      if (req.method === "HEAD") return void res.end();
      void send(res, route, route.body.subarray(start));
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
