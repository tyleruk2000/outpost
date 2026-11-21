/**
 * Outpost's broker when its port is taken (outpost-x9dm: a Mosquitto already on 1883),
 * the household's broker looked after from Settings (find, test, dynamic security), and
 * the small fixes from the review (outpost-dko, outpost-4b6, outpost-vsm).
 *
 * The stand-in broker is this repository's own; the same calls were also tried against a
 * real Mosquitto 2.1, with passwords, an access list, TLS and dynamic security
 * (docs/mesh-radio.md). That one is not run here: tests do not need anything installed.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { MeshBrokerTestResult, MeshDynsecResult, MeshFindResponse, MeshResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { limitKey } from "../src/core/address-key.ts";
import { containerHost, freePortNear } from "../src/modules/mesh/household.ts";
import { createBroker, type MqttBroker } from "../src/modules/mesh/mqtt/broker.ts";
import { createClient } from "../src/modules/mesh/mqtt/client.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const quiet = { info() {}, warn() {}, debug() {} };
const ROOT = "msh/EU_868";
const OUTPOST_PASSWORD = "household-outpost-pw-1";
const RADIO_PASSWORD = "radio-at-the-window-22";

async function waitFor<T>(check: () => T | undefined | null | false, ms = 4000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > until) throw new Error("Waited too long");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => server.listen({ host: "127.0.0.1", port: 0 }, () => resolve((server.address() as net.AddressInfo).port)));
}

describe("Outpost's broker on a port already in use", () => {
  it("says so plainly, with a port that is free and the choice of the broker already there", async () => {
    const other = net.createServer();
    const taken = await listen(other);
    const app = await createTestApp({}, undefined, { voacapData: false });
    try {
      const saved = await app.api<MeshResponse>("PUT", "/api/mesh/meshtastic", {
        mode: "broker",
        broker: { port: taken, userName: "radio", password: RADIO_PASSWORD },
        channels: [{ name: "LongFast", index: 0 }],
      });
      expect(saved.status).toBe(200);
      const status = saved.body.meshtastic.status;
      expect(status.state).toBe("failed");
      expect(status.lastError).toMatch(new RegExp(`Port ${taken} is already in use by another program on this computer`));
      expect(status.lastError).toMatch(/choose “Use the household's broker” instead/);
      expect(status.portInUse?.port).toBe(taken);
      expect(status.portInUse?.freePort).toBeGreaterThan(taken);
      expect(status.lastError).toContain(`Port ${status.portInUse?.freePort} is free`);
    } finally {
      await app.close();
      other.close();
    }
  });

  it("finds a free port near a taken one", async () => {
    const other = net.createServer();
    const taken = await listen(other);
    try {
      const free = await freePortNear("127.0.0.1", taken);
      expect(free).not.toBeNull();
      expect(free).not.toBe(taken);
    } finally {
      other.close();
    }
  });
});

describe("the household's broker, from Settings", () => {
  let app: TestApp;
  let broker: MqttBroker;
  let port = 0;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
    broker = createBroker({
      host: "127.0.0.1",
      port: 0,
      checkLogin: (user, password) =>
        (user === "outpost" && password.toString() === OUTPOST_PASSWORD) || (user === "radio" && password.toString() === RADIO_PASSWORD),
      allowAddress: () => true,
      log: quiet,
    });
    port = (await broker.listen()).port;
  });
  afterAll(async () => {
    await app.close();
    await broker.close();
  });

  it("finds a broker and says it asks for a password; says nothing is there where nothing is", async () => {
    const found = await app.api<MeshFindResponse>("POST", "/api/mesh/broker/find", { host: "127.0.0.1", port });
    expect(found.status).toBe(200);
    const named = found.body.found.find((entry) => entry.where === "named");
    expect(named).toMatchObject({ host: "127.0.0.1", port, answer: "needs-login" });
    const closed = net.createServer();
    const nothing = await listen(closed);
    await new Promise((resolve) => closed.close(resolve));
    const empty = await app.api<MeshFindResponse>("POST", "/api/mesh/broker/find", { host: "127.0.0.1", port: nothing });
    expect(empty.body.found.find((entry) => entry.where === "named")?.answer).toBe("nothing");
  });

  it("tests a sign-in step by step: a wrong password said as such, a right one signs in and subscribes", async () => {
    const base = { host: "127.0.0.1", port, userName: "outpost", rootTopic: ROOT, tls: false };
    const wrong = await app.api<MeshBrokerTestResult>("POST", "/api/mesh/broker/test", { ...base, password: "not-it" });
    expect(wrong.body.ok).toBe(false);
    expect(wrong.body.steps).toEqual([{ step: "connect", ok: false, words: "The broker refused the user name or password." }]);

    // A radio publishing while Outpost listens is heard and named by the id in its topic.
    const radio = createClient({
      host: "127.0.0.1",
      port,
      clientId: "!a1b2c3d4",
      userName: "radio",
      password: RADIO_PASSWORD,
      subscriptions: [],
      log: quiet,
    });
    radio.start();
    await waitFor(() => radio.status().state === "connected");
    const talking = setInterval(() => void radio.publish(`${ROOT}/2/json/LongFast/!a1b2c3d4`, Buffer.from("{}"), 0).catch(() => {}), 200);
    try {
      const right = await app.api<MeshBrokerTestResult>("POST", "/api/mesh/broker/test", { ...base, password: OUTPOST_PASSWORD });
      expect(right.body.steps.map((step) => step.step)).toEqual(["connect", "subscribe", "check", "listen"]);
      expect(right.body.steps[0]).toMatchObject({ ok: true, words: `Signed in to 127.0.0.1:${port} as outpost.` });
      expect(right.body.steps[1]?.ok).toBe(true);
      // Outpost's own broker, standing in, does not send a client its own messages back (Mosquitto does): said, not hidden.
      expect(right.body.steps[2]?.words).toMatch(/did not come back/);
      expect(right.body.heard[0]).toMatchObject({ radio: "!a1b2c3d4" });
      expect(right.body.steps[3]?.words).toMatch(/^Heard \d+ messages? from !a1b2c3d4\.$/);
    } finally {
      clearInterval(talking);
      await radio.stop();
    }
  });

  it("uses the saved password when none is typed, and never sends it back", async () => {
    const saved = await app.api<MeshResponse>("PUT", "/api/mesh/meshtastic", {
      mode: "off",
      client: { host: "127.0.0.1", port, userName: "outpost", password: OUTPOST_PASSWORD, rootTopic: ROOT },
    });
    expect(JSON.stringify(saved.body)).not.toContain(OUTPOST_PASSWORD);
    const test = await app.api<MeshBrokerTestResult>("POST", "/api/mesh/broker/test", {
      host: "127.0.0.1",
      port,
      userName: "outpost",
      rootTopic: ROOT,
      tls: false,
    });
    expect(test.body.steps[0]?.ok).toBe(true);
    expect(JSON.stringify(test.body)).not.toContain(OUTPOST_PASSWORD);
  });

  it("says when a broker gives no answer to dynamic security, and that Outpost does not change its files", async () => {
    const answer = await app.api<MeshDynsecResult>("POST", "/api/mesh/broker/dynsec");
    expect(answer.body.state).toBe("off");
    expect(answer.body.words).toMatch(/Outpost does not change/);
  });

  it("reads TLS and its certificate authority as set, and refuses something that is not a certificate", async () => {
    const refused = await app.api("PUT", "/api/mesh/meshtastic", {
      mode: "off",
      client: { host: "127.0.0.1", port, userName: "outpost", rootTopic: ROOT, tls: true, ca: "not a certificate" },
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/That is not a certificate/);
    const kept = await app.api<MeshResponse>("PUT", "/api/mesh/meshtastic", {
      mode: "off",
      client: { host: "127.0.0.1", port, userName: "outpost", rootTopic: ROOT, tls: true, ca: "" },
    });
    expect(kept.body.meshtastic.config.client).toMatchObject({ tls: true, ca: null });
  });

  it("does not read more from the household's broker than it would take from one radio, and counts what it left", async () => {
    await app.api("PUT", "/api/mesh/meshtastic", {
      mode: "client",
      client: { host: "127.0.0.1", port, userName: "outpost", password: OUTPOST_PASSWORD, rootTopic: ROOT, tls: false },
      channels: [{ name: "LongFast", index: 0 }],
    });
    await waitFor(() => app.ctx.services.mesh.meshtastic.status().state === "connected");
    // Published by Outpost's broker itself, so no one radio's own limit applies on the way.
    for (let n = 0; n < 120; n++) await broker.publish(`${ROOT}/2/json/Other/!0000beef`, Buffer.from("{}"), 0);
    const status = await waitFor(() => {
      const now = app.ctx.services.mesh.meshtastic.status();
      return now.dropped > 0 && now;
    });
    expect(status.dropped).toBeGreaterThan(0);
    expect(status.perMinute).toBeGreaterThan(0);
    expect(status.radios[0]).toMatchObject({ id: "!0000beef" });
    await app.api("PUT", "/api/mesh/meshtastic", { mode: "off" });
  });
});

describe("the review's small fixes", () => {
  it("keeps the passwords when a save is refused, and when other settings change before anything was saved (outpost-dko)", async () => {
    const app = await createTestApp({}, undefined, { voacapData: false });
    try {
      const secrets = path.join(app.ctx.config.dataDir, "mesh", "secrets.json");
      const refused = await app.api("PUT", "/api/mesh/meshtastic", {
        mode: "broker",
        broker: { port: 9411, userName: "radio", password: RADIO_PASSWORD },
        channels: [],
      });
      expect(refused.status).toBe(400);
      expect(fs.existsSync(secrets)).toBe(false);

      // A password kept with no set-up row, as an older version could leave it, is not erased by an unrelated change.
      app.ctx.services.mesh.secrets.setClientPassword(OUTPOST_PASSWORD);
      expect((await app.api("PATCH", "/api/settings", { "https.enabled": false })).status).toBeLessThan(300);
      expect(app.ctx.services.mesh.secrets.clientPassword()).toBe(OUTPOST_PASSWORD);
    } finally {
      await app.close();
    }
  });

  it("refuses a short password for the radio's sign-in (outpost-4b6)", async () => {
    const app = await createTestApp({}, undefined, { voacapData: false });
    try {
      const refused = await app.api("PUT", "/api/mesh/meshtastic", {
        mode: "broker",
        broker: { port: 9412, userName: "radio", password: "short" },
        channels: [{ name: "LongFast", index: 0 }],
      });
      expect(refused.status).toBe(400);
      expect(refused.body.error.message).toMatch(/at least 12 characters/);
    } finally {
      await app.close();
    }
  });

  it("closes a client that asked for no keep-alive once it has said nothing for the longest allowed (outpost-4b6)", async () => {
    const broker = createBroker({
      host: "127.0.0.1",
      port: 0,
      checkLogin: () => true,
      allowAddress: () => true,
      limits: { mostIdleMs: 300 },
      log: quiet,
    });
    const { port } = await broker.listen();
    const client = createClient({
      host: "127.0.0.1",
      port,
      clientId: "silent",
      userName: "a",
      password: "b",
      keepAliveSeconds: 0,
      subscriptions: [],
      backoff: { firstMs: 60_000, maxMs: 60_000 },
      log: quiet,
    });
    try {
      client.start();
      await waitFor(() => broker.clients().length === 1);
      await waitFor(() => broker.clients().length === 0, 3000);
    } finally {
      await client.stop();
      await broker.close();
    }
  });

  it("counts an IPv6 device by its /64, and IPv4 by its address (outpost-vsm)", () => {
    expect(limitKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(limitKey("2001:db8:1:2::9")).toBe("2001:db8:1:2::/64");
    expect(limitKey("2001:0DB8:0001:0002:0:0:0:1")).toBe("2001:db8:1:2::/64");
    expect(limitKey("fe80::1%en0")).toBe("fe80:0:0:0::/64");
    expect(limitKey("::1")).toBe("0:0:0:0::/64");
    expect(limitKey("::ffff:192.168.1.20")).toBe("192.168.1.20");
    expect(limitKey("192.168.1.20")).toBe("192.168.1.20");
    expect(limitKey("not an address")).toBe("not an address");
  });

  it("reads the address of the computer a container runs on from its default route", () => {
    const route = "Iface\tDestination\tGateway \tFlags\nEth0\t00000000\t010013AC\t0003\neth0\t000013AC\t00000000\t0001\n";
    // The owner's Raspberry Pi: Docker's bridge, 172.19.0.1.
    expect(containerHost(() => route)).toBe("172.19.0.1");
    expect(containerHost(() => null)).toBeNull();
    expect(containerHost(() => "Iface\tDestination\tGateway\n")).toBeNull();
  });
});
