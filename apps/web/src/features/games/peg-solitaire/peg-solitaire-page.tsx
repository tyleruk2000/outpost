/**
 * Peg solitaire: the English board of 33 holes, every hole but the centre holding a peg
 * at the start. The game in progress is kept in this browser after every jump; when no
 * jump is left, or the game is given up by starting again after a jump, its result goes
 * to the household's tally on the server. There is no randomness, so no seed.
 */
import {
  type Board,
  CENTRE,
  type Ending,
  endingOf,
  findJump,
  holeName,
  jumpsFrom,
  jumpWords,
  pegCount,
  replay,
} from "@outpost/shared/games/peg-solitaire";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { plural } from "@/lib/utils";
import { readDeviceSave, writeDeviceSave } from "../kit/device-save";
import { GameAbout, GameFrame } from "../kit/frame";
import { useRecordResult } from "../kit/queries";
import { GameTallyLine, gameTime } from "../kit/tally";
import { PegBoard } from "./board";
import { isPegGame, newGame, type PegGame, SAVE_KEY, secondsSince } from "./game";

const VARIANT = "english";

/** The one line said when no jump is left. */
function endingWords(ending: Ending): string {
  if (ending.kind === "solved") return ending.inCentre ? "Solved: one peg left, in the centre." : "Solved: one peg left.";
  if (ending.kind === "stuck") return `No moves left. ${plural(ending.left, "peg")} remain.`;
  return "";
}

const listWords = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

/** "Hole c5, peg, can jump to e5", "Hole b3, empty, the peg on d3 can jump here". */
function holeLabel(board: Board, place: number, picked: number | null, targets: ReadonlySet<number>, over: boolean): string {
  const parts = [`Hole ${holeName(place)}`];
  if (place === CENTRE) parts.push("centre");
  if (board[place]) {
    parts.push("peg");
    if (picked === place) parts.push("picked");
    const reach = over ? [] : jumpsFrom(board, place).map((jump) => holeName(jump.to));
    if (reach.length > 0) parts.push(`can jump to ${listWords(reach)}`);
  } else {
    parts.push("empty");
    if (picked !== null && targets.has(place)) parts.push(`the peg on ${holeName(picked)} can jump here`);
  }
  return parts.join(", ");
}

