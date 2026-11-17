/**
 * MQTT 3.1.1 packets: reading them from a byte stream and writing them out, written from
 * the OASIS standard (mqtt-v3.1.1-os). Only what a Meshtastic radio and Outpost need is
 * here: CONNECT, CONNACK, PUBLISH, PUBACK, SUBSCRIBE, SUBACK, UNSUBSCRIBE, UNSUBACK,
 * PINGREQ, PINGRESP and DISCONNECT. The QoS 2 packets (PUBREC, PUBREL, PUBCOMP) are not
 * understood, and reading one is an error.
 *
 * The reader is strict, because what it reads comes from anything on the home network:
 * a packet larger than the limit is refused as soon as its length is known, before any of
 * it is kept; a length field longer than four bytes, fixed-header flags the standard fixes
 * to other values, strings that are not UTF-8 and fields that run past the end of their
 * packet are all errors. Every error is an `MqttProtocolError`, and its message never
 * repeats the bytes it was given.
 *
 * Also here: matching topic names against subscription filters with `+` and `#`.
 */

export type MqttErrorCode = "packet-too-large" | "malformed" | "unsupported";

/** A packet that breaks the standard, or one this implementation does not take. The connection should be closed. */
export class MqttProtocolError extends Error {
  readonly code: MqttErrorCode;
  constructor(code: MqttErrorCode, message: string) {
    super(message);
    this.name = "MqttProtocolError";
    this.code = code;
  }
}

export type QoS = 0 | 1 | 2;

export interface ConnectPacket {
  type: "connect";
  clientId: string;
  cleanSession: boolean;
  keepAliveSeconds: number;
  userName?: string;
  password?: Buffer;
  will?: { topic: string; payload: Buffer; qos: QoS; retain: boolean };
}
/** A CONNECT for another version of the protocol (3.1's "MQIsdp", or a level other than 4). Only the version is read. */
export interface UnsupportedConnectPacket {
  type: "connect-unsupported";
  protocolName: string;
  protocolLevel: number;
}
export interface ConnackPacket {
  type: "connack";
  sessionPresent: boolean;
  returnCode: number;
}
export interface PublishPacket {
  type: "publish";
  topic: string;
  payload: Buffer;
  qos: QoS;
  retain: boolean;
  dup: boolean;
  /** Present when qos is above 0. */
  packetId?: number;
}
export interface PubackPacket {
  type: "puback";
  packetId: number;
}
export interface SubscribePacket {
  type: "subscribe";
  packetId: number;
  subscriptions: Array<{ filter: string; qos: QoS }>;
}
export interface SubackPacket {
  type: "suback";
  packetId: number;
  /** 0, 1 or 2 for the QoS granted, 0x80 for a refused filter; one per filter, in order. */
  returnCodes: number[];
}
export interface UnsubscribePacket {
  type: "unsubscribe";
  packetId: number;
  filters: string[];
}
export interface UnsubackPacket {
  type: "unsuback";
  packetId: number;
}
export interface EmptyPacket {
  type: "pingreq" | "pingresp" | "disconnect";
}

export type Packet =
  | ConnectPacket
  | UnsupportedConnectPacket
  | ConnackPacket
  | PublishPacket
  | PubackPacket
  | SubscribePacket
  | SubackPacket
  | UnsubscribePacket
  | UnsubackPacket
  | EmptyPacket;

/** CONNACK return codes (3.2.2.3). */
export const CONNACK = {
  accepted: 0,
  badProtocolVersion: 1,
  identifierRejected: 2,
  serverUnavailable: 3,
  badUserNameOrPassword: 4,
  notAuthorised: 5,
} as const;

/** The SUBACK return code for a filter that was refused. */
export const SUBACK_FAILURE = 0x80;

/** The largest value the four-byte remaining length can hold (2.2.3). */
const MAX_REMAINING_LENGTH = 268_435_455;

const TYPE = {
  connect: 1,
  connack: 2,
  publish: 3,
  puback: 4,
  pubrec: 5,
  pubrel: 6,
  pubcomp: 7,
  subscribe: 8,
  suback: 9,
  unsubscribe: 10,
  unsuback: 11,
  pingreq: 12,
  pingresp: 13,
  disconnect: 14,
} as const;

