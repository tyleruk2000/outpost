/**
 * The Sudoku screen: a puzzle from the seed in the address, a digit and a note written
 * and kept through a reload, a wrong digit marked by Check in words, the keyboard, and
 * the tally saying so when the server cannot be reached.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePuzzle } from "./engine";
import { enter, newGame } from "./game";
import SudokuPage from "./sudoku-page";

const SEED = 4242;
const puzzle = makePuzzle(SEED, "gentle");
const empties = puzzle.givens.flatMap((given, cell) => (given ? [] : [cell]));
const at = (cell: number) => `Row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`;

function show(address = `/games/sudoku?seed=${SEED}&level=gentle`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <SudokuPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tallies = {
  tallies: { solitaire: {}, "peg-solitaire": {}, sudoku: {}, draughts: {}, chess: {}, pairs: {}, snake: {} },
  allotmentStarted: false,
};
let reachable = true;

beforeEach(() => {
  localStorage.clear();
  reachable = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!reachable) throw new TypeError("Failed to fetch");
      if (String(url).endsWith("/api/games"))
        return new Response(JSON.stringify(tallies), { headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ tally: {} }), { headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const cell = (cellIndex: number) => screen.getByRole("button", { name: new RegExp(`^${at(cellIndex)},`) });

describe("the Sudoku screen", () => {
  it("draws the puzzle from the seed as a grid of 81 named cells", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Sudoku" })).toBeInTheDocument();
    const grid = screen.getByRole("grid", { name: "Sudoku grid" });
    expect(within(grid).getAllByRole("button")).toHaveLength(81);
    const given = puzzle.givens.findIndex((digit) => digit !== 0);
    expect(cell(given)).toHaveAccessibleName(`${at(given)}, given ${puzzle.givens[given]}`);
    expect(cell(empties[0]!)).toHaveAccessibleName(`${at(empties[0]!)}, empty`);
    expect(screen.getByRole("radio", { name: "Gentle" })).toHaveAttribute("aria-checked", "true");
  });

  it("writes a digit and a note, and keeps both through a reload", async () => {
    const user = userEvent.setup();
    const view = show();
    const [a, b] = empties;
    await user.click(cell(a!));
    await user.click(screen.getByRole("button", { name: /^Write 5, / }));
    expect(cell(a!)).toHaveAccessibleName(`${at(a!)}, 5`);
    await user.click(screen.getByRole("button", { name: "Notes off" }));
    expect(screen.getByRole("button", { name: "Notes on" })).toHaveAttribute("aria-pressed", "true");
    await user.click(cell(b!));
    await user.click(screen.getByRole("button", { name: /^Note 2, / }));
    await user.click(screen.getByRole("button", { name: /^Note 7, / }));
    expect(cell(b!)).toHaveAccessibleName(`${at(b!)}, empty, notes 2 and 7`);

    view.unmount();
    show("/games/sudoku");
    expect(cell(a!)).toHaveAccessibleName(`${at(a!)}, 5`);
    expect(cell(b!)).toHaveAccessibleName(`${at(b!)}, empty, notes 2 and 7`);
  });

  it("follows the same puzzle played in another tab of this browser", () => {
    show();
    const [a, b] = empties;
    const elsewhere = enter(newGame(SEED, "gentle"), a!, 3);
    const fromOtherTab = (game: unknown) =>
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: "outpost.games.sudoku", newValue: JSON.stringify(game) }));
      });
    fromOtherTab(elsewhere);
    expect(cell(a!)).toHaveAccessibleName(`${at(a!)}, 3`);
    fromOtherTab(enter(elsewhere, b!, 8));
    expect(cell(b!)).toHaveAccessibleName(`${at(b!)}, 8`);
    expect(screen.getByText("This board now shows the moves made in another tab.")).toBeInTheDocument();
  });

  it("marks a wrong digit in words and in its name, without giving the answer, and undoes", async () => {
    const user = userEvent.setup();
    show();
    const target = empties[0]!;
    const wrong = (puzzle.solution[target]! % 9) + 1;
    await user.click(cell(target));
    await user.click(screen.getByRole("button", { name: new RegExp(`^Write ${wrong}, `) }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(cell(target)).toHaveAccessibleName(`${at(target)}, ${wrong}, marked wrong`);
    expect(screen.getByText("1 cell marked wrong. Change it, or undo.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(cell(target)).toHaveAccessibleName(`${at(target)}, empty`);
  });

  it("is played from the keyboard: digits, arrows, Backspace and N for notes", async () => {
    const user = userEvent.setup();
    show();
    const target = empties.find((index) => index % 9 < 8 && puzzle.givens[index + 1] === 0)!;
    await user.click(cell(target));
    await user.keyboard("3");
    expect(cell(target)).toHaveAccessibleName(`${at(target)}, 3`);
    await user.keyboard("{ArrowRight}");
    expect(cell(target + 1)).toHaveFocus();
    await user.keyboard("n4");
    expect(cell(target + 1)).toHaveAccessibleName(`${at(target + 1)}, empty, note 4`);
    await user.keyboard("{ArrowLeft}{Backspace}");
    expect(cell(target)).toHaveAccessibleName(`${at(target)}, empty`);
  });

  it("says a finished puzzle is finished, in one line with the time", async () => {
    const user = userEvent.setup();
    show();
    for (const index of empties) {
      await user.click(cell(index));
      await user.keyboard(String(puzzle.solution[index]));
    }
    expect(screen.getByText(/^Finished in \d+ seconds?, with \d+ moves\.$/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New puzzle" }).length).toBeGreaterThan(0);
  }, 60_000);

  it("asks before throwing away a puzzle in progress", async () => {
    const user = userEvent.setup();
    show();
    await user.click(cell(empties[0]!));
    await user.keyboard("1");
    await user.click(screen.getByRole("radio", { name: "Testing" }));
    const dialog = screen.getByRole("alertdialog", { name: "Start a Testing puzzle?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep this puzzle" }));
    expect(screen.getByRole("radio", { name: "Gentle" })).toHaveAttribute("aria-checked", "true");
  });

  it("still plays when the server cannot be reached, and says the tally could not be read", async () => {
    reachable = false;
    show();
    expect(await screen.findByText("The tally could not be read from the server.")).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Sudoku grid" })).toBeInTheDocument();
  });
});
