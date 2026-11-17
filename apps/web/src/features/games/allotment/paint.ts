/**
 * The allotment drawing's small vocabulary: its colours (each a `--game-*` token in
 * tokens.css, light and dark), boxes, and helpers that fold many small shapes (gravel,
 * tufts, flowers, frost) into one path each, so a busy plot stays a light document.
 * Repeated detail is scattered with a seeded generator, so the plot looks the same on
 * every render and every device.
 */
import type { Hemisphere } from "@outpost/shared/games/allotment";
import { type Rng, seededRng } from "../kit/rng";

export type Tone =
  | "grass-spring"
  | "grass-summer"
  | "grass-autumn"
  | "grass-winter"
  | "grass-shade"
  | "grass-light"
  | "rough"
  | "rough-ground"
  | "hedge"
  | "hedge-deep"
  | "hedge-light"
  | "path"
  | "path-stone"
  | "path-edge"
  | "soil"
  | "soil-wet"
  | "soil-dry"
  | "soil-crack"
  | "soil-crumb"
  | "soil-edge"
  | "wood"
  | "wood-deep"
  | "wood-light"
  | "roof"
  | "roof-light"
  | "shed"
  | "shed-deep"
  | "window"
  | "window-lit"
  | "glow"
  | "leaf"
  | "leaf-deep"
  | "leaf-light"
  | "leaf-blue"
  | "stem-pale"
  | "root"
  | "berry"
  | "beet"
  | "tuber"
  | "bloom"
  | "blossom"
  | "petal"
  | "flower-blue"
  | "leaf-fall"
  | "hen"
  | "egg"
  | "honey"
  | "hive"
  | "hive-shade"
  | "glass"
  | "glass-bar"
  | "glint"
  | "water"
  | "water-light"
  | "metal"
  | "metal-deep"
  | "frost"
  | "snow"
  | "string"
  | "shadow"
  | "dawn"
  | "dusk"
  | "night"
  | "rain"
  | "overcast"
  | "moon";

/** A colour of the plot, as SVG takes it. */
export const v = (tone: Tone) => `var(--game-${tone})`;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Many circles as one path: [x, y, r] each. */
export function circles(list: ReadonlyArray<readonly [number, number, number]>): string {
  return list
    .map(([x, y, r]) => `M${r1(x - r)} ${r1(y)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0`)
    .join("");
}

/** Many short strokes as one path: [x1, y1, x2, y2] each. */
export function strokes(list: ReadonlyArray<readonly [number, number, number, number]>): string {
  return list.map(([a, b, c, d]) => `M${r1(a)} ${r1(b)}L${r1(c)} ${r1(d)}`).join("");
}

/** A tuft of grass at (x, y): three blades, as strokes. */
export const tuft = (x: number, y: number, s = 1): Array<[number, number, number, number]> => [
  [x, y, x - 2 * s, y - 3 * s],
  [x, y, x, y - 3.6 * s],
  [x, y, x + 2 * s, y - 3 * s],
];

/** `n` points scattered in a box by a seeded generator, the same every time. */
export function scatter(
  seed: number,
  n: number,
  { x, y, w, h }: Box,
  keep?: (x: number, y: number) => boolean,
): Array<[number, number, Rng]> {
  const rng = seededRng(seed);
  const out: Array<[number, number, Rng]> = [];
  for (let tries = 0; out.length < n && tries < n * 6; tries++) {
    const px = x + rng() * w;
    const py = y + rng() * h;
    if (!keep || keep(px, py)) out.push([px, py, rng]);
  }
  return out;
}

/** A small leaf or petal, pointed at both ends, at (x, y) turned by `a` radians: a closed path. */
export function leafShape(x: number, y: number, a: number, len = 3, wide = 1.3): string {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const p = (u: number, w: number) => `${r1(x + u * cos - w * sin)} ${r1(y + u * sin + w * cos)}`;
  return `M${p(-len, 0)}Q${p(0, wide * 1.6)} ${p(len, 0)}Q${p(0, -wide * 1.6)} ${p(-len, 0)}Z`;
}

// ── Light ──────────────────────────────────────────────────────────────────

export type Phase = "night" | "dawn" | "day" | "dusk";

export interface Sky {
  phase: Phase;
  /** Which way and how far shadows fall, or null at night. */
  shadow: { dx: number; dy: number } | null;
}

/**
 * The light on the plot: the device's own time of day, set against a day as long as the
 * month's (about 7½ hours at midwinter, 16½ at midsummer, as in the middle latitudes).
 * Shadows fall away from the sun: west in the morning, east in the evening, towards the
 * pole at noon (the top of the plot in the north), long when the sun is low.
 */
export function skyAt(local: Date, northMonth: number, hemisphere: Hemisphere): Sky {
  const hour = local.getHours() + local.getMinutes() / 60;
  const length = 12 + 4.5 * Math.cos((2 * Math.PI * (northMonth - 5.5)) / 12);
  // Noon by the sun falls a little after noon by the clock, more so in summer time.
  const rise = 12.5 - length / 2;
  const set = 12.5 + length / 2;
  const twilight = 1.25;
  const phase: Phase =
    hour < rise - twilight || hour > set + twilight
      ? "night"
      : Math.abs(hour - rise) <= twilight
        ? "dawn"
        : Math.abs(hour - set) <= twilight
          ? "dusk"
          : "day";
  if (phase === "night") return { phase, shadow: null };
  const along = Math.min(0.97, Math.max(0.03, (hour - rise) / length));
  // The sun's height at noon: low in winter, high in summer.
  const noon = 0.3 + 0.55 * ((length - 7.5) / 9);
  const height = Math.max(0.12, Math.sin(Math.PI * along) * noon);
  const reach = Math.min(12, 3 / height);
  const east = Math.cos(Math.PI * along); // 1 at sunrise, -1 at sunset
  const pole = Math.sin(Math.PI * along) * (hemisphere === "north" ? -1 : 1);
  return { phase, shadow: { dx: r1(-east * reach), dy: r1(pole * reach * 0.6) } };
}
