/**
 * Devices on this network: the scan and what is kept of it. Every scan here runs against
 * a made-up machine (`fixtures/network/stand-in.ts`): nothing is sent onto any network.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { CleanupPlan, CleanupResult, NetworkStatus } from "@outpost/shared";
import { NETWORK_SCAN_LIMITS } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createPacer, runScan, type ScanLimits } from "../src/modules/network/scan.ts";
import { webUrlOf } from "../src/modules/network/service.ts";
import { planSubnets } from "../src/modules/network/subnets.ts";
import { localName, parseAvahiResolve, parseDnsSdAddresses, realSystem, standInSystem } from "../src/modules/network/system.ts";
import { standInWorld } from "./fixtures/network/stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const FAST: ScanLimits = { packetsPerSecond: 5000, concurrent: 8, timeoutMs: 10, ports: [80, 443], listenMs: 10 };

describe("a scan", () => {
  it("finds what answers by ping, by a connection, and only at the link level, and marks this computer and the router", async () => {
    const system = standInSystem(standInWorld());
    const { subnets } = planSubnets(system.interfaces());
    const outcome = await runScan(system, subnets, { limits: FAST, signal: new AbortController().signal });

    const byAddress = (address: string) => outcome.devices.find((device) => device.addresses.includes(address));
    expect(byAddress("192.168.77.1")).toMatchObject({
      isRouter: true,
      isSelf: false,
      mac: "00:1b:2c:00:00:01",
      addresses: ["192.168.77.1", "fe80::1"],
      name: "router.home",
      openPorts: [],
    });
    expect(byAddress("fe80::77")).toBeUndefined();
    expect(outcome.devices.filter((device) => device.isSelf)).toHaveLength(1);
    // Answered a connection attempt (refused counts: something is there), announced itself, and has an IPv6 neighbour entry.
    expect(byAddress("192.168.77.12")).toMatchObject({
      key: "mac:00:1b:2c:00:00:12",
      name: "shed-nas",
      addresses: ["192.168.77.12", "fe80::12"],
    });
    expect(byAddress("192.168.77.12")?.announcements.map((entry) => entry.type)).toEqual(["_smb._tcp", "_http._tcp"]);
    // Ignored everything but the computer's own "who has this address?".
    expect(byAddress("192.168.77.30")).toMatchObject({ mac: "00:5e:6f:00:00:30", name: "hall-printer" });
    expect(byAddress("192.168.77.44")).toMatchObject({ privateMac: true, name: "garden-pi.home" });
    expect(byAddress("192.168.77.5")).toMatchObject({ isSelf: true });
    // Nothing from elsewhere.
    expect(byAddress("10.9.9.9")).toBeUndefined();
    expect(byAddress("10.9.9.10")).toBeUndefined();
    expect(outcome.devices).toHaveLength(5);

    // 253 pings; one connection for the device that refused one; two for every address that did not answer at all.
    expect(outcome.addressesAsked).toBe(253);
    expect(outcome.packets).toBe(253 + 1 + 2 * 250);
    expect(system.sent.length).toBe(outcome.packets);
    // Only the fixed list of ports is ever tried.
    expect(new Set(system.sent.filter((entry) => entry.kind === "connect").map((entry) => entry.port))).toEqual(new Set([80, 443]));
    // Nothing outside the swept network is probed.
    expect(system.sent.every((entry) => entry.address.startsWith("192.168.77."))).toBe(true);
  });

  it("resolves announced names only by multicast, never a name a device chose under someone else's domain", async () => {
    const world = standInWorld();
    const long = `kitchen-${"x".repeat(300)}`;
    world.announcements = [
      // A name under a domain the device controls: a query for it would leave the network.
      { type: "_http._tcp", name: "Tracker", host: "beacon.attacker.example", address: null, port: 80 },
      { type: "_http._tcp", name: "Trailing dot", host: "beacon.attacker.example.", address: null, port: 80 },
      { type: "_http._tcp", name: "Not quite local", host: "evil.local.attacker.example", address: null, port: 80 },
      // An address in the announcement itself, outside the network looked at.
      { type: "_http._tcp", name: "Elsewhere", host: null, address: "8.8.8.8", port: 80 },
      { type: "_ipp._tcp", name: "Printer", host: "8.8.4.4", address: null, port: 631 },
      // Names on screen: control characters, markup and length.
      { type: "_ipp._tcp", name: "Hall\u0007 <b>printer</b>\n", host: null, address: "192.168.77.30", port: 631 },
      { type: "_http._tcp", name: "Long", host: `${long}.local`, address: "192.168.77.44", port: 80 },
    ];
    const system = standInSystem(world);
    const asked: string[] = [];
    const lookup = system.lookup;
    system.lookup = async (host, timeoutMs) => {
      asked.push(host);
      return lookup(host, timeoutMs);
    };
    const reversed: string[] = [];
    const reverseName = system.reverseName;
    system.reverseName = async (address, timeoutMs) => {
      reversed.push(address);
      return reverseName(address, timeoutMs);
    };
    const { subnets } = planSubnets(system.interfaces());
    const outcome = await runScan(system, subnets, { limits: FAST, signal: new AbortController().signal });

    expect(
      asked.every((host) => /\.local$/.test(host)),
      asked.join(", "),
    ).toBe(true);
    expect(outcome.devices.flatMap((device) => device.addresses).some((address) => address.startsWith("8.8."))).toBe(false);
    expect(reversed.every((address) => address.startsWith("192.168.77."))).toBe(true);
    const printer = outcome.devices.find((device) => device.addresses.includes("192.168.77.30"))!;
    const pi = outcome.devices.find((device) => device.addresses.includes("192.168.77.44"))!;
    expect(pi.name.length).toBeLessThanOrEqual(80);
    const { toAdvert } = await import("../src/modules/network/announcements.ts");
    const advert = toAdvert(printer.announcements.find((entry) => entry.name.startsWith("Hall"))!);
    // Kept as text: the markup is shown as written, without the control characters.
    expect(advert.name).toBe("Hall <b>printer</b>");
  });

  it("asks multicast DNS, and only about .local names, on the real machine", async () => {
    expect(["nas.local", "NAS.local.", "my-pi.home.local"].map(localName)).toEqual(["nas.local", "nas.local", "my-pi.home.local"]);
    for (const hostile of [
      "beacon.attacker.example",
      "local",
      "8.8.8.8",
      "evil.local.example",
      "a b.local",
      "<b>x</b>.local",
      "x\u0007.local",
      "",
    ]) {
      expect(localName(hostile), hostile).toBeNull();
    }
    expect(
      parseDnsSdAddresses(
        "DATE: ---Mon 16 Nov 2026---\n 9:00:00.000  ...STARTING...\nTimestamp     A/R  Flags         IF  Hostname   Address   TTL\n 9:00:00.001  Add  40000002      14  nas.local.   192.168.1.20   120\n 9:00:00.002  Add  40000002      14  nas.local.   FE80:0:0:0:1:2:3:4%en0   120\n",
      ),
    ).toEqual(["192.168.1.20", "fe80:0:0:0:1:2:3:4"]);
    expect(parseAvahiResolve("nas.local\t192.168.1.20\n")).toEqual(["192.168.1.20"]);
    // Whatever the platform, a name that is not .local is never handed to anything.
    const ran: string[][] = [];
    for (const platform of ["darwin", "linux"] as const) {
      const system = realSystem(async (file, args) => {
        ran.push([file, ...args]);
        return { code: 0, stdout: "", stderr: "" } as never;
      }, platform);
      expect(await system.lookup("beacon.attacker.example", 100)).toEqual([]);
      expect(await system.lookup("8.8.8.8", 100)).toEqual([]);
    }
    expect(ran).toEqual([]);
  });

  it("uses connection attempts alone where ping cannot be used, and says so by sending none", async () => {
    const system = standInSystem(standInWorld({ abilities: { ping: false } }));
    const { subnets } = planSubnets(system.interfaces());
    const outcome = await runScan(system, subnets, { limits: FAST, signal: new AbortController().signal });
    expect(system.sent.some((entry) => entry.kind === "ping")).toBe(false);
    expect(outcome.devices.some((device) => device.addresses.includes("192.168.77.44"))).toBe(true);
  });

  it("keeps to its caps: probes a second, and probes waiting at once", async () => {
    const world = standInWorld({
      interfaces: {
        eth0: [
          {
            address: "192.168.77.5",
            netmask: "255.255.255.240",
            family: "IPv4",
            mac: "02:00:5e:00:00:05",
            internal: false,
            cidr: "192.168.77.5/28",
          },
        ],
      },
      delayMs: 25,
    });
    const system = standInSystem(world);
    let waiting = 0;
    let most = 0;
    const counted = {
      ...system,
      async ping(address: string, timeoutMs: number) {
        waiting += 1;
        most = Math.max(most, waiting);
        try {
          return await system.ping(address, timeoutMs);
        } finally {
          waiting -= 1;
        }
      },
      async connect(address: string, port: number, timeoutMs: number) {
        waiting += 1;
        most = Math.max(most, waiting);
        try {
          return await system.connect(address, port, timeoutMs);
        } finally {
          waiting -= 1;
        }
      },
    };
    const { subnets } = planSubnets(world.interfaces);
    const limits: ScanLimits = { ...FAST, packetsPerSecond: 100, concurrent: 3 };
    const started = Date.now();
    await runScan(counted, subnets, { limits, signal: new AbortController().signal });
    const times = system.sent.map((entry) => entry.at).sort((a, b) => a - b);
    expect(most).toBeLessThanOrEqual(3);
    // 100 a second: over the whole scan, no faster than that (timers may fire a millisecond or two early or late, one at a time).
    expect(times.at(-1)! - times[0]!).toBeGreaterThanOrEqual((times.length - 1) * 10 - 5);
    for (let i = 1; i < times.length; i += 1) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(5);
    expect(Date.now() - started).toBeGreaterThanOrEqual((times.length - 1) * 9);
  });

  it("does not send a burst after the computer has been too busy to keep time", async () => {
    // Four probes are planned 20 ms apart; the thread is then held for 150 ms, so every timer is overdue at once.
    const paced = createPacer({ perSecond: 50, concurrent: 4 }, new AbortController().signal);
    const starts: number[] = [];
    const all = Promise.all([1, 2, 3, 4].map(() => paced(async () => void starts.push(Date.now()))));
    const until = Date.now() + 150;
    while (Date.now() < until) {
      // Busy on purpose: nothing else can run.
    }
    await all;
    starts.sort((a, b) => a - b);
    expect(starts).toHaveLength(4);
    // 20 ms between starts, give or take the millisecond or two a timer may be early.
    for (let i = 1; i < starts.length; i += 1) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(17);
  });

  it("stops sending when stopped, and keeps nothing", async () => {
    const system = standInSystem(standInWorld({ delayMs: 5 }));
    const { subnets } = planSubnets(system.interfaces());
    const controller = new AbortController();
    const running = runScan(system, subnets, { limits: { ...FAST, packetsPerSecond: 200 }, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 60));
    controller.abort(new Error("cancelled"));
    await expect(running).rejects.toThrow("cancelled");
    const sentWhenStopped = system.sent.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(system.sent.length).toBe(sentWhenStopped);
    expect(sentWhenStopped).toBeLessThan(100);
  });

  it("states its limits as the documentation does", () => {
    expect(NETWORK_SCAN_LIMITS).toMatchObject({ packetsPerSecond: 20, concurrent: 8, largestPrefix: 22, ports: [80, 443] });
  });
});

describe("a device's web page", () => {
  it("is what it announces, else a port of the fixed list that accepted a connection", () => {
    expect(webUrlOf({ addresses: ["192.168.77.12"], services: [{ type: "_http._tcp", port: 5000 }], openPorts: [] })).toBe(
      "http://192.168.77.12:5000/",
    );
    expect(webUrlOf({ addresses: ["192.168.77.1"], services: [], openPorts: [80] })).toBe("http://192.168.77.1/");
    expect(webUrlOf({ addresses: ["192.168.77.1"], services: [], openPorts: [443] })).toBe("https://192.168.77.1/");
    expect(webUrlOf({ addresses: ["fe80::1"], services: [], openPorts: [80] })).toBeNull();
  });
});

describe("the Devices screen's server", () => {
  let app: TestApp;
  let fixture: http.Server | undefined;
  afterEach(async () => {
    await app?.close();
    await new Promise((resolve) => (fixture ? fixture.close(resolve) : resolve(undefined)));
    fixture = undefined;
  });

  async function scan(): Promise<NetworkStatus> {
    const started = await app.api("POST", "/api/network/scan");
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(started.body.job.id)?.state).toBe("succeeded");
    return (await app.api<NetworkStatus>("GET", "/api/network")).body;
  }

  it("scans as a job, keeps what it found, and says what is new and what has gone since last time", async () => {
    app = await createTestApp();
    const world = standInWorld();
    app.ctx.services.network.useSystem(standInSystem(world), { limits: FAST });

    const before = (await app.api<NetworkStatus>("GET", "/api/network")).body;
    expect(before).toMatchObject({ unavailable: null, devices: [], lastScan: null, job: null });
    expect(before.subnets.map((subnet) => subnet.cidr)).toEqual(["192.168.77.0/24", "fe80::/64"]);

    const first = await scan();
    expect(first.devices).toHaveLength(5);
    expect(first.devices[0]).toMatchObject({ isSelf: true });
    // It answered a ping, so no connection was tried, and it announces no web page: no link is guessed.
    expect(first.devices[1]).toMatchObject({ isRouter: true, webUrl: null });
    expect(first.devices.every((device) => !device.isNew && !device.isGone)).toBe(true);
    expect(first.lastScan).toMatchObject({ found: 5, packets: 754, subnets: ["192.168.77.0/24", "fe80::/64"] });
    const nas = first.devices.find((device) => device.name === "shed-nas")!;
    expect(nas.services.map((service) => service.label)).toEqual(["File sharing", "Web page"]);
    expect(nas.webUrl).toBe("http://192.168.77.12:5000/");

    // The person names it; the next scan leaves the name alone.
    const named = await app.api("PATCH", `/api/network/devices/${nas.id}`, { label: "  Shed NAS  ", note: "Behind the paint tins." });
    expect(named.body.device).toMatchObject({ label: "Shed NAS", note: "Behind the paint tins." });

    // Next time: the Pi is off, and a new phone has arrived.
    const { "192.168.77.44": _pi, ...rest } = world.responders!;
    app.ctx.services.network.useSystem(
      standInSystem({ ...world, responders: { ...rest, "192.168.77.60": { ping: true, mac: "da:00:00:00:00:60" } } }),
      { limits: FAST },
    );
    const second = await scan();
    expect(second.devices.find((device) => device.addresses.includes("192.168.77.60"))).toMatchObject({ isNew: true, privateMac: true });
    expect(second.devices.find((device) => device.name === "garden-pi.home")).toMatchObject({ isGone: true, isNew: false });
    expect(second.devices.find((device) => device.id === nas.id)).toMatchObject({ label: "Shed NAS", isNew: false, isGone: false });
    expect(second.lastScan).toMatchObject({ newDevices: 1, goneDevices: 1 });

    const csv = await app.api("GET", "/api/network/devices.csv");
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(String(csv.headers["cache-control"])).toBe("no-store");
    expect(csv.body as unknown as string).toContain("Shed NAS,shed-nas,192.168.77.12 fe80::12,00:1b:2c:00:00:12,");

    // Forgetting one, and the rest.
    expect((await app.api("DELETE", `/api/network/devices/${nas.id}`)).status).toBe(200);
    expect((await app.api("DELETE", `/api/network/devices/${nas.id}`)).status).toBe(404);
    expect((await app.api("DELETE", "/api/network/devices")).body.removed).toBe(5);
  });

  it("runs one scan at a time, takes no range from the request, and can be stopped", async () => {
    app = await createTestApp();
    app.ctx.services.network.useSystem(standInSystem(standInWorld({ delayMs: 20 })), { limits: { ...FAST, packetsPerSecond: 50 } });
    const first = await app.api("POST", "/api/network/scan", { range: "10.0.0.0/8" });
    expect(first.status).toBe(200);
    const second = await app.api("POST", "/api/network/scan");
    expect(second.status).toBe(409);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await app.api("POST", `/api/jobs/${first.body.job.id}/cancel`)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(first.body.job.id)?.state).toBe("cancelled");
    const after = (await app.api<NetworkStatus>("GET", "/api/network")).body;
    expect(after).toMatchObject({ devices: [], lastScan: null, job: null });
  });

  it("lets every device start a scan unless the administrator set it to the computer Outpost runs on", async () => {
    const phone = { remoteAddress: "192.168.1.20" };
    const lan = { OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" };

    // The default: open to the phone, as before.
    app = await createTestApp(lan);
    app.ctx.services.network.useSystem(standInSystem(standInWorld()), { limits: FAST });
    expect((await app.api<NetworkStatus>("GET", "/api/network", undefined, phone)).body.scanRight).toEqual({
      allowed: true,
      reason: "open",
    });
    const open = await app.api("POST", "/api/network/scan", undefined, phone);
    expect(open.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    await app.close();

    app = await createTestApp({ ...lan, OUTPOST_NETWORK_SCAN_LOCAL_ONLY: "true", OUTPOST_ALLOW_REMOTE_ERASE: "true" });
    app.ctx.services.network.useSystem(standInSystem(standInWorld()), { limits: FAST });
    expect((await app.api<NetworkStatus>("GET", "/api/network", undefined, phone)).body.scanRight).toEqual({
      allowed: false,
      reason: "remote",
    });
    const refused = await app.api("POST", "/api/network/scan", undefined, phone);
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/OUTPOST_NETWORK_SCAN_LOCAL_ONLY=true/);
    // A proxy's forwarded request is not this computer's.
    expect((await app.api("POST", "/api/network/scan", undefined, { headers: { "x-forwarded-for": "192.168.1.20" } })).status).toBe(403);
    // The computer itself still may; the list stays readable everywhere.
    expect((await app.api<NetworkStatus>("GET", "/api/network")).body.scanRight).toEqual({ allowed: true, reason: "local" });
    expect((await app.api("POST", "/api/network/scan")).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect((await app.api<NetworkStatus>("GET", "/api/network", undefined, phone)).body.devices).toHaveLength(5);
  });

  it("in a container, says so and does not scan", async () => {
    app = await createTestApp();
    app.ctx.services.network.useSystem(standInSystem(standInWorld()), { inContainer: true });
    expect((await app.api<NetworkStatus>("GET", "/api/network")).body.unavailable).toBe("container");
    const refused = await app.api("POST", "/api/network/scan");
    expect(refused.status).toBe(415);
    expect(refused.body.error.message).toMatch(/host networking/);
  });

  it("is counted among a person's own things, in the database's contents, and erased with everything else", async () => {
    app = await createTestApp();
    app.ctx.services.network.useSystem(standInSystem(standInWorld()), { limits: FAST });
    await scan();
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.networkDevices).toBe(5);
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.networkDevices).toBe(5);
    const count = (table: string) => (app.ctx.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count("network_devices")).toBe(0);
    expect(count("network_scans")).toBe(0);
  });

  it("fetches the makers' registry only when asked, from the address set, and shows makers from it", async () => {
    const rows = ["Registry,Assignment,Organization Name,Organization Address", 'MA-L,001B2C,"Example Makers, Ltd.",Somewhere'];
    for (let i = 0; i < 1200; i += 1) rows.push(`MA-L,${(0xa00000 + i).toString(16).toUpperCase()},Filler ${i},Nowhere`);
    let asked = 0;
    fixture = http.createServer((_request, response) => {
      asked += 1;
      response.end(rows.join("\r\n"));
    });
    await new Promise<void>((resolve) => fixture!.listen(0, "127.0.0.1", resolve));
    const port = (fixture.address() as AddressInfo).port;
    app = await createTestApp({ OUTPOST_IEEE_OUI_URL: `http://127.0.0.1:${port}/oui/oui.csv` });
    app.ctx.services.network.useSystem(standInSystem(standInWorld()), { limits: FAST });
    await scan();
    expect(asked).toBe(0);
    let status = (await app.api<NetworkStatus>("GET", "/api/network")).body;
    expect(status.makers).toMatchObject({ present: false, url: `http://127.0.0.1:${port}/oui/oui.csv` });
    expect(status.devices.every((device) => device.maker === null)).toBe(true);

    const fetched = await app.api("POST", "/api/network/makers");
    expect(fetched.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(asked).toBe(1);
    status = (await app.api<NetworkStatus>("GET", "/api/network")).body;
    expect(status.makers).toMatchObject({ present: true, entries: 1201 });
    expect(status.devices.find((device) => device.mac === "00:1b:2c:00:00:12")?.maker).toBe("Example Makers, Ltd.");
    // A made-up hardware address has no maker, whatever the registry says.
    expect(status.devices.find((device) => device.privateMac)?.maker).toBeNull();

    await app.api("DELETE", "/api/network/makers");
    status = (await app.api<NetworkStatus>("GET", "/api/network")).body;
    expect(status.makers.present).toBe(false);
  });

  it("says why the registry could not be fetched, until a fetch works", async () => {
    // Nothing listens here: the fetch is refused, as it is with no network.
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    app = await createTestApp({ OUTPOST_IEEE_OUI_URL: `http://127.0.0.1:${port}/oui/oui.csv` });
    app.ctx.services.network.useSystem(standInSystem(standInWorld()), { limits: FAST });
    expect((await app.api<NetworkStatus>("GET", "/api/network")).body.makersFailed).toBeNull();
    await app.api("POST", "/api/network/makers");
    await app.ctx.jobs.whenIdle();
    const status = (await app.api<NetworkStatus>("GET", "/api/network")).body;
    expect(status.makersJob).toBeNull();
    expect(status.makersFailed).toMatch(/could not be reached: this computer has no internet connection/);
    expect(status.makersFailed).not.toMatch(/fetch failed/);
  });
});
