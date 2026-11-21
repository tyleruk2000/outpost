/**
 * Chess, as pure functions with no React, so that the rules can be tested on their own
 * and the computer can search them in a worker.
 *
 * The board is 64 squares, index = rank × 8 + file, with a1 = 0 and h8 = 63. A piece is a
 * number: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king, positive for white and
 * negative for black, 0 for an empty square.
 *
 * The rules are the FIDE Laws of Chess: castling on either side (neither the king nor
 * that rook has moved, the squares between are empty, and the king is not in check, does
 * not pass through an attacked square and does not land on one), en passant, promotion
 * to a queen, rook, bishop or knight, and a move that leaves one's own king in check is
 * not a move. The game ends in checkmate or stalemate, and is drawn by threefold
 * repetition, by 50 moves each with no capture and no pawn moved, by too little material
 * for either side to mate, or by agreement. Here repetition and the fifty-move rule end
 * the game at once, rather than waiting for a player to claim them.
 */

export type Side = "white" | "black";

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** A piece's kind, 1 to 6, ignoring its side. */
export type Kind = 1 | 2 | 3 | 4 | 5 | 6;
export type PromotionKind = 2 | 3 | 4 | 5;

/** Castling rights as bits: white king's side, white queen's side, black king's side, black queen's side. */
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export interface Position {
  board: number[];
  turn: Side;
  castling: number;
  /** The square a pawn passed over in a double step just made, or null. */
  ep: number | null;
  /** Moves (by either side) since the last capture or pawn move. */
  halfmove: number;
  /** Starts at 1 and goes up after black's move. */
  fullmove: number;
}

export type MoveFlag = "normal" | "double" | "en-passant" | "castle-king" | "castle-queen";

export interface Move {
  from: number;
  to: number;
  /** The piece moved, signed. */
  piece: number;
  /** The piece taken, signed, or 0. For en passant, the pawn taken beside the square moved to. */
  captured: number;
  promotion: PromotionKind | null;
  flag: MoveFlag;
}

export const FILES = "abcdefgh";
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const fileOf = (square: number): number => square & 7;
export const rankOf = (square: number): number => square >> 3;
export const squareAt = (file: number, rank: number): number => rank * 8 + file;
export const other = (side: Side): Side => (side === "white" ? "black" : "white");
export const sideOf = (piece: number): Side | null => (piece > 0 ? "white" : piece < 0 ? "black" : null);
export const kindOf = (piece: number): Kind => Math.abs(piece) as Kind;
const sign = (side: Side): 1 | -1 => (side === "white" ? 1 : -1);

export function squareName(square: number): string {
  return `${FILES[fileOf(square)]}${rankOf(square) + 1}`;
}
export function parseSquare(name: string): number {
  const file = FILES.indexOf(name[0] ?? "");
  const rank = Number(name.slice(1)) - 1;
  if (name.length !== 2 || file < 0 || !(rank >= 0 && rank < 8)) throw new Error(`Not a square: ${name}`);
  return squareAt(file, rank);
}

export const PIECE_NAMES: Record<Kind, string> = { 1: "pawn", 2: "knight", 3: "bishop", 4: "rook", 5: "queen", 6: "king" };
const LETTERS: Record<Kind, string> = { 1: "P", 2: "N", 3: "B", 4: "R", 5: "Q", 6: "K" };
const FROM_LETTER: Record<string, Kind> = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };

// ── Steps ──────────────────────────────────────────────────────────────────

const KNIGHT_STEPS: Array<[number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const DIAGONALS: Array<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const LINES: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const ALL_WAYS = [...DIAGONALS, ...LINES];

/** For each square, the squares one step away in each listed direction, worked out once. */
function table(steps: Array<[number, number]>): number[][] {
  return Array.from({ length: 64 }, (_, square) =>
    steps
      .map(([df, dr]) => [fileOf(square) + df, rankOf(square) + dr] as const)
      .filter(([f, r]) => f >= 0 && f < 8 && r >= 0 && r < 8)
      .map(([f, r]) => squareAt(f, r)),
  );
}
const KNIGHT_TO = table(KNIGHT_STEPS);
const KING_TO = table(ALL_WAYS);

/** For each square and direction, the squares along the ray, nearest first. */
function rays(steps: Array<[number, number]>): number[][][] {
  return Array.from({ length: 64 }, (_, square) =>
    steps.map(([df, dr]) => {
      const out: number[] = [];
      let f = fileOf(square) + df;
      let r = rankOf(square) + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        out.push(squareAt(f, r));
        f += df;
        r += dr;
      }
      return out;
    }),
  );
}
const DIAGONAL_RAYS = rays(DIAGONALS);
const LINE_RAYS = rays(LINES);

