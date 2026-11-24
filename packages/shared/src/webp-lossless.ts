/**
 * A decoder for lossless WebP (the "VP8L" bitstream), written from the format's
 * specification (RFC 9649, section 3).
 *
 * Terrain tiles are lossless WebP images whose colours encode heights. The browser
 * decodes them for hill shading; the server needs the same numbers to give a drawn
 * route its heights, and Node has no image decoder of its own. This is the whole of the
 * format a terrain tile can use and nothing else: no lossy WebP, no animation.
 *
 * It favours being plainly correct over being fast. A 512 px tile decodes in a few
 * tens of milliseconds, and a route touches a handful of tiles.
 */

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDecodeError";
  }
}

export interface DecodedImage {
  width: number;
  height: number;
  /** One 0xAARRGGBB value per pixel, row by row from the top. */
  argb: Uint32Array;
}

const MAX_DIMENSION = 4096;

/** Reads bits least significant first, as VP8L packs them. */
class BitReader {
  private readonly data: Uint8Array;
  private position = 0;
  private readonly limit: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.limit = data.length * 8;
  }

  bit(): number {
    const position = this.position;
    if (position >= this.limit) throw new ImageDecodeError("The image ends before its data does.");
    this.position = position + 1;
    return (this.data[position >> 3]! >> (position & 7)) & 1;
  }

  /** The next `count` bits (at most 24) without reading past them; bits beyond the end of the data are 0. */
  peek(count: number): number {
    const position = this.position;
    const at = position >> 3;
    const data = this.data;
    const word = (data[at] ?? 0) | ((data[at + 1] ?? 0) << 8) | ((data[at + 2] ?? 0) << 16) | ((data[at + 3] ?? 0) << 24);
    return (word >>> (position & 7)) & ((1 << count) - 1);
  }

  skip(count: number): void {
    if (this.position + count > this.limit) throw new ImageDecodeError("The image ends before its data does.");
    this.position += count;
  }

  bits(count: number): number {
    if (count <= 24) {
      const value = this.peek(count);
      this.skip(count);
      return value;
    }
    let value = 0;
    for (let index = 0; index < count; index += 1) value |= this.bit() << index;
    return value >>> 0;
  }
}

/** A canonical prefix code: decoded from a table for codes up to `LOOKUP_BITS` long, a bit at a time beyond. */
interface PrefixCode {
  /** Set when the code has one symbol, which then costs no bits at all. */
  only: number;
  /** How many symbols have each code length, 0 to 15. */
  counts: Uint16Array;
  /** Symbols in order of code length, then value. */
  symbols: Uint16Array;
  /**
   * For each value of the next `LOOKUP_BITS` bits, the symbol whose code they start with and its length, as
   * symbol × 16 + length; -1 where the code is longer. Reading a symbol from it was most of the time a terrain tile
   * took to decode, a bit at a time.
   */
  table: Int32Array;
}

const MAX_CODE_LENGTH = 15;
const LOOKUP_BITS = 9;
const NO_TABLE = new Int32Array(0);

function buildCode(lengths: Uint8Array | number[]): PrefixCode {
  const counts = new Uint16Array(MAX_CODE_LENGTH + 1);
  let used = 0;
  let last = 0;
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol]!;
    if (length === 0) continue;
    counts[length] = counts[length]! + 1;
    used += 1;
    last = symbol;
  }
  if (used === 0) throw new ImageDecodeError("The image has a prefix code with no symbols.");
  const symbols = new Uint16Array(used);
  if (used === 1) {
    symbols[0] = last;
    return { only: last, counts, symbols, table: NO_TABLE };
  }
  const offsets = new Uint16Array(MAX_CODE_LENGTH + 2);
  for (let length = 1; length <= MAX_CODE_LENGTH; length += 1) offsets[length + 1] = offsets[length]! + counts[length]!;
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol]!;
    if (length === 0) continue;
    symbols[offsets[length]!] = symbol;
    offsets[length] = offsets[length]! + 1;
  }
  // The canonical codes, as `readSymbol` reads them: by length, then by symbol, the first bit read the highest.
  const table = new Int32Array(1 << LOOKUP_BITS).fill(-1);
  let code = 0;
  let index = 0;
  for (let length = 1; length <= LOOKUP_BITS; length += 1) {
    for (let n = 0; n < counts[length]!; n += 1) {
      // The bits come least significant first, so the code is looked up reversed.
      let reversed = 0;
      for (let bit = 0; bit < length; bit += 1) reversed |= ((code >> (length - 1 - bit)) & 1) << bit;
      const entry = (symbols[index]! << 4) | length;
      for (let fill = reversed; fill < 1 << LOOKUP_BITS; fill += 1 << length) table[fill] = entry;
      code += 1;
      index += 1;
    }
    code <<= 1;
  }
  return { only: -1, counts, symbols, table };
}

