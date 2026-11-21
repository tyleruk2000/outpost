/**
 * The board: 64 squares as buttons in a grid, one tab stop with the arrow keys moving
 * focus, each square named with what is on it. A piece is picked and put down by tapping
 * (or Enter), or dragged. The pieces are drawn here in SVG from the game tokens: each
 * kind has its own outline, and the two sides differ in more than colour, as in printed
 * diagrams: white's are drawn open, black's solid with their inner lines picked out.
 */
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { boardSurface } from "../kit/frame";
import { FILES, fileOf, type Kind, kindOf, rankOf, sideOf, squareAt } from "./engine";

const BASE = "M27 78 H73 Q78 78 78 83 V88 Q78 92 73 92 H27 Q22 92 22 88 V83 Q22 78 27 78 Z";

/** Each kind's outline (filled), and the inner lines that show its form. */
const SHAPES: Record<Kind, { body: string[]; lines: string; dots?: Array<[number, number, number]> }> = {
  1: {
    body: ["M39 44 H61 L57 51 C57 61 64 68 68 78 H32 C36 68 43 61 43 51 Z", BASE],
    lines: "M41 51 H59",
    dots: [[50, 31, 12]],
  },
  2: {
    body: [
      "M68 78 H32 C31 67 37 60 47 53 C40 54 33 58 27 56 C22 51 23 45 29 40 L43 27 L43 15 L51 22 C66 22 77 35 77 53 C77 63 72 70 68 78 Z",
      BASE,
    ],
    lines: "M47 53 C53 49 56 43 55 37 M36 47 L39 45",
    dots: [[45, 33, 2.6]],
  },
  3: {
    body: ["M50 21 C37 31 32 45 38 58 H62 C68 45 63 31 50 21 Z", "M36 62 H64 V68 H36 Z", "M40 68 L35 78 H65 L60 68 Z", BASE],
    lines: "M55 33 L46 46 M38 58 H62",
    dots: [[50, 15, 5]],
  },
  4: {
    body: ["M27 20 H37 V28 H45 V20 H55 V28 H63 V20 H73 V36 L66 42 V70 L72 78 H28 L34 70 V42 L27 36 Z", BASE],
    lines: "M34 42 H66 M34 70 H66",
  },
  5: {
    body: ["M23 33 L35 63 L37 29 L46 61 L50 25 L54 61 L63 29 L65 63 L77 33 L70 74 H30 Z", "M30 74 H70 L72 78 H28 Z", BASE],
    lines: "M31 68 H69",
    dots: [
      [23, 29, 4.5],
      [37, 25, 4.5],
      [50, 20, 4.5],
      [63, 25, 4.5],
      [77, 29, 4.5],
    ],
  },
  6: {
    body: [
      "M47 6 H53 V12 H59 V18 H53 V26 H47 V18 H41 V12 H47 Z",
      "M50 28 C64 28 77 36 74 50 L68 74 H32 L26 50 C23 36 36 28 50 28 Z",
      "M32 74 H68 L70 78 H30 Z",
      BASE,
    ],
    lines: "M29 58 H71 M50 28 V44",
  },
};

