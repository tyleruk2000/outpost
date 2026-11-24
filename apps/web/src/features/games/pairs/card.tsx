/**
 * One card of Pairs: a back drawn from the card-back tokens (rings like the contours on
 * a map, the one decoration Outpost allows itself), and a face of card paper with its
 * picture. Turning over is a flip of 200 ms, and instant under reduced motion. A
 * matched card keeps its face up and carries a tick, so that "matched" is never colour
 * alone. A card turned over in the turn being played is ringed instead.
 *
 * Which side shows comes from the card's state, not from the turn: each side is hidden
 * outright when it should not show, half way through the flip. Safari's engine drew both
 * faces of a card turned in 3D inside a button, whatever `backface-visibility` said, so on
 * an iPhone every card lay face up. The turn is decoration.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Picture } from "./engine";
import { PICTURE_ART } from "./pictures";

export function CardBack() {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="size-full" preserveAspectRatio="none">
      <rect x="0.5" y="0.5" width="99" height="99" rx="8" fill="var(--game-card-back)" stroke="var(--game-card-back-line)" />
      <g fill="none" stroke="var(--game-card-back-line)" strokeWidth="2.5">
        <path d="M50 14c20 0 36 13 36 35s-14 37-37 37S14 72 14 51 30 14 50 14Z" />
        <path d="M51 27c13 0 23 9 23 23s-10 24-24 24-23-10-23-23 11-24 24-24Z" />
        <path d="M50 40c6 0 10 4 10 10s-4 11-10 11-10-5-10-11 4-10 10-10Z" />
      </g>
    </svg>
  );
}

/** A side appears or goes at the middle of the flip, when the card is edge on; at once under reduced motion. */
const SIDE_SWAP = "transition-[visibility] delay-[calc(var(--duration-slow)/2)] duration-0 motion-reduce:delay-0";

export function PairsCard({
  picture,
  faceUp,
  matched,
  name,
  index,
  onTurn,
}: {
  picture: Picture;
  faceUp: boolean;
  matched: boolean;
  name: string;
  index: number;
  onTurn: () => void;
}) {
  const { icon: Icon, colour } = PICTURE_ART[picture];
  return (
    <button
      type="button"
      aria-label={name}
      data-card={index}
      onClick={onTurn}
      className="relative aspect-square min-h-16 min-w-16 rounded-panel [perspective:800px]"
    >
      <span
        className={cn(
          "absolute inset-0 transition-transform duration-(--duration-slow) [transform-style:preserve-3d] motion-reduce:transition-none",
          faceUp && "[transform:rotateY(180deg)]",
        )}
      >
        <span data-side="back" className={cn("absolute inset-0 [backface-visibility:hidden]", SIDE_SWAP, faceUp && "invisible")}>
          <CardBack />
        </span>
        <span
          data-side="face"
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-panel border border-game-card-edge bg-game-card [backface-visibility:hidden] [transform:rotateY(180deg)]",
            SIDE_SWAP,
            !faceUp && "invisible",
            // A card turned over in this turn is ringed in the colour of a picked card; a matched one is not.
            !matched && "shadow-[0_0_0_3px_var(--game-card-picked)]",
          )}
        >
          <Icon aria-hidden strokeWidth={2} className={cn("size-[58%]", colour)} />
          {matched ? (
            <Check
              aria-hidden
              strokeWidth={3}
              className="absolute right-[6%] bottom-[6%] size-[18%] max-h-5 max-w-5 text-game-suit-black"
            />
          ) : null}
        </span>
      </span>
    </button>
  );
}
