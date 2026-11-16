/**
 * The handful of DER encodings an X.509 certificate is made of, and a reader for
 * walking one.
 *
 * Node can generate keys, sign, and read a certificate, but it cannot write one. What
 * is missing is only this layer: how a sequence, an integer, an object identifier and a
 * date are laid out in bytes (ITU-T X.690). No cryptography happens here.
 */

function lengthOf(size: number): Buffer {
  if (size < 0x80) return Buffer.from([size]);
  const bytes: number[] = [];
  for (let rest = size; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

/** One tag-length-value. */
export function tlv(tag: number, ...content: Buffer[]): Buffer {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), lengthOf(body.length), body]);
}

export const sequence = (...items: Buffer[]): Buffer => tlv(0x30, ...items);
/** A set with one member. (A set of several would have to be sorted; nothing here needs one.) */
export const setOfOne = (item: Buffer): Buffer => tlv(0x31, item);
export const octetString = (bytes: Buffer): Buffer => tlv(0x04, bytes);
export const utf8String = (text: string): Buffer => tlv(0x0c, Buffer.from(text, "utf8"));
export const boolean = (value: boolean): Buffer => tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
/** NULL: the empty parameters some algorithm identifiers carry. */
export const nullValue = (): Buffer => tlv(0x05);

/** A non-negative integer, from a small number or from big-endian bytes. */
export function integer(value: number | Buffer): Buffer {
  let bytes: Buffer;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("integer() takes a non-negative whole number");
    const parts: number[] = [];
    for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) parts.unshift(rest % 256);
    bytes = Buffer.from(parts.length > 0 ? parts : [0]);
  } else {
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start += 1;
    bytes = value.subarray(start);
  }
  // The top bit is the sign; a leading zero keeps a large value positive.
  return tlv(0x02, (bytes[0] ?? 0) & 0x80 ? Buffer.from([0]) : Buffer.alloc(0), bytes.length > 0 ? bytes : Buffer.from([0]));
}

/** A bit string. `unusedBits` is how many bits of the last byte are padding. */
export const bitString = (bytes: Buffer, unusedBits = 0): Buffer => tlv(0x03, Buffer.from([unusedBits]), bytes);

/** An object identifier written the usual way, such as "2.5.29.17". */
export function oid(dotted: string): Buffer {
  const arcs = dotted.split(".").map(Number);
  const [first, second, ...rest] = arcs;
  if (first === undefined || second === undefined || arcs.some((arc) => !Number.isSafeInteger(arc) || arc < 0)) {
    throw new Error(`Not an object identifier: ${dotted}`);
  }
  const bytes: number[] = [];
  for (const arc of [first * 40 + second, ...rest]) {
    const group = [arc % 128];
    for (let more = Math.floor(arc / 128); more > 0; more = Math.floor(more / 128)) group.unshift((more % 128) | 0x80);
    bytes.push(...group);
  }
  return tlv(0x06, Buffer.from(bytes));
}

/** A moment, as certificates write it: UTCTime up to 2049, GeneralizedTime from 2050 (RFC 5280, 4.1.2.5). */
export function time(date: Date): Buffer {
  const two = (n: number) => String(n).padStart(2, "0");
  const year = date.getUTCFullYear();
  const rest = `${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`;
  if (year >= 1950 && year < 2050) return tlv(0x17, Buffer.from(`${two(year % 100)}${rest}`, "ascii"));
  return tlv(0x18, Buffer.from(`${String(year).padStart(4, "0")}${rest}`, "ascii"));
}

/** A context-specific tag: `[n]` holding other values (constructed) or raw bytes (primitive). */
export const contextual = (n: number, constructed: boolean, ...content: Buffer[]): Buffer =>
  tlv((constructed ? 0xa0 : 0x80) | n, ...content);

// ── Reading ──

export interface DerValue {
  tag: number;
  /** The value's own bytes, without tag and length. */
  content: Buffer;
  /** Tag, length and content together. */
  raw: Buffer;
}

/** Reads the one value that starts at `offset`. */
export function readValue(buffer: Buffer, offset = 0): DerValue & { end: number } {
  const tag = buffer[offset];
  const first = buffer[offset + 1];
  if (tag === undefined || first === undefined) throw new Error("DER value is cut short");
  // Tags above 30 use more than one byte; a certificate has none.
  if ((tag & 0x1f) === 0x1f) throw new Error("DER tag form not supported");
  let size = first;
  let start = offset + 2;
  if (first & 0x80) {
    const count = first & 0x7f;
    if (count === 0 || count > 4) throw new Error("DER length not supported");
    size = 0;
    for (let index = 0; index < count; index += 1) {
      const byte = buffer[start + index];
      if (byte === undefined) throw new Error("DER value is cut short");
      size = size * 256 + byte;
    }
    start += count;
  }
  const end = start + size;
  if (end > buffer.length) throw new Error("DER value is cut short");
  return { tag, content: buffer.subarray(start, end), raw: buffer.subarray(offset, end), end };
}

/** The values inside a sequence, a set or a constructed context tag. */
export function readChildren(content: Buffer): DerValue[] {
  const values: DerValue[] = [];
  for (let offset = 0; offset < content.length; ) {
    const { end, ...value } = readValue(content, offset);
    values.push(value);
    offset = end;
  }
  return values;
}

/** The dotted form of an object identifier's content bytes. */
export function readOid(content: Buffer): string {
  const arcs: number[] = [];
  let value = 0;
  for (const byte of content) {
    value = value * 128 + (byte & 0x7f);
    if (byte & 0x80) continue;
    if (arcs.length === 0) arcs.push(Math.min(Math.floor(value / 40), 2), value - Math.min(Math.floor(value / 40), 2) * 40);
    else arcs.push(value);
    value = 0;
  }
  return arcs.join(".");
}
