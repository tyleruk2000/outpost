/**
 * The board: a wooden cross with the 33 holes as buttons (the corner places are drawn as
 * nothing and are not controls), one tab stop with the arrow keys moving focus, and each
 * hole named with what is in it. A peg is picked and put down by tapping (or Enter), or
 * dragged. Everything is drawn in SVG from the game tokens.
 */
import { type Board, columnOf, isHole, isHoleAt, placeAt, rowOf, SIZE } from "@outpost/shared/games/peg-solitaire";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { boardSurface } from "../kit/frame";

export interface PegBoardProps {
  board: Board;
  picked: number | null;
  /** Holes the picked peg can jump to. */
  targets: ReadonlySet<number>;
  /** Pegs that may be dragged now: those with a jump. */
  draggable: (place: number) => boolean;
  label: (place: number) => string;
  onHole: (place: number) => void;
  onCancel: () => void;
  /** The hole that has the focus first. */
  firstFocus: number;
}

/** The hole an arrow key moves focus to, or null at the edge of the cross. */
function nextFocus(place: number, key: string): number | null {
  const row = rowOf(place);
  const column = columnOf(place);
  const holeOrNull = (r: number, c: number) => (isHoleAt(r, c) ? placeAt(r, c) : null);
  const inRow = Array.from({ length: SIZE }, (_, c) => c).filter((c) => isHoleAt(row, c));
  switch (key) {
    case "ArrowLeft":
      return holeOrNull(row, column - 1);
    case "ArrowRight":
      return holeOrNull(row, column + 1);
    case "ArrowUp":
      return holeOrNull(row - 1, column);
    case "ArrowDown":
      return holeOrNull(row + 1, column);
    case "Home":
      return placeAt(row, inRow[0]!);
    case "End":
      return placeAt(row, inRow[inRow.length - 1]!);
    default:
      return null;
  }
}

/** The cross, in the board's own units (one hole's place = 1): rounded outside, eased inside. */
const CROSS = [
  "M2.45 0H4.55A.45 .45 0 0 1 5 .45V1.7A.3 .3 0 0 0 5.3 2H6.55A.45 .45 0 0 1 7 2.45",
  "V4.55A.45 .45 0 0 1 6.55 5H5.3A.3 .3 0 0 0 5 5.3V6.55A.45 .45 0 0 1 4.55 7",
  "H2.45A.45 .45 0 0 1 2 6.55V5.3A.3 .3 0 0 0 1.7 5H.45A.45 .45 0 0 1 0 4.55",
  "V2.45A.45 .45 0 0 1 .45 2H1.7A.3 .3 0 0 0 2 1.7V.45A.45 .45 0 0 1 2.45 0Z",
].join("");

/** A peg seen from above: a turned round head with its rim showing below and a glint of light. */
export function Peg({ lifted }: { lifted: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn("size-full transition-transform motion-reduce:transition-none", lifted && "-translate-y-[6%] scale-[1.06]")}
    >
      <circle cx="50" cy="54" r="29" fill="var(--game-peg-edge)" />
      <circle cx="50" cy="49" r="27" fill="var(--game-peg)" />
      <ellipse cx="41" cy="38" rx="9" ry="5.5" fill="var(--game-peg-shine)" fillOpacity="0.75" transform="rotate(-25 41 38)" />
    </svg>
  );
}

interface Drag {
  pointer: number;
  place: number;
  x: number;
  y: number;
  moving: boolean;
  element: HTMLElement | null;
}

