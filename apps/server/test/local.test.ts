import http from "node:http";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { isLocalRequest, isOwnAddress, type Machine, ownAddresses, thisMachine } from "../src/core/local.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

type Interfaces = ReturnType<typeof os.networkInterfaces>;
const v4 = (address: string, internal = false) => ({
  address,
  netmask: "255.255.255.0",
  family: "IPv4" as const,
  mac: "16:aa:41:21:1a:0f",
  internal,
  cidr: `${address}/24`,
});
const v6 = (address: string, scopeid = 0, internal = false) => ({
  address,
  netmask: "ffff:ffff:ffff:ffff::",
  family: "IPv6" as const,
  mac: "16:aa:41:21:1a:0f",
  internal,
  cidr: `${address}/64`,
  scopeid,
});

/** A Mac on a home network, much as `os.networkInterfaces()` describes one. */
const mac: Interfaces = {
  lo0: [v4("127.0.0.1", true), v6("::1", 0, true), v6("fe80::1", 1, true)],
  en0: [v6("fe80::186c:227e:2659:2740", 14), v6("fd00::144c:54d1:a89a:b0b0"), v4("192.168.1.232"), v6("2001:db8:82b6:e600::1b8c")],
  utun0: [v6("fe80::1ee2:2c66:dd7b:de10", 16)],
  bridge100: [v4("169.254.10.1")],
};

const machine = (interfaces: Interfaces, inContainer = false): Machine => ({
  inContainer,
  addresses: () => ownAddresses(interfaces),
});
const from = (remoteAddress: string | undefined, headers: Record<string, string> = {}) => ({ socket: { remoteAddress }, headers });
const lan = { lanAccess: true };

describe("this computer's own addresses count as this computer", () => {
  it("lists every address but loopback and link-local", () => {
    expect([...ownAddresses(mac)].sort()).toEqual(["192.168.1.232", "2001:db8:82b6:e600::1b8c", "fd00::144c:54d1:a89a:b0b0"]);
    expect(ownAddresses({})).toEqual(new Set());
    expect(ownAddresses({ en0: [v6("2001:DB8::AB")] })).toEqual(new Set(["2001:db8::ab"]));
  });

  it("treats a connection from one of them as local, written however the socket writes it", () => {
    const here = machine(mac);
    for (const address of [
      "192.168.1.232",
      "::ffff:192.168.1.232",
      "fd00::144c:54d1:a89a:b0b0",
      "2001:DB8:82B6:E600::1B8C",
      "127.0.0.1",
      "::1",
    ]) {
      expect(isLocalRequest(from(address), lan, here), address).toBe(true);
    }
  });

  it("does not treat another device as local, nor a link-local address this computer happens to share", () => {
    const here = machine(mac);
    for (const address of [
      "192.168.1.20",
      "192.168.1.233",
      "::ffff:192.168.1.20",
      "fd00::1",
      // macOS gives lo0 fe80::1, and so do many routers: a router's request must not pass as this computer's.
      "fe80::1",
      "fe80::1%en0",
      "fe80::186c:227e:2659:2740%en0",
      "169.254.10.1",
      "0.0.0.0",
      "",
      undefined,
    ]) {
      expect(isLocalRequest(from(address), lan, here), String(address)).toBe(false);
    }
  });

  it("still treats anything that came through a proxy as remote", () => {
    const here = machine(mac);
    expect(isLocalRequest(from("192.168.1.232", { "x-forwarded-for": "192.168.1.20" }), lan, here)).toBe(false);
    expect(isLocalRequest(from("192.168.1.232", { forwarded: "for=192.168.1.20" }), lan, here)).toBe(false);
    expect(isLocalRequest(from("192.168.1.232", { "x-real-ip": "192.168.1.20" }), lan, here)).toBe(false);
  });

  it("is not used in a container, where every device arrives by Docker's network", () => {
    // Docker's bridge: the container is .2, the gateway (which Docker's user-land proxy connects from) is .1.
    const container = machine({ eth0: [v4("172.18.0.2")] }, true);
    expect(isOwnAddress("172.18.0.2", container)).toBe(false);
    expect(isLocalRequest(from("172.18.0.1"), lan, container)).toBe(false);
    expect(isLocalRequest(from("172.18.0.2"), lan, container)).toBe(false);
    expect(isLocalRequest(from("127.0.0.1"), lan, container)).toBe(true);
    // Not in a container, the gateway is still not among the container's own addresses.
    expect(isLocalRequest(from("172.18.0.1"), lan, machine({ eth0: [v4("172.18.0.2")] }))).toBe(false);
    // LAN access off: nothing else can connect, as before.
    expect(isLocalRequest(from("172.18.0.1"), { lanAccess: false }, container)).toBe(true);
  });

  it("reads the addresses again after a few seconds, since they change, and copes when it cannot", () => {
    let clock = 0;
    let interfaces: Interfaces = { en0: [v4("192.168.1.232")] };
    let reads = 0;
    const here = thisMachine(
      {},
      () => {
        reads++;
        return interfaces;
      },
      () => clock,
    );
    expect(here.inContainer).toBe(false);
    expect(isOwnAddress("192.168.1.232", here)).toBe(true);
    interfaces = { en0: [v4("10.0.0.7")] };
    clock = 1000;
    expect(isOwnAddress("192.168.1.232", here)).toBe(true);
    expect(reads).toBe(1);
    clock = 6000;
    expect(isOwnAddress("192.168.1.232", here)).toBe(false);
    expect(isOwnAddress("10.0.0.7", here)).toBe(true);
    expect(thisMachine({ OUTPOST_IN_CONTAINER: "true" }).inContainer).toBe(true);
    const broken = thisMachine({}, () => {
      throw new Error("no");
    });
    expect(isOwnAddress("10.0.0.7", broken)).toBe(false);
    expect(isOwnAddress("127.0.0.1", broken)).toBe(true);
  });
});

