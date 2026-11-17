/**
 * The computer's play: a small minimax search (negamax with alpha-beta pruning) to a fixed
 * depth, with a plain evaluation. It is meant to be a fair, steady opponent on a phone or
 * a Raspberry Pi, not a strong one.
 *
 * The search is split into steps, one move at the top of the tree per step, so that where
 * there is no Web Worker the page can run one step at a time between frames and never
 * freeze. In the worker every step runs at once.
 */
import { type Rng, seededRng, shuffled } from "../kit/rng";
import { applyMove, type Cell, isKing, legalMoves, type Move, type Position, QUIET_LIMIT, rankOf } from "./engine";

/** Six plies: three moves by each side. */
export const SEARCH_DEPTH = 6;

const MAN = 100;
const KING = 160;
const WIN = 100_000;

/** A little for the centre: the squares of files c to f on ranks 3 to 6. */
function centre(square: number): boolean {
  const file = square % 8;
  const rank = rankOf(square);
  return file >= 2 && file <= 5 && rank >= 2 && rank <= 5;
}

/** The position's worth to the side to move: material (kings worth more), and a little for advancing men and holding the centre. */
export function evaluate(position: Position): number {
  let score = 0;
  const board = position.board;
  for (let square = 0; square < 64; square += 1) {
    const cell: Cell = board[square]!;
    if (cell === 0) continue;
    let worth: number;
    if (isKing(cell)) worth = KING;
    else {
      const advanced = cell > 0 ? rankOf(square) : 7 - rankOf(square);
      worth = MAN + advanced * 3;
      // Men on their own back rank keep the other side from crowning.
      if (advanced === 0) worth += 4;
    }
    if (centre(square)) worth += 4;
    score += cell > 0 ? worth : -worth;
  }
  return position.turn === "dark" ? score : -score;
}

function negamax(position: Position, depth: number, alpha: number, beta: number, ply: number): number {
  if (position.quiet >= QUIET_LIMIT) return 0;
  const moves = legalMoves(position);
  // No move: the side to move has lost. Sooner is worse, so a win is taken quickly and a loss put off.
  if (moves.length === 0) return -WIN + ply;
  if (depth <= 0) return evaluate(position);
  let best = -Infinity;
  for (const move of moves) {
    const score = -negamax(applyMove(position, move), depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export interface Search {
  /** Searches one more move at the top of the tree; true when the search is done. */
  step(): boolean;
  /** The move chosen so far (the best of those searched). */
  best(): Move;
}

/**
 * A search of `position` to `depth` plies. The moves at the top are tried in an order
 * shuffled from the seed, and a later move replaces the best only if it is strictly
 * better, so that among moves of equal worth the seed decides and games differ.
 */
export function createSearch(position: Position, { depth = SEARCH_DEPTH, rng }: { depth?: number; rng: Rng }): Search {
  const moves = shuffled(legalMoves(position), rng);
  if (moves.length === 0) throw new Error("There is no move to search: the game is over.");
  let index = 0;
  let bestMove = moves[0]!;
  let bestScore = -Infinity;
  return {
    step() {
      // A single legal move (often a forced capture) needs no search.
      if (moves.length === 1) return true;
      if (index >= moves.length) return true;
      const move = moves[index]!;
      // Searched only for whether it beats the best so far: a move that does not needs no exact score.
      const score = -negamax(applyMove(position, move), depth - 1, -Infinity, -bestScore, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      index += 1;
      return index >= moves.length;
    },
    best: () => bestMove,
  };
}

/** The seed for the computer's choice at this point of a game, so that a game replayed from its seed plays the same. */
export function moveSeed(seed: number, ply: number): number {
  return (seed ^ Math.imul(ply + 1, 0x9e3779b1)) >>> 0;
}

/** The computer's move, searched all at once. */
export function chooseMove(position: Position, seed: number, depth = SEARCH_DEPTH): Move {
  const search = createSearch(position, { depth, rng: seededRng(seed) });
  while (!search.step()) {
    // Each step searches one move at the top of the tree.
  }
  return search.best();
}
