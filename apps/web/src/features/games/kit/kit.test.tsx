/**
 * The pieces every game shares: the seeded generator, the unfinished game kept in this
 * browser (and the game going on when it cannot be), the tally line, and the Games page.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, type ReactElement, useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GamesPage from "../games-page";
import { gameScreens } from "../screens";
import { clearDeviceSave, readDeviceSave, SAVE_AFTER_MS, useDeviceSave, writeDeviceSave } from "./device-save";
import { newSeed, seededRng, shuffled } from "./rng";
import { GameTallyLine, tallyWords } from "./tally";

function show(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const isTimedGame = (value: unknown): value is { moves: number; seconds: number } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { moves?: unknown }).moves === "number" &&
  typeof (value as { seconds?: unknown }).seconds === "number";

/** A game that follows another tab, and keeps what it has with time added, as every game adds the time since its last move. */
function FollowingBoard({ onFollowed }: { onFollowed: (game: unknown) => void }) {
  const [game, setGame] = useState({ moves: 1, seconds: 0 });
  useDeviceSave("test", game, (current) => ({ ...current, seconds: current.seconds + 1 }), {
    accept: isTimedGame,
    onFollow: (other) => {
      onFollowed(other);
      setGame(other);
    },
  });
  return <p>{game.moves} moves</p>;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("the seeded generator", () => {
  it("gives the same numbers for the same seed, and others for another", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(Array.from({ length: 5 }, seededRng(43))).not.toEqual(first);
    for (const value of first) expect(value >= 0 && value < 1).toBe(true);
  });

  it("shuffles into a copy holding the same things", () => {
    const items = Array.from({ length: 52 }, (_, index) => index);
    const mixed = shuffled(items, seededRng(7));
    expect(mixed).not.toEqual(items);
    expect([...mixed].sort((x, y) => x - y)).toEqual(items);
    expect(shuffled(items, seededRng(7))).toEqual(mixed);
  });

  it("makes a seed that is a whole number above nought", () => {
    const seed = newSeed();
    expect(Number.isInteger(seed) && seed >= 1 && seed < 2 ** 32).toBe(true);
  });
});

describe("an unfinished game kept on this device", () => {
  it("is written a moment after a burst of moves, once, at once when hidden, and not again when nothing changed", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const set = vi.spyOn(Storage.prototype, "setItem");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    try {
      const { rerender, unmount } = renderHook(({ moves }) => useDeviceSave("test", { moves }), { initialProps: { moves: 1 } });
      rerender({ moves: 2 });
      rerender({ moves: 3 });
      expect(set).not.toHaveBeenCalled();
      vi.advanceTimersByTime(SAVE_AFTER_MS);
      expect(set).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("outpost.games.test")).toBe('{"moves":3}');
      rerender({ moves: 3 });
      vi.advanceTimersByTime(SAVE_AFTER_MS);
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(set).toHaveBeenCalledTimes(1);
      rerender({ moves: 4 });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(set).toHaveBeenCalledTimes(2);
      rerender({ moves: 5 });
      unmount();
      expect(localStorage.getItem("outpost.games.test")).toBe('{"moves":5}');
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  const isGame = (value: unknown): value is { moves: number } =>
    typeof value === "object" && value !== null && typeof (value as { moves?: unknown }).moves === "number";

  it("follows the same game played in another tab of this browser, without writing it straight back", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const set = vi.spyOn(Storage.prototype, "setItem");
    const followed = vi.fn();
    const fromOtherTab = (key: string, value: string | null) =>
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
      });
    try {
      show(<FollowingBoard onFollowed={followed} />);
      act(() => vi.advanceTimersByTime(SAVE_AFTER_MS));
      expect(set).toHaveBeenCalledTimes(1);
      fromOtherTab("outpost.games.test", '{"moves":4,"seconds":30}');
      expect(screen.getByText("4 moves")).toBeInTheDocument();
      fromOtherTab("outpost.games.test", '{"moves":6,"seconds":42}');
      expect(screen.getByText("6 moves")).toBeInTheDocument();
      // Another game, a damaged copy, a game of another shape and a cleared key are left alone.
      fromOtherTab("outpost.games.other", '{"moves":9,"seconds":1}');
      fromOtherTab("outpost.games.test", "{not json");
      fromOtherTab("outpost.games.test", '{"moves":"nine"}');
      fromOtherTab("outpost.games.test", null);
      expect(screen.getByText("6 moves")).toBeInTheDocument();
      expect(followed).toHaveBeenCalledTimes(2);
      act(() => vi.advanceTimersByTime(SAVE_AFTER_MS * 2));
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("is kept, read back only when it passes the check, and cleared", () => {
    expect(writeDeviceSave("test", { moves: 3 })).toBe(true);
    expect(readDeviceSave("test", isGame)).toEqual({ moves: 3 });
    localStorage.setItem("outpost.games.test", JSON.stringify({ moves: "three" }));
    expect(readDeviceSave("test", isGame)).toBeNull();
    localStorage.setItem("outpost.games.test", "{not json");
    expect(readDeviceSave("test", isGame)).toBeNull();
    clearDeviceSave("test");
    expect(localStorage.getItem("outpost.games.test")).toBeNull();
  });

  it("leaves the game going when the browser refuses to keep anything", () => {
    const refuse = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse);
    try {
      expect(writeDeviceSave("test", { moves: 1 })).toBe(false);
      expect(readDeviceSave("test", isGame)).toBeNull();
      expect(() => clearDeviceSave("test")).not.toThrow();
    } finally {
      set.mockRestore();
      get.mockRestore();
      remove.mockRestore();
    }
  });
});

