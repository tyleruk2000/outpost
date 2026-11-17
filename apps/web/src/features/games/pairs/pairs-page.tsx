/**
 * Pairs: a memory game for children. Turn over two cards; a match stays face up, a miss
 * turns back after a second, or at once on the next tap. No clock is shown while
 * playing: the time is only said in the line at the end. The game in progress is kept
 * in this browser after every turn.
 */
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/misc";
import { cn, plural } from "@/lib/utils";
import { readDeviceSave, useDeviceSave } from "../kit/device-save";
import { boardSurface, GameAbout, GameFrame } from "../kit/frame";
import { usePlayTime } from "../kit/play-time";
import { useRecordResult } from "../kit/queries";
import { newSeed } from "../kit/rng";
import { GameTallyLine, gameTime } from "../kit/tally";
import { PairsCard } from "./card";
import {
  cardName,
  deal,
  isFaceUp,
  isPairsGame,
  missShowing,
  type PairsGame,
  PICTURES,
  pairsFound,
  SIZE_LABELS,
  SIZE_RULES,
  SIZES,
  type Size,
  turn,
  turnBack,
} from "./engine";

const SAVE_KEY = "pairs";
/** How long a miss stays face up before it turns back by itself. */
const MISS_SHOWN_MS = 1000;

const isSize = (value: string | null): value is Size => SIZES.includes(value as Size);

/** The columns of each size: on a phone as SIZE_RULES says, and the large deal 6 wide on a wider screen. */
const COLUMNS: Record<Size, string> = {
  small: "grid-cols-3 max-w-[26rem]",
  medium: "grid-cols-4 max-w-[32rem]",
  large: "grid-cols-4 max-w-[32rem] md:grid-cols-6 md:max-w-[44rem]",
};

/** The game to open with: the kept one, unless the address asks for another seed or size. */
function opening(params: URLSearchParams): { game: PairsGame; setAside: PairsGame | null } {
  const kept = readDeviceSave(SAVE_KEY, isPairsGame);
  const seedText = params.get("seed");
  const seed = seedText && /^\d{1,10}$/.test(seedText) ? Number(seedText) : null;
  const askedSize = params.get("size");
  const size = isSize(askedSize) ? askedSize : null;
  const wanted = (game: PairsGame) => (seed === null || game.seed === seed) && (size === null || game.size === size);
  // A miss left showing when the page was closed is turned back on opening.
  if (kept && wanted(kept)) return { game: turnBack(kept), setAside: null };
  const game = deal(seed ?? newSeed(), size ?? kept?.size ?? "small");
  return { game, setAside: kept && kept.turns > 0 && !kept.finished ? kept : null };
}

export const finishedLine = (game: PairsGame) =>
  `All ${game.cards.length / 2} pairs found in ${plural(game.turns, "turn")}, in ${gameTime(game.seconds)}.`;

