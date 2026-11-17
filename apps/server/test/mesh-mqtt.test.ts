/**
 * The MQTT broker and client the mesh radio link uses: the packet reader and topic matching
 * on their own, the client and broker against each other, and the broker against packets
 * built by hand on a raw socket, the way a broken or hostile device on the network would
 * send them. Everything listens on 127.0.0.1 on a port the system chooses.
 */
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { type BrokerLimits, createBroker, type MqttBroker } from "../src/modules/mesh/mqtt/broker.ts";
import { createClient, type MqttClient } from "../src/modules/mesh/mqtt/client.ts";
import {
  encodePacket,
  MqttProtocolError,
  type Packet,
  PacketReader,
  topicMatches,
  validFilter,
  validTopicName,
} from "../src/modules/mesh/mqtt/packets.ts";

const USER = "radio";
const PASSWORD = "correct-horse-7731";
const HOST = "127.0.0.1";

interface Captured {
  lines: string[];
  log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void; debug(obj: object, msg: string): void };
}

function captureLog(): Captured {
  const lines: string[] = [];
  const record = (level: string) => (obj: object, msg: string) => {
    lines.push(`${level} ${msg} ${JSON.stringify(obj)}`);
  };
  return { lines, log: { info: record("info"), warn: record("warn"), debug: record("debug") } };
}

const brokers: MqttBroker[] = [];
const clients: MqttClient[] = [];
const sockets: net.Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  await Promise.all(clients.splice(0).map((c) => c.stop()));
  await Promise.all(brokers.splice(0).map((b) => b.close()));
});

async function startBroker(
  limits: Partial<BrokerLimits> = {},
  extra: { allowAddress?: (a: string) => boolean; port?: number; logins?: string[] } = {},
): Promise<{ broker: MqttBroker; port: number; logged: string[] }> {
  const captured = captureLog();
  const broker = createBroker({
    host: HOST,
    port: extra.port ?? 0,
    checkLogin: (user, password) => {
      extra.logins?.push(user);
      return user === USER && password.equals(Buffer.from(PASSWORD));
    },
    allowAddress: extra.allowAddress ?? (() => true),
    limits,
    log: captured.log,
  });
  brokers.push(broker);
  const { port } = await broker.listen();
  return { broker, port, logged: captured.lines };
}

function startClient(port: number, overrides: Partial<Parameters<typeof createClient>[0]> = {}): { client: MqttClient; logged: string[] } {
  const captured = captureLog();
  const client = createClient({
    host: HOST,
    port,
    clientId: "outpost-test",
    userName: USER,
    password: PASSWORD,
    keepAliveSeconds: 30,
    subscriptions: [],
    backoff: { firstMs: 100, maxMs: 400 },
    log: captured.log,
    ...overrides,
  });
  clients.push(client);
  client.start();
  return { client, logged: captured.lines };
}

