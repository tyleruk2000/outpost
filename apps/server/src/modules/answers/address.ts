/**
 * The address of the model server, and what Outpost will and will not do with it.
 *
 * The rule is the one the embedding "local server" follows: the address is a setting,
 * a person typed it, and Outpost talks to that address and to nothing else. There is
 * no list of allowed hosts and no check that the address is private, because a model
 * on another machine of your own (a desktop with a graphics card, a box reached over a
 * VPN) is a legitimate thing to point at, and Outpost cannot tell "yours" from "not
 * yours" by looking at a number.
 *
 * What is checked, here and in the provider:
 *
 *  - only `http` and `https`;
 *  - no user name or password in the address (it would end up in messages and logs);
 *  - no query string or fragment;
 *  - redirects are refused, so the server that was named cannot hand the question on
 *    to one that was not.
 *
 * And the address is described back to the person in plain words (this computer, your
 * network, somewhere else), so that pointing it somewhere else is something they can
 * see they have done.
 */
import net from "node:net";
import type { ModelServerPlace } from "@outpost/shared";
import { AppError } from "../../core/errors.ts";

export interface ModelServerAddress {
  /** Where requests go: scheme, host, port and path, without a trailing slash. Ends in `/v1` for the usual servers. */
  base: string;
  /** Host and port, for showing to people. */
  host: string;
  place: ModelServerPlace;
}

const loopback = new net.BlockList();
loopback.addSubnet("127.0.0.0", 8, "ipv4");
loopback.addAddress("::1", "ipv6");

const privateRanges = new net.BlockList();
privateRanges.addSubnet("10.0.0.0", 8, "ipv4");
privateRanges.addSubnet("172.16.0.0", 12, "ipv4");
privateRanges.addSubnet("192.168.0.0", 16, "ipv4");
privateRanges.addSubnet("169.254.0.0", 16, "ipv4");
// Carrier-grade NAT space, which is where Tailscale and similar private networks put machines.
privateRanges.addSubnet("100.64.0.0", 10, "ipv4");
privateRanges.addSubnet("fc00::", 7, "ipv6");
privateRanges.addSubnet("fe80::", 10, "ipv6");

/** Where a host is, from its spelling alone. Names are never looked up. */
export function placeOf(hostname: string): ModelServerPlace {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const family = net.isIP(host);
  if (family === 4 || family === 6) {
    const type = family === 4 ? "ipv4" : "ipv6";
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapped) return placeOf(mapped[1]!);
    if (loopback.check(host, type)) return "this-computer";
    return privateRanges.check(host, type) ? "local-network" : "elsewhere";
  }
  if (host === "localhost" || host.endsWith(".localhost")) return "this-computer";
  // What Docker calls the machine a container runs on.
  if (host === "host.docker.internal") return "this-computer";
  // A bare name, or one in a zone that only exists on a home or office network.
  if (!host.includes(".") || /\.(local|lan|home|internal|home\.arpa)$/.test(host)) return "local-network";
  return "elsewhere";
}

export function parseModelServerAddress(value: string): ModelServerAddress {
  const text = value.trim();
  if (!text) throw new AppError("bad_request", "Enter the address of your model server, for example http://127.0.0.1:11434/v1.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("bad_request", `"${text}" is not an address. It should look like http://127.0.0.1:11434/v1.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("bad_request", "The model server's address must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new AppError("bad_request", "Leave the user name and password out of the model server's address. Outpost does not send them.");
  }
  if (url.search || url.hash) {
    throw new AppError("bad_request", "The model server's address must not contain ? or #.");
  }
  // Ollama, llama.cpp and LM Studio all serve the OpenAI-compatible API under /v1; an
  // address typed without a path means that.
  const path = url.pathname.replace(/\/+$/, "") || "/v1";
  return { base: `${url.origin}${path}`, host: url.host, place: placeOf(url.hostname) };
}
