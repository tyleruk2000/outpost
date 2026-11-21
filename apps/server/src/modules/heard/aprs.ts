/**
 * APRS: reading the information field of a packet heard on the air. Written from the
 * APRS Protocol Reference, version 1.2 draft c (the APRS Working Group,
 * github.com/wb2osz/aprsspec, read 21 November 2026), which replaces 1.0.1 of 2000 with
 * its corrections: chapter 5 (data type identifiers), 6 (timestamps), 7 (data
 * extensions), 8 (plain positions), 9 (compressed positions), 10 (Mic-E), 11 (objects
 * and items) and 12 (weather). Checked against Dire Wolf 1.8.1's own decoding of the same
 * packets (test/heard-aprs.test.ts). Nothing here is copied from another program.
 *
 * Only what puts something on the map is read: positions, objects, items and weather.
 * A message, a status or telemetry is a packet heard but not a position. Anything that
 * does not read as its type says is an error, counted and dropped by the caller.
 *
 * Units out: degrees, knots, metres, Celsius, millimetres, hectopascals.
 */
import type { AprsWeather } from "@outpost/shared";

export interface AprsPosition {
  /** "position" for a station's own; "object" and "item" for something it reports (a net, a hazard, a marker). */
  kind: "position" | "object" | "item" | "weather";
  /** The station's callsign, or the object's or item's name. */
  name: string;
  /** The callsign that sent the packet. */
  sentBy: string;
  /** An object or item that its sender has taken off the map. */
  killed: boolean;
  lat: number | null;
  lon: number | null;
  /** The symbol's table ("/" or "\\", or an overlay character) and code. */
  symbol: string | null;
  course: number | null;
  speed: number | null;
  altitude: number | null;
  /** When the station says the report was made; null when it does not say, or says it in its own local time. */
  timestamp: number | null;
  comment: string | null;
  weather: AprsWeather | null;
}

export type AprsResult = AprsPosition | { kind: "other" } | { error: string };

const FEET = 0.3048;
const MPH_TO_KNOTS = 0.868976;
const HUNDREDTHS_INCH_TO_MM = 0.254;
const MAX_COMMENT = 200;

const printable = (text: string) =>
  // Control characters out; the rest as it came (APRS is ASCII, some radios send Latin-1).
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
  text.replace(/[\u0000-\u001f\u007f]/g, "").trim();

function cleanComment(text: string): string | null {
  const clean = printable(text).slice(0, MAX_COMMENT);
  return clean ? clean : null;
}

// ── Plain positions (chapter 8) ──

/** "4903.50N": degrees and minutes; a space for a digit the station blurs on purpose (position ambiguity). */
function plainLatitude(text: string): number | null {
  if (!/^[0-9 ]{4}\.[0-9 ]{2}[NS]$/.test(text)) return null;
  const digits = text.replace(/ /g, "0");
  const degrees = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 7));
  if (degrees > 90 || minutes >= 60 || (degrees === 90 && minutes > 0)) return null;
  const value = degrees + minutes / 60;
  return text.endsWith("S") ? -value : value;
}

function plainLongitude(text: string): number | null {
  if (!/^[0-9 ]{5}\.[0-9 ]{2}[EW]$/.test(text)) return null;
  const digits = text.replace(/ /g, "0");
  const degrees = Number(digits.slice(0, 3));
  const minutes = Number(digits.slice(3, 8));
  if (degrees > 180 || minutes >= 60 || (degrees === 180 && minutes > 0)) return null;
  const value = degrees + minutes / 60;
  return text.endsWith("W") ? -value : value;
}

// ── Compressed positions (chapter 9) ──

const base91 = (text: string) => {
  let value = 0;
  for (const char of text) {
    const digit = char.charCodeAt(0) - 33;
    if (digit < 0 || digit > 90) return null;
    value = value * 91 + digit;
  }
  return value;
};

const COMPRESSED_TABLE = /^[/\\A-Za-j]$/;

interface Located {
  lat: number;
  lon: number;
  symbol: string;
  course: number | null;
  speed: number | null;
  altitude: number | null;
  rest: string;
}

