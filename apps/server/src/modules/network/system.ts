/**
 * Everything a scan asks of the computer, in one place, so that the scan itself can be
 * tested against a made-up machine and nothing in the test suites touches a real
 * network.
 *
 * What the real one uses, all without special rights:
 *
 * | Need | macOS | Linux, Raspberry Pi | Container (Debian slim) |
 * | --- | --- | --- | --- |
 * | Interfaces | `os.networkInterfaces()` | the same | the same |
 * | Ping | `/sbin/ping` (unprivileged ICMP sockets) | `ping` if installed and allowed (tried once on loopback) | not installed |
 * | Connection attempt | Node's `net.connect` | the same | the same |
 * | Neighbour table | `arp -an`, `ndp -an` | `ip neigh show`, else `/proc/net/arp` | `/proc/net/arp` |
 * | Router | `route -n get default` | `/proc/net/route` | `/proc/net/route` |
 * | Announcements | `dns-sd` | `avahi-browse` if installed | none |
 * | Names of addresses | `dns.lookupService` (the system's resolver, for swept private addresses only) | the same | the same |
 * | Addresses of announced `.local` names | `dns-sd -G` (multicast DNS only) | `avahi-resolve` if installed (multicast DNS only) | none |
 *
 * Programs are started with `execFile` by full path and a list of arguments, never
 * through a shell, each with a time limit (`runCommand` from the shares feature).
 */
import dns from "node:dns";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import type { NetworkAbilities } from "@outpost/shared";
import { localName, type ProbeResult, probePort } from "../storage/shares/address.ts";
import { type CommandRunner, runCommand } from "../storage/shares/commands.ts";
import { type Announcement, parseAvahi, parseInstances, parseServiceTypes } from "./announcements.ts";
import { type Neighbour, parseIpNeigh, parseMacArp, parseMacNdp, parseMacRoute, parseProcArp, parseProcRoute } from "./neighbours.ts";
import type { InterfaceList } from "./subnets.ts";

export interface NetworkSystem {
  os: "macos" | "linux" | "windows" | "other";
  interfaces(): InterfaceList;
  abilities(): Promise<NetworkAbilities>;
  /** One echo request. True when answered; null when ping cannot be used here. */
  ping(address: string, timeoutMs: number): Promise<boolean | null>;
  /** One connection attempt, closed at once if it opens. */
  connect(address: string, port: number, timeoutMs: number): Promise<ProbeResult>;
  neighbours(): Promise<Neighbour[]>;
  routers(): Promise<string[]>;
  /** The name the system's resolver gives an address, or null. */
  reverseName(address: string, timeoutMs: number): Promise<string | null>;
  /** What is announced on the network, listening for at most `ms`. */
  announcements(ms: number, signal: AbortSignal): Promise<Announcement[]>;
  /**
   * The addresses of an announced host name ("nas.local"), asked by multicast DNS only:
   * never through the system's resolver, which would send a name a device chose to
   * whatever DNS server the computer uses. Anything but a `.local` name gets nothing.
   */
  lookup(host: string, timeoutMs: number): Promise<string[]>;
}

const exists = (file: string) => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
const firstThere = (files: string[]) => files.find(exists) ?? null;

export { localName };

/** Addresses from `dns-sd -G v4v6 name.local` ("… Add 40000002 14 nas.local. 192.168.1.20 120"). */
export function parseDnsSdAddresses(output: string): string[] {
  const found: string[] = [];
  for (const line of output.split("\n")) {
    const match = /\sAdd\s+\S+\s+\d+\s+\S+\s+(\S+)\s+\d+\s*$/.exec(line);
    const address = match?.[1]?.split("%")[0]?.toLowerCase();
    if (address && net.isIP(address) !== 0 && !found.includes(address)) found.push(address);
  }
  return found;
}

