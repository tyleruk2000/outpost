/**
 * The names and addresses a certificate can carry, and the ones this server is reached by.
 *
 * A browser checks the name in its address bar against the certificate, so the
 * certificate must list every way of reaching Outpost on the network: its LAN addresses,
 * its host name and the `.local` name other devices find it by.
 */
import net from "node:net";
import type os from "node:os";

export type ServerName = { kind: "dns"; text: string } | { kind: "ip"; text: string; family: 4 | 6; bytes: Buffer };

/** An address block, as a certificate authority's limits write it: an address and a prefix length. */
export interface AddressBlock {
  family: 4 | 6;
  address: string;
  prefix: number;
}

/**
 * Address blocks that only ever exist on a private network or on the computer itself.
 * The certificate authority is limited to these, so that it is of no use for
 * impersonating anything on the internet.
 */
export const PRIVATE_BLOCKS: AddressBlock[] = [
  { family: 4, address: "10.0.0.0", prefix: 8 }, // private (RFC 1918)
  { family: 4, address: "172.16.0.0", prefix: 12 }, // private (RFC 1918)
  { family: 4, address: "192.168.0.0", prefix: 16 }, // private (RFC 1918)
  { family: 4, address: "169.254.0.0", prefix: 16 }, // link-local (RFC 3927)
  { family: 4, address: "100.64.0.0", prefix: 10 }, // shared address space (RFC 6598), used by overlay networks
  { family: 4, address: "127.0.0.0", prefix: 8 }, // this computer
  { family: 6, address: "fc00::", prefix: 7 }, // unique local (RFC 4193)
  { family: 6, address: "fe80::", prefix: 10 }, // link-local
  { family: 6, address: "::1", prefix: 128 }, // this computer
];

/**
 * Name endings that are never public: reserved for local use (`local`, `localhost`,
 * `internal`, `home.arpa`) or by long custom on home routers (`lan`, `home`). They match
 * the names the request guard answers to with LAN access on (`core/guard.ts`).
 */
export const PRIVATE_SUFFIXES = ["local", "lan", "home", "internal", "home.arpa", "localhost"];

function parseIpv4(text: string): Buffer | null {
  const parts = text.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return null;
  return Buffer.from(parts.map(Number));
}

function parseIpv6(text: string): Buffer | null {
  if (!net.isIPv6(text)) return null;
  // The last 32 bits may be written as an IPv4 address; rewrite them as two groups.
  let hex = text;
  const lastColon = text.lastIndexOf(":");
  if (text.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    hex = `${text.slice(0, lastColon + 1)}${v4.readUInt16BE(0).toString(16)}:${v4.readUInt16BE(2).toString(16)}`;
  }
  const [head = "", tail] = hex.split("::");
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const before = groups(head);
  const after = tail === undefined ? [] : groups(tail);
  // "::" stands for however many zero groups make the address eight groups long.
  const fill = tail === undefined ? 0 : 8 - before.length - after.length;
  const all = [...before, ...Array<string>(Math.max(fill, 0)).fill("0"), ...after];
  if (all.length !== 8) return null;
  const bytes = Buffer.alloc(16);
  for (const [index, group] of all.entries()) bytes.writeUInt16BE(Number.parseInt(group, 16), index * 2);
  return bytes;
}

function formatIpv6(bytes: Buffer): string {
  // The URL parser writes IPv6 addresses in their one canonical short form.
  const groups = Array.from({ length: 8 }, (_, index) => bytes.readUInt16BE(index * 2).toString(16));
  return new URL(`http://[${groups.join(":")}]`).hostname.slice(1, -1);
}

