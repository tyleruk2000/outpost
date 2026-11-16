/**
 * Small GeoTIFFs for tests, laid out as the publishers lay theirs out: Sentinel-2's
 * tiled, 16-bit, Deflate with horizontal differencing, in UTM; Blue Marble's in strips
 * of one row, 8-bit RGB, Deflate, in latitude and longitude. Classic little-endian TIFF.
 */
import zlib from "node:zlib";

export interface GeoTiffSpec {
  width: number;
  height: number;
  samples: number;
  bits: 8 | 16;
  /** Pixel values, samples interleaved, rows top to bottom. */
  values: (x: number, y: number, sample: number) => number;
  /** Tiled with this tile size; otherwise one row to a strip. */
  tile?: number;
  predictor?: 1 | 2;
  epsg: number;
  /** Projected coordinates of the top-left corner, and the size of a pixel. */
  originX: number;
  originY: number;
  pixelSize: number;
  nodata?: number;
}

type Field = { tag: number; type: number; values: number[] | string };

const SIZE: Record<number, number> = { 2: 1, 3: 2, 4: 4, 12: 8 };

export function buildGeoTiff(spec: GeoTiffSpec): Buffer {
  const bytesPerSample = spec.bits / 8;
  const blockWidth = spec.tile ?? spec.width;
  const blockHeight = spec.tile ?? 1;
  const across = Math.ceil(spec.width / blockWidth);
  const down = Math.ceil(spec.height / blockHeight);
  const blocks: Buffer[] = [];
  for (let by = 0; by < down; by += 1) {
    for (let bx = 0; bx < across; bx += 1) {
      const raw = Buffer.alloc(blockWidth * blockHeight * spec.samples * bytesPerSample);
      for (let y = 0; y < blockHeight; y += 1) {
        const row: number[] = [];
        for (let x = 0; x < blockWidth; x += 1) {
          for (let s = 0; s < spec.samples; s += 1) {
            const gx = bx * blockWidth + x;
            const gy = by * blockHeight + y;
            row.push(gx < spec.width && gy < spec.height ? spec.values(gx, gy, s) : 0);
          }
        }
        if (spec.predictor === 2) {
          const mask = spec.bits === 8 ? 0xff : 0xffff;
          for (let i = row.length - 1; i >= spec.samples; i -= 1) row[i] = (row[i]! - row[i - spec.samples]!) & mask;
        }
        row.forEach((value, i) => {
          const at = (y * blockWidth * spec.samples + i) * bytesPerSample;
          if (spec.bits === 8) raw.writeUInt8(value, at);
          else raw.writeUInt16LE(value, at);
        });
      }
      blocks.push(zlib.deflateSync(raw));
    }
  }

  const tiled = spec.tile !== undefined;
  const fields: Field[] = [
    { tag: 256, type: 4, values: [spec.width] },
    { tag: 257, type: 4, values: [spec.height] },
    { tag: 258, type: 3, values: Array(spec.samples).fill(spec.bits) },
    { tag: 259, type: 3, values: [8] },
    { tag: 262, type: 3, values: [spec.samples >= 3 ? 2 : 1] },
    { tag: 277, type: 3, values: [spec.samples] },
    { tag: 284, type: 3, values: [1] },
    { tag: 317, type: 3, values: [spec.predictor ?? 1] },
    { tag: 339, type: 3, values: Array(spec.samples).fill(1) },
    { tag: 33550, type: 12, values: [spec.pixelSize, spec.pixelSize, 0] },
    { tag: 33922, type: 12, values: [0, 0, 0, spec.originX, spec.originY, 0] },
    {
      tag: 34735,
      type: 3,
      values: spec.epsg === 4326 ? [1, 1, 0, 2, 1024, 0, 1, 2, 2048, 0, 1, 4326] : [1, 1, 0, 2, 1024, 0, 1, 1, 3072, 0, 1, spec.epsg],
    },
  ];
  if (tiled) {
    fields.push({ tag: 322, type: 3, values: [blockWidth] }, { tag: 323, type: 3, values: [blockHeight] });
  } else {
    fields.push({ tag: 278, type: 3, values: [1] });
  }
  if (spec.nodata !== undefined) fields.push({ tag: 42113, type: 2, values: `${spec.nodata}\0` });
  // Offsets are filled in once the layout is known.
  const offsetsField: Field = { tag: tiled ? 324 : 273, type: 4, values: blocks.map(() => 0) };
  const countsField: Field = { tag: tiled ? 325 : 279, type: 4, values: blocks.map((block) => block.length) };
  fields.push(offsetsField, countsField);
  fields.sort((a, b) => a.tag - b.tag);

  const ifdOffset = 8;
  const ifdSize = 2 + fields.length * 12 + 4;
  let extra = ifdOffset + ifdSize;
  const outOfLine = new Map<Field, number>();
  for (const field of fields) {
    const length = typeof field.values === "string" ? field.values.length : field.values.length * SIZE[field.type]!;
    if (length > 4) {
      outOfLine.set(field, extra);
      extra += length + (length % 2);
    }
  }
  let dataAt = extra;
  offsetsField.values = blocks.map((block) => {
    const at = dataAt;
    dataAt += block.length;
    return at;
  });

  const out = Buffer.alloc(dataAt);
  out.write("II", 0, "latin1");
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(ifdOffset, 4);
  out.writeUInt16LE(fields.length, ifdOffset);
  const writeValues = (field: Field, at: number) => {
    if (typeof field.values === "string") {
      out.write(field.values, at, "latin1");
      return;
    }
    field.values.forEach((value, i) => {
      const size = SIZE[field.type]!;
      if (field.type === 3) out.writeUInt16LE(value, at + i * size);
      else if (field.type === 4) out.writeUInt32LE(value, at + i * size);
      else if (field.type === 12) out.writeDoubleLE(value, at + i * size);
    });
  };
  fields.forEach((field, index) => {
    const entry = ifdOffset + 2 + index * 12;
    const count = typeof field.values === "string" ? field.values.length : field.values.length;
    out.writeUInt16LE(field.tag, entry);
    out.writeUInt16LE(field.type, entry + 2);
    out.writeUInt32LE(count, entry + 4);
    const placed = outOfLine.get(field);
    if (placed !== undefined) {
      out.writeUInt32LE(placed, entry + 8);
      writeValues(field, placed);
    } else {
      writeValues(field, entry + 8);
    }
  });
  out.writeUInt32LE(0, ifdOffset + ifdSize - 4);
  let at = extra;
  for (const block of blocks) {
    block.copy(out, at);
    at += block.length;
  }
  return out;
}
