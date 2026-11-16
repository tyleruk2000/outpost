/**
 * LZW decompression as TIFF uses it (compression 5): codes of 9 to 12 bits, most
 * significant bit first, 256 to clear the table and 257 to end, with the code width
 * growing one code early (the "early change" every TIFF writer since 1992 uses).
 * WorldPop's population grids are written this way.
 */
import { CogError } from "./cog.ts";

const CLEAR = 256;
const END = 257;

/** Decompresses one strip or tile. `expected` bounds the output: more than that is refused as damaged. */
export function lzwDecode(input: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let written = 0;
  // The table holds each code as (prefix code, last byte, length); strings are rebuilt backwards.
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const length = new Uint16Array(4096);
  for (let i = 0; i < 256; i += 1) {
    prefix[i] = -1;
    suffix[i] = i;
    length[i] = 1;
  }
  let next = 258;
  let width = 9;
  let previous = -1;
  let bitPos = 0;
  const totalBits = input.length * 8;

  const read = (): number => {
    if (bitPos + width > totalBits) return END;
    let code = 0;
    for (let i = 0; i < width; i += 1) {
      const bit = (input[(bitPos + i) >> 3]! >> (7 - ((bitPos + i) & 7))) & 1;
      code = (code << 1) | bit;
    }
    bitPos += width;
    return code;
  };
  const emit = (code: number): number => {
    const size = length[code]!;
    if (written + size > expected) throw new CogError("A strip of this GeoTIFF holds more than its picture.");
    let at = written + size - 1;
    let c = code;
    while (c >= 0) {
      out[at] = suffix[c]!;
      at -= 1;
      c = prefix[c]!;
    }
    written += size;
    return out[written - size]!;
  };

  for (;;) {
    const code = read();
    if (code === END) break;
    if (code === CLEAR) {
      next = 258;
      width = 9;
      previous = -1;
      continue;
    }
    if (previous === -1) {
      if (code > 255) throw new CogError("A strip of this GeoTIFF is damaged.");
      emit(code);
      previous = code;
      continue;
    }
    let first: number;
    if (code < next) {
      first = emit(code);
    } else if (code === next) {
      // The code being defined right now: the previous string and its own first byte.
      const start = written;
      emit(previous);
      if (written >= expected) throw new CogError("A strip of this GeoTIFF holds more than its picture.");
      out[written] = out[start]!;
      written += 1;
      first = out[start]!;
    } else {
      throw new CogError("A strip of this GeoTIFF is damaged.");
    }
    if (next < 4096) {
      prefix[next] = previous;
      suffix[next] = first;
      length[next] = length[previous]! + 1;
      next += 1;
    }
    if (next + 1 >= 1 << width && width < 12) width += 1;
    previous = code;
  }
  return written === expected ? out : out.subarray(0, written);
}
