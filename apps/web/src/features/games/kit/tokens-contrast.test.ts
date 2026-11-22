/**
 * Game colours that mark a control, worked out from tokens.css in both themes: an empty pile on the
 * solitaire table is a control whose only edge is its outline, so the outline needs 3:1 on the felt
 * (WCAG 1.4.11).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../../styles/tokens.css"), "utf8");

/** Every value of a custom property, in the order written: the light theme first, then the dark. */
function values(name: string): Array<[number, number, number]> {
  const found = [...css.matchAll(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`, "g"))];
  return found.map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
}

/** Relative luminance (WCAG) of an OKLCH colour, clipped to sRGB. */
function luminance([l, c, h]: [number, number, number]): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  const r = clip(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = clip(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = clip(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

const ratio = (x: [number, number, number], y: [number, number, number]) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("game colours", () => {
  it("draws an empty pile's outline at 3:1 or more on the felt, in both themes", () => {
    const felt = values("game-felt");
    const line = values("game-felt-line");
    expect(felt).toHaveLength(2);
    expect(line).toHaveLength(2);
    for (const theme of [0, 1]) expect(ratio(line[theme]!, felt[theme]!)).toBeGreaterThanOrEqual(3);
  });
});
