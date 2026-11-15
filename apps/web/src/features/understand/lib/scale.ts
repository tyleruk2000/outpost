/** Small scale helpers for hand-drawn charts. Pure, so they can be tested without a browser. */

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface LinearScale {
  (value: number): number;
  invert(pixel: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
}

/** Maps a number in `domain` to a position in `range`. A flat domain maps everything to the start of the range. */
export function linear(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((value: number) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0))) as LinearScale;
  scale.invert = (pixel: number) => (r1 === r0 ? d0 : d0 + ((pixel - r0) / (r1 - r0)) * span);
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/** A step of 1, 2 or 5 times a power of ten that gives about `count` intervals over `span`. */
export function niceStep(span: number, count = 5): number {
  if (!(span > 0) || count < 1) return 1;
  const rough = span / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  const nice = unit >= 7.5 ? 10 : unit >= 3.5 ? 5 : unit >= 1.5 ? 2 : 1;
  return nice * power;
}

/** Round tick values covering `min` to `max`, ending on or just past `max`. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, count);
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let index = 0; index < 200; index += 1) {
    // Multiply rather than add, so that 0.1 steps do not drift.
    const value = Number((first + index * step).toPrecision(12));
    ticks.push(value);
    if (value >= max - step * 1e-9) break;
  }
  return ticks;
}

/** The last nice tick: a round number at or above `max`, used as the top of an axis. */
export function niceMax(max: number, count = 5): number {
  if (!(max > 0)) return 1;
  const ticks = niceTicks(0, max, count);
  return ticks[ticks.length - 1] ?? max;
}

/** A number with just enough decimals for its size: 12, 3.4, 0.56, 0.012. */
export function formatValue(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value).toLocaleString("en-GB");
  const decimals = clamp(digits - 1 - Math.floor(Math.log10(abs)), 0, 6);
  return Number(value.toFixed(decimals)).toLocaleString("en-GB", { maximumFractionDigits: decimals });
}

/** Milliseconds as people read them: "0.4 ms", "12 ms", "1.2 s". */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 10) return `${Math.round(ms)} ms`;
  if (ms < 0.1) return "under 0.1 ms";
  return `${Number(ms.toFixed(1))} ms`;
}

/** A share between 0 and 1 as a percentage that never rounds a real share down to "0%". */
export function formatShare(share: number): string {
  if (!(share > 0)) return "0%";
  const percent = share * 100;
  if (percent < 1) return "under 1%";
  return `${percent < 10 ? Number(percent.toFixed(1)) : Math.round(percent)}%`;
}

/** Cuts text to about `width` pixels at an average glyph width, for SVG labels that cannot use CSS ellipsis. */
export function fitText(text: string, width: number, glyph = 6.4): string {
  const room = Math.floor(width / glyph);
  if (text.length <= room) return text;
  if (room <= 1) return "";
  return `${text.slice(0, Math.max(1, room - 1)).trimEnd()}…`;
}