function readSymbol(reader: BitReader, code: PrefixCode): number {
  if (code.only >= 0) return code.only;
  const entry = code.table[reader.peek(LOOKUP_BITS)]!;
  if (entry >= 0) {
    reader.skip(entry & 15);
    return entry >> 4;
  }
  let value = 0;
  let first = 0;
  let index = 0;
  for (let length = 1; length <= MAX_CODE_LENGTH; length += 1) {
    value |= reader.bit();
    const count = code.counts[length]!;
    if (value - count < first) return code.symbols[index + (value - first)]!;
    index += count;
    first = (first + count) << 1;
    value <<= 1;
  }
  throw new ImageDecodeError("The image holds a code that matches no symbol.");
}

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function readPrefixCode(reader: BitReader, alphabetSize: number): PrefixCode {
  const lengths = new Uint8Array(alphabetSize);
  if (reader.bits(1) === 1) {
    // A "simple" code: one or two symbols, written out directly.
    const count = reader.bits(1) + 1;
    const first = reader.bits(reader.bits(1) === 1 ? 8 : 1);
    if (first >= alphabetSize) throw new ImageDecodeError("The image names a symbol outside its alphabet.");
    lengths[first] = 1;
    if (count === 2) {
      const second = reader.bits(8);
      if (second >= alphabetSize) throw new ImageDecodeError("The image names a symbol outside its alphabet.");
      lengths[second] = 1;
    }
    return buildCode(lengths);
  }

  // A "normal" code: the code lengths are themselves written with a small prefix code.
  const lengthCodeLengths = new Uint8Array(19);
  const lengthCount = reader.bits(4) + 4;
  for (let index = 0; index < lengthCount; index += 1) lengthCodeLengths[CODE_LENGTH_ORDER[index]!] = reader.bits(3);
  const lengthCode = buildCode(lengthCodeLengths);

  let remaining = alphabetSize;
  if (reader.bits(1) === 1) {
    const lengthBits = 2 + 2 * reader.bits(3);
    remaining = 2 + reader.bits(lengthBits);
    if (remaining > alphabetSize) throw new ImageDecodeError("The image lists more code lengths than it has symbols.");
  }
  let symbol = 0;
  let previous = 8;
  while (symbol < alphabetSize && remaining > 0) {
    remaining -= 1;
    const token = readSymbol(reader, lengthCode);
    if (token < 16) {
      lengths[symbol] = token;
      symbol += 1;
      if (token !== 0) previous = token;
      continue;
    }
    // 16 repeats the last non-zero length; 17 and 18 write runs of zeros.
    const repeat = token === 16 ? 3 + reader.bits(2) : token === 17 ? 3 + reader.bits(3) : 11 + reader.bits(7);
    if (symbol + repeat > alphabetSize) throw new ImageDecodeError("The image repeats a code length past the end of its alphabet.");
    if (token === 16) lengths.fill(previous, symbol, symbol + repeat);
    symbol += repeat;
  }
  return buildCode(lengths);
}