/** Addresses from `avahi-resolve -n name.local` ("nas.local\t192.168.1.20"). */
export function parseAvahiResolve(output: string): string[] {
  const found: string[] = [];
  for (const line of output.split("\n")) {
    const address = line.trim().split(/\s+/)[1]?.split("%")[0]?.toLowerCase();
    if (address && net.isIP(address) !== 0 && !found.includes(address)) found.push(address);
  }
  return found;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** This computer. `run` is for tests of the command lines; it defaults to the real one. */
export function realSystem(run: CommandRunner = runCommand, platform: NodeJS.Platform = process.platform): NetworkSystem {
  const kind = platform === "darwin" ? "macos" : platform === "linux" ? "linux" : platform === "win32" ? "windows" : "other";
  const pingPath =
    kind === "macos" ? firstThere(["/sbin/ping"]) : firstThere(["/bin/ping", "/usr/bin/ping", "/sbin/ping", "/usr/sbin/ping"]);
  const ipPath = kind === "linux" ? firstThere(["/usr/sbin/ip", "/sbin/ip", "/usr/bin/ip", "/bin/ip"]) : null;
  const avahiPath = kind === "linux" ? firstThere(["/usr/bin/avahi-browse", "/bin/avahi-browse"]) : null;
  const avahiResolve = kind === "linux" ? firstThere(["/usr/bin/avahi-resolve", "/bin/avahi-resolve"]) : null;
  const dnsSd = kind === "macos" ? firstThere(["/usr/bin/dns-sd"]) : null;

  // Whether ping works without special rights is only known by trying it: once, on loopback, which sends nothing onto the network.
  let pingWorks: Promise<boolean> | null = null;
  const pingUsable = () => {
    pingWorks ??= pingPath
      ? run(pingPath, pingArgs("127.0.0.1", 1000), { timeoutMs: 3000 }).then((result) => result.code === 0)
      : Promise.resolve(false);
    return pingWorks;
  };
  const pingArgs = (address: string, timeoutMs: number) =>
    // macOS: -W is the wait in milliseconds. Linux (iputils and BusyBox): -W is whole seconds.
    kind === "macos"
      ? ["-c", "1", "-n", "-q", "-W", String(timeoutMs), address]
      : ["-c", "1", "-n", "-q", "-W", String(Math.max(1, Math.round(timeoutMs / 1000))), address];

  return {
    os: kind,
    interfaces: () => os.networkInterfaces(),
    async abilities() {
      return {
        ping: await pingUsable(),
        neighbourTable:
          kind === "macos"
            ? "arp -an and ndp -an"
            : kind === "linux"
              ? ipPath
                ? "ip neigh show"
                : fs.existsSync("/proc/net/arp")
                  ? "/proc/net/arp (IPv4 only)"
                  : null
              : null,
        announcements: dnsSd ? "dns-sd (Bonjour)" : avahiPath ? "avahi-browse (Avahi)" : null,
        router: kind === "macos" ? "route -n get default" : kind === "linux" && fs.existsSync("/proc/net/route") ? "/proc/net/route" : null,
      };
    },
    async ping(address, timeoutMs) {
      if (!pingPath || !(await pingUsable()) || !net.isIPv4(address)) return null;
      const result = await run(pingPath, pingArgs(address, timeoutMs), { timeoutMs: timeoutMs + 1500 });
      return result.code === 0;
    },
    connect: (address, port, timeoutMs) => probePort(address, port, timeoutMs),
    async neighbours() {
      if (kind === "macos") {
        const [arp, ndp] = await Promise.all([
          run("/usr/sbin/arp", ["-an"], { timeoutMs: 5000 }),
          run("/usr/sbin/ndp", ["-an"], { timeoutMs: 5000 }),
        ]);
        return [...parseMacArp(arp.stdout), ...parseMacNdp(ndp.stdout)];
      }
      if (kind === "linux") {
        if (ipPath) return parseIpNeigh((await run(ipPath, ["neigh", "show"], { timeoutMs: 5000 })).stdout);
        try {
          return parseProcArp(await fs.promises.readFile("/proc/net/arp", "utf8"));
        } catch {
          return [];
        }
      }
      return [];
    },
    async routers() {
      if (kind === "macos") return parseMacRoute((await run("/sbin/route", ["-n", "get", "default"], { timeoutMs: 5000 })).stdout);
      if (kind === "linux") {
        try {
          return parseProcRoute(await fs.promises.readFile("/proc/net/route", "utf8"));
        } catch {
          return [];
        }
      }
      return [];
    },
    async reverseName(address, timeoutMs) {
      const answer = withTimeout(
        dns.promises.lookupService(address, 80).then((found) => found.hostname),
        timeoutMs,
        null as string | null,
      );
      const name = await answer;
      // With no name, the system gives the address back.
      return name && net.isIP(name.split("%")[0] ?? "") === 0 ? name.replace(/\.$/, "") : null;
    },
    async announcements(ms, signal) {
      if (avahiPath) {
        const result = await run(avahiPath, ["--all", "--resolve", "--parsable", "--terminate", "--no-db-lookup"], {
          timeoutMs: ms + 4000,
        });
        return parseAvahi(result.stdout);
      }
      if (!dnsSd) return [];
      // dns-sd keeps listening until stopped: what it printed by its time limit is used.
      const types = parseServiceTypes(
        (await run(dnsSd, ["-B", "_services._dns-sd._udp", "local."], { timeoutMs: Math.min(ms, 2000) })).stdout,
      ).slice(0, 40);
      if (signal.aborted) return [];
      const found: Announcement[] = [];
      const instances: Array<{ type: string; name: string }> = [];
      await inBatches(types, 6, async (type) => {
        const names = parseInstances((await run(dnsSd, ["-B", type, "local."], { timeoutMs: 1500 })).stdout, type);
        for (const name of names) instances.push({ type, name });
      });
      if (signal.aborted) return [];
      await inBatches(instances.slice(0, 80), 6, async ({ type, name }) => {
        const answer = (await run(dnsSd, ["-L", name, type, "local."], { timeoutMs: 1500 })).stdout;
        const where = /can be reached at (\S+?)\.?:(\d{1,5})(?:\s|$)/.exec(answer);
        found.push({ type, name, host: where ? where[1]!.toLowerCase() : null, address: null, port: where ? Number(where[2]) : null });
      });
      return found;
    },
    async lookup(host, timeoutMs) {
      const name = localName(host);
      if (!name) return [];
      // dns-sd keeps listening until stopped: what it printed by its time limit is used.
      if (dnsSd) return parseDnsSdAddresses((await run(dnsSd, ["-G", "v4v6", name], { timeoutMs })).stdout);
      if (avahiResolve) return parseAvahiResolve((await run(avahiResolve, ["-n", name], { timeoutMs })).stdout);
      return [];
    },
  };
}

async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}

