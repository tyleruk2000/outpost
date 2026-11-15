/**
 * The design tokens are OKLCH; MapLibre paints with sRGB. These convert a token as the
 * browser reports it ("oklch(0.45 0.074 200)") into a hex colour the map can use, so the
 * map's land, water and outlines come from the same tokens as the page around it.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Parses "oklch(L C H)" (L as a number or a percentage; an alpha part is ignored). */
export function parseOklch(text: string): Oklch | null {
  const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)$/i.exec(text.trim());
  if (!match) return null;
  const lightness = match[1]!.endsWith("%") ? Number.parseFloat(match[1]!) / 100 : Number(match[1]);
  const chroma = Number(match[2]);
  const hue = Number(match[3]);
  if (![lightness, chroma, hue].every(Number.isFinite)) return null;
  return { l: lightness, c: chroma, h: hue };
}

const encode = (linear: number) => {
  const value = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
};

/** OKLCH to "#rrggbb". Colours outside sRGB are clipped per channel, which is fine at token chroma. */
export function oklchToHex({ l, c, h }: Oklch): string {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const green = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const blue = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return `#${[red, green, blue].map((channel) => encode(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** A point between two OKLCH colours; `amount` 0 is `from`, 1 is `to`. Hue takes the short way round. */
export function mixOklch(from: Oklch, to: Oklch, amount: number): Oklch {
  let delta = to.h - from.h;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return {
    l: from.l + (to.l - from.l) * amount,
    c: from.c + (to.c - from.c) * amount,
    h: (from.h + delta * amount + 360) % 360,
  };
}

/** A token value as hex. Hex values pass through; anything unreadable gives the fallback. */
export function tokenToHex(value: string, fallback: string): string {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  const parsed = parseOklch(text);
  return parsed ? oklchToHex(parsed) : fallback;
}
