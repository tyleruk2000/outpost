/**
 * Reads a retail barcode from a picture: EAN-13, UPC-A (an EAN-13 that starts with 0),
 * EAN-8 and Code 128. Used where the browser has no `BarcodeDetector` of its own, which
 * is every browser on an iPhone, and on a photo taken through a file input, which works
 * at a plain http address where the camera itself is refused.
 *
 * Why it is written here and not taken from a library: the formats that matter on a tin
 * are a few hundred lines to read, the libraries that read them (ZXing's JavaScript
 * port, Quagga2) are general toolkits many times the size, and none is needed for
 * anything else. The method is the classic one for one-dimensional codes:
 *
 * 1. Lines are laid across the picture at twelve angles (every 15 degrees) and nine
 *    offsets, and the brightness along each is sampled.
 * 2. Each line is cut into dark and light runs against a threshold that follows the
 *    local light (half way between the darkest and lightest nearby), so a shadow
 *    across half the code does not hide it. Edges are placed between pixels where the
 *    brightness crosses the threshold, which keeps narrow bars measurable when blurred.
 * 3. The runs are matched against each format's patterns, both ways round (the code
 *    may be upside down). A digit's four runs are compared by their widths and by the
 *    distances between like edges, which blur does not change.
 * 4. A read counts only if its check digit (EAN, UPC) or checksum (Code 128) is right.
 *    Lines that read the same number are counted, and the number most lines agree on
 *    wins.
 *
 * What it does not read: UPC-E (the short code on small American packets), QR codes
 * and other two-dimensional codes, ITF-14 on outer cases, codes curved round a narrow
 * tin so far that no straight line crosses them, and codes smaller than about one pixel
 * a bar. The tests (decode.test.ts) say how far blur, angle and uneven light can go.
 *
 * Nothing here touches the page or the network: pixels in, a number out.
 */

export type BarcodeFormat = "ean_13" | "upc_a" | "ean_8" | "code_128";

export interface BarcodeRead {
  format: BarcodeFormat;
  text: string;
  /** How many lines across the picture read it. */
  count: number;
}

/** A picture as one brightness byte per pixel, row by row. */
export interface Luma {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/** RGBA (as a canvas gives it) to brightness, by the Rec. 601 weights. */
export function toLuma(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Luma {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 1, j += 4) data[i] = (rgba[j]! * 299 + rgba[j + 1]! * 587 + rgba[j + 2]! * 114) / 1000;
  return { data, width, height };
}

// ── Patterns ────────────────────────────────────────────────────────────────

/** EAN and UPC digits, as the widths of their four runs in modules: L codes (and R codes, which have the same widths). */
const L_CODES = ["3211", "2221", "2122", "1411", "1132", "1231", "1114", "1312", "1213", "3112"].map((code) => [...code].map(Number));
/** G codes are L codes backwards. */
const G_CODES = L_CODES.map((code) => [...code].reverse());
/** Which of the first six digits of an EAN-13 are G codes ("1"), for each first digit. */
const PARITY = ["000000", "001011", "001101", "001110", "010011", "011001", "011100", "010101", "010110", "011010"];

/** Code 128: the widths of the six runs of each of the 107 symbols in modules (106, the stop, has seven). */
export const CODE128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
].map((code) => [...code].map(Number));
const STOP = 106;

// ── Reading a line ──────────────────────────────────────────────────────────