/** A piece, drawn to fill its square. */
export function PieceImage({ piece, className }: { piece: number; className?: string }) {
  const shape = SHAPES[kindOf(piece)];
  const white = sideOf(piece) === "white";
  const fill = white ? "var(--game-piece-light)" : "var(--game-piece-dark)";
  // White's pieces are outlined in black's colour; black's have a rim that stands off either square, and light inner lines.
  const edge = white ? "var(--game-piece-dark)" : "var(--game-piece-dark-edge)";
  const inner = white ? "var(--game-piece-dark)" : "var(--game-piece-light)";
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-[86%]", className)}>
      <g fill={fill} stroke={edge} strokeWidth="3.2" strokeLinejoin="round">
        {shape.body.map((d) => (
          <path key={d} d={d} />
        ))}
        {shape.dots?.map(([cx, cy, r]) => (
          <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <path d={shape.lines} fill="none" stroke={inner} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export interface BoardProps {
  board: number[];
  /** Rank 8 at the bottom: black's side nearest. */
  flipped: boolean;
  selected: number | null;
  /** Squares the picked piece can go to. */
  targets: ReadonlySet<number>;
  /** The last move's two squares. */
  marked: { from: number; to: number } | null;
  /** The square of a king in check. */
  checked: number | null;
  draggable: (square: number) => boolean;
  label: (square: number) => string;
  onSquare: (square: number) => void;
  onCancel: () => void;
}

function placeOf(square: number, flipped: boolean): { row: number; column: number } {
  return flipped ? { row: rankOf(square), column: 7 - fileOf(square) } : { row: 7 - rankOf(square), column: fileOf(square) };
}
function squareOfPlace(row: number, column: number, flipped: boolean): number {
  return flipped ? squareAt(7 - column, row) : squareAt(column, 7 - row);
}

function nextFocus(square: number, key: string, flipped: boolean): number | null {
  const { row, column } = placeOf(square, flipped);
  const at = (r: number, c: number) => (r < 0 || r > 7 || c < 0 || c > 7 ? null : squareOfPlace(r, c, flipped));
  switch (key) {
    case "ArrowLeft":
      return at(row, column - 1);
    case "ArrowRight":
      return at(row, column + 1);
    case "ArrowUp":
      return at(row - 1, column);
    case "ArrowDown":
      return at(row + 1, column);
    case "Home":
      return at(row, 0);
    case "End":
      return at(row, 7);
    default:
      return null;
  }
}

interface Drag {
  pointer: number;
  square: number;
  x: number;
  y: number;
  moving: boolean;
  element: HTMLElement | null;
}

export function Board({ board, flipped, selected, targets, marked, checked, draggable, label, onSquare, onCancel }: BoardProps) {
  const [focus, setFocus] = useState<number>(() => squareAt(4, flipped ? 6 : 1));
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onCancel();
      return;
    }
    const to = nextFocus(focus, event.key, flipped);
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
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
    if (!drop) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-square]");
    const to = under ? Number(under.dataset.square) : null;
    if (to !== null && targets.has(to)) onSquare(to);
  };

  const rows = Array.from({ length: 8 }, (_, row) => row);

  return (
    <div
      className={cn("relative aspect-square w-full max-w-[34rem] overflow-hidden rounded-panel border border-border-strong", boardSurface)}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a board of buttons moved through with the arrow keys, not a table of data */}
      <div role="grid" aria-label="Board" onKeyDown={onKeyDown} className="grid size-full grid-rows-8">
        {rows.map((row) => (
          // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: a row of the board, not of a table; its squares take the focus
          <div key={row} role="row" className="grid grid-cols-8">
            {rows.map((column) => {
              const square = squareOfPlace(row, column, flipped);
              const light = (fileOf(square) + rankOf(square)) % 2 === 1;
              const piece = board[square]!;
              const isTarget = targets.has(square);
              const canDrag = draggable(square);
              const isMarked = marked !== null && (marked.from === square || marked.to === square);
              return (
                // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: a square of the board; the button inside it takes the focus
                <div key={column} role="gridcell" className="relative">
                  <button
                    ref={(element) => {
                      if (element) buttons.current.set(square, element);
                      else buttons.current.delete(square);
                    }}
                    type="button"
                    data-square={square}
                    tabIndex={square === focus ? 0 : -1}
                    aria-label={label(square)}
                    aria-pressed={selected === square ? true : undefined}
                    onFocus={() => setFocus(square)}
                    onClick={() => {
                      if (swallowClick.current) return;
                      onSquare(square);
                    }}
                    onPointerDown={(event) => {
                      if (!canDrag || event.button !== 0) return;
                      drag.current = {
                        pointer: event.pointerId,
                        square,
                        x: event.clientX,
                        y: event.clientY,
                        moving: false,
                        element: event.currentTarget.querySelector<HTMLElement>("[data-piece]"),
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
                        if (selected !== current.square) onSquare(current.square);
                      }
                      if (current.element) {
                        current.element.style.transform = `translate(${dx}px, ${dy}px)`;
                        current.element.style.zIndex = "30";
                      }
                    }}
                    onPointerUp={(event) => endDrag(event, true)}
                    onPointerCancel={(event) => endDrag(event, false)}
                    className={cn(
                      "relative flex size-full items-center justify-center outline-offset-[-3px]",
                      light ? "bg-game-board-light text-game-board-dark" : "bg-game-board-dark text-game-board-light",
                      canDrag && "touch-none",
                    )}
                  >
                    {column === 0 ? (
                      <span aria-hidden className="pointer-events-none absolute top-0.5 left-1 text-micro leading-none opacity-80">
                        {rankOf(square) + 1}
                      </span>
                    ) : null}
                    {row === 7 ? (
                      <span aria-hidden className="pointer-events-none absolute right-1 bottom-0.5 text-micro leading-none opacity-80">
                        {FILES[fileOf(square)]}
                      </span>
                    ) : null}
                    {isMarked ? <span aria-hidden className="absolute inset-0 bg-game-board-hint opacity-35" /> : null}
                    {checked === square ? (
                      <span aria-hidden className="absolute inset-[2px] rounded-full border-[3px] border-dashed border-danger" />
                    ) : null}
                    {selected === square ? (
                      <span aria-hidden className="absolute inset-[3px] rounded-[3px] border-[3px] border-game-board-hint" />
                    ) : null}
                    {piece !== 0 ? (
                      <span data-piece className="relative z-10 flex size-full items-center justify-center">
                        <PieceImage piece={piece} />
                      </span>
                    ) : null}
                    {isTarget ? (
                      piece !== 0 ? (
                        <span aria-hidden className="absolute inset-[4%] z-20 rounded-full border-[3px] border-game-board-hint" />
                      ) : (
                        <span aria-hidden className="absolute size-[28%] rounded-full bg-game-board-hint opacity-90" />
                      )
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
