/**
 * A QR code encoder, written from the method in ISO/IEC 18004:2015 ("QR Code bar code
 * symbology specification"). It runs in the browser and nowhere else: what is encoded
 * never leaves the page.
 *
 * The steps, in the order the standard gives them (section numbers are of the 2015
 * edition):
 *
 *  1. Data analysis (7.4): the text is split into segments in numeric, alphanumeric or
 *     byte mode, whichever makes the shortest bit stream (`segmentsFor`). Byte mode
 *     carries the text as UTF-8. Kanji mode and ECI are not used: phone readers take
 *     byte-mode UTF-8 without an ECI header, and an ECI header is what some older
 *     readers fail on.
 *  2. Data encoding (7.4.2 to 7.4.10): mode indicator, character count, data, then the
 *     terminator, padding to a whole byte, and the pad codewords 0xEC and 0x11.
 *  3. Error correction (7.5): Reed-Solomon over GF(2^8) with the field's polynomial
 *     x^8 + x^4 + x^3 + x^2 + 1 (0x11D), the generator polynomial of degree n being
 *     (x - α^0)(x - α^1)…(x - α^(n-1)), with α = 2. The block structure is Table 9.
 *  4. Interleaving (7.6): data codewords taken a column at a time across the blocks,
 *     then the error-correction codewords the same way.
 *  5. Module placement (7.7): finder, separator, timing and alignment patterns, then
 *     the codewords in two-module columns from the bottom right, up and down.
 *  6. Masking (7.8): each of the eight masks is tried and scored with the four penalty
 *     rules (Table 11); the lowest score wins.
 *  7. Format information (7.9) and, from version 7, version information (7.10), each
 *     with its BCH code.
 *
 * Nothing here draws: the result is a square of booleans (`true` is dark), and the
 * screen turns it into SVG, PNG or a page of a PDF.
 */

export type EcLevel = "L" | "M" | "Q" | "H";
export const EC_LEVELS: readonly EcLevel[] = ["L", "M", "Q", "H"];

export interface QrCode {
  version: number;
  ecLevel: EcLevel;
  /** The mask pattern chosen, 0 to 7. */
  mask: number;
  /** Modules on a side: 17 + 4 × version. */
  size: number;
  /** Row by row; `true` is a dark module. The quiet zone is not included. */
  modules: boolean[][];
  /** The segments the text was written as. */
  segments: Segment[];
}

export type Mode = "numeric" | "alphanumeric" | "byte";

export interface Segment {
  mode: Mode;
  /** Characters for numeric and alphanumeric; bytes for byte mode. */
  count: number;
  /** The data bits, without mode indicator or count. */
  bits: number[];
}

export class QrTooLongError extends Error {
  constructor() {
    super("Too much to fit in a QR code at this level of error correction.");
    this.name = "QrTooLongError";
  }
}

// ── Table 9: error-correction blocks ──────────────────────────────────────────
// Index 0 is unused so that the version is the index.

const EC_CODEWORDS_PER_BLOCK: Record<EcLevel, readonly number[]> = {
  L: [
    0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30,
  ],
};

const EC_BLOCKS: Record<EcLevel, readonly number[]> = {
  L: [
    0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24,
    25,
  ],
  M: [
    0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43,
    45, 47, 49,
  ],
  Q: [
    0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56,
    59, 62, 65, 68,
  ],
  H: [
    0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66,
    70, 74, 77, 81,
  ],
};

/** The two bits that stand for a level in the format information (Table 12). */
const EC_FORMAT_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** How much of the symbol can be damaged and still be read, as the standard puts it (7.5.1). */
export const EC_RECOVERY: Record<EcLevel, string> = { L: "7%", M: "15%", Q: "25%", H: "30%" };

// ── Geometry ──────────────────────────────────────────────────────────────────

export const sizeOf = (version: number) => 17 + 4 * version;

