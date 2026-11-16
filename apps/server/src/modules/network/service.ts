/**
 * Devices on this network: running a scan as a job, keeping what it found, and the
 * names and notes a person gives devices.
 *
 * What is kept is the person's own (their names and notes) and what the network said
 * (names devices gave themselves, addresses, what they announce). Device names can be
 * people's names, so none of it is put in search, nothing is written to the log but
 * counts, and all of it goes with "erase everything".
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  NETWORK_SCAN_LIMITS,
  type NetworkDevice,
  type NetworkDevicePatch,
  type NetworkScanSummary,
  type NetworkStatus,
  type NetworkUnavailable,
} from "@outpost/shared";
import { desc, eq, inArray, notInArray } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, notFound } from "../../core/errors.ts";
import { createHttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { type JobRow, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { networkDevices, networkScans } from "../../db/schema.ts";
import { detectHost } from "../storage/shares/host.ts";
import { toAdvert } from "./announcements.ts";
import { createMakersStore, MAKERS_MAX_BYTES } from "./makers.ts";
import { type FoundDevice, runScan, type ScanLimits } from "./scan.ts";
import { planSubnets } from "./subnets.ts";
import { type NetworkSystem, realSystem, type StandIn, standInSystem } from "./system.ts";

export const SCAN_JOB = "network.scan";
export const MAKERS_JOB = "network.makers";
const QUEUE = "network";
const SUBJECT = "network";
const KEEP_SCANS = 20;

type DeviceRow = typeof networkDevices.$inferSelect;

/** "http://192.168.1.20:8080/": for the person's browser to open. Outpost never fetches it. */
export function webUrlOf(row: Pick<DeviceRow, "addresses" | "services" | "openPorts">): string | null {
  const v4 = row.addresses.find((address) => net.isIPv4(address));
  if (!v4) return null;
  const services = row.services as Array<{ type?: string; port?: number | null }>;
  const advertised = services.find((service) => service.type === "_http._tcp" || service.type === "_https._tcp");
  if (advertised) {
    const secure = advertised.type === "_https._tcp";
    const port = advertised.port ?? (secure ? 443 : 80);
    const standard = (secure && port === 443) || (!secure && port === 80);
    return `${secure ? "https" : "http"}://${v4}${standard ? "" : `:${port}`}/`;
  }
  if (row.openPorts.includes(80)) return `http://${v4}/`;
  if (row.openPorts.includes(443)) return `https://${v4}/`;
  return null;
}

