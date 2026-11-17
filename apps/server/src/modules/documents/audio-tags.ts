/**
 * What an audio file says about itself: its title, author, album, reader, track
 * number, and how long it plays.
 *
 * Only the few fields an audiobook needs are read, so this is written here rather than
 * taken from a tag library: ID3 (versions 1, 2.2, 2.3 and 2.4) and the timing of the
 * first MPEG frame for MP3; the atoms of an MP4 (M4A, M4B); Vorbis comments for Ogg
 * (Vorbis and Opus) and FLAC; the INFO list of a WAV file. Nothing is inferred: a field
 * the file does not hold is left out. A reader (narrator) is taken only from a field
 * named for it (`NARRATOR` or `READER`, MP4's `©nrt`), never from one that sometimes
 * holds it.
 *
 * The file is never read whole. At most the first 4 MB (where tags live) and the last
 * 128 KB (an ID3v1 tag, the end of an Ogg stream) are read; an MP4 is walked atom by
 * atom, and only its `moov` atom, up to 16 MB, is read into memory.
 */
import fs from "node:fs";

export interface AudioFacts {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  /** Who reads it, from a field named for that. */
  reader?: string;
  track?: number;
  disc?: number;
  /** Running time, when the file says or it can be worked out exactly. */
  seconds?: number;
}

const HEAD_BYTES = 4 * 1024 * 1024;
const TAIL_BYTES = 128 * 1024;
const MAX_MOOV_BYTES = 16 * 1024 * 1024;
const MAX_TEXT = 300;

/** Trims a value and drops control characters; an empty result is no value. */
function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being removed
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, MAX_TEXT) : undefined;
}

/** "3/12" or "3" to 3. */
function leadingNumber(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^(\d{1,5})/);
  if (!match) return undefined;
  const number = Number(match[1]);
  return number > 0 ? number : undefined;
}

async function readAt(handle: fs.promises.FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(Math.max(0, length));
  let read = 0;
  while (read < buffer.length) {
    const { bytesRead } = await handle.read(buffer, read, buffer.length - read, position + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buffer.subarray(0, read);
}

// ── ID3 ──

function decodeText(encoding: number, bytes: Buffer): string {
  if (encoding === 0) return bytes.toString("latin1");
  if (encoding === 3) return bytes.toString("utf8");
  // UTF-16: with a byte order mark (1), or big-endian without one (2).
  let body = bytes;
  let bigEndian = encoding === 2;
  if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) body = body.subarray(2);
  else if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) {
    body = body.subarray(2);
    bigEndian = true;
  }
  const even = Buffer.from(body.subarray(0, body.length - (body.length % 2)));
  if (bigEndian) even.swap16();
  return even.toString("utf16le");
}

/** The first of a text frame's values (ID3 2.4 separates several with NUL). */
function firstValue(text: string): string {
  return text.split("\0").find((part) => part.trim() !== "") ?? "";
}

/** A text frame's value: an encoding byte, then the text. */
function textFrame(body: Buffer): string | undefined {
  if (body.length < 2) return undefined;
  return clean(firstValue(decodeText(body[0]!, body.subarray(1))));
}

/** A TXXX frame: an encoding byte, a description, a NUL, then the value. */
function userTextFrame(body: Buffer): { description: string; value: string } | undefined {
  if (body.length < 2) return undefined;
  const encoding = body[0]!;
  const text = decodeText(encoding, body.subarray(1));
  const split = text.indexOf("\0");
  if (split < 0) return undefined;
  const value = clean(firstValue(text.slice(split + 1)));
  return value ? { description: text.slice(0, split).trim().toUpperCase(), value } : undefined;
}

const syncsafe = (bytes: Buffer, at: number) =>
  ((bytes[at]! & 0x7f) << 21) | ((bytes[at + 1]! & 0x7f) << 14) | ((bytes[at + 2]! & 0x7f) << 7) | (bytes[at + 3]! & 0x7f);

const ID3_FIELDS: Record<string, keyof AudioFacts | "trackText" | "discText"> = {
  TIT2: "title",
  TT2: "title",
  TPE1: "artist",
  TP1: "artist",
  TALB: "album",
  TAL: "album",
  TPE2: "albumArtist",
  TP2: "albumArtist",
  TRCK: "trackText",
  TRK: "trackText",
  TPOS: "discText",
  TPA: "discText",
};

const READER_NAMES = new Set(["NARRATOR", "READER", "READ BY", "NARRATED BY"]);

