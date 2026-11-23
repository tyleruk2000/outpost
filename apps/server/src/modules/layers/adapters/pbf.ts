/**
 * Reading an OpenStreetMap `.osm.pbf` file, as Geofabrik publishes them, for the few
 * tags the reference layers want. No library: the format is a sequence of blobs, each
 * zlib-compressed protocol buffers (https://wiki.openstreetmap.org/wiki/PBF_Format), and
 * only the fields used here are decoded.
 *
 * The file is read in up to three passes, each a straight read from start to end:
 *  1. nodes whose tags match become features at once; ways and relations whose tags match
 *     are remembered with the ids of the nodes or ways they are made of;
 *  2. if any relation matched, the ways it is made of are read for their nodes;
 *  3. the positions of every node those ways need are read, and the ways and relations
 *     become features.
 * Memory grows with what matched (a country's hospitals, bases, shelters), not with the
 * size of the file.
 *
 * Refused with a plain message: blobs compressed other than by zlib (LZMA, Zstandard),
 * files that need a feature this reader lacks (history files), and damaged files.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import type { Bbox } from "@outpost/shared";
import { PermanentJobError } from "../../../core/jobs.ts";
import { classifyFood } from "./food-tags.ts";
import type { OsmObject } from "./osm-read.ts";
import { classifyOsm, type OsmLayer } from "./osm-tags.ts";

const MAX_BLOB_HEADER = 64 * 1024;
const MAX_BLOB = 32 * 1024 * 1024;
const SUPPORTED_FEATURES = new Set(["OsmSchema-V0.6", "DenseNodes", "HistoricalInformation"]);

export class PbfError extends PermanentJobError {}

// ── Protocol buffers ─────────────────────────────────────────────────────────

export class Proto {
  pos = 0;
  readonly buf: Uint8Array;
  readonly end: number;
  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
  }
  varint(): number {
    let result = 0;
    let shift = 1;
    for (let i = 0; i < 10; i += 1) {
      if (this.pos >= this.end) throw new PbfError("The file is damaged: a number runs past the end of its block.");
      const byte = this.buf[this.pos++]!;
      result += (byte & 0x7f) * shift;
      if (byte < 0x80) return result;
      shift *= 128;
    }
    throw new PbfError("The file is damaged: a number is too long.");
  }
  /** A zigzag-encoded signed number. Exact up to 2^53, which every OpenStreetMap id and position is. */
  svarint(): number {
    const n = this.varint();
    return n % 2 === 1 ? -(n + 1) / 2 : n / 2;
  }
  /** The next field: its number and wire type, or null at the end. */
  field(): { no: number; wire: number } | null {
    if (this.pos >= this.end) return null;
    const key = this.varint();
    return { no: Math.floor(key / 8), wire: key % 8 };
  }
  bytes(): Uint8Array {
    const length = this.varint();
    if (this.pos + length > this.end) throw new PbfError("The file is damaged: a block runs past its end.");
    const out = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return out;
  }
  /** The bounds of a length-delimited field without copying it. */
  span(): [number, number] {
    const length = this.varint();
    const start = this.pos;
    if (start + length > this.end) throw new PbfError("The file is damaged: a block runs past its end.");
    this.pos += length;
    return [start, start + length];
  }
  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) {
      // Read the length first: `pos += varint()` would add it to where the length began.
      const length = this.varint();
      this.pos += length;
    } else if (wire === 5) this.pos += 4;
    else throw new PbfError(`The file is damaged: an unknown field type (${wire}).`);
  }
  packed(signed: boolean, delta: boolean): number[] {
    const [start, end] = this.span();
    const inner = new Proto(this.buf, start, end);
    const out: number[] = [];
    let last = 0;
    while (inner.pos < end) {
      const value = signed ? inner.svarint() : inner.varint();
      last = delta ? last + value : value;
      out.push(last);
    }
    return out;
  }
}

export const decoder = new TextDecoder("utf-8");

// ── Blobs ────────────────────────────────────────────────────────────────────

export interface Blob {
  type: string;
  data: Uint8Array;
  /** Bytes of the file read so far, for progress. */
  offset: number;
}

