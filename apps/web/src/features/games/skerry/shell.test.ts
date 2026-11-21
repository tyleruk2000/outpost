import { describe, expect, it } from "vitest";
import { enter, openLevel, type Session } from "./game";
import { answerFits, LEVELS, type Level, readLevels } from "./levels";
import data from "./levels.json";
import { complete, type Env, parseLine, resolvePath, run, type Tree } from "./shell";

const tree: Tree = {
  home: {
    keeper: {
      "notes.txt": "one\ntwo\nthree\n",
      ".hidden": "secret place\n",
      "names.txt": "kittiwake\nfulmar\nkittiwake\nfulmar\nkittiwake\ngannet\n",
      "numbers.txt": "10 ten\n9 nine\n100 hundred\n",
      logs: { "a.log": "Fog in the morning\nclear\nfog again\n" },
    },
  },
  station: { stores: { "keys.txt": "Hook 1  door\nHook 2  shed\n" }, deep: { er: { "tide-2026.txt": "high 05:02\n" } } },
};
const env = (cwd = "/home/keeper", history: string[] = []): Env => ({ tree, cwd, home: "/home/keeper", history });
const out = (line: string, cwd?: string) =>
  run(line, env(cwd))
    .lines.filter((each) => each.kind === "out")
    .map((each) => each.text);
const errors = (line: string) =>
  run(line, env())
    .lines.filter((each) => each.kind === "error")
    .map((each) => each.text);

describe("paths", () => {
  it("works out ~, . and .. from the folder you are in", () => {
    expect(resolvePath("~", "/station", "/home/keeper")).toBe("/home/keeper");
    expect(resolvePath("~/logs", "/", "/home/keeper")).toBe("/home/keeper/logs");
    expect(resolvePath("../..", "/home/keeper", "/home/keeper")).toBe("/");
    expect(resolvePath("./logs/../notes.txt", "/home/keeper", "/home/keeper")).toBe("/home/keeper/notes.txt");
    expect(resolvePath("..", "/", "/home/keeper")).toBe("/");
  });

  it("splits a line at pipes and keeps quoted words whole", () => {
    expect(parseLine("grep 'high water' tides.txt | wc -l")).toEqual([
      ["grep", "high water", "tides.txt"],
      ["wc", "-l"],
    ]);
    expect(parseLine("echo 'open")).toBeNull();
  });
});

