/**
 * The mesh radio link: the household board reaching beyond the Wi-Fi through a LoRa
 * radio. Two links, each a transport on the board (modules/board/transport.ts):
 * Meshtastic by MQTT in JSON mode (./meshtastic/link.ts) and MeshCore by its companion
 * protocol (./meshcore/link.ts). Both are off until a person at the computer Outpost
 * runs on sets one up; with nothing set up there is no listener, no timer and no open
 * device. Not tried with a real radio (docs/mesh-radio.md).
 *
 * Nothing is relayed between the household's board and a radio channel: a message goes
 * where the person wrote it. A message too long for the radio is refused, never cut.
 */
import {
  MESH_TEXT_BYTES,
  type MeshChannel,
  type MeshCoreInput,
  type MeshResponse,
  type MeshtasticInput,
  meshChannelId,
  meshTransportOf,
  radioText,
  utf8Bytes,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { badRequest } from "../../core/errors.ts";
import { containerReason } from "../../core/local.ts";
import type { BoardTransport, OutgoingCheck } from "../board/transport.ts";
import { createMeshCoreLink, type MeshCoreLink, type Opener, openRadio } from "./meshcore/link.ts";
import { createMeshtasticLink, type MeshtasticLink } from "./meshtastic/link.ts";
import { createMeshSecrets, type MeshSecrets } from "./secrets.ts";
import { isListedDevice } from "./serial.ts";
import { CONFIG_KEY, createMeshStore, type MeshStore, storedConfig } from "./store.ts";

export interface MeshService {
  response(): Omit<MeshResponse, "right">;
  setMeshtastic(input: MeshtasticInput): Promise<void>;
  setMeshCore(input: MeshCoreInput): Promise<void>;
  secrets: MeshSecrets;
  store: MeshStore;
  meshtastic: MeshtasticLink;
  meshcore: MeshCoreLink;
}

declare module "../../core/context.ts" {
  interface Services {
    mesh: MeshService;
  }
}

/** A host name or an address, as a person types one: no scheme, no port, no path. */
const HOST =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$|^\[?[0-9a-fA-F:]+\]?$/;

function checkHost(host: string, what: string): string {
  const value = host.trim().replace(/^\[|\]$/g, "");
  if (!value) throw badRequest(`Give ${what}'s address.`);
  if (!HOST.test(value))
    throw badRequest(`“${value.slice(0, 60)}” is not an address. Give a name or an address only, without http:// or a port.`);
  return value;
}

/** Root topics are a few levels of plain words: "msh/EU_868". */
const ROOT = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+){0,5}$/;