function compressed(text: string): Located | null {
  if (text.length < 13) return null;
  const table = text[0]!;
  if (!COMPRESSED_TABLE.test(table)) return null;
  const y = base91(text.slice(1, 5));
  const x = base91(text.slice(5, 9));
  if (y === null || x === null) return null;
  const lat = 90 - y / 380926;
  const lon = -180 + x / 190463;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  // An overlay given as a-j stands for the digits 0-9 (9.1, "Symbol table identifier").
  const tableChar = table >= "a" && table <= "j" ? String.fromCharCode(table.charCodeAt(0) - 49) : table;
  const code = text[9]!;
  const c = text.charCodeAt(10) - 33;
  const s = text.charCodeAt(11) - 33;
  const type = text.charCodeAt(12) - 33;
  let course: number | null = null;
  let speed: number | null = null;
  let altitude: number | null = null;
  if (text[10] !== " " && c >= 0 && s >= 0 && s <= 90 && type >= 0) {
    if (((type >> 3) & 3) === 2) {
      // The fix came from a GGA sentence: cs is the altitude, 1.002 to the power cs, in feet.
      altitude = 1.002 ** (c * 91 + s) * FEET;
    } else if (c <= 89) {
      course = c * 4;
      speed = 1.08 ** s - 1;
    }
    // "{" is a radio range, not a position's.
  }
  return { lat, lon, symbol: `${tableChar}${code}`, course, speed, altitude, rest: text.slice(13) };
}

function plain(text: string): Located | null {
  if (text.length < 19) return null;
  const lat = plainLatitude(text.slice(0, 8));
  const lon = plainLongitude(text.slice(9, 18));
  if (lat === null || lon === null) return null;
  return { lat, lon, symbol: `${text[8]}${text[18]}`, course: null, speed: null, altitude: null, rest: text.slice(19) };
}

/** A position in either form: plain begins with a digit (or a blurred one), compressed with its symbol table. */
const positionAt = (text: string): Located | null => (/^[0-9 ]/.test(text) ? plain(text) : compressed(text));

// ── Timestamps (chapter 6) ──

function timestamp(text: string, now: number): { at: number | null; ok: boolean } {
  const match = /^(\d{2})(\d{2})(\d{2})([zh/])$/.exec(text);
  if (!match) return { at: null, ok: false };
  const [a, b, c] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const when = new Date(now);
  if (match[4] === "h") {
    if (a > 23 || b > 59 || c > 59) return { at: null, ok: false };
    let at = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), a, b, c);
    if (at > now + 3_600_000) at -= 86_400_000;
    return { at, ok: true };
  }
  if (a < 1 || a > 31 || b > 23 || c > 59) return { at: null, ok: false };
  // Local time at the station: its offset is not known, so the time it was heard stands instead.
  if (match[4] === "/") return { at: null, ok: true };
  // Day of the month, in the current month, or the one before if that would be in the future.
  let at = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), a, b, c);
  if (at > now + 86_400_000) at = Date.UTC(when.getUTCFullYear(), when.getUTCMonth() - 1, a, b, c);
  return { at, ok: true };
}

// ── Data extensions and the comment (chapter 7) ──

function extension(rest: string): { course: number | null; speed: number | null; rest: string } {
  const match = /^([0-9. ]{3})\/([0-9. ]{3})/.exec(rest);
  if (!match) {
    // Power, height and gain; a pre-calculated range; a direction-finding report: not shown, taken off the comment.
    return { course: null, speed: null, rest: rest.replace(/^(PHG\d{4}|RNG\d{4}|DFS\d{4})/, "") };
  }
  const course = /^\d{3}$/.test(match[1]!) ? Number(match[1]) : null;
  const speed = /^\d{3}$/.test(match[2]!) ? Number(match[2]) : null;
  return {
    // A course of 000 means "not known"; 360 is north. On a weather station they are the wind.
    course: course === null || course === 0 || course > 360 ? null : course % 360,
    // In a weather report it is the wind, and in knots too (APRS 1.2 draft c, chapter 7, "Wind Direction and Wind Speed").
    speed,
    rest: rest.slice(7),
  };
}

function altitudeIn(comment: string): { altitude: number | null; comment: string } {
  const match = /\/A=(-?\d{5,6})/.exec(comment);
  if (!match) return { altitude: null, comment };
  return { altitude: Number(match[1]) * FEET, comment: comment.replace(match[0], "") };
}

// ── Weather (chapter 12) ──

const EMPTY_WEATHER: AprsWeather = {
  windDirection: null,
  windSpeed: null,
  windGust: null,
  temperatureC: null,
  rain1hMm: null,
  rain24hMm: null,
  rainMidnightMm: null,
  humidity: null,
  pressureHpa: null,
};

const FIELD_WIDTH: Record<string, number> = { c: 3, s: 3, g: 3, t: 3, r: 3, p: 3, P: 3, h: 2, b: 5, L: 3, l: 3, "#": 3 };

