/**
 * Reads the ADI form of ADIF, the file logging programs export contacts in.
 *
 * Written from the ADIF specification, version 3.1.8 ("Released ADIF Version 3.1.8,
 * updated 2026-10-12", adif.org/318/ADIF_318.htm, read on 16 November 2026), section
 * IV.A "ADI File Format" and the QSO field definitions. What it takes from the
 * specification:
 *
 * - A data-specifier is `<F:L:T>D`: a case-independent field name, a length in decimal
 *   digits, an optional type indicator, then L characters of data. Characters outside
 *   data-specifiers are ignored.
 * - A file whose first character is not `<` has a header, which ends at `<EOH>`. A
 *   record ends at `<EOR>`. Both tags are case-insensitive.
 * - Date is 8 digits, YYYYMMDD, UTC. Time is 6 digits HHMMSS or 4 digits HHMM, UTC.
 * - Location is 11 characters, `XDDD MM.MMM`, X one of N, S, E, W.
 * - GridSquare is a 2, 4, 6 or 8 character Maidenhead locator; characters 9 and 10 of
 *   a longer one are in the `_EXT` field.
 *
 * The specification says ADI data is ASCII. Real files hold other characters, and
 * programs disagree on whether L then counts characters or bytes. This reader counts
 * bytes, which is the same thing for ASCII, and reads a value's bytes as UTF-8 when
 * they are valid UTF-8 and as Latin-1 otherwise.
 *
 * It only reads. Which records are kept, and what is made of each, is observations.ts.
 */

export interface AdifRecord {
  /** Field name in upper case to its data, trimmed. A field given twice keeps the first. */
  fields: Map<string, string>;
}

export interface AdifFile {
  /** Header fields, by upper-case name. Empty when the file has no header. */
  header: Map<string, string>;
  records: AdifRecord[];
  /** Records the file ended in the middle of, or data-specifiers that ran past its end. */
  truncated: number;
}

/** More than this many records in one file is refused: a lifetime's log is tens of thousands. */
export const MAX_ADIF_RECORDS = 200_000;

const utf8 = new TextDecoder("utf-8", { fatal: true });

function decode(bytes: Buffer): string {
  try {
    return utf8.decode(bytes);
  } catch {
    return bytes.toString("latin1");
  }
}

/** Whether the bytes look like an ADI file at all: an end-of-header or end-of-record tag somewhere in them. */
export const looksLikeAdif = (bytes: Buffer): boolean => /<eo[hr]>/i.test(bytes.toString("latin1"));

export function parseAdif(bytes: Buffer): AdifFile {
  // One byte to a character, so that a position in the text is a position in the bytes.
  const text = bytes.toString("latin1");
  const header = new Map<string, string>();
  const records: AdifRecord[] = [];
  let truncated = 0;
  let at = 0;
  let inHeader = text.length > 0 && text[0] !== "<";
  // A file with a header and no <EOH> has no records that can be told from the header.
  if (inHeader && !/<eoh>/i.test(text)) return { header, records, truncated: 0 };
  let current = new Map<string, string>();

  while (at < text.length) {
    const first = text.indexOf("<", at);
    if (first < 0) break;
    const close = text.indexOf(">", first + 1);
    if (close < 0) break;
    // Loose text may hold a "<" of its own; the tag is what follows the last one before the ">".
    const open = text.lastIndexOf("<", close);
    const tag = text.slice(open + 1, close);
    at = close + 1;
    const upper = tag.toUpperCase();
    if (upper === "EOH") {
      inHeader = false;
      current = new Map();
      continue;
    }
    if (upper === "EOR") {
      if (!inHeader && current.size > 0) {
        records.push({ fields: current });
        if (records.length > MAX_ADIF_RECORDS) throw new Error("too-many-records");
      }
      current = new Map();
      continue;
    }
    const match = /^([^:<>]+):(\d+)(?::[^:<>]*)?$/.exec(tag);
    // Not a data-specifier: text that happens to hold an angle bracket. Ignored, as the specification says.
    if (!match) continue;
    const name = match[1]!.trim().toUpperCase();
    const length = Number(match[2]);
    if (at + length > text.length) {
      // The data runs past the end of the file: the record it belongs to is not whole.
      current.set(name, "");
      break;
    }
    const value = decode(bytes.subarray(at, at + length)).trim();
    at += length;
    const target = inHeader ? header : current;
    if (!target.has(name)) target.set(name, value);
  }
  // Fields after the last <EOR> are a record the file stopped in the middle of.
  if (!inHeader && current.size > 0) truncated += 1;
  return { header, records, truncated };
}

/** A date and time of the specification as milliseconds UTC, or null when either is not what the specification allows. */
export function adifInstant(date: string, time: string): number | null {
  if (!/^\d{8}$/.test(date) || !/^(\d{4}|\d{6})$/.test(time)) return null;
  const [year, month, day] = [Number(date.slice(0, 4)), Number(date.slice(4, 6)), Number(date.slice(6, 8))];
  const [hour, minute, second] = [Number(time.slice(0, 2)), Number(time.slice(2, 4)), Number(time.slice(4, 6) || "0")];
  if (hour > 23 || minute > 59 || second > 59) return null;
  const at = Date.UTC(year, month - 1, day, hour, minute, second);
  const back = new Date(at);
  // A date that does not exist (the 31st of June) must not roll over into one that does.
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return year >= 1900 && year <= 2200 ? at : null;
}

/** A latitude or longitude in the specification's `XDDD MM.MMM` form, in degrees; null when it is not in that form. */
export function adifLocation(value: string, axis: "lat" | "lon"): number | null {
  const match = /^([NSEW])(\d{3}) (\d{2}\.\d{3})$/i.exec(value.trim());
  if (!match) return null;
  const letter = match[1]!.toUpperCase();
  if (axis === "lat" ? !"NS".includes(letter) : !"EW".includes(letter)) return null;
  const minutes = Number(match[3]);
  const degrees = Number(match[2]) + minutes / 60;
  if (minutes >= 60 || degrees > (axis === "lat" ? 90 : 180)) return null;
  return letter === "S" || letter === "W" ? -degrees : degrees;
}
