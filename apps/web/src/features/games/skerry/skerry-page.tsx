/**
 * Skerry: puzzles solved at a pretend command line, as the new keeper of a small island's
 * weather station. The shell is the game's own (`shell.ts`), the levels are data
 * (`levels.json`), and progress is kept in this browser only. Nothing is fetched.
 */
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readDeviceSave, useDeviceSave } from "../kit/device-save";
import { GameAbout, GameFrame } from "../kit/frame";
import { enter, openLevel, type ScreenLine, type Session } from "./game";
import { LEVELS, type Level } from "./levels";
import { complete, shortPath } from "./shell";

const SAVE_KEY = "skerry";
/** The most commands remembered for the up arrow. */
const HISTORY_KEPT = 100;

interface Progress {
  v: 1;
  current: string;
  solved: string[];
  history: string[];
}

const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
export function isProgress(value: unknown): value is Progress {
  if (!value || typeof value !== "object") return false;
  const kept = value as Partial<Progress>;
  return kept.v === 1 && typeof kept.current === "string" && isTextList(kept.solved) && isTextList(kept.history);
}

export default function SkerryPage() {
  if (LEVELS.problem !== null) {
    return (
      <GameFrame title="Skerry">
        <ErrorState error={new Error(`The levels could not be read: ${LEVELS.problem}`)} />
      </GameFrame>
    );
  }
  return <Skerry levels={LEVELS.levels} />;
}

