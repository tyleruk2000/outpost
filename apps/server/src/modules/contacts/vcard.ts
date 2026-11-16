/**
 * Reading and writing vCard files: the format every phone exports its contacts in.
 *
 * Three versions are in use and all three are read:
 *
 *  - 2.1 (older Android phones, Outlook): values may be quoted-printable with a
 *    character set of their own, parameters may be bare words (`TEL;CELL;VOICE:`), a
 *    line is folded only where it has a space, and only the semicolon is escaped.
 *  - 3.0 (RFC 2426; what an iPhone and Google Contacts export): UTF-8, a line folded
 *    anywhere with a line break and one space, `\n` `\,` `\;` `\\` escaped.
 *  - 4.0 (RFC 6350): as 3.0, with a few values written differently.
 *
 * The reader works on the file's bytes, because in a 2.1 file two lines can be in two
 * different character sets. It gives back each card as a list of properties whose
 * values are text in the 3.0 form, whatever the card was written in, so nothing after
 * this file has to know which version a card came from.
 *
 * Everything is text and is treated as text: nothing in a card is run, fetched or
 * followed. Pictures, sounds and keys embedded in a card are left out and counted; a
 * photo is most of the size of a phone's export and Outpost has nowhere to show one.
 * The limits at the top stop a file that no address book would write.
 *
 * No library is used. `vcf` and `vcard4` (MIT) read 3.0 and 4.0 only, and the 2.1
 * rules (quoted-printable, a character set for each line) are where the work is.
 */
import { isUtf8 } from "node:buffer";
import { TextDecoder } from "node:util";

export const VCARD_LIMITS = {
  /** Cards in one file. */
  cards: 20_000,
  /** Properties kept from one card. */
  properties: 500,
  /** Characters in one property once unfolded, other than an embedded file. */
  line: 100_000,
  /** Characters kept from one card in all. */
  card: 400_000,
} as const;

export type VcardVersion = "2.1" | "3.0" | "4.0";

export interface VcardParam {
  /** Upper case. */
  name: string;
  values: string[];
}

export interface VcardProperty {
  /** The group it was written in (`item1` of `item1.TEL`), or "". */
  group: string;
  /** Upper case, for telling properties apart. */
  name: string;
  /** The name as the card wrote it (`X-ABLabel`), which is how it is written back. */
  written: string;
  params: VcardParam[];
  /** The value as a 3.0 card writes it: still escaped, so that its parts can be told apart. */
  value: string;
}

export interface ParsedCard {
  /** Which card of the file this is, from 1, counting the ones that could not be read. */
  position: number;
  version: VcardVersion;
  properties: VcardProperty[];
  /** Embedded pictures, sounds and keys that were left out. */
  binaryLeftOut: number;
}

export interface ParsedVcards {
  cards: ParsedCard[];
  unreadable: Array<{ position: number; reason: string }>;
  versions: VcardVersion[];
  binaryLeftOut: number;
}

/** Thrown when the file as a whole cannot be taken. The message is for a person. */
export class VcardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VcardError";
  }
}

const BINARY_PROPERTIES = new Set(["PHOTO", "LOGO", "SOUND", "KEY"]);
const ENCODINGS = new Set(["QUOTED-PRINTABLE", "BASE64", "B", "8BIT", "7BIT"]);
const NAME = /^[A-Za-z0-9-]+$/;

// ── Bytes to lines ──────────────────────────────────────────────────────────

/** A file saved as UTF-16 (some Windows programs do) becomes UTF-8; a UTF-8 byte-order mark is dropped. */
function toSingleByteFriendly(input: Buffer): Buffer {
  if (input.length >= 2 && input[0] === 0xff && input[1] === 0xfe) return Buffer.from(new TextDecoder("utf-16le").decode(input.subarray(2)));
  if (input.length >= 2 && input[0] === 0xfe && input[1] === 0xff) return Buffer.from(new TextDecoder("utf-16be").decode(input.subarray(2)));
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) return input.subarray(3);
  return input;
}

function decoderFor(label: string | undefined, fallback: TextDecoder): TextDecoder {
  if (!label) return fallback;
  try {
    return new TextDecoder(label.trim().toLowerCase());
  } catch {
    // A character set this computer does not know: read it as the rest of the file is read.
    return fallback;
  }
}

