/**
 * Reading part of a Cloud-Optimised GeoTIFF without reading all of it.
 *
 * A COG is an ordinary tiled TIFF laid out so that its directories come first: one
 * read at the start of the file says where every tile of the picture is, and the tiles
 * for an area can then be fetched by themselves, by byte range. That is what lets a
 * small area be had from a 110 km Sentinel-2 scene for a few megabytes.
 *
 * Only what Sentinel-2's published COGs, NASA's Blue Marble GeoTIFFs and the test
 * fixtures use is read: classic TIFF or BigTIFF, either byte order, tiled or in strips
 * (a strip is read as a tile as wide as the picture), one sample per pixel or several
 * interleaved, 8 or 16 bits unsigned, no compression or Deflate, with or without the
 * horizontal-differencing predictor, and 8-bit colour compressed as WebP (as GDAL writes
 * it, compression 50001). Anything else is refused with a plain message
 * rather than guessed at. The georeferencing is the pixel scale and tie point (a
 * north-up grid) and the projected EPSG code from the GeoKey directory.
 *
 * Bytes come from a `ByteSource`, so the same code reads a file on disk in tests and a
 * remote file by HTTP range requests in use.
 */
import zlib from "node:zlib";
import { decodeWebpSync, loadWebpDecoder } from "./webp.ts";

/** TIFF compression code GDAL uses for WebP. */
const WEBP_COMPRESSION = 50001;

/** A WebP-compressed tile as interleaved samples: RGB, or RGBA when the image has four. */
function webpTile(bytes: Uint8Array, image: CogImage): Uint8Array {
  let decoded: { data: Uint8ClampedArray; width: number; height: number };
  try {
    decoded = decodeWebpSync(bytes);
  } catch {
    throw new CogError("A tile of this GeoTIFF could not be decompressed.");
  }
  if (decoded.width !== image.tileWidth || decoded.height !== image.tileHeight) {
    throw new CogError("A tile of this GeoTIFF is not the size its directory says.");
  }
  const count = image.tileWidth * image.tileHeight;
  if (image.samplesPerPixel === 4) return new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, count * 4).slice();
  const out = new Uint8Array(count * 3);
  for (let i = 0, j = 0; i < count; i += 1, j += 4) {
    out[i * 3] = decoded.data[j]!;
    out[i * 3 + 1] = decoded.data[j + 1]!;
    out[i * 3 + 2] = decoded.data[j + 2]!;
  }
  return out;
}

export interface ByteSource {
  /** Exactly `length` bytes from `offset`, or fewer only at the end of the file. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

export class CogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CogError";
  }
}

/** How much is read at first; GDAL writes every directory of a COG well within this. */
export const COG_HEADER_BYTES = 65_536;

const TAG = {
  NewSubfileType: 254,
  ImageWidth: 256,
  ImageLength: 257,
  BitsPerSample: 258,
  Compression: 259,
  SamplesPerPixel: 277,
  PlanarConfiguration: 284,
  Predictor: 317,
  TileWidth: 322,
  TileLength: 323,
  StripOffsets: 273,
  RowsPerStrip: 278,
  StripByteCounts: 279,
  TileOffsets: 324,
  TileByteCounts: 325,
  ExtraSamples: 338,
  SampleFormat: 339,
  ModelPixelScale: 33550,
  ModelTiepoint: 33922,
  GeoKeyDirectory: 34735,
  GdalNodata: 42113,
} as const;

/** Bytes per value of each TIFF field type. */
const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  16: 8,
  17: 8,
  18: 8,
};

interface RawField {
  type: number;
  count: number;
  /** Where the values are: inside the entry, or elsewhere in the file. */
  inline: Uint8Array | null;
  offset: number;
}

export interface CogImage {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  bitsPerSample: number;
  samplesPerPixel: number;
  compression: number;
  predictor: number;
  tileOffsets: number[];
  tileByteCounts: number[];
  /** True for a reduced-resolution copy (an overview). */
  overview: boolean;
  /** True when the last sample is transparency (ExtraSamples 1 or 2), not another colour or band. */
  alpha: boolean;
}