// ── A made-up machine ───────────────────────────────────────────────────────

/**
 * A machine and its network described in a file, for tests (the end-to-end suite sets
 * OUTPOST_NETWORK_STAND_IN). Nothing is sent anywhere: every answer comes from the file.
 */
export interface StandIn {
  os?: "macos" | "linux";
  interfaces: InterfaceList;
  routers?: string[];
  /** Addresses that answer, and how. */
  responders?: Record<string, { ping?: boolean; ports?: number[]; mac?: string; name?: string; silent?: boolean }>;
  /** Entries in the neighbour table before any scan. */
  neighbours?: Neighbour[];
  announcements?: Announcement[];
  abilities?: Partial<NetworkAbilities>;
  /** Milliseconds each probe takes, to see progress. */
  delayMs?: number;
}

export function standInSystem(
  world: StandIn,
): NetworkSystem & { sent: Array<{ kind: "ping" | "connect"; address: string; port?: number; at: number }> } {
  const table = new Map<string, Neighbour>();
  for (const entry of world.neighbours ?? []) table.set(entry.address, entry);
  const link = Object.entries(world.interfaces).find(([, entries]) => entries?.some((entry) => !entry.internal))?.[0] ?? "eth0";
  const sent: Array<{ kind: "ping" | "connect"; address: string; port?: number; at: number }> = [];
  const pause = () => new Promise((resolve) => setTimeout(resolve, world.delayMs ?? 0));
  const abilities: NetworkAbilities = {
    ping: true,
    neighbourTable: "stand-in",
    announcements: "stand-in",
    router: "stand-in",
    ...world.abilities,
  };
  // A device that is there answers the link-level question that precedes any probe, so it lands in the table.
  const touched = (address: string) => {
    const responder = world.responders?.[address];
    if (responder?.mac) table.set(address, { address, mac: responder.mac, interface: link });
  };
  return {
    sent,
    os: world.os ?? "linux",
    interfaces: () => world.interfaces,
    abilities: async () => abilities,
    async ping(address) {
      if (!abilities.ping) return null;
      sent.push({ kind: "ping", address, at: Date.now() });
      await pause();
      touched(address);
      return world.responders?.[address]?.ping === true;
    },
    async connect(address, port) {
      sent.push({ kind: "connect", address, port, at: Date.now() });
      await pause();
      touched(address);
      const responder = world.responders?.[address];
      if (!responder || responder.silent) return "timeout";
      return responder.ports?.includes(port) ? "open" : "refused";
    },
    neighbours: async () => (abilities.neighbourTable ? [...table.values()] : []),
    routers: async () => world.routers ?? [],
    reverseName: async (address) => world.responders?.[address]?.name ?? null,
    announcements: async () => (abilities.announcements ? (world.announcements ?? []) : []),
    lookup: async (host) =>
      (world.announcements ?? []).filter((entry) => entry.host === host && entry.address).map((entry) => entry.address!),
  };
}
