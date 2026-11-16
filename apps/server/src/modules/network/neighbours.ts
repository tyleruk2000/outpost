/**
 * Reading the computer's list of neighbours: the addresses on its own networks it has
 * recently talked to, with their hardware addresses. On IPv4 that is the ARP table, on
 * IPv6 the neighbour discovery (NDP) table. Every system keeps one and lets anyone read
 * it; nothing here needs special rights.
 *
 *  - macOS: `arp -an` and `ndp -an`.
 *  - Linux (and a Raspberry Pi): `ip neigh show` when iproute2 is there, else the
 *    kernel's own `/proc/net/arp` (IPv4 only), which is there even in a slim container.
 *
 * The parsers are tested against recorded output with made-up addresses
 * (test/network-neighbours.test.ts).
 */

export interface Neighbour {
  address: string;
  /** Lower case, six two-digit parts. */
  mac: string;
  interface: string;
}

/** "1:0:5e:0:0:fb" (macOS leaves out leading zeros) as "01:00:5e:00:00:fb". Null for something that is not a hardware address. */
export function normaliseMac(value: string): string | null {
  const parts = value.trim().toLowerCase().split(/[:-]/);
  if (parts.length !== 6 || parts.some((part) => !/^[0-9a-f]{1,2}$/.test(part))) return null;
  return parts.map((part) => part.padStart(2, "0")).join(":");
}

/** Addresses that are not a device: broadcast, multicast, and the all-zero placeholder of an entry still being looked up. */
export function isDeviceMac(mac: string): boolean {
  if (mac === "00:00:00:00:00:00" || mac === "ff:ff:ff:ff:ff:ff") return false;
  // The low bit of the first byte marks a group (multicast) address: 01:00:5e:… for IPv4, 33:33:… for IPv6.
  return (Number.parseInt(mac.slice(0, 2), 16) & 1) === 0;
}

/**
 * A hardware address the device made up, as phones and computers do on Wi-Fi now for
 * privacy: the "locally administered" bit (the second-lowest of the first byte) is set.
 * Such an address says nothing about who made the device.
 */
export function isPrivateMac(mac: string): boolean {
  return (Number.parseInt(mac.slice(0, 2), 16) & 2) === 2;
}

function keep(list: Neighbour[], address: string, macText: string, iface: string): void {
  const mac = normaliseMac(macText);
  if (!mac || !isDeviceMac(mac)) return;
  list.push({ address: address.toLowerCase(), mac, interface: iface });
}

/** macOS `arp -an`: "? (192.168.1.1) at a0:b1:c2:d3:e4:f5 on en0 ifscope [ethernet]". */
export function parseMacArp(output: string): Neighbour[] {
  const list: Neighbour[] = [];
  for (const line of output.split("\n")) {
    const match = /\((\d{1,3}(?:\.\d{1,3}){3})\) at (\S+) on (\S+)/.exec(line);
    if (match) keep(list, match[1]!, match[2]!, match[3]!);
  }
  return list;
}

/** macOS `ndp -an`: "fe80::1c2b:3a4d:5e6f:7a8b%en0  a0:b1:c2:d3:e4:f5  en0 23h59m58s S R". */
export function parseMacNdp(output: string): Neighbour[] {
  const list: Neighbour[] = [];
  for (const line of output.split("\n")) {
    const match = /^([0-9a-f:]+)(?:%\S+)?\s+(\S+)\s+(\S+)\s/i.exec(`${line.trim()} `);
    if (!match || !match[1]!.includes(":")) continue;
    keep(list, match[1]!, match[2]!, match[3]!);
  }
  return list;
}

/** Linux `/proc/net/arp`: a table with a header; flags 0x0 means the entry is incomplete. */
export function parseProcArp(output: string): Neighbour[] {
  const list: Neighbour[] = [];
  for (const line of output.split("\n").slice(1)) {
    const [address, , flags, mac, , iface] = line.trim().split(/\s+/);
    if (!address || !mac || !iface || flags === "0x0") continue;
    keep(list, address, mac, iface);
  }
  return list;
}

/** Linux `ip neigh show`: "192.168.1.1 dev eth0 lladdr a0:b1:c2:d3:e4:f5 REACHABLE". Entries that failed or are incomplete have no lladdr. */
export function parseIpNeigh(output: string): Neighbour[] {
  const list: Neighbour[] = [];
  for (const line of output.split("\n")) {
    const match = /^(\S+) dev (\S+) lladdr (\S+)(.*)$/.exec(line.trim());
    if (!match || /\b(FAILED|INCOMPLETE)\b/.test(match[4]!)) continue;
    keep(list, match[1]!.split("%")[0]!, match[3]!, match[2]!);
  }
  return list;
}

/** macOS `route -n get default`: the line "gateway: 192.168.1.1". */
export function parseMacRoute(output: string): string[] {
  const match = /^\s*gateway:\s*(\S+)\s*$/m.exec(output);
  return match ? [match[1]!] : [];
}

/** Linux `/proc/net/route`: the default route (destination 00000000), its gateway in little-endian hexadecimal. */
export function parseProcRoute(output: string): string[] {
  const gateways: string[] = [];
  for (const line of output.split("\n").slice(1)) {
    const [, destination, gateway] = line.trim().split(/\s+/);
    if (destination !== "00000000" || !gateway || !/^[0-9A-Fa-f]{8}$/.test(gateway) || gateway === "00000000") continue;
    const value = Number.parseInt(gateway, 16);
    gateways.push([0, 8, 16, 24].map((shift) => (value >>> shift) & 255).join("."));
  }
  return [...new Set(gateways)];
}
