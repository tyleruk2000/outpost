/**
 * A game of draughts as the screen keeps it: how it is played, its seed, and its moves.
 * The position is never stored, only rebuilt by replaying the moves, so a save that has
 * been damaged or comes from another version is refused rather than shown wrong.
 */
import { type Move, type Outcome, outcomeOf, type Position, replay, type Side } from "./engine";

export type Mode = "computer" | "two-player";

export interface Game {
  version: 1;
  seed: number;
  mode: Mode;
  /** The side the person plays against the computer (both sides in two-player). */
  human: Side;
  /** Each move as its squares, from the first. */
  paths: number[][];
  /** When the first move was made, milliseconds; null before it. */
  startedAt: number | null;
  /** Both players agreed a draw (two-player). */
  agreed: boolean;
  /** Seconds the finished game took, kept when it ended. */
  seconds: number | null;
  /** The result has been sent to the tally. */
  recorded: boolean;
}

export const SAVE_KEY = "draughts";

export function newGame(seed: number, mode: Mode, human: Side): Game {
  return { version: 1, seed, mode, human, paths: [], startedAt: null, agreed: false, seconds: null, recorded: false };
}

const isSquare = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 64;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Accepts a saved game only if every field is as written and its moves replay legally. */
export function isGame(value: unknown): value is Game {
  if (!value || typeof value !== "object") return false;
  const game = value as Record<string, unknown>;
  if (game.version !== 1) return false;
  if (!Number.isInteger(game.seed) || (game.seed as number) < 1 || (game.seed as number) > 0xffffffff) return false;
  if (game.mode !== "computer" && game.mode !== "two-player") return false;
  if (game.human !== "dark" && game.human !== "light") return false;
  if (!Array.isArray(game.paths) || game.paths.length > 2000) return false;
  if (!game.paths.every((path) => Array.isArray(path) && path.length >= 2 && path.length <= 13 && path.every(isSquare))) return false;
  if (game.startedAt !== null && !isCount(game.startedAt)) return false;
  if (typeof game.agreed !== "boolean" || typeof game.recorded !== "boolean") return false;
  if (game.seconds !== null && !isCount(game.seconds)) return false;
  return replay(game.paths as number[][]) !== null;
}

export interface Played {
  position: Position;
  moves: Move[];
  outcome: Outcome;
}

export function play(game: Game): Played {
  const replayed = replay(game.paths);
  if (!replayed) throw new Error("The moves of this game are not legal.");
  const outcome: Outcome = game.agreed ? { kind: "draw", reason: "agreed" } : outcomeOf(replayed.position);
  return { ...replayed, outcome };
}

/** The side that made the move at this index: dark makes the first. */
export const moverOf = (index: number): Side => (index % 2 === 0 ? "dark" : "light");

/** How many moves the person has made: their own against the computer, every move in two-player. */
export function humanMoves(game: Game): number {
  if (game.mode === "two-player") return game.paths.length;
  return game.paths.filter((_, index) => moverOf(index) === game.human).length;
}

/**
 * The moves left after undoing a turn. Against the computer a turn is the person's last
 * move and the computer's reply (or only the person's move, while the computer thinks);
 * with two players it is the last move.
 */
export function undoTurn(game: Game): number[][] {
  if (game.mode === "two-player") return game.paths.slice(0, -1);
  for (let index = game.paths.length - 1; index >= 0; index -= 1) {
    if (moverOf(index) === game.human) return game.paths.slice(0, index);
  }
  return game.paths;
}