export async function* blobs(filePath: string, signal?: AbortSignal): AsyncGenerator<Blob> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const size = (await handle.stat()).size;
    let offset = 0;
    const read = async (length: number): Promise<Buffer> => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead < length) throw new PbfError("The file ends in the middle of a block: it is incomplete or damaged.");
      offset += length;
      return buffer;
    };
    while (offset < size) {
      signal?.throwIfAborted();
      const headerLength = (await read(4)).readUInt32BE(0);
      if (headerLength === 0 || headerLength > MAX_BLOB_HEADER)
        throw new PbfError("This is not an OpenStreetMap PBF file, or it is damaged.");
      const header = new Proto(await read(headerLength));
      let type = "";
      let dataSize = -1;
      for (let field = header.field(); field; field = header.field()) {
        if (field.no === 1 && field.wire === 2) type = decoder.decode(header.bytes());
        else if (field.no === 3 && field.wire === 0) dataSize = header.varint();
        else header.skip(field.wire);
      }
      if (dataSize < 0 || dataSize > MAX_BLOB) throw new PbfError("This is not an OpenStreetMap PBF file, or it is damaged.");
      const blob = new Proto(await read(dataSize));
      let raw: Uint8Array | null = null;
      let zipped: Uint8Array | null = null;
      let rawSize = 0;
      for (let field = blob.field(); field; field = blob.field()) {
        if (field.no === 1 && field.wire === 2) raw = blob.bytes();
        else if (field.no === 2 && field.wire === 0) rawSize = blob.varint();
        else if (field.no === 3 && field.wire === 2) zipped = blob.bytes();
        else if (field.no >= 4 && field.no <= 7 && field.wire === 2) {
          throw new PbfError("This file is compressed in a way Outpost does not read (only zlib). Geofabrik's extracts are zlib.");
        } else blob.skip(field.wire);
      }
      let data: Uint8Array;
      if (raw) data = raw;
      else if (zipped) {
        if (rawSize > MAX_BLOB) throw new PbfError("A block of the file is larger than the format allows.");
        try {
          data = zlib.inflateSync(zipped, { maxOutputLength: MAX_BLOB });
        } catch {
          throw new PbfError("A block of the file could not be decompressed: it is damaged.");
        }
      } else data = new Uint8Array(0);
      yield { type, data, offset };
    }
  } finally {
    await handle.close();
  }
}

// ── Primitive blocks ─────────────────────────────────────────────────────────

export interface Block {
  strings: string[];
  granularity: number;
  latOffset: number;
  lonOffset: number;
  groups: Array<[number, number]>;
  buf: Uint8Array;
}

export function readBlock(data: Uint8Array): Block {
  const p = new Proto(data);
  const block: Block = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0, groups: [], buf: data };
  for (let field = p.field(); field; field = p.field()) {
    if (field.no === 1 && field.wire === 2) {
      const [start, end] = p.span();
      const table = new Proto(data, start, end);
      for (let f = table.field(); f; f = table.field()) {
        if (f.no === 1 && f.wire === 2) block.strings.push(decoder.decode(table.bytes()));
        else table.skip(f.wire);
      }
    } else if (field.no === 2 && field.wire === 2) block.groups.push(p.span());
    else if (field.no === 17 && field.wire === 0) block.granularity = p.varint();
    else if (field.no === 19 && field.wire === 0) block.latOffset = p.svarint();
    else if (field.no === 20 && field.wire === 0) block.lonOffset = p.svarint();
    else p.skip(field.wire);
  }
  return block;
}

const degrees = (value: number, offset: number, granularity: number) => (offset + granularity * value) * 1e-9;

function tagsOf(strings: string[], keys: number[], values: number[]): Record<string, string> {
  const tags: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += 1) {
    const key = strings[keys[i]!];
    const value = strings[values[i]!];
    if (key !== undefined && value !== undefined) tags[key] = value;
  }
  return tags;
}