export interface Georeference {
  /** Projected coordinates of the top-left corner of the top-left pixel. */
  originX: number;
  originY: number;
  /** Size of a pixel of the full-resolution image, in the projection's units. */
  pixelWidth: number;
  pixelHeight: number;
  epsg: number | null;
  nodata: number | null;
}

/** A window of one image: `width` × `height` pixels, samples interleaved. */
export interface Window {
  x: number;
  y: number;
  width: number;
  height: number;
  samples: number;
  data: Uint8Array | Uint16Array;
}

/** One tile of the file to be fetched: which image, which tile, and where its bytes are. */
export interface TileRef {
  image: number;
  index: number;
  offset: number;
  length: number;
}

class Reader {
  readonly little: boolean;
  constructor(little: boolean) {
    this.little = little;
  }
  u16(bytes: Uint8Array, at: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset + at, 2).getUint16(0, this.little);
  }
  u32(bytes: Uint8Array, at: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, this.little);
  }
  u64(bytes: Uint8Array, at: number): number {
    const value = new DataView(bytes.buffer, bytes.byteOffset + at, 8).getBigUint64(0, this.little);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new CogError("This GeoTIFF holds an impossible size.");
    return Number(value);
  }
  value(bytes: Uint8Array, at: number, type: number): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, TYPE_SIZE[type] ?? 1);
    switch (type) {
      case 1:
      case 2:
      case 7:
        return view.getUint8(0);
      case 6:
        return view.getInt8(0);
      case 3:
        return view.getUint16(0, this.little);
      case 8:
        return view.getInt16(0, this.little);
      case 4:
        return view.getUint32(0, this.little);
      case 9:
        return view.getInt32(0, this.little);
      case 11:
        return view.getFloat32(0, this.little);
      case 12:
        return view.getFloat64(0, this.little);
      case 16:
      case 18:
        return this.u64(bytes, at);
      case 5:
        return view.getUint32(0, this.little) / view.getUint32(4, this.little);
      default:
        throw new CogError(`This GeoTIFF uses a field type (${type}) Outpost does not read.`);
    }
  }
}

export class Cog {
  readonly images: CogImage[];
  readonly geo: Georeference;
  private readonly reader: Reader;

  private constructor(reader: Reader, images: CogImage[], geo: Georeference) {
    this.reader = reader;
    this.images = images;
    this.geo = geo;
  }

