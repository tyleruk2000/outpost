/**
 * The coverage map's shades on the dark map, worked out from tokens.css: each class is drawn at
 * `--map-coverage-opacity` over the land, and the lowest must stand 3:1 from the land, or it reads
 * as "no shade" (WCAG 1.4.11). The map layer's opacity is the token's.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_THEME } from "@/features/maps/lib/palette";
import { CELL_OPACITY, CELL_OPACITY_DARK, cellOpacity, propagationLayers } from "./layers";

const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../../styles/tokens.css"), "utf8");
const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'));

const toGamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

/** An OKLCH colour as sRGB, 0 to 1, clipped. */
function srgb([l, c, h]: number[]): number[] {
  const a = c! * Math.cos((h! * Math.PI) / 180);
  const b = c! * Math.sin((h! * Math.PI) / 180);
  const l_ = (l! + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l! - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l! - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((x) => Math.min(1, Math.max(0, toGamma(x))));
}

const hex = (value: string) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
const luminance = (rgb: number[]) => 0.2126 * toLinear(rgb[0]!) + 0.7152 * toLinear(rgb[1]!) + 0.0722 * toLinear(rgb[2]!);
const ratio = (x: number[], y: number[]) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

function darkShade(index: number): number[] {
  const match = new RegExp(`--map-coverage-${index}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(darkBlock);
  expect(match, `--map-coverage-${index} in the dark theme`).not.toBeNull();
  return srgb([Number(match![1]), Number(match![2]), Number(match![3])]);
}

describe("the coverage map's shades on the dark map", () => {
  const land = hex(FALLBACK_THEME.dark.land);
  const opacity = Number(/--map-coverage-opacity:\s*([\d.]+)/.exec(darkBlock)?.[1]);
  const drawn = [1, 2, 3, 4, 5].map((index) => darkShade(index).map((part, at) => part * opacity + land[at]! * (1 - opacity)));

  it("draws the lowest class 3:1 or more from the land, and each class lighter than the one below", () => {
    expect(ratio(drawn[0]!, land)).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < 5; index++) expect(luminance(drawn[index]!)).toBeGreaterThan(luminance(drawn[index - 1]!));
  });

  it("is drawn on the map at the token's opacity", () => {
    expect(CELL_OPACITY_DARK).toBe(opacity);
    expect(cellOpacity(FALLBACK_THEME.dark as never)).toBe(opacity);
    expect(cellOpacity(FALLBACK_THEME.light as never)).toBe(CELL_OPACITY);
    const cells = propagationLayers(FALLBACK_THEME.dark as never).find((layer) => layer.id === "o-propagation-cells");
    expect((cells as { paint: Record<string, unknown> }).paint["fill-opacity"]).toBe(opacity);
  });
});
