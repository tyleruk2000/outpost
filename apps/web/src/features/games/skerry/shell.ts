/**
 * Skerry's pretend command line. It is written for the game and runs in the page: every
 * command here is a small function over a folder tree held in memory. It runs nothing
 * real, reads and writes no real file and reaches no network. The tree is the level's,
 * and nothing in it can be changed: the station's files are for reading.
 *
 * The commands behave like their namesakes on a real computer closely enough that what is
 * learnt here carries over (paths, `..` and `~`, flags, pipes), and say plainly when they
 * meet something they do not do.
 */
import { caesar } from "@/features/encryption/ciphers";

/** A folder: each name holds a file's text or another folder. */
export interface Tree {
  [name: string]: string | Tree;
}

export interface Env {
  /** The level's files, from the root. */
  tree: Tree;
  /** The folder the keeper is in, as an absolute path. */
  cwd: string;
  /** What `~` stands for. */
  home: string;
  /** The commands typed so far, oldest first, for `history`. */
  history: readonly string[];
}

export type LineKind = "out" | "error";
export interface OutLine {
  text: string;
  kind: LineKind;
}

export interface RunResult {
  lines: OutLine[];
  /** The folder afterwards. */
  cwd: string;
  /** Every file a command read, as absolute paths. */
  read: string[];
}

// ── Paths ───────────────────────────────────────────────────────────────────

/** The absolute path `path` names from `cwd`, with `~`, `.` and `..` worked out. */
export function resolvePath(path: string, cwd: string, home: string): string {
  let full = path;
  if (full === "~" || full.startsWith("~/")) full = home + full.slice(1);
  if (!full.startsWith("/")) full = `${cwd}/${full}`;
  const parts: string[] = [];
  for (const part of full.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

/** What is at an absolute path: a file's text, a folder, or undefined. */
export function lookup(tree: Tree, path: string): string | Tree | undefined {
  let node: string | Tree = tree;
  for (const part of path.split("/").filter(Boolean)) {
    if (typeof node === "string" || !Object.hasOwn(node, part)) return undefined;
    node = node[part]!;
  }
  return node;
}

export const isFolder = (node: string | Tree | undefined): node is Tree => typeof node === "object" && node !== null;

/** A path as the prompt shows it: the home folder as `~`. */
export function shortPath(path: string, home: string): string {
  if (path === home) return "~";
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

const sortedNames = (folder: Tree) => Object.keys(folder).sort((a, b) => a.localeCompare(b, "en"));

// ── Words on a line ─────────────────────────────────────────────────────────

/**
 * Splits a line into commands at `|` and each command into words, keeping what is inside
 * '…' or "…" as one word. Returns null when a quote is left open.
 */
export function parseLine(line: string): string[][] | null {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  let quote: string | null = null;
  for (const character of line) {
    if (quote) {
      if (character === quote) quote = null;
      else word += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      inWord = true;
    } else if (character === "|") {
      if (inWord) words.push(word);
      commands.push(words);
      words = [];
      word = "";
      inWord = false;
    } else if (/\s/.test(character)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += character;
      inWord = true;
    }
  }
  if (quote) return null;
  if (inWord) words.push(word);
  commands.push(words);
  return commands;
}

// ── The commands ────────────────────────────────────────────────────────────

interface Io {
  env: Env;
  /** What came down the pipe, or null for the first command. */
  input: string | null;
  out: string[];
  err: string[];
  read: string[];
  cwd: string;
}

/** Splits single-letter flags (`-in` is `-i -n`) from the other words. `-n 5` style values are taken by `valued`. */
function flags(
  args: string[],
  allowed: string,
  valued = "",
): { on: Set<string>; values: Map<string, string>; rest: string[]; bad: string | null } {
  const on = new Set<string>();
  const values = new Map<string, string>();
  const rest: string[] = [];
  let bad: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg.length > 1 && arg.startsWith("-") && !/^-\d+$/.test(arg) && rest.length === 0) {
      for (const letter of arg.slice(1)) {
        if (valued.includes(letter)) {
          const value = args[index + 1];
          if (value === undefined) bad = `-${letter} needs a number after it`;
          else values.set(letter, value);
          index++;
        } else if (allowed.includes(letter)) on.add(letter);
        else bad = `there is no -${letter} here`;
      }
    } else rest.push(arg);
  }
  return { on, values, rest, bad };
}

/** The text of a file named on the line, or an error said for it. */
function readFile(io: Io, name: string, command: string): string | null {
  const path = resolvePath(name, io.cwd, io.env.home);
  const node = lookup(io.env.tree, path);
  if (node === undefined) {
    io.err.push(`${command}: there is no file called ${name}`);
    return null;
  }
  if (isFolder(node)) {
    io.err.push(`${command}: ${name} is a folder, not a file (try ls ${name})`);
    return null;
  }
  io.read.push(path);
  return node;
}

/** The text a filter works on: the files named, one after another, or what came down the pipe. */
function inputText(io: Io, files: string[], command: string): string | null {
  if (files.length === 0) {
    if (io.input === null) {
      io.err.push(`${command}: name a file to read, or send it text with |`);
      return null;
    }
    return io.input;
  }
  const texts: string[] = [];
  for (const file of files) {
    const text = readFile(io, file, command);
    if (text !== null) texts.push(text.endsWith("\n") || text === "" ? text.replace(/\n$/, "") : text);
  }
  return texts.length ? texts.join("\n") : null;
}

const linesOf = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

function count(io: Io, value: string | undefined, fallback: number, command: string): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) {
    io.err.push(`${command}: -n needs a whole number, not ${value}`);
    return null;
  }
  return Number(value);
}

