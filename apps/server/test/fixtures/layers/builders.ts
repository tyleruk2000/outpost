/**
 * Writers for the publishers' own formats, so that the tests read files shaped exactly
 * as WorldPop's GeoTIFFs and Geofabrik's `.osm.pbf` extracts are, without the internet.
 */
import zlib from "node:zlib";

// ── LZW, as TIFF writes it ───────────────────────────────────────────────────

/** TIFF LZW (MSB first, early change), the inverse of `imagery/lzw.ts`. */
export function lzwEncode(input: Uint8Array): Buffer {
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let width = 9;
  const emit = (code: number) => {
    bitBuffer = (bitBuffer << width) | code;
    bitCount += width;
    while (bitCount >= 8) {
      out.push((bitBuffer >>> (bitCount - 8)) & 0xff);
      bitCount -= 8;
    }
    bitBuffer &= (1 << bitCount) - 1;
  };
  let table = new Map<string, number>();
  let next = 258;
  const reset = () => {
    table = new Map();
    next = 258;
    width = 9;
  };
  emit(256);
  reset();
  let current = "";
  for (const byte of input) {
    const candidate = current ? `${current},${byte}` : String(byte);
    const known = candidate.includes(",") ? table.has(candidate) : true;
    if (known) {
      current = candidate;
      continue;
    }
    emit(current.includes(",") ? table.get(current)! : Number(current));
    table.set(candidate, next);
    next += 1;
    // The decoder adds each entry one code later than this side does, and widens when its table is one short of full.
    if (next >= 1 << width && width < 12) width += 1;
    if (next >= 4093) {
      emit(256);
      reset();
    }
    current = String(byte);
  }
  if (current) emit(current.includes(",") ? table.get(current)! : Number(current));
  emit(257);
  if (bitCount > 0) out.push((bitBuffer << (8 - bitCount)) & 0xff);
  return Buffer.from(out);
}

// ── GeoTIFF ──────────────────────────────────────────────────────────────────

export interface TiffOptions {
  width: number;
  height: number;
  /** Row by row, top first. */
  values: Float32Array;
  originLon: number;
  originLat: number;
  pixel: number;
  epsg?: number;
  nodata?: number;
  big?: boolean;
  lzw?: boolean;
  predictor?: 1 | 2;
  /** Rows to a strip; defaults to all of them, as WorldPop's small files have. */
  rowsPerStrip?: number;
}

