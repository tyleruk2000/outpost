/**
 * Which networks a scan may look at: only those this computer is itself attached to,
 * read from the operating system when asked, and of those only the private and
 * link-local ones. Nothing from a request decides it; a browser cannot name a range.
 *
 * The rules, each tested in test/network-subnets.test.ts:
 *
 *  - IPv4 private ranges (RFC 1918: 10/8, 172.16/12, 192.168/16) and link-local
 *    (RFC 3927: 169.254/16) are swept, one address at a time, slowly.
 *  - A network larger than a /22 (1,022 addresses) is narrowed to the /24 this computer
 *    is in, and the screen says so.
 *  - IPv6 unique-local (RFC 4193: fc00::/7) and link-local (RFC 4291: fe80::/10) networks
 *    are never swept (a /64 has 2^64 addresses): what the computer already knows of and
 *    what announces itself is listed.
 *  - A public address, the shared range carriers and VPNs use (RFC 6598: 100.64/10),
 *    loopback, and a tunnel (a VPN's interface, which leads to a network somewhere else)
 *    are not scanned, and the screen says why.
 */
import net from "node:net";
import type os from "node:os";
import { NETWORK_SCAN_LIMITS, type NetworkSkipped, type NetworkSubnet } from "@outpost/shared";

export type InterfaceList = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

const blocks = (entries: Array<[string, number, "ipv4" | "ipv6"]>) => {
  const list = new net.BlockList();
  for (const [address, prefix, type] of entries) list.addSubnet(address, prefix, type);
  return list;
};

const PRIVATE_V4 = blocks([
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
]);
const LINK_LOCAL_V4 = blocks([["169.254.0.0", 16, "ipv4"]]);
const SHARED_V4 = blocks([["100.64.0.0", 10, "ipv4"]]);
const UNIQUE_LOCAL_V6 = blocks([["fc00::", 7, "ipv6"]]);
const LINK_LOCAL_V6 = blocks([["fe80::", 10, "ipv6"]]);

/** Interfaces that lead somewhere else (a VPN, a tunnel) or are a device's own peer-to-peer link, by the names systems give them. */
const TUNNEL = /^(utun|tun|tap|wg|tailscale|zt|ppp|ipsec|gif|stf)\d*/i;
const PEER_TO_PEER = /^(awdl|llw)\d*/i;

export function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

export function numberToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}

/** The first address of the network of `address` with this prefix. */
function networkOf(address: number, prefix: number): number {
  const size = 2 ** (32 - prefix);
  return Math.floor(address / size) * size;
}

/** The kind of a local address, or why it is not one. */
export function classify(address: string): { kind: NetworkSubnet["kind"] } | { reason: string } {
  const plain = address.split("%")[0] ?? "";
  const family = net.isIP(plain);
  if (family === 4) {
    if (plain.startsWith("127.")) return { reason: "Loopback: this computer talking to itself." };
    if (PRIVATE_V4.check(plain, "ipv4")) return { kind: "private" };
    if (LINK_LOCAL_V4.check(plain, "ipv4")) return { kind: "link-local" };
    if (SHARED_V4.check(plain, "ipv4"))
      return { reason: "An address from the range carriers and VPNs share (100.64.0.0/10): not a home network. Not scanned." };
    return { reason: "A public address. Outpost only looks at private networks, so it is not scanned." };
  }
  if (family === 6) {
    if (plain === "::1") return { reason: "Loopback: this computer talking to itself." };
    if (UNIQUE_LOCAL_V6.check(plain, "ipv6")) return { kind: "unique-local" };
    if (LINK_LOCAL_V6.check(plain, "ipv6")) return { kind: "link-local" };
    return { reason: "A public IPv6 address. Outpost only looks at private networks, so it is not scanned." };
  }
  return { reason: "Not an address." };
}

/** The addresses a sweep asks, in order: every host address of the range, less this computer's own. */
export function sweepAddresses(subnet: Pick<NetworkSubnet, "family" | "plan" | "cidr" | "swept" | "address">): string[] {
  if (subnet.family !== 4 || subnet.plan === "listen") return [];
  const [base, bits] = (subnet.swept ?? subnet.cidr).split("/") as [string, string];
  const prefix = Number(bits);
  const start = ipv4ToNumber(base);
  const size = 2 ** (32 - prefix);
  const out: string[] = [];
  // A /31 or /32 has no network or broadcast address to leave out; anything larger does.
  const first = size > 2 ? start + 1 : start;
  const last = size > 2 ? start + size - 2 : start + size - 1;
  for (let value = first; value <= last; value += 1) {
    const address = numberToIpv4(value);
    if (address !== subnet.address) out.push(address);
  }
  return out;
}

