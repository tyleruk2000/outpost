/**
 * MeshCore by its companion protocol, over a USB cable or the radio's network port.
 *
 * Opened once a person at the computer has set it up; while it is there, nothing runs
 * between frames (the radio says when messages are waiting). When it goes (unplugged,
 * restarted, the network dropped) it is tried again with a growing wait, only while it
 * is still set up. Nothing is opened, and no timer is set, while it is off.
 *
 * In: a channel message on a carried slot is put on the board once, with the sender's
 * name as the text gives it. Out: a message written here is sent on the slot; "handed"
 * once the radio says it has sent it. MeshCore's companion protocol has no delivery
 * report for a channel message, so "acknowledged by the mesh" is never said.
 */
import { createHash } from "node:crypto";
import net from "node:net";
import type { Duplex } from "node:stream";
import { type BoardMessage, type MeshCoreStatus, type MeshLinkState, type MeshMeta, meshChannelId, radioText } from "@outpost/shared";
import type { AppContext } from "../../../core/context.ts";
import { messageOf } from "../../../core/errors.ts";
import { createRetry } from "../retry.ts";
import { openSerial } from "../serial.ts";
import type { StoredConfig } from "../store.ts";
import type { ChannelMessage } from "./frames.ts";
import { splitSender } from "./frames.ts";
import { CompanionSession } from "./session.ts";

const CONNECT_MS = 10_000;

export interface MeshCoreLink {
  apply(config: StoredConfig["meshcore"]): Promise<void>;
  stop(): Promise<void>;
  status(): MeshCoreStatus;
  carries(channel: string): boolean;
  send(message: BoardMessage): Promise<void>;
  /** Slot names as the radio gave them, for the Messages screen. */
  slotName(index: number): string;
}

/** How a stream to the radio is opened; the tests give one of their own. */
export type Opener = (config: StoredConfig["meshcore"]) => Promise<Duplex>;

export const openRadio: Opener = (config) => {
  if (config.mode === "serial") {
    if (!config.device) return Promise.reject(new Error("Choose the radio's device."));
    return openSerial(config.device);
  }
  return new Promise((resolve, reject) => {
    if (!config.host) {
      reject(new Error("Give the radio's address."));
      return;
    }
    const socket = net.connect({ host: config.host, port: config.port });
    socket.setTimeout(CONNECT_MS);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Nothing answered at ${config.host}:${config.port}.`));
    });
    socket.once("error", (error) => reject(new Error(`Could not connect to ${config.host}:${config.port}: ${messageOf(error)}`)));
    socket.once("connect", () => {
      socket.setTimeout(0);
      // The kernel's keep-alive notices a radio that went without saying so; Outpost sets no timer for it.
      socket.setKeepAlive(true, 60_000);
      socket.removeAllListeners("error");
      resolve(socket);
    });
  });
};

export function createMeshCoreLink(
  ctx: AppContext,
  initial: StoredConfig["meshcore"],
  changed: () => void,
  open: Opener = openRadio,
): MeshCoreLink {
  let config = initial;
  let session: CompanionSession | null = null;
  let state: MeshLinkState = "off";
  let since: number | null = null;
  let lastError: string | null = null;
  let lastHeardAt: number | null = null;
  let radioName: string | null = null;
  let radioChannels: Array<{ index: number; name: string }> = [];
  let generation = 0;
  const retry = createRetry();

  const set = (next: MeshLinkState, error: string | null = null) => {
    if (next !== state) since = Date.now();
    state = next;
    lastError = error;
    changed();
  };

  const slotName = (index: number) =>
    radioChannels.find((entry) => entry.index === index)?.name || (index === 0 ? "Public" : `Channel ${index}`);
  const slotOf = (channel: string) => config.channels.find((index) => meshChannelId("meshcore", index) === channel);

  function heard(message: ChannelMessage): void {
    lastHeardAt = Date.now();
    if (!config.channels.includes(message.channelIndex)) {
      changed();
      return;
    }
    const { name, words } = splitSender(message.text);
    const digest = createHash("sha256").update(message.text).digest("hex").slice(0, 16);
    const meta: MeshMeta = {
      ...(name ? { node: { id: name, shortName: null, longName: name } } : {}),
      snr: message.snr,
      hops: message.pathLength === 0xff ? null : message.pathLength,
    };
    ctx.services.board.receive({
      channel: meshChannelId("meshcore", message.channelIndex),
      source: "meshcore",
      externalId: `${message.channelIndex}:${message.timestamp}:${digest}`,
      author: name ?? `Someone on ${slotName(message.channelIndex)}`,
      body: words,
      meta: meta as Record<string, unknown>,
    });
    changed();
  }

  async function connect(): Promise<void> {
    const mine = ++generation;
    set("connecting");
    let stream: Duplex;
    try {
      stream = await open(config);
    } catch (error) {
      if (mine !== generation) return;
      away(messageOf(error));
      return;
    }
    if (mine !== generation) {
      stream.destroy();
      return;
    }
    const next = new CompanionSession({
      stream,
      onMessage: heard,
      onClose: (error) => {
        if (session !== next) return;
        session = null;
        if (mine === generation) away(error ? messageOf(error) : "The radio's connection closed.");
      },
    });
    session = next;
    try {
      const info = await next.start();
      if (mine !== generation) return;
      radioName = info.radioName;
      radioChannels = info.channels;
      retry.reset();
      set("connected");
    } catch (error) {
      if (mine !== generation) return;
      next.close();
      away(messageOf(error));
    }
  }

  function away(reason: string): void {
    if (config.mode === "off") return;
    state = "away";
    since = Date.now();
    lastError = reason;
    retry.later(() => void connect());
    changed();
  }

  async function stopAll(): Promise<void> {
    generation += 1;
    retry.cancel();
    const current = session;
    session = null;
    current?.close();
  }

  return {
    async apply(next) {
      await stopAll();
      config = next;
      if (next.mode === "off") {
        radioName = null;
        radioChannels = [];
        set("off");
        return;
      }
      void connect();
    },
    async stop() {
      await stopAll();
      state = "off";
    },
    status: () => ({ state, since, lastHeardAt, lastError, retryAt: retry.at, radioName, radioChannels }),
    carries: (channel) => config.mode !== "off" && slotOf(channel) !== undefined,
    slotName,
    async send(message) {
      const index = slotOf(message.channel);
      if (index === undefined) return;
      const setMeta = (meta: MeshMeta) => ctx.services.board.setMeta(message.id, meta as Record<string, unknown>);
      if (!session || state !== "connected") {
        setMeta({ delivery: { state: "failed", at: Date.now(), detail: "The radio is not connected." } });
        return;
      }
      try {
        await session.sendChannelText(index, radioText(message));
        setMeta({ delivery: { state: "handed", at: Date.now() } });
      } catch (error) {
        setMeta({ delivery: { state: "failed", at: Date.now(), detail: messageOf(error) } });
      }
    },
  };
}