export function PegBoard({ board, picked, targets, draggable, label, onHole, onCancel, firstFocus }: PegBoardProps) {
  const [focus, setFocus] = useState(firstFocus);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onCancel();
      return;
    }
    const to = nextFocus(focus, event.key);
    if (to === null) return;
    event.preventDefault();
    setFocus(to);
    buttons.current.get(to)?.focus();
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>, drop: boolean) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    if (current.element) {
      current.element.style.transform = "";
      current.element.style.zIndex = "";
    }
    if (!current.moving) return;
    // The click that follows a drag is not a tap.
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
    if (!drop) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-hole]");
    const to = under ? Number(under.dataset.hole) : null;
    if (to !== null && targets.has(to)) onHole(to);
  };

  const places = Array.from({ length: SIZE }, (_, index) => index);

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[30rem] md:mx-0", boardSurface)}>
      <svg aria-hidden viewBox="0 0 7 7" className="absolute inset-0 size-full overflow-visible">
        <path d={CROSS} fill="var(--game-peg-board)" stroke="var(--game-peg-board-edge)" strokeWidth="0.05" />
      </svg>
      {/* biome-ignore lint/a11y/useSemanticElements: a board of buttons moved through with the arrow keys, not a table of data */}
      <div role="grid" aria-label="Board" onKeyDown={onKeyDown} className="relative grid size-full grid-rows-7">
        {places.map((row) => (
          // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: a row of the board, not of a table; its holes take the focus
          <div key={row} role="row" className="grid grid-cols-7">
            {places.map((column) => {
              const place = placeAt(row, column);
              if (!isHole(place)) return <div key={column} aria-hidden />;
              const peg = board[place] === true;
              const isTarget = targets.has(place);
              const isPicked = picked === place;
              const canDrag = draggable(place);
              return (
                // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: a hole of the board; the button inside it takes the focus
                <div key={column} role="gridcell" className="relative">
                  <button
                    ref={(element) => {
                      if (element) buttons.current.set(place, element);
                      else buttons.current.delete(place);
                    }}
                    type="button"
                    data-hole={place}
                    tabIndex={place === focus ? 0 : -1}
                    aria-label={label(place)}
                    aria-pressed={isPicked ? true : undefined}
                    onFocus={() => setFocus(place)}
                    onClick={() => {
                      if (swallowClick.current) return;
                      onHole(place);
                    }}
                    onPointerDown={(event) => {
                      if (!canDrag || event.button !== 0) return;
                      drag.current = {
                        pointer: event.pointerId,
                        place,
                        x: event.clientX,
                        y: event.clientY,
                        moving: false,
                        element: event.currentTarget.querySelector<HTMLElement>("[data-peg]"),
                      };
                    }}
                    onPointerMove={(event) => {
                      const current = drag.current;
                      if (!current || current.pointer !== event.pointerId) return;
                      const dx = event.clientX - current.x;
                      const dy = event.clientY - current.y;
                      if (!current.moving) {
                        if (Math.hypot(dx, dy) < 8) return;
                        current.moving = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        // Picking the peg up picks it, as a tap would.
                        if (picked !== current.place) onHole(current.place);
                      }
                      if (current.element) {
                        current.element.style.transform = `translate(${dx}px, ${dy}px)`;
                        current.element.style.zIndex = "30";
                      }
                    }}
                    onPointerUp={(event) => endDrag(event, true)}
                    onPointerCancel={(event) => endDrag(event, false)}
                    className={cn("absolute inset-0 rounded-full outline-offset-[-2px]", canDrag && "touch-none")}
                  >
                    <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full">
                      {/* The marks are amber laid on a line of the hole's colour, so they stand off light and dark wood alike. */}
                      {isPicked ? (
                        <>
                          <circle cx="50" cy="50" r="41" fill="none" stroke="var(--game-peg-hole)" strokeWidth="8" />
                          <circle cx="50" cy="50" r="41" fill="none" stroke="var(--game-peg-hint)" strokeWidth="5" />
                        </>
                      ) : null}
                      <circle cx="50" cy="50" r="18" fill="var(--game-peg-hole)" stroke="var(--game-peg-board-edge)" strokeWidth="2" />
                      {isTarget ? (
                        <>
                          <circle cx="50" cy="50" r="9" fill="var(--game-peg-hint)" />
                          <circle cx="50" cy="50" r="31" fill="none" stroke="var(--game-peg-hole)" strokeWidth="6" />
                          <circle
                            cx="50"
                            cy="50"
                            r="31"
                            fill="none"
                            stroke="var(--game-peg-hint)"
                            strokeWidth="3.5"
                            strokeDasharray="7 6"
                          />
                        </>
                      ) : null}
                    </svg>
                    {peg ? (
                      <span data-peg className="pointer-events-none absolute inset-0">
                        <Peg lifted={isPicked} />
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
