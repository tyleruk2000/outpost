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
 * - "A Header begins with any character other than < and terminates with a
 *   case-insensitive End-Of-Header tag", and "If the first character in an ADI file is
 *   <, it contains no Header" (IV.A.3). A record ends at `<EOR>`, also case-insensitive.
 * - Date is 8 digits, YYYYMMDD, UTC. Time is 6 digits HHMMSS or 4 digits HHMM, UTC.
 * - Location is 11 characters, `XDDD MM.MMM`, X one of N, S, E, W.
 * - GridSquare is a 2, 4, 6 or 8 character Maidenhead locator; characters 9 and 10 of
 *   a longer one are in the `_EXT` field, which is not read here.
 *
 * The specification says ADI data is ASCII. Real files hold other characters, and
 * programs disagree on whether L then counts characters or bytes. This reader counts
 * bytes, which is the same thing for ASCII, and reads a value's bytes as UTF-8 when
 * they are valid UTF-8 and as Latin-1 otherwise.
 *
 * Where it is more lenient than the specification's words on the header: programs put
 * a UTF-8 byte-order mark at the start of a file, and people leave a blank line there.
 * Read strictly, either makes a header of a file that has none, and a header with no
 * `<EOH>` has no records. So when a file has no `<EOH>` anywhere, a mark and white
 * space before its first `<` are not a header: the specification itself has characters
 * outside data-specifiers ignored (IV.A.6). Words before the first `<` with no `<EOH>`
 * are still a header that never ends, since nothing says where its fields stop and the
 * first record's begin; the reader reads no records from one, and says that is why.
 * After a mark or white space, fields are the header's if an `<EOH>` ends them and the
 * first record's if an `<EOR>` does.
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
  /** An `<EOH>` was read: the file has a header, whether or not it has fields. */
  headerEnded: boolean;
  /** The file begins with words, which makes them a header, and has no `<EOH>` to end it: no record can be told from the header. */
  headerNeverEnds: boolean;
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

const END_TAG = /<eo[hr]>/i;
/** How much of a file is looked at before the server looks up from the looking. */
const SNIFF_BYTES = 1024 * 1024;

/**
 * Whether the bytes look like an ADI file at all: an end-of-header or end-of-record tag
 * somewhere in them. Looked for a megabyte at a time (a real log has one in its first
 * few hundred bytes), with `pause` awaited between megabytes when it is given, so that
 * 64 MB of something else does not hold the server while it is found not to be a log.
 */
export async function looksLikeAdif(bytes: Buffer, pause?: () => Promise<void>): Promise<boolean> {
  for (let start = 0; start < bytes.length; start += SNIFF_BYTES) {
    // Four bytes more than a megabyte, so that a tag across the join is seen.
    if (END_TAG.test(bytes.toString("latin1", start, Math.min(bytes.length, start + SNIFF_BYTES + 4)))) return true;
    if (pause && start + SNIFF_BYTES < bytes.length) await pause();
  }
  return false;
}

const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
/** Tags read in one go, records or not, before a reader hands back what it has: a file need not have an `<EOR>` in it. */
const TAGS_AT_ONCE = 20_000;

/** Whether the first `end` bytes are nothing but a UTF-8 byte-order mark and white space. */
function onlyMarkAndSpace(bytes: Buffer, end: number): boolean {
  let at = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  // Space, tab, line ends and the other control characters: nothing a header's words are made of.
  while (at < end && bytes[at]! <= 0x20) at++;
  return at >= end;
}

/**
 * Reads a file a few records at a time, so that a log of 200,000 contacts is never one
 * piece of work. It works on the bytes as they are: nothing the size of the file is
 * copied or turned into text.
 */
export interface AdifReader {
  /** Header fields, by upper-case name. Complete once the first record has been read. */
  readonly header: Map<string, string>;
  /**
   * The next whole records, at most `max` of them. It may give fewer, even none, before
   * the end of the file: it also hands back after a fixed number of tags, record or no
   * record. `done` says when the file has been read through.
   */
  read(max: number): AdifRecord[];
  readonly done: boolean;
  /** Bytes read so far, for saying how far along the reading is. */
  readonly position: number;
  /** Whole records read so far. */
  readonly count: number;
  /** As `AdifFile`; settled when `done`. */
  readonly truncated: number;
  readonly headerEnded: boolean;
  readonly headerNeverEnds: boolean;
}

