/**
 * The rules of Solitaire: the deal, every move that is allowed and every one that is not,
 * the stock in draw one and draw three, turning the waste over, putting away, finishing,
 * winning, undo restoring a game exactly, and the best place for a tapped card.
 */
import { describe, expect, it } from "vitest";
import {
  type Board,
  bestPlace,
  type Card,
  canPut,
  cardName,
  cardOf,
  cardsAt,
  deal,
  finish,
  isBoard,
  isWon,
  legalPlaces,
  move,
  type Pile,
  putAwayAll,
  rankOf,
  type Suit,
  suitOf,
  turnStock,
} from "./engine";
import { advance, isGame, newGame, undo } from "./game";

const S: Suit = 0;
const H: Suit = 1;
const D: Suit = 2;
const C: Suit = 3;
const c = cardOf;

/** A board from its parts; the piles not given are empty. */
function board({
  stock = [],
  waste = [],
  foundations = [0, 0, 0, 0],
  piles = [],
}: {
  stock?: Card[];
  waste?: Card[];
  foundations?: [number, number, number, number];
  piles?: Array<Partial<Pile>>;
}): Board {
  const seven = Array.from({ length: 7 }, (_, index) => ({ down: piles[index]?.down ?? [], up: piles[index]?.up ?? [] }));
  return { stock, waste, foundations, piles: seven };
}

describe("the deal", () => {
  it("deals 52 distinct cards: 1 to 7 in the piles with the top one face up, 24 in the stock", () => {
    const dealt = deal(12345);
    const all = [...dealt.stock, ...dealt.waste, ...dealt.piles.flatMap((pile) => [...pile.down, ...pile.up])];
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    expect(dealt.piles.map((pile) => [pile.down.length, pile.up.length])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
    ]);
    expect(dealt.stock).toHaveLength(24);
    expect(dealt.waste).toEqual([]);
    expect(dealt.foundations).toEqual([0, 0, 0, 0]);
    expect(isBoard(dealt)).toBe(true);
  });

  it("deals the same cards from the same seed, and others from another", () => {
    expect(deal(7)).toEqual(deal(7));
    expect(deal(7)).not.toEqual(deal(8));
  });

  it("names cards as people say them", () => {
    expect(cardName(c(H, 7))).toBe("7 of hearts");
    expect(cardName(c(S, 1))).toBe("ace of spades");
    expect(cardName(c(C, 12))).toBe("queen of clubs");
    expect(suitOf(c(D, 13))).toBe(D);
    expect(rankOf(c(D, 13))).toBe(13);
  });
});