describe("a game's tally", () => {
  it("is said in a sentence", () => {
    expect(tallyWords(undefined)).toBe("Not played yet.");
    expect(tallyWords({ played: 1200, won: 5, bestSeconds: 252, fewestMoves: 88, lastAt: 1 })).toBe(
      "Played 1,200, won 5. Best time 4 minutes 12 seconds. Fewest moves 88.",
    );
  });

  it("is read from the server, and cleared for the household after asking", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    let tally: Record<string, unknown> = { "draw-1": { played: 3, won: 1, bestSeconds: null, fewestMoves: 120, lastAt: 1 } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://outpost.test");
        calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
        if (init?.method === "DELETE") {
          tally = {};
          return json({ removed: true });
        }
        return json({ tallies: { solitaire: tally, "peg-solitaire": {}, sudoku: {}, draughts: {}, pairs: {} }, allotmentStarted: false });
      }),
    );
    show(<GameTallyLine game="solitaire" variant="draw-1" variantLabel="Draw one" />);
    expect(await screen.findByText("Draw one: Played 3, won 1. Fewest moves 120.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear the tally" }));
    expect(screen.getByRole("alertdialog", { name: "Clear the tally?" })).toHaveTextContent("3 games played");
    await user.click(screen.getByRole("button", { name: "Clear the tally" }));
    expect(await screen.findByText("Draw one: Not played yet.")).toBeInTheDocument();
    expect(calls).toContain("DELETE /api/games/solitaire");
  });

  it("says so when the server cannot be reached, and nothing else", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "internal", message: "Down." } }, 500)),
    );
    show(<GameTallyLine game="sudoku" variant="gentle" variantLabel="Gentle" />);
    expect(await screen.findByText("The tally could not be read from the server.")).toBeInTheDocument();
  });
});

describe("the Games page", () => {
  it("lists the six games in order, each linking to its screen", () => {
    show(<GamesPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Games" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(gameScreens.map((game) => game.to));
    expect(gameScreens.map((game) => game.label)).toEqual(["Allotment", "Solitaire", "Peg solitaire", "Sudoku", "Draughts", "Pairs"]);
    expect(screen.getByText(/stays on the device it is being played on/)).toBeInTheDocument();
  });
});