/** Where a short backward distance points, as (x, y) steps back: nearby pixels get the short codes. */
const NEARBY: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, 2],
  [2, 0],
  [1, 2],
  [-1, 2],
  [2, 1],
  [-2, 1],
  [2, 2],
  [-2, 2],
  [0, 3],
  [3, 0],
  [1, 3],
  [-1, 3],
  [3, 1],
  [-3, 1],
  [2, 3],
  [-2, 3],
  [3, 2],
  [-3, 2],
  [0, 4],
  [4, 0],
  [1, 4],
  [-1, 4],
  [4, 1],
  [-4, 1],
  [3, 3],
  [-3, 3],
  [2, 4],
  [-2, 4],
  [4, 2],
  [-4, 2],
  [0, 5],
  [3, 4],
  [-3, 4],
  [4, 3],
  [-4, 3],
  [5, 0],
  [1, 5],
  [-1, 5],
  [5, 1],
  [-5, 1],
  [2, 5],
  [-2, 5],
  [5, 2],
  [-5, 2],
  [4, 4],
  [-4, 4],
  [3, 5],
  [-3, 5],
  [5, 3],
  [-5, 3],
  [0, 6],
  [6, 0],
  [1, 6],
  [-1, 6],
  [6, 1],
  [-6, 1],
  [2, 6],
  [-2, 6],
  [6, 2],
  [-6, 2],
  [4, 5],
  [-4, 5],
  [5, 4],
  [-5, 4],
  [3, 6],
  [-3, 6],
  [6, 3],
  [-6, 3],
  [0, 7],
  [7, 0],
  [1, 7],
  [-1, 7],
  [5, 5],
  [-5, 5],
  [7, 1],
  [-7, 1],
  [4, 6],
  [-4, 6],
  [6, 4],
  [-6, 4],
  [2, 7],
  [-2, 7],
  [7, 2],
  [-7, 2],
  [3, 7],
  [-3, 7],
  [7, 3],
  [-7, 3],
  [5, 6],
  [-5, 6],
  [6, 5],
  [-6, 5],
  [8, 0],
  [4, 7],
  [-4, 7],
  [7, 4],
  [-7, 4],
  [8, 1],
  [8, 2],
  [6, 6],
  [-6, 6],
  [8, 3],
  [5, 7],
  [-5, 7],
  [7, 5],
  [-7, 5],
  [8, 4],
  [6, 7],
  [-6, 7],
  [7, 6],
  [-7, 6],
  [8, 5],
  [7, 7],
  [-7, 7],
  [8, 6],
  [8, 7],
];

/** A length or distance: small ones are the symbol itself, larger ones add extra bits. */
function readExtended(reader: BitReader, symbol: number): number {
  if (symbol < 4) return symbol + 1;
  const extraBits = (symbol - 2) >> 1;
  const offset = (2 + (symbol & 1)) << extraBits;
  return offset + reader.bits(extraBits) + 1;
}

const blocks = (size: number, bits: number) => (size + (1 << bits) - 1) >> bits;

/**
 * One entropy-coded image: prefix codes, then pixels as literals, copies of earlier
 * pixels, or look-ups in a small cache of recent colours. The main image may also split
 * itself into blocks that each use their own set of codes (`allowGroups`).
 */