const csvCell = (value: string) => {
  // A cell a spreadsheet would read as a formula is written as text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function devicesCsv(devices: NetworkDevice[]): string {
  const head = [
    "Your name",
    "Name",
    "Addresses",
    "Hardware address",
    "Maker",
    "Announces",
    "Web page",
    "This computer",
    "Router",
    "First seen",
    "Last seen",
    "Note",
  ];
  const iso = (ms: number) => new Date(ms).toISOString();
  const rows = devices.map((device) =>
    [
      device.label,
      device.name,
      device.addresses.join(" "),
      device.mac ?? "",
      device.maker ?? (device.privateMac ? "(private address)" : ""),
      [...new Set(device.services.map((service) => service.label))].join("; "),
      device.webUrl ?? "",
      device.isSelf ? "yes" : "",
      device.isRouter ? "yes" : "",
      iso(device.firstSeenAt),
      iso(device.lastSeenAt),
      device.note,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[head.join(","), ...rows].join("\r\n")}\r\n`;
}

export function createNetworkService(ctx: AppContext) {
  const { db, sqlite, config } = ctx;
  const makers = createMakersStore(path.join(config.dataDir, "network"));

  let system: NetworkSystem;
  let inContainer = detectHost().inContainer;
  let limits: ScanLimits | undefined;
  if (config.network.standIn) {
    system = standInSystem(JSON.parse(fs.readFileSync(config.network.standIn, "utf8")) as StandIn);
    inContainer = false;
    ctx.log.warn("devices on this network: using a made-up network from OUTPOST_NETWORK_STAND_IN; nothing is sent");
  } else system = realSystem();

  const unavailable = (): NetworkUnavailable | null => {
    if (config.portable) return "portable";
    if (inContainer && !config.network.hostNetwork) return "container";
    if (system.os !== "macos" && system.os !== "linux") return "platform";
    return null;
  };

  const activeJob = (): JobRow | undefined => ctx.jobs.list({ states: ["queued", "running", "paused"], types: [SCAN_JOB], limit: 5 })[0];
  const activeMakersJob = (): JobRow | undefined =>
    ctx.jobs.list({ states: ["queued", "running", "paused"], types: [MAKERS_JOB], limit: 5 })[0];

  const scans = () => db.select().from(networkScans).orderBy(desc(networkScans.finishedAt)).limit(2).all();

  function summary(row: typeof networkScans.$inferSelect | undefined): NetworkScanSummary | null {
    return row ? { ...row } : null;
  }

  function toDevice(row: DeviceRow, last: typeof networkScans.$inferSelect | undefined, hadEarlier: boolean): NetworkDevice {
    const privateMac = row.mac ? (Number.parseInt(row.mac.slice(0, 2), 16) & 2) === 2 : false;
    return {
      id: row.id,
      label: row.label,
      note: row.note,
      name: row.name,
      addresses: row.addresses,
      mac: row.mac,
      maker: row.mac && !privateMac ? makers.lookup(row.mac) : null,
      privateMac,
      services: row.services as unknown as NetworkDevice["services"],
      webUrl: webUrlOf(row),
      isSelf: row.isSelf,
      isRouter: row.isRouter,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      isNew: Boolean(last && hadEarlier && row.firstSeenAt >= last.startedAt),
      isGone: Boolean(last && row.lastSeenAt < last.startedAt),
    };
  }

  function devices(): NetworkDevice[] {
    const [last, earlier] = scans();
    const rows = db.select().from(networkDevices).all();
    const rank = (row: DeviceRow) => (row.isSelf ? 0 : row.isRouter ? 1 : 2);
    const first = (row: DeviceRow) => row.addresses[0] ?? "";
    return rows
      .sort((a, b) => rank(a) - rank(b) || first(a).localeCompare(first(b), "en", { numeric: true }))
      .map((row) => toDevice(row, last, earlier !== undefined));
  }

  /** Keeps what a scan found: new devices added, known ones brought up to date, the person's names and notes left alone. */
  function store(found: FoundDevice[], startedAt: number, finishedAt: number, subnets: string[], packets: number): NetworkScanSummary {
    const hadEarlier = scans().length > 0;
    return sqlite.transaction(() => {
      const seenKeys: string[] = [];
      let added = 0;
      for (const device of found) {
        const services = device.announcements.map(toAdvert) as unknown as Array<Record<string, unknown>>;
        let row = db.select().from(networkDevices).where(eq(networkDevices.key, device.key)).get();
        if (!row && device.mac) {
          // Known until now only by an address, without its hardware address: the same device, kept with its name and note.
          const byAddress = db
            .select()
            .from(networkDevices)
            .where(
              inArray(
                networkDevices.key,
                device.addresses.map((address) => `ip:${address}`),
              ),
            )
            .get();
          if (byAddress) row = byAddress;
        }
        if (row) {
          db.update(networkDevices)
            .set({
              key: device.key,
              mac: device.mac ?? row.mac,
              addresses: device.addresses,
              name: device.name || row.name,
              services: services.length > 0 ? services : row.services,
              openPorts: device.openPorts,
              isSelf: device.isSelf,
              isRouter: device.isRouter,
              lastSeenAt: finishedAt,
              updatedAt: finishedAt,
            })
            .where(eq(networkDevices.id, row.id))
            .run();
        } else {
          added += 1;
          db.insert(networkDevices)
            .values({
              id: newId(),
              key: device.key,
              mac: device.mac,
              addresses: device.addresses,
              name: device.name,
              services,
              openPorts: device.openPorts,
              isSelf: device.isSelf,
              isRouter: device.isRouter,
              firstSeenAt: hadEarlier ? finishedAt : startedAt,
              lastSeenAt: finishedAt,
              updatedAt: finishedAt,
            })
            .run();
        }
        seenKeys.push(device.key);
      }
      const gone =
        seenKeys.length > 0
          ? db.select({ id: networkDevices.id }).from(networkDevices).where(notInArray(networkDevices.key, seenKeys)).all().length
          : db.select({ id: networkDevices.id }).from(networkDevices).all().length;
      const row = {
        id: newId(),
        startedAt,
        finishedAt,
        subnets,
        found: found.length,
        named: found.filter((device) => device.name).length,
        packets,
        newDevices: hadEarlier ? added : 0,
        goneDevices: gone,
      };
      db.insert(networkScans).values(row).run();
      const keep = db.select({ id: networkScans.id }).from(networkScans).orderBy(desc(networkScans.finishedAt)).limit(KEEP_SCANS).all();
      db.delete(networkScans)
        .where(
          notInArray(
            networkScans.id,
            keep.map((scan) => scan.id),
          ),
        )
        .run();
      return row;
    })();
  }

  ctx.jobs.register<Record<string, never>>(SCAN_JOB, {
    queue: QUEUE,
    async run(run) {
      const why = unavailable();
      if (why) throw new PermanentJobError("This computer cannot scan its network from here.");
      const { subnets } = planSubnets(system.interfaces());
      if (subnets.length === 0) throw new PermanentJobError("This computer is not on a private network that Outpost can look at.");
      const startedAt = Date.now();
      const outcome = await runScan(system, subnets, {
        limits,
        signal: run.signal,
        onProgress: (progress) =>
          run.progress({
            current: progress.asked,
            total: progress.total,
            message:
              progress.phase === "asking"
                ? `Asked ${progress.asked} of ${progress.total} addresses; ${progress.found} answered`
                : progress.phase === "reading"
                  ? "Reading the neighbour table and the announcements heard"
                  : progress.phase === "naming"
                    ? "Looking up names"
                    : "Listening for announcements",
          }),
      });
      const finishedAt = Date.now();
      const scanned = subnets.map((subnet) => subnet.swept ?? subnet.cidr);
      const result = store(outcome.devices, startedAt, finishedAt, scanned, outcome.packets);
      // Counts only: names and addresses are not written to the log.
      run.log.info(
        { found: result.found, named: result.named, packets: result.packets, ms: finishedAt - startedAt },
        "network scan finished",
      );
      ctx.events.publish({ type: "network.changed" });
      return {
        message: `${result.found} found, ${result.named} with a name, ${result.packets} probes, in ${Math.round((finishedAt - startedAt) / 1000)} s`,
        ...result,
      };
    },
  });

  ctx.jobs.register<Record<string, never>>(MAKERS_JOB, {
    queue: QUEUE,
    async run(run) {
      const url = config.network.makersUrl;
      const http = createHttpClient({ allowPrivate: config.allowPrivateDownloads });
      try {
        run.progress({ message: "Fetching the IEEE's registry of hardware-address prefixes" });
        const { response } = await http.fetch(url, { signal: run.signal, allowedHosts: [new URL(url).hostname], everyHop: true });
        if (!response.ok) throw new PermanentJobError(`The IEEE's server answered ${response.status}. Try again later.`);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response.body ?? []) {
          size += chunk.byteLength;
          if (size > MAKERS_MAX_BYTES)
            throw new PermanentJobError("The file was far larger than the registry has ever been, so it was not kept.");
          chunks.push(Buffer.from(chunk));
          run.progress({ current: size, total: Number(response.headers.get("content-length")) || null });
        }
        let entries: number;
        try {
          entries = makers.replace(Buffer.concat(chunks));
        } catch {
          throw new PermanentJobError("What came back does not read as the IEEE's registry, so it was not kept.");
        }
        ctx.events.publish({ type: "network.changed" });
        return { message: `${entries.toLocaleString("en-GB")} prefixes`, entries, bytes: size };
      } finally {
        await http.close();
      }
    },
  });

  // A scan is started by a press and never by a restart: one left from before the server stopped is cancelled, not resumed.
  for (const job of ctx.jobs.list({ states: ["queued", "running", "paused"], types: [SCAN_JOB], limit: 20 })) {
    try {
      ctx.jobs.cancel(job.id);
    } catch {
      // Finished meanwhile.
    }
  }

  return {
    /** For tests: a made-up machine in place of this one, in a container or not. */
    useSystem(next: NetworkSystem, options: { inContainer?: boolean; limits?: ScanLimits } = {}) {
      system = next;
      inContainer = options.inContainer ?? false;
      limits = options.limits;
    },
    async status(): Promise<NetworkStatus> {
      const plan = planSubnets(system.interfaces());
      const job = activeJob();
      const [last] = scans();
      const info = makers.info();
      const makersJob = activeMakersJob();
      return {
        unavailable: unavailable(),
        os: system.os,
        abilities: await system.abilities(),
        subnets: plan.subnets,
        skipped: plan.skipped,
        limits: NETWORK_SCAN_LIMITS,
        lastScan: summary(last),
        job: job ? toJobDto(job) : null,
        devices: devices(),
        makers: { ...info, url: config.network.makersUrl },
        makersJob: makersJob ? toJobDto(makersJob) : null,
      };
    },
    startScan() {
      const why = unavailable();
      if (why === "container")
        throw new AppError(
          "unsupported",
          "Outpost is running in a container, which sees only the container's own network, not your home's. Run it with host networking to scan your network.",
        );
      if (why) throw new AppError("unsupported", "Scanning the network is not available where Outpost is running now.");
      if (activeJob()) throw conflict("A scan is already under way. Wait for it to finish, or stop it.");
      if (planSubnets(system.interfaces()).subnets.length === 0)
        throw new AppError("unsupported", "This computer is not on a private network that Outpost can look at.");
      return ctx.jobs.enqueue(SCAN_JOB, {}, { title: "Look for devices on this network", subject: SUBJECT, maxAttempts: 1 });
    },
    fetchMakers() {
      if (activeMakersJob()) throw conflict("The registry is already being fetched.");
      return ctx.jobs.enqueue(MAKERS_JOB, {}, { title: "Fetch the IEEE's registry of device makers", subject: SUBJECT, maxAttempts: 1 });
    },
    removeMakers() {
      makers.remove();
      ctx.events.publish({ type: "network.changed" });
    },
    update(id: string, patch: NetworkDevicePatch): NetworkDevice {
      const row = db.select().from(networkDevices).where(eq(networkDevices.id, id)).get();
      if (!row) throw notFound("That device");
      db.update(networkDevices)
        .set({
          ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          updatedAt: Date.now(),
        })
        .where(eq(networkDevices.id, id))
        .run();
      ctx.events.publish({ type: "network.changed" });
      return devices().find((device) => device.id === id)!;
    },
    forget(id: string) {
      const removed = db.delete(networkDevices).where(eq(networkDevices.id, id)).run().changes;
      if (removed === 0) throw notFound("That device");
      ctx.events.publish({ type: "network.changed" });
    },
    devices,
    csv: () => devicesCsv(devices()),
    /** Devices remembered, for "Manage and clean up" and the Storage screen. */
    count: () => db.select({ id: networkDevices.id }).from(networkDevices).all().length,
    /** Everything this feature keeps: the devices, their names and notes, and the record of scans. */
    eraseAll(): number {
      const removed = sqlite.transaction(() => {
        const count = db.delete(networkDevices).run().changes;
        db.delete(networkScans).run();
        return count;
      })();
      ctx.events.publish({ type: "network.changed" });
      return removed;
    },
  };
}

export type NetworkService = ReturnType<typeof createNetworkService>;
