/**
 * Reads the JSON of a ```viz block into a figure specification, or refuses it.
 *
 * In LogBook73 these blocks come only from its own handbook, so the drawing code trusts
 * them. In Outpost any Markdown file may hold one. So nothing reaches the drawing code
 * as written: every field is read by name, numbers are made finite and kept within the
 * range the figure is drawn in, lists are capped at what a figure can show, and text is
 * kept as text and cut to a sensible length. Anything that is not a figure at all gives
 * null, and the block is then shown as the text it is.
 */
import type { Callout, DisplayRow, SpectrumComponent, TraceSpec, VizSpec } from "./radio-viz-maths";

/** Longer than any figure in the handbook by a wide margin. */
const MAX_SOURCE = 64 * 1024;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);

function number(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value !== "" ? value.slice(0, max) : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Leaves out what was not given, so a spec that was already well formed comes back as it was written. */
function compact<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) if (value[key] === undefined) delete value[key];
  return value;
}

const TYPES = ["wave", "spectrum", "response", "polar", "constellation", "waterfall", "device", "display"] as const;
const TRACE_KINDS = ["sine", "am", "fm", "cw", "square", "noise", "beat", "product", "envelope", "points"] as const;
const STYLES = ["solid", "dashed", "faint"] as const;
const TONES = ["primary", "ink", "muted", "success", "danger"] as const;
const MASKS = ["lowpass", "highpass", "bandpass", "notch"] as const;
const CURVES = ["lowpass", "highpass", "bandpass", "notch", "swr", "resonance"] as const;
const PATTERNS = ["dipole", "omni", "yagi", "cardioid"] as const;
const PRESETS = ["bpsk", "qpsk", "qam16"] as const;
const SIGNALS = ["carrier", "cw", "ssb", "ft8", "fm", "drift"] as const;

function trace(value: unknown): TraceSpec[] {
  if (!isObject(value)) return [];
  const kind = oneOf(value.kind, TRACE_KINDS);
  if (!kind) return [];
  const pattern = list(value.pattern, 64).flatMap((unit) => number(unit, 0, 1000) ?? []);
  const points = list(value.points, 2000).flatMap((point): Array<[number, number]> => {
    const [x, y] = Array.isArray(point) ? point : [];
    const px = number(x, 0, 1);
    const py = number(y, -1, 1);
    return px === undefined || py === undefined ? [] : [[px, py]];
  });
  return [
    compact({
      kind,
      // A plot is sampled 480 times across; more cycles than that draws nothing but a block.
      freq: number(value.freq, 0, 240),
      mod: number(value.mod, 0, 240),
      depth: number(value.depth, 0, 50),
      amp: number(value.amp, -1, 1),
      phase: number(value.phase, -36000, 36000),
      // An all-zero pattern has no length to divide the plot by.
      pattern: Array.isArray(value.pattern) && pattern.some((unit) => unit > 0) ? pattern : undefined,
      points: Array.isArray(value.points) ? points : undefined,
      label: text(value.label, 80),
      style: oneOf(value.style, STYLES),
      tone: oneOf(value.tone, TONES),
    }),
  ];
}

function component(value: unknown): SpectrumComponent[] {
  if (!isObject(value)) return [];
  const f = number(value.f, 0, 100);
  const amp = number(value.amp, 0, 1);
  if (f === undefined || amp === undefined) return [];
  return [compact({ f, amp, label: text(value.label, 80), tone: oneOf(value.tone, TONES), width: number(value.width, 0, 100) })];
}

function callout(value: unknown): Callout[] {
  if (!isObject(value)) return [];
  const n = number(value.n, 0, 99);
  const x = number(value.x, -20, 120);
  const y = number(value.y, -40, 140);
  const label = text(value.label, 240);
  if (n === undefined || x === undefined || y === undefined || label === undefined) return [];
  return [compact({ n: Math.round(n), x, y, label, side: oneOf(value.side, ["left", "right"] as const) })];
}

