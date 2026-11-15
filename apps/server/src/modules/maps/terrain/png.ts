/**
 * A reader for the PNG images a terrain archive may hold instead of WebP: 8-bit RGB or
 * RGBA, not interlaced, which is how elevation tiles are written. Anything else is
 * refused rather than guessed at.
 */
import zlib from "node:zlib";
import { type DecodedImage, ImageDecodeError } from "./webp-lossless.ts";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DIMENSION = 4096;

/** The predictor PNG calls Paeth: whichever neighbour is closest to left + up − upper-left. */
function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const fromLeft = Math.abs(estimate - left);
  const fromUp = Math.abs(estimate - up);
  const fromUpperLeft = Math.abs(estimate - upperLeft);
  if (fromLeft <= fromUp && fromLeft <= fromUpperLeft) return left;
  return fromUp <= fromUpperLeft ? up : upperLeft;
}

export function decodePng(file: Uint8Array): DecodedImage {
  const bytes = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) throw new ImageDecodeError("This is not a PNG image.");

  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString("latin1", offset + 4, offset + 8);
    const start = offset + 8;
    if (start + length + 4 > bytes.length) throw new ImageDecodeError("The PNG image is cut short.");
    if (kind === "IHDR") {
      width = bytes.readUInt32BE(start);
      height = bytes.readUInt32BE(start + 4);
      const depth = bytes[start + 8];
      const colourType = bytes[start + 9];
      const interlaced = bytes[start + 12] !== 0;
      if (depth !== 8 || (colourType !== 2 && colourType !== 6) || interlaced) {
        throw new ImageDecodeError("Only 8-bit RGB or RGBA PNG images that are not interlaced can be read as terrain.");
      }
      channels = colourType === 6 ? 4 : 3;
    } else if (kind === "IDAT") {
      data.push(bytes.subarray(start, start + length));
    } else if (kind === "IEND") {
      break;
    }
    offset = start + length + 4;
  }
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageDecodeError("The PNG image has no usable size.");
  }

  const stride = width * channels;
  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * height });
  } catch {
    throw new ImageDecodeError("The PNG image's data could not be unpacked.");
  }
  if (raw.length !== (stride + 1) * height) throw new ImageDecodeError("The PNG image did not unpack to its stated size.");

  // Each row is stored as differences from its neighbours, by one of five rules.
  const argb = new Uint32Array(width * height);
  let previous: Uint8Array = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels]! : 0;
      const up = previous[index]!;
      const upperLeft = index >= channels ? previous[index - channels]! : 0;
      let predicted: number;
      if (filter === 0) predicted = 0;
      else if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) predicted = paeth(left, up, upperLeft);
      else throw new ImageDecodeError("The PNG image uses a row filter that does not exist.");
      row[index] = (row[index]! + predicted) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const at = x * channels;
      const alpha = channels === 4 ? row[at + 3]! : 0xff;
      argb[y * width + x] = ((alpha << 24) | (row[at]! << 16) | (row[at + 1]! << 8) | row[at + 2]!) >>> 0;
    }
    previous = row;
  }
  return { width, height, argb };
}
