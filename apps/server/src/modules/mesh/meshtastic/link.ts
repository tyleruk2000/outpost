/**
 * Meshtastic by MQTT in JSON mode: Outpost as the broker a radio on the home Wi-Fi
 * connects to, or as a client of a broker the household already runs. Either way the
 * radio publishes what it hears as JSON and takes JSON to send (./json.ts).
 *
 * In: a text heard on a carried channel is put on the board once (by the sending radio's
 * number and the message's id), with the sender as the radio names them. A message the
 * MQTT radio publishes back after sending it for Outpost is recognised and not kept
 * twice. Out: a message written here on a carried channel is handed to the MQTT radio.
 *
 * What is said of delivery is only what is known. Through Outpost's broker, "handed":
 * the radio acknowledged the MQTT message (QoS 1), or at least was sent it. Through the
 * household's broker, "broker": the broker took it, and whether the radio did is not
 * known. Meshtastic's JSON mode reports nothing further for a channel message, so
 * "acknowledged by the mesh" is never said.
 *
 * At rest with a radio connected, Outpost does nothing between packets: the radio's
 * keep-alive is the radio's. As a client, Outpost sends its own keep-alive to the
 * household's broker, as MQTT requires, every two minutes.
 */
import os from "node:os";
import { type BoardMessage, type MeshLinkState, type MeshMeta, type MeshtasticStatus, meshChannelId, radioText } from "@outpost/shared";
import type { AppContext } from "../../../core/context.ts";
import { messageOf } from "../../../core/errors.ts";
import { isHomeAddress } from "../addresses.ts";
import { createBroker, type MqttBroker } from "../mqtt/broker.ts";
import { createClient, type MqttClient } from "../mqtt/client.ts";
import type { MeshSecrets } from "../secrets.ts";
import type { MeshStore, StoredConfig } from "../store.ts";
import { downlink, downlinkTopic, nodeNum, parseTopic, parseUplink } from "./json.ts";

/** How long a message handed to the radio is remembered, to know it when the radio publishes it back. */
const ECHO_MS = 10 * 60_000;

export interface MeshtasticLink {
  /** Starts, stops or restarts to match the set-up. */
  apply(config: StoredConfig["meshtastic"]): Promise<void>;
  stop(): Promise<void>;
  status(): MeshtasticStatus;
  carries(channel: string): boolean;
  send(message: BoardMessage): Promise<void>;
  /** The board was emptied: the radios' names go too. */
  forgetNodes(): void;
}

