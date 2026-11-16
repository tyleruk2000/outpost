/**
 * How the map is drawn for paper without asking a browser for a canvas it cannot make.
 *
 * What limits a canvas (looked up on 16 November 2026):
 *
 * - iPhones and iPads. WebKit refuses a canvas of more than 4,096 × 4,096 pixels in
 *   area (16,777,216) on iOS; a change of March 2024 raised that to 8,192 × 8,192 for
 *   later versions. A canvas over the limit is not an error: it simply draws nothing.
 *   Source: `maxCanvasArea()` in WebKit's Source/WebCore/html/CanvasBase.cpp, and
 *   https://bugs.webkit.org/show_bug.cgi?id=271002 for the change. MDN says the same of
 *   iOS under "Maximum canvas size" on its page for the canvas element.
 * - iOS also caps the memory of all canvases on a page together. The figure is not
 *   documented; people have reported 224 MB, 256 MB and 384 MB from different
 *   versions and devices (https://bugs.webkit.org/show_bug.cgi?id=195325).
 * - MapLibre keeps its canvas within 4,096 × 4,096 unless told otherwise, lowering the
 *   resolution without saying so when asked for more, and no side may exceed what the
 *   graphics hardware allows (`MAX_RENDERBUFFER_SIZE`, `MAX_VIEWPORT_DIMS`).
 * - Elsewhere the limits are higher (MDN: "in most cases the maximum dimensions exceed
 *   10,000 x 10,000 pixels") and are not what constrains a page.
 *
 * So a page that fits is drawn in one go, and one that does not is drawn in pieces:
 * a grid of smaller pictures, each within the limits, set side by side in the PDF. A
 * piece is drawn a little larger than it is used (the "bleed") on the sides where it
 * meets another, so that a name lying across the join is laid out the same way in both
 * pieces and reads as one. Only if no grid fits is the resolution lowered. Either way
 * the person is told.
 *
 * Pure arithmetic: the limits are passed in, so it can be tested without a browser.
 */
import { MAP_PX_PER_INCH, MAP_PX_STEP } from "./paper";
import type { PixelSize } from "./scale";

/** The resolutions offered, in device pixels to the inch of paper. Each is a multiple of the map's own 120. */
export const RESOLUTIONS = [300, 150] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
/** Tried, without being offered, when even the lower setting will not fit. Half a device pixel to each of the map's. */
const LAST_RESORT = 60;

/** The old iOS limit, which every current browser can meet. */
export const SAFE_CANVAS_AREA = 4096 * 4096;
export const SAFE_CANVAS_SIDE = 4096;
/**
 * On phones and tablets each piece is kept to about four megapixels, much the size of
 * the map already on a phone's screen. Their real limit is memory, which a page cannot
 * ask about and which ends the page without an error when it is passed.
 */
export const SMALL_DEVICE_CANVAS_AREA = 4096 * 1024;

/**
 * How far past its edge a piece is drawn where it meets another, in the map's pixels.
 * MapLibre lays names out with those up to 100 px outside the picture in mind, so two
 * pieces agree about any name that crosses their join.
 */
export const BLEED = 128;

export interface RasterLimits {
  /** The longest side a canvas may have, in device pixels. */
  maxSide: number;
  /** The most device pixels a canvas may hold. */
  maxArea: number;
}

export interface Piece {
  /** Where the piece sits in the map, in the map's pixels from its top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** How much more is drawn on each side, and cut off again before the piece is used. */
  bleed: { left: number; top: number; right: number; bottom: number };
}

export interface RasterPlan {
  /** Device pixels to the inch of paper. */
  dpi: number;
  /** Device pixels to each of the map's pixels. */
  pixelRatio: number;
  columns: number;
  rows: number;
  pieces: Piece[];
  /** The whole picture, in device pixels. */
  width: number;
  height: number;
  /** True when the resolution asked for could not be had and a lower one is used. */
  reduced: boolean;
}

/** Cuts a length into `count` parts that each start on a whole step. */
function cuts(length: number, count: number): number[] {
  const edges = [0];
  for (let index = 1; index < count; index += 1) edges.push(Math.round((length * index) / count / MAP_PX_STEP) * MAP_PX_STEP);
  edges.push(length);
  return edges;
}

function grid(pixels: PixelSize, columns: number, rows: number): Piece[] {
  const xs = cuts(pixels.width, columns);
  const ys = cuts(pixels.height, rows);
  const pieces: Piece[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      pieces.push({
        x: xs[column]!,
        y: ys[row]!,
        width: xs[column + 1]! - xs[column]!,
        height: ys[row + 1]! - ys[row]!,
        bleed: {
          left: column > 0 ? BLEED : 0,
          top: row > 0 ? BLEED : 0,
          right: column < columns - 1 ? BLEED : 0,
          bottom: row < rows - 1 ? BLEED : 0,
        },
      });
    }
  }
  return pieces;
}

/** The canvas a piece needs, in device pixels. */
export function pieceCanvas(piece: Piece, pixelRatio: number): PixelSize {
  return {
    width: (piece.width + piece.bleed.left + piece.bleed.right) * pixelRatio,
    height: (piece.height + piece.bleed.top + piece.bleed.bottom) * pixelRatio,
  };
}

const fits = (pieces: Piece[], pixelRatio: number, limits: RasterLimits) =>
  pieces.every((piece) => {
    const canvas = pieceCanvas(piece, pixelRatio);
    return canvas.width <= limits.maxSide && canvas.height <= limits.maxSide && canvas.width * canvas.height <= limits.maxArea;
  });

/** No page needs more pieces than this; past it the resolution is lowered instead. */
const MAX_PIECES = 16;

/**
 * The fewest pieces that draw a map of `pixels` at the resolution asked for, or at the
 * highest lower one that can be had at all.
 */
export function planRaster(pixels: PixelSize, asked: Resolution, limits: RasterLimits): RasterPlan | null {
  const candidates = [...RESOLUTIONS.filter((dpi) => dpi <= asked), LAST_RESORT];
  for (const dpi of candidates) {
    const pixelRatio = dpi / MAP_PX_PER_INCH;
    let best: { columns: number; rows: number; pieces: Piece[] } | undefined;
    for (let count = 1; count <= MAX_PIECES && !best; count += 1) {
      for (let columns = 1; columns <= count; columns += 1) {
        if (count % columns !== 0) continue;
        const rows = count / columns;
        // A piece narrower than its bleed is no saving.
        if (pixels.width / columns < BLEED * 2 || pixels.height / rows < BLEED * 2) continue;
        const pieces = grid(pixels, columns, rows);
        if (fits(pieces, pixelRatio, limits)) {
          best = { columns, rows, pieces };
          break;
        }
      }
    }
    if (best) {
      return { dpi, pixelRatio, ...best, width: pixels.width * pixelRatio, height: pixels.height * pixelRatio, reduced: dpi !== asked };
    }
  }
  return null;
}

/** What a plan means, said to the person. Empty when the page is drawn whole at the resolution asked for. */
export function planNote(plan: RasterPlan, asked: Resolution): string {
  const parts: string[] = [];
  if (plan.reduced) {
    parts.push(`This device cannot draw the page at ${asked} dots per inch, so it is drawn at ${plan.dpi}.`);
  }
  if (plan.pieces.length > 1) {
    parts.push(
      `The map is drawn in ${plan.pieces.length} pieces to stay within what this device can draw at once, and joined in the file.`,
    );
  }
  return parts.join(" ");
}
