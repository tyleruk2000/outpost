/**
 * English draughts (checkers), as pure functions with no React, so that the rules can be
 * tested on their own and the computer can search them in a worker.
 *
 * The board is 64 squares, index = rank × 8 + file, with a1 = 0 and h8 = 63, named from
 * dark's side as on a chess board. Play is on the dark squares, those where file + rank
 * is even (a1, c1 … h8). Dark starts on ranks 1 to 3, moves up the board and moves first.
 *
 * The rules, as the About disclosure states them:
 * - men move one square diagonally forward; kings one square diagonally either way;
 * - a capture is a jump over an opposing piece to the empty square beyond, and if any
 *   capture is available, a capture must be made (any of them, not necessarily the longest);
 * - a jumping piece must go on jumping while it can, in the same turn;
 * - a man reaching the far rank becomes a king and the turn ends there;
 * - a player with no legal move loses;
 * - after 40 moves each (80 in all) with no capture and no man moved, the game is drawn.
 */

export type Side = "dark" | "light";

/** 0 empty; 1 dark man, 2 dark king; −1 light man, −2 light king. */
export type Cell = -2 | -1 | 0 | 1 | 2;

export interface Position {
  board: Cell[];
  turn: Side;
  /** Moves in a row (by either side) with no capture and no man moved. */
  quiet: number;
}

/** A move: the squares the piece stands on in turn, from where it starts to where it ends, and what it takes. */
export interface Move {
  path: number[];
  captures: number[];
}

/** 40 moves each with no capture and no man moved. */
export const QUIET_LIMIT = 80;

export const FILES = "abcdefgh";

export function fileOf(square: number): number {
  return square % 8;
}
export function rankOf(square: number): number {
  return Math.floor(square / 8);
}
export function squareAt(file: number, rank: number): number {
  return rank * 8 + file;
}
export function isDark(square: number): boolean {
  return (fileOf(square) + rankOf(square)) % 2 === 0;
}
/** "c3". */
export function squareName(square: number): string {
  return `${FILES[fileOf(square)]}${rankOf(square) + 1}`;
}
export function parseSquare(name: string): number {
  const file = FILES.indexOf(name[0] ?? "");
  const rank = Number(name.slice(1)) - 1;
  if (file < 0 || !(rank >= 0 && rank < 8)) throw new Error(`Not a square: ${name}`);
  return squareAt(file, rank);
}

export const other = (side: Side): Side => (side === "dark" ? "light" : "dark");
export const sideOf = (cell: Cell): Side | null => (cell > 0 ? "dark" : cell < 0 ? "light" : null);
export const isKing = (cell: Cell): boolean => cell === 2 || cell === -2;

export function startPosition(): Position {
  const board: Cell[] = Array.from({ length: 64 }, () => 0);
  for (let square = 0; square < 64; square += 1) {
    if (!isDark(square)) continue;
    if (rankOf(square) <= 2) board[square] = 1;
    else if (rankOf(square) >= 5) board[square] = -1;
  }
  return { board, turn: "dark", quiet: 0 };
}

/** A position written as pieces on named squares, for tests: { c3: "d", f6: "L" } (lower case a man, upper case a king). */
export function positionFrom(pieces: Record<string, "d" | "D" | "l" | "L">, turn: Side = "dark", quiet = 0): Position {
  const board: Cell[] = Array.from({ length: 64 }, () => 0);
  for (const [name, piece] of Object.entries(pieces)) {
    const square = parseSquare(name);
    if (!isDark(square)) throw new Error(`${name} is a light square`);
    board[square] = ({ d: 1, D: 2, l: -1, L: -2 } as const)[piece];
  }
  return { board, turn, quiet };
}

