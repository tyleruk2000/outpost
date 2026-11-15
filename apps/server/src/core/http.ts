/**
 * Outbound HTTP for downloads and catalogue lookups.
 *
 * Outpost only ever calls out when a person asks it to (refreshing the catalogue,
 * starting a download). Those URLs come from manifests, so they are constrained twice:
 *
 *  1. The first request must go to a host on the allow-list built from the manifests.
 *  2. Every connection, including each redirect hop, must land on a public address.
 *     The check happens at connect time on the addresses actually used, so a hostname
 *     cannot pass validation and then resolve to something internal.
 *
 * Redirects are followed by hand so that rule 2 is applied to each hop. Mirrors are
 * allowed to be any public host: integrity comes from the checksum, not the mirror.
 */
import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit, type Response } from "undici";
import { AppError } from "./errors.ts";

const privateRanges = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateRanges.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(address, prefix, "ipv6");
}

/** True for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !privateRanges.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return isPublicAddress(mapped[1]!);
    return !privateRanges.check(address, "ipv6");
  }
  return false;
}

export class BlockedAddressError extends AppError {
  constructor(host: string) {
    super("forbidden", `Downloads from ${host} are blocked because it is not a public address.`);
  }
}

function guardedAgent(allowPrivate: boolean): Agent {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
          if (error) return callback(error, []);
          const usable = allowPrivate ? addresses : addresses.filter((entry) => isPublicAddress(entry.address));
          if (usable.length === 0) return callback(new BlockedAddressError(hostname), []);
          callback(null, usable);
        });
      },
    },
    headersTimeout: 30_000,
    bodyTimeout: 60_000,
    connectTimeout: 15_000,
  });
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Hosts the first request may go to. Omit to allow any public host. */
  allowedHosts?: Iterable<string>;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  response: Response;
  /** URL that produced the response, after redirects. */
  url: string;
}

export interface HttpClient {
  fetch(url: string, options?: SafeFetchOptions): Promise<SafeFetchResult>;
  close(): Promise<void>;
}

export const USER_AGENT = "Outpost (self-hosted offline library)";

export function createHttpClient(config: { allowPrivate: boolean }): HttpClient {
  const agent = guardedAgent(config.allowPrivate);

  function check(url: URL, allowed?: Set<string>): void {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new AppError("bad_request", `Only http and https downloads are supported, not ${url.protocol}`);
    }
    if (url.username || url.password) {
      throw new AppError("bad_request", "Download addresses must not contain credentials.");
    }
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (allowed && !allowed.has(host)) {
      throw new AppError("forbidden", `${host} is not a download source listed in any catalogue manifest.`);
    }
    if (!config.allowPrivate && net.isIP(host) && !isPublicAddress(host)) throw new BlockedAddressError(host);
  }

  return {
    async fetch(input, options = {}) {
      const allowed = options.allowedHosts
        ? new Set([...options.allowedHosts].map((host) => host.toLowerCase()))
        : undefined;
      let url = new URL(input);
      const maxRedirects = options.maxRedirects ?? 8;
      for (let hop = 0; ; hop += 1) {
        // Only the first hop is held to the allow-list; mirrors may be anywhere public.
        check(url, hop === 0 ? allowed : undefined);
        const init: RequestInit = {
          method: options.method ?? "GET",
          headers: { "user-agent": USER_AGENT, accept: "*/*", ...options.headers },
          redirect: "manual",
          signal: options.signal,
          dispatcher: agent,
        };
        const response = await undiciFetch(url, init);
        if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
          await response.body?.cancel();
          if (hop >= maxRedirects) throw new AppError("upstream", "The download redirected too many times.");
          url = new URL(response.headers.get("location")!, url);
          continue;
        }
        return { response, url: url.toString() };
      }
    },
    close: () => agent.close(),
  };
}
