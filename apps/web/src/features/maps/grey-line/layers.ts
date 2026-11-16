/**
 * How the grey line is drawn: night as a tint that deepens in four steps (the Sun set,
 * then the end of each twilight), the line where the Sun is rising or setting, a fainter
 * broken line at the end of each twilight, and a mark where the Sun is overhead.
 *
 * Night is a tint, never a blanket: at its darkest the ground under it is still read, and
 * names under it keep their contrast (measured in docs/maps.md).
 * Day and night are not told apart by the tint alone: the line, the broken lines and the
 * legend say where each is.
 *
 * The shades go beneath every other overlay, the coverage cells of an HF map among them,
 * so that a cell's colour is not changed by the night over it; the lines go above those
 * cells and beneath everything a person has placed.
 */
import { MAP_FONTS, type MapTheme } from "../lib/style";
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
 * four: about 30% ink on the light map and 45% black on the dark one, which is already
 * dark and needs more to show.
 */
export function shadeOpacity(theme: MapTheme): number {
  return isDark(theme) ? 0.14 : 0.085;
}

const kind = (name: string) => ["==", ["get", "kind"], name] as never;

/** The night and the twilights, beneath every other overlay. */
export function greyLineShadeLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-grey-line-shade",
      type: "fill",
      source: GREY_LINE_SOURCE,
      filter: kind("shade"),
      // No outline: the pieces of a shade meet at the 180° meridian, and an outline would draw a seam there.
      paint: { "fill-color": isDark(theme) ? "#000000" : theme.ink, "fill-opacity": shadeOpacity(theme), "fill-antialias": false },
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
