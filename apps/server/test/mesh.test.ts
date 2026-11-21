/**
 * The mesh radio link, against stand-ins: a Meshtastic radio speaking MQTT JSON as its
 * documentation describes (an MQTT client of this repository's own), and a MeshCore
 * companion radio on a socket speaking the companion frames. No real radio was used.
 *
 * Covered: nothing open while nothing is set up; the set-up only from the computer
 * itself; the passwords never in a reply, the database, a log line or a backup; a radio
 * heard once and named; a message posted going out once, with what became of it, and
 * not coming back as an echo; refusals for what a radio cannot carry; the household's
 * broker as a client; MeshCore both ways, away and back; the frame and JSON readers
 * against garbage; the device list made from /dev alone.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { BoardMessage, BoardMessagesResponse, MeshMeta, MeshResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isHomeAddress } from "../src/modules/mesh/addresses.ts";
import {
  encodeFrame,
  FROM_RADIO,
  FrameReader,
  parseChannelMessage,
  RESP,
  sendChannelText,
  splitSender,
  TO_RADIO,
} from "../src/modules/mesh/meshcore/frames.ts";
import { downlink, nodeId, parseTopic, parseUplink } from "../src/modules/mesh/meshtastic/json.ts";
import { createBroker, type MqttBroker } from "../src/modules/mesh/mqtt/broker.ts";
import { createClient, type MqttClient } from "../src/modules/mesh/mqtt/client.ts";
import { listDevices, sttyArguments } from "../src/modules/mesh/serial.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const BROKER_PORT = 9398;
const PASSWORD = "kettle-on-at-four-517";
const CLIENT_PASSWORD = "household-broker-secret-88";
const ROOT = "msh/EU_868";
const RADIO_ID = "!a1b2c3d4";
const RADIO_NUM = 0xa1b2c3d4;
const quiet = { info() {}, warn() {}, debug() {} };

async function waitFor<T>(check: () => T | undefined | null | false, ms = 4000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > until) throw new Error("Waited too long");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Everything the server logged while a test ran, as text. */
function captureLog(app: TestApp): { text: () => string; stop: () => void } {
  const lines: string[] = [];
  const log = app.ctx.log as unknown as Record<string, (...args: unknown[]) => void>;
  const kept: Record<string, (...args: unknown[]) => void> = {};
  for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) {
    kept[level] = log[level]!;
    log[level] = (...args: unknown[]) => {
      // Requests and replies as Fastify's logger writes them (its serializers keep the method, address and status, never the body).
      const written = args.map((arg) =>
        arg && typeof arg === "object" && ("req" in arg || "res" in arg)
          ? { ...arg, req: undefined, res: undefined, request: undefined, url: (arg as { req?: { url?: string } }).req?.url }
          : arg,
      );
      lines.push(JSON.stringify(written, (_key, value) => (Buffer.isBuffer(value) ? value.toString("latin1") : value)));
      kept[level]!.apply(log, args);
    };
  }
  return { text: () => lines.join("\n"), stop: () => Object.assign(log, kept) };
}

/** A Meshtastic radio with MQTT and JSON on, as its documentation describes one. */
function standInRadio(port: number, password = PASSWORD, userName = "radio"): { client: MqttClient; downlinks: Buffer[] } {
  const downlinks: Buffer[] = [];
  const client = createClient({
    host: "127.0.0.1",
    port,
    clientId: RADIO_ID,
    userName,
    password,
    subscriptions: [{ filter: `${ROOT}/2/json/mqtt/#`, qos: 1 }],
    backoff: { firstMs: 200, maxMs: 1000 },
    log: quiet,
  });
  client.onMessage((_topic, payload) => downlinks.push(payload));
  client.start();
  return { client, downlinks };
}

const uplinkTopic = (channel = "LongFast") => `${ROOT}/2/json/${channel}/${RADIO_ID}`;
const textUplink = (from: number, id: number, text: string, channel = 0) =>
  Buffer.from(JSON.stringify({ channel, from, id, payload: { text }, sender: RADIO_ID, timestamp: 1763380000, to: -1, type: "text" }));

