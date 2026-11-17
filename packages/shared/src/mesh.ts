/**
 * Shapes for the mesh radio link: the household board reaching beyond the Wi-Fi through
 * a LoRa radio running Meshtastic or MeshCore firmware. See docs/mesh-radio.md.
 *
 * Built against the projects' published documentation and tested against stand-ins
 * written for the tests. It has not been tried with a real radio.
 *
 * Three ways in, each off until a person at the computer Outpost runs on sets it up:
 *
 *  - Meshtastic by MQTT, JSON mode: a radio on the home Wi-Fi publishes what it hears to
 *    a broker and sends what the broker gives it. Outpost is the broker ("broker"), or
 *    connects to one the household already runs ("client").
 *  - MeshCore's companion protocol, over USB serial ("serial") or its network port ("tcp").
 *
 * Meshtastic's own binary client API was not built: the field numbers it needs are given
 * only in its GPL-licensed protocol files (docs/mesh-radio.md, "Licence position").
 *
 * A radio channel is a board channel: `meshtastic:longfast`, `meshcore:0`. What is
 * written there goes out by radio with the writer's name in front; what is heard there
 * is stored with `source` "meshtastic" or "meshcore". Nothing is relayed between the
 * household's board and a radio channel by itself.
 */
import type { LocalBy } from "./common.ts";

export type MeshTransportName = "meshtastic" | "meshcore";

/**
 * Bytes of text one radio message carries, the name in front included. Radio text is
 * short; the screen counts bytes, not characters, and the server refuses rather than
 * cuts. Meshtastic: "Maximum length: 200 bytes" (Meshtastic Android, "Messages &
 * Channels"). MeshCore: "133 characters" (MeshCore, docs/companion_protocol.md), held
 * here as 133 bytes, which is never more than 133 characters.
 */
export const MESH_TEXT_BYTES: Record<MeshTransportName, number> = { meshtastic: 200, meshcore: 133 };

/** The ports each way in uses unless a person says otherwise. */
export const MESH_DEFAULT_PORTS = {
  /** MQTT's own port (OASIS MQTT 3.1.1, section 1.5.6 and IANA). */
  mqtt: 1883,
  /** MeshCore's companion over Wi-Fi or Ethernet: "Connect on TCP port 5000" (MeshCore FAQ, 7.8). */
  meshcoreTcp: 5000,
} as const;

/** The longest channel name Meshtastic shows in a topic that Outpost keeps. */
export const MESH_CHANNEL_NAME_MAX = 32;

