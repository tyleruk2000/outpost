/**
 * A local web site for the tests of saving a web page: it serves pages and pictures,
 * records exactly what each request sent, and can be slow, redirect, or set a cookie.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";

export interface SiteRoute {
  body?: Buffer | string;
  /** `Content-Type` to answer with; none at all when null. Default "text/html; charset=utf-8". */
  type?: string | null;
  status?: number;
  redirectTo?: string;
  headers?: Record<string, string>;
  /** Wait this long before answering. */
  delayMs?: number;
  /** Send the body compressed, as most sites do. */
  gzip?: boolean;
  /** Leave out `Content-Length`, as a server that streams does. */
  unsized?: boolean;
}

export interface SiteRequest {
  path: string;
  headers: http.IncomingHttpHeaders;
}

export interface Site {
  origin: string;
  host: string;
  port: number;
  routes: Map<string, SiteRoute>;
  requests: SiteRequest[];
  url(path: string): string;
  /** The requests made for this path. */
  seen(path: string): SiteRequest[];
  close(): Promise<void>;
}

export async function startSite(host = "127.0.0.1"): Promise<Site> {
  const routes = new Map<string, SiteRoute>();
  const requests: SiteRequest[] = [];
  const server = http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    requests.push({ path, headers: req.headers });
    const route = routes.get(path);
    if (!route) return void res.writeHead(404, { "content-type": "text/html" }).end("<h1>Not found</h1>");
    const answer = () => {
      if (res.destroyed) return;
      if (route.redirectTo) return void res.writeHead(route.status ?? 302, { location: route.redirectTo, ...route.headers }).end();
      let body = Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body ?? "");
      const headers: Record<string, string> = { ...route.headers };
      if (route.type !== null) headers["content-type"] = route.type ?? "text/html; charset=utf-8";
      if (route.gzip) {
        body = zlib.gzipSync(body);
        headers["content-encoding"] = "gzip";
      }
      if (!route.unsized) headers["content-length"] = String(body.length);
      res.writeHead(route.status ?? 200, headers);
      res.end(body);
    };
    if (route.delayMs) setTimeout(answer, route.delayMs);
    else answer();
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
    seen: (path) => requests.filter((request) => request.path === path),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