describe("moves on the tableau", () => {
  it("puts a card on one a rank higher of the other colour, and no other", () => {
    const b = board({ piles: [{ up: [c(C, 8)] }] });
    expect(canPut(b, [c(H, 7)], { kind: "pile", index: 0 })).toBe(true);
    expect(canPut(b, [c(D, 7)], { kind: "pile", index: 0 })).toBe(true);
    expect(canPut(b, [c(S, 7)], { kind: "pile", index: 0 })).toBe(false); // same colour
    expect(canPut(b, [c(H, 6)], { kind: "pile", index: 0 })).toBe(false); // two lower
    expect(canPut(b, [c(H, 9)], { kind: "pile", index: 0 })).toBe(false); // higher
  });

  it("puts only a king, or a run headed by one, on an empty pile", () => {
    const b = board({});
    expect(canPut(b, [c(S, 13)], { kind: "pile", index: 3 })).toBe(true);
    expect(canPut(b, [c(S, 13), c(H, 12)], { kind: "pile", index: 3 })).toBe(true);
    expect(canPut(b, [c(S, 12)], { kind: "pile", index: 3 })).toBe(false);
  });

  it("moves a run of face-up cards together, and turns up the card it uncovers", () => {
    const b = board({ piles: [{ down: [c(D, 2)], up: [c(S, 9), c(H, 8), c(C, 7)] }, { up: [c(D, 10)] }] });
    const moved = move(b, { kind: "pile", index: 0, at: 0 }, { kind: "pile", index: 1 })!;
    expect(moved.cards).toEqual([c(S, 9), c(H, 8), c(C, 7)]);
    expect(moved.board.piles[1]!.up).toEqual([c(D, 10), c(S, 9), c(H, 8), c(C, 7)]);
    expect(moved.board.piles[0]).toEqual({ down: [], up: [c(D, 2)] });
    expect(moved.turnedUp).toBe(c(D, 2));
    // The board it was given is as it was.
    expect(b.piles[0]!.up).toHaveLength(3);
  });

  it("moves part of a run from the middle", () => {
    const b = board({ piles: [{ up: [c(S, 9), c(H, 8), c(C, 7)] }, { up: [c(C, 9)] }] });
    const moved = move(b, { kind: "pile", index: 0, at: 1 }, { kind: "pile", index: 1 })!;
    expect(moved.board.piles[0]!.up).toEqual([c(S, 9)]);
    expect(moved.board.piles[1]!.up).toEqual([c(C, 9), c(H, 8), c(C, 7)]);
    expect(moved.turnedUp).toBeNull();
  });

  it("refuses a run whose bottom card does not fit, a card that is not there, and a move to its own pile", () => {
    const b = board({ piles: [{ up: [c(S, 9), c(H, 8)] }, { up: [c(C, 10)] }] });
    expect(move(b, { kind: "pile", index: 0, at: 0 }, { kind: "pile", index: 1 })).toBeNull();
    expect(move(b, { kind: "pile", index: 0, at: 5 }, { kind: "pile", index: 1 })).toBeNull();
    expect(move(b, { kind: "pile", index: 0, at: 1 }, { kind: "pile", index: 0 })).toBeNull();
    expect(move(b, { kind: "pile", index: 4, at: 0 }, { kind: "pile", index: 1 })).toBeNull();
  });

  it("moves the top of the waste to a pile", () => {
    const b = board({ waste: [c(S, 2), c(H, 12)], piles: [{ up: [c(S, 13)] }] });
    const moved = move(b, { kind: "waste" }, { kind: "pile", index: 0 })!;
    expect(moved.board.waste).toEqual([c(S, 2)]);
    expect(moved.board.piles[0]!.up).toEqual([c(S, 13), c(H, 12)]);
    expect(move(board({}), { kind: "waste" }, { kind: "pile", index: 0 })).toBeNull();
  });

  it("takes a card back down from a foundation onto a pile, but not to another foundation", () => {
    const b = board({ foundations: [4, 0, 0, 0], piles: [{ up: [c(H, 5)] }] });
    const moved = move(b, { kind: "foundation", suit: S }, { kind: "pile", index: 0 })!;
    expect(moved.board.foundations).toEqual([3, 0, 0, 0]);
    expect(moved.board.piles[0]!.up).toEqual([c(H, 5), c(S, 4)]);
    expect(move(b, { kind: "foundation", suit: S }, { kind: "foundation", suit: H })).toBeNull();
    expect(move(b, { kind: "foundation", suit: H }, { kind: "pile", index: 0 })).toBeNull();
  });

  it("puts nothing on the stock or the waste", () => {
    const b = board({ piles: [{ up: [c(S, 1)] }] });
    expect(move(b, { kind: "pile", index: 0, at: 0 }, { kind: "stock" })).toBeNull();
    expect(move(b, { kind: "pile", index: 0, at: 0 }, { kind: "waste" })).toBeNull();
  });
});