  /** Reads the directories of a COG. `head` may be passed if the first bytes were already read. */
  static async open(source: ByteSource, head?: Uint8Array): Promise<Cog> {
    const start = head ?? (await source.read(0, COG_HEADER_BYTES));
    const readAt = async (offset: number, length: number): Promise<Uint8Array> => {
      if (offset + length <= start.length) return start.subarray(offset, offset + length);
      const bytes = await source.read(offset, length);
      if (bytes.length < length) throw new CogError("This GeoTIFF is shorter than its own directory says.");
      return bytes;
    };
    if (start.length < 16) throw new CogError("That is not a GeoTIFF: it is too short.");
    const order = String.fromCharCode(start[0]!, start[1]!);
    if (order !== "II" && order !== "MM") throw new CogError("That is not a GeoTIFF.");
    const reader = new Reader(order === "II");
    const version = reader.u16(start, 2);
    const big = version === 43;
    if (version !== 42 && !big) throw new CogError("That is not a GeoTIFF.");
    let ifdOffset = big ? reader.u64(start, 8) : reader.u32(start, 4);

    const entrySize = big ? 20 : 12;
    const countSize = big ? 8 : 2;
    const pointerSize = big ? 8 : 4;
    const ifds: Array<Map<number, RawField>> = [];
    const visited = new Set<number>();
    while (ifdOffset !== 0) {
      if (visited.has(ifdOffset) || ifds.length > 64) throw new CogError("This GeoTIFF's directories run in a loop.");
      visited.add(ifdOffset);
      const countBytes = await readAt(ifdOffset, countSize);
      const count = big ? reader.u64(countBytes, 0) : reader.u16(countBytes, 0);
      if (count > 4096) throw new CogError("This GeoTIFF's directory is damaged.");
      const body = await readAt(ifdOffset + countSize, count * entrySize + pointerSize);
      const fields = new Map<number, RawField>();
      for (let i = 0; i < count; i += 1) {
        const at = i * entrySize;
        const tag = reader.u16(body, at);
        const type = reader.u16(body, at + 2);
        const n = big ? reader.u64(body, at + 4) : reader.u32(body, at + 4);
        const valueAt = at + (big ? 12 : 8);
        const size = (TYPE_SIZE[type] ?? 1) * n;
        const inline = size <= pointerSize ? body.subarray(valueAt, valueAt + size) : null;
        const offset = inline ? 0 : big ? reader.u64(body, valueAt) : reader.u32(body, valueAt);
        fields.set(tag, { type, count: n, inline, offset });
      }
      ifds.push(fields);
      const nextAt = count * entrySize;
      ifdOffset = big ? reader.u64(body, nextAt) : reader.u32(body, nextAt);
    }

    const values = async (fields: Map<number, RawField>, tag: number): Promise<number[] | undefined> => {
      const field = fields.get(tag);
      if (!field) return undefined;
      const size = TYPE_SIZE[field.type] ?? 1;
      const bytes = field.inline ?? (await readAt(field.offset, size * field.count));
      const out: number[] = new Array(field.count);
      for (let i = 0; i < field.count; i += 1) out[i] = reader.value(bytes, i * size, field.type);
      return out;
    };
    const text = async (fields: Map<number, RawField>, tag: number): Promise<string | undefined> => {
      const field = fields.get(tag);
      if (!field) return undefined;
      const bytes = field.inline ?? (await readAt(field.offset, field.count));
      return Buffer.from(bytes).toString("latin1").replace(/\0+$/, "");
    };

    const images: CogImage[] = [];
    for (const fields of ifds) {
      const one = async (tag: number, fallback?: number): Promise<number> => {
        const found = (await values(fields, tag))?.[0] ?? fallback;
        if (found === undefined) throw new CogError("This GeoTIFF is missing something every image needs.");
        return found;
      };
      const subfile = await one(TAG.NewSubfileType, 0);
      // Masks (bit 4) are not pictures; skip them.
      if (subfile & 4) continue;
      // A strip is read as a tile as wide as the image: Blue Marble's GeoTIFFs are one row to a strip.
      const width = await one(TAG.ImageWidth);
      const height = await one(TAG.ImageLength);
      const tiled = fields.has(TAG.TileOffsets);
      const tileOffsets = await values(fields, tiled ? TAG.TileOffsets : TAG.StripOffsets);
      const tileByteCounts = await values(fields, tiled ? TAG.TileByteCounts : TAG.StripByteCounts);
      if (!tileOffsets || !tileByteCounts) throw new CogError("This GeoTIFF does not say where its picture is.");
      const tileWidth = tiled ? await one(TAG.TileWidth) : width;
      const tileHeight = tiled ? await one(TAG.TileLength) : Math.min(height, await one(TAG.RowsPerStrip, height));
      const bits = (await values(fields, TAG.BitsPerSample)) ?? [1];
      const sampleFormat = await one(TAG.SampleFormat, 1);
      const planar = await one(TAG.PlanarConfiguration, 1);
      const samplesPerPixel = await one(TAG.SamplesPerPixel, 1);
      const compression = await one(TAG.Compression, 1);
      const predictor = await one(TAG.Predictor, 1);
      const extra = (await values(fields, TAG.ExtraSamples)) ?? [];
      if (sampleFormat !== 1 || !bits.every((bit) => bit === bits[0]) || (bits[0] !== 8 && bits[0] !== 16)) {
        throw new CogError("This GeoTIFF holds values Outpost does not read (only 8- and 16-bit unsigned whole numbers).");
      }
      if (planar !== 1 && samplesPerPixel > 1)
        throw new CogError("This GeoTIFF stores its colours in separate planes, which Outpost does not read.");
      if (compression === WEBP_COMPRESSION && (bits[0] !== 8 || (samplesPerPixel !== 3 && samplesPerPixel !== 4))) {
        throw new CogError("This GeoTIFF holds WebP in a form Outpost does not read (only 8-bit colour).");
      }
      if (compression !== 1 && compression !== 8 && compression !== 32946 && compression !== WEBP_COMPRESSION) {
        throw new CogError(`This GeoTIFF is compressed in a way Outpost does not read (TIFF compression ${compression}).`);
      }
      if (predictor !== 1 && predictor !== 2) throw new CogError("This GeoTIFF uses a predictor Outpost does not read.");
      images.push({
        width,
        height,
        tileWidth,
        tileHeight,
        bitsPerSample: bits[0]!,
        samplesPerPixel,
        compression,
        predictor,
        tileOffsets,
        tileByteCounts,
        overview: (subfile & 1) === 1,
        alpha: extra.length > 0 && (extra.at(-1) === 1 || extra.at(-1) === 2),
      });
    }
    if (images.length === 0) throw new CogError("This GeoTIFF holds no picture.");
    if (images.some((image) => image.compression === WEBP_COMPRESSION)) await loadWebpDecoder();

    const first = ifds[0]!;
    const scale = await values(first, TAG.ModelPixelScale);
    const tie = await values(first, TAG.ModelTiepoint);
    if (!scale || !tie || tie.length < 6) throw new CogError("This GeoTIFF does not say where on Earth it is.");
    const keys = await values(first, TAG.GeoKeyDirectory);
    let epsg: number | null = null;
    if (keys) {
      for (let i = 4; i + 3 < keys.length; i += 4) {
        // ProjectedCSTypeGeoKey, or GeographicTypeGeoKey for latitude and longitude.
        if ((keys[i] === 3072 || keys[i] === 2048) && keys[i + 1] === 0) epsg = keys[i + 3]!;
      }
    }
    const nodataText = await text(first, TAG.GdalNodata);
    const nodata = nodataText !== undefined && nodataText.trim() !== "" ? Number(nodataText) : null;
    const geo: Georeference = {
      // The tie point gives the raster position (i, j) of a model point (x, y).
      originX: tie[3]! - tie[0]! * scale[0]!,
      originY: tie[4]! + tie[1]! * scale[1]!,
      pixelWidth: scale[0]!,
      pixelHeight: scale[1]!,
      epsg,
      nodata: Number.isFinite(nodata) ? nodata : null,
    };
    // The image itself first, then its overviews from the most detailed down.
    images.sort((a, b) => b.width - a.width);
    return new Cog(reader, images, geo);
  }