interface Id3Tag {
  facts: AudioFacts;
  /** Bytes the tag takes at the start of the file, header and footer included. */
  size: number;
  /** TLEN, in milliseconds, when the tag gives it. */
  lengthMs?: number;
}

/** Reads an ID3v2 tag at the start of `head`. */
export function readId3v2(head: Buffer): Id3Tag | undefined {
  if (head.length < 10 || head.toString("latin1", 0, 3) !== "ID3") return undefined;
  const major = head[3]!;
  if (major < 2 || major > 4) return undefined;
  const flags = head[5]!;
  const tagSize = syncsafe(head, 6);
  const total = 10 + tagSize + (major === 4 && flags & 0x10 ? 10 : 0);
  const end = Math.min(head.length, 10 + tagSize);
  let at = 10;
  // An extended header comes first when the flag says so.
  if (major >= 3 && flags & 0x40 && head.length >= 14) {
    at += major === 4 ? syncsafe(head, 10) : head.readUInt32BE(10) + 4;
  }
  const facts: AudioFacts = {};
  let trackText: string | undefined;
  let discText: string | undefined;
  let lengthMs: number | undefined;
  const idLength = major === 2 ? 3 : 4;
  const headerLength = major === 2 ? 6 : 10;
  while (at + headerLength <= end) {
    const id = head.toString("latin1", at, at + idLength);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const size =
      major === 2
        ? (head[at + 3]! << 16) | (head[at + 4]! << 8) | head[at + 5]!
        : major === 4
          ? syncsafe(head, at + 4)
          : head.readUInt32BE(at + 4);
    const bodyStart = at + headerLength;
    if (size <= 0 || bodyStart + size > end) break;
    const body = head.subarray(bodyStart, bodyStart + size);
    const field = ID3_FIELDS[id];
    if (field === "trackText") trackText = textFrame(body);
    else if (field === "discText") discText = textFrame(body);
    else if (field) {
      const value = textFrame(body);
      if (value && facts[field] === undefined) (facts as Record<string, unknown>)[field] = value;
    } else if (id === "TXXX" || id === "TXX") {
      const user = userTextFrame(body);
      if (user && READER_NAMES.has(user.description) && !facts.reader) facts.reader = user.value;
    } else if (id === "TLEN" || id === "TLE") {
      const ms = Number(textFrame(body));
      if (Number.isFinite(ms) && ms > 0) lengthMs = ms;
    }
    at = bodyStart + size;
  }
  facts.track = leadingNumber(trackText);
  facts.disc = leadingNumber(discText);
  return { facts, size: total, lengthMs };
}

/** Reads the 128-byte ID3v1 tag at the very end of a file. */
export function readId3v1(tail: Buffer): AudioFacts | undefined {
  if (tail.length < 128) return undefined;
  const tag = tail.subarray(tail.length - 128);
  if (tag.toString("latin1", 0, 3) !== "TAG") return undefined;
  const field = (from: number, length: number) => clean(tag.toString("latin1", from, from + length).split("\0")[0]);
  // ID3v1.1 keeps the track number in the last byte of the comment.
  const track = tag[125] === 0 && tag[126]! > 0 ? tag[126] : undefined;
  return { title: field(3, 30), artist: field(33, 30), album: field(63, 30), track };
}

// ── MPEG audio frames (MP3) ──

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

interface MpegFrame {
  /** 3 for MPEG-1, 2 for MPEG-2, 0 for MPEG-2.5. */
  version: number;
  bitrate: number;
  sampleRate: number;
  mono: boolean;
  length: number;
}

function mpegFrame(bytes: Buffer, at: number): MpegFrame | undefined {
  if (at + 4 > bytes.length || bytes[at] !== 0xff || (bytes[at + 1]! & 0xe0) !== 0xe0) return undefined;
  const version = (bytes[at + 1]! >> 3) & 3;
  const layer = (bytes[at + 1]! >> 1) & 3;
  if (version === 1 || layer !== 1) return undefined; // reserved version, or not Layer III
  const bitrateIndex = bytes[at + 2]! >> 4;
  const rateIndex = (bytes[at + 2]! >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return undefined;
  const bitrate = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex]! * 1000;
  const sampleRate = SAMPLE_RATES[version]![rateIndex]!;
  const padding = (bytes[at + 2]! >> 1) & 1;
  const mono = bytes[at + 3]! >> 6 === 3;
  const length = Math.floor(((version === 3 ? 144 : 72) * bitrate) / sampleRate) + padding;
  return { version, bitrate, sampleRate, mono, length };
}

