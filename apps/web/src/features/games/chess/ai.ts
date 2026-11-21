/**
 * The computer's play: Outpost's own small search, as for Draughts. Negamax with
 * alpha-beta pruning to a fixed depth, captures tried first (the most valuable piece
 * taken by the least valuable), and past that depth a look at captures alone until the
 * position is quiet, so that it does not stop counting halfway through an exchange. The
 * evaluation is material and piece-square values written for Outpost (below).
 *
 * It is a fair opponent for a family, not a strong engine: it has no opening book, no
 * endgame knowledge beyond pushing pawns and bringing the king out, and does not look at
 * repetitions inside its search.
 *
 * As in Draughts the search is split into steps, one move at the top of the tree per
 * step, so that where there is no Web Worker the page runs it a step at a time.
 */
import { type Rng, seededRng, shuffled } from "../kit/rng";
import {
  applyMove,
  BISHOP,
  fileOf,
  hasLegalMove,
  inCheck,
  insufficientMaterial,
  KING,
  KNIGHT,
  kindOf,
  legalCaptures,
  legalMoves,
  type Move,
  PAWN,
  type Position,
  QUEEN,
  ROOK,
  rankOf,
} from "./engine";

export type Level = "learner" | "easy" | "medium" | "hard";
export const LEVELS: readonly Level[] = ["learner", "easy", "medium", "hard"];

export interface LevelPlay {
  /** Plies searched in full. */
  depth: number;
  /** Whether captures are followed past the depth until the position is quiet. */
  quiesce: boolean;
  /** Up to this many centipawns of chance added to each move at the top, so that a weaker level errs. */
  noise: number;
}

/**
 * Learner looks one move ahead, does not see a piece it leaves hanging, and errs often:
 * a child who knows the moves can beat it. Hard looks four plies ahead and then
 * through every exchange.
 */
export const LEVEL_PLAY: Record<Level, LevelPlay> = {
  learner: { depth: 1, quiesce: false, noise: 250 },
  easy: { depth: 2, quiesce: true, noise: 60 },
  medium: { depth: 3, quiesce: true, noise: 10 },
  hard: { depth: 4, quiesce: true, noise: 0 },
};

export const VALUE: Record<number, number> = { [PAWN]: 100, [KNIGHT]: 310, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 0 };
const MATE = 100_000;

/** How far a square is from the centre of the board: 0 for d4, d5, e4 and e5, 3 for a corner. */
function fromCentre(square: number): number {
  const file = fileOf(square);
  const rank = rankOf(square);
  return Math.max(Math.abs(file * 2 - 7), Math.abs(rank * 2 - 7)) / 2 - 0.5;
}

/**
 * The piece-square values, in centipawns, for a white piece (a black piece reads the
 * board turned round). They are Outpost's own and plain: knights and bishops want the
 * centre, pawns want to advance (the centre pawns most), rooks like the seventh rank,
 * the king stays home behind its pawns until the queens are off, then comes to the centre.
 */
function placeValue(kind: number, square: number, endgame: boolean): number {
  const rank = rankOf(square);
  const file = fileOf(square);
  const centre = fromCentre(square);
  switch (kind) {
    case PAWN: {
      const advance = rank - 1;
      const central = file === 3 || file === 4 ? 1 : 0;
      return advance * (endgame ? 12 : 5) + (central && rank >= 3 ? 12 : 0) - (central && rank === 1 ? 6 : 0);
    }
    case KNIGHT:
      return 18 - centre * 12;
    case BISHOP:
      return 8 - centre * 5;
    case ROOK:
      return rank === 6 ? 15 : file === 3 || file === 4 ? 4 : 0;
    case QUEEN:
      return 4 - centre * 2;
    case KING:
      if (endgame) return 20 - centre * 12;
      return rank === 0 ? (file === 6 || file === 1 || file === 2 ? 25 : file === 4 ? 5 : 10) : -15 * rank;
    default:
      return 0;
  }
}

