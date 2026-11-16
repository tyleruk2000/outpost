/**
 * One scan: which addresses on this computer's own networks answer, their names, and
 * what they announce. In order:
 *
 *  1. The networks are worked out from the computer's interfaces (`subnets.ts`).
 *  2. Meanwhile, what devices announce is listened for (`announcements.ts`).
 *  3. Each address of each IPv4 network is asked once, slowly: one ping; if no answer,
 *     one connection attempt on port 80 and, if that is not answered either, one on
 *     443 (the fixed list in `NETWORK_SCAN_LIMITS.ports`), each closed the moment it
 *     opens. Nothing is sent over a connection. At most `packetsPerSecond` probes are
 *     started a second and `concurrent` are waiting at once.
 *  4. The neighbour table is read: a device that ignored every probe still answered the
 *     computer's own "who has this address?" (ARP) on the way, and is in it.
 *  5. Each device found without a name of its own is given the one the system's
 *     resolver has for its address.
 *
 * No port beyond those two is tried, nothing is logged in to, no service is asked
 * anything, and no traffic is captured.
 */
import net from "node:net";
import { NETWORK_SCAN_LIMITS, type NetworkSubnet } from "@outpost/shared";
import { type Announcement, cleanName } from "./announcements.ts";
import { isPrivateMac } from "./neighbours.ts";
import { insidePlanned, sweepAddresses } from "./subnets.ts";
import type { NetworkSystem } from "./system.ts";

export interface ScanLimits {
  packetsPerSecond: number;
  concurrent: number;
  timeoutMs: number;
  ports: readonly number[];
  listenMs: number;
}

export interface FoundDevice {
  /** "mac:…" when the hardware address is known, else "ip:…". */
  key: string;
  mac: string | null;
  privateMac: boolean;
  addresses: string[];
  name: string;
  announcements: Announcement[];
  /** Ports from the fixed list that accepted a connection. */
  openPorts: number[];
  isSelf: boolean;
  isRouter: boolean;
}

export interface ScanOutcome {
  devices: FoundDevice[];
  /** Probes sent. */
  packets: number;
  addressesAsked: number;
}

export interface ScanProgress {
  asked: number;
  total: number;
  found: number;
  phase: "listening" | "asking" | "reading" | "naming";
}

/** Starts at most `perSecond` a second and keeps at most `concurrent` going; stops starting new ones when the signal fires. */
export function createPacer(limits: { perSecond: number; concurrent: number }, signal: AbortSignal) {
  const gap = 1000 / limits.perSecond;
  let nextAt = 0;
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async function paced<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (active >= limits.concurrent) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      const now = Date.now();
      const at = Math.max(now, nextAt);
      nextAt = at + gap;
      if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
      if (signal.aborted) return undefined;
      return await work();
    } finally {
      release();
    }
  };
}

function sortAddresses(addresses: Iterable<string>): string[] {
  const rank = (address: string) => (net.isIPv4(address) ? 0 : /^fe[89ab]/i.test(address) ? 2 : 1);
  return [...new Set(addresses)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "en", { numeric: true }));
}

