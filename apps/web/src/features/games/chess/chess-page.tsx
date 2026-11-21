/**
 * Chess against the computer or with two people at one device. The game in progress is
 * kept in this browser (where it started, its seed and its moves); a finished game, or
 * one given up by starting another, is added to the household's tally on the server. A
 * game can be copied out as PGN, a position as FEN, and either pasted back in.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { usePageVisible } from "@/lib/page-visible";
import { plural } from "@/lib/utils";
import { FOLLOWED_WORDS, readDeviceSave, useDeviceSave } from "../kit/device-save";
import { GameAbout, GameFrame } from "../kit/frame";
import { usePlayTime } from "../kit/play-time";
import { useRecordResult } from "../kit/queries";
import { newSeed } from "../kit/rng";
import { GameTallyLine, gameTime } from "../kit/tally";
import { LEVEL_PLAY, type Level, moveSeed } from "./ai";
import { Board, PieceImage } from "./board";
import { think } from "./computer";
import {
  inCheck,
  KING,
  kindOf,
  legalMoves,
  type Move,
  moveCode,
  NotationError,
  other,
  PIECE_NAMES,
  type PromotionKind,
  type Side,
  sideOf,
  squareName,
  toFen,
} from "./engine";
import { type Game, humanMoves, isGame, type Mode, moverOf, newGame, play, readPasted, SAVE_KEY, toPgn, undoTurn } from "./game";

const REPLY_PAUSE_MS = 450;

const sideName = (side: Side) => (side === "white" ? "White" : "Black");

export const LEVEL_LABELS: Record<Level, string> = { learner: "Learner", easy: "Easy", medium: "Medium", hard: "Hard" };

function seedFrom(params: URLSearchParams): number | null {
  const text = params.get("seed");
  if (text === null || !/^\d+$/.test(text)) return null;
  const seed = Number(text);
  return seed >= 1 && seed <= 0xffffffff ? seed : null;
}

function initialGame(seeded: number | null): Game {
  const saved = readDeviceSave(SAVE_KEY, isGame);
  if (seeded !== null) return newGame(seeded, saved?.mode ?? "computer", saved?.human ?? "white", saved?.level ?? "easy");
  return saved ?? newGame(newSeed(), "computer", "white", "easy");
}

/** A move in words, for the live region: "Knight from g1 to f3, taking the pawn". */
function moveWords(move: Move): string {
  if (move.flag === "castle-king") return "Castled on the king's side";
  if (move.flag === "castle-queen") return "Castled on the queen's side";
  const name = PIECE_NAMES[kindOf(move.piece)];
  const taking = move.captured
    ? `, taking the ${PIECE_NAMES[kindOf(move.captured)]}${move.flag === "en-passant" ? " en passant" : ""}`
    : "";
  const promoted = move.promotion ? `, and became a ${PIECE_NAMES[move.promotion]}` : "";
  return `${name[0]!.toUpperCase()}${name.slice(1)} from ${squareName(move.from)} to ${squareName(move.to)}${taking}${promoted}`;
}

const DRAW_WORDS = {
  stalemate: "A draw by stalemate: the side to move has no legal move and is not in check.",
  repetition: "A draw: the same position has come up three times.",
  "fifty-moves": "A draw: 50 moves each with no capture and no pawn moved.",
  material: "A draw: neither side has enough pieces left to checkmate.",
  agreed: "A draw, agreed by both players.",
} as const;