const malformed = (message: string) => new MqttProtocolError("malformed", message);

// `fatal` refuses malformed UTF-8 (1.5.3-1); `ignoreBOM` keeps a leading U+FEFF rather than
// stripping it, as 1.5.3-3 requires.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// ---------------------------------------------------------------------------------------
// Reading

interface Cursor {
  buf: Buffer;
  pos: number;
}

function readByte(c: Cursor, what: string): number {
  if (c.pos + 1 > c.buf.length) throw malformed(`The ${what} runs past the end of the packet.`);
  const value = c.buf[c.pos]!;
  c.pos += 1;
  return value;
}

function readUint16(c: Cursor, what: string): number {
  if (c.pos + 2 > c.buf.length) throw malformed(`The ${what} runs past the end of the packet.`);
  const value = c.buf.readUInt16BE(c.pos);
  c.pos += 2;
  return value;
}

function readBinary(c: Cursor, what: string): Buffer {
  const length = readUint16(c, `length of the ${what}`);
  if (c.pos + length > c.buf.length) throw malformed(`The ${what} runs past the end of the packet.`);
  // A copy, so that a small field does not keep the whole chunk it arrived in alive.
  const value = Buffer.from(c.buf.subarray(c.pos, c.pos + length));
  c.pos += length;
  return value;
}

function readString(c: Cursor, what: string): string {
  const length = readUint16(c, `length of the ${what}`);
  if (c.pos + length > c.buf.length) throw malformed(`The ${what} runs past the end of the packet.`);
  let value: string;
  try {
    value = utf8.decode(c.buf.subarray(c.pos, c.pos + length));
  } catch {
    throw malformed(`The ${what} is not valid UTF-8.`);
  }
  // U+0000 is not allowed in any string (1.5.3-2).
  if (value.includes("\u0000")) throw malformed(`The ${what} contains a null character.`);
  c.pos += length;
  return value;
}

function readPacketId(c: Cursor): number {
  const id = readUint16(c, "packet identifier");
  if (id === 0) throw malformed("A packet identifier of 0 is not allowed.");
  return id;
}

function expectEnd(c: Cursor, name: string): void {
  if (c.pos !== c.buf.length) throw malformed(`The ${name} packet has bytes after its last field.`);
}

/** The fixed flags each packet type must carry (2.2.2); PUBLISH alone has flags of its own. */
function checkFlags(type: number, flags: number): void {
  if (type === TYPE.publish) return;
  const required = type === TYPE.pubrel || type === TYPE.subscribe || type === TYPE.unsubscribe ? 0b0010 : 0;
  if (flags !== required) throw malformed("The fixed header carries flags the standard does not allow for this packet type.");
}

function decodeConnect(c: Cursor): ConnectPacket | UnsupportedConnectPacket {
  const protocolName = readString(c, "protocol name");
  const protocolLevel = readByte(c, "protocol level");
  if (protocolName !== "MQTT" || protocolLevel !== 4) {
    // 3.1 clients say "MQIsdp"; they and other levels of "MQTT" are answered with CONNACK 1
    // (3.1.2-2). Any other name is not MQTT at all (3.1.2-1).
    if (protocolName === "MQTT" || protocolName === "MQIsdp") return { type: "connect-unsupported", protocolName, protocolLevel };
    throw malformed("The CONNECT packet names a protocol other than MQTT.");
  }
  const flags = readByte(c, "connect flags");
  if (flags & 0b1) throw malformed("The reserved connect flag is set.");
  const cleanSession = (flags & 0b10) !== 0;
  const willFlag = (flags & 0b100) !== 0;
  const willQos = (flags >> 3) & 0b11;
  const willRetain = (flags & 0b10_0000) !== 0;
  const passwordFlag = (flags & 0b100_0000) !== 0;
  const userNameFlag = (flags & 0b1000_0000) !== 0;
  if (willQos === 3) throw malformed("The will QoS is 3.");
  if (!willFlag && (willQos !== 0 || willRetain)) throw malformed("Will QoS or retain is set without a will.");
  if (passwordFlag && !userNameFlag) throw malformed("A password is given without a user name.");
  const keepAliveSeconds = readUint16(c, "keep-alive");
  const clientId = readString(c, "client identifier");
  const packet: ConnectPacket = { type: "connect", clientId, cleanSession, keepAliveSeconds };
  if (willFlag) {
    const topic = readString(c, "will topic");
    const payload = readBinary(c, "will message");
    packet.will = { topic, payload, qos: willQos as QoS, retain: willRetain };
  }
  if (userNameFlag) packet.userName = readString(c, "user name");
  if (passwordFlag) packet.password = readBinary(c, "password");
  expectEnd(c, "CONNECT");
  return packet;
}

