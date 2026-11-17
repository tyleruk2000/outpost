/**
 * Solitaire (Klondike), as plain data and pure functions: the deal, every move, the stock,
 * putting cards away and the best place for a tapped card. Nothing here knows about
 * React, so all of it is tested on its own (engine.test.ts). Every function returns a
 * new board and never changes the one it was given: undo keeps the boards it was handed,
 * and they must stay exactly as they were.
 */
import { seededRng, shuffled } from "../kit/rng";

/** Spades, hearts, diamonds, clubs. A card is a number from 0 to 51: suit × 13 + rank − 1. */
export type Suit = 0 | 1 | 2 | 3;
export type Card = number;
export const SUITS: readonly Suit[] = [0, 1, 2, 3];
export const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"] as const;

export interface Pile {
  /** Face down, the bottom first. */
  down: Card[];
  /** Face up, the bottom first: always a run down in alternating colours. */
  up: Card[];
}

export interface Board {
  /** Face down; the last is the top, the next to be turned. */
  stock: Card[];
  /** Face up; the last is the top, the one that can be played. */
  waste: Card[];
  /** For each suit (by `Suit`), how many cards are on its foundation: 0 to 13. */
  foundations: [number, number, number, number];
  /** The seven piles of the tableau, left to right. */
  piles: Pile[];
}

/** Cards turned from the stock at a time. */
export type Draw = 1 | 3;

/** A place cards can be put. */
export type Place = { kind: "stock" } | { kind: "waste" } | { kind: "foundation"; suit: Suit } | { kind: "pile"; index: number };

/** Where cards are picked up from: the top of the waste or of a foundation, or a face-up card of a pile and every card on it. */
export type Source = { kind: "waste" } | { kind: "foundation"; suit: Suit } | { kind: "pile"; index: number; at: number };

export const suitOf = (card: Card): Suit => Math.floor(card / 13) as Suit;
export const rankOf = (card: Card): number => (card % 13) + 1;
export const isRed = (suit: Suit): boolean => suit === 1 || suit === 2;
export const cardOf = (suit: Suit, rank: number): Card => suit * 13 + rank - 1;

const RANK_NAMES = ["", "ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"];
export const RANK_LETTERS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function rankName(rank: number): string {
  return RANK_NAMES[rank] ?? "";
}