export function createMeshService(ctx: AppContext, options: { open?: Opener } = {}): MeshService {
  const store = createMeshStore(ctx);
  const secrets = createMeshSecrets(ctx.config.dataDir);
  let announced = false;
  // Several changes in one turn of the event loop make one event.
  const changed = () => {
    if (announced) return;
    announced = true;
    queueMicrotask(() => {
      announced = false;
      ctx.events.publish({ type: "mesh.changed" });
    });
  };
  const initial = store.config();
  const meshtastic = createMeshtasticLink(ctx, store, secrets, changed);
  const meshcore = createMeshCoreLink(ctx, initial.meshcore, changed, options.open ?? openRadio);
  let applied = JSON.stringify(initial);

  function refuse(outgoing: OutgoingCheck): string | null {
    const transport = meshTransportOf(outgoing.channel);
    if (!transport) return null;
    if (outgoing.kind === "file") return "A file cannot be sent by radio. Send it on Home, where everyone on the home network can save it.";
    const text = radioText({
      kind: outgoing.kind,
      author: outgoing.author,
      body: outgoing.body,
      status: outgoing.status,
      place: outgoing.place,
    });
    const bytes = utf8Bytes(text);
    const most = MESH_TEXT_BYTES[transport];
    if (bytes > most)
      return `That is ${bytes} bytes with your name in front, and a radio message is at most ${most}. Make it shorter: nothing is cut.`;
    return null;
  }

  const transports: BoardTransport[] = [
    { name: "meshtastic", carries: (channel) => meshtastic.carries(channel), send: (message) => meshtastic.send(message), refuse },
    { name: "meshcore", carries: (channel) => meshcore.carries(channel), send: (message) => meshcore.send(message), refuse },
  ];
  for (const transport of transports) ctx.services.board.addTransport(transport);

  // The board was emptied: the names of the radios heard go with it.
  ctx.events.subscribe((event) => {
    if (event.type === "board.changed" && (event.data as { action?: string } | undefined)?.action === "cleared") meshtastic.forgetNodes();
  });

  // Erase-everything empties the settings table, the set-up with it: the links stop and the passwords go.
  ctx.services.settings.onChange(() => {
    const row = ctx.sqlite.prepare("SELECT 1 FROM settings WHERE key = ?").get(CONFIG_KEY);
    if (row) return;
    if (secrets.brokerPasswordSet() || secrets.clientPassword() !== null) secrets.erase();
    const next = store.config();
    if (JSON.stringify(next) === applied) return;
    applied = JSON.stringify(next);
    void meshtastic.apply(next.meshtastic);
    void meshcore.apply(next.meshcore);
  });

  ctx.onClose.push(async () => {
    await Promise.allSettled([meshtastic.stop(), meshcore.stop()]);
  });

  // What was set up before a restart starts again; nothing starts when nothing was.
  if (initial.meshtastic.mode !== "off") void meshtastic.apply(initial.meshtastic);
  if (initial.meshcore.mode !== "off") void meshcore.apply(initial.meshcore);

  function channels(): MeshChannel[] {
    const config = store.config();
    const list: MeshChannel[] = [];
    if (config.meshtastic.mode !== "off") {
      const up = ["connected", "listening"].includes(meshtastic.status().state);
      for (const channel of config.meshtastic.channels)
        list.push({
          id: meshChannelId("meshtastic", channel.name),
          transport: "meshtastic",
          label: channel.name,
          textBytes: MESH_TEXT_BYTES.meshtastic,
          linkUp: up,
        });
    }
    if (config.meshcore.mode !== "off") {
      const up = meshcore.status().state === "connected";
      for (const index of config.meshcore.channels)
        list.push({
          id: meshChannelId("meshcore", index),
          transport: "meshcore",
          label: meshcore.slotName(index),
          textBytes: MESH_TEXT_BYTES.meshcore,
          linkUp: up,
        });
    }
    return list;
  }

  return {
    store,
    secrets,
    meshtastic,
    meshcore,

    response() {
      const config = store.config();
      return {
        meshtastic: {
          config: {
            mode: config.meshtastic.mode,
            broker: { ...config.meshtastic.broker, passwordSet: secrets.brokerPasswordSet() },
            client: { ...config.meshtastic.client, passwordSet: secrets.clientPassword() !== null },
            channels: config.meshtastic.channels,
          },
          status: meshtastic.status(),
        },
        meshcore: { config: config.meshcore, status: meshcore.status() },
        channels: channels(),
        inContainer: containerReason() !== null,
        lanAccess: ctx.config.lanAccess,
      };
    },

    async setMeshtastic(input) {
      const current = store.config();
      const next = structuredClone(current);
      next.meshtastic.mode = input.mode;
      if (input.broker) {
        next.meshtastic.broker = { port: input.broker.port, userName: input.broker.userName.trim() };
        if (input.broker.password !== undefined) secrets.setBrokerPassword(input.broker.password === "" ? null : input.broker.password);
      }
      if (input.client) {
        const root = input.client.rootTopic.trim().replace(/\/+$/, "");
        if (!ROOT.test(root)) throw badRequest("A root topic is a few words joined by slashes, such as msh/EU_868.");
        next.meshtastic.client = {
          host: input.mode === "client" ? checkHost(input.client.host, "the household broker") : input.client.host.trim(),
          port: input.client.port,
          userName: input.client.userName.trim(),
          rootTopic: root,
        };
        if (input.client.password !== undefined) secrets.setClientPassword(input.client.password === "" ? null : input.client.password);
      }
      if (input.channels) {
        const names = new Set<string>();
        for (const channel of input.channels) {
          const key = channel.name.trim().toLowerCase();
          if (names.has(key)) throw badRequest(`“${channel.name}” is listed twice.`);
          names.add(key);
        }
        next.meshtastic.channels = input.channels.map((channel) => ({ name: channel.name.trim(), index: channel.index }));
      }
      if (next.meshtastic.mode === "broker") {
        if (!next.meshtastic.broker.userName) throw badRequest("Give the user name the radio signs in with.");
        if (!secrets.brokerPasswordSet()) throw badRequest("Set the password the radio signs in with.");
      }
      if (next.meshtastic.mode !== "off" && next.meshtastic.channels.length === 0)
        throw badRequest("Choose at least one channel to carry.");
      const parsed = storedConfig.parse(next);
      store.saveConfig(parsed);
      applied = JSON.stringify(parsed);
      await meshtastic.apply(parsed.meshtastic);
    },

    async setMeshCore(input) {
      const current = store.config();
      const next = structuredClone(current);
      next.meshcore.mode = input.mode;
      if (input.device !== undefined) next.meshcore.device = input.device;
      if (input.host !== undefined) next.meshcore.host = input.host.trim();
      if (input.port !== undefined) next.meshcore.port = input.port;
      if (input.channels !== undefined) next.meshcore.channels = [...new Set(input.channels)].sort((a, b) => a - b);
      if (next.meshcore.mode === "serial") {
        // Never a path from the browser: only one of the devices this server listed itself.
        if (!next.meshcore.device || !isListedDevice(next.meshcore.device))
          throw badRequest("Choose the radio from the list of devices plugged in now.");
      }
      if (next.meshcore.mode === "tcp") next.meshcore.host = checkHost(next.meshcore.host, "the radio");
      if (next.meshcore.mode !== "off" && next.meshcore.channels.length === 0) throw badRequest("Choose at least one channel to carry.");
      const parsed = storedConfig.parse(next);
      store.saveConfig(parsed);
      applied = JSON.stringify(parsed);
      await meshcore.apply(parsed.meshcore);
    },
  };
}
