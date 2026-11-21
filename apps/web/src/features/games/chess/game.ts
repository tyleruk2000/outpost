/**
 * A game of chess as the screen keeps it: how it is played, its seed, where it started
 * and its moves. The position is never stored, only rebuilt by replaying the moves, so a
 * save that has been damaged or comes from another version is refused rather than shown
 * wrong. Here too a game is written out as PGN and read back from PGN or FEN.
 */
import { LEVELS, type Level } from "./ai";
import {
  applyMove,
  moveCode,
  moveListText,
  NotationError,
  type Outcome,
  outcomeOf,
  type Position,
  parseFen,
  parseMove,
  type Replayed,
  repetitionKey,
  replay,
  type Side,
  START_FEN,
  toFen,
} from "./engine";

export type Mode = "computer" | "two-player";

export interface Game {
  version: 1;
  seed: number;
  mode: Mode;
  /** The side the person plays against the computer (both sides in two-player). */
  human: Side;
  level: Level;
  /** The position the game started from, as FEN: the usual start unless one was pasted in. */
  start: string;
  /** Each move in its long form ("e2e4", "e7e8q"), from the first. */
  moves: string[];
  /** Whether the board is turned round from the way it would otherwise face. */
  turned: boolean;
  startedAt: number | null;
  agreed: boolean;
  /** Seconds played, counted only while the board was in view; null before the first move. */
  seconds: number | null;
  /** The result has been sent to the tally. */
  recorded: boolean;
}

export const SAVE_KEY = "chess";
/** Far more than any game: a game that reaches it is drawn by the fifty-move rule long before. */
const MOST_MOVES = 3000;