/** A file name pattern with * and ? to a test. */
function globTest(pattern: string): (name: string) => boolean {
  const escaped = pattern
    .replace(/[.+^${}()[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`, "i");
  return (name) => regex.test(name);
}

type Command = (io: Io, args: string[]) => void;

const commands: Record<string, Command> = {
  pwd(io) {
    io.out.push(io.cwd);
  },

  ls(io, args) {
    const { on, rest, bad } = flags(args, "al");
    if (bad) return void io.err.push(`ls: ${bad}`);
    const targets = rest.length ? rest : ["."];
    for (const [index, target] of targets.entries()) {
      const path = resolvePath(target, io.cwd, io.env.home);
      const node = lookup(io.env.tree, path);
      if (node === undefined) {
        io.err.push(`ls: there is nothing called ${target}`);
        continue;
      }
      if (!isFolder(node)) {
        io.out.push(target);
        continue;
      }
      if (targets.length > 1) io.out.push(`${index > 0 ? "\n" : ""}${target}:`);
      const names = sortedNames(node).filter((name) => on.has("a") || !name.startsWith("."));
      for (const name of names) {
        const child = node[name]!;
        if (on.has("l")) {
          io.out.push(isFolder(child) ? `folder  ${name}/` : `${String(linesOf(child).length).padStart(4)} lines  ${name}`);
        } else io.out.push(isFolder(child) ? `${name}/` : name);
      }
    }
  },

  cd(io, args) {
    if (args.length > 1) return void io.err.push("cd: one folder at a time");
    const target = args[0] ?? "~";
    const path = resolvePath(target, io.cwd, io.env.home);
    const node = lookup(io.env.tree, path);
    if (node === undefined) return void io.err.push(`cd: there is no folder called ${target}`);
    if (!isFolder(node)) return void io.err.push(`cd: ${target} is a file, not a folder (try cat ${target})`);
    io.cwd = path;
  },

  cat(io, args) {
    const text = inputText(io, args, "cat");
    if (text !== null) io.out.push(...linesOf(text));
  },

  head(io, args) {
    const ends = endsOf(io, args, "head");
    if (ends) io.out.push(...ends.lines.slice(0, ends.n));
  },

  tail(io, args) {
    const ends = endsOf(io, args, "tail");
    if (ends) io.out.push(...(ends.n === 0 ? [] : ends.lines.slice(-ends.n)));
  },

  grep(io, args) {
    const { on, rest, bad } = flags(args, "incvr");
    if (bad) return void io.err.push(`grep: ${bad}`);
    const [pattern, ...files] = rest;
    if (pattern === undefined) return void io.err.push("grep: say what to look for: grep word file");
    const wanted = on.has("i") ? pattern.toLowerCase() : pattern;
    const matches = (line: string) => (on.has("i") ? line.toLowerCase() : line).includes(wanted) !== on.has("v");
    const sources: Array<{ name: string | null; text: string }> = [];
    if (on.has("r")) {
      for (const start of files.length ? files : ["."]) {
        const path = resolvePath(start, io.cwd, io.env.home);
        const node = lookup(io.env.tree, path);
        if (node === undefined) {
          io.err.push(`grep: there is nothing called ${start}`);
          continue;
        }
        for (const file of walk(node, "")) {
          if (isFolder(file.node)) continue;
          const shown = file.path === "" ? start : start === "." ? file.path.slice(1) : `${start.replace(/\/$/, "")}${file.path}`;
          io.read.push(path === "/" ? file.path : `${path}${file.path}`);
          sources.push({ name: shown, text: file.node });
        }
      }
    } else if (files.length === 0) {
      if (io.input === null) return void io.err.push("grep: name a file to look in, or send it text with |");
      sources.push({ name: null, text: io.input });
    } else {
      for (const file of files) {
        const text = readFile(io, file, "grep");
        if (text !== null) sources.push({ name: files.length > 1 ? file : null, text });
      }
    }
    for (const source of sources) {
      const found = linesOf(source.text)
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => matches(line));
      const label = source.name !== null && (on.has("r") || files.length > 1) ? `${source.name}:` : "";
      if (on.has("c")) io.out.push(`${label}${found.length}`);
      else for (const { line, number } of found) io.out.push(`${label}${on.has("n") ? `${number}:` : ""}${line}`);
    }
  },

  wc(io, args) {
    const { on, rest, bad } = flags(args, "lwc");
    if (bad) return void io.err.push(`wc: ${bad}`);
    const text = inputText(io, rest, "wc");
    if (text === null) return;
    const lines = linesOf(text).length;
    const words = text.split(/\s+/).filter(Boolean).length;
    // Each line ends with a newline, as on a real computer, and that is counted.
    const characters = text.replace(/\n$/, "").length + (lines > 0 ? 1 : 0);
    const shown =
      on.size === 0
        ? [lines, words, characters]
        : [...(on.has("l") ? [lines] : []), ...(on.has("w") ? [words] : []), ...(on.has("c") ? [characters] : [])];
    io.out.push(shown.join(" ") + (rest.length === 1 ? ` ${rest[0]}` : ""));
  },

  sort(io, args) {
    const { on, rest, bad } = flags(args, "rnu");
    if (bad) return void io.err.push(`sort: ${bad}`);
    const text = inputText(io, rest, "sort");
    if (text === null) return;
    const number = (line: string) => {
      const match = /^\s*(-?\d+(?:\.\d+)?)/.exec(line);
      return match ? Number(match[1]) : 0;
    };
    let lines = linesOf(text).sort((a, b) =>
      on.has("n") ? number(a) - number(b) || a.localeCompare(b, "en") : a < b ? -1 : a > b ? 1 : 0,
    );
    if (on.has("r")) lines.reverse();
    if (on.has("u")) lines = lines.filter((line, index) => index === 0 || line !== lines[index - 1]);
    io.out.push(...lines);
  },

  uniq(io, args) {
    const { on, rest, bad } = flags(args, "c");
    if (bad) return void io.err.push(`uniq: ${bad}`);
    const text = inputText(io, rest, "uniq");
    if (text === null) return;
    const runs: Array<{ line: string; times: number }> = [];
    for (const line of linesOf(text)) {
      const last = runs.at(-1);
      if (last && last.line === line) last.times++;
      else runs.push({ line, times: 1 });
    }
    for (const run of runs) io.out.push(on.has("c") ? `${String(run.times).padStart(4)} ${run.line}` : run.line);
  },

  find(io, args) {
    let start = ".";
    let name: string | null = null;
    let type: "f" | "d" | null = null;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]!;
      if (arg === "-name" || arg === "-iname") {
        name = args[++index] ?? null;
        if (name === null) return void io.err.push("find: -name needs a pattern after it, such as -name '*.txt'");
      } else if (arg === "-type") {
        const value = args[++index];
        if (value !== "f" && value !== "d") return void io.err.push("find: -type is f for files or d for folders");
        type = value;
      } else if (arg.startsWith("-")) return void io.err.push(`find: there is no ${arg} here (try -name or -type)`);
      else start = arg;
    }
    const path = resolvePath(start, io.cwd, io.env.home);
    const node = lookup(io.env.tree, path);
    if (node === undefined) return void io.err.push(`find: there is nothing called ${start}`);
    const test = name === null ? () => true : globTest(name);
    const base = start === "/" ? "" : start.replace(/\/$/, "");
    for (const found of walk(node, base)) {
      const leaf = found.path.split("/").pop() ?? "";
      if (type === "f" && isFolder(found.node)) continue;
      if (type === "d" && !isFolder(found.node)) continue;
      if (test(leaf)) io.out.push(found.path || "/");
    }
  },

  echo(io, args) {
    io.out.push(args.join(" "));
  },

  rev(io, args) {
    const text = inputText(io, args, "rev");
    if (text !== null) io.out.push(...linesOf(text).map((line) => [...line].reverse().join("")));
  },

  decode(io, args) {
    const [by, ...files] = args;
    if (by === undefined || !/^-?\d+$/.test(by)) return void io.err.push("decode: say how far the letters were shifted: decode 3 note.txt");
    const text = inputText(io, files, "decode");
    if (text !== null) io.out.push(...linesOf(caesar(text, Number(by), "decipher").output));
  },

  history(io) {
    for (const [index, line] of io.env.history.entries()) io.out.push(`${String(index + 1).padStart(4)}  ${line}`);
  },

  help(io) {
    io.out.push(...HELP);
  },

  man(io, args) {
    const name = args[0];
    if (!name) return void io.err.push("man: which command? For example: man grep");
    const page = MANUAL[name];
    if (!page) return void io.err.push(`man: there is no page for ${name}. Type help for the commands there are.`);
    io.out.push(...page);
  },
};

function endsOf(io: Io, args: string[], command: string): { lines: string[]; n: number } | null {
  // `head -5` is `head -n 5`.
  const normal = args.flatMap((arg) => (/^-\d+$/.test(arg) ? ["-n", arg.slice(1)] : [arg]));
  const { values, rest, bad } = flags(normal, "", "n");
  if (bad) {
    io.err.push(`${command}: ${bad}`);
    return null;
  }
  const n = count(io, values.get("n"), 10, command);
  if (n === null) return null;
  const text = inputText(io, rest, command);
  return text === null ? null : { lines: linesOf(text), n };
}

/** Every file and folder under `node`, depth first in name order, with its path from `base`. */
function* walk(node: string | Tree, base: string): Generator<{ path: string; node: string | Tree }> {
  yield { path: base, node };
  if (!isFolder(node)) return;
  for (const name of sortedNames(node)) yield* walk(node[name]!, `${base}/${name}`);
}

/** What other commands people reach for, and why they are not here. */
const NOT_HERE: Record<string, string> = {
  rm: "Nothing here can be deleted: the station's files are for reading.",
  mv: "Nothing here can be moved: the station's files are for reading.",
  cp: "Nothing here can be copied: the station's files are for reading.",
  mkdir: "No folders can be made here: the station's files are for reading.",
  touch: "No files can be made here: the station's files are for reading.",
  nano: "There is no editor here: the station's files are for reading. Use cat to read one.",
  vi: "There is no editor here: the station's files are for reading. Use cat to read one.",
  less: "There is no less here. Use cat, or head and tail for part of a long file.",
  more: "There is no more here. Use cat, or head and tail for part of a long file.",
  sudo: "There is nothing to be given permission for here: every file can already be read.",
  ssh: "This terminal is not connected to anything: it is the station's own, and pretend.",
  curl: "This terminal is not connected to anything: it is the station's own, and pretend.",
  wget: "This terminal is not connected to anything: it is the station's own, and pretend.",
  exit: "There is nowhere to go from here. Choose another level from the list below the terminal.",
};

export const COMMAND_NAMES = [...Object.keys(commands), "hint", "goal", "answer", "clear"].sort();

export const HELP = [
  "Commands (man <name> says more about each):",
  "  pwd              where am I?",
  "  ls [-a] [folder] what is in this folder (-a shows hidden names)",
  "  cd <folder>      go into a folder (.. is the one above, ~ is home)",
  "  cat <file>       show a file",
  "  head / tail      the first or last lines (-n 5 for five)",
  "  grep <text>      lines that hold some text (-i any case, -n numbers, -c count, -v the rest, -r every file under a folder)",
  "  wc [-l]          count lines, words and characters",
  "  sort [-n] [-r]   put lines in order (-n by number, -r backwards)",
  "  uniq [-c]        drop repeated lines next to each other (-c count them)",
  "  find -name <p>   find files by name (* stands for anything)",
  "  echo, rev        say something back; reverse each line",
  "  decode <n>       shift every letter back n places",
  "  history, clear   what you have typed; a clean screen",
  "  goal, hint       what this level asks; a hint (as many as you like)",
  "  answer <words>   give your answer",
  "Join commands with |: the first one's output becomes the next one's input.",
  "Tab finishes a name; the up and down arrows bring back what you typed.",
];

const MANUAL: Record<string, string[]> = {
  pwd: ["pwd: print working directory. Says the folder you are in, from the top (/)."],
  ls: [
    "ls: list. Shows what is in a folder; a name ending in / is a folder.",
    "  ls            this folder",
    "  ls logs       the folder called logs",
    "  ls -a         also the hidden names, which start with a dot",
    "  ls -l         also how long each file is",
  ],
  cd: [
    "cd: change directory. Moves you into a folder.",
    "  cd logs       into logs, inside this folder",
    "  cd ..         up one folder",
    "  cd ~ or cd    home",
    "  cd /station   a path from the top",
  ],
  cat: ["cat: concatenate. Shows a file's text (or several, one after another).", "  cat notes.txt"],
  head: ["head: the first lines of a file, 10 unless you say.", "  head -n 3 log.txt    the first three"],
  tail: ["tail: the last lines of a file, 10 unless you say.", "  tail -n 1 log.txt    only the last"],
  grep: [
    "grep: shows the lines that hold some text.",
    "  grep fog log.txt       lines with fog in them",
    "  grep -i fog log.txt    Fog, FOG and fog alike",
    "  grep -n fog log.txt    with each line's number",
    "  grep -c fog log.txt    only how many",
    "  grep -v ok list.txt    the lines without ok",
    "  grep -r fog logs       in every file under logs",
    "Put words with spaces in quotes: grep 'high water' tides.txt",
  ],
  wc: [
    "wc: word count. Lines, words and characters, in that order.",
    "  wc -l log.txt          only the lines",
    "  grep fog log.txt | wc -l",
  ],
  sort: [
    "sort: puts lines in order.",
    "  sort names.txt",
    "  sort -n readings.txt    by the number at the start of each line",
    "  sort -r                 backwards",
  ],
  uniq: [
    "uniq: drops a line that repeats the one above it. Sort first, so that repeats are together.",
    "  sort calls.txt | uniq -c    how often each line comes",
  ],
  find: [
    "find: looks for files and folders by name, in a folder and every folder inside it.",
    "  find / -name 'tide*'    from the top, every name starting tide",
    "  find . -type d          every folder under this one",
  ],
  echo: ["echo: says back what you give it.", "  echo hello"],
  rev: ["rev: writes each line backwards.", "  rev note.txt"],
  decode: [
    "decode: a Caesar shift undone. Each letter is moved back n places in the alphabet, Z wrapping round to A.",
    "  decode 3 note.txt    KHOOR becomes HELLO",
    "The Encryption screen under Tools shows how the shift works by hand.",
  ],
  history: ["history: everything you have typed, numbered."],
  clear: ["clear: a clean screen. Nothing is lost."],
  goal: ["goal: says again what this level asks."],
  hint: ["hint: a hint for this level. Ask as often as you like; there is no cost."],
  answer: ["answer: gives your answer to the level's question.", "  answer 14:20"],
  help: ["help: the list of commands."],
  man: ["man: manual. A page about one command.", "  man grep"],
};

/**
 * Runs one line of commands joined by `|`. The output of each is the input of the next;
 * what goes wrong is said in an error line, and the pipeline carries on with what there is.
 */
export function run(line: string, env: Env): RunResult {
  const parsed = parseLine(line);
  if (parsed === null) return { lines: [{ text: "A quote was opened and not closed.", kind: "error" }], cwd: env.cwd, read: [] };
  if (/[<>]/.test(line.replace(/'[^']*'|"[^"]*"/g, "")))
    return {
      lines: [{ text: "This terminal only reads: nothing can be written to a file with > or <.", kind: "error" }],
      cwd: env.cwd,
      read: [],
    };
  const io: Io = { env, input: null, out: [], err: [], read: [], cwd: env.cwd };
  const lines: OutLine[] = [];
  for (const [index, words] of parsed.entries()) {
    const [name, ...args] = words;
    io.out = [];
    io.err = [];
    if (name === undefined) {
      if (parsed.length > 1) io.err.push("There is a | with no command on one side of it.");
    } else if (Object.hasOwn(commands, name)) commands[name]!(io, args);
    else if (Object.hasOwn(NOT_HERE, name)) io.err.push(NOT_HERE[name]!);
    else io.err.push(`There is no command called ${name}. Type help for the list.`);
    lines.push(...io.err.map((text) => ({ text, kind: "error" as const })));
    io.input = io.out.join("\n");
    if (index === parsed.length - 1)
      lines.push(...io.out.flatMap((text) => text.split("\n")).map((text) => ({ text, kind: "out" as const })));
  }
  return { lines, cwd: io.cwd, read: [...new Set(io.read)] };
}

// ── Tab ─────────────────────────────────────────────────────────────────────

export interface Completion {
  /** The line with the last word finished as far as it can be. */
  line: string;
  /** The names it could be, when there are several. */
  options: string[];
}

/** Finishes the last word on the line: a command's name first, a file or folder's after. */
export function complete(line: string, env: Env): Completion {
  const lastBreak = Math.max(line.lastIndexOf(" "), line.lastIndexOf("|"));
  const before = line.slice(0, lastBreak + 1);
  const word = line.slice(lastBreak + 1);
  const firstWord = before.replace(/.*\|/, "").trim() === "";
  let candidates: Array<{ name: string; folder: boolean }>;
  let prefix = word;
  let dirPart = "";
  if (firstWord) candidates = COMMAND_NAMES.map((name) => ({ name, folder: false }));
  else {
    const slash = word.lastIndexOf("/");
    dirPart = slash >= 0 ? word.slice(0, slash + 1) : "";
    prefix = slash >= 0 ? word.slice(slash + 1) : word;
    const folder = lookup(env.tree, resolvePath(dirPart || ".", env.cwd, env.home));
    candidates = isFolder(folder)
      ? sortedNames(folder)
          .filter((name) => prefix.startsWith(".") || !name.startsWith("."))
          .map((name) => ({ name, folder: isFolder(folder[name]) }))
      : [];
  }
  const fits = candidates.filter((candidate) => candidate.name.startsWith(prefix));
  if (fits.length === 0) return { line, options: [] };
  if (fits.length === 1) {
    const only = fits[0]!;
    return { line: `${before}${dirPart}${only.name}${only.folder ? "/" : " "}`, options: [] };
  }
  let common = fits[0]!.name;
  for (const fit of fits) while (!fit.name.startsWith(common)) common = common.slice(0, -1);
  return { line: `${before}${dirPart}${common}`, options: fits.map((fit) => fit.name + (fit.folder ? "/" : "")) };
}