/** A single-band float32 GeoTIFF in strips, little-endian, as WorldPop's 1 km files are. */
export function buildTiff(options: TiffOptions): Buffer {
  const { width, height, values } = options;
  const rows = options.rowsPerStrip ?? height;
  const big = options.big ?? true;
  const predictor = options.predictor ?? 2;
  const strips: Buffer[] = [];
  for (let top = 0; top < height; top += rows) {
    const count = Math.min(rows, height - top) * width;
    const words = new Uint32Array(new Float32Array(values.subarray(top * width, top * width + count)).buffer);
    if (predictor === 2) {
      for (let r = Math.min(rows, height - top) - 1; r >= 0; r -= 1) {
        for (let x = width - 1; x >= 1; x -= 1) words[r * width + x] = (words[r * width + x]! - words[r * width + x - 1]!) >>> 0;
      }
    }
    const raw = Buffer.from(words.buffer);
    strips.push(options.lzw === false ? raw : lzwEncode(raw));
  }
  const nodataText = options.nodata !== undefined ? `${options.nodata}\0` : null;
  // Entries: tag, type, values (numbers) or bytes.
  type Entry = { tag: number; type: number; numbers?: number[]; bytes?: Buffer };
  const entries: Entry[] = [
    { tag: 256, type: 3, numbers: [width] },
    { tag: 257, type: 3, numbers: [height] },
    { tag: 258, type: 3, numbers: [32] },
    { tag: 259, type: 3, numbers: [options.lzw === false ? 1 : 5] },
    { tag: 262, type: 3, numbers: [1] },
    { tag: 273, type: big ? 16 : 4, numbers: strips.map(() => 0) },
    { tag: 277, type: 3, numbers: [1] },
    { tag: 278, type: 3, numbers: [rows] },
    { tag: 279, type: big ? 16 : 4, numbers: strips.map((strip) => strip.length) },
    { tag: 284, type: 3, numbers: [1] },
    { tag: 317, type: 3, numbers: [predictor] },
    { tag: 339, type: 3, numbers: [3] },
    { tag: 33550, type: 12, numbers: [options.pixel, options.pixel, 0] },
    { tag: 33922, type: 12, numbers: [0, 0, 0, options.originLon, options.originLat, 0] },
    { tag: 34735, type: 3, numbers: [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, options.epsg ?? 4326] },
  ];
  if (nodataText) entries.push({ tag: 42113, type: 2, bytes: Buffer.from(nodataText, "latin1") });
  const size: Record<number, number> = { 2: 1, 3: 2, 4: 4, 12: 8, 16: 8 };
  const entrySize = big ? 20 : 12;
  const pointer = big ? 8 : 4;
  const headerSize = big ? 16 : 8;
  const ifdSize = (big ? 8 : 2) + entries.length * entrySize + pointer;
  let extraAt = headerSize + ifdSize;
  const extras: Buffer[] = [];
  const valueBytes = (entry: Entry): Buffer => {
    if (entry.bytes) return entry.bytes;
    const buffer = Buffer.alloc(size[entry.type]! * entry.numbers!.length);
    entry.numbers!.forEach((n, i) => {
      const at = i * size[entry.type]!;
      if (entry.type === 3) buffer.writeUInt16LE(n, at);
      else if (entry.type === 4) buffer.writeUInt32LE(n, at);
      else if (entry.type === 12) buffer.writeDoubleLE(n, at);
      else buffer.writeBigUInt64LE(BigInt(n), at);
    });
    return buffer;
  };
  // Strip offsets are known only once the extras are laid out: lay out twice.
  const layout = () => {
    extraAt = headerSize + ifdSize;
    extras.length = 0;
    const placed: Array<{ entry: Entry; inline: Buffer | null; offset: number; count: number }> = [];
    for (const entry of entries) {
      const bytes = valueBytes(entry);
      const count = entry.bytes ? entry.bytes.length : entry.numbers!.length;
      if (bytes.length <= pointer) placed.push({ entry, inline: bytes, offset: 0, count });
      else {
        placed.push({ entry, inline: null, offset: extraAt, count });
        extras.push(bytes);
        extraAt += bytes.length + (bytes.length % 2);
        if (bytes.length % 2) extras.push(Buffer.alloc(1));
      }
    }
    return placed;
  };
  let placed = layout();
  let at = extraAt;
  const stripEntry = entries.find((entry) => entry.tag === 273)!;
  stripEntry.numbers = strips.map((strip) => {
    const offset = at;
    at += strip.length;
    return offset;
  });
  placed = layout();
  const header = Buffer.alloc(headerSize);
  header.write("II", 0, "latin1");
  if (big) {
    header.writeUInt16LE(43, 2);
    header.writeUInt16LE(8, 4);
    header.writeBigUInt64LE(BigInt(headerSize), 8);
  } else {
    header.writeUInt16LE(42, 2);
    header.writeUInt32LE(headerSize, 4);
  }
  const ifd = Buffer.alloc(ifdSize);
  let p = 0;
  if (big) {
    ifd.writeBigUInt64LE(BigInt(entries.length), 0);
    p = 8;
  } else {
    ifd.writeUInt16LE(entries.length, 0);
    p = 2;
  }
  for (const { entry, inline, offset, count } of placed) {
    ifd.writeUInt16LE(entry.tag, p);
    ifd.writeUInt16LE(entry.type, p + 2);
    if (big) ifd.writeBigUInt64LE(BigInt(count), p + 4);
    else ifd.writeUInt32LE(count, p + 4);
    const valueAt = p + (big ? 12 : 8);
    if (inline) inline.copy(ifd, valueAt);
    else if (big) ifd.writeBigUInt64LE(BigInt(offset), valueAt);
    else ifd.writeUInt32LE(offset, valueAt);
    p += entrySize;
  }
  return Buffer.concat([header, ifd, ...extras, ...strips]);
}

// ── OpenStreetMap PBF ────────────────────────────────────────────────────────