const HEX_PAIR = /^[0-9A-Fa-f]{2}$/;

function hasColon(buffer: Buffer, from: number, to: number): boolean {
  for (let i = from; i < to; i += 1) if (buffer[i] === 0x3a) return true;
  return false;
}

function decodeQuotedPrintable(text: string): Buffer {
  const out = Buffer.allocUnsafe(text.length);
  let length = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x3d && i + 2 < text.length && HEX_PAIR.test(text.slice(i + 1, i + 3))) {
      out[length] = Number.parseInt(text.slice(i + 1, i + 3), 16);
      i += 2;
    } else {
      out[length] = code & 0xff;
    }
    length += 1;
  }
  return out.subarray(0, length);
}

// ── One line to one property ────────────────────────────────────────────────

/** Splits on a character wherever it is not inside double quotes. */
function splitOutsideQuotes(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Where the value starts: the first colon that is not inside a quoted parameter. */
function valueStart(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === ":" && !quoted) return i;
  }
  return -1;
}

/** A parameter value without its quotes, with the escapes of RFC 6868 (`^n`, `^^`, `^'`) read. */
function paramValue(raw: string): string {
  const bare = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  return bare.replace(/\^([n^'])/g, (_match, char: string) => (char === "n" ? "\n" : char === "^" ? "^" : '"'));
}

function parseHead(head: string): { group: string; name: string; written: string; params: VcardParam[] } | null {
  const parts = splitOutsideQuotes(head, ";");
  let name = parts[0]!.trim();
  let group = "";
  const dot = name.lastIndexOf(".");
  if (dot >= 0) {
    group = name.slice(0, dot);
    name = name.slice(dot + 1);
  }
  if (!NAME.test(name) || (group && !NAME.test(group))) return null;
  const params: VcardParam[] = [];
  for (const part of parts.slice(1)) {
    const text = part.trim();
    if (!text) continue;
    const equals = text.indexOf("=");
    if (equals < 0) {
      // 2.1 writes a parameter as a bare word: `TEL;CELL;VOICE`, `NOTE;QUOTED-PRINTABLE`.
      const word = text.toUpperCase();
      params.push(ENCODINGS.has(word) ? { name: "ENCODING", values: [word] } : { name: "TYPE", values: [text] });
      continue;
    }
    const paramName = text.slice(0, equals).trim().toUpperCase();
    if (!NAME.test(paramName)) continue;
    params.push({ name: paramName, values: splitOutsideQuotes(text.slice(equals + 1), ",").map(paramValue) });
  }
  return { group, name: name.toUpperCase(), written: name, params };
}

const param = (property: Pick<VcardProperty, "params">, name: string): string | undefined =>
  property.params.find((entry) => entry.name === name)?.values[0];

/**
 * A 2.1 value as 3.0 writes it. 2.1 escapes only the semicolon, and line breaks arrive
 * as real line breaks out of quoted-printable; 3.0 escapes both, the comma and the
 * backslash. Lists that 2.1 files separate with commas all the same keep their commas.
 */
function escapeLikeThree(value: string, name: string): string {
  const keepsCommas = name === "CATEGORIES" || name === "NICKNAME";
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === "\\") {
      if (value[i + 1] === ";") {
        out += "\\;";
        i += 1;
      } else out += "\\\\";
    } else if (char === "\n") out += "\\n";
    else if (char === "," && !keepsCommas) out += "\\,";
    else out += char;
  }
  return out;
}

// ── The reader ──────────────────────────────────────────────────────────────

interface OpenCard {
  position: number;
  version: VcardVersion;
  lines: string[];
  chars: number;
  binaryLeftOut: number;
  tooBig: boolean;
  /** Cards opened inside this one (2.1 allowed an AGENT card). What is in them is not read. */
  nested: number;
}

const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Reads every card in a file. Cards that cannot be read are listed with the reason and
 * the rest are still returned; only a file that is not vCard at all, or holds more
 * cards than the limit, is refused whole.
 */
export async function parseVcards(input: Buffer): Promise<ParsedVcards> {
  const buffer = toSingleByteFriendly(input);
  // A 3.0 or 4.0 file is UTF-8. A 2.1 file that is not says so line by line, or is in
  // the Western European set most old phones and Outlook wrote.
  const fileDecoder = new TextDecoder(isUtf8(buffer) ? "utf-8" : "windows-1252");
  const result: ParsedVcards = { cards: [], unreadable: [], versions: [], binaryLeftOut: 0 };
  const versions = new Set<VcardVersion>();
  let position = 0;
  let card: OpenCard | null = null;
  /** The property being put together from folded lines; null between properties. */
  let current: string | null = null;
  /** The current property is an embedded file: its lines are passed over, not kept. */
  let skipping = false;
  let softBreak = false;

  const finishProperty = () => {
    if (card && current !== null && !skipping) {
      if (current.length > VCARD_LIMITS.line || card.chars + current.length > VCARD_LIMITS.card || card.lines.length >= VCARD_LIMITS.properties) {
        card.tooBig = true;
      } else if (current.trim()) {
        card.lines.push(current);
        card.chars += current.length;
        const version = /^VERSION:\s*(2\.1|3\.0|4\.0)\s*$/i.exec(current);
        if (version) card.version = version[1] as VcardVersion;
      }
    }
    current = null;
    skipping = false;
    softBreak = false;
  };

  const closeCard = () => {
    if (!card) return;
    const done = card;
    card = null;
    if (done.tooBig) {
      result.unreadable.push({ position: done.position, reason: "It is larger than a contact is, so it was not read." });
      return;
    }
    const properties: VcardProperty[] = [];
    for (const line of done.lines) {
      const colon = valueStart(line);
      if (colon < 0) continue;
      const head = parseHead(line.slice(0, colon));
      if (!head) continue;
      let value = line.slice(colon + 1);
      const property: VcardProperty = { ...head, value: "" };
      const encoding = param(property, "ENCODING")?.toUpperCase();
      const decoder = decoderFor(param(property, "CHARSET"), fileDecoder);
      // Lines were read one byte to a character; here the bytes become text.
      const bytes = encoding === "QUOTED-PRINTABLE" ? decodeQuotedPrintable(value) : Buffer.from(value, "latin1");
      value = decoder.decode(bytes).replace(/\r\n?/g, "\n");
      property.params = property.params.filter(
        (entry) => entry.name !== "CHARSET" && !(entry.name === "ENCODING" && entry.values[0]?.toUpperCase() !== "B"),
      );
      property.value = done.version === "2.1" ? escapeLikeThree(value, property.name) : value.replace(/\n/g, "\\n");
      properties.push(property);
    }
    if (properties.every((property) => property.name === "VERSION")) {
      result.unreadable.push({ position: done.position, reason: "It is empty." });
      return;
    }
    versions.add(done.version);
    result.binaryLeftOut += done.binaryLeftOut;
    result.cards.push({ position: done.position, version: done.version, properties, binaryLeftOut: done.binaryLeftOut });
  };

  let at = 0;
  let sinceLastPause = 0;
  while (at <= buffer.length) {
    // One physical line: up to a line feed or a carriage return, whichever comes first.
    let end = at;
    while (end < buffer.length && buffer[end] !== 0x0a && buffer[end] !== 0x0d) end += 1;
    const next = end < buffer.length && buffer[end] === 0x0d && buffer[end + 1] === 0x0a ? end + 2 : end + 1;
    const first = at < end ? buffer[at]! : -1;
    const continues = first === 0x20 || first === 0x09;

    if (!card) {
      if (end - at >= 11 && end - at < 40 && /^BEGIN:\s*VCARD\s*$/i.test(buffer.toString("latin1", at, end))) {
        position += 1;
        if (position > VCARD_LIMITS.cards) {
          throw new VcardError(
            `That file holds more than ${VCARD_LIMITS.cards.toLocaleString("en-GB")} contacts, which is more than Outpost reads from one file.`,
          );
        }
        card = { position, version: "3.0", lines: [], chars: 0, binaryLeftOut: 0, tooBig: false, nested: 0 };
        sinceLastPause += 1;
        if (sinceLastPause >= 200) {
          sinceLastPause = 0;
          // Other requests are answered while a large file is read.
          await pause();
        }
      }
    } else if (skipping && (continues || (end > at && !hasColon(buffer, at, end)))) {
      // More of an embedded file: folded, or (in 2.1) bare lines of base64 that hold no colon.
    } else if (softBreak && current !== null) {
      // The line before ended in "=": quoted-printable carries on here, whatever this line starts with.
      const line: string = buffer.toString("latin1", at, end);
      softBreak = line.endsWith("=");
      current += softBreak ? line.slice(0, -1) : line;
    } else if (continues && current !== null) {
      // A folded line. 3.0 and 4.0 add a space that is not part of the value; 2.1 folds at a space that is.
      current += buffer.toString("latin1", card.version === "2.1" ? at : at + 1, end);
    } else if (continues && skipping) {
      // Still inside the embedded file.
    } else {
      finishProperty();
      if (end > at) {
        const line: string = buffer.toString("latin1", at, Math.min(end, at + VCARD_LIMITS.line + 1));
        const colon = valueStart(line);
        const head = colon >= 0 ? line.slice(0, colon).toUpperCase() : "";
        const name = head.split(";")[0]!.split(".").pop()!;
        if (/^BEGIN$/.test(name) && /VCARD/i.test(line.slice(colon + 1))) {
          card.nested += 1;
        } else if (/^END$/.test(name) && /VCARD/i.test(line.slice(colon + 1))) {
          if (card.nested > 0) card.nested -= 1;
          else closeCard();
        } else if (card.nested > 0) {
          // Inside a card within the card.
        } else if (BINARY_PROPERTIES.has(name) && (/ENCODING=B|BASE64/.test(head) || /^\s*data:/i.test(line.slice(colon + 1)) || end - at > 2000)) {
          card.binaryLeftOut += 1;
          skipping = true;
        } else {
          const quotedPrintable = /;(ENCODING=)?QUOTED-PRINTABLE/.test(head);
          softBreak = quotedPrintable && line.endsWith("=");
          current = softBreak ? line.slice(0, -1) : line;
          if (end - at > VCARD_LIMITS.line) card.tooBig = true;
        }
      }
    }
    at = next;
  }
  finishProperty();
  if (card) result.unreadable.push({ position: (card as OpenCard).position, reason: "The file ends part of the way through it." });
  if (position === 0) throw new VcardError("That file holds no contacts. A vCard file has a line that reads BEGIN:VCARD for each one.");
  result.versions = [...versions].sort();
  return result;
}

// ── Values ──────────────────────────────────────────────────────────────────

/** Splits an escaped value at a separator that is not escaped. The parts are still escaped. */
export function splitValue(value: string, separator: ";" | ","): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "\\") i += 1;
    else if (value[i] === separator) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

