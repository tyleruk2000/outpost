/**
 * Sudoku: a puzzle made on this device from a seed, at one of three levels. The game in
 * progress is kept in this browser after every move; its result goes to the household's
 * tally when it is finished, or given up by starting another after a move.
 */
import { Check, PencilLine, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/misc";
import { cn, plural } from "@/lib/utils";
import { FOLLOWED_WORDS, readDeviceSave, useDeviceSave } from "../kit/device-save";
import { boardSurface, GameAbout, GameFrame } from "../kit/frame";
import { usePlayTime } from "../kit/play-time";
import { useRecordResult } from "../kit/queries";
import { newSeed } from "../kit/rng";
import { GameTallyLine, gameTime } from "../kit/tally";
import { NumberPad, SudokuGrid } from "./board";
import { colOf, givenCount, LEVEL_LABELS, LEVEL_RULES, LEVELS, type Level, rowOf } from "./engine";
import { check, digitAt, digitsLeft, enter, erase, fullButWrong, isSudokuGame, newGame, type SudokuGame, toggleNote, undo } from "./game";

const SAVE_KEY = "sudoku";

const isLevel = (value: string | null): value is Level => LEVELS.includes(value as Level);
const firstEmpty = (game: SudokuGame) => Math.max(0, game.givens.indexOf(0));
const place = (cell: number) => `row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`;

/**
 * The game to open with: the one kept on this device, unless the address asks for a
 * puzzle by seed or level that it is not. A kept game that is set aside for that, with a
 * move made and not finished, is returned too so that it can be counted as given up.
 */
function opening(params: URLSearchParams): { game: SudokuGame; setAside: SudokuGame | null } {
  const kept = readDeviceSave(SAVE_KEY, isSudokuGame);
  const seedText = params.get("seed");
  const seed = seedText && /^\d{1,10}$/.test(seedText) ? Number(seedText) : null;
  const askedLevel = params.get("level");
  const level = isLevel(askedLevel) ? askedLevel : null;
  const wanted = (game: SudokuGame) => (seed === null || game.seed === seed) && (level === null || game.level === level);
  if (kept && wanted(kept)) return { game: kept, setAside: null };
  const game = newGame(seed ?? newSeed(), level ?? kept?.level ?? "gentle");
  return { game, setAside: kept && kept.moves > 0 && !kept.finished ? kept : null };
}

export default function SudokuPage() {
  const [params, setParams] = useSearchParams();
  const [start] = useState(() => opening(params));
  const [game, setGame] = useState(start.game);
  const [selected, setSelected] = useState(() => firstEmpty(start.game));
  const [byKeyboard, setByKeyboard] = useState(false);
  const [noting, setNoting] = useState(false);
  const [asking, setAsking] = useState<Level | null>(null);
  const [checkedClean, setCheckedClean] = useState(false);
  const [said, setSaid] = useState("");
  const record = useRecordResult("sudoku");
  const recordRef = useRef(record.mutate);
  recordRef.current = record.mutate;

  // The seed and level in the address have been used: take them out, so that a reload continues this game.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on opening
  useEffect(() => {
    if (start.setAside) {
      const lost = start.setAside;
      recordRef.current({ variant: lost.level, won: false, seconds: Math.round(lost.seconds), moves: lost.moves });
    }
    if (params.has("seed") || params.has("level")) setParams({}, { replace: true });
  }, []);

  // Time counts only while the game is on screen and unfinished.
  const time = usePlayTime(!game.finished);
  const withTime = (current: SudokuGame): SudokuGame => ({ ...current, seconds: current.seconds + time.lap() });
  // Kept a moment after each move, and when the screen is hidden or left.
  // The same game played in another tab of this browser is followed here; its time already holds this tab's.
  useDeviceSave(SAVE_KEY, game, (current) => ({ ...current, seconds: current.seconds + time.peek() }), {
    accept: isSudokuGame,
    onFollow: (other) => {
      time.lap();
      setGame(other);
      setCheckedClean(false);
      setSaid(FOLLOWED_WORDS);
    },
  });

  /** Applies a move; says what happened; reports the result when it finishes the puzzle. */
  const play = (move: (current: SudokuGame) => SudokuGame, words: string) => {
    const before = game;
    const after = move(before);
    if (after === before) return;
    const next = withTime(after);
    setGame(next);
    setCheckedClean(false);
    if (next.finished && !before.finished) {
      const seconds = Math.round(next.seconds);
      setSaid(`Finished in ${gameTime(seconds)}.`);
      record.mutate({ variant: next.level, won: true, seconds, moves: next.moves });
    } else setSaid(words);
  };

  const write = (digit: number) => {
    if (noting) {
      if (game.givens[selected] || game.entries[selected]) return;
      const had = game.notes[selected]! & (1 << digit);
      play((g) => toggleNote(g, selected, digit), `${had ? "Note taken away" : "Note"} ${digit} in ${place(selected)}.`);
    } else {
      const clearing = game.entries[selected] === digit;
      play((g) => enter(g, selected, digit), clearing ? `Cleared ${place(selected)}.` : `${digit} in ${place(selected)}.`);
    }
  };
  const wipe = () => play((g) => erase(g, selected), `Erased ${place(selected)}.`);
  const takeBack = () => play(undo, "Last move undone.");
  const runCheck = () => {
    const next = check(game);
    setGame(withTime(next));
    setCheckedClean(next.marked.length === 0);
    setSaid(next.marked.length ? `${plural(next.marked.length, "cell")} marked wrong.` : "Nothing written so far is wrong.");
  };

  const startNew = (level: Level) => {
    const current = withTime(game);
    if (current.moves > 0 && !current.finished) {
      record.mutate({ variant: current.level, won: false, seconds: Math.round(current.seconds), moves: current.moves });
    }
    const next = newGame(newSeed(), level);
    setGame(next);
    setSelected(firstEmpty(next));
    setCheckedClean(false);
    setAsking(null);
    setSaid(`A new ${LEVEL_LABELS[level]} puzzle, with ${givenCount(next.givens)} givens.`);
  };
  const askNew = (level: Level) => {
    if (game.moves > 0 && !game.finished) setAsking(level);
    else startNew(level);
  };

  // Digits, Backspace and the like from a keyboard, wherever focus is on the page but in a field or a dialog.
  const keys = useRef<(event: globalThis.KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (event.altKey || event.metaKey || game.finished) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]") || asking) return;
    if (event.ctrlKey) {
      if (event.key === "z") {
        event.preventDefault();
        takeBack();
      }
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      write(Number(event.key));
    } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
      event.preventDefault();
      wipe();
    } else if (event.key === "n" || event.key === "N") {
      setNoting((on) => !on);
    } else if (event.key === "u") {
      takeBack();
    }
  };
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const left = digitsLeft(game);
  const wrongFull = fullButWrong(game);

  return (
    <GameFrame
      title="Sudoku"
      actions={
        <>
          <Segmented<Level>
            label="Level"
            value={game.level}
            onChange={askNew}
            options={LEVELS.map((level) => ({ value: level, label: LEVEL_LABELS[level] }))}
          />
          <Button onClick={() => askNew(game.level)}>New puzzle</Button>
        </>
      }
    >
      <div className={cn("lg:grid lg:grid-cols-[minmax(0,32rem)_minmax(15rem,19rem)] lg:items-start lg:gap-8", boardSurface)}>
        <SudokuGrid
          game={game}
          selected={selected}
          focusOnSelect={byKeyboard}
          onSelect={(cell, keyboard) => {
            setSelected(cell);
            setByKeyboard(keyboard);
          }}
        />
        <div className="mt-4 grid gap-3 lg:mt-0">
          {game.finished ? (
            <div className="grid gap-3">
              <p className="text-lead text-ink">
                Finished in {gameTime(game.seconds)}, with {plural(game.moves, "move")}.
              </p>
              <Button variant="primary" className="justify-self-start" onClick={() => startNew(game.level)}>
                New puzzle
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5 lg:gap-2">
                <Button
                  variant={noting ? "soft" : "secondary"}
                  aria-pressed={noting}
                  className="px-2"
                  onClick={() => setNoting((on) => !on)}
                >
                  <PencilLine aria-hidden />
                  Notes {noting ? "on" : "off"}
                </Button>
                <Button className="px-2" onClick={takeBack} disabled={game.history.length === 0}>
                  <Undo2 aria-hidden />
                  Undo
                </Button>
                <Button className="px-2" onClick={runCheck}>
                  <Check aria-hidden />
                  Check
                </Button>
              </div>
              <NumberPad left={left} noting={noting} disabled={Boolean(game.givens[selected])} onDigit={write} onErase={wipe} />
              <StatusLine game={game} checkedClean={checkedClean} wrongFull={wrongFull} selected={selected} />
            </>
          )}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>

      <GameTallyLine game="sudoku" variant={game.level} variantLabel={LEVEL_LABELS[game.level]} />

      <GameAbout>
        <p>
          Fill the grid so that every row, every column and every three by three box holds each of the digits 1 to 9 once. Pick a cell, then
          a digit on the pad or the keyboard. With notes on, a digit is pencilled in small instead, as a reminder of what might go there;
          writing a digit takes it out of the notes in its row, column and box.
        </p>
        <p>
          Each puzzle is made on this device from a random seed: a full grid is filled, then digits are taken away one at a time, and a
          digit stays away only if the puzzle still has exactly one solution.
        </p>
        <ul className="grid list-disc gap-1 pl-5">
          <li>
            Gentle: {LEVEL_RULES.gentle.givens} givens, and the puzzle can always be finished by singles alone (a cell with only one digit
            left that fits, or a digit with only one place left in a row, column or box).
          </li>
          <li>
            Steady: {LEVEL_RULES.steady.givens} givens, still always solvable by singles alone, but there are fewer of them to find at a
            time.
          </li>
          <li>
            Testing: digits are taken away for as long as the answer stays unique, which usually leaves 21 to 27 givens, and the puzzle
            almost always needs more than singles.
          </li>
        </ul>
        <p>
          Check marks the digits you have written that are wrong, without saying what they should be. Undo takes back every entry, note and
          erasure in turn. Keys: 1 to 9 write, Backspace erases, the arrow keys move, N turns notes on and off, Ctrl+Z undoes.
        </p>
        <p>
          The puzzle in progress is kept in this browser only, so a reload carries on where you were. When it is finished, or given up by
          starting another, the household's tally on this Outpost is updated.
        </p>
      </GameAbout>

      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        title={asking && asking !== game.level ? `Start a ${LEVEL_LABELS[asking]} puzzle?` : "Start a new puzzle?"}
        description="This puzzle is given up: it is counted in the tally as played and not won."
        confirmLabel="New puzzle"
        cancelLabel="Keep this puzzle"
        onConfirm={() => asking && startNew(asking)}
      />
    </GameFrame>
  );
}

function StatusLine({
  game,
  checkedClean,
  wrongFull,
  selected,
}: {
  game: SudokuGame;
  checkedClean: boolean;
  wrongFull: boolean;
  selected: number;
}) {
  let words: string;
  if (game.marked.length)
    words = `${plural(game.marked.length, "cell")} marked wrong. Change ${game.marked.length === 1 ? "it" : "them"}, or undo.`;
  else if (wrongFull) words = "Every cell is filled, but something is not right yet. Check marks the wrong digits.";
  else if (checkedClean) words = "Checked: nothing written so far is wrong.";
  else if (game.givens[selected]) words = `The ${digitAt(game, selected)} in ${place(selected)} is given.`;
  else words = `${plural(game.givens.filter((given, cell) => !given && !game.entries[cell]).length, "cell")} still to fill.`;
  return (
    <p className={cn("min-h-[1.3125rem] text-small", game.marked.length ? "text-danger" : "text-ink-muted")}>
      {game.marked.length ? <X aria-hidden strokeWidth={3} className="mr-1 inline size-3.5 align-[-0.125em]" /> : null}
      {words}
    </p>
  );
}
