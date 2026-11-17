/**
 * Security review of the mesh radio link: Outpost's own MQTT broker against a hostile
 * device on the home network, on a raw socket. Listens on 127.0.0.1:9207 only.
 */
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createBroker, type MqttBroker } from "../src/modules/mesh/mqtt/broker.ts";
import { createClient } from "../src/modules/mesh/mqtt/client.ts";
import { encodePacket, type Packet, PacketReader } from "../src/modules/mesh/mqtt/packets.ts";
import { createTestApp } from "./helpers.ts";

const PORT = 9207;
const USER = "radio";
const PASSWORD = "kettle-on-at-four-517";
const quiet = { info() {}, warn() {}, debug() {} };

const brokers: MqttBroker[] = [];
const sockets: net.Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  await Promise.all(brokers.splice(0).map((b) => b.close()));
});

async function start(): Promise<{ checks: () => number }> {
  let checks = 0;
  const broker = createBroker({
    host: "127.0.0.1",
    port: PORT,
    checkLogin: (user, password) => {
      checks += 1;
      return user === USER && password.equals(Buffer.from(PASSWORD));
    },
    allowAddress: () => true,
    log: quiet,
  });
  brokers.push(broker);
  await broker.listen();
  return { checks: () => checks };
}

function open(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: PORT });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

/** Logs in with a password; resolves with the CONNACK return code, or null if closed without one. */
async function login(password: string): Promise<number | null> {
  const socket = await open();
  const reader = new PacketReader(1024);
  return new Promise((resolve) => {
    socket.on("data", (chunk) => {
      for (const packet of reader.push(chunk)) if (packet.type === "connack") resolve(packet.returnCode);
    });
    socket.once("close", () => resolve(null));
    const connect: Packet = {
      type: "connect",
      clientId: `guess-${Math.random()}`,
      cleanSession: true,
      keepAliveSeconds: 30,
      userName: USER,
      password: Buffer.from(password),
    };
    socket.write(encodePacket(connect));
  });
}

