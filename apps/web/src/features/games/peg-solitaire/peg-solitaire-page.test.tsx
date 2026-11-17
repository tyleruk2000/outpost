/**
 * The Peg solitaire screen: a board of 33 named holes, a jump made by two taps and
 * taken back exactly, the arrow keys and Enter and Escape, a game played to its end with
 * the result sent once, starting again that asks first and counts the game as played,
 * the game kept on this device, and play going on when the server is out of reach.
 */
import type { GamesResponse } from "@outpost/shared";
import { type JumpPair, parseHole } from "@outpost/shared/games/peg-solitaire";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newGame, type PegGame } from "./game";
import PegSolitairePage from "./peg-solitaire-page";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const empty: GamesResponse = {
  tallies: { solitaire: {}, "peg-solitaire": {}, sudoku: {}, draughts: {}, pairs: {} },
  allotmentStarted: false,
};

let posted: unknown[] = [];

function serve() {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/games/peg-solitaire/results") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return json({ tally: {} });
      }
      if (url.endsWith("/api/games")) return json(empty);
      return json({ error: "not found" }, 404);
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/games/peg-solitaire"]}>
        <PegSolitairePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const pair = (text: string): JumpPair => {
  const [from, to] = text.split("-");
  return [parseHole(from!)!, parseHole(to!)!];
};
/** A whole solution, ending with one peg in the centre (it is replayed in the engine's tests). */
const SOLUTION = (
  "d6-d4 b5-d5 c7-c5 e7-c7 d5-b5 a5-c5 e5-e7 g5-e5 c4-c6 c7-c5 a4-c4 c4-c6 e4-e6 e7-e5 g4-e4 e4-e6 " +
  "c2-c4 a3-c3 c3-c5 c6-c4 c4-e4 e3-e5 e6-e4 g3-e3 d3-f3 e1-e3 e4-e2 c1-e1 e1-e3 f3-d3 d2-d4"
)
  .split(" ")
  .map(pair);

const keep = (game: PegGame) => localStorage.setItem("outpost.games.peg-solitaire", JSON.stringify(game));
const kept = (): PegGame => JSON.parse(localStorage.getItem("outpost.games.peg-solitaire") ?? "null");
const count = () => screen.getByTestId("peg-count");
const hole = (name: string | RegExp) => within(screen.getByRole("grid", { name: "Board" })).getByRole("button", { name });

beforeEach(() => {
  localStorage.clear();
  serve();
});
afterEach(() => vi.unstubAllGlobals());

