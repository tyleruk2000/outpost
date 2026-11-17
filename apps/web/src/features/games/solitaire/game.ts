/**
 * A game of Solitaire as it is played and kept: the board now, every board before it (for
 * undo), the moves counted, the time taken and the seed it was dealt from. Pure, like the
 * engine: each step returns a new game.
 */
import { type Board, type Draw, deal, isBoard, isWon } from "./engine";

/** A board and the moves counted when it was reached: undo takes both back. */
export interface Snapshot {
  board: Board;
  moves: number;
}

export interface Game {
  version: 1;
  seed: number;
  draw: Draw;
  now: Snapshot;
  /** Every earlier snapshot, the oldest first. */
  history: Snapshot[];
  /** True once any move has been made, even if it was undone: the game then counts as played. */
  played: boolean;
  /** Seconds played, counted only while the screen is in view. */
  seconds: number;
  won: boolean;
}

/** Undo goes back this far. Each step is a board of a few hundred bytes. */
export const HISTORY_LIMIT = 2000;

export function newGame(seed: number, draw: Draw): Game {
  return { version: 1, seed, draw, now: { board: deal(seed), moves: 0 }, history: [], played: false, seconds: 0, won: false };
}

/** The game after a move: the board it led to, and how many moves it counts as. */
export function advance(game: Game, board: Board, moves = 1): Game {
  const history = [...game.history, game.now];
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  return { ...game, now: { board, moves: game.now.moves + moves }, history, played: true, won: isWon(board) };
}

/** The game one move back, exactly as it was then; the same game when there is nothing to undo. */
export function undo(game: Game): Game {
  const previous = game.history.at(-1);
  if (!previous || game.won) return game;
  return { ...game, now: previous, history: game.history.slice(0, -1), won: false };
}

export const variantOf = (draw: Draw) => (draw === 1 ? "draw-1" : "draw-3");
export const drawLabel = (draw: Draw) => (draw === 1 ? "Draw one" : "Draw three");

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return isBoard(snapshot.board) && Number.isInteger(snapshot.moves) && (snapshot.moves as number) >= 0;
}

/** Whether a kept game can be played on: every field, every board. Anything else is set aside for a new deal. */
export function isGame(value: unknown): value is Game {
  if (!value || typeof value !== "object") return false;
  const game = value as Record<string, unknown>;
  return (
    game.version === 1 &&
    Number.isInteger(game.seed) &&
    (game.draw === 1 || game.draw === 3) &&
    isSnapshot(game.now) &&
    Array.isArray(game.history) &&
    game.history.length <= HISTORY_LIMIT &&
    game.history.every(isSnapshot) &&
    typeof game.played === "boolean" &&
    typeof game.seconds === "number" &&
    Number.isFinite(game.seconds) &&
    game.seconds >= 0 &&
    typeof game.won === "boolean"
  );
}