/** Brightness along a line through (cx, cy) in the direction (dx, dy), from one edge of the picture to the other, one sample a pixel. */
function sampleLine(image: Luma, cx: number, cy: number, dx: number, dy: number): Float32Array {
  const { width, height, data } = image;
  let tMin = Number.NEGATIVE_INFINITY;
  let tMax = Number.POSITIVE_INFINITY;
  const clip = (origin: number, direction: number, limit: number) => {
    if (Math.abs(direction) < 1e-9) {
      if (origin < 0 || origin > limit) tMin = tMax = 0;
      return;
    }
    const a = (0 - origin) / direction;
    const b = (limit - origin) / direction;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
  };
  clip(cx, dx, width - 1.001);
  clip(cy, dy, height - 1.001);
  if (!(tMax > tMin)) return new Float32Array(0);
  const length = Math.floor(tMax - tMin);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const x = cx + (tMin + i) * dx;
    const y = cy + (tMin + i) * dy;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = y0 * width + x0;
    const top = data[at]! + (data[at + 1]! - data[at]!) * fx;
    const bottom = data[at + width]! + (data[at + width + 1]! - data[at + width]!) * fx;
    out[i] = top + (bottom - top) * fy;
  }
  return out;
}

/**
 * Runs of dark and light along a line, as widths in pixels, starting with a light run.
 * The threshold at each point is half way between the darkest and lightest brightness
 * within `radius`; where those are close, the line is taken as plain background.
 */
export function runsOf(profile: Float32Array): number[] {
  const n = profile.length;
  if (n < 30) return [];
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i += 1) smooth[i] = (profile[Math.max(0, i - 1)]! + 2 * profile[i]! + profile[Math.min(n - 1, i + 1)]!) / 4;
  let globalMin = 255;
  let globalMax = 0;
  for (const value of smooth) {
    if (value < globalMin) globalMin = value;
    if (value > globalMax) globalMax = value;
  }
  const minContrast = Math.max(16, (globalMax - globalMin) * 0.2);
  const radius = Math.max(12, Math.round(n / 24));
  const lows = slidingExtreme(smooth, radius, (a, b) => a < b);
  const highs = slidingExtreme(smooth, radius, (a, b) => a > b);
  const threshold = new Float32Array(n);
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const flat = highs[i]! - lows[i]! < minContrast;
    threshold[i] = (highs[i]! + lows[i]!) / 2;
    dark[i] = !flat && smooth[i]! < threshold[i]! ? 1 : 0;
  }
  const runs: number[] = [];
  let last = 0;
  let state = 0;
  for (let i = 1; i < n; i += 1) {
    if (dark[i] === dark[i - 1]) continue;
    // The edge lies where the brightness crosses the threshold, between the two samples.
    const t = (threshold[i]! + threshold[i - 1]!) / 2;
    const a = smooth[i - 1]!;
    const b = smooth[i]!;
    const at = i - 1 + (Math.abs(b - a) > 1e-6 ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0.5);
    if (runs.length === 0 && dark[i - 1] === 1) runs.push(0);
    runs.push(at - last);
    last = at;
    state = dark[i]!;
  }
  if (runs.length === 0 && state === 0) return [];
  runs.push(n - last);
  return runs;
}

/**
 * Runs found from the edges themselves: where the brightness changes fastest. A blur
 * spreads an edge but leaves where it changes fastest in place, so this keeps narrow
 * bars that the threshold above loses. It works on the logarithm of the brightness, so
 * that a shadow, which multiplies the light, adds a single weak edge where it begins
 * instead of darkening everything after it; of two edges the same way in a row, the
 * stronger is kept.
 */
