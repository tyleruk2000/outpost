/**
 * AIS: ships, shore stations and aids to navigation, from the NMEA sentences an AIS
 * decoder (AIS-catcher, rtl-ais) writes: `!AIVDM,<count>,<number>,<sequence>,<channel>,
 * <payload>,<fill bits>*<checksum>`. Written from "AIVDM/AIVDO protocol decoding" by
 * Eric S. Raymond (gpsd project, gpsd.gitlab.io/gpsd/AIVDM.html, read 21 November 2026),
 * which sets out ITU-R M.1371: the payload armouring (six bits a character), the common
 * navigation block of message types 1 to 3, and types 4, 5, 18, 19, 21 and 24. Nothing
 * here is copied from another program.
 *
 * Untrusted input: a line longer than an NMEA sentence may be is dropped, the checksum
 * must match, a message in parts is put together only from parts that arrive in order on
 * the same channel within a short time, and a field that does not read is left out.
 */

export const MAX_NMEA_LINE = 200;
/** A message is at most five parts (type 5 takes two); more are not waited for. */
const MAX_PARTS = 5;
const PART_WAIT_MS = 5_000;

export interface AisReport {
  type: number;
  mmsi: string;
  kind: "vessel" | "base" | "aid";
  aisClass: "A" | "B" | null;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  course: number | null;
  heading: number | null;
  status: string | null;
  name: string | null;
  callsign: string | null;
  imo: number | null;
  shipType: number | null;
  lengthM: number | null;
  beamM: number | null;
  draughtM: number | null;
  destination: string | null;
  aidType: number | null;
}

// ── The sentence ──

export function nmeaChecksumOk(line: string): boolean {
  const star = line.lastIndexOf("*");
  if (star < 1 || star + 3 > line.length) return false;
  let sum = 0;
  for (let i = 1; i < star; i += 1) sum ^= line.charCodeAt(i);
  return sum === Number.parseInt(line.slice(star + 1, star + 3), 16);
}

export interface AisFragment {
  count: number;
  number: number;
  sequence: string;
  channel: string;
  payload: string;
  fill: number;
}

