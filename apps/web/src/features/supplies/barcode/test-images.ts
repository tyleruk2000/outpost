/**
 * Barcode pictures made for the tests: the bars of a code drawn into a grey picture,
 * then blurred, turned, shaded and speckled the way a phone's camera spoils them. The
 * encoders are written from the formats' definitions (GS1 General Specifications for
 * EAN and UPC; ISO/IEC 15417 for Code 128) independently of the reader's tables where
 * they can be: the EAN digit widths here are spelled as bars and spaces, not as runs.
 */
import { CODE128, type Luma } from "./decode";

/** EAN digits as seven modules, 1 a bar: the L set. R is L inverted; G is R reversed. */
const L_BITS = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R_BITS = L_BITS.map((bits) => [...bits].map((bit) => (bit === "1" ? "0" : "1")).join(""));
const G_BITS = R_BITS.map((bits) => [...bits].reverse().join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code)) throw new Error("13 digits");
  const parity = PARITY[Number(code[0])]!;
  let bits = "101";
  for (let i = 1; i <= 6; i += 1) bits += (parity[i - 1] === "G" ? G_BITS : L_BITS)[Number(code[i])]!;
  bits += "01010";
  for (let i = 7; i <= 12; i += 1) bits += R_BITS[Number(code[i])]!;
  return `${bits}101`;
}

export function ean8Modules(code: string): string {
  if (!/^\d{8}$/.test(code)) throw new Error("8 digits");
  let bits = "101";
  for (let i = 0; i < 4; i += 1) bits += L_BITS[Number(code[i])]!;
  bits += "01010";
  for (let i = 4; i < 8; i += 1) bits += R_BITS[Number(code[i])]!;
  return `${bits}101`;
}

/** Code 128 in code set B (printable ASCII), with its checksum and stop. */
export function code128Modules(text: string): string {
  const values = [104, ...[...text].map((character) => character.charCodeAt(0) - 32)];
  const check = values.reduce((sum, value, index) => sum + value * Math.max(1, index), 0) % 103;
  let bits = "";
  for (const value of [...values, check, 106]) {
    CODE128[value]!.forEach((width, index) => {
      bits += (index % 2 === 0 ? "1" : "0").repeat(width);
    });
  }
  return bits;
}

/** The bars drawn black on white, `module` pixels a module, with quiet zones of ten modules and a white margin round it. */
export function render(bits: string, module: number, options: { height?: number; margin?: number } = {}): Luma {
  const quiet = 10 * module;
  const margin = options.margin ?? 20;
  const barsWidth = Math.ceil(bits.length * module);
  const width = Math.ceil(barsWidth + 2 * quiet + 2 * margin);
  const height = options.height ?? Math.round(barsWidth * 0.6 + 2 * margin);
  const data = new Uint8Array(width * height).fill(235);
  const left = margin + quiet;
  for (let y = margin; y < height - margin; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Area of the pixel covered by bars, so a fraction of a pixel a module is drawn grey as a camera sees it.
      let covered = 0;
      for (let s = 0; s < 4; s += 1) {
        const at = (x + (s + 0.5) / 4 - left) / module;
        if (at >= 0 && at < bits.length && bits[Math.floor(at)] === "1") covered += 0.25;
      }
      data[y * width + x] = Math.round(235 - covered * (235 - 25));
    }
  }
  return { data, width, height };
}

/** Box blur three times over, which is close to a Gaussian of the same spread. */
export function blur(image: Luma, radius: number): Luma {
  let data = Float32Array.from(image.data);
  const { width, height } = image;
  // Each pixel the mean of those within `radius` along a row or a column, the window cut
  // short at the edges. A running sum slides along each line, so a pass costs the same
  // whatever the radius.
  const pass = (source: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(source.length);
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const step = horizontal ? 1 : width;
    for (let line = 0; line < lines; line += 1) {
      const start = horizontal ? line * width : line;
      let sum = 0;
      for (let k = 0; k <= Math.min(radius, length - 1); k += 1) sum += source[start + k * step]!;
      for (let i = 0; i < length; i += 1) {
        out[start + i * step] = sum / (Math.min(length - 1, i + radius) - Math.max(0, i - radius) + 1);
        if (i + radius + 1 < length) sum += source[start + (i + radius + 1) * step]!;
        if (i - radius >= 0) sum -= source[start + (i - radius) * step]!;
      }
    }
    return out;
  };
  for (let i = 0; i < 3; i += 1) data = pass(pass(data, true), false);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) out[i] = Math.round(data[i]!);
  return { data: out, width, height };
}

/** Turned by `degrees` about its centre onto a canvas big enough to hold it, the corners filled with the background. */
export function rotate(image: Luma, degrees: number): Luma {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const width = Math.ceil(Math.abs(image.width * cos) + Math.abs(image.height * sin));
  const height = Math.ceil(Math.abs(image.width * sin) + Math.abs(image.height * cos));
  const data = new Uint8Array(width * height).fill(235);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const sx = dx * cos + dy * sin + image.width / 2;
      const sy = -dx * sin + dy * cos + image.height / 2;
      if (sx < 0 || sy < 0 || sx >= image.width - 1 || sy >= image.height - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const at = y0 * image.width + x0;
      const topLeft = image.data[at]!;
      const bottomLeft = image.data[at + image.width]!;
      const top = topLeft + (image.data[at + 1]! - topLeft) * fx;
      const bottom = bottomLeft + (image.data[at + image.width + 1]! - bottomLeft) * fx;
      data[y * width + x] = Math.round(top + (bottom - top) * fy);
    }
  }
  return { data, width, height };
}

/** Light that falls off across the picture: each pixel times a factor from `from` at the left to `to` at the right. */
export function shade(image: Luma, from: number, to: number): Luma {
  const data = Uint8Array.from(image.data);
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1)
      data[y * image.width + x] = Math.round(data[y * image.width + x]! * (from + ((to - from) * x) / (image.width - 1)));
  return { ...image, data };
}

/** A shadow over part of the picture: everything right of `fraction` of its width times `factor`. */
export function shadow(image: Luma, fraction: number, factor: number): Luma {
  const data = Uint8Array.from(image.data);
  const edge = Math.round(image.width * fraction);
  for (let y = 0; y < image.height; y += 1)
    for (let x = edge; x < image.width; x += 1) data[y * image.width + x] = Math.round(data[y * image.width + x]! * factor);
  return { ...image, data };
}

/** Speckle of up to ±`amount`, from a fixed seed so that a test sees the same picture every time. */
export function noise(image: Luma, amount: number, seed = 7): Luma {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const data = Uint8Array.from(image.data, (value) => Math.max(0, Math.min(255, Math.round(value + (random() * 2 - 1) * amount))));
  return { ...image, data };
}

/** Scaled down by a whole factor, averaging, as a camera frame is made smaller before it is read. */
export function shrink(image: Luma, factor: number): Luma {
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let j = 0; j < factor; j += 1)
        for (let i = 0; i < factor; i += 1) sum += image.data[(y * factor + j) * image.width + x * factor + i]!;
      data[y * width + x] = Math.round(sum / (factor * factor));
    }
  return { data, width, height };
}