export function edgeRunsOf(profile: Float32Array): number[] {
  const n = profile.length;
  if (n < 30) return [];
  const log = new Float32Array(n);
  for (let i = 0; i < n; i += 1) log[i] = Math.log(profile[i]! + 8);
  const slope = new Float32Array(n);
  for (let i = 1; i < n - 1; i += 1) slope[i] = (log[i + 1]! - log[i - 1]!) / 2;
  const edges: Array<{ at: number; up: boolean; strength: number }> = [];
  for (let i = 2; i < n - 2; i += 1) {
    const value = slope[i]!;
    if (Math.abs(value) < EDGE_MIN) continue;
    const peak = value > 0 ? value >= slope[i - 1]! && value > slope[i + 1]! : value <= slope[i - 1]! && value < slope[i + 1]!;
    if (!peak) continue;
    // Where the peak lies between the samples, from the parabola through it and its neighbours.
    const a = slope[i - 1]!;
    const c = slope[i + 1]!;
    const bend = a - 2 * value + c;
    const at = i + (Math.abs(bend) > 1e-9 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * bend))) : 0);
    const edge = { at, up: value > 0, strength: Math.abs(value) };
    const last = edges[edges.length - 1];
    if (last && last.up === edge.up) {
      if (edge.strength > last.strength) edges[edges.length - 1] = edge;
    } else edges.push(edge);
  }
  // Light before the first edge down.
  while (edges.length > 0 && edges[0]!.up) edges.shift();
  if (edges.length < 4) return [];
  const runs = [edges[0]!.at];
  for (let i = 1; i < edges.length; i += 1) runs.push(edges[i]!.at - edges[i - 1]!.at);
  runs.push(n - edges[edges.length - 1]!.at);
  return runs;
}

/** The least change of log brightness across two pixels that counts as an edge: about a 30% step. */
const EDGE_MIN = 0.13;

/** The smallest (or largest) value within `radius` of each point, in linear time. */
function slidingExtreme(values: Float32Array, radius: number, better: (a: number, b: number) => boolean): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let i = 0; i < n; i += 1) {
    const end = Math.min(n - 1, i + radius);
    while (next <= end) {
      while (tail > head && !better(values[queue[tail - 1]!]!, values[next]!)) tail -= 1;
      queue[tail++] = next;
      next += 1;
    }
    while (queue[head]! < i - radius) head += 1;
    out[i] = values[queue[head]!]!;
  }
  return out;
}

// ── Matching runs to patterns ───────────────────────────────────────────────

/**
 * How far measured runs are from a pattern, in modules: the widths themselves, and the
 * distances from one edge to the next like edge (bar plus space), which a blur that
 * thickens every bar by the same amount leaves alone. Lower is closer.
 */
function distance(measured: number[], pattern: number[]): number {
  const total = pattern.reduce((sum, value) => sum + value, 0);
  const width = measured.reduce((sum, value) => sum + value, 0);
  if (width <= 0) return Number.POSITIVE_INFINITY;
  const scale = total / width;
  let score = 0;
  for (let i = 0; i < pattern.length; i += 1) score += Math.abs(measured[i]! * scale - pattern[i]!) * 0.5;
  for (let i = 0; i + 1 < pattern.length; i += 1) score += Math.abs((measured[i]! + measured[i + 1]!) * scale - (pattern[i]! + pattern[i + 1]!));
  return score / pattern.length;
}

function best(measured: number[], patterns: number[][], limit: number): { index: number; score: number } | null {
  let index = -1;
  let score = Number.POSITIVE_INFINITY;
  for (let i = 0; i < patterns.length; i += 1) {
    const value = distance(measured, patterns[i]!);
    if (value < score) {
      score = value;
      index = i;
    }
  }
  return score <= limit ? { index, score } : null;
}

const DIGIT_LIMIT = 0.7;
const GUARD_LIMIT = 0.6;

/** Whether runs that should each be one module wide are, near enough, at `module` pixels a module. */
const guard = (runs: number[], module: number) => runs.every((run) => Math.abs(run / module - 1) < GUARD_LIMIT + 0.15 * runs.length);

const checkDigit = (body: string): number => {
  let total = 0;
  for (let index = 0; index < body.length; index += 1) total += (body.charCodeAt(body.length - 1 - index) - 48) * (index % 2 === 0 ? 3 : 1);
  return (10 - (total % 10)) % 10;
};

