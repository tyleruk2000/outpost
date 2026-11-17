/**
 * The size of everything on the table, from the width there is: seven piles across, so a
 * card is a seventh of the width less the gaps, and no wider than 104 px. Measured rather
 * than set by breakpoints so that the seven piles fit any phone without sideways scroll.
 */
import type { Board } from "./engine";

export interface Layout {
  gap: number;
  width: number;
  height: number;
  /** The rank in the corner, px. */
  corner: number;
  /** How far down a face-up card is fanned over the one under it: enough to show the corner. */
  upOffset: number;
  /** The same for a face-down card. */
  downOffset: number;
  /** How far apart the top three cards of the waste are spread in draw three. */
  wasteOffset: number;
  /** A card too narrow for its pips: the corner and one large pip. */
  compact: boolean;
}

export const MAX_CARD = 104;

export function layoutFor(boardWidth: number): Layout {
  const gap = boardWidth < 520 ? 4 : 10;
  const width = Math.max(34, Math.min(MAX_CARD, Math.floor((boardWidth - 6 * gap) / 7)));
  const height = Math.round(width * 1.4);
  const compact = width < 66;
  const corner = compact ? Math.round(width * 0.37) : Math.round(Math.min(21, Math.max(15, width * 0.2)));
  const upOffset = compact ? Math.round(corner * 1.55) : Math.round(Math.max(corner * 1.5, width * 0.3));
  const downOffset = compact ? 7 : Math.round(width * 0.11);
  // On a phone the three spread over the waste's column and the empty one beside it, as far apart as they can be.
  const wasteOffset = compact ? Math.floor((width + gap) / 2) : Math.round(width * 0.45);
  return { gap, width, height, corner, upOffset, downOffset, wasteOffset, compact };
}

/** How tall the tallest pile is, so that the row of piles keeps its room and a drop below a short pile still lands on it. */
export function pilesHeight(board: Board, layout: Layout): number {
  // Room for a pile of the deal and a few more cards from the start, so the page does not shift under a thumb with every move.
  let tallest = layout.height + 6 * layout.downOffset + 2 * layout.upOffset;
  for (const pile of board.piles) {
    const cards = pile.down.length + pile.up.length;
    if (cards === 0) continue;
    const fanned = pile.down.length * layout.downOffset + Math.max(0, pile.up.length - 1) * layout.upOffset;
    tallest = Math.max(tallest, fanned + layout.height);
  }
  return tallest;
}