describe("the board", () => {
  it("is a grid of the 33 holes, each named with what is in it, the centre empty", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Peg solitaire" })).toBeInTheDocument();
    expect(within(screen.getByRole("grid", { name: "Board" })).getAllByRole("button")).toHaveLength(33);
    expect(hole("Hole d4, centre, empty")).toBeInTheDocument();
    expect(hole("Hole d6, peg, can jump to d4")).toBeInTheDocument();
    expect(hole("Hole a3, peg")).toBeInTheDocument();
    expect(count()).toHaveTextContent("32 pegs left.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("jumps by two taps, marks where a picked peg can go, and Undo puts the board back exactly", async () => {
    const user = userEvent.setup();
    show();
    await user.click(hole("Hole d6, peg, can jump to d4"));
    expect(hole("Hole d6, peg, picked, can jump to d4")).toHaveAttribute("aria-pressed", "true");
    await user.click(hole("Hole d4, centre, empty, the peg on d6 can jump here"));
    expect(hole("Hole d4, centre, peg")).toBeInTheDocument();
    expect(hole("Hole d5, empty")).toBeInTheDocument();
    expect(hole("Hole d6, empty")).toBeInTheDocument();
    expect(count()).toHaveTextContent("31 pegs left.");
    expect(screen.getByText("d6 over d5 to d4. 31 pegs left.")).toBeInTheDocument();
    await waitFor(() => expect(kept().jumps).toEqual([pair("d6-d4")]));
    // After that jump, b5 can jump into d5's hole; d7 has nothing to jump over.
    expect(hole("Hole b5, peg, can jump to d5")).toBeInTheDocument();
    expect(hole("Hole d7, peg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(count()).toHaveTextContent("32 pegs left.");
    expect(hole("Hole d4, centre, empty")).toBeInTheDocument();
    expect(hole("Hole d5, peg")).toBeInTheDocument();
    await waitFor(() => expect(kept()).toEqual(newGame()));
  });

  it("says why a tap does nothing, and a second tap on the picked peg puts it down", async () => {
    const user = userEvent.setup();
    show();
    await user.click(hole("Hole a3, peg"));
    expect(screen.getByText(/That peg has no jump/)).toBeInTheDocument();
    await user.click(hole("Hole b4, peg, can jump to d4"));
    await user.click(hole("Hole b4, peg, picked, can jump to d4"));
    expect(hole("Hole b4, peg, can jump to d4")).not.toHaveAttribute("aria-pressed");
    await user.click(hole("Hole d6, peg, can jump to d4"));
    await user.click(hole("Hole d7, peg"));
    // d7 has no jump: d6 is picked no longer.
    expect(hole("Hole d6, peg, can jump to d4")).toBeInTheDocument();
    expect(count()).toHaveTextContent("32 pegs left.");
  });

  it("moves focus with the arrow keys, picks and puts with Enter, and drops with Escape", async () => {
    const user = userEvent.setup();
    show();
    hole("Hole d4, centre, empty").focus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(hole("Hole d6, peg, can jump to d4")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(hole("Hole d6, peg, picked, can jump to d4")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(hole("Hole d6, peg, can jump to d4")).not.toHaveAttribute("aria-pressed");
    await user.keyboard("{Enter}{ArrowDown}{ArrowDown}{Enter}");
    expect(count()).toHaveTextContent("31 pegs left.");
    // Focus stops at the edge of the cross: c1 has no hole to its left.
    hole(/^Hole c1,/).focus();
    await user.keyboard("{ArrowLeft}");
    expect(hole(/^Hole c1,/)).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowLeft}{ArrowLeft}");
    expect(hole(/^Hole a3,/)).toHaveFocus();
  });
});

describe("the end", () => {
  it("says the game is solved with the last peg in the centre, and sends the result once", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(), jumps: SOLUTION.slice(0, 30), startedAt: Date.now() - 95_000, seconds: 94.6 });
    show();
    expect(count()).toHaveTextContent("2 pegs left.");
    await user.click(hole("Hole d2, peg, can jump to d4"));
    await user.click(hole(/^Hole d4, centre, empty, the peg on d2 can jump here/));
    expect(screen.getByTestId("peg-ending")).toHaveTextContent("Solved: one peg left, in the centre.");
    expect(screen.getByText(/^31 moves in 1 minute 3[45] seconds\.$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ variant: "english", won: true, left: 1, moves: 31 });
    await waitFor(() => expect(kept().recorded).toBe(true));
    // Start again does not ask once the game is over, and sends nothing more.
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(count()).toHaveTextContent("32 pegs left.");
    expect(posted).toHaveLength(1);
  });

  it("counts the time only while the board is in view, not while the phone is locked", async () => {
    let clock = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const turnTo = (state: DocumentVisibilityState) => {
      visibility.mockReturnValue(state);
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      const user = userEvent.setup();
      keep({ ...newGame(), jumps: SOLUTION.slice(0, 30), startedAt: Date.now() - 4 * 3_600_000, seconds: 60 });
      show();
      clock += 10_000;
      turnTo("hidden");
      clock += 3_600_000;
      turnTo("visible");
      clock += 5_000;
      await user.click(hole("Hole d2, peg, can jump to d4"));
      await user.click(hole(/^Hole d4, centre, empty, the peg on d2 can jump here/));
      expect(screen.getByText("31 moves in 1 minute 15 seconds.")).toBeInTheDocument();
      await waitFor(() => expect(posted[0]).toMatchObject({ won: true, seconds: 75 }));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("says how many pegs remain when no move is left", async () => {
    const user = userEvent.setup();
    // Two jumps from the end of the solution three pegs are left, on d2, e3 and f3; e3 over f3 to g3 leaves two apart.
    keep({ ...newGame(), jumps: SOLUTION.slice(0, 29), startedAt: Date.now() });
    show();
    expect(count()).toHaveTextContent("3 pegs left.");
    await user.click(hole("Hole e3, peg, can jump to g3"));
    await user.click(hole("Hole g3, empty, the peg on e3 can jump here"));
    expect(screen.getByTestId("peg-ending")).toHaveTextContent("No moves left. 2 pegs remain.");
    expect(screen.getByText("e3 over f3 to g3. No moves left. 2 pegs remain.")).toBeInTheDocument();
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ variant: "english", won: false, left: 2, moves: 30 })]));
  });

  it("says solved, without the centre, when the last peg is elsewhere", async () => {
    const user = userEvent.setup();
    // One jump from the end, pegs on d2 and d3: d3 over d2 to d1 leaves the last peg on the edge.
    keep({ ...newGame(), jumps: SOLUTION.slice(0, 30), startedAt: Date.now() });
    show();
    await user.click(hole("Hole d3, peg, can jump to d1"));
    await user.click(hole("Hole d1, empty, the peg on d3 can jump here"));
    expect(screen.getByTestId("peg-ending")).toHaveTextContent("Solved: one peg left.");
    expect(screen.getByTestId("peg-ending")).not.toHaveTextContent("centre");
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ won: true, left: 1, moves: 31 })]));
  });
});

