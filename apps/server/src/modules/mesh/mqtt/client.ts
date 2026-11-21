/**
 * An MQTT 3.1.1 client, for when the household already runs a broker and the Meshtastic
 * radio talks to that: Outpost connects to it, subscribes to the radio's topics, and
 * publishes to it.
 *
 * It always asks for a clean session, so nothing is kept on the broker between connections;
 * after every CONNACK it subscribes afresh. When the connection fails or is lost it tries
 * again after a wait that doubles each time (with a little jitter, so several clients do not
 * return together), up to a ceiling, and that includes a broker refusing the login: a wrong
 * password is retried slowly rather than hammered.
 *
 * Timers run only while they have something to do: the wait to connect, one keep-alive timer
 * while connected, the wait before trying again, and one per QoS 1 publish waiting for its
 * PUBACK. A stopped client has none.
 */
import type net from "node:net";
import { socketBytes } from "../../../core/socket-bytes.ts";
import type { MqttLog } from "./broker.ts";
import {
  CONNACK,
  encodePacket,
  MqttProtocolError,
  type Packet,
  PacketReader,
  SUBACK_FAILURE,
  validFilter,
  validTopicName,
} from "./packets.ts";
import { describeSocketError, openSocket, type TlsChoice } from "./transport.ts";

export interface ClientOptions {
  host: string;
  port: number;
  clientId: string;
  /** TLS to the broker, checked (./transport.ts); null or left out: plain TCP. */
  tls?: TlsChoice | null;
  userName?: string;
  password?: string;
  /** Default 120. */
  keepAliveSeconds?: number;
  subscriptions: Array<{ filter: string; qos: 0 | 1 }>;
  /** How long to wait for the TCP connection and CONNACK together. Default 10000. */
  connectTimeoutMs?: number;
  /** Default 65536. */
  maxPacketBytes?: number;
  /** Default 2000 doubling to 300000. */
  backoff?: { firstMs: number; maxMs: number };
  log: MqttLog;
}

export type ClientState = "connecting" | "connected" | "away" | "stopped";

export interface MqttClient {
  /** Connect; on failure or loss try again with doubling back-off until `stop()`. */
  start(): void;
  /** DISCONNECT if connected, close, and clear every timer. */
  stop(): Promise<void>;
  /** QoS 1 resolves on PUBACK; rejects (plain-words Error) when not connected or on timeout (default 10 s). */
  publish(topic: string, payload: Buffer, qos: 0 | 1, timeoutMs?: number): Promise<void>;
  onMessage(listener: (topic: string, payload: Buffer) => void): () => void;
  onState(listener: () => void): () => void;
  /** `since` is when the current state began; `retryAt` is when the next attempt is due while away. */
  status(): { state: ClientState; since: number | null; lastError: string | null; retryAt: number | null };
}

const REFUSALS: Record<number, string> = {
  [CONNACK.badProtocolVersion]: "The broker does not speak MQTT 3.1.1.",
  [CONNACK.identifierRejected]: "The broker refused the client id.",
  [CONNACK.serverUnavailable]: "The broker is unavailable.",
  [CONNACK.badUserNameOrPassword]: "The broker refused the user name or password.",
  [CONNACK.notAuthorised]: "The broker refused the user name or password.",
};

