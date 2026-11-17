/**
 * Tiny audio files written byte by byte, so the tests can say exactly what each holds.
 *
 * The WAV files are real, playable silence and are what the end-to-end test plays. The
 * MP3 frames are well-formed headers over silence; the Ogg, FLAC and MP4 files carry
 * real tag structures and timing fields around no sound at all, which is all the tag
 * reader looks at.
 */

export interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  reader?: string;
  track?: number;
  disc?: number;
}

const u32le = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};
const u32be = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
};

// ── WAV ──

function riffChunk(id: string, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from(id, "latin1"), u32le(body.length), body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

/** Mono 8-bit silence at 8 kHz, with an INFO list for the tags given. 8 kB a second. */
export function wav(seconds: number, tags: Tags = {}): Buffer {
  const rate = 8000;
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(1, 2); // mono
  fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate, 8); // bytes a second
  fmt.writeUInt16LE(1, 12);
  fmt.writeUInt16LE(8, 14);
  const info: Buffer[] = [];
  const add = (id: string, value: string | number | undefined) => {
    if (value !== undefined) info.push(riffChunk(id, Buffer.from(`${value}\0`, "utf8")));
  };
  add("INAM", tags.title);
  add("IART", tags.artist);
  add("IPRD", tags.album);
  add("ITRK", tags.track);
  const list = info.length > 0 ? [riffChunk("LIST", Buffer.concat([Buffer.from("INFO"), ...info]))] : [];
  const data = riffChunk("data", Buffer.alloc(Math.round(rate * seconds), 0x80));
  const body = Buffer.concat([Buffer.from("WAVE"), riffChunk("fmt ", fmt), ...list, data]);
  return Buffer.concat([Buffer.from("RIFF"), u32le(body.length), body]);
}

// ── MP3 ──

function id3Frame(id: string, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from(id, "latin1"), u32be(body.length), Buffer.alloc(2), body]);
}

/** ID3v2.3 text frames: UTF-16 with a byte order mark, as many taggers write them. */
const utf16 = (text: string) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(text, "utf16le")]);

export function id3v23(tags: Tags): Buffer {
  const frames: Buffer[] = [];
  if (tags.title) frames.push(id3Frame("TIT2", utf16(tags.title)));
  if (tags.artist) frames.push(id3Frame("TPE1", Buffer.concat([Buffer.from([0]), Buffer.from(tags.artist, "latin1")])));
  if (tags.album) frames.push(id3Frame("TALB", Buffer.concat([Buffer.from([3]), Buffer.from(tags.album, "utf8")])));
  if (tags.albumArtist) frames.push(id3Frame("TPE2", Buffer.concat([Buffer.from([3]), Buffer.from(tags.albumArtist, "utf8")])));
  if (tags.track) frames.push(id3Frame("TRCK", Buffer.from(`\0${tags.track}/99`, "latin1")));
  if (tags.reader) frames.push(id3Frame("TXXX", Buffer.concat([Buffer.from([3]), Buffer.from(`NARRATOR\0${tags.reader}`, "utf8")])));
  const body = Buffer.concat([...frames, Buffer.alloc(64)]); // and some padding
  const size = body.length;
  const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
  return Buffer.concat([header, body]);
}

/**
 * MPEG-1 Layer III frames at 32 kbps and 32 kHz: 144 bytes and 36 ms each, constant
 * bitrate. With `xing`, the first frame carries an Info header with the frame count.
 */
export function mp3(frames: number, tags: Tags = {}, options: { xing?: boolean; id3v1?: Tags } = {}): Buffer {
  const header = Buffer.from([0xff, 0xfb, 0x18, 0xc4]); // MPEG-1, Layer III, 32 kbps, 32 kHz, mono
  const frame = () => Buffer.concat([header, Buffer.alloc(140)]);
  const out: Buffer[] = [];
  if (Object.keys(tags).length > 0) out.push(id3v23(tags));
  if (options.xing) {
    const first = frame();
    // Side information for a mono MPEG-1 frame is 17 bytes, after the 4-byte header.
    first.write("Info", 4 + 17, "latin1");
    first.writeUInt32BE(1, 4 + 17 + 4);
    first.writeUInt32BE(frames, 4 + 17 + 8);
    out.push(first);
  }
  for (let index = 0; index < frames; index += 1) out.push(frame());
  if (options.id3v1) {
    const tag = Buffer.alloc(128);
    tag.write("TAG", 0, "latin1");
    tag.write(options.id3v1.title ?? "", 3, 30, "latin1");
    tag.write(options.id3v1.artist ?? "", 33, 30, "latin1");
    tag.write(options.id3v1.album ?? "", 63, 30, "latin1");
    if (options.id3v1.track) tag[126] = options.id3v1.track;
    out.push(tag);
  }
  return Buffer.concat(out);
}

