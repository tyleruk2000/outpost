/**
 * PMTiles directories: the index from tile id to where a tile's bytes are.
 *
 * A directory is a list of entries sorted by tile id. An entry with a run length of n
 * says "the n tiles starting at this id all share these bytes"; a run length of 0
 * makes the entry a pointer to a leaf directory instead. On disk a directory is
 * stored column by column as varints (id deltas, run lengths, lengths, offsets) and
 * then compressed.
 *
 * Directories are held as typed-array columns, not as arrays of objects: an extract of
 * a country has millions of entries, and at 24 bytes each instead of a hundred or more
 * that is the difference between fitting in a small computer's memory and not.
 */

import zlib from "node:zlib";
import { yieldToEventLoop } from "../../../core/event-loop.ts";
import { Compression, FIRST_READ_BYTES, HEADER_BYTES, PmtilesError } from "./header.ts";

export interface Directory {
  count: number;
  tileIds: Float64Array;
  runLengths: Uint32Array;
  lengths: Uint32Array;
  offsets: Float64Array;
}

export interface Entry {
  tileId: number;
  runLength: number;
  offset: number;
  length: number;
}

/** Bytes the root directory may take: the first read minus the header. */
export const ROOT_BUDGET_BYTES = FIRST_READ_BYTES - HEADER_BYTES;

/** Refuse to inflate a directory or metadata block beyond this; real ones are far smaller. */
const MAX_INFLATED_BYTES = 512 * 1024 * 1024;

// ── Growable columns ────────────────────────────────────────────────────────

/** Collects entries one at a time without knowing how many there will be. */
export class DirectoryBuilder {
  private capacity: number;
  private tileIds: Float64Array;
  private runLengths: Uint32Array;
  private lengths: Uint32Array;
  private offsets: Float64Array;
  count = 0;

  constructor(initialCapacity = 1024) {
    this.capacity = Math.max(16, initialCapacity);
    this.tileIds = new Float64Array(this.capacity);
    this.runLengths = new Uint32Array(this.capacity);
    this.lengths = new Uint32Array(this.capacity);
    this.offsets = new Float64Array(this.capacity);
  }

  push(tileId: number, runLength: number, offset: number, length: number): void {
    if (this.count === this.capacity) this.grow();
    this.tileIds[this.count] = tileId;
    this.runLengths[this.count] = runLength;
    this.offsets[this.count] = offset;
    this.lengths[this.count] = length;
    this.count += 1;
  }

  private grow(): void {
    this.capacity *= 2;
    const widen = <T extends Float64Array | Uint32Array>(source: T): T => {
      const next = new (source.constructor as new (length: number) => T)(this.capacity);
      next.set(source);
      return next;
    };
    this.tileIds = widen(this.tileIds);
    this.runLengths = widen(this.runLengths);
    this.lengths = widen(this.lengths);
    this.offsets = widen(this.offsets);
  }

  /** The collected entries. The builder must not be used afterwards. */
  finish(): Directory {
    return {
      count: this.count,
      tileIds: this.tileIds.subarray(0, this.count),
      runLengths: this.runLengths.subarray(0, this.count),
      lengths: this.lengths.subarray(0, this.count),
      offsets: this.offsets.subarray(0, this.count),
    };
  }
}

export function directoryFromEntries(entries: Entry[]): Directory {
  const builder = new DirectoryBuilder(entries.length);
  for (const entry of entries) builder.push(entry.tileId, entry.runLength, entry.offset, entry.length);
  return builder.finish();
}

export function entriesOf(directory: Directory): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < directory.count; i += 1) {
    entries.push({
      tileId: directory.tileIds[i]!,
      runLength: directory.runLengths[i]!,
      offset: directory.offsets[i]!,
      length: directory.lengths[i]!,
    });
  }
  return entries;
}

