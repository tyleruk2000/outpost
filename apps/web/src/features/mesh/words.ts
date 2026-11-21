/**
 * What the mesh radio screens say, in one place so that it can be read and tested
 * together: the state of each way in, what became of a message sent by radio, the
 * warnings, and the steps to take on the radio itself.
 *
 * Nothing here claims more than the server reports. A radio link that is "connected" is
 * connected; whether the mesh carried a message further is said only when it says so.
 */
import {
  type MeshChannel,
  type MeshCoreStatus,
  type MeshMeta,
  type MeshtasticConfig,
  type MeshtasticStatus,
  utf8Bytes,
} from "@outpost/shared";
import { formatTimeOfDay } from "@/lib/clock";
import { timeAgo } from "@/lib/utils";

/** The opening lines of Settings → Mesh radio. */
export const INTRO =
  "The household's board can reach beyond the Wi-Fi through a LoRa radio. Outpost works with radios running Meshtastic or MeshCore firmware: what is written on a radio channel under Messages goes out by radio, and what the radio hears there shows on that channel.";
export const UNTRIED = "Not tried with a real radio yet.";

/** Said on the screen, short. The longer reasons are behind the disclosure. */
export const WARNINGS = {
  public: "A mesh's default public channel can be read by anyone with a radio in range. Write nothing private there.",
  privateKey: "A private channel is as private as its key, which is set on the radio, not in Outpost.",
  lost: "Messages by radio can be lost or delayed. This is not a way to call for help in an emergency in place of the emergency services.",
  licence: "Using these radios is licence-free only on the bands and powers each country allows.",
} as const;

export const REGION_URL = "https://meshtastic.org/docs/configuration/radio/lora/#region";

/** The one line under the channel switch on Messages, on a radio channel. */
export const CHANNEL_WARNING =
  "Anyone with a radio in range may read a public channel, and messages by radio can be lost or delayed: write nothing private, and this is not a way to call for help in an emergency.";

/** Why the set-up cannot be changed from this device: the notice above the forms, and the line beside each disabled Save. */
export const REMOTE = {
  what: "The mesh radio set-up",
  because: "turning a way in on, choosing a device and opening the broker's port open a port or a device on that computer",
  short: "Disabled on this device: see “Can't be changed from this device” above for why, and the line that allows it.",
} as const;

export const TRADEMARK =
  "Meshtastic® is a registered trademark of Meshtastic LLC; Outpost is not affiliated with or endorsed by it. MeshCore is a separate open-source project; Outpost is not affiliated with it either.";

export const JSON_OFF = "The radio is sending, but not as JSON: turn JSON output on.";
export const NO_LAN =
  "Outpost listens only on this computer at the moment, so a radio on Wi-Fi cannot reach its broker. Share Outpost with your network first (see “Who can use this library”).";

const at = (time: number) => formatTimeOfDay(time);

/** "Listening on port 1883; no radio connected yet", "A radio connected since 14:02 (from 192.168.1.40)", and so on. */
export function meshtasticStateWords(config: MeshtasticConfig, status: MeshtasticStatus): string {
  switch (status.state) {
    case "off":
      return "Off";
    case "listening":
      return `Listening on port ${config.broker.port}; no radio connected yet`;
    case "connecting":
      return "Connecting…";
    case "connected": {
      if (config.mode === "client") {
        return status.since ? `Connected to the household's broker since ${at(status.since)}` : "Connected to the household's broker";
      }
      const peer = status.peers[0];
      const since = peer?.since ?? status.since;
      const many = status.peers.length > 1 ? `${status.peers.length} radios connected` : "A radio connected";
      return `${many}${since ? ` since ${at(since)}` : ""}${peer ? ` (from ${peer.address})` : ""}`;
    }
    case "away":
      return awayWords(status.since, status.retryAt);
    case "failed":
      return `Could not start: ${status.lastError ?? "no reason given"}`;
  }
}

export function meshcoreStateWords(status: MeshCoreStatus): string {
  switch (status.state) {
    case "off":
      return "Off";
    case "listening":
      // MeshCore does not listen; said plainly if the server ever reports it.
      return "Waiting for the radio";
    case "connecting":
      return "Connecting…";
    case "connected":
      return `${status.radioName ? `${status.radioName} connected` : "A radio connected"}${status.since ? ` since ${at(status.since)}` : ""}`;
    case "away":
      return awayWords(status.since, status.retryAt);
    case "failed":
      return `Could not start: ${status.lastError ?? "no reason given"}`;
  }
}

function awayWords(since: number | null, retryAt: number | null): string {
  return `Away${since ? ` since ${at(since)}` : ""}${retryAt ? `; trying again at ${at(retryAt)}` : ""}`;
}

/** "Last heard 3 minutes ago", or "Nothing heard yet". */
export const heardWords = (lastHeardAt: number | null) => (lastHeardAt ? `Last heard ${timeAgo(lastHeardAt)}` : "Nothing heard yet");

/** What became of a message written here on a radio channel, from its `meta.delivery`. */
export function deliveryWords(meta: MeshMeta | null | undefined): { text: string; failed: boolean } {
  const delivery = meta?.delivery;
  if (!delivery) return { text: "Going to the radio…", failed: false };
  switch (delivery.state) {
    case "handed":
      return { text: "Handed to the radio", failed: false };
    case "broker":
      return { text: "Handed to the household's broker", failed: false };
    case "acknowledged":
      return { text: "Acknowledged by the mesh", failed: false };
    case "failed":
      return { text: `Did not go: ${delivery.detail ?? "no reason given"}`, failed: true };
  }
}

/** Who sent a message heard by radio, as the radio names them. */
export function nodeName(meta: MeshMeta | null | undefined): { name: string; short: string | null } | null {
  const node = meta?.node;
  if (!node) return null;
  const name = node.longName?.trim() || node.shortName?.trim() || node.id;
  const short = node.longName?.trim() && node.shortName?.trim() ? node.shortName.trim() : null;
  return { name, short };
}

/** "37 of 200 bytes". */
export const bytesWords = (bytes: number, limit: number) => `${bytes} of ${limit} bytes`;
export const overWords = (bytes: number, limit: number) =>
  `Too long for one radio message: ${bytes} of ${limit} bytes, the name in front included. Shorten it; Outpost does not cut it.`;

/** Bytes a radio message carries, the name in front counted, and whether that is over the channel's limit; null on Home. */
export function radioCount(channel: MeshChannel | null, text: string): { bytes: number; limit: number; over: boolean } | null {
  if (!channel) return null;
  const bytes = utf8Bytes(text);
  return { bytes, limit: channel.textBytes, over: bytes > channel.textBytes };
}
