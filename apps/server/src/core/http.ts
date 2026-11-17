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
import { Agent, type RequestInit, type Response, fetch as undiciFetch } from "undici";
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
  ["::", 96],
  ["2001::", 32],
  ["2002::", 16],
  ["64:ff9b:1::", 48],
  ["fec0::", 10],
  ["::", 127],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(address, prefix, "ipv6");
}

/** The eight 16-bit groups of an IPv6 address, however it is written (`::`, a dotted IPv4 tail). */
function ipv6Groups(address: string): number[] {
  let text = address.replace(/%.*$/, "");
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split("::") as [string, string | undefined];
  const left = head ? head.split(":") : [];
  const right = rest ? rest.split(":") : [];
  const groups = rest === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return groups.map((group) => Number.parseInt(group, 16));
}

/**
 * The IPv4 address an IPv6 one stands for on this host's own stack: IPv4-mapped
 * (`::ffff:a.b.c.d`) and IPv4-translated (`::ffff:0:a.b.c.d`). Other forms that carry an
 * IPv4 address (NAT64 `64:ff9b::/96`, 6to4 `2002::/16`, Teredo `2001::/32`) are not
 * followed at all: they are in `privateRanges` whatever they carry.
 */
function embeddedIpv4(groups: number[]): string | undefined {
  const zeros = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  const carries = (zeros(0, 5) && groups[5] === 0xffff) || (zeros(0, 4) && groups[4] === 0xffff && groups[5] === 0);
  if (!carries) return undefined;
  const [high, low] = [groups[6]!, groups[7]!];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** True for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !privateRanges.check(address, "ipv4");
  if (family === 6) {
    const carried = embeddedIpv4(ipv6Groups(address));
    if (carried) return isPublicAddress(carried);
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
  /**
   * `POST` is for asking a question of a server (a search), never for sending a file.
   * It needs a `body`, and a redirect is refused rather than followed: what was asked
   * goes to the host that was named and to no other.
   */
  method?: "GET" | "HEAD" | "POST";
  /** The body of a `POST`. */
  body?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Hosts the first request may go to. Omit to allow any public host. */
  allowedHosts?: Iterable<string>;
  /**
   * Hold every redirect hop to `allowedHosts`, not only the first. For anything whose
   * answer is trusted in itself, such as a checksum: the publisher must be the one
   * that says what the bytes should be, never a mirror.
   */
  everyHop?: boolean;
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
      const allowed = options.allowedHosts ? new Set([...options.allowedHosts].map((host) => host.toLowerCase())) : undefined;
      let url = new URL(input);
      const maxRedirects = options.maxRedirects ?? 8;
      for (let hop = 0; ; hop += 1) {
        // Only the first hop is held to the allow-list; mirrors may be anywhere public.
        check(url, hop === 0 || options.everyHop ? allowed : undefined);
        const init: RequestInit = {
          method: options.method ?? "GET",
          headers: { "user-agent": USER_AGENT, accept: "*/*", ...options.headers },
          redirect: "manual",
          signal: options.signal,
          dispatcher: agent,
          ...(options.method === "POST" ? { body: options.body ?? "" } : {}),
        };
        const response = await undiciFetch(url, init).catch((error: unknown) => {
          // undici reports a refused connection as a generic "fetch failed" with the real
          // reason underneath. A blocked address is a decision, not a network fault, and
          // must not be retried as one.
          for (let cause: unknown = error, depth = 0; cause && depth < 5; depth += 1) {
            if (cause instanceof BlockedAddressError) throw cause;
            cause = (cause as { cause?: unknown }).cause;
          }
          throw error;
        });
        if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
          await response.body?.cancel();
          if (options.method === "POST") {
            throw new AppError("upstream", `${url.hostname} answered with a redirect, which Outpost does not follow for a search.`);
          }
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