/** Index of the last entry whose tile id is at or before `tileId`, or -1. */
export function findEntryIndex(directory: Directory, tileId: number): number {
  let low = 0;
  let high = directory.count - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (directory.tileIds[middle]! <= tileId) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

// ── Varints ─────────────────────────────────────────────────────────────────

/** Writes `value` as a base-128 varint at `position`; returns the position after it. */
export function writeVarint(target: Uint8Array, position: number, value: number): number {
  let rest = value;
  let at = position;
  while (rest >= 0x80) {
    target[at] = (rest % 0x80) | 0x80;
    at += 1;
    rest = Math.floor(rest / 0x80);
  }
  target[at] = rest;
  return at + 1;
}

interface Cursor {
  bytes: Uint8Array;
  position: number;
}

function readVarint(cursor: Cursor): number {
  let value = 0;
  let scale = 1;
  for (let read = 0; read < 8; read += 1) {
    if (cursor.position >= cursor.bytes.length) break;
    const byte = cursor.bytes[cursor.position]!;
    cursor.position += 1;
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) return value;
    scale *= 0x80;
  }
  throw new PmtilesError("This PMTiles archive is damaged: a directory could not be read.");
}

// ── Compression ─────────────────────────────────────────────────────────────

export function compress(bytes: Uint8Array, compression: number): Uint8Array {
  if (compression === Compression.None) return bytes;
  if (compression === Compression.Gzip) return zlib.gzipSync(bytes, { level: 9 });
  throw new PmtilesError("Outpost writes PMTiles directories with gzip only.");
}

export function decompress(bytes: Uint8Array, compression: number): Uint8Array {
  const options = { maxOutputLength: MAX_INFLATED_BYTES };
  try {
    switch (compression) {
      case Compression.None:
        return bytes;
      case Compression.Gzip:
        return zlib.gunzipSync(bytes, options);
      case Compression.Brotli:
        return zlib.brotliDecompressSync(bytes, options);
      case Compression.Zstd:
        return zlib.zstdDecompressSync(bytes, options);
      default:
        throw new PmtilesError("This PMTiles archive uses a kind of compression Outpost does not know.");
    }
  } catch (error) {
    if (error instanceof PmtilesError) throw error;
    throw new PmtilesError("This PMTiles archive is damaged: part of its index could not be unpacked.");
  }
}

// ── Reading and writing directories ─────────────────────────────────────────

/** Entries `from` (inclusive) to `to` (exclusive) in the wire format, before compression. */
export function encodeDirectory(directory: Directory, from = 0, to = directory.count): Uint8Array {
  const count = to - from;
  // A varint here is at most 8 bytes (53 bits); lengths and run lengths at most 5.
  const out = new Uint8Array(10 + count * 26);
  let at = writeVarint(out, 0, count);
  let previousId = 0;
  for (let i = from; i < to; i += 1) {
    const id = directory.tileIds[i]!;
    at = writeVarint(out, at, id - previousId);
    previousId = id;
  }
  for (let i = from; i < to; i += 1) at = writeVarint(out, at, directory.runLengths[i]!);
  for (let i = from; i < to; i += 1) at = writeVarint(out, at, directory.lengths[i]!);
  for (let i = from; i < to; i += 1) {
    const offset = directory.offsets[i]!;
    // 0 means "starts where the previous entry ended", which is the common case and
    // compresses to almost nothing; anything else is stored as offset + 1.
    const contiguous = i > from && offset === directory.offsets[i - 1]! + directory.lengths[i - 1]!;
    at = writeVarint(out, at, contiguous ? 0 : offset + 1);
  }
  return out.subarray(0, at);
}