async function until(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A raw TCP connection that records what it is sent and when it is closed. */
interface Raw {
  sock: net.Socket;
  received: () => Buffer;
  packets: () => Packet[];
  closedAt: () => number | null;
  closed: Promise<void>;
}

async function raw(port: number): Promise<Raw> {
  const sock = net.connect({ host: HOST, port });
  sockets.push(sock);
  const chunks: Buffer[] = [];
  let closedAt: number | null = null;
  sock.on("data", (c) => chunks.push(c));
  sock.on("error", () => {});
  const closed = new Promise<void>((resolve) =>
    sock.on("close", () => {
      closedAt = Date.now();
      resolve();
    }),
  );
  await new Promise<void>((resolve) => {
    sock.once("connect", () => resolve());
    sock.once("close", () => resolve());
  });
  return {
    sock,
    received: () => Buffer.concat(chunks),
    packets: () => new PacketReader(1 << 20).push(Buffer.concat(chunks)),
    closedAt: () => closedAt,
    closed,
  };
}

async function closedWithin(r: Raw, ms: number): Promise<boolean> {
  return Promise.race([r.closed.then(() => true), delay(ms).then(() => false)]);
}

function connectBytes(clientId: string, extra: { keepAliveSeconds?: number; password?: string; userName?: string | null } = {}): Buffer {
  const packet: Packet = { type: "connect", clientId, cleanSession: true, keepAliveSeconds: extra.keepAliveSeconds ?? 60 };
  if (extra.userName !== null) packet.userName = extra.userName ?? USER;
  if (extra.userName !== null) packet.password = Buffer.from(extra.password ?? PASSWORD);
  return encodePacket(packet);
}

/** A raw connection that has logged in and had its CONNACK. */
async function rawLoggedIn(port: number, clientId: string, keepAliveSeconds = 60): Promise<Raw> {
  const r = await raw(port);
  r.sock.write(connectBytes(clientId, { keepAliveSeconds }));
  await until(() => r.packets().some((p) => p.type === "connack"));
  expect(r.packets()[0]).toEqual({ type: "connack", sessionPresent: false, returnCode: 0 });
  return r;
}

const publishBytes = (topic: string, qos: 0 | 1 | 2, payload = "hi") =>
  encodePacket({
    type: "publish",
    topic,
    payload: Buffer.from(payload),
    qos,
    retain: false,
    dup: false,
    ...(qos > 0 ? { packetId: 7 } : {}),
  });

describe("MQTT packets and topics", () => {
  it("matches + and # as the standard says, and keeps $ topics away from leading wildcards", () => {
    expect(topicMatches("msh/EU_868/2/json/mqtt/#", "msh/EU_868/2/json/mqtt/!a1b2c3d4")).toBe(true);
    expect(topicMatches("msh/+/2/e/LongFast/#", "msh/EU_868/2/e/LongFast/!a1b2c3d4")).toBe(true);
    expect(topicMatches("msh/+/2/e/LongFast/#", "msh/EU_868/2/json/LongFast/!a1b2c3d4")).toBe(false);
    expect(topicMatches("sport/#", "sport")).toBe(true);
    expect(topicMatches("sport/+", "sport")).toBe(false);
    expect(topicMatches("sport/+", "sport/")).toBe(true);
    expect(topicMatches("+/+", "/finance")).toBe(true);
    expect(topicMatches("+", "a/b")).toBe(false);
    expect(topicMatches("#", "$SYS/broker")).toBe(false);
    expect(topicMatches("+/broker", "$SYS/broker")).toBe(false);
    expect(topicMatches("$SYS/#", "$SYS/broker")).toBe(true);
    expect(validFilter("a/+/b/#")).toBe(true);
    expect(validFilter("a/#/b")).toBe(false);
    expect(validFilter("a/b#")).toBe(false);
    expect(validFilter("a+/b")).toBe(false);
    expect(validFilter("")).toBe(false);
    expect(validTopicName("msh/EU_868/2/json/LongFast/!a1b2c3d4")).toBe(true);
    expect(validTopicName("msh/+/x")).toBe(false);
    expect(validTopicName("msh/#")).toBe(false);
  });

  it("reads packets split across chunks and several in one chunk", () => {
    const reader = new PacketReader(1024);
    const bytes = Buffer.concat([publishBytes("a/b", 1, "x".repeat(200)), encodePacket({ type: "pingreq" })]);
    expect(reader.push(bytes.subarray(0, 2))).toEqual([]);
    expect(reader.push(bytes.subarray(2, 100))).toEqual([]);
    const packets = reader.push(bytes.subarray(100));
    expect(packets.map((p) => p.type)).toEqual(["publish", "pingreq"]);
    expect(packets[0]).toMatchObject({ topic: "a/b", qos: 1, packetId: 7 });
    expect(reader.buffered).toBe(0);
  });

  it("refuses long lengths, oversized packets, wrong flags and bad UTF-8", () => {
    const fail = (bytes: number[], max = 1024) => {
      try {
        new PacketReader(max).push(Buffer.from(bytes));
      } catch (error) {
        expect(error).toBeInstanceOf(MqttProtocolError);
        return (error as MqttProtocolError).code;
      }
      return "accepted";
    };
    expect(fail([0x30, 0xff, 0xff, 0xff, 0xff, 0x01])).toBe("malformed");
    expect(fail([0x30, 0x80, 0x80, 0x01])).toBe("packet-too-large");
    expect(fail([0x80, 0x00])).toBe("malformed"); // SUBSCRIBE without its 0b0010 flags
    expect(fail([0xc1, 0x00])).toBe("malformed"); // PINGREQ with a flag
    expect(fail([0x30, 0x05, 0x00, 0x03, 0x61, 0xff, 0x62])).toBe("malformed"); // topic not UTF-8
    expect(fail([0x30, 0x04, 0x00, 0x09, 0x61, 0x62])).toBe("malformed"); // topic runs past the packet
    expect(fail([0x36, 0x04, 0x00, 0x01, 0x61, 0x62])).toBe("malformed"); // QoS 3
    expect(fail([0x50, 0x02, 0x00, 0x01])).toBe("unsupported"); // PUBREC
  });
});

describe("MQTT client and broker together", () => {
  it("connects, subscribes with + and #, and publishes both ways at QoS 0 and 1", async () => {
    const { broker, port } = await startBroker();
    const heard: Array<{ topic: string; text: string; clientId: string }> = [];
    broker.onPublish((topic, payload, from) => heard.push({ topic, text: payload.toString(), clientId: from.clientId }));
    let changes = 0;
    broker.onClientsChanged(() => changes++);

    const a = startClient(port, { clientId: "a", subscriptions: [{ filter: "msh/+/2/json/#", qos: 1 }] });
    const b = startClient(port, { clientId: "b", subscriptions: [{ filter: "msh/EU_868/#", qos: 0 }] });
    const toA: string[] = [];
    const toB: string[] = [];
    a.client.onMessage((topic, payload) => toA.push(`${topic} ${payload}`));
    b.client.onMessage((topic, payload) => toB.push(`${topic} ${payload}`));
    await until(() => broker.clients().filter((c) => c.subscriptions.length > 0).length === 2);
    expect(a.client.status().state).toBe("connected");
    expect(changes).toBeGreaterThanOrEqual(4);
    expect(
      broker
        .clients()
        .map((c) => [c.clientId, c.subscriptions])
        .sort(),
    ).toEqual([
      ["a", ["msh/+/2/json/#"]],
      ["b", ["msh/EU_868/#"]],
    ]);

    // A client publishing at QoS 1: the broker's PUBACK resolves it, Outpost and the other client hear it, the sender does not.
    await a.client.publish("msh/EU_868/2/json/LongFast/!a1b2c3d4", Buffer.from("from a"), 1);
    await until(() => toB.length === 1);
    expect(toB).toEqual(["msh/EU_868/2/json/LongFast/!a1b2c3d4 from a"]);
    expect(heard).toEqual([{ topic: "msh/EU_868/2/json/LongFast/!a1b2c3d4", text: "from a", clientId: "a" }]);

    await b.client.publish("msh/EU_868/2/json/mqtt/!x", Buffer.from("from b"), 0);
    await until(() => toA.length === 1);
    expect(toA).toEqual(["msh/EU_868/2/json/mqtt/!x from b"]);

    // Outpost publishing: a has QoS 1 and acknowledges; b has QoS 0.
    const result = await broker.publish("msh/EU_868/2/json/mqtt/!outpost", Buffer.from("downlink"), 1);
    expect(result).toEqual({ matched: 2, acknowledged: 1 });
    await until(() => toA.length === 2 && toB.length === 2);
    expect(await broker.publish("nobody/listens", Buffer.from("x"), 1)).toEqual({ matched: 0, acknowledged: 0 });
    expect(toA).toHaveLength(2);
    expect(toB).toHaveLength(2);
    expect(toA.some((m) => m.includes("from a"))).toBe(false);
  });

  it("rejects a publish when the client is not connected", async () => {
    const client = createClient({ host: HOST, port: 1, clientId: "x", subscriptions: [], log: captureLog().log });
    await expect(client.publish("a/b", Buffer.from("x"), 0)).rejects.toThrow(/Not connected/);
  });

  it("says in plain words when the port is taken", async () => {
    const { port } = await startBroker();
    const second = createBroker({ host: HOST, port, checkLogin: () => true, allowAddress: () => true, log: captureLog().log });
    await expect(second.listen()).rejects.toThrow(/already in use/);
    await second.close();
  });

  it("backs off when the broker goes away and reconnects when it comes back", async () => {
    const first = await startBroker();
    const { client } = startClient(first.port, { subscriptions: [{ filter: "msh/#", qos: 1 }] });
    await until(() => client.status().state === "connected");
    await first.broker.close();
    await until(() => client.status().state === "away");
    expect(client.status().retryAt).toBeGreaterThan(Date.now() - 50);
    expect(client.status().lastError).toBeTruthy();
    // Let a few attempts fail against nothing, then bring the broker back on the same port.
    await delay(500);
    const second = await startBroker({}, { port: first.port });
    await until(() => client.status().state === "connected", 3000);
    await until(() => second.broker.clients()[0]?.subscriptions.length === 1);
    expect(client.status().lastError).toBeNull();
  });

  it("backs off after a refused login rather than hammering", async () => {
    const logins: string[] = [];
    const { port, logged } = await startBroker({}, { logins });
    const { client, logged: clientLogged } = startClient(port, { password: "not-the-one-9", backoff: { firstMs: 200, maxMs: 5000 } });
    await until(() => client.status().state === "away");
    expect(client.status().lastError).toBe("The broker refused the user name or password.");
    await delay(700);
    // 0 ms, about 200 ms, then about 600 ms: three tries at most, not dozens.
    expect(logins.length).toBeGreaterThanOrEqual(2);
    expect(logins.length).toBeLessThanOrEqual(3);
    expect([...logged, ...clientLogged].join("\n")).not.toContain("not-the-one-9");
  });

  it("treats a broker that stops answering pings as gone", async () => {
    // A server that accepts the login and then never says anything again.
    const silent = net.createServer((sock) => {
      sock.once("data", () => sock.write(encodePacket({ type: "connack", sessionPresent: false, returnCode: 0 })));
      sock.on("error", () => {});
      sockets.push(sock);
    });
    await new Promise<void>((r) => silent.listen(0, HOST, () => r()));
    const port = (silent.address() as net.AddressInfo).port;
    try {
      const { client } = startClient(port, { keepAliveSeconds: 1, backoff: { firstMs: 5000, maxMs: 5000 } });
      await until(() => client.status().state === "connected");
      const at = Date.now();
      await until(() => client.status().state === "away", 4000);
      expect(Date.now() - at).toBeGreaterThanOrEqual(1500);
      expect(client.status().lastError).toBe("The broker stopped answering.");
      await client.stop();
    } finally {
      await new Promise((r) => silent.close(r));
    }
  });

  it("leaves no timers or sockets behind after stop() and close()", async () => {
    const kinds = () =>
      process
        .getActiveResourcesInfo()
        .filter((k) => k === "Timeout" || k.startsWith("TCP"))
        .sort()
        .join(",");
    await delay(20);
    const before = kinds();
    const { broker, port } = await startBroker();
    const { client } = startClient(port, { subscriptions: [{ filter: "a/#", qos: 1 }] });
    const r = await raw(port); // one that never logs in, so a connect timer is running
    await until(() => broker.clients()[0]?.subscriptions.length === 1);
    // A QoS 1 publish to a client that will never acknowledge: its wait must end with close().
    const silent = await rawLoggedIn(port, "silent");
    silent.sock.write(encodePacket({ type: "subscribe", packetId: 1, subscriptions: [{ filter: "a/#", qos: 1 }] }));
    await until(() => broker.clients().length === 2 && broker.clients().every((c) => c.subscriptions.length === 1));
    silent.sock.pause();
    const waiting = broker.publish("a/b", Buffer.from("x"), 1, 60_000);
    await client.stop();
    await broker.close();
    expect((await waiting).matched).toBe(2);
    r.sock.destroy();
    silent.sock.destroy();
    await until(() => kinds() === before);
    expect(client.status()).toEqual({ state: "stopped", since: null, lastError: null, retryAt: null });
  });
});

describe("MQTT broker against hand-built packets", () => {
  it("closes on a remaining length of five bytes", async () => {
    const { port } = await startBroker();
    const r = await raw(port);
    r.sock.write(Buffer.from([0x10, 0xff, 0xff, 0xff, 0xff, 0x01]));
    expect(await closedWithin(r, 2000)).toBe(true);
    expect(r.received().length).toBe(0);
  });

  it("closes on a field that runs past the end of its packet", async () => {
    const { port } = await startBroker();
    const r = await raw(port);
    // CONNECT, protocol MQTT 4, clean session, keep-alive 60, then a client id said to be 100 bytes long holding 3.
    const body = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c, 0x00, 0x64, 0x61, 0x62, 0x63];
    r.sock.write(Buffer.from([0x10, body.length, ...body]));
    expect(await closedWithin(r, 2000)).toBe(true);
    expect(r.received().length).toBe(0);
  });

  it("refuses a packet over the size limit from its header alone, and keeps running", async () => {
    const { broker, port } = await startBroker({ maxPacketBytes: 1024 });
    const r = await rawLoggedIn(port, "big");
    // A PUBLISH whose header says 2 MB: refused before any of the body is sent or held.
    r.sock.write(Buffer.from([0x30, 0x80, 0x80, 0x80, 0x01]));
    expect(await closedWithin(r, 2000)).toBe(true);
    // And one that gets there gradually, just over the limit.
    const r2 = await rawLoggedIn(port, "big2");
    r2.sock.write(publishBytes("a/b", 0, "x".repeat(1100)));
    expect(await closedWithin(r2, 2000)).toBe(true);
    // The broker still serves others.
    await rawLoggedIn(port, "after");
    expect(broker.clients().map((c) => c.clientId)).toEqual(["after"]);
  });

  it("closes a connection whose first packet is not CONNECT", async () => {
    const { port } = await startBroker();
    const r = await raw(port);
    r.sock.write(encodePacket({ type: "pingreq" }));
    expect(await closedWithin(r, 2000)).toBe(true);
    expect(r.received().length).toBe(0);
  });

  it("answers protocol level 3 with CONNACK 1 and closes", async () => {
    const { port } = await startBroker();
    const r = await raw(port);
    const body = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x03, 0x02, 0x00, 0x3c, 0x00, 0x01, 0x78];
    r.sock.write(Buffer.from([0x10, body.length, ...body]));
    expect(await closedWithin(r, 3000)).toBe(true);
    expect([...r.received()]).toEqual([0x20, 0x02, 0x00, 0x01]);
  });

  it("refuses a wrong password with CONNACK 4, closes, and never logs the password", async () => {
    const logins: string[] = [];
    const { port, logged } = await startBroker({}, { logins });
    const r = await raw(port);
    r.sock.write(connectBytes("radio-1", { password: "hunter2-wrong-pass" }));
    expect(await closedWithin(r, 3000)).toBe(true);
    expect([...r.received()]).toEqual([0x20, 0x02, 0x00, 0x04]);
    expect(logins).toEqual([USER]);
    expect(logged.length).toBeGreaterThan(0);
    const all = logged.join("\n");
    expect(all).not.toContain("hunter2-wrong-pass");
    expect(all).not.toContain(Buffer.from("hunter2-wrong-pass").toString("hex"));
    expect(all).not.toContain(Buffer.from("hunter2-wrong-pass").toString("base64"));
  });

  it("refuses a CONNECT without credentials without asking checkLogin", async () => {
    const logins: string[] = [];
    const { port } = await startBroker({}, { logins });
    const r = await raw(port);
    r.sock.write(connectBytes("anon", { userName: null }));
    expect(await closedWithin(r, 3000)).toBe(true);
    expect([...r.received()]).toEqual([0x20, 0x02, 0x00, 0x04]);
    expect(logins).toEqual([]);
  });

  it("gives an empty client id a name, and refuses one without a clean session", async () => {
    const { broker, port } = await startBroker();
    await rawLoggedIn(port, "");
    expect(broker.clients()[0]?.clientId).toMatch(/^outpost-[0-9a-f]+$/);
    const r = await raw(port);
    r.sock.write(
      encodePacket({
        type: "connect",
        clientId: "",
        cleanSession: false,
        keepAliveSeconds: 60,
        userName: USER,
        password: Buffer.from(PASSWORD),
      }),
    );
    expect(await closedWithin(r, 3000)).toBe(true);
    expect([...r.received()]).toEqual([0x20, 0x02, 0x00, 0x02]);
  });

  it("disconnects the first of two connections with the same client id", async () => {
    const { broker, port } = await startBroker();
    const first = await rawLoggedIn(port, "radio");
    const second = await rawLoggedIn(port, "radio");
    expect(await closedWithin(first, 2000)).toBe(true);
    expect(second.closedAt()).toBeNull();
    expect(broker.clients()).toHaveLength(1);
    expect(broker.clients()[0]?.clientId).toBe("radio");
  });

  it("closes a client silent for one and a half keep-alive periods, and not one that pings", async () => {
    const { port } = await startBroker();
    const quiet = await rawLoggedIn(port, "quiet", 1);
    const pinging = await rawLoggedIn(port, "pinging", 1);
    const start = Date.now();
    const pings = setInterval(() => pinging.sock.write(encodePacket({ type: "pingreq" })), 500);
    try {
      await quiet.closed;
      const after = quiet.closedAt()! - start;
      expect(after).toBeGreaterThanOrEqual(1300);
      expect(after).toBeLessThan(2500);
      await delay(300);
      expect(pinging.closedAt()).toBeNull();
      expect(pinging.packets().filter((p) => p.type === "pingresp").length).toBeGreaterThan(0);
    } finally {
      clearInterval(pings);
    }
  });

  it("closes a connection that sends no CONNECT in time", async () => {
    const { port } = await startBroker({ connectTimeoutMs: 200 });
    const r = await raw(port);
    const start = Date.now();
    expect(await closedWithin(r, 2000)).toBe(true);
    expect(Date.now() - start).toBeGreaterThanOrEqual(150);
  });

  it("closes connections over the limit before they log in", async () => {
    const { port } = await startBroker({ maxConnections: 2 });
    const a = await raw(port);
    const b = await raw(port);
    await delay(50);
    const c = await raw(port);
    expect(await closedWithin(c, 2000)).toBe(true);
    expect(a.closedAt()).toBeNull();
    expect(b.closedAt()).toBeNull();
  });

  it("closes a client that publishes faster than the rate limit", async () => {
    const { broker, port } = await startBroker({ publishesPerSecond: 5, publishBurst: 5 });
    const heard: string[] = [];
    broker.onPublish((topic) => heard.push(topic));
    const r = await rawLoggedIn(port, "chatty");
    r.sock.write(Buffer.concat(Array.from({ length: 20 }, () => publishBytes("msh/a", 0))));
    expect(await closedWithin(r, 2000)).toBe(true);
    expect(heard).toHaveLength(5);
  });

  it("acknowledges a QoS 1 publish, and closes on QoS 2 or a wildcard topic", async () => {
    const { port } = await startBroker();
    const ok = await rawLoggedIn(port, "ok");
    ok.sock.write(publishBytes("msh/a", 1));
    await until(() => ok.packets().some((p) => p.type === "puback"));
    expect(ok.packets()[1]).toEqual({ type: "puback", packetId: 7 });

    const qos2 = await rawLoggedIn(port, "qos2");
    qos2.sock.write(publishBytes("msh/a", 2));
    expect(await closedWithin(qos2, 2000)).toBe(true);

    const wild = await rawLoggedIn(port, "wild");
    // Built by hand, as the encoder would write it: a PUBLISH to msh/+.
    const topic = Buffer.from("msh/+");
    wild.sock.write(Buffer.from([0x30, 2 + topic.length + 1, 0x00, topic.length, ...topic, 0x21]));
    expect(await closedWithin(wild, 2000)).toBe(true);
  });

  it("refuses bad filters in SUBSCRIBE with 0x80, grants QoS 2 as 1, and answers UNSUBSCRIBE", async () => {
    const { broker, port } = await startBroker({ maxSubscriptionsPerClient: 2 });
    const r = await rawLoggedIn(port, "subs");
    r.sock.write(
      encodePacket({
        type: "subscribe",
        packetId: 3,
        subscriptions: [
          { filter: "a/#", qos: 2 },
          { filter: "a/#/b", qos: 0 },
          { filter: "b/+", qos: 0 },
          { filter: "c", qos: 1 },
        ],
      }),
    );
    await until(() => r.packets().some((p) => p.type === "suback"));
    expect(r.packets()[1]).toEqual({ type: "suback", packetId: 3, returnCodes: [1, 0x80, 0, 0x80] });
    r.sock.write(encodePacket({ type: "unsubscribe", packetId: 4, filters: ["a/#"] }));
    await until(() => r.packets().some((p) => p.type === "unsuback"));
    expect(broker.clients()[0]?.subscriptions).toEqual(["b/+"]);
    r.sock.write(encodePacket({ type: "disconnect" }));
    expect(await closedWithin(r, 3000)).toBe(true);
  });

  it("closes a connection from an address that is not allowed before reading anything", async () => {
    const seen: string[] = [];
    const { port } = await startBroker(
      {},
      {
        allowAddress: (a) => {
          seen.push(a);
          return false;
        },
      },
    );
    const r = await raw(port);
    expect(await closedWithin(r, 2000)).toBe(true);
    expect(seen).toEqual(["127.0.0.1"]);
  });
});