function decodePublish(flags: number, c: Cursor): PublishPacket {
  const qos = (flags >> 1) & 0b11;
  if (qos === 3) throw malformed("The PUBLISH packet has QoS 3.");
  const topic = readString(c, "topic name");
  // A topic name must not be empty nor hold wildcards (3.3.2-2, 4.7.3-1).
  if (!validTopicName(topic)) throw malformed("The PUBLISH topic name is empty or contains a wildcard.");
  const packet: PublishPacket = {
    type: "publish",
    topic,
    payload: Buffer.alloc(0),
    qos: qos as QoS,
    retain: (flags & 0b1) !== 0,
    // DUP on a QoS 0 message breaks 3.3.1-2, but it carries no meaning there and is ignored
    // rather than refused: it is harmless, and a radio that sets it should still be heard.
    dup: (flags & 0b1000) !== 0,
  };
  if (qos > 0) packet.packetId = readPacketId(c);
  packet.payload = Buffer.from(c.buf.subarray(c.pos));
  c.pos = c.buf.length;
  return packet;
}

function decodeSubscribe(c: Cursor): SubscribePacket {
  const packetId = readPacketId(c);
  const subscriptions: SubscribePacket["subscriptions"] = [];
  while (c.pos < c.buf.length) {
    const filter = readString(c, "topic filter");
    const qos = readByte(c, "requested QoS");
    if (qos > 2) throw malformed("A requested QoS is not 0, 1 or 2."); // 3.8.3-4
    subscriptions.push({ filter, qos: qos as QoS });
  }
  if (subscriptions.length === 0) throw malformed("The SUBSCRIBE packet has no topic filters."); // 3.8.3-3
  return { type: "subscribe", packetId, subscriptions };
}

function decodeUnsubscribe(c: Cursor): UnsubscribePacket {
  const packetId = readPacketId(c);
  const filters: string[] = [];
  while (c.pos < c.buf.length) filters.push(readString(c, "topic filter"));
  if (filters.length === 0) throw malformed("The UNSUBSCRIBE packet has no topic filters."); // 3.10.3-2
  return { type: "unsubscribe", packetId, filters };
}

function decodeSuback(c: Cursor): SubackPacket {
  const packetId = readUint16(c, "packet identifier");
  const returnCodes = [...c.buf.subarray(c.pos)];
  c.pos = c.buf.length;
  if (returnCodes.length === 0) throw malformed("The SUBACK packet has no return codes.");
  for (const code of returnCodes) {
    if (code > 2 && code !== SUBACK_FAILURE) throw malformed("A SUBACK return code is not one the standard defines.");
  }
  return { type: "suback", packetId, returnCodes };
}

