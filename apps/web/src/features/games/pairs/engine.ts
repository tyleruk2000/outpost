/**
 * Pairs: a memory game. The cards are dealt face down from a seed, every picture twice;
 * two are turned over at a time, a match stays face up, and a miss is turned back. Pure:
 * no React, no clock and no storage, so a deal can be tested and repeated. The pictures
 * are named here; how each is drawn is the screen's business (pictures.tsx).
 */
import { seededRng, shuffled } from "../kit/rng";

export const SIZES = ["small", "medium", "large"] as const;
export type Size = (typeof SIZES)[number];

export const SIZE_LABELS: Record<Size, string> = { small: "Small", medium: "Medium", large: "Large" };

/** How many pairs each size deals, and its columns and rows on a phone. */
export const SIZE_RULES: Record<Size, { pairs: number; columns: number; rows: number }> = {
  small: { pairs: 6, columns: 3, rows: 4 },
  medium: { pairs: 8, columns: 4, rows: 4 },
  large: { pairs: 12, columns: 4, rows: 6 },
};

/**
 * Things a small child can name, with the words for them in a sentence ("a cat",
 * "some grapes"). Each deal takes as many as it needs from these, chosen by the seed.
 */
export const PICTURES = {
  cat: "a cat",
  dog: "a dog",
  fish: "a fish",
  bird: "a bird",
  rabbit: "a rabbit",
  turtle: "a tortoise",
  snail: "a snail",
  squirrel: "a squirrel",
  apple: "an apple",
  banana: "a banana",
  cherries: "some cherries",
  grapes: "some grapes",
  carrot: "a carrot",
  sun: "the sun",
  moon: "the moon",
  cloud: "a cloud",
  snowflake: "a snowflake",
  umbrella: "an umbrella",
  car: "a car",
  bus: "a bus",
  bike: "a bike",
  train: "a train",
  boat: "a boat",
  plane: "an aeroplane",
  tractor: "a tractor",
} as const;
export type Picture = keyof typeof PICTURES;
export const PICTURE_IDS = Object.keys(PICTURES) as Picture[];

export interface PairsGame {
  version: 1;
  seed: number;
  size: Size;
  /** The picture on each card, in the order they are laid out. */
  cards: Picture[];
  matched: boolean[];
  /** The cards face up and not matched: none, one, or the two of a miss still showing. */
  open: number[];
  /** A turn is two cards turned over. */
  turns: number;
  /** Seconds spent while the game was on screen. */
  seconds: number;
  finished: boolean;
}

/** A deal: the size's number of pictures, chosen and laid out by the seed, each twice. */
export function deal(seed: number, size: Size): PairsGame {
  const rng = seededRng(seed);
  const { pairs } = SIZE_RULES[size];
  const chosen = shuffled(PICTURE_IDS, rng).slice(0, pairs);
  const cards = shuffled([...chosen, ...chosen], rng);
  return { version: 1, seed, size, cards, matched: cards.map(() => false), open: [], turns: 0, seconds: 0, finished: false };
}

/** Whether the two cards showing are a miss, waiting to be turned back. */
export const missShowing = (game: PairsGame) => game.open.length === 2;

/** Turns a miss back face down. */
export function turnBack(game: PairsGame): PairsGame {
  return missShowing(game) ? { ...game, open: [] } : game;
}

export type Turned = "first" | "match" | "miss" | "none";

/**
 * Turns a card over. With a miss still showing, it is turned back first (a tap does not
 * have to wait for it). The second card of a turn counts the turn and either matches,
 * leaving both face up for good, or misses, leaving both showing until `turnBack`.
 */
export function turn(game: PairsGame, card: number): { game: PairsGame; turned: Turned } {
  if (game.finished || card < 0 || card >= game.cards.length || game.matched[card]) return { game, turned: "none" };
  const state = turnBack(game);
  if (state.open.includes(card)) return { game, turned: "none" };
  if (state.open.length === 0) return { game: { ...state, open: [card] }, turned: "first" };
  const first = state.open[0]!;
  const turns = state.turns + 1;
  if (state.cards[first] === state.cards[card]) {
    const matched = [...state.matched];
    matched[first] = true;
    matched[card] = true;
    return { game: { ...state, matched, open: [], turns, finished: matched.every(Boolean) }, turned: "match" };
  }
  return { game: { ...state, open: [first, card], turns }, turned: "miss" };
}

export const isFaceUp = (game: PairsGame, card: number) => game.matched[card]! || game.open.includes(card);
export const pairsFound = (game: PairsGame) => game.matched.filter(Boolean).length / 2;

/** The card's spoken name: "Card 4, face down", "Card 4, a cat", "Card 4, a cat, matched". */
export function cardName(game: PairsGame, card: number): string {
  const label = `Card ${card + 1}`;
  if (game.matched[card]) return `${label}, ${PICTURES[game.cards[card]!]}, matched`;
  if (game.open.includes(card)) return `${label}, ${PICTURES[game.cards[card]!]}`;
  return `${label}, face down`;
}

/** A game read back from the device, accepted only if it is whole and every picture is there twice. */
export function isPairsGame(value: unknown): value is PairsGame {
  if (!value || typeof value !== "object") return false;
  const game = value as Partial<PairsGame>;
  if (game.version !== 1 || !Number.isInteger(game.seed) || !SIZES.includes(game.size as Size)) return false;
  const count = SIZE_RULES[game.size as Size].pairs * 2;
  if (!Array.isArray(game.cards) || game.cards.length !== count || !game.cards.every((card) => PICTURE_IDS.includes(card))) return false;
  const tally = new Map<string, number>();
  for (const card of game.cards) tally.set(card, (tally.get(card) ?? 0) + 1);
  if ([...tally.values()].some((n) => n !== 2)) return false;
  if (!Array.isArray(game.matched) || game.matched.length !== count || !game.matched.every((m) => typeof m === "boolean")) return false;
  // A picture is matched on both its cards or on neither.
  const twins = new Map<string, boolean[]>();
  game.cards.forEach((card, index) => {
    twins.set(card, [...(twins.get(card) ?? []), game.matched![index]!]);
  });
  if ([...twins.values()].some(([a, b]) => a !== b)) return false;
  if (
    !Array.isArray(game.open) ||
    game.open.length > 2 ||
    !game.open.every((i) => Number.isInteger(i) && i >= 0 && i < count && !game.matched![i])
  )
    return false;
  if (!Number.isInteger(game.turns) || game.turns! < 0 || typeof game.seconds !== "number" || !(game.seconds >= 0)) return false;
  return typeof game.finished === "boolean" && game.finished === game.matched.every(Boolean);
}