/** Centres of the alignment patterns along one axis (Annex E, Table E.1), worked out rather than tabled. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const positions = [6];
  for (let at = sizeOf(version) - 7; positions.length < count; at -= step) positions.splice(1, 0, at);
  return positions;
}

/** Modules left for data and error correction once every function pattern is placed (Table 1). */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    result -= (25 * count - 10) * count - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords a symbol of this version and level holds (Table 7). */
export function dataCodewords(version: number, level: EcLevel): number {
  return Math.floor(rawDataModules(version) / 8) - EC_CODEWORDS_PER_BLOCK[level][version]! * EC_BLOCKS[level][version]!;
}

// ── Data analysis and encoding ────────────────────────────────────────────────

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const MODE_INDICATOR: Record<Mode, number> = { numeric: 0b0001, alphanumeric: 0b0010, byte: 0b0100 };

/** Bits of the character count indicator (Table 3), by version range 1–9, 10–26, 27–40. */
function countBits(mode: Mode, version: number): number {
  const range = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  return { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] }[mode][range]!;
}

function push(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

const isDigit = (char: string) => char >= "0" && char <= "9";
const isAlphanumeric = (char: string) => ALPHANUMERIC.includes(char);

function numericBits(text: string): number[] {
  const bits: number[] = [];
  for (let i = 0; i < text.length; i += 3) {
    const group = text.slice(i, i + 3);
    push(bits, Number(group), group.length * 3 + 1);
  }
  return bits;
}

function alphanumericBits(text: string): number[] {
  const bits: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2) push(bits, ALPHANUMERIC.indexOf(text[i]!) * 45 + ALPHANUMERIC.indexOf(text[i + 1]!), 11);
  if (text.length % 2 === 1) push(bits, ALPHANUMERIC.indexOf(text[text.length - 1]!), 6);
  return bits;
}

const utf8 = new TextEncoder();

export function makeSegment(mode: Mode, text: string): Segment {
  if (mode === "numeric") return { mode, count: text.length, bits: numericBits(text) };
  if (mode === "alphanumeric") return { mode, count: text.length, bits: alphanumericBits(text) };
  const bytes = utf8.encode(text);
  const bits: number[] = [];
  for (const byte of bytes) push(bits, byte, 8);
  return { mode, count: bytes.length, bits };
}

/** Bits a list of segments takes at a version, headers and all. */
export function segmentsBits(segments: readonly Segment[], version: number): number {
  return segments.reduce((sum, segment) => sum + 4 + countBits(segment.mode, version) + segment.bits.length, 0);
}

const MODES: readonly Mode[] = ["numeric", "alphanumeric", "byte"];

/**
 * The cheapest way to write the text as segments, for the count lengths of one version
 * range: a shortest path over the characters, where each character can be written in
 * any mode that can hold it and changing mode costs a new header. Costs are in sixths
 * of a bit, so that numeric (10 bits for 3 digits) and alphanumeric (11 bits for 2
 * characters) are whole numbers. This is the optimisation Annex J of the standard
 * describes in outline.
 */