export function decodeDirectory(bytes: Uint8Array): Directory {
  const cursor: Cursor = { bytes, position: 0 };
  const count = readVarint(cursor);
  // Every entry takes at least four bytes, one per column.
  if (count * 4 > bytes.length) throw new PmtilesError("This PMTiles archive is damaged: a directory is cut short.");
  const tileIds = new Float64Array(count);
  const runLengths = new Uint32Array(count);
  const lengths = new Uint32Array(count);
  const offsets = new Float64Array(count);
  let id = 0;
  for (let i = 0; i < count; i += 1) {
    id += readVarint(cursor);
    tileIds[i] = id;
  }
  for (let i = 0; i < count; i += 1) runLengths[i] = readVarint(cursor);
  for (let i = 0; i < count; i += 1) lengths[i] = readVarint(cursor);
  for (let i = 0; i < count; i += 1) {
    const value = readVarint(cursor);
    offsets[i] = value === 0 && i > 0 ? offsets[i - 1]! + lengths[i - 1]! : value - 1;
  }
  return { count, tileIds, runLengths, lengths, offsets };
}

export function serializeDirectory(
  directory: Directory,
  compression: number = Compression.Gzip,
  from = 0,
  to = directory.count,
): Uint8Array {
  return compress(encodeDirectory(directory, from, to), compression);
}

export function deserializeDirectory(bytes: Uint8Array, compression: number): Directory {
  return decodeDirectory(decompress(bytes, compression));
}

export interface BuiltDirectories {
  root: Uint8Array;
  /** Leaf directories back to back; empty when everything fits in the root. */
  leaves: Uint8Array;
  leafCount: number;
}

export interface BuildOptions {
  compression?: number;
  /** Largest root directory allowed, in bytes. */
  rootBudget?: number;
  /** Fewest entries per leaf to start with. */
  minLeafSize?: number;
}

/**
 * Lays entries out as a root directory and, if they do not fit in the root's budget,
 * one level of leaf directories. Mirrors the reference writer (go-pmtiles): try the
 * whole list in the root first; otherwise make the root a list of leaf pointers and
 * grow the leaves until the root fits.
 *
 * Written as a generator that pauses after each leaf, so that the caller decides
 * whether to run it straight through or to let other work in between.
 */
function* layOut(entries: Directory, options: BuildOptions): Generator<undefined, BuiltDirectories> {
  const compression = options.compression ?? Compression.Gzip;
  const rootBudget = options.rootBudget ?? ROOT_BUDGET_BYTES;
  const minLeafSize = Math.max(1, options.minLeafSize ?? 4096);

  if (entries.count < 16_384) {
    const root = serializeDirectory(entries, compression);
    if (root.length <= rootBudget) return { root, leaves: new Uint8Array(0), leafCount: 0 };
  }

  let leafSize = Math.max(Math.floor(entries.count / 3500), minLeafSize);
  for (;;) {
    const pointers = new DirectoryBuilder(Math.ceil(entries.count / leafSize));
    const leaves: Uint8Array[] = [];
    let leavesLength = 0;
    for (let from = 0; from < entries.count; from += leafSize) {
      const leaf = serializeDirectory(entries, compression, from, Math.min(entries.count, from + leafSize));
      pointers.push(entries.tileIds[from]!, 0, leavesLength, leaf.length);
      leaves.push(leaf);
      leavesLength += leaf.length;
      yield;
    }
    const root = serializeDirectory(pointers.finish(), compression);
    if (root.length <= rootBudget) return { root, leaves: Buffer.concat(leaves, leavesLength), leafCount: leaves.length };
    if (leafSize >= entries.count) {
      throw new PmtilesError("The index of this extract does not fit the space PMTiles allows for it.");
    }
    leafSize = Math.ceil(leafSize * 1.2);
  }
}

export function buildDirectories(entries: Directory, options: BuildOptions = {}): BuiltDirectories {
  const steps = layOut(entries, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * The same, giving way to the event loop every few leaves. Compressing the index of a
 * whole country takes a second or two; a server should keep answering meanwhile.
 */
export async function buildDirectoriesGently(entries: Directory, options: BuildOptions = {}): Promise<BuiltDirectories> {
  const steps = layOut(entries, options);
  for (let leaves = 1; ; leaves += 1) {
    const step = steps.next();
    if (step.done) return step.value;
    if (leaves % 8 === 0) await yieldToEventLoop();
  }
}
