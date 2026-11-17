/**
 * The cards, drawn here: four pips of our own as SVG paths, a face laid out for the room
 * it has, and a back. On a phone a card is the rank and a small pip in its corner (what
 * shows when cards are fanned down a pile) and one large pip; given room, number cards
 * carry their pips laid out by rank. Court cards are their letter with a mark of one, two
 * or three peaks (jack, queen, king) inside a thin frame: no figures.
 */
import { cn } from "@/lib/utils";
import { type Card, isRed, RANK_LETTERS, rankOf, type Suit, suitOf } from "./engine";
import type { Layout } from "./layout";

/** Each pip in a 20 by 20 box. */
const PIP_PATHS: Record<Suit, string> = {
  // Spades: a leaf on a flared stem.
  0: "M10 1.2C12.6 5 18.6 8.4 18.6 12.4 18.6 14.9 16.8 16.5 14.6 16.5 13 16.5 11.7 15.7 11 14.5L12.6 18.8H7.4L9 14.5C8.3 15.7 7 16.5 5.4 16.5 3.2 16.5 1.4 14.9 1.4 12.4 1.4 8.4 7.4 5 10 1.2Z",
  // Hearts: two lobes meeting in a point.
  1: "M10 18.4C4.6 14 1.3 10.6 1.3 6.6 1.3 3.8 3.4 1.8 5.9 1.8 7.8 1.8 9.2 3 10 4.6 10.8 3 12.2 1.8 14.1 1.8 16.6 1.8 18.7 3.8 18.7 6.6 18.7 10.6 15.4 14 10 18.4Z",
  // Diamonds: four gently hollowed sides.
  2: "M10 1Q12.8 6.2 17.2 10 12.8 13.8 10 19 7.2 13.8 2.8 10 7.2 6.2 10 1Z",
  // Clubs: three round leaves and a stem, all drawn the same way round so that they fill as one.
  3: "M5.9 5.4a4.1 4.1 0 1 1 8.2 0a4.1 4.1 0 1 1 -8.2 0ZM1.2 11.3a4.1 4.1 0 1 1 8.2 0a4.1 4.1 0 1 1 -8.2 0ZM10.6 11.3a4.1 4.1 0 1 1 8.2 0a4.1 4.1 0 1 1 -8.2 0ZM7.4 10.4a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1 -5.2 0ZM10 10.5L12.9 18.8H7.1Z",
};

export function Pip({ suit, size, className, flipped }: { suit: Suit; size: number; className?: string; flipped?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={cn("shrink-0 fill-current", flipped && "rotate-180", className)}
    >
      <path d={PIP_PATHS[suit]} />
    </svg>
  );
}

/** Where the pips of a number card go, as fractions of the space for them (columns 0.18, 0.5, 0.82). */
const L = 0.18;
const M = 0.5;
const R = 0.82;
const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  2: [
    [M, 0],
    [M, 1],
  ],
  3: [
    [M, 0],
    [M, 0.5],
    [M, 1],
  ],
  4: [
    [L, 0],
    [R, 0],
    [L, 1],
    [R, 1],
  ],
  5: [
    [L, 0],
    [R, 0],
    [M, 0.5],
    [L, 1],
    [R, 1],
  ],
  6: [
    [L, 0],
    [R, 0],
    [L, 0.5],
    [R, 0.5],
    [L, 1],
    [R, 1],
  ],
  7: [
    [L, 0],
    [R, 0],
    [M, 0.25],
    [L, 0.5],
    [R, 0.5],
    [L, 1],
    [R, 1],
  ],
  8: [
    [L, 0],
    [R, 0],
    [M, 0.25],
    [L, 0.5],
    [R, 0.5],
    [M, 0.75],
    [L, 1],
    [R, 1],
  ],
  9: [
    [L, 0],
    [R, 0],
    [L, 1 / 3],
    [R, 1 / 3],
    [M, 0.5],
    [L, 2 / 3],
    [R, 2 / 3],
    [L, 1],
    [R, 1],
  ],
  10: [
    [L, 0],
    [R, 0],
    [M, 1 / 6],
    [L, 1 / 3],
    [R, 1 / 3],
    [L, 2 / 3],
    [R, 2 / 3],
    [M, 5 / 6],
    [L, 1],
    [R, 1],
  ],
};