function displayRow(value: unknown): DisplayRow[] {
  if (!isObject(value)) return [];
  const freq = text(value.freq, 24);
  if (freq === undefined) return [];
  return [
    compact({
      freq,
      vfo: text(value.vfo, 12),
      power: text(value.power, 12),
      bw: text(value.bw, 12),
      shift: text(value.shift, 12),
      tone: text(value.tone, 12),
      zone: text(value.zone, 40),
      mode: text(value.mode, 12),
      active: typeof value.active === "boolean" ? value.active : undefined,
    }),
  ];
}

const tags = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? list(value, 8).flatMap((tag) => text(tag, 16) ?? []) : undefined;

/** A figure specification, checked and bounded, or null when the text is not one. */
export function readVizSpec(source: string): VizSpec | null {
  if (source.length > MAX_SOURCE) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  const type = oneOf(raw.type, TYPES);
  if (!type) return null;

  const mask = isObject(raw.mask) ? raw.mask : undefined;
  const maskKind = oneOf(mask?.kind, MASKS);
  const curve = isObject(raw.curve) ? raw.curve : undefined;
  const curvePreset = oneOf(curve?.preset, CURVES);
  const device = isObject(raw.device) ? raw.device : undefined;
  const screen = isObject(raw.screen) ? raw.screen : undefined;

  return compact<VizSpec>({
    type,
    title: text(raw.title, 200),
    caption: text(raw.caption, 600),
    xLabel: text(raw.xLabel, 80),
    yLabel: text(raw.yLabel, 80),
    traces: Array.isArray(raw.traces) ? list(raw.traces, 5).flatMap(trace) : undefined,
    components: Array.isArray(raw.components) ? list(raw.components, 14).flatMap(component) : undefined,
    noiseFloor: number(raw.noiseFloor, 0, 1),
    mask: mask && maskKind ? { kind: maskKind, from: number(mask.from, 0, 100) ?? 0, to: number(mask.to, 0, 100) ?? 100 } : undefined,
    curve:
      curve && curvePreset
        ? compact({
            preset: curvePreset,
            // The curve divides by the centre frequency and the bandwidth; neither may be nothing.
            f0: number(curve.f0, 1, 100),
            bw: number(curve.bw, 0.5, 200),
            order: number(curve.order, 1, 8),
          })
        : undefined,
    markers: Array.isArray(raw.markers)
      ? list(raw.markers, 12).flatMap((marker) => {
          const x = isObject(marker) ? number(marker.x, 0, 100) : undefined;
          const label = isObject(marker) ? text(marker.label, 80) : undefined;
          return x === undefined || label === undefined ? [] : [{ x, label }];
        })
      : undefined,
    pattern: oneOf(raw.pattern, PATTERNS),
    preset: oneOf(raw.preset, PRESETS),
    points: Array.isArray(raw.points)
      ? list(raw.points, 32).flatMap((point): Array<[number, number, string?]> => {
          const [i, q, label] = Array.isArray(point) ? point : [];
          const pi = number(i, -1.2, 1.2);
          const pq = number(q, -1.2, 1.2);
          if (pi === undefined || pq === undefined) return [];
          const name = text(label, 16);
          return [name === undefined ? [pi, pq] : [pi, pq, name]];
        })
      : undefined,
    signals: Array.isArray(raw.signals)
      ? list(raw.signals, 10).flatMap((signal) => {
          const f = isObject(signal) ? number(signal.f, 0, 100) : undefined;
          if (!isObject(signal) || f === undefined) return [];
          return [compact({ f, width: number(signal.width, 0, 100), kind: oneOf(signal.kind, SIGNALS) })];
        })
      : undefined,
    callouts: Array.isArray(raw.callouts) ? list(raw.callouts, 14).flatMap(callout) : undefined,
    device: device
      ? compact({
          screenRows: number(device.screenRows, 1, 4),
          keypad: typeof device.keypad === "boolean" ? device.keypad : undefined,
          nav: oneOf(device.nav, ["pad", "updown"] as const),
          sideKeys: number(device.sideKeys, 0, 3),
        })
      : undefined,
    screen: screen
      ? compact({
          rows: Array.isArray(screen.rows) ? list(screen.rows, 3).flatMap(displayRow) : undefined,
          bottomTags: tags(screen.bottomTags),
          topIcons: tags(screen.topIcons),
        })
      : undefined,
  });
}