export function newGame(seed: number, mode: Mode, human: Side, level: Level, start = START_FEN): Game {
  return {
    version: 1,
    seed,
    mode,
    human,
    level,
    start,
    moves: [],
    turned: false,
    startedAt: null,
    agreed: false,
    seconds: null,
    recorded: false,
  };
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function isGame(value: unknown): value is Game {
  if (!value || typeof value !== "object") return false;
  const game = value as Record<string, unknown>;
  if (game.version !== 1) return false;
  if (!Number.isInteger(game.seed) || (game.seed as number) < 1 || (game.seed as number) > 0xffffffff) return false;
  if (game.mode !== "computer" && game.mode !== "two-player") return false;
  if (game.human !== "white" && game.human !== "black") return false;
  if (!LEVELS.includes(game.level as Level)) return false;
  if (typeof game.start !== "string" || game.start.length > 100) return false;
  if (!Array.isArray(game.moves) || game.moves.length > MOST_MOVES) return false;
  if (!game.moves.every((code) => typeof code === "string" && /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(code))) return false;
  if (typeof game.turned !== "boolean" || typeof game.agreed !== "boolean" || typeof game.recorded !== "boolean") return false;
  if (game.startedAt !== null && !isCount(game.startedAt)) return false;
  if (game.seconds !== null && !isCount(game.seconds)) return false;
  return replay(game.moves as string[], game.start) !== null;
}

export interface Played extends Replayed {
  outcome: Outcome;
}

export function play(game: Game): Played {
  const replayed = replay(game.moves, game.start);
  if (!replayed) throw new Error("The moves of this game are not legal.");
  const outcome: Outcome = game.agreed && replayed.outcome.kind === "playing" ? { kind: "draw", reason: "agreed" } : replayed.outcome;
  return { ...replayed, outcome };
}

/** The side that made the move at this index. */
export function moverOf(game: Pick<Game, "start">, index: number): Side {
  const first: Side = game.start.split(" ")[1] === "b" ? "black" : "white";
  return index % 2 === 0 ? first : first === "white" ? "black" : "white";
}

export function humanMoves(game: Game): number {
  if (game.mode === "two-player") return game.moves.length;
  return game.moves.filter((_, index) => moverOf(game, index) === game.human).length;
}

/** The moves left after undoing a turn: the person's last move and the reply, or with two players the last move. */
export function undoTurn(game: Game): string[] {
  if (game.mode === "two-player") return game.moves.slice(0, -1);
  for (let index = game.moves.length - 1; index >= 0; index -= 1) {
    if (moverOf(game, index) === game.human) return game.moves.slice(0, index);
  }
  return game.moves;
}

// ── PGN ────────────────────────────────────────────────────────────────────

export function resultText(outcome: Outcome): string {
  if (outcome.kind === "won") return outcome.winner === "white" ? "1-0" : "0-1";
  if (outcome.kind === "draw") return "1/2-1/2";
  return "*";
}

const LEVEL_WORDS: Record<Level, string> = { learner: "learner", easy: "easy", medium: "medium", hard: "hard" };

const tag = (name: string, value: string) => `[${name} "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;

/** The game as PGN, the seven standard tags first, and the start position when it is not the usual one. */
export function toPgn(game: Game, played: Played, today: Date = new Date()): string {
  const date = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
  const computer = `Outpost computer (${LEVEL_WORDS[game.level]})`;
  const white = game.mode === "two-player" ? "White" : game.human === "white" ? "You" : computer;
  const black = game.mode === "two-player" ? "Black" : game.human === "black" ? "You" : computer;
  const result = resultText(played.outcome);
  const tags = [
    tag("Event", "Casual game"),
    tag("Site", "Outpost"),
    tag("Date", date),
    tag("Round", "-"),
    tag("White", white),
    tag("Black", black),
    tag("Result", result),
  ];
  if (game.start !== START_FEN) tags.push(tag("SetUp", "1"), tag("FEN", game.start));
  const text = `${moveListText(played.sans, played.start)} ${result}`.trim();
  // Lines of the move text kept under 80 characters, as the standard asks.
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > 79) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return `${tags.join("\n")}\n\n${lines.join("\n")}\n`;
}

export interface Pasted {
  start: string;
  moves: string[];
  /** "a game of 34 moves" or "a position". */
  kind: "pgn" | "fen";
}

/**
 * A game or position pasted in: FEN if it reads as one, otherwise PGN (the first game in
 * the text). Comments, variations, move numbers, annotations and the result are passed
 * over. Throws a `NotationError` saying what could not be read.
 */
export function readPasted(text: string): Pasted {
  const trimmed = text.trim();
  if (!trimmed) throw new NotationError("There is nothing to read. Paste a game in PGN or a position in FEN.");
  if (/^[1-8pnbrqkPNBRQK/]+\s+[wb](\s|$)/.test(trimmed)) {
    const position = parseFen(trimmed);
    return { start: toFen(position), moves: [], kind: "fen" };
  }
  const tags = new Map<string, string>();
  const tagPattern = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;
  for (const match of trimmed.matchAll(tagPattern)) tags.set(match[1]!, match[2]!.replace(/\\(.)/g, "$1"));
  let body = trimmed.replace(tagPattern, " ");
  // Comments in braces, comments to the end of a line, and variations in brackets (which may nest).
  body = body.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  let previous = "";
  while (previous !== body) {
    previous = body;
    body = body.replace(/\([^()]*\)/g, " ");
  }
  let position: Position;
  try {
    position = parseFen(tags.get("FEN") ?? START_FEN);
  } catch (error) {
    throw new NotationError(`The FEN tag of this game cannot be read: ${(error as Error).message}`);
  }
  const start = toFen(position);
  const moves: string[] = [];
  const seen = new Map<string, number>([[repetitionKey(position), 1]]);
  let outcome = outcomeOf(position);
  for (const raw of body.split(/\s+/)) {
    const word = raw.replace(/^\d+\.(\.\.)?/, "");
    if (!word || /^\$\d+$/.test(word) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(word) || /^\d+\.+$/.test(word)) continue;
    // A game that has ended takes no more moves.
    if (outcome.kind !== "playing") throw new NotationError(`The game is already over before "${word}".`);
    const move = parseMove(position, word);
    if (!move) throw new NotationError(`"${word}" is not a legal move here (move ${position.fullmove}).`);
    moves.push(moveCode(move));
    position = applyMove(position, move);
    const key = repetitionKey(position);
    const times = (seen.get(key) ?? 0) + 1;
    seen.set(key, times);
    outcome = outcomeOf(position, times);
  }
  if (moves.length === 0 && !tags.has("FEN")) throw new NotationError("No moves were found. Paste a game in PGN or a position in FEN.");
  return { start, moves, kind: "pgn" };
}