// ── At the real network address of the computer the tests run on ──

const realAddress = [...ownAddresses(os.networkInterfaces())].find((address) => !address.includes(":"));
/** TEST-NET-1: never a real device's address, so never this computer's. */
const elsewhere = { remoteAddress: "192.0.2.7" };

let running: TestApp | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

/** One request over a real connection to `base`, with the headers the web app sends. */
// biome-ignore lint/suspicious/noExplicitAny: tests read response bodies loosely and assert on them
function send(base: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(
      `${base}${path}`,
      {
        method,
        agent: false,
        headers: {
          "x-outpost-request": "1",
          origin: base,
          ...(payload ? { "content-type": "application/json" } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // Not JSON.
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    request.on("error", reject);
    request.end(payload);
  });
}

describe("a browser on this computer at its network address", () => {
  it.skipIf(!realAddress)("may do each thing kept for the computer Outpost runs on, and another device still may not", async () => {
    const address = realAddress as string;
    running = await createTestApp({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0", OUTPOST_ALLOWED_HOSTS: address });
    await running.app.listen({ port: 0, host: address });
    const port = (running.app.server.address() as { port: number }).port;
    const base = `http://${address}:${port}`;
    const app = running;

    // What each screen is told, over a real connection that arrives from this computer's own address.
    const cleanup = await send(base, "GET", "/api/manage/cleanup");
    expect(cleanup.body.erase).toMatchObject({ allowed: true, reason: "local" });
    const backup = await send(base, "GET", "/api/backup/status");
    expect(backup.body.right).toMatchObject({ allowed: true, reason: "local" });
    expect(backup.body.protection.right).toEqual({ allowed: true, reason: "local" });
    const https = await send(base, "GET", "/api/https");
    expect(https.body.authorityRight).toMatchObject({ allowed: true, reason: "local" });
    expect(https.body.own.keyRight).toEqual({ allowed: true, reason: "local" });

    // And what the server does when asked: past the rule each time (the answers that follow are the actions' own).
    expect((await send(base, "DELETE", "/api/backup/stored/outpost-backup-none.zip")).status).not.toBe(403);
    expect((await send(base, "POST", "/api/backup/stored/outpost-backup-none.zip/restore")).status).not.toBe(403);
    // Not supervised in a test, so it says it cannot restart: the rule let it through.
    expect((await send(base, "POST", "/api/system/restart")).status).toBe(409);
    expect((await send(base, "DELETE", "/api/backup/protection")).status).toBe(200);
    expect((await send(base, "POST", "/api/manage/cleanup/everything", { confirm: "erase everything" })).status).toBe(200);

    // The same requests from another device are refused.
    expect((await app.api("GET", "/api/manage/cleanup", undefined, elsewhere)).body.erase.allowed).toBe(false);
    expect((await app.api("GET", "/api/https", undefined, elsewhere)).body.own.keyRight).toEqual({ allowed: false, reason: "remote" });
    expect((await app.api("GET", "/api/backup/status", undefined, elsewhere)).body.protection.right.allowed).toBe(false);
    for (const [method, url, body] of [
      ["DELETE", "/api/backup/stored/outpost-backup-none.zip"],
      ["POST", "/api/backup/stored/outpost-backup-none.zip/restore"],
      ["POST", "/api/system/restart"],
      ["DELETE", "/api/backup/protection"],
      ["PUT", "/api/backup/protection", { passphrase: "correct horse battery staple" }],
      ["POST", "/api/manage/cleanup/everything", { confirm: "erase everything" }],
      ["POST", "/api/https/authority/replace"],
    ] as const) {
      expect((await app.api(method, url, body, elsewhere)).status, `${method} ${url}`).toBe(403);
    }
  });
});