export function adifReader(bytes: Buffer): AdifReader {
  let header = new Map<string, string>();
  let current = new Map<string, string>();
  let at = 0;
  let count = 0;
  let truncated = 0;
  let done = bytes.length === 0;
  let headerEnded = false;
  let headerNeverEnds = false;
  /**
   * Whether fields being read belong to a header. "words": the file begins with words,
   * so it has a header, which runs to the first `<EOH>`. "none": it begins with `<`, or
   * a record has ended, so fields are a record's. "unsure": it begins with a byte-order
   * mark or white space only; the fields that follow are a header's if an `<EOH>` ends
   * them, and the first record's if an `<EOR>` does.
   */
  let lead: "words" | "none" | "unsure" = "none";
  if (!done && bytes[0] !== LESS_THAN) {
    const first = bytes.indexOf(LESS_THAN);
    lead = onlyMarkAndSpace(bytes, first < 0 ? bytes.length : first) ? "unsure" : "words";
  }

  const finish = () => {
    done = true;
    if (lead === "words") {
      // A header with no <EOH> has no records that can be told from it, and its fields may be anybody's.
      headerNeverEnds = true;
      header = new Map();
    } else if (current.size > 0) {
      // Fields after the last <EOR> are a record the file stopped in the middle of.
      truncated += 1;
    }
  };

  function read(max: number): AdifRecord[] {
    const records: AdifRecord[] = [];
    let tags = 0;
    while (!done && records.length < max && tags < TAGS_AT_ONCE) {
      const first = bytes.indexOf(LESS_THAN, at);
      const close = first < 0 ? -1 : bytes.indexOf(GREATER_THAN, first + 1);
      if (close < 0) {
        at = bytes.length;
        finish();
        break;
      }
      // Loose text may hold a "<" of its own; the tag is what follows the last one before the ">".
      const open = bytes.lastIndexOf(LESS_THAN, close);
      const tag = bytes.toString("latin1", open + 1, close);
      at = close + 1;
      tags += 1;
      const upper = tag.length === 3 ? tag.toUpperCase() : "";
      if (upper === "EOH") {
        if (lead !== "none") header = lead === "unsure" ? current : header;
        lead = "none";
        headerEnded = true;
        current = new Map();
        continue;
      }
      if (upper === "EOR") {
        if (lead !== "words") {
          lead = "none";
          if (current.size > 0) {
            records.push({ fields: current });
            count += 1;
          }
        }
        current = new Map();
        continue;
      }
      const match = /^([^:<>]+):(\d+)(?::[^:<>]*)?$/.exec(tag);
      // Not a data-specifier: text that happens to hold an angle bracket. Ignored, as the specification says.
      if (!match) continue;
      const name = match[1]!.trim().toUpperCase();
      const length = Number(match[2]);
      if (at + length > bytes.length) {
        // The data runs past the end of the file: the record it belongs to is not whole.
        current.set(name, "");
        at = bytes.length;
        finish();
        break;
      }
      const value = decode(bytes.subarray(at, at + length)).trim();
      at += length;
      const target = lead === "words" ? header : current;
      if (!target.has(name)) target.set(name, value);
    }
    return records;
  }

  return {
    read,
    get header() {
      return header;
    },
    get done() {
      return done;
    },
    get position() {
      return at;
    },
    get count() {
      return count;
    },
    get truncated() {
      return truncated;
    },
    get headerEnded() {
      return headerEnded;
    },
    get headerNeverEnds() {
      return headerNeverEnds;
    },
  };
}

/** The whole file at once. For a file of any size use `adifReader`: this holds the thread until it has read it all. */
export function parseAdif(bytes: Buffer): AdifFile {
  const reader = adifReader(bytes);
  const records: AdifRecord[] = [];
  while (!reader.done) {
    for (const record of reader.read(1_000)) records.push(record);
    if (records.length > MAX_ADIF_RECORDS) throw new Error("too-many-records");
  }
  return {
    header: reader.header,
    records,
    truncated: reader.truncated,
    headerEnded: reader.headerEnded,
    headerNeverEnds: reader.headerNeverEnds,
  };
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