describe("starting again", () => {
  it("asks first once a jump has been made, and counts the game left as played and not solved", async () => {
    const user = userEvent.setup();
    keep({ ...newGame(), jumps: SOLUTION.slice(0, 3), startedAt: Date.now() });
    show();
    expect(count()).toHaveTextContent("29 pegs left.");
    await user.click(screen.getByRole("button", { name: "Start again" }));
    const dialog = screen.getByRole("alertdialog", { name: "Start again?" });
    await user.click(within(dialog).getByRole("button", { name: "Start again" }));
    expect(count()).toHaveTextContent("32 pegs left.");
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ variant: "english", won: false, moves: 3 })]));
    await waitFor(() => expect(kept().jumps).toEqual([]));
  });

  it("starts at once when nothing has been played", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(posted).toEqual([]);
  });
});

describe("what is kept", () => {
  it("continues the kept game", () => {
    keep({ ...newGame(), jumps: SOLUTION.slice(0, 2), startedAt: Date.now() });
    show();
    expect(count()).toHaveTextContent("30 pegs left.");
    expect(hole("Hole d5, peg")).toBeInTheDocument();
  });

  it("refuses a damaged save and starts afresh", async () => {
    keep({ ...newGame(), jumps: [pair("d6-d4"), pair("d6-d4")] });
    show();
    expect(count()).toHaveTextContent("32 pegs left.");
    await waitFor(() => expect(kept()).toEqual(newGame()));
  });

  it("refuses a save of another shape", () => {
    localStorage.setItem(
      "outpost.games.peg-solitaire",
      JSON.stringify({ version: 1, jumps: [[24, "d4"]], startedAt: null, seconds: null }),
    );
    show();
    expect(count()).toHaveTextContent("32 pegs left.");
  });

  it("plays on when the server cannot be reached, and says the tally could not be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const user = userEvent.setup();
    show();
    expect(await screen.findByText("The tally could not be read from the server.")).toBeInTheDocument();
    await user.click(hole("Hole f4, peg, can jump to d4"));
    await user.click(hole(/^Hole d4, centre, empty, the peg on f4/));
    expect(count()).toHaveTextContent("31 pegs left.");
  });
});
