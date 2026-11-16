/**
 * Telling a request made on this computer from one made by another device.
 *
 * Outpost has no accounts, so "who is asking" cannot be answered. "Where from" can, and
 * it is the one distinction the few irreversible actions lean on: erasing a person's own
 * notes and documents, restoring a backup over them, and deleting stored backups are
 * only offered at the computer Outpost runs on, unless whoever starts Outpost says
 * otherwise.
 *
 * A request counts as local when:
 *
 *  - it did not come through a proxy (a proxy on this computer makes every request look
 *    local, so anything carrying a forwarding header is treated as remote), and
 *  - either nothing but this computer can reach Outpost at all (LAN access is off, which
 *    the configuration refuses to start without), or the connection itself comes from a
 *    loopback address, or from one of this computer's own network addresses.
 *
 * Why this computer's own address can be believed. A browser on this computer that opens
 * Outpost at the computer's network address (`http://192.168.1.20:8080`, the address
 * every other device uses) connects from that same address, not from loopback. No other
 * device can complete a TCP connection with that source address: the server's reply
 * (the SYN-ACK, and everything after it) is addressed to this computer's own address,
 * so the operating system delivers it here and never puts it on the wire towards the
 * sender, which therefore cannot learn the sequence number it must echo. Linux goes
 * further and drops an arriving packet whose source is one of its own addresses as a
 * "martian" (`accept_local`, off by default, in the kernel's ip-sysctl documentation).
 * The argument does not rest on that: it holds wherever replies to a local address
 * stay local, which is how every IP stack routes.
 *
 * Where it would not hold, and what is done about it:
 *
 *  - Something on this computer that relays connections from elsewhere (a reverse proxy,
 *    a tunnel, a port forwarder) and connects to Outpost at the network address without
 *    a forwarding header. This is the same hole as such a relay connecting to loopback,
 *    which was already there, and has the same answer: a relay must send a forwarding
 *    header.
 *  - Inside a container. Its own addresses are the container's, and connections from
 *    the computer it runs on and from other devices are carried in by Docker's port
 *    publishing (or its user-land proxy, which connects from the bridge's gateway).
 *    None of that is in the container's own interface list, but nothing in Docker's
 *    documentation promises it either, so in a container the rule is not used at all:
 *    only loopback (and LAN access off) count, as before.
 *  - Link-local addresses (`fe80::/10`, `169.254.0.0/16`). They are unique only per
 *    network link, and some are shared on purpose: macOS gives its loopback interface
 *    `fe80::1`, which is also what many routers use on the home network. They are never
 *    counted as this computer's.
 *
 * The addresses are read from the operating system when asked, at most every few
 * seconds, because a computer's addresses change (a new lease, another network).
 */
import fs from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import os from "node:os";

const FORWARDING_HEADERS = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip"];

/** An address as a socket reports it: lower case, no zone (`%en0`), IPv4 not wrapped in IPv6. */
function plain(address: string): string {
  const value = address.trim().toLowerCase().replace(/%.*$/, "");
  return value.startsWith("::ffff:") && value.includes(".") ? value.slice("::ffff:".length) : value;
}

/** 127.0.0.0/8, ::1, and the IPv4 loopback range written as an IPv6 address. */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const value = address.trim().toLowerCase();
  if (value === "::1") return true;
  const v4 = value.startsWith("::ffff:") ? value.slice("::ffff:".length) : value;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

/** Addresses that may belong to another device as well as this one, or to none. */
function ambiguous(address: string): boolean {
  if (address === "" || address === "0.0.0.0" || address === "::") return true;
  if (/^169\.254\./.test(address)) return true;
  return /^fe[89ab][0-9a-f]:/.test(address);
}

type Interfaces = ReturnType<typeof os.networkInterfaces>;

/**
 * This computer's own addresses, from a list of interfaces as `os.networkInterfaces()`
 * gives it: every address on every interface, less loopback (counted on its own) and
 * the link-local ones (see above).
 */
export function ownAddresses(interfaces: Interfaces): Set<string> {
  const found = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const address = plain(entry.address);
      if (isLoopbackAddress(address) || ambiguous(address)) continue;
      found.add(address);
    }
  }
  return found;
}

/** What `isLocalRequest` needs to know about the computer it runs on. */
export interface Machine {
  /** In a container the computer's own addresses are not visible, and the rule is not used. */
  inContainer: boolean;
  addresses(): ReadonlySet<string>;
}

const truthy = (value: string | undefined) => ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
const REREAD_MS = 5000;

/**
 * The computer Outpost runs on. The container test is the one `detectHost` makes
 * (`modules/storage/shares/host.ts`): the variable the Compose file sets, or Docker's
 * marker file.
 */
export function thisMachine(
  env: NodeJS.ProcessEnv = process.env,
  read: () => Interfaces = () => os.networkInterfaces(),
  now: () => number = Date.now,
): Machine {
  const inContainer = truthy(env.OUTPOST_IN_CONTAINER) || (process.platform === "linux" && fs.existsSync("/.dockerenv"));
  let cached: { at: number; addresses: Set<string> } | null = null;
  return {
    inContainer,
    addresses() {
      if (!cached || now() - cached.at > REREAD_MS) {
        let addresses = new Set<string>();
        try {
          addresses = ownAddresses(read());
        } catch {
          // Unreadable: nothing counts but loopback.
        }
        cached = { at: now(), addresses };
      }
      return cached.addresses;
    },
  };
}

let machine: Machine | null = null;
const defaultMachine = () => {
  machine ??= thisMachine();
  return machine;
};

/** Whether the address a connection came from is this computer's own. */
export function isOwnAddress(address: string | undefined | null, on: Machine = defaultMachine()): boolean {
  if (!address) return false;
  if (isLoopbackAddress(address)) return true;
  if (on.inContainer) return false;
  const value = plain(address);
  return !ambiguous(value) && on.addresses().has(value);
}

export interface RequestOrigin {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
}

export function isLocalRequest(request: RequestOrigin, config: { lanAccess: boolean }, on: Machine = defaultMachine()): boolean {
  if (FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined)) return false;
  return !config.lanAccess || isOwnAddress(request.socket.remoteAddress, on);
}
