/**
 * Snake: steer with the arrow keys or W, A, S and D, a swipe on the field, or the buttons
 * under it. It pauses itself when the page is hidden. The best score for each way of
 * playing is kept on this device, and each game's score goes to the household's tally.
 */
import type { GameVariant } from "@outpost/shared";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play } from "lucide-react";
import { type PointerEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { usePageVisible } from "@/lib/page-visible";
import { cn, plural } from "@/lib/utils";
import { readDeviceSave, useDeviceSave } from "../kit/device-save";
import { boardSurface, GameAbout, GameFrame } from "../kit/frame";
import { usePlayTime } from "../kit/play-time";
import { useRecordResult } from "../kit/queries";
import { newSeed } from "../kit/rng";
import { GameTallyLine } from "../kit/tally";
import {
  columnOf,
  type Direction,
  type Edges,
  keyDirection,
  newSnake,
  rowOf,
  type Snake,
  START_LENGTH,
  step,
  swipeDirection,
  turn,
} from "./engine";

export type Speed = "slow" | "steady" | "quick" | "fast";
type Variant = GameVariant<"snake">;

/** Milliseconds a step: slow is three steps a second, for small children; fast is about fourteen. */
export const STEP_MS: Record<Speed, number> = { slow: 333, steady: 150, quick: 105, fast: 72 };
const SPEED_LABELS: Record<Speed, string> = { slow: "Slow", steady: "Steady", quick: "Quick", fast: "Fast" };
const EDGE_LABELS: Record<Edges, string> = { walls: "Walls", wrap: "Wrap round" };

export interface Kept {
  version: 1;
  speed: Speed;
  edges: Edges;
  /** The best score on this device for each way of playing. */
  best: Partial<Record<Variant, number>>;
}

export const SAVE_KEY = "snake";
const SPEEDS: Speed[] = ["slow", "steady", "quick", "fast"];

export function isKept(value: unknown): value is Kept {
  if (!value || typeof value !== "object") return false;
  const kept = value as Record<string, unknown>;
  if (kept.version !== 1 || !SPEEDS.includes(kept.speed as Speed) || (kept.edges !== "walls" && kept.edges !== "wrap")) return false;
  if (!kept.best || typeof kept.best !== "object") return false;
  return Object.entries(kept.best).every(
    ([variant, score]) => /^(slow|steady|quick|fast)-(walls|wrap)$/.test(variant) && Number.isInteger(score) && (score as number) >= 0,
  );
}

const variantOf = (speed: Speed, edges: Edges): Variant => `${speed}-${edges}` as Variant;

function onMotionChange(listener: () => void): () => void {
  const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  query?.addEventListener?.("change", listener);
  return () => query?.removeEventListener?.("change", listener);
}
const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Status = "ready" | "running" | "paused" | "over";

/** Whether a key press belongs to the game: not while typing, and not while a control that takes arrow keys has the focus. */
function forTheGame(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target === document.body || target.closest("[data-snake-keys]")) return true;
  return !target.closest(
    "input, textarea, select, [contenteditable], [role=radiogroup], [role=group], [role=menu], [role=dialog], [role=listbox]",
  );
}

