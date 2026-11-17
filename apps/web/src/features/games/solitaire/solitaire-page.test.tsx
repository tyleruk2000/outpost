/**
 * The Solitaire screen: a seeded deal named card by card, a tap sending a card to its best
 * place and undo putting the table back exactly, a card that cannot go anywhere, the
 * keyboard's pick and put, a tap that picks up, a new deal and a change of draw asked
 * about once a move is made (and counted as played), a win posted to the tally, and the
 * game going on after a reload.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardOf } from "./engine";
import { newGame } from "./game";
import SolitairePage from "./solitaire-page";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tallies = { tallies: { solitaire: {}, sudoku: {}, draughts: {}, pairs: {} }, allotmentStarted: false };

let posted: unknown[] = [];

function show(address = "/games/solitaire?seed=2") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <SolitairePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const table = () => screen.getByRole("group", { name: "Table" });
/** Every name on the table, in order: the whole board as a screen reader hears it. */
const names = () =>
  within(table())
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
const said = () => document.querySelector("[aria-live=polite]")?.textContent ?? "";

beforeEach(() => {
  localStorage.clear();
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/games") && (!init?.method || init.method === "GET")) return json(tallies);
      if (url.endsWith("/api/games/solitaire/results")) {
        posted.push(JSON.parse(String(init?.body)));
        return json({ tally: {} });
      }
      return json({ error: "not here" }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("the Solitaire screen", () => {
  it("deals the seed's cards: seven piles, each top card named, and the stock", async () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Solitaire" })).toBeInTheDocument();
    expect(names()).toEqual([
      "Stock, 24 cards",
      "Waste, empty",
      "Foundation for spades, empty",
      "Foundation for hearts, empty",
      "Foundation for clubs, empty",
      "Foundation for diamonds, empty",
      "7 of spades, face up",
      "6 of hearts, face up",
      "Ace of clubs, face up",
      "10 of spades, face up",
      "3 of diamonds, face up",
      "Queen of spades, face up",
      "Ace of spades, face up",
    ]);
    expect(screen.getByRole("group", { name: "Pile 7, 6 face down" })).toBeInTheDocument();
    expect(await screen.findByText("Draw one: Not played yet.")).toBeInTheDocument();
  });

  it("sends a tapped card to its best place, and undo puts the table back exactly", async () => {
    const user = userEvent.setup();
    show();
    const before = names();
    await user.click(screen.getByRole("button", { name: "6 of hearts, face up" }));
    expect(within(screen.getByRole("group", { name: "Pile 1" })).getByRole("button", { name: "6 of hearts, face up" })).toBeInTheDocument();
    expect(said()).toBe("Moved the 6 of hearts to the 7 of spades. Turned up the 3 of spades.");
    expect(screen.getByText(/^1 move/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(names()).toEqual(before);
    expect(screen.getByRole("group", { name: "Pile 2, 1 face down" })).toBeInTheDocument();
    expect(screen.getByText(/^0 moves/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("turns the stock, and undo puts the card back on it", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Stock, 24 cards" }));
    expect(screen.getByRole("button", { name: "Stock, 23 cards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Waste, .+ on top, 1 card$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Stock, 24 cards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waste, empty" })).toBeInTheDocument();
  });

  it("says when a tapped card cannot go anywhere", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "10 of spades, face up" }));
    expect(said()).toBe("The 10 of spades cannot go anywhere.");
    expect(screen.getByText(/^0 moves/)).toBeInTheDocument();
  });

  it("puts away all that can go", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Put away all that can go" }));
    expect(screen.getByRole("button", { name: "Foundation for clubs, up to the ace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Foundation for spades, up to the ace" })).toBeInTheDocument();
    expect(said()).toMatch(/^Put away \d+ cards\.$/);
  });

  it("picks up and puts down with the keyboard", async () => {
    const user = userEvent.setup();
    show();
    screen.getByRole("button", { name: "6 of hearts, face up" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "6 of hearts, face up, picked up" })).toBeInTheDocument();
    // Left arrow to pile 1, then Enter to put the card there.
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "7 of spades, face up" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(within(screen.getByRole("group", { name: "Pile 1" })).getAllByRole("button")).toHaveLength(2);
    expect(said()).toMatch(/^Moved the 6 of hearts to the 7 of spades\./);
  });

  it("can pick a card up with a tap instead, and put it with the next", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("radio", { name: "Picks it up" }));
    await user.click(screen.getByRole("button", { name: "6 of hearts, face up" }));
    expect(screen.getByRole("button", { name: "6 of hearts, face up, picked up" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Queen of spades, face up" }));
    // Not a place for it: the queen is picked up instead.
    expect(screen.getByRole("button", { name: "Queen of spades, face up, picked up" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "6 of hearts, face up" }));
    await user.click(screen.getByRole("button", { name: "7 of spades, face up" }));
    expect(within(screen.getByRole("group", { name: "Pile 1" })).getAllByRole("button")).toHaveLength(2);
    expect(localStorage.getItem("outpost.games.solitaire-tap")).toBe('"pick"');
  });

  it("deals again at once before a move, and asks once a move is made, counting the game as played", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "New deal" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Stock/ }));
    await user.click(screen.getByRole("button", { name: "New deal" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Deal a new game?" });
    expect(dialog).toHaveTextContent("counted as played, not won");
    await user.click(within(dialog).getByRole("button", { name: "Deal a new game" }));
    await vi.waitFor(() => expect(posted).toEqual([{ variant: "draw-1", won: false, seconds: 0, moves: 1 }]));
    expect(screen.getByRole("button", { name: "Stock, 24 cards" })).toBeInTheDocument();
  });

  it("changes to draw three on the same deal before a move, and asks after one", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("radio", { name: "Draw three" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(names()).toContain("6 of hearts, face up");
    await user.click(screen.getByRole("button", { name: "Stock, 24 cards" }));
    expect(screen.getByRole("button", { name: "Stock, 21 cards" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Draw one" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Deal a game of draw one?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep playing" }));
    expect(screen.getByRole("button", { name: "Stock, 21 cards" })).toBeInTheDocument();
    expect(posted).toEqual([]);
  });

  it("says a win in one line, posts it once, and offers a new game", async () => {
    const user = userEvent.setup();
    const game = newGame(3, 1);
    const nearly = {
      ...game,
      played: true,
      seconds: 252,
      now: {
        board: {
          stock: [],
          waste: [],
          foundations: [13, 13, 13, 12],
          piles: [{ down: [], up: [cardOf(3, 13)] }, ...Array.from({ length: 6 }, () => ({ down: [], up: [] }))],
        },
        moves: 95,
      },
    };
    localStorage.setItem("outpost.games.solitaire", JSON.stringify(nearly));
    show("/games/solitaire");
    await user.click(screen.getByRole("button", { name: "King of clubs, face up" }));
    expect(screen.getByText("Won in 4 minutes 12 seconds and 96 moves.")).toBeInTheDocument();
    await vi.waitFor(() => expect(posted).toEqual([{ variant: "draw-1", won: true, seconds: 252, moves: 96 }]));
    await waitFor(() => expect(localStorage.getItem("outpost.games.solitaire")).toBeNull());
    await user.click(screen.getByRole("button", { name: "New game" }));
    expect(screen.getByRole("button", { name: "Stock, 24 cards" })).toBeInTheDocument();
    expect(posted).toHaveLength(1);
  });

  it("offers to finish once every card is in view", async () => {
    const user = userEvent.setup();
    const nearly = {
      ...newGame(3, 1),
      played: true,
      now: {
        board: {
          stock: [],
          waste: [cardOf(1, 13)],
          foundations: [12, 11, 13, 13] as [number, number, number, number],
          piles: [
            { down: [], up: [cardOf(0, 13)] },
            { down: [], up: [cardOf(1, 12)] },
            ...Array.from({ length: 5 }, () => ({ down: [], up: [] })),
          ],
        },
        moves: 40,
      },
    };
    localStorage.setItem("outpost.games.solitaire", JSON.stringify(nearly));
    show("/games/solitaire");
    await user.click(screen.getByRole("button", { name: "Finish the game" }));
    expect(screen.getByText(/^Won in .+ and 43 moves\.$/)).toBeInTheDocument();
  });

  it("goes on with the same game after a reload, and runs without the server", async () => {
    const user = userEvent.setup();
    const first = show();
    await user.click(screen.getByRole("button", { name: "6 of hearts, face up" }));
    const board = names();
    first.unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    show("/games/solitaire");
    expect(names()).toEqual(board);
    expect(screen.getByText(/^1 move/)).toBeInTheDocument();
    expect(await screen.findByText("The tally could not be read from the server.")).toBeInTheDocument();
  });

  it("counts the time only while the screen is in view, and sets no timer while it is hidden", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const turnTo = (state: DocumentVisibilityState) =>
      act(() => {
        visibility.mockReturnValue(state);
        document.dispatchEvent(new Event("visibilitychange"));
      });
    try {
      show();
      act(() => screen.getByRole("button", { name: "Stock, 24 cards" }).click());
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByText(/3 seconds/)).toBeInTheDocument();
      turnTo("hidden");
      act(() => vi.advanceTimersByTime(5000));
      expect(vi.getTimerCount()).toBe(0);
      expect(screen.getByText(/3 seconds/)).toBeInTheDocument();
      // Kept as it stood when it was hidden, with the time.
      expect(JSON.parse(localStorage.getItem("outpost.games.solitaire") ?? "null")).toMatchObject({ seconds: 3 });
      turnTo("visible");
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByText(/5 seconds/)).toBeInTheDocument();
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });
});