/** The diagonal steps a piece may take: [file, rank] deltas. */
function directions(cell: Cell): Array<[number, number]> {
  if (isKing(cell))
    return [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
  return cell > 0
    ? [
        [1, 1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [-1, -1],
      ];
}

function step(square: number, [df, dr]: [number, number], times = 1): number | null {
  const file = fileOf(square) + df * times;
  const rank = rankOf(square) + dr * times;
  return file >= 0 && file < 8 && rank >= 0 && rank < 8 ? squareAt(file, rank) : null;
}

const crownRank = (cell: Cell): number => (cell > 0 ? 7 : 0);

/**
 * Every jump sequence for the piece now on `at`. The piece has left its starting square
 * (so a king may come back to it); a piece already jumped stays on the board until the
 * move ends, so it can be neither jumped again nor landed on.
 */
function jumpsFrom(board: Cell[], cell: Cell, at: number, path: number[], captures: number[], out: Move[]): void {
  let extended = false;
  for (const direction of directions(cell)) {
    const over = step(at, direction);
    const land = step(at, direction, 2);
    if (over === null || land === null) continue;
    const victim = board[over]!;
    if (victim === 0 || sideOf(victim) === sideOf(cell) || captures.includes(over) || board[land] !== 0) continue;
    extended = true;
    const nextPath = [...path, land];
    const nextCaptures = [...captures, over];
    // A man that reaches the far rank is crowned, and the move ends there.
    if (!isKing(cell) && rankOf(land) === crownRank(cell)) out.push({ path: nextPath, captures: nextCaptures });
    else jumpsFrom(board, cell, land, nextPath, nextCaptures, out);
  }
  if (!extended && captures.length > 0) out.push({ path, captures });
}

/** Every legal move for the side to move. Captures, when there are any, are the only legal moves. */
export function legalMoves(position: Position): Move[] {
  const { board, turn } = position;
  const jumps: Move[] = [];
  const steps: Move[] = [];
  for (let square = 0; square < 64; square += 1) {
    const cell = board[square]!;
    if (cell === 0 || sideOf(cell) !== turn) continue;
    board[square] = 0;
    jumpsFrom(board, cell, square, [square], [], jumps);
    board[square] = cell;
    if (jumps.length > 0) continue;
    for (const direction of directions(cell)) {
      const to = step(square, direction);
      if (to !== null && board[to] === 0) steps.push({ path: [square, to], captures: [] });
    }
  }
  return jumps.length > 0 ? jumps : steps;
}

export function applyMove(position: Position, move: Move): Position {
  const board = position.board.slice();
  const from = move.path[0]!;
  const to = move.path[move.path.length - 1]!;
  let cell = board[from]!;
  const man = !isKing(cell);
  board[from] = 0;
  for (const square of move.captures) board[square] = 0;
  if (man && rankOf(to) === crownRank(cell)) cell = cell > 0 ? 2 : -2;
  board[to] = cell;
  const quiet = move.captures.length > 0 || man ? 0 : position.quiet + 1;
  return { board, turn: other(position.turn), quiet };
}

export function sameMove(a: Move, b: Move): boolean {
  return a.path.length === b.path.length && a.path.every((square, index) => square === b.path[index]);
}

/** The legal move with these squares, or null. */
export function findMove(position: Position, path: readonly number[]): Move | null {
  return legalMoves(position).find((move) => sameMove(move, { path: [...path], captures: [] })) ?? null;
}

export type Outcome = { kind: "playing" } | { kind: "won"; winner: Side } | { kind: "draw"; reason: "quiet" | "agreed" };

/** Whether the game is over in this position: the side to move has no move, or the quiet moves have run out. */
export function outcomeOf(position: Position): Outcome {
  if (legalMoves(position).length === 0) return { kind: "won", winner: other(position.turn) };
  if (position.quiet >= QUIET_LIMIT) return { kind: "draw", reason: "quiet" };
  return { kind: "playing" };
}

export function pieceCount(position: Position, side: Side): number {
  return position.board.filter((cell) => sideOf(cell) === side).length;
}

/** "c3 to d4", or "e3 jumps to g5 and e7". */
export function moveWords(move: Move): string {
  const [from, ...rest] = move.path.map(squareName);
  if (move.captures.length === 0) return `${from} to ${rest[0]}`;
  const landings = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}`;
  return `${from} jumps to ${landings}`;
}

/** Replays a list of moves from the start, or returns null if any of them is not legal. */
export function replay(paths: readonly (readonly number[])[]): { position: Position; moves: Move[] } | null {
  let position = startPosition();
  const moves: Move[] = [];
  for (const path of paths) {
    if (outcomeOf(position).kind !== "playing") return null;
    const move = findMove(position, path);
    if (!move) return null;
    moves.push(move);
    position = applyMove(position, move);
  }
  return { position, moves };
}
