/**
 * The streets sidecar's script (docker/valhalla/outpost-valhalla.sh): a build runs at low
 * processor and disk priority where `nice` and `ionice` are there and allowed, and still
 * runs where they are not. Run with stand-ins for the two on an otherwise empty PATH;
 * nothing of Valhalla is needed.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "./temp.ts";

const SCRIPT = path.resolve(import.meta.dirname, "../../../docker/valhalla/outpost-valhalla.sh");
const BASH = ["/bin/bash", "/usr/bin/bash"].find((file) => fs.existsSync(file));

/** A folder for PATH with the tools given: each a stand-in that runs what follows its options, or refuses. */
function tools(spec: Record<string, "works" | "refuses">): string {
  const dir = tempDir("outpost-sidecar-path-");
  for (const [name, how] of Object.entries(spec)) {
    const body =
      how === "works"
        ? // Skip the options ("-n 19", "-c 3") and run the command.
          '#!/bin/bash\nwhile [ "$#" -gt 0 ]; do case "$1" in -*) shift 2 ;; *) break ;; esac; done\n"$@"\n'
        : `#!/bin/bash\necho "${name}: ioprio_set failed: Operation not permitted" >&2\nexit 1\n`;
    fs.writeFileSync(path.join(dir, name), body, { mode: 0o755 });
  }
  return dir;
}

const priority = (pathDir: string) =>
  execFileSync(BASH!, [SCRIPT, "priority"], { env: { PATH: pathDir, VALHALLA_HOME: tempDir("outpost-sidecar-home-") } })
    .toString()
    .trim();

describe.skipIf(!BASH)("the streets sidecar's build priority", () => {
  it("builds at the lowest processor and idle disk priority where both tools work", () => {
    expect(priority(tools({ nice: "works", ionice: "works" }))).toBe("nice -n 19 ionice -c 3");
  });

  it("leaves out a tool that is not there or not allowed, and builds at normal priority with neither", () => {
    expect(priority(tools({ nice: "works", ionice: "refuses" }))).toBe("nice -n 19");
    expect(priority(tools({ nice: "works" }))).toBe("nice -n 19");
    expect(priority(tools({ ionice: "works" }))).toBe("ionice -c 3");
    expect(priority(tools({}))).toBe("");
  });

  it("launches each step of a build through them", () => {
    // Stand-ins that write down how they were called, then run what follows their options; a step that does the same.
    const dir = tempDir("outpost-sidecar-launch-");
    const log = path.join(dir, "launched.log");
    const recording =
      '#!/bin/bash\necho "$(basename "$0") $*" >> "$LAUNCH_LOG"\nwhile [ "$#" -gt 0 ]; do case "$1" in -*) shift 2 ;; *) break ;; esac; done\n"$@"\n';
    for (const name of ["nice", "ionice"]) fs.writeFileSync(path.join(dir, name), recording, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "step"), '#!/bin/bash\necho "step $*" >> "$LAUNCH_LOG"\n', { mode: 0o755 });
    // The 5 s wait between looks at the step, made short.
    fs.writeFileSync(path.join(dir, "sleep"), "#!/bin/bash\nexec /bin/sleep 0.1\n", { mode: 0o755 });
    const work = tempDir("outpost-sidecar-work-");
    execFileSync(BASH!, ["-c", `source "$1"; low_priority; run_stage "$2" tiles "Building" step --threads 2`, "-", SCRIPT, work], {
      env: { PATH: `${dir}:${process.env.PATH}`, LAUNCH_LOG: log, VALHALLA_HOME: tempDir("outpost-sidecar-home-") },
    });
    const launched = fs.readFileSync(log, "utf8").trim().split("\n");
    // The probes (`nice -n 19 true`, `ionice -c 3 true`), then the step under both.
    expect(launched.slice(-3)).toEqual(["nice -n 19 ionice -c 3 step --threads 2", "ionice -c 3 step --threads 2", "step --threads 2"]);
  });

  it("does not look for them on a health check", () => {
    const dir = tempDir("outpost-sidecar-health-");
    const log = path.join(dir, "launched.log");
    for (const name of ["nice", "ionice"])
      fs.writeFileSync(path.join(dir, name), '#!/bin/bash\necho "$(basename "$0")" >> "$LAUNCH_LOG"\n', { mode: 0o755 });
    execFileSync(BASH!, [SCRIPT, "health"], {
      env: { PATH: `${dir}:${process.env.PATH}`, LAUNCH_LOG: log, VALHALLA_HOME: tempDir("outpost-sidecar-home-") },
    });
    expect(fs.existsSync(log)).toBe(false);
  });
});