export default function SnakePage() {
  const [kept, setKept] = useState<Kept>(
    () => readDeviceSave(SAVE_KEY, isKept) ?? { version: 1, speed: "steady", edges: "walls", best: {} },
  );
  const [snake, setSnake] = useState<Snake>(() => newSnake(newSeed(), kept.edges));
  const [status, setStatus] = useState<Status>("ready");
  const [spoken, setSpoken] = useState("");
  const field = useRef<HTMLDivElement>(null);
  const visible = usePageVisible();
  const calm = useSyncExternalStore(onMotionChange, reducedMotion, () => false);
  const record = useRecordResult("snake");
  const time = usePlayTime(status === "running");
  useDeviceSave(SAVE_KEY, kept);

  const variant = variantOf(kept.speed, kept.edges);
  const best = kept.best[variant] ?? 0;

  // ── The clock: one step at the speed chosen, only while running and in view ──
  useEffect(() => {
    if (status !== "running" || !visible) return;
    const timer = window.setInterval(() => setSnake((current) => step(current)), STEP_MS[kept.speed]);
    return () => window.clearInterval(timer);
  }, [status, visible, kept.speed]);

  // Hidden, the game pauses, and waits to be started again rather than starting by itself.
  useEffect(() => {
    if (!visible && status === "running") {
      setStatus("paused");
      setSpoken("Paused while the page was hidden.");
    }
  }, [visible, status]);

  // ── The end ──
  const { mutate: sendResult } = record;
  const ended = useRef<number | null>(null);
  useEffect(() => {
    if (!snake.ending || ended.current === snake.seed) return;
    ended.current = snake.seed;
    setStatus("over");
    const seconds = Math.min(86_400, Math.round(time.lap()));
    const score = snake.eaten;
    sendResult({ variant, won: snake.ending === "full", score, seconds });
    if (score > best) setKept((current) => ({ ...current, best: { ...current.best, [variant]: score } }));
    const how =
      snake.ending === "wall"
        ? "The snake hit the wall."
        : snake.ending === "self"
          ? "The snake ran into itself."
          : "The snake fills the field: you won.";
    setSpoken(`${how} Score ${score}.${score > best && score > 0 ? " A new best on this device." : ""}`);
  }, [snake, variant, best, sendResult, time]);

  const start = useCallback(() => {
    setSnake(newSnake(newSeed(), kept.edges));
    setStatus("running");
    setSpoken("Go.");
    field.current?.focus();
  }, [kept.edges]);

  const steer = useCallback(
    (direction: Direction) => {
      if (status === "over") return;
      setSnake((current) => turn(current, direction));
      if (status !== "running") {
        setStatus("running");
        setSpoken(status === "paused" ? "Going again." : "Go.");
      }
    },
    [status],
  );

  const pauseOrGo = useCallback(() => {
    if (status === "running") {
      setStatus("paused");
      setSpoken("Paused.");
    } else if (status === "paused" || status === "ready") {
      setStatus("running");
      setSpoken("Going again.");
    } else start();
  }, [status, start]);

  // ── Keys, anywhere on the screen but in a field or a control that takes the arrow keys ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || !forTheGame(event.target)) return;
      const direction = keyDirection(event.key);
      if (direction) {
        event.preventDefault();
        steer(direction);
        return;
      }
      if (event.key === " " || event.key === "p" || event.key === "P") {
        // A space on a button presses that button instead.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        pauseOrGo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steer, pauseOrGo]);

  // ── Swipes on the field ──
  const swipe = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipe.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = swipe.current;
    if (!current || current.pointer !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - current.x, event.clientY - current.y);
    if (!direction) return;
    // One long swipe can turn twice: it is read again from where it turned.
    swipe.current = { ...current, x: event.clientX, y: event.clientY };
    steer(direction);
  };
  const onPointerEnd = () => {
    swipe.current = null;
  };

  const choose = (next: Partial<Pick<Kept, "speed" | "edges">>) => {
    setKept((current) => ({ ...current, ...next }));
    if (status !== "running") {
      setSnake(newSnake(newSeed(), next.edges ?? kept.edges));
      setStatus("ready");
    }
  };

  const statusWords =
    status === "ready"
      ? "Press an arrow key, swipe on the field or tap an arrow to start."
      : status === "paused"
        ? "Paused. Press Space or Carry on, or steer to go again."
        : status === "over"
          ? snake.ending === "wall"
            ? `The snake hit the wall. Score ${snake.eaten}.`
            : snake.ending === "self"
              ? `The snake ran into itself. Score ${snake.eaten}.`
              : `The snake fills the field: you won, with ${snake.eaten}.`
          : `Eat the apples. Do not run into yourself${kept.edges === "walls" ? " or the walls" : ""}.`;

  return (
    <GameFrame
      title="Snake"
      actions={
        <>
          {status === "running" || status === "paused" ? (
            <Button onClick={pauseOrGo}>
              {status === "running" ? <Pause aria-hidden /> : <Play aria-hidden />}
              {status === "running" ? "Pause" : "Carry on"}
            </Button>
          ) : null}
          <Button variant={status === "over" ? "primary" : "secondary"} onClick={start}>
            New game
          </Button>
        </>
      }
    >
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,34rem)_minmax(14rem,1fr)] md:items-start">
        <div className="grid justify-items-center gap-4 md:justify-items-start">
          <div
            ref={field}
            data-snake-keys
            role="application"
            aria-label={`Snake field, ${snake.width} by ${snake.height}. Steer with the arrow keys or W, A, S and D; Space pauses.`}
            aria-describedby="snake-status"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the field takes the focus so that the keys steer it
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            className={cn(
              "aspect-square w-full max-w-[34rem] touch-none overflow-hidden rounded-panel border border-border-strong",
              boardSurface,
            )}
          >
            <Field snake={snake} />
          </div>
          <Pad onSteer={steer} />
        </div>
        <div className="grid content-start gap-4">
          <p id="snake-status" className="text-lead font-medium text-ink" data-testid="snake-status">
            {statusWords}
          </p>
          <p className="tabular text-small text-ink-muted">
            Score {snake.eaten} · length {snake.body.length} · best on this device {best}
          </p>
          <div className="grid gap-1.5">
            <span className="text-small text-ink-muted">Speed</span>
            <Segmented
              label="Speed"
              value={kept.speed}
              onChange={(speed) => choose({ speed })}
              options={SPEEDS.map((speed) => ({ value: speed, label: SPEED_LABELS[speed] }))}
            />
            <span className="text-small text-ink-muted">Slow is for small children: three steps a second.</span>
          </div>
          <div className="grid gap-1.5">
            <span className="text-small text-ink-muted">Edges</span>
            <Segmented
              label="Edges"
              value={kept.edges}
              onChange={(edges) => choose({ edges })}
              options={(["walls", "wrap"] as const).map((edges) => ({ value: edges, label: EDGE_LABELS[edges] }))}
            />
          </div>
          {status === "running" ? <p className="text-small text-ink-muted">Speed and edges change from the next game.</p> : null}
          {calm ? (
            <p className="text-small text-ink-muted">
              Reduced motion is on: nothing shakes or flashes, but the snake itself still moves, as that is the game.
            </p>
          ) : null}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>

      <GameTallyLine
        game="snake"
        variant={variant}
        variantLabel={`${SPEED_LABELS[kept.speed]}, ${EDGE_LABELS[kept.edges].toLowerCase()}`}
        wins={false}
      />

      <GameAbout>
        <p>
          Steer the snake to the apples. Each one eaten makes it a cell longer and scores one. The game ends when the head runs into the
          snake's own body, or, with walls, into the edge of the field; with wrap round, the snake leaves one edge and comes back at the
          opposite one. It starts {START_LENGTH} cells long on a field of {plural(snake.width * snake.height, "cell")}; filling the field
          wins.
        </p>
        <p>
          Steer with the arrow keys or W, A, S and D, by swiping on the field, or with the arrow buttons under it. The snake cannot turn
          back on itself. Space or P pauses; the game also pauses when the page is hidden, and waits for you to carry on.
        </p>
        <p>
          There is no sound, and nothing shakes or flashes. With reduced motion asked for, the snake still moves, since that is the game;
          slow is the gentlest speed.
        </p>
        <p>
          The best score for each speed and kind of edge is kept in this browser. Each game's score is added to the household's tally on
          this Outpost.
        </p>
      </GameAbout>
    </GameFrame>
  );
}

