/**
 * The rules of chess as the engine plays them: the move generator counted against the
 * published perft results, then each rule on its own (castling and its conditions, en
 * passant, promotion, check, checkmate, stalemate and each draw), the notation, and FEN.
 */
import { describe, expect, it } from "vitest";
import {
  applyMove,
  findMove,
  insufficientMaterial,
  legalMoves,
  type Move,
  moveCode,
  moveListText,
  outcomeOf,
  type Position,
  parseFen,
  parseMove,
  perft,
  replay,
  START_FEN,
  san,
  startPosition,
  toFen,
} from "./engine";

const codes = (position: Position) => legalMoves(position).map(moveCode).sort();
const play = (position: Position, code: string): Position => {
  const move = findMove(position, code);
  if (!move) throw new Error(`${code} is not legal in ${toFen(position)}`);
  return applyMove(position, move);
};
const sanOf = (fen: string, code: string) => {
  const position = parseFen(fen);
  return san(position, findMove(position, code) as Move);
};

/*
 * The counts published on the Chess Programming Wiki, "Perft Results"
 * (https://www.chessprogramming.org/Perft_Results, read 21 November 2026), to the depths
 * that run in a few seconds.
 */
const PERFT: Array<{ name: string; fen: string; counts: number[] }> = [
  { name: "the initial position", fen: START_FEN, counts: [20, 400, 8902, 197281] },
  {
    name: "position 2 (Kiwipete)",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    counts: [48, 2039, 97862, 4085603],
  },
  { name: "position 3", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", counts: [14, 191, 2812, 43238, 674624] },
  { name: "position 4", fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", counts: [6, 264, 9467, 422333] },
  { name: "position 5", fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", counts: [44, 1486, 62379, 2103487] },
  { name: "position 6", fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", counts: [46, 2079, 89890] },
];

describe("the move generator, counted against the published perft results", () => {
  for (const { name, fen, counts } of PERFT) {
    it(`matches ${name} to depth ${counts.length}`, () => {
      const position = parseFen(fen);
      expect(counts.map((_, index) => perft(position, index + 1))).toEqual(counts);
    }, 30_000);
  }
});

describe("castling", () => {
  const open = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";

  it("is allowed on both sides when nothing stands between and nothing attacks", () => {
    expect(codes(parseFen(open))).toEqual(expect.arrayContaining(["e1g1", "e1c1"]));
    const after = play(parseFen(open), "e1g1");
    expect(after.board[6]).toBe(6);
    expect(after.board[5]).toBe(4);
    expect(after.board[7]).toBe(0);
    expect(toFen(after).split(" ")[2]).toBe("kq");
    const long = play(parseFen(open), "e1c1");
    expect(long.board[2]).toBe(6);
    expect(long.board[3]).toBe(4);
    expect(long.board[0]).toBe(0);
  });

  it("is lost for good once the king or that rook has moved, or the rook is taken", () => {
    let position = play(play(parseFen(open), "h1h2"), "a8a7");
    position = play(play(position, "h2h1"), "a7a8");
    expect(codes(position)).not.toContain("e1g1");
    expect(codes(position)).toContain("e1c1");
    expect(toFen(position).split(" ")[2]).toBe("Qk");
    const taken = play(parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "a1a8");
    expect(toFen(taken).split(" ")[2]).toBe("Kk");
  });

  it("is not allowed out of check, through an attacked square, onto one, or with a piece between", () => {
    expect(codes(parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"))).toContain("e1g1");
    expect(codes(parseFen("4k3/8/8/8/8/8/8/R3K2r w Q - 0 1"))).not.toContain("e1c1"); // in check from h1
    expect(codes(parseFen("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1"))).not.toContain("e1g1"); // f1 attacked
    expect(codes(parseFen("4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1"))).not.toContain("e1g1"); // g1 attacked
    expect(codes(parseFen("4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1"))).not.toContain("e1c1"); // b1 occupied
    // On the queen's side only the king's squares must be safe: b1 may be attacked.
    expect(codes(parseFen("4k3/8/8/8/8/8/1r6/R3K2R w KQ - 0 1"))).toContain("e1c1");
  });
});

describe("en passant", () => {
  it("takes a pawn that has just made a double step, on the next move only", () => {
    let position = parseFen("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1");
    position = play(position, "d7d5");
    expect(toFen(position).split(" ")[3]).toBe("d6");
    expect(codes(position)).toContain("e5d6");
    const taken = play(position, "e5d6");
    expect(taken.board[35]).toBe(0);
    expect(taken.board[43]).toBe(1);
    // Not on a later move.
    const later = play(play(position, "e1d1"), "e8d8");
    expect(codes(later)).not.toContain("e5d6");
  });

  it("is not allowed when it would leave the king in check along the rank", () => {
    const position = parseFen("8/8/8/K2pP2r/8/8/8/7k w - d6 0 1");
    expect(codes(position)).not.toContain("e5d6");
  });
});

describe("promotion", () => {
  it("offers a queen, rook, bishop or knight, and puts that piece on the square", () => {
    const position = parseFen("8/4P3/8/8/8/8/8/k6K w - - 0 1");
    expect(codes(position).filter((code) => code.startsWith("e7e8"))).toEqual(["e7e8b", "e7e8n", "e7e8q", "e7e8r"]);
    expect(play(position, "e7e8n").board[60]).toBe(2);
    expect(sanOf("8/4P3/8/8/8/8/8/k6K w - - 0 1", "e7e8q")).toBe("e8=Q");
    expect(sanOf("3r3k/4P3/8/8/8/8/8/7K w - - 0 1", "e7d8r")).toBe("exd8=R+");
  });
});

describe("check and the end of the game", () => {
  it("allows no move that leaves the king in check", () => {
    const pinned = parseFen("4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1");
    expect(codes(pinned).some((code) => code.startsWith("e2"))).toBe(false);
  });

  it("ends in checkmate (the fool's mate)", () => {
    const game = replay(["f2f3", "e7e5", "g2g4", "d8h4"])!;
    expect(game.sans).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(game.outcome).toEqual({ kind: "won", winner: "black" });
  });

  it("ends in stalemate when the side to move has no move and is not in check", () => {
    expect(outcomeOf(parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toEqual({ kind: "draw", reason: "stalemate" });
  });

  it("is drawn by threefold repetition", () => {
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    const twice = replay([...shuffle, ...shuffle.slice(0, 3)])!;
    expect(twice.outcome.kind).toBe("playing");
    const thrice = replay([...shuffle, ...shuffle])!;
    expect(thrice.outcome).toEqual({ kind: "draw", reason: "repetition" });
    expect(replay([...shuffle, ...shuffle, "e2e4"])).toBeNull();
  });

  it("is drawn after 50 moves each with no capture and no pawn moved", () => {
    expect(outcomeOf(parseFen("4k3/8/8/8/8/8/R7/4K3 w - - 99 80")).kind).toBe("playing");
    const after = play(parseFen("4k3/8/8/8/8/8/R7/4K3 w - - 99 80"), "a2b2");
    expect(outcomeOf(after)).toEqual({ kind: "draw", reason: "fifty-moves" });
  });

  it("checkmate on the fiftieth move is still checkmate", () => {
    const mated = play(parseFen("7k/8/6K1/8/8/8/8/R7 w - - 99 80"), "a1a8");
    expect(outcomeOf(mated)).toEqual({ kind: "won", winner: "white" });
  });

  it("is drawn when neither side has the material to mate", () => {
    expect(insufficientMaterial(parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1").board)).toBe(true);
    expect(insufficientMaterial(parseFen("4k3/8/8/8/8/8/8/2N1K3 w - - 0 1").board)).toBe(true);
    expect(insufficientMaterial(parseFen("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1").board)).toBe(true);
    // Bishops all on squares of one colour.
    expect(insufficientMaterial(parseFen("4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1").board)).toBe(true);
    expect(insufficientMaterial(parseFen("4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1").board)).toBe(false);
    expect(insufficientMaterial(parseFen("4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1").board)).toBe(false);
    expect(insufficientMaterial(parseFen("4k3/8/8/8/8/8/P7/4K3 w - - 0 1").board)).toBe(false);
    expect(outcomeOf(parseFen("4k3/8/8/8/8/8/8/2N1K3 w - - 0 1"))).toEqual({ kind: "draw", reason: "material" });
  });
});

describe("notation", () => {
  it("names moves in standard algebraic notation, telling apart two pieces that could go", () => {
    expect(sanOf(START_FEN, "g1f3")).toBe("Nf3");
    expect(sanOf("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1g1")).toBe("O-O");
    expect(sanOf("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1c1")).toBe("O-O-O");
    expect(sanOf("4k3/8/8/8/8/8/4K3/R6R w - - 0 1", "a1d1")).toBe("Rad1");
    expect(sanOf("4k3/8/8/8/R7/8/8/R3K3 w - - 0 1", "a1a2")).toBe("R1a2");
    expect(sanOf("k7/8/8/8/8/2Q1Q3/8/2Q1K3 w - - 0 1", "c3d2")).toBe("Qc3d2");
    expect(sanOf("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", "e4d5")).toBe("exd5");
  });

  it("reads moves as people write them", () => {
    const start = startPosition();
    expect(moveCode(parseMove(start, "Nf3")!)).toBe("g1f3");
    expect(moveCode(parseMove(start, "e4!?")!)).toBe("e2e4");
    expect(moveCode(parseMove(start, "g1f3")!)).toBe("g1f3");
    expect(moveCode(parseMove(start, "Ng1-f3")!)).toBe("g1f3");
    expect(parseMove(start, "Nf4")).toBeNull();
    expect(moveCode(parseMove(parseFen("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"), "0-0")!)).toBe("e1g1");
    expect(moveCode(parseMove(parseFen("8/4P3/8/8/8/8/8/k6K w - - 0 1"), "e8N")!)).toBe("e7e8n");
    expect(moveCode(parseMove(parseFen("8/4P3/8/8/8/8/8/k6K w - - 0 1"), "e8")!)).toBe("e7e8q");
  });

  it("numbers a list of moves, from a position with either side to move", () => {
    const game = replay(["e2e4", "e7e5", "g1f3"])!;
    expect(moveListText(game.sans, game.start)).toBe("1. e4 e5 2. Nf3");
    const fromBlack = replay(["g8f6", "d2d4"], "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1")!;
    expect(moveListText(fromBlack.sans, fromBlack.start)).toBe("1... Nf6 2. d4");
  });
});

describe("FEN", () => {
  it("writes the start and positions after moves exactly", () => {
    expect(toFen(startPosition())).toBe(START_FEN);
    expect(toFen(replay(["e2e4"])!.position)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
    expect(toFen(replay(["e2e4", "c7c5", "g1f3"])!.position)).toBe("rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2");
  });

  it("reads one back with the counts left off, and drops rights the board cannot have", () => {
    expect(toFen(parseFen("4k3/8/8/8/8/8/8/4K2R w KQkq -"))).toBe("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
  });

  it("refuses what is not a legal position, saying why", () => {
    expect(() => parseFen("hello")).toThrow(/six parts/);
    expect(() => parseFen("8/8/8/8/8/8/8/8 w - - 0 1")).toThrow(/one white king/);
    expect(() => parseFen("4k3/8/8/8/8/8/8/4K3/8 w - - 0 1")).toThrow(/eight rows/);
    expect(() => parseFen("4k3/8/8/8/8/8/8/4K4 w - - 0 1")).toThrow(/eight squares/);
    expect(() => parseFen("P3k3/8/8/8/8/8/8/4K3 w - - 0 1")).toThrow(/first or last row/);
    expect(() => parseFen("4k2R/8/8/8/8/8/8/4K3 w - - 0 1")).toThrow(/not to move is in check/);
    expect(() => parseFen("4k3/8/8/8/8/8/8/4K3 x - - 0 1")).toThrow(/w for white/);
  });
});
