/**
 * Planning a regional extract from a remote PMTiles archive.
 *
 * A planet archive is far too big to download, but it is laid out so that one region
 * can be cut out of it over HTTP range requests: read the header, the root directory
 * and the few leaf directories that cover the region, and you know exactly which byte
 * ranges hold its tiles. This module does that reading and nothing else. Its result
 * says which bytes to fetch, where they go in the new archive, and how big that
 * archive will be to the byte, which is also the size shown before a download starts.
 *
 * The method follows `pmtiles extract` in protomaps/go-pmtiles, the reference tool.
 */
import { createHash } from "node:crypto";
import type { Bbox } from "@outpost/shared";
import { buildDirectoriesGently, compress, type Directory, DirectoryBuilder, decodeDirectory, decompress } from "./directory.ts";
import { Compression, FIRST_READ_BYTES, HEADER_BYTES, PmtilesError, type PmtilesHeader, parseHeader, serializeHeader } from "./header.ts";
import { bboxToTileRanges, MAX_LATITUDE, type TileRange, zoomBase } from "./tiles.ts";

/**
 * Reads `length` bytes at `offset` of the remote archive. May return fewer only when
 * the archive ends first.
 */
export type RangeReader = (offset: number, length: number, signal?: AbortSignal) => Promise<Uint8Array>;

export interface ExtractRequest {
  bbox: Bbox;
  minZoom: number;
  maxZoom: number;
}

/**
 * A run of tile data: `length` bytes at `src`, an offset into the source file, go to
 * `dst`, an offset into the output's tile section.
 */
export interface CopyRange {
  src: number;
  dst: number;
  length: number;
}

/** One HTTP request for tile data, and the copies (by index) it carries bytes for. */
export interface FetchRange {
  offset: number;
  length: number;
  copyFrom: number;
  copyTo: number;
}

export interface ExtractPlan {
  /** The request as it was made. The zooms the source could actually supply are in `header`. */
  request: ExtractRequest;
  sourceHeader: PmtilesHeader;
  /** Fingerprint of the source's header, to notice a different archive behind the same address. */
  sourceFingerprint: string;
  /** Selected tiles in tile-id order: runs trimmed to the region, offsets still the source's. */
  entries: Directory;
  /** Sorted by `src`. Tile data shared by several tiles appears once. */
  copies: CopyRange[];
  /** Sorted by offset; neighbouring copies are fetched together when the gap is small. */
  requests: FetchRange[];
  /** Header of the archive that will be written. */
  header: PmtilesHeader;
  /** Everything before the tile data in the output: header, root, metadata, leaves. */
  head: Uint8Array;
  outputSize: number;
  tileDataLength: number;
  /** Tile positions covered, counting each position of a run. */
  tileCount: number;
  /** Bytes fetched but thrown away because joining two ranges was cheaper than a request. */
  overfetchBytes: number;
  /** Requests made while planning (header, directories, metadata). */
  planningRequests: number;
}

export interface PlanOptions {
  signal?: AbortSignal;
  /** Share of the tile data that may be fetched needlessly to save requests. */
  overfetch?: number;
  /** Largest single request for tile data. Smaller means finer-grained resuming. */
  maxRequestBytes?: number;
  /** Directory fetches in flight at once. */
  concurrency?: number;
  rootBudget?: number;
  minLeafSize?: number;
}

const DEFAULT_OVERFETCH = 0.05;
const DEFAULT_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
/** Leaf directories closer together than this are fetched in one request. */
const LEAF_GAP_BYTES = 64 * 1024;
const LEAF_GROUP_BYTES = 4 * 1024 * 1024;
const MAX_METADATA_BYTES = 32 * 1024 * 1024;
const MAX_DIRECTORY_DEPTH = 4;

interface LeafPointer {
  offset: number;
  length: number;
  /** Tile ids below this belong to the leaf; ids from here on belong to its successor. */
  upper: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException("Stopped.", "AbortError");
}

async function readExactly(read: RangeReader, offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
  const bytes = await read(offset, length, signal);
  if (bytes.length !== length) {
    throw new PmtilesError("The map source ended sooner than its index says it should. It may be incomplete or still uploading.");
  }
  return bytes;
}

/**
 * Sorts one directory's entries into the plan: tile entries are trimmed to the wanted
 * ranges, leaf pointers are kept when their span of ids touches a wanted range.
 */