/** The field, drawn in SVG: the snake's head has eyes and faces the way it goes; the food is an apple with a leaf. */
function Field({ snake }: { snake: Snake }) {
  const { width, height } = snake;
  const head = snake.body[0]!;
  const hx = columnOf(snake, head);
  const hy = rowOf(snake, head);
  const facing: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [ex, ey] = facing[snake.heading];
  const eyes: Array<[number, number]> =
    ex === 0
      ? [
          [-0.2, 0],
          [0.2, 0],
        ]
      : [
          [0, -0.2],
          [0, 0.2],
        ];
  const grid = [
    ...Array.from({ length: width - 1 }, (_, index) => `M${index + 1} 0V${height}`),
    ...Array.from({ length: height - 1 }, (_, index) => `M0 ${index + 1}H${width}`),
  ].join("");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden className="block size-full bg-game-snake-field">
      <path d={grid} stroke="var(--game-snake-grid)" strokeWidth="0.04" />
      {snake.food !== null ? (
        <g transform={`translate(${columnOf(snake, snake.food) + 0.5} ${rowOf(snake, snake.food) + 0.55})`}>
          <circle r="0.36" fill="var(--game-snake-food)" />
          <path d="M0 -0.32 Q0.05 -0.48 0.2 -0.5 Q0.12 -0.34 0 -0.32 Z" fill="var(--game-snake-leaf)" />
        </g>
      ) : null}
      {snake.body
        .slice(1)
        .reverse()
        .map((cell) => (
          <rect
            key={cell}
            x={columnOf(snake, cell) + 0.08}
            y={rowOf(snake, cell) + 0.08}
            width="0.84"
            height="0.84"
            rx="0.22"
            fill="var(--game-snake)"
            stroke="var(--game-snake-edge)"
            strokeWidth="0.06"
          />
        ))}
      <rect x={hx + 0.02} y={hy + 0.02} width="0.96" height="0.96" rx="0.36" fill="var(--game-snake-edge)" />
      {eyes.map(([dx, dy]) => (
        <circle key={`${dx},${dy}`} cx={hx + 0.5 + dx + ex * 0.18} cy={hy + 0.5 + dy + ey * 0.18} r="0.11" fill="var(--game-snake-eye)" />
      ))}
    </svg>
  );
}

/** Four arrow buttons, 56 px each, in a cross, for a thumb. */
function Pad({ onSteer }: { onSteer: (direction: Direction) => void }) {
  const button = (direction: Direction, label: string, Icon: typeof ArrowUp, place: string) => (
    <Button
      variant="secondary"
      aria-label={label}
      className={cn("size-14 p-0 [&_svg]:size-6", place)}
      // Pressed, not clicked: a turn is taken at once, as a key would be.
      onPointerDown={(event) => {
        event.preventDefault();
        onSteer(direction);
      }}
      onClick={(event) => {
        // A press from the keyboard (Enter or Space on the button) arrives as a click with no pointer.
        if (event.detail === 0) onSteer(direction);
      }}
    >
      <Icon aria-hidden />
    </Button>
  );
  return (
    <div className="grid grid-cols-3 grid-rows-2 gap-2 select-none" data-snake-keys>
      {button("up", "Up", ArrowUp, "col-start-2 row-start-1")}
      {button("left", "Left", ArrowLeft, "col-start-1 row-start-2")}
      {button("down", "Down", ArrowDown, "col-start-2 row-start-2")}
      {button("right", "Right", ArrowRight, "col-start-3 row-start-2")}
    </div>
  );
}
