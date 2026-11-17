/**
 * The Pairs screen: a deal from the seed in the address, a match kept face up and named
 * "matched", a miss turned back after a second or at once on the next tap, the game kept
 * through a reload, the calm line at the end, and the game going on without the server.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deal } from "./engine";
import PairsPage from "./pairs-page";

const SEED = 31;
const dealt = deal(SEED, "small");
const pairsOf = () => {
  const where = new Map<string, number[]>();
  dealt.cards.forEach((card, index) => {
    where.set(card, [...(where.get(card) ?? []), index]);
  });
  return [...where.values()] as Array<[number, number]>;
};

function show(address = `/games/pairs?seed=${SEED}&size=small`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <PairsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tallies = { tallies: { solitaire: {}, "peg-solitaire": {}, sudoku: {}, draughts: {}, pairs: {} }, allotmentStarted: false };
let reachable = true;
const posted: unknown[] = [];

beforeEach(() => {
  localStorage.clear();
  reachable = true;
  posted.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!reachable) throw new TypeError("Failed to fetch");
      if (String(url).endsWith("/api/games"))
        return new Response(JSON.stringify(tallies), { headers: { "Content-Type": "application/json" } });
      posted.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ tally: {} }), { headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const card = (index: number) => screen.getByRole("button", { name: new RegExp(`^Card ${index + 1},`) });

describe("the Pairs screen", () => {
  it("deals the cards of the seed face down, each a named button", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Pairs" })).toBeInTheDocument();
    const cards = within(screen.getByRole("group", { name: "Cards" })).getAllByRole("button");
    expect(cards).toHaveLength(12);
    expect(cards[3]).toHaveAccessibleName("Card 4, face down");
    expect(screen.getByRole("radio", { name: "Small" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Find the 6 pairs. Turn over two cards at a time.")).toBeInTheDocument();
  });

  it("keeps a match face up and says matched, and keeps it through a reload", async () => {
    const user = userEvent.setup();
    const view = show();
    const [a, b] = pairsOf()[0]!;
    await user.click(card(a));
    expect(card(a).getAttribute("aria-label")).toMatch(new RegExp(`^Card ${a + 1}, (a|an|some|the) [a-z]+$`));
    await user.click(card(b));
    expect(card(a)).toHaveAccessibleName(/, matched$/);
    expect(card(b)).toHaveAccessibleName(/, matched$/);
    expect(screen.getByText("1 of 6 pairs found, 1 turn.")).toBeInTheDocument();
    view.unmount();
    show("/games/pairs");
    expect(card(a)).toHaveAccessibleName(/, matched$/);
  });

  it("turns a miss back after a second, or at once on the next tap", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();
    const pairs = pairsOf();
    const [a] = pairs[0]!;
    const [c] = pairs[1]!;
    const [d] = pairs[2]!;
    await user.click(card(a));
    await user.click(card(c));
    expect(card(c)).not.toHaveAccessibleName(/face down/);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(card(a)).toHaveAccessibleName(`Card ${a + 1}, face down`);
    expect(card(c)).toHaveAccessibleName(`Card ${c + 1}, face down`);
    // A second miss, then a tap on a third card: the miss turns back at once.
    await user.click(card(a));
    await user.click(card(c));
    await user.click(card(d));
    expect(card(a)).toHaveAccessibleName(`Card ${a + 1}, face down`);
    expect(card(d)).not.toHaveAccessibleName(/face down/);
  });

  it("ends in one calm line, reports the win, and offers to play again", async () => {
    const user = userEvent.setup();
    show();
    for (const [a, b] of pairsOf()) {
      await user.click(card(a));
      await user.click(card(b));
    }
    expect(screen.getByText(/^All 6 pairs found in 6 turns, in \d+ seconds?\.$/, { selector: "p.text-lead" })).toBeInTheDocument();
    expect(posted).toEqual([expect.objectContaining({ variant: "small", won: true, moves: 6 })]);
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(card(0)).toHaveAccessibleName("Card 1, face down");
  });

  it("moves between the cards with the arrow keys", async () => {
    const user = userEvent.setup();
    show();
    card(0).focus();
    await user.keyboard("{ArrowRight}");
    expect(card(1)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    // jsdom lays nothing out, so a row is as wide as the size's columns on a phone: 3 for small.
    expect(card(4)).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(card(4)).not.toHaveAccessibleName(/face down/);
  });

  it("asks before dealing again over a game in progress", async () => {
    const user = userEvent.setup();
    show();
    await user.click(card(0));
    await user.click(card(1));
    await user.click(screen.getByRole("radio", { name: "Large" }));
    const dialog = screen.getByRole("alertdialog", { name: "Start a large game?" });
    await user.click(within(dialog).getByRole("button", { name: "New game" }));
    expect(within(screen.getByRole("group", { name: "Cards" })).getAllByRole("button")).toHaveLength(24);
    expect(posted).toEqual([expect.objectContaining({ variant: "small", won: false })]);
  });

  it("is played the same when the server cannot be reached", async () => {
    reachable = false;
    show();
    expect(await screen.findByText("The tally could not be read from the server.")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(card(0));
    expect(card(0)).not.toHaveAccessibleName(/face down/);
  });
});