export function createMeshtasticLink(ctx: AppContext, store: MeshStore, secrets: MeshSecrets, changed: () => void): MeshtasticLink {
  let config: StoredConfig["meshtastic"] = store.config().meshtastic;
  let broker: MqttBroker | null = null;
  let client: MqttClient | null = null;
  let state: MeshLinkState = "off";
  let since: number | null = null;
  let lastError: string | null = null;
  let lastHeardAt: number | null = null;
  let json: boolean | null = null;
  const others = new Set<string>();
  const sent: Array<{ channel: string; text: string; at: number }> = [];
  let heard = store.heard();

  const set = (next: MeshLinkState, error: string | null = null) => {
    if (next !== state) since = Date.now();
    state = next;
    lastError = error;
    changed();
  };

  const carried = (name: string) => config.channels.find((channel) => channel.name.toLowerCase() === name.toLowerCase());
  const byId = (channel: string) => config.channels.find((entry) => meshChannelId("meshtastic", entry.name) === channel);

  function root(): string | null {
    if (config.mode === "client") return config.client.rootTopic || null;
    return heard.meshtastic.root;
  }

  function learn(patch: Partial<StoredHeard["meshtastic"]>): void {
    const next = { ...heard.meshtastic, ...patch };
    if (JSON.stringify(next) === JSON.stringify(heard.meshtastic)) return;
    heard = { ...heard, meshtastic: next };
    store.saveHeard(heard);
  }

  /** The radio's subscriptions say where it takes JSON from, before it has published anything. */
  function learnFromSubscriptions(): void {
    if (!broker) return;
    for (const peer of broker.clients()) {
      for (const filter of peer.subscriptions) {
        const match = /^(.+)\/2\/json\/mqtt(?:\/.*)?$/.exec(filter);
        if (match) learn({ root: match[1]! });
      }
    }
  }

  function handle(topic: string, payload: Buffer): void {
    const parts = parseTopic(topic);
    if (!parts) return;
    lastHeardAt = Date.now();
    learn({ root: parts.root, ...(parts.gatewayId ? { gateway: parts.gatewayId } : {}) });
    if (parts.format === "encoded") {
      if (json === null) json = false;
      changed();
      return;
    }
    json = true;
    const uplink = parseUplink(payload);
    if (!uplink || uplink.type === "other") {
      changed();
      return;
    }
    if (uplink.type === "nodeinfo") {
      const id = uplink.id ?? uplink.from;
      const known = heard.nodes[id];
      if (!known || known.longName !== uplink.longName || known.shortName !== uplink.shortName) {
        heard = {
          ...heard,
          nodes: { ...heard.nodes, [id]: { longName: uplink.longName, shortName: uplink.shortName, heardAt: Date.now() } },
        };
        store.saveHeard(heard);
      }
      changed();
      return;
    }
    const channel = carried(parts.channel);
    if (uplink.channelIndex !== null && uplink.channelIndex >= 0 && uplink.channelIndex <= 7) {
      learn({ channelIndex: { ...heard.meshtastic.channelIndex, [parts.channel]: uplink.channelIndex } });
    }
    if (!channel) {
      if (!others.has(parts.channel) && others.size < 16) others.add(parts.channel);
      changed();
      return;
    }
    if (!uplink.broadcast) {
      // A direct message to one radio is that radio's, not the channel's.
      changed();
      return;
    }
    // What the MQTT radio sent for Outpost, published back: already on the board.
    const now = Date.now();
    while (sent.length > 0 && now - sent[0]!.at > ECHO_MS) sent.shift();
    const gateway = parts.gatewayId ?? heard.meshtastic.gateway;
    const echo = sent.findIndex((entry) => entry.channel === channel.name && entry.text === uplink.text);
    if (echo >= 0 && uplink.from === gateway) {
      sent.splice(echo, 1);
      changed();
      return;
    }
    const node = heard.nodes[uplink.from];
    const meta: MeshMeta = {
      node: { id: uplink.from, shortName: node?.shortName ?? null, longName: node?.longName ?? null },
      snr: uplink.snr,
      hops: uplink.hops,
    };
    ctx.services.board.receive({
      channel: meshChannelId("meshtastic", channel.name),
      source: "meshtastic",
      externalId: `${uplink.from}:${uplink.id}`,
      author: node?.longName ?? node?.shortName ?? uplink.from,
      body: uplink.text,
      meta: meta as Record<string, unknown>,
    });
    changed();
  }

  async function stopAll(): Promise<void> {
    const closing: Array<Promise<void>> = [];
    if (broker) closing.push(broker.close());
    if (client) closing.push(client.stop());
    broker = null;
    client = null;
    await Promise.allSettled(closing);
  }

  async function start(): Promise<void> {
    if (config.mode === "broker") {
      const userName = config.broker.userName;
      const next = createBroker({
        host: ctx.config.lanAccess ? ctx.config.host : "127.0.0.1",
        port: config.broker.port,
        checkLogin: (name, password) => name === userName && secrets.checkBrokerPassword(password),
        allowAddress: (address) => isHomeAddress(address, ctx.config.lanAccess),
        log: ctx.log,
      });
      next.onPublish((topic, payload) => handle(topic, payload));
      next.onClientsChanged(() => {
        learnFromSubscriptions();
        set(next.clients().length > 0 ? "connected" : "listening");
      });
      broker = next;
      try {
        await next.listen();
        set("listening");
      } catch (error) {
        broker = null;
        set("failed", messageOf(error));
      }
      return;
    }
    if (config.mode === "client") {
      if (!config.client.host) {
        set("failed", "Give the household broker's address.");
        return;
      }
      const base = config.client.rootTopic;
      const next = createClient({
        host: config.client.host,
        port: config.client.port,
        clientId: `outpost-${
          os
            .hostname()
            .replace(/[^A-Za-z0-9]/g, "")
            .slice(0, 12) || "home"
        }`,
        userName: config.client.userName || undefined,
        password: secrets.clientPassword() ?? undefined,
        subscriptions: [
          { filter: `${base}/2/json/#`, qos: 0 },
          { filter: `${base}/2/e/#`, qos: 0 },
        ],
        log: ctx.log,
      });
      next.onMessage((topic, payload) => handle(topic, payload));
      next.onState(() => {
        const status = next.status();
        set(
          status.state === "connected"
            ? "connected"
            : status.state === "connecting"
              ? "connecting"
              : status.state === "away"
                ? "away"
                : "off",
          status.lastError,
        );
      });
      client = next;
      set("connecting");
      next.start();
    }
  }

  return {
    async apply(next) {
      await stopAll();
      config = next;
      json = null;
      others.clear();
      if (next.mode === "off") {
        set("off");
        return;
      }
      await start();
    },

    async stop() {
      await stopAll();
      state = "off";
    },

    status() {
      const gatewayId = heard.meshtastic.gateway;
      const gatewayNode = gatewayId ? heard.nodes[gatewayId] : undefined;
      const clientStatus = client?.status();
      return {
        state,
        since,
        peers: broker ? broker.clients().map(({ clientId, address, since: at }) => ({ clientId, address, since: at })) : [],
        lastHeardAt,
        lastError,
        retryAt: clientStatus?.retryAt ?? null,
        brokerAddresses: homeAddresses(),
        heardRoot: heard.meshtastic.root,
        gateway: gatewayId
          ? {
              id: gatewayId,
              shortName: gatewayNode?.shortName ?? null,
              longName: gatewayNode?.longName ?? null,
              heardAt: gatewayNode?.heardAt ?? 0,
            }
          : null,
        otherChannels: [...others],
        json,
      };
    },

    carries: (channel) => config.mode !== "off" && byId(channel) !== undefined,

    async send(message) {
      const channel = byId(message.channel);
      if (!channel) return;
      const text = radioText(message);
      const fail = (detail: string) => {
        const meta: MeshMeta = { delivery: { state: "failed", at: Date.now(), detail } };
        ctx.services.board.setMeta(message.id, meta as Record<string, unknown>);
      };
      const at = root();
      const gateway = heard.meshtastic.gateway ? nodeNum(heard.meshtastic.gateway) : null;
      if (state !== "connected" && state !== "listening") return fail("The radio link is not connected.");
      if (!at || gateway === null)
        return fail(
          "No radio has published anything yet, so Outpost does not know which radio to hand it to. Check the radio's MQTT settings.",
        );
      const index = heard.meshtastic.channelIndex[channel.name] ?? channel.index;
      const payload = downlink(gateway, index, text);
      try {
        if (broker) {
          const result = await broker.publish(downlinkTopic(at), payload, 1);
          if (result.matched === 0)
            return fail(
              "No radio is taking messages to send. On the radio, the channel named “mqtt” needs Downlink on, and the radio a restart.",
            );
          sent.push({ channel: channel.name, text, at: Date.now() });
          const meta: MeshMeta = { delivery: { state: "handed", at: Date.now() } };
          ctx.services.board.setMeta(message.id, meta as Record<string, unknown>);
        } else if (client) {
          await client.publish(downlinkTopic(at), payload, 1);
          sent.push({ channel: channel.name, text, at: Date.now() });
          const meta: MeshMeta = { delivery: { state: "broker", at: Date.now() } };
          ctx.services.board.setMeta(message.id, meta as Record<string, unknown>);
        } else fail("The radio link is not connected.");
      } catch (error) {
        fail(messageOf(error));
      }
    },

    forgetNodes() {
      heard = { ...heard, nodes: {} };
      store.saveHeard(heard);
      changed();
    },
  };
}

type StoredHeard = ReturnType<MeshStore["heard"]>;

/** This computer's IPv4 addresses on the home network, for the radio's "server address". */
function homeAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isHomeAddress(entry.address, true) && !entry.address.startsWith("169.254."))
        found.push(entry.address);
    }
  }
  return found;
}
