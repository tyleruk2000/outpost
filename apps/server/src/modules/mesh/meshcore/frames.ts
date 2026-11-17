/**
 * MeshCore's companion radio protocol: the frames, and the handful of commands and
 * answers Outpost uses to send and receive a channel's text. Written from MeshCore's own
 * documentation and source, which are under the MIT licence (docs/mesh-radio.md,
 * "Licence position"); nothing here is copied from them.
 *
 * Framing, over USB serial and over the network port alike, as MeshCore's
 * `src/helpers/ArduinoSerialInterface.cpp` reads and writes it (read on 17 November 2026):
 * a frame to the radio is `<` (0x3c), the payload's length in two bytes, least
 * significant first, then the payload; a frame from the radio is the same with `>`
 * (0x3e). There is no checksum and no escaping. Bytes before a start byte are skipped.
 * That the network port uses the same framing is what MeshCore's FAQ implies ("same as
 * the WiFi companion radio", 7.8); its TCP source could not be read (docs/sources.md).
 *
 * Commands and answers, from `docs/companion_protocol.md` ("Companion Protocol", last
 * updated 2026-03-08, for companion firmware v1.12.0 and later; it says itself it may be
 * inaccurate in places): multi-byte integers little-endian, text UTF-8.
 */

/** The largest payload kept. A larger frame is skipped whole (not cut), and reading carries on after it. */
export const MAX_FRAME_PAYLOAD = 300;

export const TO_RADIO = 0x3c; // "<"
export const FROM_RADIO = 0x3e; // ">"

export const CMD = {
  appStart: 0x01,
  sendChannelText: 0x03,
  syncNextMessage: 0x0a,
  deviceQuery: 0x16,
  getChannel: 0x1f,
} as const;

export const RESP = {
  ok: 0x00,
  err: 0x01,
  selfInfo: 0x05,
  sent: 0x06,
  channelMessage: 0x08,
  noMoreMessages: 0x0a,
  deviceInfo: 0x0d,
  channelMessageV3: 0x11,
  channelInfo: 0x12,
} as const;

/** Codes at 0x80 and above come from the radio on its own (a push), never as the answer to a command. */
export const PUSH = {
  advert: 0x80,
  messagesWaiting: 0x83,
} as const;

export const isPush = (code: number) => code >= 0x80;

/** One frame, with its start byte and length in front. */
export function encodeFrame(payload: Uint8Array, start: number = TO_RADIO): Buffer {
  if (payload.length > 0xffff) throw new Error("A frame's payload is at most 65,535 bytes.");
  const frame = Buffer.alloc(3 + payload.length);
  frame[0] = start;
  frame.writeUInt16LE(payload.length, 1);
  Buffer.from(payload).copy(frame, 3);
  return frame;
}

/**
 * Takes bytes as they arrive and gives back whole payloads. Bytes outside a frame (a
 * radio's boot messages, line noise) are skipped until the start byte; a zero-length
 * frame is ignored, as MeshCore's own reader does; a frame longer than the limit is
 * skipped, its bytes counted off as they pass, so that nothing large is ever held.
 */
export class FrameReader {
  private state: "idle" | "len1" | "len2" | "body" | "skip" = "idle";
  private length = 0;
  private body: Buffer = Buffer.alloc(0);
  private filled = 0;
  private skipping = 0;
  /** Frames skipped for being too long, for a test or a log line. */
  skipped = 0;

  private readonly start: number;
  private readonly max: number;

  constructor(start: number = FROM_RADIO, max: number = MAX_FRAME_PAYLOAD) {
    this.start = start;
    this.max = max;
  }

  push(chunk: Uint8Array): Buffer[] {
    const out: Buffer[] = [];
    let i = 0;
    while (i < chunk.length) {
      const byte = chunk[i]!;
      switch (this.state) {
        case "idle":
          if (byte === this.start) this.state = "len1";
          i += 1;
          break;
        case "len1":
          this.length = byte;
          this.state = "len2";
          i += 1;
          break;
        case "len2":
          this.length |= byte << 8;
          i += 1;
          if (this.length === 0) this.state = "idle";
          else if (this.length > this.max) {
            this.skipped += 1;
            this.skipping = this.length;
            this.state = "skip";
          } else {
            this.body = Buffer.alloc(this.length);
            this.filled = 0;
            this.state = "body";
          }
          break;
        case "body": {
          const take = Math.min(this.length - this.filled, chunk.length - i);
          Buffer.from(chunk.buffer, chunk.byteOffset + i, take).copy(this.body, this.filled);
          this.filled += take;
          i += take;
          if (this.filled === this.length) {
            out.push(this.body);
            this.state = "idle";
          }
          break;
        }
        case "skip": {
          const take = Math.min(this.skipping, chunk.length - i);
          this.skipping -= take;
          i += take;
          if (this.skipping === 0) this.state = "idle";
          break;
        }
      }
    }
    return out;
  }
}

