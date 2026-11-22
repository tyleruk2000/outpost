/**
 * Small pieces for drawing printed figures as SVG: the frame, words in the book's
 * typeface, a leader from a part to its label, an arrowhead. diagrams.ts keeps its own
 * copies; these are the same, exported, for drawings that live beside their feature.
 *
 * pdfmake draws the SVG with svg-to-pdfkit: paths, shapes, text, dashes, clip paths and
 * fill opacity are drawn; filters, masks and CSS are not. Keep to those.
 */
import type { Drawing } from "./diagrams";
import { PRINT_COLOURS as C, PRINT_FONT } from "./tokens";

export const escapeSvg = (words: string): string =>
  words.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A drawing `width` by `height` points, from the SVG inside it. */
export const drawing = (width: number, height: number, body: string): Drawing => ({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  width,
  height,
});

export interface SvgTextOptions {
  anchor?: "start" | "middle" | "end";
  bold?: boolean;
  size?: number;
  fill?: string;
  /** Turned about (x, y), in degrees: -90 reads upward. */
  rotate?: number;
}

/** Words in the book's typeface: real text in the PDF, found by a search. */
export const svgText = (x: number, y: number, words: string, options: SvgTextOptions = {}): string =>
  `<text x="${round(x)}" y="${round(y)}" font-family="${PRINT_FONT}" font-size="${options.size ?? 7.5}"${options.bold ? ' font-weight="bold"' : ""} fill="${
    options.fill ?? C.ink
  }" text-anchor="${options.anchor ?? "start"}"${options.rotate ? ` transform="rotate(${options.rotate} ${round(x)} ${round(y)})"` : ""}>${escapeSvg(words)}</text>`;

/** A thin line from a part (a dot at x1, y1) to its label. */
export const svgLeader = (x1: number, y1: number, x2: number, y2: number, colour: string = C.muted): string =>
  `<polyline points="${round(x1)},${round(y1)} ${round(x2)},${round(y2)}" fill="none" stroke="${colour}" stroke-width="0.6"/><circle cx="${round(x1)}" cy="${round(y1)}" r="1.3" fill="${colour}"/>`;

/** An arrowhead with its point at (x, y), pointing along `angle` degrees (0 is to the right, 90 down). */
export const svgArrowHead = (x: number, y: number, angle: number, colour: string = C.ink, size = 5): string =>
  `<path d="M0,0 L${-size},${-size * 0.52} L${-size},${size * 0.52} Z" fill="${colour}" transform="translate(${round(x)} ${round(y)}) rotate(${round(angle)})"/>`;

/** A swatch and its words, for a key under a drawing. Answers the SVG and how wide it came to. */
export function svgKeyItem(
  x: number,
  y: number,
  swatch: { fill?: string; stroke?: string; dash?: string; line?: boolean },
  words: string,
): { svg: string; width: number } {
  const mark = swatch.line
    ? `<line x1="${x}" y1="${y - 2.6}" x2="${x + 14}" y2="${y - 2.6}" stroke="${swatch.stroke ?? C.ink}" stroke-width="2"${swatch.dash ? ` stroke-dasharray="${swatch.dash}"` : ""}/>`
    : `<rect x="${x}" y="${y - 7}" width="10" height="8" fill="${swatch.fill ?? "none"}" stroke="${swatch.stroke ?? C.muted}" stroke-width="0.6"/>`;
  const gap = swatch.line ? 18 : 13;
  // Atkinson Hyperlegible Next at 7 pt averages a little over half its size a letter.
  return { svg: mark + svgText(x + gap, y, words, { size: 7 }), width: gap + words.length * 3.9 + 10 };
}

export const round = (value: number): number => Math.round(value * 100) / 100;
