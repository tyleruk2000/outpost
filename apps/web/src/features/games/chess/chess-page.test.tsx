/**
 * The Chess screen: 64 named squares, a move by two taps with the legal squares shown and
 * the computer's reply (searched on the page here, as where there is no Worker), an
 * illegal move said in words, promotion with a choice of piece, the arrow keys, undo,
 * turning the board, PGN and FEN copied out and pasted in, the game kept on this device,
 * and the result sent to the tally once.
 */
import type { GamesResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChessPage from "./chess-page";
import { type Game, newGame } from "./game";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const empty: GamesResponse = {
  tallies: { solitaire: {}, "peg-solitaire": {}, sudoku: {}, draughts: {}, chess: {}, pairs: {}, snake: {} },
  allotmentStarted: false,
};

let posted: unknown[] = [];

beforeEach(() => {
  localStorage.clear();
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/games/chess/results") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return json({ tally: {} });
      }
      if (url.endsWith("/api/games")) return json(empty);
      return json({ error: "not found" }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function show(path = "/games/chess?seed=5") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ChessPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const keep = (game: Game) => localStorage.setItem("outpost.games.chess", JSON.stringify(game));
const kept = (): Game => JSON.parse(localStorage.getItem("outpost.games.chess") ?? "null");
const turn = () => screen.getByTestId("chess-turn");
const square = (name: RegExp | string) => screen.getByRole("button", { name });

describe("the board", () => {
  it("is a grid of 64 squares, each named with what is on it, white to move first", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Chess" })).toBeInTheDocument();
    expect(within(screen.getByRole("grid", { name: "Board" })).getAllByRole("button")).toHaveLength(64);
    expect(square("e2, your pawn")).toBeInTheDocument();
    expect(square("e8, computer's king")).toBeInTheDocument();
    expect(square("e4, empty")).toBeInTheDocument();
    expect(turn()).toHaveTextContent("You play white and move first.");
  });

  it("shows the legal squares for a piece picked up, moves by two taps, and the computer replies", async () => {
    const user = userEvent.setup();
    show();
    await user.click(square("g1, your knight"));
    expect(square("g1, your knight, picked")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /you can move here/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "f3, empty, you can move here",
      "h3, empty, you can move here",
    ]);
    await user.click(square("f3, empty, you can move here"));
    expect(turn()).toHaveTextContent("The computer is thinking…");
    await waitFor(() => expect(turn()).toHaveTextContent("Your move. You play white."), { timeout: 8000 });
    expect(screen.getByRole("list", { name: "Moves" })).toHaveTextContent(/^1\.Nf3/);
    await waitFor(() => expect(kept().moves).toHaveLength(2));
  });

  it("says why a move cannot be made", async () => {
    const user = userEvent.setup();
    show();
    await user.click(square("f1, your bishop"));
    expect(screen.getByText("The bishop on f1 has no legal move.")).toBeInTheDocument();
    await user.click(square("e2, your pawn"));
    await user.click(square("e5, empty"));
    expect(screen.getByText("The pawn on e2 cannot go to e5.")).toBeInTheDocument();
  });

  it("moves focus with the arrow keys and picks and puts with Enter", async () => {
    const user = userEvent.setup();
    show();
    square("e2, your pawn").focus();
    await user.keyboard("{Enter}{ArrowUp}{ArrowUp}");
    expect(square("e4, empty, you can move here")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(square(/^e4, your pawn/)).toBeInTheDocument();
  });

  it("asks which piece a pawn becomes, and puts that piece there", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(9, "two-player", "white", "easy", "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1") });
    show("/games/chess");
    await user.click(square("b7, white pawn"));
    await user.click(square("b8, empty, you can move here"));
    const dialog = await screen.findByRole("dialog", { name: "Promote the pawn" });
    await user.click(within(dialog).getByRole("button", { name: "Knight" }));
    expect(square(/^b8, white knight/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Moves" })).toHaveTextContent("b8=N");
  });

  it("takes back a whole turn with Undo, and turns the board", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(9, "computer", "white", "easy"), moves: ["e2e4", "e7e5"], startedAt: Date.now() });
    show("/games/chess");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(kept().moves).toEqual([]));
    const firstSquare = () => within(screen.getByRole("grid", { name: "Board" })).getAllByRole("button")[0]!;
    expect(firstSquare()).toHaveAccessibleName(/^a8/);
    await user.click(screen.getByRole("button", { name: "Turn the board" }));
    expect(firstSquare()).toHaveAccessibleName(/^h1/);
  });
});

describe("the end of a game", () => {
  it("says checkmate and sends the result once", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(9, "two-player", "white", "easy"), moves: ["f2f3", "e7e5", "g2g4"], startedAt: Date.now() });
    show("/games/chess");
    await user.click(square("d8, black queen"));
    await user.click(square("h4, empty, you can move here"));
    expect(turn()).toHaveTextContent("Checkmate. Black won.");
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ variant: "two-player", won: true })]));
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });
});

describe("carrying a game", () => {
  it("copies the game out as PGN and the position as FEN", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(9, "two-player", "white", "easy"), moves: ["e2e4"], startedAt: Date.now() });
    show("/games/chess");
    await user.click(screen.getByRole("button", { name: "Copy the game" }));
    const dialog = await screen.findByRole("dialog", { name: "Copy the game" });
    expect((within(dialog).getByLabelText("PGN") as HTMLTextAreaElement).value).toContain("1. e4 *");
    expect((within(dialog).getByLabelText("FEN") as HTMLTextAreaElement).value).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    );
  });

  it("reads a pasted game, and says what it cannot read", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Paste a game" }));
    const dialog = await screen.findByRole("dialog", { name: "Paste a game" });
    await user.type(within(dialog).getByLabelText("PGN or FEN"), "1. e4 e5 2. Ke3");
    await user.click(within(dialog).getByRole("button", { name: "Read it in" }));
    expect(within(dialog).getByText('"Ke3" is not a legal move here (move 2).')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("PGN or FEN"));
    await user.type(within(dialog).getByLabelText("PGN or FEN"), "1. e4 e5 2. Nf3 Nc6");
    await user.click(within(dialog).getByRole("button", { name: "Read it in" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(square(/^f3, your knight/)).toBeInTheDocument();
    await waitFor(() => expect(kept().moves).toEqual(["e2e4", "e7e5", "g1f3", "b8c6"]));
  });
});