class Writer {
  bytes: number[] = [];
  varint(value: number): this {
    let v = value;
    while (v >= 128) {
      this.bytes.push((v % 128) | 128);
      v = Math.floor(v / 128);
    }
    this.bytes.push(v);
    return this;
  }
  svarint(value: number): this {
    return this.varint(value < 0 ? -value * 2 - 1 : value * 2);
  }
  key(no: number, wire: number): this {
    return this.varint(no * 8 + wire);
  }
  field(no: number, data: Uint8Array | number[]): this {
    this.key(no, 2).varint(data.length);
    for (const byte of data) this.bytes.push(byte);
    return this;
  }
  uint(no: number, value: number): this {
    return this.key(no, 0).varint(value);
  }
  sint(no: number, value: number): this {
    return this.key(no, 0).svarint(value);
  }
  packed(no: number, values: number[], signed: boolean, delta: boolean): this {
    const inner = new Writer();
    let last = 0;
    for (const value of values) {
      const v = delta ? value - last : value;
      last = value;
      if (signed) inner.svarint(v);
      else inner.varint(v);
    }
    return this.field(no, inner.bytes);
  }
  buffer(): Buffer {
    return Buffer.from(this.bytes);
  }
}

export interface PbfNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}
export interface PbfWay {
  id: number;
  refs: number[];
  tags?: Record<string, string>;
}
export interface PbfRelation {
  id: number;
  members: Array<{ ref: number; role: string }>;
  tags?: Record<string, string>;
}

function blob(type: string, payload: Buffer): Buffer {
  const zipped = zlib.deflateSync(payload);
  const body = new Writer().uint(2, payload.length).field(3, zipped).buffer();
  const header = new Writer().field(1, Buffer.from(type, "utf8")).uint(3, body.length).buffer();
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length, 0);
  return Buffer.concat([length, header, body]);
}

/** An `.osm.pbf` file: a header, then one block of dense nodes, one of ways and one of relations, as osmium writes them. */
export function buildPbf(data: { nodes: PbfNode[]; ways: PbfWay[]; relations: PbfRelation[]; timestamp?: number; features?: string[] }): Buffer {
  const header = new Writer();
  for (const feature of data.features ?? ["OsmSchema-V0.6", "DenseNodes"]) header.field(4, Buffer.from(feature, "utf8"));
  if (data.timestamp) header.uint(32, data.timestamp);

  const block = (fill: (group: Writer, string: (text: string) => number) => void): Buffer => {
    const strings = [""];
    const index = new Map<string, number>();
    const string = (text: string) => {
      if (!index.has(text)) {
        index.set(text, strings.length);
        strings.push(text);
      }
      return index.get(text)!;
    };
    const group = new Writer();
    fill(group, string);
    const table = new Writer();
    for (const text of strings) table.field(1, Buffer.from(text, "utf8"));
    return new Writer().field(1, table.bytes).field(2, group.bytes).uint(17, 100).buffer();
  };

  const nodes = block((group, string) => {
    const dense = new Writer();
    dense.packed(1, data.nodes.map((node) => node.id), true, true);
    dense.packed(8, data.nodes.map((node) => Math.round(node.lat * 1e7)), true, true);
    dense.packed(9, data.nodes.map((node) => Math.round(node.lon * 1e7)), true, true);
    const keysVals: number[] = [];
    for (const node of data.nodes) {
      for (const [key, value] of Object.entries(node.tags ?? {})) keysVals.push(string(key), string(value));
      keysVals.push(0);
    }
    dense.packed(10, keysVals, false, false);
    group.field(2, dense.bytes);
  });
  const ways = block((group, string) => {
    for (const way of data.ways) {
      const w = new Writer().uint(1, way.id);
      const tags = Object.entries(way.tags ?? {});
      w.packed(2, tags.map(([key]) => string(key)), false, false);
      w.packed(3, tags.map(([, value]) => string(value)), false, false);
      w.packed(8, way.refs, true, true);
      group.field(3, w.bytes);
    }
  });
  const relations = block((group, string) => {
    for (const relation of data.relations) {
      const r = new Writer().uint(1, relation.id);
      const tags = Object.entries(relation.tags ?? {});
      r.packed(2, tags.map(([key]) => string(key)), false, false);
      r.packed(3, tags.map(([, value]) => string(value)), false, false);
      r.packed(8, relation.members.map((member) => string(member.role)), false, false);
      r.packed(9, relation.members.map((member) => member.ref), true, true);
      r.packed(10, relation.members.map(() => 1), false, false);
      group.field(4, r.bytes);
    }
  });
  return Buffer.concat([blob("OSMHeader", header.buffer()), blob("OSMData", nodes), blob("OSMData", ways), blob("OSMData", relations)]);
}