export default function PairsPage() {
  const [params, setParams] = useSearchParams();
  const [start] = useState(() => opening(params));
  const [game, setGame] = useState(start.game);
  const [asking, setAsking] = useState<Size | null>(null);
  const [said, setSaid] = useState("");
  const record = useRecordResult("pairs");
  const recordRef = useRef(record.mutate);
  recordRef.current = record.mutate;
  const board = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on opening
  useEffect(() => {
    if (start.setAside) {
      const lost = start.setAside;
      recordRef.current({ variant: lost.size, won: false, seconds: Math.round(lost.seconds), moves: lost.turns });
    }
    if (params.has("seed") || params.has("size")) setParams({}, { replace: true });
  }, []);

  // Time counts only while the game is on screen and unfinished.
  const time = usePlayTime(!game.finished);
  const withTime = (current: PairsGame): PairsGame => ({ ...current, seconds: current.seconds + time.lap() });
  // Kept a moment after each move, and when the screen is hidden or left.
  useDeviceSave(SAVE_KEY, game, (current) => ({ ...current, seconds: current.seconds + time.peek() }));

  // A miss turns back by itself after a second.
  const showingMiss = missShowing(game);
  useEffect(() => {
    if (!showingMiss) return;
    const timer = window.setTimeout(() => setGame((current) => turnBack(current)), MISS_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [showingMiss]);

  const onTurn = (card: number) => {
    const { game: after, turned } = turn(game, card);
    if (turned === "none") return;
    const next = withTime(after);
    setGame(next);
    const picture = `Card ${card + 1}, ${PICTURES[next.cards[card]!]}.`;
    if (next.finished) {
      setSaid(`${picture} A match. ${finishedLine(next)}`);
      record.mutate({ variant: next.size, won: true, seconds: Math.round(next.seconds), moves: next.turns });
    } else if (turned === "match") setSaid(`${picture} A match.`);
    else if (turned === "miss") setSaid(`${picture} Not a match.`);
    else setSaid(picture);
  };

  const startNew = (size: Size) => {
    const current = withTime(game);
    if (current.turns > 0 && !current.finished) {
      record.mutate({ variant: current.size, won: false, seconds: Math.round(current.seconds), moves: current.turns });
    }
    const next = deal(newSeed(), size);
    setGame(next);
    setAsking(null);
    setSaid(`A new game of ${next.cards.length} cards, all face down.`);
  };
  const askNew = (size: Size) => {
    if (game.turns > 0 && !game.finished) setAsking(size);
    else startNew(size);
  };

  // The arrow keys move between cards, row by row as they are laid out.
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = Number((event.target as HTMLElement).closest("[data-card]")?.getAttribute("data-card"));
    if (!board.current || Number.isNaN(from)) return;
    // The columns as laid out (the large deal is wider on a wide screen); the phone's when there is no layout to read.
    const laidOut = getComputedStyle(board.current)
      .gridTemplateColumns.split(" ")
      .filter((track) => track.endsWith("px")).length;
    const columns = laidOut || SIZE_RULES[game.size].columns;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    const to = event.key === "Home" ? 0 : event.key === "End" ? game.cards.length - 1 : from + (step[event.key] ?? Number.NaN);
    if (Number.isNaN(to) || to < 0 || to >= game.cards.length) return;
    event.preventDefault();
    board.current.querySelector<HTMLButtonElement>(`[data-card="${to}"]`)?.focus();
  };

  const found = pairsFound(game);
  const total = game.cards.length / 2;

  return (
    <GameFrame
      title="Pairs"
      actions={
        <>
          <Segmented<Size>
            label="Size"
            value={game.size}
            onChange={askNew}
            options={SIZES.map((size) => ({ value: size, label: SIZE_LABELS[size] }))}
          />
          <Button onClick={() => askNew(game.size)}>New game</Button>
        </>
      }
    >
      <div className="mb-4 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
        {game.finished ? (
          <>
            <p className="text-lead text-ink">{finishedLine(game)}</p>
            <Button variant="primary" onClick={() => startNew(game.size)}>
              Play again
            </Button>
          </>
        ) : (
          <p className="text-body text-ink-muted tabular">
            {found === 0 && game.turns === 0
              ? `Find the ${total} pairs. Turn over two cards at a time.`
              : `${found} of ${total} pairs found, ${plural(game.turns, "turn")}.`}
          </p>
        )}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: a set of cards to turn, not a form; the arrow keys move between them */}
      <div
        ref={board}
        role="group"
        aria-label="Cards"
        onKeyDown={moveFocus}
        className={cn("grid gap-2 sm:gap-3", COLUMNS[game.size], boardSurface)}
      >
        {game.cards.map((picture, index) => (
          <PairsCard
            // A card is its place in the deal. The seed in the key: a new deal starts face down rather than turning every card back over.
            // biome-ignore lint/suspicious/noArrayIndexKey: a card is its place in the layout, which never changes during a deal
            key={`${game.seed}-${index}`}
            picture={picture}
            index={index}
            faceUp={isFaceUp(game, index)}
            matched={game.matched[index]!}
            name={cardName(game, index)}
            onTurn={() => onTurn(index)}
          />
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>

      <GameTallyLine game="pairs" variant={game.size} variantLabel={SIZE_LABELS[game.size]} moves="turns" />

      <GameAbout>
        <p>
          Every picture is on two cards. Turn over two cards: if they show the same picture they stay face up; if not, they turn back after
          a second, or straight away when you turn the next card. Find every pair. A turn is two cards turned over.
        </p>
        <p>
          Small is {SIZE_RULES.small.pairs} pairs in 3 columns of 4, medium {SIZE_RULES.medium.pairs} pairs in 4 by 4, and large{" "}
          {SIZE_RULES.large.pairs} pairs in 4 columns of 6 on a phone (6 by 4 on a wider screen). The pictures are animals, fruit, weather
          and things that go, chosen and laid out at random for each game.
        </p>
        <p>
          No clock is shown while you play; the time is said only at the end. The game in progress is kept in this browser only, so a reload
          carries on where you were. When it is finished, or given up by starting another, the household's tally on this Outpost is updated.
        </p>
      </GameAbout>

      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        title={asking && asking !== game.size ? `Start a ${SIZE_LABELS[asking].toLowerCase()} game?` : "Start a new game?"}
        description="The cards are dealt again, and this game is counted in the tally as played and not won."
        confirmLabel="New game"
        cancelLabel="Keep playing"
        onConfirm={() => asking && startNew(asking)}
      />
    </GameFrame>
  );
}