/** "7 of hearts", "ace of spades": in the middle of a sentence. */
export function cardName(card: Card): string {
  return `${rankName(rankOf(card))} of ${SUIT_NAMES[suitOf(card)]}`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The deal of a seed: shuffled, then dealt row by row across the seven piles, the last card of each face up. */
export function deal(seed: number): Board {
  const deck = shuffled(
    Array.from({ length: 52 }, (_, card) => card),
    seededRng(seed),
  );
  const piles: Pile[] = Array.from({ length: 7 }, () => ({ down: [], up: [] }));
  let next = 0;
  for (let row = 0; row < 7; row += 1) {
    for (let index = row; index < 7; index += 1) {
      const card = deck[next++]!;
      const pile = piles[index]!;
      if (row === index) pile.up.push(card);
      else pile.down.push(card);
    }
  }
  return { stock: deck.slice(next), waste: [], foundations: [0, 0, 0, 0], piles };
}

function copy(board: Board): Board {
  return {
    stock: [...board.stock],
    waste: [...board.waste],
    foundations: [...board.foundations],
    piles: board.piles.map((pile) => ({ down: [...pile.down], up: [...pile.up] })),
  };
}

/** The cards a source would pick up, the bottom first, or null when there is nothing to pick up there. */
export function cardsAt(board: Board, source: Source): Card[] | null {
  if (source.kind === "waste") {
    const top = board.waste.at(-1);
    return top === undefined ? null : [top];
  }
  if (source.kind === "foundation") {
    const count = board.foundations[source.suit];
    return count > 0 ? [cardOf(source.suit, count)] : null;
  }
  const pile = board.piles[source.index];
  if (!pile || source.at < 0 || source.at >= pile.up.length) return null;
  return pile.up.slice(source.at);
}

/** Whether these cards (the bottom first) may be put on a place. The stock and the waste take nothing. */
export function canPut(board: Board, cards: readonly Card[], to: Place): boolean {
  const bottom = cards[0];
  if (bottom === undefined) return false;
  if (to.kind === "foundation") {
    return cards.length === 1 && suitOf(bottom) === to.suit && rankOf(bottom) === board.foundations[to.suit] + 1;
  }
  if (to.kind !== "pile") return false;
  const pile = board.piles[to.index];
  if (!pile) return false;
  const top = pile.up.at(-1);
  // A face-down card is turned up as soon as it is uncovered, so a pile with nothing face up is empty.
  if (top === undefined) return pile.down.length === 0 && rankOf(bottom) === 13;
  return isRed(suitOf(top)) !== isRed(suitOf(bottom)) && rankOf(top) === rankOf(bottom) + 1;
}

const samePlace = (source: Source, to: Place): boolean =>
  (source.kind === "waste" && to.kind === "waste") ||
  (source.kind === "foundation" && to.kind === "foundation" && source.suit === to.suit) ||
  (source.kind === "pile" && to.kind === "pile" && source.index === to.index);

export interface Moved {
  board: Board;
  cards: Card[];
  /** The face-down card turned up because the move uncovered it. */
  turnedUp: Card | null;
}

/** Moves the cards at a source to a place, or null when that is not allowed. */
export function move(board: Board, source: Source, to: Place): Moved | null {
  const cards = cardsAt(board, source);
  if (!cards || samePlace(source, to)) return null;
  if (source.kind === "foundation" && to.kind === "foundation") return null;
  if (!canPut(board, cards, to)) return null;
  const next = copy(board);
  let turnedUp: Card | null = null;
  if (source.kind === "waste") next.waste.pop();
  else if (source.kind === "foundation") next.foundations[source.suit] -= 1;
  else {
    const pile = next.piles[source.index]!;
    pile.up.splice(source.at);
    if (pile.up.length === 0 && pile.down.length > 0) {
      turnedUp = pile.down.pop()!;
      pile.up.push(turnedUp);
    }
  }
  if (to.kind === "foundation") next.foundations[to.suit] += 1;
  else if (to.kind === "pile") next.piles[to.index]!.up.push(...cards);
  return { board: next, cards, turnedUp };
}

export interface Turned {
  board: Board;
  /** The cards turned onto the waste, in the order they were turned (the last is now the top). */
  turned: Card[];
  /** True when the stock was empty and the waste was turned over to make it again. */
  recycled: boolean;
}

/**
 * Turns one card or three from the stock onto the waste; with the stock empty, turns the
 * waste over to be the stock again, as often as wanted. Null when both are empty.
 */
export function turnStock(board: Board, draw: Draw): Turned | null {
  if (board.stock.length === 0) {
    if (board.waste.length === 0) return null;
    const next = copy(board);
    // Turned over as a packet: the first card turned is the top of the stock again.
    next.stock = [...board.waste].reverse();
    next.waste = [];
    return { board: next, turned: [], recycled: true };
  }
  const next = copy(board);
  const turned: Card[] = [];
  for (let count = 0; count < draw && next.stock.length > 0; count += 1) {
    const card = next.stock.pop()!;
    next.waste.push(card);
    turned.push(card);
  }
  return { board: next, turned, recycled: false };
}

export function isWon(board: Board): boolean {
  return board.foundations.every((count) => count === 13);
}

/** Every place these cards could legally go, foundations first, then the piles left to right. */
export function legalPlaces(board: Board, source: Source): Place[] {
  const cards = cardsAt(board, source);
  if (!cards) return [];
  const places: Place[] = [];
  for (const suit of SUITS) places.push({ kind: "foundation", suit });
  for (let index = 0; index < board.piles.length; index += 1) places.push({ kind: "pile", index });
  return places.filter((to) => move(board, source, to) !== null);
}

/**
 * The best place for a tapped card, by this rule:
 * 1. its foundation, when it is a single card that can go there;
 * 2. otherwise the first pile where it goes onto a card, counting rightwards from its own
 *    pile and round again (from pile 1 for the waste or a foundation);
 * 3. otherwise the leftmost empty pile (only a king, or a run headed by one, goes there),
 *    unless the king already heads its pile with nothing under it, when moving it would
 *    change nothing.
 * Null when it cannot go anywhere.
 */
export function bestPlace(board: Board, source: Source): Place | null {
  const cards = cardsAt(board, source);
  if (!cards) return null;
  if (source.kind !== "foundation") {
    const foundation: Place = { kind: "foundation", suit: suitOf(cards[0]!) };
    if (move(board, source, foundation)) return foundation;
  }
  const count = board.piles.length;
  const start = source.kind === "pile" ? source.index + 1 : 0;
  let empty: { kind: "pile"; index: number } | null = null;
  for (let step = 0; step < count; step += 1) {
    const index = (start + step) % count;
    const to = { kind: "pile", index } as const;
    if (!move(board, source, to)) continue;
    if (board.piles[index]!.up.length > 0) return to;
    if (empty === null || index < empty.index) empty = to;
  }
  if (empty && source.kind === "pile") {
    const own = board.piles[source.index]!;
    if (own.down.length === 0 && source.at === 0) return null;
  }
  return empty;
}

export interface PutAway {
  board: Board;
  /** The cards put on the foundations, in order. */
  cards: Card[];
}

/** Puts on the foundations every card that can go, from the waste and the piles, again and again until none can. */
export function putAwayAll(board: Board): PutAway {
  let current = board;
  const cards: Card[] = [];
  for (;;) {
    let moved: Moved | null = null;
    const sources: Source[] = [{ kind: "waste" }];
    current.piles.forEach((pile, index) => {
      if (pile.up.length > 0) sources.push({ kind: "pile", index, at: pile.up.length - 1 });
    });
    for (const source of sources) {
      const top = cardsAt(current, source);
      if (!top) continue;
      moved = move(current, source, { kind: "foundation", suit: suitOf(top[0]!) });
      if (moved) break;
    }
    if (!moved) return { board: current, cards };
    current = moved.board;
    cards.push(...moved.cards);
  }
}

/** Whether every card is face up and the stock is empty: from here the game can be finished by putting away. */
export function allInView(board: Board): boolean {
  return board.stock.length === 0 && board.piles.every((pile) => pile.down.length === 0);
}

export interface Finished {
  board: Board;
  /** Cards put away and turns of the stock taken, each a move. */
  moves: number;
}

/**
 * Finishes a game with every card in view: puts away all that can go, turning the waste
 * over and through again when nothing can, until every card is home. Null when it cannot
 * be finished that way (with draw three, a waste can come round in an order that never
 * lets the card wanted reach the top); the offer to finish is then not made.
 */
export function finish(board: Board, draw: Draw): Finished | null {
  if (!allInView(board)) return null;
  let current = board;
  let moves = 0;
  let idle = 0;
  // Each pass through the waste either puts something away or, twice running with nothing put away, never will.
  while (!isWon(current)) {
    const away = putAwayAll(current);
    if (away.cards.length > 0) {
      current = away.board;
      moves += away.cards.length;
      idle = 0;
      continue;
    }
    const turned = turnStock(current, draw);
    if (!turned) return null;
    current = turned.board;
    moves += 1;
    if (turned.recycled) {
      idle += 1;
      if (idle > 2) return null;
    }
  }
  return { board: current, moves };
}

/** Whether this is a board of the game: 52 distinct cards, in the right places, shaped as dealt and played. */
export function isBoard(value: unknown): value is Board {
  if (!value || typeof value !== "object") return false;
  const board = value as Record<string, unknown>;
  const isCards = (list: unknown): list is Card[] =>
    Array.isArray(list) && list.every((card) => Number.isInteger(card) && card >= 0 && card < 52);
  if (!isCards(board.stock) || !isCards(board.waste)) return false;
  const foundations = board.foundations;
  if (!Array.isArray(foundations) || foundations.length !== 4) return false;
  if (!foundations.every((count) => Number.isInteger(count) && count >= 0 && count <= 13)) return false;
  const piles = board.piles;
  if (!Array.isArray(piles) || piles.length !== 7) return false;
  const seen = new Set<Card>([...board.stock, ...board.waste]);
  let total = board.stock.length + board.waste.length;
  foundations.forEach((count: number, suit) => {
    for (let rank = 1; rank <= count; rank += 1) seen.add(cardOf(suit as Suit, rank));
    total += count;
  });
  for (const pile of piles) {
    if (!pile || typeof pile !== "object") return false;
    const { down, up } = pile as Record<string, unknown>;
    if (!isCards(down) || !isCards(up)) return false;
    if (up.length === 0 && down.length > 0) return false;
    for (let index = 1; index < up.length; index += 1) {
      const lower = up[index - 1]!;
      const upper = up[index]!;
      if (rankOf(lower) !== rankOf(upper) + 1 || isRed(suitOf(lower)) === isRed(suitOf(upper))) return false;
    }
    for (const card of [...down, ...up]) seen.add(card);
    total += down.length + up.length;
  }
  return total === 52 && seen.size === 52;
}
