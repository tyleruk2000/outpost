/**
 * Draughts: English draughts against the computer or with two people at one device. The
 * game in progress is kept in this browser (its seed and its moves); a finished game, or
 * one given up by starting another, is added to the household's tally on the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/misc";
import { usePageVisible } from "@/lib/page-visible";
import { plural } from "@/lib/utils";
import { readDeviceSave, useDeviceSave } from "../kit/device-save";
import { GameAbout, GameFrame } from "../kit/frame";
import { usePlayTime } from "../kit/play-time";
import { useRecordResult } from "../kit/queries";
import { newSeed } from "../kit/rng";
import { GameTallyLine, gameTime } from "../kit/tally";
import { moveSeed, SEARCH_DEPTH } from "./ai";
import { Board } from "./board";
import { think } from "./computer";
import { isKing, legalMoves, type Move, moveWords, other, pieceCount, replay, type Side, sideOf, squareName } from "./engine";
import { type Game, humanMoves, isGame, type Mode, moverOf, newGame, play, SAVE_KEY, undoTurn } from "./game";

/** The least time between the person's move and the computer's reply appearing, so that it can be followed. */
const REPLY_PAUSE_MS = 450;

const sideName = (side: Side) => (side === "dark" ? "Dark" : "Light");

function seedFrom(params: URLSearchParams): number | null {
  const text = params.get("seed");
  if (text === null || !/^\d+$/.test(text)) return null;
  const seed = Number(text);
  return seed >= 1 && seed <= 0xffffffff ? seed : null;
}

function initialGame(seeded: number | null): Game {
  const saved = readDeviceSave(SAVE_KEY, isGame);
  if (seeded !== null) return newGame(seeded, saved?.mode ?? "computer", saved?.human ?? "dark");
  return saved ?? newGame(newSeed(), "computer", "dark");
}