// ── Attack ─────────────────────────────────────────────────────────────────

/** Whether `by` attacks `square` on this board. */
export function isAttacked(board: number[], square: number, by: Side): boolean {
  const s = sign(by);
  // Pawns attack diagonally forward, so a white pawn attacking `square` stands one rank below it.
  const pawnRank = rankOf(square) - s;
  if (pawnRank >= 0 && pawnRank < 8) {
    const file = fileOf(square);
    if (file > 0 && board[squareAt(file - 1, pawnRank)] === s * PAWN) return true;
    if (file < 7 && board[squareAt(file + 1, pawnRank)] === s * PAWN) return true;
  }
  for (const from of KNIGHT_TO[square]!) if (board[from] === s * KNIGHT) return true;
  for (const from of KING_TO[square]!) if (board[from] === s * KING) return true;
  for (const ray of DIAGONAL_RAYS[square]!) {
    for (const from of ray) {
      const piece = board[from]!;
      if (piece === 0) continue;
      if (piece === s * BISHOP || piece === s * QUEEN) return true;
      break;
    }
  }
  for (const ray of LINE_RAYS[square]!) {
    for (const from of ray) {
      const piece = board[from]!;
      if (piece === 0) continue;
      if (piece === s * ROOK || piece === s * QUEEN) return true;
      break;
    }
  }
  return false;
}

export function kingSquare(board: number[], side: Side): number {
  return board.indexOf(sign(side) * KING);
}

export function inCheck(position: Position, side: Side = position.turn): boolean {
  const king = kingSquare(position.board, side);
  return king >= 0 && isAttacked(position.board, king, other(side));
}

// ── Moves ──────────────────────────────────────────────────────────────────

function add(out: Move[], from: number, to: number, piece: number, captured: number, flag: MoveFlag = "normal"): void {
  out.push({ from, to, piece, captured, promotion: null, flag });
}

/** Every move by the side to move, before checking whether it leaves its own king in check. */
function pseudoMoves(position: Position, capturesOnly = false): Move[] {
  const { board, turn } = position;
  const s = sign(turn);
  const out: Move[] = [];
  for (let from = 0; from < 64; from += 1) {
    const piece = board[from]!;
    if (piece === 0 || (piece > 0 ? 1 : -1) !== s) continue;
    const kind = kindOf(piece);
    if (kind === PAWN) {
      const rank = rankOf(from);
      const file = fileOf(from);
      const lastRank = turn === "white" ? 7 : 0;
      const pushTo = from + 8 * s;
      const promoting = rankOf(pushTo) === lastRank;
      const pawnMove = (to: number, captured: number, flag: MoveFlag) => {
        if (promoting)
          for (const promotion of [QUEEN, ROOK, BISHOP, KNIGHT] as const) out.push({ from, to, piece, captured, promotion, flag });
        else add(out, from, to, piece, captured, flag);
      };
      if (board[pushTo] === 0 && (!capturesOnly || promoting)) {
        pawnMove(pushTo, 0, "normal");
        const startRank = turn === "white" ? 1 : 6;
        const doubleTo = from + 16 * s;
        if (!capturesOnly && rank === startRank && board[doubleTo] === 0) add(out, from, doubleTo, piece, 0, "double");
      }
      for (const df of [-1, 1]) {
        if (file + df < 0 || file + df > 7) continue;
        const to = pushTo + df;
        const target = board[to]!;
        if (target !== 0 && (target > 0 ? 1 : -1) !== s) pawnMove(to, target, "normal");
        else if (to === position.ep && target === 0) add(out, from, to, piece, -s * PAWN, "en-passant");
      }
      continue;
    }
    if (kind === KNIGHT || kind === KING) {
      for (const to of (kind === KNIGHT ? KNIGHT_TO : KING_TO)[from]!) {
        const target = board[to]!;
        if (target === 0) {
          if (!capturesOnly) add(out, from, to, piece, 0);
        } else if ((target > 0 ? 1 : -1) !== s) add(out, from, to, piece, target);
      }
      if (kind === KING && !capturesOnly) castles(position, from, piece, out);
      continue;
    }
    const lines = kind === ROOK || kind === QUEEN;
    const diagonals = kind === BISHOP || kind === QUEEN;
    for (const set of [diagonals ? DIAGONAL_RAYS : null, lines ? LINE_RAYS : null]) {
      if (!set) continue;
      for (const ray of set[from]!) {
        for (const to of ray) {
          const target = board[to]!;
          if (target === 0) {
            if (!capturesOnly) add(out, from, to, piece, 0);
            continue;
          }
          if ((target > 0 ? 1 : -1) !== s) add(out, from, to, piece, target);
          break;
        }
      }
    }
  }
  return out;
}

