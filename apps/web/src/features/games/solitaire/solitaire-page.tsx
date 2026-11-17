/**
 * Solitaire (Klondike) for one: the screen. The rules are in engine.ts and the history in
 * game.ts; this keeps the game in play, turns presses into moves, says what happened in
 * a polite live region, keeps the unfinished game in this browser and posts the result of
 * a finished one to the household's tally.
 */
import { Undo2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/misc";
import { plural } from "@/lib/utils";
import { FOLLOWED_WORDS, readDeviceSave, useDeviceSave, writeDeviceSave } from "../kit/device-save";
import { GameAbout, GameFrame } from "../kit/frame";
import { type PlayTime, useEverySecond, usePlayTime } from "../kit/play-time";
import { useRecordResult } from "../kit/queries";
import { newSeed } from "../kit/rng";
import { GameTallyLine, gameTime } from "../kit/tally";
import { allInView, bestPlace, cardsAt, type Draw, finish, move, type Place, putAwayAll, type Source, turnStock } from "./engine";
import { advance, drawLabel, type Game, isGame, newGame, undo, variantOf } from "./game";
import { shakeCard, sourceOf, Table, type Target, type Via } from "./table";
import { cannotGoOnWords, cannotGoWords, movedWords, pickedWords, turnedWords } from "./words";

const SAVE_KEY = "solitaire";
const TAP_KEY = "solitaire-tap";

/** What a tap on a card does: send it to the best place it can go, or pick it up to be put where the next tap says. */
export type TapMode = "send" | "pick";
const isTapMode = (value: unknown): value is TapMode => value === "send" || value === "pick";

/** The time played, drawn again each second while the game is going and in view: only this line, not the table. */
function Elapsed({ seconds, time, running }: { seconds: number; time: PlayTime; running: boolean }) {
  useEverySecond(running);
  return <>{gameTime(seconds + (running ? time.peek() : 0))}</>;
}

/** A seed from the address (`?seed=`), when it is a whole number a seed can be. */
function seedFromParams(params: URLSearchParams): number | null {
  const text = params.get("seed");
  if (!text || !/^\d{1,10}$/.test(text)) return null;
  const seed = Number(text);
  return seed >= 1 && seed <= 0xffffffff ? seed : null;
}

const sameSource = (a: Source, b: Source) => JSON.stringify(a) === JSON.stringify(b);
const samePlace = (source: Source, to: Place) =>
  (source.kind === "pile" && to.kind === "pile" && source.index === to.index) ||
  (source.kind === "foundation" && to.kind === "foundation" && source.suit === to.suit) ||
  (source.kind === "waste" && to.kind === "waste");

type Asking = { kind: "deal" } | { kind: "draw"; draw: Draw } | null;

export default function SolitairePage() {
  const [params, setParams] = useSearchParams();
  const record = useRecordResult("solitaire");
  // The game kept on this device, and the one to play: a deal from the address wins over it.
  const [start] = useState(() => {
    const kept = readDeviceSave(SAVE_KEY, isGame);
    const seed = seedFromParams(params);
    const draw = kept?.draw ?? 1;
    if (seed !== null) return { game: newGame(seed, draw), setAside: kept };
    if (kept && !kept.won) return { game: kept, setAside: null };
    return { game: newGame(newSeed(), draw), setAside: null };
  });
  const [game, setGame] = useState<Game>(start.game);
  const [picked, setPicked] = useState<Source | null>(null);
  const [said, setSaid] = useState({ text: "", count: 0 });
  const [asking, setAsking] = useState<Asking>(null);
  const [tapMode, setTapMode] = useState<TapMode>(() => readDeviceSave(TAP_KEY, isTapMode) ?? "send");
  const tableRef = useRef<HTMLDivElement>(null);
  const board = game.now.board;

  const say = (text: string) => setSaid((current) => ({ text, count: current.count + 1 }));
  const result = (of: Game, won: boolean) => ({
    variant: variantOf(of.draw),
    won,
    seconds: Math.min(86_400, Math.round(of.seconds)),
    moves: Math.min(100_000, of.now.moves),
  });

  // A deal from the address is taken once; the address then loses it, so a reload goes on with the same game.
  const started = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arriving
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (seedFromParams(params) === null) return;
    const aside = start.setAside;
    if (aside?.played && !aside.won) record.mutate(result(aside, false));
    setParams(
      (current) => {
        current.delete("seed");
        return current;
      },
      { replace: true },
    );
  }, []);

  // The clock runs from the first move to the last, and only while the screen is in view.
  const time = usePlayTime(game.played && !game.won);
  /** The game with the time played since the last move added (none before the first move). */
  const timed = (of: Game): Game => ({ ...of, seconds: of.seconds + time.lap() });
  // Kept a moment after each move and when the screen is hidden or left; a won game is not kept.
  // The same game played in another tab of this browser is followed here; its time already holds this tab's.
  useDeviceSave(SAVE_KEY, game, (current) => (current.won ? null : { ...current, seconds: current.seconds + time.peek() }), {
    accept: isGame,
    onFollow: (other) => {
      time.lap();
      setGame(other);
      setPicked(null);
      say(FOLLOWED_WORDS);
    },
  });

  /** A move made: the game it led to, and what to say. A win is posted to the tally here, once. */
  const play = (moved: Game, words: string) => {
    const next = timed(moved);
    setGame(next);
    setPicked(null);
    if (next.won && !game.won) {
      record.mutate(result(next, true));
      say(`${words} Won in ${gameTime(next.seconds)} and ${plural(next.now.moves, "move")}.`);
    } else say(words);
  };

  const tryMove = (source: Source, to: Place): boolean => {
    const moved = move(board, source, to);
    if (!moved) return false;
    play(advance(game, moved.board), movedWords(board, moved.cards, to, moved.turnedUp));
    return true;
  };

  const sendToBest = (source: Source) => {
    const cards = cardsAt(board, source);
    if (!cards) return;
    const to = bestPlace(board, source);
    if (to && tryMove(source, to)) return;
    setPicked(null);
    shakeCard(tableRef.current, cards[0]!);
    say(cannotGoWords(cards));
  };

  const turn = () => {
    const turned = turnStock(board, game.draw);
    setPicked(null);
    if (!turned) return say("The stock and the waste are both empty.");
    play(advance(game, turned.board), turnedWords(turned.turned, turned.recycled, turned.board.stock.length));
  };

  const onActivate = (target: Target, via: Via) => {
    if (game.won) return;
    if (target.place.kind === "stock") return turn();
    const source = sourceOf(target);
    const cards = source ? cardsAt(board, source) : null;
    if (picked) {
      if (source && sameSource(source, picked)) return sendToBest(picked);
      if (tryMove(picked, target.place)) return;
      // Not a place the picked cards can go: a card there is picked up instead.
      if (source && cards) {
        setPicked(source);
        return say(pickedWords(cards));
      }
      const pickedCards = cardsAt(board, picked) ?? [];
      setPicked(null);
      if (pickedCards[0] !== undefined) {
        shakeCard(tableRef.current, pickedCards[0]);
        say(cannotGoOnWords(board, pickedCards, target.place));
      }
      return;
    }
    if (!source || !cards) return;
    if (via === "pointer" && tapMode === "send") return sendToBest(source);
    setPicked(source);
    say(pickedWords(cards));
  };

  const onDrop = (source: Source, to: Place | null) => {
    if (game.won || !to || samePlace(source, to)) return;
    if (tryMove(source, to)) return;
    const cards = cardsAt(board, source) ?? [];
    setPicked(null);
    if (cards[0] !== undefined) {
      shakeCard(tableRef.current, cards[0]);
      say(cannotGoOnWords(board, cards, to));
    }
  };

  const takeBack = () => {
    if (game.history.length === 0 || game.won) return;
    setGame(timed(undo(game)));
    setPicked(null);
    say("Took back the last move.");
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && picked) {
      setPicked(null);
      say("Put back.");
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      takeBack();
    }
  };

  const away = useMemo(() => putAwayAll(board), [board]);
  const putAway = () => {
    if (away.cards.length === 0) return;
    play(advance(game, away.board, away.cards.length), `Put away ${plural(away.cards.length, "card")}.`);
  };

  const finished = useMemo(() => (allInView(board) && !game.won ? finish(board, game.draw) : null), [board, game.draw, game.won]);
  const finishNow = () => {
    if (!finished) return;
    play(advance(game, finished.board, finished.moves), "Every card is on its foundation.");
  };

  /** A new deal; a game with a move made in it and not won is counted as played. */
  const deal = (draw: Draw) => {
    const left = timed(game);
    if (left.played && !left.won) record.mutate(result(left, false));
    setGame(newGame(newSeed(), draw));
    setPicked(null);
    setAsking(null);
    say(`Dealt a new game of ${drawLabel(draw).toLowerCase()}.`);
  };
  const inProgress = game.played && !game.won;
  const askDeal = () => (inProgress ? setAsking({ kind: "deal" }) : deal(game.draw));
  const changeDraw = (draw: Draw) => {
    if (draw === game.draw) return;
    if (inProgress) return setAsking({ kind: "draw", draw });
    if (game.won) return deal(draw);
    // Nothing played yet: the same deal, turned the other way.
    setGame({ ...game, draw });
    setPicked(null);
  };
  const changeTapMode = (mode: TapMode) => {
    setTapMode(mode);
    setPicked(null);
    writeDeviceSave(TAP_KEY, mode);
  };

  return (
    <GameFrame
      title="Solitaire"
      actions={
        <>
          <Segmented
            label="Cards turned from the stock"
            value={game.draw === 1 ? "1" : "3"}
            onChange={(value) => changeDraw(value === "1" ? 1 : 3)}
            options={[
              { value: "1", label: "Draw one" },
              { value: "3", label: "Draw three" },
            ]}
          />
          <Button onClick={takeBack} disabled={game.history.length === 0 || game.won}>
            <Undo2 aria-hidden />
            Undo
          </Button>
          <Button onClick={askDeal}>New deal</Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-small text-ink-muted tabular">
          {plural(game.now.moves, "move")}
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          <Elapsed seconds={game.seconds} time={time} running={game.played && !game.won} />
        </p>
        <Button onClick={putAway} disabled={away.cards.length === 0 || game.won}>
          Put away all that can go
        </Button>
      </div>

      <Table board={board} draw={game.draw} picked={picked} onActivate={onActivate} onDrop={onDrop} onKey={onKey} rootRef={tableRef} />

      <p aria-live="polite" className="sr-only">
        <span key={said.count}>{said.text}</span>
      </p>

      {game.won ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-body text-ink">
            Won in {gameTime(game.seconds)} and {plural(game.now.moves, "move")}.
          </p>
          <Button variant="primary" onClick={() => deal(game.draw)}>
            New game
          </Button>
        </div>
      ) : finished ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-body text-ink">Every card is in view: the rest can go up by themselves.</p>
          <Button variant="primary" onClick={finishNow}>
            Finish the game
          </Button>
        </div>
      ) : null}

      <GameTallyLine game="solitaire" variant={variantOf(game.draw)} variantLabel={drawLabel(game.draw)} />

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-ink-muted">
        <span aria-hidden>A tap on a card</span>
        <Segmented
          label="A tap on a card"
          value={tapMode}
          onChange={changeTapMode}
          options={[
            { value: "send", label: "Moves it where it fits" },
            { value: "pick", label: "Picks it up" },
          ]}
        />
      </div>

      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
        title={asking?.kind === "draw" ? `Deal a game of ${drawLabel(asking.draw).toLowerCase()}?` : "Deal a new game?"}
        description={
          asking?.kind === "draw"
            ? "Changing how many cards are turned needs a new deal. The game in progress will be counted as played, not won."
            : "The game in progress will be counted as played, not won."
        }
        confirmLabel={asking?.kind === "draw" ? `Deal ${drawLabel(asking.draw).toLowerCase()}` : "Deal a new game"}
        cancelLabel="Keep playing"
        confirmVariant="primary"
        onConfirm={() => deal(asking?.kind === "draw" ? asking.draw : game.draw)}
      />

      <GameAbout>
        <p>
          Solitaire, also called patience or Klondike. Build the four foundations up by suit from the ace to the king. On the seven piles,
          build down in alternating colours: a red 6 on a black 7. A run of face-up cards moves together, and only a king, or a run headed
          by one, goes on an empty pile. A face-down card is turned up as soon as it is uncovered. A card on a foundation can be taken back
          down onto a pile.
        </p>
        <p>
          Press the stock to turn one card onto the waste, or three in draw three (only the top one can be played). When the stock is empty,
          pressing it turns the waste over to be the stock again, as often as you like.
        </p>
        <p>
          A tap on a card sends it to the best place it can go: its foundation if it can go there; otherwise the first pile it fits onto a
          card, counting rightwards from its own pile and round again; otherwise the leftmost empty pile. You can choose instead that a tap
          picks a card up, and the next tap says where it goes. Cards can also be dragged.
        </p>
        <p>
          With a keyboard, Tab or the arrow keys move between the piles (up and down move along a pile), Enter picks a card up and Enter
          again puts it down where you are; Enter on the card you picked sends it to its best place, and Escape puts it back. Ctrl+Z, or
          Undo, takes back a move; every move can be taken back.
        </p>
        <p>
          Moves are counted (a turn of the stock is a move, and each card put away is one), and the time runs only while this screen is in
          view. A game in progress is kept in this browser only. A new deal after a move counts as a game played and not won; a win is added
          to the household's tally on this Outpost.
        </p>
      </GameAbout>
    </GameFrame>
  );
}