function readImage(reader: BitReader, width: number, height: number, allowGroups: boolean): Uint32Array {
  let cacheBits = 0;
  if (reader.bits(1) === 1) {
    cacheBits = reader.bits(4);
    if (cacheBits < 1 || cacheBits > 11) throw new ImageDecodeError("The image asks for a colour cache of an impossible size.");
  }

  let groupBits = 0;
  let groupWidth = 0;
  let groupOf: Uint32Array | undefined;
  let groupCount = 1;
  if (allowGroups && reader.bits(1) === 1) {
    groupBits = reader.bits(3) + 2;
    groupWidth = blocks(width, groupBits);
    groupOf = readImage(reader, groupWidth, blocks(height, groupBits), false);
    for (let index = 0; index < groupOf.length; index += 1) {
      const group = (groupOf[index]! >>> 8) & 0xffff;
      groupOf[index] = group;
      if (group + 1 > groupCount) groupCount = group + 1;
    }
  }

  const cacheSize = cacheBits > 0 ? 1 << cacheBits : 0;
  const groups: PrefixCode[][] = [];
  for (let group = 0; group < groupCount; group += 1) {
    groups.push([
      readPrefixCode(reader, 256 + 24 + cacheSize), // green, copy lengths and cache look-ups
      readPrefixCode(reader, 256), // red
      readPrefixCode(reader, 256), // blue
      readPrefixCode(reader, 256), // alpha
      readPrefixCode(reader, 40), // copy distances
    ]);
  }

  const total = width * height;
  const pixels = new Uint32Array(total);
  const cache = cacheSize > 0 ? new Uint32Array(cacheSize) : undefined;
  const cacheShift = 32 - cacheBits;
  const remember = (argb: number) => {
    if (cache) cache[Math.imul(argb, 0x1e35a7bd) >>> cacheShift] = argb;
  };

  let position = 0;
  let codes = groups[0]!;
  while (position < total) {
    if (groupOf) {
      const row = (position / width) | 0;
      codes = groups[groupOf[(row >> groupBits) * groupWidth + ((position - row * width) >> groupBits)]!]!;
    }
    const symbol = readSymbol(reader, codes[0]!);
    if (symbol < 256) {
      const red = readSymbol(reader, codes[1]!);
      const blue = readSymbol(reader, codes[2]!);
      const alpha = readSymbol(reader, codes[3]!);
      const argb = ((alpha << 24) | (red << 16) | (symbol << 8) | blue) >>> 0;
      pixels[position] = argb;
      position += 1;
      remember(argb);
    } else if (symbol < 256 + 24) {
      const length = readExtended(reader, symbol - 256);
      const code = readExtended(reader, readSymbol(reader, codes[4]!));
      let distance: number;
      if (code > NEARBY.length) {
        distance = code - NEARBY.length;
      } else {
        const [dx, dy] = NEARBY[code - 1]!;
        distance = Math.max(1, dx + dy * width);
      }
      if (distance > position || position + length > total) throw new ImageDecodeError("The image copies pixels from outside itself.");
      for (let index = 0; index < length; index += 1) {
        const argb = pixels[position - distance]!;
        pixels[position] = argb;
        position += 1;
        remember(argb);
      }
    } else {
      const index = symbol - (256 + 24);
      if (!cache || index >= cacheSize) throw new ImageDecodeError("The image looks up a colour it never cached.");
      pixels[position] = cache[index]!;
      position += 1;
    }
  }
  return pixels;
}

// ── Transforms ──────────────────────────────────────────────────────────────
// A lossless image is stored as residuals: what is left after predicting each pixel
// from its neighbours, decorrelating the colour channels, and so on. Decoding undoes
// those steps in the reverse of the order they were written.

type Transform =
  | { type: "predictor"; bits: number; data: Uint32Array }
  | { type: "colour"; bits: number; data: Uint32Array }
  | { type: "subtract-green" }
  | { type: "palette"; packBits: number; colours: Uint32Array; width: number };

/** Adds two pixels channel by channel, each channel wrapping at 256. */
const add = (a: number, b: number) =>
  ((((a & 0xff00ff00) + (b & 0xff00ff00)) & 0xff00ff00) | (((a & 0x00ff00ff) + (b & 0x00ff00ff)) & 0x00ff00ff)) >>> 0;

/** The channel-by-channel mean of two pixels, rounded down. */
const average = (a: number, b: number) => ((((a ^ b) & 0xfefefefe) >>> 1) + (a & b)) >>> 0;

const clamp = (value: number) => Math.max(0, Math.min(255, value));
const channel = (pixel: number, shift: number) => (pixel >>> shift) & 0xff;

/** Whichever of left and top is closer to the gradient estimate left + top − top-left. */
function select(left: number, top: number, topLeft: number): number {
  let towardsLeft = 0;
  let towardsTop = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    towardsLeft += Math.abs(channel(top, shift) - channel(topLeft, shift));
    towardsTop += Math.abs(channel(left, shift) - channel(topLeft, shift));
  }
  return towardsLeft < towardsTop ? left : top;
}