export function segmentsFor(text: string, version: number): Segment[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const header = (mode: Mode) => (4 + countBits(mode, version)) * 6;
  const charCost = (mode: Mode, char: string) =>
    mode === "numeric" ? 20 : mode === "alphanumeric" ? 33 : utf8.encode(char).length * 8 * 6;
  const can = (mode: Mode, char: string) => (mode === "numeric" ? isDigit(char) : mode === "alphanumeric" ? isAlphanumeric(char) : true);

  // cost[i][m]: least cost of the first i+1 characters with character i in mode m; from[i][m]: the mode of character i-1.
  const cost: number[][] = [];
  const from: number[][] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i]!;
    cost.push([]);
    from.push([]);
    for (let m = 0; m < MODES.length; m += 1) {
      const mode = MODES[m]!;
      if (!can(mode, char)) {
        cost[i]![m] = Number.POSITIVE_INFINITY;
        from[i]![m] = -1;
        continue;
      }
      if (i === 0) {
        cost[i]![m] = header(mode) + charCost(mode, char);
        from[i]![m] = -1;
        continue;
      }
      let best = Number.POSITIVE_INFINITY;
      let bestFrom = -1;
      for (let p = 0; p < MODES.length; p += 1) {
        // Partial groups (a digit left over, an odd character) are rounded up when the segment ends, so add them on change.
        const previous = cost[i - 1]![p]!;
        const total = previous + (p === m ? 0 : header(mode));
        if (total < best) {
          best = total;
          bestFrom = p;
        }
      }
      cost[i]![m] = best + charCost(mode, char);
      from[i]![m] = bestFrom;
    }
  }
  // Walk back from the cheapest end, rounding each candidate up to whole bits.
  let end = 0;
  for (let m = 1; m < MODES.length; m += 1) if (cost[chars.length - 1]![m]! < cost[chars.length - 1]![end]!) end = m;
  const modes: Mode[] = new Array(chars.length);
  for (let i = chars.length - 1, m = end; i >= 0; i -= 1) {
    modes[i] = MODES[m]!;
    m = from[i]![m]!;
  }
  const segments: Segment[] = [];
  let start = 0;
  for (let i = 1; i <= chars.length; i += 1) {
    if (i === chars.length || modes[i] !== modes[start]) {
      segments.push(makeSegment(modes[start]!, chars.slice(start, i).join("")));
      start = i;
    }
  }
  // The search counts fractional bits; a single byte segment can come out shorter once rounded. Keep the shorter.
  const whole = [makeSegment("byte", text)];
  return segmentsBits(whole, version) <= segmentsBits(segments, version) ? whole : segments;
}

// ── Reed-Solomon over GF(256), polynomial 0x11D ───────────────────────────────

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
}

export function gfMultiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;
}

/** Coefficients of the generator polynomial of the given degree, highest power first, the leading 1 left out. */
export function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = next[j]! ^ poly[j]!;
      next[j + 1] = next[j + 1]! ^ gfMultiply(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly.slice(1);
}

/** The error-correction codewords for one block: the remainder of data × x^n divided by the generator. */
export function reedSolomon(data: readonly number[], degree: number): number[] {
  const generator = generatorPolynomial(degree);
  const remainder = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    for (let i = 0; i < degree; i += 1) remainder[i] = remainder[i]! ^ gfMultiply(generator[i]!, factor);
  }
  return remainder;
}

// ── Codewords ─────────────────────────────────────────────────────────────────

/** The data codewords for these segments in this symbol: headers, data, terminator and padding (7.4). */
export function dataCodewordsFor(segments: readonly Segment[], version: number, level: EcLevel): number[] {
  const capacity = dataCodewords(version, level) * 8;
  const bits: number[] = [];
  for (const segment of segments) {
    push(bits, MODE_INDICATOR[segment.mode], 4);
    push(bits, segment.count, countBits(segment.mode, version));
    bits.push(...segment.bits);
  }
  if (bits.length > capacity) throw new QrTooLongError();
  // Terminator: up to four zeros (7.4.9), then zeros to a whole byte.
  for (let i = 0; i < 4 && bits.length < capacity; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  for (let pad = 0; bytes.length < capacity / 8; pad += 1) bytes.push(pad % 2 === 0 ? 0xec : 0x11);
  return bytes;
}

/** Splits into blocks, adds error correction to each, and interleaves (7.5, 7.6). */
export function finalCodewords(data: readonly number[], version: number, level: EcLevel): number[] {
  const blocks = EC_BLOCKS[level][version]!;
  const ecLength = EC_CODEWORDS_PER_BLOCK[level][version]!;
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortData = Math.floor(raw / blocks) - ecLength;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0, at = 0; b < blocks; b += 1) {
    const length = shortData + (b < shortBlocks ? 0 : 1);
    const block = data.slice(at, at + length);
    at += length;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomon(block, ecLength));
  }
  const out: number[] = [];
  for (let i = 0; i <= shortData; i += 1) for (const block of dataBlocks) if (i < block.length) out.push(block[i]!);
  for (let i = 0; i < ecLength; i += 1) for (const block of ecBlocks) out.push(block[i]!);
  return out;
}

// ── Placement ─────────────────────────────────────────────────────────────────