export default function DraughtsPage() {
  const [params, setParams] = useSearchParams();
  const [game, setGame] = useState<Game>(() => initialGame(seedFrom(params)));
  /** The squares of a move being made: the piece picked, then each landing of a jump. */
  const [chosen, setChosen] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [spoken, setSpoken] = useState("");
  const [marked, setMarked] = useState<Move | null>(null);
  const [asking, setAsking] = useState<null | { kind: "new"; mode: Mode; human: Side } | { kind: "draw" }>(null);
  const record = useRecordResult("draughts");

  // A seed in the address has started its game; it is then taken out, so a reload continues that game.
  useEffect(() => {
    if (params.has("seed")) setParams({}, { replace: true });
  }, [params, setParams]);

  const played = useMemo(() => play(game), [game]);
  const { position, moves, outcome } = played;
  const over = outcome.kind !== "playing";

  // Time runs from the first move to the end, only while the board is in view.
  const time = usePlayTime(game.paths.length > 0 && !over);
  // Kept a moment after each move, and when the screen is hidden or left.
  useDeviceSave(SAVE_KEY, game, (current) =>
    current.recorded || current.paths.length === 0 ? current : { ...current, seconds: (current.seconds ?? 0) + time.peek() },
  );
  const vsComputer = game.mode === "computer";
  const computerSide = other(game.human);
  const computerToMove = vsComputer && !over && position.turn === computerSide;
  const personToMove = !over && !computerToMove;

  const legal = useMemo(() => (personToMove ? legalMoves(position) : []), [personToMove, position]);
  const candidates = useMemo(() => legal.filter((move) => chosen.every((square, index) => move.path[index] === square)), [legal, chosen]);
  const targets = useMemo(
    () => new Set(chosen.length > 0 ? candidates.map((move) => move.path[chosen.length]!).filter((square) => square !== undefined) : []),
    [candidates, chosen],
  );
  const taking = useMemo(
    () => new Set(chosen.length > 1 ? (candidates[0]?.captures.slice(0, chosen.length - 1) ?? []) : []),
    [candidates, chosen],
  );

  // The board as it looks with a jump half made: the piece where it has landed so far.
  const shown = useMemo(() => {
    if (chosen.length < 2) return position.board;
    const board = position.board.slice();
    const piece = board[chosen[0]!]!;
    board[chosen[0]!] = 0;
    board[chosen[chosen.length - 1]!] = piece;
    return board;
  }, [position, chosen]);

  // ── Ending: the result goes to the tally once. ──
  // The seeds already sent from this page, so that an effect run twice never sends a result twice.
  const sent = useRef(new Set<number>());
  const { mutate: sendResult } = record;
  const finish = useCallback(
    (ended: Game, won: boolean): Game => {
      if (ended.recorded) return ended;
      const seconds = Math.min(86_400, Math.round((ended.seconds ?? 0) + time.lap()));
      if (!sent.current.has(ended.seed)) {
        sent.current.add(ended.seed);
        sendResult({ variant: ended.mode, won, ...(won ? { seconds, moves: Math.max(1, humanMoves(ended)) } : {}) });
      }
      return { ...ended, recorded: true, seconds };
    },
    [sendResult, time],
  );

  useEffect(() => {
    if (!over || game.recorded) return;
    // Against the computer, won is the person's win. With two players, won counts a game that ended with a winner.
    const won = outcome.kind === "won" && (game.mode === "two-player" || outcome.winner === game.human);
    setGame(finish(game, won));
  }, [over, outcome, game, finish]);

  // ── Moves ──
  const commit = useCallback(
    (move: Move, by: "person" | "computer") => {
      const lap = time.lap();
      setGame((current) => ({
        ...current,
        paths: [...current.paths, move.path],
        startedAt: current.startedAt ?? Date.now(),
        seconds: (current.seconds ?? 0) + lap,
      }));
      setChosen([]);
      setNotice("");
      setMarked(by === "computer" ? move : null);
    },
    [time],
  );

  // Words for what just happened, said once the position has changed.
  const lastSpoken = useRef(game.paths.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: said once per new move, from the state then in view
  useEffect(() => {
    if (moves.length <= lastSpoken.current) {
      lastSpoken.current = moves.length;
      return;
    }
    lastSpoken.current = moves.length;
    const move = moves[moves.length - 1]!;
    const mover = moverOf(moves.length - 1);
    const who = vsComputer ? (mover === game.human ? "You" : "The computer") : sideName(mover);
    const before = replay(game.paths.slice(0, -1))?.position;
    const crowned =
      before && !isKing(before.board[move.path[0]!]!) && isKing(position.board[move.path[move.path.length - 1]!]!)
        ? ", and was crowned"
        : "";
    const taken = move.captures.length > 0 ? `, taking ${move.captures.length === 1 ? "a piece" : `${move.captures.length} pieces`}` : "";
    setSpoken(`${who} moved ${moveWords(move)}${taken}${crowned}. ${turnWords()}`);
  }, [moves.length]);

  // ── The computer ──
  // It thinks only while the board is in view: hidden, the search is stopped and its worker ended, and it starts again when shown.
  const visible = usePageVisible();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the search starts afresh when the position changes, and only then
  useEffect(() => {
    if (!computerToMove || !visible) return;
    let live = true;
    const asked = Date.now();
    const thinking = think(position, moveSeed(game.seed, moves.length));
    let waited: ReturnType<typeof setTimeout> | undefined;
    thinking.move.then((path) => {
      if (!path || !live) return;
      const move = legalMoves(position).find((candidate) => candidate.path.join() === path.join());
      if (!move) return;
      waited = setTimeout(() => commit(move, "computer"), Math.max(0, REPLY_PAUSE_MS - (Date.now() - asked)));
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
    if (chosen.length > 0 && targets.has(square)) {
      const next = [...chosen, square];
      const done = candidates.find((move) => move.path.length === next.length && move.path.every((s, index) => s === next[index]));
      if (done) commit(done, "person");
      else {
        setChosen(next);
        setNotice("Keep jumping: the same piece must go on taking while it can.");
      }
      return;
    }
    if (chosen.length > 1) {
      // A jump half made is put back if another square is tapped.
      setChosen([]);
      setNotice("The jump was taken back. Pick a piece to move.");
      return;
    }
    const cell = position.board[square]!;
    if (cell !== 0 && sideOf(cell) === ownSide) {
      if (chosen[0] === square) {
        setChosen([]);
        setNotice("");
        return;
      }
      const own = legal.filter((move) => move.path[0] === square);
      if (own.length > 0) {
        setMarked(null);
        setChosen([square]);
        setNotice("");
        return;
      }
      setChosen([]);
      if (legal[0]?.captures.length) {
        const from = [...new Set(legal.map((move) => squareName(move.path[0]!)))];
        setNotice(`A capture is compulsory: jump with the piece on ${listWords(from)}.`);
      } else setNotice(`The ${isKing(cell) ? "king" : "man"} on ${squareName(square)} has no move.`);
      return;
    }
    if (cell !== 0) {
      setNotice(
        vsComputer
          ? "That is the computer's piece. Pick one of yours."
          : `That is ${other(ownSide)}'s piece. ${sideName(ownSide)} is to move.`,
      );
      return;
    }
    if (chosen.length === 1) setNotice(`The piece on ${squareName(chosen[0]!)} cannot go to ${squareName(square)}.`);
  };

  const cancel = () => {
    setChosen([]);
    setNotice("");
  };

  const label = (square: number) => {
    const name = `Square ${squareName(square)}`;
    const cell = shown[square]!;
    const parts = [name];
    if (cell === 0) parts.push("empty");
    else {
      const side = sideOf(cell)!;
      const owner = vsComputer ? (side === game.human ? "your" : "computer's") : side;
      parts.push(`${owner} ${isKing(cell) ? "king" : "man"}`);
      if (taking.has(square)) parts.push("being taken");
    }
    if (chosen.length === 1 && chosen[0] === square) parts.push("picked");
    if (targets.has(square)) parts.push("you can move here");
    if (marked && marked.path[marked.path.length - 1] === square) parts.push(`just moved here from ${squareName(marked.path[0]!)}`);
    return parts.join(", ");
  };

  // ── New game, undo, draw ──
  const startNew = (mode: Mode, human: Side, givenUp: boolean) => {
    if (givenUp) finish(game, false);
    setGame(newGame(newSeed(), mode, human));
    setChosen([]);
    setMarked(null);
    setNotice("");
    setSpoken(mode === "computer" ? `New game. You play ${human}.` : "New game. Dark moves first.");
  };
  const madeMoves = humanMoves(game) > 0;
  const requestNew = (mode: Mode = game.mode, human: Side = game.human) => {
    if (madeMoves && !over) setAsking({ kind: "new", mode, human });
    else startNew(mode, human, false);
  };

  const canUndo = !over && undoTurn(game).length < game.paths.length;
  const undo = () => {
    setGame((current) => ({ ...current, paths: undoTurn(current) }));
    setChosen([]);
    setMarked(null);
    setNotice("");
    setSpoken(vsComputer ? "Your last move and the reply were taken back." : "The last move was taken back.");
  };

  const agreeDraw = () => {
    setGame(finish({ ...game, agreed: true }, false));
    setAsking(null);
    setChosen([]);
  };

  // ── Words ──
  function turnWords(): string {
    if (outcome.kind === "won") {
      const tail = game.seconds !== null ? ` ${plural(humanMoves(game), "move")} in ${gameTime(game.seconds)}.` : "";
      if (vsComputer)
        return outcome.winner === game.human
          ? `You won: the computer has no move left.${tail}`
          : "The computer won: you have no move left.";
      return `${sideName(outcome.winner)} won: ${other(outcome.winner)} has no move left.${tail}`;
    }
    if (outcome.kind === "draw")
      return outcome.reason === "agreed" ? "A draw, agreed by both players." : "A draw: 40 moves each with no capture and no man moved.";
    if (computerToMove) return "The computer is thinking…";
    if (vsComputer) {
      if (moves.length === 0) return `You play ${game.human}${game.human === "dark" ? " and move first" : ""}.`;
      return `Your move. You play ${game.human}.`;
    }
    if (moves.length === 0) return "Dark moves first.";
    return `${sideName(position.turn)} to move.`;
  }

  const counts = vsComputer
    ? `Pieces: you ${pieceCount(position, game.human)}, the computer ${pieceCount(position, computerSide)}.`
    : `Pieces: dark ${pieceCount(position, "dark")}, light ${pieceCount(position, "light")}.`;
  const quietMoves = Math.floor(position.quiet / 2);
  const variantLabel = vsComputer ? "Against the computer" : "Two players";

  return (
    <GameFrame
      title="Draughts"
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
          <p className="flex min-h-7 items-center gap-2 text-lead font-medium text-ink" data-testid="draughts-turn">
            {computerToMove ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-lamp motion-safe:animate-pulse" /> : null}
            {turnWords()}
          </p>
          <p className="tabular text-small text-ink-muted">
            {counts}
            {quietMoves >= 20 && !over
              ? ` ${plural(quietMoves, "move")} each with no capture and no man moved: at 40 the game is drawn.`
              : ""}
          </p>
        </div>
        <div className="md:col-start-1 md:row-span-2 md:row-start-1">
          <Board
            board={shown}
            flipped={vsComputer && game.human === "light"}
            selected={chosen.length > 0 ? chosen[chosen.length - 1]! : null}
            targets={targets}
            taking={taking}
            marked={chosen.length > 0 ? null : (marked ?? null)}
            draggable={(square) => personToMove && sideOf(position.board[square]!) === ownSide && chosen.length < 2}
            label={label}
            onSquare={onSquare}
            onCancel={cancel}
          />
          {/* Under the board, where the eye is after a tap; its line is kept so the page does not jump when it appears. */}
          <p className="mt-2 min-h-[2.625rem] text-small text-ink md:min-h-[1.3125rem]">{notice}</p>
        </div>
        <div className="grid content-start gap-4 md:col-start-2 md:row-start-2">
          <div className="grid gap-1.5">
            <span className="text-small text-ink-muted">Play</span>
            <Segmented
              label="Play"
              value={game.mode}
              onChange={(mode) => requestNew(mode, game.human)}
              options={[
                { value: "computer", label: "Against the computer" },
                { value: "two-player", label: "Two players" },
              ]}
            />
          </div>
          {vsComputer ? (
            <div className="grid gap-1.5">
              <span className="text-small text-ink-muted">You play</span>
              <Segmented
                label="You play"
                value={game.human}
                onChange={(human) => requestNew("computer", human)}
                options={[
                  { value: "dark", label: "Dark, first" },
                  { value: "light", label: "Light" },
                ]}
              />
            </div>
          ) : null}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>

      <GameTallyLine game="draughts" variant={game.mode} variantLabel={variantLabel} />

      <GameAbout>
        <p>
          English draughts, also called checkers, on an 8 by 8 board. Play is on the dark squares. Each side starts with 12 men; dark moves
          first.
        </p>
        <ul className="grid list-disc gap-1 pl-5">
          <li>A man moves one square diagonally forward. A king moves one square diagonally, forward or back.</li>
          <li>
            A piece captures by jumping over an opposing piece next to it onto the empty square beyond. If any capture can be made, a
            capture must be made; when there are several, you may choose any of them, not only the longest.
          </li>
          <li>A piece that has jumped must go on jumping in the same turn while it can.</li>
          <li>A man that reaches the far row becomes a king, and the turn ends there, even if it could jump on as a king.</li>
          <li>A player with no legal move, because all their pieces are taken or blocked, loses.</li>
          <li>After 40 moves each with no capture and no man moved, the game is a draw. With two players, a draw can also be agreed.</li>
        </ul>
        <p>
          Against the computer you play dark and move first, or choose light. The computer looks {SEARCH_DEPTH / 2} moves ahead for each
          side and counts pieces, kings worth more, with a little for men that have advanced and for the centre. Among moves it values the
          same it picks at random, so games differ.
        </p>
        <p>
          Tap a piece, then the square it goes to; for a jump of several steps, tap each landing in turn. A piece can also be dragged. With
          a keyboard, the arrow keys move between squares and Enter picks and puts down. Undo takes back your last move and the computer's
          reply.
        </p>
        <p>
          The game in progress is kept in this browser only. A finished game, or one left by starting a new game, is added to the
          household's tally on this Outpost.
        </p>
      </GameAbout>

      <ConfirmDialog
        open={asking?.kind === "new"}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Start a new game?"
        description="This game ends here and is counted as played and not won."
        confirmLabel="Start a new game"
        cancelLabel="Keep playing"
        confirmVariant="primary"
        onConfirm={() => {
          if (asking?.kind === "new") startNew(asking.mode, asking.human, true);
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

function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