/** Calls back for each node in a block (dense or not), with its tags only when asked. */
function eachNode(
  block: Block,
  wantTags: boolean,
  visit: (id: number, lat: number, lon: number, tags: Record<string, string> | null) => void,
): void {
  const { buf, strings, granularity, latOffset, lonOffset } = block;
  for (const [start, end] of block.groups) {
    const group = new Proto(buf, start, end);
    for (let field = group.field(); field; field = group.field()) {
      if (field.no === 2 && field.wire === 2) {
        const [ds, de] = group.span();
        const dense = new Proto(buf, ds, de);
        let ids: number[] = [];
        let lats: number[] = [];
        let lons: number[] = [];
        let keysVals: number[] = [];
        for (let f = dense.field(); f; f = dense.field()) {
          if (f.no === 1 && f.wire === 2) ids = dense.packed(true, true);
          else if (f.no === 8 && f.wire === 2) lats = dense.packed(true, true);
          else if (f.no === 9 && f.wire === 2) lons = dense.packed(true, true);
          else if (f.no === 10 && f.wire === 2 && wantTags) keysVals = dense.packed(false, false);
          else dense.skip(f.wire);
        }
        let k = 0;
        for (let i = 0; i < ids.length; i += 1) {
          let tags: Record<string, string> | null = null;
          if (wantTags && keysVals.length > 0) {
            tags = {};
            while (k < keysVals.length && keysVals[k] !== 0) {
              const key = strings[keysVals[k]!];
              const value = strings[keysVals[k + 1]!];
              if (key !== undefined && value !== undefined) tags[key] = value;
              k += 2;
            }
            k += 1;
          }
          visit(ids[i]!, degrees(lats[i]!, latOffset, granularity), degrees(lons[i]!, lonOffset, granularity), tags);
        }
      } else if (field.no === 1 && field.wire === 2) {
        const [ns, ne] = group.span();
        const node = new Proto(buf, ns, ne);
        let id = 0;
        let lat = 0;
        let lon = 0;
        let keys: number[] = [];
        let values: number[] = [];
        for (let f = node.field(); f; f = node.field()) {
          if (f.no === 1 && f.wire === 0) id = node.svarint();
          else if (f.no === 2 && f.wire === 2) keys = node.packed(false, false);
          else if (f.no === 3 && f.wire === 2) values = node.packed(false, false);
          else if (f.no === 8 && f.wire === 0) lat = node.svarint();
          else if (f.no === 9 && f.wire === 0) lon = node.svarint();
          else node.skip(f.wire);
        }
        visit(
          id,
          degrees(lat, latOffset, granularity),
          degrees(lon, lonOffset, granularity),
          wantTags ? tagsOf(strings, keys, values) : null,
        );
      } else group.skip(field.wire);
    }
  }
}

export function eachWay(block: Block, visit: (id: number, tags: () => Record<string, string>, refs: () => number[]) => void): void {
  const { buf, strings } = block;
  for (const [start, end] of block.groups) {
    const group = new Proto(buf, start, end);
    for (let field = group.field(); field; field = group.field()) {
      if (field.no !== 3 || field.wire !== 2) {
        group.skip(field.wire);
        continue;
      }
      const [ws, we] = group.span();
      const way = new Proto(buf, ws, we);
      let id = 0;
      let keys: number[] = [];
      let values: number[] = [];
      let refsSpan: [number, number] | null = null;
      for (let f = way.field(); f; f = way.field()) {
        if (f.no === 1 && f.wire === 0) id = way.varint();
        else if (f.no === 2 && f.wire === 2) keys = way.packed(false, false);
        else if (f.no === 3 && f.wire === 2) values = way.packed(false, false);
        // Only where the refs are is noted: most ways are not wanted, and their refs are never decoded.
        else if (f.no === 8 && f.wire === 2) refsSpan = way.span();
        else way.skip(f.wire);
      }
      visit(
        id,
        () => tagsOf(strings, keys, values),
        () => {
          if (!refsSpan) return [];
          const refs: number[] = [];
          const inner = new Proto(buf, refsSpan[0], refsSpan[1]);
          let last = 0;
          while (inner.pos < refsSpan[1]) {
            last += inner.svarint();
            refs.push(last);
          }
          return refs;
        },
      );
    }
  }
}

