/**
 * Small aerial-photograph GeoTIFFs for tests, laid out as the publishers lay theirs out:
 * 8-bit colour in tiles, the full picture first and then reduced copies (overviews),
 * each its own directory. New Zealand's are RGB with transparency, compressed as WebP
 * (TIFF compression 50001, as GDAL writes it); the United States' NAIP are red, green,
 * blue and near infra-red, Deflate with horizontal differencing. Classic little-endian.
 */
import zlib from "node:zlib";
import { encodeWebp } from "../../../src/modules/maps/imagery/webp.ts";

export interface AerialTiffSpec {
  width: number;
  height: number;
  /** 3 (RGB), 4 with `alpha` (RGBA), or 4 without (RGB and near infra-red). */
  samples: 3 | 4;
  alpha?: boolean;
  tile: number;
  compression: "webp" | "deflate";
  /** How many reduced copies, each half the one before. */
  overviews: number;
  epsg: number;
  originX: number;
  originY: number;
  pixelSize: number;
  /** Sample values of the full picture. */
  values: (x: number, y: number, sample: number) => number;
}

type Field = { tag: number; type: number; values: number[] };
const SIZE: Record<number, number> = { 3: 2, 4: 4, 12: 8 };

async function blocksOf(spec: AerialTiffSpec, level: number, width: number, height: number): Promise<Buffer[]> {
  const factor = 2 ** level;
  const across = Math.ceil(width / spec.tile);
  const down = Math.ceil(height / spec.tile);
  const blocks: Buffer[] = [];
  for (let by = 0; by < down; by += 1) {
    for (let bx = 0; bx < across; bx += 1) {
      const raw = new Uint8Array(spec.tile * spec.tile * spec.samples);
      const rgba = new Uint8ClampedArray(spec.tile * spec.tile * 4);
      for (let y = 0; y < spec.tile; y += 1) {
        for (let x = 0; x < spec.tile; x += 1) {
          const gx = (bx * spec.tile + x) * factor;
          const gy = (by * spec.tile + y) * factor;
          const inside = gx < spec.width && gy < spec.height;
          for (let s = 0; s < spec.samples; s += 1) {
            const value = inside ? spec.values(gx, gy, s) : 0;
            raw[(y * spec.tile + x) * spec.samples + s] = value;
            if (s < 4) rgba[(y * spec.tile + x) * 4 + s] = value;
          }
          if (spec.samples === 3) rgba[(y * spec.tile + x) * 4 + 3] = 255;
        }
      }
      if (spec.compression === "webp") {
        blocks.push(Buffer.from(await encodeWebp(rgba, spec.tile, spec.tile)));
      } else {
        const rowLength = spec.tile * spec.samples;
        for (let y = 0; y < spec.tile; y += 1)
          for (let i = rowLength - 1; i >= spec.samples; i -= 1)
            raw[y * rowLength + i] = (raw[y * rowLength + i]! - raw[y * rowLength + i - spec.samples]!) & 0xff;
        blocks.push(zlib.deflateSync(raw));
      }
    }
  }
  return blocks;
}

export async function buildAerialTiff(spec: AerialTiffSpec): Promise<Buffer> {
  const levels: Array<{ fields: Field[]; blocks: Buffer[]; offsets: Field }> = [];
  for (let level = 0; level <= spec.overviews; level += 1) {
    const width = Math.ceil(spec.width / 2 ** level);
    const height = Math.ceil(spec.height / 2 ** level);
    const blocks = await blocksOf(spec, level, width, height);
    const offsets: Field = { tag: 324, type: 4, values: blocks.map(() => 0) };
    const fields: Field[] = [
      { tag: 254, type: 4, values: [level === 0 ? 0 : 1] },
      { tag: 256, type: 4, values: [width] },
      { tag: 257, type: 4, values: [height] },
      { tag: 258, type: 3, values: Array(spec.samples).fill(8) },
      { tag: 259, type: 3, values: [spec.compression === "webp" ? 50001 : 8] },
      { tag: 262, type: 3, values: [2] },
      { tag: 277, type: 3, values: [spec.samples] },
      { tag: 284, type: 3, values: [1] },
      { tag: 317, type: 3, values: [spec.compression === "webp" ? 1 : 2] },
      { tag: 322, type: 3, values: [spec.tile] },
      { tag: 323, type: 3, values: [spec.tile] },
      offsets,
      { tag: 325, type: 4, values: blocks.map((block) => block.length) },
      { tag: 339, type: 3, values: Array(spec.samples).fill(1) },
    ];
    if (spec.samples === 4) fields.push({ tag: 338, type: 3, values: [spec.alpha ? 2 : 0] });
    if (level === 0) {
      fields.push(
        { tag: 33550, type: 12, values: [spec.pixelSize, spec.pixelSize, 0] },
        { tag: 33922, type: 12, values: [0, 0, 0, spec.originX, spec.originY, 0] },
        { tag: 34735, type: 3, values: [1, 1, 0, 2, 1024, 0, 1, 1, 3072, 0, 1, spec.epsg] },
      );
    }
    fields.sort((a, b) => a.tag - b.tag);
    levels.push({ fields, blocks, offsets });
  }

  // Layout: header, then every directory with its out-of-line values, then the tiles.
  let at = 8;
  const placed: Array<{ ifd: number; extra: Map<Field, number> }> = [];
  for (const { fields } of levels) {
    const ifd = at;
    at += 2 + fields.length * 12 + 4;
    const extra = new Map<Field, number>();
    for (const field of fields) {
      const length = field.values.length * SIZE[field.type]!;
      if (length > 4) {
        extra.set(field, at);
        at += length + (length % 2);
      }
    }
    placed.push({ ifd, extra });
  }
  for (const level of levels) {
    level.offsets.values = level.blocks.map((block) => {
      const offset = at;
      at += block.length;
      return offset;
    });
  }
  const out = Buffer.alloc(at);
  out.write("II", 0, "latin1");
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(placed[0]!.ifd, 4);
  const write = (field: Field, where: number) =>
    field.values.forEach((value, i) => {
      if (field.type === 3) out.writeUInt16LE(value, where + i * 2);
      else if (field.type === 4) out.writeUInt32LE(value, where + i * 4);
      else out.writeDoubleLE(value, where + i * 8);
    });
  levels.forEach((level, index) => {
    const { ifd, extra } = placed[index]!;
    out.writeUInt16LE(level.fields.length, ifd);
    level.fields.forEach((field, i) => {
      const entry = ifd + 2 + i * 12;
      out.writeUInt16LE(field.tag, entry);
      out.writeUInt16LE(field.type, entry + 2);
      out.writeUInt32LE(field.values.length, entry + 4);
      const where = extra.get(field);
      if (where !== undefined) {
        out.writeUInt32LE(where, entry + 8);
        write(field, where);
      } else write(field, entry + 8);
    });
    out.writeUInt32LE(placed[index + 1]?.ifd ?? 0, ifd + 2 + level.fields.length * 12);
    let offset = level.offsets.values[0]!;
    for (const block of level.blocks) {
      block.copy(out, offset);
      offset += block.length;
    }
  });
  return out;
}