function castles(position: Position, from: number, piece: number, out: Move[]): void {
  const { board, turn, castling } = position;
  const home = turn === "white" ? 4 : 60;
  if (from !== home) return;
  const s = sign(turn);
  const them = other(turn);
  const kingSide = turn === "white" ? CASTLE_WK : CASTLE_BK;
  const queenSide = turn === "white" ? CASTLE_WQ : CASTLE_BQ;
  if (!(castling & (kingSide | queenSide)) || isAttacked(board, home, them)) return;
  if (castling & kingSide && board[home + 3] === s * ROOK && board[home + 1] === 0 && board[home + 2] === 0) {
    if (!isAttacked(board, home + 1, them) && !isAttacked(board, home + 2, them)) add(out, home, home + 2, piece, 0, "castle-king");
  }
  if (castling & queenSide && board[home - 4] === s * ROOK && board[home - 1] === 0 && board[home - 2] === 0 && board[home - 3] === 0) {
    if (!isAttacked(board, home - 1, them) && !isAttacked(board, home - 2, them)) add(out, home, home - 2, piece, 0, "castle-queen");
  }
}

/** The castling rights a move touching this square takes away: a king or rook leaving home, or a rook taken there. */
function rightsLost(square: number): number {
  switch (square) {
    case 4:
      return CASTLE_WK | CASTLE_WQ;
    case 0:
      return CASTLE_WQ;
    case 7:
      return CASTLE_WK;
    case 60:
      return CASTLE_BK | CASTLE_BQ;
    case 56:
      return CASTLE_BQ;
    case 63:
      return CASTLE_BK;
    default:
      return 0;
  }
}

/** The board after a move, with nothing else changed: for checking a move is legal. */
function boardAfter(board: number[], move: Move): number[] {
  const next = board.slice();
  next[move.from] = 0;
  next[move.to] = move.promotion ? (move.piece > 0 ? move.promotion : -move.promotion) : move.piece;
  if (move.flag === "en-passant") next[move.to - (move.piece > 0 ? 8 : -8)] = 0;
  else if (move.flag === "castle-king") {
    next[move.to - 1] = next[move.to + 1]!;
    next[move.to + 1] = 0;
  } else if (move.flag === "castle-queen") {
    next[move.to + 1] = next[move.to - 2]!;
    next[move.to - 2] = 0;
  }
  return next;
}

export function applyMove(position: Position, move: Move): Position {
  const board = boardAfter(position.board, move);
  const pawnOrCapture = kindOf(move.piece) === PAWN || move.captured !== 0;
  return {
    board,
    turn: other(position.turn),
    castling: position.castling & ~rightsLost(move.from) & ~rightsLost(move.to),
    ep: move.flag === "double" ? (move.from + move.to) / 2 : null,
    halfmove: pawnOrCapture ? 0 : position.halfmove + 1,
    fullmove: position.fullmove + (position.turn === "black" ? 1 : 0),
  };
}

function leavesKingSafe(position: Position, move: Move): boolean {
  const board = boardAfter(position.board, move);
  const king = kindOf(move.piece) === KING ? move.to : kingSquare(board, position.turn);
  return !isAttacked(board, king, other(position.turn));
}

/** Every legal move for the side to move. */
export function legalMoves(position: Position): Move[] {
  return pseudoMoves(position).filter((move) => leavesKingSafe(position, move));
}