const closed = (socket: net.Socket, ms: number) =>
  new Promise<boolean>((resolve) => {
    if (socket.destroyed) return resolve(true);
    const timer = setTimeout(() => resolve(false), ms);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

describe("Outpost's MQTT broker against a device guessing", () => {
  it("does not check password after password from one address: each check is a scrypt on the event loop", async () => {
    const { checks } = await start();
    for (let i = 0; i < 30; i++) expect(await login(`guess-${i}`)).not.toBe(0);
    // Each check is ~30 ms of scrypt with the whole server waiting; unlimited, it is a brute force and a stall.
    expect(checks()).toBeLessThanOrEqual(10);
  });

  it("does not let one address hold every connection without signing in", async () => {
    await start();
    const squatters: net.Socket[] = [];
    for (let i = 0; i < 8; i++) squatters.push(await open());
    // The ninth from the same address, still within the ten seconds to sign in, is refused rather than every slot being taken.
    const results = await Promise.all(squatters.map((socket) => closed(socket, 300)));
    expect(results.filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe("Meshtastic names heard over the air", () => {
  it("names a radio only from its own nodeinfo, never from one that claims another radio's id", async () => {
    const app = await createTestApp({}, undefined, { voacapData: false });
    const radio = createClient({
      host: "127.0.0.1",
      port: 9208,
      clientId: "!a1b2c3d4",
      userName: USER,
      password: PASSWORD,
      subscriptions: [],
      backoff: { firstMs: 100, maxMs: 400 },
      log: quiet,
    });
    try {
      const set = await app.api("PUT", "/api/mesh/meshtastic", {
        mode: "broker",
        broker: { port: 9208, userName: USER, password: PASSWORD },
        channels: [{ name: "LongFast", index: 0 }],
      });
      expect(set.status, JSON.stringify(set.body)).toBe(200);
      radio.start();
      for (let i = 0; i < 100 && radio.status().state !== "connected"; i++) await new Promise((r) => setTimeout(r, 30));
      const topic = "msh/EU_868/2/json/LongFast/!a1b2c3d4";
      const publish = (value: object) => radio.publish(topic, Buffer.from(JSON.stringify(value)), 1);
      // The real radio !0000beef calls itself Dad.
      await publish({ from: 0xbeef, id: 1, type: "nodeinfo", payload: { id: "!0000beef", longname: "Dad", shortname: "DAD" }, to: -1 });
      // Another radio in range sends a nodeinfo of its own that claims Dad's id.
      await publish({ from: 0xbad, id: 2, type: "nodeinfo", payload: { id: "!0000beef", longname: "Not Dad", shortname: "X" }, to: -1 });
      await publish({ from: 0xbeef, id: 3, type: "text", payload: { text: "Home by six" }, channel: 0, to: -1 });
      let rows = app.ctx.services.board.list({ channel: "meshtastic:longfast" }).messages;
      for (let i = 0; i < 100 && rows.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 30));
        rows = app.ctx.services.board.list({ channel: "meshtastic:longfast" }).messages;
      }
      expect(rows[0]?.author).toBe("Dad");
    } finally {
      await radio.stop();
      await app.close();
    }
  });
});

describe("what is learnt from the radios", () => {
  it("is not all forgotten because one message came on a topic longer than is kept", async () => {
    const app = await createTestApp({}, undefined, { voacapData: false });
    const radio = createClient({
      host: "127.0.0.1",
      port: 9208,
      clientId: "!a1b2c3d4",
      userName: USER,
      password: PASSWORD,
      subscriptions: [],
      backoff: { firstMs: 100, maxMs: 400 },
      log: quiet,
    });
    try {
      await app.api("PUT", "/api/mesh/meshtastic", {
        mode: "broker",
        broker: { port: 9208, userName: USER, password: PASSWORD },
        channels: [{ name: "LongFast", index: 0 }],
      });
      radio.start();
      for (let i = 0; i < 100 && radio.status().state !== "connected"; i++) await new Promise((r) => setTimeout(r, 30));
      const at = (channel: string, root = "msh/EU_868") => `${root}/2/json/${channel}/!a1b2c3d4`;
      const send = (topic: string, value: object) => radio.publish(topic, Buffer.from(JSON.stringify(value)), 1);
      await send(at("LongFast"), { from: 0xbeef, id: 1, type: "nodeinfo", payload: { id: "!0000beef", longname: "Dad" }, to: -1 });
      // Whoever else publishes to the broker: a channel name and a root longer than the stored set-up allows.
      await send(at("x".repeat(40)), { from: 0xbad, id: 2, type: "text", payload: { text: "hi" }, channel: 3, to: -1 });
      await send(at("LongFast", "r".repeat(150)), { from: 0xbad, id: 3, type: "text", payload: { text: "hi" }, channel: 0, to: -1 });
      await new Promise((r) => setTimeout(r, 200));
      expect(app.ctx.services.mesh.store.heard().nodes["!0000beef"]?.longName).toBe("Dad");
      expect(app.ctx.services.mesh.store.heard().meshtastic.root).toBe("msh/EU_868");
    } finally {
      await radio.stop();
      await app.close();
    }
  });
});

describe("setting the link up", () => {
  it("is refused through a proxy and from another device, and the device list takes no path", async () => {
    const app = await createTestApp({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" }, undefined, { voacapData: false });
    try {
      const body = { mode: "broker", broker: { port: 9208, userName: USER, password: PASSWORD } };
      for (const extra of [
        { headers: { "x-forwarded-for": "127.0.0.1" } },
        { headers: { forwarded: "for=127.0.0.1" } },
        { remoteAddress: "::ffff:192.168.1.20" },
        { remoteAddress: "fe80::1" },
      ]) {
        expect((await app.api("PUT", "/api/mesh/meshtastic", body, extra)).status, JSON.stringify(extra)).toBe(403);
        expect((await app.api("PUT", "/api/mesh/meshcore", { mode: "serial", device: "/etc/passwd" }, extra)).status).toBe(403);
      }
      expect((await app.api("PUT", "/api/mesh/meshcore", { mode: "serial", device: "/etc/passwd" })).status).toBe(400);
      expect(app.ctx.services.mesh.response().meshtastic.config.mode).toBe("off");
    } finally {
      await app.close();
    }
  });
});
