/**
 * A level being played: what the terminal shows, where the keeper is, how many hints have
 * been given, and whether the goal is met. Pure: the page keeps a session in state and
 * hands each line typed to `enter`.
 */
import { answerFits, type Level } from "./levels";
import { parseLine, run, shortPath } from "./shell";

export type ScreenKind = "command" | "out" | "error" | "story" | "goal" | "hint" | "done";
export interface ScreenLine {
  kind: ScreenKind;
  text: string;
  /** For a command typed: the folder it was typed in, as the prompt showed it. */
  prompt?: string;
}

export interface Session {
  levelId: string;
  cwd: string;
  lines: ScreenLine[];
  hintsShown: number;
  solved: boolean;
}

/** The most lines kept on the screen; the oldest go first. */
export const SCREEN_LINES = 400;

export function openLevel(level: Level, solvedBefore = false): Session {
  return {
    levelId: level.id,
    cwd: level.start,
    lines: [
      ...level.story.map((text) => ({ kind: "story" as const, text })),
      { kind: "goal", text: `Goal: ${level.goal.text}` },
      {
        kind: "out",
        text: solvedBefore
          ? "You have solved this one before. Type help for the commands, hint for a hint."
          : "Type help for the commands, hint for a hint.",
      },
    ],
    hintsShown: 0,
    solved: false,
  };
}

export const promptOf = (session: Session, level: Level) => `tarrow:${shortPath(session.cwd, level.home)}$`;

/** Runs a line typed at the prompt. `history` already holds it. */
export function enter(session: Session, level: Level, typed: string, history: readonly string[]): Session {
  const line = typed.trim();
  const echo: ScreenLine = { kind: "command", text: typed, prompt: shortPath(session.cwd, level.home) };
  const add = (more: ScreenLine[], change: Partial<Session> = {}): Session => ({
    ...session,
    ...change,
    lines: [...session.lines, echo, ...more].slice(-SCREEN_LINES),
  });
  if (line === "") return add([]);

  const parsed = parseLine(line);
  const single = parsed && parsed.length === 1 ? parsed[0]! : null;
  const [name, ...args] = single ?? [];

  if (name === "clear") return { ...session, lines: [] };
  if (name === "goal") return add([{ kind: "goal", text: `Goal: ${level.goal.text}` }]);
  if (name === "hint") {
    const index = Math.min(session.hintsShown, level.hints.length - 1);
    const last = index === level.hints.length - 1;
    return add(
      [
        {
          kind: "hint",
          text: `Hint ${index + 1} of ${level.hints.length}: ${level.hints[index]}${last && session.hintsShown >= level.hints.length ? " (That is the last hint.)" : ""}`,
        },
      ],
      { hintsShown: Math.min(level.hints.length, session.hintsShown + 1) },
    );
  }
  if (name === "answer") {
    const given = args.join(" ");
    if (level.goal.type !== "answer") return add([{ kind: "out", text: `This level is not answered in words. ${level.goal.text}` }]);
    if (given.trim() === "") return add([{ kind: "error", text: "Put your answer after the word answer, as in: answer 5" }]);
    if (session.solved) return add([{ kind: "out", text: "Already solved. Choose the next level when you are ready." }]);
    if (answerFits(level.goal, given)) return add(solvedLines(level), { solved: true });
    return add([{ kind: "out", text: `${given} is not it. Have another look, or type hint.` }]);
  }

  const result = run(line, { tree: level.tree, cwd: session.cwd, home: level.home, history });
  const more: ScreenLine[] = result.lines.map((out) => ({ kind: out.kind, text: out.text }));
  const goal = level.goal;
  const met =
    !session.solved && ((goal.type === "read" && result.read.includes(goal.path)) || (goal.type === "cwd" && result.cwd === goal.path));
  return add(met ? [...more, ...solvedLines(level)] : more, { cwd: result.cwd, solved: session.solved || met });
}

function solvedLines(level: Level): ScreenLine[] {
  return [{ kind: "done", text: "Solved." }, ...level.done.map((text) => ({ kind: "done" as const, text }))];
}