// ── Vorbis comments, Ogg and FLAC ──

function vorbisComments(tags: Tags): Buffer {
  const entries: string[] = [];
  if (tags.title) entries.push(`TITLE=${tags.title}`);
  if (tags.artist) entries.push(`ARTIST=${tags.artist}`);
  if (tags.album) entries.push(`ALBUM=${tags.album}`);
  if (tags.reader) entries.push(`NARRATOR=${tags.reader}`);
  if (tags.track) entries.push(`TRACKNUMBER=${tags.track}`);
  const vendor = Buffer.from("outpost test");
  return Buffer.concat([
    u32le(vendor.length),
    vendor,
    u32le(entries.length),
    ...entries.flatMap((entry) => [u32le(Buffer.byteLength(entry)), Buffer.from(entry, "utf8")]),
  ]);
}

/** One Ogg page holding whole packets. The checksum is left at zero: the reader does not check it. */
function oggPage(packets: Buffer[], granule: bigint, sequence: number): Buffer {
  const lacing: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  const header = Buffer.alloc(27);
  header.write("OggS", 0, "latin1");
  header.writeBigInt64LE(granule, 6);
  header.writeUInt32LE(1, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  return Buffer.concat([header, Buffer.from(lacing), ...packets]);
}

/** Ogg Vorbis at 44.1 kHz whose last page says `seconds` have played. */
export function oggVorbis(seconds: number, tags: Tags = {}): Buffer {
  const identification = Buffer.alloc(30);
  identification[0] = 1;
  identification.write("vorbis", 1, "latin1");
  identification[11] = 1; // channels
  identification.writeUInt32LE(44100, 12);
  const comments = Buffer.concat([Buffer.from([3]), Buffer.from("vorbis"), vorbisComments(tags), Buffer.from([1])]);
  return Buffer.concat([
    oggPage([identification], 0n, 0),
    oggPage([comments], 0n, 1),
    oggPage([Buffer.alloc(10)], BigInt(Math.round(seconds * 44100)), 2),
  ]);
}

/** FLAC with a STREAMINFO block for `seconds` at 16 kHz, then its comments. */
export function flac(seconds: number, tags: Tags = {}): Buffer {
  const info = Buffer.alloc(34);
  const rate = 16000;
  const samples = Math.round(seconds * rate);
  info[10] = (rate >> 12) & 0xff;
  info[11] = (rate >> 4) & 0xff;
  info[12] = ((rate & 0x0f) << 4) | 0x00;
  info[13] = 0xf0 | Math.floor(samples / 2 ** 32);
  info.writeUInt32BE(samples % 2 ** 32, 14);
  const comments = vorbisComments(tags);
  const block = (type: number, body: Buffer, last: boolean) => {
    const header = Buffer.alloc(4);
    header[0] = (last ? 0x80 : 0) | type;
    header.writeUIntBE(body.length, 1, 3);
    return Buffer.concat([header, body]);
  };
  return Buffer.concat([Buffer.from("fLaC"), block(0, info, false), block(4, comments, true), Buffer.alloc(32)]);
}

// ── MP4 ──

function atom(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat(children);
  return Buffer.concat([u32be(body.length + 8), Buffer.from(type, "latin1"), body]);
}

function textItem(type: string, text: string): Buffer {
  return atom(type, atom("data", u32be(1), u32be(0), Buffer.from(text, "utf8")));
}

/** An M4B: ftyp, mdat first (as some encoders write it), then moov with mvhd and tags. */
export function m4b(seconds: number, tags: Tags = {}): Buffer {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12); // timescale
  mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
  const items: Buffer[] = [];
  if (tags.title) items.push(textItem("©nam", tags.title));
  if (tags.artist) items.push(textItem("©ART", tags.artist));
  if (tags.album) items.push(textItem("©alb", tags.album));
  if (tags.reader) items.push(textItem("©nrt", tags.reader));
  if (tags.track) {
    const value = Buffer.alloc(8);
    value.writeUInt16BE(tags.track, 2);
    items.push(atom("trkn", atom("data", u32be(0), u32be(0), value)));
  }
  const meta = atom("meta", Buffer.alloc(4), atom("hdlr", Buffer.alloc(25)), atom("ilst", ...items));
  return Buffer.concat([
    atom("ftyp", Buffer.from("M4B "), u32be(0), Buffer.from("M4B mp42isom")),
    atom("mdat", Buffer.alloc(256)),
    atom("moov", atom("mvhd", mvhd), atom("udta", meta)),
  ]);
}
