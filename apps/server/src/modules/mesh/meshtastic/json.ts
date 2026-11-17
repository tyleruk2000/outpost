/**
 * Meshtastic's MQTT JSON mode: what a radio publishes, and what it takes to send.
 * Written from Meshtastic's documentation page "MQTT" (meshtastic.org/docs/software/
 * integrations/mqtt/, read on 17 November 2026). Nothing here comes from Meshtastic's
 * code or its protocol files, which are GPL-licensed (docs/mesh-radio.md).
 *
 * What the page says, and what is used of it:
 *
 *  - Topics. The root is `msh/REGION` unless changed on the radio. Encoded messages go to
 *    `<root>/2/e/CHANNELNAME/USERID` (`/c/` before firmware 2.3.0); JSON ones to
 *    `<root>/2/json/CHANNELNAME/USERID`, USERID being the radio's id (`!a1b2c3d4`).
 *    Encoded messages are not read here (that needs the protocol files); they are only
 *    taken as a sign that the radio is connected and JSON is off.
 *  - A JSON message has `id`, `channel` (the index it came in on), `from` (the sending
 *    radio's number, "a stable identifier for a specific node"), `to` (-1 for everyone),
 *    `sender` (the publishing radio's id in hex), `timestamp`, `type` and `payload`.
 *    For `nodeinfo` the payload has `id`, `longname` and `shortname`.
 *  - The page shows no text message. A text message is taken as `type` "text" with the
 *    text as the payload, or as a payload object's `text`: both are accepted, and
 *    nothing else is.
 *  - To send: publish to `<root>/2/json/mqtt/` (the radio needs a channel named "mqtt"
 *    with downlink on) `{ "from": <the MQTT radio's number>, "type": "sendtext",
 *    "payload": "<text>", "channel": <index> }`; leaving out `to` sends to everyone.
 *  - Before firmware 2.2.0 the numbers were signed; they are read as unsigned here.
 *  - "JSON is not supported on the nRF52 platform."
 */

/** The JSON text Outpost reads from one message at most; a radio's own are far smaller. */
export const MOST_JSON_BYTES = 8192;

export interface TopicParts {
  root: string;
  format: "json" | "encoded";
  channel: string;
  /** The publishing radio's id, "!a1b2c3d4", when the topic has one. */
  gatewayId: string | null;
}

/** Splits a radio's topic; null for any other topic, and for the downlink topic Outpost itself sends to. */
export function parseTopic(topic: string): TopicParts | null {
  const match = /^(.+)\/2\/(json|e|c)\/([^/+#]+)(?:\/(![0-9a-fA-F]{1,8}))?\/?$/.exec(topic);
  if (!match) return null;
  const [, root, kind, channel, gateway] = match;
  if (kind === "json" && channel === "mqtt") return null;
  return {
    root: root!,
    format: kind === "json" ? "json" : "encoded",
    channel: channel!,
    gatewayId: gateway ? gateway.toLowerCase() : null,
  };
}

/** A radio's number as its id: 2864434397 → "!aabbccdd". */
export const nodeId = (num: number) => `!${(num >>> 0).toString(16).padStart(8, "0")}`;

/** "!aabbccdd" → 2864434397, or null. */
export function nodeNum(id: string): number | null {
  const match = /^!([0-9a-f]{1,8})$/i.exec(id);
  return match ? Number.parseInt(match[1]!, 16) >>> 0 : null;
}

export type Uplink =
  | {
      type: "text";
      /** The message's id, unique per sending radio. */
      id: number;
      from: string;
      channelIndex: number | null;
      /** True when sent to everyone on the channel; a direct message to one radio is not a channel's. */
      broadcast: boolean;
      text: string;
      sender: string | null;
      snr: number | null;
      hops: number | null;
    }
  | { type: "nodeinfo"; from: string; id: string | null; longName: string | null; shortName: string | null }
  | { type: "other" };

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

/** Reads one JSON message as a radio publishes it. Null for anything that is not one. */
export function parseUplink(payload: Buffer): Uplink | null {
  if (payload.length > MOST_JSON_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  const from = num(message.from);
  const type = typeof message.type === "string" ? message.type : null;
  if (from === null || !type) return null;
  if (type === "text") {
    const body = message.payload;
    const text =
      typeof body === "string"
        ? body
        : body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string"
          ? (body as { text: string }).text
          : null;
    const id = num(message.id);
    if (text === null || id === null) return null;
    const to = num(message.to);
    return {
      type: "text",
      id: id >>> 0,
      from: nodeId(from),
      channelIndex: num(message.channel),
      broadcast: to === null || to === -1 || to >>> 0 === 0xffffffff,
      text: text.slice(0, 2000),
      sender: str(message.sender, 16),
      snr: num(message.snr),
      hops: num(message.hops_away),
    };
  }
  if (type === "nodeinfo") {
    const body = message.payload && typeof message.payload === "object" ? (message.payload as Record<string, unknown>) : {};
    return {
      type: "nodeinfo",
      from: nodeId(from),
      id: str(body.id, 16),
      longName: str(body.longname, 40),
      shortName: str(body.shortname, 8),
    };
  }
  return { type: "other" };
}

/** The topic a radio takes JSON to send from. */
export const downlinkTopic = (root: string) => `${root}/2/json/mqtt/`;

/** What a radio is given to send on a channel, to everyone on it. */
export function downlink(gateway: number, channelIndex: number, text: string): Buffer {
  return Buffer.from(JSON.stringify({ from: gateway >>> 0, type: "sendtext", payload: text, channel: channelIndex }), "utf8");
}
