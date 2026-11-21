/**
 * AX.25 UI frames, as APRS sends them (AX.25 Link Access Protocol v2.2, sections 3 and
 * 6.1; APRS Protocol Reference 1.0.1, chapter 4). A frame from a KISS TNC has no flags
 * and no checksum: the address field, the control byte, the protocol byte and the
 * information field.
 *
 * Each address is seven bytes: six characters shifted left one bit, padded with spaces,
 * then a byte holding the SSID in bits 1 to 4. The lowest bit of that byte is set on the
 * last address. On a digipeater's address bit 7 is the "has been repeated" bit (H): set,
 * the packet came through that digipeater. The destination, then the source, then up to
 * eight digipeaters. APRS uses only UI frames (control 0x03) with no layer 3 (0xF0).
 */

export interface Ax25Address {
  call: string;
  ssid: number;
  /** For a digipeater: the packet has been repeated by it. */
  repeated: boolean;
}

export interface Ax25Frame {
  destination: Ax25Address;
  source: Ax25Address;
  digipeaters: Ax25Address[];
  info: Buffer;
}

export const MAX_DIGIPEATERS = 8;
/** The largest information field AX.25 allows by default (N1), and what Outpost keeps. */
export const MAX_INFO = 256;

export const addressText = (address: Pick<Ax25Address, "call" | "ssid">) =>
  address.ssid ? `${address.call}-${address.ssid}` : address.call;

function readAddress(frame: Buffer, offset: number): Ax25Address | null {
  let call = "";
  for (let i = 0; i < 6; i += 1) {
    const byte = frame[offset + i]!;
    // The lowest bit of a character byte is always 0.
    if (byte & 1) return null;
    const char = byte >> 1;
    if (char === 0x20) continue;
    // Callsigns are upper-case letters and digits; anything else is not an AX.25 address.
    if (!((char >= 0x30 && char <= 0x39) || (char >= 0x41 && char <= 0x5a))) return null;
    call += String.fromCharCode(char);
  }
  if (!call) return null;
  const ssidByte = frame[offset + 6]!;
  return { call, ssid: (ssidByte >> 1) & 0x0f, repeated: (ssidByte & 0x80) !== 0 };
}

/** The frame, or why it is not an APRS UI frame. */
export function decodeAx25(frame: Buffer): Ax25Frame | { error: string } {
  if (frame.length < 16) return { error: "too short" };
  const addresses: Ax25Address[] = [];
  let offset = 0;
  for (;;) {
    if (offset + 7 > frame.length) return { error: "address field runs off the end" };
    const address = readAddress(frame, offset);
    if (!address) return { error: "not an address" };
    addresses.push(address);
    const last = (frame[offset + 6]! & 1) === 1;
    offset += 7;
    if (last) break;
    if (addresses.length >= 2 + MAX_DIGIPEATERS) return { error: "too many digipeaters" };
  }
  if (addresses.length < 2) return { error: "no source" };
  if (offset + 2 > frame.length) return { error: "no control field" };
  const control = frame[offset]!;
  const pid = frame[offset + 1]!;
  // UI, with the poll/final bit either way.
  if ((control & 0xef) !== 0x03) return { error: "not a UI frame" };
  if (pid !== 0xf0) return { error: "not plain text" };
  const info = frame.subarray(offset + 2);
  if (info.length === 0) return { error: "no information" };
  if (info.length > MAX_INFO) return { error: "information field too long" };
  const [destination, source, ...digipeaters] = addresses;
  return { destination: destination!, source: source!, digipeaters, info: Buffer.from(info) };
}

/**
 * How the packet reached this receiver: straight from the station, or through a
 * digipeater, and which one when its callsign is in the path. The last digipeater with
 * its H bit set is the one heard. A generic alias marked as used (WIDE1, RELAY) says a
 * digipeater was involved without saying which.
 */
export function pathOf(digipeaters: Ax25Address[]): { direct: boolean; via: string | null } {
  let last: Ax25Address | null = null;
  for (const digi of digipeaters) if (digi.repeated) last = digi;
  if (!last) return { direct: true, via: null };
  return { direct: false, via: addressText(last) };
}

/** An address as it would be sent: for tests and the stand-in server. */
export function encodeAddress(text: string, last: boolean, repeated = false): Buffer {
  const [call = "", ssidText] = text.split("-");
  const out = Buffer.alloc(7);
  const padded = call.toUpperCase().padEnd(6, " ").slice(0, 6);
  for (let i = 0; i < 6; i += 1) out[i] = padded.charCodeAt(i) << 1;
  out[6] = 0x60 | ((Number(ssidText ?? 0) & 0x0f) << 1) | (last ? 1 : 0) | (repeated ? 0x80 : 0);
  return out;
}

/**
 * A UI frame from a packet written as TNC2 text ("M0ABC-9>APRS,WIDE1*,WIDE2-1:!5130.00N/00010.00W>"),
 * for tests and the stand-in server. A "*" marks a digipeater as having repeated it.
 */
export function encodeTnc2(packet: string): Buffer {
  const colon = packet.indexOf(":");
  const header = packet.slice(0, colon);
  const info = Buffer.from(packet.slice(colon + 1), "latin1");
  const [source = "", rest = ""] = header.split(">");
  const [destination = "", ...path] = rest.split(",");
  const parts: Buffer[] = [encodeAddress(destination, false), encodeAddress(source, path.length === 0)];
  // In TNC2 text only the last digipeater that repeated it is starred; every one before it repeated it too.
  const lastStar = path.findLastIndex((hop) => hop.endsWith("*"));
  path.forEach((hop, index) => {
    parts.push(encodeAddress(hop.replace("*", ""), index === path.length - 1, index <= lastStar));
  });
  return Buffer.concat([...parts, Buffer.from([0x03, 0xf0]), info]);
}