class Matrix {
  readonly size: number;
  readonly dark: boolean[][];
  readonly fixed: boolean[][];
  constructor(size: number) {
    this.size = size;
    this.dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  /** Row, column. */
  setFixed(row: number, column: number, dark: boolean): void {
    this.dark[row]![column] = dark;
    this.fixed[row]![column] = true;
  }
}

function drawFinder(matrix: Matrix, row: number, column: number): void {
  // The 7×7 pattern and its one-module light separator, clipped at the edge.
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const r = row + dr;
      const c = column + dc;
      if (r < 0 || c < 0 || r >= matrix.size || c >= matrix.size) continue;
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      matrix.setFixed(r, c, ring !== 2 && ring !== 4);
    }
  }
}

function drawFunctionPatterns(matrix: Matrix, version: number): void {
  const size = matrix.size;
  for (let i = 0; i < size; i += 1) {
    matrix.setFixed(6, i, i % 2 === 0);
    matrix.setFixed(i, 6, i % 2 === 0);
  }
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, 0, size - 7);
  drawFinder(matrix, size - 7, 0);
  const centres = alignmentPositions(version);
  for (const r of centres) {
    for (const c of centres) {
      // Not where a finder pattern is.
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1)
        for (let dc = -2; dc <= 2; dc += 1) matrix.setFixed(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  // Reserve the format and version areas; they are written once the mask is known.
  drawFormat(matrix, "L", 0);
  if (version >= 7) drawVersion(matrix, version);
}

/** The 15 bits of format information: level and mask, BCH(15,5) with generator 0x537, masked with 0x5412 (7.9.1). */
export function formatBits(level: EcLevel, mask: number): number {
  const data = (EC_FORMAT_BITS[level] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | (remainder & 0x3ff)) ^ 0x5412;
}

/** The 18 bits of version information: the version, BCH(18,6) with generator 0x1F25 (7.10). */
export function versionBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | (remainder & 0xfff);
}

function drawFormat(matrix: Matrix, level: EcLevel, mask: number): void {
  const bits = formatBits(level, mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const size = matrix.size;
  // Around the top-left finder (Figure 25): bit 0 at the bottom of column 8, turning along row 8.
  for (let i = 0; i <= 5; i += 1) matrix.setFixed(i, 8, bit(i));
  matrix.setFixed(7, 8, bit(6));
  matrix.setFixed(8, 8, bit(7));
  matrix.setFixed(8, 7, bit(8));
  for (let i = 9; i < 15; i += 1) matrix.setFixed(8, 14 - i, bit(i));
  // The copy beside the other two finders.
  for (let i = 0; i < 8; i += 1) matrix.setFixed(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i += 1) matrix.setFixed(size - 15 + i, 8, bit(i));
  // The module that is always dark.
  matrix.setFixed(size - 8, 8, true);
}

function drawVersion(matrix: Matrix, version: number): void {
  const bits = versionBits(version);
  const size = matrix.size;
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    // Above the bottom-left finder, and to the left of the top-right one.
    matrix.setFixed(a, b, dark);
    matrix.setFixed(b, a, dark);
  }
}

function placeCodewords(matrix: Matrix, codewords: readonly number[]): void {
  const size = matrix.size;
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    // The vertical timing pattern is skipped as a whole column.
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let j = 0; j < 2; j += 1) {
        const column = right - j;
        if (matrix.fixed[row]![column]) continue;
        // Remainder bits (7.7.3) are left light.
        if (i < total) matrix.dark[row]![column] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
        i += 1;
      }
    }
  }
}

/** The data-masking conditions of Table 10, with i the row and j the column. */
export const MASKS: ReadonlyArray<(i: number, j: number) => boolean> = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function applyMask(matrix: Matrix, mask: number): void {
  const condition = MASKS[mask]!;
  for (let i = 0; i < matrix.size; i += 1)
    for (let j = 0; j < matrix.size; j += 1) if (!matrix.fixed[i]![j] && condition(i, j)) matrix.dark[i]![j] = !matrix.dark[i]![j];
}

