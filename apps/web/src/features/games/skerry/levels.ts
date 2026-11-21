/**
 * Skerry's levels. They are data, in `levels.json`: each a folder tree with the files'
 * text, the folder the keeper starts in, the goal, the hints and the closing words. A new
 * level is a new entry there, with no code. `readLevels` checks every field before the
 * game uses any of it, and says what is wrong in words.
 */

import data from "./levels.json";
import { isFolder, lookup, type Tree } from "./shell";

export type Goal =
  | { text: string; type: "read"; path: string }
  | { text: string; type: "cwd"; path: string }
  | { text: string; type: "answer"; answers: string[]; match: "exact" | "contains" };

export interface Level {
  id: string;
  title: string;
  /** What the level teaches, for the list of levels: "ls and cat". */
  teaches: string;
  story: string[];
  goal: Goal;
  hints: string[];
  done: string[];
  start: string;
  home: string;
  tree: Tree;
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(isText);

function isTree(value: unknown): value is Tree {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([name, child]) => /^[^/\s|'"]+$/.test(name) && (typeof child === "string" || isTree(child)));
}

/** The answer as compared: small letters, single spaces, no full stop or quotes, "the" and "in the" left off the front. */
export function normalAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'‘’.,!?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(in |on |at )?(the )?/, "");
}

export function answerFits(goal: Goal & { type: "answer" }, given: string): boolean {
  const said = normalAnswer(given);
  if (said === "") return false;
  return goal.answers.some((answer) => (goal.match === "contains" ? said.includes(normalAnswer(answer)) : said === normalAnswer(answer)));
}

/** Checks one level; throws an Error naming what is wrong. */
function readLevel(raw: unknown, index: number): Level {
  const where = `Level ${index + 1}`;
  if (!raw || typeof raw !== "object") throw new Error(`${where} is not a level.`);
  const level = raw as Record<string, unknown>;
  for (const field of ["id", "title", "teaches", "start", "home"] as const)
    if (!isText(level[field])) throw new Error(`${where} has no ${field}.`);
  for (const field of ["story", "hints", "done"] as const) if (!isTexts(level[field])) throw new Error(`${where} has no ${field}.`);
  if (!isTree(level.tree)) throw new Error(`${where}'s folder tree cannot be read.`);
  const tree = level.tree;
  for (const field of ["start", "home"] as const)
    if (!isFolder(lookup(tree, level[field] as string))) throw new Error(`${where}'s ${field} folder is not in its tree.`);
  const goal = level.goal as Record<string, unknown> | undefined;
  if (!goal || !isText(goal.text)) throw new Error(`${where} has no goal.`);
  let read: Goal;
  if (goal.type === "answer") {
    if (!isTexts(goal.answers)) throw new Error(`${where}'s goal has no answers.`);
    read = { text: goal.text, type: "answer", answers: goal.answers, match: goal.match === "contains" ? "contains" : "exact" };
  } else if (goal.type === "read" || goal.type === "cwd") {
    if (!isText(goal.path)) throw new Error(`${where}'s goal has no path.`);
    const node = lookup(tree, goal.path);
    if (goal.type === "read" ? typeof node !== "string" : !isFolder(node))
      throw new Error(`${where}'s goal names ${goal.path}, which is not in its tree.`);
    read = { text: goal.text, type: goal.type, path: goal.path };
  } else throw new Error(`${where}'s goal is of no kind the game knows.`);
  return {
    id: level.id as string,
    title: level.title as string,
    teaches: level.teaches as string,
    story: level.story as string[],
    goal: read,
    hints: level.hints as string[],
    done: level.done as string[],
    start: level.start as string,
    home: level.home as string,
    tree,
  };
}

export function readLevels(raw: unknown): Level[] {
  const levels = (raw as { levels?: unknown } | null)?.levels;
  if (!Array.isArray(levels) || levels.length === 0) throw new Error("The levels could not be read.");
  const read = levels.map(readLevel);
  const ids = new Set(read.map((level) => level.id));
  if (ids.size !== read.length) throw new Error("Two levels have the same id.");
  return read;
}

/** The levels, or the reason they could not be read (shown on the screen in place of the game). */
export const LEVELS: { levels: Level[]; problem: null } | { levels: null; problem: string } = (() => {
  try {
    return { levels: readLevels(data), problem: null };
  } catch (error) {
    return { levels: null, problem: error instanceof Error ? error.message : "The levels could not be read." };
  }
})();