/**
 * The running time of an MP3 whose audio starts at `start`: from the frame count in a
 * Xing, Info or VBRI header when there is one, otherwise from the bitrate of a file
 * whose first two frames agree (a constant bitrate, as LibriVox's files are).
 */
export function mp3Seconds(head: Buffer, start: number, fileSize: number, endTrim: number): number | undefined {
  // Some files carry a little junk before the first frame.
  let at = start;
  const limit = Math.min(head.length - 4, start + 64 * 1024);
  while (at < limit && !(mpegFrame(head, at) && mpegFrame(head, at + mpegFrame(head, at)!.length))) at += 1;
  const frame = mpegFrame(head, at);
  if (!frame) return undefined;
  const samplesPerFrame = frame.version === 3 ? 1152 : 576;
  const sideInfo = frame.version === 3 ? (frame.mono ? 17 : 32) : frame.mono ? 9 : 17;
  const xing = at + 4 + sideInfo;
  const tag = head.toString("latin1", xing, xing + 4);
  if ((tag === "Xing" || tag === "Info") && xing + 12 <= head.length) {
    const flags = head.readUInt32BE(xing + 4);
    if (flags & 1) {
      const frames = head.readUInt32BE(xing + 8);
      if (frames > 0) return (frames * samplesPerFrame) / frame.sampleRate;
    }
  }
  const vbri = at + 4 + 32;
  if (head.toString("latin1", vbri, vbri + 4) === "VBRI" && vbri + 18 <= head.length) {
    const frames = head.readUInt32BE(vbri + 14);
    if (frames > 0) return (frames * samplesPerFrame) / frame.sampleRate;
  }
  const next = mpegFrame(head, at + frame.length);
  if (!next || next.bitrate !== frame.bitrate) return undefined;
  const audioBytes = fileSize - at - endTrim;
  return audioBytes > 0 ? (audioBytes * 8) / frame.bitrate : undefined;
}

// ── Vorbis comments (Ogg Vorbis, Opus, FLAC) ──

/** A Vorbis comment block: the vendor string, then KEY=value pairs. */
export function readVorbisComments(block: Buffer): AudioFacts {
  const facts: AudioFacts = {};
  if (block.length < 8) return facts;
  let at = 4 + block.readUInt32LE(0);
  if (at + 4 > block.length) return facts;
  const count = block.readUInt32LE(at);
  at += 4;
  const values = new Map<string, string>();
  for (let index = 0; index < count && at + 4 <= block.length; index += 1) {
    const length = block.readUInt32LE(at);
    at += 4;
    if (at + length > block.length) break;
    const entry = block.toString("utf8", at, at + length);
    at += length;
    const split = entry.indexOf("=");
    if (split <= 0) continue;
    const key = entry.slice(0, split).toUpperCase();
    if (!values.has(key)) values.set(key, entry.slice(split + 1));
  }
  facts.title = clean(values.get("TITLE"));
  facts.artist = clean(values.get("ARTIST"));
  facts.album = clean(values.get("ALBUM"));
  facts.albumArtist = clean(values.get("ALBUMARTIST") ?? values.get("ALBUM ARTIST"));
  facts.reader = clean(values.get("NARRATOR") ?? values.get("READER"));
  facts.track = leadingNumber(values.get("TRACKNUMBER"));
  facts.disc = leadingNumber(values.get("DISCNUMBER"));
  return facts;
}

/** The packets at the start of an Ogg stream, joined across pages. */
function oggPackets(bytes: Buffer, wanted: number): Buffer[] {
  const packets: Buffer[] = [];
  let current: Buffer[] = [];
  let at = 0;
  while (at + 27 <= bytes.length && packets.length < wanted) {
    if (bytes.toString("latin1", at, at + 4) !== "OggS") break;
    const segments = bytes[at + 26]!;
    const table = bytes.subarray(at + 27, at + 27 + segments);
    let body = at + 27 + segments;
    for (const lacing of table) {
      current.push(bytes.subarray(body, body + lacing));
      body += lacing;
      if (lacing < 255) {
        packets.push(Buffer.concat(current));
        current = [];
        if (packets.length >= wanted) break;
      }
    }
    at = body;
  }
  return packets;
}

