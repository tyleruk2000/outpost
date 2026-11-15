/**
 * The fixed 127-byte header at the start of every PMTiles v3 archive.
 * Layout: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md#3-header
 */
import { AppError } from "../../../core/errors.ts";

export const HEADER_BYTES = 127;
/** The header and the root directory together must fit in this many bytes. */
export const FIRST_READ_BYTES = 16_384;

export const Compression = { Unknown: 0, None: 1, Gzip: 2, Brotli: 3, Zstd: 4 } as const;
export type Compression = (typeof Compression)[keyof typeof Compression];

export const TileType = { Unknown: 0, Mvt: 1, Png: 2, Jpeg: 3, Webp: 4, Avif: 5 } as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export interface PmtilesHeader {
  rootDirectoryOffset: number;
  rootDirectoryLength: number;
  metadataOffset: number;
  metadataLength: number;
  leafDirectoryOffset: number;
  leafDirectoryLength: number;
  tileDataOffset: number;
  tileDataLength: number;
  /** Tile positions that resolve to something, counting each position of a run. */
  addressedTiles: number;
  tileEntries: number;
  /** Distinct blobs of tile data. */
  tileContents: number;
  /** Tile data is stored in tile-id order, which is what makes range extraction cheap. */
  clustered: boolean;
  internalCompression: number;
  tileCompression: number;
  tileType: number;
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  centerZoom: number;
  centerLon: number;
  centerLat: number;
}

/** Something is wrong with an archive itself; retrying will not help. */
export class PmtilesError extends AppError {
  constructor(message: string) {
    super("unsupported", message);
    this.name = "PmtilesError";
  }
}

const MAGIC = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73]; // "PMTiles"

function readUint64(view: DataView, offset: number): number {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new PmtilesError("This PMTiles archive is damaged: its header holds an impossible size.");
  return Number(value);
}

export function parseHeader(bytes: Uint8Array): PmtilesHeader {
  if (bytes.length < HEADER_BYTES || MAGIC.some((byte, index) => bytes[index] !== byte)) {
    throw new PmtilesError("That file is not a PMTiles archive.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
  const version = view.getUint8(7);
  if (version !== 3) {
    throw new PmtilesError(
      `This is a version ${version} PMTiles archive. Outpost reads version 3; convert it with the pmtiles tool first.`,
    );
  }
  const e7 = (offset: number) => view.getInt32(offset, true) / 1e7;
  return {
    rootDirectoryOffset: readUint64(view, 8),
    rootDirectoryLength: readUint64(view, 16),
    metadataOffset: readUint64(view, 24),
    metadataLength: readUint64(view, 32),
    leafDirectoryOffset: readUint64(view, 40),
    leafDirectoryLength: readUint64(view, 48),
    tileDataOffset: readUint64(view, 56),
    tileDataLength: readUint64(view, 64),
    addressedTiles: readUint64(view, 72),
    tileEntries: readUint64(view, 80),
    tileContents: readUint64(view, 88),
    clustered: view.getUint8(96) === 1,
    internalCompression: view.getUint8(97),
    tileCompression: view.getUint8(98),
    tileType: view.getUint8(99),
    minZoom: view.getUint8(100),
    maxZoom: view.getUint8(101),
    minLon: e7(102),
    minLat: e7(106),
    maxLon: e7(110),
    maxLat: e7(114),
    centerZoom: view.getUint8(118),
    centerLon: e7(119),
    centerLat: e7(123),
  };
}

export function serializeHeader(header: PmtilesHeader): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES);
  const view = new DataView(bytes.buffer);
  bytes.set(MAGIC, 0);
  view.setUint8(7, 3);
  const u64 = (offset: number, value: number) => view.setBigUint64(offset, BigInt(value), true);
  const e7 = (offset: number, degrees: number) => view.setInt32(offset, Math.round(degrees * 1e7), true);
  u64(8, header.rootDirectoryOffset);
  u64(16, header.rootDirectoryLength);
  u64(24, header.metadataOffset);
  u64(32, header.metadataLength);
  u64(40, header.leafDirectoryOffset);
  u64(48, header.leafDirectoryLength);
  u64(56, header.tileDataOffset);
  u64(64, header.tileDataLength);
  u64(72, header.addressedTiles);
  u64(80, header.tileEntries);
  u64(88, header.tileContents);
  view.setUint8(96, header.clustered ? 1 : 0);
  view.setUint8(97, header.internalCompression);
  view.setUint8(98, header.tileCompression);
  view.setUint8(99, header.tileType);
  view.setUint8(100, header.minZoom);
  view.setUint8(101, header.maxZoom);
  e7(102, header.minLon);
  e7(106, header.minLat);
  e7(110, header.maxLon);
  e7(114, header.maxLat);
  view.setUint8(118, header.centerZoom);
  e7(119, header.centerLon);
  e7(123, header.centerLat);
  return bytes;
}

/** What a browser needs to be told about how stored tiles are compressed, if anything. */
export function contentEncodingOf(compression: number): string | undefined {
  if (compression === Compression.Gzip) return "gzip";
  if (compression === Compression.Brotli) return "br";
  if (compression === Compression.Zstd) return "zstd";
  return undefined;
}

export function contentTypeOf(tileType: number): string {
  switch (tileType) {
    case TileType.Mvt:
      return "application/x-protobuf";
    case TileType.Png:
      return "image/png";
    case TileType.Jpeg:
      return "image/jpeg";
    case TileType.Webp:
      return "image/webp";
    case TileType.Avif:
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}
