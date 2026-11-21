/**
 * The connection to one receiver: a decoder's TCP port that Outpost reads from, or a UDP
 * port Outpost listens on for datagrams from the decoder's one address.
 *
 * Read only. Nothing is ever written to the socket: not a KISS frame, not a command, not
 * a byte. A TNC asked nothing cannot be asked to transmit.
 *
 * While a receiver is set up and switched on, its connection is opened; when it goes (the
 * decoder stopped, the computer slept, the network dropped), it is tried again with a
 * growing wait (`mesh/retry.ts`: two seconds doubling to five minutes). Nothing is
 * opened, and no timer set, for a receiver that is off. The kernel's keep-alive notices a
 * connection that went without saying so.
 */
import dgram from "node:dgram";
import net from "node:net";
import type { ReceiverState, ReceiverStatus } from "@outpost/shared";
import { messageOf } from "../../core/errors.ts";
import { createRetry } from "../mesh/retry.ts";

const CONNECT_MS = 10_000;

export interface LinkTarget {
  host: string;
  port: number;
  transport: "tcp" | "udp";
}

export interface ReceiverLink {
  status(): ReceiverStatus;
  /** Counts kept by the reader of what came in. */
  count(kind: "packets" | "positions" | "malformed", by?: number): void;
  stop(): void;
}

export interface LinkHandlers {
  /** Bytes as they came: a TCP stream's chunk, or a whole datagram. */
  onData(chunk: Buffer): void;
  /** A new connection: whatever was half-read from the last one is to be forgotten. */
  onOpen?(): void;
  changed(): void;
}

export function openLink(target: LinkTarget, handlers: LinkHandlers): ReceiverLink {
  let state: ReceiverState = "connecting";
  let since = Date.now();
  let lastPacketAt: number | null = null;
  let lastError: string | null = null;
  const counts = { packets: 0, positions: 0, malformed: 0, refused: 0 };
  let stopped = false;
  let socket: net.Socket | null = null;
  let udp: dgram.Socket | null = null;
  const retry = createRetry();

  const set = (next: ReceiverState, error: string | null = lastError) => {
    if (next !== state) since = Date.now();
    state = next;
    lastError = error;
    handlers.changed();
  };

  const away = (reason: string) => {
    if (stopped) return;
    socket?.destroy();
    socket = null;
    set("away", reason);
    retry.later(connect);
  };

  function connect(): void {
    if (stopped) return;
    set("connecting");
    const next = net.connect({ host: target.host, port: target.port });
    socket = next;
    next.setTimeout(CONNECT_MS);
    next.once("timeout", () => {
      if (socket === next) away(`Nothing answered at ${target.host}:${target.port}.`);
    });
    next.on("error", (error) => {
      if (socket === next) away(`Could not reach ${target.host}:${target.port}: ${messageOf(error)}`);
    });
    next.once("connect", () => {
      if (socket !== next) return;
      next.setTimeout(0);
      next.setKeepAlive(true, 60_000);
      retry.reset();
      handlers.onOpen?.();
      set("connected", null);
    });
    next.on("data", (chunk: Buffer) => {
      if (socket !== next) return;
      lastPacketAt = Date.now();
      handlers.onData(chunk);
    });
    next.once("close", () => {
      if (socket === next) away("The decoder closed the connection.");
    });
  }

  function listen(): void {
    if (stopped) return;
    set("connecting");
    const next = dgram.createSocket({ type: "udp4" });
    udp = next;
    next.on("error", (error) => {
      if (udp !== next) return;
      next.close();
      udp = null;
      set("away", `Could not listen on port ${target.port}: ${messageOf(error)}`);
      retry.later(listen);
    });
    next.on("message", (message, from) => {
      // From the one address given; anything else on the port is counted and dropped unread.
      if (from.address !== target.host) {
        counts.refused += 1;
        return;
      }
      lastPacketAt = Date.now();
      handlers.onData(message);
    });
    next.bind(target.port, () => {
      if (udp !== next) return;
      retry.reset();
      set("listening", null);
    });
  }

  if (target.transport === "udp") listen();
  else connect();

  return {
    status: () => ({ state, since, lastPacketAt, ...counts, lastError, retryAt: retry.at }),
    count(kind, by = 1) {
      counts[kind] += by;
    },
    stop() {
      stopped = true;
      retry.cancel();
      socket?.destroy();
      socket = null;
      try {
        udp?.close();
      } catch {
        // Already closed.
      }
      udp = null;
    },
  };
}

/** Splits a stream into lines (SBS, NMEA), dropping any line longer than the limit rather than holding it. */
export class LineReader {
  private partial = "";
  private skipping = false;
  /** Lines dropped for being too long. */
  dropped = 0;
  private readonly max: number;
  private readonly onLine: (line: string) => void;

  constructor(max: number, onLine: (line: string) => void) {
    this.max = max;
    this.onLine = onLine;
  }

  reset(): void {
    this.partial = "";
    this.skipping = false;
  }

  push(chunk: Buffer): void {
    const text = chunk.toString("latin1");
    let start = 0;
    for (;;) {
      const end = text.indexOf("\n", start);
      if (end < 0) break;
      const piece = text.slice(start, end);
      start = end + 1;
      if (this.skipping) {
        this.skipping = false;
        this.partial = "";
        continue;
      }
      const line = this.partial + piece;
      this.partial = "";
      if (line.length > this.max) {
        this.dropped += 1;
        continue;
      }
      this.onLine(line.replace(/\r$/, ""));
    }
    if (this.skipping) return;
    this.partial += text.slice(start);
    if (this.partial.length > this.max) {
      this.dropped += 1;
      this.partial = "";
      this.skipping = true;
    }
  }
}
