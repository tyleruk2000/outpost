/**
 * The board: a grid of the 32 dark squares as buttons (the light squares are drawn but
 * not played on, so they are not in the grid's buttons), one tab stop with the arrow keys
 * moving focus, and each square named with what is on it. A piece is picked and put down
 * by tapping (or Enter), or dragged. The pieces are drawn in SVG from the game tokens.
 */
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { boardSurface } from "../kit/frame";
import { type Cell, FILES, fileOf, isKing, type Move, rankOf, type Side, sideOf, squareAt } from "./engine";

export interface BoardProps {
  board: Cell[];
  /** Ranks 1 at the top when the person plays light against the computer. */
  flipped: boolean;
  selected: number | null;
  /** Squares the picked piece can go to next. */
  targets: ReadonlySet<number>;
  /** Pieces being taken in a jump still being made: drawn faded. */
  taking: ReadonlySet<number>;
  /** The last move, marked until the next piece is picked. */
  marked: Move | null;
  /** Pieces that may be dragged now. */
  draggable: (square: number) => boolean;
  label: (square: number) => string;
  onSquare: (square: number) => void;
  onCancel: () => void;
}

/** Where a square is drawn: row 0 at the top, column 0 at the left. */
function placeOf(square: number, flipped: boolean): { row: number; column: number } {
  return flipped ? { row: rankOf(square), column: 7 - fileOf(square) } : { row: 7 - rankOf(square), column: fileOf(square) };
}
function squareOfPlace(row: number, column: number, flipped: boolean): number {
  return flipped ? squareAt(7 - column, row) : squareAt(column, 7 - row);
}

/** The dark square the arrow key moves focus to: across a row two at a time, up and down within the same pair of columns. */
function nextFocus(square: number, key: string, flipped: boolean): number | null {
  const { row, column } = placeOf(square, flipped);
  const up = (to: number) => (to < 0 || to > 7 ? null : squareOfPlace(to, column % 2 === 0 ? column + 1 : column - 1, flipped));
  switch (key) {
    case "ArrowLeft":
      return column - 2 >= 0 ? squareOfPlace(row, column - 2, flipped) : null;
    case "ArrowRight":
      return column + 2 <= 7 ? squareOfPlace(row, column + 2, flipped) : null;
    case "ArrowUp":
      return up(row - 1);
    case "ArrowDown":
      return up(row + 1);
    case "Home":
      return squareOfPlace(row, row % 2 === 0 ? 1 : 0, flipped);
    case "End":
      return squareOfPlace(row, row % 2 === 0 ? 7 : 6, flipped);
    default:
      return null;
  }
}

/** A piece: a disc with a groove, a king two discs stacked with a mark on top. */
export function Piece({ cell, faded }: { cell: Cell; faded?: boolean }) {
  const side: Side = sideOf(cell) ?? "dark";
  const fill = side === "dark" ? "var(--game-piece-dark)" : "var(--game-piece-light)";
  const edge = side === "dark" ? "var(--game-piece-dark-edge)" : "var(--game-piece-light-edge)";
  const king = isKing(cell);
  // On a king the groove and the mark are drawn in the other side's piece colour, so they show on either.
  const mark = side === "dark" ? "var(--game-piece-light)" : "var(--game-piece-dark)";
  const top = king ? 45 : 50;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-[78%]", faded && "opacity-35")}>
      {king ? <circle cx="50" cy="58" r="36" fill={fill} stroke={edge} strokeWidth="4" /> : null}
      <circle cx="50" cy={top} r="36" fill={fill} stroke={edge} strokeWidth="4" />
      <circle cx="50" cy={top} r="24" fill="none" stroke={king ? mark : edge} strokeWidth="2.5" strokeOpacity={king ? 0.8 : 1} />
      {king ? <path d={`M50 ${top - 11} L61 ${top} L50 ${top + 11} L39 ${top} Z`} fill={mark} fillOpacity="0.85" /> : null}
    </svg>
  );
}

