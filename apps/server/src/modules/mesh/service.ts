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
import { X509Certificate } from "node:crypto";
import {
  MESH_TEXT_BYTES,
  type MeshBrokerTestInput,
  type MeshBrokerTestResult,
  type MeshChannel,
  type MeshCoreInput,
  type MeshDynsecResult,
  type MeshFindResponse,
  type MeshRadioAccountInput,
  type MeshResponse,
  type MeshtasticInput,
  meshChannelId,
  meshTransportOf,
  meshtasticRootFor,
  radioText,
  utf8Bytes,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { badRequest } from "../../core/errors.ts";
import { containerReason } from "../../core/local.ts";
import type { BoardTransport, OutgoingCheck } from "../board/transport.ts";
import { addRadioAccount, dynsecStatus, findBrokers, testBroker } from "./household.ts";
import { createMeshCoreLink, type MeshCoreLink, type Opener, openRadio } from "./meshcore/link.ts";
import { createMeshtasticLink, type MeshtasticLink } from "./meshtastic/link.ts";
import { createMeshSecrets, type MeshSecrets } from "./secrets.ts";
import { isListedDevice } from "./serial.ts";
import { CONFIG_KEY, createMeshStore, type MeshStore, MOST_CA_CHARS, storedConfig } from "./store.ts";

export interface MeshService {
  response(): Omit<MeshResponse, "right">;
  setMeshtastic(input: MeshtasticInput): Promise<void>;
  setMeshCore(input: MeshCoreInput): Promise<void>;
  /** Looks for a broker on this computer (and, in a container, the computer it runs on), and at an address named. */
  findBrokers(named?: { host: string; port: number }): Promise<MeshFindResponse>;
  testBroker(input: MeshBrokerTestInput): Promise<MeshBrokerTestResult>;
  dynsec(): Promise<MeshDynsecResult>;
  addRadioAccount(radio: MeshRadioAccountInput): Promise<MeshDynsecResult>;
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

/** The root topic offered when none is known: Meshtastic's own for a radio in Europe. */
export const FALLBACK_ROOT = "msh/EU_868";

/** The shortest password a radio may sign in to Outpost's broker with: anything on the home network can try it (outpost-4b6). */
export const MIN_BROKER_PASSWORD = 12;

/** The household broker's address, port, user name and root topic as typed, checked. */
function checkedClient(input: { host: string; port: number; userName: string; rootTopic: string }, needHost: boolean) {
  const root = input.rootTopic.trim().replace(/\/+$/, "");
  if (!ROOT.test(root)) throw badRequest("A root topic is a few words joined by slashes, such as msh/EU_868.");
  return {
    host: needHost ? checkHost(input.host, "the household broker") : input.host.trim(),
    port: input.port,
    userName: input.userName.trim(),
    rootTopic: root,
  };
}

/** A pasted CA certificate: PEM that Node can read as a certificate, or nothing. */
function checkCa(ca: string | null): string | null {
  const text = ca?.trim() ?? "";
  if (!text) return null;
  if (text.length > MOST_CA_CHARS) throw badRequest("That is too long for a CA certificate.");
  try {
    new X509Certificate(text);
  } catch {
    throw badRequest("That is not a certificate. Paste the whole of the CA's .crt file, from -----BEGIN CERTIFICATE----- to the END line.");
  }
  return text;
}

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
  // Only when the row was there and has gone: any other change to settings while nothing was ever saved
  // here (a fresh install) leaves the passwords alone (outpost-dko).
  const hasRow = () => ctx.sqlite.prepare("SELECT 1 FROM settings WHERE key = ?").get(CONFIG_KEY) !== undefined;
  let saved = hasRow();
  ctx.services.settings.onChange(() => {
    const row = hasRow();
    const was = saved;
    saved = row;
    if (row || !was) return;
    if (secrets.brokerPasswordSet() || secrets.clientPassword() !== null) secrets.erase();
    const next = store.config();
    meshtastic.forgetNodes();
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

  /** The household broker as saved: dynamic security is managed only with the set-up that was saved. */
  function savedClient() {
    const client = store.config().meshtastic.client;
    if (!client.host) throw badRequest("Save the household broker's address, user name and password first.");
    return client;
  }

  /**
   * Whether a broker is the one the saved password was saved for: the same address, port and user name,
   * and over TLS if it was saved so. The saved password is used or kept only for that one.
   */
  function sameBroker(client: { host: string; port: number; userName: string }, tls: boolean): boolean {
    const saved = store.config().meshtastic.client;
    const host = (value: string) =>
      value
        .trim()
        .replace(/^\[|\]$/g, "")
        .toLowerCase();
    return (
      host(client.host) === host(saved.host) && client.port === saved.port && client.userName === saved.userName && (tls || !saved.tls)
    );
  }

  /**
   * The root topic offered before a household broker is saved, as the settings form offers it: the one
   * Meshtastic's table of regions gives for the first household's country (`households.country(first)`:
   * its override, else the smallest Natural Earth box round its home), else msh/EU_868. The radio and
   * the broker do not move with the current household, so it stays the first. Once a broker is saved, its root topic is the
   * one saved. (Rows saved before this held msh/EU_868 as a default; with no broker saved it is not a choice.)
   */
  function firstRoot(client: { host: string; rootTopic: string }): string {
    if (client.host && client.rootTopic) return client.rootTopic;
    const households = ctx.services.households;
    return meshtasticRootFor(households.country(households.first().id)) ?? (client.rootTopic || FALLBACK_ROOT);
  }

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
            client: {
              ...config.meshtastic.client,
              rootTopic: firstRoot(config.meshtastic.client),
              passwordSet: secrets.clientPassword() !== null,
            },
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
      // The passwords change only once everything else has been checked: a refused save changes nothing.
      let brokerPassword: string | null | undefined;
      let clientPassword: string | null | undefined;
      if (input.broker) {
        next.meshtastic.broker = { port: input.broker.port, userName: input.broker.userName.trim() };
        if (input.broker.password !== undefined) {
          brokerPassword = input.broker.password === "" ? null : input.broker.password;
          if (brokerPassword !== null && brokerPassword.length < MIN_BROKER_PASSWORD)
            throw badRequest(
              `The radio's password must be at least ${MIN_BROKER_PASSWORD} characters: anything on the home network can try it. Press Suggest one.`,
            );
        }
      }
      if (input.client) {
        const client = checkedClient(input.client, input.mode === "client");
        next.meshtastic.client = {
          ...client,
          tls: input.client.tls ?? current.meshtastic.client.tls,
          ca: input.client.ca !== undefined ? checkCa(input.client.ca) : current.meshtastic.client.ca,
        };
        if (input.client.password !== undefined) clientPassword = input.client.password === "" ? null : input.client.password;
        // The saved password stays only with the broker it was saved for, as for a test.
        else if (secrets.clientPassword() !== null && !sameBroker(client, next.meshtastic.client.tls))
          throw badRequest(
            "The saved password is only kept for the broker it was saved for. Type the password for this address, user name or connection, or clear it.",
          );
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
        const willHave = brokerPassword === undefined ? secrets.brokerPasswordSet() : brokerPassword !== null;
        if (!willHave) throw badRequest("Set the password the radio signs in with.");
      }
      if (next.meshtastic.mode !== "off" && next.meshtastic.channels.length === 0)
        throw badRequest("Choose at least one channel to carry.");
      const parsed = storedConfig.parse(next);
      if (brokerPassword !== undefined) secrets.setBrokerPassword(brokerPassword);
      if (clientPassword !== undefined) secrets.setClientPassword(clientPassword);
      store.saveConfig(parsed);
      saved = true;
      applied = JSON.stringify(parsed);
      await meshtastic.apply(parsed.meshtastic);
    },

    findBrokers(named) {
      const config = store.config().meshtastic;
      const status = meshtastic.status();
      const ownBrokerPort = config.mode === "broker" && ["listening", "connected"].includes(status.state) ? config.broker.port : null;
      return findBrokers(
        { inContainer: containerReason() !== null, ownBrokerPort },
        named ? { host: checkHost(named.host, "the broker"), port: named.port } : undefined,
      );
    },

    testBroker(input) {
      const client = checkedClient(input, true);
      const ca = input.ca !== undefined ? checkCa(input.ca) : store.config().meshtastic.client.ca;
      // A password left out is the one saved: never sent back to the browser, only used from here, and only
      // to the broker it was saved for (same address, port and user name, and over TLS if it was saved so).
      let password: string | null;
      if (input.password !== undefined) password = input.password || null;
      else {
        password = secrets.clientPassword();
        if (password !== null && !sameBroker(client, input.tls))
          throw badRequest(
            "The saved password is only sent to the broker it was saved for. Type the password to try this address, user name or connection.",
          );
      }
      return testBroker({ ...client, tls: input.tls, ca }, password);
    },

    dynsec() {
      const client = savedClient();
      return dynsecStatus(client, secrets.clientPassword());
    },

    addRadioAccount(radio) {
      const client = savedClient();
      return addRadioAccount(client, secrets.clientPassword(), radio);
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
      saved = true;
      applied = JSON.stringify(parsed);
      await meshcore.apply(parsed.meshcore);
    },
  };
}
