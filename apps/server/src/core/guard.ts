/**
 * The rules every request is held to.
 *
 * Outpost has no accounts: whoever can reach it can use all of it. What keeps that safe
 * is who can reach it, and what a browser can be tricked into doing on someone's behalf:
 *
 *  - By default the server answers only on this computer. Sharing it on a network is a
 *    start-up choice (OUTPOST_LAN_ACCESS), never something changed from the browser.
 *  - The Host header must name an address Outpost answers to, which defeats DNS
 *    rebinding (a web page pointing its own domain name at this server).
 *  - Every state-changing request must carry the `X-Outpost-Request` header and come
 *    from the same origin. A page on another site can make a browser send a request
 *    here, but it cannot add that header without a CORS preflight, which Outpost never
 *    approves, and it cannot read the answer to a plain request either.
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "./context.ts";
import { AppError, forbidden } from "./errors.ts";

function hostnameOf(header: string | undefined): string {
  if (!header) return "";
  const value = header.trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  return value.split(":")[0] ?? "";
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

/** Whether a request addressed to `host` is one this server should answer. */
export function isAllowedHost(host: string, options: { lanAccess: boolean; allowedHosts: string[] }): boolean {
  if (localHosts.has(host) || options.allowedHosts.includes(host)) return true;
  if (!options.lanAccess) return false;
  // On a LAN the server is reached by address or by a local name. Public-looking names
  // still have to be listed, so that a rebinding page's own domain is refused.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return true;
  return !host.includes(".") || /\.(local|lan|home|internal|home\.arpa)$/.test(host);
}

export async function registerRequestGuard(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config } = ctx;

  app.addHook("onRequest", async (request, reply) => {
    // Decide from the route that will actually handle the request, never from the raw
    // address: the router decodes percent-escapes before matching, so "/%61pi/notes"
    // reaches the same handler as "/api/notes" and must be held to the same rules.
    const route = request.routeOptions?.url;
    let pathname = request.url.split("?")[0] ?? "";
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // Not valid escaping; the router will reject it, and the raw text is good enough here.
    }
    const isApi = route ? route.startsWith("/api/") : pathname.startsWith("/api/");

    if (!isAllowedHost(hostnameOf(request.headers.host), config)) {
      throw new AppError("forbidden", "This address is not one Outpost answers to. Add it to OUTPOST_ALLOWED_HOSTS to use it.");
    }

    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("X-Frame-Options", "SAMEORIGIN");

    if (!isApi) return;
    reply.header("Cache-Control", "no-store");

    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.headers["x-outpost-request"] !== "1") {
        throw forbidden("This request did not come from the Outpost app.");
      }
      const site = request.headers["sec-fetch-site"];
      if (site && site !== "same-origin" && site !== "none") {
        throw forbidden("Requests from other sites are not accepted.");
      }
      const origin = request.headers.origin;
      if (origin && hostnameOf(new URL(origin).host) !== hostnameOf(request.headers.host)) {
        throw forbidden("Requests from other sites are not accepted.");
      }
    }
  });
}