interface Drag {
  pointer: number;
  square: number;
  x: number;
  y: number;
  moving: boolean;
  element: HTMLElement | null;
}

export function Board({ board, flipped, selected, targets, taking, marked, draggable, label, onSquare, onCancel }: BoardProps) {
  const [focus, setFocus] = useState<number>(() => (flipped ? squareAt(5, 5) : squareAt(2, 2)));
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);

  const move = (to: number) => {
    setFocus(to);
    buttons.current.get(to)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onCancel();
      return;
    }
    const to = nextFocus(focus, event.key, flipped);
    if (to === null) return;
    event.preventDefault();
    move(to);
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
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-square]");
    const to = under ? Number(under.dataset.square) : null;
    if (to !== null && targets.has(to)) onSquare(to);
  };

  const rows = Array.from({ length: 8 }, (_, row) => row);
  const columns = Array.from({ length: 8 }, (_, column) => column);
  // The marked move's path, in the board's own units (one square = 1).
  const centre = (square: number) => {
    const { row, column } = placeOf(square, flipped);
    return `${column + 0.5},${row + 0.5}`;
  };

  return (
    <div
      className={cn("relative aspect-square w-full max-w-[34rem] overflow-hidden rounded-panel border border-border-strong", boardSurface)}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a board of buttons moved through with the arrow keys, not a table of data */}
      <div role="grid" aria-label="Board" onKeyDown={onKeyDown} className="grid size-full grid-rows-8">
        {rows.map((row) => (
          // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: a row of the board, not of a table; its squares take the focus
          <div key={row} role="row" className="grid grid-cols-8">
            {columns.map((column) => {
              const square = squareOfPlace(row, column, flipped);
              const playable = (row + column) % 2 === 1;
              const edgeLabels = (
                <>
                  {column === 0 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute top-0.5 left-1 text-micro leading-none",
                        playable ? "text-game-board-mark-on-dark" : "text-game-board-mark-on-light",
                      )}
                    >
                      {rankOf(square) + 1}
                    </span>
                  ) : null}
                  {row === 7 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute right-1 bottom-0.5 text-micro leading-none",
                        playable ? "text-game-board-mark-on-dark" : "text-game-board-mark-on-light",
                      )}
                    >
                      {FILES[fileOf(square)]}
                    </span>
                  ) : null}
                </>
              );
              if (!playable)
                return (
                  <div key={column} aria-hidden className="relative bg-game-board-light text-game-board-dark">
                    {edgeLabels}
                  </div>
                );
              const cell = board[square]!;
              const isTarget = targets.has(square);
              const canDrag = draggable(square);
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
                        // Picking the piece up picks it, as a tap would.
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
                      "relative flex size-full items-center justify-center bg-game-board-dark text-game-board-light outline-offset-[-3px]",
                      canDrag && "touch-none",
                    )}
                  >
                    {edgeLabels}
                    {selected === square ? (
                      <span aria-hidden className="absolute inset-[3px] rounded-[3px] border-[3px] border-game-board-hint" />
                    ) : null}
                    {cell !== 0 ? (
                      <span data-piece className="relative z-10 flex size-full items-center justify-center">
                        <Piece cell={cell} faded={taking.has(square)} />
                      </span>
                    ) : null}
                    {isTarget ? <span aria-hidden className="absolute size-[30%] rounded-full bg-game-board-hint opacity-90" /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {marked ? (
        <svg
          aria-hidden
          viewBox="0 0 8 8"
          className="pointer-events-none absolute inset-0 size-full transition-opacity duration-(--duration-fast) motion-reduce:transition-none"
        >
          <polyline
            points={marked.path.map(centre).join(" ")}
            fill="none"
            stroke="var(--game-board-hint)"
            strokeWidth="0.07"
            strokeDasharray="0.16 0.12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {(() => {
            const [x, y] = centre(marked.path[0]!).split(",").map(Number);
            return <circle cx={x} cy={y} r="0.16" fill="none" stroke="var(--game-board-hint)" strokeWidth="0.07" />;
          })()}
        </svg>
      ) : null}
    </div>
  );
}