describe("the foundations", () => {
  it("are built up by suit from the ace, one card at a time", () => {
    const b = board({ foundations: [1, 0, 0, 0], waste: [c(S, 2)], piles: [{ up: [c(H, 1)] }, { up: [c(S, 3)] }] });
    expect(canPut(b, [c(S, 2)], { kind: "foundation", suit: S })).toBe(true);
    expect(canPut(b, [c(S, 3)], { kind: "foundation", suit: S })).toBe(false);
    expect(canPut(b, [c(S, 2)], { kind: "foundation", suit: H })).toBe(false);
    expect(canPut(b, [c(H, 1)], { kind: "foundation", suit: H })).toBe(true);
    expect(canPut(b, [c(H, 2)], { kind: "foundation", suit: H })).toBe(false);
    const moved = move(b, { kind: "waste" }, { kind: "foundation", suit: S })!;
    expect(moved.board.foundations).toEqual([2, 0, 0, 0]);
  });

  it("take only the top card of a pile, never a run", () => {
    const b = board({ foundations: [0, 0, 0, 1], piles: [{ up: [c(S, 3), c(H, 2)] }, { up: [c(C, 2)] }] });
    expect(move(b, { kind: "pile", index: 0, at: 0 }, { kind: "foundation", suit: S })).toBeNull();
    expect(move(b, { kind: "pile", index: 1, at: 0 }, { kind: "foundation", suit: C })).not.toBeNull();
  });

  it("lists every legal place for a card", () => {
    const b = board({ piles: [{ up: [c(D, 1)] }, { up: [c(C, 3)] }, { up: [c(S, 3)] }, {}] });
    const two = board({ waste: [c(H, 2)], piles: [{ up: [c(C, 3)] }, { up: [c(S, 3)] }, { up: [c(D, 3)] }] });
    expect(legalPlaces(b, { kind: "pile", index: 0, at: 0 })).toEqual([{ kind: "foundation", suit: D }]);
    expect(legalPlaces(two, { kind: "waste" })).toEqual([
      { kind: "pile", index: 0 },
      { kind: "pile", index: 1 },
    ]);
  });
});

describe("the stock", () => {
  it("turns one card at a time in draw one", () => {
    const b = board({ stock: [c(S, 5), c(H, 6), c(D, 7)] });
    const turned = turnStock(b, 1)!;
    expect(turned.turned).toEqual([c(D, 7)]);
    expect(turned.board.stock).toEqual([c(S, 5), c(H, 6)]);
    expect(turned.board.waste).toEqual([c(D, 7)]);
    expect(turned.recycled).toBe(false);
  });

  it("turns three at a time in draw three, the third on top, and what is left at the end", () => {
    const b = board({ stock: [c(S, 1), c(S, 2), c(S, 3), c(S, 4), c(S, 5)] });
    const first = turnStock(b, 3)!;
    expect(first.turned).toEqual([c(S, 5), c(S, 4), c(S, 3)]);
    expect(first.board.waste.at(-1)).toBe(c(S, 3));
    expect(first.board.stock).toEqual([c(S, 1), c(S, 2)]);
    const second = turnStock(first.board, 3)!;
    expect(second.turned).toEqual([c(S, 2), c(S, 1)]);
    expect(second.board.stock).toEqual([]);
    expect(cardsAt(second.board, { kind: "waste" })).toEqual([c(S, 1)]);
  });

  it("turns the waste over into the stock when the stock is empty, as often as wanted, in the same order", () => {
    const start = board({ stock: [c(S, 1), c(H, 2), c(D, 3)] });
    let current = start;
    for (let pass = 0; pass < 3; pass += 1) {
      for (let count = 0; count < 3; count += 1) current = turnStock(current, 1)!.board;
      expect(current.stock).toEqual([]);
      const over = turnStock(current, 1)!;
      expect(over.recycled).toBe(true);
      expect(over.turned).toEqual([]);
      current = over.board;
      expect(current).toEqual(start);
    }
  });

  it("does nothing when the stock and the waste are both empty", () => {
    expect(turnStock(board({}), 1)).toBeNull();
  });
});