export function eachRelation(
  block: Block,
  visit: (id: number, tags: Record<string, string>, ways: Array<{ ref: number; role: string }>) => void,
): void {
  const { buf, strings } = block;
  for (const [start, end] of block.groups) {
    const group = new Proto(buf, start, end);
    for (let field = group.field(); field; field = group.field()) {
      if (field.no !== 4 || field.wire !== 2) {
        group.skip(field.wire);
        continue;
      }
      const [rs, re] = group.span();
      const relation = new Proto(buf, rs, re);
      let id = 0;
      let keys: number[] = [];
      let values: number[] = [];
      let roles: number[] = [];
      let members: number[] = [];
      let types: number[] = [];
      for (let f = relation.field(); f; f = relation.field()) {
        if (f.no === 1 && f.wire === 0) id = relation.varint();
        else if (f.no === 2 && f.wire === 2) keys = relation.packed(false, false);
        else if (f.no === 3 && f.wire === 2) values = relation.packed(false, false);
        else if (f.no === 8 && f.wire === 2) roles = relation.packed(false, false);
        else if (f.no === 9 && f.wire === 2) members = relation.packed(true, true);
        else if (f.no === 10 && f.wire === 2) types = relation.packed(false, false);
        else relation.skip(f.wire);
      }
      const tags = tagsOf(strings, keys, values);
      const ways: Array<{ ref: number; role: string }> = [];
      for (let i = 0; i < members.length; i += 1) if (types[i] === 1) ways.push({ ref: members[i]!, role: strings[roles[i]!] ?? "" });
      visit(id, tags, ways);
    }
  }
}

// ── Reading a file ───────────────────────────────────────────────────────────

export interface PbfHeader {
  /** The replication timestamp: when the data is from, as the file says. */
  timestamp: string | null;
  bbox: Bbox | null;
}

export function readHeader(data: Uint8Array): PbfHeader {
  const p = new Proto(data);
  const header: PbfHeader = { timestamp: null, bbox: null };
  for (let field = p.field(); field; field = p.field()) {
    if (field.no === 4 && field.wire === 2) {
      const feature = decoder.decode(p.bytes());
      if (!SUPPORTED_FEATURES.has(feature)) throw new PbfError(`This file needs "${feature}", which Outpost does not read.`);
    } else if (field.no === 32 && field.wire === 0) {
      const seconds = p.varint();
      header.timestamp = new Date(seconds * 1000).toISOString();
    } else if (field.no === 1 && field.wire === 2) {
      const [start, end] = p.span();
      const box = new Proto(data, start, end);
      const edges: number[] = [0, 0, 0, 0];
      for (let f = box.field(); f; f = box.field()) {
        if (f.wire === 0 && f.no >= 1 && f.no <= 4) edges[f.no - 1] = box.svarint() * 1e-9;
        else box.skip(f.wire);
      }
      // left, right, top, bottom
      header.bbox = [edges[0]!, edges[3]!, edges[1]!, edges[2]!];
    } else p.skip(field.wire);
  }
  return header;
}

export interface PbfReadOptions {
  /** Whether an object's tags make it wanted. */
  wanted: (tags: Record<string, string>) => boolean;
  onObject: (object: OsmObject) => Promise<void>;
  onSkip: (reason: string) => void;
  onHeader?: (header: PbfHeader) => void;
  progress?: (pass: number, passes: number, bytes: number, total: number) => void;
  signal?: AbortSignal;
}