/** An EAN-13 (or UPC-A) whose start guard is the dark run at `start`. */
function readEan13(runs: number[], start: number): { format: BarcodeFormat; text: string } | null {
  if (start + 59 > runs.length || start < 1) return null;
  const span = runs.slice(start, start + 59);
  const module = span.reduce((sum, value) => sum + value, 0) / 95;
  // A light space before it, at least a few modules wide (the quiet zone, or what is left of it at the picture's edge).
  if (runs[start - 1]! < module * 2.5) return null;
  if (start + 59 < runs.length && runs[start + 59]! < module * 2.5) return null;
  if (!guard(span.slice(0, 3), module) || !guard(span.slice(27, 32), module) || !guard(span.slice(56, 59), module)) return null;
  let digits = "";
  let parity = "";
  for (let d = 0; d < 6; d += 1) {
    const measured = span.slice(3 + d * 4, 7 + d * 4);
    const l = best(measured, L_CODES, DIGIT_LIMIT);
    const g = best(measured, G_CODES, DIGIT_LIMIT);
    if (!l && !g) return null;
    const useG = g !== null && (l === null || g.score < l.score);
    digits += String(useG ? g!.index : l!.index);
    parity += useG ? "1" : "0";
  }
  for (let d = 0; d < 6; d += 1) {
    const r = best(span.slice(32 + d * 4, 36 + d * 4), L_CODES, DIGIT_LIMIT);
    if (!r) return null;
    digits += String(r.index);
  }
  const first = PARITY.indexOf(parity);
  if (first < 0) return null;
  const text = `${first}${digits}`;
  if (checkDigit(text.slice(0, 12)) !== Number(text[12])) return null;
  return first === 0 ? { format: "upc_a", text: text.slice(1) } : { format: "ean_13", text };
}

/** An EAN-8 whose start guard is the dark run at `start`. */
function readEan8(runs: number[], start: number): { format: BarcodeFormat; text: string } | null {
  if (start + 43 > runs.length || start < 1) return null;
  const span = runs.slice(start, start + 43);
  const module = span.reduce((sum, value) => sum + value, 0) / 67;
  if (runs[start - 1]! < module * 2.5) return null;
  if (start + 43 < runs.length && runs[start + 43]! < module * 2.5) return null;
  if (!guard(span.slice(0, 3), module) || !guard(span.slice(19, 24), module) || !guard(span.slice(40, 43), module)) return null;
  let text = "";
  for (let d = 0; d < 4; d += 1) {
    const l = best(span.slice(3 + d * 4, 7 + d * 4), L_CODES, DIGIT_LIMIT);
    if (!l) return null;
    text += String(l.index);
  }
  for (let d = 0; d < 4; d += 1) {
    const r = best(span.slice(24 + d * 4, 28 + d * 4), L_CODES, DIGIT_LIMIT);
    if (!r) return null;
    text += String(r.index);
  }
  if (checkDigit(text.slice(0, 7)) !== Number(text[7])) return null;
  return { format: "ean_8", text };
}

/** A Code 128 whose start symbol begins with the dark run at `start`. */
function readCode128(runs: number[], start: number): { format: BarcodeFormat; text: string } | null {
  if (start + 6 + 6 + 7 > runs.length || start < 1) return null;
  const first = best(runs.slice(start, start + 6), CODE128, 0.5);
  if (!first || first.index < 103 || first.index > 105) return null;
  const module = runs.slice(start, start + 6).reduce((sum, value) => sum + value, 0) / 11;
  if (runs[start - 1]! < module * 4) return null;
  const values = [first.index];
  let at = start + 6;
  for (;;) {
    if (at + 7 <= runs.length) {
      const stop = distance(runs.slice(at, at + 7), CODE128[STOP]!);
      if (stop <= 0.5) {
        if (at + 7 < runs.length && runs[at + 7]! < module * 4) return null;
        break;
      }
    }
    if (at + 6 > runs.length || values.length > 80) return null;
    const symbol = best(runs.slice(at, at + 6), CODE128.slice(0, STOP), 0.5);
    if (!symbol) return null;
    values.push(symbol.index);
    at += 6;
  }
  if (values.length < 3) return null;
  const check = values.pop()!;
  const sum = values.reduce((total, value, index) => total + value * Math.max(1, index), 0);
  if (sum % 103 !== check) return null;
  const text = code128Text(values);
  return text ? { format: "code_128", text } : null;
}

