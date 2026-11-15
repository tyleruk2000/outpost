/**
 * The maths behind signal figures: the shapes of waveforms, filter curves, antenna
 * patterns and constellations, with no drawing in it.
 *
 * Ported from LogBook73 (packages/domain/src/radioViz.ts), copyright (c) 2026 Tyler
 * Allen, MIT licence. The sampling and curve shapes are unchanged, so a figure here is
 * the same picture as in LogBook73. What Outpost adds is in viz-spec.ts: every spec
 * is checked and bounded before any of this sees it, because here a figure can come
 * from any Markdown file a person uploads, not only from the handbook.
 */

export interface TraceSpec {
  kind: "sine" | "am" | "fm" | "cw" | "square" | "noise" | "beat" | "product" | "envelope" | "points";
  /** Cycles across the plot width (carrier for am/fm; f1 for beat/product). */
  freq?: number;
  /** Second frequency (beat/product) or modulating frequency (am/fm/envelope). */
  mod?: number;
  /** AM/envelope modulation depth 0–1, or FM deviation (beta). */
  depth?: number;
  /** 0–1 amplitude scale. */
  amp?: number;
  /** Phase in degrees. */
  phase?: number;
  /** CW keying pattern: on/off unit lengths, e.g. [3,1,1,1,3] (dah dit dah). */
  pattern?: number[];
  /** Explicit [x 0–1, y −1–1] samples (kind: "points"). */
  points?: [number, number][];
  label?: string;
  style?: "solid" | "dashed" | "faint";
  tone?: "primary" | "ink" | "muted" | "success" | "danger";
}

export interface SpectrumComponent {
  /** Position 0–100 across the axis. */
  f: number;
  /** Height 0–1. */
  amp: number;
  label?: string;
  tone?: TraceSpec["tone"];
  /** Render as a band this many units wide (SSB/FM blocks) instead of a line. */
  width?: number;
}

/** A numbered callout: a dot on an illustration, joined to a margin label. */
export interface Callout {
  n: number;
  x: number;
  y: number;
  label: string;
  side?: "left" | "right";
}

/** One frequency row of a stylised radio display. */
export interface DisplayRow {
  freq: string;
  vfo?: string;
  power?: string;
  bw?: string;
  shift?: string;
  tone?: string;
  zone?: string;
  mode?: string;
  active?: boolean;
}

export interface VizSpec {
  type: "wave" | "spectrum" | "response" | "polar" | "constellation" | "waterfall" | "device" | "display";
  title?: string;
  caption?: string;
  xLabel?: string;
  yLabel?: string;
  traces?: TraceSpec[];
  components?: SpectrumComponent[];
  noiseFloor?: number;
  mask?: { kind: "lowpass" | "highpass" | "bandpass" | "notch"; from: number; to: number };
  curve?: {
    preset: "lowpass" | "highpass" | "bandpass" | "notch" | "swr" | "resonance";
    f0?: number;
    bw?: number;
    order?: number;
  };
  markers?: { x: number; label: string }[];
  pattern?: "dipole" | "omni" | "yagi" | "cardioid";
  preset?: "bpsk" | "qpsk" | "qam16";
  points?: [number, number, string?][];
  signals?: {
    f: number;
    width?: number;
    kind?: "carrier" | "cw" | "ssb" | "ft8" | "fm" | "drift";
  }[];
  callouts?: Callout[];
  device?: { screenRows?: number; keypad?: boolean; nav?: "pad" | "updown"; sideKeys?: number };
  screen?: { rows?: DisplayRow[]; bottomTags?: string[]; topIcons?: string[] };
}