export default function ChessPage() {
  const [params, setParams] = useSearchParams();
  const [game, setGame] = useState<Game>(() => initialGame(seedFrom(params)));
  const [picked, setPicked] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [spoken, setSpoken] = useState("");
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null);
  const [asking, setAsking] = useState<null | { kind: "new"; mode: Mode; human: Side; level: Level } | { kind: "draw" }>(null);
  const [carrying, setCarrying] = useState<null | "out" | "in">(null);
  const record = useRecordResult("chess");

  useEffect(() => {
    if (params.has("seed")) setParams({}, { replace: true });
  }, [params, setParams]);

  const played = useMemo(() => play(game), [game]);
  const { position, moves, sans, outcome } = played;
  const over = outcome.kind !== "playing";

  const time = usePlayTime(game.moves.length > 0 && !over);
  useDeviceSave(
    SAVE_KEY,
    game,
    (current) => (current.recorded || current.moves.length === 0 ? current : { ...current, seconds: (current.seconds ?? 0) + time.peek() }),
    {
      accept: isGame,
      onFollow: (other) => {
        time.lap();
        setGame(other);
        setPicked(null);
        setPromoting(null);
        setNotice(FOLLOWED_WORDS);
      },
    },
  );
  const vsComputer = game.mode === "computer";
  const computerSide = other(game.human);
  const computerToMove = vsComputer && !over && position.turn === computerSide;
  const personToMove = !over && !computerToMove;
  const legal = useMemo(() => (personToMove ? legalMoves(position) : []), [personToMove, position]);
  const targets = useMemo(
    () => new Set(picked === null ? [] : legal.filter((move) => move.from === picked).map((move) => move.to)),
    [legal, picked],
  );
  const lastMove = moves.length > 0 ? moves[moves.length - 1]! : null;
  const checked =
    !over || outcome.kind === "won" ? (inCheck(position) ? position.board.indexOf(position.turn === "white" ? KING : -KING) : null) : null;

  // ── Ending ──
  const sent = useRef(new Set<number>());
  const { mutate: sendResult } = record;
  const finish = useCallback(
    (ended: Game, won: boolean): Game => {
      if (ended.recorded) return ended;
      const seconds = Math.min(86_400, Math.round((ended.seconds ?? 0) + time.lap()));
      if (!sent.current.has(ended.seed)) {
        sent.current.add(ended.seed);
        sendResult({
          variant: ended.mode === "two-player" ? "two-player" : ended.level,
          won,
          ...(won ? { seconds, moves: Math.max(1, humanMoves(ended)) } : {}),
        });
      }
      return { ...ended, recorded: true, seconds };
    },
    [sendResult, time],
  );

  useEffect(() => {
    if (!over || game.recorded) return;
    const won = outcome.kind === "won" && (game.mode === "two-player" || outcome.winner === game.human);
    setGame(finish(game, won));
  }, [over, outcome, game, finish]);

  // ── Moves ──
  const commit = useCallback(
    (move: Move) => {
      const lap = time.lap();
      setGame((current) => ({
        ...current,
        moves: [...current.moves, moveCode(move)],
        startedAt: current.startedAt ?? Date.now(),
        seconds: (current.seconds ?? 0) + lap,
      }));
      setPicked(null);
      setPromoting(null);
      setNotice("");
    },
    [time],
  );

  const lastSpoken = useRef(game.moves.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: said once per new move, from the state then in view
  useEffect(() => {
    if (moves.length <= lastSpoken.current) {
      lastSpoken.current = moves.length;
      return;
    }
    lastSpoken.current = moves.length;
    const move = moves[moves.length - 1]!;
    const mover = moverOf(game, moves.length - 1);
    const who = vsComputer ? (mover === game.human ? "You" : "The computer") : sideName(mover);
    setSpoken(`${who}: ${moveWords(move)}. ${turnWords()}`);
  }, [moves.length]);

  // ── The computer ──
  const visible = usePageVisible();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the search starts afresh when the position changes, and only then
  useEffect(() => {
    if (!computerToMove || !visible) return;
    let live = true;
    const asked = Date.now();
    const thinking = think(position, moveSeed(game.seed, moves.length), game.level);
    let waited: ReturnType<typeof setTimeout> | undefined;
    thinking.move.then((code) => {
      if (!code || !live) return;
      const move = legalMoves(position).find((candidate) => moveCode(candidate) === code);
      if (!move) return;
      waited = setTimeout(() => commit(move), Math.max(0, REPLY_PAUSE_MS - (Date.now() - asked)));
    });
    return () => {
      live = false;
      thinking.cancel();
      if (waited) clearTimeout(waited);
    };
  }, [computerToMove, position, visible]);

  // ── Taps ──
  const ownSide = position.turn;
  const onSquare = (square: number) => {
    if (!personToMove) {
      if (computerToMove) setNotice("The computer is thinking. It is your move again in a moment.");
      return;
    }
    const piece = position.board[square]!;
    if (picked !== null && targets.has(square)) {
      const choices = legal.filter((move) => move.from === picked && move.to === square);
      if (choices.length > 1) setPromoting({ from: picked, to: square });
      else commit(choices[0]!);
      return;
    }
    if (piece !== 0 && sideOf(piece) === ownSide) {
      if (picked === square) {
        setPicked(null);
        setNotice("");
        return;
      }
      const name = PIECE_NAMES[kindOf(piece)];
      if (legal.some((move) => move.from === square)) {
        setPicked(square);
        setNotice("");
      } else {
        setPicked(null);
        setNotice(
          inCheck(position)
            ? `Your king is in check, and the ${name} on ${squareName(square)} cannot get it out.`
            : `The ${name} on ${squareName(square)} has no legal move.`,
        );
      }
      return;
    }
    if (picked !== null) {
      const name = PIECE_NAMES[kindOf(position.board[picked]!)];
      setNotice(
        inCheck(position)
          ? `Your king is in check: the ${name} on ${squareName(picked)} cannot go to ${squareName(square)}, as that would not end it.`
          : `The ${name} on ${squareName(picked)} cannot go to ${squareName(square)}.`,
      );
      return;
    }
    if (piece !== 0)
      setNotice(
        vsComputer
          ? "That is the computer's piece. Pick one of yours."
          : `That is ${other(ownSide)}'s piece. ${sideName(ownSide)} is to move.`,
      );
  };
  const cancel = () => {
    setPicked(null);
    setNotice("");
  };

  const label = (square: number) => {
    const piece = position.board[square]!;
    const parts = [squareName(square)];
    if (piece === 0) parts.push("empty");
    else {
      const side = sideOf(piece)!;
      const owner = vsComputer ? (side === game.human ? "your" : "computer's") : side;
      parts.push(`${owner} ${PIECE_NAMES[kindOf(piece)]}`);
    }
    if (checked === square) parts.push("in check");
    if (picked === square) parts.push("picked");
    if (targets.has(square)) parts.push(piece !== 0 ? "you can take here" : "you can move here");
    if (lastMove && picked === null) {
      if (lastMove.to === square) parts.push(`just moved here from ${squareName(lastMove.from)}`);
      else if (lastMove.from === square) parts.push("last move came from here");
    }
    return parts.join(", ");
  };

  // ── New game, undo, draw, carry ──
  const startNew = (mode: Mode, human: Side, level: Level, givenUp: boolean) => {
    if (givenUp) finish(game, false);
    setGame(newGame(newSeed(), mode, human, level));
    setPicked(null);
    setPromoting(null);
    setNotice("");
    setSpoken(mode === "computer" ? `New game. You play ${human}.` : "New game. White moves first.");
  };
  const madeMoves = humanMoves(game) > 0;
  const requestNew = (mode: Mode = game.mode, human: Side = game.human, level: Level = game.level) => {
    if (madeMoves && !over) setAsking({ kind: "new", mode, human, level });
    else startNew(mode, human, level, false);
  };
  const canUndo = !over && undoTurn(game).length < game.moves.length;
  const undo = () => {
    setGame((current) => ({ ...current, moves: undoTurn(current) }));
    setPicked(null);
    setPromoting(null);
    setNotice("");
    setSpoken(vsComputer ? "Your last move and the reply were taken back." : "The last move was taken back.");
  };
  const agreeDraw = () => {
    setGame(finish({ ...game, agreed: true }, false));
    setAsking(null);
    setPicked(null);
  };
  const loadPasted = (start: string, codes: string[]) => {
    if (madeMoves && !over) finish(game, false);
    const next: Game = { ...newGame(newSeed(), game.mode, game.human, game.level, start), moves: codes };
    // A game pasted in already finished is shown, not counted.
    const finished = play(next).outcome.kind !== "playing";
    setGame({ ...next, recorded: finished, startedAt: codes.length > 0 ? Date.now() : null });
    setPicked(null);
    setPromoting(null);
    setCarrying(null);
    setNotice(finished ? "The game pasted in is already over. Start a new game to play on." : "");
    setSpoken(`The game was read in: ${plural(codes.length, "move")}.`);
  };

  // ── Words ──
  function turnWords(): string {
    if (outcome.kind === "won") {
      const tail = game.seconds !== null ? ` ${plural(humanMoves(game), "move")} in ${gameTime(game.seconds)}.` : "";
      if (vsComputer) return outcome.winner === game.human ? `Checkmate. You won.${tail}` : "Checkmate. The computer won.";
      return `Checkmate. ${sideName(outcome.winner)} won.${tail}`;
    }
    if (outcome.kind === "draw") return DRAW_WORDS[outcome.reason];
    const check = inCheck(position) ? "Check. " : "";
    if (computerToMove) return `${check}The computer is thinking…`;
    if (vsComputer) {
      if (moves.length === 0 && position.turn === game.human)
        return `You play ${game.human}${game.human === "white" ? " and move first" : ""}.`;
      return `${check}Your move. You play ${game.human}.`;
    }
    return `${check}${sideName(position.turn)} to move.`;
  }

  const baseFlipped = vsComputer && game.human === "black";
  const flipped = baseFlipped !== game.turned;
  const variant = vsComputer ? game.level : "two-player";
  const variantLabel = vsComputer ? `Against the computer, ${LEVEL_LABELS[game.level].toLowerCase()}` : "Two players";
  const pairs: Array<{ number: number; white: string | null; black: string | null }> = [];
  {
    let number = played.start.fullmove;
    let index = 0;
    if (played.start.turn === "black" && sans.length > 0) {
      pairs.push({ number, white: null, black: sans[0]! });
      number += 1;
      index = 1;
    }
    for (; index < sans.length; index += 2) {
      pairs.push({ number, white: sans[index]!, black: sans[index + 1] ?? null });
      number += 1;
    }
  }

  return (
    <GameFrame
      title="Chess"
      actions={
        <>
          <Button onClick={undo} disabled={!canUndo}>
            Undo
          </Button>
          {!vsComputer && !over && moves.length > 0 ? (
            <Button variant="ghost" onClick={() => setAsking({ kind: "draw" })}>
              Agree a draw
            </Button>
          ) : null}
          <Button variant={over ? "primary" : "secondary"} onClick={() => requestNew()}>
            New game
          </Button>
        </>
      }
    >
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,34rem)_minmax(14rem,1fr)] md:grid-rows-[auto_1fr] md:items-start">
        <div className="grid gap-2 md:col-start-2 md:row-start-1 md:pt-1">
          <p className="flex min-h-7 items-center gap-2 text-lead font-medium text-ink" data-testid="chess-turn">
            {computerToMove ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-lamp motion-safe:animate-pulse" /> : null}
            {turnWords()}
          </p>
          {position.halfmove >= 60 && !over ? (
            <p className="tabular text-small text-ink-muted">
              {plural(Math.floor(position.halfmove / 2), "move")} each with no capture and no pawn moved: at 50 the game is drawn.
            </p>
          ) : null}
        </div>
        <div className="md:col-start-1 md:row-span-2 md:row-start-1">
          <Board
            board={position.board}
            flipped={flipped}
            selected={picked}
            targets={targets}
            marked={picked === null && lastMove ? { from: lastMove.from, to: lastMove.to } : null}
            checked={checked}
            draggable={(square) => personToMove && sideOf(position.board[square]!) === ownSide}
            label={label}
            onSquare={onSquare}
            onCancel={cancel}
          />
          <p className="mt-2 min-h-[2.625rem] text-small text-ink md:min-h-[1.3125rem]">{notice}</p>
        </div>
        <div className="grid content-start gap-5 md:col-start-2 md:row-start-2">
          <section aria-labelledby="chess-moves-heading" className="grid gap-1.5">
            <h2 id="chess-moves-heading" className="text-small text-ink-muted">
              Moves
            </h2>
            {pairs.length === 0 ? (
              <p className="text-small text-ink-muted">No moves yet.</p>
            ) : (
              <ol
                aria-labelledby="chess-moves-heading"
                className="tabular grid max-h-60 grid-cols-[auto_1fr_1fr] gap-x-3 overflow-y-auto text-small text-ink"
              >
                {pairs.map((pair) => (
                  <li key={pair.number} className="contents">
                    <span className="text-ink-muted">{pair.number}.</span>
                    <span>{pair.white ?? "…"}</span>
                    <span>{pair.black ?? ""}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="grid gap-1.5">
            <span className="text-small text-ink-muted">Play</span>
            <Segmented
              label="Play"
              value={game.mode}
              onChange={(mode) => requestNew(mode)}
              options={[
                { value: "computer", label: "Against the computer" },
                { value: "two-player", label: "Two players" },
              ]}
            />
          </div>
          {vsComputer ? (
            <>
              <div className="grid gap-1.5">
                <span className="text-small text-ink-muted">You play</span>
                <Segmented
                  label="You play"
                  value={game.human}
                  onChange={(human) => requestNew("computer", human)}
                  options={[
                    { value: "white", label: "White, first" },
                    { value: "black", label: "Black" },
                  ]}
                />
              </div>
              <div className="grid gap-1.5">
                <span className="text-small text-ink-muted">The computer</span>
                <Segmented
                  label="The computer's strength"
                  value={game.level}
                  onChange={(level) => requestNew("computer", game.human, level)}
                  options={(Object.keys(LEVEL_LABELS) as Level[]).map((level) => ({ value: level, label: LEVEL_LABELS[level] }))}
                />
              </div>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setGame((current) => ({ ...current, turned: !current.turned }))}>
              Turn the board
            </Button>
            <Button variant="secondary" onClick={() => setCarrying("out")}>
              Copy the game
            </Button>
            <Button variant="secondary" onClick={() => setCarrying("in")}>
              Paste a game
            </Button>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>

      <GameTallyLine game="chess" variant={variant} variantLabel={variantLabel} />

      <GameAbout>
        <p>Chess on an 8 by 8 board, by the FIDE Laws of Chess. White moves first.</p>
        <ul className="grid list-disc gap-1 pl-5">
          <li>
            Castling: the king moves two squares towards a rook, and the rook jumps over it. Only if neither has moved, the squares between
            are empty, and the king is not in check, does not cross an attacked square and does not land on one.
          </li>
          <li>
            En passant: a pawn that has just moved two squares can be taken, on the next move only, by a pawn beside it, as if it had moved
            one.
          </li>
          <li>A pawn reaching the far row becomes a queen, rook, bishop or knight, as you choose.</li>
          <li>No move may leave your own king in check. In check with no way out is checkmate, and the game is lost.</li>
          <li>
            The game is drawn by stalemate (no legal move, not in check), when the same position comes up three times, after 50 moves each
            with no capture and no pawn moved, when neither side has enough pieces left to checkmate, or (two players) by agreement. Here
            repetition and the 50 moves end the game at once, without being claimed.
          </li>
        </ul>
        <p>
          The computer is Outpost's own small search, not a chess engine: no opening book, no endgame tables. Learner looks one move ahead
          and often blunders, so a child who knows the moves can beat it. Easy looks {LEVEL_PLAY.easy.depth} moves ahead (counting each
          side's move) and medium {LEVEL_PLAY.medium.depth}; hard looks {LEVEL_PLAY.hard.depth} and follows every exchange to its end. Hard
          is a fair game for a casual player; it has not been rated against people, and any club player or chess program will beat it.
        </p>
        <p>
          Tap a piece, then a marked square, or drag it. With a keyboard, the arrow keys move between squares and Enter picks and puts down;
          Escape puts a piece back. Undo takes back your last move and the computer's reply. Turn the board to see it from the other side.
        </p>
        <p>
          Copy the game gives it as PGN and the position as FEN, the forms other chess programs read; Paste a game reads either back. The
          game in progress is kept in this browser only. A finished game, or one left by starting a new game, is added to the household's
          tally on this Outpost.
        </p>
      </GameAbout>

      <PromotionDialog
        side={position.turn}
        open={promoting !== null}
        onClose={() => setPromoting(null)}
        onChoose={(kind) => {
          const move = legal.find(
            (candidate) => candidate.from === promoting?.from && candidate.to === promoting?.to && candidate.promotion === kind,
          );
          if (move) commit(move);
        }}
      />
      <CarryOutDialog open={carrying === "out"} onClose={() => setCarrying(null)} pgn={toPgn(game, played)} fen={toFen(position)} />
      <CarryInDialog
        open={carrying === "in"}
        onClose={() => setCarrying(null)}
        ending={madeMoves && !over}
        onRead={(start, codes) => loadPasted(start, codes)}
      />
      <ConfirmDialog
        open={asking?.kind === "new"}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Start a new game?"
        description="This game ends here and is counted as played and not won."
        confirmLabel="Start a new game"
        cancelLabel="Keep playing"
        confirmVariant="primary"
        onConfirm={() => {
          if (asking?.kind === "new") startNew(asking.mode, asking.human, asking.level, true);
          setAsking(null);
        }}
      />
      <ConfirmDialog
        open={asking?.kind === "draw"}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Agree a draw?"
        description="Both players agree to end this game as a draw. It is counted as played."
        confirmLabel="Agree a draw"
        cancelLabel="Keep playing"
        confirmVariant="primary"
        onConfirm={agreeDraw}
      />
    </GameFrame>
  );
}

function PromotionDialog({
  side,
  open,
  onClose,
  onChoose,
}: {
  side: Side;
  open: boolean;
  onClose: () => void;
  onChoose: (kind: PromotionKind) => void;
}) {
  const kinds: PromotionKind[] = [5, 4, 3, 2];
  const s = side === "white" ? 1 : -1;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Promote the pawn" description="Choose the piece it becomes." size="sm">
        <DialogBody>
          <div className="grid grid-cols-4 gap-2">
            {kinds.map((kind) => (
              <Button key={kind} variant="secondary" className="h-auto flex-col gap-1 py-2" onClick={() => onChoose(kind)}>
                <span className="flex size-12 items-center justify-center rounded-control bg-game-board-light">
                  <PieceImage piece={s * kind} className="size-full" />
                </span>
                {PIECE_NAMES[kind][0]!.toUpperCase() + PIECE_NAMES[kind].slice(1)}
              </Button>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function CopyField({ label, value, rows }: { label: string; value: string; rows: number }) {
  const [said, setSaid] = useState("");
  const id = `chess-copy-${label.toLowerCase()}`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        readOnly
        value={value}
        rows={rows}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full resize-none rounded-control border border-border-strong bg-surface px-3 py-2 font-mono text-small text-ink"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={async () =>
            setSaid((await copyText(value)) ? "Copied." : "This browser would not copy it: select the text and copy it by hand.")
          }
        >
          Copy {label}
        </Button>
        <span className="text-small text-ink-muted" aria-live="polite">
          {said}
        </span>
      </div>
    </div>
  );
}

function CarryOutDialog({ open, onClose, pgn, fen }: { open: boolean; onClose: () => void; pgn: string; fen: string }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title="Copy the game"
        description="PGN holds the whole game; FEN holds only the position now. Other chess programs read both."
      >
        <DialogBody className="grid gap-5">
          <CopyField label="PGN" value={pgn} rows={8} />
          <CopyField label="FEN" value={fen} rows={2} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function CarryInDialog({
  open,
  onClose,
  ending,
  onRead,
}: {
  open: boolean;
  onClose: () => void;
  /** A game is in progress, and would end. */
  ending: boolean;
  onRead: (start: string, moves: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const read = () => {
    try {
      const pasted = readPasted(text);
      setText("");
      setError("");
      onRead(pasted.start, pasted.moves);
    } catch (caught) {
      setError(caught instanceof NotationError ? caught.message : "This could not be read as PGN or FEN.");
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError("");
          onClose();
        }
      }}
    >
      <DialogContent title="Paste a game" description="A game in PGN, or a position in FEN, from another chess program or another device.">
        <DialogBody className="grid gap-2">
          <label htmlFor="chess-paste" className="text-small font-medium text-ink">
            PGN or FEN
          </label>
          <textarea
            id="chess-paste"
            value={text}
            rows={8}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "chess-paste-error" : undefined}
            className="w-full rounded-control border border-border-strong bg-page px-3 py-2 font-mono text-small text-ink"
          />
          {error ? (
            <p id="chess-paste-error" className="text-small text-danger">
              {error}
            </p>
          ) : null}
          {ending ? (
            <p className="text-small text-ink-muted">The game on the board ends here and is counted as played and not won.</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={read} disabled={!text.trim()}>
            Read it in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
