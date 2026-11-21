/**
 * One short MQTT session with a broker, for the questions a person asks from Settings:
 * is anything there (Find), can Outpost sign in and hear the radio (Test), and does the
 * broker let Outpost manage its accounts (dynamic security). Opened when the person
 * presses the button, closed with DISCONNECT when the answer is in; never retried and
 * never left open. The link itself uses `client.ts`.
 */
import { randomBytes } from "node:crypto";
import type { TLSSocket } from "node:tls";
import { socketBytes } from "../../../core/socket-bytes.ts";
import { CONNACK, encodePacket, MqttProtocolError, type Packet, PacketReader } from "./packets.ts";
import { describeSocketError, openSocket, type TlsChoice } from "./transport.ts";

export interface SessionOptions {
  host: string;
  port: number;
  tls: TlsChoice | null;
  userName?: string;
  password?: string;
  /** For the connection and the CONNACK together. */
  timeoutMs?: number;
}

/** Why a session could not be opened. `connack` is the broker's refusal code, when it refused. */
export class SessionError extends Error {
  readonly kind: "unreachable" | "refused-login" | "refused" | "not-mqtt" | "timeout" | "tls";
  readonly connack: number | null;
  constructor(kind: SessionError["kind"], message: string, connack: number | null = null) {
    super(message);
    this.name = "SessionError";
    this.kind = kind;
    this.connack = connack;
  }
}

export interface Session {
  /** For a TLS connection opened without checking (Find): whether the certificate would have been trusted, and why not. */
  certificate: { trusted: boolean; problem: string | null } | null;
  /** The return code per filter: 0 or 1 granted, 0x80 refused. */
  subscribe(filters: string[]): Promise<number[]>;
  /** QoS 0: the broker says nothing back, whether it passed the message on or not. */
  publish(topic: string, payload: Buffer): void;
  onMessage(listener: (topic: string, payload: Buffer) => void): void;
  close(): Promise<void>;
}

const TLS_CODES = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO/;

export function openSession(options: SessionOptions): Promise<Session> {
  const timeoutMs = options.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const { socket, ready } = openSocket(options.host, options.port, options.tls);
    socket.setNoDelay(true);
    const reader = new PacketReader(65_536);
    const listeners = new Set<(topic: string, payload: Buffer) => void>();
    const waiting = new Map<number, (codes: number[]) => void>();
    let nextId = 1;
    let open = false;
    let settled = false;
    const fail = (error: SessionError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new SessionError("timeout", `Nothing at ${options.host}:${options.port} answered as an MQTT broker in time.`)),
      timeoutMs,
    );
    timer.unref();

    socket.on(ready, () => {
      const packet: Packet = {
        type: "connect",
        clientId: `outpost-check-${randomBytes(4).toString("hex")}`,
        cleanSession: true,
        keepAliveSeconds: 30,
      };
      if (options.userName) packet.userName = options.userName;
      if (options.password !== undefined && options.userName) packet.password = Buffer.from(options.password, "utf8");
      socket.write(encodePacket(packet));
    });
    socket.on("error", (error: NodeJS.ErrnoException) => {
      const words = describeSocketError(error, options.host, options.port, Boolean(options.tls));
      fail(new SessionError(TLS_CODES.test(error.code ?? "") ? "tls" : "unreachable", words));
    });
    socket.on("close", () => {
      for (const done of waiting.values()) done([]);
      waiting.clear();
      if (!open)
        fail(
          new SessionError(
            "not-mqtt",
            options.tls
              ? `${options.host}:${options.port} closed the connection without answering as an MQTT broker.`
              : `${options.host}:${options.port} closed the connection without answering as an MQTT broker. If that port uses TLS, turn TLS on.`,
          ),
        );
    });
    socket.on("data", (chunk) => {
      let packets: Packet[];
      try {
        packets = reader.push(socketBytes(chunk));
      } catch (error) {
        const reason = error instanceof MqttProtocolError ? error.message : "unreadable";
        fail(new SessionError("not-mqtt", `${options.host}:${options.port} answered, but not as an MQTT 3.1.1 broker (${reason}).`));
        return;
      }
      for (const packet of packets) {
        if (packet.type === "connack" && !open) {
          if (packet.returnCode !== CONNACK.accepted) {
            const login = packet.returnCode === CONNACK.badUserNameOrPassword || packet.returnCode === CONNACK.notAuthorised;
            fail(
              new SessionError(
                login ? "refused-login" : "refused",
                login
                  ? options.userName
                    ? "The broker refused the user name or password."
                    : "The broker wants a user name and password."
                  : `The broker refused the connection (code ${packet.returnCode}).`,
                packet.returnCode,
              ),
            );
            return;
          }
          open = true;
          settled = true;
          clearTimeout(timer);
          const tlsSocket = options.tls ? (socket as TLSSocket) : null;
          resolve({
            certificate: tlsSocket
              ? {
                  trusted: tlsSocket.authorized,
                  problem: tlsSocket.authorized
                    ? null
                    : describeSocketError(
                        Object.assign(new Error(String(tlsSocket.authorizationError ?? "")), {
                          code: String(tlsSocket.authorizationError ?? ""),
                        }),
                        options.host,
                        options.port,
                        true,
                      ),
                }
              : null,
            subscribe(filters) {
              return new Promise((done) => {
                const packetId = nextId++;
                waiting.set(packetId, done);
                socket.write(encodePacket({ type: "subscribe", packetId, subscriptions: filters.map((filter) => ({ filter, qos: 0 })) }));
                setTimeout(() => {
                  if (waiting.delete(packetId)) done(filters.map(() => 0x80));
                }, timeoutMs).unref();
              });
            },
            publish(topic, payload) {
              socket.write(encodePacket({ type: "publish", topic, payload, qos: 0, retain: false, dup: false }));
            },
            onMessage(listener) {
              listeners.add(listener);
            },
            close() {
              return new Promise((done) => {
                if (socket.destroyed) return done();
                socket.once("close", () => done());
                socket.end(encodePacket({ type: "disconnect" }));
                setTimeout(() => socket.destroy(), 1000).unref();
              });
            },
          });
        } else if (packet.type === "suback") {
          const done = waiting.get(packet.packetId);
          waiting.delete(packet.packetId);
          done?.(packet.returnCodes);
        } else if (packet.type === "publish") {
          if (packet.qos === 1 && packet.packetId) socket.write(encodePacket({ type: "puback", packetId: packet.packetId }));
          for (const listener of listeners) listener(packet.topic, packet.payload);
        }
      }
    });
  });
}