  /** Pixel size, in projection units, of image `index` (0 is the full-resolution one). */
  pixelSizeOf(index: number): [number, number] {
    const image = this.images[index]!;
    const full = this.images[0]!;
    return [(this.geo.pixelWidth * full.width) / image.width, (this.geo.pixelHeight * full.height) / image.height];
  }

  /** The tiles of image `index` that a pixel window touches, with where their bytes are. */
  tilesFor(index: number, x0: number, y0: number, x1: number, y1: number): TileRef[] {
    const image = this.images[index]!;
    const across = Math.ceil(image.width / image.tileWidth);
    const down = Math.ceil(image.height / image.tileHeight);
    const refs: TileRef[] = [];
    const left = Math.max(0, Math.floor(x0 / image.tileWidth));
    const right = Math.min(across - 1, Math.floor((x1 - 1) / image.tileWidth));
    const top = Math.max(0, Math.floor(y0 / image.tileHeight));
    const bottom = Math.min(down - 1, Math.floor((y1 - 1) / image.tileHeight));
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        const tile = row * across + column;
        refs.push({ image: index, index: tile, offset: image.tileOffsets[tile] ?? 0, length: image.tileByteCounts[tile] ?? 0 });
      }
    }
    return refs;
  }

  /** Decodes one tile's bytes into its pixels (tileWidth × tileHeight × samples). */
  decodeTile(index: number, bytes: Uint8Array): Uint8Array | Uint16Array {
    const image = this.images[index]!;
    const samples = image.samplesPerPixel;
    const count = image.tileWidth * image.tileHeight * samples;
    const bytesPerSample = image.bitsPerSample / 8;
    let raw: Uint8Array;
    if (bytes.length === 0) {
      // An empty tile is one GDAL left out because it held nothing: nodata throughout.
      raw = new Uint8Array(count * bytesPerSample);
    } else if (image.compression === 1) {
      raw = bytes;
    } else if (image.compression === WEBP_COMPRESSION) {
      return webpTile(bytes, image);
    } else {
      try {
        raw = zlib.inflateSync(bytes);
      } catch {
        throw new CogError("A tile of this GeoTIFF could not be decompressed.");
      }
    }
    // The last strip of a picture may be shorter than the rest.
    if (raw.length < count * bytesPerSample && raw.length % (image.tileWidth * samples * bytesPerSample) === 0 && raw.length > 0) {
      const padded = new Uint8Array(count * bytesPerSample);
      padded.set(raw);
      raw = padded;
    }
    if (raw.length < count * bytesPerSample) throw new CogError("A tile of this GeoTIFF is shorter than it should be.");
    let pixels: Uint8Array | Uint16Array;
    if (bytesPerSample === 1) {
      pixels = new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + count));
    } else {
      pixels = new Uint16Array(count);
      const view = new DataView(raw.buffer, raw.byteOffset, count * 2);
      for (let i = 0; i < count; i += 1) pixels[i] = view.getUint16(i * 2, this.reader.little);
    }
    if (image.predictor === 2) {
      // Horizontal differencing: each sample is stored as the difference from the one to its left.
      const rowLength = image.tileWidth * samples;
      const mask = bytesPerSample === 1 ? 0xff : 0xffff;
      for (let row = 0; row < image.tileHeight; row += 1) {
        const base = row * rowLength;
        for (let i = samples; i < rowLength; i += 1) pixels[base + i] = (pixels[base + i]! + pixels[base + i - samples]!) & mask;
      }
    }
    return pixels;
  }

  /**
   * A window of image `index`, from tiles already fetched (`tiles` maps a tile index to its
   * bytes). Pixels outside the image are left at 0.
   */
  assemble(index: number, x0: number, y0: number, x1: number, y1: number, tiles: Map<number, Uint8Array>): Window {
    const image = this.images[index]!;
    const samples = image.samplesPerPixel;
    const width = x1 - x0;
    const height = y1 - y0;
    const data = image.bitsPerSample === 8 ? new Uint8Array(width * height * samples) : new Uint16Array(width * height * samples);
    const across = Math.ceil(image.width / image.tileWidth);
    for (const ref of this.tilesFor(index, x0, y0, x1, y1)) {
      const bytes = tiles.get(ref.index);
      if (!bytes) throw new CogError("A tile of the picture was not fetched.");
      const pixels = this.decodeTile(index, bytes);
      const tileX = (ref.index % across) * image.tileWidth;
      const tileY = Math.floor(ref.index / across) * image.tileHeight;
      const fromX = Math.max(x0, tileX);
      const toX = Math.min(x1, tileX + image.tileWidth, image.width);
      const fromY = Math.max(y0, tileY);
      const toY = Math.min(y1, tileY + image.tileHeight, image.height);
      for (let y = fromY; y < toY; y += 1) {
        const source = ((y - tileY) * image.tileWidth + (fromX - tileX)) * samples;
        const target = ((y - y0) * width + (fromX - x0)) * samples;
        data.set(pixels.subarray(source, source + (toX - fromX) * samples), target);
      }
    }
    return { x: x0, y: y0, width, height, samples, data };
  }
}