/** The weather fields from where they start; what follows them (the station's software, a comment) is given back. */
export function weatherFields(text: string, start: Partial<AprsWeather> = {}): { weather: AprsWeather; rest: string; count: number } {
  const weather: AprsWeather = { ...EMPTY_WEATHER, ...start };
  let at = 0;
  let count = 0;
  while (at < text.length) {
    const key = text[at]!;
    const width = FIELD_WIDTH[key];
    if (!width) break;
    const raw = text.slice(at + 1, at + 1 + width);
    // A temperature may be negative: "t-05".
    if (raw.length < width || !/^(-?\d+|[. ]+)$/.test(raw)) break;
    at += 1 + width;
    count += 1;
    const value = /^-?\d+$/.test(raw) ? Number(raw) : null;
    if (value === null) continue;
    switch (key) {
      case "c":
        weather.windDirection = value === 0 ? null : value % 360;
        break;
      case "s":
        weather.windSpeed = value * MPH_TO_KNOTS;
        break;
      case "g":
        weather.windGust = value * MPH_TO_KNOTS;
        break;
      case "t":
        weather.temperatureC = value < -100 || value > 200 ? null : ((value - 32) * 5) / 9;
        break;
      case "r":
        weather.rain1hMm = value * HUNDREDTHS_INCH_TO_MM;
        break;
      case "p":
        weather.rain24hMm = value * HUNDREDTHS_INCH_TO_MM;
        break;
      case "P":
        weather.rainMidnightMm = value * HUNDREDTHS_INCH_TO_MM;
        break;
      case "h":
        // "h00" is 100 per cent.
        weather.humidity = value === 0 ? 100 : value;
        break;
      case "b":
        weather.pressureHpa = value / 10;
        break;
    }
  }
  return { weather, rest: text.slice(at), count };
}

// ── Mic-E (chapter 10) ──

const MIC_E_DEST = /^[0-9A-LP-Z]{6}$/;

function micEDigit(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x4a) return code - 0x41;
  if (code >= 0x50 && code <= 0x59) return code - 0x50;
  // K, L and Z stand for a blurred digit (position ambiguity).
  return 0;
}

/** Characters 4 to 6 of the destination: P to Z mean north, +100 degrees of longitude, and west. */
const micEHigh = (char: string) => char >= "P" && char <= "Z";