/** The granule position of the last page in `tail`: samples played by the end of the stream. */
function lastGranule(tail: Buffer): bigint | undefined {
  for (let at = tail.lastIndexOf("OggS"); at >= 0; at = tail.lastIndexOf("OggS", at - 1)) {
    if (at + 14 > tail.length) continue;
    const granule = tail.readBigInt64LE(at + 6);
    if (granule > 0n) return granule;
  }
  return undefined;
}

function readOgg(head: Buffer, tail: Buffer): AudioFacts {
  const [identification, comments] = oggPackets(head, 2);
  if (!identification || !comments) return {};
  const granule = lastGranule(tail);
  if (identification.toString("latin1", 0, 8) === "OpusHead" && comments.toString("latin1", 0, 8) === "OpusTags") {
    const facts = readVorbisComments(comments.subarray(8));
    // Opus always counts at 48 kHz, and its first samples (the pre-skip) are not played.
    const preSkip = identification.length >= 12 ? identification.readUInt16LE(10) : 0;
    if (granule) facts.seconds = Math.max(0, Number(granule) - preSkip) / 48000;
    return facts;
  }
  if (identification.toString("latin1", 1, 7) === "vorbis" && comments.toString("latin1", 1, 7) === "vorbis") {
    const facts = readVorbisComments(comments.subarray(7));
    const rate = identification.length >= 16 ? identification.readUInt32LE(12) : 0;
    if (granule && rate > 0) facts.seconds = Number(granule) / rate;
    return facts;
  }
  return {};
}

function readFlac(head: Buffer): AudioFacts {
  let at = head.indexOf("fLaC");
  if (at < 0) return {};
  at += 4;
  let facts: AudioFacts = {};
  let seconds: number | undefined;
  for (let last = false; !last && at + 4 <= head.length; ) {
    last = (head[at]! & 0x80) !== 0;
    const type = head[at]! & 0x7f;
    const length = head.readUIntBE(at + 1, 3);
    const body = head.subarray(at + 4, at + 4 + length);
    if (type === 0 && body.length >= 18) {
      const rate = (body[10]! << 12) | (body[11]! << 4) | (body[12]! >> 4);
      const samples = (body[13]! & 0x0f) * 2 ** 32 + body.readUInt32BE(14);
      if (rate > 0 && samples > 0) seconds = samples / rate;
    } else if (type === 4) {
      facts = readVorbisComments(body);
    }
    at += 4 + length;
  }
  return { ...facts, seconds };
}

// ── WAV ──

function readWav(head: Buffer): AudioFacts {
  const facts: AudioFacts = {};
  let byteRate = 0;
  let dataBytes = 0;
  let at = 12;
  while (at + 8 <= head.length) {
    const id = head.toString("latin1", at, at + 4);
    const size = head.readUInt32LE(at + 4);
    const body = head.subarray(at + 8, Math.min(head.length, at + 8 + size));
    if (id === "fmt " && body.length >= 12) byteRate = body.readUInt32LE(8);
    else if (id === "data") dataBytes = size;
    else if (id === "LIST" && body.toString("latin1", 0, 4) === "INFO") {
      for (let inner = 4; inner + 8 <= body.length; ) {
        const key = body.toString("latin1", inner, inner + 4);
        const length = body.readUInt32LE(inner + 4);
        const value = clean(body.toString("utf8", inner + 8, inner + 8 + length).split("\0")[0]);
        if (key === "INAM") facts.title = value;
        else if (key === "IART") facts.artist = value;
        else if (key === "IPRD") facts.album = value;
        else if (key === "ITRK" || key === "IPRT") facts.track = leadingNumber(value);
        inner += 8 + length + (length % 2);
      }
    }
    if (id === "data") break; // the samples follow; there is nothing more to read before them
    at += 8 + size + (size % 2);
  }
  if (byteRate > 0 && dataBytes > 0) facts.seconds = dataBytes / byteRate;
  return facts;
}

// ── MP4 (M4A, M4B) ──

