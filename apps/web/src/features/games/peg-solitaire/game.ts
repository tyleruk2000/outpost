/**
 * A game of peg solitaire as the screen keeps it: its jumps from the start, and when it
 * began and ended. The board is never stored, only rebuilt by replaying the jumps, so a
 * save that has been damaged or comes from another version is refused rather than shown
 * wrong, and undo takes off the last jump and gives back exactly the board before it.
 */
import { isHole, type JumpPair, replay } from "@outpost/shared/games/peg-solitaire";

export const SAVE_KEY = "peg-solitaire";
/** 32 pegs at the start, one taken by each jump: no game has more than 31. */
const MOST_JUMPS = 31;

export interface PegGame {
  version: 1;
  /** Each jump as the hole it starts from and the hole it lands in, from the first. */
  jumps: JumpPair[];
  /** When the first jump was made, milliseconds; null before it. */
  startedAt: number | null;
  /** Seconds the game took, kept when it ended. */
  seconds: number | null;
  /** The result has been sent to the tally. */
  recorded: boolean;
}

export function newGame(): PegGame {
  return { version: 1, jumps: [], startedAt: null, seconds: null, recorded: false };
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Accepts a saved game only if every field is as written and its jumps replay legally. */
export function isPegGame(value: unknown): value is PegGame {
  if (!value || typeof value !== "object") return false;
  const game = value as Record<string, unknown>;
  if (game.version !== 1) return false;
  if (!Array.isArray(game.jumps) || game.jumps.length > MOST_JUMPS) return false;
  if (!game.jumps.every((jump) => Array.isArray(jump) && jump.length === 2 && jump.every((place) => isHole(place)))) return false;
  if (game.startedAt !== null && !isCount(game.startedAt)) return false;
  if (game.seconds !== null && !(isCount(game.seconds) && game.seconds <= 86_400)) return false;
  if (typeof game.recorded !== "boolean") return false;
  return replay(game.jumps as JumpPair[]) !== null;
}

/** Seconds from the first jump to now, as the tally takes them (at most a day). */
export function secondsSince(startedAt: number | null, now: number): number {
  if (startedAt === null) return 0;
  return Math.min(86_400, Math.max(0, Math.round((now - startedAt) / 1000)));
}