// ── Penalty scores (7.8.3, Table 11) ──────────────────────────────────────────

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/** The four penalty rules over a finished symbol, summed. Exported for its tests. */
export function penalty(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let score = 0;
  const at = (r: number, c: number) => modules[r]![c]!;
  for (let pass = 0; pass < 2; pass += 1) {
    const get = pass === 0 ? at : (r: number, c: number) => at(c, r);
    for (let r = 0; r < size; r += 1) {
      // Rule 1: five or more modules of one colour in a row: 3, plus 1 for each beyond five.
      let run = 1;
      for (let c = 1; c <= size; c += 1) {
        if (c < size && get(r, c) === get(r, c - 1)) run += 1;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      // Rule 3: 1:1:3:1:1 dark-light-dark-light-dark with four light modules on one side: 40. Outside the symbol counts as light.
      const read = (c: number) => (c < 0 || c >= size ? false : get(r, c));
      for (let c = -4; c < size; c += 1) {
        for (const pattern of FINDER_LIKE) {
          let match = true;
          for (let k = 0; k < pattern.length && match; k += 1) if (read(c + k) !== pattern[k]) match = false;
          if (match) score += 40;
        }
      }
    }
  }
  // Rule 2: each 2×2 block of one colour: 3.
  for (let r = 0; r + 1 < size; r += 1)
    for (let c = 0; c + 1 < size; c += 1) {
      const colour = at(r, c);
      if (at(r, c + 1) === colour && at(r + 1, c) === colour && at(r + 1, c + 1) === colour) score += 3;
    }
  // Rule 4: 10 for each full 5% the proportion of dark modules is away from 50%.
  let dark = 0;
  for (const row of modules) for (const module of row) if (module) dark += 1;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

// ── The whole thing ───────────────────────────────────────────────────────────

export interface EncodeOptions {
  ecLevel?: EcLevel;
  /** The smallest version to use. */
  minVersion?: number;
  maxVersion?: number;
  /** Use this mask instead of choosing one by the penalty rules (for tests against published symbols). */
  mask?: number;
  /** Use exactly these segments instead of working them out. */
  segments?: Segment[];
}

/** The smallest version that holds the text at the level, and the segments it is written as. */
export function chooseVersion(text: string, level: EcLevel, minVersion = 1, maxVersion = 40, given?: Segment[]) {
  for (let version = minVersion; version <= maxVersion; version += 1) {
    const segments = given ?? segmentsFor(text, version);
    if (segmentsBits(segments, version) <= dataCodewords(version, level) * 8) return { version, segments };
  }
  throw new QrTooLongError();
}

export function encodeQr(text: string, options: EncodeOptions = {}): QrCode {
  const ecLevel = options.ecLevel ?? "M";
  const { version, segments } = chooseVersion(text, ecLevel, options.minVersion ?? 1, options.maxVersion ?? 40, options.segments);
  const codewords = finalCodewords(dataCodewordsFor(segments, version, ecLevel), version, ecLevel);
  const base = new Matrix(sizeOf(version));
  drawFunctionPatterns(base, version);
  placeCodewords(base, codewords);

  const masked = (mask: number) => {
    const matrix = new Matrix(base.size);
    for (let r = 0; r < base.size; r += 1) {
      matrix.dark[r] = [...base.dark[r]!];
      matrix.fixed[r] = [...base.fixed[r]!];
    }
    applyMask(matrix, mask);
    drawFormat(matrix, ecLevel, mask);
    return matrix;
  };

  let mask = options.mask;
  let best: Matrix | undefined;
  if (mask === undefined) {
    let bestScore = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < 8; candidate += 1) {
      const matrix = masked(candidate);
      const score = penalty(matrix.dark);
      if (score < bestScore) {
        bestScore = score;
        best = matrix;
        mask = candidate;
      }
    }
  } else {
    best = masked(mask);
  }
  return { version, ecLevel, mask: mask!, size: base.size, modules: best!.dark, segments };
}

/** The most bytes of UTF-8 text a symbol holds at a level, in byte mode (version 40). */
export function byteCapacity(level: EcLevel, version = 40): number {
  const bits = dataCodewords(version, level) * 8 - 4 - countBits("byte", version);
  return Math.floor(bits / 8);
}