/** Deterministic PRNG so noise and waterfall speckle never change between
 * renders — or between platforms. Two devices showing different "random"
 * noise for the same figure would look like a bug in one of them. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

/** Sample one trace as [x 0–1, y −1–1] pairs. */
export function sampleTrace(t: TraceSpec, n = 480): [number, number][] {
  if (t.kind === "points" && t.points) return t.points;
  const amp = t.amp ?? 1;
  const phase = ((t.phase ?? 0) / 360) * TAU;
  const f = t.freq ?? 8;
  const m = t.mod ?? 1;
  const depth = t.depth ?? 0.7;
  const rand = mulberry32(42);
  const out: [number, number][] = [];
  const pat = t.pattern ?? [3, 1, 1, 1, 3];
  const patTotal = pat.reduce((a, b) => a + b, 0);
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    let y = 0;
    switch (t.kind) {
      case "sine":
        y = Math.sin(TAU * f * x + phase);
        break;
      case "square":
        y = Math.sign(Math.sin(TAU * f * x + phase)) * 0.9;
        break;
      case "am":
        y = ((1 + depth * Math.sin(TAU * m * x)) / (1 + depth)) * Math.sin(TAU * f * x + phase);
        break;
      case "envelope":
        y = (1 + depth * Math.sin(TAU * m * x)) / (1 + depth);
        break;
      case "fm":
        y = Math.sin(TAU * f * x + depth * 2 * Math.sin(TAU * m * x) + phase);
        break;
      case "cw": {
        let acc = 0;
        let on = 0;
        for (let s = 0; s < pat.length; s++) {
          const seg = (pat[s] ?? 0) / patTotal;
          if (x >= acc && x < acc + seg) {
            on = s % 2 === 0 ? 1 : 0;
            break;
          }
          acc += seg;
        }
        y = on * Math.sin(TAU * (t.freq ?? 24) * x);
        break;
      }
      case "noise":
        y = (rand() * 2 - 1) * 0.5;
        break;
      case "beat":
        y = (Math.sin(TAU * f * x + phase) + Math.sin(TAU * m * x)) / 2;
        break;
      case "product":
        y = Math.sin(TAU * f * x + phase) * Math.sin(TAU * m * x);
        break;
      default:
        y = 0;
    }
    out.push([x, y * amp]);
  }
  return out;
}

/**
 * A filter/SWR response as y in 0 (drawn at the top) to 1 (drawn at the
 * bottom), for a frequency 0–100.
 *
 * Low-pass and high-pass are flat through the passband and roll off past the
 * cutoff, rather than sagging across it — a beginner reading the figure should
 * see "everything below f0 passes", which is the thing being taught.
 *
 * `swr` INVERTS that axis on purpose: it returns 1 at resonance, so the curve
 * is drawn LOW there. Every SWR figure in the handbook describes a dip — "SWR
 * falls to a minimum at resonance and climbs either side" — so the axis runs
 * high SWR at the top, 1:1 at the bottom, and the caller must label it that
 * way round.
 */
export function responseShape(curve: NonNullable<VizSpec["curve"]>): (f: number) => number {
  const f0 = curve.f0 ?? 50;
  const bw = curve.bw ?? 24;
  const order = curve.order ?? 3;
  const steep = order * 0.9;
  const lp = (x: number): number => 1 / (1 + Math.max(0, x) ** (2 * steep));
  return (f: number): number => {
    switch (curve.preset) {
      case "lowpass":
        return f <= f0 ? 0 : 1 - 1 / (1 + ((f - f0) / (f0 * 0.28)) ** (2 * steep));
      case "highpass":
        return f >= f0 ? 0 : 1 - 1 / (1 + ((f0 - f) / (f0 * 0.28)) ** (2 * steep));
      case "bandpass":
      case "resonance":
        return 1 - lp(Math.abs(f - f0) / (bw / 2));
      case "notch":
        return lp(Math.abs(f - f0) / (bw / 2));
      case "swr": {
        // High at the edges, ~1:1 at resonance; 1–5+ normalised onto 0–1.
        const swr = 1 + 4 * (1 - lp(Math.abs(f - f0) / (bw / 1.2)));
        return 1 - (swr - 1) / 4.2;
      }
      default:
        return 0.5;
    }
  };
}

/** Normalised radius 0–1 of an antenna pattern at an angle in radians. */
export function polarRadius(pattern: VizSpec["pattern"]): (theta: number) => number {
  return (theta: number): number => {
    switch (pattern ?? "dipole") {
      case "omni":
        return 0.85;
      case "dipole":
        return Math.abs(Math.sin(theta));
      case "cardioid":
        return (1 + Math.cos(theta)) / 2;
      case "yagi": {
        const main = Math.max(0, Math.cos(theta)) ** 5;
        const back = 0.18 * Math.max(0, -Math.cos(theta)) ** 2;
        return Math.min(1, 0.06 + main + back);
      }
      default:
        return 0.8;
    }
  };
}

export const CONSTELLATION_PRESETS: Record<string, [number, number, string?][]> = {
  bpsk: [
    [-0.7, 0, "0"],
    [0.7, 0, "1"],
  ],
  qpsk: [
    [0.55, 0.55, "00"],
    [-0.55, 0.55, "01"],
    [-0.55, -0.55, "11"],
    [0.55, -0.55, "10"],
  ],
  qam16: (() => {
    const pts: [number, number, string?][] = [];
    for (const i of [-0.75, -0.25, 0.25, 0.75]) for (const q of [-0.75, -0.25, 0.25, 0.75]) pts.push([i, q]);
    return pts;
  })(),
};
