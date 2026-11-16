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
 *    the computer it runs on and from other devices are carried in by the engine's port
 *    publishing (or a user-land proxy, which connects from the bridge's gateway, or
 *    from inside the container's own network namespace, as Podman's rootless network
 *    can). Nothing in any engine's documentation promises which, so in a container the
 *    rule is not used at all: only loopback (and LAN access off) count. What is taken
 *    as a sign of a container is in `containerReason`.
 *  - A set-up where something on this computer forwards connections without adding a
 *    forwarding header. Whoever starts Outpost can turn the rule off for that:
 *    OUTPOST_OWN_ADDRESS_IS_LOCAL=false.
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
import type { LocalBy } from "@outpost/shared";

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

/** The files `containerReason` looks at; tests give a made-up file system. */
export interface FileProbe {
  exists(file: string): boolean;
  /** The file's text, or null when it cannot be read. */
  read(file: string): string | null;
}

const realFiles: FileProbe = {
  exists: (file) => fs.existsSync(file),
  read: (file) => {
    try {
      return fs.readFileSync(file, "utf8").slice(0, 256 * 1024);
    } catch {
      return null;
    }
  },
};

/** Control-group paths that container engines and Kubernetes give their containers (cgroup v1, and v2 where the path is visible). */
const CONTAINER_CGROUP =
  /(?:^|[/:])(?:docker|kubepods|containerd|libpod|lxc|garden|buildkit)(?:[-/.]|$)|\/docker-[0-9a-f]{12,}\.scope|\/libpod-[0-9a-f]{12,}\.scope|\/crio-[0-9a-f]{12,}\.scope/m;
/** Root file systems that live in a container engine's own storage. */
const CONTAINER_ROOT = /\/var\/lib\/(?:docker|containers\/storage|containerd|kubelet|rancher|lxc|lxd)\//;

/**
 * Why Outpost thinks it runs in a container, or null. Each sign is what an engine
 * documents, or has made for years, for programs inside to find:
 *
 *  - `OUTPOST_IN_CONTAINER`: set by this repository's Dockerfile and Compose file.
 *  - `/.dockerenv`: the file Docker puts at the root of every container it starts
 *    (long-standing; Docker's documentation does not promise it).
 *  - `/run/.containerenv`: the file Podman puts in every container (podman-run(1):
 *    "Podman … creates /run/.containerenv in the container"), also made by Buildah.
 *  - The `container` variable: systemd's Container Interface asks every container
 *    manager to set it ("container=docker", "podman", "lxc", "systemd-nspawn"…;
 *    systemd.io/CONTAINER_INTERFACE), and Podman sets it for the program it runs.
 *  - `KUBERNETES_SERVICE_HOST`: Kubernetes gives every container in a pod the address
 *    of the cluster's API service this way ("Services: Environment variables" in the
 *    Kubernetes documentation), whatever runtime it uses.
 *  - A control group under a container engine's or Kubernetes's own path in
 *    `/proc/self/cgroup` (cgroups(7); "docker", "kubepods", "libpod-…", "lxc").
 *  - A root file system that is kept in an engine's own storage (`/var/lib/docker/`,
 *    `/var/lib/containers/storage/`, …) as `/proc/self/mountinfo` shows it
 *    (proc_pid_mountinfo(5)). An overlay root alone is not taken as a sign: Raspberry
 *    Pi OS makes one for its read-only mode.
 *
 * Mistaking a computer for a container only takes away the own-address rule, so a
 * browser there has to use localhost. Missing a container could give every device on
 * the network the computer's rights, so any one sign is enough.
 */
export function containerReason(env: NodeJS.ProcessEnv = process.env, files: FileProbe = realFiles): string | null {
  if (truthy(env.OUTPOST_IN_CONTAINER)) return "OUTPOST_IN_CONTAINER is set";
  if (env.container) return `container=${env.container.slice(0, 40)} is set`;
  if (env.KUBERNETES_SERVICE_HOST) return "KUBERNETES_SERVICE_HOST is set (Kubernetes)";
  if (files.exists("/.dockerenv")) return "/.dockerenv is there (Docker)";
  if (files.exists("/run/.containerenv")) return "/run/.containerenv is there (Podman)";
  const cgroup = files.read("/proc/self/cgroup");
  if (cgroup && CONTAINER_CGROUP.test(cgroup)) return "its control group is a container's (/proc/self/cgroup)";
  const mounts = files.read("/proc/self/mountinfo");
  const root = mounts?.split("\n").find((line) => line.split(" ")[4] === "/");
  if (root && CONTAINER_ROOT.test(root)) return "its root file system is a container engine's mount (/proc/self/mountinfo)";
  return null;
}

/** The computer Outpost runs on. */
export function thisMachine(
  env: NodeJS.ProcessEnv = process.env,
  read: () => Interfaces = () => os.networkInterfaces(),
  now: () => number = Date.now,
  files: FileProbe = realFiles,
): Machine {
  const inContainer = containerReason(env, files) !== null;
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

/** What decides whether a request is this computer's: LAN access, and whether the own-address rule is on. */
export interface LocalConfig {
  lanAccess: boolean;
  /** OUTPOST_OWN_ADDRESS_IS_LOCAL; on unless turned off. */
  ownAddressIsLocal?: boolean;
}

/**
 * Which rule made a request this computer's, so that a screen can say so and a wrong
 * answer is seen: the loopback address it came from, this computer's own network
 * address, or LAN access being off. Null for any other device.
 */

export function localBy(request: RequestOrigin, config: LocalConfig, on: Machine = defaultMachine()): LocalBy | null {
  if (FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined)) return null;
  const address = request.socket.remoteAddress;
  if (address && isLoopbackAddress(address)) return { rule: "loopback", address: plain(address) };
  if (!config.lanAccess) return { rule: "not-on-network", address: null };
  if (config.ownAddressIsLocal === false || !address) return null;
  return isOwnAddress(address, on) ? { rule: "own-address", address: plain(address) } : null;
}

export function isLocalRequest(request: RequestOrigin, config: LocalConfig, on: Machine = defaultMachine()): boolean {
  return localBy(request, config, on) !== null;
}