const mesh = async (app: TestApp) => (await app.api<MeshResponse>("GET", "/api/mesh")).body;
const history = async (app: TestApp, channel: string) =>
  (await app.api<BoardMessagesResponse>("GET", `/api/board/messages?channel=${encodeURIComponent(channel)}`)).body.messages;

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("Meshtastic, with Outpost as the broker", () => {
  let app: TestApp;
  let radio: ReturnType<typeof standInRadio> | null = null;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
  });
  afterAll(async () => {
    await radio?.client.stop();
    await app.close();
  });

  it("opens nothing until someone sets it up", async () => {
    const before = await mesh(app);
    expect(before.meshtastic.status.state).toBe("off");
    expect(before.meshcore.status.state).toBe("off");
    expect(before.channels).toEqual([]);
    expect(before.right.allowed).toBe(true);
    expect(await portOpen(BROKER_PORT)).toBe(false);
    // Not a setting anyone can change through the settings route.
    expect((await app.api("PATCH", "/api/settings", { "mesh.config": { meshtastic: { mode: "broker" } } })).status).toBe(400);
  });

  it("will not turn on without a password, and keeps the password out of every reply and the database", async () => {
    const refused = await app.api("PUT", "/api/mesh/meshtastic", { mode: "broker", broker: { port: BROKER_PORT, userName: "radio" } });
    expect(refused.status).toBe(400);
    const log = captureLog(app);
    try {
      const set = await app.api<MeshResponse>("PUT", "/api/mesh/meshtastic", {
        mode: "broker",
        broker: { port: BROKER_PORT, userName: "radio", password: PASSWORD },
        channels: [{ name: "LongFast", index: 0 }],
      });
      expect(set.status, JSON.stringify(set.body)).toBe(200);
      expect(set.body.meshtastic.status.state).toBe("listening");
      expect(set.body.meshtastic.config.broker).toEqual({ port: BROKER_PORT, userName: "radio", passwordSet: true });
      expect(JSON.stringify(set.body)).not.toContain(PASSWORD);
      expect(set.body.channels).toEqual([
        { id: "meshtastic:longfast", transport: "meshtastic", label: "LongFast", textBytes: 200, linkUp: true },
      ]);
      expect(await portOpen(BROKER_PORT)).toBe(true);

      // A wrong password is turned away.
      const wrong = standInRadio(BROKER_PORT, "not-the-password");
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(wrong.client.status().lastError).toMatch(/user name or password/i);
      await wrong.client.stop();

      radio = standInRadio(BROKER_PORT);
      await waitFor(() => radio!.client.status().state === "connected");
      const connected = await waitFor(() => app.ctx.services.mesh.meshtastic.status().state === "connected");
      expect(connected).toBe(true);
      expect((await mesh(app)).meshtastic.status.peers).toEqual([expect.objectContaining({ clientId: RADIO_ID, address: "127.0.0.1" })]);
    } finally {
      log.stop();
    }
    expect(log.text()).not.toContain(PASSWORD);
    const secretsFile = path.join(app.ctx.config.dataDir, "mesh", "secrets.json");
    expect(fs.statSync(secretsFile).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(secretsFile, "utf8")).not.toContain(PASSWORD);
    app.ctx.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    expect(fs.readFileSync(path.join(app.ctx.config.dataDir, "outpost.db")).includes(Buffer.from(PASSWORD))).toBe(false);
    expect(JSON.stringify((await app.api("GET", "/api/settings")).body)).not.toContain("mesh");
  });

  it("puts a radio's message on the channel once, named as the radio names its sender", async () => {
    const r = radio!;
    await r.client.publish(
      uplinkTopic(),
      Buffer.from(
        JSON.stringify({
          channel: 0,
          from: 0x0badcafe,
          id: 1,
          payload: { id: "!0badcafe", longname: "Hilltop Jo", shortname: "JO" },
          sender: RADIO_ID,
          timestamp: 1,
          to: -1,
          type: "nodeinfo",
        }),
      ),
      1,
    );
    await r.client.publish(uplinkTopic(), textUplink(0x0badcafe, 4242, "Snow on the top road"), 1);
    await r.client.publish(uplinkTopic(), textUplink(0x0badcafe, 4242, "Snow on the top road"), 1);
    // Heard as encoded protocol buffers too: ignored, not read.
    await r.client.publish(`${ROOT}/2/e/LongFast/${RADIO_ID}`, Buffer.from([0x0a, 0x02, 0xff, 0x00]), 0);
    const kept = await waitFor(() => {
      const rows = app.ctx.services.board.list({ channel: "meshtastic:longfast" }).messages;
      return rows.length > 0 ? rows : null;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const list = await history(app, "meshtastic:longfast");
    expect(list).toHaveLength(1);
    expect(kept[0]).toMatchObject({ source: "meshtastic", author: "Hilltop Jo", body: "Snow on the top road" });
    expect((list[0]!.meta as MeshMeta).node).toEqual({ id: "!0badcafe", shortName: "JO", longName: "Hilltop Jo" });
    // Nothing of it reaches the household's own board.
    expect((await history(app, "board")).some((message) => message.body.includes("Snow"))).toBe(false);
    const status = (await mesh(app)).meshtastic.status;
    expect(status.json).toBe(true);
    expect(status.heardRoot).toBe(ROOT);
    expect(status.gateway?.id).toBe(RADIO_ID);
    expect(status.lastHeardAt).toBeGreaterThan(0);
  });

  it("hands a message written here to the radio once, says so, and does not keep it again when the radio publishes it back", async () => {
    const r = radio!;
    const posted = await app.api("POST", "/api/board/messages", {
      author: "Sam",
      body: "Roads clear by noon?",
      channel: "meshtastic:longfast",
    });
    expect(posted.status).toBe(200);
    const id = (posted.body.message as BoardMessage).id;
    const payload = await waitFor(() => r.downlinks[0]);
    expect(JSON.parse(payload.toString())).toEqual({ from: RADIO_NUM, type: "sendtext", payload: "Sam: Roads clear by noon?", channel: 0 });
    const delivered = await waitFor(() => (app.ctx.services.board.get(id).meta as MeshMeta | null)?.delivery);
    expect(delivered.state).toBe("handed");
    // The radio publishes what it sent: recognised, not kept twice.
    await r.client.publish(uplinkTopic(), textUplink(RADIO_NUM, 77, "Sam: Roads clear by noon?"), 1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await history(app, "meshtastic:longfast")).filter((message) => message.body.includes("Roads clear"))).toHaveLength(1);
    expect(r.downlinks).toHaveLength(1);
    // Posted on the household's board: not sent.
    await app.api("POST", "/api/board/messages", { author: "Sam", body: "Kitchen only" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(r.downlinks).toHaveLength(1);
  });

  it("refuses what a radio cannot carry rather than cutting it", async () => {
    const long = await app.api("POST", "/api/board/messages", { author: "Sam", body: "é".repeat(100), channel: "meshtastic:longfast" });
    expect(long.status).toBe(400);
    expect(long.body.error.message).toMatch(/205 bytes with your name in front.*at most 200/);
    const fits = await app.api("POST", "/api/board/messages", { author: "Sam", body: "é".repeat(97), channel: "meshtastic:longfast" });
    expect(fits.status).toBe(200);
    const checkIn = await app.api("POST", "/api/board/check-ins", {
      author: "Sam",
      status: "safe",
      place: "Mum's",
      channel: "meshtastic:longfast",
    });
    expect(checkIn.status).toBe(200);
    const sent = await waitFor(() => radio!.downlinks.find((payload) => payload.toString().includes("I'm safe")));
    expect(JSON.parse(sent.toString()).payload).toBe("Sam: I'm safe (Mum's)");
    const edit = await app.api("PATCH", `/api/board/messages/${(fits.body.message as BoardMessage).id}`, {
      by: "Sam",
      body: "changed",
      baseUpdatedAt: (fits.body.message as BoardMessage).updatedAt,
    });
    expect(edit.status).toBe(400);
  });

  it("names a channel heard but not carried, and keeps nothing from it", async () => {
    await radio!.client.publish(uplinkTopic("Family"), textUplink(0x0badcafe, 9, "On the family channel", 1), 1);
    await waitFor(() => app.ctx.services.mesh.meshtastic.status().otherChannels.includes("Family"));
    expect(app.ctx.services.board.list({ channel: "meshtastic:family" }).messages).toEqual([]);
  });

  it("sends a test message on a carried channel only", async () => {
    expect((await app.api("POST", "/api/mesh/test", { channel: "board", author: "Sam" })).status).toBe(400);
    const test = await app.api("POST", "/api/mesh/test", { channel: "meshtastic:longfast", author: "Sam" });
    expect(test.status).toBe(200);
    await waitFor(() => radio!.downlinks.find((payload) => payload.toString().includes("Test message from Outpost")));
  });

  it("leaves the password out of a backup", async () => {
    const backup = await app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
    expect(backup.statusCode).toBe(200);
    expect(backup.rawPayload.includes(Buffer.from(PASSWORD))).toBe(false);
    expect(backup.rawPayload.includes(Buffer.from("secrets.json"))).toBe(false);
  });

  it("closes the port when turned off, and erasing everything takes the set-up and the password", async () => {
    const off = await app.api<MeshResponse>("PUT", "/api/mesh/meshtastic", { mode: "off" });
    expect(off.body.meshtastic.status.state).toBe("off");
    expect(off.body.channels).toEqual([]);
    expect(await portOpen(BROKER_PORT)).toBe(false);
    expect(off.body.meshtastic.config.broker.passwordSet).toBe(true);
    app.ctx.services.settings.reset();
    expect((await mesh(app)).meshtastic.config.broker.passwordSet).toBe(false);
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "mesh", "secrets.json"))).toBe(false);
  });
});

