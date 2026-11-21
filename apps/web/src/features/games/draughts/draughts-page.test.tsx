/**
 * The Draughts screen: a board of named squares, a move made by tapping and the computer's
 * reply (searched on the page here, as where there is no Worker), the compulsory capture
 * said in words, the arrow keys, two players with a draw agreed, a new game that asks
 * first, the game kept on this device, and play going on when the server is out of reach.
 */
import type { GamesResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseMove } from "./ai";
import DraughtsPage from "./draughts-page";
import { parseSquare } from "./engine";
import { type Game, newGame } from "./game";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const empty: GamesResponse = {
  tallies: { solitaire: {}, "peg-solitaire": {}, sudoku: {}, draughts: {}, chess: {}, pairs: {}, snake: {} },
  allotmentStarted: false,
};

let posted: unknown[] = [];

function serve() {
  posted = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/games/draughts/results") && init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));
      return json({ tally: {} });
    }
    if (url.endsWith("/api/games")) return json(empty);
    return json({ error: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function show(path = "/games/draughts") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <DraughtsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const keep = (game: Game) => localStorage.setItem("outpost.games.draughts", JSON.stringify(game));
const kept = (): Game => JSON.parse(localStorage.getItem("outpost.games.draughts") ?? "null");
const turn = () => screen.getByTestId("draughts-turn");
const path = (...names: string[]) => names.map(parseSquare);

beforeEach(() => {
  localStorage.clear();
  serve();
});
afterEach(() => vi.unstubAllGlobals());

describe("the board", () => {
  it("is a grid of the 32 dark squares, each named with what is on it, dark to move first", () => {
    show("/games/draughts?seed=5");
    expect(screen.getByRole("heading", { level: 1, name: "Draughts" })).toBeInTheDocument();
    const board = screen.getByRole("grid", { name: "Board" });
    expect(within(board).getAllByRole("button")).toHaveLength(32);
    expect(screen.getByRole("button", { name: "Square c3, your man" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Square f6, computer's man" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Square d4, empty" })).toBeInTheDocument();
    expect(turn()).toHaveTextContent("You play dark and move first.");
  });

  it("moves by two taps, and the computer replies after thinking", async () => {
    const user = userEvent.setup();
    show("/games/draughts?seed=5");
    await user.click(screen.getByRole("button", { name: "Square c3, your man" }));
    expect(screen.getByRole("button", { name: "Square c3, your man, picked" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Square d4, empty, you can move here" }));
    expect(screen.getByRole("button", { name: "Square d4, your man" })).toBeInTheDocument();
    expect(turn()).toHaveTextContent("The computer is thinking…");
    await waitFor(() => expect(turn()).toHaveTextContent("Your move. You play dark."), { timeout: 4000 });
    // One light man has left rank 6 (or 7), and the move is named on its square.
    expect(screen.getAllByRole("button", { name: /computer's man, just moved here from/ })).toHaveLength(1);
    await waitFor(() => expect(kept().paths).toHaveLength(2));
    await waitFor(() => expect(kept().seed).toBe(5));
  });

  it("says a capture is compulsory when a piece that cannot move is tapped", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(9, "computer", "dark"), paths: [path("c3", "d4"), path("f6", "e5")], startedAt: Date.now() });
    show();
    await user.click(screen.getByRole("button", { name: "Square a3, your man" }));
    expect(screen.getByText("A capture is compulsory: jump with the piece on d4.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Square d4, your man" }));
    await user.click(screen.getByRole("button", { name: "Square f6, empty, you can move here" }));
    expect(screen.getByRole("button", { name: "Square e5, empty" })).toBeInTheDocument();
  });

  it("moves focus with the arrow keys and picks and puts with Enter", async () => {
    const user = userEvent.setup();
    show("/games/draughts?seed=5");
    screen.getByRole("button", { name: "Square c3, your man" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Square e3, your man" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "Square f4, empty" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}");
    await user.keyboard("{ArrowUp}{Enter}");
    expect(screen.getByRole("button", { name: "Square f4, your man" })).toBeInTheDocument();
  });

  it("takes back the person's move and the computer's reply with Undo", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(9, "computer", "dark"), paths: [path("c3", "d4"), path("f6", "e5")], startedAt: Date.now() });
    show();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(kept().paths).toEqual([]));
    expect(screen.getByRole("button", { name: "Square c3, your man" })).toBeInTheDocument();
  });
});

describe("the computer", () => {
  it("thinks in a worker of its own, ended as soon as it has answered", async () => {
    const workers: Array<{ ended: boolean }> = [];
    class FakeWorker {
      ended = false;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        workers.push(this);
      }
      postMessage({ id, position, seed }: { id: number; position: Parameters<typeof chooseMove>[0]; seed: number }) {
        setTimeout(() => this.onmessage?.({ data: { id, path: chooseMove(position, seed).path } } as MessageEvent), 0);
      }
      terminate() {
        this.ended = true;
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    const user = userEvent.setup();
    show("/games/draughts?seed=5");
    await user.click(screen.getByRole("button", { name: "Square c3, your man" }));
    await user.click(screen.getByRole("button", { name: "Square d4, empty, you can move here" }));
    await waitFor(() => expect(turn()).toHaveTextContent("Your move. You play dark."), { timeout: 4000 });
    expect(workers).toHaveLength(1);
    expect(workers[0]!.ended).toBe(true);
  });

  it("does not think while the page is hidden, and replies once it is shown", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const turnTo = (state: DocumentVisibilityState) =>
      act(() => {
        visibility.mockReturnValue(state);
        document.dispatchEvent(new Event("visibilitychange"));
      });
    try {
      const user = userEvent.setup();
      show("/games/draughts?seed=5");
      await user.click(screen.getByRole("button", { name: "Square c3, your man" }));
      turnTo("hidden");
      await user.click(screen.getByRole("button", { name: "Square d4, empty, you can move here" }));
      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(turn()).toHaveTextContent("The computer is thinking…");
      expect(screen.queryByRole("button", { name: /just moved here/ })).toBeNull();
      turnTo("visible");
      await waitFor(() => expect(turn()).toHaveTextContent("Your move. You play dark."), { timeout: 4000 });
    } finally {
      visibility.mockRestore();
    }
  });
});

describe("two players", () => {
  it("says whose turn it is, and ends in a draw both agree, counted as played", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("radio", { name: "Two players" }));
    expect(turn()).toHaveTextContent("Dark moves first.");
    expect(screen.getByRole("button", { name: "Square c3, dark man" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Square c3, dark man" }));
    await user.click(screen.getByRole("button", { name: "Square d4, empty, you can move here" }));
    expect(turn()).toHaveTextContent("Light to move.");
    await user.click(screen.getByRole("button", { name: "Square d4, dark man" }));
    expect(screen.getByText("That is dark's piece. Light is to move.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agree a draw" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Agree a draw" }));
    expect(turn()).toHaveTextContent("A draw, agreed by both players.");
    await waitFor(() => expect(posted).toEqual([{ variant: "two-player", won: false }]));
  });
});

describe("a new game", () => {
  it("asks first once a move has been made, and counts the game left as played", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(9, "computer", "dark"), paths: [path("c3", "d4"), path("f6", "e5")], startedAt: Date.now() });
    show();
    await user.click(screen.getByRole("button", { name: "New game" }));
    const dialog = screen.getByRole("alertdialog", { name: "Start a new game?" });
    await user.click(within(dialog).getByRole("button", { name: "Start a new game" }));
    expect(turn()).toHaveTextContent("You play dark and move first.");
    await waitFor(() => expect(posted).toEqual([{ variant: "computer", won: false }]));
  });

  it("starts at once when nothing has been played, and plays light with the board turned", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(turn()).toHaveTextContent("The computer is thinking…");
    await waitFor(() => expect(turn()).toHaveTextContent("Your move. You play light."), { timeout: 4000 });
    // Rank 1 is at the top: the first button of the grid is on rank 1.
    const first = within(screen.getByRole("grid", { name: "Board" })).getAllByRole("button")[0]!;
    expect(first).toHaveAccessibleName(/^Square [a-h]1, /);
  });
});

describe("what is kept", () => {
  it("refuses a damaged save and starts afresh", () => {
    localStorage.setItem("outpost.games.draughts", JSON.stringify({ ...newGame(9, "computer", "dark"), paths: [path("c3", "c4")] }));
    show();
    expect(turn()).toHaveTextContent("You play dark and move first.");
  });

  it("plays on when the server cannot be reached, and says the tally could not be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const user = userEvent.setup();
    show("/games/draughts?seed=5");
    expect(await screen.findByText("The tally could not be read from the server.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Square c3, your man" }));
    await user.click(screen.getByRole("button", { name: "Square b4, empty, you can move here" }));
    expect(screen.getByRole("button", { name: "Square b4, your man" })).toBeInTheDocument();
  });
});