export default function PegSolitairePage() {
  const [game, setGame] = useState<PegGame>(() => readDeviceSave(SAVE_KEY, isPegGame) ?? newGame());
  const [picked, setPicked] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [spoken, setSpoken] = useState("");
  const [asking, setAsking] = useState(false);
  const record = useRecordResult("peg-solitaire");

  useEffect(() => {
    writeDeviceSave(SAVE_KEY, game);
  }, [game]);

  // The save was checked on load and every jump is checked before it is kept, so the replay always succeeds.
  const board = useMemo(() => replay(game.jumps)?.board ?? replay([])!.board, [game.jumps]);
  const ending = useMemo(() => endingOf(board), [board]);
  const over = ending.kind !== "playing";
  const pegs = pegCount(board);
  const moves = game.jumps.length;

  const targets = useMemo(() => new Set(picked === null ? [] : jumpsFrom(board, picked).map((jump) => jump.to)), [board, picked]);

  // ── Jumps ──
  const jump = (from: number, to: number) => {
    const made = findJump(board, from, to);
    if (!made) return;
    const now = Date.now();
    const jumps = [...game.jumps, [from, to] as const];
    const after = replay(jumps)!.board;
    const ended = endingOf(after);
    let next: PegGame = { ...game, jumps, startedAt: game.startedAt ?? now };
    const left = pegCount(after);
    let words = `${jumpWords(made)}. ${plural(left, "peg")} left.`;
    if (ended.kind !== "playing") {
      const seconds = secondsSince(next.startedAt, now);
      next = { ...next, seconds, recorded: true };
      record.mutate({ variant: VARIANT, won: left === 1, left, moves: jumps.length, seconds });
      words = `${jumpWords(made)}. ${endingWords(ended)}`;
    }
    setGame(next);
    setPicked(null);
    setNotice("");
    setSpoken(words);
  };

  const onHole = (place: number) => {
    if (over) {
      setNotice("No jump is left. Start again for a new game.");
      return;
    }
    if (picked !== null && targets.has(place)) {
      jump(picked, place);
      return;
    }
    if (board[place]) {
      // A second tap on the picked peg puts it down again; it never jumps by itself.
      if (picked === place) {
        setPicked(null);
        setNotice("");
        return;
      }
      if (jumpsFrom(board, place).length > 0) {
        setPicked(place);
        setNotice("");
        return;
      }
      setPicked(null);
      setNotice("That peg has no jump: it needs a peg next to it with an empty hole just beyond, in a straight line.");
      return;
    }
    setNotice(
      picked === null
        ? "Tap a peg first, then the empty hole it jumps to."
        : "The picked peg cannot jump there. It jumps over the peg next to it into the empty hole just beyond, never diagonally.",
    );
  };

  const cancel = () => {
    setPicked(null);
    setNotice("");
  };

  // ── Undo and start again ──
  const canUndo = moves > 0 && !over;
  const undo = () => {
    const last = game.jumps[game.jumps.length - 1];
    if (!last || over) return;
    const jumps = game.jumps.slice(0, -1);
    setGame({ ...game, jumps, startedAt: jumps.length > 0 ? game.startedAt : null });
    setPicked(null);
    setNotice("");
    setSpoken(`The jump from ${holeName(last[0])} to ${holeName(last[1])} was taken back. ${plural(pegs + 1, "peg")} left.`);
  };

  const startAgain = (givenUp: boolean) => {
    if (givenUp && !game.recorded && moves > 0) {
      record.mutate({ variant: VARIANT, won: false, moves, seconds: secondsSince(game.startedAt, Date.now()) });
    }
    setGame(newGame());
    setPicked(null);
    setNotice("");
    setSpoken("A new game. 32 pegs, the centre empty.");
  };
  const requestStartAgain = () => {
    if (moves > 0 && !over) setAsking(true);
    else startAgain(false);
  };

  return (
    <GameFrame
      title="Peg solitaire"
      actions={
        <>
          <Button onClick={undo} disabled={!canUndo}>
            Undo
          </Button>
          <Button variant={over ? "primary" : "secondary"} onClick={requestStartAgain}>
            Start again
          </Button>
        </>
      }
    >
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,30rem)_minmax(14rem,1fr)] md:grid-rows-[auto_1fr] md:items-start">
        <div className="grid gap-1 md:col-start-2 md:row-start-1 md:pt-1">
          {over ? (
            <>
              <p className="min-h-7 text-lead font-medium text-ink" data-testid="peg-ending">
                {endingWords(ending)}
              </p>
              <p className="tabular text-small text-ink-muted">
                {plural(moves, "move")}
                {game.seconds !== null ? ` in ${gameTime(game.seconds)}` : ""}.
              </p>
            </>
          ) : (
            <>
              <p className="tabular min-h-7 text-lead font-medium text-ink" data-testid="peg-count">
                {plural(pegs, "peg")} left.
              </p>
              <p className="text-small text-ink-muted">
                {moves === 0
                  ? "Jump a peg over its neighbour into the empty hole beyond. Leave one peg, best of all in the centre."
                  : `${plural(moves, "move")} made.`}
              </p>
            </>
          )}
        </div>
        <div className="md:col-start-1 md:row-span-2 md:row-start-1">
          <PegBoard
            board={board}
            picked={picked}
            targets={targets}
            draggable={(place) => !over && jumpsFrom(board, place).length > 0}
            label={(place) => holeLabel(board, place, picked, targets, over)}
            onHole={onHole}
            onCancel={cancel}
            firstFocus={CENTRE}
          />
          {/* Under the board, where the eye is after a tap; its lines are kept so the page does not jump when it appears. */}
          <p className="mt-2 min-h-[2.625rem] text-small text-ink md:min-h-[1.3125rem]">{notice}</p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>

      <GameTallyLine game="peg-solitaire" variant={VARIANT} variantLabel="English board" left="pegs left" />

      <GameAbout>
        <p>
          The English board: 33 holes in a cross, a 7 by 7 square with the corners taken off. At the start every hole holds a peg but the
          centre.
        </p>
        <ul className="grid list-disc gap-1 pl-5">
          <li>
            A peg jumps over a peg next to it, up, down, left or right but never diagonally, into the empty hole just beyond. The peg jumped
            over is taken off.
          </li>
          <li>Each jump is one move, and takes one peg. Jumps are not chained into one move.</li>
          <li>
            The game ends when no jump is left. It is solved with one peg left, best of all in the centre hole. A game is counted as won
            when one peg is left, anywhere.
          </li>
        </ul>
        <p>
          Tap a peg, then one of the holes marked for it; tap the peg again to put it down. A peg can also be dragged. With a keyboard, the
          arrow keys move between holes, Enter picks and puts, and Escape puts the peg down. Undo takes back the last jump, as many times as
          you like, until the game ends.
        </p>
        <p>
          The game in progress is kept in this browser only. A finished game, or one left by starting again after a jump, is added to the
          household's tally on this Outpost, with the fewest pegs ever left.
        </p>
      </GameAbout>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Start again?"
        description="This game ends here and is counted as played and not solved."
        confirmLabel="Start again"
        cancelLabel="Keep playing"
        confirmVariant="primary"
        onConfirm={() => {
          startAgain(true);
          setAsking(false);
        }}
      />
    </GameFrame>
  );
}