interface Pending {
  resolve(): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export function createClient(options: ClientOptions): MqttClient {
  const keepAliveSeconds = options.keepAliveSeconds ?? 120;
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  const maxPacketBytes = options.maxPacketBytes ?? 65_536;
  const backoff = options.backoff ?? { firstMs: 2_000, maxMs: 300_000 };
  const { log } = options;
  const where = { host: options.host, port: options.port, clientId: options.clientId };

  let state: ClientState = "stopped";
  let since: number | null = null;
  let lastError: string | null = null;
  let retryAt: number | null = null;
  let attempts = 0;

  let socket: net.Socket | null = null;
  let connectTimer: NodeJS.Timeout | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let keepAliveTimer: NodeJS.Timeout | null = null;
  /** A PINGREQ has gone and nothing has come back since. */
  let awaitingPing = false;
  let nextPacketId = 1;
  /** What the last SUBSCRIBE asked for, to name refused filters from the SUBACK. */
  let subscribed: ClientOptions["subscriptions"] = [];
  const pending = new Map<number, Pending>();

  const messageListeners = new Set<(topic: string, payload: Buffer) => void>();
  const stateListeners = new Set<() => void>();

  function setState(next: ClientState): void {
    state = next;
    since = next === "stopped" ? null : Date.now();
    if (next !== "away") retryAt = null;
    for (const listener of stateListeners) {
      try {
        listener();
      } catch (error) {
        log.warn({ err: (error as Error).message }, "An MQTT state listener failed");
      }
    }
  }

  function clearTimers(): void {
    for (const timer of [connectTimer, retryTimer, keepAliveTimer]) if (timer) clearTimeout(timer);
    connectTimer = null;
    retryTimer = null;
    keepAliveTimer = null;
  }

  function failPending(message: string): void {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
  }

  function send(packet: Packet): void {
    if (socket && !socket.destroyed && socket.writable) socket.write(encodePacket(packet));
  }

  function connect(): void {
    retryTimer = null;
    setState("connecting");
    const reader = new PacketReader(maxPacketBytes);
    let socketError: string | null = null;
    const { socket: sock, ready } = openSocket(options.host, options.port, options.tls ?? null);
    socket = sock;
    sock.setNoDelay(true);
    connectTimer = setTimeout(() => {
      connectTimer = null;
      lose(sock, "The broker did not answer in time.");
    }, connectTimeoutMs);

    sock.on(ready, () => {
      const packet: Packet = { type: "connect", clientId: options.clientId, cleanSession: true, keepAliveSeconds };
      if (options.userName !== undefined) packet.userName = options.userName;
      if (options.password !== undefined) packet.password = Buffer.from(options.password, "utf8");
      sock.write(encodePacket(packet));
    });
    sock.on("data", (chunk) => {
      if (socket !== sock) return;
      let packets: Packet[];
      try {
        packets = reader.push(socketBytes(chunk));
      } catch (error) {
        const reason = error instanceof MqttProtocolError ? error.message : "unreadable packet";
        return lose(sock, `The broker sent something that is not MQTT 3.1.1 (${reason})`);
      }
      awaitingPing = false;
      for (const packet of packets) {
        if (socket !== sock) return;
        handle(sock, packet);
      }
    });
    sock.on("error", (error: NodeJS.ErrnoException) => {
      log.debug?.({ ...where, err: error.message }, "MQTT client socket error");
      socketError = describeSocketError(error, options.host, options.port, Boolean(options.tls));
    });
    sock.on("close", () => {
      if (socket === sock) lose(sock, socketError ?? "The connection to the broker was lost.");
    });
  }

  function handle(sock: net.Socket, packet: Packet): void {
    switch (packet.type) {
      case "connack": {
        if (state !== "connecting") {
          lose(sock, "The broker sent a second CONNACK.");
          return;
        }
        if (connectTimer) clearTimeout(connectTimer);
        connectTimer = null;
        if (packet.returnCode !== CONNACK.accepted) {
          const message = REFUSALS[packet.returnCode] ?? `The broker refused the connection (code ${packet.returnCode}).`;
          log.warn({ ...where, returnCode: packet.returnCode }, "The MQTT broker refused the connection");
          lose(sock, message);
          return;
        }
        attempts = 0;
        lastError = null;
        setState("connected");
        log.info(where, "Connected to the MQTT broker");
        subscribed = options.subscriptions.filter((s) => validFilter(s.filter));
        for (const s of options.subscriptions) {
          if (!validFilter(s.filter)) log.warn({ ...where, filter: s.filter }, "Not subscribing to an invalid MQTT topic filter");
        }
        if (subscribed.length > 0) send({ type: "subscribe", packetId: takePacketId(), subscriptions: subscribed });
        armKeepAlive();
        return;
      }
      case "suback": {
        // Matched to the request only by being the one sent; a refusal is worth a word.
        const refused = packet.returnCodes.flatMap((code, i) => (code === SUBACK_FAILURE ? [subscribed[i]?.filter] : []));
        if (refused.length > 0) log.warn({ ...where, refused }, "The MQTT broker refused some subscriptions");
        return;
      }
      case "publish": {
        if (packet.qos === 2) {
          lose(sock, "The broker sent a QoS 2 message, which this client does not take.");
          return;
        }
        if (packet.qos === 1) send({ type: "puback", packetId: packet.packetId! });
        for (const listener of messageListeners) {
          try {
            listener(packet.topic, packet.payload);
          } catch (error) {
            log.warn({ err: (error as Error).message, topic: packet.topic }, "An MQTT message listener failed");
          }
        }
        return;
      }
      case "puback": {
        const entry = pending.get(packet.packetId);
        if (!entry) return;
        pending.delete(packet.packetId);
        clearTimeout(entry.timer);
        entry.resolve();
        return;
      }
      case "pingresp":
      case "unsuback":
        return;
      default:
        lose(sock, `The broker sent an unexpected ${packet.type} packet.`);
        return;
    }
  }

  /** One timer per period: send PINGREQ, and if nothing at all has come back by the next, the connection is gone. */
  function armKeepAlive(): void {
    if (keepAliveSeconds <= 0) return;
    awaitingPing = false;
    const tick = () => {
      keepAliveTimer = null;
      if (state !== "connected" || !socket) return;
      if (awaitingPing) return lose(socket, "The broker stopped answering.");
      awaitingPing = true;
      send({ type: "pingreq" });
      keepAliveTimer = setTimeout(tick, keepAliveSeconds * 1000);
    };
    keepAliveTimer = setTimeout(tick, keepAliveSeconds * 1000);
  }

  function takePacketId(): number {
    let id = nextPacketId;
    while (pending.has(id)) id = id === 65_535 ? 1 : id + 1;
    nextPacketId = id === 65_535 ? 1 : id + 1;
    return id;
  }

  /** The connection `sock` has failed or ended: tidy up and, unless stopped, wait and try again. */
  function lose(sock: net.Socket, message: string): void {
    if (socket !== sock) return;
    socket = null;
    sock.destroy();
    clearTimers();
    failPending("The connection to the broker was lost before it acknowledged the message.");
    if (state === "stopped") return;
    const wasConnected = state === "connected";
    lastError = message;
    const base = Math.min(backoff.maxMs, backoff.firstMs * 2 ** attempts);
    const delay = Math.round(Math.min(backoff.maxMs, base * (1 + Math.random() * 0.2)));
    attempts = Math.min(attempts + 1, 30);
    retryAt = Date.now() + delay;
    retryTimer = setTimeout(connect, delay);
    log.info({ ...where, reason: message, retryInMs: delay, wasConnected }, "MQTT connection to the broker is down; trying again later");
    setState("away");
  }

  return {
    start() {
      if (state !== "stopped") return;
      attempts = 0;
      lastError = null;
      connect();
    },

    stop() {
      const sock = socket;
      socket = null;
      clearTimers();
      failPending("The MQTT client was stopped before the broker acknowledged the message.");
      if (state !== "stopped") setState("stopped");
      if (!sock || sock.destroyed) return Promise.resolve();
      return new Promise((resolve) => {
        sock.once("close", () => resolve());
        if (sock.writable && sock.readyState === "open") {
          // Ending after DISCONNECT, and destroying soon after in case the broker does not close.
          sock.end(encodePacket({ type: "disconnect" }));
          sock.setTimeout(1_000, () => sock.destroy());
        } else {
          sock.destroy();
        }
      });
    },

    publish(topic, payload, qos, timeoutMs = 10_000) {
      if (state !== "connected" || !socket) return Promise.reject(new Error("Not connected to the MQTT broker."));
      if (!validTopicName(topic)) return Promise.reject(new Error(`"${topic}" is not a topic a message can be published to.`));
      if (qos === 0) {
        send({ type: "publish", topic, payload, qos: 0, retain: false, dup: false });
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        const packetId = takePacketId();
        const timer = setTimeout(() => {
          pending.delete(packetId);
          reject(new Error("The broker did not acknowledge the message in time."));
        }, timeoutMs);
        pending.set(packetId, { resolve, reject, timer });
        send({ type: "publish", topic, payload, qos: 1, retain: false, dup: false, packetId });
      });
    },

    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },

    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },

    status() {
      return { state, since, lastError, retryAt };
    },
  };
}