/** The position's worth, in centipawns, to the side to move. */
export function evaluate(position: Position): number {
  const { board } = position;
  if (insufficientMaterial(board)) return 0;
  let heavy = 0;
  for (const piece of board) if (piece !== 0 && kindOf(piece) !== PAWN && kindOf(piece) !== KING) heavy += VALUE[kindOf(piece)]!;
  // An endgame: little left on the board but kings and pawns.
  const endgame = heavy <= 2 * (VALUE[ROOK]! + VALUE[BISHOP]!);
  let score = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  for (let square = 0; square < 64; square += 1) {
    const piece = board[square]!;
    if (piece === 0) continue;
    const kind = kindOf(piece);
    const own = piece > 0 ? square : square ^ 56;
    const worth = VALUE[kind]! + placeValue(kind, own, endgame);
    score += piece > 0 ? worth : -worth;
    if (kind === BISHOP) {
      if (piece > 0) whiteBishops += 1;
      else blackBishops += 1;
    }
  }
  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;
  return position.turn === "white" ? score : -score;
}

/** Captures first, the most valuable piece taken by the least valuable; promotions with them. */
function ordered(moves: Move[]): Move[] {
  const weight = (move: Move) =>
    (move.captured ? 10 * VALUE[kindOf(move.captured)]! - VALUE[kindOf(move.piece)]! + 10_000 : 0) +
    (move.promotion ? VALUE[move.promotion]! : 0);
  return moves
    .map((move) => ({ move, weight: weight(move) }))
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.move);
}

/** Captures only, from a position where the side to move may also stand pat. */
function quiesce(position: Position, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(position);
  if (stand >= beta || depth <= 0) return stand;
  if (stand > alpha) alpha = stand;
  for (const move of ordered(legalCaptures(position))) {
    const score = -quiesce(applyMove(position, move), -beta, -alpha, depth - 1);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(position: Position, depth: number, alpha: number, beta: number, ply: number, play: LevelPlay): number {
  if (position.halfmove >= 100) return 0;
  if (depth <= 0) {
    // A king in check with no way out is mated here, at the end of the search; stalemate at the end is not looked for.
    if (inCheck(position) && !hasLegalMove(position)) return -MATE + ply;
    return play.quiesce ? quiesce(position, alpha, beta, 8) : evaluate(position);
  }
  const moves = legalMoves(position);
  // Mated sooner is worse, so a mate is taken quickly and a loss put off.
  if (moves.length === 0) return inCheck(position) ? -MATE + ply : 0;
  let best = -Infinity;
  for (const move of ordered(moves)) {
    const score = -negamax(applyMove(position, move), depth - 1, -beta, -alpha, ply + 1, play);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export interface Search {
  /** Searches one more move at the top of the tree; true when the search is done. */
  step(): boolean;
  best(): Move;
}

/**
 * A search of `position` at a level. The moves at the top are tried in an order shuffled
 * from the seed, and with the level's chance added, so that among moves of equal worth
 * the seed decides and games differ.
 */
export function createSearch(position: Position, { level, rng }: { level: Level; rng: Rng }): Search {
  const play = LEVEL_PLAY[level];
  const moves = shuffled(legalMoves(position), rng);
  if (moves.length === 0) throw new Error("There is no move to search: the game is over.");
  const chance = moves.map(() => Math.round(rng() * play.noise));
  let index = 0;
  let bestMove = moves[0]!;
  let bestScore = -Infinity;
  return {
    step() {
      if (moves.length === 1 || index >= moves.length) return true;
      const move = moves[index]!;
      const bonus = chance[index]!;
      // A full window when there is chance to add, since a near miss can then still win; otherwise only "does it beat the best".
      const floor = play.noise > 0 ? -Infinity : bestScore;
      const raw = -negamax(applyMove(position, move), play.depth - 1, -Infinity, -floor, 1, play);
      // A mate is never thrown away by chance.
      const score = Math.abs(raw) > MATE / 2 ? raw : raw + bonus;
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

export function moveSeed(seed: number, ply: number): number {
  return (seed ^ Math.imul(ply + 1, 0x9e3779b1)) >>> 0;
}

export function chooseMove(position: Position, seed: number, level: Level): Move {
  const search = createSearch(position, { level, rng: seededRng(seed) });
  while (!search.step()) {
    // Each step searches one move at the top of the tree.
  }
  return search.best();
}