/** The legal captures and promotions, for the computer's look past the end of its search. */
export function legalCaptures(position: Position): Move[] {
  return pseudoMoves(position, true).filter((move) => leavesKingSafe(position, move));
}

export function hasLegalMove(position: Position): boolean {
  return pseudoMoves(position).some((move) => leavesKingSafe(position, move));
}

/** Leaf nodes at `depth`, the standard check of a move generator against published counts. */
export function perft(position: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(position);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const move of moves) total += perft(applyMove(position, move), depth - 1);
  return total;
}

// ── Notation ───────────────────────────────────────────────────────────────

/** "e2e4", "e7e8q": the long form the game is kept in. */
export function moveCode(move: Move): string {
  return `${squareName(move.from)}${squareName(move.to)}${move.promotion ? "nbrq"[move.promotion - 2] : ""}`;
}

export function findMove(position: Position, code: string): Move | null {
  return legalMoves(position).find((move) => moveCode(move) === code) ?? null;
}

/** Standard algebraic notation: "Nf3", "exd5", "O-O", "e8=Q+", "Qxf7#". */
export function san(position: Position, move: Move, legal: Move[] = legalMoves(position)): string {
  let text: string;
  if (move.flag === "castle-king") text = "O-O";
  else if (move.flag === "castle-queen") text = "O-O-O";
  else {
    const kind = kindOf(move.piece);
    const takes = move.captured !== 0 ? "x" : "";
    if (kind === PAWN) {
      text = `${takes ? FILES[fileOf(move.from)] : ""}${takes}${squareName(move.to)}${move.promotion ? `=${LETTERS[move.promotion]}` : ""}`;
    } else {
      const rivals = legal.filter((other) => other.piece === move.piece && other.to === move.to && other.from !== move.from);
      let from = "";
      if (rivals.length > 0) {
        if (!rivals.some((other) => fileOf(other.from) === fileOf(move.from))) from = FILES[fileOf(move.from)]!;
        else if (!rivals.some((other) => rankOf(other.from) === rankOf(move.from))) from = String(rankOf(move.from) + 1);
        else from = squareName(move.from);
      }
      text = `${LETTERS[kind]}${from}${takes}${squareName(move.to)}`;
    }
  }
  const after = applyMove(position, move);
  if (inCheck(after)) text += hasLegalMove(after) ? "+" : "#";
  return text;
}

/**
 * The legal move a piece of notation names: standard algebraic ("Nf3", "exd5", "e8=Q",
 * "O-O", "0-0"), with or without the check marks and annotations people add ("Nf3+!?"),
 * or the long form ("g1f3", "e7e8q"). Null when it names no legal move or more than one.
 */