/** One sentence's fields, or why it is not an AIS sentence. A tag block (`\...\`) in front is taken off. */
export function parseSentence(raw: string): AisFragment | { error: string } | null {
  let line = raw.trim();
  if (!line) return null;
  if (line.length > MAX_NMEA_LINE) return { error: "line too long" };
  if (line.startsWith("\\")) {
    const end = line.indexOf("\\", 1);
    if (end < 0) return { error: "tag block not closed" };
    line = line.slice(end + 1);
  }
  // !AIVDM is heard from others; !AIVDO is the receiver's own ship. Other sentences (a GPS's $GPRMC) are not AIS.
  if (!/^!(AI|AB|AD|AN|AR|AS|AT|AX|BS|SA)VD[MO],/.test(line)) return line.startsWith("!") ? { error: "not AIS" } : null;
  if (!nmeaChecksumOk(line)) return { error: "checksum" };
  const fields = line.slice(0, line.lastIndexOf("*")).split(",");
  if (fields.length !== 7) return { error: "wrong number of fields" };
  const count = Number(fields[1]);
  const number = Number(fields[2]);
  const fill = Number(fields[6]);
  const payload = fields[5]!;
  if (!Number.isInteger(count) || count < 1 || count > MAX_PARTS || !Number.isInteger(number) || number < 1 || number > count)
    return { error: "part numbers" };
  if (!Number.isInteger(fill) || fill < 0 || fill > 5) return { error: "fill bits" };
  if (!/^[0-W`-w]*$/.test(payload)) return { error: "payload armouring" };
  return { count, number, sequence: fields[3]!, channel: fields[4]!, payload, fill };
}

/** Puts parts together; gives back a whole payload with its fill bits. */
export class AisAssembler {
  private pending = new Map<string, { parts: string[]; at: number; fill: number }>();

  add(fragment: AisFragment, now = Date.now()): { payload: string; fill: number } | null {
    if (fragment.count === 1) return { payload: fragment.payload, fill: fragment.fill };
    for (const [key, entry] of this.pending) if (now - entry.at > PART_WAIT_MS) this.pending.delete(key);
    const key = `${fragment.sequence}:${fragment.channel}:${fragment.count}`;
    if (fragment.number === 1) {
      if (this.pending.size > 50) this.pending.clear();
      this.pending.set(key, { parts: [fragment.payload], at: now, fill: fragment.fill });
      return null;
    }
    const entry = this.pending.get(key);
    if (!entry || entry.parts.length !== fragment.number - 1) {
      this.pending.delete(key);
      return null;
    }
    entry.parts.push(fragment.payload);
    entry.fill = fragment.fill;
    if (fragment.number < fragment.count) return null;
    this.pending.delete(key);
    return { payload: entry.parts.join(""), fill: entry.fill };
  }
}

// ── The payload ──

/** Six bits a character ("ASCII payload armoring"): the character's code less 48, less 8 more above 40. */
function bitsOf(payload: string, fill: number): Uint8Array {
  const bits = new Uint8Array(payload.length * 6);
  for (let i = 0; i < payload.length; i += 1) {
    let value = payload.charCodeAt(i) - 48;
    if (value > 40) value -= 8;
    for (let b = 0; b < 6; b += 1) bits[i * 6 + b] = (value >> (5 - b)) & 1;
  }
  return bits.subarray(0, Math.max(0, bits.length - fill));
}

class Bits {
  readonly bits: Uint8Array;
  constructor(bits: Uint8Array) {
    this.bits = bits;
  }
  get length() {
    return this.bits.length;
  }
  has(start: number, width: number) {
    return start + width <= this.bits.length;
  }
  u(start: number, width: number): number {
    let value = 0;
    for (let i = 0; i < width; i += 1) value = value * 2 + (this.bits[start + i] ?? 0);
    return value;
  }
  i(start: number, width: number): number {
    const value = this.u(start, width);
    return this.bits[start] ? value - 2 ** width : value;
  }
  /** Six-bit text ("Sixbit ASCII"): "@" pads the end, and trailing spaces mean nothing. */
  text(start: number, width: number): string | null {
    const chars = Math.floor(Math.min(width, this.bits.length - start) / 6);
    let out = "";
    for (let c = 0; c < chars; c += 1) {
      const value = this.u(start + c * 6, 6);
      out += String.fromCharCode(value < 32 ? value + 64 : value);
    }
    const clean = out.replace(/@.*$/, "").trim();
    return clean || null;
  }
}

/** Longitude and latitude in 1/10000 minute; 181 and 91 degrees mean "not available". */
function position(bits: Bits, lonAt: number, latAt: number): { lat: number | null; lon: number | null } {
  if (!bits.has(latAt, 27)) return { lat: null, lon: null };
  const lon = bits.i(lonAt, 28) / 600000;
  const lat = bits.i(latAt, 27) / 600000;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return { lat: null, lon: null };
  return { lat, lon };
}

const speedOf = (raw: number) => (raw >= 1023 ? null : raw / 10);
const courseOf = (raw: number) => (raw >= 3600 ? null : raw / 10);
const headingOf = (raw: number) => (raw >= 360 ? null : raw);

/** Table 7, "Navigation Status". */
const STATUS = [
  "Under way using engine",
  "At anchor",
  "Not under command",
  "Restricted manoeuvrability",
  "Constrained by her draught",
  "Moored",
  "Aground",
  "Engaged in fishing",
  "Under way sailing",
];

/** Table 11, "Codes for Ship Type", in a few words each. */
export function shipTypeWords(code: number | null): string | null {
  if (code === null || code === 0) return null;
  const exact: Record<number, string> = {
    30: "Fishing vessel",
    31: "Towing",
    32: "Towing",
    33: "Dredging or underwater work",
    34: "Diving",
    35: "Military",
    36: "Sailing vessel",
    37: "Pleasure craft",
    50: "Pilot vessel",
    51: "Search and rescue vessel",
    52: "Tug",
    53: "Port tender",
    54: "Anti-pollution vessel",
    55: "Law enforcement",
    58: "Medical transport",
  };
  if (exact[code]) return exact[code]!;
  if (code >= 20 && code <= 29) return "Wing in ground craft";
  if (code >= 40 && code <= 49) return "High-speed craft";
  if (code >= 60 && code <= 69) return "Passenger ship";
  if (code >= 70 && code <= 79) return "Cargo ship";
  if (code >= 80 && code <= 89) return "Tanker";
  if (code >= 90 && code <= 99) return "Other vessel";
  return null;
}

const empty = (type: number, mmsi: string): AisReport => ({
  type,
  mmsi,
  kind: "vessel",
  aisClass: null,
  lat: null,
  lon: null,
  speed: null,
  course: null,
  heading: null,
  status: null,
  name: null,
  callsign: null,
  imo: null,
  shipType: null,
  lengthM: null,
  beamM: null,
  draughtM: null,
  destination: null,
  aidType: null,
});

function dimensions(bits: Bits, at: number): Pick<AisReport, "lengthM" | "beamM"> {
  const bow = bits.u(at, 9);
  const stern = bits.u(at + 9, 9);
  const port = bits.u(at + 18, 6);
  const starboard = bits.u(at + 24, 6);
  return { lengthM: bow + stern || null, beamM: port + starboard || null };
}

/** The message, or null for a type that is not read (safety text, binary messages) or one too short to be what it says. */
export function decodeAis(payload: string, fill: number): AisReport | { error: string } | null {
  const bits = new Bits(bitsOf(payload, fill));
  if (bits.length < 38) return { error: "too short" };
  const type = bits.u(0, 6);
  const mmsi = String(bits.u(8, 30)).padStart(9, "0");
  const report = empty(type, mmsi);
  switch (type) {
    case 1:
    case 2:
    case 3: {
      if (!bits.has(0, 137)) return { error: "too short" };
      const status = bits.u(38, 4);
      return {
        ...report,
        aisClass: "A",
        ...position(bits, 61, 89),
        speed: speedOf(bits.u(50, 10)),
        course: courseOf(bits.u(116, 12)),
        heading: headingOf(bits.u(128, 9)),
        status: STATUS[status] ?? null,
      };
    }
    case 4:
      if (!bits.has(0, 134)) return { error: "too short" };
      return { ...report, kind: "base", ...position(bits, 79, 107) };
    case 5: {
      if (!bits.has(0, 422)) return { error: "too short" };
      const imo = bits.u(40, 30);
      const draught = bits.u(294, 8);
      return {
        ...report,
        aisClass: "A",
        imo: imo || null,
        callsign: bits.text(70, 42),
        name: bits.text(112, 120),
        shipType: bits.u(232, 8) || null,
        ...dimensions(bits, 240),
        draughtM: draught ? draught / 10 : null,
        destination: bits.text(302, 120),
      };
    }
    case 18:
      if (!bits.has(0, 133)) return { error: "too short" };
      return {
        ...report,
        aisClass: "B",
        ...position(bits, 57, 85),
        speed: speedOf(bits.u(46, 10)),
        course: courseOf(bits.u(112, 12)),
        heading: headingOf(bits.u(124, 9)),
      };
    case 19:
      if (!bits.has(0, 301)) return { error: "too short" };
      return {
        ...report,
        aisClass: "B",
        ...position(bits, 57, 85),
        speed: speedOf(bits.u(46, 10)),
        course: courseOf(bits.u(112, 12)),
        heading: headingOf(bits.u(124, 9)),
        name: bits.text(143, 120),
        shipType: bits.u(263, 8) || null,
        ...dimensions(bits, 271),
      };
    case 21: {
      if (!bits.has(0, 219)) return { error: "too short" };
      const extension = bits.length > 272 ? (bits.text(272, Math.min(88, bits.length - 272)) ?? "") : "";
      const name = `${bits.text(43, 120) ?? ""}${extension}`.trim();
      return { ...report, kind: "aid", ...position(bits, 164, 192), name: name || null, aidType: bits.u(38, 5) };
    }
    case 24: {
      if (!bits.has(0, 40)) return { error: "too short" };
      const part = bits.u(38, 2);
      if (part === 0) return bits.has(0, 160) ? { ...report, aisClass: "B", name: bits.text(40, 120) } : { error: "too short" };
      if (part === 1) {
        if (!bits.has(0, 162)) return { error: "too short" };
        // An auxiliary craft (MMSI 98xxxxxxx) gives its mother ship's MMSI here instead of its size.
        const auxiliary = mmsi.startsWith("98");
        return {
          ...report,
          aisClass: "B",
          shipType: bits.u(40, 8) || null,
          callsign: bits.text(90, 42),
          ...(auxiliary ? {} : dimensions(bits, 132)),
        };
      }
      return { error: "part number" };
    }
    default:
      return null;
  }
}

/** Reads lines of NMEA and gives back each whole AIS message read. */
export class AisReader {
  private readonly assembler = new AisAssembler();
  malformed = 0;
  other = 0;

  read(line: string, now = Date.now()): AisReport | null {
    const fragment = parseSentence(line);
    if (fragment === null) return null;
    if ("error" in fragment) {
      this.malformed += 1;
      return null;
    }
    const whole = this.assembler.add(fragment, now);
    if (!whole) return null;
    const report = decodeAis(whole.payload, whole.fill);
    if (report === null) {
      this.other += 1;
      return null;
    }
    if ("error" in report) {
      this.malformed += 1;
      return null;
    }
    return report;
  }
}