/** The text an escaped value stands for. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\s\S])/g, (_match, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

export function escapeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// ── Writing ─────────────────────────────────────────────────────────────────

function writeParam(entry: VcardParam): string {
  const values = entry.values.map((value) => {
    const safe = value.replace(/\^/g, "^^").replace(/\n/g, "^n").replace(/"/g, "^'");
    return /[;:,]/.test(safe) ? `"${safe}"` : safe;
  });
  return `${entry.name}=${values.join(",")}`;
}

/** One property as one unfolded line. Line breaks cannot appear in it: a value's own are escaped already. */
export function propertyLine(property: VcardProperty): string {
  const head = [property.group ? `${property.group}.${property.written}` : property.written, ...property.params.map(writeParam)].join(";");
  return `${head}:${property.value}`.replace(/[\r\n]+/g, " ");
}

/** Reads back a line written by `propertyLine`. Null when it is not one. */
export function parsePropertyLine(line: string): VcardProperty | null {
  const colon = valueStart(line);
  if (colon < 0) return null;
  const head = parseHead(line.slice(0, colon));
  return head ? { ...head, value: line.slice(colon + 1) } : null;
}

/** Folds a line at 75 bytes, never inside a character, as 3.0 and 4.0 ask. */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line;
  const pieces: string[] = [];
  let piece = "";
  let bytes = 0;
  // The first line may hold 75 bytes; each one after starts with a space, which counts.
  let room = 75;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > room) {
      pieces.push(piece);
      piece = "";
      bytes = 0;
      room = 74;
    }
    piece += char;
    bytes += size;
  }
  pieces.push(piece);
  return pieces.join("\r\n ");
}

/** A whole card from its lines (without BEGIN, VERSION and END), folded, with the line endings the format asks for. */
export function writeCard(version: "3.0" | "4.0", lines: string[]): string {
  return `${["BEGIN:VCARD", `VERSION:${version}`, ...lines, "END:VCARD"].map(foldLine).join("\r\n")}\r\n`;
}