/**
 * The networks a scan would look at, worked out from the computer's interfaces as the
 * operating system lists them (`os.networkInterfaces()`), and those it would not, with why.
 */
export function planSubnets(interfaces: InterfaceList): { subnets: NetworkSubnet[]; skipped: NetworkSkipped[] } {
  const subnets: NetworkSubnet[] = [];
  const skipped: NetworkSkipped[] = [];
  const seen = new Set<string>();
  const { largestPrefix } = NETWORK_SCAN_LIMITS;

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const family = entry.family === "IPv6" || (entry.family as unknown) === 6 ? 6 : 4;
      const address = entry.address.split("%")[0] ?? entry.address;
      if (entry.internal) continue;
      if (TUNNEL.test(name)) {
        skipped.push({
          interface: name,
          address,
          reason: "A tunnel (a VPN or similar), which leads to a network somewhere else. Not scanned.",
        });
        continue;
      }
      if (PEER_TO_PEER.test(name)) {
        skipped.push({ interface: name, address, reason: "Apple’s peer-to-peer Wi-Fi link (AirDrop), not a network. Not scanned." });
        continue;
      }
      const kind = classify(address);
      if ("reason" in kind) {
        skipped.push({ interface: name, address, reason: kind.reason });
        continue;
      }
      const prefix = Number((entry.cidr ?? "").split("/")[1]);
      if (!Number.isInteger(prefix)) {
        skipped.push({ interface: name, address, reason: "The system did not give the size of this network." });
        continue;
      }

      if (family === 6) {
        // One listing per interface and kind: an interface often has several addresses in one network.
        const key = `6|${name}|${kind.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        subnets.push({
          interface: name,
          family: 6,
          address,
          cidr: kind.kind === "link-local" ? "fe80::/64" : (entry.cidr ?? `${address}/${prefix}`),
          kind: kind.kind,
          plan: "listen",
          swept: null,
          addresses: 0,
          reason:
            "IPv6 networks are far too large to sweep. Devices this computer already knows of, and those that announce themselves, are listed.",
        });
        continue;
      }

      if (prefix >= 31) {
        skipped.push({ interface: name, address, reason: "A link to a single other address, not a network to look through." });
        continue;
      }
      const value = ipv4ToNumber(address);
      const cidr = `${numberToIpv4(networkOf(value, prefix))}/${prefix}`;
      const narrowed = prefix < largestPrefix;
      const swept = narrowed ? `${numberToIpv4(networkOf(value, 24))}/24` : null;
      const key = `4|${swept ?? cidr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const subnet: NetworkSubnet = {
        interface: name,
        family: 4,
        address,
        cidr,
        kind: kind.kind,
        plan: narrowed ? "narrowed" : "sweep",
        swept,
        addresses: 0,
        reason: narrowed
          ? `${cidr} has ${(2 ** (32 - prefix) - 2).toLocaleString("en-GB")} addresses, more than Outpost sweeps (a /${largestPrefix} at most), so only ${swept}, the part this computer is in, is swept.`
          : null,
      };
      subnet.addresses = sweepAddresses(subnet).length;
      subnets.push(subnet);
    }
  }
  return { subnets, skipped };
}

/** Whether an address found by a scan belongs to one of the networks planned. Anything else is dropped. */
export function insidePlanned(address: string, subnets: readonly NetworkSubnet[]): boolean {
  const plain = address.split("%")[0] ?? "";
  const family = net.isIP(plain);
  if (family === 4) {
    const value = ipv4ToNumber(plain);
    return subnets.some((subnet) => {
      if (subnet.family !== 4) return false;
      const [base, bits] = subnet.cidr.split("/") as [string, string];
      const prefix = Number(bits);
      return networkOf(value, prefix) === ipv4ToNumber(base);
    });
  }
  if (family === 6) {
    const kind = classify(plain);
    return "kind" in kind && subnets.some((subnet) => subnet.family === 6 && subnet.kind === kind.kind);
  }
  return false;
}
