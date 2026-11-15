/**
 * Moving something on the map with the arrow keys: the pin of a saved place, a handle
 * of the download box. Steps are in screen pixels, so zooming in makes them finer, as
 * it does for a drag.
 */

/** Pixels an arrow key moves a focused handle or pin, and how far with Shift held. */
export const NUDGE_PIXELS = 4;
export const NUDGE_PIXELS_LARGE = 24;

/** The step on screen for an arrow key, or null for any other key. Screen y grows downwards. */
export function arrowNudge(key: string, large: boolean): { x: number; y: number } | null {
  const step = large ? NUDGE_PIXELS_LARGE : NUDGE_PIXELS;
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  return null;
}