describe("the commands", () => {
  it("ls lists names, folders with a slash, hidden names only with -a", () => {
    expect(out("ls")).toEqual(["logs/", "names.txt", "notes.txt", "numbers.txt"]);
    expect(out("ls -a")).toContain(".hidden");
    expect(out("ls /station")).toEqual(["deep/", "stores/"]);
    expect(errors("ls nowhere")).toEqual(["ls: there is nothing called nowhere"]);
  });

  it("cd moves, and says why when it cannot", () => {
    expect(run("cd logs", env()).cwd).toBe("/home/keeper/logs");
    expect(run("cd", env("/station")).cwd).toBe("/home/keeper");
    expect(run("cd ..", env()).cwd).toBe("/home");
    expect(errors("cd notes.txt")).toEqual(["cd: notes.txt is a file, not a folder (try cat notes.txt)"]);
    expect(run("cd nowhere", env()).cwd).toBe("/home/keeper");
  });

  it("cat, head and tail read files and say which they read", () => {
    expect(out("cat notes.txt")).toEqual(["one", "two", "three"]);
    expect(run("cat notes.txt", env()).read).toEqual(["/home/keeper/notes.txt"]);
    expect(out("head -n 1 notes.txt")).toEqual(["one"]);
    expect(out("head -2 notes.txt")).toEqual(["one", "two"]);
    expect(out("tail -n 1 notes.txt")).toEqual(["three"]);
    expect(errors("cat logs")).toEqual(["cat: logs is a folder, not a file (try ls logs)"]);
  });

  it("grep finds lines, with -i, -n, -c, -v and -r", () => {
    expect(out("grep fog logs/a.log")).toEqual(["fog again"]);
    expect(out("grep -i fog logs/a.log")).toEqual(["Fog in the morning", "fog again"]);
    expect(out("grep -in fog logs/a.log")).toEqual(["1:Fog in the morning", "3:fog again"]);
    expect(out("grep -ic fog logs/a.log")).toEqual(["2"]);
    expect(out("grep -v fog logs/a.log")).toEqual(["Fog in the morning", "clear"]);
    expect(out("grep -r Hook /station")).toEqual(["/station/stores/keys.txt:Hook 1  door", "/station/stores/keys.txt:Hook 2  shed"]);
    expect(run("grep -r Hook /station", env()).read).toContain("/station/stores/keys.txt");
    expect(out("grep -r again")).toEqual(["logs/a.log:fog again"]);
  });

  it("joins commands with pipes", () => {
    expect(out("grep -i fog logs/a.log | wc -l")).toEqual(["2"]);
    expect(out("sort names.txt | uniq -c | sort -rn")).toEqual(["   3 kittiwake", "   2 fulmar", "   1 gannet"]);
    expect(out("cat notes.txt | rev | head -n 1")).toEqual(["eno"]);
    expect(out("sort -n numbers.txt")).toEqual(["9 nine", "10 ten", "100 hundred"]);
    expect(out("echo KHOOR | decode 3")).toEqual(["HELLO"]);
    expect(out("wc notes.txt")).toEqual(["3 3 14 notes.txt"]);
  });

  it("find looks by name, with * and ?", () => {
    expect(out("find / -name 'tide*'")).toEqual(["/station/deep/er/tide-2026.txt"]);
    expect(out("find . -name '*.log'")).toEqual(["./logs/a.log"]);
    expect(out("find ~ -type d")).toEqual(["~", "~/logs"]);
  });

  it("writes and changes nothing, and says so", () => {
    expect(errors("rm notes.txt")[0]).toMatch(/for reading/);
    expect(errors("echo hi > notes.txt")[0]).toMatch(/only reads/);
    expect(errors("frobnicate")[0]).toBe("There is no command called frobnicate. Type help for the list.");
    expect(out("cat notes.txt")).toEqual(["one", "two", "three"]);
  });

  it("history numbers what was typed", () => {
    expect(run("history", env("/", ["ls", "cd logs"])).lines.map((line) => line.text)).toEqual(["   1  ls", "   2  cd logs"]);
  });
});

describe("Tab", () => {
  it("finishes a command, a file or a folder, and lists the choices when there are several", () => {
    expect(complete("gr", env()).line).toBe("grep ");
    expect(complete("cat no", env())).toEqual({ line: "cat notes.txt ", options: [] });
    expect(complete("cd lo", env()).line).toBe("cd logs/");
    expect(complete("cat n", env())).toEqual({ line: "cat n", options: ["names.txt", "notes.txt", "numbers.txt"] });
    expect(complete("cat /station/st", env()).line).toBe("cat /station/stores/");
    expect(complete("cat ~/logs/a", env("/")).line).toBe("cat ~/logs/a.log ");
    expect(complete("cat notes.txt | so", env()).line).toBe("cat notes.txt | sort ");
    expect(complete("cat .h", env()).line).toBe("cat .hidden ");
  });
});