export async function runScan(
  system: NetworkSystem,
  subnets: NetworkSubnet[],
  options: { limits?: ScanLimits; signal: AbortSignal; onProgress?: (progress: ScanProgress) => void },
): Promise<ScanOutcome> {
  const limits = options.limits ?? NETWORK_SCAN_LIMITS;
  const { signal } = options;
  const stopIfAsked = () => {
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Stopped");
  };

  const own = new Set<string>();
  for (const entries of Object.values(system.interfaces()))
    for (const entry of entries ?? []) own.add(entry.address.split("%")[0]!.toLowerCase());
  const selfMacs = new Set<string>();
  for (const entries of Object.values(system.interfaces()))
    for (const entry of entries ?? []) if (entry.mac && entry.mac !== "00:00:00:00:00:00") selfMacs.add(entry.mac.toLowerCase());

  const listening = system.announcements(limits.listenMs, signal).catch(() => [] as Announcement[]);

  const targets = subnets.flatMap((subnet) => sweepAddresses(subnet));
  const answered = new Map<string, number[]>();
  let asked = 0;
  let packets = 0;
  const progress = (phase: ScanProgress["phase"]) => options.onProgress?.({ asked, total: targets.length, found: answered.size, phase });
  progress("asking");

  const paced = createPacer({ perSecond: limits.packetsPerSecond, concurrent: limits.concurrent }, signal);
  await Promise.all(
    targets.map(async (address) => {
      const replied = await paced(async () => {
        packets += 1;
        return system.ping(address, limits.timeoutMs);
      });
      if (replied === null) packets -= 1; // ping is not usable here: nothing was sent
      if (replied) answered.set(address, []);
      else {
        for (const port of limits.ports) {
          const result = await paced(async () => {
            packets += 1;
            return system.connect(address, port, limits.timeoutMs);
          });
          if (result === "open") answered.set(address, [...(answered.get(address) ?? []), port]);
          if (result === "open" || result === "refused") {
            if (!answered.has(address)) answered.set(address, []);
            break;
          }
          if (result === undefined) break;
        }
      }
      asked += 1;
      if (asked % 8 === 0 || asked === targets.length) progress("asking");
    }),
  );
  stopIfAsked();

  progress("reading");
  const [table, routers, heard] = await Promise.all([
    system.neighbours().catch(() => []),
    system.routers().catch((): string[] => []),
    listening,
  ]);
  stopIfAsked();

  // Devices by hardware address where it is known, else by address.
  const byKey = new Map<string, FoundDevice>();
  const keyOfAddress = new Map<string, string>();
  const add = (address: string, mac: string | null) => {
    const plain = address.split("%")[0]!.toLowerCase();
    if (!insidePlanned(plain, subnets)) return null;
    const known = keyOfAddress.get(plain);
    const key = mac ? `mac:${mac}` : (known ?? `ip:${plain}`);
    if (known && known !== key && known.startsWith("ip:")) {
      // Found by address first, its hardware address now known: one device.
      const earlier = byKey.get(known)!;
      byKey.delete(known);
      byKey.set(key, { ...earlier, key, mac, privateMac: mac ? isPrivateMac(mac) : false });
    }
    let device = byKey.get(key);
    if (!device) {
      device = {
        key,
        mac,
        privateMac: mac ? isPrivateMac(mac) : false,
        addresses: [],
        name: "",
        announcements: [],
        openPorts: [],
        isSelf: false,
        isRouter: false,
      };
      byKey.set(key, device);
    }
    if (!device.addresses.includes(plain)) device.addresses.push(plain);
    keyOfAddress.set(plain, key);
    return device;
  };

  for (const entry of table) add(entry.address, entry.mac);
  for (const [address, ports] of answered) {
    const device = add(address, null);
    if (device) device.openPorts = [...new Set([...device.openPorts, ...ports])];
  }
  // This computer itself, on each network looked at.
  for (const subnet of subnets) {
    const mac = system.interfaces()[subnet.interface]?.find((entry) => entry.mac && entry.mac !== "00:00:00:00:00:00")?.mac;
    const self = add(subnet.address, mac ? mac.toLowerCase() : null);
    if (self) self.isSelf = true;
  }

  // What was announced, matched to an address by the name it gave.
  const hosts = new Map<string, string[]>();
  for (const entry of heard) {
    let addresses = entry.address ? [entry.address] : [];
    if (addresses.length === 0 && entry.host) {
      if (!hosts.has(entry.host)) hosts.set(entry.host, await system.lookup(entry.host, 2000).catch(() => []));
      addresses = hosts.get(entry.host) ?? [];
    }
    const address = addresses.find((candidate) => insidePlanned(candidate, subnets));
    if (!address) continue;
    const device = keyOfAddress.has(address) ? byKey.get(keyOfAddress.get(address)!)! : add(address, null);
    if (!device) continue;
    if (!device.announcements.some((known) => known.type === entry.type && known.name === entry.name)) device.announcements.push(entry);
    if (!device.name && entry.host) device.name = cleanName(entry.host.replace(/\.local$/, ""));
  }
  stopIfAsked();

  progress("naming");
  const devices = [...byKey.values()];
  for (const device of devices) {
    device.addresses = sortAddresses(device.addresses);
    if (device.addresses.some((address) => own.has(address)) || (device.mac && selfMacs.has(device.mac))) device.isSelf = true;
    if (device.addresses.some((address) => routers.includes(address))) device.isRouter = true;
  }
  const paceNames = createPacer({ perSecond: limits.packetsPerSecond, concurrent: 4 }, signal);
  await Promise.all(
    devices.map(async (device) => {
      const v4 = device.addresses.find((address) => net.isIPv4(address));
      // A device that announced its own name is not asked about again.
      if (!v4 || device.name) return;
      const name = await paceNames(() => system.reverseName(v4, 2000).catch(() => null));
      if (name) device.name = cleanName(name);
    }),
  );
  stopIfAsked();

  return { devices, packets, addressesAsked: targets.length };
}