function selectEntries(
  directory: Directory,
  wanted: TileRange[],
  upperBound: number,
  selected: DirectoryBuilder,
  leaves: LeafPointer[],
): void {
  let w = 0;
  for (let i = 0; i < directory.count; i += 1) {
    const start = directory.tileIds[i]!;
    const run = directory.runLengths[i]!;
    const end = run === 0 ? (i + 1 < directory.count ? directory.tileIds[i + 1]! : upperBound) : start + run;
    while (w < wanted.length && wanted[w]!.end <= start) w += 1;
    if (w === wanted.length) return;
    if (run === 0) {
      if (wanted[w]!.start < end) leaves.push({ offset: directory.offsets[i]!, length: directory.lengths[i]!, upper: end });
      continue;
    }
    for (let j = w; j < wanted.length && wanted[j]!.start < end; j += 1) {
      const from = Math.max(start, wanted[j]!.start);
      const to = Math.min(end, wanted[j]!.end);
      if (to > from) selected.push(from, to - from, directory.offsets[i]!, directory.lengths[i]!);
    }
  }
}

/** Groups leaf pointers that sit next to each other in the file into single reads. */
function groupLeaves(leaves: LeafPointer[]): LeafPointer[][] {
  const groups: LeafPointer[][] = [];
  let current: LeafPointer[] = [];
  let groupStart = 0;
  let groupEnd = 0;
  for (const leaf of leaves) {
    const fits =
      current.length > 0 &&
      leaf.offset >= groupEnd &&
      leaf.offset - groupEnd <= LEAF_GAP_BYTES &&
      leaf.offset + leaf.length - groupStart <= LEAF_GROUP_BYTES;
    if (!fits) {
      if (current.length > 0) groups.push(current);
      current = [];
      groupStart = leaf.offset;
    }
    current.push(leaf);
    groupEnd = leaf.offset + leaf.length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Entries in tile-id order. Directories are normally read in that order already. */
function sortedByTileId(directory: Directory): Directory {
  let sorted = true;
  for (let i = 1; i < directory.count && sorted; i += 1) sorted = directory.tileIds[i - 1]! < directory.tileIds[i]!;
  if (sorted) return directory;
  // Only a root that mixes tiles and leaf pointers gets here; no known writer makes one.
  const order = new Uint32Array(directory.count);
  for (let i = 0; i < directory.count; i += 1) order[i] = i;
  order.sort((a, b) => directory.tileIds[a]! - directory.tileIds[b]!);
  const builder = new DirectoryBuilder(directory.count);
  for (const i of order) builder.push(directory.tileIds[i]!, directory.runLengths[i]!, directory.offsets[i]!, directory.lengths[i]!);
  return builder.finish();
}

/**
 * Gives every distinct blob of tile data a place in the output, in the order the tiles
 * first use it, which keeps the output clustered. Returns the entries pointing at
 * their new offsets and the list of source runs to copy.
 *
 * Tiles that share bytes (open sea, mostly) are found by sorting on the source offset
 * rather than with a hash map: for millions of entries the map alone would need more
 * memory than the columns do.
 */
function relocate(selected: Directory): {
  output: Directory;
  copies: CopyRange[];
  tileDataLength: number;
  tileContents: number;
  tileCount: number;
} {
  const count = selected.count;
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) order[i] = i;
  order.sort((a, b) => selected.offsets[a]! - selected.offsets[b]! || selected.lengths[a]! - selected.lengths[b]! || a - b);

  // owner[i] is the first entry (in tile order) that uses the same bytes as entry i.
  const owner = new Uint32Array(count);
  for (let k = 0; k < count; k += 1) {
    const index = order[k]!;
    const previous = k > 0 ? order[k - 1]! : -1;
    const same =
      previous >= 0 && selected.offsets[previous] === selected.offsets[index] && selected.lengths[previous] === selected.lengths[index];
    owner[index] = same ? owner[previous]! : index;
  }

  const offsets = new Float64Array(count);
  const copies: CopyRange[] = [];
  let position = 0;
  let tileContents = 0;
  let tileCount = 0;
  for (let i = 0; i < count; i += 1) {
    tileCount += selected.runLengths[i]!;
    if (owner[i] !== i) continue;
    const src = selected.offsets[i]!;
    const length = selected.lengths[i]!;
    offsets[i] = position;
    const last = copies[copies.length - 1];
    if (last && last.src + last.length === src) last.length += length;
    else copies.push({ src, dst: position, length });
    position += length;
    tileContents += 1;
  }
  for (let i = 0; i < count; i += 1) offsets[i] = offsets[owner[i]!]!;

  copies.sort((a, b) => a.src - b.src);
  return {
    output: { count, tileIds: selected.tileIds, runLengths: selected.runLengths, lengths: selected.lengths, offsets },
    copies,
    tileDataLength: position,
    tileContents,
    tileCount,
  };
}

/**
 * Turns the copies into HTTP requests. Copies separated by a small gap are fetched in
 * one request and the gap thrown away, smallest gaps first, until `overfetch` of the
 * tile data has been spent that way. The results are then cut into pieces no bigger
 * than `maxRequestBytes` so an interrupted download loses little.
 */
export function planRequests(
  copies: CopyRange[],
  overfetch: number,
  maxRequestBytes: number,
): { requests: FetchRange[]; overfetchBytes: number } {
  if (copies.length === 0) return { requests: [], overfetchBytes: 0 };
  let total = 0;
  const gaps: Array<{ after: number; size: number }> = [];
  for (let i = 0; i < copies.length; i += 1) {
    total += copies[i]!.length;
    if (i > 0) gaps.push({ after: i - 1, size: copies[i]!.src - (copies[i - 1]!.src + copies[i - 1]!.length) });
  }
  // A negative gap means two copies overlap in the source; they must travel together.
  const joined = new Uint8Array(copies.length);
  let budget = total * overfetch;
  let overfetchBytes = 0;
  gaps.sort((a, b) => a.size - b.size);
  for (const gap of gaps) {
    if (gap.size > 0 && gap.size > budget) break;
    joined[gap.after] = 1;
    if (gap.size > 0) {
      budget -= gap.size;
      overfetchBytes += gap.size;
    }
  }

  const requests: FetchRange[] = [];
  let first = 0;
  while (first < copies.length) {
    let last = first;
    let end = copies[first]!.src + copies[first]!.length;
    while (joined[last] === 1 && last + 1 < copies.length) {
      last += 1;
      end = Math.max(end, copies[last]!.src + copies[last]!.length);
    }
    const start = copies[first]!.src;
    let scanFrom = first;
    for (let offset = start; offset < end; offset += maxRequestBytes) {
      const length = Math.min(maxRequestBytes, end - offset);
      // Narrow the group's copies to those that have bytes in this piece.
      while (scanFrom < last && copies[scanFrom]!.src + copies[scanFrom]!.length <= offset) scanFrom += 1;
      let scanTo = scanFrom;
      while (scanTo < last && copies[scanTo + 1]!.src < offset + length) scanTo += 1;
      requests.push({ offset, length, copyFrom: scanFrom, copyTo: scanTo + 1 });
    }
    first = last + 1;
  }
  return { requests, overfetchBytes };
}

function clampBbox(bbox: Bbox, header: PmtilesHeader): Bbox {
  let [west, south, east, north] = bbox;
  south = Math.max(south, -MAX_LATITUDE);
  north = Math.min(north, MAX_LATITUDE);
  // Sources that do not record real bounds leave them at zero.
  const sourceHasBounds = header.maxLon > header.minLon && header.maxLat > header.minLat;
  if (sourceHasBounds && west <= east) {
    west = Math.max(west, header.minLon);
    east = Math.min(east, header.maxLon);
    south = Math.max(south, header.minLat);
    north = Math.min(north, header.maxLat);
  }
  return [west, south, east, north];
}

/** A zoom at which the whole box is roughly one screen wide: a sensible first view. */
function centerZoomFor(bbox: Bbox, minZoom: number, maxZoom: number): number {
  const width = Math.max(1e-6, bbox[2] - bbox[0]);
  const zoom = Math.floor(Math.log2(360 / width)) + 1;
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

export async function planExtract(read: RangeReader, request: ExtractRequest, options: PlanOptions = {}): Promise<ExtractPlan> {
  const { signal } = options;
  let planningRequests = 0;
  // The header and, by the format's rules, the root directory are in the first 16 KB.
  throwIfAborted(signal);
  planningRequests += 1;
  const first = await read(0, FIRST_READ_BYTES, signal);
  const source = parseHeader(first);
  if (!source.clustered) {
    throw new PmtilesError(
      "This map source is not stored in tile order (it is not “clustered”), so a region cannot be cut out of it. Download the whole file and import it instead.",
    );
  }
  const minZoom = Math.max(request.minZoom, source.minZoom);
  const maxZoom = Math.min(request.maxZoom, source.maxZoom);
  if (minZoom > maxZoom) {
    throw new PmtilesError(
      `This map source only has zoom levels ${source.minZoom}–${source.maxZoom}, which does not include the levels asked for.`,
    );
  }
  const wanted = bboxToTileRanges(request.bbox, minZoom, maxZoom);

  const section = async (offset: number, length: number): Promise<Uint8Array> => {
    if (offset + length <= first.length) return first.subarray(offset, offset + length);
    planningRequests += 1;
    throwIfAborted(signal);
    return readExactly(read, offset, length, signal);
  };

  const selected = new DirectoryBuilder(4096);
  const upperBound = zoomBase(maxZoom + 1);

  // Leaves hold the tile entries in tile order, so they are read in order too; only
  // the fetching runs ahead, a few requests at a time.
  const walk = async (leaves: LeafPointer[], depth: number): Promise<void> => {
    if (depth > MAX_DIRECTORY_DEPTH) throw new PmtilesError("This PMTiles archive nests its index deeper than the format allows.");
    const groups = groupLeaves(leaves);
    const concurrency = Math.max(1, options.concurrency ?? 4);
    for (let at = 0; at < groups.length; at += concurrency) {
      const batch = groups.slice(at, at + concurrency);
      const buffers = await Promise.all(
        batch.map((group) => {
          const start = group[0]!.offset;
          const last = group[group.length - 1]!;
          planningRequests += 1;
          throwIfAborted(signal);
          return readExactly(read, source.leafDirectoryOffset + start, last.offset + last.length - start, signal);
        }),
      );
      for (const [index, group] of batch.entries()) {
        const start = group[0]!.offset;
        for (const leaf of group) {
          const packed = buffers[index]!.subarray(leaf.offset - start, leaf.offset - start + leaf.length);
          const nested: LeafPointer[] = [];
          selectEntries(decodeDirectory(decompress(packed, source.internalCompression)), wanted, leaf.upper, selected, nested);
          if (nested.length > 0) await walk(nested, depth + 1);
        }
      }
    }
  };

  const rootLeaves: LeafPointer[] = [];
  const root = decodeDirectory(
    decompress(await section(source.rootDirectoryOffset, source.rootDirectoryLength), source.internalCompression),
  );
  selectEntries(root, wanted, upperBound, selected, rootLeaves);
  await walk(rootLeaves, 1);

  const entries = sortedByTileId(selected.finish());
  if (entries.count === 0) {
    throw new PmtilesError("The map source has no tiles for that area at those zoom levels.");
  }

  const { output, copies, tileDataLength, tileContents, tileCount } = relocate(entries);
  // Directory offsets count from the start of the tile section; requests need file offsets.
  for (const copy of copies) copy.src += source.tileDataOffset;
  const { requests, overfetchBytes } = planRequests(
    copies,
    options.overfetch ?? DEFAULT_OVERFETCH,
    options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
  );

  // The metadata (layer names, attribution) is carried over as it is, re-packed only
  // if the source used something other than gzip for its own bookkeeping.
  if (source.metadataLength > MAX_METADATA_BYTES) throw new PmtilesError("This map source's description is unreasonably large.");
  let metadata: Uint8Array =
    source.metadataLength > 0 ? await section(source.metadataOffset, source.metadataLength) : compress(Buffer.from("{}"), Compression.Gzip);
  if (source.metadataLength > 0 && source.internalCompression !== Compression.Gzip) {
    metadata = compress(decompress(metadata, source.internalCompression), Compression.Gzip);
  }

  const directories = await buildDirectoriesGently(output, { rootBudget: options.rootBudget, minLeafSize: options.minLeafSize });
  const bounds = clampBbox(request.bbox, source);
  const rootOffset = HEADER_BYTES;
  const metadataOffset = rootOffset + directories.root.length;
  const leafOffset = metadataOffset + metadata.length;
  const tileDataOffset = leafOffset + directories.leaves.length;
  const header: PmtilesHeader = {
    rootDirectoryOffset: rootOffset,
    rootDirectoryLength: directories.root.length,
    metadataOffset,
    metadataLength: metadata.length,
    leafDirectoryOffset: leafOffset,
    leafDirectoryLength: directories.leaves.length,
    tileDataOffset,
    tileDataLength,
    addressedTiles: tileCount,
    tileEntries: entries.count,
    tileContents,
    clustered: true,
    internalCompression: Compression.Gzip,
    tileCompression: source.tileCompression,
    tileType: source.tileType,
    minZoom,
    maxZoom,
    minLon: bounds[0],
    minLat: bounds[1],
    maxLon: bounds[2],
    maxLat: bounds[3],
    centerZoom: centerZoomFor(bounds, minZoom, maxZoom),
    centerLon: (bounds[0] + bounds[2]) / 2,
    centerLat: (bounds[1] + bounds[3]) / 2,
  };
  const head = Buffer.concat([serializeHeader(header), directories.root, metadata, directories.leaves], tileDataOffset);

  return {
    request: { bbox: request.bbox, minZoom: request.minZoom, maxZoom: request.maxZoom },
    sourceHeader: source,
    sourceFingerprint: createHash("sha256").update(first.subarray(0, HEADER_BYTES)).digest("hex"),
    entries,
    copies,
    requests,
    header,
    head,
    outputSize: tileDataOffset + tileDataLength,
    tileDataLength,
    tileCount,
    overfetchBytes,
    planningRequests,
  };
}