describe("putting away", () => {
  it("puts away every card that can go, again and again, from the waste and the piles", () => {
    const b = board({
      waste: [c(H, 1)],
      piles: [{ down: [c(D, 9)], up: [c(S, 2)] }, { up: [c(S, 1)] }, { up: [c(H, 3), c(C, 2)] }, { up: [c(H, 2)] }],
    });
    const away = putAwayAll(b);
    expect(away.cards).toEqual([c(H, 1), c(S, 1), c(S, 2), c(H, 2)]);
    expect(away.board.foundations).toEqual([2, 2, 0, 0]);
    // The 9 of diamonds was turned up and stays; the 2 of clubs has no ace to go on.
    expect(away.board.piles[0]).toEqual({ down: [], up: [c(D, 9)] });
    expect(away.board.piles[2]!.up).toEqual([c(H, 3), c(C, 2)]);
  });

  it("finishes a game with every card in view, turning the waste through as needed", () => {
    // Everything home but the kings and queens of two suits: two in the waste, two on a pile.
    const b = board({
      foundations: [11, 11, 13, 13],
      waste: [c(H, 13), c(S, 12)],
      piles: [{ up: [c(S, 13), c(H, 12)] }],
    });
    const done = finish(b, 1)!;
    expect(isWon(done.board)).toBe(true);
    expect(done.moves).toBeGreaterThanOrEqual(4);
    expect(finish(board({ stock: [c(S, 1)] }), 1)).toBeNull();
  });

  it("knows when a draw-three waste can never bring the wanted card up", () => {
    // Waste of three, wanted card at the bottom: draw three always turns the same top card.
    const b = board({ foundations: [12, 12, 13, 12], waste: [c(C, 13), c(S, 13), c(H, 13)] });
    expect(finish(b, 1)).not.toBeNull();
    const stuck = board({ foundations: [12, 11, 13, 12], waste: [c(H, 12), c(S, 13), c(H, 13), c(C, 13)] });
    expect(finish(stuck, 3)).toBeNull();
  });
});

describe("winning", () => {
  it("is every foundation up to the king", () => {
    expect(isWon(board({ foundations: [13, 13, 13, 13] }))).toBe(true);
    expect(isWon(board({ foundations: [13, 13, 13, 12], piles: [{ up: [c(C, 13)] }] }))).toBe(false);
  });

  it("is reached by the last move, and the game says so", () => {
    let game = newGame(1, 1);
    game = { ...game, now: { board: board({ foundations: [13, 13, 13, 12], piles: [{ up: [c(C, 13)] }] }), moves: 90 } };
    const last = move(game.now.board, { kind: "pile", index: 0, at: 0 }, { kind: "foundation", suit: C })!;
    game = advance(game, last.board);
    expect(game.won).toBe(true);
    expect(game.now.moves).toBe(91);
  });
});

describe("the best place for a tapped card", () => {
  it("is its foundation first", () => {
    const b = board({ piles: [{ up: [c(D, 1)] }, {}] });
    expect(bestPlace(b, { kind: "pile", index: 0, at: 0 })).toEqual({ kind: "foundation", suit: D });
  });

  it("is otherwise the first pile it fits, counting rightwards from its own and round again", () => {
    const b = board({
      piles: [{ up: [c(S, 8)] }, { up: [c(C, 8)] }, { up: [c(H, 7)] }, {}, { up: [c(S, 2)] }, { up: [c(C, 8)] }, {}],
    });
    expect(bestPlace(b, { kind: "pile", index: 2, at: 0 })).toEqual({ kind: "pile", index: 5 });
    const wrap = board({ piles: [{ up: [c(S, 8)] }, { up: [c(C, 8)] }, {}, {}, {}, {}, { up: [c(H, 7)] }] });
    expect(bestPlace(wrap, { kind: "pile", index: 6, at: 0 })).toEqual({ kind: "pile", index: 0 });
  });

  it("starts from the first pile for the waste and a foundation", () => {
    const b = board({ waste: [c(H, 7)], foundations: [6, 0, 0, 0], piles: [{}, { up: [c(C, 8)] }, { up: [c(S, 8)] }, { up: [c(H, 7)] }] });
    expect(bestPlace(b, { kind: "waste" })).toEqual({ kind: "pile", index: 1 });
    expect(bestPlace(b, { kind: "foundation", suit: S })).toEqual({ kind: "pile", index: 3 });
  });

  it("puts a king on the leftmost empty pile, after any card it fits, and not from one empty space to another", () => {
    const b = board({ waste: [c(S, 13)], piles: [{ up: [c(H, 5)] }, {}, { down: [c(D, 3)], up: [c(H, 13)] }, {}, { up: [c(C, 13)] }] });
    expect(bestPlace(b, { kind: "waste" })).toEqual({ kind: "pile", index: 1 });
    expect(bestPlace(b, { kind: "pile", index: 2, at: 0 })).toEqual({ kind: "pile", index: 1 });
    expect(bestPlace(b, { kind: "pile", index: 4, at: 0 })).toBeNull();
  });

  it("is nowhere for a card that fits nowhere", () => {
    const b = board({ piles: [{ up: [c(C, 4)] }, { up: [c(S, 9)] }] });
    expect(bestPlace(b, { kind: "pile", index: 0, at: 0 })).toBeNull();
    expect(bestPlace(board({}), { kind: "waste" })).toBeNull();
  });
});