function decodeBody(type: number, flags: number, body: Buffer): Packet {
  checkFlags(type, flags);
  const c: Cursor = { buf: body, pos: 0 };
  switch (type) {
    case TYPE.connect:
      return decodeConnect(c);
    case TYPE.connack: {
      const ackFlags = readByte(c, "acknowledge flags");
      if (ackFlags & 0b1111_1110) throw malformed("Reserved CONNACK flags are set.");
      const returnCode = readByte(c, "return code");
      expectEnd(c, "CONNACK");
      return { type: "connack", sessionPresent: ackFlags === 1, returnCode };
    }
    case TYPE.publish:
      return decodePublish(flags, c);
    case TYPE.puback: {
      const packetId = readUint16(c, "packet identifier");
      expectEnd(c, "PUBACK");
      return { type: "puback", packetId };
    }
    case TYPE.subscribe:
      return decodeSubscribe(c);
    case TYPE.suback:
      return decodeSuback(c);
    case TYPE.unsubscribe:
      return decodeUnsubscribe(c);
    case TYPE.unsuback: {
      const packetId = readUint16(c, "packet identifier");
      expectEnd(c, "UNSUBACK");
      return { type: "unsuback", packetId };
    }
    case TYPE.pingreq:
    case TYPE.pingresp:
    case TYPE.disconnect: {
      const name = type === TYPE.pingreq ? "pingreq" : type === TYPE.pingresp ? "pingresp" : "disconnect";
      expectEnd(c, name.toUpperCase());
      return { type: name };
    }
    case TYPE.pubrec:
    case TYPE.pubrel:
    case TYPE.pubcomp:
      throw new MqttProtocolError("unsupported", "QoS 2 is not supported.");
    default:
      // 0 and 15 are reserved.
      throw malformed("The packet type is reserved.");
  }
}

/**
 * Takes bytes as they arrive on a connection and gives back whole packets. It holds at most
 * one partial packet, and never more than `maxPacketBytes` of it: a packet whose header says
 * it is larger is refused before its body is read.
 */
export class PacketReader {
  #pending: Buffer = Buffer.alloc(0);
  readonly #maxPacketBytes: number;

  constructor(maxPacketBytes: number) {
    this.#maxPacketBytes = maxPacketBytes;
  }

  /** Bytes held for a packet not yet complete. */
  get buffered(): number {
    return this.#pending.length;
  }

  /** Throws `MqttProtocolError`; after that the reader, like the connection, should be dropped. */
  push(chunk: Buffer): Packet[] {
    this.#pending = this.#pending.length === 0 ? chunk : Buffer.concat([this.#pending, chunk]);
    const packets: Packet[] = [];
    for (;;) {
      const buf = this.#pending;
      if (buf.length < 2) break;
      // The remaining length: seven bits a byte, least significant first, at most four bytes (2.2.3).
      let remainingLength = 0;
      let multiplier = 1;
      let headerLength = 0;
      for (let i = 1; ; i++) {
        if (i > 4) throw malformed("The remaining length is longer than four bytes.");
        if (i >= buf.length) break;
        const byte = buf[i]!;
        remainingLength += (byte & 0x7f) * multiplier;
        multiplier *= 128;
        if ((byte & 0x80) === 0) {
          headerLength = i + 1;
          break;
        }
      }
      if (headerLength === 0) break; // the length is not all here yet
      const total = headerLength + remainingLength;
      if (total > this.#maxPacketBytes) {
        this.#pending = Buffer.alloc(0);
        throw new MqttProtocolError("packet-too-large", `A packet of ${total} bytes is over the limit of ${this.#maxPacketBytes}.`);
      }
      if (buf.length < total) break;
      const first = buf[0]!;
      packets.push(decodeBody(first >> 4, first & 0x0f, buf.subarray(headerLength, total)));
      this.#pending = buf.subarray(total);
    }
    // Copy a small tail out of what may be a large chunk, so the chunk can be let go.
    if (this.#pending.length > 0 && this.#pending.buffer.byteLength > this.#pending.length * 4) {
      this.#pending = Buffer.from(this.#pending);
    }
    return packets;
  }
}

// ---------------------------------------------------------------------------------------
// Writing

function remainingLengthBytes(length: number): number[] {
  if (length > MAX_REMAINING_LENGTH) throw new RangeError("The packet is too large for MQTT.");
  const out: number[] = [];
  let value = length;
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    out.push(byte);
  } while (value > 0);
  return out;
}

function frame(firstByte: number, parts: Buffer[]): Buffer {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  return Buffer.concat([Buffer.from([firstByte, ...remainingLengthBytes(length)]), ...parts]);
}

function uint16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value);
  return buf;
}

function binaryField(value: Buffer): Buffer {
  if (value.length > 0xffff) throw new RangeError("A field is longer than 65535 bytes.");
  return Buffer.concat([uint16(value.length), value]);
}

function stringField(value: string): Buffer {
  return binaryField(Buffer.from(value, "utf8"));
}

