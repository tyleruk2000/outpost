/**
 * Security review of the mesh radio link: Outpost's own MQTT broker against a hostile
 * device on the home network, on a raw socket. Listens on 127.0.0.1:9207 only.
 */
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createBroker, type MqttBroker } from "../src/modules/mesh/mqtt/broker.ts";
import { encodePacket, type Packet, PacketReader } from "../src/modules/mesh/mqtt/packets.ts";

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

  it.skip("does not let one address hold every connection without signing in", async () => {
    await start();
    const squatters: net.Socket[] = [];
    for (let i = 0; i < 8; i++) squatters.push(await open());
    // The ninth from the same address, still within the ten seconds to sign in, is refused rather than every slot being taken.
    const results = await Promise.all(squatters.map((socket) => closed(socket, 300)));
    expect(results.filter(Boolean).length).toBeGreaterThan(0);
  });
});