describe("undo", () => {
  it("restores the game exactly, move by move: the stock, the waste, the foundations and which cards are face up", () => {
    let game = newGame(4242, 3);
    const states: string[] = [JSON.stringify(game.now)];
    // Play a while: turn the stock and make every move the best-place rule finds.
    for (let step = 0; step < 60; step += 1) {
      const b = game.now.board;
      let next: Board | null = null;
      const sources = [{ kind: "waste" } as const, ...b.piles.map((_pile, index) => ({ kind: "pile", index, at: 0 }) as const)];
      for (const source of sources) {
        const to = bestPlace(b, source);
        if (to && (source.kind !== "pile" || b.piles[source.index]!.down.length > 0 || to.kind === "foundation")) {
          next = move(b, source, to)!.board;
          break;
        }
      }
      next ??= turnStock(b, 3)?.board ?? null;
      if (!next) break;
      game = advance(game, next);
      states.push(JSON.stringify(game.now));
    }
    expect(game.history.length).toBeGreaterThan(20);
    expect(game.history.some((snapshot) => snapshot.board.stock.length === 0)).toBe(true);
    while (game.history.length > 0) {
      states.pop();
      game = undo(game);
      expect(JSON.stringify(game.now)).toBe(states.at(-1));
    }
    expect(game.now).toEqual(newGame(4242, 3).now);
    expect(game.played).toBe(true);
  });

  it("turns a card face down again when the move that turned it up is undone", () => {
    let game = newGame(1, 1);
    game = { ...game, now: { board: board({ piles: [{ down: [c(D, 2)], up: [c(S, 9)] }, { up: [c(H, 10)] }] }), moves: 0 } };
    game = advance(game, move(game.now.board, { kind: "pile", index: 0, at: 0 }, { kind: "pile", index: 1 })!.board);
    expect(game.now.board.piles[0]).toEqual({ down: [], up: [c(D, 2)] });
    game = undo(game);
    expect(game.now.board.piles[0]).toEqual({ down: [c(D, 2)], up: [c(S, 9)] });
    expect(game.now.moves).toBe(0);
  });

  it("does nothing with nothing to undo", () => {
    const game = newGame(9, 1);
    expect(undo(game)).toBe(game);
  });
});

describe("a kept game", () => {
  it("is accepted as it was written, and refused when anything in it is wrong", () => {
    const game = advance(newGame(5, 1), turnStock(deal(5), 1)!.board);
    expect(isGame(JSON.parse(JSON.stringify(game)))).toBe(true);
    expect(isGame({ ...game, draw: 2 })).toBe(false);
    expect(isGame({ ...game, seconds: -1 })).toBe(false);
    const doubled = JSON.parse(JSON.stringify(game));
    doubled.now.board.stock[0] = doubled.now.board.stock[1];
    expect(isGame(doubled)).toBe(false);
    const badRun = JSON.parse(JSON.stringify(game));
    badRun.now.board.piles[0].up.push(badRun.now.board.stock.pop());
    expect(isGame(badRun)).toBe(false);
    expect(isGame(null)).toBe(false);
    expect(isGame("game")).toBe(false);
  });
});