export function parseMove(position: Position, text: string): Move | null {
  const legal = legalMoves(position);
  const clean = text
    .trim()
    .replace(/[+#!?]+$/g, "")
    .replace(/0/g, "O")
    .replace(/e\.?p\.?$/i, "");
  const long = /^[KQRBN]?([a-h][1-8])[-x]?([a-h][1-8])=?([nbrqNBRQ])?$/.exec(clean);
  if (long) {
    const code = `${long[1]}${long[2]}${(long[3] ?? "").toLowerCase()}`;
    const found = legal.find((move) => moveCode(move) === code);
    if (found) return found;
  }
  const bare = (value: string) => value.replace(/[+#]/g, "").replace(/=/g, "");
  const wanted = bare(clean);
  const matches = legal.filter((move) => bare(san(position, move, legal)) === wanted);
  if (matches.length === 1) return matches[0]!;
  // A promotion written without its piece ("e8") is a queen, as most programs read it.
  const queen = legal.filter((move) => move.promotion === QUEEN && bare(san(position, move, legal)) === `${wanted}Q`);
  return queen.length === 1 ? queen[0]! : null;
}

// ── FEN ────────────────────────────────────────────────────────────────────

export class NotationError extends Error {}

export function toFen(position: Position): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = "";
    let gap = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = position.board[squareAt(file, rank)]!;
      if (piece === 0) {
        gap += 1;
        continue;
      }
      if (gap) row += gap;
      gap = 0;
      const letter = LETTERS[kindOf(piece)];
      row += piece > 0 ? letter : letter.toLowerCase();
    }
    rows.push(row + (gap ? gap : ""));
  }
  const rights =
    [
      [CASTLE_WK, "K"],
      [CASTLE_WQ, "Q"],
      [CASTLE_BK, "k"],
      [CASTLE_BQ, "q"],
    ]
      .filter(([bit]) => position.castling & (bit as number))
      .map(([, letter]) => letter)
      .join("") || "-";
  const ep = position.ep === null ? "-" : squareName(position.ep);
  return `${rows.join("/")} ${position.turn === "white" ? "w" : "b"} ${rights} ${ep} ${position.halfmove} ${position.fullmove}`;
}

/**
 * A position from Forsyth–Edwards Notation. The move counters may be left off. A
 * castling right the board cannot have (its king or rook is not at home) and an en
 * passant square no pawn could have passed are dropped; anything that is not a legal
 * position is refused, saying why.
 */
export function parseFen(text: string): Position {
  const fields = text.trim().split(/\s+/);
  if (fields.length < 2 || fields.length > 6)
    throw new NotationError("A FEN has six parts separated by spaces: the board, who is to move, castling, en passant and two counts.");
  const [placement, turnText, rightsText = "-", epText = "-", halfText = "0", fullText = "1"] = fields as [string, string, ...string[]];
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new NotationError("The board in a FEN has eight rows, separated by /.");
  const board: number[] = Array.from({ length: 64 }, () => 0);
  ranks.forEach((row, index) => {
    const rank = 7 - index;
    let file = 0;
    for (const char of row) {
      if (/[1-8]/.test(char)) file += Number(char);
      else {
        const kind = FROM_LETTER[char.toUpperCase()];
        if (!kind) throw new NotationError(`"${char}" is not a piece. Pieces are written K, Q, R, B, N and P, lower case for black.`);
        if (file > 7) {
          file = 9;
          break;
        }
        board[squareAt(file, rank)] = char === char.toUpperCase() ? kind : -kind;
        file += 1;
      }
    }
    if (file !== 8) throw new NotationError(`Row ${rank + 1} of the board does not fill eight squares.`);
  });
  if (turnText !== "w" && turnText !== "b") throw new NotationError("Who is to move is written w for white or b for black.");
  if (!/^(-|[KQkq]{1,4})$/.test(rightsText)) throw new NotationError("Castling is written as some of KQkq, or - for none.");
  for (const side of ["white", "black"] as const) {
    const kings = board.filter((piece) => piece === sign(side) * KING).length;
    if (kings !== 1) throw new NotationError(`There must be one ${side} king; this board has ${kings}.`);
  }
  for (let file = 0; file < 8; file += 1) {
    if (Math.abs(board[file]!) === PAWN || Math.abs(board[56 + file]!) === PAWN)
      throw new NotationError("A pawn cannot stand on the first or last row.");
  }
  let castling = 0;
  if (rightsText.includes("K") && board[4] === KING && board[7] === ROOK) castling |= CASTLE_WK;
  if (rightsText.includes("Q") && board[4] === KING && board[0] === ROOK) castling |= CASTLE_WQ;
  if (rightsText.includes("k") && board[60] === -KING && board[63] === -ROOK) castling |= CASTLE_BK;
  if (rightsText.includes("q") && board[60] === -KING && board[56] === -ROOK) castling |= CASTLE_BQ;
  const turn: Side = turnText === "w" ? "white" : "black";
  let ep: number | null = null;
  if (epText !== "-") {
    if (!/^[a-h][36]$/.test(epText)) throw new NotationError("The en passant square is on row 3 or 6, or - for none.");
    const square = parseSquare(epText);
    // The pawn that passed it must stand just beyond it, with both squares behind it empty.
    const s = turn === "white" ? -1 : 1;
    const expectRank = turn === "white" ? 5 : 2;
    if (rankOf(square) === expectRank && board[square + 8 * s] === s * PAWN && board[square] === 0 && board[square - 8 * s] === 0)
      ep = square;
  }
  const halfmove = Number(halfText);
  const fullmove = Number(fullText);
  if (!Number.isInteger(halfmove) || halfmove < 0 || !Number.isInteger(fullmove) || fullmove < 1)
    throw new NotationError("The last two parts of a FEN are whole numbers: moves since a capture or pawn move, and the move number.");
  const position: Position = { board, turn, castling, ep, halfmove, fullmove };
  if (inCheck(position, other(turn))) throw new NotationError("The side not to move is in check, which cannot happen in a game.");
  return position;
}

export function startPosition(): Position {
  return parseFen(START_FEN);
}

/** What makes two positions the same for repetition: the pieces, who is to move, castling, and en passant only if it can be taken. */
export function repetitionKey(position: Position): string {
  const epUsable = position.ep !== null && legalMoves(position).some((move) => move.flag === "en-passant");
  const fen = toFen({ ...position, ep: epUsable ? position.ep : null });
  return fen.split(" ").slice(0, 4).join(" ");
}

// ── Endings ────────────────────────────────────────────────────────────────

export type DrawReason = "stalemate" | "repetition" | "fifty-moves" | "material" | "agreed";
export type Outcome = { kind: "playing" } | { kind: "won"; winner: Side } | { kind: "draw"; reason: DrawReason };

/**
 * Neither side can mate by any series of legal moves: king against king, a king and one
 * bishop or knight against a king, or only bishops beside the kings, all on squares of
 * one colour.
 */
export function insufficientMaterial(board: number[]): boolean {
  const others: Array<{ kind: Kind; square: number }> = [];
  for (let square = 0; square < 64; square += 1) {
    const piece = board[square]!;
    if (piece !== 0 && kindOf(piece) !== KING) others.push({ kind: kindOf(piece), square });
  }
  if (others.length === 0) return true;
  if (others.length === 1 && (others[0]!.kind === KNIGHT || others[0]!.kind === BISHOP)) return true;
  if (others.every((piece) => piece.kind === BISHOP)) {
    const colour = (square: number) => (fileOf(square) + rankOf(square)) % 2;
    return others.every((piece) => colour(piece.square) === colour(others[0]!.square));
  }
  return false;
}

/** The outcome in `position`, given how many times this position has now been reached (1 if it is new). */
export function outcomeOf(position: Position, seen = 1): Outcome {
  if (!hasLegalMove(position))
    return inCheck(position) ? { kind: "won", winner: other(position.turn) } : { kind: "draw", reason: "stalemate" };
  if (insufficientMaterial(position.board)) return { kind: "draw", reason: "material" };
  if (seen >= 3) return { kind: "draw", reason: "repetition" };
  if (position.halfmove >= 100) return { kind: "draw", reason: "fifty-moves" };
  return { kind: "playing" };
}

export interface Replayed {
  start: Position;
  position: Position;
  moves: Move[];
  /** Each move in standard notation. */
  sans: string[];
  /** Positions in order, from the start (one more than the moves). */
  positions: Position[];
  outcome: Outcome;
}

/** Replays moves kept in the long form from a start, or returns null if one is not legal or comes after the end. */
export function replay(codes: readonly string[], startFen: string = START_FEN): Replayed | null {
  let position: Position;
  try {
    position = parseFen(startFen);
  } catch {
    return null;
  }
  const start = position;
  const positions = [position];
  const moves: Move[] = [];
  const sans: string[] = [];
  const counts = new Map<string, number>([[repetitionKey(position), 1]]);
  let outcome = outcomeOf(position);
  for (const code of codes) {
    if (outcome.kind !== "playing") return null;
    const legal = legalMoves(position);
    const move = legal.find((candidate) => moveCode(candidate) === code);
    if (!move) return null;
    sans.push(san(position, move, legal));
    moves.push(move);
    position = applyMove(position, move);
    positions.push(position);
    const key = repetitionKey(position);
    const seen = (counts.get(key) ?? 0) + 1;
    counts.set(key, seen);
    outcome = outcomeOf(position, seen);
  }
  return { start, position, moves, sans, positions, outcome };
}

/** "1. e4 e5 2. Nf3", or "12... Nf6 13. Bd3" from a position with black to move. */
export function moveListText(sans: readonly string[], start: Position): string {
  const parts: string[] = [];
  let number = start.fullmove;
  let white = start.turn === "white";
  sans.forEach((text, index) => {
    if (white) parts.push(`${number}.`);
    else if (index === 0) parts.push(`${number}...`);
    parts.push(text);
    if (!white) number += 1;
    white = !white;
  });
  return parts.join(" ");
}