export function encodePacket(packet: Packet): Buffer {
  switch (packet.type) {
    case "connect": {
      let flags = 0;
      if (packet.cleanSession) flags |= 0b10;
      const payload = [stringField(packet.clientId)];
      if (packet.will) {
        flags |= 0b100 | (packet.will.qos << 3) | (packet.will.retain ? 0b10_0000 : 0);
        payload.push(stringField(packet.will.topic), binaryField(packet.will.payload));
      }
      if (packet.userName !== undefined) {
        flags |= 0b1000_0000;
        payload.push(stringField(packet.userName));
      }
      if (packet.password !== undefined) {
        flags |= 0b100_0000;
        payload.push(binaryField(packet.password));
      }
      return frame(TYPE.connect << 4, [stringField("MQTT"), Buffer.from([4, flags]), uint16(packet.keepAliveSeconds), ...payload]);
    }
    case "connect-unsupported":
      throw new RangeError("Only MQTT 3.1.1 CONNECT packets are written.");
    case "connack":
      return frame(TYPE.connack << 4, [Buffer.from([packet.sessionPresent ? 1 : 0, packet.returnCode])]);
    case "publish": {
      const flags = (packet.dup ? 0b1000 : 0) | (packet.qos << 1) | (packet.retain ? 1 : 0);
      const parts = [stringField(packet.topic)];
      if (packet.qos > 0) parts.push(uint16(packet.packetId ?? 0));
      parts.push(packet.payload);
      return frame((TYPE.publish << 4) | flags, parts);
    }
    case "puback":
      return frame(TYPE.puback << 4, [uint16(packet.packetId)]);
    case "subscribe":
      return frame((TYPE.subscribe << 4) | 0b0010, [
        uint16(packet.packetId),
        ...packet.subscriptions.flatMap((s) => [stringField(s.filter), Buffer.from([s.qos])]),
      ]);
    case "suback":
      return frame(TYPE.suback << 4, [uint16(packet.packetId), Buffer.from(packet.returnCodes)]);
    case "unsubscribe":
      return frame((TYPE.unsubscribe << 4) | 0b0010, [uint16(packet.packetId), ...packet.filters.map(stringField)]);
    case "unsuback":
      return frame(TYPE.unsuback << 4, [uint16(packet.packetId)]);
    case "pingreq":
      return Buffer.from([TYPE.pingreq << 4, 0]);
    case "pingresp":
      return Buffer.from([TYPE.pingresp << 4, 0]);
    case "disconnect":
      return Buffer.from([TYPE.disconnect << 4, 0]);
  }
}

// ---------------------------------------------------------------------------------------
// Topics

function fitsAString(value: string): boolean {
  return value.length > 0 && Buffer.byteLength(value, "utf8") <= 0xffff && !value.includes("\u0000");
}

/** A name a PUBLISH may carry: not empty, no `+` or `#` (4.7.3-1, 3.3.2-2). */
export function validTopicName(topic: string): boolean {
  return fitsAString(topic) && !topic.includes("+") && !topic.includes("#");
}

/** A subscription filter: `+` only as a whole level, `#` only as the whole last level (4.7.1). */
export function validFilter(filter: string): boolean {
  if (!fitsAString(filter)) return false;
  const levels = filter.split("/");
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!;
    if (level.includes("#") && (level !== "#" || i !== levels.length - 1)) return false;
    if (level.includes("+") && level !== "+") return false;
  }
  return true;
}

/**
 * Whether a topic name falls under a filter. `+` stands for one level, `#` for any number
 * including none (so `a/#` takes `a` too). A topic starting with `$` is not matched by a
 * filter that starts with a wildcard (4.7.2-1).
 */
export function topicMatches(filter: string, topic: string): boolean {
  const filterLevels = filter.split("/");
  const topicLevels = topic.split("/");
  if (topic.startsWith("$") && (filterLevels[0] === "+" || filterLevels[0] === "#")) return false;
  for (let i = 0; i < filterLevels.length; i++) {
    const level = filterLevels[i];
    if (level === "#") return true;
    if (i >= topicLevels.length) return false;
    if (level !== "+" && level !== topicLevels[i]) return false;
  }
  return filterLevels.length === topicLevels.length;
}