describe("the levels", () => {
  it("are read and checked from the data, twelve of them", () => {
    expect(LEVELS.problem).toBeNull();
    expect(LEVELS.levels).toHaveLength(12);
  });

  it("refuse data that is not sound, saying why", () => {
    const copy = structuredClone(data) as { levels: Array<Record<string, unknown>> };
    copy.levels[0]!.start = "/nowhere";
    expect(() => readLevels(copy)).toThrow("Level 1's start folder is not in its tree.");
    expect(() => readLevels({ levels: [] })).toThrow();
  });

  it("take an answer in small or capital letters, with or without the", () => {
    const goal = { text: "", type: "answer" as const, answers: ["the station is yours"], match: "contains" as const };
    expect(answerFits(goal, "THE STATION IS YOURS.")).toBe(true);
    expect(answerFits(goal, "station")).toBe(false);
    expect(answerFits({ ...goal, answers: ["5"], match: "exact" }, "15")).toBe(false);
  });

  /** The commands that solve each level, typed one after another. */
  const solutions: Record<string, string[]> = {
    arrival: ["ls", "cat welcome.txt"],
    keys: ["cat handover.txt", "cd /station", "cd stores", "cat keys.txt", "answer 5"],
    hidden: ["ls -a", "cat .batteries", "answer in the biscuit tin"],
    "last-reading": ["tail -n 1 /station/logs/weather.log", "answer 27"],
    "boat-day": ["grep Marigold radio.log", "answer 14 November"],
    "foggy-days": ["grep -i fog october.txt | wc -l", "answer 9"],
    "tide-tables": ["find /station -name '*tide*'", "grep '23 Nov' /station/library/almanac/2026/sea/tides-november.txt", "answer 05:02"],
    "odd-reading": ["sort -n barometer.txt | head -n 1", "answer 17"],
    "most-calls": ["sort calls.txt | uniq -c | sort -rn | head -n 1", "answer Kittiwake"],
    checks: ["grep -v ok checks.txt", "answer anemometer"],
    puzzle: ["cat clue.txt", "wc -l /station/stores/keys.txt", "decode 7 cake.txt", "answer behind the flour in the cold store"],
    handover: ["cat last.txt", "grep -r piece /station", "echo XLI WXEXMSR MW CSYVW | decode 4", "answer The station is yours"],
  };

  it("can every one be solved through the shell, with the output that the solution reads", () => {
    const outputs: Record<string, string[]> = {
      "last-reading": ["21 Nov 21:00  wind SW 27 kn  pressure 998 hPa  visibility moderate"],
      "foggy-days": ["9"],
      "odd-reading": [" 101 hPa  17 Nov 09:00"],
      "most-calls": ["  11 Kittiwake"],
      checks: ["anemometer: cups turn stiffly, needs oil"],
    };
    for (const level of LEVELS.levels as Level[]) {
      const steps = solutions[level.id];
      expect(steps, level.id).toBeDefined();
      let session: Session = openLevel(level);
      const history: string[] = [];
      let last: string[] = [];
      for (const step of steps!) {
        history.push(step);
        const before = session.lines.length;
        session = enter(session, level, step, history);
        const added = session.lines.slice(before);
        expect(
          added.filter((line) => line.kind === "error"),
          `${level.id}: ${step}`,
        ).toEqual([]);
        if (!step.startsWith("answer")) last = added.filter((line) => line.kind === "out").map((line) => line.text);
      }
      if (outputs[level.id]) expect(last, level.id).toEqual(outputs[level.id]);
      if (level.id === "handover") expect(last).toEqual(["THE STATION IS YOURS"]);
      expect(session.solved, level.id).toBe(true);
    }
  });

  it("are not solved by a wrong answer, and give every hint for nothing", () => {
    const level = LEVELS.levels!.find((each) => each.id === "keys")!;
    let session = enter(openLevel(level), level, "answer 4", []);
    expect(session.solved).toBe(false);
    expect(session.lines.at(-1)!.text).toBe("4 is not it. Have another look, or type hint.");
    for (let ask = 0; ask < level.hints.length + 1; ask++) session = enter(session, level, "hint", []);
    const hints = session.lines.filter((line) => line.kind === "hint").map((line) => line.text);
    expect(hints[0]).toBe(`Hint 1 of ${level.hints.length}: ${level.hints[0]}`);
    expect(hints.at(-1)).toMatch(/That is the last hint/);
    expect(session.solved).toBe(false);
  });

  it("each give a hint for every step and close with words", () => {
    for (const level of LEVELS.levels!) {
      expect(level.hints.length, level.id).toBeGreaterThanOrEqual(2);
      expect(level.done.length, level.id).toBeGreaterThanOrEqual(1);
    }
  });
});
