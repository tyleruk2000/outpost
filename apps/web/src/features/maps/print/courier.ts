/**
 * The second typeface a page can be lettered in: Courier, for letters that have to
 * stand in columns (a one-time pad, a cipher square).
 *
 * Like Helvetica (see helvetica.ts) it is one of the fourteen typefaces every PDF
 * reader supplies itself, so a file that uses it carries no font and its letters stay
 * real text. It is addressed through the same encoding, and needs no table of widths:
 * Adobe's metrics for it (Courier.afm and Courier-Bold.afm, "IsFixedPitch true") give
 * every character the same advance, 600 thousandths of the type size.
 */
export const COURIER_ADVANCE = 600;

/** The width of a line of text in Courier at `size` points. */
export function monoWidth(text: string, size: number): number {
  return ([...text].length * COURIER_ADVANCE * size) / 1000;
}
