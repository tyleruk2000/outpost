import type { JobDto } from "./common.ts";

/**
 * Devices on this network: what answers on the networks the computer running Outpost is
 * itself attached to. Discovery only; see docs/tools-qr-and-network.md for exactly what
 * a scan sends.
 */

/** The fixed limits of a scan. Stated on the screen as they are here. */
export const NETWORK_SCAN_LIMITS = {
  /** Probes started per second, at most. A ping is one packet out; a connection attempt is one. */
  packetsPerSecond: 20,
  /** Probes waiting for an answer at once, at most. */
  concurrent: 8,
  /** How long one probe waits for an answer. */
  timeoutMs: 1000,
  /** The largest network that is swept whole. A larger one is narrowed to the /24 this computer is in. */
  largestPrefix: 22,
  /** Ports a connection is attempted on, for an address that did not answer a ping, to find it at all. */
  ports: [80, 443] as const,
  /** How long announcements are listened for. */
  listenMs: 4000,
} as const;

export const NETWORK_TEXT_LIMITS = { label: 80, note: 2000 } as const;

/** A network this computer is on, and what a scan does with it. */
export interface NetworkSubnet {
  /** The interface's name, as the operating system gives it ("en0", "eth0", "wlan0"). */
  interface: string;
  family: 4 | 6;
  /** This computer's address on it. */
  address: string;
  /** The network as written in CIDR: "192.168.1.0/24". */
  cidr: string;
  kind: "private" | "unique-local" | "link-local";
  /**
   * `sweep`: every address in it is asked once. `narrowed`: too large to sweep, so only the /24 this
   * computer is in is swept (`swept` says which). `listen`: IPv6, far too large to sweep: only what the
   * computer already knows of and what announces itself is listed.
   */
  plan: "sweep" | "narrowed" | "listen";
  /** The range actually swept, when it differs from `cidr`. */
  swept: string | null;
  /** Addresses that will be asked. 0 for `listen`. */
  addresses: number;
  /** Why, in words, when the plan is not the whole network. */
  reason: string | null;
}

/** An interface address that is not scanned, with the reason. */
export interface NetworkSkipped {
  interface: string;
  address: string;
  reason: string;
}

/** What this computer can use to find things, with nothing asked for that needs special rights. */
export interface NetworkAbilities {
  /** The system's own ping is there and may be used without special rights. */
  ping: boolean;
  /** Where the list of neighbours (ARP and NDP) is read from, or null when it cannot be read. */
  neighbourTable: string | null;
  /** The program that lists announcements (Bonjour, mDNS), or null when there is none. */
  announcements: string | null;
  /** Where this computer's router is read from, or null. */
  router: string | null;
}

export type NetworkUnavailable =
  /** In a container, which sees only the container's own network. */
  | "container"
  /** Not macOS or Linux. */
  | "platform"
  /** Running from a portable drive, a guest on someone else's computer. */
  | "portable";

export interface NetworkAdvert {
  /** The kind of service as announced: "_smb._tcp". */
  type: string;
  /** In plain words: "File sharing". */
  label: string;
  /** The name it is announced under ("Workshop NAS"). */
  name: string;
  port: number | null;
}

export interface NetworkDevice {
  id: string;
  /** The name the person gave it, or "". */
  label: string;
  note: string;
  /** The name it gives itself, from announcements or a reverse lookup, or "". */
  name: string;
  /** Its addresses, IPv4 first. */
  addresses: string[];
  /** Its hardware address, when the neighbour table has it. */
  mac: string | null;
  /** The maker registered for the start of its hardware address, when the registry is here and it is listed. */
  maker: string | null;
  /** The hardware address is one the device made up (private Wi-Fi address), so it says nothing about the maker. */
  privateMac: boolean;
  services: NetworkAdvert[];
  /** A web page the device offers, for the person's browser to open. */
  webUrl: string | null;
  isSelf: boolean;
  isRouter: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Seen for the first time in the last scan, and there was a scan before it. */
  isNew: boolean;
  /** Seen before, and not in the last scan. */
  isGone: boolean;
}

export interface NetworkScanSummary {
  id: string;
  startedAt: number;
  finishedAt: number;
  /** The ranges swept and listened on. */
  subnets: string[];
  found: number;
  named: number;
  /** Probes sent: pings and connection attempts. Announcements listened to are not counted; nothing is sent for them but the system's own query. */
  packets: number;
  newDevices: number;
  goneDevices: number;
}

export interface NetworkMakers {
  /** The registry has been fetched and is here. */
  present: boolean;
  /** Prefixes in it. */
  entries: number;
  fetchedAt: number | null;
  /** Its size as fetched. */
  bytes: number | null;
  /** Where it is fetched from. */
  url: string;
}

export interface NetworkStatus {
  unavailable: NetworkUnavailable | null;
  os: "macos" | "linux" | "windows" | "other";
  abilities: NetworkAbilities;
  subnets: NetworkSubnet[];
  skipped: NetworkSkipped[];
  limits: typeof NETWORK_SCAN_LIMITS;
  lastScan: NetworkScanSummary | null;
  /** A scan queued or running, if any. */
  job: JobDto | null;
  devices: NetworkDevice[];
  makers: NetworkMakers;
  /** The registry being fetched, if it is. */
  makersJob: JobDto | null;
}

export interface NetworkDevicePatch {
  label?: string;
  note?: string;
}