/** The characters Code 128 symbols stand for, through its three code sets. FNC1 to FNC4 are left out. */
export function code128Text(values: number[]): string | null {
  let set: "A" | "B" | "C" = values[0] === 103 ? "A" : values[0] === 104 ? "B" : "C";
  let text = "";
  let shift = false;
  for (const value of values.slice(1)) {
    const current = shift ? (set === "A" ? "B" : "A") : set;
    shift = false;
    if (current === "C") {
      if (value < 100) text += String(value).padStart(2, "0");
      else if (value === 100) set = "B";
      else if (value === 101) set = "A";
      else if (value !== 102) return null;
      continue;
    }
    if (value < 96) {
      if (current === "B") text += String.fromCharCode(value + 32);
      else text += String.fromCharCode(value < 64 ? value + 32 : value - 64);
      continue;
    }
    if (value === 98) shift = true;
    else if (value === 99) set = "C";
    else if (value === 100 && current === "A") set = "B";
    else if (value === 101 && current === "B") set = "A";
    // 96, 97, 102 and the FNC4 of each set are function characters, not text.
  }
  // Control characters (code set A) cannot be typed into the field; a code that holds them is not one to look up.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is what is being checked for
  if (/[\x00-\x1f\x7f]/.test(text)) return null;
  return text || null;
}

/** Every read along one line of runs, both ways round. */
function readRuns(runs: number[], found: (read: { format: BarcodeFormat; text: string }) => void): void {
  for (const sequence of [runs, [...runs].reverse()]) {
    // Runs alternate light, dark, …; whichever way round, every other run is dark.
    const firstDark = sequence === runs ? 1 : runs.length % 2 === 0 ? 0 : 1;
    for (let start = firstDark; start < sequence.length; start += 2) {
      const read = readEan13(sequence, start) ?? readEan8(sequence, start) ?? readCode128(sequence, start);
      if (read) {
        found(read);
        break;
      }
    }
  }
}

const ANGLES = 12;
const OFFSETS = [0, -1, 1, -2, 2, -3, 3, -4, 4];

/**
 * Every barcode read in the picture, the one most lines agree on first. `quick` lays
 * fewer lines, for the frames of a live camera, where the next frame comes soon.
 */
export function decodeBarcodes(image: Luma, options: { quick?: boolean } = {}): BarcodeRead[] {
  const counts = new Map<string, BarcodeRead>();
  const angles = options.quick ? 6 : ANGLES;
  const offsets = options.quick ? OFFSETS.slice(0, 5) : OFFSETS;
  const spacing = Math.min(image.width, image.height) / (offsets.length + 1);
  for (let a = 0; a < angles; a += 1) {
    const angle = (a * Math.PI) / angles;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (const offset of offsets) {
      const cx = image.width / 2 - dy * offset * spacing;
      const cy = image.height / 2 + dx * offset * spacing;
      const profile = sampleLine(image, cx, cy, dx, dy);
      // Each line is read both ways of finding its edges; a code read by either counts once for the line.
      const seen = new Set<string>();
      for (const runs of [edgeRunsOf(profile), runsOf(profile)])
        readRuns(runs, (read) => {
          const key = `${read.format}:${read.text}`;
          if (seen.has(key)) return;
          seen.add(key);
          const entry = counts.get(key);
          if (entry) entry.count += 1;
          else counts.set(key, { ...read, count: 1 });
        });
    }
  }
  // One line alone can be fooled by speckle into a pattern that happens to check; a real code is crossed by many.
  return [...counts.values()].filter((read) => read.count >= 2).sort((a, b) => b.count - a.count);
}

/** The barcode in a picture, or null: the read most lines agree on. */
export function decodeBarcode(image: Luma, options: { quick?: boolean } = {}): BarcodeRead | null {
  return decodeBarcodes(image, options)[0] ?? null;
}
