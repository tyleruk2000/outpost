/**
 * Which computers Outpost will connect a share from.
 *
 * Outpost has no accounts: anyone who can open it can use "Connect a network share".
 * So the server only ever connects to an address on the home network itself (private
 * or link-local), never to one on the internet, whoever asks. The name is resolved
 * here, the address is checked here, and the connection is then made to that address
 * and not to the name, so a name cannot pass the check and then lead somewhere else.
 */
import dns from "node:dns";
import net from "node:net";

const privateRanges = new net.BlockList();
privateRanges.addSubnet("10.0.0.0", 8, "ipv4");
privateRanges.addSubnet("172.16.0.0", 12, "ipv4");
privateRanges.addSubnet("192.168.0.0", 16, "ipv4");
privateRanges.addSubnet("169.254.0.0", 16, "ipv4");
privateRanges.addSubnet("fc00::", 7, "ipv6");
privateRanges.addSubnet("fe80::", 10, "ipv6");

const loopbackRanges = new net.BlockList();
loopbackRanges.addSubnet("127.0.0.0", 8, "ipv4");
loopbackRanges.addAddress("::1", "ipv6");

/** An IPv4 address written inside an IPv6 one, in either spelling. */
function unmapped(address: string): string {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (dotted) return dotted[1]!;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const high = Number.parseInt(hex[1]!, 16);
    const low = Number.parseInt(hex[2]!, 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return address;
}

/**
 * True for an address a share may be connected from: private or link-local, and
 * loopback only when that is switched on (it is used for testing).
 */
export function isShareAddressAllowed(address: string, allowLoopback: boolean): boolean {
  // A link-local IPv6 address may carry the interface it belongs to ("fe80::1%en0").
  const candidate = unmapped(address.split("%")[0] ?? "");
  const family = net.isIP(candidate);
  if (family === 0) return false;
  const type = family === 4 ? "ipv4" : "ipv6";
  if (privateRanges.check(candidate, type)) return true;
  return allowLoopback && loopbackRanges.check(candidate, type);
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type HostLookup = (host: string) => Promise<ResolvedAddress[]>;

const LOOKUP_TIMEOUT_MS = 6_000;

/** Asks the operating system, which also knows `.local` names. Never waits for ever. */
export const lookupHost: HostLookup = (host) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("lookup timed out"), { code: "ETIMEOUT" })), LOOKUP_TIMEOUT_MS);
    dns.lookup(host, { all: true, verbatim: true }, (error, addresses) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(addresses.map((entry) => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 })));
    });
  });

export type ResolveOutcome =
  | { ok: true; address: ResolvedAddress }
  /** The name is not known on this network. */
  | { ok: false; reason: "not_found" }
  /** It resolved, but to nothing on the home network. */
  | { ok: false; reason: "not_private"; addresses: string[] };

/**
 * Turns a validated host into the one address to connect to. Addresses that are not
 * allowed are dropped; if none is left the host is refused. IPv4 is preferred, and a
 * link-local IPv6 address is the last resort.
 */
export async function resolveShareHost(host: string, options: { allowLoopback: boolean; lookup: HostLookup }): Promise<ResolveOutcome> {
  let found: ResolvedAddress[];
  const literal = net.isIP(host);
  if (literal) {
    found = [{ address: host, family: literal === 6 ? 6 : 4 }];
  } else {
    try {
      found = await options.lookup(host);
    } catch {
      return { ok: false, reason: "not_found" };
    }
  }
  if (found.length === 0) return { ok: false, reason: "not_found" };
  const allowed = found.filter(
    (entry) => net.isIP(entry.address.split("%")[0] ?? "") && isShareAddressAllowed(entry.address, options.allowLoopback),
  );
  if (allowed.length === 0) return { ok: false, reason: "not_private", addresses: found.map((entry) => entry.address) };
  const rank = (entry: ResolvedAddress) => (entry.family === 4 ? 0 : /^fe[89ab]/i.test(entry.address) ? 2 : 1);
  allowed.sort((a, b) => rank(a) - rank(b));
  return { ok: true, address: allowed[0]! };
}

export type ProbeResult =
  /** Something accepted the connection. */
  | "open"
  /** The computer is there but nothing listens on that port. */
  | "refused"
  /** No answer at all. */
  | "timeout"
  /** The connection could not be attempted or failed some other way. */
  | "unreachable";

export type PortProbe = (address: string, port: number, timeoutMs: number) => Promise<ProbeResult>;

/**
 * Opens and immediately closes a connection, to tell "nothing is there" apart from
 * "wrong share name" before handing over to the system, which waits a minute or more
 * for a computer that is switched off.
 */
export const probePort: PortProbe = (address, port, timeoutMs) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: address, port });
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish("timeout"));
    socket.once("connect", () => finish("open"));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ECONNREFUSED" ? "refused" : error.code === "ETIMEDOUT" ? "timeout" : "unreachable");
    });
  });

/** The address as it goes inside an `smb://` URL. */
export function urlHost(address: string): string {
  if (!address.includes(":")) return address;
  // The "%" before an interface name has to be written "%25" inside a URL.
  return `[${address.replace("%", "%25")}]`;
}