// ── Commands ──

/** CMD_APP_START: 0x01, seven reserved bytes, then the app's name. Answered with SELF_INFO. */
export function appStart(appName = "Outpost"): Buffer {
  return Buffer.concat([Buffer.from([CMD.appStart, 0, 0, 0, 0, 0, 0, 0]), Buffer.from(appName, "utf8")]);
}

/** CMD_DEVICE_QUERY, as the documentation gives it: `16 03`. Answered with DEVICE_INFO. */
export const deviceQuery = () => Buffer.from([CMD.deviceQuery, 0x03]);

/** CMD_GET_CHANNEL for a slot. Answered with CHANNEL_INFO, or ERR past the last slot. */
export const getChannel = (index: number) => Buffer.from([CMD.getChannel, index & 0xff]);

/** CMD_SYNC_NEXT_MESSAGE: the next message the radio holds, or NO_MORE_MESSAGES. */
export const syncNextMessage = () => Buffer.from([CMD.syncNextMessage]);

/** CMD_SEND_CHANNEL_TXT_MSG: 0x03, 0x00 (plain text), the slot, the time in seconds (uint32), the text. */
export function sendChannelText(index: number, text: string, unixSeconds: number): Buffer {
  const head = Buffer.alloc(7);
  head[0] = CMD.sendChannelText;
  head[1] = 0x00;
  head[2] = index & 0xff;
  head.writeUInt32LE(unixSeconds >>> 0, 3);
  return Buffer.concat([head, Buffer.from(text, "utf8")]);
}

// ── Answers ──

export interface ChannelMessage {
  channelIndex: number;
  pathLength: number;
  textType: number;
  /** Seconds since 1970, as the sending radio set it. */
  timestamp: number;
  text: string;
  /** Signal to noise in dB; only the V3 answer has it. */
  snr: number | null;
}

/** Text with any NUL padding at its end taken off. */
function utf8(bytes: Buffer): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

/**
 * CHANNEL_MSG_RECV (0x08): slot, path length, text type, time, text.
 * CHANNEL_MSG_RECV_V3 (0x11): SNR ×4 (signed), two reserved, then the same.
 * A text type of 2 has a four-byte signature after the time.
 */
export function parseChannelMessage(frame: Buffer): ChannelMessage | null {
  const code = frame[0];
  let at: number;
  let snr: number | null = null;
  if (code === RESP.channelMessage) at = 1;
  else if (code === RESP.channelMessageV3) {
    if (frame.length < 4) return null;
    snr = frame.readInt8(1) / 4;
    at = 4;
  } else return null;
  if (frame.length < at + 7) return null;
  const channelIndex = frame[at]!;
  const pathLength = frame[at + 1]!;
  const textType = frame[at + 2]!;
  const timestamp = frame.readUInt32LE(at + 3);
  let textAt = at + 7;
  if (textType === 2) textAt += 4;
  if (frame.length < textAt) return null;
  return { channelIndex, pathLength, textType, timestamp, text: utf8(frame.subarray(textAt)), snr };
}

/** CHANNEL_INFO (0x12): slot, the name in 32 bytes, then the 16-byte secret, which Outpost does not keep. */
export function parseChannelInfo(frame: Buffer): { index: number; name: string } | null {
  if (frame[0] !== RESP.channelInfo || frame.length < 34) return null;
  return { index: frame[1]!, name: utf8(frame.subarray(2, 34)) };
}

/** SELF_INFO (0x05): the radio's own name is everything from byte 58. */
export function parseSelfInfo(frame: Buffer): { name: string; publicKeyPrefix: string } | null {
  if (frame[0] !== RESP.selfInfo || frame.length < 58) return null;
  return { name: utf8(frame.subarray(58)), publicKeyPrefix: frame.subarray(4, 10).toString("hex") };
}

/** SENT (0x06): flood or direct, the tag an acknowledgement would carry, and the suggested time to wait for one. */
export function parseSent(frame: Buffer): { flood: boolean; tag: number; timeoutMs: number } | null {
  if (frame[0] !== RESP.sent || frame.length < 10) return null;
  return { flood: frame[1] === 1, tag: frame.readUInt32LE(2), timeoutMs: frame.readUInt32LE(6) };
}

/**
 * The sender of a channel message, where its text names one. The protocol has no field
 * for it; the text of a channel message as other MeshCore apps show it starts with the
 * sender's name and a colon, so a short name before ": " is taken as the sender's name as
 * written, and nothing more is claimed for it.
 */
export function splitSender(text: string): { name: string | null; words: string } {
  const match = /^([^:\n]{1,32}): ([\s\S]*)$/.exec(text);
  return match ? { name: match[1]!.trim() || null, words: match[2]! } : { name: null, words: text };
}