function micE(destination: string, info: string): Located | null {
  const dest = destination.split("-")[0]!;
  if (!MIC_E_DEST.test(dest) || info.length < 9) return null;
  const digits = [...dest].map(micEDigit);
  const latDegrees = digits[0]! * 10 + digits[1]!;
  const latMinutes = digits[2]! * 10 + digits[3]! + (digits[4]! * 10 + digits[5]!) / 100;
  if (latDegrees > 90 || latMinutes >= 60) return null;
  const lat = (latDegrees + latMinutes / 60) * (micEHigh(dest[3]!) ? 1 : -1);

  const bytes = [...info.slice(1, 9)].map((char) => char.charCodeAt(0) - 28);
  let lonDegrees = bytes[0]!;
  if (micEHigh(dest[4]!)) lonDegrees += 100;
  if (lonDegrees >= 180 && lonDegrees <= 189) lonDegrees -= 80;
  else if (lonDegrees >= 190 && lonDegrees <= 199) lonDegrees -= 190;
  let lonMinutes = bytes[1]!;
  if (lonMinutes >= 60) lonMinutes -= 60;
  const hundredths = bytes[2]!;
  if (lonDegrees < 0 || lonDegrees > 180 || lonMinutes < 0 || lonMinutes > 59 || hundredths < 0 || hundredths > 99) return null;
  const lon = (lonDegrees + (lonMinutes + hundredths / 100) / 60) * (micEHigh(dest[5]!) ? -1 : 1);

  const sp = bytes[3]!;
  const dc = bytes[4]!;
  const se = bytes[5]!;
  if (sp < 0 || dc < 0 || se < 0) return null;
  let speed = sp * 10 + Math.floor(dc / 10);
  if (speed >= 800) speed -= 800;
  let course = (dc % 10) * 100 + se;
  if (course >= 400) course -= 400;

  const symbol = `${info[8]}${info[7]}`;
  let rest = info.slice(9);
  // A Kenwood or Yaesu radio marks its type with the first character; not part of what the person wrote.
  if (/^[>\]`']/.test(rest)) rest = rest.slice(1);
  let altitude: number | null = null;
  const alt = /^(.{3})\}/.exec(rest);
  if (alt) {
    const value = base91(alt[1]!);
    if (value !== null) {
      altitude = value - 10000;
      rest = rest.slice(4);
    }
  }
  return {
    lat,
    lon,
    symbol,
    course: course === 0 || course > 360 ? null : course % 360,
    speed,
    altitude,
    rest,
  };
}

// ── The packet ──

const positionResult = (base: Pick<AprsPosition, "kind" | "name" | "sentBy" | "killed" | "timestamp">, located: Located): AprsPosition => {
  const weatherSymbol = located.symbol[1] === "_";
  let { course, speed, rest } = { course: located.course, speed: located.speed, rest: located.rest };
  if (located.course === null && located.speed === null) {
    const ext = extension(rest);
    course = ext.course;
    speed = ext.speed;
    rest = ext.rest;
  }
  let weather: AprsWeather | null = null;
  if (weatherSymbol) {
    const fields = weatherFields(rest, { windDirection: course, windSpeed: speed });
    weather = fields.weather;
    rest = fields.rest;
    course = null;
    speed = null;
  }
  const { altitude, comment } = altitudeIn(rest);
  return {
    ...base,
    kind: weatherSymbol && base.kind === "position" ? "weather" : base.kind,
    lat: located.lat,
    lon: located.lon,
    symbol: located.symbol,
    course,
    speed,
    altitude: located.altitude ?? altitude,
    comment: cleanComment(comment),
    weather,
  };
};

export function decodeAprs(packet: { source: string; destination: string; info: Buffer }, now = Date.now()): AprsResult {
  const info = packet.info.toString("latin1");
  const type = info[0];
  const sentBy = packet.source;
  const own = { kind: "position" as const, name: sentBy, sentBy, killed: false, timestamp: null };
  switch (type) {
    case "!":
    case "=": {
      // Raw weather from a station with no position ("!" followed by a weather station's own format) is not read.
      const located = positionAt(info.slice(1));
      return located ? positionResult(own, located) : { error: "position does not read" };
    }
    case "/":
    case "@": {
      const time = timestamp(info.slice(1, 8), now);
      if (!time.ok) return { error: "timestamp does not read" };
      const located = positionAt(info.slice(8));
      return located ? positionResult({ ...own, timestamp: time.at }, located) : { error: "position does not read" };
    }
    case ";": {
      if (info.length < 18) return { error: "object too short" };
      const name = printable(info.slice(1, 10));
      const live = info[10];
      if (!name || (live !== "*" && live !== "_")) return { error: "object name does not read" };
      const time = timestamp(info.slice(11, 18), now);
      if (!time.ok) return { error: "timestamp does not read" };
      const located = positionAt(info.slice(18));
      if (!located) return { error: "position does not read" };
      return positionResult({ kind: "object", name, sentBy, killed: live === "_", timestamp: time.at }, located);
    }
    case ")": {
      const match = /^\)([\x20-\x7e]{3,9}?)([!_])/.exec(info);
      if (!match) return { error: "item name does not read" };
      const name = printable(match[1]!);
      const located = positionAt(info.slice(match[0].length));
      if (!name || !located) return { error: "position does not read" };
      return positionResult({ kind: "item", name, sentBy, killed: match[2] === "_", timestamp: null }, located);
    }
    case "`":
    case "'":
    case "\u001c":
    case "\u001d": {
      const located = micE(packet.destination, info);
      return located ? positionResult(own, located) : { error: "Mic-E does not read" };
    }
    case "_": {
      // Weather with no position: "_" and a month, day, hour and minute, then the fields.
      if (!/^_\d{8}/.test(info)) return { error: "weather report does not read" };
      const fields = weatherFields(info.slice(9));
      if (fields.count === 0) return { error: "weather report has no fields" };
      return {
        kind: "weather",
        name: sentBy,
        sentBy,
        killed: false,
        lat: null,
        lon: null,
        symbol: null,
        course: null,
        speed: null,
        altitude: null,
        timestamp: null,
        comment: cleanComment(fields.rest),
        weather: fields.weather,
      };
    }
    default:
      return { kind: "other" };
  }
}

/** What an APRS symbol shows, in words, for the symbols people most often use (APRS 1.0.1, Appendix 2). */
const SYMBOL_WORDS: Record<string, string> = {
  "-": "House",
  ">": "Car",
  "[": "Person",
  b: "Bicycle",
  k: "Pickup truck",
  u: "Lorry",
  v: "Van",
  j: "Jeep",
  R: "Motorhome",
  Y: "Sailing boat",
  s: "Boat",
  O: "Balloon",
  "'": "Small aircraft",
  "^": "Large aircraft",
  X: "Helicopter",
  _: "Weather station",
  "#": "Digipeater",
  a: "Ambulance",
  f: "Fire engine",
  U: "Bus",
  "<": "Motorcycle",
};

export function symbolWords(symbol: string | null): string | null {
  if (symbol?.length !== 2) return null;
  // The primary table ("/"); on the alternate table and overlays only the digipeater and weather station are the same.
  if (symbol[0] === "/" || symbol[1] === "#" || symbol[1] === "_") return SYMBOL_WORDS[symbol[1]!] ?? null;
  return null;
}