export async function readPbf(filePath: string, options: PbfReadOptions): Promise<{ header: PbfHeader; objects: number }> {
  const total = (await fs.promises.stat(filePath)).size;
  let header: PbfHeader | null = null;
  const ways = new Map<number, { tags: Record<string, string>; refs: number[] }>();
  const relations = new Map<number, { tags: Record<string, string>; ways: Array<{ ref: number; role: string }> }>();
  let objects = 0;
  let passes = 2;

  // Pass 1.
  let blocks = 0;
  for await (const blob of blobs(filePath, options.signal)) {
    if (blob.type === "OSMHeader") {
      header = readHeader(blob.data);
      options.onHeader?.(header);
      continue;
    }
    if (blob.type !== "OSMData") continue;
    if (!header) throw new PbfError("This is not an OpenStreetMap PBF file: it has no header.");
    const block = readBlock(blob.data);
    const found: OsmObject[] = [];
    eachNode(block, true, (id, lat, lon, tags) => {
      if (tags && Object.keys(tags).length > 0 && options.wanted(tags)) found.push({ type: "node", id, tags, lat, lon });
    });
    for (const object of found) {
      await options.onObject(object);
      objects += 1;
    }
    eachWay(block, (id, tags, refs) => {
      const t = tags();
      if (Object.keys(t).length > 0 && options.wanted(t)) ways.set(id, { tags: t, refs: refs() });
    });
    eachRelation(block, (id, tags, members) => {
      if (options.wanted(tags)) relations.set(id, { tags, ways: members });
    });
    blocks += 1;
    if (blocks % 20 === 0) options.progress?.(1, passes, blob.offset, total);
  }
  if (!header) throw new PbfError("This is not an OpenStreetMap PBF file: it has no header.");

  // Pass 2: the ways that relations are made of.
  const memberWays = new Map<number, number[]>();
  for (const relation of relations.values())
    for (const member of relation.ways) if (member.role !== "inner") memberWays.set(member.ref, []);
  if (memberWays.size > 0) {
    passes = 3;
    for await (const blob of blobs(filePath, options.signal)) {
      if (blob.type !== "OSMData") continue;
      eachWay(readBlock(blob.data), (id, _tags, refs) => {
        if (memberWays.has(id)) memberWays.set(id, refs());
      });
      options.progress?.(2, passes, blob.offset, total);
    }
  }

  // Last pass: the positions of the nodes those ways need.
  const needed = new Set<number>();
  for (const way of ways.values()) for (const ref of way.refs) needed.add(ref);
  for (const refs of memberWays.values()) for (const ref of refs) needed.add(ref);
  const positions = new Map<number, [number, number]>();
  if (needed.size > 0) {
    for await (const blob of blobs(filePath, options.signal)) {
      if (blob.type !== "OSMData") continue;
      eachNode(readBlock(blob.data), false, (id, lat, lon) => {
        if (needed.has(id)) positions.set(id, [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]);
      });
      options.progress?.(passes, passes, blob.offset, total);
    }
  }

  const boxOf = (points: Array<[number, number]>): Bbox => {
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [x, y] of points) {
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
    }
    return [west, south, east, north];
  };

  for (const [id, way] of ways) {
    const points = way.refs.map((ref) => positions.get(ref)).filter((point): point is [number, number] => Boolean(point));
    if (points.length < 2) {
      options.onSkip(`way/${id} is missing the points it is made of (the extract cut it off).`);
      continue;
    }
    const box = boxOf(points);
    await options.onObject({ type: "way", id, tags: way.tags, lat: (box[1] + box[3]) / 2, lon: (box[0] + box[2]) / 2, points, bbox: box });
    objects += 1;
  }
  for (const [id, relation] of relations) {
    const lines = relation.ways
      .filter((member) => member.role !== "inner")
      .map((member) =>
        (memberWays.get(member.ref) ?? []).map((ref) => positions.get(ref)).filter((point): point is [number, number] => Boolean(point)),
      )
      .filter((line) => line.length >= 2);
    if (lines.length === 0) {
      options.onSkip(`relation/${id} has none of its outer ways in the extract.`);
      continue;
    }
    const box = boxOf(lines.flat());
    await options.onObject({
      type: "relation",
      id,
      tags: relation.tags,
      lat: (box[1] + box[3]) / 2,
      lon: (box[0] + box[2]) / 2,
      lines,
      bbox: box,
    });
    objects += 1;
  }
  return { header, objects };
}

/** Whether an object belongs to any reference layer: what the reader is asked to keep. */
export const wantedForLayers = (tags: Record<string, string>) => classifyOsm(tags) !== null;

/**
 * What the reader is asked to keep for some layers: an object of one of them. Food and
 * supplies is looked for only when it is among them, as a country's shops are many.
 */
export function wantedFor(layers: Set<OsmLayer>): (tags: Record<string, string>) => boolean {
  const food = layers.has("food");
  return (tags) => {
    const found = classifyOsm(tags);
    if (found && layers.has(found.layer)) return true;
    return food && classifyFood(tags) !== null;
  };
}
