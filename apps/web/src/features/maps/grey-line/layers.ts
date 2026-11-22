/**
 * How the grey line is drawn: night as a tint that deepens in four steps (the Sun set,
 * then the end of each twilight), the line where the Sun is rising or setting, a fainter
 * broken line at the end of each twilight, and a mark where the Sun is overhead.
 *
 * Night is a tint, never a blanket: at its darkest the ground under it is still read. It
 * is drawn under the map's own names, which keep their contrast (see docs/maps.md).
 * Day and night are not told apart by the tint alone: the whole night is also hatched with
 * fine diagonal lines, which read in either theme and in greyscale (on the dark map a tint
 * alone hardly showed), and the line, the broken lines and the legend say where each is.
 *
 * The shades go beneath the map's names and every overlay, the coverage cells of an HF
 * map among them, so that a cell's colour is not changed by the night over it; the lines
 * go above those cells and beneath everything a person has placed.
 */
import { MAP_FONTS, type MapTheme, UNDER_LABELS } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";

export const GREY_LINE_SOURCE = "o-grey-line";

/** Whether a theme is the dark one, from its page colour. */
function isDark(theme: MapTheme): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(theme.page);
  if (!match) return false;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number.parseInt(part!, 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/**
 * How dark each of the four shades is. They lie one over another, so night is under all
 * four: about 30% ink on the light map and 59% black on the dark one, which is already
 * dark and needs more to show.
 */
export function shadeOpacity(theme: MapTheme): number {
  return isDark(theme) ? 0.2 : 0.085;
}

const kind = (name: string) => ["==", ["get", "kind"], name] as never;

/** The name of the hatching's picture: the colour it is drawn in is part of the name, so each theme has its own. */
const HATCH_PREFIX = "grey-line-hatch-";

export function hatchImageId(theme: MapTheme): string {
  return `${HATCH_PREFIX}${theme.ink.replace("#", "").toLowerCase()}`;
}

/** The side of the hatching's tile, in the map's pixels: a line every 6 px, at 45°. */
const HATCH_TILE = 6;

/**
 * Draws the tile of the night's hatching that `id` names, at `ratio` device pixels to each of the map's: a diagonal line
 * in the theme's ink, half seen, that meets the next tile's at every edge. Null when `id` is not the hatching's, or the
 * browser gives no canvas to draw on.
 */
export function drawHatchImage(id: string, ratio: number): ImageData | null {
  if (!id.startsWith(HATCH_PREFIX)) return null;
  const hex = id.slice(HATCH_PREFIX.length);
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const side = Math.round(HATCH_TILE * ratio);
  const canvas = typeof OffscreenCanvas === "undefined" ? document.createElement("canvas") : new OffscreenCanvas(side, side);
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  context.strokeStyle = `#${hex}`;
  context.globalAlpha = 0.5;
  context.lineWidth = ratio;
  context.lineCap = "square";
  // The diagonal, and its two ends again at the far corners, so the lines run on unbroken from tile to tile.
  for (const [x0, y0, x1, y1] of [
    [0, side, side, 0],
    [-side, side, side, -side],
    [0, 2 * side, 2 * side, 0],
  ] as const) {
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.stroke();
  }
  return context.getImageData(0, 0, side, side);
}

/** The night and the twilights, beneath every other overlay. */
export function greyLineShadeLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-grey-line-shade",
      type: "fill",
      source: GREY_LINE_SOURCE,
      filter: kind("shade"),
      // Under the map's own names: they keep their contrast at night.
      metadata: UNDER_LABELS,
      // No outline: the pieces of a shade meet at the 180° meridian, and an outline would draw a seam there.
      paint: { "fill-color": isDark(theme) ? "#000000" : theme.ink, "fill-opacity": shadeOpacity(theme), "fill-antialias": false },
    },
    // The whole night (from the Sun set) hatched once, over the tint: the pattern, not only the darkness, says night.
    {
      id: "o-grey-line-hatch",
      type: "fill",
      source: GREY_LINE_SOURCE,
      filter: ["all", kind("shade"), ["==", ["get", "step"], 0]] as never,
      metadata: UNDER_LABELS,
      paint: { "fill-pattern": hatchImageId(theme), "fill-antialias": false },
    },
  ];
}

/** The lines and the mark where the Sun is overhead, above the coverage cells and beneath places, routes and tools. */
export function greyLineLineLayers(theme: MapTheme): LayerSpecification[] {
  return [
    // The ends of the twilights: thin and broken, so the line itself stands out from them.
    {
      id: "o-grey-line-twilight",
      type: "line",
      source: GREY_LINE_SOURCE,
      filter: ["all", kind("edge"), [">", ["get", "step"], 0]] as never,
      paint: { "line-color": theme.ink, "line-width": 0.8, "line-opacity": 0.4, "line-dasharray": [2, 3] },
    },
    // The Sun rising or setting: solid, cased in the page colour so it holds over dark ground and hill shading.
    {
      id: "o-grey-line-casing",
      type: "line",
      source: GREY_LINE_SOURCE,
      filter: ["all", kind("edge"), ["==", ["get", "step"], 0]] as never,
      layout: { "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": 4, "line-opacity": 0.55 },
    },
    {
      id: "o-grey-line-line",
      type: "line",
      source: GREY_LINE_SOURCE,
      filter: ["all", kind("edge"), ["==", ["get", "step"], 0]] as never,
      layout: { "line-join": "round" },
      paint: { "line-color": theme.ink, "line-width": 1.6, "line-opacity": 0.85 },
    },
    {
      id: "o-grey-line-sun",
      type: "circle",
      source: GREY_LINE_SOURCE,
      filter: kind("sun"),
      paint: { "circle-radius": 6, "circle-color": theme.lamp, "circle-stroke-color": theme.ink, "circle-stroke-width": 1.5 },
    },
    {
      id: "o-grey-line-sun-label",
      type: "symbol",
      source: GREY_LINE_SOURCE,
      filter: kind("sun"),
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-size": 12,
        "text-field": ["get", "label"],
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
  ];
}