/** A court card's mark: a line of one, two or three peaks, for the jack, the queen and the king. */
function CourtMark({ peaks, width }: { peaks: number; width: number }) {
  const step = 20 / peaks;
  let path = "M0 9";
  for (let peak = 0; peak < peaks; peak += 1) path += `L${step * peak + step / 2} 2L${step * (peak + 1)} 9`;
  return (
    <svg aria-hidden viewBox="-1 0 22 11" width={width} height={width * 0.5} className="shrink-0">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** The face of a card, filling the button it is drawn in. */
export function CardFace({ card, layout }: { card: Card; layout: Layout }) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const { width, height, corner, upOffset, compact } = layout;
  const court = rank > 10;
  // The space under the corner: what a fanned card hides.
  const bodyTop = upOffset;
  const bodyHeight = height - bodyTop - Math.round(height * 0.08);
  return (
    <span className={cn("absolute inset-0 block", isRed(suit) ? "text-game-suit-red" : "text-game-suit-black")}>
      <span
        className="absolute top-0 left-0 flex items-center font-bold leading-none tracking-[-0.04em]"
        style={{ fontSize: corner, gap: Math.max(1, Math.round(corner * 0.12)), paddingLeft: Math.round(width * 0.07), height: upOffset }}
      >
        {RANK_LETTERS[rank]}
        <Pip suit={suit} size={Math.round(corner * 0.78)} />
      </span>
      <span className="absolute inset-x-0 block" style={{ top: bodyTop, height: bodyHeight }}>
        {court ? (
          <span
            className="absolute flex flex-col items-center justify-center rounded-[3px] border border-current/40"
            style={{ inset: `0 ${Math.round(width * 0.12)}px`, gap: Math.round(height * 0.03) }}
          >
            <CourtMark peaks={rank - 10} width={Math.round(width * (compact ? 0.36 : 0.3))} />
            {compact ? null : (
              <span className="font-title font-semibold leading-none" style={{ fontSize: Math.round(width * 0.36) }}>
                {RANK_LETTERS[rank]}
              </span>
            )}
            <Pip suit={suit} size={Math.round(width * (compact ? 0.34 : 0.22))} />
          </span>
        ) : rank === 1 || compact ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Pip suit={suit} size={Math.round(Math.min(width * (rank === 1 ? 0.56 : 0.5), bodyHeight * 0.8))} />
          </span>
        ) : (
          <NumberPips suit={suit} rank={rank} width={width} height={bodyHeight} />
        )}
      </span>
    </span>
  );
}

function NumberPips({ suit, rank, width, height }: { suit: Suit; rank: number; width: number; height: number }) {
  const size = Math.round(Math.min(width * 0.19, height / 4.8));
  const left = width * 0.14;
  const across = width - 2 * left;
  const top = size / 2;
  const down = height - size;
  return (
    <>
      {(PIP_LAYOUTS[rank] ?? []).map(([x, y], index) => (
        <span
          // The layout is fixed for the rank, so its index is the pip's identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          className="absolute flex"
          style={{ left: left + x * across - size / 2, top: top + y * down - size / 2 }}
        >
          {/* The pips of the lower half point the other way, as on a card that reads both ways up. */}
          <Pip suit={suit} size={size} flipped={y > 0.5} />
        </span>
      ))}
    </>
  );
}

/** The back: a fine weave in the back's own colours, inside a margin. */
export function CardBack() {
  return (
    <span className="absolute inset-0 block rounded-[inherit] bg-game-card-back p-[3px]">
      <span className="block size-full rounded-[2px] border border-game-card-back-line bg-[repeating-linear-gradient(45deg,var(--game-card-back-line)_0_1px,transparent_1px_5px),repeating-linear-gradient(-45deg,var(--game-card-back-line)_0_1px,transparent_1px_5px)] opacity-80" />
    </span>
  );
}
