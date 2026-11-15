/**
 * Sibling order. Each page has a fractional `position`; putting a page between two
 * others takes the midpoint, so a move writes one row instead of renumbering a whole
 * folder. Midpoints of midpoints eventually run out of precision, which is when the
 * caller renumbers that one group of siblings (see `needsRenumbering`).
 */

/** Below this distance two neighbours are renumbered before anything goes between them. */
export const MIN_GAP = 1e-6;

/** A position between two neighbours; either may be missing at the ends of the list. */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

export function needsRenumbering(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && after - before < MIN_GAP;
}