/** The children of an atom's body, as [type, body] pairs. */
function atoms(body: Buffer): Array<[string, Buffer]> {
  const found: Array<[string, Buffer]> = [];
  for (let at = 0; at + 8 <= body.length; ) {
    let size = body.readUInt32BE(at);
    const type = body.toString("latin1", at + 4, at + 8);
    let header = 8;
    if (size === 1 && at + 16 <= body.length) {
      size = Number(body.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) size = body.length - at;
    if (size < header || at + size > body.length) break;
    found.push([type, body.subarray(at + header, at + size)]);
    at += size;
  }
  return found;
}

const child = (body: Buffer | undefined, type: string) => (body ? atoms(body).find(([name]) => name === type)?.[1] : undefined);

function readMoov(moov: Buffer): AudioFacts {
  const facts: AudioFacts = {};
  const mvhd = child(moov, "mvhd");
  if (mvhd && mvhd.length >= 20) {
    const version = mvhd[0];
    const timescale = version === 1 ? mvhd.readUInt32BE(20) : mvhd.readUInt32BE(12);
    const duration = version === 1 ? Number(mvhd.readBigUInt64BE(24)) : mvhd.readUInt32BE(16);
    if (timescale > 0 && duration > 0 && duration !== 0xffffffff) facts.seconds = duration / timescale;
  }
  // moov/udta/meta (a full atom: four bytes of version and flags first)/ilst
  const meta = child(child(moov, "udta"), "meta");
  const ilst = meta ? child(meta.subarray(4), "ilst") : undefined;
  for (const [type, item] of ilst ? atoms(ilst) : []) {
    const data = child(item, "data");
    if (!data || data.length < 8) continue;
    const value = data.subarray(8);
    if (type === "trkn" || type === "disk") {
      if (value.length >= 4) {
        const number = value.readUInt16BE(2);
        if (number > 0) facts[type === "trkn" ? "track" : "disc"] = number;
      }
      continue;
    }
    const text = clean(value.toString("utf8"));
    if (type === "©nam") facts.title = text;
    else if (type === "©ART") facts.artist = text;
    else if (type === "©alb") facts.album = text;
    else if (type === "aART") facts.albumArtist = text;
    else if (type === "©nrt") facts.reader = text;
  }
  return facts;
}

async function readMp4(handle: fs.promises.FileHandle, size: number): Promise<AudioFacts> {
  // Top-level atoms are walked by their headers; mdat, the sound itself, is skipped.
  for (let at = 0; at + 8 <= size; ) {
    const header = await readAt(handle, at, 16);
    if (header.length < 8) break;
    let length = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    let headerLength = 8;
    if (length === 1 && header.length >= 16) {
      length = Number(header.readBigUInt64BE(8));
      headerLength = 16;
    } else if (length === 0) length = size - at;
    if (length < headerLength) break;
    if (type === "moov") {
      if (length > MAX_MOOV_BYTES) return {};
      return readMoov(await readAt(handle, at + headerLength, length - headerLength));
    }
    at += length;
  }
  return {};
}

// ── Putting it together ──

/** Fields of `extra` fill those `base` left empty. */
function fill(base: AudioFacts, extra: AudioFacts | undefined): AudioFacts {
  if (!extra) return base;
  const merged: AudioFacts = { ...base };
  for (const [key, value] of Object.entries(extra) as Array<[keyof AudioFacts, AudioFacts[keyof AudioFacts]]>) {
    if (value !== undefined && merged[key] === undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** Drops fields left undefined, so the result compares and prints plainly. */
function defined(facts: AudioFacts): AudioFacts {
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined)) as AudioFacts;
}

/** Reads what an audio file says about itself. Never throws for a file it cannot make sense of: it says nothing. */
export async function readAudioFacts(file: string, ext: string): Promise<AudioFacts> {
  const handle = await fs.promises.open(file, "r");
  try {
    const { size } = await handle.stat();
    const kind = ext.toLowerCase();
    if (kind === "m4a" || kind === "m4b" || kind === "mp4") return defined(await readMp4(handle, size));
    const head = await readAt(handle, 0, Math.min(size, HEAD_BYTES));
    const tailStart = Math.max(0, size - TAIL_BYTES);
    const tail = tailStart === 0 ? head : await readAt(handle, tailStart, size - tailStart);
    if (kind === "ogg" || kind === "oga" || kind === "opus") return defined(readOgg(head, tail));
    if (kind === "flac") return defined(fill(readFlac(head), readId3v2(head)?.facts));
    if (kind === "wav") return defined(readWav(head));
    // MP3 and AAC: ID3v2 at the start, ID3v1 at the end.
    const id3 = readId3v2(head);
    const v1 = readId3v1(tail);
    let facts = fill(id3?.facts ?? {}, v1);
    if (kind === "mp3") {
      const seconds = id3?.lengthMs ? id3.lengthMs / 1000 : mp3Seconds(head, id3?.size ?? 0, size, v1 ? 128 : 0);
      facts = { ...facts, seconds };
    }
    return defined(facts);
  } catch {
    return {};
  } finally {
    await handle.close();
  }
}