function Skerry({ levels }: { levels: Level[] }) {
  const [progress, setProgress] = useState<Progress>(() => {
    const kept = readDeviceSave(SAVE_KEY, isProgress);
    const known = new Set(levels.map((level) => level.id));
    if (kept && known.has(kept.current)) return { ...kept, solved: kept.solved.filter((id) => known.has(id)) };
    return { v: 1, current: levels[0]!.id, solved: [], history: [] };
  });
  useDeviceSave(SAVE_KEY, progress);

  const index = Math.max(
    0,
    levels.findIndex((level) => level.id === progress.current),
  );
  const level = levels[index]!;
  const [session, setSession] = useState<Session>(() => openLevel(level, progress.solved.includes(level.id)));
  const [typed, setTyped] = useState("");
  /** Where the up and down arrows are in the history: null while writing a new line. */
  const [back, setBack] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const solved = new Set(progress.solved);

  const goTo = (next: Level) => {
    setProgress((current) => ({ ...current, current: next.id }));
    setSession(openLevel(next, solved.has(next.id)));
    setTyped("");
    setBack(null);
  };

  // The newest line in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolled whenever the lines change
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [session.lines]);

  // With a mouse or a trackpad the prompt is ready to type at; on a phone the keyboard waits for a tap.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, []);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const line = typed;
    const history = line.trim() ? [...progress.history, line.trim()].slice(-HISTORY_KEPT) : progress.history;
    const next = enter(session, level, line, history);
    setSession(next);
    setTyped("");
    setBack(null);
    setProgress((current) => ({
      ...current,
      history,
      solved: next.solved && !current.solved.includes(level.id) ? [...current.solved, level.id] : current.solved,
    }));
  };

  const finish = () => {
    const result = complete(typed, { tree: level.tree, cwd: session.cwd, home: level.home, history: progress.history });
    setTyped(result.line);
    if (result.options.length > 0) {
      const lines: ScreenLine[] = [
        { kind: "command", text: typed, prompt: shortPath(session.cwd, level.home) },
        { kind: "out", text: result.options.join("   ") },
      ];
      setSession((current) => ({ ...current, lines: [...current.lines, ...lines] }));
    }
  };

  const recall = (step: -1 | 1) => {
    const history = progress.history;
    if (history.length === 0) return;
    if (back === null) {
      if (step === 1) return;
      setDraft(typed);
      setBack(history.length - 1);
      setTyped(history[history.length - 1]!);
      return;
    }
    const to = back + step;
    if (to < 0) return;
    if (to >= history.length) {
      setBack(null);
      setTyped(draft);
      return;
    }
    setBack(to);
    setTyped(history[to]!);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab" && !event.shiftKey && typed.trim() !== "") {
      event.preventDefault();
      finish();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      recall(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      recall(1);
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      setSession((current) => ({ ...current, lines: [] }));
    }
  };

  /** A key under the terminal: acts and leaves the typing where it was, with the phone's keyboard up. */
  const keyProps = (act: () => void) => ({
    onPointerDown: (event: { preventDefault: () => void }) => event.preventDefault(),
    onClick: () => {
      act();
      input.current?.focus({ preventScroll: true });
    },
  });

  const next = levels[index + 1];
  const allSolved = levels.every((each) => solved.has(each.id));

  return (
    <GameFrame
      title="Skerry"
      description="Puzzles at a pretend command line, as the new keeper of an island weather station. Nothing typed here touches anything real."
      actions={<Button onClick={() => goTo(level)}>Start this level again</Button>}
    >
      <div className="mb-3 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-lead text-ink">
          Level {index + 1} of {levels.length}: {level.title}
        </h2>
        {session.solved &&
          (next ? (
            <Button variant="primary" onClick={() => goTo(next)}>
              Next level: {next.title}
            </Button>
          ) : (
            <p className="text-body text-ink">{allSolved ? "Every level solved. The station is yours." : "The last level, solved."}</p>
          ))}
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: a tap anywhere on the screen puts the cursor at the prompt; the prompt is reachable by keyboard itself */}
      <div
        className="rounded-panel border border-game-term-edge bg-game-term font-mono text-small text-game-term-ink"
        onClick={() => {
          if (!window.getSelection()?.toString()) input.current?.focus({ preventScroll: true });
        }}
      >
        <div
          ref={log}
          role="log"
          aria-live="polite"
          aria-label="Terminal"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the output scrolls, so it can be reached to scroll by keyboard
          tabIndex={0}
          className="max-h-[min(32rem,58dvh)] min-h-[14rem] overflow-y-auto px-3 pt-3 pb-1 break-words whitespace-pre-wrap outline-offset-[-2px] md:px-4"
        >
          {session.lines.map((line, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are only ever added at the end
            <TerminalLine key={at} line={line} />
          ))}
        </div>
        {/* The line being typed shows a ring while it has the focus: the caret alone is too faint a mark (WCAG 2.4.7). */}
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-b-panel px-3 pt-1 pb-3 focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-game-term-prompt md:px-4"
        >
          <span aria-hidden className="shrink-0 text-game-term-prompt">
            tarrow:{shortPath(session.cwd, level.home)}$
          </span>
          <label htmlFor="skerry-command" className="sr-only">
            Command, in {session.cwd}
          </label>
          <input
            ref={input}
            id="skerry-command"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setBack(null);
            }}
            onKeyDown={onKeyDown}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="send"
            className="min-h-11 w-full min-w-0 flex-1 bg-transparent text-game-term-ink caret-game-term-prompt outline-none max-md:text-body md:min-h-8 md:pointer-coarse:min-h-11 md:pointer-coarse:text-body"
          />
        </form>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button {...keyProps(finish)}>Tab</Button>
        <Button
          {...keyProps(() => setTyped((current) => `${current.replace(/\s+$/, "")} | `))}
          aria-label="Type a pipe, |"
          className="min-w-11 md:min-w-8 md:pointer-coarse:min-w-11"
        >
          |
        </Button>
        <Button size="icon" aria-label="Previous command" {...keyProps(() => recall(-1))}>
          <ArrowUp />
        </Button>
        <Button size="icon" aria-label="Next command" {...keyProps(() => recall(1))}>
          <ArrowDown />
        </Button>
        <Button
          {...keyProps(() => {
            setSession((current) => enter(current, level, "hint", progress.history));
          })}
        >
          Hint
        </Button>
      </div>

      <section aria-labelledby="skerry-levels" className="mt-8">
        <h2 id="skerry-levels" className="text-lead text-ink">
          Levels
        </h2>
        <p className="text-small text-ink-muted">
          {solved.size === 0 ? "None solved yet." : `${solved.size} of ${levels.length} solved.`} Any level can be played, in any order.
        </p>
        <ol className="mt-2 divide-y divide-border border-y border-border">
          {levels.map((each, at) => (
            <li key={each.id}>
              <button
                type="button"
                onClick={() => goTo(each)}
                aria-current={each.id === level.id ? "true" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface",
                  each.id === level.id && "bg-primary-soft",
                )}
              >
                <span className="tabular w-6 shrink-0 text-ink-muted">{at + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{each.title}</span>
                  <span className="text-small text-ink-muted"> · {each.teaches}</span>
                </span>
                {solved.has(each.id) && (
                  <span className="flex shrink-0 items-center gap-1 text-small text-success">
                    <Check aria-hidden className="size-4" />
                    Solved
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <GameAbout>
        <p>
          You are the relief keeper at the weather station on Tarrow Skerry, a small island far out to sea, and the station's computer is
          worked by typing commands. Each level asks one thing; the files hold the answer. Type <code>help</code> for the commands,{" "}
          <code>man</code> and a command's name for more about it, and <code>hint</code> for a hint: hints are free, as many as you like.
        </p>
        <p>
          The command line is pretend: it is part of this page, and its commands only read the level's own made-up files. It runs nothing on
          this device or on Outpost and reaches no network. The commands behave like the real ones of the same names, so what you learn here
          works on a real computer too.
        </p>
        <p>
          Which levels you have solved, the level you are on and what you have typed are kept in this browser only. Tarrow Skerry, Ines and
          the boats are made up.
        </p>
      </GameAbout>
    </GameFrame>
  );
}

const LINE_CLASS: Record<ScreenLine["kind"], string> = {
  command: "text-game-term-ink",
  out: "text-game-term-ink",
  error: "text-game-term-error",
  story: "font-sans text-body text-game-term-ink mb-2",
  goal: "font-sans text-body text-game-term-prompt mb-2",
  hint: "text-game-term-prompt",
  done: "font-sans text-body text-game-term-done mt-1",
};

function TerminalLine({ line }: { line: ScreenLine }) {
  if (line.kind === "command")
    return (
      <p className="mt-1">
        <span className="text-game-term-prompt">tarrow:{line.prompt}$</span> {line.text}
      </p>
    );
  return <p className={cn("min-h-[1lh]", LINE_CLASS[line.kind])}>{line.text}</p>;
}