function clampedGradient(left: number, top: number, topLeft: number): number {
  let result = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    result |= clamp(channel(left, shift) + channel(top, shift) - channel(topLeft, shift)) << shift;
  }
  return result >>> 0;
}

function clampedHalfGradient(mean: number, topLeft: number): number {
  let result = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    const a = channel(mean, shift);
    result |= clamp(a + Math.trunc((a - channel(topLeft, shift)) / 2)) << shift;
  }
  return result >>> 0;
}

const OPAQUE_BLACK = 0xff000000;

function undoPredictor(pixels: Uint32Array, width: number, height: number, bits: number, modes: Uint32Array): void {
  const modesWidth = blocks(width, bits);
  pixels[0] = add(pixels[0]!, OPAQUE_BLACK);
  for (let x = 1; x < width; x += 1) pixels[x] = add(pixels[x]!, pixels[x - 1]!);
  for (let y = 1; y < height; y += 1) {
    const row = y * width;
    pixels[row] = add(pixels[row]!, pixels[row - width]!);
    for (let x = 1; x < width; x += 1) {
      const at = row + x;
      const left = pixels[at - 1]!;
      const top = pixels[at - width]!;
      const topLeft = pixels[at - width - 1]!;
      // For the last pixel of a row this is the first pixel of the row itself, as the format defines.
      const topRight = pixels[at - width + 1]!;
      const mode = (modes[(y >> bits) * modesWidth + (x >> bits)]! >>> 8) & 0xff;
      let predicted: number;
      switch (mode) {
        case 1:
          predicted = left;
          break;
        case 2:
          predicted = top;
          break;
        case 3:
          predicted = topRight;
          break;
        case 4:
          predicted = topLeft;
          break;
        case 5:
          predicted = average(average(left, topRight), top);
          break;
        case 6:
          predicted = average(left, topLeft);
          break;
        case 7:
          predicted = average(left, top);
          break;
        case 8:
          predicted = average(topLeft, top);
          break;
        case 9:
          predicted = average(top, topRight);
          break;
        case 10:
          predicted = average(average(left, topLeft), average(top, topRight));
          break;
        case 11:
          predicted = select(left, top, topLeft);
          break;
        case 12:
          predicted = clampedGradient(left, top, topLeft);
          break;
        case 13:
          predicted = clampedHalfGradient(average(left, top), topLeft);
          break;
        default:
          predicted = OPAQUE_BLACK;
      }
      pixels[at] = add(pixels[at]!, predicted);
    }
  }
}

const signed = (value: number) => (value << 24) >> 24;
const colourDelta = (multiplier: number, value: number) => (signed(multiplier) * signed(value)) >> 5;

function undoColour(pixels: Uint32Array, width: number, height: number, bits: number, data: Uint32Array): void {
  const dataWidth = blocks(width, bits);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const element = data[(y >> bits) * dataWidth + (x >> bits)]!;
      const greenToRed = element & 0xff;
      const greenToBlue = (element >>> 8) & 0xff;
      const redToBlue = (element >>> 16) & 0xff;
      const at = y * width + x;
      const pixel = pixels[at]!;
      const green = (pixel >>> 8) & 0xff;
      const red = (((pixel >>> 16) & 0xff) + colourDelta(greenToRed, green)) & 0xff;
      const blue = ((pixel & 0xff) + colourDelta(greenToBlue, green) + colourDelta(redToBlue, red)) & 0xff;
      pixels[at] = ((pixel & 0xff00ff00) | (red << 16) | blue) >>> 0;
    }
  }
}

function undoSubtractGreen(pixels: Uint32Array): void {
  for (let index = 0; index < pixels.length; index += 1) {
    const pixel = pixels[index]!;
    const green = (pixel >>> 8) & 0xff;
    const red = (((pixel >>> 16) & 0xff) + green) & 0xff;
    const blue = ((pixel & 0xff) + green) & 0xff;
    pixels[index] = ((pixel & 0xff00ff00) | (red << 16) | blue) >>> 0;
  }
}

