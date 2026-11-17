import { describe, expect, it } from "vitest";
import { cardName, deal, isPairsGame, type PairsGame, pairsFound, SIZE_RULES, SIZES, turn, turnBack } from "./engine";

/** The two cards of each picture, by position. */
function partners(game: PairsGame): Map<string, number[]> {
  const where = new Map<string, number[]>();
  game.cards.forEach((card, index) => {
    where.set(card, [...(where.get(card) ?? []), index]);
  });
  return where;
}

describe("dealing", () => {
  for (const size of SIZES) {
    it(`deals ${size}: the right number of cards, every picture twice`, () => {
      const game = deal(99, size);
      expect(game.cards).toHaveLength(SIZE_RULES[size].pairs * 2);
      expect(SIZE_RULES[size].columns * SIZE_RULES[size].rows).toBe(game.cards.length);
      const where = partners(game);
      expect(where.size).toBe(SIZE_RULES[size].pairs);
      for (const spots of where.values()) expect(spots).toHaveLength(2);
      expect(game.matched.every((m) => !m)).toBe(true);
      expect(game.open).toEqual([]);
    });
  }

  it("deals the same cards for the same seed, and others for another", () => {
    expect(deal(7, "medium")).toEqual(deal(7, "medium"));
    expect(deal(7, "medium").cards).not.toEqual(deal(8, "medium").cards);
  });
});

describe("turning cards", () => {
  const game = deal(5, "small");
  const [a, b] = [...partners(game).values()][0]!;
  const other = game.cards.findIndex((card) => card !== game.cards[a!]);

  it("turns a first card face up, and names it", () => {
    const { game: next, turned } = turn(game, a!);
    expect(turned).toBe("first");
    expect(cardName(game, a!)).toBe(`Card ${a! + 1}, face down`);
    expect(cardName(next, a!)).toMatch(new RegExp(`^Card ${a! + 1}, (a|an|some|the) [a-z]+$`));
    expect(next.turns).toBe(0);
    // The same card again does nothing.
    expect(turn(next, a!).turned).toBe("none");
  });

  it("keeps a match face up, counted as a turn", () => {
    const { game: next, turned } = turn(turn(game, a!).game, b!);
    expect(turned).toBe("match");
    expect(next.matched[a!]).toBe(true);
    expect(next.matched[b!]).toBe(true);
    expect(next.open).toEqual([]);
    expect(next.turns).toBe(1);
    expect(pairsFound(next)).toBe(1);
    expect(cardName(next, b!)).toMatch(/, matched$/);
    expect(turn(next, a!).turned).toBe("none");
  });

  it("leaves a miss showing until it is turned back, or until the next card", () => {
    const missed = turn(turn(game, a!).game, other).game;
    expect(missed.open).toEqual([a, other]);
    expect(missed.turns).toBe(1);
    expect(turnBack(missed).open).toEqual([]);
    // A third card turns the miss back and starts the next turn at once.
    const third = game.cards.findIndex((_, index) => index !== a && index !== other);
    const next = turn(missed, third);
    expect(next.turned).toBe("first");
    expect(next.game.open).toEqual([third]);
    // Tapping one of the missed cards turns the pair back, and that card up again.
    expect(turn(missed, other).game.open).toEqual([other]);
  });

  it("finishes when every pair is found", () => {
    let state = game;
    for (const [x, y] of partners(game).values()) {
      state = turn(state, x!).game;
      state = turn(state, y!).game;
    }
    expect(state.finished).toBe(true);
    expect(state.turns).toBe(SIZE_RULES.small.pairs);
    expect(pairsFound(state)).toBe(6);
    expect(turn(state, 0).turned).toBe("none");
  });

  it("accepts its own saved game and refuses a damaged one", () => {
    const played = turn(turn(game, a!).game, b!).game;
    expect(isPairsGame(JSON.parse(JSON.stringify(played)))).toBe(true);
    expect(isPairsGame({ ...played, cards: [...played.cards.slice(1), "cat"] })).toBe(false);
    const half = [...played.matched];
    half[a!] = false;
    expect(isPairsGame({ ...played, matched: half })).toBe(false);
    expect(isPairsGame({ ...played, size: "huge" })).toBe(false);
    expect(isPairsGame({ ...played, finished: true })).toBe(false);
  });
});