/** A board channel for a radio channel: "meshtastic:longfast" for LongFast, "meshcore:0" for MeshCore's slot 0. */
export function meshChannelId(transport: MeshTransportName, key: string | number): string {
  const part = String(key)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${transport}:${part || "0"}`;
}

/** Which transport a board channel belongs to, or null for the household's board and anything else. */
export function meshTransportOf(channel: string): MeshTransportName | null {
  if (channel.startsWith("meshtastic:")) return "meshtastic";
  if (channel.startsWith("meshcore:")) return "meshcore";
  return null;
}

/** UTF-8 bytes in a string, counted without any platform API (a lone surrogate counts as the three bytes it is replaced by). */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** What goes out by radio for a message or a check-in written here: the writer's name in front, then the words. */
export function radioText(input: {
  kind: "message" | "checkin";
  author: string;
  body: string;
  status?: "safe" | "help" | "other" | null;
  place?: string | null;
}): string {
  const author = input.author.trim();
  const body = input.body.trim();
  if (input.kind === "message") return `${author}: ${body}`;
  const said = input.status === "safe" ? "I'm safe" : input.status === "help" ? "I need help" : "";
  const place = input.place?.trim() ? `(${input.place.trim()})` : "";
  const words = [said, place].filter(Boolean).join(" ");
  return `${author}: ${[words, body].filter(Boolean).join(". ")}`;
}

export type MeshtasticMode = "off" | "broker" | "client";
export type MeshCoreMode = "off" | "serial" | "tcp";

/** A Meshtastic channel carried: its name as the radio has it ("LongFast"), and its index on the radio (0 to 7). */
export interface MeshtasticChannelChoice {
  name: string;
  index: number;
}

export interface MeshtasticConfig {
  mode: MeshtasticMode;
  /** Outpost as the broker: the port it listens on, and the user name and password the radio signs in with. */
  broker: { port: number; userName: string; passwordSet: boolean };
  /** A broker the household already runs. `rootTopic` is the radio's root topic ("msh/EU_868"). */
  client: { host: string; port: number; userName: string; passwordSet: boolean; rootTopic: string };
  channels: MeshtasticChannelChoice[];
}

export interface MeshCoreConfig {
  mode: MeshCoreMode;
  /** A device from the list the server made itself (`GET /api/mesh/devices`); never a path typed in a browser. */
  device: string | null;
  host: string;
  port: number;
  /** The radio's channel slots carried (0 is the public channel on a new radio). */
  channels: number[];
}

/**
 * What a link is doing, said as it is:
 *  - off: not set up; no port, no device, no connection, no timer.
 *  - listening: Outpost's broker is open and no radio is connected.
 *  - connecting: opening the device or the connection.
 *  - connected: a radio (or the household's broker) is connected.
 *  - away: it was set up and is not there; tried again at `retryAt`.
 *  - failed: it cannot start until something is changed (a port in use, a device not allowed); `lastError` says what.
 */
export type MeshLinkState = "off" | "listening" | "connecting" | "connected" | "away" | "failed";

/** A radio as the mesh names it. */
export interface MeshNode {
  /** "!a1b2c3d4" for Meshtastic; the first bytes of the public key in hex for MeshCore. */
  id: string;
  shortName: string | null;
  longName: string | null;
  heardAt: number;
}

/** One connection to Outpost's broker. */
export interface MeshPeer {
  clientId: string;
  address: string;
  since: number;
}

export interface MeshtasticStatus {
  state: MeshLinkState;
  since: number | null;
  /** Connected to Outpost's broker (broker mode only). */
  peers: MeshPeer[];
  lastHeardAt: number | null;
  lastError: string | null;
  retryAt: number | null;
  /** This computer's addresses on the home network, for the radio's "server address" (broker mode). */
  brokerAddresses: string[];
  /** The root topic the radio was last heard under ("msh/EU_868"), once it has published. */
  heardRoot: string | null;
  /** The radio that is connected to MQTT, once known. Messages are handed to it. */
  gateway: MeshNode | null;
  /** Channels heard on the radio that are not carried, so a person can add one. */
  otherChannels: string[];
  /** True once a JSON message has been seen; false while only encoded (protocol buffer) messages arrive, which means JSON is off on the radio. */
  json: boolean | null;
}

export interface MeshCoreStatus {
  state: MeshLinkState;
  since: number | null;
  lastHeardAt: number | null;
  lastError: string | null;
  retryAt: number | null;
  /** The radio's own name, from its answer to the app starting. */
  radioName: string | null;
  /** The channel slots the radio reported, with their names. */
  radioChannels: Array<{ index: number; name: string }>;
}

/** A radio channel as the Messages screen shows it beside "Home". */
export interface MeshChannel {
  /** The board channel ("meshtastic:longfast"). */
  id: string;
  transport: MeshTransportName;
  /** "LongFast", "Public". */
  label: string;
  textBytes: number;
  /** Whether the link is up, so that what is written goes out now. Written while it is down, a message is kept and said not to have gone. */
  linkUp: boolean;
}

/** Whether this request may change the mesh radio set-up: only from the computer Outpost runs on. */
export interface MeshRight {
  allowed: boolean;
  localBy?: LocalBy;
}

export interface MeshResponse {
  meshtastic: { config: MeshtasticConfig; status: MeshtasticStatus };
  meshcore: { config: MeshCoreConfig; status: MeshCoreStatus };
  /** Every radio channel carried, in the order Messages shows them. Empty when nothing is set up. */
  channels: MeshChannel[];
  right: MeshRight;
  /** In a container a USB radio must be passed through by the container's own settings (docs/deployment.md). */
  inContainer: boolean;
  /** False when Outpost listens only on this computer (OUTPOST_LAN_ACCESS off): a radio on Wi-Fi cannot reach its broker. */
  lanAccess: boolean;
}

/** A device that may be a radio, from the list the server makes of `/dev`. */
export interface MeshDevice {
  path: string;
  /** "/dev/serial/by-id/usb-Heltec…" or the path's own name. */
  label: string;
}

export interface MeshDevicesResponse {
  devices: MeshDevice[];
  platform: "darwin" | "linux" | "other";
}

/** Body of `PUT /api/mesh/meshtastic`. A password left out keeps the one set; an empty one removes it. */
export interface MeshtasticInput {
  mode: MeshtasticMode;
  broker?: { port: number; userName: string; password?: string };
  client?: { host: string; port: number; userName: string; password?: string; rootTopic: string };
  channels?: MeshtasticChannelChoice[];
}

/** Body of `PUT /api/mesh/meshcore`. */
export interface MeshCoreInput {
  mode: MeshCoreMode;
  device?: string | null;
  host?: string;
  port?: number;
  channels?: number[];
}

/** Body of `POST /api/mesh/test`: a short test message on a radio channel, posted on the board like any other. */
export interface MeshTestInput {
  channel: string;
  author: string;
}

/** What the mesh link keeps with a board message (`meta`). */
export interface MeshMeta {
  /** Who sent it, as the radio names them (a message heard). */
  node?: { id: string; shortName: string | null; longName: string | null };
  /** Signal report, where the radio gave one. */
  snr?: number | null;
  hops?: number | null;
  /**
   * What became of one written here:
   *  - "handed": the radio took it (Meshtastic through Outpost's broker: the radio acknowledged the MQTT message; MeshCore: the radio said "sent").
   *  - "broker": the household's broker took it; whether the radio did is not known.
   *  - "acknowledged": the mesh reported it delivered. Neither way in built here reports this for a channel message.
   *  - "failed": it did not go; `detail` says why.
   */
  delivery?: { state: "handed" | "broker" | "acknowledged" | "failed"; at: number; detail?: string };
}
