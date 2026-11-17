/**
 * The grid and the number pad. The grid is a real grid of buttons: one cell is in the
 * tab order at a time, and the arrow keys move it. Highlights come from tokens: the
 * row, column and box of the selected cell in the second neutral, the cells holding
 * its digit in the soft primary, a wrong cell in the danger colour with a mark and the
 * words "marked wrong" in its name.
 */
import { Eraser, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { boxOf, colOf, rowOf } from "./engine";
import { cellName, digitAt, notesOf, type SudokuGame } from "./game";

export function SudokuGrid({
  game,
  selected,
  onSelect,
  focusOnSelect,
}: {
  game: SudokuGame;
  selected: number;
  onSelect: (cell: number, byKeyboard: boolean) => void;
  /** Moves focus to the selected cell when it changes from the keyboard. */
  focusOnSelect: boolean;
}) {
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (focusOnSelect) cells.current[selected]?.focus();
  }, [selected, focusOnSelect]);

  const selectedDigit = digitAt(game, selected);
  const moveBy = (event: KeyboardEvent) => {
    const r = rowOf(selected);
    const c = colOf(selected);
    const to: Record<string, number> = {
      ArrowUp: ((r + 8) % 9) * 9 + c,
      ArrowDown: ((r + 1) % 9) * 9 + c,
      ArrowLeft: r * 9 + ((c + 8) % 9),
      ArrowRight: r * 9 + ((c + 1) % 9),
      Home: r * 9,
      End: r * 9 + 8,
    };
    const next = to[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(next, true);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a grid of buttons moved through with the arrow keys, not a table of data
    <div
      role="grid"
      aria-label="Sudoku grid"
      onKeyDown={moveBy}
      className="mx-auto flex aspect-square w-full max-w-[32rem] flex-col border-2 border-ink-muted bg-page md:mx-0"
    >
      {Array.from({ length: 9 }, (_, r) => (
        // biome-ignore lint/a11y/useFocusableInteractive: a row of a grid is not focused itself; its cells are
        // biome-ignore lint/a11y/useSemanticElements: a row of the grid above, not of a table
        // biome-ignore lint/suspicious/noArrayIndexKey: the nine rows are fixed places
        <div key={r} role="row" className="flex min-h-0 flex-1">
          {Array.from({ length: 9 }, (_, c) => {
            const cell = r * 9 + c;
            const given = game.givens[cell]!;
            const digit = digitAt(game, cell);
            const notes = digit ? [] : notesOf(game, cell);
            const wrong = game.marked.includes(cell);
            const isSelected = cell === selected;
            const peer =
              !isSelected && (rowOf(cell) === rowOf(selected) || colOf(cell) === colOf(selected) || boxOf(cell) === boxOf(selected));
            const same = !isSelected && selectedDigit !== 0 && digit === selectedDigit;
            return (
              // biome-ignore lint/a11y/useFocusableInteractive: the button inside the cell is what is focused
              // biome-ignore lint/a11y/useSemanticElements: a cell of the grid above, not of a table
              <div
                key={cell}
                role="gridcell"
                aria-selected={isSelected}
                className={cn(
                  "relative min-w-0 flex-1",
                  c < 8 && (c % 3 === 2 ? "border-r-2 border-r-ink-muted" : "border-r border-r-border-strong"),
                  r < 8 && (r % 3 === 2 ? "border-b-2 border-b-ink-muted" : "border-b border-b-border-strong"),
                )}
              >
                <button
                  ref={(node) => {
                    cells.current[cell] = node;
                  }}
                  type="button"
                  tabIndex={isSelected ? 0 : -1}
                  aria-label={cellName(game, cell)}
                  onClick={() => onSelect(cell, false)}
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-colors duration-150 motion-reduce:transition-none focus-visible:z-10",
                    peer && "bg-surface-strong",
                    same && "bg-primary-soft",
                    isSelected && "bg-primary-soft shadow-[inset_0_0_0_2px_var(--primary)]",
                  )}
                >
                  {digit ? (
                    <span
                      aria-hidden
                      className={cn(
                        "tabular text-[1.375rem] leading-none md:text-[1.75rem]",
                        given
                          ? "font-semibold text-ink"
                          : wrong
                            ? "text-danger"
                            : same || isSelected
                              ? "text-primary-soft-ink"
                              : "text-primary",
                      )}
                    >
                      {digit}
                    </span>
                  ) : notes.length ? (
                    <span aria-hidden className="grid size-full grid-cols-3 grid-rows-3 p-px text-micro leading-none text-ink-muted">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <span key={n} className="flex items-center justify-center tabular">
                          {notes.includes(n) ? n : ""}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {wrong ? <X aria-hidden strokeWidth={3} className="absolute top-0.5 right-0.5 size-2.5 text-danger md:size-3" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The digits in two rows of five on a phone (the tenth key is Erase), three by three on a wide screen. */
export function NumberPad({
  left,
  noting,
  disabled,
  onDigit,
  onErase,
}: {
  left: number[];
  noting: boolean;
  disabled: boolean;
  onDigit: (digit: number) => void;
  onErase: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a pad of buttons, not a form
    <div role="group" aria-label="Number pad" className="grid grid-cols-5 gap-1.5 md:grid-cols-3 md:gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
        const count = left[digit]!;
        return (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            aria-label={`${noting ? "Note" : "Write"} ${digit}, ${count === 0 ? "none" : count} left`}
            onClick={() => onDigit(digit)}
            className={cn(
              "flex h-14 flex-col items-center justify-center rounded-control border border-border-strong bg-page transition-colors duration-150 hover:bg-surface active:bg-surface-strong disabled:opacity-50 motion-reduce:transition-none md:h-16",
              noting && "border-dashed",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "tabular leading-none",
                noting ? "text-lead text-ink-muted" : "text-heading text-ink",
                count === 0 && "text-ink-faint",
              )}
            >
              {digit}
            </span>
            <span aria-hidden className="mt-1 text-micro leading-none text-ink-muted tabular">
              {count === 0 ? "none left" : `${count} left`}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={onErase}
        className="flex h-14 flex-col items-center justify-center gap-1 rounded-control border border-border-strong bg-page text-small text-ink transition-colors duration-150 hover:bg-surface active:bg-surface-strong disabled:opacity-50 motion-reduce:transition-none md:col-span-3 md:h-12 md:flex-row md:gap-2"
      >
        <Eraser aria-hidden className="size-5" />
        Erase
      </button>
    </div>
  );
}
