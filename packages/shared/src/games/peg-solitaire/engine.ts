/**
 * Peg solitaire on the English board: 33 holes in a cross, a 7 by 7 square with the
 * 2 by 2 corners taken off. Pure, with no clock and no randomness: a game is its list of
 * jumps from the one start, so the board is always rebuilt by replaying them, and undo is
 * the list one jump shorter.
 *
 * A hole is numbered by its place in the 7 by 7 square, row by row from the top left
 * (0 to 48); the 16 corner places are not holes. Holes are named as on a chessboard:
 * columns a to g from the left, rows 1 to 7 from the bottom, so the centre is d4.
 */

export const SIZE = 7;
/** The centre hole, d4: the one left empty at the start, and the best place for the last peg. */
export const CENTRE = 24;

/** A board: for each of the 49 places, whether a peg is in it. A place off the cross is always false. */
export type Board = readonly boolean[];

/** A jump: the peg in `from` goes over the peg in `over`, which is taken off, into the empty `to`. */
export interface Jump {
  from: number;
  over: number;
  to: number;
}

export const rowOf = (place: number) => Math.floor(place / SIZE);
export const columnOf = (place: number) => place % SIZE;
export const placeAt = (row: number, column: number) => row * SIZE + column;

/** Whether this row and column is one of the 33 holes. */
export function isHoleAt(row: number, column: number): boolean {
  if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) return false;
  const middleRow = row >= 2 && row <= 4;
  const middleColumn = column >= 2 && column <= 4;
  return middleRow || middleColumn;
}

export function isHole(place: number): boolean {
  return Number.isInteger(place) && place >= 0 && place < SIZE * SIZE && isHoleAt(rowOf(place), columnOf(place));
}

/** The 33 holes, row by row from the top. */
export const HOLES: readonly number[] = Array.from({ length: SIZE * SIZE }, (_, place) => place).filter(isHole);

const FILES = "abcdefg";

/** "d4" for the centre. */
export function holeName(place: number): string {
  return `${FILES[columnOf(place)]}${SIZE - rowOf(place)}`;
}

/** The hole a name such as "d4" stands for, or null when it is not one of the 33. */
export function parseHole(name: string): number | null {
  const match = /^([a-g])([1-7])$/.exec(name);
  if (!match) return null;
  const place = placeAt(SIZE - Number(match[2]), FILES.indexOf(match[1]!));
  return isHole(place) ? place : null;
}

/** The start: a peg in every hole but the centre. */
export function startBoard(): Board {
  return Array.from({ length: SIZE * SIZE }, (_, place) => isHole(place) && place !== CENTRE);
}

export function pegCount(board: Board): number {
  return board.reduce((count, peg) => count + (peg ? 1 : 0), 0);
}

/** Up, down, left, right: a jump is never diagonal. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** The jumps the peg in `from` can make now; none if there is no peg there. */
export function jumpsFrom(board: Board, from: number): Jump[] {
  if (!isHole(from) || !board[from]) return [];
  const row = rowOf(from);
  const column = columnOf(from);
  const jumps: Jump[] = [];
  for (const [dr, dc] of STEPS) {
    if (!isHoleAt(row + 2 * dr, column + 2 * dc)) continue;
    const over = placeAt(row + dr, column + dc);
    const to = placeAt(row + 2 * dr, column + 2 * dc);
    if (board[over] && !board[to]) jumps.push({ from, over, to });
  }
  return jumps;
}

/** Every jump that can be made now, by hole of the peg, then direction. */
export function legalJumps(board: Board): Jump[] {
  return HOLES.flatMap((place) => jumpsFrom(board, place));
}

/** The jump from one hole to another, if it is legal now; null otherwise. */
export function findJump(board: Board, from: number, to: number): Jump | null {
  return jumpsFrom(board, from).find((jump) => jump.to === to) ?? null;
}

/** The board after a jump from `from` to `to`, or null when that is not a legal jump. */
export function applyJump(board: Board, from: number, to: number): Board | null {
  const jump = findJump(board, from, to);
  if (!jump) return null;
  const next = board.slice();
  next[jump.from] = false;
  next[jump.over] = false;
  next[jump.to] = true;
  return next;
}

/** The game is over when no jump remains anywhere. */
export function isOver(board: Board): boolean {
  return legalJumps(board).length === 0;
}

/** One jump as it is kept: the hole it starts from and the hole it lands in. */
export type JumpPair = readonly [from: number, to: number];

export interface Replayed {
  board: Board;
  jumps: Jump[];
}

/** The board after these jumps from the start, or null when any of them is not legal in its turn. */
export function replay(pairs: readonly JumpPair[]): Replayed | null {
  let board = startBoard();
  const jumps: Jump[] = [];
  for (const [from, to] of pairs) {
    const jump = findJump(board, from, to);
    if (!jump) return null;
    board = applyJump(board, from, to)!;
    jumps.push(jump);
  }
  return { board, jumps };
}

export type Ending = { kind: "playing" } | { kind: "solved"; inCentre: boolean } | { kind: "stuck"; left: number };

/** How the game stands: still going, solved (one peg left, perhaps in the centre), or stuck with pegs left. */
export function endingOf(board: Board): Ending {
  if (!isOver(board)) return { kind: "playing" };
  const left = pegCount(board);
  if (left === 1) return { kind: "solved", inCentre: board[CENTRE] === true };
  return { kind: "stuck", left };
}

/** "c5 over d5 to e5". */
export function jumpWords(jump: Jump): string {
  return `${holeName(jump.from)} over ${holeName(jump.over)} to ${holeName(jump.to)}`;
}
