/** What is said after each move, in the polite live region: plain sentences a screen reader reads out. */
import { plural } from "@/lib/utils";
import { type Board, type Card, capitalise, cardName, type Place, SUIT_NAMES } from "./engine";

/** "the 7 of hearts", or "the 9 of spades and 2 cards on it" for a run. */
export function cardsWords(cards: readonly Card[]): string {
  const bottom = cards[0]!;
  return cards.length > 1 ? `the ${cardName(bottom)} and ${plural(cards.length - 1, "card")} on it` : `the ${cardName(bottom)}`;
}

/** Where cards were put, said by what they went on: "the 8 of clubs", "pile 3", "the foundation for clubs". */
export function placeWords(board: Board, to: Place): string {
  if (to.kind === "foundation") return `the foundation for ${SUIT_NAMES[to.suit]}`;
  if (to.kind === "pile") {
    const top = board.piles[to.index]?.up.at(-1);
    return top === undefined ? `pile ${to.index + 1}` : `the ${cardName(top)}`;
  }
  return to.kind;
}

/** "Moved the 7 of hearts to the 8 of clubs. Turned up the 5 of diamonds." Said of the board before the move. */
export function movedWords(before: Board, cards: readonly Card[], to: Place, turnedUp: Card | null): string {
  const verb = to.kind === "foundation" ? "Put" : "Moved";
  const sentence = `${verb} ${cardsWords(cards)} ${to.kind === "foundation" ? "on" : "to"} ${placeWords(before, to)}.`;
  return turnedUp === null ? sentence : `${sentence} Turned up the ${cardName(turnedUp)}.`;
}

export function cannotGoWords(cards: readonly Card[]): string {
  return `${capitalise(cardsWords(cards))} cannot go anywhere.`;
}

export function cannotGoOnWords(board: Board, cards: readonly Card[], to: Place): string {
  return `${capitalise(cardsWords(cards))} cannot go on ${placeWords(board, to)}.`;
}

export function pickedWords(cards: readonly Card[]): string {
  return `Picked up ${cardsWords(cards)}. Choose where it goes, or press it again to send it to the best place.`;
}

export function turnedWords(turned: readonly Card[], recycled: boolean, stockLeft: number): string {
  if (recycled) return `Turned the waste over: ${plural(stockLeft, "card")} in the stock.`;
  const top = turned.at(-1);
  if (top === undefined) return "";
  return turned.length === 1 ? `Turned the ${cardName(top)}.` : `Turned ${turned.length} cards; the ${cardName(top)} is on top.`;
}