describe("who may set it up", () => {
  it("only the computer Outpost runs on; any device may see it", async () => {
    const app = await createTestApp({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" }, undefined, { voacapData: false });
    try {
      const phone = { remoteAddress: "192.168.1.20" };
      const seen = await app.api<MeshResponse>("GET", "/api/mesh", undefined, phone);
      expect(seen.status).toBe(200);
      expect(seen.body.right.allowed).toBe(false);
      for (const [url, body] of [
        ["/api/mesh/meshtastic", { mode: "broker", broker: { port: BROKER_PORT, userName: "radio", password: "x" } }],
        ["/api/mesh/meshcore", { mode: "tcp", host: "192.168.1.50", port: 5000 }],
      ] as const) {
        const refused = await app.api("PUT", url, body, phone);
        expect(refused.status).toBe(403);
        expect(refused.body.error.message).toMatch(/only be changed at the computer Outpost runs on.*OUTPOST_ALLOW_REMOTE_SETTINGS=true/);
      }
      expect(fs.existsSync(path.join(app.ctx.config.dataDir, "mesh", "secrets.json"))).toBe(false);
      expect((await app.api<MeshResponse>("GET", "/api/mesh")).body.right.allowed).toBe(true);
      // A serial device must be one the server listed itself.
      const typed = await app.api("PUT", "/api/mesh/meshcore", { mode: "serial", device: "/etc/passwd" });
      expect(typed.status).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("lets only the home network near the broker", () => {
    expect(isHomeAddress("127.0.0.1", false)).toBe(true);
    expect(isHomeAddress("192.168.1.40", false)).toBe(false);
    for (const address of ["192.168.1.40", "10.0.0.3", "172.20.1.1", "::ffff:192.168.0.9", "fd12:3456::1", "fe80::1%en0"])
      expect(isHomeAddress(address, true)).toBe(true);
    for (const address of ["8.8.8.8", "172.32.0.1", "100.64.0.1", "2001:db8::1", ""]) expect(isHomeAddress(address, true)).toBe(false);
  });
});

describe("Meshtastic, through the household's own broker", () => {
  let app: TestApp;
  let broker: MqttBroker;
  let port = 0;
  let radio: ReturnType<typeof standInRadio>;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
    broker = createBroker({
      host: "127.0.0.1",
      port: 0,
      checkLogin: (user, password) =>
        (user === "radio" && password.toString() === PASSWORD) || (user === "outpost" && password.toString() === CLIENT_PASSWORD),
      allowAddress: () => true,
      log: quiet,
    });
    port = (await broker.listen()).port;
    radio = standInRadio(port);
    await waitFor(() => radio.client.status().state === "connected");
  });
  afterAll(async () => {
    await radio.client.stop();
    await app.close();
    await broker.close();
  });

  it("connects, hears, and hands messages to the broker, saying only that", async () => {
    const log = captureLog(app);
    try {
      const set = await app.api<MeshResponse>("PUT", "/api/mesh/meshtastic", {
        mode: "client",
        client: { host: "127.0.0.1", port, userName: "outpost", password: CLIENT_PASSWORD, rootTopic: ROOT },
        channels: [{ name: "LongFast", index: 0 }],
      });
      expect(set.status, JSON.stringify(set.body)).toBe(200);
      expect(JSON.stringify(set.body)).not.toContain(CLIENT_PASSWORD);
      await waitFor(() => app.ctx.services.mesh.meshtastic.status().state === "connected");
      await waitFor(() => broker.clients().some((client) => client.clientId.startsWith("outpost-") && client.subscriptions.length === 2));
      await radio.client.publish(uplinkTopic(), textUplink(0x0badcafe, 5, "Through the router"), 1);
      await waitFor(() => app.ctx.services.board.list({ channel: "meshtastic:longfast" }).messages.length === 1);
      const posted = await app.api("POST", "/api/board/messages", { author: "Alex", body: "Heard", channel: "meshtastic:longfast" });
      const payload = await waitFor(() => radio.downlinks[0]);
      expect(JSON.parse(payload.toString())).toMatchObject({ type: "sendtext", payload: "Alex: Heard", from: RADIO_NUM });
      const delivery = await waitFor(() => (app.ctx.services.board.get(posted.body.message.id).meta as MeshMeta | null)?.delivery);
      expect(delivery.state).toBe("broker");
      await app.api("PUT", "/api/mesh/meshtastic", { mode: "off" });
      await waitFor(() => !broker.clients().some((client) => client.clientId.startsWith("outpost-")));
    } finally {
      log.stop();
    }
    expect(log.text()).not.toContain(CLIENT_PASSWORD);
  });
});

/** A MeshCore companion radio on a socket: answers the commands Outpost sends, as the protocol document describes. */
function standInCompanion() {
  const sockets = new Set<net.Socket>();
  const waiting: Buffer[] = [];
  const received: Array<{ index: number; text: string }> = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    const reader = new FrameReader(TO_RADIO);
    const reply = (payload: Buffer) => socket.write(encodeFrame(payload, FROM_RADIO));
    socket.on("data", (chunk) => {
      for (const frame of reader.push(chunk)) {
        const code = frame[0];
        if (code === 0x01) {
          const self = Buffer.alloc(58);
          self[0] = RESP.selfInfo;
          reply(Buffer.concat([self, Buffer.from("Shed radio")]));
        } else if (code === 0x16) reply(Buffer.from([RESP.deviceInfo, 3]));
        else if (code === 0x1f) {
          if (frame[1] === 0) {
            const info = Buffer.alloc(50);
            info[0] = RESP.channelInfo;
            info[1] = 0;
            info.write("Public", 2);
            reply(info);
          } else reply(Buffer.from([RESP.err, 2]));
        } else if (code === 0x0a) reply(waiting.shift() ?? Buffer.from([RESP.noMoreMessages]));
        else if (code === 0x03) {
          received.push({ index: frame[2]!, text: frame.subarray(7).toString("utf8") });
          const sent = Buffer.alloc(10);
          sent[0] = RESP.sent;
          sent[1] = 1;
          reply(sent);
        }
      }
    });
  });
  return {
    server,
    received,
    async listen() {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      return (server.address() as net.AddressInfo).port;
    },
    /** A channel message arrives over the air: queued, and the app told. */
    hear(index: number, text: string, timestamp: number) {
      const head = Buffer.alloc(11);
      head[0] = RESP.channelMessageV3;
      head.writeInt8(26, 1); // SNR 6.5 dB
      head[4] = index;
      head[5] = 2;
      head[6] = 0;
      head.writeUInt32LE(timestamp, 7);
      waiting.push(Buffer.concat([head, Buffer.from(text)]));
      for (const socket of sockets) socket.write(encodeFrame(Buffer.from([0x83]), FROM_RADIO));
    },
    dropAll() {
      for (const socket of sockets) socket.destroy();
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("MeshCore, by its network port", () => {
  let app: TestApp;
  const radio = standInCompanion();
  let port = 0;
  beforeAll(async () => {
    port = await radio.listen();
    app = await createTestApp({}, undefined, { voacapData: false });
  });
  afterAll(async () => {
    await app.close();
    radio.dropAll();
    await radio.close();
  });

  it("connects, hears a channel once, sends with the name in front, and comes back after the radio goes", async () => {
    const set = await app.api<MeshResponse>("PUT", "/api/mesh/meshcore", { mode: "tcp", host: "127.0.0.1", port, channels: [0] });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    await waitFor(() => app.ctx.services.mesh.meshcore.status().state === "connected");
    const response = await mesh(app);
    expect(response.meshcore.status.radioName).toBe("Shed radio");
    expect(response.channels).toEqual([{ id: "meshcore:0", transport: "meshcore", label: "Public", textBytes: 133, linkUp: true }]);

    radio.hear(0, "Robin: Power back on in the village", 1763380100);
    radio.hear(0, "Robin: Power back on in the village", 1763380100);
    radio.hear(3, "Not carried", 1763380101);
    await waitFor(() => app.ctx.services.board.list({ channel: "meshcore:0" }).messages.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const kept = app.ctx.services.board.list({ channel: "meshcore:0" }).messages;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ source: "meshcore", author: "Robin", body: "Power back on in the village" });
    expect((kept[0]!.meta as MeshMeta).snr).toBe(6.5);

    const posted = await app.api("POST", "/api/board/messages", { author: "Sam", body: "Thanks", channel: "meshcore:0" });
    await waitFor(() => radio.received.length === 1);
    expect(radio.received[0]).toEqual({ index: 0, text: "Sam: Thanks" });
    const delivery = await waitFor(() => (app.ctx.services.board.get(posted.body.message.id).meta as MeshMeta | null)?.delivery);
    expect(delivery.state).toBe("handed");
    const tooLong = await app.api("POST", "/api/board/messages", { author: "Sam", body: "x".repeat(130), channel: "meshcore:0" });
    expect(tooLong.status).toBe(400);

    radio.dropAll();
    const away = await waitFor(() => {
      const status = app.ctx.services.mesh.meshcore.status();
      return status.state === "away" ? status : null;
    });
    expect(away.retryAt).toBeGreaterThan(Date.now());
    await waitFor(() => app.ctx.services.mesh.meshcore.status().state === "connected", 5000);

    const off = await app.api<MeshResponse>("PUT", "/api/mesh/meshcore", { mode: "off" });
    expect(off.body.meshcore.status).toMatchObject({ state: "off", retryAt: null });
  });
});

describe("reading what radios send", () => {
  it("finds MeshCore frames among noise, skips one too long whole, and reads one split across chunks", () => {
    const reader = new FrameReader();
    const frame = encodeFrame(Buffer.from([RESP.ok]), FROM_RADIO);
    const huge = Buffer.concat([Buffer.from([FROM_RADIO, 0xe8, 0x03]), Buffer.alloc(1000, 0x3e)]);
    const out = [
      ...reader.push(Buffer.from("boot log line\r\n")),
      ...reader.push(huge),
      ...reader.push(frame.subarray(0, 2)),
      ...reader.push(frame.subarray(2)),
      ...reader.push(Buffer.from([FROM_RADIO, 0, 0])),
    ];
    expect(out).toEqual([Buffer.from([RESP.ok])]);
    expect(reader.skipped).toBe(1);
  });

  it("reads channel messages and refuses short ones", () => {
    const v1 = Buffer.concat([Buffer.from([RESP.channelMessage, 2, 1, 0, 0x10, 0x20, 0x30, 0x40]), Buffer.from("Ash: hi\0\0")]);
    expect(parseChannelMessage(v1)).toEqual({
      channelIndex: 2,
      pathLength: 1,
      textType: 0,
      timestamp: 0x40302010,
      text: "Ash: hi",
      snr: null,
    });
    expect(parseChannelMessage(Buffer.from([RESP.channelMessage, 1, 2]))).toBeNull();
    expect(parseChannelMessage(Buffer.from([RESP.ok]))).toBeNull();
    expect(splitSender("Ash: hi: there")).toEqual({ name: "Ash", words: "hi: there" });
    expect(splitSender("no sender here")).toEqual({ name: null, words: "no sender here" });
    expect([...sendChannelText(1, "hé", 0x01020304)]).toEqual([0x03, 0x00, 0x01, 0x04, 0x03, 0x02, 0x01, 0x68, 0xc3, 0xa9]);
  });

  it("reads Meshtastic's JSON as documented, and nothing else", () => {
    expect(parseTopic("msh/EU_868/2/json/LongFast/!a1b2c3d4")).toEqual({
      root: "msh/EU_868",
      format: "json",
      channel: "LongFast",
      gatewayId: "!a1b2c3d4",
    });
    expect(parseTopic("msh/US/2/e/LongFast/!0000abcd")).toMatchObject({ format: "encoded" });
    expect(parseTopic("msh/US/2/json/mqtt/")).toBeNull();
    expect(parseTopic("something/else")).toBeNull();
    expect(nodeId(-1)).toBe("!ffffffff");
    expect(parseUplink(Buffer.from(JSON.stringify({ from: 1, id: 2, type: "text", payload: "plain", to: 4294967295 })))).toMatchObject({
      text: "plain",
      broadcast: true,
    });
    expect(parseUplink(Buffer.from(JSON.stringify({ from: 1, id: 2, type: "text", payload: { text: "dm" }, to: 7 })))).toMatchObject({
      broadcast: false,
    });
    for (const garbage of [
      "not json",
      "[]",
      "null",
      '{"type":"text"}',
      '{"from":1,"type":"text","payload":{"text":"no id"}}',
      '{"from":"1","id":2,"type":"text","payload":"x"}',
    ])
      expect(parseUplink(Buffer.from(garbage))).toBeNull();
    expect(parseUplink(Buffer.alloc(9000, 0x20))).toBeNull();
    expect(JSON.parse(downlink(0xa1b2c3d4, 2, "hi").toString())).toEqual({ from: 2712847316, type: "sendtext", payload: "hi", channel: 2 });
  });

  it("lists only the names USB radios get, and sets a device up with fixed arguments", () => {
    const dev: Record<string, string[]> = {
      "/dev": [
        "cu.usbmodem14101",
        "tty.usbmodem14101",
        "cu.Bluetooth-Incoming-Port",
        "cu.usbserial-0001",
        "ttyACM0",
        "ttyUSB3",
        "ttyS0",
        "sda",
      ],
      "/dev/serial/by-id": ["usb-Heltec_HT-n5262-if00"],
    };
    const read = (dir: string) => dev[dir] ?? [];
    expect(listDevices("darwin", read, () => null).map((device) => device.path)).toEqual([
      "/dev/cu.usbmodem14101",
      "/dev/cu.usbserial-0001",
    ]);
    expect(listDevices("linux", read, (file) => (file.includes("Heltec") ? "/dev/ttyACM0" : file)).map((device) => device.path)).toEqual([
      "/dev/serial/by-id/usb-Heltec_HT-n5262-if00",
      "/dev/ttyUSB3",
    ]);
    expect(listDevices("other", read)).toEqual([]);
    expect(sttyArguments("/dev/ttyACM0", "linux").slice(0, 3)).toEqual(["-F", "/dev/ttyACM0", "115200"]);
    expect(sttyArguments("/dev/cu.usbmodem1", "darwin")[0]).toBe("-f");
  });
});
