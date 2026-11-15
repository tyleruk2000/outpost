/**
 * Fits a label into a width by measuring it with the page's own font. SVG text cannot
 * use CSS ellipsis, so labels inside drawings are cut to length here. Where measuring
 * is not possible (in tests), an average glyph width is used instead.
 */
import { fitText } from "../lib/scale";

let context: CanvasRenderingContext2D | null | undefined;
let family: string | undefined;

function measurer(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  context = null;
  if (typeof document === "undefined" || navigator.userAgent.includes("jsdom")) return context;
  try {
    context = document.createElement("canvas").getContext("2d");
    family = getComputedStyle(document.documentElement).fontFamily;
  } catch {
    context = null;
  }
  return context;
}

/** `text`, shortened with an ellipsis if it is wider than `width` pixels at the given size and weight. */
export function fitLabel(text: string, width: number, size: number, weight = 400): string {
  const canvas = measurer();
  if (!canvas) return fitText(text, width, size * 0.53);
  canvas.font = `${weight} ${size}px ${family}`;
  if (canvas.measureText(text).width <= width) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (canvas.measureText(`${text.slice(0, middle).trimEnd()}…`).width <= width) low = middle;
    else high = middle - 1;
  }
  return low <= 0 ? "" : `${text.slice(0, low).trimEnd()}…`;
}
