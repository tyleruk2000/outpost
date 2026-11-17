/**
 * Games (the Games section): what the server keeps for them. Outpost has no accounts,
 * so what is kept is the household's: one row of `game_saves` per game. The allotment
 * keeps its whole plot there (its engine is pure and lives in `./games/allotment/`);
 * Solitaire, Peg solitaire, Sudoku, Draughts and Pairs keep only a tally of games played and won. An
 * unfinished game of those four stays on the device it is being played on, so that two
 * people playing at once on two devices never overwrite each other's board.
 */

/** Every game, in the order the Games section lists them. */
export const GAME_IDS = ["allotment", "solitaire", "peg-solitaire", "sudoku", "draughts", "pairs"] as const;
export type GameId = (typeof GAME_IDS)[number];

/** The games that keep a tally on the server (the allotment keeps its plot instead). */
export const TALLY_GAME_IDS = ["solitaire", "peg-solitaire", "sudoku", "draughts", "pairs"] as const;
export type TallyGameId = (typeof TALLY_GAME_IDS)[number];

/**
 * The ways each game is played, each with a tally of its own: draw one or draw three,
 * the three levels of Sudoku, against the computer or two at one device, the three
 * sizes of Pairs. Peg solitaire has one board, the English cross of 33 holes.
 */
export const GAME_VARIANTS = {
  solitaire: ["draw-1", "draw-3"],
  "peg-solitaire": ["english"],
  sudoku: ["gentle", "steady", "testing"],
  draughts: ["computer", "two-player"],
  pairs: ["small", "medium", "large"],
} as const satisfies Record<TallyGameId, readonly string[]>;
export type GameVariant<G extends TallyGameId = TallyGameId> = (typeof GAME_VARIANTS)[G][number];

/** One way of playing a game, counted. */
export interface GameTallyEntry {
  played: number;
  won: number;
  /** Fewest seconds to win, or null before a win that was timed. */
  bestSeconds: number | null;
  /** Fewest moves to win, or null before a win that counted them. */
  fewestMoves: number | null;
  /** Fewest left at the end of a game, won or not (Peg solitaire's pegs), or null before a game that counted them. Absent from a tally kept before it was counted. */
  fewestLeft?: number | null;
  /** When a game of this kind last finished, milliseconds. */
  lastAt: number | null;
}

/** A game's tally: one entry for each way of playing it that has been played. */
export type GameTally = Partial<Record<string, GameTallyEntry>>;

/** A finished game, as a device reports it. */
export interface GameResultInput {
  variant: string;
  won: boolean;
  seconds?: number;
  moves?: number;
  /** What was left at the end: Peg solitaire's pegs. */
  left?: number;
}

/** GET /api/games: every game's tally, and whether the allotment has been started. */
export interface GamesResponse {
  tallies: Record<TallyGameId, GameTally>;
  allotmentStarted: boolean;
}

/** What the games keep, for "what is stored" and erase everything: the number of rows of `game_saves`. */
export interface GamesKept {
  saves: number;
}

/** The largest number any tally or count of the games reaches: they stop there. */
export const GAME_COUNT_CAP = 999_999;