/** Expands palette indexes (several to a stored pixel when the palette is small) into colours. */
function undoPalette(packed: Uint32Array, width: number, height: number, transform: Extract<Transform, { type: "palette" }>): Uint32Array {
  const { packBits, colours, width: packedWidth } = transform;
  const pixels = new Uint32Array(width * height);
  const bitsPerPixel = 8 >> packBits;
  const perStored = 1 << packBits;
  const mask = (1 << bitsPerPixel) - 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const stored = (packed[y * packedWidth + (x >> packBits)]! >>> 8) & 0xff;
      const index = packBits === 0 ? stored : (stored >> (bitsPerPixel * (x & (perStored - 1)))) & mask;
      pixels[y * width + x] = index < colours.length ? colours[index]! : 0;
    }
  }
  return pixels;
}

function decodeBitstream(data: Uint8Array): DecodedImage {
  const reader = new BitReader(data);
  if (reader.bits(8) !== 0x2f) throw new ImageDecodeError("This is not a lossless WebP image.");
  const width = reader.bits(14) + 1;
  const height = reader.bits(14) + 1;
  reader.bits(1); // whether alpha is used: a hint only
  if (reader.bits(3) !== 0) throw new ImageDecodeError("This lossless WebP image is of a version Outpost does not know.");
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw new ImageDecodeError("The image is larger than any map tile.");

  const transforms: Transform[] = [];
  const seen = new Set<number>();
  let codedWidth = width;
  while (reader.bits(1) === 1) {
    const type = reader.bits(2);
    if (seen.has(type)) throw new ImageDecodeError("The image applies the same transform twice.");
    seen.add(type);
    if (type === 0 || type === 1) {
      const bits = reader.bits(3) + 2;
      const data = readImage(reader, blocks(codedWidth, bits), blocks(height, bits), false);
      transforms.push({ type: type === 0 ? "predictor" : "colour", bits, data });
    } else if (type === 2) {
      transforms.push({ type: "subtract-green" });
    } else {
      const size = reader.bits(8) + 1;
      const colours = readImage(reader, size, 1, false);
      // The palette is stored as differences from one colour to the next.
      for (let index = 1; index < size; index += 1) colours[index] = add(colours[index]!, colours[index - 1]!);
      const packBits = size <= 2 ? 3 : size <= 4 ? 2 : size <= 16 ? 1 : 0;
      codedWidth = blocks(codedWidth, packBits);
      transforms.push({ type: "palette", packBits, colours, width: codedWidth });
    }
  }

  let pixels = readImage(reader, codedWidth, height, true);
  for (let index = transforms.length - 1; index >= 0; index -= 1) {
    const transform = transforms[index]!;
    // Transforms written before the palette saw the full width; those after it, the packed one.
    const currentWidth = pixels.length / height;
    if (transform.type === "predictor") undoPredictor(pixels, currentWidth, height, transform.bits, transform.data);
    else if (transform.type === "colour") undoColour(pixels, currentWidth, height, transform.bits, transform.data);
    else if (transform.type === "subtract-green") undoSubtractGreen(pixels);
    else pixels = undoPalette(pixels, width, height, transform);
  }
  if (pixels.length !== width * height) throw new ImageDecodeError("The image did not decode to its stated size.");
  return { width, height, argb: pixels };
}

/** Decodes a `.webp` file holding one lossless image. Throws `ImageDecodeError` for anything else. */
export function decodeLosslessWebp(file: Uint8Array): DecodedImage {
  const text = (offset: number) => String.fromCharCode(file[offset]!, file[offset + 1]!, file[offset + 2]!, file[offset + 3]!);
  if (file.length < 20 || text(0) !== "RIFF" || text(8) !== "WEBP") throw new ImageDecodeError("This is not a WebP image.");
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let offset = 12;
  while (offset + 8 <= file.length) {
    const kind = text(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > file.length) break;
    if (kind === "VP8L") return decodeBitstream(file.subarray(start, start + size));
    if (kind === "VP8 ") throw new ImageDecodeError("This WebP image is lossy, so it cannot hold exact heights.");
    // Chunks are padded to an even length.
    offset = start + size + (size & 1);
  }
  throw new ImageDecodeError("This WebP file has no image in it.");
}
