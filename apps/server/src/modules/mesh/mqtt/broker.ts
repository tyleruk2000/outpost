/**
 * A small MQTT 3.1.1 broker, for a Meshtastic radio on the home network to connect to. The
 * radio logs in, subscribes to its downlink topics and publishes what it hears; Outpost hears
 * every publish through `onPublish` and can publish to the radio with `publish`.
 *
 * It is deliberately small, and keeps nothing: every session is clean, nothing is retained,
 * will messages are never sent, and QoS 2 is refused. It is also guarded, since anything on
 * the network can reach it: a login is required, connections are few, packets small and
 * publishes rate-limited, and a client that breaks any rule is disconnected.
 *
 * Nothing runs between packets. The keep-alive is the socket's own inactivity timeout, the
 * rate limit is worked out from timestamps when a publish arrives, and the only timers are
 * the wait for a new connection's CONNECT and the wait for acknowledgements in `publish`.
 */
import { randomBytes } from "node:crypto";
import net from "node:net";
import {
  CONNACK,
  encodePacket,
  MqttProtocolError,
  type Packet,
  PacketReader,
  SUBACK_FAILURE,
  topicMatches,
  validFilter,
  validTopicName,
} from "./packets.ts";

export interface MqttLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  debug?(obj: object, msg: string): void;
}

export interface BrokerLimits {
  maxPacketBytes: number;
  maxConnections: number;
  publishesPerSecond: number;
  publishBurst: number;
  connectTimeoutMs: number;
  maxSubscriptionsPerClient: number;
  maxInflight: number;
}

export const DEFAULT_BROKER_LIMITS: BrokerLimits = {
  maxPacketBytes: 65_536,
  maxConnections: 8,
  publishesPerSecond: 20,
  publishBurst: 50,
  connectTimeoutMs: 10_000,
  maxSubscriptionsPerClient: 32,
  maxInflight: 16,
};

export interface BrokerOptions {
  host: string;
  port: number;
  /** Called with what CONNECT carried; true lets it in. The caller compares in constant time. A CONNECT without a user name or password is refused (CONNACK 4) without calling it. */
  checkLogin(userName: string, password: Buffer): boolean;
  /** Called with the remote address of each new TCP connection before anything is read; false closes it at once. */
  allowAddress(address: string): boolean;
  limits?: Partial<BrokerLimits>;
  log: MqttLog;
}

export interface BrokerClientInfo {
  clientId: string;
  address: string;
  since: number;
  subscriptions: string[];
}

export interface MqttBroker {
  /** Rejects with an Error whose message says in plain words when the port is in use or not allowed. */
  listen(): Promise<{ port: number }>;
  /** Closes every connection and the listener; no timer is left behind. */
  close(): Promise<void>;
  /** Publish from Outpost itself to every matching subscriber. QoS 1 resolves when each subscriber granted QoS 1 has sent PUBACK, or after `timeoutMs` (default 10 s). */
  publish(topic: string, payload: Buffer, qos: 0 | 1, timeoutMs?: number): Promise<{ matched: number; acknowledged: number }>;
  onPublish(listener: (topic: string, payload: Buffer, from: { clientId: string; address: string }) => void): () => void;
  /** A client connected, disconnected or changed its subscriptions. */
  onClientsChanged(listener: () => void): () => void;
  clients(): BrokerClientInfo[];
}

type Settle = (acknowledged: boolean) => void;

interface Connection {
  socket: net.Socket;
  address: string;
  reader: PacketReader;
  /** Set once CONNECT has been accepted. */
  clientId: string | null;
  since: number;
  /** Filter to the QoS granted for it. */
  subscriptions: Map<string, 0 | 1>;
  /** Outgoing QoS 1 messages waiting for PUBACK, by packet id. */
  inflight: Map<number, Settle>;
  nextPacketId: number;
  /** The token bucket for publishes: tokens left, and when they were counted. */
  tokens: number;
  tokensAt: number;
  connectTimer: NodeJS.Timeout | null;
  /** Ending: no more packets are read, and the socket is destroyed if it does not close by itself. */
  closing: boolean;
}

/** How long a connection that has been told to go is given to close by itself. */
const CLOSE_GRACE_MS = 2_000;

/**
 * Wrong logins from one address before its logins are refused unchecked, within this long.
 * Each check is a scrypt run on the event loop the whole server shares, so without this an
 * address could guess without end and keep every page of Outpost waiting meanwhile.
 */
const LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 60_000;
/** Addresses whose wrong logins are remembered; past this, the oldest are forgotten. */
const LOGIN_ADDRESSES = 1000;
/** Connections from one address that have not signed in yet, at once. */
const MAX_WAITING_PER_ADDRESS = 2;

const noop: Settle = () => {};

export function createBroker(options: BrokerOptions): MqttBroker {
  const limits: BrokerLimits = { ...DEFAULT_BROKER_LIMITS, ...options.limits };
  const { log } = options;
  const debug = (obj: object, msg: string) => log.debug?.(obj, msg);

  const connections = new Set<Connection>();
  /** Connected clients by client id; one connection each (3.1.4-2). */
  const sessions = new Map<string, Connection>();
  const publishListeners = new Set<(topic: string, payload: Buffer, from: { clientId: string; address: string }) => void>();
  const clientsListeners = new Set<() => void>();
  /** Finishers of `publish` calls still waiting for acknowledgements, so `close` can end them. */
  const waiting = new Set<() => void>();
  /** When each address last gave a wrong login, newest last. */
  const failedLogins = new Map<string, number[]>();

  const server = net.createServer((socket) => accept(socket));
  server.on("error", (error) => log.warn({ err: error.message }, "MQTT listener error"));

  function clientsChanged(): void {
    for (const listener of clientsListeners) {
      try {
        listener();
      } catch (error) {
        log.warn({ err: (error as Error).message }, "An MQTT clients listener failed");
      }
    }
  }

  function send(conn: Connection, packet: Packet): void {
    if (conn.socket.destroyed || !conn.socket.writable) return;
    conn.socket.write(encodePacket(packet));
  }

  /** Send a last packet (or none) and end the connection, giving the client a moment to close it. */
  function endWith(conn: Connection, packet: Packet | null): void {
    if (conn.closing) return;
    conn.closing = true;
    if (conn.connectTimer) clearTimeout(conn.connectTimer);
    conn.connectTimer = null;
    conn.socket.setTimeout(CLOSE_GRACE_MS);
    if (packet && conn.socket.writable) conn.socket.end(encodePacket(packet));
    else conn.socket.end();
  }

  function drop(conn: Connection, reason: string, level: "info" | "warn" | "debug" = "info"): void {
    const obj = { clientId: conn.clientId ?? undefined, address: conn.address, reason };
    if (level === "debug") debug(obj, "Closed an MQTT connection");
    else log[level](obj, "Closed an MQTT connection");
    conn.closing = true;
    conn.socket.destroy();
  }

  function accept(socket: net.Socket): void {
    const address = socket.remoteAddress;
    if (!address) {
      socket.destroy();
      return;
    }
    let allowed = false;
    try {
      allowed = options.allowAddress(address);
    } catch (error) {
      log.warn({ address, err: (error as Error).message }, "Checking an MQTT client's address failed");
    }
    if (!allowed) {
      debug({ address }, "Refused an MQTT connection from an address not allowed");
      socket.destroy();
      return;
    }
    if (connections.size >= limits.maxConnections) {
      log.warn({ address, limit: limits.maxConnections }, "Refused an MQTT connection: too many connections");
      socket.destroy();
      return;
    }
    // One address may not hold every place by connecting and saying nothing: the radio would never get in.
    let waitingHere = 0;
    for (const other of connections) if (other.clientId === null && other.address === address) waitingHere += 1;
    if (waitingHere >= MAX_WAITING_PER_ADDRESS) {
      log.warn({ address, limit: MAX_WAITING_PER_ADDRESS }, "Refused an MQTT connection: too many from one address not signed in");
      socket.destroy();
      return;
    }
    socket.setNoDelay(true);
    const conn: Connection = {
      socket,
      address,
      reader: new PacketReader(limits.maxPacketBytes),
      clientId: null,
      since: Date.now(),
      subscriptions: new Map(),
      inflight: new Map(),
      nextPacketId: 1,
      tokens: limits.publishBurst,
      tokensAt: Date.now(),
      connectTimer: null,
      closing: false,
    };
    connections.add(conn);
    conn.connectTimer = setTimeout(() => {
      conn.connectTimer = null;
      drop(conn, "no CONNECT in time");
    }, limits.connectTimeoutMs);

    socket.on("data", (chunk) => onData(conn, chunk));
    socket.on("timeout", () => {
      if (conn.closing) socket.destroy();
      else drop(conn, "keep-alive expired");
    });
    socket.on("error", (error) => debug({ address, clientId: conn.clientId ?? undefined, err: error.message }, "MQTT socket error"));
    socket.on("close", () => onClose(conn));
  }

  function onClose(conn: Connection): void {
    connections.delete(conn);
    if (conn.connectTimer) clearTimeout(conn.connectTimer);
    conn.connectTimer = null;
    for (const settle of conn.inflight.values()) settle(false);
    conn.inflight.clear();
    if (conn.clientId !== null && sessions.get(conn.clientId) === conn) {
      sessions.delete(conn.clientId);
      log.info({ clientId: conn.clientId, address: conn.address }, "MQTT client disconnected");
      clientsChanged();
    }
  }

  function onData(conn: Connection, chunk: Buffer): void {
    if (conn.closing) return;
    let packets: Packet[];
    try {
      packets = conn.reader.push(chunk);
    } catch (error) {
      // Only the reason: never the bytes, which could hold a password.
      const reason = error instanceof MqttProtocolError ? error.message : "unreadable packet";
      drop(conn, reason, "warn");
      return;
    }
    for (const packet of packets) {
      if (conn.closing || conn.socket.destroyed) return;
      try {
        handle(conn, packet);
      } catch (error) {
        drop(conn, `failed handling a packet: ${(error as Error).message}`, "warn");
        return;
      }
    }
  }

  function handle(conn: Connection, packet: Packet): void {
    if (conn.clientId === null) {
      if (packet.type === "connect") {
        handleConnect(conn, packet);
        return;
      }
      if (packet.type === "connect-unsupported") {
        log.info({ address: conn.address, protocolLevel: packet.protocolLevel }, "Refused an MQTT client of another protocol version");
        endWith(conn, { type: "connack", sessionPresent: false, returnCode: CONNACK.badProtocolVersion });
        return;
      }
      drop(conn, "first packet was not CONNECT", "warn"); // 3.1.0-1
      return;
    }
    switch (packet.type) {
      case "publish":
        handlePublish(conn, packet);
        return;
      case "puback": {
        const settle = conn.inflight.get(packet.packetId);
        conn.inflight.delete(packet.packetId);
        settle?.(true);
        return;
      }
      case "subscribe":
        handleSubscribe(conn, packet);
        return;
      case "unsubscribe":
        for (const filter of packet.filters) conn.subscriptions.delete(filter);
        send(conn, { type: "unsuback", packetId: packet.packetId });
        clientsChanged();
        return;
      case "pingreq":
        send(conn, { type: "pingresp" });
        return;
      case "disconnect":
        debug({ clientId: conn.clientId, address: conn.address }, "MQTT client sent DISCONNECT");
        endWith(conn, null);
        return;
      default:
        // A second CONNECT (3.1.0-2), or a packet only a server sends.
        drop(conn, `unexpected ${packet.type} packet`, "warn");
        return;
    }
  }

  function handleConnect(conn: Connection, packet: Extract<Packet, { type: "connect" }>): void {
    if (conn.connectTimer) clearTimeout(conn.connectTimer);
    conn.connectTimer = null;
    const refuse = (returnCode: number, reason: string) => {
      log.warn({ address: conn.address, clientId: packet.clientId || undefined, reason }, "Refused an MQTT login");
      endWith(conn, { type: "connack", sessionPresent: false, returnCode });
    };

    let clientId = packet.clientId;
    if (clientId === "") {
      // An empty id is allowed only with a clean session, and is given one (3.1.3-6, 3.1.3-8).
      if (!packet.cleanSession) {
        refuse(CONNACK.identifierRejected, "empty client identifier without a clean session");
        return;
      }
      clientId = `outpost-${randomBytes(6).toString("hex")}`;
    }
    if (packet.userName === undefined || packet.password === undefined) {
      refuse(CONNACK.badUserNameOrPassword, "no user name or password");
      return;
    }
    const now = Date.now();
    const failed = (failedLogins.get(conn.address) ?? []).filter((at) => now - at < LOGIN_WINDOW_MS);
    if (failed.length >= LOGIN_FAILURES) {
      refuse(CONNACK.badUserNameOrPassword, "too many wrong logins from this address; not checked");
      return;
    }
    let ok = false;
    try {
      ok = options.checkLogin(packet.userName, packet.password);
    } catch (error) {
      log.warn({ err: (error as Error).message }, "Checking an MQTT login failed");
    }
    if (!ok) {
      failed.push(now);
      failedLogins.delete(conn.address);
      failedLogins.set(conn.address, failed);
      if (failedLogins.size > LOGIN_ADDRESSES) failedLogins.delete(failedLogins.keys().next().value!);
      refuse(CONNACK.badUserNameOrPassword, "wrong user name or password");
      return;
    }
    failedLogins.delete(conn.address);

    // The will message is read and thrown away: Outpost never publishes it, which a client
    // cannot tell from a broker that sends wills only on rare kinds of loss.

    // A second connection with the same client id replaces the first (3.1.4-2).
    const previous = sessions.get(clientId);
    if (previous) {
      sessions.delete(clientId);
      drop(previous, "another connection used the same client id");
    }

    conn.clientId = clientId;
    conn.since = Date.now();
    sessions.set(clientId, conn);
    // A session that asks not to be clean (clean session 0) is accepted but kept clean all
    // the same: nothing about it outlives the connection, so CONNACK always says no session
    // was present (3.2.2-2 allows exactly this when the server has none stored).
    send(conn, { type: "connack", sessionPresent: false, returnCode: CONNACK.accepted });
    // Keep-alive: close after one and a half periods with nothing from the client (3.1.2-24).
    // The socket's own timeout restarts on every packet, so nothing ticks meanwhile. It also
    // restarts when the broker writes, so a client that has vanished while being sent messages
    // is noticed when TCP gives up on it rather than at exactly 1.5 periods.
    if (packet.keepAliveSeconds > 0) conn.socket.setTimeout(packet.keepAliveSeconds * 1500);
    log.info({ clientId, address: conn.address, keepAliveSeconds: packet.keepAliveSeconds }, "MQTT client connected");
    clientsChanged();
  }

  function takeToken(conn: Connection): boolean {
    const now = Date.now();
    conn.tokens = Math.min(limits.publishBurst, conn.tokens + ((now - conn.tokensAt) / 1000) * limits.publishesPerSecond);
    conn.tokensAt = now;
    if (conn.tokens < 1) return false;
    conn.tokens -= 1;
    return true;
  }

  function handlePublish(conn: Connection, packet: Extract<Packet, { type: "publish" }>): void {
    // QoS 2 is not supported; a client that sends it is closed rather than half-served.
    if (packet.qos === 2) {
      drop(conn, "QoS 2 publish is not supported", "warn");
      return;
    }
    if (!takeToken(conn)) {
      drop(conn, "too many publishes", "warn");
      return;
    }
    if (packet.qos === 1) send(conn, { type: "puback", packetId: packet.packetId! });
    // The retain flag is accepted but nothing is retained.
    const from = { clientId: conn.clientId!, address: conn.address };
    for (const listener of publishListeners) {
      try {
        listener(packet.topic, packet.payload, from);
      } catch (error) {
        log.warn({ err: (error as Error).message, topic: packet.topic }, "An MQTT publish listener failed");
      }
    }
    for (const other of sessions.values()) {
      if (other === conn) continue;
      const granted = grantedFor(other, packet.topic);
      if (granted === null) continue;
      deliver(other, packet.topic, packet.payload, Math.min(packet.qos, granted) as 0 | 1, noop);
    }
  }

  function handleSubscribe(conn: Connection, packet: Extract<Packet, { type: "subscribe" }>): void {
    const returnCodes = packet.subscriptions.map(({ filter, qos }) => {
      if (!validFilter(filter)) return SUBACK_FAILURE;
      if (!conn.subscriptions.has(filter) && conn.subscriptions.size >= limits.maxSubscriptionsPerClient) return SUBACK_FAILURE;
      // QoS 2 is granted as 1, which the standard allows (3.8.4-6).
      const granted: 0 | 1 = qos === 0 ? 0 : 1;
      conn.subscriptions.set(filter, granted);
      return granted;
    });
    send(conn, { type: "suback", packetId: packet.packetId, returnCodes });
    debug({ clientId: conn.clientId, filters: packet.subscriptions.map((s) => s.filter), returnCodes }, "MQTT client subscribed");
    clientsChanged();
  }

  /** The highest QoS among a client's filters that match, or null; overlapping filters deliver once (3.3.5). */
  function grantedFor(conn: Connection, topic: string): 0 | 1 | null {
    let best: 0 | 1 | null = null;
    for (const [filter, qos] of conn.subscriptions) {
      if (topicMatches(filter, topic) && (best === null || qos > best)) best = qos;
    }
    return best;
  }

  /** Send one message to one client; returns the QoS it went at, or null if it was dropped. */
  function deliver(conn: Connection, topic: string, payload: Buffer, qos: 0 | 1, settle: Settle): 0 | 1 | null {
    if (conn.closing || conn.socket.destroyed) return null;
    if (qos === 1 && conn.inflight.size < limits.maxInflight) {
      let id = conn.nextPacketId;
      while (conn.inflight.has(id)) id = id === 65_535 ? 1 : id + 1;
      conn.nextPacketId = id === 65_535 ? 1 : id + 1;
      conn.inflight.set(id, settle);
      send(conn, { type: "publish", topic, payload, qos: 1, retain: false, dup: false, packetId: id });
      return 1;
    }
    // A client that does not read what it is sent is not given more and more to hold in memory.
    if (conn.socket.writableLength > limits.maxPacketBytes * 4) {
      debug({ clientId: conn.clientId, topic }, "Dropped an MQTT message for a client that is not reading");
      return null;
    }
    // Over the inflight limit, a QoS 1 message goes at QoS 0 rather than queueing.
    send(conn, { type: "publish", topic, payload, qos: 0, retain: false, dup: false });
    return 0;
  }

  return {
    listen() {
      return new Promise((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          const where = `${options.host}:${options.port}`;
          if (error.code === "EADDRINUSE")
            reject(new Error(`Port ${options.port} is already in use by another program, so the MQTT broker cannot listen on ${where}.`));
          else if (error.code === "EACCES")
            reject(
              new Error(
                `This computer does not allow listening on port ${options.port} (${where}); ports below 1024 usually need administrator rights.`,
              ),
            );
          else reject(new Error(`The MQTT broker could not listen on ${where}: ${error.message}`));
        };
        server.once("error", onError);
        server.listen({ host: options.host, port: options.port }, () => {
          server.off("error", onError);
          const address = server.address();
          resolve({ port: typeof address === "object" && address ? address.port : options.port });
        });
      });
    },

    close() {
      for (const finish of [...waiting]) finish();
      for (const conn of [...connections]) {
        conn.closing = true;
        if (conn.connectTimer) clearTimeout(conn.connectTimer);
        conn.connectTimer = null;
        conn.socket.destroy();
      }
      return new Promise((resolve) => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
      });
    },

    publish(topic, payload, qos, timeoutMs = 10_000) {
      if (!validTopicName(topic)) return Promise.reject(new Error(`"${topic}" is not a topic a message can be published to.`));
      return new Promise((resolve) => {
        let matched = 0;
        let acknowledged = 0;
        let outstanding = 0;
        let sent = false;
        let timer: NodeJS.Timeout | null = null;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (timer) clearTimeout(timer);
          waiting.delete(finish);
          resolve({ matched, acknowledged });
        };
        const settle: Settle = (acked) => {
          if (done) return;
          if (acked) acknowledged++;
          outstanding--;
          if (sent && outstanding === 0) finish();
        };
        for (const conn of sessions.values()) {
          const granted = grantedFor(conn, topic);
          if (granted === null) continue;
          matched++;
          if (deliver(conn, topic, payload, Math.min(qos, granted) as 0 | 1, settle) === 1) outstanding++;
        }
        sent = true;
        if (outstanding === 0) return finish();
        waiting.add(finish);
        timer = setTimeout(finish, timeoutMs);
      });
    },

    onPublish(listener) {
      publishListeners.add(listener);
      return () => publishListeners.delete(listener);
    },

    onClientsChanged(listener) {
      clientsListeners.add(listener);
      return () => clientsListeners.delete(listener);
    },

    clients() {
      return [...sessions.values()].map((conn) => ({
        clientId: conn.clientId!,
        address: conn.address,
        since: conn.since,
        subscriptions: [...conn.subscriptions.keys()],
      }));
    },
  };
}
