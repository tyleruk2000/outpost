/** The few parts of fontkit 3 (MIT) the print kit uses to draw a drawing's right-to-left words (rtl.ts). */
declare module "fontkit/core" {
  export interface PathCommand {
    command: "moveTo" | "lineTo" | "quadraticCurveTo" | "bezierCurveTo" | "closePath";
    args: number[];
  }
  export interface Glyph {
    path: { commands: PathCommand[] };
  }
  export interface GlyphPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }
  export interface Font {
    unitsPerEm: number;
    layout(text: string): { glyphs: Glyph[]; positions: GlyphPosition[] };
  }
  export function create(buffer: Uint8Array): Font;
  export function registerFormat(format: unknown): void;
  export function registerShaper(shaper: unknown): void;
}
declare module "fontkit/formats/TTFFont" {
  export const TTFFont: unknown;
}
declare module "fontkit/shapers/ArabicShaper" {
  export const ArabicShaper: unknown;
}
declare module "fontkit/shapers/HebrewShaper" {
  export const HebrewShaper: unknown;
}