/** Reads one name or address as a person or a network interface writes it. Null when it is neither. */
export function parseName(input: string): ServerName | null {
  let text = input.trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  // A zone ("%en0") says which interface a link-local address is on; it is not part of the address.
  text = text.replace(/%.*$/, "").replace(/\.$/, "");
  if (text === "" || text.length > 253) return null;
  const v4 = parseIpv4(text);
  if (v4) return { kind: "ip", text: Array.from(v4).join("."), family: 4, bytes: v4 };
  if (text.includes(":")) {
    const v6 = parseIpv6(text);
    return v6 ? { kind: "ip", text: formatIpv6(v6), family: 6, bytes: v6 } : null;
  }
  const labels = text.split(".");
  if (labels.some((label) => !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  // Four numbers that are not an address, or a name ending in a number, would be read as an address by a browser.
  if (/^\d+$/.test(labels[labels.length - 1] ?? "")) return null;
  return { kind: "dns", text };
}

/** Whether `bytes` lies inside `block`. */
export function inBlock(bytes: Buffer, block: AddressBlock): boolean {
  if ((block.family === 4 ? 4 : 16) !== bytes.length) return false;
  const base = block.family === 4 ? parseIpv4(block.address) : parseIpv6(block.address);
  if (!base) return false;
  for (let bit = 0; bit < block.prefix; bit += 1) {
    const mask = 0x80 >> (bit % 8);
    if (((bytes[bit >> 3] ?? 0) & mask) !== ((base[bit >> 3] ?? 0) & mask)) return false;
  }
  return true;
}

/** The address and mask of a block, as the bytes a name constraint holds. */
export function blockBytes(block: AddressBlock): Buffer {
  const base = block.family === 4 ? parseIpv4(block.address) : parseIpv6(block.address);
  if (!base) throw new Error(`Not an address: ${block.address}`);
  const mask = Buffer.alloc(base.length);
  for (let bit = 0; bit < block.prefix; bit += 1) mask[bit >> 3] = (mask[bit >> 3] ?? 0) | (0x80 >> (bit % 8));
  return Buffer.concat([base, mask]);
}

/** The reverse of `blockBytes`. Null if the mask is not a plain prefix. */
export function blockFromBytes(bytes: Buffer): AddressBlock | null {
  if (bytes.length !== 8 && bytes.length !== 32) return null;
  const half = bytes.length / 2;
  const base = bytes.subarray(0, half);
  const mask = bytes.subarray(half);
  let prefix = 0;
  while (prefix < half * 8 && (mask[prefix >> 3] ?? 0) & (0x80 >> (prefix % 8))) prefix += 1;
  for (let bit = prefix; bit < half * 8; bit += 1) if ((mask[bit >> 3] ?? 0) & (0x80 >> (bit % 8))) return null;
  return half === 4 ? { family: 4, address: Array.from(base).join("."), prefix } : { family: 6, address: formatIpv6(base), prefix };
}

/** Whether a DNS name is `suffix` itself or a name under it, which is how a name constraint matches. */
export const underSuffix = (name: string, suffix: string): boolean => name === suffix || name.endsWith(`.${suffix}`);

/** The first label of a host name, if it can be used as a name: "Kitchen-Pi.local" gives "kitchen-pi". */
export function hostLabel(hostname: string): string | null {
  const label = hostname.trim().toLowerCase().split(".")[0] ?? "";
  const parsed = parseName(label);
  return parsed?.kind === "dns" && label !== "localhost" ? label : null;
}

export interface NameSources {
  /** `os.networkInterfaces()`. */
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
  /** `os.hostname()`. */
  hostname: string;
  /** Without LAN access nothing but this computer reaches Outpost, so its network addresses are not ways in. */
  lanAccess: boolean;
  /** In a container the interfaces and the host name are the container's own, which nobody outside it uses. */
  inContainer: boolean;
  /** Names from OUTPOST_ALLOWED_HOSTS. */
  allowedHosts: string[];
  /** Names a person added in Settings. */
  extra: string[];
}

export interface ReachableName {
  name: ServerName;
  /**
   * Where it came from: an address of a network interface, the host's own name, a name
   * a person listed (in Settings or OUTPOST_ALLOWED_HOSTS), or the computer itself.
   */
  origin: "network" | "host" | "listed" | "own";
}

/** Splits the "other names" setting into its entries. */
export const splitNames = (text: string): string[] =>
  text
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Every name and address this server may be reached by, most useful first: addresses
 * on the network, the host's names, names a person listed, and the computer itself.
 * Not every one can go on the certificate; the authority decides that.
 */
export function reachableNames(sources: NameSources): ReachableName[] {
  const found = new Map<string, ReachableName>();
  const add = (text: string, origin: ReachableName["origin"]) => {
    const name = parseName(text);
    if (name && !found.has(name.text)) found.set(name.text, { name, origin });
  };

  const seesNetwork = sources.lanAccess && !sources.inContainer;
  const later: string[] = [];
  if (seesNetwork) {
    for (const list of Object.values(sources.interfaces)) {
      for (const entry of list ?? []) {
        if (entry.internal) continue;
        // A link-local IPv6 address needs its interface named in the address bar, which browsers do not accept.
        if (entry.family === "IPv6" && entry.address.toLowerCase().startsWith("fe80")) continue;
        if (entry.family === "IPv4") add(entry.address, "network");
        else later.push(entry.address);
      }
    }
    const label = hostLabel(sources.hostname);
    if (label) {
      add(`${label}.local`, "host");
      add(label, "host");
    }
  }
  for (const name of [...sources.extra, ...sources.allowedHosts]) add(name, "listed");
  for (const address of later) add(address, "network");
  for (const own of ["localhost", "127.0.0.1", "::1"]) add(own, "own");
  return [...found.values()];
}

/** How a name is written in an address: an IPv6 address goes in square brackets. */
export const inUrl = (name: ServerName): string => (name.kind === "ip" && name.family === 6 ? `[${name.text}]` : name.text);
